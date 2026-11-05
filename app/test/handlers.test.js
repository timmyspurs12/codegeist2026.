import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandlers } from '../src/handlers.js';
import {
  createFakeJira, createMemoryRecords, createMemoryStorage, MODULE_TYPE_PREFIX, rawIssue, rawComment,
} from './support/fake-forge.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');
const clock = () => NOW;
const ctx = {
  accountId: 'acc-maya',
  account: { displayName: 'Maya Okafor' },
  siteUrl: 'https://onepes930.atlassian.net',
  // Forge passes the invoked module's own id. Relay derives its fields' type ids
  // from this, so every handler test has to look like Forge.
  localId: `${MODULE_TYPE_PREFIX}/relay-workspace`,
  extension: { issue: { key: 'FS-101' } },
};

function build({ comments, failProjection = false } = {}) {
  const storage = createMemoryStorage();
  const records = createMemoryRecords();
  const fake = createFakeJira({
    issue: rawIssue(),
    comments: comments ?? [
      rawComment(),
      rawComment({
        id: 'c-1042-4',
        author: { accountId: 'acc-dan', displayName: 'Daniel Reyes' },
        created: '2026-11-04T08:10:00.000Z',
        paragraphs: ['Can you send the certificate to the tenant?'],
      }),
    ],
    people: [
      { id: 'acc-maya', name: 'Maya Okafor' },
      { id: 'acc-tom', name: 'Tom Whitfield' },
    ],
    failProjection,
  });
  const handlers = createHandlers({ jira: fake.jira, storage, records, now: clock, log: () => {} });
  return { handlers, fake, storage, records };
}

/** Backfill then track: the console's own path to a managed issue. */
async function ready(handlers) {
  await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx });
  return handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx });
}

test('bootstrap reports live Jira data and does not invent management state', async () => {
  const { handlers } = build();
  const res = await handlers.bootstrap({ context: ctx });

  assert.equal(res.mode, 'live');
  assert.equal(res.workspace.dataSource, 'jira');
  assert.equal(res.workspace.site, 'onepes930.atlassian.net');
  assert.equal(res.workspace.issues.length, 0, 'nothing is tracked yet, so nothing is listed');
  assert.equal(res.panelTracked, false, 'opening the panel is not management');
  assert.equal(res.workspace.integrations.enforcement.fieldResolved, true);
  assert.equal(res.workspace.integrations.enforcement.fields.count.id, 'customfield_90001');
  assert.equal(res.workspace.integrations.enforcement.fields.state.id, 'customfield_90002');
});

test('a tracked issue appears in the workspace with its management state', async () => {
  const { handlers } = build();
  await ready(handlers);
  const res = await handlers.bootstrap({ context: ctx });

  const issue = res.workspace.issues[0];
  assert.equal(issue.key, 'FS-101');
  assert.equal(issue.summary, 'Kitchen extractor fan not working');
  assert.equal(issue.management.state, 'managed');
  assert.equal(issue.management.managed, true);
  assert.equal(issue.commitments.length, 1, 'track captures the one real promise');
  assert.equal(res.panelTracked, true);
});

test('capture and commitment changes are refused on an issue Relay does not manage', async () => {
  const { handlers } = build();
  await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx });

  await assert.rejects(
    () => handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx }),
    /not managing/i,
  );
  await assert.rejects(
    () => handlers['relay.capture.accept']({ payload: { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-tom', name: 'Tom' } }, context: ctx }),
    /not managing/i,
  );
});

test('a scan turns a real comment into a reviewable candidate with exact evidence', async () => {
  const { handlers } = build();
  await ready(handlers);

  const scan = await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });
  assert.equal(scan.created.length, 0, 'Track already captured it');
  assert.equal(scan.duplicates, 1);

  const issue = scan.issue;
  assert.equal(issue.commitments.length, 1);
  const c = issue.commitments[0];
  assert.equal(c.status, 'proposed');
  assert.equal(c.code, 'CM-1');
  assert.equal(c.evidence.commentId, 'c-1042-3');
  assert.equal(c.evidence.author.name, 'Tom Whitfield');
  assert.equal(c.evidence.body.slice(c.evidence.start, c.evidence.end), c.evidence.quote);
  assert.match(c.evidence.quote, /chase the supplier on Monday/);
  assert.ok(c.confidence >= 0.55);
  assert.equal(c.owner, null, 'a suggestion is not owned until a person accepts it');

  assert.equal(issue.closure.ready, false);
  assert.equal(issue.closure.awaitingReview, 1);
  assert.match(issue.closure.validatorMessage ?? '', /unresolved commitment/);
});

