/**
 * Enforcement state and closure provenance.
 *
 * This module resolves the six open safety questions from Phase 0 §6 into code:
 *
 *   1. the four closure states (verified / unverified / overridden / disabled)
 *   2. fail-open vs fail-closed, as a per-project policy with a safe default
 *   3. staleness of precomputed gate state
 *   4. the rule that an unavailable mechanism must never look operational
 *
 * It is pure: no I/O, no clock, no imports. Every function takes `now`.
 *
 * STATUS: implemented and unit-tested offline. NOT tested against a live site.
 */

/** @typedef {'verified'|'unverified'|'overridden'|'disabled'} EnforcementState */

export const ENFORCEMENT = Object.freeze({
  VERIFIED: 'verified',
  UNVERIFIED: 'unverified',
  OVERRIDDEN: 'overridden',
  DISABLED: 'disabled',
});

/** Gate state older than this is treated as unreliable. */
export const STALE_AFTER_MS = 15 * 60 * 1000;

/** An override must say why. Short reasons are rejected as non-reasons. */
export const MIN_OVERRIDE_REASON = 20;

/**
 * Fail-closed is opt-in and must be chosen per project. The default is
 * fail-open: Relay must never be the reason a duty-of-care case cannot be
 * closed during a storage outage.
 *
 * @param {unknown} policy
 * @returns {'fail-open'|'fail-closed'}
 */
export function resolvePolicy(policy) {
  return policy === 'fail-closed' ? 'fail-closed' : 'fail-open';
}

/**
 * @param {{updatedAt?: string|number}|null|undefined} state
 * @param {number} nowMs
 * @returns {boolean}
 */
export function isStale(state, nowMs) {
  if (!state || state.updatedAt === undefined || state.updatedAt === null) return false;
  const updated = typeof state.updatedAt === 'number' ? state.updatedAt : Date.parse(state.updatedAt);
  if (Number.isNaN(updated)) return true;
  return nowMs - updated > STALE_AFTER_MS;
}

/**
 * Validate an override before it is recorded.
 *
 * @param {{actor?: string, reason?: string}|null|undefined} override
 * @returns {{ok: boolean, code: string}}
 */
export function validateOverride(override) {
  if (!override) return { ok: false, code: 'NO_OVERRIDE' };
  const reason = typeof override.reason === 'string' ? override.reason.trim() : '';
  if (reason.length < MIN_OVERRIDE_REASON) return { ok: false, code: 'OVERRIDE_REASON_TOO_SHORT' };
  if (!override.actor) return { ok: false, code: 'OVERRIDE_ACTOR_REQUIRED' };
  return { ok: true, code: 'OVERRIDE_VALID' };
}

/**
 * Derive the enforcement provenance of a closure that *actually happened*.
 *
 * Precedence matters: an override is recorded as an override even when the gate
 * could also have failed. Provenance describes what allowed the closure, and
 * for an override the answer is "a person", not "the gate didn't work".
 *
 * @param {{
 *   decision: {result: boolean, audit?: {code?: string}} | null,
 *   state: any,
 *   override?: {actor?: string, reason?: string} | null,
 *   nowMs: number,
 * }} input
 * @returns {{ enforcement: EnforcementState, reason: string }}
 */
export function deriveEnforcement({ decision, state, override, nowMs }) {
  if (override && validateOverride(override).ok) {
    return { enforcement: ENFORCEMENT.OVERRIDDEN, reason: 'OVERRIDE_ACCEPTED' };
  }

  if (!state || state.enabled === false) {
    return { enforcement: ENFORCEMENT.DISABLED, reason: 'RELAY_NOT_ENFORCING' };
  }

  if (state.stateAvailable === false) {
    return { enforcement: ENFORCEMENT.UNVERIFIED, reason: 'GATE_STATE_UNAVAILABLE' };
  }

  if (isStale(state, nowMs)) {
    return { enforcement: ENFORCEMENT.UNVERIFIED, reason: 'GATE_STATE_STALE' };
  }

  const code = decision?.audit?.code;

  if (decision?.result === false) {
    // Reaching here means a closure happened despite a block, which is only
    // possible via an override. Refuse to call it verified.
    return { enforcement: ENFORCEMENT.UNVERIFIED, reason: 'CLOSED_DESPITE_BLOCK' };
  }

  if (code === 'GATE_STATE_UNAVAILABLE_ALLOWED' || code === 'GATE_STATE_UNAVAILABLE_BLOCKED') {
    return { enforcement: ENFORCEMENT.UNVERIFIED, reason: 'GATE_STATE_UNAVAILABLE' };
  }

  if (code === 'GATE_DISABLED') {
    return { enforcement: ENFORCEMENT.DISABLED, reason: 'GATE_DISABLED' };
  }

  if (code === 'GATE_PASSED') {
    return { enforcement: ENFORCEMENT.VERIFIED, reason: 'GATE_EVALUATED_CLEAR' };
  }

  // No decision, unknown code, or a malformed audit trail. Never assume it ran.
  return { enforcement: ENFORCEMENT.UNVERIFIED, reason: 'NO_EVALUABLE_DECISION' };
}

/**
 * Only `verified` counts as compliance. Everything else is reported separately.
 *
 * @param {EnforcementState} enforcement
 * @returns {boolean}
 */
export function countsAsCompliant(enforcement) {
  return enforcement === ENFORCEMENT.VERIFIED;
}

/**
 * Summarise a set of closure records without ever inflating the compliant rate.
 *
 * `disabled` closures are excluded from the denominator entirely: Relay was not
 * enforcing on that project, so it has nothing to say about them. They are
 * still reported, because silently dropping them would hide a misconfigured
 * project.
 *
 * @param {{enforcement: EnforcementState}[]} records
 */
export function complianceSummary(records) {
  const counts = {
    [ENFORCEMENT.VERIFIED]: 0,
    [ENFORCEMENT.UNVERIFIED]: 0,
    [ENFORCEMENT.OVERRIDDEN]: 0,
    [ENFORCEMENT.DISABLED]: 0,
  };

  for (const r of records ?? []) {
    if (r && counts[r.enforcement] !== undefined) counts[r.enforcement] += 1;
  }

  const evaluated = counts[ENFORCEMENT.VERIFIED] + counts[ENFORCEMENT.UNVERIFIED] + counts[ENFORCEMENT.OVERRIDDEN];
  const total = evaluated + counts[ENFORCEMENT.DISABLED];
  const complianceRate = evaluated === 0 ? null : counts[ENFORCEMENT.VERIFIED] / evaluated;

  return {
    counts,
    total,
    evaluated,
    complianceRate,
    // The claim a dashboard is allowed to make. Deliberately worded so that a
    // high number cannot be produced from unverified closures.
    headline:
      complianceRate === null
        ? 'No closures to evaluate'
        : `${Math.round(complianceRate * 100)}% of evaluated closures were gate-verified`
          + (counts[ENFORCEMENT.UNVERIFIED] > 0 ? `; ${counts[ENFORCEMENT.UNVERIFIED]} unverified` : '')
          + (counts[ENFORCEMENT.OVERRIDDEN] > 0 ? `; ${counts[ENFORCEMENT.OVERRIDDEN]} overridden` : ''),
  };
}
