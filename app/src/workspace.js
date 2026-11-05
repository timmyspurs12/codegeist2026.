/**
 * The adapter between Relay's stored records and the console's data contract.
 *
 * Nothing here invents a value. A Jira field the API did not return is `null`,
 * a projection that is missing is `null`, and the console is told which of
 * those happened so it can render an absence instead of a plausible default.
 *
 * Fixture data never passes through this file: if the workspace is built here,
 * every issue came from Jira and every commitment came from Relay's ledger.
 */
import { counts, isOverdue, isUnresolved } from './ledger.js';
import { decideClosure } from './gate.js';
import { PROJECTION_KEY } from './projection.js';
import { CLOSURE_FIELD_PLACEHOLDER, STATE_FIELD_PLACEHOLDER, closureExpression, describeFields } from './field.js';

export function toUiCommitment(issueKey, c, nowMs) {
  return {
    id: `${issueKey}:${c.code}`,
    code: c.code,
    issueKey,
    text: c.text,
    originalText: c.originalText ?? c.text,
    evidence: {
      commentId: c.evidence?.commentId ?? '',
      author: c.evidence?.author ?? { id: null, name: 'Unknown', initials: '?' },
      createdAt: c.evidence?.commentCreatedAt ?? c.evidence?.capturedAt ?? null,
      body: c.evidence?.body ?? '',
      quote: c.evidence?.quote ?? '',
      start: c.evidence?.start ?? 0,
      end: c.evidence?.end ?? 0,
      fingerprint: c.evidence?.fingerprint ?? null,
      bodyFormat: c.evidence?.bodyFormat ?? 'adf-text',
    },
    owner: c.owner ?? null,
    previousOwners: c.previousOwners ?? [],
    status: c.status,
    dueAt: c.dueAt ?? null,
    dueBasis: c.dueBasis ?? null,
    acceptedAt: c.acceptedAt ?? null,
    acceptedBy: c.acceptedBy ?? null,
    verifiedAt: c.verifiedAt ?? null,
    verifiedBy: c.verifiedBy ?? null,
    verificationNote: c.verificationNote ?? null,
    droppedReason: c.droppedReason ?? null,
    confidence: typeof c.confidence === 'number' ? c.confidence : 0,
    signals: c.signals ?? [],
    overdue: c.status === 'open' && isOverdue(c, nowMs),
  };
}

export function reasonsFor(c) {
  const out = [];
  if (c.awaitingReview) {
    out.push(`${c.awaitingReview} captured suggestion${c.awaitingReview > 1 ? 's are' : ' is'} still awaiting review.`);
  }
  if (c.overdue) out.push(`${c.overdue} accepted commitment${c.overdue > 1 ? 's are' : ' is'} past its due date.`);
  if (c.unowned) out.push(`${c.unowned} commitment${c.unowned > 1 ? 's have' : ' has'} no owner.`);
  return out;
}

/**
 * @param {{ issue: object, ledger: object|null, projection: object|null,
 *   decision: object, now: Date, diagnostics?: object[] }} input
 */
