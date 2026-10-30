/**
 * Whitespace / punctuation normalisation used before any substring check.
 *
 * The rule set is deliberately conservative: it may only collapse differences
 * that carry no meaning (unicode form, whitespace runs, quote glyphs, dash
 * glyphs, zero-width characters). It must NEVER repair, rewrite or fuzzy-match
 * a quote, because a quote that needed repairing is a quote the model invented.
 */

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060]/g;
const SMART_SINGLE = /[\u2018\u2019\u201A\u201B\u2032]/g;
const SMART_DOUBLE = /[\u201C\u201D\u201E\u201F\u2033]/g;
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g;
const NBSP = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * @param {string} input
 * @returns {string}
 */
export function normalise(input) {
  if (typeof input !== 'string') return '';
  return input
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .replace(NBSP, ' ')
    .replace(SMART_SINGLE, "'")
    .replace(SMART_DOUBLE, '"')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Does `quote` appear verbatim in `source` after normalisation?
 *
 * @param {string} source
 * @param {string} quote
 * @returns {boolean}
 */
export function isVerbatimSubstring(source, quote) {
  const s = normalise(source);
  const q = normalise(quote);
  if (!s || !q) return false;
  return s.includes(q);
}

/**
 * Diagnostic only. Returns the closest window of the source to the quote so a
 * rejected extraction can be inspected. The output of this function must never
 * be persisted as evidence — it exists to explain a rejection.
 *
 * @param {string} source
 * @param {string} quote
 * @returns {{score: number, window: string}}
 */
export function nearestWindow(source, quote) {
  const s = normalise(source);
  const q = normalise(quote);
  if (!s || !q) return { score: 0, window: '' };
  const qTokens = new Set(tokenise(q));
  const words = s.split(' ');
  const qLen = Math.max(1, q.split(' ').length);
  let best = { score: 0, window: '' };
  for (let i = 0; i <= Math.max(0, words.length - qLen); i += 1) {
    const window = words.slice(i, i + qLen).join(' ');
    const wTokens = new Set(tokenise(window));
    let inter = 0;
    for (const t of qTokens) if (wTokens.has(t)) inter += 1;
    const score = inter / Math.max(qTokens.size, wTokens.size, 1);
    if (score > best.score) best = { score, window };
  }
  return best;
}

/** @param {string} text @returns {string[]} */
export function tokenise(text) {
  return normalise(text)
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff]+/i)
    .filter((t) => t.length > 1);
}
