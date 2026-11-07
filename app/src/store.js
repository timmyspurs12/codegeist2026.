/**
 * Relay's own storage: the authoritative issue record (management state +
 * commitment ledger), the append-only audit trail, the tracked list and the
 * small settings record.
 *
 * ## What changed in P2.2
 *
 * P2.1 read the ledger, mutated it in memory, wrote it back and then read it
 * again to see whether the write had survived. That is detection after the
 * fact, and it has two defects this file now closes:
 *
 *   1. There was no *conditional* commit. Two writers could both write and one
 *      would silently lose; the read-back only noticed when the loser happened
 *      to read before the winner overwrote it.
 *   2. `mutateLedger` acquired an advisory lock, and then ran the mutation
 *      anyway when the lock was not acquired. Under contention the lock did
 *      nothing at all.
 *
 * The record now lives in a Forge **Custom Entity Store** entity, and every
 * write is a transaction with a condition on the revision it was derived from:
 *
 *   kvs.transact().set(key, next, {
 *     entityName: 'relay-ledger',
 *     conditions: new Filter().and('rev', FilterConditions.equalTo(expectedRev)),
 *   }).execute()
 *
 * The condition is evaluated *inside* the commit. If another writer landed
 * first, the condition is false and the transaction fails; this file re-reads,
 * re-runs the mutation from fresh state, and retries. A lost update is no
 * longer possible, and the lock — advisory, and ignored on failure — is gone.
 *
 * This module knows nothing about `@forge/kvs`. It talks to a tiny `records`
 * adapter (read / create / update with an expected revision), which
 * `forge-store.js` implements with the transaction API and the tests implement
 * with an honest in-memory conditional store. That keeps the concurrency
 * behaviour testable without pretending a serial fake is a database.
 */
import { digestOf, emptyLedger } from './ledger.js';

/**
 * Re-exported for the callers that imported it from here before it moved next to
 * the record shape (`ledger.js`). The empty ledger needs a digest now, which the
 * module that defines the ledger must be able to compute.
 */
export { digestOf };

export const keyOf = {
  /** Audit events are one key per event: append-only, never rewritten. */
  audit: (issueKey) => `relay:audit:${issueKey}:`,
  meta: (issueKey) => `relay:issue:${issueKey}:meta`,
  tracked: 'relay:tracked',
  settings: 'relay:settings',
};

/** The commit lost: someone else wrote the revision we derived from. */
export class RevisionConflict extends Error {
  constructor(expected, actual = null) {
    super(`revision_conflict: expected rev ${expected}, found ${actual ?? 'a newer revision'}`);
    this.name = 'RevisionConflict';
    this.code = 'revision_conflict';
    this.expected = expected;
    this.actual = actual;
  }
}

/** The record already exists (create-only write lost). */
export class RecordExists extends Error {
  constructor(issueKey) {
    super(`record_exists: ${issueKey}`);
    this.name = 'RecordExists';
    this.code = 'record_exists';
  }
}

