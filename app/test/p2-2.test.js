/**
 * P2.2 acceptance: management lifecycle, conditional commits, append-only
 * audit, reconciliation and the two enforcement paths.
 *
 * The concurrency tests here deliberately *interleave* two operations — a
 * writer is paused between its read and its commit, the other runs to
 * completion, then the first is released. `Promise.all` would let the fake
 * serialise them by luck and prove nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createHandlers, LifecycleError } from '../src/handlers.js';
import { createStore } from '../src/store.js';
import { emptyLedger } from '../src/ledger.js';
import { createClosureValidator } from '../src/workflow.js';
import { decideClosure } from '../src/gate.js';
import { evaluateClosureCondition } from '../src/field.js';
import {
  MODULE_TYPE_PREFIX, createFakeJira, createMemoryRecords, createMemoryStorage, forgeContext, interleaver, rawComment, rawIssue,
} from './support/fake-forge.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');
const ctx = (key = 'FS-101') => ({ ...forgeContext(), extension: { issue: { key } } });

function site({ comments = [rawComment()], extraIssues = {}, issues = ['FS-101'] } = {}) {
  const storage = createMemoryStorage();
  const records = createMemoryRecords();
  const fake = createFakeJira({ issue: rawIssue(), extraIssues, comments, issues });
  const handlers = createHandlers({ jira: fake.jira, storage, records, now: () => NOW, log: () => {} });
  const store = createStore({ storage, records, now: () => NOW, log: () => {}, wait: async () => {} });
  return { storage, records, fake, handlers, store };
}

const validatorOn = (records) => createClosureValidator({ readLedger: (key) => records.read(key), log: () => {} });

/* ---------------------------------------------- 1–5: the closure contract */

test('1. an unmanaged issue is permitted by the validator and by the condition', async () => {
  const { records, store } = site();
  await store.initialise('FS-101', { state: 'unmanaged' });

  assert.deepEqual(await validatorOn(records)({ issue: { key: 'FS-101' } }), { result: true });
  assert.equal(evaluateClosureCondition({ state: 'unmanaged', count: 0 }).allow, true);
});

test('2. a managed issue with zero unresolved is permitted', async () => {
  const { records, store } = site();
  await store.initialise('FS-101', { state: 'managed' });
  assert.deepEqual(await validatorOn(records)({ issue: { key: 'FS-101' } }), { result: true });
  assert.equal(evaluateClosureCondition({ state: 'managed', count: 0 }).allow, true);
});

test('3. a managed issue with unresolved commitments is blocked, on both paths', async () => {
  const { records, store } = site();
  await store.initialise('FS-101', { state: 'managed' });
  await store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-1', status: 'open', owner: null, dueAt: null }]);

  const res = await validatorOn(records)({ issue: { key: 'FS-101' } });
  assert.equal(res.result, false);
  assert.match(res.errorMessage, /1 unresolved commitment/);
  assert.equal(evaluateClosureCondition({ state: 'managed', count: 1 }).allow, false);
});

test('4. an issue with no record is withheld — missing is never unmanaged', async () => {
  const { records } = site();
  const res = await validatorOn(records)({ issue: { key: 'FS-101' } });
  assert.equal(res.result, false);
  assert.match(res.errorMessage, /no management state/i);
  // And the expression mirror refuses the same inputs a missing field produces.
  assert.equal(evaluateClosureCondition({ state: null, count: 0 }).allow, false);
  assert.equal(evaluateClosureCondition({ state: 'unmanaged', count: 0 }, { stateExists: false }).allow, false);
});

test('5. an initialising issue is withheld on both paths', async () => {
  const { records, store } = site();
  await store.initialise('FS-101', { state: 'initializing' });
  const res = await validatorOn(records)({ issue: { key: 'FS-101' } });
  assert.equal(res.result, false);
  assert.match(res.errorMessage, /initialising/i);
  assert.equal(evaluateClosureCondition({ state: 'initializing', count: 0 }).allow, false);
});

