import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandlers } from '../src/handlers.js';
import { createFakeJira, createMemoryStorage, MODULE_TYPE_PREFIX, rawIssue, rawComment } from './support/fake-forge.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');
const clock = () => NOW;
const ctx = {
  accountId: 'acc-maya',
  account: { displayName: 'Maya Okafor' },
  siteUrl: 'https://onepes930.atlassian.net',
  // Forge passes the invoked module's own id. Relay derives its closure
  // field's type id from this, so every handler test has to look like Forge.
  localId: `${MODULE_TYPE_PREFIX}/relay-workspace`,
};

function build({ comments, failProjection = false } = {}) {
  const storage = createMemoryStorage();
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
  const handlers = createHandlers({ jira: fake.jira, storage, now: clock, log: () => {} });
  return { handlers, fake, storage };
}

test('bootstrap on the issue panel tracks that issue and returns real Jira fields', async () => {
  const { handlers } = build();
  const res = await handlers.bootstrap({ context: { ...ctx, extension: { issue: { key: 'FS-101' } } } });

  assert.equal(res.mode, 'live');
  assert.equal(res.workspace.dataSource, 'jira');
  assert.equal(res.workspace.site, 'onepes930.atlassian.net');
  assert.equal(res.workspace.issues.length, 1);

  const issue = res.workspace.issues[0];
  assert.equal(issue.key, 'FS-101');
  assert.equal(issue.summary, 'Kitchen extractor fan not working');
  assert.equal(issue.status, 'In Progress');
  assert.equal(issue.assignee.name, 'Maya Okafor');
  assert.equal(issue.commitments.length, 0, 'no commitment is invented from a comment');
  assert.equal(issue.closure.ready, true, 'nothing captured yet, so nothing blocks');
});

test('a scan turns a real comment into a reviewable candidate with exact evidence', async () => {
  const { handlers } = build();
  await handlers.bootstrap({ context: { ...ctx, extension: { issue: { key: 'FS-101' } } } });

  const scan = await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  assert.equal(scan.created.length, 1, 'the question in the second comment is not a promise');
  assert.equal(scan.issue.commitments.length, 1);

  const c = scan.issue.commitments[0];
  assert.equal(c.status, 'proposed');
  assert.equal(c.code, 'CM-1');
  assert.equal(c.evidence.commentId, 'c-1042-3');
  assert.equal(c.evidence.author.name, 'Tom Whitfield');
  assert.equal(c.evidence.body.slice(c.evidence.start, c.evidence.end), c.evidence.quote);
  assert.match(c.evidence.quote, /chase the supplier on Monday/);
  assert.ok(c.confidence >= 0.55);
  assert.equal(c.owner, null, 'a suggestion is not owned until a person accepts it');

  const issue = scan.issue;
  assert.equal(issue.closure.ready, false);
  assert.equal(issue.closure.awaitingReview, 1);
  assert.match(issue.closure.validatorMessage ?? '', /unresolved commitment/);
});

test('scanning the same comments twice creates nothing the second time', async () => {
  const { handlers, storage } = build();
  await handlers.bootstrap({ context: { ...ctx, extension: { issue: { key: 'FS-101' } } } });

  const first = await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });
  const revAfterFirst = (await storage.get('relay:ledger:FS-101')).rev;
  const second = await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  assert.equal(first.created.length, 1);
  assert.equal(second.created.length, 0);
  assert.equal(second.duplicates, 1);
  assert.equal((await storage.get('relay:ledger:FS-101')).rev, revAfterFirst, 'a duplicate scan is a no-op');
  assert.equal(second.issue.commitments.length, 1);
});

