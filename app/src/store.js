/**
 * Relay's own storage: the authoritative ledger, the audit trail, the tracked
 * issue list and the small settings record.
 *
 * What Forge storage does and does not give us, stated plainly:
 *
 *   * `storage.set` is a blind overwrite. There is no compare-and-swap, no
 *     transaction, and no documented multi-key atomicity. Two concurrent
 *     read-modify-write cycles can therefore race.
 *   * What we can do is make the race *detectable and harmless*: every write
 *     carries the revision it was derived from, we read the record back, and a
 *     write that did not land exactly as intended is retried against fresh
 *     state or fails loudly. A lost update becomes a retry, not a silent
 *     overwrite.
 *   * A mutation that fails still leaves the previous ledger in place. Nothing
 *     in this file ever writes a partial commitment list.
 *
 * The projection ordering that keeps the *portal* fail-closed lives in
 * sync.js / handlers.js, because it involves the Jira issue property and the
 * field — two stores this file does not own.
 */
import { emptyLedger } from './ledger.js';

export const keyOf = {
  ledger: (issueKey) => `relay:ledger:${issueKey}`,
  audit: (issueKey) => `relay:audit:${issueKey}`,
  meta: (issueKey) => `relay:issue:${issueKey}:meta`,
  lock: (issueKey) => `relay:lock:${issueKey}`,
  tracked: 'relay:tracked',
  settings: 'relay:settings',
};

/**
 * A content digest of the commitment list.
 *
 * Revision numbers alone are not enough to verify a write: a rival writer can
 * produce the same revision with different content, and a length check would
 * not notice. The digest makes "exactly the ledger I intended" a checkable
 * claim rather than an assumption.
 */
