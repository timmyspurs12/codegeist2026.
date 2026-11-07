/**
 * The encoding boundary between Relay's ledger and the Forge Custom Entity
 * Store.
 *
 * ## Why this file exists
 *
 * The entity store is not JSON. Its rules, from the storage reference:
 *
 *   * every attribute must be **declared** in `manifest.yml`, and the set of
 *     declared attributes is the set the store will accept;
 *   * an attribute type is enforced — `string`, `integer`, `float`, `boolean`,
 *     `any`;
 *   * a `string` must contain at least one non-whitespace character, so `""` is
 *     as illegal as `null`;
 *   * **`null` is not a value of any type**, including inside an `any` object or
 *     array.
 *
 * Relay's ledger is the opposite: a commitment is a record with a lot of
 * optional fields (`owner`, `dueAt`, `acceptedBy`, `verificationNote`, and five
 * nullable fields inside `evidence` alone), and every one of them is `null`
 * until something happens. Writing that record straight into the entity is what
 * produced `HTTP 422 UNPROCESSABLE_ENTITY` on the very first Track.
 *
 * ## The strategy: absent means null
 *
 * `toStored` **omits** a property whose value is `null`, `undefined` or an empty
 * string, and recurses through objects and arrays so nested optionals go too.
 * Omitting is not the same as defaulting: nothing is invented, and no meaning is
 * lost, because in this domain "the key is not there" and "the value is null"
 * are the same statement — *not recorded*.
 *
 * `fromStored` puts the `null`s back, from an explicit list of the keys that are
 * nullable, so the in-memory record a caller reads is the same shape it would
 * have written. Anything this file does not know about is preserved verbatim,
 * so a newer writer's fields survive an older reader.
 *
 * The one place where a value is *not* preserved is an empty string: it becomes
 * "absent", and reads back as `null`. An empty string and a null are already the
 * same thing to every consumer in this codebase (`note || null`,
 * `c.verificationNote ?? ''`), and the entity store cannot hold one.
 *
 * ## Deliberate failure, not silent loss
 *
 * `toStored` throws `RecordShapeError` for a record that cannot be stored: an
 * attribute nobody declared, a non-finite number, a `null` inside an array
 * (arrays are positional, so dropping an element would change meaning), a
 * missing required attribute. That converts a remote 422 — which arrives after
 * a network round trip, with no field named — into a local error that names the
 * attribute. `store.js` treats it as a failed commit and reports it upward; it
 * never retries it and never reports it as success.
 *
 * This module is dependency-free on purpose: the manifest checker imports it to
 * compare the declaration in `manifest.yml` with the shape the code really
 * writes, and the test fake uses it to behave like the real store.
 */
import { LEDGER_VERSION, digestOf } from './ledger.js';

/**
 * Every attribute of `relay-ledger`, with the type the manifest must declare.
 *
 * This is the single list. `manifest.yml` must declare exactly these types, and
 * `scripts/manifest-check.mjs` fails the build when the two disagree. Attributes
 * can be added (the store allows additions and refuses deletions), never removed.
 *
 * The six after `commitments` are the lifecycle metadata Relay records about a
 * record — when it was tracked, by whom, when it became managed, when it was
 * offboarded, when it was backfilled. They are optional: a trigger-created
 * record has no actor, and a record that has never been untracked has no
 * `untrackedAt`.
 */
export const RECORD_ATTRIBUTES = Object.freeze({
  issueKey: 'string',
  rev: 'integer',
  version: 'integer',
  state: 'string',
  digest: 'string',
  updatedAt: 'string',
  commitments: 'any',
  source: 'string',
  trackedBy: 'string',
  managedAt: 'string',
  untrackedAt: 'string',
  untrackedBy: 'string',
  backfilledAt: 'string',
});

/**
 * Attributes every record carries, on create and on update alike. A record
 * without these cannot be read back or verified, so their absence is a bug in
 * the writer rather than a state of the record.
 */
export const REQUIRED_ATTRIBUTES = Object.freeze([
  'issueKey', 'rev', 'version', 'state', 'digest', 'updatedAt', 'commitments',
]);

/** A record that cannot be represented in the entity store. Never retried. */
export class RecordShapeError extends Error {
  constructor(attribute, detail) {
    super(`record_shape: "${attribute}" ${detail}`);
    this.name = 'RecordShapeError';
    this.code = 'record_shape';
    this.attribute = attribute;
  }
}

/** Returned by `sanitise` for a value the store cannot hold, and that carries no meaning. */
const OMIT = Symbol('relay.omit');

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

/**
 * The record as the entity store will accept it: declared attributes only, no
 * null, no empty string, nothing the store would reject. Throws rather than
 * degrading.
 */
export function toStored(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new RecordShapeError('<record>', 'is not an object');
  }

  const out = {};
  for (const [attribute, value] of Object.entries(record)) {
    const type = RECORD_ATTRIBUTES[attribute];
    if (!type) {
      throw new RecordShapeError(
        attribute,
        'is not an attribute of relay-ledger. Add it to manifest.yml and to RECORD_ATTRIBUTES together, ' +
          'or stop writing it: an undeclared attribute is rejected by the store.',
      );
    }
    const cleaned = sanitise(value, attribute);
    if (cleaned === OMIT) continue; // not recorded — the store has no null to hold
    assertType(attribute, type, cleaned);
    out[attribute] = cleaned;
  }

  for (const attribute of REQUIRED_ATTRIBUTES) {
    if (!(attribute in out)) {
      throw new RecordShapeError(attribute, 'is required on every record and was absent or empty');
    }
  }
  return out;
}

