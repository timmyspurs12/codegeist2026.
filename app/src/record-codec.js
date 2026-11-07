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
 * have written.
 *
 * ## Reading is forward compatible; writing is not
 *
 * `fromStored` keeps an attribute this build does not know about, verbatim, so a
 * record written by a newer build is never silently emptied by an older one.
 * `toStored` still refuses to write it: the store would reject an undeclared
 * attribute anyway, and inventing a declaration is not this module's business.
 * The consequence is deliberate and loud — a record carrying an unknown
 * attribute can be *read* by this build but not *rewritten* by it; the write
 * fails with `RecordShapeError` naming the attribute, rather than dropping it.
 *
 * ## Incomplete records are refused, not filled in
 *
 * `fromStored` will not fabricate core ledger state. A record missing `rev`,
 * `state`, `commitments`, `issueKey`, `version` or `updatedAt` throws: a made-up
 * `rev` would break the conditional write (it would compare against a revision
 * nobody wrote), and a made-up empty `commitments` list would read as "nothing
 * open" and permit closure. The one repair that is legitimate is the digest: a
 * record created before P2.2.2 has no `digest` (the bug that made it
 * unverifiable), and one can be derived from the content it does have.
 *
 * ## The digest is verified, not carried
 *
 * A stored record is checked against itself on read: the digest is recomputed
 * from the commitments and compared, and a disagreement throws. A mismatch is
 * not repaired, because repairing it would erase the only evidence that the
 * record's own integrity check does not describe its contents — the state after
 * a partial write, a hand edit, or a writer that computed the digest over
 * different fields. The one legacy allowance stays exactly as wide as before: an
 * *absent* digest is derived from the content it does have.
 *
 * The same two rules run on the way *in*: `toStored` validates the commitments
 * it is about to write, because a record that is stored but cannot be read back
 * is worse than a local error — it fails closed on every later read, withholding
 * closure for that issue until the record is recreated.
 *
 * ## A status that is not one of the four is refused
 *
 * `isUnresolved()` is `status === 'open' || status === 'proposed'`, and that is
 * the number the closure contract reads. So a commitment whose status is
 * missing, empty or unknown would not fail loudly downstream — it would count as
 * *settled* and disappear from the open count, which is the difference between a
 * case that stays open and a case that may be closed. `normaliseCommitment`
 * therefore refuses any status outside `proposed`, `open`, `verified`,
 * `dropped`, naming the commitment's path. Those four are the only values any
 * version of this codebase has ever written (see `COMMITMENT_STATUSES`).
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
import { digestOf, isCommitmentStatus, isManagedState } from './ledger.js';

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

  // The read-time rules, applied on the way in as well. A record that cannot be
  // read back must not be written: what reaches the entity store persists, and
  // every later read of that issue would fail closed — closure withheld until
  // the record was recreated by hand. A writer bug becomes a local error here,
  // before the network call, with nothing stored.
  if (record.commitments !== undefined) {
    requireCommitments(record);
    if (typeof record.digest === 'string') {
      const derived = digestOf(record.commitments);
      if (record.digest !== derived) {
        throw new RecordShapeError(
          'digest',
          `is "${record.digest}", but the commitments being written digest to "${derived}". Writing this would store a ` +
            'record that fails its own check on the next read, so it is refused before the call.',
        );
      }
    }
  }

  const entries = [];
  for (const [attribute, value] of Object.entries(record)) {
    // `Object.hasOwn`, not `RECORD_ATTRIBUTES[attribute]`: the latter walks the
    // prototype chain, so `toString`, `constructor` or `hasOwnProperty` would
    // read as a declared attribute and be written to the entity.
    if (!Object.hasOwn(RECORD_ATTRIBUTES, attribute)) {
      throw new RecordShapeError(
        attribute,
        'is not an attribute of relay-ledger. Add it to manifest.yml and to RECORD_ATTRIBUTES together, ' +
          'or stop writing it: an undeclared attribute is rejected by the store.',
      );
    }
    const cleaned = sanitise(value, attribute);
    if (cleaned === OMIT) continue; // not recorded — the store has no null to hold
    assertType(attribute, RECORD_ATTRIBUTES[attribute], cleaned);
    entries.push([attribute, cleaned]);
  }

  // Built with `Object.fromEntries`, which defines own data properties. Plain
  // `out[key] = value` treats a `__proto__` key as the prototype slot instead of
  // a property, so a hostile or accidental key could reach the prototype chain.
  const out = Object.fromEntries(entries);

  for (const attribute of REQUIRED_ATTRIBUTES) {
    if (!Object.hasOwn(out, attribute)) {
      throw new RecordShapeError(attribute, 'is required on every record and was absent or empty');
    }
  }
  return out;
}

/**
 * The record as Relay works with it: nulls restored, digest repaired if an older
 * writer left it out, unknown attributes preserved, and everything Relay makes a
 * decision from required to be present and sane.
 *
 * `rev`, `state`, `commitments`, `issueKey`, `version` and `updatedAt` are
 * required. They were written by every version of `initialise`/`mutateLedger`
 * that ever reached this entity, so a record missing one was not written by
 * Relay: it is incomplete or corrupt, and substituting a default would invent
 * state. In particular an absent `commitments` would otherwise read as an empty
 * ledger — zero open commitments — and permit closure. That is the fail-open
 * this module refuses to manufacture.
 *
 * `digest` is the one legacy allowance: the pre-P2.2.2 create path did not write
 * one. Deriving it from the content makes the record verifiable without
 * pretending the stored value was ever there.
 */
