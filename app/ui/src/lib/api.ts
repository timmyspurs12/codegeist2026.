import type { DataMode, Issue, Workspace } from './types';
import { fixtureWorkspace } from '../fixtures/workspace';
import { computeClosure } from './closure';

/**
 * One seam between the UI and its data.
 *
 * Inside Forge every call goes to a resolver (`app/src/index.js`). Outside
 * Forge — the Vite preview, or a screenshot pass — the same calls run against
 * an in-memory copy of the fixture workspace. The caller always learns which
 * it got, so the shell can say so out loud instead of pretending.
 */

let mode: DataMode = 'fixture';
export const currentMode = (): DataMode => mode;

let store: Workspace = structuredClone(fixtureWorkspace);

const clone = <T,>(v: T): T => structuredClone(v);
const nowIso = () => new Date().toISOString();

type Invoker = (name: string, payload?: unknown) => Promise<unknown>;

let invokeRemote: Invoker | null = null;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('bridge timeout')), ms)),
  ]);
}

function insideAtlassian(): boolean {
  const h = window.location.hostname;
  return h.endsWith('atlassian-dev.net') || h.endsWith('atlassian.net') || h === 'localhost' && new URLSearchParams(window.location.search).has('forge');
}

async function tryBridge(): Promise<Invoker | null> {
  // Outside an Atlassian frame there is nothing to invoke; say so immediately
  // rather than waiting for a bridge timeout on every load.
  if (!insideAtlassian()) return null;
  try {
    const bridge = await import('@forge/bridge');
    const probe = await withTimeout(bridge.invoke('relay.bootstrap'), 2200);
    if (probe && typeof probe === 'object' && 'workspace' in (probe as object)) {
      mode = 'live';
      store = (probe as { workspace: Workspace }).workspace;
      return bridge.invoke as Invoker;
    }
  } catch {
    /* No Forge bridge (local preview). Fixtures are the honest fallback. */
  }
  return null;
}

function patchIssue(key: string, fn: (issue: Issue) => Issue): Issue {
  const issues = store.issues.map((i) => (i.key === key ? fn(i) : i));
  store = { ...store, issues };
  const issue = issues.find((i) => i.key === key)!;
  return clone(issue);
}

function patchCommitment(key: string, code: string, fn: (c: Issue['commitments'][number]) => Issue['commitments'][number]) {
  return patchIssue(key, (issue) => {
    const commitments = issue.commitments.map((c) => (c.code === code ? fn(c) : c));
    return { ...issue, commitments, closure: computeClosure(commitments) };
  });
}

function logEvent(next: Issue, summary: string, detail: string | null, type: Workspace['activity'][number]['type'], actor = store.viewer, code: string | null = null) {
  store = {
    ...store,
    activity: [{ id: `a-${Math.random().toString(36).slice(2, 8)}`, at: nowIso(), type, actor, issueKey: next.key, commitmentCode: code, summary, detail }, ...store.activity],
  };
}

export const api = {
  async bootstrap(): Promise<{ workspace: Workspace; mode: DataMode }> {
    invokeRemote = await tryBridge();
    if (invokeRemote) {
      const res = (await invokeRemote('relay.bootstrap')) as { workspace: Workspace };
      store = res.workspace;
    }
    return { workspace: clone(store), mode };
  },

  async accept(key: string, code: string, ownerId: string, dueAt: string | null): Promise<Issue> {
    if (invokeRemote) return (await invokeRemote('relay.commitment.accept', { key, code, ownerId, dueAt })) as Issue;
    const person = findPerson(ownerId);
    const next = patchCommitment(key, code, (c) => ({ ...c, status: 'open', owner: person, dueAt, acceptedAt: nowIso() }));
    logEvent(next, `${code} accepted`, person ? `Owner set to ${person.name}.` : null, 'accepted', store.viewer, code);
    return next;
  },

  async reject(key: string, code: string, reason: string): Promise<Issue> {
    if (invokeRemote) return (await invokeRemote('relay.commitment.reject', { key, code, reason })) as Issue;
    const next = patchCommitment(key, code, (c) => ({ ...c, status: 'dropped', droppedReason: reason }));
    logEvent(next, `${code} sent back`, reason, 'dropped', store.viewer, code);
    return next;
  },

  async edit(key: string, code: string, text: string): Promise<Issue> {
    if (invokeRemote) return (await invokeRemote('relay.commitment.edit', { key, code, text })) as Issue;
    return patchCommitment(key, code, (c) => ({ ...c, text }));
  },

  async verify(key: string, code: string, note: string): Promise<Issue> {
    if (invokeRemote) return (await invokeRemote('relay.commitment.verify', { key, code, note })) as Issue;
    const next = patchCommitment(key, code, (c) => ({
      ...c, status: 'verified', verifiedAt: nowIso(), verifiedBy: store.viewer, verificationNote: note, overdue: false,
    }));
    logEvent(next, `${code} verified`, note, 'verified', store.viewer, code);
    return next;
  },

  async reassign(key: string, code: string, ownerId: string, reason: string): Promise<Issue> {
    if (invokeRemote) return (await invokeRemote('relay.commitment.reassign', { key, code, ownerId, reason })) as Issue;
    const person = findPerson(ownerId);
    const next = patchCommitment(key, code, (c) => ({
      ...c,
      previousOwners: c.owner ? [...c.previousOwners, { from: c.owner, to: person, at: nowIso(), by: store.viewer, reason }] : c.previousOwners,
      owner: person,
    }));
    logEvent(next, `${code} reassigned to ${person.name}`, reason, 'reassigned', store.viewer, code);
    return next;
  },

  async drop(key: string, code: string, reason: string): Promise<Issue> {
    if (invokeRemote) return (await invokeRemote('relay.commitment.drop', { key, code, reason })) as Issue;
    const next = patchCommitment(key, code, (c) => ({ ...c, status: 'dropped', droppedReason: reason }));
    logEvent(next, `${code} dropped`, reason, 'dropped', store.viewer, code);
    return next;
  },

  async saveCapture(prefs: Workspace['integrations']['capture']): Promise<Workspace> {
    if (invokeRemote) return (await invokeRemote('relay.settings.capture', prefs)) as Workspace;
    store = { ...store, integrations: { ...store.integrations, capture: prefs } };
    return clone(store);
  },
};

function findPerson(id: string) {
  const map = new Map<string, { id: string; name: string; initials: string; role?: string }>();
  for (const issue of store.issues) {
    for (const c of issue.commitments) {
      if (c.owner) map.set(c.owner.id, c.owner);
      for (const h of c.previousOwners) { map.set(h.from.id, h.from); map.set(h.to.id, h.to); map.set(h.by.id, h.by); }
      map.set(c.evidence.author.id, c.evidence.author);
    }
    if (issue.assignee) map.set(issue.assignee.id, issue.assignee);
    map.set(issue.reporter.id, issue.reporter);
  }
  map.set(store.viewer.id, store.viewer);
  return map.get(id) ?? store.viewer;
}

export const anyone = (): { id: string; name: string; initials: string }[] => {
  const seen = new Map<string, { id: string; name: string; initials: string }>();
  for (const issue of store.issues) {
    for (const c of issue.commitments) {
      if (c.owner) seen.set(c.owner.id, c.owner);
      for (const h of c.previousOwners) { seen.set(h.from.id, h.from); seen.set(h.to.id, h.to); }
    }
    if (issue.assignee) seen.set(issue.assignee.id, issue.assignee);
  }
  seen.set(store.viewer.id, store.viewer);
  return [...seen.values()];
};
