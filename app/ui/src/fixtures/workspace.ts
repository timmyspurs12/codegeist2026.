import type { ActivityEvent, Commitment, Evidence, Issue, Person, Workspace } from '../lib/types';

/**
 * FIXTURE DATA — not live Jira. The shell shows a "Fixture data" flag whenever
 * these are in use, and the bridge swaps them out for resolver results the
 * moment the app runs inside Forge.
 *
 * The content is deliberately mundane housing-repairs work: this product is for
 * repairs coordinators chasing real promises, not for a demo video.
 */

const H = 3600_000;
const now = Date.now();
const ago = (hours: number) => new Date(now - hours * H).toISOString();
const ahead = (days: number) => new Date(now + days * 864e5).toISOString();

export const people: Record<string, Person> = {
  maya: { id: 'acc-maya', name: 'Maya Okafor', initials: 'MO', role: 'Repairs coordinator' },
  daniel: { id: 'acc-daniel', name: 'Daniel Reyes', initials: 'DR', role: 'Gas engineer lead' },
  priya: { id: 'acc-priya', name: 'Priya Shah', initials: 'PS', role: 'Operations manager' },
  tom: { id: 'acc-tom', name: 'Tom Whitfield', initials: 'TW', role: 'Scheduling' },
  tenant: { id: 'acc-tenant', name: 'A. Bello (tenant)', initials: 'AB', role: 'Customer' },
  nadia: { id: 'acc-nadia', name: 'Nadia Farouk', initials: 'NF', role: 'Surveyor' },
};

function evidence(commentId: string, author: Person, createdAt: string, body: string, quote: string): Evidence {
  const start = body.indexOf(quote);
  if (start < 0) throw new Error(`fixture quote is not in the comment body: ${commentId}`);
  return { commentId, author, createdAt, body, quote, start, end: start + quote.length };
}

const comments = {
  rep1042: `Tenant rang again this morning about the extractor. Reported black mould on the ceiling above the shower on 14 October and it has spread since. The fan has been dead since the summer and the last contractor note said the ducting was blocked at the roof outlet. I have booked the access slot for Thursday 9–11 but the tenant needs 24 hours notice. I'll chase the ducting part with suppliers on Monday and confirm the appointment once it lands.`,
  rep1039: `Bathroom extractor is on back order. To be clear on what we've committed to: we will fit the replacement unit within five working days of the part arriving, and the tenant has agreed to the access window. I will send the tenant a written update once the part is booked in.`,
  rep1031: `Tenant locked out after the latch failed — temporary lock fitted same day. Permanent lock is with the locksmith. I'll get the permanent replacement booked for the week of the 24th.`,
  rep1028: `Gas safety record is now overdue on the file. Appointment moved twice at tenant request; third booking held for Friday. I'll complete the CP12 and upload it the same day.`,
  rep1024: `All six fittings replaced and tested. Stairwell is lit on both landings. I will close this out once the caretaker confirms the overnight check.`,
  rep1019: `Pressure has dropped again — third visit. The boiler is losing roughly 0.4 bar a week and the engineer suspects the heat exchanger. We'll run a 48-hour pressure test and report back before replacing anything.`,
};

function commitment(p: Partial<Commitment> & Pick<Commitment, 'code' | 'issueKey' | 'text' | 'evidence'>): Commitment {
  return {
    id: `cm-${p.code}`,
    owner: null,
    previousOwners: [],
    status: 'open',
    dueAt: null,
    acceptedAt: p.evidence.createdAt,
    verifiedAt: null,
    verifiedBy: null,
    verificationNote: null,
    droppedReason: null,
    confidence: 0.86,
    overdue: false,
    ...p,
  } as Commitment;
}

