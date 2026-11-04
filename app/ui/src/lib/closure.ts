import type { ClosureState, Commitment, Issue } from './types';

/**
 * Derived closure state. The backend computes the same shape (app/src/gate.js)
 * and is the authority; this mirror exists so the fixture workspace behaves
 * like the real one instead of being a static picture.
 */
export function computeClosure(commitments: Commitment[], evaluatedAt = new Date().toISOString()): ClosureState {
  const unresolved = commitments.filter((c) => c.status === 'open' || c.status === 'proposed');
  const overdue = unresolved.filter((c) => c.status === 'open' && c.overdue).length;
  const unowned = unresolved.filter((c) => c.status === 'open' && !c.owner).length;
  const awaiting = unresolved.filter((c) => c.status === 'proposed').length;
  const reasons: string[] = [];
  if (overdue) reasons.push(`${overdue} accepted commitment${overdue > 1 ? 's are' : ' is'} past its due date.`);
  if (unowned) reasons.push(`${unowned} commitment${unowned > 1 ? 's have' : ' has'} no owner.`);
  if (awaiting) reasons.push(`${awaiting} captured suggestion${awaiting > 1 ? 's are' : ' is'} still awaiting review.`);
  const ready = unresolved.length === 0;
  return {
    ready,
    blockingCount: unresolved.length,
    awaitingReview: awaiting,
    overdue,
    unowned,
    reasons: ready ? [] : reasons,
    evaluatedAt,
    projection: {
      kind: 'issue-property',
      key: 'relay.closure',
      value: { open: unresolved.length, overdue, unowned, updatedAt: evaluatedAt },
      syncedAt: evaluatedAt,
      stale: false,
    },
    validatorMessage: ready
      ? null
      : `Relay: ${unresolved.length} unresolved commitment${unresolved.length > 1 ? 's' : ''} on this case. Resolve or verify them before closing.`,
    conditionMessage: ready ? null : 'Customer closure is restricted while commitments are unresolved.',
  };
}

export function withClosure(issue: Issue, at = new Date().toISOString()): Issue {
  return { ...issue, commitments: issue.commitments, closure: computeClosure(issue.commitments, at) };
}
