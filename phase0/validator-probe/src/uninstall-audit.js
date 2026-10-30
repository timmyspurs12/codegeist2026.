/**
 * Pre-uninstall audit and the administrator recovery runbook.
 *
 * WHY THIS EXISTS
 * ---------------
 * Relay's own code fails open. The platform appears to fail closed: when the
 * app that provides a workflow rule is unavailable, Jira treats the rule as
 * unmet, and a validator that never returns true blocks the transition.
 *
 * If that is right, an organisation that uninstalls Relay while a validator is
 * still attached to its Done transition can end up unable to close cases. That
 * is a customer outage sitting on the closure transition of a public-facing
 * workflow, so the mitigation is a feature, not a paragraph in the docs.
 *
 * WHAT IS AND IS NOT IMPLEMENTED
 * ------------------------------
 * - The audit logic below is PURE and unit-tested: given which workflows carry
 *   which rule keys, it says whether uninstalling is safe.
 * - The **transport** is NOT implemented. Enumerating a site's workflows and
 *   their attached rules needs a REST endpoint I could not verify from this
 *   environment, and inventing one from memory is exactly what this project has
 *   been told not to do. The transport is a ~20-line adapter behind
 *   `fetchWorkflows()` once the endpoint is confirmed on a live site.
 * - The recovery runbook is a documented procedure with `verified: false` on
 *   every step. It is what an administrator should try. It has not been
 *   executed against a blocked workflow.
 */

export const RUNBOOK_VERIFIED = false;

/**
 * Ordered recovery procedure for an administrator whose transitions are blocked
 * after an app was disabled or uninstalled.
 *
 * @type {{step: number, action: string, detail: string, verified: boolean}[]}
 */
export const RECOVERY_RUNBOOK = [
  {
    step: 1,
    action: 'Confirm the cause',
    detail: 'Open a blocked work item. If the transition is absent from the UI, or present but refused with a message you cannot place, suspect a missing workflow rule rather than a permission or screen problem.',
    verified: false,
  },
  {
    step: 2,
    action: 'Find the affected transitions',
    detail: 'Project settings → Workflows → open the workflow in the editor. Inspect each transition\'s Validators and Conditions for a rule whose app is no longer installed.',
    verified: false,
  },
  {
    step: 3,
    action: 'Remove the orphaned rule',
    detail: 'Select the transition → Validators → delete the missing validator. Repeat for conditions and post functions.',
    verified: false,
  },
  {
    step: 4,
    action: 'Publish the workflow',
    detail: 'An unpublished draft changes nothing. This is the step people miss.',
    verified: false,
  },
  {
    step: 5,
    action: 'Verify with a test work item',
    detail: 'Create a throwaway work item in the same project and attempt the same transition. Only a successful transition on a real item counts as recovery.',
    verified: false,
  },
  {
    step: 6,
    action: 'Re-enable Relay if the outage was accidental',
    detail: 'Reinstall the app, then re-add the validator to each affected transition and publish.',
    verified: false,
  },
];

/**
 * Is it safe to uninstall right now?
 *
 * @param {{
 *   workflows: {id: string, name: string, transitions: {id: string, name: string, validators?: {key: string}[], conditions?: {key: string}[], postFunctions?: {key: string}[]}[]}[],
 *   appRuleKeys: string[],
 * }} input
 * @returns {{
 *   safe: boolean,
 *   attachments: {workflowId: string, workflowName: string, transitionId: string, transitionName: string, ruleType: string, ruleKey: string}[],
 *   summary: string,
 *   checklist: string[],
 * }}
 */
export function auditUninstall({ workflows, appRuleKeys }) {
  const keys = new Set(appRuleKeys ?? []);
  const attachments = [];

  for (const wf of workflows ?? []) {
    for (const tr of wf?.transitions ?? []) {
      for (const [ruleType, list] of [
        ['validator', tr?.validators],
        ['condition', tr?.conditions],
        ['postFunction', tr?.postFunctions],
      ]) {
        for (const rule of list ?? []) {
          if (rule && keys.has(rule.key)) {
            attachments.push({
              workflowId: String(wf.id),
              workflowName: String(wf.name ?? '(unnamed)'),
              transitionId: String(tr.id),
              transitionName: String(tr.name ?? '(unnamed)'),
              ruleType,
              ruleKey: String(rule.key),
            });
          }
        }
      }
    }
  }

  const safe = attachments.length === 0;

  const checklist = safe
    ? ['No workflow rule from this app is attached anywhere. Uninstalling will not block any transition.']
    : [
        `STOP. ${attachments.length} workflow rule(s) from this app are still attached.`,
        'Remove each one below, publish the workflow, and verify a test transition before uninstalling.',
        'Uninstalling first can leave transitions permanently blocked.',
        ...attachments.map(
          (a) => `${a.workflowName} → ${a.transitionName} → ${a.ruleType} (${a.ruleKey})`,
        ),
      ];

  return {
    safe,
    attachments,
    summary: safe
      ? 'Safe to uninstall: no attached workflow rules.'
      : `NOT safe to uninstall: ${attachments.length} attached rule(s) across ${new Set(attachments.map((a) => a.workflowId)).size} workflow(s).`,
    checklist,
  };
}
