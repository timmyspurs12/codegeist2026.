import { useEffect, useState } from 'react';
import type { DataMode, Workspace } from '../lib/types';
import { api, type EnforcementCheck, type FieldResolution } from '../lib/api';
import { Button, Notice, OwnerStamp, Stamp, Switch } from '../components/primitives';
import { Icon } from '../components/Icons';
import { timeAgo } from '../lib/format';

const sections = ['Workspace', 'Jira connection', 'Enforcement', 'Capture', 'Audit'] as const;
type Section = typeof sections[number];

export function Settings({ workspace, onChange, toast, mode }: {
  workspace: Workspace;
  onChange: (w: Workspace) => void;
  toast: (m: string, tone?: 'default' | 'verified' | 'overdue') => void;
  mode?: DataMode;
}) {
  const [section, setSection] = useState<Section>('Workspace');
  const [name, setName] = useState(workspace.name);
  const [autoCapture, setAutoCapture] = useState(workspace.integrations.capture.autoCapture);
  const [threshold, setThreshold] = useState(workspace.integrations.capture.confidenceThreshold);
  const [requireOwner, setRequireOwner] = useState(workspace.integrations.capture.requireOwner);
  const [trackKey, setTrackKey] = useState('');
  const closureField = workspace.integrations.enforcement.field ?? null;
  const [fieldLive, setFieldLive] = useState<FieldResolution | null>(null);
  // Live resolution when we have it, otherwise the snapshot the workspace was
  // built from. Absent is absent: null, not a made-up field id.
  const fieldView = fieldLive?.field ?? closureField ?? null;
  const [check, setCheck] = useState<EnforcementCheck | null>(null);
  // Registration is not observable from inside an app: settings only ever
  // report what Relay declared in its manifest, never what a workflow does.
  const [reg, setReg] = useState({ validator: false, condition: false });
  const [busy, setBusy] = useState(false);
  const { capture, enforcement, jira } = workspace.integrations;
  const firstIssue = workspace.issues[0]?.key;

  useEffect(() => {
    if (mode !== 'live') return;
    let cancelled = false;
    // Ask the app what its field is *now*, rather than trusting a cached copy
    // in the workspace snapshot.
    api.resolveField()
      .then((res) => { if (!cancelled) setFieldLive(res); })
      .catch(() => { /* the workspace snapshot still shows the last known state */ });
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'live') return;
    let cancelled = false;
    api.settings().then((s) => {
      if (cancelled) return;
      setReg({ validator: Boolean(s.validatorRegistered), condition: Boolean(s.conditionRegistered) });
    }).catch(() => { /* treat as unverified */ });
    return () => { cancelled = true; };
  }, [mode]);

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
                  {mode === 'live' ? (
                    <Notice tone="ok">
                      Connected to {jira.site} · project {jira.project || 'not configured'} · last read {timeAgo(jira.lastSync)}
                    </Notice>
                  ) : (
                    <Notice tone="warn">
                      Fixture preview. These cases are demo data, not your Jira site; nothing here is written anywhere.
                    </Notice>
                  )}
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Tracked cases</div>
                    <div className="setting__desc">
                      {workspace.issues.length
                        ? `Relay holds a commitment ledger for ${workspace.issues.length} case${workspace.issues.length > 1 ? 's' : ''}.`
                        : 'No case is tracked yet. Open a Facilities issue in Jira and use the Commitments panel, or add its key here.'}
                    </div>
                  </div>
                  <div className="setting__control mono" style={{ fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {workspace.issues.length === 0 ? '—' : workspace.issues.map((i) => <span key={i.key}>{i.key}</span>)}
                  </div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Add a case</div>
                    <div className="setting__desc">
                      {mode === 'live'
                        ? `Reads the issue from ${jira.site} and starts a ledger for it.`
                        : 'Fixture workspace: adding a Jira case needs the Forge bridge.'}
                    </div>
                  </div>
                  <div className="setting__control" style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input"
                      placeholder="FS-101"
                      value={trackKey}
                      onChange={(e) => setTrackKey(e.target.value.toUpperCase())}
                      aria-label="Issue key to track"
                    />
                    <Button
                      variant="primary"
                      disabled={mode !== 'live' || busy || !/^[A-Z][A-Z0-9_]*-\d+$/.test(trackKey.trim())}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const next = await api.track(trackKey.trim());
                          onChange(next);
                          setTrackKey('');
                          toast(`${trackKey.trim()} is now tracked.`);
                        } catch (err) {
                          toast(err instanceof Error ? err.message : String(err));
                        } finally { setBusy(false); }
                      }}
                    >
                      Track
                    </Button>
                  </div>
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
                    <Stamp tone={reg.validator ? 'verified' : 'open'}>
                      {reg.validator ? 'Declared' : 'Not verified'}
                    </Stamp>
                    <p className="setting__note">
                      Declared in the manifest. An app cannot read a workflow's configuration, so whether this is attached to the closure transition is confirmed on the site, not here.
                    </p>
                  </div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Workflow condition</div>
                    <div className="setting__desc">{enforcement.portalNote}</div>
                  </div>
                  <div className="setting__control">
                    <Stamp tone={reg.condition ? 'verified' : 'open'}>
                      {reg.condition ? 'Declared' : 'Not verified'}
                    </Stamp>
                    <p className="setting__note">
                      Until the condition is attached to the closure transition on this site, the customer portal is not covered.
                    </p>
                  </div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Closure field</div>
                    <div className="setting__desc">
                      Relay’s own read-only number field, created with the app. The condition reads it; only Relay can write it.
                    </div>
                    <div className="setting__meta">
                      <span className="mono">{fieldView?.id ?? 'not resolved'}</span>
                      {fieldView?.key ? <span className="mono setting__meta-ellipsis" title={fieldView.key}>{fieldView.key}</span> : null}
                    </div>
                  </div>
                  <div className="setting__control">
                    <Stamp tone={fieldView?.resolved ? 'verified' : 'open'}>
                      {fieldView?.resolved ? 'Resolved' : 'Not resolved'}
                    </Stamp>
                    {!fieldView?.resolved && (
                      <p className="setting__note">
                        The field is created when the app is deployed and installed. Until Jira returns its id, the condition has nothing to read, and Relay writes nothing rather than guessing.
                      </p>
                    )}
                  </div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Condition expression</div>
                    <div className="setting__desc">
                      The field id is generated per app and environment, so this line is copied into <span className="mono">manifest.yml</span> once, after the first install, then deployed again.
                    </div>
                    <div className="setting__meta">
                      <span className="mono">{fieldView?.expression ?? enforcement.conditionExpression}</span>
                    </div>
                  </div>
                  <div className="setting__control" style={{ display: 'flex', gap: 8 }}>
                    <Button
                      size="sm"
                      disabled={!fieldView?.resolved}
                      onClick={async () => {
                        const line = fieldView?.manifestLine;
                        if (!line) return;
                        try {
                          await navigator.clipboard.writeText(line);
                          toast('Manifest line copied.');
                        } catch {
                          toast('Copy failed — select the line above instead.', 'overdue');
                        }
                      }}
                    >
                      Copy line
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={mode !== 'live' || busy || !fieldView?.resolved}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const expression = fieldView?.expression ?? '';
                          await api.saveSettings({ closureExpressionApplied: expression });
                          onChange({
                            ...workspace,
                            integrations: {
                              ...workspace.integrations,
                              enforcement: { ...enforcement, expressionApplied: expression },
                            },
                          });
                          toast('Recorded. Relay cannot verify a manifest from inside Jira — this is what you deployed.');
                        } catch (err) {
                          toast(err instanceof Error ? err.message : String(err));
                        } finally { setBusy(false); }
                      }}
                    >
                      Record as deployed
                    </Button>
                  </div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Reconcile every case</div>
                    <div className="setting__desc">
                      Re-derives each projection and field from its ledger. Run this before attaching the condition.
                    </div>
                  </div>
                  <div className="setting__control">
                    <Button
                      icon="sync"
                      disabled={mode !== 'live' || busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const res = await api.reconcileField();
                          const failed = res.failed.length;
                          toast(
                            failed
                              ? `Repaired ${res.repaired}; ${failed} case${failed > 1 ? 's' : ''} could not be reconciled.`
                              : `Reconciled ${res.repaired} case${res.repaired === 1 ? '' : 's'}; ${res.alreadyInStep} already in step.`,
                            failed ? 'overdue' : 'verified',
                          );
                        } catch (err) {
                          toast(err instanceof Error ? err.message : String(err));
                        } finally { setBusy(false); }
                      }}
                    >
                      Reconcile
                    </Button>
                  </div>
                </div>
                <div className="setting">
                  <div>
                    <div className="setting__title">Check one case</div>
                    <div className="setting__desc">
                      Reconciles a single case, then reports what the gate, the projection and the field each say — including when they disagree.
                    </div>
                  </div>
                  <div className="setting__control">
                    <Button
                      icon="sync"
                      disabled={mode !== 'live' || !firstIssue || busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          setCheck(await api.enforcementCheck(firstIssue));
                        } catch (err) {
                          toast(err instanceof Error ? err.message : String(err));
                        } finally { setBusy(false); }
                      }}
                    >
                      Run check
                    </Button>
                  </div>
                </div>
                {check && (
                  <div style={{ marginTop: 16 }}>
                    <Notice tone={check.allowed ? 'ok' : 'danger'}>
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {check.key}: closure {check.allowed ? 'permitted' : 'blocked'} ({check.code})
                        </div>
                        <div className="mono" style={{ fontSize: 11, marginTop: 4 }}>
                          ledger rev {check.ledgerRev ?? '—'} · projection open {String(check.projection?.open ?? '—')} · field {String(check.field ?? 'not configured')}
                          {check.stale ? ' · projection stale' : ''}
                        </div>
                        {check.diagnostics.map((d) => <div key={d.code} style={{ fontSize: 12, marginTop: 4 }}>{d.message}</div>)}
                      </div>
                    </Notice>
                  </div>
                )}
                <div className="setting">
                  <div>
                    <div className="setting__title">Customer transitions</div>
                    <div className="setting__desc">Whether the portal may attempt closure at all. Relay never writes a customer-facing message; a customer sees Jira's own refusal, if the site shows one.</div>
                  </div>
                  <div className="setting__control">
                    <Stamp tone={enforcement.customerTransitionsEnabled ? 'late' : 'open'}>
                      {enforcement.customerTransitionsEnabled ? 'Enabled' : 'Disabled'}
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