export class RecordStoreMissing extends Error {
  constructor() {
    super(
      'concurrency_store_missing: Relay needs a record store with conditional writes; ' +
        'a plain key/value store cannot commit a ledger safely.',
    );
    this.name = 'RecordStoreMissing';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{
 *   storage: { get: Function, set: Function, list: Function },
 *   records: { read: Function, create: Function, update: Function },
 *   now?: () => Date,
 *   log?: Function,
 *   wait?: (ms: number) => Promise<void>,
 * }} deps
 */
export function createStore({ storage, records, now = () => new Date(), log = () => {}, wait = sleep }) {
  if (!records || typeof records.read !== 'function' || typeof records.update !== 'function' || typeof records.create !== 'function') {
    // Fail at construction, not on the first mutation: a mis-wired app must not
    // look healthy until the moment a customer tries to close a case.
    throw new RecordStoreMissing();
  }

  const readLedger = async (issueKey) => (await records.read(issueKey)) ?? null;

  /**
   * Mutation with a conditional commit.
   *
   * `mutator(record)` returns a new commitment array, or `null` for "nothing to
   * do" — which is how a repeated accept (same owner, same due date) stays a
   * no-op instead of bumping the revision and writing an event for nothing.
   *
   * On a lost commit the mutator is re-run against the record that won, so the
   * change is applied to the state that actually exists. Nothing is retried
   * blindly: `beforeWrite` runs again too, because the state it guards may have
   * changed.
   *
   * @returns {{ ledger: object, previous: object|null, changed: boolean, attempts: number, conflicts: number }}
   */
  async function mutateLedger(issueKey, mutator, { attempts = 5, seed = {}, beforeWrite, create = true } = {}) {
    let lastError = null;
    let conflicts = 0;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const existing = await readLedger(issueKey);
      if (!existing && !create) return { ledger: null, previous: null, changed: false, attempts: attempt + 1, conflicts };
      const ledger = existing ?? emptyLedger(issueKey, now().toISOString());
      const result = mutator(ledger);

      if (result === null || result === undefined) {
        return { ledger, previous: existing, changed: false, attempts: attempt + 1, conflicts };
      }

      const next = {
        ...ledger,
        ...seed,
        rev: ledger.rev + 1,
        updatedAt: now().toISOString(),
        commitments: result,
        digest: digestOf(result),
      };

      // The guard runs before the commit so that a failure at any later point
      // leaves the *portal* blocked rather than open. See sync.js and
      // handlers.relay.workspace.track. A guard that throws is not a conflict:
      // it is a refusal, and it must not be retried.
      if (beforeWrite) await beforeWrite(next);

      try {
        if (existing) await records.update(issueKey, existing.rev, next);
        else await records.create(issueKey, next);
      } catch (err) {
        if (err instanceof RevisionConflict || err instanceof RecordExists) {
          conflicts += 1;
          lastError = err;
          log({
            event: 'ledger_commit_conflict',
            issueKey,
            attempt: attempt + 1,
            expectedRev: existing?.rev ?? null,
            error: String(err?.message ?? err),
          });
          await wait(Math.min(50, 4 * (attempt + 1)));
          continue;
        }
        // A storage failure is reported upward. Retrying a failed commit is
        // safe, but retrying a failure we do not understand is not: it hides
        // exactly the class of bug this file exists to prevent.
        log({ event: 'ledger_commit_failed', issueKey, error: String(err?.message ?? err) });
        throw err;
      }

      // The commit is conditional, so a read-back should be trivially true. It
      // is kept because the commit is not the only thing that can be wrong: an
      // adapter that lies, or a second writer that lands between the commit and
      // this read, must still be caught rather than reported as success.
      const readBack = await readLedger(issueKey);
      const sameContent =
        readBack &&
        readBack.rev === next.rev &&
        (readBack.digest ?? digestOf(readBack.commitments ?? [])) === next.digest;
      if (!sameContent) {
        conflicts += 1;
        lastError = new RevisionConflict(next.rev, readBack?.rev ?? null);
        log({ event: 'ledger_write_unverified', issueKey, expectedRev: next.rev, foundRev: readBack?.rev ?? null });
        await wait(Math.min(50, 4 * (attempt + 1)));
        continue;
      }

      return { ledger: readBack, previous: existing, changed: true, attempts: attempt + 1, conflicts };
    }

    const err = lastError ?? new Error('ledger_write_failed');
    err.name = err.name ?? 'LedgerWriteFailed';
    err.conflicts = conflicts;
    throw err;
  }

  /**
   * Move an issue to another management state without touching commitments.
   *
   * A state change is a ledger write like any other: it goes through the same
   * conditional commit, bumps the revision, and therefore cannot race with an
   * accept that is landing at the same moment. `null` means "already there".
   */
  async function setState(issueKey, state, { seed = {}, attempts = 5 } = {}) {
    const res = await mutateLedger(
      issueKey,
      (ledger) => (ledger.state === state ? null : ledger.commitments),
      // A state change never creates a record: management state is only ever
      // moved on a record that exists, so a stray call cannot conjure an
      // `unmanaged` issue out of nothing.
      { attempts, seed: { ...seed, state }, create: false },
    );
    return { record: res.ledger, previous: res.previous, changed: res.changed, attempts: res.attempts, conflicts: res.conflicts };
  }

  /**
   * Create a record in a known state, if and only if it does not exist yet.
   *
   * This is the "two people press Track at once" and "the trigger and the
   * backfill reach the same issue" case: one create wins, the other reads the
   * winner. It never overwrites an existing record, which is what makes it safe
   * to run on every issue creation and on every backfill page.
   */
  async function initialise(issueKey, { state, seed = {} } = {}) {
    const existing = await readLedger(issueKey);
    if (existing) return { record: existing, created: false };

    const record = { ...emptyLedger(issueKey, now().toISOString(), state), ...seed };
    try {
      await records.create(issueKey, record);
    } catch (err) {
      if (err instanceof RecordExists) {
        const winner = await readLedger(issueKey);
        if (winner) return { record: winner, created: false };
      }
      throw err;
    }
    // A create that returned is still a claim. Verify all three things the
    // record is for: the revision (nothing else won), the state (the condition
    // will read it) and the digest (the commitments are the ones intended, and
    // an empty ledger's digest is `digestOf([])`).
    const readBack = await readLedger(issueKey);
    if (!readBack || readBack.rev !== record.rev || readBack.state !== record.state || readBack.digest !== digestOf(readBack.commitments ?? [])) {
      throw new Error(`record_create_unverified: ${issueKey}`);
    }
    return { record: readBack, created: true };
  }

