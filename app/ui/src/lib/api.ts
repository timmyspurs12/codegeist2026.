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
  const flagged = new URLSearchParams(window.location.search).has('forge');
  return h.endsWith('atlassian-dev.net') || h.endsWith('atlassian.net') || h === 'localhost' && flagged;
}

/**
 * Connect to the Forge bridge.
 *
 * Inside Forge, a failing bridge is an **error**, not a reason to show fixture
 * data: the product would be displaying invented cases on a customer site. So
 * this returns either a working invoker, or nothing-plus-a-reason when we are
 * outside Forge (the Vite preview and the screenshot pass), and it throws
 * inside Forge so the console can say what is wrong.
 */
async function connectBridge(): Promise<{ invoke: Invoker; workspace: Workspace } | { invoke: null; reason: 'outside_forge' }> {
  if (!insideAtlassian()) return { invoke: null, reason: 'outside_forge' };

  let bridge: typeof import('@forge/bridge');
  try {
    bridge = await import('@forge/bridge');
  } catch (err) {
    throw new Error(`The Forge bridge could not be loaded (${err instanceof Error ? err.message : String(err)}).`);
  }

  try {
    // A real workspace build reads several Jira issues, their ledgers and the
    // people who can own work. Two seconds was not enough and silently demoted
    // a live site to fixtures; this waits, and fails loudly instead.
    const res = await withTimeout(bridge.invoke('relay.bootstrap'), 20000);
    if (!res || typeof res !== 'object' || !('workspace' in (res as object))) {
      throw new Error('The bootstrap resolver returned no workspace.');
    }
    store = (res as { workspace: Workspace }).workspace;
    return { invoke: bridge.invoke as Invoker, workspace: store };
  } catch (err) {
    throw new Error(`Relay could not read the workspace from Jira: ${err instanceof Error ? err.message : String(err)}`);
  }
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

export type ScanResult = {
  issue: Issue;
  created: { code: string; quote: string; confidence: number }[];
  duplicates: number;
  rejected: { quote: string; reason: string; commentId?: string }[];
  scanned: { comments: number; sentences: number };
  /** Set when the console is running without a Forge bridge. */
  unavailable?: string;
};

export type EnforcementCheck = {
  key: string;
  allowed: boolean;
  code: string;
  message: string | null;
  counts: { open: number; overdue: number; unowned: number; awaitingReview: number } | null;
  stale: boolean;
  ledgerRev: number | null;
  projection: Record<string, unknown> | null;
  field: number | null;
  syncError: string | null;
  diagnostics: { level: 'info' | 'warn' | 'error'; code: string; message: string }[];
};

export const api = {
  async bootstrap(): Promise<{ workspace: Workspace; mode: DataMode }> {
    const conn = await connectBridge();
    if (conn.invoke) {
      invokeRemote = conn.invoke;
      mode = 'live';
      return { workspace: clone(conn.workspace), mode };
    }
    mode = 'fixture';
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

  /**
   * Ask Relay to read this issue's real Jira comments and queue anything that
   * reads like a promise. Outside Forge there are no comments to read, and the
   * call says so instead of inventing candidates.
   */
  async scan(key: string): Promise<ScanResult> {
    if (invokeRemote) {
      const res = (await invokeRemote('relay.capture.scan', { key })) as ScanResult;
      patchIssue(res.issue.key, () => res.issue);
      return res;
    }
    return {
      issue: clone(store.issues.find((i) => i.key === key) ?? store.issues[0]),
      created: [],
      duplicates: 0,
      rejected: [],
      scanned: { comments: 0, sentences: 0 },
      unavailable: 'Fixture mode: reading Jira comments needs the Forge bridge.',
    };
  },

  /** Track an issue so it appears in the workspace. */
  async track(key: string): Promise<Workspace> {
    if (invokeRemote) {
      const res = (await invokeRemote('relay.workspace.track', { key })) as { workspace: Workspace };
      store = res.workspace;
      return clone(store);
    }
    throw new Error('Fixture mode: tracking a Jira issue needs the Forge bridge.');
  },

  async settings(): Promise<Record<string, unknown>> {
    if (invokeRemote) return (await invokeRemote('relay.settings.get')) as Record<string, unknown>;
    return {
      openFieldId: null,
      capture: store.integrations.capture,
      validatorRegistered: false,
      conditionRegistered: false,
      customerTransitionsEnabled: store.integrations.enforcement.customerTransitionsEnabled,
    };
  },

  async saveSettings(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (invokeRemote) return (await invokeRemote('relay.settings.set', patch)) as Record<string, unknown>;
    return { ...(await api.settings()), ...patch };
  },

  async enforcementCheck(key: string): Promise<EnforcementCheck> {
    if (invokeRemote) return (await invokeRemote('relay.enforcement.check', { key })) as EnforcementCheck;
    const issue = store.issues.find((i) => i.key === key) ?? store.issues[0];
    return {
      key: issue.key,
      allowed: issue.closure.ready,
      code: issue.closure.ready ? 'clear' : 'blocked',
      message: issue.closure.validatorMessage,
      counts: {
        open: issue.closure.blockingCount,
        overdue: issue.closure.overdue,
        unowned: issue.closure.unowned,
        awaitingReview: issue.closure.awaitingReview,
      },
      stale: false,
      ledgerRev: null,
      projection: issue.closure.projection.value,
      field: null,
      syncError: null,
      diagnostics: [{
        level: 'info', code: 'fixture_mode',
        message: 'Fixture workspace: this check reports the in-memory projection, not a Jira issue property.',
      }],
    };
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
    if (issue.reporter) map.set(issue.reporter.id, issue.reporter);
  }
  map.set(store.viewer.id, store.viewer);
  return map.get(id) ?? store.viewer;
}

/**
 * People who can own a commitment here. In a live workspace this is what Jira
 * says about assignable users, plus everyone already named in a commitment —
 * never a fixture list.
 */
export const anyone = (): { id: string; name: string; initials: string }[] => {
  const seen = new Map<string, { id: string; name: string; initials: string }>();
  for (const p of store.people ?? []) seen.set(p.id, p);
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
