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

/** @typedef {{ code: string, text: string, quote: string, commentId: string, owner: string|null, dueAt: string|null, status: 'proposed'|'open'|'verified'|'dropped', overdue: boolean }} Commitment */

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
