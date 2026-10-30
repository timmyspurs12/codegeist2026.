/**
 * The extraction pipeline: model output -> verified obligations.
 *
 * This module is where trust is *removed* from the model. Every obligation the
 * model proposes passes through five deterministic checks. Any check may reject
 * the obligation outright, and nothing is ever repaired.
 *
 *   1. schema conformance
 *   2. verbatim quote verification against the source text
 *   3. owner grounding
 *   4. deadline recomputation
 *   5. injection suspicion
 *
 * The output of this module is what would be persisted. Nothing else is.
 */

import { normalise, isVerbatimSubstring, nearestWindow } from './normalize.js';
import { resolveDeadline } from './deadline.js';
import { parseToolCall, validateObligation, CATEGORIES } from './schema.js';

export const INJECTION_PATTERNS = [
  /\bignore (all )?(the )?(previous|prior|above) instructions?\b/i,
  /\bdisregard (all )?(the )?(previous|prior|above)\b/i,
  /\byou are now\b/i,
  /\bsystem\s*:/i,
  /\bnew instruction\b/i,
  /\bassign all obligations\b/i,
  /\bset (the )?confidence (to|score)/i,
  /\bmark (every|all|this) (case|obligation|promise)s? as (resolved|closed|complete)\b/i,
  /\bdo not (record|store|log) (any )?(promises|obligations)\b/i,
  /<!--[\s\S]*?-->/,
  /\boutput an empty list\b/i,
];

/** @param {string} text @returns {boolean} */
export function containsInjection(text) {
  const s = String(text ?? '');
  return INJECTION_PATTERNS.some((re) => re.test(s));
}

/**
 * Split into rough sentences so an account id can be tested for being
 * "outside an instruction".
 * @param {string} text
 * @returns {{text: string, injected: boolean}[]}
 */
function segments(text) {
  return normalise(text)
    .split(/(?<=[.!?;])\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ text: t, injected: containsInjection(t) }));
}

/**
 * Is this account id grounded in the comment?
 * Grounded means: it is the author, or it appears literally outside an
 * instruction-like segment.
 *
 * @param {string} accountId
 * @param {{text: string, author_account_id: string}} comment
 * @returns {{grounded: boolean, reason: string}}
 */
export function ownerGrounded(accountId, comment) {
  if (!accountId) return { grounded: true, reason: 'NULL_OWNER_ALLOWED' };
  if (accountId === comment.author_account_id) return { grounded: true, reason: 'AUTHOR' };

  const segs = segments(comment.text);
  const mentionedOutsideInstruction = segs.some((s) => !s.injected && s.text.includes(accountId));
  if (mentionedOutsideInstruction) return { grounded: true, reason: 'MENTIONED_IN_TEXT' };

  const mentionedInsideInstruction = segs.some((s) => s.injected && s.text.includes(accountId));
  return {
    grounded: false,
    reason: mentionedInsideInstruction ? 'OWNER_FROM_INJECTION' : 'OWNER_NOT_IN_TEXT',
  };
}

/**
 * @typedef {Object} PipelineInput
 * @property {{id: string, text: string, timestamp: string, author_account_id: string}} comment
 * @property {any} modelResponse  Raw ChatResponse (or {choices:[...]} shaped fixture)
 * @property {string} [model]
 * @property {{input_tokens?: number, output_tokens?: number}} [usage]
 * @property {number} [latencyMs]
 * @property {string} [promptVersion]
 */

/**
 * @param {PipelineInput} input
 */
