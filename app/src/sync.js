import { counts } from './ledger.js';
import { buildProjection, isStale, PROJECTION_KEY } from './projection.js';

/**
 * Reconcile the projection with the ledger.
 *
 * Write order matters. The ledger is written first (it is the authority), then
 * the projection, then the custom field the workflow condition reads. If the
 * second write fails, the projection and ledger disagree and `decideGate` and
 * the sync check both notice — which is the point. The failure that must never
 * happen is a projection saying zero while the ledger holds live commitments.
 */
export async function syncIssue(io, issueKey, { now = new Date(), maxAgeMs = 5 * 60 * 1000 } = {}) {
  const ledger = await io.readLedger(issueKey);
  if (!ledger) {
    return { status: 'no_ledger', wrote: false, counts: null };
  }

  const existing = await io.readProjection(issueKey);
  const stale = isStale(existing, ledger, { nowMs: now.getTime(), maxAgeMs });
  const c = counts(ledger, now.getTime());

  if (!stale.stale && !existing.guard && existing.open === c.open && existing.overdue === c.overdue && existing.unowned === c.unowned) {
    return { status: 'fresh', wrote: false, counts: c };
  }

  const projection = buildProjection(ledger, c, now.toISOString());
  await io.writeProjection(issueKey, projection);
  await io.writeField(issueKey, c.open);

  const readBack = await io.readProjection(issueKey);
  if (!readBack || readBack.ledgerRev !== ledger.rev) {
    throw new Error('projection_write_unverified');
  }
  const fieldBack = await io.readField(issueKey);
  if (fieldBack !== c.open) {
    throw new Error('field_write_unverified');
  }

  return { status: 'wrote', wrote: true, counts: c, reason: stale.reason, projectionKey: PROJECTION_KEY };
}

/**
 * Batched repair used by the settings screen and by recovery after an outage.
 * Returns the keys it could not repair rather than pretending everything synced.
 */
export async function resyncAll(io, issueKeys, opts) {
  const failed = [];
  let repaired = 0;
  for (const key of issueKeys) {
    try {
      const res = await syncIssue(io, key, opts);
      if (res.wrote) repaired += 1;
    } catch (err) {
      failed.push({ key, error: err.message });
    }
  }
  return { repaired, failed, attempted: issueKeys.length };
}

/**
 * Fail-closed ordering for the customer portal.
 *
 * The portal condition reads one number that Relay projects onto the issue. A
 * condition cannot consult the ledger, so the projection must never say "zero
 * open" while the ledger holds work. Issue-property writes and ledger writes
 * live in two different stores with no transaction between them, so Relay
 * orders them deliberately:
 *
 *   1. If the transition leaves any commitment unresolved, write a *guard*
 *      projection FIRST, stamped with the revision the ledger is about to take,
 *      carrying the planned open count. A reader at this instant sees open > 0.
 *   2. Write the ledger (revision-checked, read back).
 *   3. Write the final projection and the condition field.
 *
 * If step 2 or 3 fails, what remains on the issue is the guard: stale, and
 * saying `open > 0`. That is the safe direction — the portal is blocked until
 * Relay reconciles. The dangerous direction (projection says zero while the
 * ledger is not) is not reachable through this path, because the guard is
 * written before the commitments exist.
 *
 * This is not atomicity, and it is not claimed to be. A guard write that fails
 * aborts the mutation entirely: no ledger change happens either.
 */
export async function writeGuardProjection(io, issueKey, plannedLedger, plannedCounts, now = new Date()) {
  if (plannedCounts.open <= 0) return { wrote: false, reason: 'no_open_commitments' };
  const current = await io.readProjection(issueKey);
  const alreadyBlocking = current && typeof current.open === 'number' && current.open > 0;
  if (alreadyBlocking) return { wrote: false, reason: 'already_blocking' };

  const guard = {
    ...buildProjection(plannedLedger, plannedCounts, now.toISOString()),
    guard: true,
  };
  await io.writeProjection(issueKey, guard);
  const readBack = await io.readProjection(issueKey);
  if (!readBack || readBack.ledgerRev !== guard.ledgerRev) {
    throw new Error('guard_write_unverified');
  }
  return { wrote: true, projection: guard };
}
