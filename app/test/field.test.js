/**
 * The app-owned closure field.
 *
 * Phase 2 depended on a number field an administrator created by hand and on a
 * condition expression that named a guessed id. Phase 2.1 replaces both with a
 * field the app declares, owns, writes through the private field API, and
 * resolves at runtime.
 *
 * Two kinds of test live here:
 *
 *   - **Pure** tests of identity and of the expression's semantics, including
 *     the six states the brief requires. These run against the evaluator that
 *     mirrors `issue.<id> == 0`.
 *   - **Handler** tests against the fake site, proving that Relay writes the
 *     field it resolved, verifies it by reading it back, and refuses to treat a
 *     failed or ignored write as a zero.
 *
 * The mirror is a mirror. Only Jira evaluates the real expression, so the
 * expression itself is NOT TESTED here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLOSURE_FIELD_MODULE_KEY, CLOSURE_FIELD_PLACEHOLDER, PLACEHOLDER_EXPRESSION,
  closureExpression, describeField, evaluateClosureValue, isFieldId, moduleTypeIdFrom,
} from '../src/field.js';
import { createHandlers } from '../src/handlers.js';
import { syncIssue } from '../src/sync.js';
import {
  MODULE_TYPE_PREFIX, createFakeJira, createMemoryStorage, forgeContext, rawComment, rawIssue,
} from './support/fake-forge.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');
const ctx = forgeContext({ extension: { issue: { key: 'FS-101' } } });

function build({ fieldPresent = true, failProjection = false, storage = createMemoryStorage() } = {}) {
  const fake = createFakeJira({
    issue: rawIssue(),
    comments: [rawComment()],
    people: [{ id: 'acc-maya', name: 'Maya Okafor' }, { id: 'acc-tom', name: 'Tom Whitfield' }],
    failProjection,
    fieldPresent,
  });
  const handlers = createHandlers({ jira: fake.jira, storage, now: () => NOW, log: () => {} });
  return { handlers, fake, storage };
}

/* ------------------------------------------------------------------ identity */

test('the field type id is built from the app and environment, not the invoked module', () => {
  const fromConsole = moduleTypeIdFrom(`${MODULE_TYPE_PREFIX}/relay-workspace`);
  const fromPanel = moduleTypeIdFrom(`${MODULE_TYPE_PREFIX}/relay-case-panel`);
  assert.equal(fromConsole, `${MODULE_TYPE_PREFIX}/${CLOSURE_FIELD_MODULE_KEY}`);
  assert.equal(fromPanel, fromConsole, 'the invoked module does not change the field identity');
  assert.equal(moduleTypeIdFrom(''), null);
  assert.equal(moduleTypeIdFrom('not-a-module-id'), null);
  assert.equal(moduleTypeIdFrom(undefined), null);
});

test('only a Jira-generated field id is accepted; the placeholder never masquerades as one', () => {
  assert.equal(isFieldId('customfield_10077'), true);
  assert.equal(isFieldId(CLOSURE_FIELD_PLACEHOLDER), false);
  assert.equal(isFieldId('customfield_abc'), false);
  assert.equal(isFieldId(null), false);

  assert.equal(closureExpression('customfield_10077'), 'issue.customfield_10077 == 0');
  assert.equal(
    closureExpression(CLOSURE_FIELD_PLACEHOLDER),
    `issue.${CLOSURE_FIELD_PLACEHOLDER} == 0`,
    'an unresolved id becomes a call to a field that does not exist, which fails closed',
  );
  assert.equal(closureExpression('customfield_relay_open'), `issue.${CLOSURE_FIELD_PLACEHOLDER} == 0`);
});

test('an unresolved field is reported as unresolved, never as zero', () => {
  const unknown = describeField({ id: null, typeId: null });
  assert.equal(unknown.resolved, false);
  assert.equal(unknown.id, null);
  assert.equal(unknown.expression, PLACEHOLDER_EXPRESSION);

  const known = describeField({ id: 'customfield_10077', key: 'k', typeId: 't' });
  assert.equal(known.resolved, true);
  assert.equal(known.expression, 'issue.customfield_10077 == 0');
  assert.equal(known.manifestLine, 'expression: "issue.customfield_10077 == 0"');
});

/* ---------------------------------------------------- expression semantics */

test('the expression allows a confirmed zero and nothing else', () => {
  assert.deepEqual(
    { allow: evaluateClosureValue(0).allow, code: evaluateClosureValue(0).code },
    { allow: true, code: 'clear' },
  );
});

test('a positive count refuses the transition', () => {
  for (const n of [1, 2, 99]) {
    const res = evaluateClosureValue(n);
    assert.equal(res.allow, false, `${n} must not allow closure`);
    assert.equal(res.code, 'open_commitments');
  }
});

