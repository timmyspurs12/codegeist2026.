/**
 * The audit trail: append-only, one key per event.
 *
 * P2.1 kept each issue's trail in a single key and did
 * `get → prepend → set` to append. Two writers that appended at the same time
 * produced one event: the second write overwrote the first, and nothing
 * detected it. The trail is evidence — it is the record of *why* a case was
 * allowed to close — so losing an event is not a cosmetic bug.
 *
 * P2.2 writes each event under its own key with a create-only write
 * (`keyPolicy: 'FAIL_IF_EXISTS'`), so concurrent appends do not collide, and an
 * event id that already exists is a duplicate delivery rather than a second
 * event. Reads are paginated by prefix with a cursor, so a trail longer than
 * one page is read rather than truncated.
 *
 * This module holds the pure parts — key naming, ordering, summaries. The
 * writes go through `store.recordEvent`, which owns the create-only policy and
 * the read-back.
 */

/** Page size for `store.readAudit`, and the cap a single console read applies. */
export const AUDIT_PAGE_SIZE = 200;

/** The key an event lives under. The issue key is part of the prefix, the id the suffix. */
export function eventKey(issueKey, id) {
  return `relay:audit:${issueKey}:${id}`;
}

/**
 * A deterministic event id: the same decision, recorded twice, is one event.
 * The four parts are what a decision is about — its kind, its issue, the
 * commitment it concerns and the ledger revision it produced.
 */
export function eventId({ type, issueKey, commitmentCode = null, rev = null }) {
  return [type, issueKey, commitmentCode ?? '-', rev ?? '-'].join(':');
}

/** Newest first; ties broken by id so the order is stable across reads. */
export function orderEvents(events) {
  return [...(events ?? [])].sort((a, b) => {
    if (a.at && b.at && a.at !== b.at) return a.at < b.at ? 1 : -1;
    return String(b.id ?? '').localeCompare(String(a.id ?? ''));
  });
}

export function eventsFor(events, issueKey) {
  return orderEvents(events).filter((e) => e.issueKey === issueKey);
}

/**
 * Totals for the console. Accepts either a list or a page (`{ events }`), so a
 * truncated read reports its own totals honestly: `truncated` says the counts
 * are over the page, not the whole trail.
 */
export function summarise(input) {
  const page = Array.isArray(input) ? { events: input } : input ?? { events: [] };
  const events = page.events ?? [];
  return {
    total: events.length,
    blocked: events.filter((e) => e.type === 'closure_blocked').length,
    allowed: events.filter((e) => e.type === 'closure_allowed').length,
    truncated: Boolean(page.truncated),
  };
}