export function fromStored(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    throw new RecordShapeError('<record>', 'read back empty or not an object');
  }

  const commitments = requireCommitments(stored);
  // Recomputed from the *normalised* commitments: normalisation only restores
  // nulls and defaults, and every field the digest covers is hashed through
  // `?? ''`, so this is the same value the writer computed over the same content.
  const derivedDigest = digestOf(commitments);
  const known = {
    version: requireInteger(stored, 'version', 1),
    rev: requireInteger(stored, 'rev', 0),
    issueKey: requireString(stored, 'issueKey'),
    state: requireState(stored),
    commitments,
    digest: requireDigest(stored, derivedDigest),
    updatedAt: requireString(stored, 'updatedAt'),
    source: stored.source ?? null,
    trackedBy: stored.trackedBy ?? null,
    managedAt: stored.managedAt ?? null,
    untrackedAt: stored.untrackedAt ?? null,
    untrackedBy: stored.untrackedBy ?? null,
    backfilledAt: stored.backfilledAt ?? null,
  };

  // Attributes this build does not know about survive a read (a newer build may
  // have written them). They are *not* carried into a write: `toStored` rejects
  // them, loudly, because the entity does not declare them.
  const unknown = Object.entries(stored).filter(([attribute]) => !Object.hasOwn(known, attribute));
  return Object.fromEntries([...Object.entries(known), ...unknown]);
}

/* ------------------------------------------------------- read-time checks */

function requireString(stored, attribute) {
  const value = stored[attribute];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RecordShapeError(
      attribute,
      'is missing or empty. The record is incomplete or corrupt; Relay will not invent a value for it.',
    );
  }
  return value;
}

function requireInteger(stored, attribute, min) {
  const value = stored[attribute];
  if (!Number.isInteger(value) || value < min) {
    throw new RecordShapeError(
      attribute,
      `is ${JSON.stringify(value)}, not an integer >= ${min}. The record is incomplete or corrupt: a substituted ` +
        'revision would make the conditional write compare against a revision nobody wrote.',
    );
  }
  return value;
}

function requireState(stored) {
  const value = stored.state;
  if (!isManagedState(value)) {
    throw new RecordShapeError(
      'state',
      `is ${JSON.stringify(value)}, which is not a management state (managed, initializing, unmanaged). ` +
        'Relay will not guess which one it meant: guessing wrong changes whether a case can be closed.',
    );
  }
  return value;
}

function requireCommitments(stored) {
  if (!Array.isArray(stored.commitments)) {
    throw new RecordShapeError(
      'commitments',
      `is ${JSON.stringify(stored.commitments)}, not a list. An absent list would read as "no open commitments" ` +
        'and permit closure, so a record without one is refused rather than assumed empty.',
    );
  }
  return stored.commitments.map((commitment, index) => normaliseCommitment(commitment, `commitments[${index}]`));
}

/**
 * Absent is legacy — a record created before P2.2.2 has no digest and one can be
 * derived from the content it does have. Anything else must be a non-empty
 * string *and* must agree with the commitments: a digest that does not describe
 * its own contents is corruption, and repairing it would destroy the only
 * record that the two disagreed.
 */
function requireDigest(stored, derived) {
  if (stored.digest === undefined) return derived;
  const digest = requireString(stored, 'digest');
  if (digest !== derived) {
    throw new RecordShapeError(
      'digest',
      `is "${digest}", but the stored commitments digest to "${derived}". The record does not describe its own contents: ` +
        'it was partially written, edited outside Relay, or written by a build that digested different fields. ' +
        'Relay will not recompute it, because that would hide the disagreement this check exists to find.',
    );
  }
  return digest;
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
    // `Object.fromEntries`, for the same reason as `toStored`: a nested object
    // may arrive from parsed data, and `out['__proto__'] = ...` is a prototype
    // write, not a property.
    const entries = [];
    for (const [key, nested] of Object.entries(value)) {
      const cleaned = sanitise(nested, `${path}.${key}`);
      if (cleaned !== OMIT) entries.push([key, cleaned]);
    }
    return Object.fromEntries(entries);
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

  // `status` decides whether this commitment blocks closure, and the only place
  // that decision is made (`isUnresolved`) answers "settled" for anything it does
  // not recognise. Refusing an unknown status here is what stops a lost or
  // corrupted one from being miscounted as resolved.
  const status = commitment.status;
  if (typeof status !== 'string' || status.trim() === '') {
    throw new RecordShapeError(
      `${path}.status`,
      'is missing or empty. A commitment without a status would be counted as settled (only "open" and "proposed" ' +
        'are open), so Relay refuses the record instead of quietly reducing the open count.',
    );
  }
  if (!isCommitmentStatus(status)) {
    throw new RecordShapeError(
      `${path}.status`,
      `is ${JSON.stringify(status)}, which is not a commitment status (proposed, open, verified, dropped). ` +
        'An unrecognised status reads as settled and would disappear from the open count, so it is refused rather than guessed at.',
    );
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