test('6. extraction unavailable leaves the issue initialising, with the stage named', async () => {
  const { fake, records, store } = site();
  fake.state.commentsFail = true;
  const storeOk = await store.initialise('FS-101', { state: 'unmanaged' });
  assert.equal(storeOk.created, true);
  await store.track('FS-101');

  const handlers = createHandlers({ jira: fake.jira, storage: createMemoryStorage(), records, now: () => NOW, log: () => {} });
  const res = await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });

  assert.equal(res.track.status, 'failed');
  assert.equal(res.track.stage, 'capture');
  assert.equal((await records.read('FS-101')).state, 'initializing');
  const failed = res.track.steps.find((s) => s.stage === 'failed');
  assert.ok(failed, 'the sequence records where it stopped');
  assert.equal(failed.failedStage, 'capture');
});

/* -------------------------------------------- 7–11: the management lifecycle */

test('7. track settles as managed, and both fields agree with the record', async () => {
  const { handlers, fake, records } = site();
  await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx() });
  const res = await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });

  assert.equal(res.track.status, 'managed');
  const record = await records.read('FS-101');
  assert.equal(record.state, 'managed');
  assert.equal(fake.fields.state.value, 'managed');
  assert.equal(fake.fields.count.value, record.commitments.length);
});

test('8. tracking a managed issue refreshes it and captures nothing twice', async () => {
  const { handlers, records } = site();
  await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx() });
  await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });
  const before = await records.read('FS-101');

  const again = await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });

  assert.equal(again.track.status, 'already_managed');
  const after = await records.read('FS-101');
  assert.equal(after.commitments.length, before.commitments.length);
  assert.equal(after.state, 'managed');
});

test('9. untrack warns before it permits closure, and changes nothing without confirmation', async () => {
  const { handlers, fake, records } = site();
  await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx() });
  await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });

  const preview = await handlers['relay.workspace.untrack']({ payload: { key: 'FS-101' }, context: ctx() });
  assert.equal(preview.untrack.status, 'confirmation_required');
  assert.equal(preview.untrack.open, 1, 'it says how much is being left behind');
  assert.match(preview.untrack.message, /permits closure/);
  assert.equal((await records.read('FS-101')).state, 'managed');
  assert.equal(fake.fields.state.value, 'managed');
});

test('10. a confirmed untrack sets both sides to unmanaged and keeps the evidence', async () => {
  const { handlers, fake, records, storage } = site();
  await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx() });
  await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });

  const done = await handlers['relay.workspace.untrack']({
    payload: { key: 'FS-101', confirm: true, reason: 'Customer moved to a new request.' }, context: ctx(),
  });

  assert.equal(done.untrack.status, 'unmanaged');
  const record = await records.read('FS-101');
  assert.equal(record.state, 'unmanaged');
  assert.equal(record.commitments.length, 1, 'the ledger is kept as evidence');
  assert.equal(fake.fields.state.value, 'unmanaged');
  assert.ok((await storage.list('relay:audit:FS-101:', { limit: 50 })).items.some((e) => e.type === 'untracked'));
  assert.deepEqual(await validatorOn(records)({ issue: { key: 'FS-101' } }), { result: true });
});

