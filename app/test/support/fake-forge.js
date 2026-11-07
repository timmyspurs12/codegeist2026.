/**
 * A fake Jira site and a fake Forge storage, sized to the operations Relay
 * actually performs.
 *
 * This is not a mock library and it is not a claim about Atlassian's
 * behaviour: it is the smallest environment that lets the real handlers run
 * end to end — comments in, candidate out, record committed, projection read
 * back, gate asked for a decision.
 *
 * Two fakes matter for P2.2, and both are deliberately *honest* about the
 * semantics the product now depends on:
 *
 *   * `createMemoryStorage` implements create-only writes
 *     (`keyPolicy: 'FAIL_IF_EXISTS'`) and prefix listing with a cursor, so the
 *     append-only audit trail is exercised rather than assumed;
 *   * `createMemoryRecords` implements conditional commits: `update` checks the
 *     stored revision at commit time and throws `RevisionConflict` when it has
 *     moved, and its `beforeCommit` hook lets a test pause a writer *between*
 *     its read and its commit. Without that hook a serial fake would make every
 *     concurrency test pass for the wrong reason.
 */
import { normaliseComment, normaliseIssue } from '../../src/jira.js';
import { RecordExists, RevisionConflict } from '../../src/store.js';
import { RECORD_ATTRIBUTES, fromStored, toStored } from '../../src/record-codec.js';

export function createMemoryStorage({ dropWrites = 0, dropOn = () => false, failOn = null } = {}) {
  const map = new Map();
  const calls = [];
  let drops = dropWrites;
  return {
    map,
    calls,
    async get(key) {
      calls.push(['get', key]);
      return map.has(key) ? structuredClone(map.get(key)) : null;
    },
    async set(key, value, options) {
      calls.push(['set', key, options ?? null]);
      if (failOn && failOn(key)) throw new Error(`storage_failure:${key}`);
      if (options?.keyPolicy === 'FAIL_IF_EXISTS' && map.has(key)) {
        const err = new Error('key already exists');
        err.code = 'ITEM_ALREADY_EXISTS';
        throw err;
      }
      if (drops > 0 && dropOn(key)) {
        // Simulates a lost update: the write silently does not land.
        drops -= 1;
        return;
      }
      map.set(key, structuredClone(value));
    },
    /**
     * One page of keys under a prefix, in key order. `limit` is honoured and a
     * `nextCursor` is returned when more remain, exactly like the real query.
     */
    async list(prefix, { limit = 200, cursor = null } = {}) {
      calls.push(['list', prefix, limit, cursor]);
      const keys = [...map.keys()].filter((k) => k.startsWith(prefix)).sort();
      const from = cursor ? keys.indexOf(cursor) : 0;
      const start = from < 0 ? 0 : from;
      const slice = keys.slice(start, start + limit);
      const last = slice[slice.length - 1];
      const nextCursor = start + slice.length < keys.length ? last : null;
      return { items: slice.map((k) => structuredClone(map.get(k))), nextCursor };
    },
  };
}

/**
 * The conditional record store, with the entity store's value rules.
 *
 * The map holds what Forge would hold — the *encoded* record — and `read`
 * decodes it, exactly as `createForgeRecords` does. That matters: a test that
 * asserted on decoded values while the fake stored decoded values would prove
 * nothing about the encoding, which is where the 422 came from.
 *
 * `raw(key)` returns the encoded value, so a test can assert on what would
 * actually be sent to the service.
 *
 * The value rules are enforced independently of `toStored`, from the declared
 * attributes: an undeclared attribute, a null (at any depth, inside `any`
 * included), an empty string, a wrong type, or a non-finite number is rejected
 * with the shape of error the service returns. If the codec ever stops stripping
 * something, these tests fail with the service's complaint rather than passing on
 * a fake that accepts anything.
 *
 * `hooks.beforeCommit` runs *before* the revision check and may await, which is
 * what lets a test interleave two writers deterministically:
 *
 *   const gate = latch();
 *   records.hooks.beforeCommit = async ({ op }) => {
 *     if (op === 'update' && first) { first = false; gate.reached.open(); await gate.released.promise; }
 *   };
 */
