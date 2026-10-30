/**
 * The gate handler, with its I/O injected.
 *
 * index.js binds the real Forge dependencies (kvs, requestJira). Tests bind
 * fakes. This is the only way to exercise the fallback paths that a live deploy
 * would take years to hit: store down, store slow, malformed payload, missing
 * issue key.
 *
 * TWO RULES ENCODED HERE
 * ----------------------
 * 1. **No label fallback by default.** Reading gate state from a Jira label lets
 *    anyone with edit permission remove the label and close the case — a bypass
 *    disguised as a fallback. Labels are opt-in (`allowLabelFallback: true`) and
 *    exist for the probe only. Production reads the entity store and nothing else.
 *
 * 2. **The handler never throws.** An exception inside a workflow validator is an
 *    unexplained block on a real person's case, which is worse than no validator.
 */

import { decideGate, stateFromLabels, BASE_BLOCK_MESSAGE } from './gate.js';

/**
 * @param {{
 *   getGateState: (issueKey: string) => Promise<any|null>,
 *   getLabels?: (issueKey: string) => Promise<string[]>,
 *   allowLabelFallback?: boolean,
 *   policy?: 'fail-open'|'fail-closed',
 *   log?: (event: object) => void,
 * }} deps
 */
export function createGateHandler(deps) {
  const {
    getGateState,
    getLabels,
    allowLabelFallback = false,
    policy,
    log = () => {},
  } = deps;

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
      if (allowLabelFallback && typeof getLabels === 'function') {
        // Probe-only path. Logged loudly because it is a bypass.
        log({ event: 'gate_label_fallback_used', issueKey, warning: 'LABEL_BYPASS_ACTIVE' });
        try {
          const labels = await getLabels(issueKey);
          state = stateFromLabels(Array.isArray(labels) ? labels : [], { policy });
        } catch (err) {
          log({ event: 'gate_label_read_failed', issueKey, error: String(err) });
          state = { stateAvailable: false, policy };
        }
      } else {
        state = { stateAvailable: false, policy };
      }
    }

    const decision = decideGate({ ...(state ?? {}), policy: (state && state.policy) ?? policy });
    log({ event: 'gate_decision', issueKey, result: decision.result, audit: decision.audit, state });

    return decision.result
      ? { result: true }
      : { result: false, errorMessage: decision.errorMessage || BASE_BLOCK_MESSAGE };
  };
}

/**
 * The validator payload shape, verified against the module documentation:
 *
 *   { issue: { key }, configuration: {}, transition: { from, to, modifiedFields } }
 *
 * Older and newer payloads have differed, so accept every plausible form and
 * never throw on an unexpected one.
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
