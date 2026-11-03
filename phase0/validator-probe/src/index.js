/**
 * Relay Phase 0 probe — Forge entry points.
 *
 * Two handlers only:
 *   gate(payload)  — the jira:workflowValidator function (Part 2)
 *   lab(request)   — a webtrigger that runs the extraction benchmark (Part 3-5)
 *
 * I/O lives here. All decisions live in ./gate.js and ./extraction/*, which are
 * pure and unit-tested outside the Forge runtime.
 *
 * NOT PRODUCTION CODE. Delete this app once the validation report is written.
 */

import { kvs } from '@forge/kvs';
import { api, route } from '@forge/api';
import { chat, list } from '@forge/llm';

import { decideGate } from './gate.js';
import { createGateHandler } from './gate-handler.js';
import { deriveEnforcement } from './enforcement.js';
import { RECOVERY_RUNBOOK, RUNBOOK_VERIFIED } from './uninstall-audit.js';
import { EMIT_OBLIGATIONS_TOOL } from './extraction/schema.js';
import { SYSTEM_PROMPT, PROMPT_VERSION, buildUserMessage, sanitiseCommentText } from './extraction/prompt.js';
import { processModelOutput } from './extraction/pipeline.js';
import { requestUrl } from './lab-request.js';
import { scoreRun, renderMarkdown } from './extraction/score.js';

import { comments } from './data/comments.js';
import { groundTruth } from './data/ground-truth.js';

const GATE_KEY = (issueKey) => `relay:gate:${issueKey}`;
const RUN_KEY = (runId) => `relay:run:${runId}`;

const MODEL = 'claude-sonnet-4-6';
const log = (obj) => console.log(JSON.stringify({ relay: true, ...obj, at: new Date().toISOString() }));

// ────────────────────────────────────────────── PART 2: the closure gate ──

/**
 * jira:workflowValidator entry point.
 *
 * Contract (verified in @forge/manifest schema + Atlassian docs):
 *   { result: true }                     transition proceeds
 *   { result: false, errorMessage: '…' } transition blocked, post-functions skipped
 *
 * No LLM call. No computation. Precomputed state only, inside a ~25s budget.
 * All logic lives in ./gate-handler.js so it can be tested without Forge.
 */
export const gate = createGateHandler({
  getGateState: async (issueKey) => kvs.get(GATE_KEY(issueKey)),
  // F5: no label fallback. Gate state comes from the entity store and nowhere
  // else, so edit permission on an issue is not edit permission on enforcement.
  // Flip the gate with the lab webtrigger instead: ?action=state&key=...&blocking=2
  getLabels: undefined,
  log: (event) => {
    let enriched = event;
    if (event && event.event === 'gate_decision') {
      // Stamp closure provenance on every decision so the audit trail can never
      // claim the gate ran when it could not.
      const enforcement = deriveEnforcement({
        decision: { result: event.result, audit: event.audit },
        state: event.state,
        nowMs: Date.now(),
      });
      enriched = { ...event, enforcement };
    }
    console.log(JSON.stringify({ relay: true, ...enriched, at: new Date().toISOString() }));
  },
});

// ─────────────────────────────────────── PART 3-5: the benchmark endpoint ──

/**
 * Webtrigger: GET ?action=…
 *
 *   env                     list available Claude models (proves the LLM module is live)
 *   state&key=KEY&blocking=n write gate state for an issue, so the validator can be flipped
 *   run&runId=x&from=0&count=3   run N comments through the real Forge LLM
 *   report&runId=x          score everything gathered so far
 *
 * @param {any} request
 */