test('11. the write order is fail-closed on both sides of a transition', async () => {
  const { handlers, fake, records } = site();
  await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx() });

  // A single ordered log across both stores.
  const order = [];
  const writeField = fake.jira.writeAppFieldValue;
  fake.jira.writeAppFieldValue = async (id, issueId, value) => {
    order.push(`field:${value}`);
    return writeField(id, issueId, value);
  };
  const create = records.create;
  records.create = async (key, rec) => { order.push(`create:${rec.state}`); return create(key, rec); };
  const update = records.update;
  records.update = async (key, rev, rec) => { order.push(`commit:${rec.state}`); return update(key, rev, rec); };

  await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });

  const firstManagedCommit = order.indexOf('commit:managed');
  const managedFieldWrite = order.indexOf('field:managed');
  assert.ok(order.indexOf('field:initializing') < firstManagedCommit, 'the field withholds before the record claims management');
  assert.ok(firstManagedCommit < managedFieldWrite, 'the record leads, and the field follows it — a failed field write stays blocked');

  order.length = 0;
  await handlers['relay.workspace.untrack']({ payload: { key: 'FS-101', confirm: true }, context: ctx() });
  assert.ok(order.indexOf('field:initializing') < order.indexOf('commit:unmanaged'), 'offboarding passes through initializing too');
});

/* ------------------------------------------- 12: the two paths cannot disagree */

test('12. for every state, the validator and the condition reach the same verdict', async () => {
  const cases = [
    { state: 'unmanaged', commitments: [], fields: { state: 'unmanaged', count: 5 } },
    { state: 'managed', commitments: [], fields: { state: 'managed', count: 0 } },
    { state: 'managed', commitments: [{ code: 'CM-1', status: 'open' }], fields: { state: 'managed', count: 1 } },
    { state: 'initializing', commitments: [], fields: { state: 'initializing', count: 0 } },
    { state: null, commitments: [], fields: { state: null, count: 0 } },
    { state: 'paused', commitments: [], fields: { state: 'paused', count: 0 } },
  ];

  for (const c of cases) {
    const ledger = { rev: 1, issueKey: 'FS-101', state: c.state, commitments: c.commitments };
    const decision = decideClosure({ ledger, nowMs: NOW.getTime() });
    const condition = evaluateClosureCondition(c.fields);
    assert.equal(condition.allow, decision.allow, `state ${String(c.state)} disagrees between the validator and the condition`);
  }
});

/* --------------------------------- 13–17: concurrency, revision, append-only */

test('13. two accepts interleaved: the loser retries and neither commitment is lost', async () => {
  const { records, store } = site();
  await store.initialise('FS-101', { state: 'managed' });
  await store.mutateLedger('FS-101', (l) => [...l.commitments,
    { code: 'CM-1', status: 'proposed' },
    { code: 'CM-2', status: 'proposed' },
  ]);

  const gate = interleaver();
  let paused = false;
  records.hooks.beforeCommit = async ({ op }) => {
    if (op === 'update' && !paused) { paused = true; await gate.pause(); }
  };

  const accept = (code) => store.mutateLedger('FS-101', (l) => l.commitments.map((c) => (c.code === code ? { ...c, status: 'open', owner: { id: 'acc-tom', name: 'Tom' } } : c)));

  const first = accept('CM-1');
  await gate.reached;
  const second = accept('CM-2');
  await second;
  gate.release();
  const firstRes = await first;

  const record = await records.read('FS-101');
  const byCode = Object.fromEntries(record.commitments.map((c) => [c.code, c.status]));
  assert.equal(byCode['CM-1'], 'open');
  assert.equal(byCode['CM-2'], 'open', 'the interleaved write survived');
  assert.ok(firstRes.attempts >= 2, 'the paused writer re-read and re-applied');
  assert.equal(records.hooks.conflicts >= 1, true);
});

test('14. tracking while an accept is in flight: the accept is refused, not applied to a half-managed issue', async () => {
  const { records, store } = site();
  await store.initialise('FS-101', { state: 'managed' });
  await store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-1', status: 'proposed' }]);

  // Flip the state to initializing as a rival track would, mid-flight.
  const gate = interleaver();
  let paused = false;
  records.hooks.beforeCommit = async ({ op }) => {
    if (op === 'update' && !paused) { paused = true; await gate.pause(); }
  };

  const accept = store.mutateLedger('FS-101', (l) => l.commitments.map((c) => ({ ...c, status: 'open' })));
  await gate.reached;
  await store.setState('FS-101', 'initializing');
  gate.release();
  await accept;

  const record = await records.read('FS-101');
  assert.equal(record.state, 'initializing', 'the record is withheld, whatever the commitment says');
  assert.equal(decideClosure({ ledger: record, nowMs: NOW.getTime() }).allow, false);
});

