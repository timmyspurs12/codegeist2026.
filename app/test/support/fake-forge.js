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

export function createFakeJira({ issue, comments = [], people = [], failProjection = false }) {
  const properties = new Map();
  const field = { value: null };
  const calls = [];
  const state = { failProjection: Boolean(failProjection), failField: false, failProjectionAfter: null, projectionWrites: 0 };

  const requireOk = (label) => {
    if (label === 'projection' && state.failProjection) throw new Error('jira 500 on issue properties');
    if (label === 'field' && state.failField) throw new Error('jira 400 on issue update');
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
      async writeField(key, fieldId, value) {
        calls.push(['writeField', key, fieldId, value]);
        requireOk('field');
        field.value = value;
        return true;
      },
      async readField() {
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
