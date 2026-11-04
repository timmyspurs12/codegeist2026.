import test from 'node:test';
import assert from 'node:assert/strict';
import { createClosureValidator, extractIssueKey } from '../src/workflow.js';

const validatorWith = (ledger, opts = {}) => createClosureValidator({
  readLedger: async () => { if (opts.throw) throw new Error('kvs down'); return ledger; },
});

test('the issue key is read from either validator payload shape', () => {
  assert.equal(extractIssueKey({ issue: { key: 'REP-42' } }), 'REP-42');
  assert.equal(extractIssueKey({ issueKey: 'REP-42' }), 'REP-42');
  assert.equal(extractIssueKey({ nonsense: true }), null);
});

test('unresolved commitments refuse the transition with a written reason', async () => {
  const res = await validatorWith({ rev: 1, commitments: [{ code: 'CM-1', status: 'open', owner: null, dueAt: null }] })({ issue: { key: 'REP-1' } });
  assert.equal(res.result, false);
  assert.match(res.errorMessage, /1 unresolved commitment/);
});

test('a cleared ledger lets the transition through', async () => {
  const res = await validatorWith({ rev: 2, commitments: [{ code: 'CM-1', status: 'verified' }] })({ issue: { key: 'REP-1' } });
  assert.deepEqual(res, { result: true });
});

test('an untracked issue is not blocked', async () => {
  const res = await validatorWith(null)({ issue: { key: 'REP-1' } });
  assert.deepEqual(res, { result: true });
});

test('a storage failure blocks rather than allows', async () => {
  const res = await validatorWith(null, { throw: true })({ issue: { key: 'REP-1' } });
  assert.equal(res.result, false);
  assert.match(res.errorMessage, /could not read/i);
});

test('an unparseable payload blocks rather than guessing an issue', async () => {
  const res = await validatorWith({ rev: 0, commitments: [] })({});
  assert.equal(res.result, false);
});

test('the validator never throws, whatever the ledger contains', async () => {
  const res = await validatorWith({ rev: 1, commitments: undefined })({ issue: { key: 'REP-1' } });
  assert.equal(res.result, true);
});
