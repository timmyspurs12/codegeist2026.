import { useMemo, useState } from 'react';
import type { ActivityType } from '../lib/types';
import type { ScreenProps } from './types';
import { Empty, OwnerStamp, Stamp, Toggle } from '../components/primitives';
import { Icon } from '../components/Icons';
import { clock, dayLabel } from '../lib/format';

type Filter = 'all' | 'commitments' | 'closure';

const tone: Record<ActivityType, string> = {
  tracked: 'var(--ink-2)',
  untracked: 'var(--muted)',
  captured: 'var(--ochre)',
  accepted: 'var(--pine)',
  reassigned: 'var(--pine)',
  verified: 'var(--verdigris)',
  dropped: 'var(--muted)',
  closure_blocked: 'var(--flame)',
  closure_allowed: 'var(--verdigris)',
  commented: 'var(--muted)',
};

export function Activity({ workspace, onOpenCase }: ScreenProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const events = useMemo(() => workspace.activity.filter((e) => {
    const inFilter = filter === 'all' ? true : filter === 'closure' ? e.type.startsWith('closure') : !e.type.startsWith('closure');
    const inSearch = q ? (e.summary + e.issueKey + (e.detail ?? e.commitmentCode ?? '')).toLowerCase().includes(q.toLowerCase()) : true;
    return inFilter && inSearch;
  }), [workspace.activity, filter, q]);

  const days = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const e of events) {
      const key = new Date(e.at).toDateString();
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()];
  }, [events]);

  return (
    <div className="wrap">
      <div className="page">
        <div className="masthead-line">
          <div>
            <div className="masthead-line__date">Activity &amp; audit</div>
            <h1 className="page-title">Every change to a promise, in order</h1>
            <p className="page-lede">
              Captures, acceptances, handovers, verifications and closure decisions — with the person and the source.
            </p>
          </div>
        </div>

        <div className="filters">
          <Toggle
            label="Filter activity"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Everything' },
              { value: 'commitments', label: 'Commitments' },
              { value: 'closure', label: 'Closure' },
            ]}
          />
          <input
            className="input filters__search"
            style={{ height: 30 }}
            placeholder="Case, person or code"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Filter activity by text"
          />
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{events.length} events</span>
        </div>

        {events.length === 0 ? (
          <Empty title="No events match" text="Try a different filter, or clear the search box." />
        ) : (
          <div className="timeline">
            {days.map(([day, list]) => (
              <div key={day} className="daygroup">
                <div className="dayhead">
                  <span className="dayhead__label">{dayLabel(list[0].at)}</span>
                  <span className="dayhead__count">{list.length}</span>
                </div>
                {list.map((e) => (
                  <div className="event" key={e.id}>
                    <div className="event__time">{clock(e.at)}</div>
                    <div className="event__mark" style={{ background: tone[e.type] }} aria-hidden="true" />
                    <div>
                      <div className="event__text"><b>{e.summary}</b></div>
                      {e.detail && <div className="event__detail">{e.detail}</div>}
                      <div className="event__refs">
                        <button onClick={() => onOpenCase(e.issueKey)}>{e.issueKey}</button>
                        {e.commitmentCode && <span>{e.commitmentCode}</span>}
                        {e.type === 'closure_blocked' && <Stamp tone="late" icon="lock">Blocked</Stamp>}
                        {e.type === 'closure_allowed' && <Stamp tone="verified" icon="check">Permitted</Stamp>}
                      </div>
                    </div>
                    <div className="event__actor">{e.actor ? <OwnerStamp person={e.actor} markOnly /> : 'system'}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 22, display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted)', fontSize: 11.5 }}>
          <Icon name="shield" size={13} />
          Append-only. Events are numbered, never rewritten, and kept separately from Jira comments.
        </div>
      </div>
    </div>
  );
}