export const lab = async (request) => {
  // The Forge webtrigger runtime sends `queryParameters`, not `url`.
  // See ./lab-request.js for why that distinction broke this endpoint.
  const url = requestUrl(request);
  const action = url.searchParams.get('action') ?? 'env';

  try {
    switch (action) {
      case 'env': return json(await envInfo());
      case 'state': return json(await setGateState(url));
      case 'run': return json(await runBatch(url));
      case 'report': return json(await report(url));
      case 'runbook': return json({ ok: true, runbookVerified: RUNBOOK_VERIFIED, steps: RECOVERY_RUNBOOK });
      default: return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (err) {
    log({ event: 'lab_error', action, error: String(err?.stack ?? err) });
    return json({ error: String(err?.message ?? err), action }, 500);
  }
};

async function envInfo() {
  let models = null;
  let llmError = null;
  try {
    models = await list();
  } catch (err) {
    llmError = String(err?.message ?? err);
  }
  return {
    ok: !llmError,
    promptVersion: PROMPT_VERSION,
    configuredModel: MODEL,
    models,
    llmError,
    dataset: { comments: comments.length, labels: groundTruth.ground_truth.length },
    note: '@forge/llm resolves models at runtime; if `models` is null the llm module is not active on this environment.',
  };
}

async function setGateState(url) {
  const key = url.searchParams.get('key');
  if (!key) return { error: 'missing key' };
  const state = {
    enabled: url.searchParams.get('enabled') !== 'false',
    stateAvailable: true,
    blockingCount: num(url.searchParams.get('blocking'), 0),
    unownedCount: num(url.searchParams.get('unowned'), 0),
    overdueCount: num(url.searchParams.get('overdue'), 0),
    policy: url.searchParams.get('policy') ?? 'fail-open',
    updatedAt: new Date().toISOString(),
  };
  await kvs.set(GATE_KEY(key), state);
  return { ok: true, key, state, message: decideGate(state).errorMessage ?? null };
}

async function runBatch(url) {
  const runId = url.searchParams.get('runId') ?? 'default';
  const from = Math.max(0, num(url.searchParams.get('from'), 0));
  const count = Math.min(10, Math.max(1, num(url.searchParams.get('count'), 3)));

  const slice = comments.slice(from, from + count);
  const existing = (await kvs.get(RUN_KEY(runId))) ?? { runId, results: {}, startedAt: new Date().toISOString() };

  const outcomes = await Promise.all(slice.map(async (raw) => {
    const comment = { ...raw, text: sanitiseCommentText(raw.text) };
    const t0 = Date.now();
    try {
      const response = await chat({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(comment) },
        ],
        tools: [EMIT_OBLIGATIONS_TOOL],
        tool_choice: { type: 'function', function: { name: 'emit_obligations' } },
        max_completion_tokens: 1200,
        // NOTE: temperature omitted on purpose. Per the Forge LLM model docs,
        // sonnet-5 / opus-4-7 / opus-4-8 / opus-5 reject temperature and top_p.
      });
      const latencyMs = Date.now() - t0;
      return processModelOutput({
        comment,
        modelResponse: response,
        model: MODEL,
        usage: response?.usage,
        latencyMs,
        promptVersion: PROMPT_VERSION,
      });
    } catch (err) {
      return {
        commentId: comment.id,
        ok: false,
        reason: 'LLM_ERROR',
        detail: String(err?.message ?? err),
        accepted: [], rejected: [], quotesProposed: 0, quotesVerified: 0,
        latencyMs: Date.now() - t0,
      };
    }
  }));

  for (const o of outcomes) existing.results[o.commentId] = o;
  existing.updatedAt = new Date().toISOString();
  await kvs.set(RUN_KEY(runId), existing);

  return {
    ok: true,
    runId,
    processedThisCall: outcomes.map((o) => ({
      id: o.commentId,
      ok: o.ok,
      reason: o.reason ?? null,
      accepted: o.accepted?.length ?? 0,
      rejected: (o.rejected ?? []).map((r) => `${r.stage}:${r.reason}`),
      latencyMs: o.latencyMs,
    })),
    totalSoFar: Object.keys(existing.results).length,
    nextFrom: from + slice.length,
    done: from + slice.length >= comments.length,
  };
}

async function report(url) {
  const runId = url.searchParams.get('runId') ?? 'default';
  const stored = (await kvs.get(RUN_KEY(runId))) ?? { results: {} };
  const map = new Map(Object.entries(stored.results));
  if (map.size === 0) return { error: 'no results yet — call action=run first' };

  const scored = scoreRun({ comments: comments, ground_truth: groundTruth.ground_truth }, map);
  return {
    ok: true,
    runId,
    commentsScored: map.size,
    markdown: renderMarkdown(scored, `Forge LLM run: ${runId} (${MODEL})`),
    scored,
  };
}

function num(v, fallback) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function json(body, statusCode = 200) {
  return { statusCode, headers: { 'Content-Type': ['application/json'] }, body: JSON.stringify(body, null, 2) };
}
