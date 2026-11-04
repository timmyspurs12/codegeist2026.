/**
 * Candidate extraction — turning a real Jira comment into a reviewable claim.
 *
 * The single rule this file exists to enforce: **a candidate either quotes the
 * source exactly, at offsets that still resolve to that quotation, or it does
 * not exist.** There is no repair step, no fuzzy re-alignment and no generated
 * evidence. Every candidate is re-sliced from the comment body before it is
 * returned; anything that fails that check is reported in `rejected` with a
 * reason, and never silently dropped or silently fixed.
 *
 * Everything here is deterministic given (body, comment metadata, now), which
 * is what makes idempotency possible: the same comment scanned twice produces
 * the same fingerprints, so the second scan creates nothing.
 */
import { createHash } from 'node:crypto';

export const DEFAULT_THRESHOLD = 0.55;

const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|No|St|approx|Tel|Ref)\.$/i;

/**
 * Split into sentences while keeping exact offsets into `body`.
 * Newlines always end a sentence; so does terminal punctuation followed by
 * whitespace, unless the token is a known abbreviation.
 */
export function splitSentences(body) {
  const out = [];
  if (!body) return out;

  const push = (from, to) => {
    const raw = body.slice(from, to);
    if (!raw.trim()) return;
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    out.push({ text: raw.trim(), start: from + lead, end: to - trail });
  };

  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '\n') {
      push(start, i);
      start = i + 1;
      continue;
    }
    if (ch === '.' || ch === '!' || ch === '?') {
      const next = body[i + 1];
      const atEnd = next === undefined;
      if (!atEnd && !/\s/.test(next)) continue;
      if (ch === '.' && ABBREVIATIONS.test(body.slice(start, i + 1))) continue;
      push(start, i + 1);
      start = i + 1;
    }
  }
  push(start, body.length);
  return out;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fourteen: 14, 'twenty-four': 24 };

const at5pm = (d, hour = 17) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0));
  return x.toISOString();
};

const addDays = (d, n) => new Date(d.getTime() + n * 864e5);

function monthIndex(word) {
  const w = word.toLowerCase().replace(/\.$/, '');
  const full = MONTHS.findIndex((m) => m === w || m.slice(0, 3) === w);
  return full;
}

/**
 * Parse a due date out of one sentence.
 *
 * Only formats Relay can read with confidence are accepted. When the wording is
 * ambiguous ("Thursday access slot") the answer is `null`, because a wrong due
 * date is worse than an empty one: it would put a false deadline on someone.
 *
 * Times are end of business day, 17:00 UTC, and that assumption is reported in
 * `basis` so the review screen can show what was assumed.
 */
