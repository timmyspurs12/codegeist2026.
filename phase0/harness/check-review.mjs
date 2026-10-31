#!/usr/bin/env node
/**
 * Consistency check for the Relay review documents.
 *
 * Written because a stale headline number shipped once: v2's §8 table summed to
 * 80/80/76 while §0 still claimed Relay was on 79 from an earlier draft. In a
 * document whose whole value is "you can trust these numbers", that is the worst
 * class of error to leave in — and it was invisible because the table and the
 * prose are edited in different places.
 *
 * Checks, per document:
 *   1. every score column in the table sums to its TOTAL row
 *   2. any "a + b + c = n" arithmetic shown in the prose agrees with itself
 *   3. the headline sentence states the same result as the table
 *   4. no sentence from a superseded draft survives
 *   5. evidence tags are well-formed
 *
 * Usage: node phase0/harness/check-review.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

/**
 * Each document names the regexes that assert its headline. Capture groups are
 * compared against the TOTAL row: [Relay, CloseCall, OpenDoor].
 */
const DOCS = [
  {
    file: 'RELAY-REVIEW-V2.md',
    label: 'v2',
    tableSection: ['## 8. Scoring', '### Reasoning'],
    headlines: [
      ['§0', /\*\*Relay is now level with Close Call at (\d+)\*\*/, [0]],
      ['§8', /The scores are level at (\d+)–(\d+)/, [0, 1]],
      ['§11', /Relay and Close Call are level at (\d+)/, [0]],
    ],
    forbidden: [[/\bRelay is now 79\b/, '"Relay is now 79" (stale draft)']],
  },
  {
    file: 'RELAY-REVIEW-V2.1.md',
    label: 'v2.1',
    tableSection: ['## 1. Scoring', '### 1.2'],
    headlines: [
      ['§0.4', /Relay (\d+) \/ Close Call (\d+) \/ Open Door (\d+)/, [0, 1, 2]],
    ],
    forbidden: [
      [/\bRelay is now 79\b/, '"Relay is now 79" (stale draft)'],
      [/\b79\b(?=[^.]{0,40}Close Call)/, 'a 79-vs-80 comparison'],
    ],
  },
];

const failures = [];
const notes = [];

const numeric = (v) => /^\d+$/.test(v);
const clean = (v) => v.replace(/\*/g, '').trim();

for (const doc of DOCS) {
  const path = join(ROOT, doc.file);
  if (!existsSync(path)) {
    failures.push(`${doc.label}: missing ${doc.file}`);
    continue;
  }
  const text = readFileSync(path, 'utf8');

  // ── 1. table arithmetic ────────────────────────────────────────────────
  const [startMark, endMark] = doc.tableSection;
  const start = text.indexOf(startMark);
  const end = start === -1 ? -1 : text.indexOf(endMark, start);
  if (start === -1 || end === -1) {
    failures.push(`${doc.label}: could not locate the score table section`);
    continue;
  }
  const section = text.slice(start, end);

  const rows = [...section.matchAll(/^\|\s*(.+?)\s*\|\s*$/gm)]
    .map(([, body]) => body.split('|').map(clean))
    .filter((cells) => cells.length >= 3);

  const isTotal = (cells) => /TOTAL/i.test(cells[0]);
  // cells[0] is the row label; the three product scores are cells[1..3].
  const dims = rows.filter((c) => !isTotal(c) && c.slice(1, 4).every(numeric));
  const totalRow = rows.find(isTotal);

  if (!totalRow) {
    failures.push(`${doc.label}: no TOTAL row found`);
    continue;
  }
  if (dims.length === 0) {
    failures.push(`${doc.label}: no numeric dimension rows found`);
    continue;
  }

  const stated = totalRow.slice(1, 4).map(Number);
  const sums = [0, 1, 2].map((i) => dims.reduce((a, cells) => a + Number(cells[i + 1]), 0));
  sums.forEach((sum, i) => {
    if (sum !== stated[i]) {
      failures.push(`${doc.label} column ${i + 1}: dimensions sum to ${sum}, TOTAL says ${stated[i]}`);
    }
  });
  notes.push(`${doc.label}: table sums ${sums.join(' / ')} = total ${stated.join(' / ')} (${dims.length} dimensions)`);

  // ── 2. arithmetic shown in prose ───────────────────────────────────────
  for (const m of text.matchAll(/^([A-Z][A-Za-z ]+?)\s{2,}([\d\s+]+)=\s*(\d+)\s*$/gm)) {
    const parts = m[2].split('+').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum !== Number(m[3])) {
      failures.push(`${doc.label}: shown arithmetic "${m[1].trim()} … = ${m[3]}" actually sums to ${sum}`);
    }
  }

  // ── 3. the headline agrees with the table ──────────────────────────────
  for (const [where, re, idx] of doc.headlines) {
    const m = re.exec(text);
    if (!m) {
      failures.push(`${doc.label} ${where}: headline sentence not found`);
      continue;
    }
    idx.forEach((slot, i) => {
      const claimed = Number(m[i + 1]);
      if (claimed !== stated[slot]) {
        failures.push(`${doc.label} ${where}: claims ${claimed}, table says ${stated[slot]}`);
      }
    });
  }

  // ── 4. no superseded wording survives ──────────────────────────────────
  // Quoted material is stripped first: a review is allowed to *quote* the
  // sentence it is correcting, and v2.1 does exactly that in §1.3. It is not
  // allowed to assert it.
  const unquoted = text.replace(/["“][^"”]{0,400}["”]/g, '""');
  for (const [re, what] of doc.forbidden) {
    if (re.test(unquoted)) failures.push(`${doc.label}: stale text asserted — ${what}`);
  }

  // ── 5. evidence tags ───────────────────────────────────────────────────
  const malformed = text.match(/!\[(?:V|R|H|I|U)\]|\[\[(?:V|R|H|I|U)\]\]/g) ?? [];
  if (malformed.length) failures.push(`${doc.label}: malformed evidence tags: ${malformed.join(', ')}`);
}

for (const n of notes) console.log(`  ok   ${n}`);
for (const f of failures) console.log(`  FAIL ${f}`);
if (failures.length) {
  console.log(`\n${failures.length} consistency failure(s)`);
  process.exitCode = 1;
} else {
  console.log('\nreview documents are internally consistent');
}
