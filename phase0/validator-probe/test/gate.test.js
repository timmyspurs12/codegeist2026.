/**
 * Unit tests for the closure gate decision logic.
 *
 * Run: node --test phase0/validator-probe/test/
 *
 * These tests are the only part of Part 2 that can be verified without an
 * Atlassian site. They prove the decision table and the message construction.
 * They do NOT prove that Jira calls this function — that requires a deploy.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decideGate, buildBlockMessage, stateFromLabels, BASE_BLOCK_MESSAGE } from '../src/gate.js';

const base = { enabled: true, stateAvailable: true, blockingCount: 0, unownedCount: 0, overdueCount: 0 };

test('blocks when unresolved obligations exist', () => {
  const d = decideGate({ ...base, blockingCount: 2, unownedCount: 1, overdueCount: 1 });
  assert.equal(d.result, false);
  assert.equal(d.audit.code, 'GATE_BLOCKED');
  assert.ok(d.errorMessage.startsWith(BASE_BLOCK_MESSAGE));
});

test('allows when no obligations block', () => {
  const d = decideGate({ ...base });
  assert.equal(d.result, true);
  assert.equal(d.errorMessage, undefined);
  assert.equal(d.audit.code, 'GATE_PASSED');
});

test('allows when Relay is disabled on the project', () => {
  const d = decideGate({ ...base, enabled: false, blockingCount: 5 });
  assert.equal(d.result, true);
  assert.equal(d.audit.code, 'GATE_DISABLED');
});

test('fails open when precomputed state cannot be read (default policy)', () => {
  const d = decideGate({ stateAvailable: false, blockingCount: 0 });
  assert.equal(d.result, true);
  assert.equal(d.audit.code, 'GATE_STATE_UNAVAILABLE_ALLOWED');
});

test('fails closed only when the project explicitly asks for it', () => {
  const d = decideGate({ stateAvailable: false, policy: 'fail-closed' });
  assert.equal(d.result, false);
  assert.equal(d.audit.code, 'GATE_STATE_UNAVAILABLE_BLOCKED');
  assert.equal(d.errorMessage, BASE_BLOCK_MESSAGE);
});

test('blocking message always contains the fixed sentence', () => {
  for (const state of [
    { blockingCount: 1 },
    { blockingCount: 9, unownedCount: 0, overdueCount: 0 },
    { blockingCount: 3, unownedCount: 3 },
  ]) {
    assert.ok(buildBlockMessage(state).startsWith(BASE_BLOCK_MESSAGE));
  }
});

test('blocking message carries counts but never obligation content', () => {
  const msg = buildBlockMessage({ blockingCount: 3, unownedCount: 2, overdueCount: 1 });
  assert.match(msg, /3 unresolved/);
  assert.match(msg, /2 with no owner/);
  assert.match(msg, /1 overdue/);
  // No names, no summaries, no ids — anyone who can transition sees this text.
  assert.doesNotMatch(msg, /Flat|Mrs|Okafor|tenant|§|#/);
});

test('decideGate never throws, whatever it is handed', () => {
  const inputs = [null, undefined, {}, 'nonsense', 0, [], { blockingCount: 'four' }, { blockingCount: -1 }, { enabled: null }];
  for (const input of inputs) {
    assert.doesNotThrow(() => decideGate(input));
  }
});

test('negative or non-numeric counts cannot accidentally block', () => {
  assert.equal(decideGate({ ...base, blockingCount: -5 }).result, true);
  assert.equal(decideGate({ ...base, blockingCount: Number.NaN }).result, true);
});

test('label grammar derives gate state', () => {
  assert.equal(stateFromLabels([]).enabled, false);
  assert.equal(stateFromLabels(['relay-block']).blockingCount, 1);
  assert.equal(stateFromLabels(['relay-block-4']).blockingCount, 4);
  assert.equal(stateFromLabels(['relay-block-2', 'relay-unowned-1', 'relay-overdue-2']).overdueCount, 2);
  assert.equal(stateFromLabels(['unrelated-label']).blockingCount, 0);
});

test('label state blocks end to end', () => {
  const state = stateFromLabels(['relay-block-2', 'relay-unowned-2']);
  assert.equal(decideGate(state).result, false);
});
