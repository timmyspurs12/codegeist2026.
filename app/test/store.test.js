import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, keyOf, RecordStoreMissing } from '../src/store.js';
import { digestOf } from '../src/ledger.js';
import { createMemoryRecords, createMemoryStorage, interleaver } from './support/fake-forge.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');
const clock = () => NOW;

const build = (overrides = {}) => {
  const storage = overrides.storage ?? createMemoryStorage();
  const records = overrides.records ?? createMemoryRecords();
  const store = createStore({ storage, records, now: clock, wait: async () => {}, log: overrides.log });
  return { store, storage, records };
};

test('a store without conditional records refuses to exist', () => {
  // A plain key/value store cannot commit a ledger safely, and P2.1's advisory
  // lock was the pretence that it could. Missing wiring must fail here, not on
  // the first mutation.
  assert.throws(() => createStore({ storage: createMemoryStorage() }), RecordStoreMissing);
});

test('a mutation commits conditionally, bumps the revision, and is read back', async () => {
  const { store, records } = build();

  const res = await store.mutateLedger('FS-101', (ledger) => [
    ...ledger.commitments,
    { code: 'CM-1', status: 'proposed' },
  ]);

  assert.equal(res.changed, true);
  assert.equal(res.ledger.rev, 1);
  assert.equal(records.commits.length, 1);
  assert.equal(records.commits[0].op, 'create', 'the first commit creates the record');
  assert.equal((await store.readLedger('FS-101')).commitments.length, 1);
});

test('a mutator returning null is a no-op and writes nothing', async () => {
  const { store, records } = build();
  await store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-1', status: 'open' }]);
  const before = await store.readLedger('FS-101');

  const res = await store.mutateLedger('FS-101', () => null);

  assert.equal(res.changed, false);
  assert.equal((await store.readLedger('FS-101')).rev, before.rev, 'a no-op must not burn a revision');
  assert.equal(records.commits.length, 1);
});

test('two writers paused between read and commit: the loser retries against the winner', async () => {
  // This is the interleaving the advisory lock was supposed to prevent and
  // could not. Writer A reads rev 0 and is paused *before* its commit; writer B
  // commits rev 1; A then commits and the condition fails, so A re-reads and
  // re-applies on top of B. Nothing is lost.
  const records = createMemoryRecords();
  const gate = interleaver();
  let paused = false;
  records.hooks.beforeCommit = async ({ op }) => {
    if (op === 'update' && !paused) {
      paused = true;
      await gate.pause();
    }
  };

  const storage = createMemoryStorage();
  const store = createStore({ storage, records, now: clock, wait: async () => {} });

  // Seed rev 1 so both writers take the `update` path.
  await store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-0', status: 'open' }]);

  const a = store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-1', status: 'open' }]);
  // Wait until A is paused immediately before its commit, then let B go first.
  await gate.reached;
  const b = store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-2', status: 'open' }]);
  const bRes = await b;
  gate.release();

  const aRes = await a;

  const ledger = await store.readLedger('FS-101');
  assert.deepEqual(ledger.commitments.map((c) => c.code).sort(), ['CM-0', 'CM-1', 'CM-2'], 'neither write was lost');
  assert.equal(ledger.rev, 3);
  assert.ok(aRes.attempts >= 2, 'A had to re-read and retry');
  assert.ok(bRes.attempts >= 1);
  assert.ok(records.hooks.conflicts >= 1, 'the fake rejected a stale conditional commit');
});

test('a stale update is never accepted: the second writer re-derives from fresh state', async () => {
  const records = createMemoryRecords();
  const storage = createMemoryStorage();
  const store = createStore({ storage, records, now: clock, wait: async () => {} });

  await store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-1', status: 'open' }]);
  // Force one conflict: the record is bumped behind the store's back.
  const original = records.hooks.beforeCommit;
  let forced = false;
  records.hooks.beforeCommit = async (info) => {
    if (original) await original(info);
    if (!forced && info.op === 'update') {
      forced = true;
      const current = records.map.get('FS-101');
      // A rival Relay writes a *well-formed* record: its own revision, a real
      // commitment, and a digest that describes what it wrote. Anything less
      // would be corruption, which the read path now refuses outright.
      const commitments = [...current.commitments, { code: 'RIVAL', status: 'open' }];
      records.map.set('FS-101', { ...current, rev: current.rev + 1, commitments, digest: digestOf(commitments) });
    }
  };

  const res = await store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-2', status: 'open' }]);

  assert.equal(res.changed, true);
  assert.ok(res.conflicts >= 1);
  const codes = (await store.readLedger('FS-101')).commitments.map((c) => c.code);
  assert.ok(codes.includes('RIVAL'), 'the rival write survived');
  assert.ok(codes.includes('CM-2'), 'our write landed on top of it');
});

