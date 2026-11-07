/**
 * The authoritative commitment ledger.
 *
 * Everything else in Relay — the projection the workflow condition reads, the
 * message the validator returns, the numbers in the console — is derived from
 * this. The ledger is versioned so two writers cannot silently overwrite each
 * other, and it lives in app storage rather than in a Jira field because a
 * comment can be edited by anyone with comment permission.
 */

export const LEDGER_VERSION = 2;

/**
 * Relay's management state for an issue.
 *
 * The state is *in the record*, next to the commitments, because a workflow
 * condition that reads "does Relay manage this issue?" must be answerable from
 * the same write that made the answer true. Three states, no more:
 *
 *   * `unmanaged`    — Relay explicitly does not manage this issue (backfill,
 *                      issue created, or an offboarding that was confirmed).
 *                      Closure is permitted and the count is irrelevant.
 *   * `initializing` — Relay is capturing or the last capture did not finish.
 *                      Closure is withheld on both paths.
 *   * `managed`      — Relay's count is authoritative. Closure is permitted
 *                      only when the count is exactly zero.
 *
 * An issue with no record has *no state*, which is not `unmanaged`: the brief is
 * explicit that `missing` must never be treated as `unmanaged`, so every
 * consumer of this module answers `unknown` and withholds.
 */
export const MANAGED = 'managed';
export const UNMANAGED = 'unmanaged';
export const INITIALIZING = 'initializing';
export const MANAGED_STATES = Object.freeze([UNMANAGED, INITIALIZING, MANAGED]);

export function isManagedState(state) {
  return typeof state === 'string' && MANAGED_STATES.includes(state);
}

/**
 * A commitment record, as stored (not as displayed).
 *
 * `originalText` is the verbatim sentence lifted from the comment and is never
 * rewritten. `text` is what a person accepted — usually identical, editable by
 * a human, and never edited by Relay. `evidence` is the anchor: comment id,
 * author, the exact quote and the offsets that still resolve to it.
 *
 * @typedef {{
 *   code: string,
 *   issueKey: string,
 *   status: 'proposed'|'open'|'verified'|'dropped',
 *   text: string,
 *   originalText: string,
 *   evidence: { commentId: string, commentCreatedAt: string|null, body: string, bodyHash: string|null,
 *               bodyFormat: 'adf-text'|'plain', quote: string, start: number, end: number,
 *               author: { id: string|null, name: string, initials: string },
 *               fingerprint: string, capturedAt: string },
 *   owner: { id: string|null, name: string, initials: string }|null,
 *   dueAt: string|null,
 *   dueBasis: string|null,
 *   confidence: number,
 *   signals: string[],
 *   acceptedAt: string|null,
 *   acceptedBy: { id: string|null, name: string }|null,
 *   verifiedAt: string|null,
 *   verifiedBy: { id: string|null, name: string }|null,
 *   verificationNote: string|null,
 *   droppedReason: string|null,
 *   droppedAt: string|null,
 *   previousOwners: { from: object|null, to: object, by: object|null, at: string, reason: string }[],
 *   overdue?: boolean
 * }} Commitment
 */

/**
 * A content digest of the commitment list.
 *
 * Revision numbers alone are not enough to verify a write: a rival writer can
 * produce the same revision with different content, and a length check would
 * not notice. The digest makes "exactly the ledger I intended" a checkable
 * claim rather than an assumption.
 *
 * It lives here, next to the record shape, because the *empty* ledger needs a
 * digest too: a created record without one is a record whose read-back cannot
 * be verified, and the Custom Entity Store has no null to put there instead.
 *
 * ## What it covers, and what it does not
 *
 * Covered, per commitment: `code`, `status`, the owner's identity (`id`, or
 * `name` when the id is absent, because an on-premise Jira has no account id),
 * `dueAt` and `text`. Those are the fields Relay *decides* from — `isUnresolved`,
 * `counts`, the closure contract — plus the identifier and the wording a person
 * accepted.
 *
 * Not covered: `originalText`, the whole `evidence` chain (`commentId`,
 * `commentCreatedAt`, `body`, `bodyHash`, `bodyFormat`, `quote`, `start`, `end`,
 * `author`, `fingerprint`, `capturedAt`), `confidence`, `signals`,
 * `suggestedOwner`, `dueBasis`, `acceptedAt`, `acceptedBy`, `verifiedAt`,
 * `verifiedBy`, `verificationNote`, `droppedAt`, `droppedReason` and
 * `previousOwners`.
 *
 * That is deliberate, and the limit is worth stating plainly: this is a
 * **same-revision consistency check**, not tamper evidence. FNV-1a is 32 bits,
 * unseeded and not collision resistant, so it cannot be a security boundary in
 * any case; the guard against a rival write is the revision on the conditional
 * write, and the digest answers a narrower question — *did the record read back
 * hold the commitments I just wrote?* — for the fields the answer depends on.
 * The quotation is anchored where it belongs instead: `evidence.fingerprint`
 * covers issue, comment, offsets and the quote, `evidence.bodyHash` covers the
 * comment body, and both are re-derived from Jira when the comment is rescanned.
 *
 * The algorithm is frozen for a compatibility reason, not an aesthetic one:
 * `fromStored` verifies the stored digest against the stored commitments, so
 * changing which fields this hashes would make every record already in the
 * entity store fail its own check and be refused. A wider digest would have to
 * arrive as a versioned algorithm (`v2:` prefix, both verifiable on read),
 * which is a change to make when the guarantee is restated as record-wide
 * integrity — not before.
 */