/**
 * The record as Relay works with it: nulls restored, digest repaired if an
 * older writer left it out, unknown fields preserved.
 */
export function fromStored(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    throw new RecordShapeError('<record>', 'read back empty');
  }

  const commitments = Array.isArray(stored.commitments)
    ? stored.commitments.map((commitment, index) => normaliseCommitment(commitment, `commitments[${index}]`))
    : [];

  return {
    version: Number.isInteger(stored.version) ? stored.version : LEDGER_VERSION,
    rev: Number.isInteger(stored.rev) ? stored.rev : 0,
    issueKey: stored.issueKey ?? null,
    state: stored.state ?? null,
    commitments,
    // A record written before P2.2.2 has no digest. Deriving it from the content
    // is the honest repair: it makes the record verifiable rather than trusting
    // that whatever is stored is what was intended.
    digest: typeof stored.digest === 'string' && stored.digest ? stored.digest : digestOf(commitments),
    updatedAt: stored.updatedAt ?? null,
    source: stored.source ?? null,
    trackedBy: stored.trackedBy ?? null,
    managedAt: stored.managedAt ?? null,
    untrackedAt: stored.untrackedAt ?? null,
    untrackedBy: stored.untrackedBy ?? null,
    backfilledAt: stored.backfilledAt ?? null,
  };
}

/* ------------------------------------------------------------- internals */

function sanitise(value, path) {
  if (value === null || value === undefined) return OMIT;
  if (typeof value === 'string') return value.trim() === '' ? OMIT : value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RecordShapeError(path, `is ${String(value)}, which is not a storable number`);
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) {
    // Dates are not a storable type; every timestamp in the ledger is an ISO
    // string, so a Date here is a bug that would otherwise be flattened to `{}`.
    throw new RecordShapeError(path, 'is a Date; store an ISO string instead');
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const cleaned = sanitise(item, `${path}[${index}]`);
      if (cleaned === OMIT) {
        throw new RecordShapeError(
          `${path}[${index}]`,
          'is null. An array is positional: dropping this element would silently change what the list means.',
        );
      }
      return cleaned;
    });
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const cleaned = sanitise(nested, `${path}.${key}`);
      if (cleaned !== OMIT) out[key] = cleaned;
    }
    return out;
  }
  throw new RecordShapeError(path, `is a ${typeof value}, which the entity store cannot hold`);
}

function assertType(attribute, type, value) {
  if (type === 'string') {
    if (typeof value !== 'string') throw new RecordShapeError(attribute, `must be a string, got ${typeof value}`);
    return;
  }
  if (type === 'integer') {
    if (!Number.isInteger(value)) throw new RecordShapeError(attribute, `must be an integer, got ${typeof value}`);
    if (value < INT32_MIN || value > INT32_MAX) throw new RecordShapeError(attribute, 'does not fit in a 32-bit signed integer');
    return;
  }
  if (type === 'boolean') {
    if (typeof value !== 'boolean') throw new RecordShapeError(attribute, `must be a boolean, got ${typeof value}`);
    return;
  }
  // `any`: `sanitise` has already removed everything the store cannot hold.
}

/**
 * The nullable keys of a commitment, in one place. `toStored` does not need this
 * list — it simply omits nulls — but `fromStored` does: without it, a commitment
 * read back would have `undefined` where the writer had `null`, and every
 * `=== null` check in the codebase would start lying.
 */
function normaliseCommitment(commitment, path) {
  if (!commitment || typeof commitment !== 'object' || Array.isArray(commitment)) {
    throw new RecordShapeError(path, 'is not a commitment object');
  }
  const evidence = commitment.evidence;
  return {
    ...commitment,
    evidence: evidence && typeof evidence === 'object'
      ? {
        ...evidence,
        commentCreatedAt: evidence.commentCreatedAt ?? null,
        bodyHash: evidence.bodyHash ?? null,
        author: normalisePerson(evidence.author),
      }
      : evidence,
    owner: normalisePerson(commitment.owner),
    suggestedOwner: normalisePerson(commitment.suggestedOwner),
    dueAt: commitment.dueAt ?? null,
    dueBasis: commitment.dueBasis ?? null,
    acceptedAt: commitment.acceptedAt ?? null,
    acceptedBy: normalisePerson(commitment.acceptedBy),
    verifiedAt: commitment.verifiedAt ?? null,
    verifiedBy: normalisePerson(commitment.verifiedBy),
    verificationNote: commitment.verificationNote ?? null,
    droppedReason: commitment.droppedReason ?? null,
    droppedAt: commitment.droppedAt ?? null,
    previousOwners: Array.isArray(commitment.previousOwners)
      ? commitment.previousOwners.map((entry) => (entry && typeof entry === 'object'
        ? {
          ...entry,
          from: normalisePerson(entry.from),
          to: normalisePerson(entry.to),
          by: normalisePerson(entry.by),
          at: entry.at ?? null,
          reason: entry.reason ?? null,
        }
        : entry))
      : [],
  };
}

/** A person is `{ id: string|null, name, initials }`; `id` is the only nullable part. */
function normalisePerson(person) {
  if (person === null || person === undefined) return null;
  if (typeof person !== 'object' || Array.isArray(person)) {
    throw new RecordShapeError('person', 'is not an object');
  }
  return { ...person, id: person.id ?? null };
}
