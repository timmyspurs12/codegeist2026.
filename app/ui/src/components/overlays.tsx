import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icons';
import { Button } from './primitives';

/* ------------------------------------------------------------------ sheet */
/* One component, two behaviours: a side panel on desktop, a full screen on
   mobile. The CSS decides which; there is no second implementation. */

export function Sheet({ open, onClose, title, subtitle, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const focusable = ref.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'} tabIndex={-1} ref={ref}>
        <div className="sheet__head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.015em' }}>{title}</div>
            {subtitle && <div style={{ color: 'var(--ink-2)', fontSize: 12.5, marginTop: 3 }}>{subtitle}</div>}
          </div>
          <Button variant="quiet" size="sm" icon="close" aria-label="Close" onClick={onClose} />
        </div>
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- dialog */

export function Dialog({ open, title, children, confirmLabel, onConfirm, onCancel, tone = 'default', busy }: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: 'default' | 'danger' | 'primary';
  busy?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onCancel} aria-hidden="true" />
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog__body">
          <h2 className="dialog__title">{title}</h2>
          <div className="dialog__text">{children}</div>
        </div>
        <div className="dialog__foot">
          <Button variant="quiet" onClick={onCancel}>Cancel</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- toasts */

export interface Toast { id: string; message: string; tone?: 'default' | 'verified' | 'overdue'; action?: { label: string; run: () => void } }

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.tone && t.tone !== 'default' ? ` toast--${t.tone}` : ''}`}>
          <span className="toast__tone" aria-hidden="true" />
          <span style={{ flex: 1 }}>{t.message}</span>
          {t.action && <button className="toast__action" onClick={() => { t.action!.run(); onDismiss(t.id); }}>{t.action.label}</button>}
          <button aria-label="Dismiss" onClick={() => onDismiss(t.id)} style={{ color: '#9fb3a8' }}>
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------- command palette */

export interface Command {
  id: string;
  label: string;
  group: string;
  icon: IconName;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ open, commands, onClose }: { open: boolean; commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? commands.filter((c) => (c.label + ' ' + c.group).toLowerCase().includes(needle)) : commands;
  }, [q, commands]);

  useEffect(() => {
    if (!open) return;
    setQ(''); setActive(0);
    setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  useEffect(() => { setActive(0); }, [q]);

  if (!open) return null;
  const groups = [...new Set(filtered.map((c) => c.group))];

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[active];
      if (cmd) { cmd.run(); onClose(); }
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKey}>
        <input
          ref={inputRef}
          className="palette__input"
          placeholder="Search cases, commitments, people or screens…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Command search"
        />
        <div className="palette__list">
          {filtered.length === 0 && <div className="palette__group">No matches. Try a case key, an owner or a screen name.</div>}
          {groups.map((g) => (
            <div key={g}>
              <div className="palette__group">{g}</div>
              {filtered.filter((c) => c.group === g).map((c) => {
                const index = filtered.indexOf(c);
                return (
                  <button
                    key={c.id}
                    className="palette__item"
                    data-active={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => { c.run(); onClose(); }}
                  >
                    <Icon name={c.icon} size={14} />
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                    {c.hint && <span className="kbd">{c.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