  /**
   * Append an audit event.
   *
   * One key per event, written create-only (`keyPolicy: 'FAIL_IF_EXISTS'`).
   * Two writers appending at the same time therefore both succeed — the P2.1
   * read-whole-array/append/write-back could not, and would lose one of them.
   * A retried queue message or a double click is a duplicate id, which the
   * create-only write rejects; that is a recorded event, not an error.
   */
  async function recordEvent(event) {
    const key = `${keyOf.audit(event.issueKey)}${event.id}`;
    try {
      await storage.set(key, { ...event, at: event.at ?? now().toISOString() }, { keyPolicy: 'FAIL_IF_EXISTS' });
    } catch (err) {
      if (isAlreadyExists(err)) {
        log({ event: 'audit_duplicate', issueKey: event.issueKey, id: event.id });
        return { appended: false, duplicate: true };
      }
      throw err;
    }
    // A create-only write that returns is still a claim; read it back.
    const back = await storage.get(key);
    if (!back || back.id !== event.id) {
      throw new Error(`audit_write_unverified: ${event.issueKey}/${event.id}`);
    }
    return { appended: true, duplicate: false };
  }

  /** Newest-first, one page at a time. The trail is never truncated on write. */
  async function readAudit(issueKey, { limit = 200, cursor } = {}) {
    const page = await storage.list(keyOf.audit(issueKey), { limit, cursor });
    const events = [...(page?.items ?? [])].sort(compareEvents);
    return { events, nextCursor: page?.nextCursor ?? null, truncated: Boolean(page?.nextCursor) };
  }

  async function tracked() {
    const list = (await storage.get(keyOf.tracked)) ?? [];
    return Array.isArray(list) ? list : [];
  }

  async function track(issueKey, meta = {}) {
    const list = await tracked();
    if (list.some((t) => t.key === issueKey)) return list;
    // The tracked list lives in plain key/value storage, which would accept a
    // null — but the console renders this list, and "absent" and "null" mean
    // the same thing here (see record-codec.js). Keep one shape.
    const known = Object.entries(meta).filter(([, value]) => value !== null && value !== undefined && value !== '');
    const next = [...list, { key: issueKey, addedAt: now().toISOString(), ...Object.fromEntries(known) }];
    await storage.set(keyOf.tracked, next);
    return next;
  }

  async function untrack(issueKey) {
    const list = (await tracked()).filter((t) => t.key !== issueKey);
    await storage.set(keyOf.tracked, list);
    return list;
  }

  async function settings() {
    const defaults = {
      // The app-owned closure fields. `*TypeId` is recorded next to each numeric
      // id so a promotion to another environment invalidates the cache instead
      // of writing into the previous environment's field.
      closureFieldId: null,
      closureFieldKey: null,
      closureFieldTypeId: null,
      closureFieldResolvedAt: null,
      stateFieldId: null,
      stateFieldKey: null,
      stateFieldTypeId: null,
      stateFieldResolvedAt: null,
      // The expression the operator recorded as pasted into manifest.yml. Used
      // only to warn that the deployed manifest may not match the fields.
      closureExpressionApplied: null,
      // The state the deployed workflow condition was attached in. Separate
      // from the expression because attaching it is a workflow edit, not a
      // deploy, and the two can be done in either order.
      conditionAttachedAt: null,
      backfillCompletedAt: null,
      capture: { autoCapture: true, confidenceThreshold: 0.55, requireOwner: true },
      // Manifest declarations, not observations. Relay cannot read a workflow's
      // configuration from inside an app, so these stay false until an operator
      // records that the validator and condition are attached on the site.
      validatorRegistered: false,
      conditionRegistered: false,
      customerTransitionsEnabled: true,
    };
    return { ...defaults, ...((await storage.get(keyOf.settings)) ?? {}) };
  }

  async function saveSettings(patch) {
    const current = await settings();
    const next = {
      ...current,
      ...patch,
      capture: { ...current.capture, ...(patch.capture ?? {}) },
    };
    await storage.set(keyOf.settings, next);
    return next;
  }

  async function issueMeta(issueKey) {
    return (await storage.get(keyOf.meta(issueKey))) ?? { lastScanAt: null, scannedComments: [] };
  }

  async function saveIssueMeta(issueKey, meta) {
    await storage.set(keyOf.meta(issueKey), meta);
    return meta;
  }

  return { readLedger, mutateLedger, setState, initialise, recordEvent, readAudit, tracked, track, untrack, settings, saveSettings, issueMeta, saveIssueMeta };
}

/** Newest first; ties broken by id so the order is stable across reads. */
export function compareEvents(a, b) {
  if (a.at && b.at && a.at !== b.at) return a.at < b.at ? 1 : -1;
  return String(b.id ?? '').localeCompare(String(a.id ?? ''));
}

/**
 * Create-only writes fail with a storage error. Both the Forge service and the
 * test fake normalise the condition into `code`, and the message is checked as
 * a fallback because the service's code is not part of the documented API.
 */
export function isAlreadyExists(err) {
  const code = String(err?.code ?? '').toUpperCase();
  const message = String(err?.message ?? '');
  return /EXIST/i.test(code) || /already.?exist/i.test(message) || /FAIL_IF_EXISTS/i.test(message);
}

/** Transaction conditions that fail are reported as a conflict, not a failure. */
export function isConditionFailed(err) {
  const code = String(err?.code ?? '').toUpperCase();
  const message = String(err?.message ?? '');
  return /CONDITION|CONFLICT/i.test(code) || /condition|conflict/i.test(message);
}
