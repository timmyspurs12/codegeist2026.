import { decideClosure, UNKNOWN_STATE_MESSAGE, UNAVAILABLE_MESSAGE } from './gate.js';

/**
 * The workflow-facing entry points.
 *
 * The validator runs on agent and REST transitions and is the only path that
 * can return a human-readable refusal. The condition runs from a Jira
 * expression and cannot call this code at all — it reads the two app-owned
 * fields. Both are derived from the same record, and both are asked through
 * `decideClosure`, so they cannot disagree about an issue.
 *
 * P2.2 changed one rule here: an issue with **no record** used to be allowed.
 * It is now withheld, because the brief requires that `missing` is never read
 * as `unmanaged`: an issue Relay has not recorded has no management state, and
 * "no state" is not permission.
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
 * @param {{ readLedger: (key: string) => Promise<any>, now?: () => number, log?: (e: object) => void }} deps
 */
export function createClosureValidator(deps) {
  const { readLedger, now = () => Date.now(), log = () => {} } = deps;

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
      log({ event: 'validator_no_record', issueKey });
      return { result: false, errorMessage: UNKNOWN_STATE_MESSAGE };
    }

    const decision = decideClosure({ ledger, nowMs: now() });

    if (decision.allow) {
      log({ event: 'validator_allow', issueKey, code: decision.code, state: decision.state, counts: decision.counts });
      return { result: true };
    }

    log({ event: 'validator_block', issueKey, code: decision.code, state: decision.state, counts: decision.counts });
    return { result: false, errorMessage: decision.message ?? UNKNOWN_STATE_MESSAGE };
  };
}
