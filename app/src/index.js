import { createClosureValidator } from './workflow.js';
import { createStore } from './store.js';
import { createHandlers } from './handlers.js';
import { forgeDeps } from './deps.js';

const deps = forgeDeps();
const store = createStore(deps);

/* ---------------------------------------------- workflow validator (agent + REST) */

export const closureValidator = createClosureValidator({
  readLedger: (issueKey) => store.readLedger(issueKey),
  log: deps.log,
});

/* ------------------------------------------------------- issue created trigger */

/**
 * Every issue created after the app is installed is recorded as `unmanaged`,
 * so it is never withheld for the wrong reason — and so the issue never sits in
 * the "no record" state that the validator and the condition both refuse.
 *
 * The handler is the same one the backfill uses, so the two cannot disagree
 * about what "record an issue as unmanaged" means. If the fields cannot be
 * written the record still exists (unmanaged) and the issue stays blocked until
 * reconcile repairs the fields — which is the safe direction.
 */
export const onIssueCreated = async (event, context) => {
  const key = event?.issue?.key ?? event?.issueKey ?? event?.issue?.fields?.key ?? null;
  if (!key) {
    deps.log({ event: 'trigger_no_issue_key' });
    return { ok: false, reason: 'issue_key_missing' };
  }
  const handlers = createHandlers(deps);
  try {
    const result = await handlers['relay.state.init']({ payload: { key, source: 'trigger' }, context });
    deps.log({ event: 'trigger_state_init', key, created: result.created, state: result.state, degraded: result.degraded ?? null });
    return { ok: true, ...result };
  } catch (err) {
    // A trigger must not throw: Forge would retry the invocation, and a retry
    // cannot fix a missing field. The failure is logged and the issue stays
    // withheld, which is visible in reconcile.
    deps.log({ event: 'trigger_state_init_failed', key, error: String(err?.message ?? err) });
    return { ok: false, key, error: String(err?.message ?? err) };
  }
};

/* ------------------------------------------------ resolvers used by the console */

export { handler } from './resolvers.js';
