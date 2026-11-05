import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLOSURE_FIELD_MODULE_KEY,
  CLOSURE_FIELD_PLACEHOLDER,
  STATE_FIELD_MODULE_KEY,
  STATE_FIELD_PLACEHOLDER,
  closureExpression,
  describeField,
  describeFields,
  evaluateClosureCondition,
  evaluateClosureValue,
  isFieldId,
  moduleTypeIdFrom,
} from '../src/field.js';
import { createHandlers } from '../src/handlers.js';
import {
  COUNT_FIELD_ID, ENV_ID, MODULE_TYPE_PREFIX, STATE_FIELD_ID,
  createFakeJira, createMemoryRecords, createMemoryStorage, forgeContext, rawIssue, rawComment,
} from './support/fake-forge.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');

/* --------------------------------------------------------------- identity */

test('each field’s type id is derived from the app and environment, not the module that invoked us', () => {
  const count = moduleTypeIdFrom(`${MODULE_TYPE_PREFIX}/relay-workspace`, CLOSURE_FIELD_MODULE_KEY);
  const state = moduleTypeIdFrom(`${MODULE_TYPE_PREFIX}/relay-workspace`, STATE_FIELD_MODULE_KEY);
  assert.equal(count, `${MODULE_TYPE_PREFIX}/relay-closure-count`);
  assert.equal(state, `${MODULE_TYPE_PREFIX}/relay-management-state`);
  assert.notEqual(count, state, 'the two fields are distinct identities');
  assert.equal(moduleTypeIdFrom('not-a-module-id'), null);
});

test('only a Jira-generated numeric id counts as a resolved field', () => {
  assert.equal(isFieldId('customfield_10077'), true);
  assert.equal(isFieldId('customfield_relay_closure_count'), false);
  assert.equal(isFieldId('relay-closure-count'), false);
  assert.equal(isFieldId(null), false);
});

/* ------------------------------------------------------------ expression */

test('the expression permits exactly two states: explicitly unmanaged, or managed and zero', () => {
  const e = closureExpression({ count: 'customfield_1', state: 'customfield_2' });
  assert.equal(e, '(issue.customfield_2 == "unmanaged") || (issue.customfield_2 == "managed" && issue.customfield_1 == 0)');
});

test('an unresolved field falls back to a token that cannot be a real field', () => {
  const e = closureExpression({});
  assert.ok(e.includes(CLOSURE_FIELD_PLACEHOLDER));
  assert.ok(e.includes(STATE_FIELD_PLACEHOLDER));
  assert.ok(!/customfield_\d/.test(e), 'no numeric id appears until Jira returns one');
});

/* ------------------------------------------------------------- evaluator */

test('an explicitly unmanaged issue is permitted, count irrelevant', () => {
  assert.equal(evaluateClosureCondition({ state: 'unmanaged', count: 5 }).allow, true);
  assert.equal(evaluateClosureCondition({ state: 'unmanaged', count: null }).allow, true);
  assert.equal(evaluateClosureCondition({ state: 'unmanaged', count: 'nonsense' }).allow, true);
});

test('a managed issue is permitted only on an exact numeric zero', () => {
  assert.equal(evaluateClosureCondition({ state: 'managed', count: 0 }).allow, true);
  for (const count of [1, 2, -1, null, undefined, '0', '0.0', {}, [], true, NaN, Infinity]) {
    const res = evaluateClosureCondition({ state: 'managed', count });
    assert.equal(res.allow, false, `count ${String(count)} must not permit`);
  }
});

test('an initialising issue is withheld, with or without commitments', () => {
  for (const count of [null, 0, companion()]) {
    const res = evaluateClosureCondition({ state: 'initializing', count });
    assert.equal(res.allow, false);
    assert.equal(res.code, 'state_not_managed');
  }
  function companion() { return 3; }
});

test('a null or unrecognised state is withheld — missing is never unmanaged', () => {
  for (const state of [null, undefined, '', 'Unmanaged', 'UNMANAGED', 'managed ', 'active', 1, false]) {
    const res = evaluateClosureCondition({ state, count: 0 });
    assert.equal(res.allow, false, `state ${String(state)} must not permit`);
  }
});

test('a missing state field is an expression error, and an expression error refuses', () => {
  const res = evaluateClosureCondition({ state: 'unmanaged', count: 0 }, { stateExists: false });
  assert.equal(res.allow, false);
  assert.equal(res.code, 'expression_error');
});

test('a missing count field refuses even for a managed issue at zero', () => {
  const res = evaluateClosureCondition({ state: 'managed', count: null }, { countExists: false });
  assert.equal(res.allow, false);
  assert.equal(res.code, 'expression_error');
});

test('the count half keeps its own coercion rules', () => {
  assert.equal(evaluateClosureValue(0).allow, true);
  assert.equal(evaluateClosureValue(2).code, 'open_commitments');
  assert.equal(evaluateClosureValue(null).code, 'null_value');
  assert.equal(evaluateClosureValue('0').code, 'invalid_value');
  assert.equal(evaluateClosureValue(-1).code, 'invalid_value');
});

/* -------------------------------------------------------------- describe */

test('an unresolved pair keeps its module metadata and prints a placeholder line', () => {
  const d = describeFields({ count: { typeId: `${MODULE_TYPE_PREFIX}/relay-closure-count` } });
  assert.equal(d.resolved, false);
  assert.equal(d.count.resolved, false);
  assert.equal(d.count.moduleKey, 'relay-closure-count');
  assert.equal(d.state.moduleKey, 'relay-management-state');
  assert.ok(d.manifestLine.startsWith("expression: '"));
  assert.ok(d.manifestLine.includes('"unmanaged"'), 'the copy-paste line keeps the comparison intact');
  assert.ok(d.expression.includes(CLOSURE_FIELD_PLACEHOLDER));
});

