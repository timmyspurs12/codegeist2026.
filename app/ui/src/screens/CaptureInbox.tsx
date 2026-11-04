import { useMemo, useState } from 'react';
import type { Commitment, Issue } from '../lib/types';
import type { ScreenProps } from './types';
import { Avatar, Button, Due, Empty, Key, Lozenge, Notice, Owner } from '../components/primitives';
import { Icon } from '../components/Icons';
import { anyone } from '../lib/api';
import { timeAgo } from '../lib/format';

type Props = ScreenProps & {
  onAccept: (issueKey: string, code: string, ownerId: string, dueAt: string | null) => Promise<void>;
  onReject: (issueKey: string, code: string, reason: string) => Promise<void>;
};

export function CaptureInbox({ workspace, onAccept, onReject, onOpenCase, toast }: Props) {
  const queue = useMemo(() => {
    const items: { issue: Issue; commitment: Commitment }[] = [];
    for (const issue of workspace.issues) {
      for (const c of issue.commitments) if (c.status === 'proposed') items.push({ issue, commitment: c });
    }
    return items;
  }, [workspace]);

  const [activeCode, setActiveCode] = useState<string | null>(queue[0]?.commitment.code ?? null);
  const active = queue.find((q) => q.commitment.code === activeCode) ?? queue[0];
  const [ownerId, setOwnerId] = useState<string>('');
  const [due, setDue] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const people = anyone();

  if (!active) {
    return (
      <div className="page">
        <header className="page__head">
          <div>
            <div className="page__eyebrow">Capture inbox</div>
            <h1 className="page__title">Nothing to review</h1>
          </div>
        </header>
        <Empty
          title="The queue is clear"
          text="When a comment contains a promise — a date, an owner, a next step — Relay lifts the exact sentence here for a person to accept or reject. Nothing becomes a commitment without you."
        />
      </div>
    );
  }

  const { issue, commitment } = active;
  const before = commitment.evidence.body.slice(0, commitment.evidence.start);
  const quote = commitment.evidence.body.slice(commitment.evidence.start, commitment.evidence.end);
  const after = commitment.evidence.body.slice(commitment.evidence.end);

  async function accept() {
    if (!ownerId) { toast('Choose an owner before accepting.', 'overdue'); return; }
    setBusy(true);
    await onAccept(issue.key, commitment.code, ownerId, due ? new Date(due).toISOString() : null);
    setBusy(false);
    setOwnerId(''); setDue(''); setEditing(false);
    setActiveCode(queue.find((q) => q.commitment.code !== commitment.code)?.commitment.code ?? null);
  }

  async function reject() {
    if (reason.trim().length < 8) { toast('Give a reason of at least 8 characters — it is kept in the audit trail.', 'overdue'); return; }
    setBusy(true);
    await onReject(issue.key, commitment.code, reason.trim());
    setBusy(false);
    setRejecting(false); setReason('');
    setActiveCode(queue.find((q) => q.commitment.code !== commitment.code)?.commitment.code ?? null);
  }

  return (
    <div className="page page--wide">
      <header className="page__head">
        <div>
          <div className="page__eyebrow">Capture inbox</div>
          <h1 className="page__title">Suggestions waiting for a person</h1>
          <p className="page__sub">
            Relay reads repair comments and lifts promises as suggestions. A suggestion is not a commitment until
            someone accepts it — the queue keeps that difference visible.
          </p>
        </div>
        <div className="page__actions">
          <Lozenge tone="proposed">{queue.length} awaiting review</Lozenge>
        </div>
      </header>

      <div className="capture">
        <div className="queue">
          <div className="queue__head">
            <Icon name="inbox" size={14} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Queue</span>
            <span className="time" style={{ marginLeft: 'auto' }}>{queue.length}</span>
          </div>
          <div className="queue__list">
            {queue.map(({ issue: i, commitment: c }) => (
              <button
                key={c.code}
                className="queue__item"
                aria-current={c.code === commitment.code}
                onClick={() => { setActiveCode(c.code); setEditing(false); setOwnerId(''); setDue(''); }}
              >
                <div className="queue__title">{c.text}</div>
                <div className="queue__meta">
                  <Key>{i.key}</Key>
                  <span className="time">{timeAgo(c.evidence.createdAt)}</span>
                  <span className="confidence" title={`Extraction confidence ${(c.confidence * 100).toFixed(0)}%`}>
                    <span className="confidence__ticks" aria-hidden="true">
                      {Array.from({ length: 5 }).map((_, n) => (
                        <span key={n} className="confidence__tick" data-on={n < Math.round(c.confidence * 5)} />
                      ))}
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="review">
          <div className="review__head">
            <Key>{issue.key}</Key>
            <span style={{ fontSize: 13, color: 'var(--ink-3)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {issue.summary}
            </span>
            <Button size="sm" variant="quiet" onClick={() => onOpenCase(issue.key)}>Open case</Button>
          </div>

          <div className="review__body">
            <section>
              <div className="section__head" style={{ marginBottom: 8 }}>
                <h2 className="section__title" style={{ fontSize: 13 }}>The comment it was lifted from</h2>
                <span className="section__note">quoted exactly, not paraphrased</span>
              </div>
              <div className="source">
                <div className="source__head">
                  <Avatar person={commitment.evidence.author} size="sm" />
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{commitment.evidence.author.name}</span>
                  <span className="time">{timeAgo(commitment.evidence.createdAt)}</span>
                </div>
                <p>
                  {before}
                  <mark>{quote}</mark>
                  {after}
                </p>
              </div>

              <div className="connector">
                <span className="connector__rule" aria-hidden="true" />
                <Icon name="arrow" size={12} />
                <span>lifted verbatim — {quote.length} characters, offsets {commitment.evidence.start}–{commitment.evidence.end}</span>
              </div>

              <div className="proposal">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span className="proposal__flag"><Icon name="spark" size={11} /> Suggestion — not yet a commitment</span>
                  <span className="confidence" style={{ marginLeft: 'auto' }}>
                    <span className="time">confidence {(commitment.confidence * 100).toFixed(0)}%</span>
                    <span className="confidence__ticks" aria-hidden="true">
                      {Array.from({ length: 5 }).map((_, n) => (
                        <span key={n} className="confidence__tick" data-on={n < Math.round(commitment.confidence * 5)} />
                      ))}
                    </span>
                  </span>
                </div>

                {editing ? (
                  <textarea className="textarea" defaultValue={commitment.text} aria-label="Commitment wording" />
                ) : (
                  <p className="proposal__text">{commitment.text}</p>
                )}

                <dl className="proposal__grid">
                  <div className="proposal__field">
                    <dt>Suggested owner</dt>
                    <dd><Owner person={commitment.owner ?? commitment.evidence.author} /></dd>
                  </div>
                  <div className="proposal__field">
                    <dt>Due date</dt>
                    <dd><Due iso={commitment.dueAt} status="proposed" /></dd>
                  </div>
                  <div className="proposal__field">
                    <dt>Source</dt>
                    <dd className="key">comment {commitment.evidence.commentId}</dd>
                  </div>
                </dl>
              </div>
            </section>

            <section>
              <div className="section__head" style={{ marginBottom: 8 }}>
                <h2 className="section__title" style={{ fontSize: 13 }}>Accept with an owner</h2>
                <span className="section__note">A commitment needs a person and, usually, a date.</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 12 }}>
                <label className="field">
                  <span className="field__label">Owner</span>
                  <select className="select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                    <option value="">Choose a person…</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Due date</span>
                  <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                </label>
              </div>
              <div style={{ marginTop: 10 }}>
                <Notice>
                  Accepting writes the commitment to the ledger and re-evaluates the closure projection for {issue.key}.
                  The quote is stored with the commitment and cannot be edited later.
                </Notice>
              </div>
            </section>

            {rejecting && (
              <section>
                <label className="field">
                  <span className="field__label">Why is this not a commitment?</span>
                  <textarea
                    className="textarea"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. the tenant asked a question; no promise was made."
                    autoFocus
                  />
                </label>
              </section>
            )}
          </div>

          <div className="review__actions">
            <Button variant="primary" icon="check" onClick={accept} disabled={busy}>Accept commitment</Button>
            <Button variant="quiet" onClick={() => setEditing((v) => !v)}>{editing ? 'Done editing' : 'Edit wording'}</Button>
            <span style={{ flex: 1 }} />
            {rejecting ? (
              <>
                <Button variant="quiet" onClick={() => { setRejecting(false); setReason(''); }}>Cancel</Button>
                <Button variant="danger" onClick={reject} disabled={busy}>Reject suggestion</Button>
              </>
            ) : (
              <Button variant="quiet" onClick={() => setRejecting(true)}>Not a commitment</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
