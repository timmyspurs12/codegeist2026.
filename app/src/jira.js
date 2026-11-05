/**
 * The Jira data-access layer.
 *
 * Every Jira call Relay makes is defined here and nowhere else. Resolvers ask
 * this module for facts; they never build URLs. That is what makes it possible
 * to say, precisely, which endpoints the product uses and which of them have
 * been exercised.
 *
 * Two rules are enforced in this file:
 *
 *   1. **No invented values.** A missing field is `null`, never a plausible
 *      default. The UI is responsible for rendering an absence as an absence.
 *   2. **No silent fallbacks.** Where an endpoint has a newer replacement (the
 *      enhanced issue search) the fallback is attempted once, logged, and the
 *      result is marked `degraded` so the caller can surface it.
 */
import { commentBodyToText } from './adf.js';

/**
 * A failure from the private app-field API. Kept separate from JiraError
 * because the failure modes are the ones that decide whether enforcement holds:
 * a 403 means Relay is not the owner of the field (or the scope is missing), a
 * 404 means the field is gone, a 5xx means Jira could not answer. None of them
 * may be read as "zero open commitments".
 */
export class AppFieldError extends Error {
  constructor(fieldId, status, detail) {
    super(`app field ${fieldId}: ${status}${detail ? ` (${detail})` : ''}`);
    this.name = 'AppFieldError';
    this.fieldId = fieldId;
    this.status = status;
    this.reason = status === 400 ? 'value_rejected'
      : status === 401 ? 'app_not_authenticated'
        : status === 403 ? 'not_field_owner_or_missing_scope'
          : status === 404 ? 'field_not_found'
            : status === 429 ? 'rate_limited'
              : status >= 500 ? 'jira_unavailable'
                : 'unknown';
  }
}

export class JiraError extends Error {
  constructor(path, status, detail) {
    super(`jira ${status} on ${path}${detail ? `: ${detail}` : ''}`);
    this.name = 'JiraError';
    this.status = status;
    this.path = path;
  }
}

const ISSUE_FIELDS = ['summary', 'status', 'assignee', 'reporter', 'priority', 'updated', 'created', 'labels', 'issuetype'];

/**
 * @param {{ requestJira: Function, route: Function, log?: Function }} deps
 */
