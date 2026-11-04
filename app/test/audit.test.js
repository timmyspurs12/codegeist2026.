import test from 'node:test';
import assert from 'node:assert/strict';
import { appendEvent, eventsFor, summarise } from '../src/audit.js';

const ev = (id, issueKey = 'REP-1') => ({ id, at: '2026-11-01T00:00:00.000Z', type: 'accepted', issueKey, commitmentCode: 'CM-1', summary: 's', detail: null });

test('events are numbered so equal timestamps still have an order', () => {
  const a = appendEvent(null, ev('e1'));
  const b = appendEvent(a.trail, ev('e2'));
  assert.equal(b.trail.events[0].id, 'e2');
  assert.equal(b.trail.events[0].seq, 2);
  assert.equal(b.trail.events[1].seq, 1);
});

test('a retried message does not double-record the decision', () => {
  const a = appendEvent(null, ev('e1'));
  const b = appendEvent(a.trail, ev('e1'));
  assert.equal(b.appended, false);
  assert.equal(b.trail.events.length, 1);
});

test('the trail can be filtered per case and summarised', () => {
  let trail = appendEvent(null, ev('e1', 'REP-1')).trail;
  trail = appendEvent(trail, ev('e2', 'REP-2')).trail;
  trail = appendEvent(trail, { ...ev('e3', 'REP-1'), type: 'closure_blocked' }).trail;
  assert.equal(eventsFor(trail, 'REP-1').length, 2);
  assert.deepEqual(summarise(trail), { total: 3, blocked: 1, allowed: 0 });
});