test('a storage failure raises instead of pretending to save', async () => {
  const records = createMemoryRecords();
  const original = records.update;
  records.update = async () => { throw new Error('storage_failure:relay-ledger'); };
  const store = createStore({ storage: createMemoryStorage(), records, now: clock, wait: async () => {} });

  // Seed without the failing update.
  const seed = await store.initialise('FS-101', { state: 'unmanaged' });
  assert.equal(seed.created, true);

  await assert.rejects(
    () => store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-1', status: 'open' }], { attempts: 2 }),
    /storage_failure/,
  );
  assert.equal((await store.readLedger('FS-101')).commitments.length, 0);
  assert.equal(original.name, 'update');
});

test('create is create-only: two simultaneous initialisations produce one record', async () => {
  const { store, records } = build();
  const first = await store.initialise('FS-101', { state: 'unmanaged' });
  const second = await store.initialise('FS-101', { state: 'managed' });

  assert.equal(first.created, true);
  assert.equal(second.created, false, 'the loser adopts the winner');
  assert.equal(second.record.state, 'unmanaged', 'and does not overwrite it');
  assert.equal(records.commits.length, 1);
});

test('a state change is a conditional write and bumps the revision', async () => {
  const { store, records } = build();
  await store.initialise('FS-101', { state: 'initializing' });

  const res = await store.setState('FS-101', 'managed');
  assert.equal(res.changed, true);
  assert.equal(res.record.rev, 1);
  assert.equal(res.record.state, 'managed');

  const again = await store.setState('FS-101', 'managed');
  assert.equal(again.changed, false, 'already there is a no-op');

  const missing = await store.setState('FS-999', 'managed');
  assert.equal(missing.record, null, 'a state change never creates a record');
  assert.equal(await store.readLedger('FS-999'), null);
  assert.equal(records.commits.length, 2, 'one create, one conditional update — and nothing for the missing issue');
});

test('audit appends are create-only and never read-modify-write', async () => {
  const { store, storage } = build();
  const event = { id: 'accepted:FS-101:CM-1:2', at: NOW.toISOString(), type: 'accepted', issueKey: 'FS-101', summary: 'x', detail: null };

  const first = await store.recordEvent(event);
  const second = await store.recordEvent(event);

  assert.equal(first.appended, true);
  assert.equal(second.appended, false);
  assert.equal(second.duplicate, true);

  const auditCalls = storage.calls.filter(([, key]) => String(key).startsWith(keyOf.audit('FS-101')));
  assert.equal(auditCalls.filter(([op]) => op === 'get').length, 1, 'only the read-back, never a read before the write');
  const writes = auditCalls.filter(([op]) => op === 'set');
  assert.ok(writes.every(([, , options]) => options?.keyPolicy === 'FAIL_IF_EXISTS'), 'every append is create-only');

  const page = await store.readAudit('FS-101');
  assert.equal(page.events.length, 1);
  assert.equal(page.truncated, false);
});

test('two concurrent audit appends both survive', async () => {
  const { store } = build();
  const base = { at: NOW.toISOString(), type: 'accepted', issueKey: 'FS-101', summary: 's', detail: null };
  await Promise.all([
    store.recordEvent({ ...base, id: 'a:FS-101:CM-1:2' }),
    store.recordEvent({ ...base, id: 'b:FS-101:CM-1:2' }),
  ]);
  const page = await store.readAudit('FS-101');
  assert.deepEqual(page.events.map((e) => e.id).sort(), ['a:FS-101:CM-1:2', 'b:FS-101:CM-1:2']);
});

test('the audit trail paginates instead of truncating', async () => {
  const { store } = build();
  for (let i = 0; i < 5; i += 1) {
    await store.recordEvent({ id: `e${i}`, at: `2026-11-04T09:0${i}:00.000Z`, type: 'accepted', issueKey: 'FS-101', summary: 's', detail: null });
  }
  const first = await store.readAudit('FS-101', { limit: 2 });
  assert.equal(first.events.length, 2);
  assert.ok(first.nextCursor, 'a cursor is returned when more remain');
  assert.equal(first.truncated, true);

  const second = await store.readAudit('FS-101', { limit: 10, cursor: first.nextCursor });
  const ids = new Set([...first.events, ...second.events].map((e) => e.id));
  assert.ok(ids.size >= 3);
});

test('tracking is a set, and settings merge rather than replace', async () => {
  const { store } = build();

  await store.track('FS-101');
  await store.track('FS-101');
  await store.track('FS-102');
  assert.deepEqual((await store.tracked()).map((t) => t.key), ['FS-101', 'FS-102']);

  await store.saveSettings({ closureExpressionApplied: '(issue.customfield_1 == "unmanaged")' });
  const merged = await store.saveSettings({ capture: { confidenceThreshold: 0.7 } });

  assert.equal(merged.closureExpressionApplied, '(issue.customfield_1 == "unmanaged")');
  assert.equal(merged.capture.confidenceThreshold, 0.7);
  assert.equal(merged.capture.requireOwner, true, 'untouched capture defaults survive');
  assert.equal(merged.stateFieldId, null, 'both field caches exist, unresolved by default');
});
