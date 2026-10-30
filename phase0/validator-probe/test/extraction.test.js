/**
 * Unit tests for normalisation, deadline resolution and the quote guard.
 *
 * Run: node --test phase0/validator-probe/test/
 *
 * These are the deterministic half of Part 3. They run without a model, which
 * is the point: the model is the part we cannot verify here, so everything
 * around it must be verifiable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalise, isVerbatimSubstring, nearestWindow } from '../src/extraction/normalize.js';
import { resolveDeadline } from '../src/extraction/deadline.js';
import { processModelOutput } from '../src/extraction/pipeline.js';
import { validateObligation, parseToolCall } from '../src/extraction/schema.js';

// ── normalisation ──────────────────────────────────────────────────────────

test('normalisation collapses whitespace and unifies glyphs', () => {
  assert.equal(normalise('  a   b \n c '), 'a b c');
  assert.equal(normalise('don\u2019t'), "don't");
  assert.equal(normalise('a\u2014b'), 'a-b');
  assert.equal(normalise('a\u00a0b'), 'a b');
  assert.equal(normalise('a\u200bb'), 'ab');
});

test('verbatim check accepts formatting noise but not paraphrase', () => {
  const src = "I've promised her the surveyor will attend by Thursday 12 November.";
  assert.equal(isVerbatimSubstring(src, "I've promised her the surveyor will attend by Thursday 12 November"), true);
  assert.equal(isVerbatimSubstring(src, "I've  promised her the surveyor will attend by Thursday 12 November"), true);
  assert.equal(isVerbatimSubstring(src, 'I told her the surveyor would come on Thursday'), false);
});

test('empty and whitespace-only quotes never verify', () => {
  assert.equal(isVerbatimSubstring('some text', ''), false);
  assert.equal(isVerbatimSubstring('some text', '   '), false);
  assert.equal(isVerbatimSubstring('', 'text'), false);
});

test('nearest window is diagnostic only and can score low', () => {
  const near = nearestWindow('the cat sat on the mat', 'a dog stood by the door');
  assert.ok(near.score < 0.5);
});

// ── deadline resolution ────────────────────────────────────────────────────

const cases = [
  ['by Thursday 12 November', '2026-11-02T09:14:00.000Z', '2026-11-12', 'EXPLICIT_DAY_MONTH'],
  ['before Friday', '2026-11-03T14:02:00.000Z', '2026-11-06', 'NEXT_WEEKDAY'],
  ['by Monday', '2026-11-04T10:31:00.000Z', '2026-11-09', 'NEXT_WEEKDAY'],
  ['by Friday', '2026-11-09T08:55:00.000Z', '2026-11-13', 'NEXT_WEEKDAY'],
  ['by Friday 13 November', '2026-11-10T09:00:00.000Z', '2026-11-13', 'EXPLICIT_DAY_MONTH'],
  ['by the 20th', '2026-11-12T17:12:00.000Z', '2026-11-20', 'DAY_OF_MONTH'],
  ['tomorrow', '2026-11-11T15:45:00.000Z', '2026-11-12', 'RELATIVE_DAY'],
  ['până vineri', '2026-11-12T09:40:00.000Z', '2026-11-13', 'NEXT_WEEKDAY'],
  ['el martes', '2026-11-16T10:00:00.000Z', '2026-11-17', 'NEXT_WEEKDAY'],
  ['by Tuesday', '2026-11-16T14:05:00.000Z', '2026-11-17', 'NEXT_WEEKDAY'],
  ['by the 17th', '2026-11-16T16:00:00.000Z', '2026-11-17', 'DAY_OF_MONTH'],
  ['by end of the month', '2026-11-18T14:20:00.000Z', '2026-11-30', 'END_OF_MONTH'],
  ['by Wednesday', '2026-11-19T09:30:00.000Z', '2026-11-25', 'NEXT_WEEKDAY'],
  ['before the weekend', '2026-11-19T09:30:00.000Z', '2026-11-20', 'END_OF_WEEK'],
  ['by Wednesday', '2026-11-23T13:15:00.000Z', '2026-11-25', 'NEXT_WEEKDAY'],
  ['before Christmas', '2026-11-30T11:10:00.000Z', '2026-12-24', 'FIXED_DATE_CHRISTMAS'],
  ['by the 20th', '2026-11-13T15:30:00.000Z', '2026-11-20', 'DAY_OF_MONTH'],
];

for (const [phrase, ref, expected, rule] of cases) {
  test(`resolves "${phrase}" from ${ref.slice(0, 10)} -> ${expected}`, () => {
    const r = resolveDeadline(phrase, ref);
    assert.equal(r.dueDate, expected);
    assert.equal(r.rule, rule);
  });
}

test('unresolvable or absent deadlines return null, never a guess', () => {
  assert.deepEqual(resolveDeadline(null, '2026-11-02T00:00:00Z'), { dueDate: null, rule: 'NONE', matched: null });
  assert.equal(resolveDeadline('as soon as I hear', '2026-11-02T00:00:00Z').dueDate, null);
  assert.equal(resolveDeadline('soon', '2026-11-02T00:00:00Z').rule, 'AMBIGUOUS_PERIOD');
  assert.equal(resolveDeadline('next week', '2026-11-02T00:00:00Z').dueDate, null);
  assert.equal(resolveDeadline('when the parts arrive', '2026-11-02T00:00:00Z').dueDate, null);
});

test('a day-of-month already past rolls to the next month', () => {
  assert.equal(resolveDeadline('by the 3rd', '2026-11-20T00:00:00Z').dueDate, '2026-12-03');
});

test('bad reference timestamps do not throw', () => {
  assert.equal(resolveDeadline('by Friday', 'not-a-date').rule, 'BAD_REFERENCE');
});

// ── schema + parse ─────────────────────────────────────────────────────────

test('schema rejects unknown properties and bad enums', () => {
  const base = {
    evidence_quote: 'abc def', promise_summary: 'x', promised_to_label: null,
    owner_account_id: null, due_at_iso: null, deadline_phrase: null,
    category: 'other', confidence: 0.5, ambiguity_note: null,
  };
  assert.equal(validateObligation(base).ok, true);
  assert.equal(validateObligation({ ...base, extra: 1 }).ok, false);
  assert.equal(validateObligation({ ...base, category: 'clinical' }).ok, false);
  assert.equal(validateObligation({ ...base, confidence: 2 }).ok, false);
  assert.equal(validateObligation({ ...base, due_at_iso: '12/11/2026' }).ok, false);
});

test('parseToolCall rejects a response with no tool call', () => {
  const r = parseToolCall({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'nope' } }] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'NO_TOOL_CALL');
});

test('parseToolCall rejects an empty response', () => {
  assert.equal(parseToolCall(undefined).reason, 'NO_CHOICE');
  assert.equal(parseToolCall({ choices: [] }).reason, 'NO_CHOICE');
});

// ── pipeline end to end ────────────────────────────────────────────────────

const comment = {
  id: 'T1',
  text: "Spoke to Mrs Adeyemi. I've promised her the surveyor will attend by Thursday 12 November.",
  timestamp: '2026-11-02T09:00:00.000Z',
  author_account_id: 'author-1',
};

const wrap = (obligations) => ({
  choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', index: 0, function: { name: 'emit_obligations', arguments: { obligations } } }] } }],
});

test('pipeline persists only verified, grounded, recomputed obligations', () => {
  const r = processModelOutput({
    comment,
    modelResponse: wrap([{
      evidence_quote: "I've promised her the surveyor will attend by Thursday 12 November",
      promise_summary: 'Surveyor to attend by 12 Nov',
      promised_to_label: 'tenant',
      owner_account_id: 'made-up-id',
      due_at_iso: '2026-11-30',
      deadline_phrase: 'by Thursday 12 November',
      category: 'inspection',
      confidence: 0.9,
      ambiguity_note: null,
    }]),
  });

  assert.equal(r.accepted.length, 1);
  const ob = r.accepted[0];
  assert.equal(ob.owner_account_id, null, 'invented owner must be stripped');
  assert.equal(ob.due_at_iso, '2026-11-12', 'model date must be overridden by the resolver');
  assert.equal(ob.deadline_flag, 'DEADLINE_MODEL_DATE_OVERRIDDEN');
});

test('pipeline returns a typed failure rather than throwing on garbage', () => {
  const r = processModelOutput({ comment, modelResponse: { choices: [{ message: {} }] } });
  assert.equal(r.ok, false);
  assert.equal(r.accepted.length, 0);
});