export function processModelOutput(input) {
  const { comment, modelResponse, model = 'unknown', usage = {}, latencyMs = 0, promptVersion = 'unknown' } = input;

  const parsed = parseToolCall(modelResponse);
  if (!parsed.ok) {
    return {
      commentId: comment.id,
      ok: false,
      reason: parsed.reason,
      detail: parsed.detail ?? null,
      proposed: 0,
      accepted: [],
      rejected: [],
      usage, latencyMs, model, promptVersion,
    };
  }

  const injectionSuspected = containsInjection(comment.text);
  const accepted = [];
  const rejected = [];
  let quotesProposed = 0;
  let quotesVerified = 0;

  parsed.obligations.forEach((raw, index) => {
    const reject = (stage, reason, extra = {}) => {
      rejected.push({ index, stage, reason, raw, ...extra });
    };

    // ---- 1. schema -------------------------------------------------------
    const schema = validateObligation(raw);
    if (!schema.ok) {
      reject('SCHEMA', schema.errors.join(','), { errors: schema.errors });
      return;
    }

    // ---- 2. verbatim quote ----------------------------------------------
    quotesProposed += 1;
    if (!isVerbatimSubstring(comment.text, raw.evidence_quote)) {
      const near = nearestWindow(comment.text, raw.evidence_quote);
      reject('QUOTE', 'QUOTE_NOT_VERBATIM', {
        nearestScore: Number(near.score.toFixed(3)),
        note: 'Rejected, not repaired. A repaired quote is an invented quote.',
      });
      return;
    }
    quotesVerified += 1;

    // ---- 3. owner grounding ---------------------------------------------
    const owner = ownerGrounded(raw.owner_account_id, comment);
    if (!owner.grounded) {
      // Downgrade to unowned rather than discard the whole obligation: the
      // promise itself may still be real, and "unowned" is the product's
      // headline signal. The model's owner claim is never kept.
      reject('OWNER', owner.reason, { downgradedToNull: true, claimedOwner: raw.owner_account_id });
    }

    // ---- 4. deadline recomputation ---------------------------------------
    let dueAt = null;
    let deadlineRule = 'NONE';
    let deadlineFlag = null;

    if (raw.deadline_phrase) {
      const resolved = resolveDeadline(raw.deadline_phrase, comment.timestamp);
      dueAt = resolved.dueDate;
      deadlineRule = resolved.rule;
      if (!dueAt) deadlineFlag = 'DEADLINE_PHRASE_UNRESOLVED';
      if (raw.due_at_iso && resolved.dueDate && raw.due_at_iso !== resolved.dueDate) {
        deadlineFlag = 'DEADLINE_MODEL_DATE_OVERRIDDEN';
      }
    } else if (raw.due_at_iso) {
      // A date with no supporting phrase cannot be audited. Discard it.
      deadlineFlag = 'DEADLINE_WITHOUT_PHRASE_DISCARDED';
    }

    // ---- 5. injection suspicion ------------------------------------------
    let confidence = raw.confidence;
    if (injectionSuspected) {
      confidence = Math.min(confidence, 0.8);
      deadlineFlag = deadlineFlag ? `${deadlineFlag}+INJECTION_SUSPECTED` : 'INJECTION_SUSPECTED';
    }

    accepted.push({
      commentId: comment.id,
      evidence_quote: raw.evidence_quote,
      promise_summary: raw.promise_summary,
      promised_to_label: raw.promised_to_label ?? null,
      owner_account_id: owner.grounded ? raw.owner_account_id : null,
      owner_basis: owner.reason,
      due_at_iso: dueAt,
      deadline_phrase: raw.deadline_phrase ?? null,
      deadline_rule: deadlineRule,
      deadline_flag: deadlineFlag,
      category: CATEGORIES.includes(raw.category) ? raw.category : 'other',
      confidence,
      model_confidence: raw.confidence,
      ambiguity_note: raw.ambiguity_note ?? null,
      source_timestamp: comment.timestamp,
      model,
      promptVersion,
    });
  });

  return {
    commentId: comment.id,
    ok: true,
    injectionSuspected,
    proposed: parsed.obligations.length,
    accepted,
    rejected,
    quotesProposed,
    quotesVerified,
    usage,
    latencyMs,
    model,
    promptVersion,
  };
}

/**
 * Whether a result should be surfaced as an obligation in the ledger or routed
 * to the human review queue. Nothing goes straight from model to ledger.
 *
 * @param {any} obligation
 * @param {number} threshold
 */
export function routeForReview(obligation, threshold = 0.7) {
  if (obligation.confidence < threshold) return 'review';
  if (obligation.deadline_flag && obligation.deadline_flag.includes('UNRESOLVED')) return 'review';
  if (obligation.owner_basis && obligation.owner_basis !== 'AUTHOR' && obligation.owner_basis !== 'NULL_OWNER_ALLOWED') return 'review';
  return 'ledger';
}
