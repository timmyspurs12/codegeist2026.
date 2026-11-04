import { useMemo, useState } from 'react';
import type { Commitment, Issue } from '../lib/types';
import type { ScreenProps } from './types';
import { Button, CommitmentStatusLozenge, Due, Empty, Key, Owner, Segmented } from '../components/primitives';
import { Icon } from '../components/Icons';
import { timeAgo } from '../lib/format';

type Filter = 'all' | 'overdue' | 'awaiting';

export function Overview({ workspace, onOpenCase, onOpenCommitment, onNavigate }: ScreenProps) {
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    const all: { issue: Issue; commitment: Commitment }[] = [];
    for (const issue of workspace.issues) {
      for (const commitment of issue.commitments) {
        if (commitment.status === 'open' || commitment.status === 'proposed') all.push({ issue, commitment });
      }
    }
    const weight = (r: { commitment: Commitment }) =>
      r.commitment.status === 'proposed' ? 1 : r.commitment.overdue ? 0 : 2;
    return all.sort((a, b) => weight(a) - weight(b));
  }, [workspace]);

  const filtered = rows.filter((r) =>
    filter === 'all' ? true : filter === 'overdue' ? r.commitment.overdue : r.commitment.status === 'proposed');

  const blocked = workspace.issues.filter((i) => !i.closure.ready);
  const overdue = rows.filter((r) => r.commitment.overdue).length;
  const awaiting = rows.filter((r) => r.commitment.status === 'proposed').length;
  const open = rows.filter((r) => r.commitment.status === 'open').length;
  const unowned = rows.filter((r) => !r.commitment.owner).length;

  const verifiedCount = workspace.issues.reduce((n, i) => n + i.commitments.filter((c) => c.status === 'verified').length, 0);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="page__eyebrow">{workspace.name} · {workspace.plan}</div>
          <h1 className="page__title">What needs a decision today</h1>
          <p className="page__sub">
            Commitments made to tenants and to each other, tracked to evidence. A case cannot close while anything
            here is still open.
          </p>
        </div>
        <div className="page__actions">
          <Button icon="inbox" onClick={() => onNavigate('inbox')}>{awaiting > 0 ? `Review ${awaiting} capture${awaiting > 1 ? 's' : ''}` : 'Open capture inbox'}</Button>
        </div>
      </header>

      <div className="brief">
        <div>
          <section className={blocked.length ? 'readiness readiness--blocked' : 'readiness readiness--clear'}>
            <div className="readiness__top">
              <span className="readiness__seal" aria-hidden="true">
                <Icon name={blocked.length ? 'lock' : 'shield'} size={17} />
              </span>
              <div>
                <div className="readiness__state">
                  {blocked.length
                    ? `${blocked.length} ${blocked.length === 1 ? 'case is' : 'cases are'} blocked from closure`
                    : 'Every case can close'}
                </div>
                <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 2 }}>
                  {blocked.length
                    ? `${overdue} overdue · ${unowned} without an owner · ${awaiting} awaiting review`
                    : 'No unresolved commitments anywhere in the workspace.'}
                </div>
              </div>
              <div className="readiness__meta">
                <span className="time">re-evaluated {timeAgo(workspace.issues[0].closure.evaluatedAt)}</span>
              </div>
            </div>
            <div className="meter" role="img" aria-label={`${open} open, ${overdue} overdue, ${verifiedCount} verified commitments`}>
              {Array.from({ length: Math.max(8, open + overdue) }).map((_, i) => (
                <span
                  key={i}
                  className={`meter__seg${i < overdue ? ' meter__seg--overdue' : i < overdue + open ? ' meter__seg--await' : i < overdue + open + Math.min(verifiedCount, 6) ? ' meter__seg--verified' : ''}`}
                />
              ))}
            </div>
            <div className="meter-legend">
              <span><b>{overdue}</b> overdue</span>
              <span><b>{open - overdue}</b> on track</span>
              <span><b>{verifiedCount}</b> verified</span>
              <span style={{ marginLeft: 'auto' }}>projection synced {timeAgo(workspace.integrations.jira.lastSync)}</span>
            </div>
          </section>

          <div className="strip">
            <button className="strip__cell" onClick={() => setFilter('all')} data-tone="await">
              <div className="strip__label">Open commitments</div>
              <div className="strip__value">{open}<small>across {workspace.issues.length} cases</small></div>
            </button>
            <button className="strip__cell" onClick={() => setFilter('awaiting')} data-tone="await">
              <div className="strip__label">Awaiting your review</div>
              <div className="strip__value">{awaiting}<small>captured, not accepted</small></div>
            </button>
            <button className="strip__cell" onClick={() => setFilter('overdue')} data-tone="overdue">
              <div className="strip__label">Past due date</div>
              <div className="strip__value">{overdue}<small>someone must act</small></div>
            </button>
            <button className="strip__cell" onClick={() => setFilter('all')}>
              <div className="strip__label">Unowned</div>
              <div className="strip__value">{unowned}<small>no one is accountable</small></div>
            </button>
          </div>

          <section className="section">
            <div className="section__head">
              <h2 className="section__title">Needs attention</h2>
              <span className="section__note">
                {filtered.length} of {rows.length} unresolved
              </span>
              <span className="section__link">
                <Segmented
                  label="Filter commitments"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'overdue', label: 'Overdue' },
                    { value: 'awaiting', label: 'Review' },
                  ]}
                />
              </span>
            </div>

            <div className="panel">
              {filtered.length === 0 ? (
                <div style={{ padding: 16 }}>
                  <Empty
                    title="Nothing is waiting"
                    text="Every commitment in this workspace is either verified or dropped. New captures appear here as soon as a comment contains a promise."
                    action={<Button variant="primary" icon="inbox" onClick={() => onNavigate('inbox')}>Open capture inbox</Button>}
                  />
                </div>
              ) : (
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: 84 }}>Case</th>
                      <th>Commitment</th>
                      <th style={{ width: 170 }}>Owner</th>
                      <th style={{ width: 130 }}>Due</th>
                      <th style={{ width: 132 }}>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(({ issue, commitment }) => (
                      <tr key={commitment.code} onClick={() => onOpenCommitment(issue.key, commitment.code)}>
                        <td><Key>{issue.key}</Key></td>
                        <td><span className="cell-quote">{commitment.text}</span></td>
                        <td><Owner person={commitment.owner} /></td>
                        <td><Due iso={commitment.dueAt} status={commitment.status} /></td>
                        <td><CommitmentStatusLozenge commitment={commitment} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        <aside style={{ display: 'grid', gap: 18 }}>
          <div className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Blocked from closing</h2>
              <span style={{ marginLeft: 'auto' }} className="time">{blocked.length}</span>
            </div>
            {blocked.length === 0 ? (
              <div className="panel__body" style={{ color: 'var(--ink-3)', fontSize: 13 }}>
                No case is currently held open by Relay.
              </div>
            ) : (
              <div className="attention">
                {blocked.map((issue) => (
                  <button key={issue.key} className="attention__row" data-tone={issue.closure.overdue ? 'overdue' : 'await'} onClick={() => onOpenCase(issue.key)}>
                    <span className="attention__bar" aria-hidden="true" />
                    <span className="attention__body">
                      <span className="attention__text">{issue.summary}</span>
                      <span className="attention__meta">
                        <Key>{issue.key}</Key>
                        <span className="time">{issue.closure.blockingCount} blocking</span>
                        {issue.closure.overdue > 0 && <span className="lozenge lozenge--overdue">{issue.closure.overdue} overdue</span>}
                      </span>
                    </span>
                    <Icon name="chevron" size={14} className="attention__chev" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Recent activity</h2>
            </div>
            <div className="feed">
              {workspace.activity.slice(0, 6).map((event) => (
                <div key={event.id} className="feed__row">
                  <Owner person={event.actor} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="feed__text">
                      <b>{event.summary}</b>
                    </div>
                    <div className="time" style={{ marginTop: 2 }}>{timeAgo(event.at)} · {event.issueKey}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