export function createMemoryRecords({ attributes = RECORD_ATTRIBUTES } = {}) {
  const map = new Map();
  const commits = [];
  const hooks = { beforeCommit: null, reads: 0, conflicts: 0, encoded: 0 };

  const encode = (issueKey, record) => {
    const stored = toStored(record);
    assertEntityValue(attributes, stored, issueKey);
    hooks.encoded += 1;
    return stored;
  };

  return {
    map,
    commits,
    hooks,
    attributes,
    /** What the service would hold — the encoded record, not the domain one. */
    raw(issueKey) {
      const value = map.get(issueKey);
      return value ? structuredClone(value) : null;
    },
    async read(issueKey) {
      hooks.reads += 1;
      const value = map.get(issueKey);
      return value ? fromStored(structuredClone(value)) : null;
    },
    async create(issueKey, record) {
      if (hooks.beforeCommit) await hooks.beforeCommit({ op: 'create', issueKey, expectedRev: null });
      const stored = encode(issueKey, record);
      if (map.has(issueKey)) {
        hooks.conflicts += 1;
        throw new RecordExists(issueKey);
      }
      map.set(issueKey, structuredClone(stored));
      commits.push({ op: 'create', issueKey, rev: stored.rev });
      return record;
    },
    async update(issueKey, expectedRev, record) {
      if (hooks.beforeCommit) await hooks.beforeCommit({ op: 'update', issueKey, expectedRev });
      const stored = encode(issueKey, record);
      const current = map.get(issueKey);
      const actual = current ? current.rev : null;
      if (actual !== expectedRev) {
        hooks.conflicts += 1;
        throw new RevisionConflict(expectedRev, actual);
      }
      map.set(issueKey, structuredClone(stored));
      commits.push({ op: 'update', issueKey, rev: stored.rev });
      return record;
    },
  };
}

/**
 * The Custom Entity Store's value rules, from the storage reference:
 * declared attributes only, `string` non-empty and non-whitespace, `integer`
 * 32-bit, and no `null` anywhere — `any` included, since `any` admits only
 * string/number/boolean/object/array.
 */
export function assertEntityValue(attributes, record, issueKey = '<key>') {
  const reject = (message) => {
    const err = new Error(`entity relay-ledger/${issueKey}: ${message}`);
    err.name = 'EntityValueError';
    err.code = 'INVALID_ENTITY_VALUE';
    err.status = 422;
    throw err;
  };

  if (!record || typeof record !== 'object' || Array.isArray(record)) reject('the value is not an object');

  for (const [name, value] of Object.entries(record)) {
    // `Object.hasOwn`, not `attributes[name]`: `toString` and friends live on the
    // prototype and would otherwise read as a declared type.
    if (!Object.hasOwn(attributes, name)) reject(`attribute "${name}" is not declared (the store rejects undeclared attributes)`);
    const type = attributes[name];
    if (type === 'string' && typeof value !== 'string') reject(`attribute "${name}" must be a string`);
    if (type === 'integer' && !Number.isInteger(value)) reject(`attribute "${name}" must be an integer`);
    if (type === 'integer' && (value < -2147483648 || value > 2147483647)) reject(`attribute "${name}" does not fit in 32 bits`);
    if (type === 'boolean' && typeof value !== 'boolean') reject(`attribute "${name}" must be a boolean`);
    checkStorable(name, value, reject);
  }
  return record;
}

function checkStorable(path, value, reject) {
  if (value === null || value === undefined) reject(`"${path}" is null, and the entity store has no null value`);
  if (typeof value === 'string') {
    if (value.trim() === '') reject(`"${path}" is an empty string, which the entity store does not accept`);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) reject(`"${path}" is not a finite number`);
    return;
  }
  if (typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkStorable(`${path}[${index}]`, item, reject));
    return;
  }
  if (typeof value === 'object') {
    if (value instanceof Date) reject(`"${path}" is a Date, which is not a storable type`);
    for (const [key, nested] of Object.entries(value)) checkStorable(`${path}.${key}`, nested, reject);
    return;
  }
  reject(`"${path}" is a ${typeof value}, which the entity store cannot hold`);
}

/** A promise plus its resolver, for deterministic interleaving in tests. */
export function latch() {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open };
}