const c1042a = commitment({
  code: 'CM-118', issueKey: 'REP-1042',
  text: 'Chase the blocked roof-outlet ducting part with suppliers on Monday and confirm the Thursday access slot.',
  evidence: evidence('c-1042-3', people.tom, ago(29), comments.rep1042,
    "I'll chase the ducting part with suppliers on Monday and confirm the appointment once it lands."),
  owner: people.tom, dueAt: ahead(-1), overdue: true, confidence: 0.91,
});
const c1042b = commitment({
  code: 'CM-117', issueKey: 'REP-1042',
  text: 'Give the tenant 24 hours notice before the Thursday 9–11 access slot.',
  evidence: evidence('c-1042-3', people.tom, ago(29), comments.rep1042,
    'the tenant needs 24 hours notice'),
  owner: people.maya, dueAt: ahead(2), confidence: 0.74,
});
const c1042c = commitment({
  code: 'CM-112', issueKey: 'REP-1042',
  text: 'Reinspect and treat the mould in the bathroom once the extractor is working.',
  evidence: evidence('c-1042-1', people.maya, ago(96), comments.rep1042,
    'Reported black mould on the ceiling above the shower on 14 October and it has spread since.'),
  owner: people.nadia, status: 'verified', verifiedAt: ago(40), verifiedBy: people.priya,
  verificationNote: 'Treatment invoice and photos logged against the property file.',
  dueAt: ago(40), confidence: 0.95,
});

const c1039a = commitment({
  code: 'CM-121', issueKey: 'REP-1039',
  text: 'Fit the replacement extractor unit within five working days of the part arriving.',
  evidence: evidence('c-1039-2', people.daniel, ago(6), comments.rep1039,
    'we will fit the replacement unit within five working days of the part arriving'),
  owner: people.daniel, dueAt: ahead(5), confidence: 0.93,
});
const c1039b = commitment({
  code: 'CM-122', issueKey: 'REP-1039',
  text: 'Send the tenant a written update once the part is booked in.',
  evidence: evidence('c-1039-2', people.daniel, ago(6), comments.rep1039,
    'I will send the tenant a written update once the part is booked in.'),
  owner: null, status: 'proposed', confidence: 0.62,
});

const c1031a = commitment({
  code: 'CM-124', issueKey: 'REP-1031',
  text: 'Book the permanent lock replacement for the week of the 24th.',
  evidence: evidence('c-1031-1', people.tom, ago(2), comments.rep1031,
    "I'll get the permanent replacement booked for the week of the 24th."),
  owner: null, status: 'proposed', confidence: 0.58,
});

const c1028a = commitment({
  code: 'CM-108', issueKey: 'REP-1028',
  text: 'Complete the CP12 and upload it to the property file the same day as the Friday visit.',
  evidence: evidence('c-1028-4', people.daniel, ago(20), comments.rep1028,
    "I'll complete the CP12 and upload it the same day."),
  owner: people.daniel, dueAt: ahead(3), previousOwners: [
    { from: people.priya, to: people.daniel, at: ago(18), by: people.priya, reason: 'Handed to the engineer holding the Friday slot.' },
  ], confidence: 0.9,
});

const c1024a = commitment({
  code: 'CM-097', issueKey: 'REP-1024',
  text: 'Replace and test all six stairwell fittings.',
  evidence: evidence('c-1024-1', people.tom, ago(150), comments.rep1024,
    'All six fittings replaced and tested.'),
  owner: people.tom, status: 'verified', verifiedAt: ago(120), verifiedBy: people.maya,
  verificationNote: 'Electrician certificate uploaded; caretaker walk-round photos attached.',
  dueAt: ago(120), confidence: 0.97,
});
const c1024b = commitment({
  code: 'CM-098', issueKey: 'REP-1024',
  text: 'Confirm the caretaker’s overnight check before closing the case.',
  evidence: evidence('c-1024-1', people.tom, ago(150), comments.rep1024,
    'I will close this out once the caretaker confirms the overnight check.'),
  owner: people.maya, status: 'verified', verifiedAt: ago(26), verifiedBy: people.maya,
  verificationNote: 'Caretaker confirmed by email at 07:12.',
  dueAt: ago(26), confidence: 0.88,
});

const c1019a = commitment({
  code: 'CM-089', issueKey: 'REP-1019',
  text: 'Run a 48-hour pressure test and report back before replacing any parts.',
  evidence: evidence('c-1019-5', people.daniel, ago(52), comments.rep1019,
    "We'll run a 48-hour pressure test and report back before replacing anything."),
  owner: people.daniel, dueAt: ago(6), overdue: true, previousOwners: [
    { from: people.nadia, to: people.daniel, at: ago(30), by: people.priya, reason: 'Surveyor on leave; engineer took the test.' },
  ], confidence: 0.89,
});

