export function timeAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
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

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(iso: string): string {
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
  const d = new Date(iso);
  const days = Math.round((d.getTime() - Date.now()) / 864e5);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days === -1) return '1 day overdue';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days <= 21) return `Due in ${days} days`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function dueTone(iso: string | null, status: string): 'overdue' | 'soon' | 'plain' {
  if (!iso || status !== 'open') return 'plain';
  const days = (new Date(iso).getTime() - Date.now()) / 864e5;
  if (days < 0) return 'overdue';
  if (days <= 3) return 'soon';
  return 'plain';
}
