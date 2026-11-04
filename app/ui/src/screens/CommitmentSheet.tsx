import { useState } from 'react';
import type { Commitment, Issue } from '../lib/types';
import { Button, CommitmentStamp, Confidence, Due, Notice, OwnerStamp } from '../components/primitives';
import { Sheet } from '../components/overlays';
import { Icon } from '../components/Icons';
import { anyone } from '../lib/api';
import { timeAgo } from '../lib/format';

export function CommitmentSheet({ issue, commitment, onClose, onVerify, onReassign, onDrop }: {
  issue: Issue;
  commitment: Commitment;
  onClose: () => void;
  onVerify: (note: string) => Promise<void>;
  onReassign: (ownerId: string, reason: string) => Promise<void>;
  onDrop: (reason: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'view' | 'verify' | 'reassign' | 'drop'>('view');
  const [note, setNote] = useState('');
  const [owner, setOwner] = useState(commitment.owner?.id ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const people = anyone();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); onClose(); } finally { setBusy(false); }
  };

  const footer = (
    <>
      <Button variant="quiet" onClick={onClose}>Close</Button>
      <span style={{ flex: 1 }} />
      {mode === 'view' && commitment.status === 'open' && (
        <>
          <Button variant="quiet" onClick={() => setMode('reassign')}>Hand over</Button>
          <Button variant="quiet" onClick={() => setMode('drop')}>Drop</Button>
          <Button variant="primary" icon="check" onClick={() => setMode('verify')}>Verify</Button>
        </>
      )}
      {mode === 'verify' && (
        <>
          <Button variant="quiet" onClick={() => setMode('view')}>Back</Button>
          <Button variant="primary" disabled={busy} onClick={() => run(() => onVerify(note.trim() || 'Confirmed complete'))}>Record verification</Button>
        </>
      )}
      {mode === 'reassign' && (
        <>
          <Button variant="quiet" onClick={() => setMode('view')}>Back</Button>
          <Button variant="primary" disabled={busy || !owner} onClick={() => run(() => onReassign(owner, reason.trim() || 'Handover'))}>Hand over</Button>
        </>
      )}
      {mode === 'drop' && (
        <>
          <Button variant="quiet" onClick={() => setMode('view')}>Back</Button>
          <Button variant="danger" disabled={busy || reason.trim().length < 8} onClick={() => run(() => onDrop(reason.trim()))}>Drop commitment</Button>
        </>
      )}
    </>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={<><span className="mono" style={{ fontSize: 12, color: 'var(--ink-2)' }}>{commitment.code}</span> <CommitmentStamp commitment={commitment} /></>}
      subtitle={issue.key + ' · ' + issue.summary}
      footer={footer}
    >
      <p className="draft__text" style={{ fontSize: 17, lineHeight: 1.5, marginBottom: 16 }}>{commitment.text}</p>

      <blockquote className="quote">
        “{commitment.evidence.quote}”
        <div className="quote__src">
          <Icon name="quote" size={10} />
          {commitment.evidence.author.name} · {commitment.evidence.commentId} · {timeAgo(commitment.evidence.createdAt)}
        </div>
      </blockquote>

      <dl className="sheet__facts" style={{ marginTop: 18 }}>
        <div>
          <dt>Owner</dt>
          <dd><OwnerStamp person={commitment.owner} /></dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd><Due iso={commitment.dueAt} status={commitment.status} /></dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd><Confidence value={commitment.confidence} /></dd>
        </div>
        <div>
          <dt>Accepted</dt>
          <dd>{commitment.acceptedAt ? timeAgo(commitment.acceptedAt) : 'Not yet accepted'}</dd>
        </div>
        <div>
          <dt>Verified by</dt>
          <dd>{commitment.verifiedBy ? `${commitment.verifiedBy.name} · ${timeAgo(commitment.verifiedAt!)}` : '—'}</dd>
        </div>
      </dl>

      {commitment.previousOwners.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h3 className="section__title" style={{ fontSize: 13, marginBottom: 8 }}>Handovers</h3>
          <div className="reasonlist">
            {commitment.previousOwners.map((h, i) => (
              <div key={i} className="reason">
                <span className="reason__dot" style={{ background: 'var(--rule-strong)' }} />
                <span><OwnerStamp person={h.from} /> → <OwnerStamp person={h.to} /> · {timeAgo(h.at)} · {h.reason}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {commitment.verificationNote && (
        <div className="notice notice--ok" style={{ marginTop: 18 }}>Verified: {commitment.verificationNote}</div>
      )}
      {commitment.droppedReason && (
        <div className="notice" style={{ marginTop: 18 }}>Dropped: {commitment.droppedReason}</div>
      )}

      {mode !== 'view' && (
        <div style={{ marginTop: 22, display: 'grid', gap: 12 }}>
          {mode === 'verify' && (
            <label className="field">
              <span className="field__label">What was done?</span>
              <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. new washer fitted and tested, tenant witnessed." autoFocus />
            </label>
          )}
          {mode === 'reassign' && (
            <>
              <label className="field">
                <span className="field__label">New owner</span>
                <select className="select" value={owner} onChange={(e) => setOwner(e.target.value)} autoFocus>
                  <option value="">Choose a person…</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Why the handover?</span>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. on leave from Thursday" />
              </label>
            </>
          )}
          {mode === 'drop' && (
            <>
              <Notice tone="danger">
                Dropping removes this commitment from the closure check. The quote and the reason stay in the audit trail.
              </Notice>
              <label className="field">
                <span className="field__label">Reason (required)</span>
                <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="e.g. duplicate of the door entry raised by the contractor." />
              </label>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