export function createJira({ requestJira, route, log = () => {} }) {
  async function call(r, init = {}) {
    const res = await requestJira(r, init);
    return res;
  }

  async function readJson(r, init) {
    const res = await call(r, init);
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch { /* body already consumed */ }
      throw new JiraError(String(r), res.status, detail);
    }
    return res.json();
  }

  async function getIssue(issueKey) {
    const data = await readJson(route`/rest/api/3/issue/${issueKey}?fields=${ISSUE_FIELDS.join(',')}`);
    return normaliseIssue(data);
  }

  async function getComments(issueKey, { pageSize = 100, maxPages = 20 } = {}) {
    const out = [];
    let startAt = 0;
    for (let page = 0; page < maxPages; page += 1) {
      const data = await readJson(route`/rest/api/3/issue/${issueKey}/comment?startAt=${String(startAt)}&maxResults=${String(pageSize)}`);
      const comments = Array.isArray(data.comments) ? data.comments : [];
      for (const c of comments) out.push(normaliseComment(c));
      const total = typeof data.total === 'number' ? data.total : out.length;
      startAt += comments.length;
      if (!comments.length || startAt >= total) break;
    }
    return out;
  }

  /**
   * Tracked issues: Relay's own marker label, so the workspace list is a Jira
   * query rather than a second source of truth that can drift.
   */
  async function searchIssueKeys(jql, { maxResults = 50 } = {}) {
    // Enhanced search (CHANGE-2046 replaces /rest/api/3/search with
    // /rest/api/3/search/jql). Cursor-paginated with nextPageToken.
    try {
      const data = await readJson(
        route`/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${String(maxResults)}&fields=key`,
      );
      const issues = Array.isArray(data.issues) ? data.issues : [];
      return { keys: issues.map((i) => i.key).filter(Boolean), endpoint: 'search/jql', degraded: false };
    } catch (err) {
      if (!(err instanceof JiraError) || ![400, 404, 405, 410].includes(err.status)) throw err;
      log({ event: 'jira_search_fallback', status: err.status });
      const data = await readJson(
        route`/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${String(maxResults)}&fields=key`,
      );
      const issues = Array.isArray(data.issues) ? data.issues : [];
      return {
        keys: issues.map((i) => i.key).filter(Boolean),
        endpoint: 'search',
        degraded: true,
        warning: `Enhanced issue search unavailable (${err.status}); used the deprecated endpoint.`,
      };
    }
  }

  /**
   * One page of an issue search, cursor-paginated.
   *
   * The backfill walks a project in pages rather than one unbounded query: a
   * resolver has a time limit, and an interrupted backfill must be resumable
   * from the token it returned rather than from the beginning.
   */
  async function searchIssuesPage(jql, { maxResults = 25, pageToken = null } = {}) {
    // The token is interpolated into the route template rather than appended to
    // its string form: `route` is a template tag, and its result is not a URL.
    const token = pageToken ? `&nextPageToken=${encodeURIComponent(pageToken)}` : '';
    try {
      const data = await readJson(
        route`/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${String(maxResults)}&fields=key${token}`,
      );
      const issues = Array.isArray(data.issues) ? data.issues : [];
      return {
        keys: issues.map((i) => i.key).filter(Boolean),
        nextPageToken: data.nextPageToken ?? null,
        total: typeof data.total === 'number' ? data.total : null,
        endpoint: 'search/jql',
        degraded: false,
      };
    } catch (err) {
      if (!(err instanceof JiraError) || ![400, 404, 405, 410].includes(err.status)) throw err;
      log({ event: 'jira_search_page_fallback', status: err.status });
      const startAt = Number(pageToken ?? 0) || 0;
      const data = await readJson(
        route`/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${String(maxResults)}&startAt=${String(startAt)}&fields=key`,
      );
      const issues = Array.isArray(data.issues) ? data.issues : [];
      const nextStart = startAt + issues.length;
      return {
        keys: issues.map((i) => i.key).filter(Boolean),
        nextPageToken: issues.length && nextStart < (data.total ?? 0) ? String(nextStart) : null,
        total: data.total ?? null,
        endpoint: 'search',
        degraded: true,
        warning: `Enhanced issue search unavailable (${err.status}); the deprecated endpoint paginates by offset.`,
      };
    }
  }

  async function readProperty(issueKey, propKey) {
    const res = await call(route`/rest/api/3/issue/${issueKey}/properties/${propKey}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new JiraError(`issue/${issueKey}/properties/${propKey}`, res.status);
    const body = await res.json();
    return body?.value ?? null;
  }

  async function writeProperty(issueKey, propKey, value) {
    const res = await call(route`/rest/api/3/issue/${issueKey}/properties/${propKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    if (!res.ok) throw new JiraError(`issue/${issueKey}/properties/${propKey}`, res.status);
    return true;
  }

  /**
   * Every field Jira knows about, used to resolve the app's own field by the
   * type id Forge derives from the manifest. Read once per resolution and
   * cached by the caller, not per mutation.
   */
  async function listFields() {
    const data = await readJson(route`/rest/api/3/field`);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Find the app-owned closure field. The match is exact on `schema.custom`,
   * which Forge documents as the module's full id
   * (`ari:cloud:ecosystem::extension/{appId}/{environmentId}/static/{moduleKey}`).
   * A near match is not accepted: a wrong field would be written into and read
   * from as if it were Relay's.
   */
  async function findFieldByModuleType(typeId) {
    if (!typeId) return null;
    const fields = await listFields();
    const hit = fields.find((f) => f?.schema?.custom === typeId);
    if (!hit) return null;
    return { id: hit.id ?? null, key: hit.key ?? null, name: hit.name ?? null, typeId };
  }

  /**
   * Write an app-owned custom field value.
   *
   * `PUT /rest/api/3/app/field/{fieldIdOrKey}/value` is the only supported way
   * to write a read-only field: the Edit Issue API is documented not to work on
   * read-only fields, and a field written that way would either fail or, worse,
   * be writable by anyone. A 204 here means Jira accepted the request. It is
   * not proof of what the field now holds — the caller reads back.
   */
  async function writeAppFieldValue(fieldIdOrKey, issueId, value) {
    if (!fieldIdOrKey) throw new AppFieldError(String(fieldIdOrKey), 0, 'no field id');
    if (issueId === null || issueId === undefined) {
      throw new AppFieldError(String(fieldIdOrKey), 0, 'no issue id');
    }
    const res = await call(route`/rest/api/3/app/field/${fieldIdOrKey}/value`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: [{ issueIds: [Number(issueId)], value }] }),
    });
    if (res.status !== 204 && !res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch { /* consumed */ }
      throw new AppFieldError(String(fieldIdOrKey), res.status, detail || res.statusText);
    }
    return { status: res.status, accepted: true };
  }

  async function readField(issueKey, fieldId) {
    const data = await readJson(route`/rest/api/3/issue/${issueKey}?fields=${fieldId}`);
    return data?.fields?.[fieldId] ?? null;
  }

  async function myself() {
    const data = await readJson(route`/rest/api/3/myself`);
    return { id: data.accountId, name: data.displayName ?? data.emailAddress ?? data.accountId };
  }

  /** People who can be assigned work on this issue — used for owner selection. */
  async function searchPeople(issueKey, query, { limit = 20 } = {}) {
    try {
      const data = await readJson(
        route`/rest/api/3/user/picker?query=${encodeURIComponent(query ?? '')}&issueKey=${issueKey}&maxResults=${String(limit)}`,
      );
      const users = data?.users ?? [];
      return users.map((u) => ({ id: u.accountId, name: u.displayName ?? u.accountId }));
    } catch (err) {
      if (!(err instanceof JiraError) || err.status !== 404) throw err;
      log({ event: 'jira_picker_unavailable' });
      const data = await readJson(
        route`/rest/api/3/user/assignable/search?issueKey=${issueKey}&query=${encodeURIComponent(query ?? '')}&maxResults=${String(limit)}`,
      );
      const users = Array.isArray(data) ? data : [];
      return users.map((u) => ({ id: u.accountId, name: u.displayName ?? u.accountId }));
    }
  }

  return {
    getIssue, getComments, searchIssueKeys, searchIssuesPage, readProperty, writeProperty,
    listFields, findFieldByModuleType, writeAppFieldValue, readField,
    myself, searchPeople,
  };
}