function closure(open: Commitment[], opts: { awaiting?: number } = {}) {
  const blocking = open.filter((c) => c.status === 'open' || c.status === 'proposed');
  const overdue = open.filter((c) => c.status === 'open' && c.overdue).length;
  const unowned = open.filter((c) => c.status === 'open' && !c.owner).length;
  const awaiting = opts.awaiting ?? open.filter((c) => c.status === 'proposed').length;
  const reasons: string[] = [];
  if (overdue) reasons.push(`${overdue} accepted commitment${overdue > 1 ? 's are' : ' is'} past its due date.`);
  if (unowned) reasons.push(`${unowned} commitment${unowned > 1 ? 's have' : ' has'} no owner.`);
  if (awaiting) reasons.push(`${awaiting} captured suggestion${awaiting > 1 ? 's are' : ' is'} still awaiting review.`);
  const ready = blocking.length === 0;
  return {
    ready,
    blockingCount: blocking.length,
    awaitingReview: awaiting,
    overdue,
    unowned,
    reasons: ready ? [] : reasons,
    evaluatedAt: ago(0.05),
    projection: {
      kind: 'issue-property' as const,
      key: 'relay.closure',
      value: { open: blocking.length, overdue, unowned, updatedAt: ago(0.05) },
      syncedAt: ago(0.05),
      stale: false,
    },
    validatorMessage: ready
      ? null
      : `Relay: ${blocking.length} unresolved commitment${blocking.length > 1 ? 's' : ''} on this case. Resolve or verify them before closing.`,
    conditionMessage: ready ? null : 'Customer closure is restricted while commitments are unresolved.',
  };
}

const rep1042: Issue = {
  key: 'REP-1042',
  summary: 'Kitchen extractor fan not working — black mould spreading above the shower',
  status: 'In progress', statusCategory: 'in-progress',
  assignee: people.maya, reporter: people.tenant,
  priority: 'High', requestType: 'Report a repair',
  location: '14 Coldharbour Lane, Flat 3B',
  updatedAt: ago(1.2),
  commitments: [c1042a, c1042b, c1042c],
  management: {
    state: 'managed',
    managed: true,
    unmanaged: false,
    initializing: false,
    known: true,
    label: 'Managed by Relay',
  },
  closure: closure([c1042a, c1042b, c1042c]),
};

const rep1039: Issue = {
  key: 'REP-1039',
  summary: 'Bathroom extractor replacement — part on back order',
  status: 'In progress', statusCategory: 'in-progress',
  assignee: people.daniel, reporter: people.tenant,
  priority: 'Medium', requestType: 'Report a repair',
  location: '8 Ashgrove Terrace, Flat 1',
  updatedAt: ago(5),
  commitments: [c1039a, c1039b],
  management: {
    state: 'managed',
    managed: true,
    unmanaged: false,
    initializing: false,
    known: true,
    label: 'Managed by Relay',
  },
  closure: closure([c1039a, c1039b]),
};

const rep1031: Issue = {
  key: 'REP-1031',
  summary: 'Front door latch failed — permanent lock outstanding',
  status: 'To do', statusCategory: 'to-do',
  assignee: people.tom, reporter: people.tenant,
  priority: 'Medium', requestType: 'Report a repair',
  location: '22 Mill Row, House 5',
  updatedAt: ago(2),
  commitments: [c1031a],
  management: {
    state: 'managed',
    managed: true,
    unmanaged: false,
    initializing: false,
    known: true,
    label: 'Managed by Relay',
  },
  closure: closure([c1031a]),
};

const rep1028: Issue = {
  key: 'REP-1028',
  summary: 'Annual gas safety check — rescheduled twice, record overdue',
  status: 'In progress', statusCategory: 'in-progress',
  assignee: people.daniel, reporter: people.priya,
  priority: 'Urgent', requestType: 'Compliance visit',
  location: '31 Harbour Walk, Flat 2A',
  updatedAt: ago(3),
  commitments: [c1028a],
  management: {
    state: 'managed',
    managed: true,
    unmanaged: false,
    initializing: false,
    known: true,
    label: 'Managed by Relay',
  },
  closure: closure([c1028a]),
};

