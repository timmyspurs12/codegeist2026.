/** Renders an absence as an absence: a missing timestamp is not "just now". */
export const NOT_RECORDED = '—';

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return NOT_RECORDED;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return NOT_RECORDED;
  const s = Math.max(1, Math.round((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return NOT_RECORDED;
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return 'Undated';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function dueLabel(iso: string | null): string {
  if (!iso) return 'No date';
  const ms = new Date(iso).getTime() - Date.now();
  const days = ms / 864e5;

  // Rounding is not good enough here: a date six hours past is overdue, and
  // saying "Due today" beside an Overdue lozenge looks like a bug because it is.
  if (ms < 0) {
    const late = Math.ceil(Math.abs(days));
    return late <= 1 ? '1 day overdue' : `${late} days overdue`;
  }
  if (days < 1) return 'Due today';
  if (days < 2) return 'Due tomorrow';
  const ahead = Math.floor(days);
  if (ahead <= 21) return `Due in ${ahead} days`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function dueTone(iso: string | null, status: string): 'overdue' | 'soon' | 'plain' {
  if (!iso || status !== 'open') return 'plain';
  const days = (new Date(iso).getTime() - Date.now()) / 864e5;
  if (days < 0) return 'overdue';
  if (days <= 3) return 'soon';
  return 'plain';
}
