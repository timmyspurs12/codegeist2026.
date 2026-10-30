/**
 * Deterministic deadline resolution.
 *
 * The model is allowed to quote the temporal phrase ("by Thursday", "până
 * vineri") but is NOT trusted to produce the date. Dates are computed here, in
 * application code, from the comment's own timestamp. This is the difference
 * between "the AI guessed a deadline" and "the AI quoted a deadline and we
 * calculated it".
 *
 * Every rule returns a `rule` tag so the resolution is auditable.
 */

import { normalise } from './normalize.js';

const WEEKDAY_INDEX = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  // Spanish
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
  // Romanian
  duminica: 0, luni: 1, marti: 2, miercuri: 3, joi: 4, vineri: 5, sambata: 6,
};

const MONTH_INDEX = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const TOMORROW = /\b(tomorrow|ma[ií]ne|mañana)\b/;
const END_OF_MONTH = /\b(end of (the )?month|sf[aâ]r[sș]itul lunii|fin de mes)\b/;
const WEEKEND = /\b(before the weekend|by the weekend|end of (the )?week)\b/;
const CHRISTMAS = /\bchristmas\b/;
const AMBIGUOUS_PERIOD = /\b(next week|this week|next month|soon|as soon as|saptamana viitoare|semana que viene)\b/;

/** @param {Date} d @returns {Date} */
function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** @param {Date} d @returns {string} */
function iso(d) {
  return d.toISOString().slice(0, 10);
}

function stripLeadingConnector(phrase) {
  return normalise(phrase)
    .toLowerCase()
    .replace(/^(by|before|on|no later than|due|until|p[aâ]n[aă]|el|para|antes del|antes de)\s+/g, '')
    .trim();
}

/**
 * Resolve a temporal phrase against a reference instant.
 *
 * @param {string|null|undefined} phrase  e.g. "by Thursday 12 November"
 * @param {string} referenceIso           ISO timestamp of the source comment
 * @returns {{dueDate: string|null, rule: string, matched: string|null}}
 */
export function resolveDeadline(phrase, referenceIso) {
  if (!phrase || typeof phrase !== 'string' || !phrase.trim()) {
    return { dueDate: null, rule: 'NONE', matched: null };
  }

  const ref = startOfUtcDay(new Date(referenceIso));
  if (Number.isNaN(ref.getTime())) {
    return { dueDate: null, rule: 'BAD_REFERENCE', matched: null };
  }

  const raw = normalise(phrase).toLowerCase();
  const body = stripLeadingConnector(phrase);

  // 1. Explicit day + month: "12 november", "12th of november"
  const dayMonth = body.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})\b/);
  if (dayMonth && MONTH_INDEX[dayMonth[2]] !== undefined) {
    const day = Number.parseInt(dayMonth[1], 10);
    if (day >= 1 && day <= 31) {
      const year = ref.getUTCFullYear();
      let candidate = new Date(Date.UTC(year, MONTH_INDEX[dayMonth[2]], day));
      if (candidate.getTime() < ref.getTime()) {
        candidate = new Date(Date.UTC(year + 1, MONTH_INDEX[dayMonth[2]], day));
      }
      return { dueDate: iso(candidate), rule: 'EXPLICIT_DAY_MONTH', matched: dayMonth[0] };
    }
  }

  // 2. Fixed cultural date
  if (CHRISTMAS.test(raw)) {
    const year = ref.getUTCFullYear();
    let candidate = new Date(Date.UTC(year, 11, 24));
    if (candidate.getTime() < ref.getTime()) candidate = new Date(Date.UTC(year + 1, 11, 24));
    return { dueDate: iso(candidate), rule: 'FIXED_DATE_CHRISTMAS', matched: 'christmas' };
  }

  // 3. End of month
  if (END_OF_MONTH.test(raw)) {
    const last = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0));
    return { dueDate: iso(last), rule: 'END_OF_MONTH', matched: 'end of month' };
  }

  // 4. End of week / before the weekend
  if (WEEKEND.test(raw)) {
    const dow = ref.getUTCDay();
    const delta = (5 - dow + 7) % 7; // Friday of the current week
    const friday = new Date(ref.getTime() + delta * 86400000);
    return { dueDate: iso(friday), rule: 'END_OF_WEEK', matched: 'weekend' };
  }

  // 5. Tomorrow
  if (TOMORROW.test(body)) {
    return { dueDate: iso(new Date(ref.getTime() + 86400000)), rule: 'RELATIVE_DAY', matched: 'tomorrow' };
  }

  // 6. Weekday name (en / es / ro)
  for (const [name, target] of Object.entries(WEEKDAY_INDEX)) {
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(body)) {
      const delta = (target - ref.getUTCDay() + 7) % 7;
      const date = new Date(ref.getTime() + delta * 86400000);
      return { dueDate: iso(date), rule: 'NEXT_WEEKDAY', matched: name };
    }
  }

  // 7. Bare ordinal / day of month: "the 20th", "the 17th"
  const ordinal = body.match(/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/);
  if (ordinal) {
    const day = Number.parseInt(ordinal[1], 10);
    let candidate = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), day));
    if (candidate.getTime() < ref.getTime()) {
      candidate = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, day));
    }
    return { dueDate: iso(candidate), rule: 'DAY_OF_MONTH', matched: ordinal[0] };
  }

  // 8. Recognised but unresolvable period — return null rather than guess
  if (AMBIGUOUS_PERIOD.test(body)) {
    return { dueDate: null, rule: 'AMBIGUOUS_PERIOD', matched: null };
  }

  return { dueDate: null, rule: 'UNRESOLVED', matched: null };
}