export function digestOf(commitments) {
  const list = Array.isArray(commitments) ? commitments : [];
  const canonical = list
    .map((c) => [c.code, c.status, c.owner?.id ?? c.owner?.name ?? '', c.dueAt ?? '', c.text ?? ''].join('\u0001'))
    .sort()
    .join('\u0002');
  let h = 2166136261;
  for (let i = 0; i < canonical.length; i += 1) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${list.length}:${(h >>> 0).toString(16)}`;
}

/** The digest of a record with no commitments: what a freshly created record holds. */
export const EMPTY_DIGEST = digestOf([]);

export function emptyLedger(issueKey, now = new Date().toISOString(), state = INITIALIZING) {
  return {
    version: LEDGER_VERSION,
    rev: 0,
    issueKey,
    state,
    commitments: [],
    digest: EMPTY_DIGEST,
    updatedAt: now,
  };
}

/**
 * Apply a mutation with an explicit expected revision. Returns a new ledger or
 * throws — never a partially applied change.
 */
export function applyMutation(ledger, expectedRev, mutate, now = new Date().toISOString()) {
  if (!ledger) throw new Error('ledger_missing');
  if (ledger.rev !== expectedRev) {
    const err = new Error('revision_conflict');
    err.expected = expectedRev;
    err.actual = ledger.rev;
    throw err;
  }
  const next = mutate({ ...ledger, commitments: ledger.commitments.map((c) => ({ ...c })) });
  return { ...next, rev: ledger.rev + 1, updatedAt: now };
}

/**
 * The four states a commitment can be in, and all there have ever been:
 * `toRecord()` creates `proposed`, `relay.capture.accept` moves it to `open`,
 * `relay.commitment.verify` to `verified`, and `relay.capture.reject` to
 * `dropped`.
 *
 * The list is exported so the record codec can enforce it *on read*. That
 * enforcement is not cosmetic: `isUnresolved` below answers false for anything
 * that is not `open` or `proposed`, so a commitment whose status was lost or
 * corrupted would be silently classified as settled and vanish from the open
 * count — which is the number the closure contract reads. A status that is not
 * one of these four is refused, not interpreted.
 */
export const COMMITMENT_STATUSES = Object.freeze(['proposed', 'open', 'verified', 'dropped']);

export function isCommitmentStatus(status) {
  return typeof status === 'string' && COMMITMENT_STATUSES.includes(status);
}

/** The single definition of "unresolved". Everything derives from this. */
export function isUnresolved(c) {
  return c.status === 'open' || c.status === 'proposed';
}

export function counts(ledger, nowMs = Date.now()) {
  const commitments = ledger?.commitments ?? [];
  const unresolved = commitments.filter(isUnresolved);
  const overdue = unresolved.filter((c) => c.status === 'open' && isOverdue(c, nowMs)).length;
  const unowned = unresolved.filter((c) => c.status === 'open' && !c.owner).length;
  const awaitingReview = unresolved.filter((c) => c.status === 'proposed').length;
  return { open: unresolved.length, overdue, unowned, awaitingReview };
}

export function isOverdue(c, nowMs = Date.now()) {
  if (!c.dueAt) return false;
  return new Date(c.dueAt).getTime() < nowMs;
}

/* ------------------------------------------------------- ledger operations */

/** Next free commitment code. Codes are stable identifiers in the audit trail. */
export function nextCode(commitments) {
  const used = commitments
    .map((c) => Number(String(c.code ?? '').replace(/\D/g, '')))
    .filter((n) => Number.isFinite(n));
  const max = used.length ? Math.max(...used) : 0;
  return `CM-${max + 1}`;
}

export function findByCode(ledger, code) {
  return ledger?.commitments?.find((c) => c.code === code) ?? null;
}

/**
 * A comment scanned twice must not produce a second commitment. The
 * fingerprint covers issue, comment, offsets and the quotation, so a comment
 * edited by a human later produces a *new* candidate instead of mutating the
 * old evidence — which is the honest behaviour: the words changed.
 */
export function findByFingerprint(ledger, fingerprint) {
  return ledger?.commitments?.find((c) => c.evidence?.fingerprint === fingerprint) ?? null;
}

export function isSettled(c) {
  return c.status === 'verified' || c.status === 'dropped';
}
