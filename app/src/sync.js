import { counts, MANAGED, UNMANAGED, INITIALIZING } from './ledger.js';
import { buildProjection, isStale, PROJECTION_KEY } from './projection.js';

/**
 * Reconcile the projection (the issue property) and the condition fields with
 * the record (state + commitments).
 *
 * Write order matters. The record is written first (it is the authority), then
 * the projection, then the two fields the workflow condition reads. If a later
 * write fails, the readers disagree and `decideClosure` and the reconcile
 * report both notice — which is the point. The failure that must never happen
 * is a condition saying "zero" while the record holds live commitments, or
 * saying "unmanaged" while Relay is still initialising.
 */
export async function syncIssue(io, issueKey, { now = new Date(), maxAgeMs = 5 * 60 * 1000 } = {}) {
  const ledger = await io.readLedger(issueKey);
  if (!ledger) {
    // P2.1 returned here and callers counted it as success. A record that does
    // not exist is not in step with anything: the condition cannot read a state
    // for this issue, so closure is withheld. Callers must report it.
    return { status: 'no_ledger', wrote: false, counts: null, state: null, reason: 'issue_has_no_record' };
  }

  const state = ledger.state ?? null;
  const existing = await io.readProjection(issueKey);
  const stale = isStale(existing, ledger, { nowMs: now.getTime(), maxAgeMs });
  const c = counts(ledger, now.getTime());

  // The condition reads the fields, not the projection, so "fresh" has to mean
  // all three agree. A missing field (null) is not zero and is not a state: it
  // is written like any other disagreement.
  let fieldNow;
  let stateNow;
  try {
    fieldNow = await io.readField(issueKey);
  } catch (err) {
    fieldNow = undefined;
  }
  try {
    stateNow = await io.readState(issueKey);
  } catch (err) {
    stateNow = undefined;
  }

  const fieldInStep = fieldNow === c.open;
  const stateInStep = stateNow === state;

  if (
    fieldInStep &&
    stateInStep &&
    !stale.stale &&
    !existing.guard &&
    existing.open === c.open &&
    existing.overdue === c.overdue &&
    existing.unowned === c.unowned
  ) {
    return { status: 'fresh', wrote: false, counts: c, state };
  }

  const projection = buildProjection(ledger, c, now.toISOString());
  await io.writeProjection(issueKey, projection);

  // The order of the two field writes is the more restrictive value first.
  //
  //   * Becoming `managed`: the count goes first. A managed state with a stale
  //     zero would permit closure while work exists; a high count with a stale
  //     `initializing` merely withholds, which is safe.
  //   * Becoming `initializing` or `unmanaged`: the state goes first, so a
  //     missing or refused count write cannot leave an issue that the condition
  //     still reads as managed at zero.
  //
  // Both writes are read back: a 204 from the private field API means
  // "accepted", not "stored".
  if (state === MANAGED) {
    await io.writeField(issueKey, c.open);
    await io.writeState(issueKey, state);
  } else {
    await io.writeState(issueKey, state);
    await io.writeField(issueKey, c.open);
  }

  const readBack = await io.readProjection(issueKey);
  if (!readBack || readBack.ledgerRev !== ledger.rev) {
    throw new Error('projection_write_unverified');
  }
  const fieldBack = await io.readField(issueKey);
  if (fieldBack !== c.open) {
    throw new Error(`field_write_unverified: expected ${c.open}, read ${String(fieldBack)}`);
  }
  const stateBack = await io.readState(issueKey);
  if (stateBack !== state) {
    throw new Error(`state_field_write_unverified: expected ${String(state)}, read ${String(stateBack)}`);
  }

  return {
    status: 'wrote',
    wrote: true,
    counts: c,
    state,
    wroteState: !stateInStep,
    reason: stale.reason ?? (!stateInStep ? 'state_field_out_of_step' : 'field_out_of_step'),
    projectionKey: PROJECTION_KEY,
  };
}

