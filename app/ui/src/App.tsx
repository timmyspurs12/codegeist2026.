import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataMode, Workspace } from './lib/types';
import { api } from './lib/api';
import { Icon, type IconName } from './components/Icons';
import { Avatar, Button, Skeleton } from './components/primitives';
import { CommandPalette, Toasts, type Command, type Toast } from './components/overlays';
import { Overview } from './screens/Overview';
import { CaptureInbox } from './screens/CaptureInbox';
import { CaseWorkspace } from './screens/CaseWorkspace';
import { Activity } from './screens/Activity';
import { Settings } from './screens/Settings';
import { CommitmentDrawer } from './screens/CommitmentDrawer';

type Route = 'overview' | 'inbox' | 'case' | 'activity' | 'settings';

const nav: { id: Route; label: string; icon: IconName; group: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'overview', group: 'Desk' },
  { id: 'inbox', label: 'Capture inbox', icon: 'inbox', group: 'Desk' },
  { id: 'case', label: 'Cases', icon: 'case', group: 'Desk' },
  { id: 'activity', label: 'Activity & audit', icon: 'activity', group: 'Records' },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'Records' },
];

export function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [mode, setMode] = useState<DataMode>('fixture');
  const [route, setRoute] = useState<Route>('overview');
  const [caseKey, setCaseKey] = useState<string>('');
  const [drawer, setDrawer] = useState<{ issueKey: string; code: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.bootstrap().then((res) => {
      if (cancelled) return;
      setWorkspace(res.workspace);
      setMode(res.mode);
      setCaseKey((k) => k || res.workspace.issues[0]?.key || '');
    });
    return () => { cancelled = true; };
  }, []);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'default') => {
    const id = Math.random().toString(36).slice(2, 8);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
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
  const go = useCallback((r: Route) => setRoute(r), []);

  const counts = useMemo(() => {
    if (!workspace) return { inbox: 0, overdue: 0, blocked: 0 };
    let inbox = 0, overdue = 0, blocked = 0;
    for (const i of workspace.issues) {
      if (!i.closure.ready) blocked += 1;
      for (const c of i.commitments) {
        if (c.status === 'proposed') inbox += 1;
        if (c.status === 'open' && c.overdue) overdue += 1;
      }
    }
    return { inbox, overdue, blocked };
  }, [workspace]);

  const commands: Command[] = useMemo(() => {
    if (!workspace) return [];
    const base: Command[] = [
      { id: 'go-overview', label: 'Go to Overview', group: 'Navigate', icon: 'overview', hint: 'G O', run: () => setRoute('overview') },
      { id: 'go-inbox', label: 'Go to Capture inbox', group: 'Navigate', icon: 'inbox', hint: 'G I', run: () => setRoute('inbox') },
      { id: 'go-activity', label: 'Go to Activity & audit', group: 'Navigate', icon: 'activity', hint: 'G A', run: () => setRoute('activity') },
      { id: 'go-settings', label: 'Go to Settings', group: 'Navigate', icon: 'settings', hint: 'G S', run: () => setRoute('settings') },
    ];
    const cases = workspace.issues.map<Command>((i) => ({
      id: `case-${i.key}`, label: `${i.key} — ${i.summary}`, group: 'Cases', icon: 'case', run: () => openCase(i.key),
    }));
    const commitments = workspace.issues.flatMap((i) => i.commitments.map<Command>((c) => ({
      id: `cm-${c.code}`, label: `${c.code} — ${c.text.slice(0, 70)}`, group: 'Commitments', icon: 'shield',
      run: () => openCommitment(i.key, c.code),
    })));
    return [...base, ...cases, ...commitments];
  }, [workspace, openCase, openCommitment]);

  const currentIssue = workspace?.issues.find((i) => i.key === caseKey) ?? workspace?.issues[0];
  const drawerIssue = workspace?.issues.find((i) => i.key === drawer?.issueKey);
  const drawerCommitment = drawerIssue?.commitments.find((c) => c.code === drawer?.code);

  if (!workspace) return <BootSkeleton mode={mode} />;

  return (
    <>
      <a className="skip-link" href="#main">Skip to workspace</a>
      <div className={`shell${compact ? ' shell--compact' : ''}`}>
        <nav className="rail" aria-label="Primary">
          <div className="rail__brand">
            <span className="rail__mark" aria-hidden="true"><Baton /></span>
            <span className="rail__wordmark">Relay<span> / repairs</span></span>
          </div>

          <div className="rail__scroll">
            <button className="switcher" onClick={() => toast('Only one workspace is connected in this release.')}>
              <span className="avatar" style={{ background: 'var(--sodium)', color: '#1b1305', borderColor: 'transparent' }}>NH</span>
              <span style={{ minWidth: 0 }}>
                <span className="switcher__name" style={{ display: 'block' }}>{workspace.name}</span>
                <span className="switcher__meta" style={{ display: 'block' }}>{workspace.site}</span>
              </span>
              <Icon name="chevron" size={13} className="switcher__chev" />
            </button>

            {['Desk', 'Records'].map((group) => (
              <div className="rail__group" key={group}>
                <div className="rail__label">{group}</div>
                {nav.filter((n) => n.group === group).map((item) => {
                  const badge = item.id === 'inbox' ? counts.inbox : item.id === 'overview' ? counts.blocked : 0;
                  return (
                    <button
                      key={item.id}
                      className="rail__item"
                      aria-current={route === item.id ? 'page' : undefined}
                      onClick={() => { setRoute(item.id); if (item.id === 'case' && !caseKey) setCaseKey(workspace.issues[0].key); }}
                    >
                      <Icon name={item.icon} size={15} />
                      <span>{item.label}</span>
                      {badge > 0 && <span className="rail__count">{badge}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="rail__foot">
            <Avatar person={workspace.viewer} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500 }}>{workspace.viewer.name}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--shell-ink-dim)' }}>{workspace.viewer.role}</span>
            </span>
            <button aria-label="Collapse navigation" onClick={() => setCompact((c) => !c)} style={{ color: 'var(--shell-ink-dim)' }}>
              <Icon name="chevron" size={14} />
            </button>
          </div>
        </nav>

        <div className="main" id="main">
          <header className="topbar">
            <button className="searchlaunch" onClick={() => setPaletteOpen(true)}>
              <Icon name="search" size={14} />
              <span>Search cases and commitments</span>
              <span className="searchlaunch__hint"><span className="kbd">Ctrl</span><span className="kbd">K</span></span>
            </button>
            <span className="topbar__spacer" />
            <span className={`mode-flag${mode === 'live' ? ' mode-flag--live' : ''}`} title={mode === 'live' ? 'Reading from Jira through Forge resolvers' : 'No Forge bridge detected — showing fixture data'}>
              <Icon name={mode === 'live' ? 'link' : 'alert'} size={12} />
              {mode === 'live' ? 'Live Jira data' : 'Fixture data'}
            </span>
            <Button size="sm" variant="quiet" icon="inbox" onClick={() => setRoute('inbox')}>
              {counts.inbox}
            </Button>
          </header>

          {route === 'overview' && <Overview workspace={workspace} onOpenCase={openCase} onOpenCommitment={openCommitment} toast={toast} onNavigate={go} />}
          {route === 'inbox' && (
            <CaptureInbox
              workspace={workspace}
              onOpenCase={openCase}
              onOpenCommitment={openCommitment}
              toast={toast}
              onNavigate={go}
              onAccept={async (k, code, ownerId, dueAt) => {
                const next = await api.accept(k, code, ownerId, dueAt);
                replaceIssue(next);
                toast(`${code} accepted. Closure re-evaluated for ${k}.`, 'verified');
              }}
              onReject={async (k, code, reason) => {
                const next = await api.reject(k, code, reason);
                replaceIssue(next);
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
            />
          )}
          {route === 'activity' && <Activity workspace={workspace} onOpenCase={openCase} onOpenCommitment={openCommitment} toast={toast} onNavigate={go} />}
          {route === 'settings' && <Settings workspace={workspace} onChange={setWorkspace} toast={toast} />}
        </div>
      </div>

      {drawerIssue && drawerCommitment && (
        <CommitmentDrawer
          workspace={workspace}
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

function Baton() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <rect x="1.4" y="6.1" width="12.2" height="2.8" rx="1.4" fill="#1b1305" />
      <path d="M4.6 8.9V3.4M10.4 8.9V3.4" stroke="#1b1305" strokeWidth="1.1" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

function BootSkeleton({ mode }: { mode: DataMode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '236px 1fr', height: '100%' }}>
      <div style={{ background: 'var(--shell)' }} />
      <div style={{ padding: 28 }}>
        <Skeleton w={120} h={10} />
        <div style={{ height: 14 }} />
        <Skeleton w={360} h={26} />
        <div style={{ height: 8 }} />
        <Skeleton w={520} h={12} />
        <div style={{ height: 28 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18 }}>
          <Skeleton h={120} w="100%" />
          <Skeleton h={120} w="100%" />
        </div>
        <div style={{ height: 18 }} />
        <Skeleton h={220} w="100%" />
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>
          {mode === 'live' ? 'Connecting to Jira…' : 'Loading workspace…'}
        </p>
      </div>
    </div>
  );
}
