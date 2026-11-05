import test from 'node:test';
import assert from 'node:assert/strict';
import { createClosureValidator, extractIssueKey } from '../src/workflow.js';

const validatorWith = (ledger, opts = {}) => createClosureValidator({
  readLedger: async () => { if (opts.throw) throw new Error('kvs down'); return ledger; },
});

const rec = (state, commitments = []) => ({ rev: 1, issueKey: 'REP-1', state, commitments });

test('the issue key is read from either validator payload shape', () => {
  assert.equal(extractIssueKey({ issue: { key: 'REP-42' } }), 'REP-42');
  assert.equal(extractIssueKey({ issueKey: 'REP-42' }), 'REP-42');
  assert.equal(extractIssueKey({ nonsense: true }), null);
});

test('an unmanaged issue is not blocked', async () => {
  const res = await validatorWith(rec('unmanaged'))({ issue: { key: 'REP-1' } });
  assert.deepEqual(res, { result: true });
});

test('an unmanaged issue is not blocked even if its old ledger still holds work', async () => {
  const res = await validatorWith(rec('unmanaged', [{ code: 'CM-1', status: 'open', owner: null, dueAt: null }]))({ issue: { key: 'REP-1' } });
  assert.deepEqual(res, { result: true });
});

test('unresolved commitments refuse the transition with a written reason', async () => {
  const res = await validatorWith(rec('managed', [{ code: 'CM-1', status: 'open', owner: null, dueAt: null }]))({ issue: { key: 'REP-1' } });
  assert.equal(res.result, false);
  assert.match(res.errorMessage, /1 unresolved commitment/);
});

test('a cleared managed issue lets the transition through', async () => {
  const res = await validatorWith(rec('managed', [{ code: 'CM-1', status: 'verified' }]))({ issue: { key: 'REP-1' } });
  assert.deepEqual(res, { result: true });
});

test('an initialising issue is withheld', async () => {
  const res = await validatorWith(rec('initializing'))({ issue: { key: 'REP-1' } });
  assert.equal(res.result, false);
  assert.match(res.errorMessage, /initialising/i);
});

test('an issue with no record is withheld, and the message says what to do', async () => {
  const res = await validatorWith(null)({ issue: { key: 'REP-1' } });
  assert.equal(res.result, false);
  assert.match(res.errorMessage, /backfill/i);
});

test('a record with no state is withheld', async () => {
  const res = await validatorWith({ rev: 1, issueKey: 'REP-1', commitments: [] })({ issue: { key: 'REP-1' } });
  assert.equal(res.result, false);
  assert.equal(res.result, false);
});

test('a storage failure blocks rather than allows', async () => {
  const res = await validatorWith(null, { throw: true })({ issue: { key: 'REP-1' } });
  assert.equal(res.result, false);
  assert.match(res.errorMessage, /could not read/i);
});

test('an unparseable payload blocks rather than guessing an issue', async () => {
  const res = await validatorWith(rec('managed'))({});
  assert.equal(res.result, false);
});

test('the validator never throws, whatever the record contains', async () => {
  const res = await validatorWith({ rev: 1, state: 'managed', commitments: undefined })({ issue: { key: 'REP-1' } });
  assert.equal(res.result, true);
});
