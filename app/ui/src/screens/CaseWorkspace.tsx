import { useState } from 'react';
import type { Commitment, Issue } from '../lib/types';
import type { ScreenProps } from './types';
import { Button, CommitmentStatusLozenge, Due, Owner, statusTone } from '../components/primitives';
import { Dialog } from '../components/overlays';
import { Icon } from '../components/Icons';
import { timeAgo } from '../lib/format';

export function CaseWorkspace({ workspace, onOpenCommitment, onNavigate, issueKey }: ScreenProps & { issueKey: string }) {
  const issue = workspace.issues.find((i) => i.key === issueKey) ?? workspace.issues[0];
  const [closureOpen, setClosureOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const unresolved = issue.commitments.filter((c) => c.status === 'open' || c.status === 'proposed');

  return (
    <div className="case">
      <div className="case__main">
        <div style={{ marginBottom: 18 }}>
          <button className="btn btn--quiet btn--sm" onClick={() => onNavigate('overview')} style={{ marginLeft: -8 }}>
            <Icon name="arrow" size={13} style={{ transform: 'rotate(180deg)' }} /> All cases
          </button>
        </div>

        <header className="casehead">
          <span className="casehead__key">{issue.key}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="casehead__title">{issue.summary}</h1>
            <div className="casehead__meta">
              <span className="lozenge lozenge--neutral">{issue.status}</span>
              <Owner person={issue.assignee} />
              <span className="time">{issue.location}</span>
              <span className="time">{issue.requestType}</span>
            </div>
          </div>
          <Button variant={issue.closure.ready ? 'default' : 'primary'} icon={issue.closure.ready ? 'check' : 'lock'} onClick={() => setClosureOpen(true)}>
            {issue.closure.ready ? 'Close case' : 'Closure blocked'}
          </Button>
        </header>

        <section className="section" style={{ marginTop: 0 }}>
          <div className="section__head">
            <h2 className="section__title">Commitment thread</h2>
            <span className="section__note">
              {issue.commitments.length} tracked · {unresolved.length} unresolved
            </span>
          </div>

          <div className="thread">
            {issue.commitments.map((c) => (
              <article
                key={c.code}
                className="baton"
                data-tone={statusTone(c)}
                data-selected={selected === c.code}
                onClick={() => setSelected(c.code)}
              >
                <div className="baton__head">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="baton__title">{c.text}</div>
                  </div>
                  <CommitmentStatusLozenge commitment={c} />
                </div>

                <blockquote className="quote">
                  “{c.evidence.quote}”
                  <div className="quote__src">
                    <Icon name="quote" size={11} />
                    {c.evidence.author.name} · comment {c.evidence.commentId} · {timeAgo(c.evidence.createdAt)}
                  </div>
                </blockquote>

                <div className="baton__meta">
                  <Owner person={c.owner} />
                  <Due iso={c.dueAt} status={c.status} />
                  {c.previousOwners.length > 0 && (
                    <span className="handover">
                      <Icon name="sync" size={12} />
                      {c.previousOwners.length} handover{c.previousOwners.length > 1 ? 's' : ''}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto' }}>
                    <Button size="sm" variant="quiet" onClick={(e) => { e.stopPropagation(); onOpenCommitment(issue.key, c.code); }}>
                      Open
                    </Button>
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <aside className="case__side">
        <div className="inspector__head">
          <div className="inspector__label">Closure readiness</div>
          <div className="inspector__verdict" style={{ color: issue.closure.ready ? 'var(--verified)' : 'var(--overdue)' }}>
            {issue.closure.ready ? 'Closure permitted' : `Blocked — ${issue.closure.blockingCount} unresolved`}
          </div>
          <div className="time" style={{ marginTop: 4 }}>evaluated {timeAgo(issue.closure.evaluatedAt)}</div>
        </div>

        <div className="inspector__section">
          <h4>Why</h4>
          {issue.closure.ready ? (
            <div className="reason"><span className="reason__dot" style={{ background: 'var(--verified)' }} />Every commitment on this case is verified or dropped.</div>
          ) : (
            <div className="reasonlist">
              {issue.closure.reasons.map((r) => (
                <div key={r} className="reason"><span className="reason__dot" />{r}</div>
              ))}
            </div>
          )}
        </div>

        <div className="inspector__section">
          <h4>What an agent sees</h4>
          <div className="reason" style={{ color: issue.closure.validatorMessage ? 'var(--ink-2)' : 'var(--muted)' }}>
            {issue.closure.validatorMessage
              ? issue.closure.validatorMessage
              : 'No refusal is shown. The transition proceeds.'}
          </div>
        </div>

        <div className="inspector__section">
          <h4>What a customer sees</h4>
          <div className="reason" style={{ color: 'var(--ink-3)' }}>
            {workspace.integrations.enforcement.customerTransitionsEnabled
              ? 'The portal offers no message. Jira answers “You can not make this transition” and nothing more.'
              : 'The portal has no closure transition, so customers cannot close the request at all.'}
          </div>
        </div>

        <div className="inspector__section">
          <h4>Condition projection</h4>
          <div className="proj">{JSON.stringify(issue.closure.projection.value, null, 1)}</div>
          <div className="time" style={{ marginTop: 6 }}>
            <Icon name="link" size={11} /> {issue.closure.projection.key} · synced {timeAgo(issue.closure.projection.syncedAt)}
          </div>
        </div>

        <div className="inspector__section">
          <h4>Case details</h4>
          <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            <Row label="Request type" value={issue.requestType} />
            <Row label="Priority" value={issue.priority} />
            <Row label="Reporter" value={issue.reporter.name} />
            <Row label="Updated" value={timeAgo(issue.updatedAt)} />
          </div>
        </div>
      </aside>

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
              {issue.closure.blockingCount} commitment{issue.closure.blockingCount > 1 ? 's are' : ' is'} still unresolved. The workflow
              validator refuses the transition, and the portal condition hides it from customers.
            </p>
            <div className="reasonlist">
              {issue.closure.reasons.map((r) => (
                <div key={r} className="reason"><span className="reason__dot" />{r}</div>
              ))}
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export function commitmentFor(issue: Issue | undefined, code: string): Commitment | undefined {
  return issue?.commitments.find((c) => c.code === code);
}
