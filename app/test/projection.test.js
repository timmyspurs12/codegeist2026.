import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjection, conditionExpression, isStale } from '../src/projection.js';

const ledger = { rev: 7, updatedAt: '2026-11-01T00:00:00.000Z' };
const nowMs = new Date('2026-11-01T00:01:00.000Z').getTime();

test('the projection records which ledger revision it came from', () => {
  const p = buildProjection(ledger, { open: 2, overdue: 1, unowned: 0, awaitingReview: 1 }, '2026-11-01T00:00:30.000Z');
  assert.equal(p.ledgerRev, 7);
  assert.equal(p.open, 2);
});

test('a missing projection is stale, and says so specifically', () => {
  assert.deepEqual(isStale(null, ledger, { nowMs }), { stale: true, reason: 'missing' });
});

test('a projection from an older revision is stale', () => {
  assert.equal(isStale({ ledgerRev: 6, updatedAt: '2026-11-01T00:00:30.000Z' }, ledger, { nowMs }).reason, 'rev_mismatch');
});

test('a projection older than five minutes is stale even if the revision matches', () => {
  const old = new Date('2026-10-31T23:00:00.000Z').toISOString();
  assert.equal(isStale({ ledgerRev: 7, updatedAt: old }, ledger, { nowMs }).reason, 'expired');
});

test('a fresh matching projection is not stale', () => {
  assert.deepEqual(isStale({ ledgerRev: 7, updatedAt: '2026-11-01T00:00:30.000Z' }, ledger, { nowMs }), { stale: false, reason: null });
});

test('the condition expression reads a numeric field and compares to zero', () => {
  assert.equal(conditionExpression('customfield_10123'), 'issue.customfield_10123 == 0');
});
