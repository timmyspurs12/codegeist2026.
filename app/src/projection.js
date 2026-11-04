/**
 * The projection is the only thing a workflow *condition* can read.
 *
 * A condition is evaluated by Jira from the work item — it cannot call Relay.
 * So the closure decision has to be materialised onto the issue before anyone
 * tries to close it, and the materialised copy must carry enough information
 * for a reader to notice it is stale.
 */

export const PROJECTION_KEY = 'relay.closure';
export const OPEN_FIELD_PROPERTY = 'relay.openCommitments';

export function buildProjection(ledger, counts, now = new Date().toISOString()) {
  return {
    ledgerRev: ledger?.rev ?? -1,
    ledgerUpdatedAt: ledger?.updatedAt ?? null,
    open: counts.open,
    overdue: counts.overdue,
    unowned: counts.unowned,
    awaitingReview: counts.awaitingReview,
    updatedAt: now,
  };
}

/**
 * A projection is stale when the ledger has moved on without it, or when it is
 * too old to be trusted. Staleness never permits a closure — see gate.js.
 */
export function isStale(projection, ledger, { nowMs = Date.now(), maxAgeMs = 5 * 60 * 1000 } = {}) {
  if (!projection) return { stale: true, reason: 'missing' };
  // A guard is the placeholder Relay writes *before* it commits the ledger, so
  // the condition can never read zero while work is about to be saved. It is
  // conservative, not reconciled: it must be replaced by a real projection.
  if (projection.guard) return { stale: true, reason: 'guard' };
  if (!ledger) return { stale: true, reason: 'ledger_missing' };
  if (projection.ledgerRev !== ledger.rev) return { stale: true, reason: 'rev_mismatch' };
  const age = nowMs - new Date(projection.updatedAt).getTime();
  if (!Number.isFinite(age) || age > maxAgeMs) return { stale: true, reason: 'expired' };
  return { stale: false, reason: null };
}

/**
 * The condition expression Relay installs on the customer-facing transition.
 * It reads a numeric custom field so it does not depend on Jira expressions
 * exposing entity properties — that support is not something we have proven.
 * The field id is site-specific, which is why it is configuration, not code.
 */
export function conditionExpression(fieldId = 'customfield_relay_open') {
  return `issue.${fieldId} == 0`;
}
