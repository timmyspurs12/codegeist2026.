/**
 * Turn a Forge webtrigger event into a URL, so the rest of the lab handler can
 * read query parameters the normal way.
 *
 * Why this module exists
 * ----------------------
 * The Forge webtrigger runtime does NOT pass a `url` field. The event is:
 *
 *   { method, headers, body, path, userPath, queryParameters }
 *
 * where `queryParameters` is `{ [key]: string[] }`.
 * (developer.atlassian.com/platform/forge/events-reference/web-trigger/)
 *
 * The handler originally did `new URL(request?.url ?? 'https://probe.local/')`.
 * On a real trigger that expression always yielded the fallback URL, which has
 * no query string, so `action` silently defaulted to 'env' for every request.
 * Unit tests did not catch it because they passed a synthetic `{ url }` that the
 * runtime never sends.
 *
 * Live evidence of the failure mode: calling the deployed trigger with
 * `?action=bogus` returned the `env` payload instead of the
 * `{"error":"unknown action: bogus"}` response.
 *
 * This module accepts both shapes, so the tests and the live trigger are no
 * longer two different worlds. It is dependency-free on purpose: index.js
 * imports Forge packages that do not resolve outside the Forge runtime, and
 * this logic needs to stay testable there.
 */

/**
 * @param {{url?: string, queryParameters?: Record<string, string[] | string>}} request
 * @returns {URL}
 */
export function requestUrl(request) {
  if (typeof request?.url === 'string' && request.url.length > 0) {
    return new URL(request.url);
  }

  const search = new URLSearchParams();
  const params = request?.queryParameters ?? {};
  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== undefined && item !== null) search.append(key, String(item));
    }
  }

  const query = search.toString();
  return new URL(`https://probe.local/${query ? `?${query}` : ''}`);
}
