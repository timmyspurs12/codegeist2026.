import { useMemo, useState } from 'react';
import type { Commitment, Issue } from '../lib/types';
import type { ScreenProps } from './types';
import { Button, CommitmentStamp, Due, Empty, Notice, OwnerStamp, Toggle } from '../components/primitives';
import { Icon } from '../components/Icons';
import { timeAgo } from '../lib/format';

type Filter = 'all' | 'late' | 'review';

type Group = { key: string; label: string; hint: string; rows: { issue: Issue; commitment: Commitment }[] };

export function Overview({ workspace, onOpenCase, onOpenCommitment, onNavigate }: ScreenProps) {
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    const all: { issue: Issue; commitment: Commitment }[] = [];
    for (const issue of workspace.issues) {
      for (const commitment of issue.commitments) {
        if (commitment.status === 'open' || commitment.status === 'proposed') all.push({ issue, commitment });
      }
    }
    return all;
  }, [workspace]);

  const late = rows.filter((r) => r.commitment.status === 'open' && r.commitment.overdue);
  const review = rows.filter((r) => r.commitment.status === 'proposed');
  const track = rows.filter((r) => r.commitment.status === 'open' && !r.commitment.overdue);
  const unowned = rows.filter((r) => !r.commitment.owner);
  const blocked = workspace.issues.filter((i) => !i.closure.ready);
  const recent = workspace.activity.slice(0, 5);
  const verified = workspace.issues.reduce((n, i) => n + i.commitments.filter((c) => c.status === 'verified').length, 0);

  const groups: Group[] = [
    { key: 'late', label: 'Past the date given', hint: 'someone was promised this by now', rows: late },
    { key: 'review', label: 'Awaiting a person', hint: 'captured from a comment, not yet agreed', rows: review },
    { key: 'track', label: 'Within the promise', hint: 'on track, still owed', rows: track },
  ].filter((g) => (filter === 'late' ? g.key === 'late' : filter === 'review' ? g.key === 'review' : true)) as Group[];

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  let index = 0;

  return (
    <div className="wrap">
      <div className="page">
        <div className="masthead-line">
          <div>
            <div className="masthead-line__date">{today} · {workspace.site}</div>
            <h1 className="page-title">What needs a decision today</h1>
            <p className="page-lede">
              Every promise made on a repairs case, who owes it, and what the case is waiting on before it can close.
            </p>
          </div>
          <div className="masthead-line__actions">
            <Button icon="inbox" onClick={() => onNavigate('inbox')}>
              {review.length > 0 ? `Review ${review.length}` : 'Capture inbox'}
            </Button>
            {blocked[0] && (
              <Button variant="primary" icon="case" onClick={() => onOpenCase(blocked[0].key)}>
                Open {blocked[0].key}
              </Button>
            )}
          </div>
        </div>

        {(workspace.diagnostics ?? []).filter((d) => d.level !== 'info').length > 0 && (
          <div style={{ marginTop: 20, display: 'grid', gap: 8 }}>
            {(workspace.diagnostics ?? []).filter((d) => d.level !== 'info').slice(0, 3).map((d) => (
              <Notice key={`${d.code}-${d.issueKey ?? ''}`} tone={d.level === 'error' ? 'danger' : 'warn'}>
                <span>
                  {d.issueKey ? <b className="mono" style={{ fontSize: 11.5, marginRight: 6 }}>{d.issueKey}</b> : null}
                  {d.message}
                </span>
              </Notice>
            ))}
          </div>
        )}

        {workspace.issues.length === 0 ? (
          <div style={{ marginTop: 26 }}>
            <Empty
              title="No case is tracked yet"
              text={`Open a ${workspace.integrations.jira.project || 'Facilities'} issue in Jira and use the Commitments panel, or add its key under Settings → Jira connection. Relay only shows cases it has actually read.`}
              action={<Button variant="primary" onClick={() => onNavigate('settings')}>Add a case</Button>}
            />
          </div>
        ) : (
        <>
        <section className="statusline">
          <div className="statusline__figure" data-tone={blocked.length ? 'late' : 'clear'}>{blocked.length}</div>
          <div className="statusline__body">
            <div className="statusline__claim">
              {blocked.length
                ? `${blocked.length === 1 ? 'case cannot' : 'cases cannot'} close until the promises on ${blocked.length === 1 ? 'it are' : 'them are'} settled`
                : 'Every case is clear to close'}
            </div>
            <div className="statusline__detail">
              {late.length} past the date given · {unowned.length} with no owner · {review.length} waiting for a person
            </div>
            <div className="measure" role="img" aria-label={`${late.length} overdue, ${track.length} on track, ${verified} verified`}>
              {Array.from({ length: Math.max(12, late.length + track.length + Math.min(verified, 8)) }).map((_, i) => {
                const tone = i < late.length ? 'late' : i < late.length + track.length ? 'review' : i < late.length + track.length + Math.min(verified, 8) ? 'done' : '';
                return <span key={i} className={`measure__tick${tone ? ` measure__tick--${tone}` : ''}`} />;
              })}
            </div>
          </div>
          <div className="statusline__meta">
            re-evaluated {timeAgo(workspace.issues[0]?.closure.evaluatedAt ?? new Date().toISOString())}<br />
            projection synced {timeAgo(workspace.integrations.jira.lastSync)}<br />
            {verified} verified all time
          </div>
        </section>

        <div className="brief" style={{ marginTop: 26 }}>
          <div style={{ minWidth: 0 }}>
            <div className="section__head">
              <h2 className="section__title">The ledger</h2>
              <span className="section__note">{rows.length} unresolved across {workspace.issues.length} cases</span>
              <span className="section__tools">
                <Toggle
                  label="Filter the ledger"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All', count: rows.length },
                    { value: 'late', label: 'Overdue', count: late.length },
                    { value: 'review', label: 'Review', count: review.length },
                  ]}
                />
              </span>
            </div>

            <div className="ledger">
              <div className="ledger__head" aria-hidden="true">
                <span>#</span>
                <span>Case</span>
                <span>Promise</span>
                <span>Owner</span>
                <span>Due</span>
                <span>State</span>
              </div>

              {rows.length === 0 && (
                <div style={{ padding: '28px 8px' }}>
                  <Empty
                    title="Nothing is owed"
                    text="Every commitment in this workspace is verified or dropped. New promises appear here the moment a comment is captured."
                  />
                </div>
              )}

              {groups.map((group) => (
                <div key={group.key}>
                  {group.rows.length > 0 && (
                    <div className="grouphead">
                      <span className="grouphead__label">{group.label}</span>
                      <span className="grouphead__count">{group.rows.length}</span>
                      <span className="grouphead__hint">{group.hint}</span>
                    </div>
                  )}
                  {group.rows.map(({ issue, commitment }) => {
                    index += 1;
                    return (
                      <button
                        key={`${issue.key}-${commitment.code}`}
                        className="row"
                        onClick={() => onOpenCommitment(issue.key, commitment.code)}
                        aria-label={`${commitment.code}: ${commitment.text}. ${issue.key}`}
                      >
                        <span className="row__index">{String(index).padStart(2, '0')}</span>
                        <span className="row__key">{issue.key}</span>
                        <span className="row__text"><span>{commitment.text}</span></span>
                        <span className="row__owner"><OwnerStamp person={commitment.owner} /></span>
                        <span className="row__due" data-tone={commitment.status === 'open' && commitment.overdue ? 'late' : undefined}>
                          <Due iso={commitment.dueAt} status={commitment.status} />
                        </span>
                        <span className="row__state"><CommitmentStamp commitment={commitment} /></span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <aside className="brief__margin" aria-label="Running totals">
            <div>
              <div className="marginhead"><Icon name="activity" size={11} /> Running totals</div>
              <div className="tally">
                <div className="tally__row" data-tone="late">Past the date given <b>{late.length}</b></div>
                <div className="tally__row">Within the promise <b>{track.length}</b></div>
                <div className="tally__row">Waiting for a person <b>{review.length}</b></div>
                <div className="tally__row">No owner <b>{unowned.length}</b></div>
                <div className="tally__row">Verified all time <b>{verified}</b></div>
              </div>
            </div>

            <div>
              <div className="marginhead"><Icon name="lock" size={11} /> Held open</div>
              {blocked.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--muted)', paddingTop: 10 }}>No case is being held open.</p>
              ) : (
                <div className="blockedlist">
                  {blocked.map((issue) => (
                    <button key={issue.key} className="blockedlist__item" onClick={() => onOpenCase(issue.key)}>
                      <span className="blockedlist__summary">{issue.summary}</span>
                      <span className="blockedlist__meta">
                        {issue.key}
                        <span>·</span>
                        <span>{issue.closure.blockingCount} unresolved</span>
                        {issue.closure.overdue > 0 && <span style={{ color: 'var(--flame)' }}>· {issue.closure.overdue} late</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>

        <section className="section">
          <div className="section__head">
            <h2 className="section__title">Recently changed</h2>
            <span className="section__note">the last {recent.length} events, newest first</span>
            <span className="section__tools">
              <Button size="sm" variant="quiet" iconAfter="arrow" onClick={() => onNavigate('activity')}>
                Activity &amp; audit
              </Button>
            </span>
          </div>
          <div className="recentband">
            {recent.map((e) => (
              <button key={e.id} className="recentband__item" onClick={() => onOpenCase(e.issueKey)}>
                <span className="recentband__time">{timeAgo(e.at)}</span>
                <span className="recentband__text">{e.summary}</span>
                <span className="recentband__case">{e.issueKey}</span>
              </button>
            ))}
          </div>
        </section>
        </>
        )}
      </div>
    </div>
  );
}