export function buildIssue({ issue, ledger, projection, decision, now, diagnostics = [] }) {
  const commitments = (ledger?.commitments ?? []).map((c) => toUiCommitment(issue.key, c, now.getTime()));
  // A guard projection is deliberately pessimistic: it is written before the
  // commit and says "blocked". Reading it back as "fresh" would be a lie about
  // why the field is high, so it is reported as stale until reconciled.
  const stale = Boolean(decision.stale || projection?.guard);
  // "Relay has never looked at this issue" and "Relay cannot read this issue's
  // ledger" are different states and must not be conflated. An untracked issue
  // has nothing for Relay to block on; a ledger that exists but cannot be read
  // is a failure, and `decideGate` already answers that one with `unavailable`.
  const reasons = decision.counts
    ? reasonsFor(decision.counts)
    : [decision.message ?? 'Relay could not read this case’s commitment ledger, so closure is blocked rather than allowed.'];
  // The management state is a first-class part of the contract in P2.2: a case
  // Relay does not manage is permitted for a different reason than one it
  // manages and has cleared, and the console says which.
  const state = ledger?.state ?? null;
  const managed = state === 'managed';
  const unmanaged = state === 'unmanaged';
  const initializing = state === 'initializing';

  if (!ledger) {
    diagnostics.push({
      level: 'warn',
      code: 'no_record',
      issueKey: issue.key,
      message: 'Relay has no record for this case, so it has no management state and closure is withheld. Run Backfill, or Track this issue.',
    });
  } else if (initializing) {
    diagnostics.push({
      level: 'warn',
      code: 'initializing',
      issueKey: issue.key,
      message: 'Relay is initialising this case: capture did not finish, so closure is withheld until Track completes.',
    });
  }
  if (stale && ledger) {
    diagnostics.push({
      level: 'warn',
      code: 'projection_stale',
      issueKey: issue.key,
      message: 'The closure projection on this issue does not match Relay’s ledger. Agents are still blocked by the validator, which reads the ledger.',
    });
  }

  return {
    key: issue.key,
    summary: issue.summary,
    status: issue.status,
    statusCategory: issue.statusCategory,
    priority: issue.priority,
    issueType: issue.issueType,
    assignee: issue.assignee,
    reporter: issue.reporter,
    requestType: issue.issueType ?? null,
    location: null,
    updatedAt: issue.updatedAt,
    commitments,
    // Per-request diagnostics travel with the issue so a mutation that saved
    // the ledger but could not update the projection or field is visible where
    // the decision is shown, not only in a log.
    diagnostics,
    management: {
      state,
      managed,
      unmanaged,
      initializing,
      known: Boolean(ledger),
      label: !ledger ? 'No record' : unmanaged ? 'Not managed by Relay' : initializing ? 'Initialising' : 'Managed by Relay',
    },
    closure: {
      // Readiness is the decision, not the absence of a ledger. P2.1 treated an
      // untracked issue as ready, which is exactly the fail-open P2.2 removes.
      ready: decision.allow,
      blockingCount: decision.counts?.open ?? 0,
      overdue: decision.counts?.overdue ?? 0,
      unowned: decision.counts?.unowned ?? 0,
      awaitingReview: decision.counts?.awaitingReview ?? 0,
      reasons: decision.allow ? [] : reasons,
      evaluatedAt: now.toISOString(),
      projection: {
        kind: 'issue-property',
        key: PROJECTION_KEY,
        value: projection ?? {},
        syncedAt: projection?.updatedAt ?? null,
        stale,
      },
      validatorMessage: decision.allow ? null : decision.message,
      conditionMessage: decision.allow
        ? null
        : unmanaged
          ? null
          : 'Customer closure is withheld while Relay is initialising this case or commitments are unresolved. The condition cannot explain why.',
      decisionCode: decision.code,
    },
  };
}

/**
 * Merge per-issue audit streams into the console's single activity list.
 * Events are deduplicated by id; ordering is by `at`, then by id, so the list
 * is stable across reloads even when two events share a second.
 */
export function mergeActivity(trails, limit = 250) {
  const seen = new Set();
  const events = [];
  for (const trail of trails) {
    for (const e of trail?.events ?? []) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      events.push({
        id: e.id,
        at: e.at,
        type: e.type,
        actor: e.actor ?? null,
        issueKey: e.issueKey,
        commitmentCode: e.commitmentCode ?? null,
        summary: e.summary,
        detail: e.detail ?? null,
      });
    }
  }
  return events
    .sort((a, b) => (a.at === b.at ? String(b.id).localeCompare(String(a.id)) : String(b.at).localeCompare(String(a.at))))
    .slice(0, limit);
}

export function conditionExpression(fieldIds) {
  // One builder, in field.js, so the manifest, the console and the tests cannot
  // disagree about what the condition evaluates.
  if (typeof fieldIds === 'string') return closureExpression({ count: fieldIds });
  return closureExpression(fieldIds ?? { count: CLOSURE_FIELD_PLACEHOLDER, state: STATE_FIELD_PLACEHOLDER });
}

export const PORTAL_NOTE =
  'The customer portal skips workflow validators, so a validator alone does not cover it. The condition withholds the transition instead, reading the number in Relay’s read-only closure field. It cannot explain itself: a customer sees only that the transition is unavailable.';

/**
 * Build the whole console workspace from Jira + Relay storage.
 *
 * @param {{ jira: object, store: object, settings: object, context: object,
 *           now: Date, log?: Function }} deps
 */