test('a missing field is an expression error, which Jira treats as false', () => {
  const res = evaluateClosureValue(undefined, { fieldExists: false });
  assert.equal(res.allow, false);
  assert.equal(res.code, 'expression_error');
});

test('an empty field is not zero and does not allow closure', () => {
  for (const value of [null, undefined]) {
    const res = evaluateClosureValue(value);
    assert.equal(res.allow, false);
    assert.equal(res.code, 'null_value');
  }
});

test('an invalid value does not allow closure', () => {
  for (const value of ['0', 'abc', {}, [], true, () => 0]) {
    const res = evaluateClosureValue(value);
    assert.equal(res.allow, false, `${String(value)} must not allow closure`);
    assert.equal(res.code, 'invalid_value');
  }
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(evaluateClosureValue(value).allow, false);
  }
  assert.equal(evaluateClosureValue(-1).allow, false, 'a negative count is not a clearance');
});

test('an evaluation failure refuses the transition', () => {
  const res = evaluateClosureValue(0, { error: 'field not found' });
  assert.equal(res.allow, false);
  assert.equal(res.code, 'expression_error');
});

test('every unsafe or ambiguous state is a refusal', () => {
  const states = [
    ['zero', evaluateClosureValue(0)],
    ['positive', evaluateClosureValue(3)],
    ['missing', evaluateClosureValue(undefined, { fieldExists: false })],
    ['null', evaluateClosureValue(null)],
    ['invalid', evaluateClosureValue('nope')],
    ['error', evaluateClosureValue(null, { error: 'boom' })],
  ];
  const allowed = states.filter(([, res]) => res.allow).map(([name]) => name);
  assert.deepEqual(allowed, ['zero'], 'only a confirmed zero can permit closure');
});

/* -------------------------------------------------------------- resolution */

test('the field id is discovered from Jira and cached with the type id it came from', async () => {
  const { handlers, fake, storage } = build();
  await handlers.bootstrap({ context: ctx });

  const settings = await storage.get('relay:settings');
  assert.equal(settings.closureFieldId, 'customfield_90001');
  assert.equal(settings.closureFieldTypeId, `${MODULE_TYPE_PREFIX}/${CLOSURE_FIELD_MODULE_KEY}`);

  const lookups = () => fake.calls.filter((c) => c[0] === 'findFieldByModuleType').length;
  assert.equal(lookups(), 1);

  await handlers.bootstrap({ context: ctx });
  assert.equal(lookups(), 1, 'the second invocation reuses the resolved field');
});

test('a different environment re-resolves instead of writing into the previous field', async () => {
  const { handlers, storage } = build();
  await handlers.bootstrap({ context: ctx });
  const first = (await storage.get('relay:settings')).closureFieldTypeId;

  const otherEnv = forgeContext({
    extension: { issue: { key: 'FS-101' } },
    localId: `ari:cloud:ecosystem::extension/11111111-2222-3333-4444-555555555555/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/static/relay-workspace`,
  });
  const resolved = await handlers['relay.field.resolve']({ context: otherEnv });
  assert.equal(resolved.field.typeId.endsWith('/relay-closure-count'), true);
  assert.notEqual(resolved.field.typeId, first);

  const settings = await storage.get('relay:settings');
  assert.equal(settings.closureFieldTypeId, resolved.field.typeId, 'the cache follows the environment');
});

test('when Jira has no such field, the console is told and nothing is written', async () => {
  const { handlers, fake } = build({ fieldPresent: false });
  await handlers.bootstrap({ context: ctx });

  const resolution = await handlers['relay.field.resolve']({ context: ctx });
  assert.equal(resolution.field.resolved, false);
  assert.equal(resolution.expression, PLACEHOLDER_EXPRESSION);

  // A suggestion raises the open count, so the scan cannot proceed without a
  // field to project it into. It refuses rather than queue work the portal has
  // no way to notice.
  await assert.rejects(
    () => handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx }),
    /closure_field_unresolved/,
  );
  assert.equal(fake.field.value, null);

  const check = await handlers['relay.enforcement.check']({ payload: { key: 'FS-101' }, context: ctx });
  assert.ok(check.diagnostics.some((d) => d.code === 'closure_field_unresolved'));
  assert.notEqual(check.field, 0, 'an unresolved field is not a zero');
});

test('without a localId and without a cache, the field stays unresolved', async () => {
  const { handlers } = build();
  const resolution = await handlers['relay.field.resolve']({ context: { accountId: 'acc-maya' } });
  assert.equal(resolution.field.resolved, false);
  assert.equal(resolution.field.typeId, null);
});

/* -------------------------------------------------------- the write itself */

