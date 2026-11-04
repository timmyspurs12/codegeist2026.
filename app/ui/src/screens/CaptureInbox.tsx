import { useMemo, useState } from 'react';
import type { Commitment, Issue } from '../lib/types';
import type { ScreenProps } from './types';
import { Button, Confidence, Due, Empty, Notice, OwnerStamp, Stamp } from '../components/primitives';
import { Icon } from '../components/Icons';
import { anyone } from '../lib/api';
import { timeAgo } from '../lib/format';

type Props = ScreenProps & {
  onAccept: (issueKey: string, code: string, ownerId: string, dueAt: string | null) => Promise<void>;
  onReject: (issueKey: string, code: string, reason: string) => Promise<void>;
};

export function CaptureInbox({ workspace, onAccept, onReject, onOpenCase, onNavigate, toast }: Props) {
  const queue = useMemo(() => {
    const items: { issue: Issue; commitment: Commitment }[] = [];
    for (const issue of workspace.issues) {
      for (const c of issue.commitments) if (c.status === 'proposed') items.push({ issue, commitment: c });
    }
    return items;
  }, [workspace]);

  const [activeCode, setActiveCode] = useState<string | null>(queue[0]?.commitment.code ?? null);
  const active = queue.find((q) => q.commitment.code === activeCode) ?? queue[0];
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  const capturedToday = workspace.activity.filter((e) => e.type === 'captured' && isToday(e.at)).length;
  const acceptedToday = workspace.activity.filter((e) => e.type === 'accepted' && isToday(e.at)).length;

  const [ownerId, setOwnerId] = useState('');
  const [due, setDue] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const people = anyone();

  if (!active) {
    return (
      <div className="wrap">
        <div className="page">
          <div className="masthead-line">
            <div>
              <div className="masthead-line__date">Capture inbox</div>
              <h1 className="page-title">Nothing is waiting for review</h1>
            </div>
          </div>
          <Empty
            title="The queue is clear"
            text="When a comment contains a promise — a date, an owner, a next step — Relay lifts the exact sentence here for a person to accept or reject. Nothing becomes a commitment on its own."
            action={<Button variant="primary" icon="overview" onClick={() => onNavigate('overview')}>Back to the ledger</Button>}
          />
        </div>
      </div>
    );
  }

  const { issue, commitment } = active;
  const before = commitment.evidence.body.slice(0, commitment.evidence.start);
  const quote = commitment.evidence.body.slice(commitment.evidence.start, commitment.evidence.end);
  const after = commitment.evidence.body.slice(commitment.evidence.end);

  const advance = () => {
    const next = queue.find((q) => q.commitment.code !== commitment.code);
    setActiveCode(next?.commitment.code ?? null);
    setEditing(false); setOwnerId(''); setDue(''); setRejecting(false); setReason('');
  };

  async function accept() {
    if (!ownerId) { toast('Choose an owner before accepting.', 'overdue'); return; }
    setBusy(true);
    try {
      await onAccept(issue.key, commitment.code, ownerId, due ? new Date(due).toISOString() : null);
      advance();
    } finally { setBusy(false); }
  }

  async function reject() {
    if (reason.trim().length < 8) { toast('Give a reason of at least 8 characters — it is kept in the audit trail.', 'overdue'); return; }
    setBusy(true);
    try {
      await onReject(issue.key, commitment.code, reason.trim());
      advance();
    } finally { setBusy(false); }
  }

  return (
    <div className="wrap">
      <div className="page">
        <div className="masthead-line">
          <div>
            <div className="masthead-line__date">Capture inbox</div>
            <h1 className="page-title">What the comment said, and what we think it promised</h1>
            <p className="page-lede">
              A suggestion is not a commitment. The quoted sentence is stored with whatever you accept, and it cannot be edited afterwards.
            </p>
          </div>
          <div className="masthead-line__actions">
            <Stamp tone="review">{queue.length} awaiting review</Stamp>
          </div>
        </div>

        <div className="capture">
          <div className="queue">
            <div className="queue__head">
              <Icon name="inbox" size={12} />
              Queue
              <span style={{ marginLeft: 'auto' }}>{String(queue.findIndex((q) => q.commitment.code === commitment.code) + 1).padStart(2, '0')} / {String(queue.length).padStart(2, '0')}</span>
            </div>
            <div className="queue__list">
              {queue.map(({ issue: i, commitment: c }, n) => (
                <button
                  key={c.code}
                  className="queue__item"
                  aria-current={c.code === commitment.code}
                  onClick={() => { setActiveCode(c.code); setEditing(false); setOwnerId(''); setDue(''); setRejecting(false); setReason(''); }}
                >
                  <span className="queue__n">{String(n + 1).padStart(2, '0')}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="queue__title" style={{ display: 'block' }}>{c.text}</span>
                    <span className="queue__case">{i.summary}</span>
                    <span className="queue__meta">
                      {i.key}
                      <span>·</span>
                      {timeAgo(c.evidence.createdAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="queue__foot">
              <div className="queue__stat"><span>Captured today</span><b>{capturedToday}</b></div>
              <div className="queue__stat"><span>Accepted today</span><b>{acceptedToday}</b></div>
              <p className="queue__note">
                Relay reads comments posted in the last 90 days and queues what looks like a promise. Nothing is accepted on anyone’s behalf.
              </p>
            </div>
          </div>

          <div className="review">
            <div className="review__head">
              <span className="mono review__key">{issue.key}</span>
              <span className="review__case">{issue.summary}</span>
              <span style={{ marginLeft: 'auto' }}>
                <Button size="sm" variant="quiet" onClick={() => onOpenCase(issue.key)}>Open case</Button>
              </span>
            </div>

            <div className="provenance">
              <div className="pane pane--source">
                <div className="pane__label"><Icon name="quote" size={11} /> The comment</div>
                <div className="comment__byline">
                  <OwnerStamp person={commitment.evidence.author} />
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{timeAgo(commitment.evidence.createdAt)}</span>
                </div>
                <div className="source__body">
                  <div style={{ minWidth: 0 }}>
                    <p className="comment">
                      {before}<mark>{quote}</mark>{after}
                    </p>
                    <div className="offsets">
                      <Icon name="arrow" size={11} />
                      lifted verbatim · characters {commitment.evidence.start}–{commitment.evidence.end}
                    </div>
                  </div>
                  <dl className="source__facts">
                    <div><dt>Comment</dt><dd className="mono">{commitment.evidence.commentId}</dd></div>
                    <div><dt>Author</dt><dd>{commitment.evidence.author.name}</dd></div>
                    <div><dt>Posted</dt><dd>{timeAgo(commitment.evidence.createdAt)}</dd></div>
                    <div><dt>Span</dt><dd className="mono">{commitment.evidence.start}–{commitment.evidence.end}</dd></div>
                  </dl>
                </div>
              </div>

              <div className="pane pane--draft">
                <div className="pane__label">
                  <Icon name="spark" size={11} /> What Relay proposes
                  <span style={{ marginLeft: 'auto' }}><Confidence value={commitment.confidence} /></span>
                </div>

                <div className="draft">
                  {editing ? (
                    <textarea className="textarea" defaultValue={commitment.text} aria-label="Commitment wording" style={{ marginBottom: 14 }} />
                  ) : (
                    <p className="draft__text">{commitment.text}</p>
                  )}
                  <dl className="draft__grid">
                    <div className="draft__field">
                      <dt>Suggested owner</dt>
                      <dd><OwnerStamp person={commitment.owner ?? commitment.evidence.author} /></dd>
                    </div>
                    <div className="draft__field">
                      <dt>Due</dt>
                      <dd><Due iso={commitment.dueAt} status="proposed" /></dd>
                    </div>
                    <div className="draft__field">
                      <dt>Source</dt>
                      <dd className="mono" style={{ fontSize: 11.5 }}>{commitment.evidence.commentId}</dd>
                    </div>
                  </dl>
                </div>

                <div className="draft__form">
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,150px)', gap: 10 }}>
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

                  {rejecting ? (
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
                  ) : (
                    <Notice>
                      Accepting writes it to the ledger and re-evaluates whether {issue.key} can close.
                    </Notice>
                  )}
                </div>
              </div>
            </div>

            <div className="review__actions">
              <Button variant="primary" icon="check" onClick={accept} disabled={busy}>Accept commitment</Button>
              <Button variant="quiet" onClick={() => setEditing((v) => !v)}>{editing ? 'Done editing' : 'Edit wording'}</Button>
              <span style={{ flex: 1 }} />
              {rejecting ? (
                <>
                  <Button variant="quiet" onClick={() => { setRejecting(false); setReason(''); }}>Cancel</Button>
                  <Button variant="danger" onClick={reject} disabled={busy}>Reject</Button>
                </>
              ) : (
                <Button variant="quiet" onClick={() => setRejecting(true)}>Not a commitment</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
