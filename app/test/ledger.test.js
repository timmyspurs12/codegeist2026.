import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMutation, counts, emptyLedger, isOverdue, isUnresolved } from '../src/ledger.js';

const base = () => ({
  ...emptyLedger('REP-1', '2026-11-01T00:00:00.000Z'),
  commitments: [
    { code: 'CM-1', status: 'open', owner: 'acc-1', dueAt: '2026-10-30T00:00:00.000Z' },
    { code: 'CM-2', status: 'open', owner: null, dueAt: null },
    { code: 'CM-3', status: 'proposed', owner: null, dueAt: null },
    { code: 'CM-4', status: 'verified', owner: 'acc-1', dueAt: null },
    { code: 'CM-5', status: 'dropped', owner: null, dueAt: null },
  ],
});

test('only open and proposed commitments are unresolved', () => {
  assert.equal(isUnresolved({ status: 'open' }), true);
  assert.equal(isUnresolved({ status: 'proposed' }), true);
  assert.equal(isUnresolved({ status: 'verified' }), false);
  assert.equal(isUnresolved({ status: 'dropped' }), false);
});

test('counts separate overdue, unowned and awaiting-review work', () => {
  const c = counts(base(), new Date('2026-11-02T00:00:00.000Z').getTime());
  assert.deepEqual(c, { open: 3, overdue: 1, unowned: 1, awaitingReview: 1 });
});

test('a commitment due exactly now is not yet overdue', () => {
  const c = { dueAt: '2026-11-02T00:00:00.000Z' };
  assert.equal(isOverdue(c, new Date('2026-11-02T00:00:00.000Z').getTime()), false);
  assert.equal(isOverdue(c, new Date('2026-11-02T00:00:01.000Z').getTime()), true);
});

test('a mutation must name the revision it read', () => {
  const ledger = base();
  const next = applyMutation(ledger, 0, (l) => ({ ...l, commitments: l.commitments.map((c) => (c.code === 'CM-2' ? { ...c, owner: 'acc-2' } : c)) }));
  assert.equal(next.rev, 1);
  assert.equal(next.commitments.find((c) => c.code === 'CM-2').owner, 'acc-2');
  assert.equal(ledger.commitments.find((c) => c.code === 'CM-2').owner, null, 'input ledger is not mutated');
});

test('a second writer holding a stale revision is refused, not merged', () => {
  const ledger = base();
  const afterFirst = applyMutation(ledger, 0, (l) => l);
  assert.throws(() => applyMutation(afterFirst, 0, (l) => l), /revision_conflict/);
});

test('applying to a missing ledger throws rather than inventing one', () => {
  assert.throws(() => applyMutation(null, 0, (l) => l), /ledger_missing/);
});
