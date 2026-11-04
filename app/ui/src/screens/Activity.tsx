import { useMemo, useState } from 'react';
import type { ActivityType } from '../lib/types';
import type { ScreenProps } from './types';
import { Empty, Key, Owner, Segmented } from '../components/primitives';
import { Icon } from '../components/Icons';
import { clock, dayLabel } from '../lib/format';

type Filter = 'all' | 'commitments' | 'closure';

const tone: Record<ActivityType, string> = {
  captured: 'var(--sodium)',
  accepted: 'var(--await)',
  reassigned: 'var(--await)',
  verified: 'var(--verified)',
  dropped: 'var(--dropped)',
  closure_blocked: 'var(--overdue)',
  closure_allowed: 'var(--verified)',
  commented: 'var(--muted)',
};

export function Activity({ workspace, onOpenCase }: ScreenProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const events = useMemo(() => {
    return workspace.activity.filter((e) => {
      const inFilter = filter === 'all' ? true : filter === 'closure' ? e.type.startsWith('closure') : !e.type.startsWith('closure');
      const inSearch = q ? (e.summary + e.issueKey + (e.detail ?? e.commitmentCode ?? '')).toLowerCase().includes(q.toLowerCase()) : true;
      return inFilter && inSearch;
    });
  }, [workspace.activity, filter, q]);

  const days = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const e of events) {
      const key = new Date(e.at).toDateString();
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()];
  }, [events]);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="page__eyebrow">Activity &amp; audit</div>
          <h1 className="page__title">Everything that happened to a promise</h1>
          <p className="page__sub">
            Captures, acceptances, handovers, verifications and closure decisions — recorded with the person and the
            source. This is the record a regulator would ask for.
          </p>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <Segmented
          label="Filter activity"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Everything' },
            { value: 'commitments', label: 'Commitments' },
            { value: 'closure', label: 'Closure' },
          ]}
        />
        <input className="input" style={{ maxWidth: 260, height: 32 }} placeholder="Filter by case, person or code" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="time" style={{ marginLeft: 'auto' }}>{events.length} events</span>
      </div>

      {events.length === 0 ? (
        <Empty title="No events match" text="Try a different filter, or clear the search box." />
      ) : (
        <div className="timeline">
          {days.map(([day, list]) => (
            <div key={day}>
              <div className="tl-day">
                <span className="tl-day__label">{dayLabel(list[0].at)}</span>
                <span className="tl-day__rule" />
                <span className="time">{list.length}</span>
              </div>
              {list.map((e) => (
                <div className="tl-row" key={e.id}>
                  <div className="tl-row__time">{clock(e.at)}</div>
                  <div className="tl-row__mark">
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: tone[e.type], display: 'block' }} />
                  </div>
                  <div className="tl-row__text">
                    <b>{e.summary}</b>
                    {e.detail && <div style={{ color: 'var(--ink-3)' }}>{e.detail}</div>}
                    <div className="tl-row__ref">
                      <button className="key" style={{ color: 'var(--await)', textDecoration: 'underline' }} onClick={() => onOpenCase(e.issueKey)}>{e.issueKey}</button>
                      {e.commitmentCode && <span className="key">{e.commitmentCode}</span>}
                      {e.type === 'closure_blocked' && <span className="lozenge lozenge--overdue"><Icon name="lock" size={10} /> blocked</span>}
                      {e.type === 'closure_allowed' && <span className="lozenge lozenge--verified"><Icon name="check" size={10} /> permitted</span>}
                    </div>
                  </div>
                  <div>{e.actor ? <Owner person={e.actor} /> : <span className="time">system</span>}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 26, display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
        <Icon name="shield" size={14} />
        Audit entries are append-only. <Key>relay.audit</Key> keeps 90 days in this workspace.
      </div>
    </div>
  );
}
