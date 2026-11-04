/**
 * The authoritative commitment ledger.
 *
 * Everything else in Relay — the projection the workflow condition reads, the
 * message the validator returns, the numbers in the console — is derived from
 * this. The ledger is versioned so two writers cannot silently overwrite each
 * other, and it lives in app storage rather than in a Jira field because a
 * comment can be edited by anyone with comment permission.
 */

export const LEDGER_VERSION = 1;

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

export function emptyLedger(issueKey, now = new Date().toISOString()) {
  return { version: LEDGER_VERSION, rev: 0, issueKey, commitments: [], updatedAt: now };
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
