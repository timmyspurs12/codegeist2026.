import test from 'node:test';
import assert from 'node:assert/strict';
import { blockMessage, customerFacingExplanation, decideClosure, decideGate } from '../src/gate.js';

const record = (commitments, state = 'managed') => ({
  version: 2, rev: 4, issueKey: 'REP-1', state, updatedAt: '2026-11-01T00:00:00.000Z', commitments,
});
const projection = (rev, updatedAt = '2026-11-01T00:00:00.000Z') => ({ ledgerRev: rev, updatedAt, open: 0 });
const nowMs = new Date('2026-11-01T00:01:00.000Z').getTime();

test('a case with no record is withheld, not permitted', () => {
  // The brief is explicit: missing must never be read as unmanaged. This is the
  // fail-open P2.1 had.
  const d = decideClosure({ ledger: null, projection: null, nowMs });
  assert.equal(d.allow, false);
  assert.equal(d.code, 'unknown_state');
  assert.match(d.message, /no management state/i);
});

test('an unmanaged case is permitted, whatever its record still holds', () => {
  const d = decideClosure({ ledger: record([{ code: 'CM-1', status: 'open', owner: null, dueAt: null }], 'unmanaged'), nowMs });
  assert.equal(d.allow, true);
  assert.equal(d.code, 'unmanaged');
  assert.equal(d.message, null);
});

test('an initialising case is withheld even with no commitments', () => {
  const d = decideClosure({ ledger: record([], 'initializing'), nowMs });
  assert.equal(d.allow, false);
  assert.equal(d.code, 'initializing');
  assert.match(d.message, /initialising/i);
});

test('a managed case with open commitments is blocked, with the reason in the message', () => {
  const d = decideClosure({
    ledger: record([
      { code: 'CM-1', text: 'Fit the part', status: 'open', owner: 'a', dueAt: '2026-10-01T00:00:00.000Z' },
      { code: 'CM-2', text: 'Call the tenant', status: 'open', owner: null, dueAt: null },
    ]),
    projection: projection(4),
    nowMs,
  });
  assert.equal(d.allow, false);
  assert.equal(d.code, 'blocked');
  assert.match(d.message, /2 unresolved commitments/);
  assert.match(d.message, /1 overdue/);
  assert.match(d.message, /1 without an owner/);
});

test('a managed case whose commitments are all verified or dropped may close', () => {
  const d = decideClosure({
    ledger: record([
      { code: 'CM-1', status: 'verified', owner: 'a', dueAt: null },
      { code: 'CM-2', status: 'dropped', owner: null, dueAt: null },
    ]),
    projection: projection(4),
    nowMs,
  });
  assert.equal(d.allow, true);
  assert.equal(d.code, 'clear');
  assert.equal(d.message, null);
});

test('an unrecognised state is withheld rather than guessed', () => {
  for (const state of [null, undefined, '', 'MANAGED', 'paused', 0]) {
    // `undefined` must reach the decision as an absent state, not as "use the
    // record's default"; the record itself is what carries it in production.
    const ledger = state === undefined ? { ...record([]), state: undefined } : record([], state);
    const d = decideClosure({ ledger, nowMs });
    assert.equal(d.allow, false, `state ${String(state)} must not permit`);
    assert.equal(d.code, 'unknown_state');
  }
});

test('a stale projection is reported without turning a permitted closure into a block', () => {
  const d = decideClosure({ ledger: record([{ code: 'CM-1', status: 'verified' }]), projection: projection(2), nowMs });
  assert.equal(d.allow, true);
  assert.equal(d.stale, true, 'the caller can see the projection is behind');
});

test('P2.1 callers still get one policy through decideGate', () => {
  const d = decideGate(record([]), projection(4), { nowMs });
  assert.equal(d.allow, true);
  assert.equal(d.code, 'clear');
});

test('sing/plural wording does not turn into "1 commitments"', () => {
  assert.match(blockMessage({ open: 1, overdue: 0, unowned: 0, awaitingReview: 0 }), /1 unresolved commitment\./);
});

test('the customer explanation lists the promises rather than a code', () => {
  const text = customerFacingExplanation(record([
    { code: 'CM-1', text: 'Fit the replacement extractor', status: 'open', owner: 'a', dueAt: null },
    { code: 'CM-2', text: 'Send written update', status: 'proposed', owner: null, dueAt: null },
  ]));
  assert.match(text, /Fit the replacement extractor/);
  assert.match(text, /no owner yet/);
});