export function parseDue(sentence, now = new Date()) {
  const s = sentence.toLowerCase();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

  let m = s.match(/\bwithin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(working\s+)?(days?|weeks?)\b/);
  if (m) {
    const n = NUMBER_WORDS[m[1]] ?? Number(m[1]);
    const days = /week/.test(m[3]) ? n * 7 : n;
    return { iso: at5pm(addDays(today, days)), basis: `${m[0].trim()} from the comment date` };
  }

  m = s.match(/\bin\s+(\d+|one|two|three|four|five|six|seven)\s+(days?|weeks?)\b/);
  if (m) {
    const n = NUMBER_WORDS[m[1]] ?? Number(m[1]);
    const days = /week/.test(m[2]) ? n * 7 : n;
    return { iso: at5pm(addDays(today, days)), basis: `${m[0].trim()}` };
  }

  if (/\btomorrow\b/.test(s)) return { iso: at5pm(addDays(today, 1)), basis: 'tomorrow' };
  if (/\b(today|this afternoon|end of day|eod)\b/.test(s)) return { iso: at5pm(today), basis: 'today' };
  if (/\bnext week\b/.test(s)) return { iso: at5pm(addDays(today, 7)), basis: 'next week' };

  // "by Friday" / "on Monday" / "before Thursday"
  m = s.match(/\b(?:by|on|before|due)\s+(?:this\s+|next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) {
    const target = WEEKDAYS.indexOf(m[1]);
    const current = today.getUTCDay();
    let delta = (target - current + 7) % 7;
    if (delta === 0) delta = 7;
    if (/\bnext\s+/.test(m[0])) delta += delta < 7 ? 7 : 0;
    return { iso: at5pm(addDays(today, delta)), basis: m[0].trim() };
  }

  // "by 14 Nov" / "on November 14" / "by the 24th"
  m = s.match(/\b(?:by|on|before|due)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  if (m) {
    const day = Number(m[1]);
    const mi = monthIndex(m[2]);
    const year = today.getUTCFullYear() + (mi < today.getUTCMonth() ? 1 : 0);
    return { iso: at5pm(new Date(Date.UTC(year, mi, day))), basis: m[0].trim() };
  }
  m = s.match(/\b(?:by|on|before|due)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/);
  if (m) {
    const day = Number(m[1]);
    let year = today.getUTCFullYear();
    let month = today.getUTCMonth();
    if (day <= today.getUTCDate()) {
      month += 1;
      if (month > 11) { month = 0; year += 1; }
    }
    return { iso: at5pm(new Date(Date.UTC(year, month, day))), basis: m[0].trim() };
  }

  return null;
}

const ACTION_VERBS = /\b(send|sent|book|booked|order|ordered|fit|fitted|replace|replaced|chase|confirm|arrange|visit|call|email|update|report|raise|fix|repair|inspect|attend|deliver|collect|return|refund|complete|finish|test|pressure[- ]test|check)\b/i;

/**
 * Score how much a sentence reads like a promise someone made.
 * Returns the score plus the cues that produced it, because "why did Relay
 * think this was a commitment?" has to be answerable on screen.
 */
export function scorePromise(sentence) {
  const s = sentence;
  const signals = [];
  let score = 0;

  if (/\b(i will|i'll|we will|we'll|i am going to|we are going to|i shall|we shall)\b/i.test(s)) {
    score += 0.4; signals.push('first-person future');
  } else if (/\b(will|shall|going to)\b/i.test(s)) {
    score += 0.18; signals.push('future tense');
  }
  if (ACTION_VERBS.test(s)) { score += 0.18; signals.push('action'); }
  if (/\b(by|before|within|on|due|tomorrow|today|next week)\b/i.test(s)) { score += 0.16; signals.push('time reference'); }
  if (/\d{1,2}(:\d{2})?\s*(am|pm)\b|\b\d{1,2}(st|nd|rd|th)\b|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(s)) {
    score += 0.1; signals.push('date or time named');
  }
  if (/^\s*(can you|could you|would you|please|do you|are you able)\b/i.test(s)) { score -= 0.35; signals.push('request, not promise'); }
  if (/\?\s*$/.test(s)) { score -= 0.3; signals.push('question'); }
  if (/\b(not|never|cannot|can't|won't|unable)\b/i.test(s)) { score -= 0.15; signals.push('negation'); }
  if (s.length > 320) { score -= 0.12; signals.push('very long sentence'); }
  if (s.length < 12) { score -= 0.2; signals.push('too short'); }

  return { score: Math.max(0, Math.min(0.95, Number(score.toFixed(2)))), signals };
}

export function fingerprintOf({ issueKey, commentId, start, end, quote }) {
  return createHash('sha256')
    .update(`${issueKey}\u0000${commentId}\u0000${start}\u0000${end}\u0000${quote}`)
    .digest('hex')
    .slice(0, 32);
}

export function initialsOf(name) {
  return String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('') || '?';
}

/**
 * @param {{ issueKey: string, comment: {id: string, body: string, rawHash?: string,
 *   author: {id: string, name: string}, createdAt: string}, now?: Date,
 *   threshold?: number, maxPerComment?: number }} input
 * @returns {{ candidates: object[], rejected: {quote: string, reason: string}[], scanned: number }}
 */
export function extractCandidates({
  issueKey, comment, now = new Date(), threshold = DEFAULT_THRESHOLD, maxPerComment = 12,
}) {
  const body = comment?.body ?? '';
  const candidates = [];
  const rejected = [];
  const sentences = splitSentences(body);

  for (const sentence of sentences) {
    const { score, signals } = scorePromise(sentence.text);
    if (score < threshold) continue;

    // The anchor check. If this ever fails, the candidate is not allowed to
    // exist — an unquotable commitment is not evidence of anything.
    const quoted = body.slice(sentence.start, sentence.end);
    if (quoted !== sentence.text) {
      rejected.push({ quote: sentence.text.slice(0, 80), reason: 'anchor_mismatch' });
      continue;
    }

    const due = parseDue(sentence.text, now);
    candidates.push({
      quote: sentence.text,
      start: sentence.start,
      end: sentence.end,
      body,
      bodyHash: comment.rawHash ?? null,
      commentId: String(comment.id),
      createdAt: comment.createdAt,
      author: { id: comment.author.id, name: comment.author.name, initials: initialsOf(comment.author.name) },
      text: sentence.text,
      ownerHint: { id: comment.author.id, name: comment.author.name, initials: initialsOf(comment.author.name) },
      dueAt: due?.iso ?? null,
      dueBasis: due?.basis ?? null,
      confidence: score,
      signals,
      fingerprint: fingerprintOf({
        issueKey, commentId: String(comment.id), start: sentence.start, end: sentence.end, quote: sentence.text,
      }),
    });

    if (candidates.length >= maxPerComment) break;
  }

  return { candidates, rejected, scanned: sentences.length };
}