/**
 * Batched repair used by the settings screen and by recovery after an outage.
 * Returns the keys it could not repair rather than pretending everything synced.
 */
export async function resyncAll(io, issueKeys, opts) {
  const failed = [];
  const noRecord = [];
  let repaired = 0;
  for (const key of issueKeys) {
    try {
      const res = await syncIssue(io, key, opts);
      if (res.status === 'no_ledger') noRecord.push(key);
      else if (res.wrote) repaired += 1;
    } catch (err) {
      failed.push({ key, error: err.message });
    }
  }
  return { repaired, failed, noRecord, attempted: issueKeys.length };
}

/**
 * Fail-closed ordering for the customer portal.
 *
 * The portal condition reads the two fields Relay projects onto the issue. A
 * condition cannot consult the record, so the fields must never say
 * "unmanaged" or "zero" while the record holds work. Issue-property writes and
 * record writes live in two different stores with no transaction between them,
 * so Relay orders them deliberately:
 *
 *   1. If the transition leaves any commitment unresolved, write a *guard*
 *      projection and a *guard* field state FIRST, stamped with the revision
 *      the record is about to take, carrying the planned open count. A reader at
 *      this instant sees `initializing` and open > 0.
 *   2. Write the record (conditional commit, read back).
 *   3. Write the final projection and the condition fields.
 *
 * If step 2 or 3 fails, what remains on the issue is the guard: stale, saying
 * `initializing`. That is the safe direction — the portal is blocked until
 * Relay reconciles. The dangerous direction (fields saying unmanaged or zero
 * while the record is not) is not reachable through this path.
 */
export async function writeGuardProjection(io, issueKey, plannedLedger, plannedCounts, now = new Date()) {
  if (plannedCounts.open <= 0) return { wrote: false, reason: 'no_open_commitments' };

  const current = await io.readProjection(issueKey);
  let currentField;
  let currentState;
  try {
    currentField = await io.readField(issueKey);
  } catch (err) {
    currentField = undefined;
  }
  try {
    currentState = await io.readState(issueKey);
  } catch (err) {
    currentState = undefined;
  }

  // Both readers have to be saying "blocked" before the guard is skipped. If
  // either is open or unreadable, the guard is written again: a field left at
  // zero or at "unmanaged" while the record is about to hold work is the one
  // state that must not survive this call.
  const projectionBlocking = current && typeof current.open === 'number' && current.open > 0;
  const fieldBlocking = typeof currentField === 'number' && currentField > 0;
  const stateBlocking = currentState === MANAGED || currentState === INITIALIZING;
  if (projectionBlocking && fieldBlocking && stateBlocking) return { wrote: false, reason: 'already_blocking' };

  const guard = {
    ...buildProjection(plannedLedger, plannedCounts, now.toISOString()),
    guard: true,
  };
  await io.writeProjection(issueKey, guard);
  const readBack = await io.readProjection(issueKey);
  if (!readBack || readBack.ledgerRev !== guard.ledgerRev) {
    throw new Error('guard_write_unverified');
  }

  // The guard moves the state to `initializing` as well as the count, because
  // the condition's first branch short-circuits on `unmanaged`: a guard that
  // only raised the count would still permit an unmanaged issue to close.
  if (!stateBlocking) {
    await io.writeState(issueKey, INITIALIZING);
    const stateBack = await io.readState(issueKey);
    if (stateBack !== INITIALIZING) throw new Error('guard_state_write_unverified');
  }

  // The same number goes into the count field, because the condition reads it.
  await io.writeField(issueKey, plannedCounts.open);
  const fieldBack = await io.readField(issueKey);
  if (!(typeof fieldBack === 'number' && fieldBack > 0)) {
    throw new Error('guard_field_write_unverified');
  }

  return { wrote: true, projection: guard, field: fieldBack };
}

/** The states the condition acts on; re-exported so callers read one list. */
export { MANAGED, UNMANAGED, INITIALIZING };
