import { useState } from 'react';
import type { Workspace } from '../lib/types';
import { Button, Notice, OwnerStamp, Stamp, Switch } from '../components/primitives';
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
  const [name, setName] = useState(workspace.name);
  const [autoCapture, setAutoCapture] = useState(workspace.integrations.capture.autoCapture);
  const [threshold, setThreshold] = useState(workspace.integrations.capture.confidenceThreshold);
  const [requireOwner, setRequireOwner] = useState(workspace.integrations.capture.requireOwner);
  const { capture } = workspace.integrations;

  return (
    <div className="wrap wrap--narrow">
      <div className="page">
        <div className="masthead-line">
          <div>
            <div className="masthead-line__date">Settings</div>
            <h1 className="page-title">How Relay behaves on this site</h1>
            <p className="page-lede">
              Four things decide whether a case can close here: who owns the promise, when it was due, whether it was verified, and what Jira is told about it.
            </p>
          </div>
        </div>

        <div className="settings">
          <nav className="settings__nav" aria-label="Settings sections">
            {sections.map((s) => (
              <button key={s} aria-current={s === section} onClick={() => setSection(s)}>{s}</button>
            ))}
          </nav>

          <div style={{ minWidth: 0 }}>
            {section === 'Workspace' && (
              <section>
                <div className="settings__intro">
                  <h2>The basics of this installation</h2>
                  <p>A workspace is one Jira site. Relay reads the cases in it, keeps its own ledger of commitments, and never writes a promise it cannot point at a comment.</p>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Workspace name</div>
                    <div className="setting__desc">Shown across the console and in audit exports.</div>
                  </div>
                  <div className="setting__control" style={{ display: 'flex', gap: 8 }}>
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
                    <div className="setting__desc">Set by the installation, not editable here.</div>
                  </div>
                  <div className="setting__control mono" style={{ fontSize: 12.5 }}>{workspace.site}</div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Signed in as</div>
                    <div className="setting__desc">Relay uses the identity Jira provides; it never stores a token.</div>
                  </div>
                  <div className="setting__control"><OwnerStamp person={workspace.viewer} /></div>
                </div>
              </section>
            )}

            {section === 'Jira connection' && (
              <section>
                <div className="settings__intro">
                  <h2>What Relay reads, and when</h2>
                  <p>Reads come through Forge resolvers using the identity Jira passes in. There is no stored token, and no call is made that the app manifest does not declare.</p>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <Notice tone="ok">
                    Connected to {workspace.integrations.jira.site} · project {workspace.integrations.jira.project} · last sync {timeAgo(workspace.integrations.jira.lastSync)}
                  </Notice>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Request types in scope</div>
                    <div className="setting__desc">Relay tracks commitments on these request types only.</div>
                  </div>
                  <div className="setting__control mono" style={{ fontSize: 12 }}>Report a repair · Compliance visit</div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Re-read issue data</div>
                    <div className="setting__desc">Re-evaluates every open case against the ledger.</div>
                  </div>
                  <div className="setting__control"><Button icon="sync" onClick={() => toast('Sync queued — this can take a minute on a busy desk.')}>Sync now</Button></div>
                </div>
              </section>
            )}

            {section === 'Enforcement' && (
              <section>
                <div className="settings__intro">
                  <h2>Two layers hold a case open</h2>
                  <p>Agents and the API are stopped by the workflow validator, which can write a reason. The customer portal skips validators, so a workflow condition withholds the closure transition there instead. Neither can explain itself to a customer.</p>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Workflow validator</div>
                    <div className="setting__desc">Refuses agent and API closures with a written reason naming what is outstanding.</div>
                  </div>
                  <div className="setting__control">
                    <Stamp tone={workspace.integrations.enforcement.validatorInstalled ? 'verified' : 'late'}>
                      {workspace.integrations.enforcement.validatorInstalled ? 'Installed' : 'Missing'}
                    </Stamp>
                  </div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Workflow condition</div>
                    <div className="setting__desc">Withholds closure from the customer portal while commitments are open. The portal skips validators, so this is the only thing covering it.</div>
                  </div>
                  <div className="setting__control">
                    <Stamp tone={workspace.integrations.enforcement.conditionInstalled ? 'verified' : 'late'}>
                      {workspace.integrations.enforcement.conditionInstalled ? 'Installed' : 'Missing'}
                    </Stamp>
                  </div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Condition expression</div>
                    <div className="setting__desc">Evaluated by Jira, not by Relay. It can withhold a transition; it cannot explain one.</div>
                  </div>
                  <div className="setting__control"><div className="proj">{workspace.integrations.enforcement.conditionExpression}</div></div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Customer transitions</div>
                    <div className="setting__desc">{workspace.integrations.enforcement.portalNote}</div>
                  </div>
                  <div className="setting__control">
                    <Stamp tone={workspace.integrations.enforcement.customerTransitionsEnabled ? 'late' : 'open'}>
                      {workspace.integrations.enforcement.customerTransitionsEnabled ? 'Enabled' : 'Disabled'}
                    </Stamp>
                  </div>
                </div>
              </section>
            )}

            {section === 'Capture' && (
              <section>
                <div className="settings__intro">
                  <h2>How a comment becomes a suggestion</h2>
                  <p>Relay lifts the sentence it believes is a promise. Nothing is accepted on the person’s behalf, and the quoted sentence is stored with the commitment so it can be audited later.</p>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Capture suggestions from new comments</div>
                    <div className="setting__desc">Comments are read when posted. Nothing is accepted automatically.</div>
                  </div>
                  <div className="setting__control"><Switch checked={autoCapture} onChange={setAutoCapture} label={autoCapture ? 'On' : 'Off'} /></div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Always queue below</div>
                    <div className="setting__desc">Suggestions under this confidence go to the inbox even when auto-capture is on.</div>
                  </div>
                  <div className="setting__control" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input type="range" min={0.3} max={0.95} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} aria-label="Review threshold" style={{ flex: 1 }} />
                    <span className="mono" style={{ fontSize: 12 }}>{Math.round(threshold * 100)}%</span>
                  </div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Require an owner to accept</div>
                    <div className="setting__desc">A commitment with no owner cannot be chased.</div>
                  </div>
                  <div className="setting__control"><Switch checked={requireOwner} onChange={setRequireOwner} label={requireOwner ? 'Required' : 'Optional'} /></div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <Button
                    variant="primary"
                    onClick={() => {
                      onChange({ ...workspace, integrations: { ...workspace.integrations, capture: { ...capture, autoCapture, confidenceThreshold: threshold, requireOwner } } });
                      toast('Capture settings saved.');
                    }}
                  >
                    Save capture settings
                  </Button>
                </div>
              </section>
            )}

            {section === 'Audit' && (
              <section>
                <div className="settings__intro">
                  <h2>What is kept, and how it is recovered</h2>
                  <p>Events are append-only. If the ledger cannot be read, closure stays blocked rather than silently clearing.</p>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Retention</div>
                    <div className="setting__desc">Events live in the app’s own storage, separate from Jira comments.</div>
                  </div>
                  <div className="setting__control mono" style={{ fontSize: 12.5 }}>90 days</div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Events recorded</div>
                    <div className="setting__desc">Across every case in this workspace.</div>
                  </div>
                  <div className="setting__control mono" style={{ fontSize: 12.5 }}>{workspace.activity.length}</div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Re-derive projections</div>
                    <div className="setting__desc">Rebuilds the closure projection from the ledger if it is ever found stale.</div>
                  </div>
                  <div className="setting__control"><Button icon="sync" onClick={() => toast('Projection re-derived for all open cases.')}>Re-derive</Button></div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <Notice>
                    <Icon name="shield" size={13} />
                    <span>Recovery never fabricates a zero: if the ledger cannot be read, closure stays blocked and the console says so.</span>
                  </Notice>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
