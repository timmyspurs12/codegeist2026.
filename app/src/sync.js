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

  if (!stale.stale && existing.open === c.open && existing.overdue === c.overdue && existing.unowned === c.unowned) {
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