test('15. a stale conditional commit is rejected by the store, not applied', async () => {
  const { records } = site();
  // A real record: the store enforces declared attributes, a digest and an
  // updatedAt on every write, so a hand-made stub would be rejected (P2.2.2).
  const record = (rev) => ({ ...emptyLedger('FS-101', NOW.toISOString(), 'managed'), rev });
  await records.create('FS-101', record(0));
  await records.update('FS-101', 0, record(1));

  await assert.rejects(
    () => records.update('FS-101', 0, record(1)),
    (err) => err.name === 'RevisionConflict',
  );
  assert.equal((await records.read('FS-101')).rev, 1);
});

test('16. concurrent audit appends both land: the trail is not a rewritten array', async () => {
  const { store, storage } = site();
  const base = { at: NOW.toISOString(), type: 'accepted', issueKey: 'FS-101', summary: 's', detail: null };

  await Promise.all([
    store.recordEvent({ ...base, id: 'accepted:FS-101:CM-1:2' }),
    store.recordEvent({ ...base, id: 'accepted:FS-101:CM-2:3' }),
  ]);

  const page = await store.readAudit('FS-101');
  assert.deepEqual(page.events.map((e) => e.id).sort(), ['accepted:FS-101:CM-1:2', 'accepted:FS-101:CM-2:3']);
  const writes = storage.calls.filter(([op, key]) => op === 'set' && String(key).startsWith('relay:audit:'));
  assert.ok(writes.every(([, , options]) => options?.keyPolicy === 'FAIL_IF_EXISTS'));
  assert.equal(storage.calls.some(([op, key]) => op === 'get' && String(key).startsWith('relay:audit:')), true, 'only the read-backs');
});

test('17. a retried decision records one event, and the duplicate is reported', async () => {
  const { store } = site();
  const event = { id: 'verified:FS-101:CM-1:4', at: NOW.toISOString(), type: 'verified', issueKey: 'FS-101', summary: 's', detail: null };

  assert.equal((await store.recordEvent(event)).appended, true);
  const second = await store.recordEvent(event);
  assert.equal(second.appended, false);
  assert.equal(second.duplicate, true);
  assert.equal((await store.readAudit('FS-101')).events.length, 1);
});

/* ------------------------------------------ 18–20: reconciliation and coverage */

test('18. reconciliation reports each category rather than counting missing records as repaired', async () => {
  const extraIssues = {
    'FS-102': rawIssue({ key: 'FS-102', id: '10043' }),
    'FS-103': rawIssue({ key: 'FS-103', id: '10044' }),
    'FS-104': rawIssue({ key: 'FS-104', id: '10045' }),
    'FS-105': rawIssue({ key: 'FS-105', id: '10046' }),
  };
  const { handlers, fake, records, store } = site({ extraIssues });
  for (const key of ['FS-101', 'FS-102', 'FS-103', 'FS-104', 'FS-105']) await store.track(key);

  // FS-101: in sync. FS-102: managed but no fields written yet. FS-103: no
  // record. FS-104: initialising. FS-105: the store throws.
  await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx() });
  const synced = await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });
  assert.equal(synced.track.status, 'managed');

  await store.initialise('FS-102', { state: 'managed' });
  await store.initialise('FS-104', { state: 'initializing' });

  const read = records.read;
  records.read = async (key) => {
    if (key === 'FS-105') throw new Error('entity store unavailable');
    return read(key);
  };

  const report = await handlers['relay.field.reconcile']({ context: ctx() });

  assert.ok(report.report.inSync.includes('FS-101'), 'FS-101 needs nothing');
  assert.ok(report.report.repaired.some((r) => r.key === 'FS-102'), 'FS-102 was repaired');
  assert.deepEqual(report.report.noLedger, ['FS-103']);
  assert.deepEqual(report.report.initializing, ['FS-104']);
  assert.deepEqual(report.report.inaccessible.map((r) => r.key), ['FS-105']);
  assert.equal(report.ok, false, 'a report with a missing record is not a success');
  assert.match(report.note, /no record/);
});

