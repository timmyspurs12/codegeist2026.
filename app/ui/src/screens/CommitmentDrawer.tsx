import { useState } from 'react';
import type { Commitment, Issue, Workspace } from '../lib/types';
import { Avatar, Button, CommitmentStatusLozenge, Due, Key, Lozenge, Owner, statusTone } from '../components/primitives';
import { Icon } from '../components/Icons';
import { Dialog, Drawer } from '../components/overlays';
import { anyone } from '../lib/api';
import { timeAgo } from '../lib/format';

type Props = {
  workspace: Workspace;
  issue: Issue;
  commitment: Commitment;
  onClose: () => void;
  onVerify: (note: string) => Promise<void>;
  onReassign: (ownerId: string, reason: string) => Promise<void>;
  onDrop: (reason: string) => Promise<void>;
};

export function CommitmentDrawer({ issue, commitment, onClose, onVerify, onReassign, onDrop }: Props) {
  const [mode, setMode] = useState<'view' | 'verify' | 'reassign' | 'drop'>('view');
  const [note, setNote] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const tone = statusTone(commitment);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); setMode('view'); setNote(''); setOwnerId(''); }
    finally { setBusy(false); setConfirm(false); }
  }

  const history = [
    { at: commitment.acceptedAt, label: 'Accepted', who: commitment.evidence.author, detail: 'Owner set from the accepted suggestion.' },
    ...commitment.previousOwners.map((h) => ({
      at: h.at, label: `Handed from ${h.from.name} to ${h.to.name}`, who: h.by, detail: h.reason,
    })),
    ...(commitment.verifiedAt ? [{ at: commitment.verifiedAt, label: 'Verified', who: commitment.verifiedBy, detail: commitment.verificationNote ?? '' }] : []),
    ...(commitment.status === 'dropped' ? [{ at: commitment.acceptedAt, label: 'Dropped', who: null, detail: commitment.droppedReason ?? '' }] : []),
  ].filter((h) => h.at).sort((a, b) => (a.at! < b.at! ? 1 : -1));

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={<span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="key">{commitment.code}</span><CommitmentStatusLozenge commitment={commitment} /></span>}
        subtitle={<span>{issue.key} · {issue.summary}</span>}
        footer={
          <>
            {commitment.status === 'open' && (
              <>
                <Button variant="primary" icon="check" onClick={() => setMode('verify')}>Verify</Button>
                <Button icon="sync" onClick={() => setMode('reassign')}>Reassign</Button>
                <span style={{ flex: 1 }} />
                <Button variant="danger" onClick={() => setMode('drop')}>Drop</Button>
              </>
            )}
            {commitment.status !== 'open' && <Button variant="quiet" onClick={onClose}>Close</Button>}
          </>
        }
      >
        <section style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 500, marginBottom: 14 }}>{commitment.text}</div>
          <blockquote className="quote" style={{ margin: '0 0 12px' }}>
            “{commitment.evidence.quote}”
            <div className="quote__src">
              <Icon name="quote" size={11} />
              {commitment.evidence.author.name} · comment {commitment.evidence.commentId}
              <button
                style={{ marginLeft: 'auto', color: 'var(--await)', fontSize: 11.5 }}
                onClick={() => {
                  const el = document.getElementById(`src-${commitment.code}`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                show in source
              </button>
            </div>
          </blockquote>
          <div className="source" id={`src-${commitment.code}`} style={{ fontSize: 13 }}>
            <div className="source__head">
              <Avatar person={commitment.evidence.author} size="sm" />
              <span style={{ fontWeight: 500, fontSize: 12.5 }}>{commitment.evidence.author.name}</span>
              <span className="time">{timeAgo(commitment.evidence.createdAt)}</span>
            </div>
            <p>
              {commitment.evidence.body.slice(0, commitment.evidence.start)}
              <mark>{commitment.evidence.quote}</mark>
              {commitment.evidence.body.slice(commitment.evidence.end)}
            </p>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <Field label="Owner"><Owner person={commitment.owner} /></Field>
          <Field label="Due"><Due iso={commitment.dueAt} status={commitment.status} /></Field>
          <Field label="Case"><Key>{issue.key}</Key></Field>
          <Field label="State"><Lozenge tone={tone === 'overdue' ? 'overdue' : tone}>{tone === 'overdue' ? 'Overdue' : commitment.status}</Lozenge></Field>
        </section>

        {commitment.verificationNote && (
          <section style={{ marginBottom: 20 }}>
            <SectionTitle>Verification evidence</SectionTitle>
            <div className="notice notice--ok">{commitment.verificationNote}</div>
          </section>
        )}

        {commitment.droppedReason && (
          <section style={{ marginBottom: 20 }}>
            <SectionTitle>Dropped because</SectionTitle>
            <div className="notice">{commitment.droppedReason}</div>
          </section>
        )}

        <section>
          <SectionTitle>Audit history</SectionTitle>
          <div className="timeline">
            {history.map((h, i) => (
              <div className="tl-row" key={i} style={{ gridTemplateColumns: '18px minmax(0,1fr) auto' }}>
                <div className="tl-row__mark"><span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--line-strong)', display: 'block' }} /></div>
                <div className="tl-row__text">
                  <b>{h.label}</b>
                  {h.detail && <div style={{ color: 'var(--ink-3)' }}>{h.detail}</div>}
                </div>
                <div className="time">{h.at ? timeAgo(h.at) : ''}</div>
              </div>
            ))}
          </div>
        </section>
      </Drawer>

      {mode === 'verify' && (
        <div className="dialog" role="dialog" aria-modal="true" aria-label="Verify commitment" style={{ zIndex: 55 }}>
          <div className="dialog__body">
            <h2 className="dialog__title">Verify {commitment.code}</h2>
            <p className="dialog__text" style={{ marginBottom: 12 }}>
              Record what proves this was done. The note is kept on the commitment and shown in the audit trail.
            </p>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. invoice 4192 and two photos logged against the property file." autoFocus />
          </div>
          <div className="dialog__foot">
            <Button variant="quiet" onClick={() => setMode('view')}>Cancel</Button>
            <Button variant="primary" disabled={busy || note.trim().length < 6} onClick={() => run(() => onVerify(note.trim()))}>Verify commitment</Button>
          </div>
        </div>
      )}

      {mode === 'reassign' && (
        <div className="dialog" role="dialog" aria-modal="true" aria-label="Reassign commitment" style={{ zIndex: 55 }}>
          <div className="dialog__body">
            <h2 className="dialog__title">Hand {commitment.code} to someone else</h2>
            <p className="dialog__text" style={{ marginBottom: 12 }}>The handover is recorded with your name and the reason.</p>
            <label className="field" style={{ marginBottom: 10 }}>
              <span className="field__label">New owner</span>
              <select className="select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">Choose a person…</option>
                {anyone().filter((p) => p.id !== commitment.owner?.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Why</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. on leave until Monday." />
            </label>
          </div>
          <div className="dialog__foot">
            <Button variant="quiet" onClick={() => setMode('view')}>Cancel</Button>
            <Button variant="primary" disabled={busy || !ownerId || note.trim().length < 4} onClick={() => run(() => onReassign(ownerId, note.trim()))}>Hand over</Button>
          </div>
        </div>
      )}

      {mode === 'drop' && (
        <div className="dialog" role="dialog" aria-modal="true" aria-label="Drop commitment" style={{ zIndex: 55 }}>
          <div className="dialog__body">
            <h2 className="dialog__title">Drop {commitment.code}</h2>
            <p className="dialog__text" style={{ marginBottom: 12 }}>
              Dropping is a decision, not a deletion. The reason is shown on the case and kept in the audit trail.
            </p>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the tenant withdrew the request on 3 Nov." autoFocus />
          </div>
          <div className="dialog__foot">
            <Button variant="quiet" onClick={() => setMode('view')}>Cancel</Button>
            <Button variant="danger" disabled={busy || note.trim().length < 8} onClick={() => setConfirm(true)}>Drop commitment</Button>
          </div>
        </div>
      )}

      <Dialog
        open={confirm}
        title="Drop this commitment?"
        confirmLabel="Yes, drop it"
        tone="danger"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => run(() => onDrop(note.trim()))}
      >
        This removes it from the closure calculation. The case may become closable as a result.
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5 }}>{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', marginBottom: 10 }}>{children}</h3>;
}
