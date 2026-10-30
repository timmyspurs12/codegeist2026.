/**
 * Tool schema and runtime validation for the `emit_obligations` tool.
 *
 * Why tools and not `response_format`: verified against the published typings
 * of @forge/llm@1.0.9 — `LlmRequest` is
 *   { messages, temperature?, max_completion_tokens?, top_p?, tools?, tool_choice? }
 * There is no `response_format` field, so forced tool calling is the only
 * supported route to structured output.
 *
 * `tool_choice: { type: 'function', function: { name: 'emit_obligations' } }`
 * is supported by the same typings.
 */

export const CATEGORIES = ['inspection', 'callback', 'document', 'repair', 'review', 'other'];

export const MAX_QUOTE_CHARS = 500;
export const MAX_SUMMARY_CHARS = 140;

export const EMIT_OBLIGATIONS_TOOL = {
  type: 'function',
  function: {
    name: 'emit_obligations',
    description:
      'Emit the commitments found in a single operational comment. Emit an empty array if the comment contains no commitment to a person.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['obligations'],
      properties: {
        obligations: {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'evidence_quote',
              'promise_summary',
              'promised_to_label',
              'owner_account_id',
              'due_at_iso',
              'deadline_phrase',
              'category',
              'confidence',
              'ambiguity_note',
            ],
            properties: {
              evidence_quote: {
                type: 'string',
                minLength: 3,
                maxLength: MAX_QUOTE_CHARS,
                description:
                  'A VERBATIM substring copied from the comment. Not a paraphrase. Not a reconstruction. If you cannot copy an exact span, do not emit the obligation.',
              },
              promise_summary: {
                type: 'string',
                maxLength: MAX_SUMMARY_CHARS,
                description: 'Plain-language statement of what was promised, with no interpretation beyond the text.',
              },
              promised_to_label: {
                type: ['string', 'null'],
                description: 'Who the promise was made to, as a role/label (e.g. "tenant, Flat 12"). Null if unclear. Never a full name plus address.',
              },
              owner_account_id: {
                type: ['string', 'null'],
                description: 'Only if the comment explicitly names or @mentions the responsible individual, or the author states it in the first person. Otherwise null. Null is the correct answer far more often than not.',
              },
              due_at_iso: {
                type: ['string', 'null'],
                description: 'YYYY-MM-DD, ONLY if an explicit date is stated in the comment. Otherwise null. Do not estimate.',
              },
              deadline_phrase: {
                type: ['string', 'null'],
                description: 'The exact words that state the deadline, e.g. "by Thursday". Null if no deadline is stated.',
              },
              category: { type: 'string', enum: CATEGORIES },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Your own calibrated confidence that this is a genuine commitment to a person.',
              },
              ambiguity_note: {
                type: ['string', 'null'],
                maxLength: 200,
                description: 'If something is unclear, say what. Otherwise null.',
              },
            },
          },
        },
      },
    },
  },
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate one obligation object against the schema.
 * Rejects rather than repairs.
 *
 * @param {unknown} obj
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateObligation(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['NOT_AN_OBJECT'] };
  }

  const known = new Set([
    'evidence_quote', 'promise_summary', 'promised_to_label', 'owner_account_id',
    'due_at_iso', 'deadline_phrase', 'category', 'confidence', 'ambiguity_note',
  ]);
  for (const k of Object.keys(obj)) {
    if (!known.has(k)) errors.push(`UNEXPECTED_PROPERTY:${k}`);
  }

  const str = (v, name, max, min = 0) => {
    if (v === null || v === undefined) return;
    if (typeof v !== 'string') { errors.push(`NOT_A_STRING:${name}`); return; }
    if (v.length < min) errors.push(`TOO_SHORT:${name}`);
    if (max && v.length > max) errors.push(`TOO_LONG:${name}`);
  };

  str(obj.evidence_quote, 'evidence_quote', MAX_QUOTE_CHARS, 3);
  if (!obj.evidence_quote) errors.push('MISSING:evidence_quote');

  str(obj.promise_summary, 'promise_summary', MAX_SUMMARY_CHARS);
  if (!obj.promise_summary) errors.push('MISSING:promise_summary');

  str(obj.promised_to_label, 'promised_to_label', 120);
  str(obj.owner_account_id, 'owner_account_id', 128);
  str(obj.deadline_phrase, 'deadline_phrase', 80);
  str(obj.ambiguity_note, 'ambiguity_note', 200);

  if (obj.due_at_iso !== null && obj.due_at_iso !== undefined) {
    if (typeof obj.due_at_iso !== 'string' || !ISO_DATE.test(obj.due_at_iso) || Number.isNaN(Date.parse(obj.due_at_iso))) {
      errors.push('BAD_DATE_FORMAT');
    }
  }

  if (!CATEGORIES.includes(obj.category)) errors.push(`BAD_CATEGORY:${String(obj.category)}`);

  if (typeof obj.confidence !== 'number' || !Number.isFinite(obj.confidence) || obj.confidence < 0 || obj.confidence > 1) {
    errors.push('BAD_CONFIDENCE');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Parse the tool call out of a ChatResponse (`choices[0].message.tool_calls`).
 * Returns a discriminated result instead of throwing.
 *
 * @param {any} response
 * @returns {{ok: true, obligations: unknown[]} | {ok: false, reason: string, detail?: string}}
 */
export function parseToolCall(response) {
  const choice = response?.choices?.[0];
  if (!choice) return { ok: false, reason: 'NO_CHOICE' };

  const calls = choice.message?.tool_calls;
  if (!Array.isArray(calls) || calls.length === 0) {
    return { ok: false, reason: 'NO_TOOL_CALL', detail: `finish_reason=${choice.finish_reason}` };
  }

  const call = calls.find((c) => c?.function?.name === 'emit_obligations');
  if (!call) return { ok: false, reason: 'WRONG_TOOL', detail: String(calls[0]?.function?.name) };

  const args = call.function.arguments;
  let payload = args;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return { ok: false, reason: 'UNPARSEABLE_ARGUMENTS' }; }
  }
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'NON_OBJECT_ARGUMENTS' };

  const obligations = payload.obligations;
  if (!Array.isArray(obligations)) return { ok: false, reason: 'MISSING_OBLIGATIONS_ARRAY' };

  return { ok: true, obligations };
}
