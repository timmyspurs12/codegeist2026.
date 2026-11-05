import { useState } from 'react';
import type { ScreenProps } from './types';
import { Button, CommitmentStamp, Due, OwnerStamp, Stamp, commitmentTone } from '../components/primitives';
import { Dialog } from '../components/overlays';
import { Icon } from '../components/Icons';
import { NOT_RECORDED, clock, timeAgo } from '../lib/format';

export function CaseWorkspace({ workspace, onOpenCommitment, onNavigate, onScan, onTrack, onUntrack, issueKey }: ScreenProps & { issueKey: string }) {
  const issue = workspace.issues.find((i) => i.key === issueKey) ?? workspace.issues[0];
  const [expanded, setExpanded] = useState<string | null>(issue.commitments[0]?.code ?? null);
  const [closureOpen, setClosureOpen] = useState(false);
  const [untrackOpen, setUntrackOpen] = useState(false);
  const [untrackReason, setUntrackReason] = useState('');

  const unresolved = issue.commitments.filter((c) => c.status === 'open' || c.status === 'proposed');
  const caseEvents = workspace.activity.filter((e) => e.issueKey === issue.key);

  return (
    <>
      <div className="wrap">
        <div className="page">
          <button className="btn btn--quiet btn--sm" onClick={() => onNavigate('overview')} style={{ marginLeft: -9, marginBottom: 14 }}>
            <Icon name="arrow" size={13} style={{ transform: 'rotate(180deg)' }} /> The ledger
          </button>

          <header className="casehead">
            <div className="casehead__top">
              <span className="casehead__key">{issue.key}</span>
              <Stamp tone={issue.statusCategory === 'done' ? 'verified' : 'open'}>{issue.status}</Stamp>
              <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{issue.priority} priority</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <Button size="sm" icon="sync" onClick={() => onScan?.(issue.key)}>
                  Scan comments
                </Button>
                <Button
                  variant={issue.closure.ready ? 'default' : 'primary'}
                  size="sm"
                  icon={issue.closure.ready ? 'check' : 'lock'}
                  onClick={() => setClosureOpen(true)}
                >
                  {issue.closure.ready ? 'Close case' : 'Closure blocked'}
                </Button>
              </span>
            </div>
            <h1 className="casehead__title">{issue.summary}</h1>
            <div className="casehead__meta">
              <OwnerStamp person={issue.assignee} />
              <span>{issue.location}</span>
              <span style={{ color: 'var(--muted)' }}>{issue.requestType}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>updated {timeAgo(issue.updatedAt)}</span>
            </div>
            {/*
              Management state is shown, not inferred. A case Relay does not
              manage is permitted for a reason — and a case with no record is
              withheld, not "unmanaged".
            */}
            <div className="casehead__meta" style={{ marginTop: 8 }}>
              <Stamp tone={issue.management.managed ? 'verified' : 'open'}>
                {issue.management.label}
              </Stamp>
              {issue.management.managed ? (
                <Button size="sm" variant="quiet" onClick={() => setUntrackOpen(true)} disabled={!onUntrack}>
                  Stop managing
                </Button>
              ) : (
                <Button size="sm" icon="sync" onClick={() => onTrack?.(issue.key)} disabled={!onTrack}>
                  Manage this case
                </Button>
              )}
              {issue.management.initializing && (
                <span className="section__note">Capture did not finish. Closure stays withheld until it does.</span>
              )}
            </div>
          </header>

          <button
            type="button"
            className={`case-summary ${issue.closure.ready ? 'case-summary--clear' : ''}`}
            onClick={() => setClosureOpen(true)}
          >
            <Icon name={issue.closure.ready ? 'shield' : 'lock'} size={14} />
            <span className="case-summary__text">
              {issue.closure.ready
                ? 'Every commitment is verified or dropped — closure is permitted.'
                : `${issue.closure.blockingCount} unresolved commitment${issue.closure.blockingCount > 1 ? 's' : ''} · ${issue.closure.reasons[0] ?? ''}`}
            </span>
            <Icon name="arrow" size={14} />
          </button>

          <div className="case-grid">
            <div style={{ minWidth: 0 }}>
              <div className="section__head">
                <h2 className="section__title">Commitments on this case</h2>
                <span className="section__note">{issue.commitments.length} tracked · {unresolved.length} unresolved</span>
              </div>

              <div className="thread">
                {issue.commitments.map((c) => {
                  const open = expanded === c.code;
                  return (
                    <article key={c.code} className="entry" data-tone={commitmentTone(c)}>
                      <button
                        className="entry__row"
                        onClick={() => setExpanded(open ? null : c.code)}
                        aria-expanded={open}
                      >
                        <span className="entry__marker" aria-hidden="true" />
                        <span className="entry__body">
                          <span className="entry__text" style={{ display: 'block' }}>{c.text}</span>
                          <span className="entry__meta">
                            <OwnerStamp person={c.owner} />
                            <Due iso={c.dueAt} status={c.status} />
                            {c.previousOwners.length > 0 && (
                              <span className="handover"><Icon name="sync" size={11} /> {c.previousOwners.length} handover{c.previousOwners.length > 1 ? 's' : ''}</span>
                            )}
                            <span className="entry__toggle">
                              <Icon name="chevron" size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
                              {open ? 'Hide evidence' : 'Evidence'}
                            </span>
                          </span>
                        </span>
                        <span className="entry__state"><CommitmentStamp commitment={c} /></span>
                      </button>

                      {open && (
                        <div className="entry__detail">
                          <blockquote className="quote">
                            “{c.evidence.quote}”
                            <div className="quote__src">
                              <Icon name="quote" size={10} />
                              {c.evidence.author.name} · {c.evidence.commentId} · {timeAgo(c.evidence.createdAt)}
                              <button style={{ marginLeft: 'auto', color: 'var(--pine)', textDecoration: 'underline' }} onClick={() => onOpenCommitment(issue.key, c.code)}>
                                open fully
                              </button>
                            </div>
                          </blockquote>
                          {c.verificationNote && (
                            <div className="notice notice--ok">Verified: {c.verificationNote}</div>
                          )}
                          {c.droppedReason && <div className="notice">Dropped: {c.droppedReason}</div>}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Button size="sm" onClick={() => onOpenCommitment(issue.key, c.code)}>Inspect</Button>
                            {c.status === 'open' && <Button size="sm" onClick={() => onOpenCommitment(issue.key, c.code)}>Verify or hand over</Button>}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              {caseEvents.length > 0 && (
                <section style={{ marginTop: 30 }}>
                  <div className="section__head">
                    <h2 className="section__title">Activity on this case</h2>
                    <span className="section__note">{caseEvents.length} recorded</span>
                  </div>
                  <div className="caselog">
                    {caseEvents.slice(0, 6).map((e) => (
                      <div className="caselog__row" key={e.id}>
                        <span className="caselog__time">{clock(e.at)}</span>
                        <span className="caselog__text">
                          {e.summary}
                          {e.detail && <span className="caselog__detail">{e.detail}</span>}
                        </span>
                        <span className="caselog__actor">{e.actor ? e.actor.name : 'system'}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="case-side" aria-label="Closure readiness">
              <section className={`closure ${issue.closure.ready ? 'closure--clear' : 'closure--blocked'}`}>
                <div className="closure__head">
                  <div className="closure__label">Closure readiness</div>
                  <div className="closure__verdict">
                    <Icon name={issue.closure.ready ? 'shield' : 'lock'} size={16} />
                    {issue.closure.ready ? 'Permitted' : `Blocked · ${issue.closure.blockingCount}`}
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 5 }}>
                    evaluated {timeAgo(issue.closure.evaluatedAt)}
                  </div>
                </div>

                <div className="closure__section">
                  <h4>Why</h4>
                  {issue.closure.ready ? (
                    <div className="reason reason--plain"><span className="reason__dot" />Everything on this case is verified or dropped.</div>
                  ) : (
                    <div className="reasonlist">
                      {issue.closure.reasons.map((r) => <div key={r} className="reason"><span className="reason__dot" />{r}</div>)}
                    </div>
                  )}
                </div>

                {(issue.diagnostics ?? []).filter((d) => d.level === 'error').slice(0, 2).map((d) => (
                  <div className="closure__section" key={d.code}>
                    <h4>Enforcement</h4>
                    <div className="closure__text" style={{ color: 'var(--flame)' }}>{d.message}</div>
                  </div>
                ))}

                {issue.closure.projection.stale && (
                  <div className="closure__section">
                    <h4>Projection</h4>
                    <div className="closure__text" style={{ color: 'var(--flame)' }}>
                      The projection on this issue does not match Relay’s ledger. Customers stay blocked; an agent can reconcile from Settings.
                    </div>
                  </div>
                )}

                <div className="closure__section">
                  <h4>What an agent sees</h4>
                  <div className="closure__text">
                    {issue.closure.validatorMessage ?? 'No refusal is shown — the transition proceeds.'}
                  </div>
                </div>

                <div className="closure__section">
                  <h4>What a customer sees</h4>
                  <div className="closure__text" style={{ color: 'var(--muted)' }}>
                    {workspace.integrations.enforcement.customerTransitionsEnabled
                      ? 'No message. Jira answers “You can not make this transition” and nothing more — the condition cannot explain itself.'
                      : 'No closure transition at all: customers cannot close the request.'}
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel__head">
                  <h2 className="panel__title">Condition projection</h2>
                </div>
                <div className="panel__body" style={{ display: 'grid', gap: 8 }}>
                  <div className="proj">{JSON.stringify(issue.closure.projection.value, null, 1)}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                    {issue.closure.projection.key} · synced {timeAgo(issue.closure.projection.syncedAt)}
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel__head"><h2 className="panel__title">Case</h2></div>
                <div className="panel__body">
                  <div className="casedetails">
                    <div className="casedetails__row"><span>Issue type</span><span>{issue.requestType ?? NOT_RECORDED}</span></div>
                    <div className="casedetails__row"><span>Reporter</span><span>{issue.reporter?.name ?? NOT_RECORDED}</span></div>
                    <div className="casedetails__row"><span>Priority</span><span>{issue.priority ?? NOT_RECORDED}</span></div>
                    <div className="casedetails__row"><span>Location</span><span style={{ textAlign: 'right' }}>{issue.location ?? NOT_RECORDED}</span></div>
                    <div className="casedetails__row"><span>Updated</span><span>{timeAgo(issue.updatedAt)}</span></div>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>

      <Dialog
        open={untrackOpen}
        title={`Stop managing ${issue.key}?`}
        confirmLabel="Stop managing"
        tone="danger"
        onCancel={() => { setUntrackOpen(false); setUntrackReason(''); }}
        onConfirm={() => { setUntrackOpen(false); void onUntrack?.(issue.key, untrackReason.trim()); }}
      >
        <p>
          Relay will set this case’s management state to <span className="mono">unmanaged</span>, which <strong>permits closure</strong> on
          both the agent and customer paths, even though {issue.closure.blockingCount} unresolved commitment
          {issue.closure.blockingCount === 1 ? '' : 's'} remain on the ledger.
        </p>
        <p>
          The ledger and the audit trail are kept, and tracking the case again restores the count. The state field is written first,
          so an offboarding that fails part-way leaves the case withheld rather than open.
        </p>
        <label className="field">
          <span>Reason (recorded on the trail)</span>
          <input
            value={untrackReason}
            onChange={(e) => setUntrackReason(e.target.value)}
            placeholder="e.g. Customer moved to a new request"
          />
        </label>
      </Dialog>

      {!issue.closure.ready && (
        <div className="casebar">
          <Icon name="lock" size={14} />
          <span className="casebar__text">{issue.closure.blockingCount} unresolved · {issue.closure.overdue} late</span>
          <button className="btn btn--sm" onClick={() => setClosureOpen(true)}>Why?</button>
        </div>
      )}

      <Dialog
        open={closureOpen}
        title={issue.closure.ready ? 'Close this case?' : 'This case is held open'}
        confirmLabel={issue.closure.ready ? 'Close case' : 'Keep working'}
        tone={issue.closure.ready ? 'primary' : 'default'}
        onCancel={() => setClosureOpen(false)}
        onConfirm={() => setClosureOpen(false)}
      >
        {issue.closure.ready ? (
          <>All {issue.commitments.length} commitments are verified or dropped. Relay will let the transition through.</>
        ) : (
          <>
            <p style={{ marginBottom: 10 }}>
              {issue.closure.blockingCount} commitment{issue.closure.blockingCount > 1 ? 's are' : ' is'} still unresolved.
              The workflow validator refuses the transition for agents; the portal condition withholds it from customers.
            </p>
            <div className="reasonlist">
              {issue.closure.reasons.map((r) => <div key={r} className="reason"><span className="reason__dot" />{r}</div>)}
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
