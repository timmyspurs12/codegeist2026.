/**
 * Unit tests for closure provenance and the fail-open / fail-closed policy.
 *
 * The central property under test: **no combination of inputs can produce
 * `verified` unless the gate actually evaluated and returned clear.** If any
 * path could, the enforcement record would be able to lie.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENFORCEMENT,
  STALE_AFTER_MS,
  MIN_OVERRIDE_REASON,
  resolvePolicy,
  isStale,
  validateOverride,
  deriveEnforcement,
  countsAsCompliant,
  complianceSummary,
} from '../src/enforcement.js';

const NOW = Date.parse('2026-10-30T12:00:00.000Z');
const fresh = { enabled: true, stateAvailable: true, blockingCount: 0, updatedAt: new Date(NOW - 1000).toISOString() };
const passed = { result: true, audit: { code: 'GATE_PASSED' } };

test('a clean evaluation is verified', () => {
  const r = deriveEnforcement({ decision: passed, state: fresh, nowMs: NOW });
  assert.equal(r.enforcement, ENFORCEMENT.VERIFIED);
  assert.equal(countsAsCompliant(r.enforcement), true);
});

test('an unavailable store yields unverified, never verified', () => {
  const state = { enabled: true, stateAvailable: false };
  const decision = { result: true, audit: { code: 'GATE_STATE_UNAVAILABLE_ALLOWED' } };
  const r = deriveEnforcement({ decision, state, nowMs: NOW });
  assert.equal(r.enforcement, ENFORCEMENT.UNVERIFIED);
  assert.equal(countsAsCompliant(r.enforcement), false);
});

test('stale state yields unverified even when the decision said passed', () => {
  const state = { ...fresh, updatedAt: new Date(NOW - STALE_AFTER_MS - 1).toISOString() };
  const r = deriveEnforcement({ decision: passed, state, nowMs: NOW });
  assert.equal(r.enforcement, ENFORCEMENT.UNVERIFIED);
  assert.equal(r.reason, 'GATE_STATE_STALE');
});

test('state with no timestamp is not treated as stale by accident', () => {
  assert.equal(isStale({ enabled: true }, NOW), false);
  assert.equal(isStale(null, NOW), false);
  assert.equal(isStale({ updatedAt: 'not-a-date' }, NOW), true);
});

test('Relay disabled on the project yields disabled, not verified', () => {
  const r = deriveEnforcement({ decision: passed, state: { enabled: false }, nowMs: NOW });
  assert.equal(r.enforcement, ENFORCEMENT.DISABLED);
});

test('an override is recorded as overridden even if the gate would have failed', () => {
  const override = { actor: 'acc-1', reason: 'Tenant confirmed the repair by phone; ledger is stale.' };
  const r = deriveEnforcement({ decision: passed, state: { stateAvailable: false }, override, nowMs: NOW });
  assert.equal(r.enforcement, ENFORCEMENT.OVERRIDDEN);
});

test('a too-short override reason does not count as an override', () => {
  const override = { actor: 'acc-1', reason: 'ok' };
  assert.equal(validateOverride(override).ok, false);
  const r = deriveEnforcement({ decision: passed, state: { enabled: false }, override, nowMs: NOW });
  assert.equal(r.enforcement, ENFORCEMENT.DISABLED, 'invalid override must not be honoured');
});

test('an override with no actor is rejected', () => {
  assert.equal(validateOverride({ reason: 'x'.repeat(MIN_OVERRIDE_REASON) }).code, 'OVERRIDE_ACTOR_REQUIRED');
});

test('closing despite a block can never be verified', () => {
  const decision = { result: false, audit: { code: 'GATE_BLOCKED' } };
  const r = deriveEnforcement({ decision, state: fresh, nowMs: NOW });
  assert.equal(r.enforcement, ENFORCEMENT.UNVERIFIED);
  assert.equal(r.reason, 'CLOSED_DESPITE_BLOCK');
});

test('a missing or malformed decision is never assumed to have passed', () => {
  assert.equal(deriveEnforcement({ decision: null, state: fresh, nowMs: NOW }).enforcement, ENFORCEMENT.UNVERIFIED);
  assert.equal(deriveEnforcement({ decision: { result: true, audit: {} }, state: fresh, nowMs: NOW }).enforcement, ENFORCEMENT.UNVERIFIED);
});

test('fail-closed is opt-in only', () => {
  assert.equal(resolvePolicy(undefined), 'fail-open');
  assert.equal(resolvePolicy(null), 'fail-open');
  assert.equal(resolvePolicy('nonsense'), 'fail-open');
  assert.equal(resolvePolicy('fail-closed'), 'fail-closed');
});

test('compliance summary cannot be inflated by unverified or overridden closures', () => {
  const s = complianceSummary([
    { enforcement: ENFORCEMENT.VERIFIED },
    { enforcement: ENFORCEMENT.UNVERIFIED },
    { enforcement: ENFORCEMENT.UNVERIFIED },
    { enforcement: ENFORCEMENT.OVERRIDDEN },
  ]);
  assert.equal(s.counts.verified, 1);
  assert.equal(s.complianceRate, 0.25);
  assert.match(s.headline, /25%/);
  assert.match(s.headline, /2 unverified/);
  assert.match(s.headline, /1 overridden/);
});

test('disabled closures are excluded from the denominator but still reported', () => {
  const s = complianceSummary([
    { enforcement: ENFORCEMENT.VERIFIED },
    { enforcement: ENFORCEMENT.DISABLED },
    { enforcement: ENFORCEMENT.DISABLED },
  ]);
  assert.equal(s.complianceRate, 1);
  assert.equal(s.total, 3);
  assert.equal(s.evaluated, 1);
  assert.equal(s.counts.disabled, 2);
});

test('an empty or junk record set produces no claim at all', () => {
  assert.equal(complianceSummary([]).complianceRate, null);
  assert.equal(complianceSummary(null).complianceRate, null);
  assert.doesNotThrow(() => complianceSummary([null, {}, { enforcement: 'bogus' }]));
});
