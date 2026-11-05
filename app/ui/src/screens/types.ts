import type { Workspace } from '../lib/types';

export interface ScreenProps {
  workspace: Workspace;
  onOpenCase: (key: string) => void;
  onOpenCommitment: (issueKey: string, code: string) => void;
  toast: (message: string, tone?: 'default' | 'verified' | 'overdue') => void;
  onNavigate: (route: 'overview' | 'inbox' | 'case' | 'activity' | 'settings') => void;
  /** Read the issue's real Jira comments and queue candidate commitments. */
  onScan?: (issueKey: string) => void | Promise<void>;
  /** Run the management lifecycle for an issue (initialising → managed). */
  onTrack?: (issueKey: string) => void | Promise<void>;
  /** Stop managing an issue. The caller confirms first; this is the confirmed action. */
  onUntrack?: (issueKey: string, reason: string) => void | Promise<void>;
  /** Record every issue in the project as unmanaged, one page at a time. */
  onBackfill?: (projectKey: string, cursor: string | null) => Promise<{ done: boolean; nextPageToken: string | null; initialised: number; skipped: number; failed: number }>;
}