export function digestOf(commitments) {
  const canonical = commitments
    .map((c) => [c.code, c.status, c.owner?.id ?? c.owner?.name ?? '', c.dueAt ?? '', c.text ?? ''].join('\u0001'))
    .sort()
    .join('\u0002');
  let h = 2166136261;
  for (let i = 0; i < canonical.length; i += 1) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${commitments.length}:${(h >>> 0).toString(16)}`;
}

export class RevisionConflict extends Error {
  constructor(expected, actual) {
    super(`revision_conflict: expected ${expected}, found ${actual}`);
    this.name = 'RevisionConflict';
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * @param {{ storage: { get: Function, set: Function }, now?: () => Date, log?: Function }} deps
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createStore({ storage, now = () => new Date(), log = () => {}, wait = sleep }) {
  const readLedger = async (issueKey) => (await storage.get(keyOf.ledger(issueKey))) ?? null;

  /**
   * Read-modify-write with verification.
   *
   * `mutator(ledger)` returns a new commitment array, or `null` for "nothing to
   * do" — which is how a repeated accept (same owner, same due date) stays a
   * no-op instead of bumping the revision and writing an event for nothing.
   *
   * @returns {{ ledger: object, previous: object|null, changed: boolean, attempts: number }}
   */
  /**
   * A best-effort write lock.
   *
   * Forge storage has no compare-and-swap, so this cannot be a mutex: two
   * writers can both read an empty lock, both write a token, and both see their
   * own token if the writes are reordered. What it does do is make the common
   * case — a double click, or two resolvers in flight at once — serialise, and
   * it expires, so a crashed mutation cannot wedge an issue forever. The
   * verification below (revision + digest read back) is what turns the residual
   * race into a detected retry rather than a silent overwrite.
   */
  async function acquireLock(issueKey, ttlMs = 4000) {
    const lockKey = keyOf.lock(issueKey);
    for (let i = 0; i < 3; i += 1) {
      const held = await storage.get(lockKey).catch(() => null);
      const nowMs = now().getTime();
      if (!held || Number(held.expiresAt ?? 0) < nowMs) {
        const token = `${nowMs}-${Math.random().toString(36).slice(2, 10)}`;
        await storage.set(lockKey, { token, expiresAt: nowMs + ttlMs });
        const check = await storage.get(lockKey).catch(() => null);
        if (check?.token === token) return token;
      }
      await wait(8);
    }
    log({ event: 'ledger_lock_contended', issueKey });
    return null;
  }

  async function releaseLock(issueKey, token) {
    if (!token) return;
    const lockKey = keyOf.lock(issueKey);
    const held = await storage.get(lockKey).catch(() => null);
    if (held?.token === token) await storage.set(lockKey, { token: null, expiresAt: 0 });
  }

  async function mutateLedger(issueKey, mutator, { attempts = 3, seed = {}, beforeWrite } = {}) {
    let lastError = null;
    const token = await acquireLock(issueKey);
    try {
      return await runMutation();
    } finally {
      await releaseLock(issueKey, token);
    }

    async function runMutation() {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const existing = await readLedger(issueKey);
      const ledger = existing ?? emptyLedger(issueKey, now().toISOString());
      const result = mutator(ledger);

      if (result === null || result === undefined) {
        return { ledger, previous: existing, changed: false, attempts: attempt + 1 };
      }

      const next = {
        ...ledger,
        rev: ledger.rev + 1,
        updatedAt: now().toISOString(),
        commitments: result,
        digest: digestOf(result),
        ...seed,
      };

      try {
        // The guard runs before the ledger write so that a failure at any later
        // point leaves the *portal* blocked rather than open. See sync.js.
        if (beforeWrite) await beforeWrite(next);
        await storage.set(keyOf.ledger(issueKey), next);
        const readBack = await readLedger(issueKey);
        const sameContent = readBack
          && readBack.rev === next.rev
          && (readBack.digest ?? digestOf(readBack.commitments ?? [])) === next.digest;
        if (!sameContent) {
          throw new RevisionConflict(next.rev, readBack?.rev ?? -1);
        }
        return { ledger: readBack, previous: existing, changed: true, attempts: attempt + 1 };
      } catch (err) {
        lastError = err;
        log({ event: 'ledger_write_retry', issueKey, attempt: attempt + 1, error: String(err?.message ?? err) });
        // A storage failure and a lost race are both worth retrying once; a
        // second failure of the same kind is reported upward, never ignored.
        await new Promise((r) => setTimeout(r, 5 * (attempt + 1)));
      }
    }

    const err = new Error(lastError?.message ?? 'ledger_write_failed');
    err.cause = lastError;
    throw err;
    }
  }

  /**
   * Append an audit event. Events carry a deterministic id, and `appendEvent`
   * ignores an id it already holds — so a retried queue message, a double
   * click, or a resolver replayed after a timeout records the decision once.
   */
  async function recordEvent(event) {
    const key = keyOf.audit(event.issueKey);
    const trail = (await storage.get(key)) ?? { seq: 0, events: [] };
    if (trail.events.some((e) => e.id === event.id)) return { appended: false, trail };
    const next = {
      seq: trail.seq + 1,
      events: [{ ...event, seq: trail.seq + 1 }, ...trail.events].slice(0, 500),
    };
    await storage.set(key, next);
    const readBack = await storage.get(key);
    return { appended: Boolean(readBack?.events?.some((e) => e.id === event.id)), trail: readBack ?? next };
  }

  async function readAudit(issueKey) {
    return (await storage.get(keyOf.audit(issueKey))) ?? { seq: 0, events: [] };
  }

  async function tracked() {
    const list = (await storage.get(keyOf.tracked)) ?? [];
    return Array.isArray(list) ? list : [];
  }

  async function track(issueKey, meta = {}) {
    const list = await tracked();
    if (list.some((t) => t.key === issueKey)) return list;
    const next = [...list, { key: issueKey, addedAt: now().toISOString(), ...meta }];
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
      openFieldId: null,
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

  return { readLedger, mutateLedger, recordEvent, readAudit, tracked, track, untrack, settings, saveSettings, issueMeta, saveIssueMeta };
}
