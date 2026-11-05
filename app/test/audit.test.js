import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIT_PAGE_SIZE, eventId, eventKey, eventsFor, orderEvents, summarise } from '../src/audit.js';

const ev = (id, at = '2026-11-01T00:00:00.000Z', issueKey = 'REP-1', type = 'accepted') => ({
  id, at, type, issueKey, commitmentCode: 'CM-1', summary: 's', detail: null,
});

test('an event key is per issue and per event, so appends cannot collide', () => {
  assert.equal(eventKey('REP-1', 'e1'), 'relay:audit:REP-1:e1');
  assert.notEqual(eventKey('REP-1', 'e1'), eventKey('REP-1', 'e2'));
  assert.notEqual(eventKey('REP-1', 'e1'), eventKey('REP-2', 'e1'));
  assert.equal(AUDIT_PAGE_SIZE > 0, true);
});

test('an event id is deterministic: the same decision recorded twice is one event', () => {
  const base = { type: 'accepted', issueKey: 'REP-1', commitmentCode: 'CM-1', rev: 2 };
  assert.equal(eventId(base), eventId({ ...base }));
  assert.notEqual(eventId(base), eventId({ ...base, rev: 3 }));
});

test('events order newest first, and equal timestamps still have a stable order', () => {
  const ordered = orderEvents([ev('e1'), ev('e2'), ev('e3', '2026-11-02T00:00:00.000Z')]);
  assert.deepEqual(ordered.map((e) => e.id), ['e3', 'e2', 'e1']);
});

test('the trail can be filtered per case and summarised', () => {
  const events = [
    ev('e1', '2026-11-01T00:00:00.000Z', 'REP-1'),
    ev('e2', '2026-11-01T00:00:01.000Z', 'REP-2'),
    ev('e3', '2026-11-01T00:00:02.000Z', 'REP-1', 'closure_blocked'),
  ];
  assert.equal(eventsFor(events, 'REP-1').length, 2);
  assert.deepEqual(summarise(events), { total: 3, blocked: 1, allowed: 0, truncated: false });
});

test('a truncated page says so rather than reporting totals for the whole trail', () => {
  const page = { events: [ev('e1')], truncated: true };
  assert.equal(summarise(page).truncated, true);
  assert.equal(summarise(page).total, 1);
});