/**
 * A pause with two edges: `reached` resolves when the writer arrives, `release`
 * lets it continue. One edge is not enough — a writer that resolves the promise
 * it is itself awaiting simply carries on, which is how a naive interleaving
 * test passes without interleaving anything.
 */
export function interleaver() {
  const reached = latch();
  const release = latch();
  return {
    reached: reached.promise,
    release: () => release.open(),
    pause: async () => {
      reached.open();
      await release.promise;
    },
  };
}

/** The app + environment segments of a module id, as Forge builds them. */
export const APP_ID = '11111111-2222-3333-4444-555555555555';
export const ENV_ID = '99999999-8888-7777-6666-555555555555';
export const MODULE_TYPE_PREFIX = `ari:cloud:ecosystem::extension/${APP_ID}/${ENV_ID}/static`;

export const COUNT_FIELD_ID = 'customfield_90001';
export const STATE_FIELD_ID = 'customfield_90002';

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
  extraIssues = {},
  issues = null,
  comments = [],
  people = [],
  failProjection = false,
  fieldId = COUNT_FIELD_ID,
  stateFieldId = STATE_FIELD_ID,
  fieldPresent = true,
  stateFieldPresent = true,
  commentsFail = false,
}) {
  const properties = new Map();
  // The two app-owned fields: one value each, plus enough recording to prove
  // how each was written. `ignored` simulates Jira accepting a write (204) that
  // does not change the stored value — the case read-back verification exists for.
  // Field values are per issue id, because the condition is per issue. `value`
  // is the primary issue's value (the one most tests care about).
  const primaryId = Number(issue.id ?? 0);
  const values = { count: new Map(), state: new Map() };
  const primary = (which) => ({
    get value() { return values[which].has(primaryId) ? values[which].get(primaryId) : null; },
    set value(v) { values[which].set(primaryId, v); },
  });
  const fields = {
    count: { id: fieldId, writes: [], issueIds: [], accepted: 0, ...Object.getOwnPropertyDescriptor(primary('count'), 'value') },
    state: { id: stateFieldId, writes: [], issueIds: [], accepted: 0, ...Object.getOwnPropertyDescriptor(primary('state'), 'value') },
  };
  Object.defineProperty(fields.count, 'value', { get() { return values.count.get(primaryId) ?? null; }, set(v) { values.count.set(primaryId, v); }, configurable: true, enumerable: true });
  Object.defineProperty(fields.state, 'value', { get() { return values.state.get(primaryId) ?? null; }, set(v) { values.state.set(primaryId, v); }, configurable: true, enumerable: true });
  const idOfKey = (key) => {
    if (key === issue.key) return primaryId;
    const extra = extraIssues[key];
    return extra ? Number(extra.id ?? 0) : null;
  };
  const calls = [];
  const state = {
    failProjection: Boolean(failProjection),
    failField: false,
    fieldIgnored: false,
    stateFieldIgnored: false,
    failFieldRead: false,
    failStateField: false,
    failField: false,
    fieldPresent,
    stateFieldPresent,
    commentsFail,
    failProjectionAfter: null,
    projectionWrites: 0,
    searchPages: null,
  };

  const requireOk = (label) => {
    if (label === 'projection' && state.failProjection) throw new Error('jira 500 on issue properties');
  };

  const byId = (id) => (id === fields.count.id ? fields.count : id === fields.state.id ? fields.state : null);

  return {
    state,
    properties,
    field: fields.count,
    fields,
    stateField: fields.state,
    calls,
    jira: {
      async getIssue(key) {
        calls.push(['getIssue', key]);
        const raw = key === issue.key ? issue : extraIssues[key];
        if (!raw) throw new Error(`jira 404 on /rest/api/3/issue/${key}`);
        // The fake stands in for the data-access layer, so it returns the same
        // normalised shape `createJira` hands to the handlers.
        return normaliseIssue(structuredClone(raw));
      },
      async getComments(key) {
        calls.push(['getComments', key]);
        if (state.commentsFail) throw new Error('jira 500 on comments (simulated)');
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
        const out = [];
        if (state.fieldPresent) {
          out.push({ id: fields.count.id, name: 'Relay open commitments', schema: { type: 'number', custom: `${MODULE_TYPE_PREFIX}/relay-closure-count` } });
        }
        if (state.stateFieldPresent) {
          out.push({ id: fields.state.id, name: 'Relay management state', schema: { type: 'string', custom: `${MODULE_TYPE_PREFIX}/relay-management-state` } });
        }
        return out;
      },
      async findFieldByModuleType(typeId) {
        calls.push(['findFieldByModuleType', typeId]);
        // The real lookup matches `schema.custom` exactly. The fake stands in
        // for a site where the manifest's fields exist, so it echoes the type id
        // it was asked about — including a different environment's.
        const id = String(typeId ?? '');
        if (id.endsWith('/relay-closure-count')) {
          return state.fieldPresent ? { id: fields.count.id, key: `${typeId}__TEST__relay-closure-count`, name: 'Relay open commitments', typeId } : null;
        }
        if (id.endsWith('/relay-management-state')) {
          return state.stateFieldPresent ? { id: fields.state.id, key: `${typeId}__TEST__relay-management-state`, name: 'Relay management state', typeId } : null;
        }
        return null;
      },
      /**
       * The private app-field API. Stands in for
       * PUT /rest/api/3/app/field/{fieldIdOrKey}/value.
       */
      async writeAppFieldValue(idOrKey, issueId, value) {
        calls.push(['writeAppFieldValue', idOrKey, issueId, value]);
        const target = byId(idOrKey);
        if (!target) throw new Error(`app field ${idOrKey}: 404 (unknown field)`);
        if (target === fields.count && state.failField) {
          const status = typeof state.failField === 'number' ? state.failField : 403;
          const err = new Error(`app field ${idOrKey}: ${status} (simulated)`);
          err.name = 'AppFieldError';
          err.status = status;
          throw err;
        }
        if (target === fields.state && state.failStateField) {
          throw new Error(`app field ${idOrKey}: 403 (simulated)`);
        }
        // The real API takes numeric issue ids; `createJira` converts before it
        // sends, so the fake records what Jira would receive.
        target.issueIds.push(Number(issueId));
        target.writes.push({ fieldId: idOrKey, issueId: Number(issueId), value });
        target.accepted += 1;
        const ignored = target === fields.count ? state.fieldIgnored : state.stateFieldIgnored;
        if (ignored) return { status: 204, accepted: true };
        const store = target === fields.count ? values.count : values.state;
        store.set(Number(issueId), value);
        return { status: 204, accepted: true };
      },
      async readField(key, fieldIdArg) {
        calls.push(['readField', key, fieldIdArg]);
        if (state.failFieldRead) throw new Error('jira 503 on issue field');
        const target = byId(fieldIdArg);
        if (!target) return null;
        if (target === fields.count && !state.fieldPresent) return null;
        if (target === fields.state && !state.stateFieldPresent) return null;
        const issueId = idOfKey(key);
        if (issueId === null) throw new Error(`jira 404 on /rest/api/3/issue/${key}`);
        const store = target === fields.count ? values.count : values.state;
        return store.has(issueId) ? store.get(issueId) : null;
      },
      async searchPeople() {
        return structuredClone(people);
      },
      async searchIssueKeys() {
        return { keys: [issue.key], endpoint: 'search/jql', degraded: false };
      },
      /**
       * One page of an issue search. `state.searchPages` is an array of pages so
       * a backfill can be driven over more than one call.
       */
      async searchIssuesPage(jql, { maxResults = 25, pageToken = null } = {}) {
        calls.push(['searchIssuesPage', jql, maxResults, pageToken]);
        if (state.searchPages) {
          const index = pageToken === null ? 0 : Number(pageToken);
          const page = state.searchPages[index] ?? { keys: [] };
          const nextIndex = index + 1 < state.searchPages.length ? String(index + 1) : null;
          return { keys: page.keys, nextPageToken: nextIndex, total: state.searchPages.reduce((n, p) => n + p.keys.length, 0), endpoint: 'search/jql', degraded: false };
        }
        const all = issues ?? [issue.key];
        return { keys: all.slice(0, maxResults), nextPageToken: null, total: all.length, endpoint: 'search/jql', degraded: false };
      },
    },
  };
}

/** A Jira issue as the API returns it, before Relay normalises it. */
export function rawIssue({
  key = 'FS-101',
  id = '10042',
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
    id,
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
