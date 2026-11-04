import { counts } from './ledger.js';
import { blockMessage, UNAVAILABLE_MESSAGE } from './gate.js';

/**
 * The workflow-facing entry points.
 *
 * The validator runs on agent and REST transitions and is the only path that
 * can return a human-readable refusal. The condition runs from a Jira
 * expression and cannot call this code at all — it reads the projection. Both
 * are wired from the same ledger; neither is allowed to be the sole guard.
 */

export function extractIssueKey(payload) {
  const candidates = [
    payload?.issue?.key,
    payload?.issueKey,
    payload?.context?.issueKey,
    payload?.extension?.issue?.key,
  ];
  const found = candidates.find((c) => typeof c === 'string' && /^[A-Z][A-Z0-9_]*-\d+$/.test(c));
  return found ?? null;
}

/**
 * @param {{ readLedger: (key: string) => Promise<any>, log?: (e: object) => void }} deps
 */
export function createClosureValidator(deps) {
  const { readLedger, log = () => {} } = deps;

  return async function closureValidator(payload) {
    const issueKey = extractIssueKey(payload);

    if (!issueKey) {
      // A validator that cannot tell which issue it is guarding must not guess.
      log({ event: 'validator_no_issue_key' });
      return { result: false, errorMessage: UNAVAILABLE_MESSAGE };
    }

    let ledger = null;
    try {
      ledger = await readLedger(issueKey);
    } catch (err) {
      log({ event: 'validator_ledger_read_failed', issueKey, error: String(err) });
      return { result: false, errorMessage: UNAVAILABLE_MESSAGE };
    }

    if (ledger === null || ledger === undefined) {
      // No ledger means Relay has never tracked this issue, which is a normal
      // state for unrelated work — but only when the app is installed and the
      // issue is in scope. Out of scope is decided by the workflow, not here.
      log({ event: 'validator_no_ledger', issueKey });
      return { result: true };
    }

    const c = counts(ledger);
    if (c.open === 0) {
      log({ event: 'validator_allow', issueKey, counts: c });
      return { result: true };
    }

    const message = blockMessage(c);
    log({ event: 'validator_block', issueKey, counts: c });
    return { result: false, errorMessage: message };
  };
}
