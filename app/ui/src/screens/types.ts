import type { Workspace } from '../lib/types';

export interface ScreenProps {
  workspace: Workspace;
  onOpenCase: (key: string) => void;
  onOpenCommitment: (issueKey: string, code: string) => void;
  toast: (message: string, tone?: 'default' | 'verified' | 'overdue') => void;
  onNavigate: (route: 'overview' | 'inbox' | 'case' | 'activity' | 'settings') => void;
}
