import test from 'node:test';
import assert from 'node:assert/strict';
import { resyncAll, syncIssue } from '../src/sync.js';

function fakeIo({ ledger, projection = null, failField = false, failProjection = false } = {}) {
  const state = { projection, field: projection?.open ?? null, writes: { projection: 0, field: 0 } };
  return {
    state,
    readLedger: async () => ledger,
    readProjection: async () => state.projection,
    writeProjection: async (_key, p) => {
      if (failProjection) throw new Error('projection_write_failed');
      state.writes.projection += 1;
      state.projection = p;
    },
    writeField: async (_key, v) => {
      if (failField) throw new Error('field_write_failed');
      state.writes.field += 1;
      state.field = v;
    },
    readField: async () => state.field,
  };
}

const ledger = (rev, commitments) => ({ version: 1, rev, issueKey: 'REP-1', updatedAt: '2026-11-01T00:00:00.000Z', commitments });
const now = new Date('2026-11-01T00:00:10.000Z');

test('a missing projection is written from the ledger and read back', async () => {
  const io = fakeIo({ ledger: ledger(3, [{ code: 'CM-1', status: 'open', owner: 'a', dueAt: null }]) });
  const res = await syncIssue(io, 'REP-1', { now });
  assert.equal(res.status, 'wrote');
  assert.equal(io.state.projection.ledgerRev, 3);
  assert.equal(io.state.field, 1);
});

test('a fresh, matching projection is not rewritten', async () => {
  const l = ledger(3, [{ code: 'CM-1', status: 'open', owner: 'a', dueAt: null }]);
  const projection = { ledgerRev: 3, open: 1, overdue: 0, unowned: 0, awaitingReview: 0, updatedAt: now.toISOString() };
  const io = fakeIo({ ledger: l, projection });
  const res = await syncIssue(io, 'REP-1', { now });
  assert.equal(res.status, 'fresh');
  assert.equal(io.state.writes.projection, 0);
});

test('a field write that does not stick fails loudly', async () => {
  const io = fakeIo({ ledger: ledger(1, [{ code: 'CM-1', status: 'open', owner: null, dueAt: null }]), failField: true });
  await assert.rejects(() => syncIssue(io, 'REP-1', { now }), /field_write_failed/);
});

test('a projection write that silently no-ops is caught by read-back', async () => {
  const io = fakeIo({ ledger: ledger(2, [{ code: 'CM-1', status: 'open', owner: null, dueAt: null }]) });
  io.writeProjection = async () => { /* writes nothing */ };
  await assert.rejects(() => syncIssue(io, 'REP-1', { now }), /projection_write_unverified/);
});

test('an issue with no ledger is reported, not given an empty one', async () => {
  const io = fakeIo({ ledger: null });
  const res = await syncIssue(io, 'REP-1', { now });
  assert.equal(res.status, 'no_ledger');
  assert.equal(io.state.writes.projection, 0);
});

test('a batch repair names the cases it could not fix', async () => {
  const io = fakeIo({ ledger: ledger(1, []) });
  io.readLedger = async (key) => (key === 'REP-9' ? null : ledger(1, []));
  const out = await resyncAll(io, ['REP-1', 'REP-9'], { now });
  assert.equal(out.attempted, 2);
  assert.equal(out.repaired, 1);
  assert.equal(out.failed.length, 0, 'no ledger is a status, not a failure');
});
