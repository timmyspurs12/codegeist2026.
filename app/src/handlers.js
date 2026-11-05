/**
 * Resolver handlers, with every dependency injected.
 *
 * `resolvers.js` binds these to Forge (`@forge/api`, `@forge/kvs`, the resolver
 * framework). The tests bind them to a fake Jira and an in-memory store that
 * implements the same conditional commits, and drive the same code through the
 * same paths. That is deliberate: it means the vertical slice has actually been
 * executed end to end, and the only thing not proven is whether Atlassian
 * behaves as expected — which no amount of local testing can prove.
 *
 * P2.2 adds the management lifecycle to this file. Track and untrack are no
 * longer a list edit: both move an issue through `initializing`, write the
 * state the workflow condition reads, and only then settle on `managed` or
 * `unmanaged`. Every step is verified by reading it back, and a step that fails
 * leaves the issue `initializing` — withheld, not open.
 */
import { counts, findByCode, nextCode, INITIALIZING, MANAGED, UNMANAGED } from './ledger.js';
import { decideClosure } from './gate.js';
import { syncIssue, writeGuardProjection } from './sync.js';
import { PROJECTION_KEY } from './projection.js';
import { extractCandidates } from './extract.js';
import { createStore } from './store.js';
import { buildIssue, buildWorkspace, initialsOf } from './workspace.js';
import {
  ClosureFieldUnavailable,
  FIELD_SPECS,
  describeField,
  describeFields,
  isFieldId,
  moduleTypeIdFrom,
} from './field.js';

const person = (p) => {
  if (!p) return null;
  const id = typeof p === 'string' ? p : p.id ?? p.accountId ?? null;
  const name = typeof p === 'string' ? p : p.name ?? p.displayName ?? id;
  if (!id && !name) return null;
  return { id, name, initials: (typeof p === 'object' && p.initials) || initialsOf(name) };
};

const samePerson = (a, b) => (a?.id ?? a?.name ?? null) === (b?.id ?? b?.name ?? null);

/** Where in the track sequence a failure happened. Reported, never swallowed. */
export class LifecycleError extends Error {
  constructor(stage, message, detail = {}) {
    super(`${stage}: ${message}`);
    this.name = 'LifecycleError';
    this.stage = stage;
    this.detail = detail;
  }
}

/**
 * @param {{ jira: object,
 *           storage: { get: Function, set: Function, list: Function },
 *           records: { read: Function, create: Function, update: Function },
 *           now?: () => Date, log?: Function }} deps
 */