export function normaliseIssue(data) {
  const f = data?.fields ?? {};
  const category = f.status?.statusCategory?.key;
  return {
    key: data?.key ?? null,
    id: data?.id ?? null,
    summary: f.summary ?? null,
    status: f.status?.name ?? null,
    statusCategory: category === 'done' ? 'done' : category === 'new' ? 'to-do' : 'in-progress',
    assignee: personOrNull(f.assignee),
    reporter: personOrNull(f.reporter),
    priority: f.priority?.name ?? null,
    issueType: f.issuetype?.name ?? null,
    labels: Array.isArray(f.labels) ? f.labels : [],
    createdAt: f.created ?? null,
    updatedAt: f.updated ?? null,
  };
}

function personOrNull(p) {
  if (!p) return null;
  const name = p.displayName ?? p.accountId ?? 'Unknown';
  return { id: p.accountId ?? null, name, initials: initialsOf(name) };
}

export function initialsOf(name) {
  return String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('') || '?';
}

export function normaliseComment(c) {
  const text = commentBodyToText(c?.body);
  return {
    id: String(c?.id ?? ''),
    body: text,
    author: personOrNull(c?.author) ?? { id: null, name: 'Unknown', initials: '?' },
    createdAt: c?.created ?? null,
    updatedAt: c?.updated ?? null,
    // A caller can use this to notice that a comment was edited after Relay
    // quoted it: the text projection changes, so the hash changes.
    rawHash: hashOf(text),
  };
}

function hashOf(text) {
  // Small, dependency-free, non-cryptographic hash — only used to notice edits.
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
