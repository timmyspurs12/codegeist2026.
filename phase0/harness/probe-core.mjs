/**
 * Pure helpers for the customer-transition probe.
 *
 * Kept separate from the CLI so the classification rules — the part that decides
 * what an HTTP response *means* — can be tested without a Jira site.
 */

/** The sentence the Relay validator returns. Used to tell "refused by Relay" from
 *  "refused by Jira for some unrelated reason", which is the difference between
 *  evidence and a coincidence. */
export const RELAY_MARKER = 'unresolved promises';

/**
 * @param {number} status HTTP status from POST /rest/api/3/issue/{key}/transitions
 * @param {any} body Parsed JSON body, or null when the body was empty
 * @returns {{outcome: string, relayMessage: string|null, jiraErrors: string[]}}
 */
export function classifyAttempt(status, body) {
  // The Jira issue endpoint returns errorMessages: []; the service-desk
  // (customer transition) endpoint returns errorMessage: "..." instead.
  const jiraErrors = [];
  if (Array.isArray(body?.errorMessages)) jiraErrors.push(...body.errorMessages);
  if (typeof body?.errorMessage === 'string') jiraErrors.push(body.errorMessage);
  if (typeof body?.message === 'string') jiraErrors.push(body.message);
  const joined = jiraErrors.join(' ');
  const hasRelay = joined.toLowerCase().includes(RELAY_MARKER);

  if (status >= 200 && status < 300) {
    return { outcome: 'allowed', relayMessage: null, jiraErrors };
  }
  if (hasRelay) {
    return { outcome: 'refused_by_relay', relayMessage: joined, jiraErrors };
  }
  return { outcome: 'refused_by_jira', relayMessage: null, jiraErrors };
}

/**
 * Did the validator run at all? A refusal carrying our message proves it did.
 * An allowance does not prove it was skipped — it may have been consulted and
 * passed — so this returns 'unknown' rather than 'skipped' for 2xx responses.
 *
 * @param {{outcome: string}} result
 */
export function validatorRan(result) {
  switch (result?.outcome) {
    case 'refused_by_relay': return 'yes';
    case 'refused_by_jira': return 'no';
    case 'allowed': return 'unknown';
    default: return 'unknown';
  }
}

/** @param {any} body Response of GET /rest/api/3/issue/{key}/transitions */
export function offeredList(body) {
  if (Array.isArray(body?.transitions)) return body.transitions;
  if (Array.isArray(body?.values)) return body.values;
  return null;
}

export function findTransition(body, nameOrId) {
  // Two shapes: the agent endpoint returns an array under `transitions`, the
  // service-desk customer endpoint returns a paged body under `values`. Reading
  // only the first made an offered customer transition look like no transition.
  const list = offeredList(body) ?? [];
  const wanted = String(nameOrId).toLowerCase();
  return list.find((t) => String(t.id) === String(nameOrId) || String(t.name).toLowerCase() === wanted) ?? null;
}

/** A transition that is unavailable to this caller won't be listed at all. */
export function isListed(body, nameOrId) {
  return findTransition(body, nameOrId) !== null;
}

export function buildAttemptBody(transitionId, resolution) {
  const payload = { transition: { id: String(transitionId) } };
  if (resolution) payload.fields = { resolution: { name: resolution } };
  return payload;
}
