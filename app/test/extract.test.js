import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, parseDue, scorePromise, extractCandidates, DEFAULT_THRESHOLD } from '../src/extract.js';
import { adfToText } from '../src/adf.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');

test('sentences keep exact offsets into the body', () => {
  const body = "The part is on order. I'll chase the supplier on Monday. Can you tell the tenant?";
  const sentences = splitSentences(body);
  assert.equal(sentences.length, 3);
  for (const s of sentences) {
    assert.equal(body.slice(s.start, s.end), s.text, 'offsets must resolve exactly');
  }
});

test('abbreviations do not split a sentence, newlines always do', () => {
  const body = 'Ordered from the merchant, e.g. the CP12 form. Then this line\nAnd this next line';
  const sentences = splitSentences(body);
  assert.equal(sentences[0].text, 'Ordered from the merchant, e.g. the CP12 form.');
  assert.deepEqual(sentences.slice(1).map((s) => s.text), ['Then this line', 'And this next line']);
});

test('a due date is only read when the wording is unambiguous', () => {
  assert.equal(parseDue('I will chase the supplier within five working days', NOW).iso, '2026-11-09T17:00:00.000Z');
  assert.equal(parseDue('I will call tomorrow', NOW).iso, '2026-11-05T17:00:00.000Z');
  assert.equal(parseDue('I will visit on Monday', NOW).iso, '2026-11-09T17:00:00.000Z');
  assert.equal(parseDue('I will send it by the 24th', NOW).iso, '2026-11-24T17:00:00.000Z');

  // The ambiguous case: "Thursday access slot" names a day but promises nothing.
  assert.equal(parseDue('I will confirm the Thursday access slot', NOW), null);
});

test('a question is not a promise; a first-person future is', () => {
  assert.ok(scorePromise('Can you let the tenant know?').score < DEFAULT_THRESHOLD);
  assert.ok(scorePromise("I'll chase the supplier on Monday").score >= DEFAULT_THRESHOLD);
});

test('every candidate quotes the source exactly, or it is rejected', () => {
  const comment = {
    id: 'c-1',
    body: "The ducting is on order. I'll chase the supplier on Monday and confirm the Thursday access slot. Can you let the tenant know?",
    author: { id: 'acc-tom', name: 'Tom Whitfield' },
    createdAt: '2026-11-03T10:00:00.000Z',
  };
  const { candidates, rejected } = extractCandidates({ issueKey: 'FS-101', comment, now: NOW });

  assert.equal(rejected.length, 0);
  assert.equal(candidates.length, 1);
  const [c] = candidates;
  assert.equal(c.quote, "I'll chase the supplier on Monday and confirm the Thursday access slot.");
  assert.equal(comment.body.slice(c.start, c.end), c.quote);
  assert.equal(c.commentId, 'c-1');
  assert.equal(c.author.name, 'Tom Whitfield');
  assert.equal(c.dueAt, '2026-11-09T17:00:00.000Z');
  assert.match(c.fingerprint, /^[0-9a-f]{32}$/);
  assert.ok(c.signals.includes('first-person future'));
});

test('the same comment produces the same fingerprint every time', () => {
  const comment = {
    id: 'c-1',
    body: "I'll book the engineer for Friday.",
    author: { id: 'a', name: 'A Person' },
    createdAt: '2026-11-03T10:00:00.000Z',
  };
  const first = extractCandidates({ issueKey: 'FS-101', comment, now: NOW }).candidates;
  const second = extractCandidates({ issueKey: 'FS-101', comment, now: NOW }).candidates;
  assert.deepEqual(first.map((c) => c.fingerprint), second.map((c) => c.fingerprint));
});

test('ADF comments are flattened to text before extraction, and quotes still resolve', () => {
  const adf = {
    type: 'doc',
    version: 1,
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Update on the extractor.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: "We'll fit the replacement unit within five working days of the part arriving." }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Access window agreed with the tenant.' }] }] },
      ] },
    ],
  };
  const body = adfToText(adf);
  assert.match(body, /We'll fit the replacement unit within five working days/);
  assert.match(body, /• Access window agreed/);

  const { candidates } = extractCandidates({
    issueKey: 'FS-101',
    comment: { id: 'c-9', body, author: { id: 'acc-dan', name: 'Daniel Reyes' }, createdAt: NOW.toISOString() },
    now: NOW,
  });
  assert.equal(candidates.length, 1);
  assert.equal(body.slice(candidates[0].start, candidates[0].end), candidates[0].quote);
});
