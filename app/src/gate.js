import { counts, isManagedState, MANAGED, UNMANAGED, INITIALIZING } from './ledger.js';
import { isStale } from './projection.js';

/**
 * The closure decision, in one place.
 *
 * Persistence is not permission: an issue Relay does not manage must not be
 * blocked, and an issue Relay is still initialising must not be opened. Both
 * the validator (agents and REST) and the console ask *this* function, so the
 * two can never disagree about the same record — P2.2 requires that the
 * validator and the condition agree, and the only way to keep an agreement is
 * to have one decision.
 *
 * Deliberate policy: this gate FAILS CLOSED. If the record cannot be read, or
 * its state is missing or unrecognised, the closure is refused with a message
 * that says so. `missing` is never treated as `unmanaged`.
 */
export const BASE_MESSAGE = 'Relay has unresolved commitments attached to this case.';
export const UNAVAILABLE_MESSAGE =
  'Relay could not read this case’s commitment ledger, so closure is blocked rather than allowed. An administrator should check the Relay app installation.';
export const INITIALIZING_MESSAGE =
  'Relay is still initialising this case: its commitments have not been confirmed yet, so closure is withheld. Re-run Relay’s capture for this issue, or ask an administrator to finish the backfill.';
export const UNKNOWN_STATE_MESSAGE =
  'Relay holds no management state for this case, so closure is withheld rather than allowed. An administrator should run Relay’s backfill (Relay workspace → Backfill) so every issue in the project is recorded as managed or unmanaged.';

/**
 * @param {{
 *   ledger?: object|null,
 *   state?: string|null,
 *   projection?: object|null,
 *   nowMs?: number,
 * }} input `state` defaults to the record's own state; the ledger is the record.
 */
export function decideClosure({ ledger = null, state, projection = null, nowMs = Date.now() } = {}) {
  const effective = state === undefined ? ledger?.state ?? null : state;

  if (!isFieldSafeState(effective)) {
    return {
      allow: false,
      code: 'unknown_state',
      state: effective ?? null,
      message: UNKNOWN_STATE_MESSAGE,
      counts: ledger ? counts(ledger, nowMs) : null,
      stale: false,
    };
  }

  if (effective === UNMANAGED) {
    // Relay explicitly does not manage this issue. Whatever the record still
    // holds is history, kept for the audit trail and for an operator who wants
    // to re-track it; it does not gate closure.
    return {
      allow: true,
      code: 'unmanaged',
      state: effective,
      message: null,
      counts: ledger ? counts(ledger, nowMs) : { open: 0, overdue: 0, unowned: 0, awaitingReview: 0 },
      stale: false,
    };
  }

  if (effective === INITIALIZING) {
    return {
      allow: false,
      code: 'initializing',
      state: effective,
      message: INITIALIZING_MESSAGE,
      counts: ledger ? counts(ledger, nowMs) : null,
      stale: false,
    };
  }

  const c = counts(ledger, nowMs);
  const stale = isStale(projection, ledger, { nowMs });

  if (c.open > 0) {
    return {
      allow: false,
      code: 'blocked',
      state: effective,
      message: blockMessage(c),
      counts: c,
      stale: stale.stale,
    };
  }

  // Nothing to block on, but a caller cannot be told "the projection is stale"
  // and then have the closure allowed anyway: the record is the authority and it
  // says zero. Stale is reported so the projection can be repaired.
  return { allow: true, code: 'clear', state: effective, message: null, counts: c, stale: stale.stale };
}

/** The states the condition expression can act on. Everything else refuses. */
export function isFieldSafeState(state) {
  return isManagedState(state);
}

/**
 * P2.1's entry point. Kept because the sync/reconcile code and the console's
 * read-back call it by name; it is now a thin wrapper over `decideClosure`, so
 * there is exactly one policy.
 */
export function decideGate(ledger, projection, { nowMs = Date.now(), state } = {}) {
  return decideClosure({ ledger, projection, nowMs, state });
}

export function blockMessage(c) {
  const parts = [];
  parts.push(`${c.open} unresolved commitment${c.open > 1 ? 's' : ''}`);
  const detail = [];
  if (c.overdue) detail.push(`${c.overdue} overdue`);
  if (c.unowned) detail.push(`${c.unowned} without an owner`);
  if (c.awaitingReview) detail.push(`${c.awaitingReview} still awaiting review`);
  const suffix = detail.length ? ` (${detail.join(', ')})` : '';
  return `Relay: ${parts.join('')}${suffix}. Verify, complete or drop each one before closing this case.`;
}

/**
 * What a customer sees when the portal condition refuses them. The condition
 * carries no message of its own, so this text belongs on the request (as a
 * comment Relay posts beforehand) — not in the refusal.
 */
export function customerFacingExplanation(ledger) {
  const c = counts(ledger);
  if (!c.open) return null;
  const lines = ledger.commitments.filter((x) => x.status === 'open' || x.status === 'proposed').map((x) => `• ${x.text}${x.owner ? '' : ' (no owner yet)'}`);
  return `Relay: this request cannot be closed yet. Outstanding promises:\n${lines.join('\n')}`;
}
