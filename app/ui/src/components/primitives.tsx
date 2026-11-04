import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Commitment, CommitmentStatus, Person } from '../lib/types';
import { Icon, type IconName } from './Icons';
import { dueLabel, dueTone } from '../lib/format';

/* ---------------------------------------------------------------- button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'quiet' | 'danger';
  size?: 'sm' | 'md';
  icon?: IconName;
  iconAfter?: IconName;
};

export function Button({ variant = 'default', size = 'md', icon, iconAfter, children, className = '', ...rest }: ButtonProps) {
  const cls = ['btn', variant !== 'default' && `btn--${variant}`, size === 'sm' && 'btn--sm', !children && 'btn--icon', className]
    .filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 14} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={12} />}
    </button>
  );
}

/* ---------------------------------------------------------------- stamps */

export type StampTone = 'late' | 'review' | 'verified' | 'open' | 'dropped';

const statusToTone: Record<CommitmentStatus, StampTone> = {
  proposed: 'review',
  open: 'open',
  verified: 'verified',
  dropped: 'dropped',
};

const statusWord: Record<CommitmentStatus, string> = {
  proposed: 'Review',
  open: 'Open',
  verified: 'Verified',
  dropped: 'Dropped',
};

export function commitmentTone(c: Commitment): StampTone {
  if (c.status === 'open' && c.overdue) return 'late';
  return statusToTone[c.status];
}

export function Stamp({ tone = 'open', children, icon }: { tone?: StampTone; children: ReactNode; icon?: IconName }) {
  return (
    <span className={`stamp stamp--${tone}`}>
      {icon && <Icon name={icon} size={10} />}
      {children}
    </span>
  );
}

export function CommitmentStamp({ commitment }: { commitment: Commitment }) {
  const tone = commitmentTone(commitment);
  const word = tone === 'late' ? 'Overdue' : statusWord[commitment.status];
  return <Stamp tone={tone} icon={tone === 'late' ? 'clock' : undefined}>{word}</Stamp>;
}

/* ---------------------------------------------------------------- people */

export function OwnerStamp({ person, markOnly = false }: { person: Person | null; markOnly?: boolean }) {
  if (!person) {
    return (
      <span className="owner" title="No owner">
        <span className="owner__mark owner__mark--none" aria-hidden="true">—</span>
        {!markOnly && <span className="owner__name owner__name--none">Unassigned</span>}
      </span>
    );
  }
  return (
    <span className="owner" title={`${person.name}${person.role ? ` · ${person.role}` : ''}`}>
      <span className="owner__mark" aria-hidden="true">{person.initials}</span>
      {!markOnly && <span className="owner__name">{person.name}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ meta */

export function Key({ children }: { children: ReactNode }) {
  return <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{children}</span>;
}

export function Due({ iso, status }: { iso: string | null; status: CommitmentStatus }) {
  const tone = dueTone(iso, status);
  // A settled commitment cannot be overdue. Once it is verified or dropped the
  // date is a record, not a warning, so it is written as a date.
  const settled = status === 'verified' || status === 'dropped';
  const text = !iso
    ? 'No date'
    : settled
      ? `Due ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
      : dueLabel(iso);
  const color = tone === 'overdue' ? 'var(--flame)' : settled ? 'var(--muted)' : 'var(--ink-2)';
  return (
    <span className="mono" style={{ fontSize: 11.5, color }}>
      {text}
    </span>
  );
}

export function Confidence({ value }: { value: number }) {
  return (
    <span className="confidence" title={`Extraction confidence ${Math.round(value * 100)}%`}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{Math.round(value * 100)}%</span>
      <span className="confidence__ticks" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="confidence__tick" data-on={i < Math.round(value * 5)} />
        ))}
      </span>
    </span>
  );
}

/* -------------------------------------------------------------- controls */

export function Toggle<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="toggle-row" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="toggle" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}{typeof o.count === 'number' && <span className="mono" style={{ marginLeft: 5, color: 'var(--muted)' }}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className="switch__track" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

/* ---------------------------------------------------------------- states */

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      <p className="empty__text">{text}</p>
      {action}
    </div>
  );
}

export function Skeleton({ w = '100%', h = 12, style }: { w?: string | number; h?: number; style?: React.CSSProperties }) {
  return <span className="skeleton" style={{ display: 'block', width: w, height: h, ...style }} />;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'danger' | 'ok' | 'warn'; children: ReactNode }) {
  const cls = tone === 'info' ? 'notice' : `notice notice--${tone}`;
  return <div className={cls}>{children}</div>;
}