export function createHandlers({ jira, storage, records, now = () => new Date(), log = () => {} }) {
  const store = createStore({ storage, records, now, log });

  /**
   * Resolve an app-owned field for this app + environment.
   *
   * The type id comes from the invocation context (`localId`), the numeric field
   * id comes from Jira, and the answer is cached in Relay's settings together
   * with the type id it was resolved for. If the app is promoted to another
   * environment the type id changes, the cache is discarded, and the field is
   * looked up again — the app never writes into a field it did not resolve.
   */
  async function resolveOneField(which, context, settings) {
    const spec = FIELD_SPECS[which];
    const typeId = moduleTypeIdFrom(context?.localId, spec.moduleKey);
    const cachePrefix = which === 'count' ? 'closureField' : 'stateField';
    const cachedType = settings[`${cachePrefix}TypeId`] ?? null;
    const cachedId = settings[`${cachePrefix}Id`] ?? null;

    const usable = isFieldId(cachedId) && (!typeId || cachedType === typeId);
    if (usable) {
      return describeField(which, {
        id: cachedId,
        key: settings[`${cachePrefix}Key`],
        typeId: cachedType ?? typeId,
        resolvedAt: settings[`${cachePrefix}ResolvedAt`],
      });
    }

    let found = null;
    if (typeId) {
      try {
        found = await jira.findFieldByModuleType(typeId);
      } catch (err) {
        log({ event: 'field_lookup_failed', which, typeId, error: String(err?.message ?? err) });
        return describeField(which, { id: null, key: null, typeId });
      }
    }
    if (!found?.id) return describeField(which, { id: null, key: null, typeId });

    const resolvedAt = now().toISOString();
    const patch = { [`${cachePrefix}Id`]: found.id, [`${cachePrefix}Key`]: found.key ?? null, [`${cachePrefix}TypeId`]: typeId, [`${cachePrefix}ResolvedAt`]: resolvedAt };
    await store.saveSettings(patch);
    return describeField(which, { id: found.id, key: found.key, typeId, resolvedAt });
  }

  /** Both app-owned fields, plus the condition expression that reads them. */
  async function resolveAppFields(context) {
    const settings = await store.settings();
    const count = await resolveOneField('count', context, settings);
    const state = await resolveOneField('state', context, settings);
    return describeFields({ count, state });
  }

  /**
   * The write surface used by sync and by the lifecycle.
   *
   * Read-only fields cannot be written through Edit Issue, so both writes go
   * through the private app-field API, which needs the numeric issue id as well
   * as the field id. Every write is read back by the caller.
   */
  const makeIo = (settings, fields) => {
    const io = {
      readLedger: (key) => store.readLedger(key),
      readProjection: (key) => jira.readProperty(key, PROJECTION_KEY),
      writeProjection: (key, value) => jira.writeProperty(key, PROJECTION_KEY, value),
      writeValue: async (field, key, value) => {
        if (!field?.resolved) throw new ClosureFieldUnavailable(`no id for the ${field?.which ?? 'closure'} field in this environment`);
        const issue = await jira.getIssue(key);
        const issueId = issue?.id ?? null;
        if (issueId === null) throw new ClosureFieldUnavailable(`issue ${key} has no numeric id`);
        await jira.writeAppFieldValue(field.id, issueId, value);
      },
      readValue: async (field, key) => {
        if (!field?.resolved) throw new ClosureFieldUnavailable(`no id for the ${field?.which ?? 'closure'} field in this environment`);
        return jira.readField(key, field.id);
      },
    };
    io.writeField = (key, value) => io.writeValue(fields.count, key, value);
    io.readField = (key) => io.readValue(fields.count, key);
    io.writeState = (key, value) => io.writeValue(fields.state, key, value);
    io.readState = (key) => io.readValue(fields.state, key);
    return io;
  };

  /** Read one issue back as the console's contract, after a mutation. */
  async function readBack(key, extraDiagnostics = []) {
    const issue = await jira.getIssue(key);
    const ledger = await store.readLedger(key);
    let projection = null;
    const diagnostics = [...extraDiagnostics];
    try {
      projection = await jira.readProperty(key, PROJECTION_KEY);
    } catch (err) {
      diagnostics.push({ level: 'warn', code: 'projection_unreadable', issueKey: key, message: String(err?.message ?? err) });
    }
    const decision = decideClosure({ ledger, projection, nowMs: now().getTime() });
    return buildIssue({ issue, ledger, projection, decision, now: now(), diagnostics });
  }

  /**
   * Apply a change to one commitment.
   *
   * Ordering (see sync.js): guard projection → ledger → projection + fields.
   * The guard is written before the ledger so the customer-facing condition can
   * never read "unmanaged" or "zero" while the ledger is about to hold work.
   */
  async function applyChange({ key, code, mutate, event, auditType, context }) {
    const record = await store.readLedger(key);
    if (!record) throw new LifecycleError('commitment_change', `Relay has no ledger for ${key}`, { key });
    if (record.state !== MANAGED) {
      throw new LifecycleError(
        'commitment_change',
        `Relay is not managing ${key} (state: ${record.state ?? 'none'}). Track the issue before changing its commitments.`,
        { key, state: record.state },
      );
    }

    const fields = await resolveAppFields(context);
    const io = makeIo(null, fields);
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
    try {
      await syncIssue(io, key, { now: now() });
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

    return { issue: await readBack(key, diagnostics), changed: true };
  }

  /**
   * Capture every new promise in an issue's comments into its ledger.
   *
   * Idempotent by evidence fingerprint: the same comment scanned twice creates
   * nothing the second time. Returns what it wrote so a caller can report it.
   */
  async function scanInto(key, io, { commentId = null, context = null } = {}) {
    const settings = await store.settings();
    let comments;
    try {
      comments = await jira.getComments(key);
    } catch (err) {
      // "Extraction is unavailable" is a real state, and it must be named:
      // the caller leaves the issue initialising rather than opening it.
      throw new LifecycleError('capture', `comments could not be read (${String(err?.message ?? err)})`);
    }
    const target = commentId ? comments.filter((c) => c.id === String(commentId)) : comments;

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
    }, {
      beforeWrite: async (planned) => {
        const plannedCounts = counts(planned, now().getTime());
        await writeGuardProjection(io, key, planned, plannedCounts, now());
      },
    });

    if (result.changed) {
      for (const c of created) {
        await store.recordEvent({
          id: `captured:${key}:${c.code}:${result.ledger.rev}`,
          at: now().toISOString(),
          type: 'captured',
          issueKey: key,
          commitmentCode: c.code,
          summary: `Captured from comment ${c.evidence.commentId}`,
          detail: `“${c.evidence.quote}”`,
          actor: context ? actorOf(context) : { id: null, name: 'Relay', initials: 'RL' },
        });
      }
    }

    await store.saveIssueMeta(key, {
      lastScanAt: now().toISOString(),
      scannedComments: [...new Set([...(await store.issueMeta(key)).scannedComments, ...target.map((c) => c.id)])].slice(-200),
    });

    return {
      changed: result.changed,
      ledger: result.ledger,
      ledgerRev: result.ledger?.rev ?? null,
      created,
      duplicates,
      rejected,
      scanned: { comments: target.length, sentences: extracted.length },
    };
  }

  /**
   * Track an issue: the management lifecycle.
   *
   *   1. create the record (create-only — a rival create loses and we adopt it)
   *   2. write the state field `initializing`, **verify**
   *   3. commit the record `initializing`
   *   4. capture comments into the ledger (idempotent)
   *   5. sync the count/projection and the state field, **verify**
   *   6. commit `managed`, then write the field `managed`, **verify**
   *
   * Failures leave the issue `initializing` — withheld on both paths. Nothing
   * here can leave a half-captured issue looking closed.
   */
  async function trackIssue({ key, context }) {
    const fields = await resolveAppFields(context);
    const io = makeIo(null, fields);
    const steps = [];
    const step = (name, detail = {}) => steps.push({ stage: name, at: now().toISOString(), ...detail });

    const existing = await store.readLedger(key);
    if (existing?.state === MANAGED) {
      // A second Track is a repair, not a new lifecycle: re-verify the fields
      // (they may be behind from an earlier failure) and report it as a refresh.
      const sync = await syncIssue(io, key, { now: now(), maxAgeMs: 0 });
      step('refreshed', { sync: sync.status });
      return { status: 'already_managed', state: MANAGED, record: await store.readLedger(key), steps, sync };
    }

    // 1. the record exists, in `initializing`, before anything else is written
    const init = await store.initialise(key, { state: INITIALIZING, seed: { source: 'track', trackedBy: context?.accountId ?? null } });
    step('record_initialised', { created: init.created, rev: init.record.rev });

    try {
      // 2. the condition must withhold while we work. Field first, because the
      // condition reads the field and nothing else.
      try {
        await io.writeState(key, INITIALIZING);
        const stateBack = await io.readState(key);
        if (stateBack !== INITIALIZING) {
          throw new Error(`state field did not accept "initializing" (read ${String(stateBack)})`);
        }
      } catch (err) {
        throw new LifecycleError('state_field', String(err?.message ?? err));
      }
      step('state_field_initializing');

      // 3. the record agrees
      await store.setState(key, INITIALIZING);
      step('state_record_initializing');

      // 4. capture. A failure here is the "extraction unavailable" case: the
      // record stays `initializing`, so the issue is withheld, not opened.
      let scan;
      try {
        scan = await scanInto(key, io, { context });
      } catch (err) {
        if (err instanceof LifecycleError) throw err;
        throw new LifecycleError('capture', String(err?.message ?? err));
      }
      step('captured', { created: scan.created.length, duplicates: scan.duplicates.length, comments: scan.scanned.comments });

      // 5. project the count and the state, and verify both. A field that Jira
      // accepted but did not store lands here: sync throws, and the issue stays
      // `initializing` rather than being reported as managed at a false zero.
      let sync;
      try {
        sync = await syncIssue(io, key, { now: now(), maxAgeMs: 0 });
      } catch (err) {
        throw new LifecycleError('synced', String(err?.message ?? err));
      }
      if (sync.status === 'no_ledger') throw new LifecycleError('synced', 'record disappeared during track');
      step('synced', { status: sync.status, open: sync.counts?.open ?? null });

      // 6. settle. Record first, field second: if the field write fails the
      // record says managed but the condition still reads `initializing`, which
      // withholds. The reverse order could open a case whose record is not ready.
      await store.setState(key, MANAGED, { seed: { managedAt: now().toISOString() } });
      try {
        await io.writeState(key, MANAGED);
        const managedBack = await io.readState(key);
        if (managedBack !== MANAGED) throw new Error(`state field did not accept "managed" (read ${String(managedBack)})`);
      } catch (err) {
        throw new LifecycleError('state_field', String(err?.message ?? err));
      }
      step('managed');

      // The state commit bumped the revision, so the projection written in step
      // 5 is now one revision behind. The condition reads the fields (already
      // correct), but the console's staleness flag and reconcile both compare
      // revisions, so the projection is brought back into step here.
      try {
        const finalSync = await syncIssue(io, key, { now: now() });
        step('projection_final', { status: finalSync.status });
      } catch (err) {
        log({ event: 'track_projection_final_failed', key, error: String(err?.message ?? err) });
        step('projection_final_failed', { error: String(err?.message ?? err) });
      }

      await store.track(key, { source: 'console', addedBy: context?.accountId ?? null });
      await store.recordEvent({
        id: `tracked:${key}:${now().toISOString()}`,
        at: now().toISOString(),
        type: 'tracked',
        issueKey: key,
        summary: `Relay began managing ${key}`,
        detail: `${scan.created.length} captured, ${scan.duplicates.length} already known.`,
        actor: actorOf(context),
      });

      return {
        status: 'managed',
        state: MANAGED,
        record: await store.readLedger(key),
        created: scan.created.map((c) => ({ code: c.code, quote: c.evidence.quote, confidence: c.confidence })),
        duplicates: scan.duplicates.length,
        rejected: scan.rejected,
        steps,
        sync,
      };
    } catch (err) {
      // Fail closed: the record is (or becomes) `initializing`, and the field
      // is left saying `initializing` if it was written at all.
      try {
        await store.setState(key, INITIALIZING, { attempts: 3 });
      } catch (inner) {
        log({ event: 'track_initializing_restore_failed', key, error: String(inner?.message ?? inner) });
      }
      step('failed', { failedStage: err?.stage ?? 'unknown', error: String(err?.message ?? err) });
      log({ event: 'track_failed', key, stage: err?.stage ?? 'unknown', error: String(err?.message ?? err) });
      return {
        status: 'failed',
        state: INITIALIZING,
        stage: err?.stage ?? 'unknown',
        error: String(err?.message ?? err),
        steps,
        record: await store.readLedger(key).catch(() => null),
      };
    }
  }

  /**
   * Untrack an issue: the offboarding lifecycle.
   *
   * Confirmation is required, and it names what will be left behind, because
   * setting `unmanaged` permits closure. The sequence passes through
   * `initializing` on *both* sides, so the two stores never disagree in the
   * direction that opens a case: a failure leaves `initializing`, not
   * `unmanaged`.
   */
  async function untrackIssue({ key, context, confirm, reason }) {
    const record = await store.readLedger(key);
    if (!record) {
      return { status: 'not_tracked', state: null, open: 0, requiresConfirmation: false };
    }
    const open = counts(record).open;

    if (confirm !== true) {
      return {
        status: 'confirmation_required',
        state: record.state,
        open,
        requiresConfirmation: true,
        message:
          `Offboarding ${key} sets its Relay state to unmanaged, which permits closure. ` +
          `Relay is currently managing ${open} unresolved commitment${open === 1 ? '' : 's'} on this issue; ` +
          'the ledger and audit trail are kept, and re-tracking restores the count.',
      };
    }

    const fields = await resolveAppFields(context);
    const io = makeIo(null, fields);
    const steps = [];
    const step = (name) => steps.push({ stage: name, at: now().toISOString() });

    try {
      await io.writeState(key, INITIALIZING);
      const back1 = await io.readState(key);
      if (back1 !== INITIALIZING) throw new LifecycleError('state_field', `state field did not accept "initializing" (read ${String(back1)})`);
      step('state_field_initializing');

      await store.setState(key, INITIALIZING, { attempts: 3 });
      step('state_record_initializing');

      await store.setState(key, UNMANAGED, { seed: { untrackedAt: now().toISOString(), untrackedBy: context?.accountId ?? null } });
      step('state_record_unmanaged');

      await io.writeState(key, UNMANAGED);
      const back2 = await io.readState(key);
      if (back2 !== UNMANAGED) throw new LifecycleError('state_field', `state field did not accept "unmanaged" (read ${String(back2)})`);
      step('state_field_unmanaged');

      await store.untrack(key);
      step('untracked');

      await store.recordEvent({
        id: `untracked:${key}:${now().toISOString()}`,
        at: now().toISOString(),
        type: 'untracked',
        issueKey: key,
        summary: `Relay stopped managing ${key}`,
        detail: `${open} unresolved commitment${open === 1 ? '' : 's'} retained in the ledger.${reason ? ` Reason: ${reason}` : ''}`,
        actor: actorOf(context),
      });

      return { status: 'unmanaged', state: UNMANAGED, open, steps };
    } catch (err) {
      log({ event: 'untrack_failed', key, stage: err?.stage ?? 'unknown', error: String(err?.message ?? err) });
      // The record may be `initializing`; that withholds. Never try to restore
      // `managed` here — the operator asked to stop, and a half-done offboarding
      // must be blocked, not silently re-managed.
      return { status: 'failed', state: INITIALIZING, stage: err?.stage ?? 'unknown', error: String(err?.message ?? err), steps };
    }
  }

  const handlers = {
    /* -------------------------------------------------------------- workspace */

    async bootstrap({ context }) {
      const panelIssue = context?.extension?.issue?.key;
      const settings = await store.settings();
      const fields = await resolveAppFields(context);
      // Merely opening the panel never changes management state: an issue with
      // no record stays unknown (withheld) until Track or Backfill records it.
      const built = await buildWorkspace({ jira, store, settings, context, now: now(), log, field: fields });
      return {
        workspace: built.workspace,
        mode: 'live',
        panelIssue: panelIssue ?? null,
        panelTracked: panelIssue ? (await store.tracked()).some((t) => t.key === panelIssue) : null,
      };
    },

    'relay.issue.get': async ({ payload }) => readBack(payload.key),

    /* ---------------------------------------------------- management lifecycle */

    'relay.workspace.track': async ({ payload, context }) => {
      const track = await trackIssue({ key: payload.key, context });
      const built = await buildWorkspace({
        jira, store, settings: await store.settings(), context, now: now(), log,
        field: await resolveAppFields(context),
      });
      return { workspace: built.workspace, track };
    },

    'relay.workspace.untrack': async ({ payload, context }) => {
      const untrack = await untrackIssue({ key: payload.key, context, confirm: payload.confirm, reason: payload.reason });
      const built = await buildWorkspace({
        jira, store, settings: await store.settings(), context, now: now(), log,
        field: await resolveAppFields(context),
      });
      return { workspace: built.workspace, untrack };
    },

    /**
     * Record an issue as unmanaged. Used by the issue-created trigger and by
     * the backfill; safe to call repeatedly because the create is create-only
     * and an existing record is never overwritten.
     */
    'relay.state.init': async ({ payload, context }) => {
      const key = payload.key;
      if (!key) throw new Error('issue_key_required');
      const fields = await resolveAppFields(context);
      const io = makeIo(null, fields);
      const { record, created } = await store.initialise(key, {
        state: UNMANAGED,
        seed: { source: payload.source ?? 'trigger', backfilledAt: now().toISOString() },
      });

      if (!created) return { key, created: false, state: record.state, sync: null };

      let sync = null;
      let degraded = null;
      try {
        sync = await syncIssue(io, key, { now: now(), maxAgeMs: 0 });
      } catch (err) {
        // The record is unmanaged but the condition cannot read it yet. That is
        // a blocked issue, not an open one: report it and let reconcile repair.
        degraded = String(err?.message ?? err);
        log({ event: 'state_init_sync_failed', key, error: degraded });
      }
      return { key, created: true, state: record.state, sync: sync?.status ?? null, degraded };
    },

    /**
     * Backfill: give every issue in a project a record, one page at a time.
     *
     * Resumable by design — the caller passes back `nextPageToken`. An issue
     * that already has a record is skipped and *never* overwritten, so running
     * this twice, or running it while the app is live, cannot unmanage an issue
     * Relay already manages.
     */
    'relay.workspace.init': async ({ payload, context }) => {
      const max = Math.min(Math.max(Number(payload.max ?? 25) || 25, 1), 100);
      const projectKey = payload.projectKey ?? null;
      const jql = payload.jql ?? (projectKey ? `project = "${projectKey}" ORDER BY key ASC` : 'ORDER BY key ASC');

      const page = await jira.searchIssuesPage(jql, { maxResults: max, pageToken: payload.cursor ?? null });
      const keys = page.keys ?? [];
      const fields = await resolveAppFields(context);
      const io = makeIo(null, fields);

      const initialised = [];
      const skipped = [];
      const failed = [];

      for (const key of keys) {
        try {
          const existing = await store.readLedger(key);
          if (existing) { skipped.push({ key, state: existing.state }); continue; }
          const { record } = await store.initialise(key, {
            state: UNMANAGED,
            seed: { source: 'backfill', backfilledAt: now().toISOString() },
          });
          // Project the state (and a zero count) so the condition reads the same
          // thing the record says. Verified by syncIssue.
          const sync = await syncIssue(io, key, { now: now(), maxAgeMs: 0 });
          if (sync.state !== record.state) throw new Error('state_projection_mismatch');
          initialised.push(key);
        } catch (err) {
          failed.push({ key, error: String(err?.message ?? err) });
          log({ event: 'backfill_issue_failed', key, error: String(err?.message ?? err) });
        }
      }

      const nextPageToken = page.nextPageToken ?? null;
      if (!nextPageToken) await store.saveSettings({ backfillCompletedAt: now().toISOString() });

      return {
        jql,
        done: !nextPageToken,
        nextPageToken,
        max,
        scanned: keys.length,
        initialised,
        skipped,
        failed,
        fields,
        total: page.total ?? null,
        note: !nextPageToken
          ? 'Every issue in this query now has a record. New issues are recorded by the created trigger.'
          : 'More issues remain: call again with the returned nextPageToken.',
      };
    },

    /* ----------------------------------------------------------------- capture */

    'relay.capture.scan': async ({ payload, context }) => {
      const key = payload.key;
      const record = await store.readLedger(key);
      if (!record) throw new LifecycleError('capture', `Relay has no ledger for ${key}. Track the issue first.`, { key });
      if (record.state !== MANAGED) {
        throw new LifecycleError('capture', `Relay is not managing ${key} (state: ${record.state ?? 'none'}).`, { key, state: record.state });
      }

      const fields = await resolveAppFields(context);
      const io = makeIo(null, fields);
      const issue = await jira.getIssue(key);
      const scan = await scanInto(key, io, { commentId: payload.commentId ?? null, context });

      const diagnostics = [];
      if (scan.changed) {
        try {
          await syncIssue(io, key, { now: now() });
        } catch (err) {
          diagnostics.push({
            level: 'error', code: 'projection_write_failed', issueKey: key,
            message: `The suggestions are saved, but the closure projection could not be updated (${err.message}). Closure stays blocked until it is reconciled.`,
          });
        }
      }

      return {
        issue: await readBack(key, diagnostics),
        scanned: scan.scanned,
        created: scan.created.map((c) => ({ code: c.code, quote: c.evidence.quote, confidence: c.confidence })),
        duplicates: scan.duplicates.length,
        rejected: scan.rejected,
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
        context,
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
        context,
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
        context,
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
        context,
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
        context,
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
        context,
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
     * permitted, what the projection says, and what each condition field holds.
     * This is the check to run against a real site before trusting the gate.
     */
    'relay.enforcement.check': async ({ payload, context }) => {
      const settings = await store.settings();
      const fields = await resolveAppFields(context);
      const io = makeIo(settings, fields);
      const diagnostics = [];
      const record = await store.readLedger(payload.key);

      if (!fields.resolved) {
        diagnostics.push({
          level: 'error', code: 'closure_field_unresolved',
          message: 'Relay could not resolve one or both of its own condition fields for this app and environment, so the workflow condition has nothing to read. Nothing is written and closure is not covered.',
        });
      } else if (settings.closureExpressionApplied !== fields.expression) {
        diagnostics.push({
          level: 'warn', code: 'condition_expression_placeholder',
          message: `The deployed condition expression is not recorded as matching these fields. The manifest must contain ${fields.manifestLine} — until it does, the expression names fields that do not exist and Jira refuses the transition.`,
        });
      }

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
      let fieldValue = null;
      let stateValue = null;
      let fieldReadFailed = false;
      try { fieldValue = await io.readField(payload.key); } catch (err) {
        fieldReadFailed = true;
        diagnostics.push({ level: 'warn', code: 'field_unreadable', message: String(err?.message ?? err) });
      }
      try { stateValue = await io.readState(payload.key); } catch (err) {
        diagnostics.push({ level: 'warn', code: 'state_field_unreadable', message: String(err?.message ?? err) });
      }

      const decision = decideClosure({ ledger, projection, nowMs: now().getTime() });

      if (!record) {
        diagnostics.push({
          level: 'error', code: 'no_record',
          message: 'Relay has no record for this issue, so it has no management state. Closure is withheld until Backfill or Track records it.',
        });
      } else if (record.state === INITIALIZING) {
        diagnostics.push({
          level: 'warn', code: 'initializing',
          message: 'This issue is initialising: capture did not finish, so closure is withheld on both paths until Track completes.',
        });
      }

      if (decision.counts && record?.state === MANAGED) {
        if (fieldReadFailed) {
          diagnostics.push({
            level: 'error', code: 'field_unavailable',
            message: 'The count field could not be read. That is not zero: customers stay blocked until it can be read.',
          });
        } else if (fieldValue !== decision.counts.open) {
          diagnostics.push({
            level: 'error', code: 'field_out_of_step',
            message: `The count field holds ${fieldValue === null ? 'nothing' : fieldValue} but the ledger holds ${decision.counts.open} unresolved commitments.`,
          });
        }
        if (stateValue !== MANAGED) {
          diagnostics.push({
            level: 'error', code: 'state_field_out_of_step',
            message: `The state field holds ${stateValue === null ? 'nothing' : `"${stateValue}"`} but Relay holds this issue as managed.`,
          });
        }
      }
      if (record?.state === UNMANAGED && stateValue !== UNMANAGED) {
        diagnostics.push({
          level: 'error', code: 'state_field_out_of_step',
          message: `The state field holds ${stateValue === null ? 'nothing' : `"${stateValue}"`} but Relay holds this issue as unmanaged.`,
        });
      }

      return {
        key: payload.key,
        allowed: decision.allow,
        code: decision.code,
        state: decision.state,
        message: decision.message,
        counts: decision.counts,
        stale: Boolean(decision.stale),
        ledgerRev: ledger?.rev ?? null,
        recordState: record?.state ?? null,
        projection,
        field: fieldValue,
        stateField: stateValue,
        fieldInfo: fields,
        sync,
        syncError,
        diagnostics,
      };
    },

    /* ------------------------------------------------------- closure field(s) */

    /**
     * What the app-owned fields are, for this app and environment, right now.
     * The console prints this; the runbook pastes `manifestLine` into
     * manifest.yml. Nothing here writes to Jira.
     */
    'relay.field.resolve': async ({ context }) => {
      const settings = await store.settings();
      const fields = await resolveAppFields(context);
      return {
        // `field` is the aggregate the console already reads; `fields` names the
        // two app-owned fields explicitly.
        field: fields,
        fields,
        expression: fields.expression,
        manifestLine: fields.manifestLine,
        appliedExpression: settings.closureExpressionApplied ?? null,
        matchesApplied: settings.closureExpressionApplied === fields.expression,
        scope: 'write:app-data:jira',
        note: fields.resolved
          ? 'Write this line into manifest.yml under jira:workflowCondition, then deploy again.'
          : 'Both fields are created when the app is deployed and installed. Until Jira returns them, the condition has nothing to read and refuses.',
      };
    },

    /**
     * Reconcile every tracked issue: projection, count field and state field —
     * or report precisely why it could not be.
     *
     * The categories are the report. P2.1 counted `no_ledger` as "already in
     * step", which is how an issue with no record could look reconciled while
     * the condition had nothing to read. It is now its own failure category.
     */
    'relay.field.reconcile': async ({ context }) => {
      const settings = await store.settings();
      const fields = await resolveAppFields(context);
      const io = makeIo(settings, fields);
      const tracked = await store.tracked();

      const report = {
        inSync: [],
        repaired: [],
        noLedger: [],
        initializing: [],
        failed: [],
        inaccessible: [],
        unmanaged: [],
      };

      for (const entry of tracked) {
        let record;
        try {
          record = await store.readLedger(entry.key);
        } catch (err) {
          report.inaccessible.push({ key: entry.key, error: String(err?.message ?? err) });
          continue;
        }
        if (!record) { report.noLedger.push(entry.key); continue; }
        if (record.state === INITIALIZING) { report.initializing.push(entry.key); continue; }
        if (record.state === UNMANAGED) report.unmanaged.push(entry.key);

        try {
          // No `maxAgeMs: 0`: reconciling should repair what is out of step, not
          // rewrite every projection on every run.
          const res = await syncIssue(io, entry.key, { now: now() });
          if (res.status === 'no_ledger') report.noLedger.push(entry.key);
          else if (res.wrote) report.repaired.push({ key: entry.key, state: res.state, open: res.counts?.open ?? null });
          else report.inSync.push(entry.key);
        } catch (err) {
          const message = String(err?.message ?? err);
          const stage = /state_field/.test(message) ? 'state_field' : /field/.test(message) ? 'count_field' : /projection/.test(message) ? 'projection' : 'read';
          report.failed.push({ key: entry.key, stage, error: message });
        }
      }

      const failedCount = report.failed.length + report.inaccessible.length + report.noLedger.length + report.initializing.length;
      return {
        field: fields,
        attempted: tracked.length,
        repaired: report.repaired.length,
        alreadyInStep: report.inSync.length,
        report,
        failed: report.failed,
        ok: failedCount === 0 && fields.resolved,
        note: !fields.resolved
          ? 'The condition fields could not both be resolved, so no field was written. Projections may still have been reconciled.'
          : report.noLedger.length
            ? `${report.noLedger.length} tracked issue(s) have no record. Run Backfill for the project, or Track those issues.`
            : report.initializing.length
              ? `${report.initializing.length} issue(s) are still initialising. Re-run Track for them; they stay withheld until it completes.`
              : null,
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
