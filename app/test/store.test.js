import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, keyOf, RevisionConflict } from '../src/store.js';
import { createMemoryStorage } from './support/fake-forge.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');
const clock = () => NOW;

test('a mutation bumps the revision and is read back', async () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, now: clock });

  const res = await store.mutateLedger('FS-101', (ledger) => [
    ...ledger.commitments,
    { code: 'CM-1', status: 'proposed' },
  ]);

  assert.equal(res.changed, true);
  assert.equal(res.ledger.rev, 1);
  assert.equal((await store.readLedger('FS-101')).commitments.length, 1);
});

test('a mutator returning null is a no-op and writes nothing', async () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, now: clock });
  await store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-1' }]);

  const before = await store.readLedger('FS-101');
  const res = await store.mutateLedger('FS-101', () => null);
  const after = await store.readLedger('FS-101');

  assert.equal(res.changed, false);
  assert.equal(after.rev, before.rev, 'a no-op must not burn a revision');
});

test('a write that silently does not land is detected and retried', async () => {
  const storage = createMemoryStorage({ dropWrites: 1 });
  const store = createStore({ storage, now: clock });

  const res = await store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-1' }], { attempts: 3 });

  assert.equal(res.changed, true);
  assert.ok(res.attempts >= 2, 'the dropped write should have forced a retry');
  assert.equal((await store.readLedger('FS-101')).rev, 1);
});

test('a storage that keeps failing raises instead of pretending to save', async () => {
  const storage = createMemoryStorage({ failOn: (key) => key === keyOf.ledger('FS-101') });
  const store = createStore({ storage, now: clock });

  await assert.rejects(
    () => store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-1' }], { attempts: 2 }),
    /storage_failure/,
  );
  assert.equal(await store.readLedger('FS-101'), null, 'nothing was written');
});

test('two mutations started together both land: the lock serialises them', async () => {
  // A storage that yields between read and write, so two in-flight mutations
  // genuinely interleave rather than running to completion one after another.
  const storage = createMemoryStorage();
  const baseGet = storage.get.bind(storage);
  const baseSet = storage.set.bind(storage);
  storage.get = async (key) => { await new Promise((r) => setTimeout(r, 1)); return baseGet(key); };
  storage.set = async (key, value) => { await new Promise((r) => setTimeout(r, 1)); return baseSet(key, value); };

  const store = createStore({ storage, now: clock });
  await Promise.all([
    store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-1', status: 'open' }]),
    store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-2', status: 'open' }]),
  ]);

  const ledger = await store.readLedger('FS-101');
  assert.deepEqual(ledger.commitments.map((c) => c.code).sort(), ['CM-1', 'CM-2'], 'neither write was lost');
  assert.equal(ledger.rev, 2);
});

test('a lock left behind by a crash expires instead of wedging the issue', async () => {
  const storage = createMemoryStorage();
  await storage.set('relay:lock:FS-101', { token: 'dead', expiresAt: Date.now() - 1 });
  const store = createStore({ storage, now: clock, wait: async () => {} });

  const res = await store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-1' }]);
  assert.equal(res.changed, true);
});

test('audit events are idempotent by id', async () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, now: clock });
  const event = { id: 'accepted:FS-101:CM-1:2', at: NOW.toISOString(), type: 'accepted', issueKey: 'FS-101', summary: 'x', detail: null };

  const first = await store.recordEvent(event);
  const second = await store.recordEvent(event);

  assert.equal(first.appended, true);
  assert.equal(second.appended, false);
  assert.equal((await store.readAudit('FS-101')).events.length, 1);
});

test('tracking is a set, and settings merge rather than replace', async () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, now: clock });

  await store.track('FS-101');
  await store.track('FS-101');
  await store.track('FS-102');
  assert.deepEqual((await store.tracked()).map((t) => t.key), ['FS-101', 'FS-102']);

  await store.saveSettings({ closureExpressionApplied: 'issue.customfield_10077 == 0' });
  const merged = await store.saveSettings({ capture: { confidenceThreshold: 0.7 } });

  assert.equal(merged.closureExpressionApplied, 'issue.customfield_10077 == 0');
  assert.equal(merged.capture.confidenceThreshold, 0.7);
  assert.equal(merged.capture.requireOwner, true, 'untouched capture defaults survive');
});
