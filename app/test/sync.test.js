import test from 'node:test';
import assert from 'node:assert/strict';
import { resyncAll, syncIssue, writeGuardProjection } from '../src/sync.js';

function fakeIo({ ledger, projection = null, failField = false, failProjection = false, failState = false } = {}) {
  const state = {
    projection,
    field: projection?.open ?? null,
    fieldState: ledger?.state ?? null,
    writes: { projection: 0, field: 0, state: 0 },
  };
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
    writeState: async (_key, v) => {
      if (failState) throw new Error('state_field_write_failed');
      state.writes.state += 1;
      state.fieldState = v;
    },
    readState: async () => state.fieldState,
  };
}

const record = (rev, commitments, state = 'managed') => ({
  version: 2, rev, issueKey: 'REP-1', state, updatedAt: '2026-11-01T00:00:00.000Z', commitments,
});
const now = new Date('2026-11-01T00:00:10.000Z');

test('a missing projection is written from the record and both fields are read back', async () => {
  const io = fakeIo({ ledger: record(3, [{ code: 'CM-1', status: 'open', owner: 'a', dueAt: null }]) });
  const res = await syncIssue(io, 'REP-1', { now });
  assert.equal(res.status, 'wrote');
  assert.equal(io.state.projection.ledgerRev, 3);
  assert.equal(io.state.field, 1);
  assert.equal(io.state.fieldState, 'managed');
});

test('a fresh, matching projection and fields are not rewritten', async () => {
  const l = record(3, [{ code: 'CM-1', status: 'open', owner: 'a', dueAt: null }]);
  const projection = { ledgerRev: 3, open: 1, overdue: 0, unowned: 0, awaitingReview: 0, updatedAt: now.toISOString() };
  const io = fakeIo({ ledger: l, projection });
  const res = await syncIssue(io, 'REP-1', { now });
  assert.equal(res.status, 'fresh');
  assert.equal(io.state.writes.projection, 0);
});

test('a state field that has drifted is repaired even when the count is right', async () => {
  const l = record(3, [], 'unmanaged');
  const projection = { ledgerRev: 3, open: 0, overdue: 0, unowned: 0, awaitingReview: 0, updatedAt: now.toISOString() };
  const io = fakeIo({ ledger: l, projection });
  io.state.fieldState = 'managed';

  const res = await syncIssue(io, 'REP-1', { now });
  assert.equal(res.status, 'wrote');
  assert.equal(io.state.fieldState, 'unmanaged');
  assert.equal(io.state.writes.state, 1);
});

test('a field write that does not stick fails loudly', async () => {
  const io = fakeIo({ ledger: record(1, [{ code: 'CM-1', status: 'open', owner: null, dueAt: null }]), failField: true });
  await assert.rejects(() => syncIssue(io, 'REP-1', { now }), /field_write_failed/);
});

test('a state field write that does not stick fails loudly', async () => {
  const io = fakeIo({ ledger: record(1, [], 'unmanaged'), failState: true });
  await assert.rejects(() => syncIssue(io, 'REP-1', { now }), /state_field_write_failed/);
});

test('a projection write that silently no-ops is caught by read-back', async () => {
  const io = fakeIo({ ledger: record(2, [{ code: 'CM-1', status: 'open', owner: null, dueAt: null }]) });
  io.writeProjection = async () => { /* writes nothing */ };
  await assert.rejects(() => syncIssue(io, 'REP-1', { now }), /projection_write_unverified/);
});

test('an issue with no record is reported, not given an empty one', async () => {
  const io = fakeIo({ ledger: null });
  const res = await syncIssue(io, 'REP-1', { now });
  assert.equal(res.status, 'no_ledger');
  assert.equal(res.wrote, false);
  assert.equal(io.state.writes.projection, 0);
});

test('a batch repair names the cases it could not fix, and never counts no-record as repaired', async () => {
  const io = fakeIo({ ledger: record(1, []) });
  io.readLedger = async (key) => (key === 'REP-9' ? null : record(1, []));
  const out = await resyncAll(io, ['REP-1', 'REP-9'], { now });
  assert.equal(out.attempted, 2);
  assert.equal(out.repaired, 1);
  assert.deepEqual(out.noRecord, ['REP-9'], 'no record is reported, not silently in step');
});

test('the guard moves the state to initializing as well as raising the count', async () => {
  const planned = record(2, [{ code: 'CM-1', status: 'proposed', owner: null, dueAt: null }]);
  const io = fakeIo({ ledger: record(1, [], 'unmanaged') });
  io.state.fieldState = 'unmanaged';

  await writeGuardProjection(io, 'REP-1', planned, { open: 1 }, now);

  assert.equal(io.state.fieldState, 'initializing');
  assert.equal(io.state.field, 1);
  assert.equal(io.state.projection.guard, true);
});
