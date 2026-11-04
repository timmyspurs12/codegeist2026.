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
  /** null when Jira returned a comment without a created timestamp. */
  createdAt: string | null;
  body: string;
  quote: string;
  /** Character offsets of the quote inside `body`. Verified server-side. */
  start: number;
  end: number;
  /** Stable id of this exact quotation; the idempotency key for capture. */
  fingerprint?: string | null;
  /** How `body` was derived from the Jira comment. */
  bodyFormat?: 'adf-text' | 'plain';
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
  /** The verbatim sentence as captured. `text` may be edited by a person. */
  originalText?: string;
  dueBasis?: string | null;
  signals?: string[];
  acceptedBy?: { id: string | null; name: string } | null;
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
    value: { open?: number; overdue?: number; unowned?: number; updatedAt?: string; guard?: boolean };
    syncedAt: string | null;
    stale: boolean;
  };
  validatorMessage: string | null;
  conditionMessage: string | null;
  decisionCode?: 'clear' | 'blocked' | 'unavailable' | 'untracked';
}

export interface Issue {
  key: string;
  summary: string;
  status: string;
  statusCategory: 'to-do' | 'in-progress' | 'done';
  assignee: Person | null;
  reporter: Person | null;
  /** Jira priority name, passed through unchanged (sites rename these). */
  priority: string | null;
  /** Jira issue type. Relay has no SDESK scope, so this is not the JSM request type. */
  requestType: string | null;
  location: string | null;
  issueType?: string | null;
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

export interface Diagnostic {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  issueKey?: string;
  at?: string;
}

export interface Workspace {
  id: string;
  name: string;
  site: string;
  plan: string;
  viewer: Person;
  issues: Issue[];
  activity: ActivityEvent[];
  /** People Jira says can own work here. Empty in fixture mode. */
  people?: Person[];
  /** Real problems the console must show rather than hide. */
  diagnostics?: Diagnostic[];
  /** Where the workspace came from. Never inferred on the screen. */
  dataSource?: 'jira' | 'fixture';
  integrations: {
    jira: { connected: boolean; site: string; project: string; lastSync: string };
    enforcement: {
      validatorInstalled: boolean;
      conditionInstalled: boolean;
      conditionExpression: string;
      customerTransitionsEnabled: boolean;
      portalNote: string;
      verification?: 'declared' | 'unverified';
      openFieldId?: string | null;
    };
    capture: { autoCapture: boolean; confidenceThreshold: number; requireOwner: boolean };
  };
}

export type DataMode = 'live' | 'fixture';
