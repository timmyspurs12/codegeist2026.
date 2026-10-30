/**
 * The gate handler, with its I/O injected.
 *
 * index.js binds the real Forge dependencies (kvs, asApp().requestJira).
 * Tests bind fakes. This is the only way to exercise the fallback paths that a
 * live deploy would take years to hit: KVS down, REST down, both down, malformed
 * payload, missing issue key.
 *
 * The handler must never throw: an exception in a workflow validator is an
 * unexplained block on a real person's case.
 */

import { decideGate, stateFromLabels, BASE_BLOCK_MESSAGE } from './gate.js';

/**
 * @param {{
 *   getGateState: (issueKey: string) => Promise<any|null>,
 *   getLabels: (issueKey: string) => Promise<string[]>,
 *   log?: (event: object) => void,
 * }} deps
 */
export function createGateHandler(deps) {
  const { getGateState, getLabels, log = () => {} } = deps;

  return async function gate(payload) {
    const issueKey = extractIssueKey(payload);
    let state = null;

    try {
      state = await getGateState(issueKey);
    } catch (err) {
      log({ event: 'gate_state_read_failed', issueKey, error: String(err) });
      state = null;
    }

    if (!state) {
      try {
        const labels = await getLabels(issueKey);
        state = stateFromLabels(Array.isArray(labels) ? labels : []);
      } catch (err) {
        log({ event: 'gate_label_read_failed', issueKey, error: String(err) });
        state = { stateAvailable: false };
      }
    }

    const decision = decideGate(state);
    log({ event: 'gate_decision', issueKey, result: decision.result, audit: decision.audit, state });

    return decision.result
      ? { result: true }
      : { result: false, errorMessage: decision.errorMessage || BASE_BLOCK_MESSAGE };
  };
}

/**
 * The validator payload shape is documented as providing the issue; older and
 * newer payload shapes have differed. Accept every plausible form and never
 * throw on an unexpected one.
 *
 * @param {any} payload
 * @returns {string}
 */
export function extractIssueKey(payload) {
  if (!payload) return 'UNKNOWN';
  if (typeof payload === 'string') return payload;
  if (payload.issueKey) return String(payload.issueKey);
  if (typeof payload.issue === 'string') return payload.issue;
  if (payload.issue && typeof payload.issue === 'object' && payload.issue.key) return String(payload.issue.key);
  if (payload.key) return String(payload.key);
  return 'UNKNOWN';
}
