export type CommitmentStatus = 'proposed' | 'open' | 'verified' | 'dropped';

export interface Person {
  id: string;
  name: string;
  initials: string;
  role?: string;
}

export interface Evidence {
  commentId: string;
  author: Person;
  createdAt: string;
  body: string;
  quote: string;
  /** Character offsets of the quote inside `body`. Verified server-side. */
  start: number;
  end: number;
}

export interface Handover {
  from: Person;
  to: Person;
  at: string;
  by: Person;
  reason: string;
}

export interface Commitment {
  id: string;
  code: string;
  issueKey: string;
  text: string;
  evidence: Evidence;
  owner: Person | null;
  previousOwners: Handover[];
  status: CommitmentStatus;
  dueAt: string | null;
  acceptedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: Person | null;
  verificationNote: string | null;
  droppedReason: string | null;
  confidence: number;
  overdue: boolean;
}

export interface ClosureState {
  ready: boolean;
  blockingCount: number;
  awaitingReview: number;
  overdue: number;
  unowned: number;
  reasons: string[];
  evaluatedAt: string;
  projection: {
    kind: 'issue-property';
    key: string;
    value: { open: number; overdue: number; unowned: number; updatedAt: string };
    syncedAt: string;
    stale: boolean;
  };
  validatorMessage: string | null;
  conditionMessage: string | null;
}

export interface Issue {
  key: string;
  summary: string;
  status: string;
  statusCategory: 'to-do' | 'in-progress' | 'done';
  assignee: Person | null;
  reporter: Person;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  requestType: string;
  location: string;
  updatedAt: string;
  commitments: Commitment[];
  closure: ClosureState;
}

export type ActivityType =
  | 'captured'
  | 'accepted'
  | 'reassigned'
  | 'verified'
  | 'dropped'
  | 'closure_blocked'
  | 'closure_allowed'
  | 'commented';

export interface ActivityEvent {
  id: string;
  at: string;
  type: ActivityType;
  actor: Person | null;
  issueKey: string;
  commitmentCode: string | null;
  summary: string;
  detail: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  site: string;
  plan: string;
  viewer: Person;
  issues: Issue[];
  activity: ActivityEvent[];
  integrations: {
    jira: { connected: boolean; site: string; project: string; lastSync: string };
    enforcement: {
      validatorInstalled: boolean;
      conditionInstalled: boolean;
      conditionExpression: string;
      customerTransitionsEnabled: boolean;
      portalNote: string;
    };
    capture: { autoCapture: boolean; confidenceThreshold: number; requireOwner: boolean };
  };
}

export type DataMode = 'live' | 'fixture';
