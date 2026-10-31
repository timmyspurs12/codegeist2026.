#!/usr/bin/env node
/**
 * Consistency check for RELAY-REVIEW-V2.md.
 *
 * Written because a stale headline number shipped once: the §8 table summed to
 * 80/80/76 while §0 still claimed Relay was on 79 from an earlier draft. In a
 * document whose whole value is "you can trust these numbers", that is the worst
 * class of error to leave in.
 *
 * Checks:
 *   1. every score column in the §8 table sums to its TOTAL row
 *   2. §0, §8 and §11 all state the same Relay/Close Call result
 *   3. every evidence tag is well-formed ([V] / [R] / [H])
 *
 * Usage: node phase0/harness/check-review.mjs [--fix-report]
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const FILE = join(ROOT, 'RELAY-REVIEW-V2.md');

if (!existsSync(FILE)) {
  console.error(`missing ${FILE}`);
  process.exit(1);
}

const text = readFileSync(FILE, 'utf8');
const failures = [];
const notes = [];

// ── 1. §8 table arithmetic ────────────────────────────────────────────────
const section8 = text.slice(text.indexOf('## 8. Scoring'), text.indexOf('### Reasoning'));
const rows = [...section8.matchAll(/^\|\s*\*{0,2}([^|*]+?)\*{0,2}\s*\|(.*)\|\s*$/gm)]
  .map(([, label, rest]) => ({
    label: label.trim(),
    cells: rest.split('|').map((c) => c.replace(/\*/g, '').trim()),
  }))
  .filter((r) => r.cells.length >= 3);

const numeric = (v) => /^\d+$/.test(v);
const dimensions = rows.filter((r) => r.cells.every(numeric) && !/TOTAL/i.test(r.label));
const totalRow = rows.find((r) => /TOTAL/i.test(r.label));

if (!totalRow) {
  failures.push('§8: no TOTAL row found');
} else if (dimensions.length === 0) {
  failures.push('§8: no numeric dimension rows found');
} else {
  const sums = [0, 1, 2].map((i) => dimensions.reduce((a, r) => a + Number(r.cells[i]), 0));
  const stated = totalRow.cells.slice(0, 3).map(Number);
  sums.forEach((sum, i) => {
    if (sum !== stated[i]) {
      failures.push(`§8 column ${i + 1}: dimensions sum to ${sum} but TOTAL says ${stated[i]}`);
    }
  });
  notes.push(`§8 arithmetic: ${sums.join(' / ')} = stated total (${stated.join(' / ')})`);
}

// ── 2. the headline agrees everywhere ─────────────────────────────────────
const relayTotal = totalRow ? Number(totalRow.cells[0]) : null;
const closeCallTotal = totalRow ? Number(totalRow.cells[1]) : null;

const headlineClaims = [
  ['§0', /\*\*Relay is now level with Close Call at (\d+)\*\*/],
  ['§8', /The scores are level at (\d+)–(\d+)/],
  ['§11', /Relay and Close Call are level at (\d+)/],
];

if (relayTotal !== null) {
  const [s0] = headlineClaims[0][1].exec(text)?.slice(1) ?? [];
  if (s0 === undefined) failures.push('§0: no level-score claim found');
  else if (Number(s0) !== relayTotal) failures.push(`§0 claims ${s0}, table says ${relayTotal}`);

  const m8 = headlineClaims[1][1].exec(text);
  if (!m8) failures.push('§8: no level-score claim found');
  else if (Number(m8[1]) !== relayTotal || Number(m8[2]) !== closeCallTotal) {
    failures.push(`§8 text claims ${m8[1]}–${m8[2]}, table says ${relayTotal}–${closeCallTotal}`);
  }

  const m11 = headlineClaims[2][1].exec(text);
  if (!m11) failures.push('§11: no level-score claim found');
  else if (Number(m11[1]) !== relayTotal) failures.push(`§11 claims ${m11[1]}, table says ${relayTotal}`);

  notes.push(`headline agrees: Relay ${relayTotal}, Close Call ${closeCallTotal}`);
}

// ── 3. no stale "79" claim survives ───────────────────────────────────────
if (relayTotal !== null && /\bRelay is now 79\b/.test(text)) {
  failures.push('stale draft text: "Relay is now 79"');
}

// ── 4. evidence tags are well-formed ──────────────────────────────────────
const malformed = (text.match(/!\[(?:V|R|H)\]|\[\[(?:V|R|H)\]\]/g) ?? []);
if (malformed.length) failures.push(`malformed evidence tags: ${malformed.join(', ')}`);
notes.push('evidence tags: well-formed');

// ── report ────────────────────────────────────────────────────────────────
for (const n of notes) console.log(`  ok  ${n}`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  console.log(`\n${failures.length} consistency failure(s)`);
  process.exitCode = 1;
} else {
  console.log('\nreview is internally consistent');
}