test('a resolved pair prints the line the runbook pastes', () => {
  const d = describeFields({
    count: { id: COUNT_FIELD_ID, key: 'k', typeId: 't', resolvedAt: 'now' },
    state: { id: STATE_FIELD_ID, key: 'k2', typeId: 't2', resolvedAt: 'now' },
  });
  assert.equal(d.resolved, true);
  assert.equal(d.expression, `(issue.${STATE_FIELD_ID} == "unmanaged") || (issue.${STATE_FIELD_ID} == "managed" && issue.${COUNT_FIELD_ID} == 0)`);
  assert.equal(d.manifestLine, `expression: '${d.expression}'`);
});

test('one resolved field is not enough to claim the condition can read', () => {
  const d = describeFields({ count: { id: COUNT_FIELD_ID }, state: {} });
  assert.equal(d.count.resolved, true);
  assert.equal(d.state.resolved, false);
  assert.equal(d.resolved, false);
  assert.throws(() => describeField('nonsense', {}), /unknown_field/);
});

/* ------------------------------------------------ resolution through Jira */

const site = ({ stateFieldPresent = true } = {}) => {
  const storage = createMemoryStorage();
  const records = createMemoryRecords();
  const fake = createFakeJira({ issue: rawIssue(), comments: [rawComment()], stateFieldPresent });
  const handlers = createHandlers({ jira: fake.jira, storage, records, now: () => NOW, log: () => {} });
  return { storage, records, fake, handlers };
};

test('both fields resolve from the site and are cached with the environment they were resolved for', async () => {
  const { handlers, storage } = site();
  const first = await handlers['relay.field.resolve']({ context: forgeContext() });
  assert.equal(first.fields.count.id, COUNT_FIELD_ID);
  assert.equal(first.fields.state.id, STATE_FIELD_ID);
  assert.equal(first.fields.resolved, true);
  assert.equal(first.matchesApplied, false, 'nothing has been recorded as pasted yet');

  const settings = await storage.get('relay:settings');
  assert.equal(settings.closureFieldId, COUNT_FIELD_ID);
  assert.equal(settings.stateFieldId, STATE_FIELD_ID);
  assert.equal(settings.stateFieldTypeId, `${MODULE_TYPE_PREFIX}/relay-management-state`);

  const second = await handlers['relay.field.resolve']({ context: forgeContext() });
  assert.equal(second.fields.count.id, COUNT_FIELD_ID, 'the cache answers the second time');
});

test('a different environment invalidates the cache instead of writing into the previous environment’s field', async () => {
  const { handlers, storage } = site();
  await handlers['relay.field.resolve']({ context: forgeContext() });

  const otherEnv = forgeContext({
    localId: `ari:cloud:ecosystem::extension/11111111-2222-3333-4444-555555555555/00000000-0000-0000-0000-000000000000/static/relay-workspace`,
  });
  await handlers['relay.field.resolve']({ context: otherEnv });

  const settings = await storage.get('relay:settings');
  assert.equal(settings.closureFieldTypeId, 'ari:cloud:ecosystem::extension/11111111-2222-3333-4444-555555555555/00000000-0000-0000-0000-000000000000/static/relay-closure-count');
  assert.equal(ENV_ID !== '00000000-0000-0000-0000-000000000000', true);
});

test('a missing state field leaves the pair unresolved and the expression on its placeholder', async () => {
  const { handlers } = site({ stateFieldPresent: false });
  const res = await handlers['relay.field.resolve']({ context: forgeContext() });
  assert.equal(res.fields.count.resolved, true);
  assert.equal(res.fields.state.resolved, false);
  assert.equal(res.fields.resolved, false);
  assert.ok(res.expression.includes(STATE_FIELD_PLACEHOLDER), 'the unresolved half stays a placeholder');
  assert.ok(!res.expression.includes(CLOSURE_FIELD_PLACEHOLDER), 'the resolved half names the real field');
});

test('the count write that lands and reads back leaves the issue correctly counted', async () => {
  const { handlers, fake, records } = site();
  await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: forgeContext() });
  await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: forgeContext() });

  const record = await records.read('FS-101');
  assert.equal(record.state, 'managed');
  assert.equal(fake.field.value, 1);
  assert.equal(fake.stateField.value, 'managed');
  assert.ok(fake.field.writes.length >= 1);
});

test('a field write the API accepts but does not store is a failed track, not a false zero', async () => {
  const { handlers, fake, records } = site();
  fake.state.fieldIgnored = true;
  await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: forgeContext() });

  const res = await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: forgeContext() });

  assert.equal(res.track.status, 'failed');
  assert.equal(res.track.stage, 'capture', 'the guard could not raise the count, so capture stopped');
  assert.match(res.track.error, /unverified/);
  assert.equal((await records.read('FS-101')).state, 'initializing', 'and the issue is withheld, not managed');
  assert.equal(fake.stateField.value, 'initializing');
});

test('a state field the API refuses aborts track before any capture is claimed as managed', async () => {
  const { handlers, fake, records } = site();
  fake.state.failStateField = true;
  await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: forgeContext() }).catch(() => null);

  const res = await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: forgeContext() });
  assert.equal(res.track.status, 'failed');
  assert.equal(res.track.stage, 'state_field');
  assert.equal((await records.read('FS-101')).state, 'initializing');
});