test('19. backfill pages through the project, skips existing records, and never overwrites a managed issue', async () => {
  const extraIssues = {
    'FS-102': rawIssue({ key: 'FS-102', id: '10043' }),
    'FS-103': rawIssue({ key: 'FS-103', id: '10044' }),
  };
  const { handlers, fake, records, store } = site({ extraIssues });
  fake.state.searchPages = [{ keys: ['FS-101', 'FS-102'] }, { keys: ['FS-103'] }];

  // FS-101 is already managed — the backfill must not unmanage it.
  await store.initialise('FS-101', { state: 'managed' });

  const first = await handlers['relay.workspace.init']({ payload: { projectKey: 'FS', max: 2 }, context: ctx() });
  assert.equal(first.done, false);
  assert.deepEqual(first.initialised, ['FS-102']);
  assert.deepEqual(first.skipped, [{ key: 'FS-101', state: 'managed' }]);
  assert.equal((await records.read('FS-101')).state, 'managed');

  const second = await handlers['relay.workspace.init']({ payload: { projectKey: 'FS', max: 2, cursor: first.nextPageToken }, context: ctx() });
  assert.equal(second.done, true);
  assert.deepEqual(second.initialised, ['FS-103']);
  assert.equal((await records.read('FS-103')).state, 'unmanaged');
});

test('20. an unresolved field pair writes nothing and says so, rather than reporting zero', async () => {
  const { handlers, fake, records } = site();
  fake.state.stateFieldPresent = false;

  const tracked = await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });
  assert.equal(tracked.track.status, 'failed');
  assert.equal(tracked.track.stage, 'state_field');
  assert.equal((await records.read('FS-101')).state, 'initializing', 'the record is withheld, not opened');

  const check = await handlers['relay.enforcement.check']({ payload: { key: 'FS-101' }, context: ctx() });
  assert.equal(check.allowed, false);
  assert.equal(check.fieldInfo.resolved, false);
  assert.ok(check.diagnostics.some((d) => d.code === 'closure_field_unresolved'));
  assert.equal(fake.fields.count.value, null, 'nothing was written: the lifecycle stopped at the state field');
});

test('a commitment change on an issue with no record is refused with the stage named', async () => {
  const { handlers } = site();
  await assert.rejects(
    () => handlers['relay.capture.accept']({ payload: { key: 'FS-101', code: 'CM-1', owner: { id: 'a', name: 'A' } }, context: ctx() }),
    (err) => err instanceof LifecycleError && err.stage === 'commitment_change',
  );
});

test('an unreadable record makes the validator block rather than permit', async () => {
  const validator = createClosureValidator({ readLedger: async () => { throw new Error('entity store unavailable'); } });
  const res = await validator({ issue: { key: 'FS-101' } });
  assert.equal(res.result, false);
  assert.match(res.errorMessage, /could not read/i);
});

test('the issue-created trigger shape records an unmanaged issue through the same handler', async () => {
  const { handlers, records, fake } = site();
  const res = await handlers['relay.state.init']({ payload: { key: 'FS-101', source: 'trigger' }, context: ctx() });

  assert.equal(res.created, true);
  assert.equal(res.state, 'unmanaged');
  assert.equal((await records.read('FS-101')).state, 'unmanaged');
  assert.equal(fake.fields.state.value, 'unmanaged');
  assert.deepEqual(await validatorOn(records)({ issue: { key: 'FS-101' } }), { result: true });
});
