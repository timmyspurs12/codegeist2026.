import { useState } from 'react';
import type { Workspace } from '../lib/types';
import { Button, Notice, Owner, Switch } from '../components/primitives';
import { Icon } from '../components/Icons';
import { timeAgo } from '../lib/format';

const sections = ['Workspace', 'Jira connection', 'Enforcement', 'Capture', 'Audit'] as const;
type Section = typeof sections[number];

export function Settings({ workspace, onChange, toast }: {
  workspace: Workspace;
  onChange: (w: Workspace) => void;
  toast: (m: string) => void;
}) {
  const [section, setSection] = useState<Section>('Workspace');
  const [autoCapture, setAutoCapture] = useState(workspace.integrations.capture.autoCapture);
  const [threshold, setThreshold] = useState(workspace.integrations.capture.confidenceThreshold);
  const [requireOwner, setRequireOwner] = useState(workspace.integrations.capture.requireOwner);
  const [name, setName] = useState(workspace.name);

  const capture = workspace.integrations.capture;

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="page__eyebrow">Settings</div>
          <h1 className="page__title">How Relay behaves here</h1>
          <p className="page__sub">Only what the first release needs: the workspace, the Jira connection, enforcement and capture policy.</p>
        </div>
      </header>

      <div className="settings">
        <nav className="settings__nav" aria-label="Settings sections">
          {sections.map((s) => (
            <button key={s} aria-current={s === section} onClick={() => setSection(s)}>{s}</button>
          ))}
        </nav>

        <div>
          {section === 'Workspace' && (
            <section>
              <div className="setting">
                <div>
                  <div className="setting__title">Workspace name</div>
                  <div className="setting__desc">Shown across the console and in audit exports.</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Workspace name" />
                  <Button
                    variant="primary"
                    disabled={name.trim() === workspace.name || name.trim().length < 2}
                    onClick={() => { onChange({ ...workspace, name: name.trim() }); toast('Workspace name saved.'); }}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div className="setting">
                <div>
                  <div className="setting__title">Jira site</div>
                  <div className="setting__desc">The cloud site this workspace reads and writes. Set by the installation, not here.</div>
                </div>
                <span className="key">{workspace.site}</span>
              </div>
              <div className="setting">
                <div>
                  <div className="setting__title">Your account</div>
                  <div className="setting__desc">Signed in with the identity Jira provides.</div>
                </div>
                <Owner person={workspace.viewer} showRole />
              </div>
            </section>
          )}

          {section === 'Jira connection' && (
            <section>
              <Notice tone="ok">
                <div>
                  <b>Connected</b> to {workspace.integrations.jira.site} · project {workspace.integrations.jira.project} · last sync{' '}
                  {timeAgo(workspace.integrations.jira.lastSync)}
                </div>
              </Notice>
              <div className="setting">
                <div>
                  <div className="setting__title">Request type scope</div>
                  <div className="setting__desc">Relay tracks commitments on the repairs request types only.</div>
                </div>
                <span className="key">Report a repair · Compliance visit</span>
              </div>
              <div className="setting">
                <div>
                  <div className="setting__title">Re-sync issue data</div>
                  <div className="setting__desc">Re-reads comments and re-evaluates every open case.</div>
                </div>
                <Button icon="sync" onClick={() => toast('Sync queued — this can take a minute on a busy desk.')}>Sync now</Button>
              </div>
            </section>
          )}

          {section === 'Enforcement' && (
            <section>
              <div className="panel" style={{ marginBottom: 16 }}>
                <div className="panel__head">
                  <Icon name="shield" size={15} />
                  <h2 className="panel__title">What is installed</h2>
                </div>
                <div className="panel__body" style={{ display: 'grid', gap: 12 }}>
                  <Installed label="Workflow validator" on={workspace.integrations.enforcement.validatorInstalled}
                    note="Refuses agent and API closure with a written reason." />
                  <Installed label="Workflow condition" on={workspace.integrations.enforcement.conditionInstalled}
                    note="Hides closure from the customer portal while commitments are open." />
                  <div className="proj">{workspace.integrations.enforcement.conditionExpression}</div>
                </div>
              </div>

              <Notice>
                <div>
                  <b>The portal cannot explain itself.</b> {workspace.integrations.enforcement.portalNote}
                </div>
              </Notice>

              <div className="setting" style={{ marginTop: 16 }}>
                <div>
                  <div className="setting__title">Customer transitions</div>
                  <div className="setting__desc">
                    Whether the workflow exposes a closure transition to the portal. If this is on without the condition,
                    customers can close with commitments unresolved.
                  </div>
                </div>
                <span className={`lozenge ${workspace.integrations.enforcement.customerTransitionsEnabled ? 'lozenge--overdue' : 'lozenge--neutral'}`}>
                  {workspace.integrations.enforcement.customerTransitionsEnabled ? 'Enabled — condition required' : 'Disabled'}
                </span>
              </div>
            </section>
          )}

          {section === 'Capture' && (
            <section>
              <div className="setting">
                <div>
                  <div className="setting__title">Capture suggestions from new comments</div>
                  <div className="setting__desc">Comments are read when posted. Nothing is accepted automatically.</div>
                </div>
                <Switch checked={autoCapture} onChange={setAutoCapture} label={autoCapture ? 'On' : 'Off'} />
              </div>
              <div className="setting">
                <div>
                  <div className="setting__title">Review threshold</div>
                  <div className="setting__desc">Suggestions below this confidence always queue for a person.</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="range" min={0.3} max={0.95} step={0.05} value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    aria-label="Review threshold"
                    style={{ flex: 1 }}
                  />
                  <span className="key">{(threshold * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="setting">
                <div>
                  <div className="setting__title">Require an owner before accepting</div>
                  <div className="setting__desc">A commitment with no owner cannot be chased.</div>
                </div>
                <Switch checked={requireOwner} onChange={setRequireOwner} label={requireOwner ? 'Required' : 'Optional'} />
              </div>
              <div style={{ marginTop: 16 }}>
                <Button
                  variant="primary"
                  onClick={() => {
                    void (async () => {
                      onChange({
                        ...workspace,
                        integrations: { ...workspace.integrations, capture: { ...capture, autoCapture, confidenceThreshold: threshold, requireOwner } },
                      });
                      toast('Capture settings saved.');
                    })();
                  }}
                >
                  Save capture settings
                </Button>
              </div>
            </section>
          )}

          {section === 'Audit' && (
            <section>
              <div className="setting">
                <div>
                  <div className="setting__title">Audit retention</div>
                  <div className="setting__desc">Append-only events kept in the app’s own storage, separate from Jira comments.</div>
                </div>
                <span className="key">90 days</span>
              </div>
              <div className="setting">
                <div>
                  <div className="setting__title">Events recorded</div>
                  <div className="setting__desc">Across all cases in this workspace.</div>
                </div>
                <span className="key">{workspace.activity.length}</span>
              </div>
              <div className="setting">
                <div>
                  <div className="setting__title">Recovery</div>
                  <div className="setting__desc">
                    If the projection is ever stale, Relay re-derives it from the ledger before permitting a closure.
                  </div>
                </div>
                <Button icon="sync" onClick={() => toast('Projection re-derived for all open cases.')}>Re-derive</Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Installed({ label, on, note }: { label: string; on: boolean; note: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: on ? 'var(--verified)' : 'var(--muted)', marginTop: 1 }}>
        <Icon name={on ? 'check' : 'close'} size={14} />
      </span>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{note}</div>
      </div>
    </div>
  );
}
