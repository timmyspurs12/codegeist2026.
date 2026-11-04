/**
 * Forge resolvers — the only way the Custom UI reaches Jira.
 *
 * The UI holds no token and runs inside the Forge iframe; every read and write
 * is authorised here against the invoking user or the app identity.
 */
import Resolver from '@forge/resolver';
import { storage } from '@forge/kvs';
import { api, route } from '@forge/api';
import { decideGate } from './gate.js';
import { appendEvent } from './audit.js';
import { syncIssue } from './sync.js';
import { PROJECTION_KEY } from './projection.js';

const resolver = new Resolver();
const ledgerKey = (issueKey) => `relay:ledger:${issueKey}`;
const AUDIT_KEY = 'relay:audit';

const readLedger = async (issueKey) => (await storage.get(ledgerKey(issueKey))) ?? null;
const writeLedger = async (ledger) => storage.set(ledgerKey(ledger.issueKey), ledger);

async function readProjection(issueKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/properties/${PROJECTION_KEY}`);
  if (res.status !== 200) return null;
  return (await res.json()).value ?? null;
}

async function writeProjection(issueKey, projection) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/properties/${PROJECTION_KEY}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projection),
  });
  if (!res.ok) throw new Error(`projection_write_failed:${res.status}`);
}

/**
 * The custom field the workflow condition reads. Its id is site-specific, so it
 * is configuration (app setting `relay.openFieldId`), never hard-coded.
 */
async function openFieldId() {
  return (await storage.get('relay.settings.openFieldId')) ?? null;
}

const io = {
  readLedger,
  readProjection,
  writeProjection,
  writeField: async (issueKey, value) => {
    const fieldId = await openFieldId();
    if (!fieldId) return; // Not configured yet: the property still carries the truth.
    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [fieldId]: value } }),
    });
    if (!res.ok) throw new Error(`field_write_failed:${res.status}`);
  },
  readField: async (issueKey) => {
    const fieldId = await openFieldId();
    if (!fieldId) return null;
    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}?fields=${fieldId}`);
    if (!res.ok) return null;
    const body = await res.json();
    return body.fields?.[fieldId] ?? null;
  },
};

function reasonsFor(c) {
  const out = [];
  if (c.overdue) out.push(`${c.overdue} accepted commitment${c.overdue > 1 ? 's are' : ' is'} past its due date.`);
  if (c.unowned) out.push(`${c.unowned} commitment${c.unowned > 1 ? 's have' : ' has'} no owner.`);
  if (c.awaitingReview) out.push(`${c.awaitingReview} captured suggestion${c.awaitingReview > 1 ? 's are' : ' is'} still awaiting review.`);
  return out;
}

async function issuePayload(key) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${key}?fields=summary,status,assignee,reporter,priority,updated,labels`);
  if (!res.ok) throw new Error(`issue_read_failed:${res.status}`);
  const data = await res.json();
  const ledger = await readLedger(key);
  const projection = await readProjection(key);
  const decision = decideGate(ledger, projection);
  return {
    key: data.key,
    summary: data.fields.summary,
    status: data.fields.status.name,
    statusCategory: data.fields.status.statusCategory.key === 'done' ? 'done' : data.fields.status.statusCategory.key === 'new' ? 'to-do' : 'in-progress',
    priority: data.fields.priority?.name ?? 'Medium',
    requestType: 'Report a repair',
    location: '',
    updatedAt: data.fields.updated,
    assignee: person(data.fields.assignee),
    reporter: person(data.fields.reporter),
    commitments: ledger?.commitments ?? [],
    closure: {
      ready: decision.allow,
      blockingCount: decision.counts?.open ?? 0,
      overdue: decision.counts?.overdue ?? 0,
      unowned: decision.counts?.unowned ?? 0,
      awaitingReview: decision.counts?.awaitingReview ?? 0,
      reasons: decision.counts ? reasonsFor(decision.counts) : ['Relay cannot read this case’s ledger.'],
      evaluatedAt: new Date().toISOString(),
      projection: {
        kind: 'issue-property', key: PROJECTION_KEY, value: projection ?? {},
        syncedAt: projection?.updatedAt ?? null, stale: Boolean(decision.stale),
      },
      validatorMessage: decision.message,
      conditionMessage: decision.allow ? null : 'Customer closure is restricted while commitments are unresolved.',
    },
  };
}

const person = (p) => (p ? { id: p.accountId, name: p.displayName, initials: initials(p.displayName) } : null);
const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

async function record(type, issueKey, commitmentCode, summary, detail, actor) {
  const trail = (await storage.get(AUDIT_KEY)) ?? null;
  const { trail: next } = appendEvent(trail, {
    id: `${type}:${issueKey}:${commitmentCode ?? '-'}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(), type, issueKey, commitmentCode, summary, detail, actor,
  });
  await storage.set(AUDIT_KEY, next);
}

