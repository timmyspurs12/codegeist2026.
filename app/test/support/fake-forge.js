/**
 * A fake Jira site and a fake Forge storage, sized to the operations Relay
 * actually performs.
 *
 * This is not a mock library and it is not a claim about Atlassian's
 * behaviour: it is the smallest environment that lets the real handlers run
 * end to end — comments in, candidate out, ledger written, projection read
 * back, gate asked for a decision.
 */

export function createMemoryStorage({ dropWrites = 0, dropOn = (key) => key.startsWith('relay:ledger:'), failOn = null } = {}) {
  const map = new Map();
  let drops = dropWrites;
  return {
    map,
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : null;
    },
    async set(key, value) {
      if (failOn && failOn(key)) throw new Error(`storage_failure:${key}`);
      if (drops > 0 && dropOn(key)) {
        // Simulates a lost update: the write silently does not land.
        drops -= 1;
        return;
      }
      map.set(key, structuredClone(value));
    },
  };
}

import { normaliseComment, normaliseIssue } from '../../src/jira.js';

/** The app + environment segments of a module id, as Forge builds them. */
export const APP_ID = '11111111-2222-3333-4444-555555555555';
export const ENV_ID = '99999999-8888-7777-6666-555555555555';
export const MODULE_TYPE_PREFIX = `ari:cloud:ecosystem::extension/${APP_ID}/${ENV_ID}/static`;

/** A resolver context shaped like Forge's, including `localId`. */
export const forgeContext = (overrides = {}) => ({
  accountId: 'acc-maya',
  account: { displayName: 'Maya Okafor' },
  siteUrl: 'https://onepes930.atlassian.net',
  localId: `${MODULE_TYPE_PREFIX}/relay-workspace`,
  ...overrides,
});

export function createFakeJira({
  issue,
  comments = [],
  people = [],
  failProjection = false,
  fieldId = 'customfield_90001',
  fieldPresent = true,
}) {
  const properties = new Map();
  // The app-owned field: one value, plus enough recording to prove how it was
  // written. `ignored` simulates Jira accepting a write (204) that does not
  // change the stored value — the case read-back verification exists for.
  const field = { value: null, writes: [], issueIds: [], accepted: 0 };
  const calls = [];
  const state = {
    failProjection: Boolean(failProjection),
    failField: false,
    fieldIgnored: false,
    failFieldRead: false,
    fieldPresent,
    failProjectionAfter: null,
    projectionWrites: 0,
  };

  const requireOk = (label) => {
    if (label === 'projection' && state.failProjection) throw new Error('jira 500 on issue properties');
  };

  return {
    state,
    properties,
    field,
    calls,
    jira: {
      async getIssue(key) {
        calls.push(['getIssue', key]);
        if (key !== issue.key) throw new Error(`jira 404 on /rest/api/3/issue/${key}`);
        // The fake stands in for the data-access layer, so it returns the same
        // normalised shape `createJira` hands to the handlers.
        return normaliseIssue(structuredClone(issue));
      },
      async getComments(key) {
        calls.push(['getComments', key]);
        return structuredClone(comments).map(normaliseComment);
      },
      async readProperty(key, propKey) {
        calls.push(['readProperty', key, propKey]);
        requireOk('projection');
        return properties.has(key) ? structuredClone(properties.get(key)) : null;
      },
      async writeProperty(key, propKey, value) {
        calls.push(['writeProperty', key, propKey, value]);
        requireOk('projection');
        state.projectionWrites += 1;
        if (state.failProjectionAfter !== null && state.projectionWrites > state.failProjectionAfter) {
          throw new Error('jira 500 on issue properties (simulated outage)');
        }
        properties.set(key, structuredClone(value));
        return true;
      },
      async listFields() {
        calls.push(['listFields']);
        if (!state.fieldPresent) return [];
        return [
          { id: 'customfield_10000', name: 'Story Points', schema: { type: 'number', custom: 'com.pyxis.greenhopper.jira:story-points' } },
          { id: fieldId, name: 'Relay open commitments', schema: { type: 'number', custom: `${MODULE_TYPE_PREFIX}/relay-closure-count` } },
        ];
      },
      async findFieldByModuleType(typeId) {
        calls.push(['findFieldByModuleType', typeId]);
        if (!state.fieldPresent) return null;
        // The real lookup matches `schema.custom` exactly. The fake stands in
        // for a site where the manifest's field exists, so it echoes the type id
        // it was asked about — including a different environment's.
        if (!String(typeId ?? '').endsWith('/relay-closure-count')) return null;
        return {
          id: fieldId,
          key: `${typeId}__TEST__relay-closure-count`,
          name: 'Relay open commitments',
          typeId,
        };
      },
      /**
       * The private app-field API. Stands in for
       * PUT /rest/api/3/app/field/{fieldIdOrKey}/value.
       */
      async writeAppFieldValue(idOrKey, issueId, value) {
        calls.push(['writeAppFieldValue', idOrKey, issueId, value]);
        if (state.failField) {
          const status = typeof state.failField === 'number' ? state.failField : 403;
          const err = new Error(`app field ${idOrKey}: ${status} (simulated)`);
          err.name = 'AppFieldError';
          err.status = status;
          throw err;
        }
        // The real API takes numeric issue ids; `createJira` converts before it
        // sends, so the fake records what Jira would receive.
        field.issueIds.push(Number(issueId));
        field.writes.push({ fieldId: idOrKey, issueId: Number(issueId), value });
        field.accepted += 1;
        if (state.fieldIgnored) return { status: 204, accepted: true };
        field.value = value;
        return { status: 204, accepted: true };
      },
      async readField(key, fieldIdArg) {
        calls.push(['readField', key, fieldIdArg]);
        if (state.failFieldRead) throw new Error('jira 503 on issue field');
        if (!state.fieldPresent) return null;
        return field.value;
      },
      async searchPeople() {
        return structuredClone(people);
      },
      async searchIssueKeys() {
        return { keys: [issue.key], endpoint: 'search/jql', degraded: false };
      },
    },
  };
}

/** A Jira issue as the API returns it, before Relay normalises it. */
export function rawIssue({
  key = 'FS-101',
  summary = 'Kitchen extractor fan not working',
  status = 'In Progress',
  category = 'indeterminate',
  assignee = { accountId: 'acc-maya', displayName: 'Maya Okafor' },
  reporter = { accountId: 'acc-abe', displayName: 'A. Bello (tenant)' },
  priority = 'High',
  issueType = 'Repair',
  updated = '2026-11-04T09:12:00.000Z',
} = {}) {
  return {
    key,
    id: '10042',
    fields: {
      summary,
      status: { name: status, statusCategory: { key: category } },
      assignee,
      reporter,
      priority: { name: priority },
      updated,
      created: '2026-11-01T08:00:00.000Z',
      labels: ['relay-tracked'],
      issuetype: { name: issueType },
    },
  };
}

/** A comment as the API returns it (ADF body), with a promise inside it. */
export function rawComment({
  id = 'c-1042-3',
  author = { accountId: 'acc-tom', displayName: 'Tom Whitfield' },
  created = '2026-11-03T10:00:00.000Z',
  paragraphs = [
    'The blocked roof-outlet ducting is on order.',
    "I'll chase the supplier on Monday and confirm the Thursday access slot.",
    'Can you let the tenant know?',
  ],
} = {}) {
  return {
    id,
    author,
    created,
    updated: created,
    body: {
      type: 'doc',
      version: 1,
      content: paragraphs.map((text) => ({
        type: 'paragraph',
        content: [{ type: 'text', text }],
      })),
    },
  };
}
