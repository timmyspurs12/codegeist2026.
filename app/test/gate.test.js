import test from 'node:test';
import assert from 'node:assert/strict';
import { blockMessage, customerFacingExplanation, decideGate } from '../src/gate.js';

const ledger = (commitments) => ({ version: 1, rev: 4, issueKey: 'REP-1', updatedAt: '2026-11-01T00:00:00.000Z', commitments });
const projection = (rev, updatedAt = '2026-11-01T00:00:00.000Z') => ({ ledgerRev: rev, updatedAt, open: 0 });
const nowMs = new Date('2026-11-01T00:01:00.000Z').getTime();

test('an unreadable ledger blocks the closure instead of allowing it', () => {
  const d = decideGate(null, null, { nowMs });
  assert.equal(d.allow, false);
  assert.equal(d.code, 'unavailable');
  assert.match(d.message, /could not read/i);
});

test('open commitments block, with the reason in the message', () => {
  const d = decideGate(ledger([
    { code: 'CM-1', text: 'Fit the part', status: 'open', owner: 'a', dueAt: '2026-10-01T00:00:00.000Z' },
    { code: 'CM-2', text: 'Call the tenant', status: 'open', owner: null, dueAt: null },
  ]), projection(4), { nowMs });
  assert.equal(d.allow, false);
  assert.equal(d.code, 'blocked');
  assert.match(d.message, /2 unresolved commitments/);
  assert.match(d.message, /1 overdue/);
  assert.match(d.message, /1 without an owner/);
});

test('a case whose commitments are all verified or dropped may close', () => {
  const d = decideGate(ledger([
    { code: 'CM-1', status: 'verified', owner: 'a', dueAt: null },
    { code: 'CM-2', status: 'dropped', owner: null, dueAt: null },
  ]), projection(4), { nowMs });
  assert.equal(d.allow, true);
  assert.equal(d.message, null);
});

test('a stale projection is reported without turning a permitted closure into a block', () => {
  const d = decideGate(ledger([{ code: 'CM-1', status: 'verified' }]), projection(2), { nowMs });
  assert.equal(d.allow, true);
  assert.equal(d.stale, true, 'the caller can see the projection is behind');
});

test('sing/plural wording does not turn into "1 commitments"', () => {
  assert.match(blockMessage({ open: 1, overdue: 0, unowned: 0, awaitingReview: 0 }), /1 unresolved commitment\./);
});

test('the customer explanation lists the promises rather than a code', () => {
  const text = customerFacingExplanation(ledger([
    { code: 'CM-1', text: 'Fit the replacement extractor', status: 'open', owner: 'a', dueAt: null },
    { code: 'CM-2', text: 'Send written update', status: 'proposed', owner: null, dueAt: null },
  ]));
  assert.match(text, /Fit the replacement extractor/);
  assert.match(text, /no owner yet/);
});
