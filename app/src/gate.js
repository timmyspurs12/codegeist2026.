import { counts, isUnresolved } from './ledger.js';
import { isStale } from './projection.js';

/**
 * The agent/API closure decision.
 *
 * Deliberate policy: this gate FAILS CLOSED. If the ledger cannot be read, or
 * the projection does not match it, the closure is refused with a message that
 * says which of those is true. E1 showed what fail-open looks like from the
 * outside — a gate that silently permits everything and still reports success.
 */
export const BASE_MESSAGE = 'Relay has unresolved commitments attached to this case.';
export const UNAVAILABLE_MESSAGE =
  'Relay could not read this case’s commitment ledger, so closure is blocked rather than allowed. An administrator should check the Relay app installation.';

export function decideGate(ledger, projection, { nowMs = Date.now() } = {}) {
  if (ledger === null || ledger === undefined) {
    return { allow: false, code: 'unavailable', message: UNAVAILABLE_MESSAGE, counts: null };
  }

  const c = counts(ledger, nowMs);
  const stale = isStale(projection, ledger, { nowMs });

  if (c.open > 0) {
    return {
      allow: false,
      code: 'blocked',
      message: blockMessage(c),
      counts: c,
      stale: stale.stale,
    };
  }

  // Nothing to block on, but a caller cannot be told "the ledger is stale" and
  // then have the closure allowed anyway: the ledger is the authority, and it
  // says zero. Stale projection is reported so the projection can be repaired.
  return { allow: true, code: 'clear', message: null, counts: c, stale: stale.stale };
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
  const lines = ledger.commitments.filter(isUnresolved).map((x) => `• ${x.text}${x.owner ? '' : ' (no owner yet)'}`);
  return `Relay: this request cannot be closed yet. Outstanding promises:\n${lines.join('\n')}`;
}