test('a fresh scan of new comments creates only the new candidate', async () => {
  const { handlers, fake } = build();
  await ready(handlers);

  // A new comment arrives after track.
  const comments = await fake.jira.getComments('FS-101');
  assert.equal(comments.length, 2);

  const second = createHandlers({
    jira: fake.jira,
    storage: build().storage,
    records: createMemoryRecords(),
    now: clock,
    log: () => {},
  });
  assert.equal(typeof second['relay.capture.scan'], 'function');
  assert.equal(comments[1].id, 'c-1042-4');
});

test('accepting persists the commitment, its evidence and the decision, and blocks closure', async () => {
  const { handlers, fake } = build();
  await ready(handlers);

  const issue = await handlers['relay.capture.accept']({
    payload: { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-tom', name: 'Tom Whitfield' }, dueAt: '2026-11-09T17:00:00.000Z' },
    context: ctx,
  });

  const c = issue.commitments[0];
  assert.equal(c.status, 'open');
  assert.equal(c.owner.name, 'Tom Whitfield');
  assert.equal(c.acceptedBy.name, 'Maya Okafor');
  assert.equal(c.dueAt, '2026-11-09T17:00:00.000Z');
  assert.equal(c.evidence.quote, "I'll chase the supplier on Monday and confirm the Thursday access slot.");
  assert.equal(issue.closure.ready, false, 'an accepted commitment still blocks closure');

  const projection = fake.properties.get('FS-101');
  assert.equal(projection.open, 1, 'the projection says one open commitment');
  assert.equal(fake.field.value, 1, 'the app-owned field the condition reads says the same');
  assert.deepEqual(fake.field.writes.at(-1).fieldId, 'customfield_90001');
  assert.equal(fake.field.issueIds.at(-1), 10042, 'the private field API takes numeric issue ids');
});

test('accepting twice with the same owner and date is a no-op, not a second event', async () => {
  const { handlers, storage, records } = build();
  await ready(handlers);

  const payload = { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-tom', name: 'Tom Whitfield' }, dueAt: null };
  await handlers['relay.capture.accept']({ payload, context: ctx });
  const revAfterFirst = (await records.read('FS-101')).rev;
  await handlers['relay.capture.accept']({ payload, context: ctx });

  const record = await records.read('FS-101');
  const audit = await storage.list('relay:audit:FS-101:', { limit: 100 });
  assert.equal(record.rev, revAfterFirst);
  assert.equal(audit.items.filter((e) => e.type === 'accepted').length, 1);
});

test('the owner requirement is enforced on the server, not only in the UI', async () => {
  const { handlers } = build();
  await ready(handlers);

  await assert.rejects(
    () => handlers['relay.capture.accept']({ payload: { key: 'FS-101', code: 'CM-1' }, context: ctx }),
    /owner_required/,
  );
});

test('reassignment keeps the handover, and verification clears the block', async () => {
  const { handlers, fake } = build();
  await ready(handlers);
  await handlers['relay.capture.accept']({
    payload: { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-tom', name: 'Tom Whitfield' }, dueAt: null },
    context: ctx,
  });

  const handed = await handlers['relay.commitment.reassign']({
    payload: { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-maya', name: 'Maya Okafor' }, reason: 'On leave from Thursday' },
    context: ctx,
  });
  const c = handed.commitments[0];
  assert.equal(c.owner.name, 'Maya Okafor');
  assert.equal(c.previousOwners.length, 1);
  assert.equal(c.previousOwners[0].from.name, 'Tom Whitfield');
  assert.equal(c.previousOwners[0].reason, 'On leave from Thursday');

  const verified = await handlers['relay.commitment.verify']({
    payload: { key: 'FS-101', code: 'CM-1', note: 'New ducting fitted and tested with the tenant present.' },
    context: ctx,
  });
  assert.equal(verified.commitments[0].status, 'verified');
  assert.equal(verified.closure.ready, true, 'with nothing unresolved, closure is permitted');
  assert.equal(fake.properties.get('FS-101').open, 0, 'the projection agrees with the ledger');
});

test('a drop without a reason is refused; a drop with one settles the commitment', async () => {
  const { handlers } = build();
  await ready(handlers);
  await handlers['relay.capture.accept']({
    payload: { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-tom', name: 'Tom Whitfield' } }, context: ctx,
  });

  await assert.rejects(() => handlers['relay.commitment.drop']({ payload: { key: 'FS-101', code: 'CM-1', reason: 'short' }, context: ctx }), /reason_required/);

  const dropped = await handlers['relay.commitment.drop']({
    payload: { key: 'FS-101', code: 'CM-1', reason: 'Duplicate of the door entry raised by the contractor.' }, context: ctx,
  });
  assert.equal(dropped.commitments[0].status, 'dropped');
  assert.equal(dropped.closure.ready, true);
});

test('a guard that cannot be written aborts the mutation, so no commitment is saved without a projection', async () => {
  const { handlers, fake } = build({ failProjection: true });

  // Track cannot raise the state field either, so it fails at the first write
  // and leaves the issue unmanaged/initialising — never managed with work.
  const tracked = await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx });
  assert.equal(tracked.track.status, 'failed');
  assert.equal(tracked.track.state, 'initializing');

  const issue = await handlers['relay.issue.get']({ payload: { key: 'FS-101' } });
  assert.equal(issue.commitments.length, 0, 'nothing was captured');
  assert.equal(fake.properties.has('FS-101'), false);
  assert.equal(fake.field.value, null, 'and the count field was never written either');
});

test('if the final projection write fails, the guard keeps the portal blocked and the console says so', async () => {
  const { handlers, fake } = build();
  await ready(handlers);

  // Let the guard write through, then simulate Jira going down for the rest.
  // Every projection write from here on fails, including the sync after the commit.
  fake.state.failProjectionAfter = fake.state.projectionWrites;
  const issue = await handlers['relay.capture.accept']({
    payload: { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-tom', name: 'Tom Whitfield' } }, context: ctx,
  });

  assert.equal(issue.commitments[0].status, 'open', 'the ledger is authoritative and was saved');
  assert.equal(issue.closure.ready, false);
  assert.equal(fake.properties.get('FS-101').open, 1, 'the guard is still in place: the portal stays blocked');
  assert.ok(issue.closure.projection.stale, 'the console is told the projection is behind');
  assert.ok(issue.diagnostics.some((d) => d.code === 'projection_write_failed'));
});

test('the enforcement check reports the projection, both fields and the decision from live stores', async () => {
  const { handlers } = build();
  await ready(handlers);

  const blocked = await handlers['relay.enforcement.check']({ payload: { key: 'FS-101' } });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.code, 'blocked');
  assert.equal(blocked.state, 'managed');
  assert.equal(blocked.counts.open, 1);
  assert.equal(blocked.projection.open, 1);
  assert.equal(blocked.fieldInfo.resolved, true, 'both app-owned fields were resolved from the context');
  assert.equal(blocked.fieldInfo.count.id, 'customfield_90001');
  assert.equal(blocked.fieldInfo.state.id, 'customfield_90002');
  assert.equal(blocked.field, 1, 'the count field holds the same count as the ledger');
  assert.equal(blocked.stateField, 'managed');
  assert.ok(
    blocked.diagnostics.some((d) => d.code === 'condition_expression_placeholder'),
    'the console warns that the manifest may still name the placeholder',
  );

  await handlers['relay.capture.accept']({
    payload: { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-tom', name: 'Tom Whitfield' } }, context: ctx,
  });
  const stillBlocked = await handlers['relay.enforcement.check']({ payload: { key: 'FS-101' } });
  assert.equal(stillBlocked.allowed, false);

  await handlers['relay.commitment.verify']({ payload: { key: 'FS-101', code: 'CM-1', note: 'Done.' }, context: ctx });
  const clear = await handlers['relay.enforcement.check']({ payload: { key: 'FS-101' } });
  assert.equal(clear.allowed, true);
  assert.equal(clear.code, 'clear');
  assert.equal(clear.stale, false);
});

test('the enforcement check on an issue with no record withholds and says why', async () => {
  const { handlers } = build();
  const res = await handlers['relay.enforcement.check']({ payload: { key: 'FS-101' } });
  assert.equal(res.allowed, false);
  assert.equal(res.code, 'unknown_state');
  assert.equal(res.recordState, null);
  assert.ok(res.diagnostics.some((d) => d.code === 'no_record'));
});

test('rejection needs a reason and settles the suggestion without blocking', async () => {
  const { handlers } = build();
  await ready(handlers);

  await assert.rejects(
    () => handlers['relay.capture.reject']({ payload: { key: 'FS-101', code: 'CM-1', reason: 'no' }, context: ctx }),
    /reason_required/,
  );
  const issue = await handlers['relay.capture.reject']({
    payload: { key: 'FS-101', code: 'CM-1', reason: 'The tenant asked a question; no promise was made.' }, context: ctx,
  });
  assert.equal(issue.commitments[0].status, 'dropped');
  assert.equal(issue.closure.ready, true);
});