export async function buildWorkspace({ jira, store, settings, context, now, log = () => {}, field = null }) {
  const diagnostics = [];
  const tracked = await store.tracked();
  const projectKeys = new Set();
  const issues = [];
  const trails = [];

  for (const entry of tracked) {
    try {
      const issue = await jira.getIssue(entry.key);
      const ledger = await store.readLedger(entry.key);
      let projection = null;
      try {
        projection = await jira.readProperty(entry.key, PROJECTION_KEY);
      } catch (err) {
        diagnostics.push({
          level: 'warn', code: 'projection_unreadable', issueKey: entry.key,
          message: `The closure projection could not be read (${err.message}). Closure is treated as blocked.`,
        });
      }
      const decision = decideClosure({ ledger, projection, nowMs: now.getTime() });
      issues.push(buildIssue({ issue, ledger, projection, decision, now, diagnostics }));
      trails.push(await store.readAudit(entry.key));
      projectKeys.add(entry.key.split('-')[0]);
    } catch (err) {
      log({ event: 'workspace_issue_failed', key: entry.key, error: String(err?.message ?? err) });
      diagnostics.push({
        level: 'error', code: 'issue_unavailable', issueKey: entry.key,
        message: `Jira did not return ${entry.key} (${err.message}). It is listed as tracked but cannot be shown.`,
      });
    }
  }

  const people = await collectPeople({ jira, issues, context });
  const closureField = describeFields(field ?? {});

  return {
    workspace: {
      id: context?.extension?.project?.id ? String(context.extension.project.id) : `relay:${[...projectKeys].join(',') || 'unbound'}`,
      name: context?.extension?.project?.name ?? projectName(projectKeys),
      site: siteOf(context),
      plan: 'Repairs operations',
      viewer: {
        id: context?.accountId ?? 'unknown',
        name: context?.account?.displayName ?? 'Signed-in user',
        initials: initialsOf(context?.account?.displayName ?? 'Signed in'),
      },
      issues,
      activity: mergeActivity(trails),
      people,
      diagnostics,
      dataSource: 'jira',
      integrations: {
        jira: {
          connected: true,
          site: siteOf(context),
          project: [...projectKeys][0] ?? '',
          lastSync: now.toISOString(),
        },
        enforcement: {
          validatorInstalled: Boolean(settings.validatorRegistered),
          conditionInstalled: Boolean(settings.conditionRegistered),
          conditionExpression: closureField.expression,
          customerTransitionsEnabled: Boolean(settings.customerTransitionsEnabled),
          portalNote: PORTAL_NOTE,
          verification: settings.validatorRegistered || settings.conditionRegistered ? 'declared' : 'unverified',
          // The app-owned field, resolved for this app and environment. `id` is
          // null until Jira returns it, and null is not zero: the console shows
          // "not resolved" rather than pretending the condition can read.
          field: closureField,
          fieldId: closureField.id,
          fieldKey: closureField.key,
          fieldTypeId: closureField.typeId,
          fieldResolved: closureField.resolved,
          // Both app-owned fields. `resolved` is true only when Jira has
          // returned an id for each, because the condition reads both.
          fields: { count: closureField.count, state: closureField.state },
          manifestLine: closureField.manifestLine,
          expressionApplied: settings.closureExpressionApplied ?? null,
        },
        capture: settings.capture,
      },
    },
  };
}

function projectName(keys) {
  const list = [...keys];
  return list.length ? `Project ${list.join(', ')}` : 'Relay workspace';
}

function siteOf(context) {
  const raw = context?.siteUrl ?? '';
  return raw.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function initialsOf(name) {
  return String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('') || '?';
}

/**
 * People for the owner picker. Sourced from Jira's assignable users for the
 * tracked issues, plus anyone already named in a commitment — never a fixture
 * list, and never a made-up account id.
 */
async function collectPeople({ jira, issues, context }) {
  const byId = new Map();
  const add = (p) => {
    if (!p?.id) return;
    if (!byId.has(p.id)) byId.set(p.id, { id: p.id, name: p.name ?? p.id, initials: p.initials ?? initialsOf(p.name) });
  };

  for (const issue of issues) {
    add(issue.assignee);
    add(issue.reporter);
    for (const c of issue.commitments) {
      add(c.owner);
      add(c.evidence.author);
      for (const h of c.previousOwners) { add(h.from); add(h.to); add(h.by); }
    }
    try {
      const users = await jira.searchPeople(issue.key, '');
      for (const u of users) add(u);
    } catch {
      // Assignable-user search may be unavailable to the app identity. The
      // people already named in the ledger remain selectable.
    }
  }
  if (context?.accountId) add({ id: context.accountId, name: context.account?.displayName ?? 'Signed-in user' });
  return [...byId.values()].slice(0, 100);
}

export function summariseCommitments(commitments) {
  const unresolved = commitments.filter((c) => isUnresolved(c));
  return {
    total: commitments.length,
    unresolved: unresolved.length,
    counts: counts({ commitments }),
  };
}
