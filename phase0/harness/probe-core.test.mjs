/**
 * Tests for the classification rules used by the customer-transition probe.
 *
 * These matter more than they look: the whole experiment turns on telling
 * "Relay refused this" apart from "Jira refused this", and on not claiming the
 * validator was consulted when the request simply succeeded.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyAttempt, validatorRan, isListed, findTransition, offeredList, buildAttemptBody, RELAY_MARKER,
} from './probe-core.mjs';

const relayBody = {
  errorMessages: ['Relay has unresolved promises attached to this case. Review the obligation ledger before closing it. (2 unresolved: 1 with no owner, 1 overdue)'],
  errors: {},
};

test('a 400 carrying the Relay sentence is a relay refusal', () => {
  const r = classifyAttempt(400, relayBody);
  assert.equal(r.outcome, 'refused_by_relay');
  assert.match(r.relayMessage, /unresolved promises/);
});

test('the relay marker matches case-insensitively', () => {
  const r = classifyAttempt(400, { errorMessages: [RELAY_MARKER.toUpperCase()] });
  assert.equal(r.outcome, 'refused_by_relay');
});

test('a 400 for any other reason is not a relay refusal', () => {
  const r = classifyAttempt(400, { errorMessages: ['Resolution is required'], errors: { resolution: 'Resolution is required' } });
  assert.equal(r.outcome, 'refused_by_jira');
  assert.equal(r.relayMessage, null);
});

test('204 is an allowed transition', () => {
  assert.equal(classifyAttempt(204, null).outcome, 'allowed');
  assert.equal(classifyAttempt(200, null).outcome, 'allowed');
});

test('an allowance does not prove the validator ran', () => {
  // A pass could mean "consulted and allowed" or "never consulted". The probe
  // must not report either as fact, so it reports unknown.
  assert.equal(validatorRan(classifyAttempt(204, null)), 'unknown');
  assert.equal(validatorRan(classifyAttempt(400, relayBody)), 'yes');
  assert.equal(validatorRan(classifyAttempt(400, { errorMessages: ['other'] })), 'no');
});

test('a 401 or 403 is neither an allowance nor a relay refusal', () => {
  for (const code of [401, 403, 500]) {
    const r = classifyAttempt(code, { errorMessages: [] });
    assert.equal(r.outcome, 'refused_by_jira', `HTTP ${code} must not read as a pass`);
  }
});

test('the transition list can be searched by id or by name, case-insensitively', () => {
  const body = {
    transitions: [
      { id: '11', name: 'Start progress' },
      { id: '61', name: 'Mark as done' },
    ],
  };
  assert.equal(findTransition(body, '61').name, 'Mark as done');
  assert.equal(findTransition(body, 'mark as done').id, '61');
  assert.equal(findTransition(body, 'Resolve this request'), null);
});

test('a transition that is not offered is reported as not listed', () => {
  const body = { transitions: [{ id: '61', name: 'Mark as done' }] };
  assert.equal(isListed(body, 'Mark as done'), true);
  // A condition that hides the transition removes it from this list entirely,
  // which is how the probe detects that a workflow rule withheld it.
  assert.equal(isListed(body, 'Resolve this request'), false);
  assert.equal(isListed(null, 'Mark as done'), false);
});

test('the transition payload carries the resolution only when asked', () => {
  assert.deepEqual(buildAttemptBody('61', 'Done'), {
    transition: { id: '61' },
    fields: { resolution: { name: 'Done' } },
  });
  assert.deepEqual(buildAttemptBody('61', null), { transition: { id: '61' } });
});

test('the service-desk endpoint\'s singular errorMessage is classified too', () => {
  // /rest/servicedeskapi/request/{key}/transition returns errorMessage: "..."
  // rather than Jira's errorMessages: [...]. Treating that as a non-Relay
  // refusal would have hidden the exact result this experiment exists to find.
  const r = classifyAttempt(400, { errorMessage: 'Relay has unresolved promises attached to this case.' });
  assert.equal(r.outcome, 'refused_by_relay');
  assert.equal(validatorRan(r), 'yes');
});

test('a service-desk refusal that is not Relay\'s is still not a Relay refusal', () => {
  const r = classifyAttempt(400, { errorMessage: 'Transition is not valid for this request' });
  assert.equal(r.outcome, 'refused_by_jira');
});

test('a customer transition listed under the paged `values` shape counts as offered', () => {
  // The service-desk endpoint pages its result: {"size":1,"values":[{"id":"121","name":"Resolved"}]}
  const body = { size: 1, start: 0, limit: 50, isLastPage: true, values: [{ id: '121', name: 'Resolved' }] };
  assert.equal(isListed(body, '121'), true);
  assert.equal(isListed(body, 'Resolved'), true);
  assert.equal(findTransition(body, '121').name, 'Resolved');
});

test('offeredList separates "no transitions" from "could not read the shape"', () => {
  assert.deepEqual(offeredList({ transitions: [{ id: '1' }] }), [{ id: '1' }]);
  assert.deepEqual(offeredList({ values: [] }), []);
  assert.equal(offeredList({ unexpected: true }), null);
});
