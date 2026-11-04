import type { JSX } from 'react';

export type IconName =
  | 'overview' | 'inbox' | 'case' | 'activity' | 'settings'
  | 'search' | 'plus' | 'check' | 'close' | 'clock' | 'alert'
  | 'lock' | 'shield' | 'arrow' | 'chevron' | 'user' | 'more'
  | 'link' | 'sync' | 'quote' | 'filter' | 'spark' | 'external';

const paths: Record<IconName, JSX.Element> = {
  overview: <><rect x="2.5" y="2.5" width="5" height="5" rx="1" /><rect x="8.5" y="2.5" width="5" height="5" rx="1" /><rect x="2.5" y="8.5" width="5" height="5" rx="1" /><rect x="8.5" y="8.5" width="5" height="5" rx="1" /></>,
  inbox: <><path d="M2.5 9.5h3l1 2h3l1-2h3" /><path d="M3.6 3.2h8.8l1.1 6.3v2.3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V9.5z" /></>,
  case: <><path d="M4 2.5h5.5L13 6v7.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" /><path d="M9 2.5V6h3.5" /></>,
  activity: <><path d="M1.8 8h2.7l1.4-4 2.2 8.5 1.6-5.5 1 2.5h3.5" /></>,
  settings: <><circle cx="8" cy="8" r="2.1" /><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M12.4 3.6l-1 1M4.6 11.4l-1 1" /></>,
  search: <><circle cx="7.2" cy="7.2" r="4.2" /><path d="M10.4 10.4 14 14" /></>,
  plus: <><path d="M8 3.5v9M3.5 8h9" /></>,
  check: <><path d="M3 8.5l3.2 3.2L13 4.8" /></>,
  close: <><path d="M4 4l8 8M12 4l-8 8" /></>,
  clock: <><circle cx="8" cy="8" r="5.6" /><path d="M8 4.9V8l2.2 1.5" /></>,
  alert: <><path d="M8 2.4 14 13H2z" /><path d="M8 6.4v3M8 11.2v.1" /></>,
  lock: <><rect x="3.2" y="6.8" width="9.6" height="6.4" rx="1.2" /><path d="M5.6 6.8V5.2a2.4 2.4 0 0 1 4.8 0v1.6" /></>,
  shield: <><path d="M8 1.9 13 4v4.1c0 3-2.1 5.2-5 6-2.9-.8-5-3-5-6V4z" /><path d="M5.9 8l1.6 1.6L10.4 6.6" /></>,
  arrow: <><path d="M3 8h9.5" /><path d="M9.2 4.7 12.5 8l-3.3 3.3" /></>,
  chevron: <><path d="M4.5 6.5 8 10l3.5-3.5" /></>,
  user: <><circle cx="8" cy="5.6" r="2.6" /><path d="M3.2 13.4c.6-2.4 2.5-3.6 4.8-3.6s4.2 1.2 4.8 3.6" /></>,
  more: <><circle cx="3.4" cy="8" r=".9" /><circle cx="8" cy="8" r=".9" /><circle cx="12.6" cy="8" r=".9" /></>,
  link: <><path d="M6.6 9.4 9.4 6.6" /><path d="M7.2 5.1 8.6 3.7a2.5 2.5 0 0 1 3.5 3.5l-1.4 1.4" /><path d="M8.8 10.9 7.4 12.3a2.5 2.5 0 0 1-3.5-3.5L5.3 7.4" /></>,
  sync: <><path d="M13 8a5 5 0 0 1-8.4 3.6" /><path d="M3 8a5 5 0 0 1 8.4-3.6" /><path d="M11.2 1.8v2.6H13.8" transform="translate(-1.2 0)" /><path d="M3 12.2v-2.6H1.6" transform="translate(1.2 0)" /></>,
  quote: <><path d="M6.4 3.6C4.4 4.5 3.2 6.2 3.2 8.6c0 2.2 1.1 3.6 2.8 3.6 1.4 0 2.4-1 2.4-2.4 0-1.3-.9-2.2-2.1-2.2-.3 0-.5 0-.7.1.3-1.1 1.1-2 2.3-2.6z" /><path d="M12.6 3.6c-2 .9-3.2 2.6-3.2 5 0 2.2 1.1 3.6 2.8 3.6 1.4 0 2.4-1 2.4-2.4 0-1.3-.9-2.2-2.1-2.2-.3 0-.5 0-.7.1.3-1.1 1.1-2 2.3-2.6z" /></>,
  filter: <><path d="M2.6 4h10.8L9.4 8.6v4.2l-2.8-1.6V8.6z" /></>,
  spark: <><path d="M8 2.2l1.5 3.9 3.9 1.5-3.9 1.5L8 13l-1.5-3.9L2.6 7.6l3.9-1.5z" /></>,
  external: <><path d="M9.5 3.2H13v3.5" /><path d="M13 3.2 7.6 8.6" /><path d="M11.4 9.4v3.2a.9.9 0 0 1-.9.9H3.4a.9.9 0 0 1-.9-.9V5.5a.9.9 0 0 1 .9-.9h3" /></>,
};

export function Icon({ name, size = 16, className, style }: { name: IconName; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16"
      className={className}
      style={style}
      fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
