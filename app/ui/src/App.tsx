import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataMode, Workspace } from './lib/types';
import { api } from './lib/api';
import { Icon, type IconName } from './components/Icons';
import { Button, Empty, Notice, OwnerStamp, Skeleton, Stamp } from './components/primitives';
import { CommandPalette, Sheet, Toasts, type Command, type Toast } from './components/overlays';
import { Overview } from './screens/Overview';
import { CaptureInbox } from './screens/CaptureInbox';
import { CaseWorkspace } from './screens/CaseWorkspace';
import { Activity } from './screens/Activity';
import { Settings } from './screens/Settings';
import { CommitmentSheet } from './screens/CommitmentSheet';

type Route = 'overview' | 'inbox' | 'case' | 'activity' | 'settings';

const NAV: { id: Route; label: string; short: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', short: 'Overview', icon: 'overview' },
  { id: 'inbox', label: 'Capture inbox', short: 'Capture', icon: 'inbox' },
  { id: 'case', label: 'Cases', short: 'Cases', icon: 'case' },
  { id: 'activity', label: 'Activity & audit', short: 'Activity', icon: 'activity' },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: 'settings' },
];

export function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [mode, setMode] = useState<DataMode>('fixture');
  const [route, setRoute] = useState<Route>('overview');
  const [caseKey, setCaseKey] = useState('');
  const [drawer, setDrawer] = useState<{ issueKey: string; code: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.bootstrap().then((res) => {
      if (cancelled) return;
      setWorkspace(res.workspace);
      setMode(res.mode);
      setCaseKey((k) => k || res.workspace.issues[0]?.key || '');
    }).catch((err: unknown) => {
      if (cancelled) return;
      setBootError(err instanceof Error ? err.message : String(err));
    });
    return () => { cancelled = true; };
  }, []);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'default') => {
    const id = Math.random().toString(36).slice(2, 8);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const go = useCallback((r: Route) => { setRoute(r); setMoreOpen(false); }, []);

  useEffect(() => {
    let pendingG = false;
    let timer: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); return; }
      if (e.key === 'Escape') { setPaletteOpen(false); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'g') {
        pendingG = true;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { pendingG = false; }, 1200);
        return;
      }
      if (pendingG) {
        const map: Record<string, Route> = { o: 'overview', i: 'inbox', a: 'activity', s: 'settings', c: 'case' };
        if (map[key]) { e.preventDefault(); setRoute(map[key]); }
        pendingG = false;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const replaceIssue = useCallback((issue: Workspace['issues'][number]) => {
    setWorkspace((w) => (w ? { ...w, issues: w.issues.map((i) => (i.key === issue.key ? issue : i)) } : w));
  }, []);

  const openCase = useCallback((key: string) => {
    if (!key) { setRoute('overview'); return; }
    setCaseKey(key);
    setRoute('case');
  }, []);

  const openCommitment = useCallback((issueKey: string, code: string) => setDrawer({ issueKey, code }), []);

  /** Read the issue's real comments and queue anything that reads like a promise. */
  const scanIssue = useCallback(async (key: string) => {
    try {
      const res = await api.scan(key);
      if (res.unavailable) { toast(res.unavailable, 'overdue'); return; }
      replaceIssue(res.issue);
      const created = res.created.length;
      if (created === 0) {
        toast(res.duplicates > 0
          ? `Nothing new — ${res.duplicates} suggestion${res.duplicates > 1 ? 's' : ''} already captured from these comments.`
          : `Read ${res.scanned.comments} comment${res.scanned.comments === 1 ? '' : 's'} on ${key} and found no new promise.`);
      } else {
        toast(`${created} suggestion${created > 1 ? 's' : ''} queued from ${key}. Nothing is a commitment until a person accepts it.`, 'verified');
      }
      if (res.rejected.length) toast(`${res.rejected.length} candidate${res.rejected.length > 1 ? 's were' : ' was'} rejected because the quotation could not be anchored.`, 'overdue');
    } catch (err) {
      toast(`Scan failed: ${err instanceof Error ? err.message : String(err)}`, 'overdue');
    }
  }, [replaceIssue, toast]);

  const counts = useMemo(() => {
    if (!workspace) return { inbox: 0, blocked: 0 };
    let inbox = 0, blocked = 0;
    for (const i of workspace.issues) {
      if (!i.closure.ready) blocked += 1;
      for (const c of i.commitments) if (c.status === 'proposed') inbox += 1;
    }
    return { inbox, blocked };
  }, [workspace]);

  const commands: Command[] = useMemo(() => {
    if (!workspace) return [];
    const base: Command[] = NAV.map((n) => ({
      id: `go-${n.id}`, label: `Go to ${n.label}`, group: 'Navigate', icon: n.icon,
      hint: n.id === 'overview' ? 'G O' : n.id === 'inbox' ? 'G I' : n.id === 'activity' ? 'G A' : n.id === 'settings' ? 'G S' : 'G C',
      run: () => setRoute(n.id),
    }));
    const cases = workspace.issues.map<Command>((i) => ({
      id: `case-${i.key}`, label: `${i.key} — ${i.summary}`, group: 'Cases', icon: 'case', run: () => openCase(i.key),
    }));
    const commitments = workspace.issues.flatMap((i) => i.commitments.map<Command>((c) => ({
      id: `cm-${c.code}`, label: `${c.code} — ${c.text.slice(0, 68)}`, group: 'Commitments', icon: 'shield',
      run: () => openCommitment(i.key, c.code),
    })));
    return [...base, ...cases, ...commitments];
  }, [workspace, openCase, openCommitment]);

  const currentIssue = workspace?.issues.find((i) => i.key === caseKey) ?? workspace?.issues[0];
  const drawerIssue = workspace?.issues.find((i) => i.key === drawer?.issueKey);
  const drawerCommitment = drawerIssue?.commitments.find((c) => c.code === drawer?.code);

  if (!workspace) return <Boot error={bootError} />;

  const mobilePrimary: Route[] = ['overview', 'inbox', 'case'];
  const moreActive: boolean = route === 'activity' || route === 'settings';

  return (
    <>
      <a className="skip-link" href="#main">Skip to workspace</a>
      <div className="app">
        <header className="masthead">
          <div className="masthead__inner">
            <button className="wordmark" onClick={() => go('overview')} aria-label="Relay — go to overview">
              <span className="wordmark__glyph" aria-hidden="true"><Baton /></span>
              <span className="wordmark__text">Relay</span>
              <span className="wordmark__sub">commitment operations</span>
            </button>

            <button className="workspace-chip" onClick={() => toast('Only one workspace is connected in this release.')}>
              <span className="workspace-chip__mono" aria-hidden="true">{initials(workspace.name)}</span>
              <span className="workspace-chip__meta">
                <span className="workspace-chip__name">{workspace.name}</span>
                <span className="workspace-chip__host">{workspace.site}</span>
              </span>
              <span className="workspace-chip__caret"><Icon name="chevron" size={12} /></span>
            </button>

            <span className="masthead__spacer" />

            <button className="searchbtn" onClick={() => setPaletteOpen(true)} aria-label="Search cases and commitments">
              <Icon name="search" size={14} />
              <span className="searchbtn__label">Search</span>
              <span className="searchbtn__keys"><span className="kbd">Ctrl</span><span className="kbd">K</span></span>
            </button>

            <span className={`mode${mode === 'live' ? ' mode--live' : ''}`} title={mode === 'live' ? 'Reading from Jira through Forge resolvers' : 'No Forge bridge — fixture data'}>
              <Icon name={mode === 'live' ? 'link' : 'alert'} size={11} />
              <span>{mode === 'live' ? 'Live' : 'Fixture'}</span>
            </span>

            <button className="account" onClick={() => go('settings')}>
              <span className="owner__mark" aria-hidden="true">{workspace.viewer.initials}</span>
              <span className="account__text">
                <span className="account__name">{workspace.viewer.name}</span>
                <span className="account__role">{workspace.viewer.role}</span>
              </span>
            </button>
          </div>

          <nav className="tabs" aria-label="Primary">
            <div className="tabs__inner">
              {NAV.map((n) => (
                <button key={n.id} className="tab" aria-current={route === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
                  <Icon name={n.icon} size={13} />
                  {n.short}
                  {n.id === 'inbox' && counts.inbox > 0 && <span className="tab__count">{counts.inbox}</span>}
                  {n.id === 'overview' && counts.blocked > 0 && <span className="tab__count">{counts.blocked}</span>}
                </button>
              ))}
            </div>
          </nav>
        </header>

        <main className="main" id="main">
          {route === 'overview' && (
            <Overview workspace={workspace} onOpenCase={openCase} onOpenCommitment={openCommitment} toast={toast} onNavigate={go} />
          )}
          {route === 'inbox' && (
            <CaptureInbox
              workspace={workspace}
              onOpenCase={openCase}
              onOpenCommitment={openCommitment}
              toast={toast}
              onNavigate={go}
              onScan={scanIssue}
              onAccept={async (k, code, ownerId, dueAt) => {
                replaceIssue(await api.accept(k, code, ownerId, dueAt));
                toast(`${code} accepted. Closure re-evaluated for ${k}.`, 'verified');
              }}
              onReject={async (k, code, reason) => {
                replaceIssue(await api.reject(k, code, reason));
                toast(`${code} rejected — kept in the audit trail.`);
              }}
            />
          )}
          {route === 'case' && currentIssue && (
            <CaseWorkspace
              workspace={workspace}
              issueKey={currentIssue.key}
              onOpenCase={openCase}
              onOpenCommitment={openCommitment}
              toast={toast}
              onNavigate={go}
              onScan={scanIssue}
            />
          )}
          {route === 'activity' && <Activity workspace={workspace} onOpenCase={openCase} onOpenCommitment={openCommitment} toast={toast} onNavigate={go} />}
          {route === 'settings' && <Settings workspace={workspace} onChange={setWorkspace} toast={toast} mode={mode} />}
        </main>

        <nav className="tabbar" aria-label="Primary">
          {mobilePrimary.map((id) => {
            const n = NAV.find((x) => x.id === id)!;
            return (
              <button key={id} className="tabbar__item" aria-current={route === id ? 'page' : undefined} onClick={() => go(id)}>
                <Icon name={n.icon} size={18} />
                {n.short}
                {id === 'inbox' && counts.inbox > 0 && <span className="tabbar__dot">{counts.inbox}</span>}
              </button>
            );
          })}
          <button className="tabbar__item" aria-current={moreActive ? 'page' : undefined} onClick={() => setMoreOpen(true)}>
            <Icon name="more" size={18} />
            More
          </button>
        </nav>
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Workspace">
        <div style={{ display: 'grid', gap: 4 }}>
          {NAV.map((n) => (
            <button
              key={n.id}
              className="menuitem"
              onClick={() => { go(n.id); setMoreOpen(false); }}
              aria-current={route === n.id ? 'page' : undefined}
            >
              <Icon name={n.icon} size={15} />
              <span className="menuitem__label">{n.label}</span>
              {(n.id === 'inbox' ? counts.inbox : n.id === 'overview' ? counts.blocked : 0) > 0 && (
                <span className="menuitem__count">
                  {n.id === 'inbox' ? counts.inbox : counts.blocked}
                </span>
              )}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--rule)' }}>
          <div className="margin-note__label">Signed in</div>
          <OwnerStamp person={workspace.viewer} />
          <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{workspace.site}</div>
        </div>
        <div style={{ marginTop: 16 }}>
          <Stamp tone={mode === 'live' ? 'verified' : 'open'}>{mode === 'live' ? 'Live Jira data' : 'Fixture data'}</Stamp>
        </div>
        <div style={{ marginTop: 20 }}>
          <Button variant="primary" icon="search" onClick={() => { setMoreOpen(false); setPaletteOpen(true); }}>Search everything</Button>
        </div>
      </Sheet>

      {drawerIssue && drawerCommitment && (
        <CommitmentSheet
          issue={drawerIssue}
          commitment={drawerCommitment}
          onClose={() => setDrawer(null)}
          onVerify={async (note) => {
            replaceIssue(await api.verify(drawerIssue.key, drawerCommitment.code, note));
            toast(`${drawerCommitment.code} verified. Projection re-derived.`, 'verified');
          }}
          onReassign={async (ownerId, reason) => {
            replaceIssue(await api.reassign(drawerIssue.key, drawerCommitment.code, ownerId, reason));
            toast('Handover recorded.');
          }}
          onDrop={async (reason) => {
            replaceIssue(await api.drop(drawerIssue.key, drawerCommitment.code, reason));
            toast(`${drawerCommitment.code} dropped.`, 'overdue');
          }}
        />
      )}

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </>
  );
}

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

function Baton() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.2" y="5.8" width="11.6" height="2.4" rx="1.2" fill="currentColor" opacity=".95" />
      <path d="M4.4 8.2V3.1M9.6 8.2V3.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

function Boot({ error }: { error?: string | null }) {
  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__inner">
          <span className="wordmark">
            <span className="wordmark__glyph" aria-hidden="true"><Baton /></span>
            <span className="wordmark__text">Relay</span>
          </span>
        </div>
        <nav className="tabs"><div className="tabs__inner" /></nav>
      </header>
      <main className="main">
        <div className="wrap wrap--narrow">
          <div className="page">
            <Skeleton w={140} h={9} />
            <div style={{ height: 14 }} />
            <Skeleton w="min(420px, 70%)" h={30} />
            <div style={{ height: 10 }} />
            <Skeleton w="min(520px, 84%)" h={12} />
            <div style={{ height: 30 }} />
            {error ? (
              <Notice tone="danger">
                <div>
                  <div style={{ fontWeight: 500 }}>Relay could not open the ledger</div>
                  <div style={{ marginTop: 6 }}>{error}</div>
                  <div style={{ marginTop: 10 }}>
                    <Button size="sm" onClick={() => window.location.reload()}>Try again</Button>
                  </div>
                </div>
              </Notice>
            ) : (
              <>
                <Skeleton h={64} />
                <div style={{ height: 20 }} />
                <Empty title="Opening the ledger" text="Reading cases, commitments and evidence…" />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