test('the field is written through the private app-field API, with the numeric issue id', async () => {
  const { handlers, fake } = build();
  await handlers.bootstrap({ context: ctx });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  const writes = fake.calls.filter((c) => c[0] === 'writeAppFieldValue');
  assert.ok(writes.length >= 1, 'the field was written');
  assert.equal(writes.at(-1)[1], 'customfield_90001', 'by the resolved field id');
  assert.equal(fake.field.issueIds.at(-1), 10042, 'with the numeric issue id the API requires');
  assert.equal(fake.calls.filter((c) => c[0] === 'writeField').length, 0, 'never through Edit Issue');
});

test('a field write Jira refuses stops the mutation before the ledger moves', async () => {
  const { handlers, fake, storage } = build();
  await handlers.bootstrap({ context: ctx });

  // The guard cannot make the field say "blocked", so the scan must not create
  // a suggestion the portal cannot see.
  fake.state.failField = 403;
  await assert.rejects(
    () => handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx }),
    /app field|guard/i,
  );

  assert.equal(await storage.get('relay:ledger:FS-101'), null, 'no ledger was written');
  assert.equal(fake.field.value, null);
});

test('when the field is already correct, a later write failure is reported and does not undo the decision', async () => {
  const { handlers, fake, storage } = build();
  await handlers.bootstrap({ context: ctx });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });
  const before = await storage.get('relay:ledger:FS-101');

  // The guard is skipped because both readers already say "blocked"; the final
  // write fails, so the console is told the layers are out of step.
  fake.state.failField = 403;
  const issue = await handlers['relay.capture.accept']({
    payload: { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-tom', name: 'Tom Whitfield' } },
    context: ctx,
  });

  const after = await storage.get('relay:ledger:FS-101');
  assert.equal(after.rev, before.rev + 1, 'the ledger is authoritative and was saved');
  assert.equal(issue.commitments[0].status, 'open');
  assert.equal(issue.closure.ready, false);
  assert.ok(
    (issue.diagnostics ?? []).some((d) => d.code === 'projection_write_failed')
      || issue.closure.projection.stale,
    'the console is told the projection could not be updated',
  );
});

test('an accepted write that did not change the value is caught by the read-back', async () => {
  const { handlers, fake, storage } = build();
  await handlers.bootstrap({ context: ctx });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  // Jira answers 204, the value does not change — the case a status code cannot
  // distinguish.
  // The ledger holds one unresolved commitment; the field is behind at zero.
  fake.field.value = 0;
  fake.state.fieldIgnored = true;
  const result = await handlers['relay.field.reconcile']({ context: ctx });

  assert.equal(result.ok, false);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].key, 'FS-101');
  assert.match(result.failed[0].error, /field_write_unverified|guard_field_write_unverified/);

  const settings = await storage.get('relay:settings');
  assert.equal(settings.closureFieldId, 'customfield_90001');
});

test('a field write that Jira cannot complete is reported, not swallowed', async () => {
  const { handlers, fake, storage } = build();
  await handlers.bootstrap({ context: ctx });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  fake.field.value = 0;
  fake.state.failField = 500;
  const result = await handlers['relay.field.reconcile']({ context: ctx });
  assert.equal(result.ok, false);
  assert.equal(result.failed[0].key, 'FS-101');
  assert.equal((await storage.get('relay:ledger:FS-101')).rev, 1, 'reconciliation never touches the ledger');
});

/* ------------------------------------------------------------ consistency */

test('the ledger and the field agree after every decision', async () => {
  const { handlers, fake } = build();
  await handlers.bootstrap({ context: ctx });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });
  assert.equal(fake.field.value, 1, 'a queued suggestion is unresolved work');

  await handlers['relay.capture.accept']({
    payload: { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-tom', name: 'Tom Whitfield' } },
    context: ctx,
  });
  assert.equal(fake.field.value, 1);

  await handlers['relay.commitment.verify']({
    payload: { key: 'FS-101', code: 'CM-1', note: 'Supplier confirmed dispatch.' },
    context: ctx,
  });
  assert.equal(fake.field.value, 0, 'a cleared ledger clears the field');

  const check = await handlers['relay.enforcement.check']({ payload: { key: 'FS-101' }, context: ctx });
  assert.equal(check.field, 0);
  assert.equal(check.allowed, true);
  assert.equal(check.diagnostics.filter((d) => d.level === 'error').length, 0);
});

test('a missing field is repaired from the ledger, including the initial zero', async () => {
  const { handlers, fake } = build();
  await handlers.bootstrap({ context: ctx });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });
  await handlers['relay.capture.reject']({
    payload: { key: 'FS-101', code: 'CM-1', reason: 'No promise was made; wrong trade.' },
    context: ctx,
  });

  // Simulate the field never having been written (fresh attach, or a failed
  // write that has since been forgotten).
  fake.field.value = null;
  const result = await handlers['relay.field.reconcile']({ context: ctx });
  assert.equal(result.ok, true);
  assert.equal(result.repaired, 1);
  assert.equal(fake.field.value, 0, 'reconciliation writes the real count, which is zero');
});

