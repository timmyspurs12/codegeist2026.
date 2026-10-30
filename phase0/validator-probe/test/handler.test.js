/**
 * Integration tests for the gate handler with injected I/O.
 *
 * These exercise the paths a live deploy would only reach during an outage:
 * KVS unavailable, REST unavailable, both unavailable, malformed payload.
 *
 * They test OUR handler against the DOCUMENTED contract. They are not evidence
 * that Jira invokes it — only a deploy can show that. See VALIDATION-REPORT.md
 * for the distinction between "tested", "documented" and "unverified".
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGateHandler, extractIssueKey } from '../src/gate-handler.js';
import { BASE_BLOCK_MESSAGE } from '../src/gate.js';

const noop = () => {};

test('blocks when precomputed state says obligations are unresolved', async () => {
  const gate = createGateHandler({
    getGateState: async () => ({ enabled: true, stateAvailable: true, blockingCount: 2, unownedCount: 1, overdueCount: 1 }),
    getLabels: async () => [],
    log: noop,
  });
  const res = await gate({ issue: { key: 'HOU-101' } });
  assert.equal(res.result, false);
  assert.ok(res.errorMessage.startsWith(BASE_BLOCK_MESSAGE));
  assert.match(res.errorMessage, /2 unresolved/);
});

test('permits the transition when nothing blocks', async () => {
  const gate = createGateHandler({
    getGateState: async () => ({ enabled: true, stateAvailable: true, blockingCount: 0 }),
    getLabels: async () => [],
    log: noop,
  });
  assert.deepEqual(await gate({ issue: { key: 'HOU-101' } }), { result: true });
});

test('falls back to labels when the entity store read fails', async () => {
  const events = [];
  const gate = createGateHandler({
    getGateState: async () => { throw new Error('KVS timeout'); },
    getLabels: async () => ['relay-block-3', 'relay-unowned-2'],
    log: (e) => events.push(e),
  });
  const res = await gate({ issue: { key: 'HOU-102' } });
  assert.equal(res.result, false);
  assert.match(res.errorMessage, /3 unresolved/);
  assert.ok(events.some((e) => e.event === 'gate_state_read_failed'));
  assert.ok(events.some((e) => e.event === 'gate_decision'));
});

test('fails open when both state sources are unavailable, and says so', async () => {
  const events = [];
  const gate = createGateHandler({
    getGateState: async () => { throw new Error('down'); },
    getLabels: async () => { throw new Error('down'); },
    log: (e) => events.push(e),
  });
  const res = await gate({ issue: { key: 'HOU-103' } });
  assert.equal(res.result, true);
  const decision = events.find((e) => e.event === 'gate_decision');
  assert.equal(decision.audit.code, 'GATE_STATE_UNAVAILABLE_ALLOWED');
});

test('the handler never throws, even when dependencies throw non-Errors', async () => {
  const gate = createGateHandler({
    getGateState: async () => { throw 'string failure'; },
    getLabels: async () => { throw undefined; },
    log: noop,
  });
  await assert.doesNotReject(() => gate({ issue: { key: 'HOU-104' } }));
});

test('return shape carries no keys Jira does not expect', async () => {
  const blocking = createGateHandler({
    getGateState: async () => ({ enabled: true, stateAvailable: true, blockingCount: 1 }),
    getLabels: async () => [],
    log: noop,
  });
  const res = await blocking({ issue: { key: 'HOU-1' } });
  assert.deepEqual(Object.keys(res).sort(), ['errorMessage', 'result']);
});

test('issue key extraction tolerates every plausible payload shape', () => {
  assert.equal(extractIssueKey({ issue: { key: 'A-1' } }), 'A-1');
  assert.equal(extractIssueKey({ issueKey: 'A-2' }), 'A-2');
  assert.equal(extractIssueKey({ issue: 'A-3' }), 'A-3');
  assert.equal(extractIssueKey({ key: 'A-4' }), 'A-4');
  assert.equal(extractIssueKey('A-5'), 'A-5');
  assert.equal(extractIssueKey(null), 'UNKNOWN');
  assert.equal(extractIssueKey({}), 'UNKNOWN');
});

test('unknown issue key does not prevent a safe decision', async () => {
  const gate = createGateHandler({
    getGateState: async () => null,
    getLabels: async () => [],
    log: noop,
  });
  assert.deepEqual(await gate(null), { result: true });
});