const rep1024: Issue = {
  key: 'REP-1024',
  summary: 'Communal stairwell lighting failure — both landings',
  status: 'Done', statusCategory: 'done',
  assignee: people.tom, reporter: people.priya,
  priority: 'Low', requestType: 'Report a repair',
  location: 'Mill Row communal block',
  updatedAt: ago(24),
  commitments: [c1024a, c1024b],
  management: {
    state: 'managed',
    managed: true,
    unmanaged: false,
    initializing: false,
    known: true,
    label: 'Managed by Relay',
  },
  closure: closure([c1024a, c1024b]),
};

const rep1019: Issue = {
  key: 'REP-1019',
  summary: 'Boiler pressure loss — third visit, heat exchanger suspected',
  status: 'In progress', statusCategory: 'in-progress',
  assignee: people.daniel, reporter: people.tenant,
  priority: 'High', requestType: 'Report a repair',
  location: '5 Kiln Yard, Flat 4',
  updatedAt: ago(7),
  commitments: [c1019a],
  management: {
    state: 'managed',
    managed: true,
    unmanaged: false,
    initializing: false,
    known: true,
    label: 'Managed by Relay',
  },
  closure: closure([c1019a]),
};

export const fixtureWorkspace: Workspace = {
  id: 'ws-northgate',
  name: 'Northgate Housing',
  site: 'northgate.atlassian.net',
  plan: 'Repairs operations',
  viewer: people.maya,
  issues: [rep1042, rep1039, rep1031, rep1028, rep1024, rep1019],
  activity: [
    { id: 'a1', at: ago(0.4), type: 'closure_blocked', actor: null, issueKey: 'REP-1042', commitmentCode: null,
      summary: 'Closure blocked on REP-1042', detail: '2 unresolved commitments — 1 overdue, 1 without an owner.' },
    { id: 'a2', at: ago(1.1), type: 'reassigned', actor: people.priya, issueKey: 'REP-1028', commitmentCode: 'CM-108',
      summary: 'CM-108 reassigned to Daniel Reyes', detail: 'Priya Shah handed the CP12 to the engineer holding Friday’s slot.' },
    { id: 'a3', at: ago(2.3), type: 'captured', actor: null, issueKey: 'REP-1031', commitmentCode: 'CM-124',
      summary: 'Suggestion captured from a comment', detail: '“I’ll get the permanent replacement booked for the week of the 24th.”' },
    { id: 'a4', at: ago(5.5), type: 'accepted', actor: people.daniel, issueKey: 'REP-1039', commitmentCode: 'CM-121',
      summary: 'CM-121 accepted by Daniel Reyes', detail: 'Owner set, due in 5 working days.' },
    { id: 'a5', at: ago(9), type: 'verified', actor: people.priya, issueKey: 'REP-1042', commitmentCode: 'CM-112',
      summary: 'CM-112 verified', detail: 'Treatment invoice and photos logged.' },
    { id: 'a6', at: ago(26), type: 'verified', actor: people.maya, issueKey: 'REP-1024', commitmentCode: 'CM-098',
      summary: 'CM-098 verified', detail: 'Caretaker confirmed the overnight check at 07:12.' },
    { id: 'a7', at: ago(30), type: 'reassigned', actor: people.priya, issueKey: 'REP-1019', commitmentCode: 'CM-089',
      summary: 'CM-089 reassigned to Daniel Reyes', detail: 'Surveyor on leave; engineer took the pressure test.' },
    { id: 'a8', at: ago(40), type: 'closure_allowed', actor: people.maya, issueKey: 'REP-1024', commitmentCode: null,
      summary: 'Closure permitted on REP-1024', detail: 'All 2 commitments verified.' },
    { id: 'a9', at: ago(52), type: 'captured', actor: null, issueKey: 'REP-1019', commitmentCode: 'CM-089',
      summary: 'Suggestion captured from a comment', detail: '“We’ll run a 48-hour pressure test and report back before replacing anything.”' },
    { id: 'a10', at: ago(96), type: 'accepted', actor: people.maya, issueKey: 'REP-1042', commitmentCode: 'CM-112',
      summary: 'CM-112 accepted by Maya Okafor', detail: 'Owner set to Nadia Farouk.' },
  ] as ActivityEvent[],
  integrations: {
    jira: { connected: true, site: 'northgate.atlassian.net', project: 'REP', lastSync: ago(0.02) },
    enforcement: {
      validatorInstalled: true,
      conditionInstalled: true,
      conditionExpression: '(issue.customfield_10124 == "unmanaged") || (issue.customfield_10124 == "managed" && issue.customfield_10123 == 0)',
      field: {
        count: {
          which: 'count',
          moduleKey: 'relay-closure-count',
          name: 'Relay open commitments',
          type: 'number',
          typeId: 'ari:cloud:ecosystem::extension/00000000-0000-0000-0000-000000000000/fixture/static/relay-closure-count',
          id: 'customfield_10123',
          key: 'ari:cloud:ecosystem::extension/00000000-0000-0000-0000-000000000000/fixture/static/relay-closure-count__FIXTURE__relay-closure-count',
          resolved: true,
          resolvedAt: '2026-11-04T08:57:00.000Z',
          placeholder: 'customfield_relay_closure_count',
        },
        state: {
          which: 'state',
          moduleKey: 'relay-management-state',
          name: 'Relay management state',
          type: 'string',
          typeId: 'ari:cloud:ecosystem::extension/00000000-0000-0000-0000-000000000000/fixture/static/relay-management-state',
          id: 'customfield_10124',
          key: 'ari:cloud:ecosystem::extension/00000000-0000-0000-0000-000000000000/fixture/static/relay-management-state__FIXTURE__relay-management-state',
          resolved: true,
          resolvedAt: '2026-11-04T08:57:00.000Z',
          placeholder: 'customfield_relay_management_state',
        },
        resolved: true,
        expression: '(issue.customfield_10124 == "unmanaged") || (issue.customfield_10124 == "managed" && issue.customfield_10123 == 0)',
        manifestLine: `expression: '(issue.customfield_10124 == "unmanaged") || (issue.customfield_10124 == "managed" && issue.customfield_10123 == 0)'`,
      },
      fields: {
        count: {
          which: 'count', moduleKey: 'relay-closure-count', name: 'Relay open commitments', type: 'number',
          typeId: 'ari:cloud:ecosystem::extension/00000000-0000-0000-0000-000000000000/fixture/static/relay-closure-count',
          id: 'customfield_10123',
          key: 'ari:cloud:ecosystem::extension/00000000-0000-0000-0000-000000000000/fixture/static/relay-closure-count__FIXTURE__relay-closure-count',
          resolved: true, resolvedAt: '2026-11-04T08:57:00.000Z', placeholder: 'customfield_relay_closure_count',
        },
        state: {
          which: 'state', moduleKey: 'relay-management-state', name: 'Relay management state', type: 'string',
          typeId: 'ari:cloud:ecosystem::extension/00000000-0000-0000-0000-000000000000/fixture/static/relay-management-state',
          id: 'customfield_10124',
          key: 'ari:cloud:ecosystem::extension/00000000-0000-0000-0000-000000000000/fixture/static/relay-management-state__FIXTURE__relay-management-state',
          resolved: true, resolvedAt: '2026-11-04T08:57:00.000Z', placeholder: 'customfield_relay_management_state',
        },
      },
      fieldResolved: true,
      fieldId: 'customfield_10123',
      fieldKey: 'ari:cloud:ecosystem::extension/00000000-0000-0000-0000-000000000000/fixture/static/relay-closure-count__FIXTURE__relay-closure-count',
      fieldTypeId: 'ari:cloud:ecosystem::extension/00000000-0000-0000-0000-000000000000/fixture/static/relay-closure-count',
      manifestLine: `expression: '(issue.customfield_10124 == "unmanaged") || (issue.customfield_10124 == "managed" && issue.customfield_10123 == 0)'`,
      expressionApplied: null,
      customerTransitionsEnabled: true,
      portalNote:
        'The customer portal ignores validators. This workflow is gated by a Restrict transition condition reading Relay’s read-only closure field, so customer closure is restricted — without a custom message.',
    },
    capture: { autoCapture: true, confidenceThreshold: 0.7, requireOwner: true },
  },
};