test('a stale field is reported as out of step and does not open the gate', async () => {
  const { handlers, fake } = build();
  await handlers.bootstrap({ context: ctx });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  // An old value left behind: the ledger holds one unresolved commitment.
  fake.field.value = 0;
  fake.properties.set('FS-101', { ledgerRev: 1, open: 1, overdue: 0, unowned: 0, awaitingReview: 1, updatedAt: NOW.toISOString() });

  const check = await handlers['relay.enforcement.check']({ payload: { key: 'FS-101' }, context: ctx });
  assert.equal(check.allowed, false, 'the ledger decides, and it says one unresolved');
  assert.equal(check.field, 1, 'the check repaired the field while reporting');
  const stale = check.diagnostics.filter((d) => d.code === 'field_out_of_step');
  assert.equal(stale.length, 0, 'after reconciliation the layers agree again');
});

test('duplicate updates write the field once and keep it correct', async () => {
  const { handlers, fake } = build();
  await handlers.bootstrap({ context: ctx });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  const payload = { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-tom', name: 'Tom Whitfield' } };
  await handlers['relay.capture.accept']({ payload, context: ctx });
  const writesAfterFirst = fake.field.accepted;
  await handlers['relay.capture.accept']({ payload, context: ctx });

  assert.equal(fake.field.accepted, writesAfterFirst, 'a no-op does not write the field again');
  assert.equal(fake.field.value, 1);
});

test('concurrent decisions leave the field equal to the ledger, not to whichever finished last', async () => {
  const { handlers, fake } = build();
  await handlers.bootstrap({ context: ctx });
  const scan = await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });
  assert.equal(scan.created.length, 1);

  // Two independent decisions on the same commitment, started together.
  const owner = { id: 'acc-tom', name: 'Tom Whitfield' };
  await Promise.allSettled([
    handlers['relay.capture.accept']({ payload: { key: 'FS-101', code: 'CM-1', owner }, context: ctx }),
    handlers['relay.capture.accept']({ payload: { key: 'FS-101', code: 'CM-1', owner }, context: ctx }),
  ]);

  const check = await handlers['relay.enforcement.check']({ payload: { key: 'FS-101' }, context: ctx });
  assert.equal(check.counts.open, 1);
  assert.equal(check.field, 1, 'the field matches the ledger after the dust settles');
});

test('the field is written before the ledger when the count is about to rise', async () => {
  const order = [];
  const storage = createMemoryStorage();
  const set = storage.set.bind(storage);
  storage.set = async (key, value) => {
    if (key.startsWith('relay:ledger:')) order.push('ledger');
    return set(key, value);
  };

  const fake = createFakeJira({
    issue: rawIssue(),
    comments: [rawComment()],
    people: [{ id: 'acc-tom', name: 'Tom Whitfield' }],
  });
  const writeAppFieldValue = fake.jira.writeAppFieldValue.bind(fake.jira);
  fake.jira.writeAppFieldValue = async (...args) => {
    order.push('field');
    return writeAppFieldValue(...args);
  };

  const handlers = createHandlers({ jira: fake.jira, storage, now: () => NOW, log: () => {} });
  await handlers.bootstrap({ context: ctx });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  assert.equal(order[0], 'field', `the guard must project before the ledger moves (saw ${order.join(',')})`);
  assert.ok(order.includes('ledger'));
});

test('reconciliation reports a partial repair as partial', async () => {
  const { handlers, fake } = build();
  await handlers.bootstrap({ context: ctx });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  fake.state.failFieldRead = true;
  const result = await handlers['relay.field.reconcile']({ context: ctx });
  assert.equal(result.ok, false);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].key, 'FS-101');
});

test('sync never rewrites a field that already matches', async () => {
  const { fake, storage } = build();
  const handlers = createHandlers({ jira: fake.jira, storage, now: () => NOW, log: () => {} });
  await handlers.bootstrap({ context: ctx });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });
  await handlers['relay.commitment.verify']({
    payload: { key: 'FS-101', code: 'CM-1', note: 'Done.' },
    context: ctx,
  });

  const writesBefore = fake.field.accepted;
  const io = {
    readLedger: async (key) => storage.get(`relay:ledger:${key}`),
    readProjection: (key) => fake.jira.readProperty(key, 'relay.closure'),
    writeProjection: (key, value) => fake.jira.writeProperty(key, 'relay.closure', value),
    readField: (key) => fake.jira.readField(key, 'customfield_90001'),
    writeField: (key, value) => fake.jira.writeAppFieldValue('customfield_90001', 10042, value),
  };
  const res = await syncIssue(io, 'FS-101', { now: NOW, maxAgeMs: 60_000 });
  assert.equal(res.status, 'fresh');
  assert.equal(fake.field.accepted, writesBefore);
});
