/**
 * Unit tests for the pre-uninstall audit.
 *
 * The audit's only job is to refuse to say "safe" when a rule is still attached.
 * A false "safe" here is a customer outage, so the tests lean towards paranoia.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { auditUninstall, RECOVERY_RUNBOOK, RUNBOOK_VERIFIED } from '../src/uninstall-audit.js';

const workflows = [{
  id: 'wf-1',
  name: 'Repairs workflow',
  transitions: [
    { id: 't-1', name: 'Done', validators: [{ key: 'relay-gate-probe' }], conditions: [], postFunctions: [] },
    { id: 't-2', name: 'In Progress', validators: [{ key: 'someone-elses-validator' }] },
  ],
}];

test('reports unsafe and names every attachment', () => {
  const r = auditUninstall({ workflows, appRuleKeys: ['relay-gate-probe'] });
  assert.equal(r.safe, false);
  assert.equal(r.attachments.length, 1);
  assert.equal(r.attachments[0].transitionName, 'Done');
  assert.equal(r.attachments[0].ruleType, 'validator');
  assert.match(r.summary, /NOT safe/);
  assert.ok(r.checklist[0].startsWith('STOP'));
  assert.ok(r.checklist.some((c) => c.includes('Repairs workflow') && c.includes('Done')));
});

test('only the app\'s own rule keys count', () => {
  const r = auditUninstall({ workflows, appRuleKeys: ['unrelated-key'] });
  assert.equal(r.safe, true);
  assert.equal(r.attachments.length, 0);
  assert.match(r.checklist[0], /No workflow rule from this app is attached/);
});

test('conditions and post functions are audited too, not just validators', () => {
  const wf = [{
    id: 'wf-2',
    name: 'Care workflow',
    transitions: [{
      id: 't-9',
      name: 'Close',
      validators: [],
      conditions: [{ key: 'relay-gate-probe' }],
      postFunctions: [{ key: 'relay-gate-probe' }],
    }],
  }];
  const r = auditUninstall({ workflows: wf, appRuleKeys: ['relay-gate-probe'] });
  assert.equal(r.safe, false);
  assert.deepEqual(r.attachments.map((a) => a.ruleType).sort(), ['condition', 'postFunction']);
});

test('counts distinct workflows in the summary', () => {
  const two = [
    ...workflows,
    { id: 'wf-3', name: 'Second', transitions: [{ id: 't-3', name: 'Done', validators: [{ key: 'relay-gate-probe' }] }] },
  ];
  const r = auditUninstall({ workflows: two, appRuleKeys: ['relay-gate-probe'] });
  assert.match(r.summary, /across 2 workflow/);
});

test('malformed input never produces a false "safe"', () => {
  // Missing transitions arrays are skipped, which is a genuine "nothing attached".
  assert.equal(auditUninstall({ workflows: [{ id: 'x', name: 'y' }], appRuleKeys: ['k'] }).safe, true);
  // But a rule that exists with no key must not silently pass as attached.
  assert.equal(auditUninstall({ workflows: [{ id: 'x', name: 'y', transitions: [{ id: 't', name: 'n', validators: [{}] }] }], appRuleKeys: ['k'] }).safe, true);
});

test('empty inputs are safe and do not throw', () => {
  assert.doesNotThrow(() => auditUninstall({ workflows: [], appRuleKeys: [] }));
  assert.doesNotThrow(() => auditUninstall({}));
  assert.equal(auditUninstall({}).safe, true);
});

test('the recovery runbook is present and every step is marked unverified', () => {
  assert.ok(RECOVERY_RUNBOOK.length >= 5);
  assert.equal(RUNBOOK_VERIFIED, false);
  for (const step of RECOVERY_RUNBOOK) {
    assert.equal(step.verified, false, `step ${step.step} must not claim verification`);
  }
});
