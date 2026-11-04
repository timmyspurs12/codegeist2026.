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
      {icon && <span className="btn__glyph"><Icon name={icon} size={size === 'sm' ? 13 : 14} /></span>}
      {children}
      {iconAfter && <span className="btn__glyph"><Icon name={iconAfter} size={13} /></span>}
    </button>
  );
}

/* -------------------------------------------------------------- lozenges */

const statusLabel: Record<CommitmentStatus, string> = {
  proposed: 'Awaiting review',
  open: 'Open',
  verified: 'Verified',
  dropped: 'Dropped',
};

export function statusTone(c: Commitment): 'proposed' | 'await' | 'verified' | 'overdue' | 'dropped' | 'neutral' {
  if (c.status === 'proposed') return 'proposed';
  if (c.status === 'verified') return 'verified';
  if (c.status === 'dropped') return 'dropped';
  if (c.overdue) return 'overdue';
  return 'await';
}

export function Lozenge({ tone, children }: { tone: 'proposed' | 'await' | 'verified' | 'overdue' | 'dropped' | 'neutral'; children: ReactNode }) {
  return <span className={`lozenge lozenge--${tone}`}>{children}</span>;
}

export function CommitmentStatusLozenge({ commitment }: { commitment: Commitment }) {
  const tone = statusTone(commitment);
  const label = tone === 'overdue' ? 'Overdue' : statusLabel[commitment.status];
  return <Lozenge tone={tone}>{label}</Lozenge>;
}

/* ----------------------------------------------------------------- people */

export function Avatar({ person, size = 'md' }: { person: Person | null; size?: 'sm' | 'md' }) {
  const cls = ['avatar', size === 'sm' && 'avatar--sm', !person && 'avatar--unowned'].filter(Boolean).join(' ');
  return (
    <span className={cls} title={person ? person.name : 'No owner'}>
      {person ? person.initials : '—'}
    </span>
  );
}

export function Owner({ person, showRole = false }: { person: Person | null; showRole?: boolean }) {
  if (!person) return <span className="owner"><Avatar person={null} /><span className="owner__name" style={{ color: 'var(--muted)' }}>Unassigned</span></span>;
  return (
    <span className="owner" title={showRole ? person.role : person.name}>
      <Avatar person={person} />
      <span className="owner__name">{person.name}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ misc */

export function Key({ children }: { children: ReactNode }) {
  return <span className="key">{children}</span>;
}

export function Due({ iso, status }: { iso: string | null; status: CommitmentStatus }) {
  const tone = dueTone(iso, status);
  const colour = tone === 'overdue' ? 'var(--overdue)' : tone === 'soon' ? 'var(--sodium-ink)' : 'var(--ink-3)';
  return (
    <span className="time" style={{ color: colour, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      {(tone === 'overdue' || tone === 'soon') && <Icon name="clock" size={12} />}
      {dueLabel(iso)}
    </span>
  );
}

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

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'danger' | 'ok'; children: ReactNode }) {
  return <div className={`notice${tone === 'danger' ? ' notice--danger' : tone === 'ok' ? ' notice--ok' : ''}`}>{children}</div>;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className="switch__track" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
