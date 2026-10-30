/**
 * Deterministic baseline extractor.
 *
 * Purpose: validate the measurement instrument, not to compete with the LLM.
 * If a regex extractor scores ~0.3 and the real model scores 0.8, the dataset
 * and the scorer are working. If the regex scores 0.95, the dataset is too easy
 * or the scorer is too generous, and the benchmark is worthless.
 *
 * It also exercises the full pipeline (schema -> quote -> owner -> deadline)
 * with realistic inputs, which is the only way to know the enforcement layer
 * works before a model is ever connected.
 */

const CUE = /\b(i promise|i've promised|i promised|promised|i said i|i told (her|him|them)|i'?ll|i will|we'?ll|we will|we've told|going to|i have promised|i-am promis|le promet|i am telling)\b/i;

const CATEGORY_RULES = [
  [/surveyor|inspector|inspection|assess/i, 'inspection'],
  [/ring|call|phone|back|get back to/i, 'callback'],
  [/report|write to|send|summary|note|letter|document/i, 'document'],
  [/repair|fix|boiler|door|window|scaffold|gutter|fence|damp|render|key fob|technician|electrician/i, 'repair'],
  [/review/i, 'review'],
];

const DEADLINE = /\b(by|before)\s+([^.,;!?]+)/i;

function categoryFor(text) {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(text)) return cat;
  return 'other';
}

/**
 * Produce a synthetic `emit_obligations` tool-call response for one comment.
 * Shaped exactly like a real @forge/llm ChatResponse so it travels the same
 * code path as the model.
 *
 * @param {{id: string, text: string, timestamp: string, author_account_id: string}} comment
 */
export function baselineResponse(comment) {
  const sentences = comment.text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const obligations = [];

  for (const sentence of sentences) {
    if (!CUE.test(sentence)) continue;
    const dl = sentence.match(DEADLINE);
    const deadlinePhrase = dl ? `${dl[1].toLowerCase()} ${dl[2].trim()}` : (/\btomorrow\b/i.test(sentence) ? 'tomorrow' : null);
    obligations.push({
      evidence_quote: sentence,
      promise_summary: sentence.slice(0, 140),
      promised_to_label: null,
      owner_account_id: comment.author_account_id,
      due_at_iso: null,
      deadline_phrase: deadlinePhrase,
      category: categoryFor(sentence),
      confidence: 0.75,
      ambiguity_note: null,
    });
  }

  return {
    choices: [{
      finish_reason: 'tool_calls',
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'baseline-0',
          type: 'function',
          index: 0,
          function: { name: 'emit_obligations', arguments: { obligations } },
        }],
      },
    }],
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };
}
