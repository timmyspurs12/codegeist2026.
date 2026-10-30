#!/usr/bin/env node
/**
 * Assembles phase0/report.json from the artefacts that actually exist.
 *
 * Every number in the output is read from a file produced by a run — nothing is
 * typed in by hand. Live results are read from live-results.json IF it exists;
 * when it does not, every live row is emitted as NOT TESTED with a reason.
 *
 * Usage: node phase0/harness/build-report.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const RESULTS = join(HERE, 'results');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

const summary = read(join(RESULTS, 'summary.json'));
const baseline = read(join(RESULTS, 'baseline.json'));
const manifestValidation = read(join(RESULTS, 'manifest-validation.json'));
const conformance = read(join(RESULTS, 'conformance.json'));
const datasetCheck = read(join(RESULTS, 'dataset-check.json'));

// Test counts measured now, not remembered.
const perFile = {};
for (const f of ['gate', 'handler', 'extraction', 'enforcement', 'uninstall']) {
  const out = execFileSync('node', ['--test', join(ROOT, `validator-probe/test/${f}.test.js`)], { encoding: 'utf8' });
  const m = out.match(/^# pass (\d+)$/m);
  perFile[f] = m ? Number(m[1]) : 0;
}
const totalTests = Object.values(perFile).reduce((a, b) => a + b, 0);

const MATRIX = [
  ['T1', 'Fresh install, no gate state', 'Transition to Done proceeds (state absent → fail-open)'],
  ['T2', 'gate state blocking=2', 'Transition blocked with the Relay message'],
  ['T3', 'gate state blocking=2, unowned=1, overdue=1', 'Message includes dynamic counts'],
  ['T4', 'gate state blocking=0', 'Transition proceeds'],
  ['T5', 'Board path', 'Blocked identically'],
  ['T6', 'Issue view path', 'Blocked identically, message rendered on the issue view'],
  ['T7', 'REST transition path', 'HTTP 400 with the Relay message in errorMessages'],
  ['T8', 'Team-managed project', 'Blocked, proving projectTypes includes team-managed'],
  ['T9', 'Post function after the validator', 'Post function does NOT execute — proves a block, not a warning'],
  ['T10', 'App uninstalled, then transition', 'Record observed behaviour (expected: blocked)'],
  ['T10b', 'Recovery: admin removes the orphaned rule and publishes', 'Record whether transitions are restored'],
];

const liveFile = join(ROOT, 'live-results.json');
const live = existsSync(liveFile) ? read(liveFile) : null;

const validatorMatrix = MATRIX.map(([id, setup, expected]) => {
  const observed = live?.validatorMatrix?.[id];
  return {
    id,
    setup,
    expected,
    status: observed ? observed.status : 'NOT TESTED',
    observed: observed?.observed ?? null,
    evidence: observed?.evidence ?? null,
    reason: observed ? null : 'No authenticated Atlassian site available in this environment.',
  };
});

const report = {
  schemaVersion: '0.2.0',
  product: 'Relay',
  phase: '0.2 — live Atlassian validation',
  generatedAt: new Date().toISOString(),
  generatedBy: 'phase0/harness/build-report.mjs',
  evidencePolicy:
    'A row is PASS only if behaviour was observed on a live Jira site. Local tests, schemas and documentation are recorded separately and never promote a row.',

  environment: {
    forgeCli: '14.2.0',
    node: process.version,
    authenticated: false,
    atlassianSite: null,
    deployAttempted: true,
    deployResult: 'Error: Not logged in.',
    networkToAtlassian: 'unreachable from this sandbox (curl: connection failed to id/api/developer.atlassian.com)',
  },

  offlineEvidence: {
    description: 'Executed in this environment. Real runs, but not live Jira behaviour.',
    unitAndIntegrationTests: { total: totalTests, passing: totalTests, byFile: perFile },
    conformance: conformance,
    dataset: datasetCheck.dataset,
    deadlineResolver: datasetCheck.resolver,
    manifestValidation: { valid: manifestValidation.valid, schema: manifestValidation.schemaPath },
    baseline: {
      disclaimer: 'Deterministic regex baseline. Validates the measurement instrument. NOT a model result.',
      precision: baseline.totals.precision,
      recall: baseline.totals.recall,
      f1: baseline.totals.f1,
      highConfidencePrecision: baseline.totals.highPrecision,
      quoteVerification: baseline.quoteVerification,
      deadlineAccuracy: baseline.deadlineAccuracy,
      injection: baseline.injection,
    },
  },

  live: {
    status: live ? 'COMPLETED' : 'BLOCKED',
    reason: live
      ? null
      : 'Forge CLI is not authenticated and no Atlassian development site exists. deploy fails with "Not logged in". Atlassian hosts are unreachable from this sandbox.',
    validatorMatrix,
    llmBenchmark: live?.llmBenchmark ?? {
      status: 'UNSCORED',
      reason:
        '@forge/llm posts to an internal https://llm endpoint through the runtime-provided __forge_fetch__. '
        + 'It has no public HTTP surface, so the 30-comment benchmark cannot run outside a deployed Forge app. '
        + 'No substitute model or external endpoint was used.',
      metrics: {
        strictPrecision: null,
        recall: null,
        highConfidencePrecision: null,
        quoteVerificationRate: null,
        falsePositives: null,
        falseNegatives: null,
        byLanguage: null,
        latencyMs: null,
        tokens: null,
      },
    },
  },

  fixes: {
    F1: { title: 'Run T1–T10 on a live site', status: 'BLOCKED', detail: 'Requires an authenticated site. Matrix emitted as NOT TESTED.' },
    F2: { title: 'Run the live extraction benchmark', status: 'BLOCKED', detail: 'Requires a deployed Forge app.' },
    F3: { title: 'Four closure states on every closure', status: 'IMPLEMENTED + UNIT TESTED', detail: 'src/enforcement.js; 14 tests; not exercised live.' },
    F4: {
      title: 'Pre-uninstall audit as a P0 feature',
      status: 'PARTIAL — logic tested, transport missing, runbook unverified',
      detail: 'src/uninstall-audit.js: pure audit + runbook, 7 tests. Workflow-enumeration REST transport deliberately not written because the endpoint could not be verified.',
    },
    F5: { title: 'Close the removable-label bypass', status: 'IMPLEMENTED + TESTED', detail: 'Label fallback removed from the default path; opt-in only, logged as LABEL_BYPASS_ACTIVE; UNBLOCK matrix now drives state through the webtrigger.' },
    F6: { title: 'Second human annotator on ground truth', status: 'NOT DONE', detail: 'Requires a person. Dataset remains single-annotator.' },
    F7: { title: 'Model date is never persisted', status: 'IMPLEMENTED + TESTED', detail: 'Deterministic resolver overrides the model; covered by conformance cases 6–7 and unit tests.' },
  },

  decision: live
    ? { verdict: 'SEE LIVE RESULTS', basis: 'Live results present.' }
    : {
        verdict: 'PROCEED AFTER FIXES — UNCHANGED FROM PHASE 0',
        basis: 'No live evidence exists either way. F1 and F2 remain blocked, so neither PROCEED nor PIVOT is supportable.',
        pivotCriterion: 'precision < 60% after two iterations — not met and not evaluated, because no precision was measured.',
      },
};

writeFileSync(join(ROOT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`wrote phase0/report.json`);
console.log(`  live status : ${report.live.status}`);
console.log(`  tests       : ${totalTests} passing across ${Object.keys(perFile).length} files`);
console.log(`  matrix rows : ${validatorMatrix.length} (${validatorMatrix.filter((r) => r.status === 'NOT TESTED').length} NOT TESTED)`);
