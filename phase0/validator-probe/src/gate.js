/**
 * Relay closure gate — pure decision logic.
 *
 * Deliberately dependency-free so it can be unit-tested outside the Forge
 * runtime and reviewed by a non-Forge engineer. The Forge handler in
 * ../index.js does I/O only; every decision happens here.
 *
 * CONTRACT (verified against @forge/cli 14.2.0 manifest schema and the
 * jira:workflowValidator documentation):
 *   return { result: true }                    -> transition proceeds
 *   return { result: false, errorMessage: "…" } -> transition blocked,
 *                                                 post-functions skipped
 *
 * NEVER call an LLM from this module or from its caller. The validator runs
 * inside the ~25s synchronous budget and must read precomputed state only.
 */

/** Fixed sentence from the Phase 0 brief. Always present, never reworded. */
export const BASE_BLOCK_MESSAGE =
  'Relay has unresolved promises attached to this case. Review the obligation ledger before closing it.';

/**
 * @typedef {Object} GateState
 * @property {boolean} enabled          Is Relay enforcing on this project?
 * @property {number}  blockingCount    Unresolved obligations that block closure
 * @property {number}  unownedCount     Subset of the above with no owner
 * @property {number}  overdueCount     Subset of the above past their due date
 * @property {boolean} stateAvailable   Did we successfully read precomputed state?
 * @property {'fail-open'|'fail-closed'} [policy]
 */

/**
 * Build the message shown to the person attempting the transition.
 * Counts are appended so the message is demonstrably derived from live state
 * (the probe's whole point) while the first sentence stays fixed.
 *
 * The message must never contain obligation content — only counts — because
 * anyone who can transition the issue will see it.
 */
export function buildBlockMessage(state) {
  const { blockingCount = 0, unownedCount = 0, overdueCount = 0 } = state ?? {};
  if (blockingCount <= 0) return BASE_BLOCK_MESSAGE;
  const parts = [];
  if (unownedCount > 0) parts.push(`${unownedCount} with no owner`);
  if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
  const detail = parts.length ? ` (${blockingCount} unresolved: ${parts.join(', ')})` : ` (${blockingCount} unresolved)`;
  return `${BASE_BLOCK_MESSAGE}${detail}`;
}

/**
 * Decide whether the transition may proceed.
 *
 * Failure policy (see VALIDATION-REPORT.md §6 for the full rationale):
 *  - storage unavailable -> allow, but emit an audit event. Relay must never
 *    be the reason a housing repair cannot be closed at 6pm on a Friday.
 *  - Relay disabled      -> allow, no audit noise beyond GATE_DISABLED.
 *  - state available     -> block only on a positive count.
 *
 * This function cannot throw. A throw inside a validator is an unexplained
 * block, which is the worst possible failure mode.
 *
 * @param {GateState} state
 * @returns {{result: boolean, errorMessage?: string, audit: {code: string, detail?: string}}}
 */
export function decideGate(state) {
  const policy = state?.policy === 'fail-closed' ? 'fail-closed' : 'fail-open';

  if (!state || state.stateAvailable === false) {
    if (policy === 'fail-closed') {
      return {
        result: false,
        errorMessage: BASE_BLOCK_MESSAGE,
        audit: { code: 'GATE_STATE_UNAVAILABLE_BLOCKED', detail: 'fail-closed policy' },
      };
    }
    return {
      result: true,
      audit: { code: 'GATE_STATE_UNAVAILABLE_ALLOWED', detail: 'fail-open policy' },
    };
  }

  if (state.enabled === false) {
    return { result: true, audit: { code: 'GATE_DISABLED' } };
  }

  const blocking = Number(state.blockingCount) || 0;
  if (blocking > 0) {
    return {
      result: false,
      errorMessage: buildBlockMessage(state),
      audit: {
        code: 'GATE_BLOCKED',
        detail: `blocking=${blocking} unowned=${Number(state.unownedCount) || 0} overdue=${Number(state.overdueCount) || 0}`,
      },
    };
  }

  return { result: true, audit: { code: 'GATE_PASSED' } };
}

/**
 * Derive gate state from a Jira issue's labels. Used by the probe so a tester
 * can flip the gate on and off without deploying anything.
 *
 * Label grammar: `relay-block` (1 unresolved), `relay-block-<n>` (n unresolved),
 * `relay-unowned-<n>`, `relay-overdue-<n>`.
 *
 * @param {string[]} labels
 * @param {{enabled?: boolean, policy?: string}} [config]
 * @returns {GateState}
 */
export function stateFromLabels(labels, config = {}) {
  const list = Array.isArray(labels) ? labels : [];
  const num = (prefix) => {
    const hit = list.find((l) => typeof l === 'string' && l.startsWith(prefix));
    if (!hit) return null;
    const suffix = hit.slice(prefix.length).replace(/^-/, '');
    if (suffix === '') return 1;
    const n = Number.parseInt(suffix, 10);
    return Number.isFinite(n) ? n : 1;
  };

  const blocking = num('relay-block');
  const enabled = config.enabled !== undefined ? config.enabled : blocking !== null;

  return {
    enabled,
    stateAvailable: true,
    blockingCount: blocking ?? 0,
    unownedCount: num('relay-unowned') ?? 0,
    overdueCount: num('relay-overdue') ?? 0,
    policy: config.policy,
  };
}