test('accepting persists the commitment, its evidence and the decision, and blocks closure', async () => {
  const { handlers, fake } = build();
  await handlers.bootstrap({ context: { ...ctx, extension: { issue: { key: 'FS-101' } } } });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

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
  const { handlers, storage } = build();
  await handlers.bootstrap({ context: { ...ctx, extension: { issue: { key: 'FS-101' } } } });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  const payload = { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-tom', name: 'Tom Whitfield' }, dueAt: null };
  await handlers['relay.capture.accept']({ payload, context: ctx });
  const revAfterFirst = (await storage.get('relay:ledger:FS-101')).rev;
  await handlers['relay.capture.accept']({ payload, context: ctx });

  const ledger = await storage.get('relay:ledger:FS-101');
  const audit = await storage.get('relay:audit:FS-101');
  assert.equal(ledger.rev, revAfterFirst);
  assert.equal(audit.events.filter((e) => e.type === 'accepted').length, 1);
});

test('the owner requirement is enforced on the server, not only in the UI', async () => {
  const { handlers } = build();
  await handlers.bootstrap({ context: { ...ctx, extension: { issue: { key: 'FS-101' } } } });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  await assert.rejects(
    () => handlers['relay.capture.accept']({ payload: { key: 'FS-101', code: 'CM-1' }, context: ctx }),
    /owner_required/,
  );
});

test('reassignment keeps the handover, and verification clears the block', async () => {
  const { handlers, fake } = build();
  await handlers.bootstrap({ context: { ...ctx, extension: { issue: { key: 'FS-101' } } } });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });
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
  await handlers.bootstrap({ context: { ...ctx, extension: { issue: { key: 'FS-101' } } } });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });
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

test('a guard that cannot be written aborts the mutation, so no commitment exists without a projection', async () => {
  const { handlers, fake } = build({ failProjection: true });
  await handlers.bootstrap({ context: { ...ctx, extension: { issue: { key: 'FS-101' } } } });

  // A suggestion counts as unresolved, so the scan raises the open count and
  // must project it. The projection is down, so the scan aborts instead of
  // leaving a case that the portal would read as clear.
  await assert.rejects(
    () => handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx }),
    /issue properties/,
  );

  const ledger = await handlers['relay.issue.get']({ payload: { key: 'FS-101' } });
  assert.equal(ledger.commitments.length, 0, 'nothing was captured');
  assert.equal(fake.properties.has('FS-101'), false);
  assert.equal(fake.field.value, null, 'and the field was never written either');
});

test('if the final projection write fails, the guard keeps the portal blocked and the console says so', async () => {
  const { handlers, fake } = build();
  await handlers.bootstrap({ context: { ...ctx, extension: { issue: { key: 'FS-101' } } } });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  // Let the guard write through, then simulate Jira going down for the rest.
  fake.state.failProjectionAfter = 1;
  const issue = await handlers['relay.capture.accept']({
    payload: { key: 'FS-101', code: 'CM-1', owner: { id: 'acc-tom', name: 'Tom Whitfield' } }, context: ctx,
  });

  assert.equal(issue.commitments[0].status, 'open', 'the ledger is authoritative and was saved');
  assert.equal(issue.closure.ready, false);
  assert.equal(fake.properties.get('FS-101').open, 1, 'the guard is still in place: the portal stays blocked');
  assert.ok(issue.closure.projection.stale, 'the console is told the projection is behind');
});

test('the enforcement check reports the projection, the field and the decision from live stores', async () => {
  const { handlers } = build();
  await handlers.bootstrap({ context: { ...ctx, extension: { issue: { key: 'FS-101' } } } });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

  const blocked = await handlers['relay.enforcement.check']({ payload: { key: 'FS-101' } });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.code, 'blocked');
  assert.equal(blocked.counts.open, 1);
  assert.equal(blocked.projection.open, 1);
  assert.equal(blocked.fieldInfo.resolved, true, 'the app-owned field was resolved from the context');
  assert.equal(blocked.fieldInfo.id, 'customfield_90001');
  assert.equal(blocked.field, 1, 'the field holds the same count as the ledger');
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

test('rejection needs a reason and settles the suggestion without blocking', async () => {
  const { handlers } = build();
  await handlers.bootstrap({ context: { ...ctx, extension: { issue: { key: 'FS-101' } } } });
  await handlers['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });

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
