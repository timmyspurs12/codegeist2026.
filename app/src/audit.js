/**
 * Append-only audit trail.
 *
 * Events are written with an explicit id so a retried queue message cannot
 * double-record the same decision. Ordering is by `seq`, not by wall clock: two
 * events in the same second must still have a stable order.
 */

export const AUDIT_LIMIT = 500;

export function appendEvent(trail, event) {
  const list = trail ?? { seq: 0, events: [] };
  if (list.events.some((e) => e.id === event.id)) {
    return { trail: list, appended: false };
  }
  const next = {
    seq: list.seq + 1,
    events: [{ ...event, seq: list.seq + 1 }, ...list.events].slice(0, AUDIT_LIMIT),
  };
  return { trail: next, appended: true };
}

export function eventsFor(trail, issueKey) {
  return (trail?.events ?? []).filter((e) => e.issueKey === issueKey);
}

export function summarise(trail) {
  const events = trail?.events ?? [];
  return {
    total: events.length,
    blocked: events.filter((e) => e.type === 'closure_blocked').length,
    allowed: events.filter((e) => e.type === 'closure_allowed').length,
  };
}
