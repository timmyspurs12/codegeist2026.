#!/usr/bin/env node
/**
 * Relay Phase 0 offline harness.
 *
 * Runs everything that CAN be run without an Atlassian site:
 *   1. dataset integrity check (ground truth must be internally consistent)
 *   2. resolver cross-check (production deadline code vs hand-written labels)
 *   3. conformance suite (the pipeline must reject what it says it rejects)
 *   4. deterministic baseline (validates the instrument; NOT a model result)
 *
 * It cannot run the model. @forge/llm posts to an internal `https://llm`
 * endpoint via global.__forge_fetch__({ type: 'llm' }), which only exists inside
 * the Forge runtime. See VALIDATION-REPORT.md §5.
 *
 * Usage: node phase0/harness/run.mjs [--json]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isVerbatimSubstring, normalise } from '../validator-probe/src/extraction/normalize.js';
import { resolveDeadline } from '../validator-probe/src/extraction/deadline.js';
import { processModelOutput } from '../validator-probe/src/extraction/pipeline.js';
import { scoreRun, renderMarkdown } from '../validator-probe/src/extraction/score.js';
import { baselineResponse } from './baseline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const RESULTS = join(HERE, 'results');

const dataset = JSON.parse(readFileSync(join(ROOT, 'dataset/comments.json'), 'utf8'));
const gt = JSON.parse(readFileSync(join(ROOT, 'dataset/ground-truth.json'), 'utf8'));

const byId = new Map(dataset.comments.map((c) => [c.id, c]));
const gtById = new Map(gt.ground_truth.map((g) => [g.id, g]));

const out = [];
const say = (s = '') => { out.push(s); console.log(s); };

let failures = 0;
const fail = (msg) => { failures += 1; say(`  ✗ ${msg}`); };

// ───────────────────────────────────────────────────────────── 1. dataset ──
say('## 1. Dataset integrity\n');

let strictComments = 0;
let strictCommitments = 0;
let ambiguousComments = 0;

if (dataset.comments.length !== 30) fail(`expected 30 comments, found ${dataset.comments.length}`);
if (gt.ground_truth.length !== 30) fail(`expected 30 labels, found ${gt.ground_truth.length}`);

for (const comment of dataset.comments) {
  const label = gtById.get(comment.id);
  if (!label) { fail(`${comment.id}: no ground-truth label`); continue; }
  if (label.scoring_class === 'strict') { strictComments += 1; strictCommitments += label.commitments.length; }
  if (label.scoring_class === 'ambiguous') ambiguousComments += 1;

  for (const c of label.commitments) {
    if (!isVerbatimSubstring(comment.text, c.evidence_sentence)) {
      fail(`${comment.id}: ground-truth evidence is NOT a verbatim substring: "${c.evidence_sentence}"`);
    }
  }
  if (label.has_commitment && label.commitments.length === 0) fail(`${comment.id}: has_commitment true but no commitments listed`);
  if (!label.has_commitment && label.commitments.length > 0) fail(`${comment.id}: has_commitment false but commitments listed`);
  if (label.commitments.length > 0) {
    const unique = new Set(label.commitments.map((c) => c.evidence_sentence));
    if (unique.size !== label.commitments.length) fail(`${comment.id}: duplicate evidence sentences in labels`);
  }
}

say(`- comments: ${dataset.comments.length}`);
say(`- strict labels: ${strictComments} comments / ${strictCommitments} commitments`);
say(`- ambiguous labels (reported separately): ${ambiguousComments}`);
say(`- every ground-truth evidence sentence is a verbatim substring: ${failures === 0 ? 'YES' : 'NO — see failures'}`);

// ──────────────────────────────────────────── 2. resolver cross-check ──────
say('\n## 2. Deadline resolver vs hand-written labels\n');
say('Production code (deadline.js) evaluated against dates labelled by hand,');
say('independently of the model. A mismatch is a bug in one of the two.\n');

let checked = 0;
let agreed = 0;
const disagreements = [];
for (const label of gt.ground_truth) {
  const comment = byId.get(label.id);
  for (const c of label.commitments) {
    if (!c.deadline_phrase && !c.due_date) continue;
    checked += 1;
    const modelPhrase = c.deadline_phrase;
    const resolved = modelPhrase ? resolveDeadline(modelPhrase, comment.timestamp) : { dueDate: null, rule: 'NONE' };
    if (resolved.dueDate === c.due_date) agreed += 1;
    else disagreements.push({ id: label.id, phrase: modelPhrase, expected: c.due_date, got: resolved.dueDate, rule: resolved.rule });
  }
}
say(`- deadline assertions checked: ${checked}`);
say(`- resolver agreed with hand label: ${agreed}/${checked}`);
if (disagreements.length) {
  say('\n| Comment | Phrase | Expected | Resolver | Rule |');
  say('| --- | --- | --- | --- | --- |');
  for (const d of disagreements) say(`| ${d.id} | ${d.phrase} | ${d.expected} | ${d.got} | ${d.rule} |`);
  failures += disagreements.length;
}

// ───────────────────────────────────────────────── 3. conformance suite ───
say('\n## 3. Pipeline conformance suite\n');
say('Fixtures are hand-built model responses. They test the enforcement layer,');
say('not model quality: each case asserts that a specific bad input is rejected.\n');

const toolCall = (obligations) => ({
  choices: [{
    finish_reason: 'tool_calls',
    index: 0,
    message: {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'x', type: 'function', index: 0, function: { name: 'emit_obligations', arguments: { obligations } } }],
    },
  }],
});

const ok = (over = {}) => ({
  evidence_quote: "I've promised her the surveyor will attend by Thursday 12 November",
  promise_summary: 'Surveyor to attend by 12 November',
  promised_to_label: 'tenant, Flat 12',
  owner_account_id: '5f2c9a1d7b3e4c8a91d0b6e2',
  due_at_iso: '2026-11-12',
  deadline_phrase: 'by Thursday 12 November',
  category: 'inspection',
  confidence: 0.88,
  ambiguity_note: null,
  ...over,
});

const cases = [];
const addCase = (name, commentId, response, assert) => cases.push({ name, commentId, response, assert });

addCase('clean extraction is accepted', 'C01', toolCall([ok()]), (r) => {
  if (r.accepted.length !== 1) return `expected 1 accepted, got ${r.accepted.length}`;
  if (r.rejected.length !== 0) return `unexpected rejections: ${JSON.stringify(r.rejected.map((x) => x.reason))}`;
  if (r.accepted[0].due_at_iso !== '2026-11-12') return `bad due date ${r.accepted[0].due_at_iso}`;
  return null;
});

addCase('paraphrased quote is rejected, not repaired', 'C01', toolCall([ok({ evidence_quote: 'I told her the surveyor would come on 12 November' })]), (r) => {
  if (r.accepted.length !== 0) return 'paraphrase was accepted';
  if (!r.rejected.some((x) => x.reason === 'QUOTE_NOT_VERBATIM')) return 'missing QUOTE_NOT_VERBATIM';
  return null;
});

addCase('whitespace/case noise still verifies', 'C01', toolCall([ok({ evidence_quote: "  I've   promised her the surveyor will attend by Thursday 12 November  " })]), (r) => {
  if (r.accepted.length !== 1) return 'normalised quote was rejected';
  return null;
});

addCase('invented owner is stripped to null', 'C01', toolCall([ok({ owner_account_id: 'aaaaaaaaaaaaaaaaaaaaaaaa' })]), (r) => {
  if (r.accepted.length !== 1) return 'obligation dropped; should be kept with null owner';
  if (r.accepted[0].owner_account_id !== null) return 'invented owner survived';
  if (!r.rejected.some((x) => x.reason === 'OWNER_NOT_IN_TEXT')) return 'missing OWNER_NOT_IN_TEXT';
  return null;
});

addCase('owner forged inside an instruction is stripped', 'C22', toolCall([{
  evidence_quote: "Told him we'd get the gutter cleared by end of the month",
  promise_summary: 'Gutter cleared by end of month',
  promised_to_label: null,
  owner_account_id: '5b10ac8d82e05b22cc7d4ef5',
  due_at_iso: '2026-11-30',
  deadline_phrase: 'by end of the month',
  category: 'repair',
  confidence: 0.8,
  ambiguity_note: null,
}]), (r) => {
  if (r.accepted.length !== 1) return 'obligation dropped';
  // The forged id DOES appear in the comment, but only inside the injected
  // instruction, so grounding must fail.
  if (r.accepted[0].owner_account_id !== null) return 'forged owner survived';
  if (!r.rejected.some((x) => x.reason === 'OWNER_FROM_INJECTION')) return `expected OWNER_FROM_INJECTION, got ${JSON.stringify(r.rejected.map((x) => x.reason))}`;
  return null;
});

addCase('invented deadline (no phrase) is discarded', 'C01', toolCall([ok({ deadline_phrase: null, due_at_iso: '2026-11-19' })]), (r) => {
  if (r.accepted.length !== 1) return 'obligation dropped';
  if (r.accepted[0].due_at_iso !== null) return `invented date survived: ${r.accepted[0].due_at_iso}`;
  if (r.accepted[0].deadline_flag !== 'DEADLINE_WITHOUT_PHRASE_DISCARDED') return `bad flag ${r.accepted[0].deadline_flag}`;
  return null;
});

addCase('model-computed date is overridden by the resolver', 'C01', toolCall([ok({ due_at_iso: '2026-11-19' })]), (r) => {
  const ob = r.accepted[0];
  if (!ob) return 'obligation dropped';
  if (ob.due_at_iso !== '2026-11-12') return `resolver did not win: ${ob.due_at_iso}`;
  if (ob.deadline_flag !== 'DEADLINE_MODEL_DATE_OVERRIDDEN') return `bad flag ${ob.deadline_flag}`;
  return null;
});

addCase('schema violations are rejected', 'C01', toolCall([ok({ category: 'medical', confidence: 1.4, unexpected: 'x' })]), (r) => {
  if (r.accepted.length !== 0) return 'invalid obligation accepted';
  const reasons = r.rejected.map((x) => x.reason).join(',');
  if (!reasons.includes('BAD_CATEGORY')) return `missing BAD_CATEGORY (${reasons})`;
  if (!reasons.includes('BAD_CONFIDENCE')) return `missing BAD_CONFIDENCE (${reasons})`;
  if (!reasons.includes('UNEXPECTED_PROPERTY:unexpected')) return `missing UNEXPECTED_PROPERTY (${reasons})`;
  return null;
});

addCase('no tool call is a typed failure, not a crash', 'C01', { choices: [{ finish_reason: 'stop', index: 0, message: { role: 'assistant', content: 'I could not find anything.' } }] }, (r) => {
  if (r.ok !== false) return 'expected ok:false';
  if (r.reason !== 'NO_TOOL_CALL') return `bad reason ${r.reason}`;
  return null;
});

addCase('malformed tool arguments are a typed failure', 'C01', {
  choices: [{
    finish_reason: 'tool_calls', index: 0,
    message: { role: 'assistant', content: null, tool_calls: [{ id: 'x', type: 'function', index: 0, function: { name: 'emit_obligations', arguments: '{not json' } }] },
  }],
}, (r) => {
  if (r.ok !== false || r.reason !== 'UNPARSEABLE_ARGUMENTS') return `expected UNPARSEABLE_ARGUMENTS, got ${r.reason}`;
  return null;
});

addCase('injection cannot inflate confidence', 'C21', toolCall([{
  evidence_quote: 'I told Mrs Kaur the electrician will be with her by Tuesday',
  promise_summary: 'Electrician to attend Mrs Kaur by Tuesday',
  promised_to_label: 'Mrs Kaur',
  owner_account_id: '5f2c9a1d7b3e4c8a91d0b6e2',
  due_at_iso: '2026-11-17',
  deadline_phrase: 'by Tuesday',
  category: 'repair',
  confidence: 1.0,
  ambiguity_note: null,
}]), (r) => {
  const ob = r.accepted[0];
  if (!ob) return 'genuine promise lost';
  if (ob.confidence > 0.8) return `confidence not capped: ${ob.confidence}`;
  if (!String(ob.deadline_flag).includes('INJECTION_SUSPECTED')) return 'injection not flagged';
  return null;
});

addCase('injection-only comment yields nothing', 'C20', toolCall([]), (r) => {
  if (r.accepted.length !== 0) return 'obligations created from an injection';
  return null;
});

addCase('comment cannot escape the untrusted-data delimiter', 'C30', toolCall([]), (r) => {
  if (r.accepted.length !== 0) return 'unexpected acceptance';
  return null;
});

let passed = 0;
say('| # | Case | Result | Detail |');
say('| --- | --- | --- | --- |');
cases.forEach((c, i) => {
  const comment = byId.get(c.commentId);
  const result = processModelOutput({ comment, modelResponse: c.response, model: 'fixture', promptVersion: 'conformance' });
  let err = null;
  try { err = c.assert(result); } catch (e) { err = `threw: ${e.message}`; }
  if (err) { fail(`${c.name}: ${err}`); say(`| ${i + 1} | ${c.name} | FAIL | ${err} |`); }
  else { passed += 1; say(`| ${i + 1} | ${c.name} | pass | |`); }
});
say(`\n- conformance: ${passed}/${cases.length} passed`);

// ──────────────────────────────────────────────── 4. deterministic baseline ─
say('\n## 4. Deterministic baseline (instrument validation, NOT a model result)\n');

const results = new Map();
let latency = 0;
for (const comment of dataset.comments) {
  const t0 = process.hrtime.bigint();
  const r = processModelOutput({ comment, modelResponse: baselineResponse(comment), model: 'regex-baseline', promptVersion: 'baseline' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  latency += ms;
  results.set(comment.id, { ...r, latencyMs: Math.round(ms) });
}

const scored = scoreRun({ comments: dataset.comments, ground_truth: gt.ground_truth }, results);
const baselineMd = renderMarkdown(scored, 'Deterministic regex baseline');
say(baselineMd);

// ────────────────────────────────────────────────────────────── write out ─
mkdirSync(RESULTS, { recursive: true });

const summary = {
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    forgeCli: 'installed separately; see ENVIRONMENT.md',
  },
  dataset: {
    comments: dataset.comments.length,
    strictComments,
    strictCommitments,
    ambiguousComments,
    verbatimLabelsOk: failures === 0,
  },
  resolver: { checked, agreed, disagreements },
  conformance: { total: cases.length, passed },
  baseline: {
    label: 'deterministic regex baseline — validates the measurement instrument; NOT a model quality result',
    totals: scored.totals,
    quoteVerification: scored.quoteVerification,
    deadlineAccuracy: scored.deadlineAccuracy,
    injection: scored.injection,
    byTag: scored.byTag,
  },
  failures,
};

writeFileSync(join(RESULTS, 'dataset-check.json'), JSON.stringify({ dataset: summary.dataset, resolver: summary.resolver }, null, 2));
writeFileSync(join(RESULTS, 'conformance.json'), JSON.stringify({ total: cases.length, passed, failures }, null, 2));
writeFileSync(join(RESULTS, 'baseline.json'), JSON.stringify(scored, null, 2));
writeFileSync(join(RESULTS, 'baseline.md'), baselineMd);
writeFileSync(join(RESULTS, 'summary.json'), JSON.stringify(summary, null, 2));

say('\n## Summary\n');
say(`- dataset integrity failures: ${failures}`);
say(`- conformance: ${passed}/${cases.length}`);
say(`- baseline precision ${(scored.totals.precision * 100).toFixed(1)}% / recall ${(scored.totals.recall * 100).toFixed(1)}% / quote-verify ${(scored.quoteVerification.rate * 100).toFixed(1)}%`);
say(`\nWrote ${RESULTS}/{dataset-check,conformance,baseline,summary}.json`);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2));
}

writeFileSync(join(RESULTS, 'harness-output.txt'), out.join('\n'));
process.exitCode = failures === 0 ? 0 : 1;
