/**
 * Resolver handlers, with every dependency injected.
 *
 * `resolvers.js` binds these to Forge (`@forge/api`, `@forge/kvs`, the resolver
 * framework). The tests bind them to a fake Jira and an in-memory storage, and
 * drive the same code through the same paths. That is deliberate: it means the
 * vertical slice has actually been executed end to end, and the only thing not
 * proven is whether Atlassian behaves as expected — which no amount of local
 * testing can prove.
 */
import { counts, findByCode, nextCode } from './ledger.js';
import { decideGate } from './gate.js';
import { syncIssue, writeGuardProjection } from './sync.js';
import { PROJECTION_KEY } from './projection.js';
import { extractCandidates } from './extract.js';
import { createStore } from './store.js';
import { buildIssue, buildWorkspace, initialsOf } from './workspace.js';

const person = (p) => {
  if (!p) return null;
  const id = typeof p === 'string' ? p : p.id ?? p.accountId ?? null;
  const name = typeof p === 'string' ? p : p.name ?? p.displayName ?? id;
  if (!id && !name) return null;
  return { id, name, initials: (typeof p === 'object' && p.initials) || initialsOf(name) };
};

const samePerson = (a, b) => (a?.id ?? a?.name ?? null) === (b?.id ?? b?.name ?? null);

/**
 * @param {{ jira: object, storage: { get: Function, set: Function },
 *           now?: () => Date, log?: Function }} deps
 */