async function mutate(key, fn) {
  const ledger = await readLedger(key);
  if (!ledger) throw new Error('ledger_missing');
  const next = { ...ledger, rev: ledger.rev + 1, updatedAt: new Date().toISOString(), commitments: ledger.commitments.map(fn) };
  await writeLedger(next);
  await syncIssue(io, key);
  return issuePayload(key);
}

resolver.define('relay.bootstrap', async ({ context }) => {
  const keys = await listTrackedIssues();
  const issues = await Promise.all(keys.map(issuePayload));
  const trail = (await storage.get(AUDIT_KEY)) ?? { seq: 0, events: [] };
  const site = context?.siteUrl?.replace('https://', '') ?? '';
  return {
    workspace: {
      id: context?.extension?.project?.id ?? 'relay',
      name: context?.extension?.project?.name ?? 'Relay workspace',
      site,
      plan: 'Repairs operations',
      viewer: { id: context?.accountId ?? 'me', name: 'Signed-in user', initials: 'ME' },
      issues,
      activity: trail.events,
      integrations: {
        jira: { connected: true, site, project: keys[0]?.split('-')[0] ?? '', lastSync: new Date().toISOString() },
        enforcement: {
          validatorInstalled: true,
          conditionInstalled: true,
          conditionExpression: `issue.${(await openFieldId()) ?? 'customfield_relay_open'} == 0`,
          customerTransitionsEnabled: false,
          portalNote: 'The customer portal ignores validators and offers no explanation. The workflow condition withholds the transition; it cannot say why.',
        },
        capture: (await storage.get('relay.settings.capture')) ?? { autoCapture: true, confidenceThreshold: 0.7, requireOwner: true },
      },
    },
  };
});

resolver.define('relay.commitment.accept', async ({ payload, context }) =>
  mutate(payload.key, (c) => (c.code === payload.code
    ? { ...c, status: 'open', owner: payload.ownerId, dueAt: payload.dueAt, acceptedAt: new Date().toISOString() }
    : c)).then(async (issue) => {
    await record('accepted', payload.key, payload.code, `${payload.code} accepted`, `Owner ${payload.ownerId}`, context?.accountId);
    return issue;
  }));

resolver.define('relay.commitment.verify', async ({ payload, context }) =>
  mutate(payload.key, (c) => (c.code === payload.code
    ? { ...c, status: 'verified', verifiedAt: new Date().toISOString(), verifiedBy: context?.accountId ?? null, verificationNote: payload.note, overdue: false }
    : c)).then(async (issue) => {
    await record('verified', payload.key, payload.code, `${payload.code} verified`, payload.note, context?.accountId);
    return issue;
  }));

resolver.define('relay.commitment.drop', async ({ payload, context }) =>
  mutate(payload.key, (c) => (c.code === payload.code ? { ...c, status: 'dropped', droppedReason: payload.reason } : c)).then(async (issue) => {
    await record('dropped', payload.key, payload.code, `${payload.code} dropped`, payload.reason, context?.accountId);
    return issue;
  }));

resolver.define('relay.commitment.reassign', async ({ payload, context }) =>
  mutate(payload.key, (c) => {
    if (c.code !== payload.code) return c;
    const previousOwners = c.owner
      ? [...(c.previousOwners ?? []), { from: c.owner, to: payload.ownerId, at: new Date().toISOString(), by: context?.accountId ?? null, reason: payload.reason }]
      : (c.previousOwners ?? []);
    return { ...c, owner: payload.ownerId, previousOwners };
  }).then(async (issue) => {
    await record('reassigned', payload.key, payload.code, `${payload.code} reassigned`, payload.reason, context?.accountId);
    return issue;
  }));

resolver.define('relay.settings.capture', async ({ payload }) => {
  await storage.set('relay.settings.capture', payload);
  return payload;
});

async function listTrackedIssues() {
  const res = await api.asApp().requestJira(route`/rest/api/3/search?jql=labels = relay-tracked ORDER BY updated DESC&maxResults=50&fields=key`);
  if (!res.ok) return [];
  return ((await res.json()).issues ?? []).map((i) => i.key);
}

export const handler = resolver.getDefinitions();