export function createHandlers({ jira, storage, now = () => new Date(), log = () => {} }) {
  const store = createStore({ storage, now, log });

  const makeIo = (settings) => ({
    readLedger: (key) => store.readLedger(key),
    readProjection: (key) => jira.readProperty(key, PROJECTION_KEY),
    writeProjection: (key, value) => jira.writeProperty(key, PROJECTION_KEY, value),
    writeField: async (key, value) => {
      if (!settings.openFieldId) return;
      await jira.writeField(key, settings.openFieldId, value);
    },
    readField: async (key) => {
      if (!settings.openFieldId) return null;
      return jira.readField(key, settings.openFieldId);
    },
  });

  /** Read one issue back as the console's contract, after a mutation. */
  async function readBack(key, extraDiagnostics = []) {
    const settings = await store.settings();
    const issue = await jira.getIssue(key);
    const ledger = await store.readLedger(key);
    let projection = null;
    const diagnostics = [...extraDiagnostics];
    try {
      projection = await jira.readProperty(key, PROJECTION_KEY);
    } catch (err) {
      diagnostics.push({ level: 'warn', code: 'projection_unreadable', issueKey: key, message: String(err?.message ?? err) });
    }
    const decision = decideGate(ledger, projection, { nowMs: now().getTime() });
    return buildIssue({ issue, ledger, projection, decision, now: now(), diagnostics });
  }

  /**
   * Apply a change to one commitment.
   *
   * Ordering (see sync.js): guard projection → ledger → projection + field.
   * The guard is written before the ledger so the customer-facing condition can
   * never read "zero open" while the ledger is about to hold work.
   */
  async function applyChange({ key, code, mutate, event, auditType }) {
    const settings = await store.settings();
    const io = makeIo(settings);
    let noop = false;

    const result = await store.mutateLedger(key, (ledger) => {
      const current = findByCode(ledger, code);
      if (!current) throw new Error('commitment_not_found');
      const next = mutate(current, ledger);
      if (next === null) { noop = true; return null; }
      return ledger.commitments.map((c) => (c.code === code ? next : c));
    }, {
      beforeWrite: async (planned) => {
        const plannedCounts = counts(planned, now().getTime());
        await writeGuardProjection(io, key, planned, plannedCounts, now());
      },
    });

    if (!result.changed) {
      return { issue: await readBack(key), changed: false, noop };
    }

    const diagnostics = [];
    let sync = null;
    try {
      sync = await syncIssue(io, key, { now: now() });
    } catch (err) {
      // The ledger is authoritative and already committed. The validator keeps
      // agents blocked; the guard keeps the portal blocked. The console is told
      // that the projection is behind rather than being told everything is fine.
      diagnostics.push({
        level: 'error', code: 'projection_write_failed', issueKey: key,
        message: `The ledger is saved, but the closure projection could not be updated (${err.message}). Closure stays blocked for customers until it is reconciled.`,
      });
      log({ event: 'projection_write_failed', key, error: String(err?.message ?? err) });
    }

    await store.recordEvent({
      id: `${auditType}:${key}:${code}:${result.ledger.rev}`,
      at: now().toISOString(),
      type: auditType,
      issueKey: key,
      commitmentCode: code,
      summary: event.summary,
      detail: event.detail,
      actor: event.actor ?? null,
    });

    return { issue: await readBack(key, diagnostics), changed: true, sync };
  }

  const handlers = {
    /* -------------------------------------------------------------- workspace */

    async bootstrap({ context }) {
      const panelIssue = context?.extension?.issue?.key;
      if (panelIssue) {
        await store.track(panelIssue, { source: 'issue-panel' });
      }
      const settings = await store.settings();
      const built = await buildWorkspace({ jira, store, settings, context, now: now(), log });
      return { workspace: built.workspace, mode: 'live' };
    },

    'relay.issue.get': async ({ payload }) => readBack(payload.key),

    'relay.workspace.track': async ({ payload, context }) => {
      await store.track(payload.key, { source: 'console', addedBy: context?.accountId ?? null });
      const settings = await store.settings();
      const built = await buildWorkspace({ jira, store, settings, context, now: now() });
      return { workspace: built.workspace };
    },

    'relay.workspace.untrack': async ({ payload, context }) => {
      await store.untrack(payload.key);
      const settings = await store.settings();
      const built = await buildWorkspace({ jira, store, settings, context, now: now() });
      return { workspace: built.workspace };
    },

    /* ----------------------------------------------------------------- capture */

    /**
     * Read the issue's real comments, extract candidates, and persist the ones
     * that were not already captured. Idempotent by evidence fingerprint: the
     * same comment scanned twice creates nothing the second time.
     */
    'relay.capture.scan': async ({ payload, context }) => {
      const key = payload.key;
      const settings = await store.settings();
      const issue = await jira.getIssue(key);
      const comments = await jira.getComments(key);
      const target = payload.commentId ? comments.filter((c) => c.id === String(payload.commentId)) : comments;

      const rejected = [];
      const extracted = [];
      for (const comment of target) {
        const res = extractCandidates({
          issueKey: key,
          comment,
          now: now(),
          threshold: settings.capture.confidenceThreshold,
        });
        extracted.push(...res.candidates);
        rejected.push(...res.rejected.map((r) => ({ ...r, commentId: comment.id })));
      }

      let created = [];
      let duplicates = [];
      const result = await store.mutateLedger(key, (ledger) => {
        created = [];
        duplicates = [];
        const known = new Set(ledger.commitments.map((c) => c.evidence?.fingerprint).filter(Boolean));
        const additions = [];
        for (const cand of extracted) {
          if (known.has(cand.fingerprint)) { duplicates.push(cand.fingerprint); continue; }
          known.add(cand.fingerprint);
          additions.push(toRecord(key, cand, nextCode([...ledger.commitments, ...additions]), now().toISOString()));
        }
        if (!additions.length) return null;
        created = additions;
        return [...ledger.commitments, ...additions];
      });

      if (result.changed) {
        for (const c of created) {
          await store.recordEvent({
            id: `captured:${key}:${c.code}:${result.ledger.rev}`,
            at: now().toISOString(),
            type: 'captured',
            issueKey: key,
            commitmentCode: c.code,
            summary: `Suggestion captured from comment ${c.evidence.commentId}`,
            detail: `“${c.evidence.quote}”`,
            actor: { id: context?.accountId ?? null, name: 'Relay', initials: 'RL' },
          });
        }
      }

      await store.saveIssueMeta(key, {
        lastScanAt: now().toISOString(),
        scannedComments: [...new Set([...(await store.issueMeta(key)).scannedComments, ...target.map((c) => c.id)])].slice(-200),
      });

      const issuePayload = await readBack(key);
      return {
        issue: issuePayload,
        scanned: { comments: target.length, sentences: extracted.length },
        created: created.map((c) => ({ code: c.code, quote: c.evidence.quote, confidence: c.confidence })),
        duplicates: duplicates.length,
        rejected,
        issueTitle: issue.summary,
      };
    },

    'relay.capture.preview': async ({ payload }) => {
      const comments = await jira.getComments(payload.key);
      const target = payload.commentId ? comments.filter((c) => c.id === String(payload.commentId)) : comments;
      const settings = await store.settings();
      const out = [];
      const rejected = [];
      for (const comment of target) {
        const res = extractCandidates({ issueKey: payload.key, comment, now: now(), threshold: settings.capture.confidenceThreshold });
        out.push(...res.candidates.map((c) => ({ ...c, body: undefined })));
        rejected.push(...res.rejected);
      }
      return { candidates: out, rejected, commentsScanned: target.length };
    },

    'relay.capture.accept': async ({ payload, context }) => {
      const settings = await store.settings();
      const owner = person(payload.owner ?? payload.ownerId);
      const res = await applyChange({
        key: payload.key,
        code: payload.code,
        auditType: 'accepted',
        event: {
          summary: `${payload.code} accepted`,
          detail: owner ? `Owner set to ${owner.name}.` : null,
          actor: actorOf(context),
        },
        mutate: (c) => {
          if (c.status === 'verified' || c.status === 'dropped') throw new Error('commitment_already_settled');
          if (settings.capture.requireOwner && !owner) throw new Error('owner_required');
          const dueAt = payload.dueAt ?? c.dueAt ?? null;
          const text = typeof payload.text === 'string' && payload.text.trim() ? payload.text.trim() : c.text;
          if (c.status === 'open' && samePerson(c.owner, owner) && c.dueAt === dueAt && c.text === text) return null;
          return {
            ...c,
            status: 'open',
            owner,
            dueAt,
            text,
            acceptedAt: c.acceptedAt ?? now().toISOString(),
            acceptedBy: c.acceptedBy ?? actorOf(context),
          };
        },
      });
      return res.issue;
    },

    'relay.capture.reject': async ({ payload, context }) => {
      const reason = String(payload.reason ?? '').trim();
      if (reason.length < 8) throw new Error('reason_required');
      const res = await applyChange({
        key: payload.key,
        code: payload.code,
        auditType: 'dropped',
        event: { summary: `${payload.code} rejected`, detail: reason, actor: actorOf(context) },
        mutate: (c) => {
          if (c.status === 'dropped' && c.droppedReason === reason) return null;
          if (c.status === 'verified') throw new Error('commitment_already_verified');
          return { ...c, status: 'dropped', droppedReason: reason, droppedAt: now().toISOString(), overdue: false };
        },
      });
      return res.issue;
    },

    'relay.capture.edit': async ({ payload, context }) => {
      const text = String(payload.text ?? '').trim();
      if (text.length < 4) throw new Error('text_required');
      const res = await applyChange({
        key: payload.key,
        code: payload.code,
        auditType: 'commented',
        event: { summary: `${payload.code} wording edited`, detail: text.slice(0, 160), actor: actorOf(context) },
        mutate: (c) => {
          if (c.status !== 'proposed') throw new Error('only_proposals_are_editable');
          return c.text === text ? null : { ...c, text };
        },
      });
      return res.issue;
    },

    /* ------------------------------------------------------------ commitments */

    'relay.commitment.verify': async ({ payload, context }) => {
      const note = String(payload.note ?? '').trim();
      const res = await applyChange({
        key: payload.key,
        code: payload.code,
        auditType: 'verified',
        event: { summary: `${payload.code} verified`, detail: note || null, actor: actorOf(context) },
        mutate: (c) => {
          if (c.status === 'verified' && (c.verificationNote ?? '') === note) return null;
          if (c.status === 'dropped') throw new Error('commitment_dropped');
          return {
            ...c,
            status: 'verified',
            verifiedAt: now().toISOString(),
            verifiedBy: actorOf(context),
            verificationNote: note || null,
          };
        },
      });
      return res.issue;
    },

    'relay.commitment.reassign': async ({ payload, context }) => {
      const owner = person(payload.owner ?? payload.ownerId);
      if (!owner) throw new Error('owner_required');
      const reason = String(payload.reason ?? '').trim() || 'Handover';
      const res = await applyChange({
        key: payload.key,
        code: payload.code,
        auditType: 'reassigned',
        event: { summary: `${payload.code} reassigned to ${owner.name}`, detail: reason, actor: actorOf(context) },
        mutate: (c) => {
          if (c.status !== 'open') throw new Error('only_open_commitments_can_be_reassigned');
          if (samePerson(c.owner, owner)) return null;
          const handover = c.owner
            ? [...(c.previousOwners ?? []), { from: c.owner, to: owner, by: actorOf(context), at: now().toISOString(), reason }]
            : (c.previousOwners ?? []);
          return { ...c, owner, previousOwners: handover };
        },
      });
      return res.issue;
    },

    'relay.commitment.drop': async ({ payload, context }) => {
      const reason = String(payload.reason ?? '').trim();
      if (reason.length < 8) throw new Error('reason_required');
      const res = await applyChange({
        key: payload.key,
        code: payload.code,
        auditType: 'dropped',
        event: { summary: `${payload.code} dropped`, detail: reason, actor: actorOf(context) },
        mutate: (c) => {
          if (c.status === 'dropped' && c.droppedReason === reason) return null;
          return { ...c, status: 'dropped', droppedReason: reason, droppedAt: now().toISOString(), overdue: false };
        },
      });
      return res.issue;
    },

    /* ---------------------------------------------------------------- people */

    'relay.people.search': async ({ payload }) => {
      const users = await jira.searchPeople(payload.key, payload.query ?? '');
      return { people: users.map((u) => ({ id: u.id, name: u.name, initials: initialsOf(u.name) })) };
    },

    /* -------------------------------------------------------------- settings */

    'relay.settings.get': async () => store.settings(),

    'relay.settings.set': async ({ payload }) => store.saveSettings(payload ?? {}),

    /* -------------------------------------------------------------- diagnostics */

    /**
     * Reconcile one issue and report, from the live stores, whether closure is
     * permitted, what the projection says, and what the condition field holds.
     * This is the check to run against a real site before trusting the gate.
     */
    'relay.enforcement.check': async ({ payload }) => {
      const settings = await store.settings();
      const io = makeIo(settings);
      const diagnostics = [];
      const ledgerBefore = await store.readLedger(payload.key);
      let sync = null;
      let syncError = null;
      try {
        sync = await syncIssue(io, payload.key, { now: now(), maxAgeMs: 0 });
      } catch (err) {
        syncError = String(err?.message ?? err);
        diagnostics.push({ level: 'error', code: 'sync_failed', message: syncError });
      }

      const ledger = await store.readLedger(payload.key);
      let projection = null;
      try { projection = await jira.readProperty(payload.key, PROJECTION_KEY); } catch (err) {
        diagnostics.push({ level: 'warn', code: 'projection_unreadable', message: String(err?.message ?? err) });
      }
      let field = null;
      try { field = await io.readField(payload.key); } catch (err) {
        diagnostics.push({ level: 'warn', code: 'field_unreadable', message: String(err?.message ?? err) });
      }
      const decision = decideGate(ledger, projection, { nowMs: now().getTime() });

      if (settings.openFieldId && field !== null && decision.counts && field !== decision.counts.open) {
        diagnostics.push({
          level: 'error', code: 'field_out_of_step',
          message: `The condition field holds ${field} but the ledger holds ${decision.counts.open} unresolved commitments.`,
        });
      }
      if (!settings.openFieldId) {
        diagnostics.push({
          level: 'warn', code: 'condition_field_unset',
          message: 'No condition field is configured, so the workflow condition cannot read Relay’s state. Customer closure is not covered.',
        });
      }
      if (ledgerBefore === null) {
        diagnostics.push({ level: 'info', code: 'no_ledger', message: 'Relay has no ledger for this issue.' });
      }

      return {
        key: payload.key,
        allowed: decision.allow,
        code: decision.code,
        message: decision.message,
        counts: decision.counts,
        stale: Boolean(decision.stale),
        ledgerRev: ledger?.rev ?? null,
        projection,
        field,
        sync,
        syncError,
        diagnostics,
      };
    },
  };

  return handlers;
}

function toRecord(issueKey, cand, code, capturedAt) {
  return {
    code,
    issueKey,
    status: 'proposed',
    text: cand.text,
    originalText: cand.quote,
    evidence: {
      commentId: cand.commentId,
      commentCreatedAt: cand.createdAt,
      body: cand.body,
      bodyHash: cand.bodyHash,
      bodyFormat: 'adf-text',
      quote: cand.quote,
      start: cand.start,
      end: cand.end,
      author: cand.author,
      fingerprint: cand.fingerprint,
      capturedAt,
    },
    owner: null,
    suggestedOwner: cand.ownerHint ?? null,
    dueAt: cand.dueAt ?? null,
    dueBasis: cand.dueBasis ?? null,
    confidence: cand.confidence,
    signals: cand.signals ?? [],
    acceptedAt: null,
    acceptedBy: null,
    verifiedAt: null,
    verifiedBy: null,
    verificationNote: null,
    droppedReason: null,
    droppedAt: null,
    previousOwners: [],
  };
}

function actorOf(context) {
  if (!context?.accountId) return null;
  const name = context.account?.displayName ?? context.accountId;
  return { id: context.accountId, name, initials: initialsOf(name) };
}
