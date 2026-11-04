/**
 * The vertical slice, walked end to end.
 *
 * This is the twelve-step list from the brief, executed through the same handler
 * surface the Forge binding exposes, against a simulated Jira and an in-memory
 * storage that behaves like Forge KVS (eventually consistent reads, writes that
 * can be dropped). What it proves: the slice works as software. What it does not
 * prove: that Atlassian behaves as documented. Only a deployment does that.
 *
 * Step 12 of the live list — a customer attempting closure through the portal —
 * is not reachable from here: the portal path is a Jira expression, evaluated by
 * Jira, and cannot be simulated by calling Relay's own code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createHandlers } from '../src/handlers.js';
import { createClosureValidator } from '../src/workflow.js';
import { createFakeJira, createMemoryStorage, rawIssue, rawComment } from './support/fake-forge.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');
const ctx = {
  accountId: 'acc-maya',
  account: { displayName: 'Maya Okafor' },
  siteUrl: 'https://onepes930.atlassian.net',
  extension: { issue: { key: 'FS-101' } },
};

function site({ failProjection = false } = {}) {
  const storage = createMemoryStorage();
  const fake = createFakeJira({
    issue: rawIssue(),
    comments: [
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
  return { storage, fake };
}

const handlersOn = (fake, storage, now = () => NOW) =>
  createHandlers({ jira: fake.jira, storage, now, log: () => {} });

/** The Forge-side validator, reading the same storage the resolvers wrote. */
const validatorOn = (storage) =>
  createClosureValidator({
    readLedger: async (key) => (await storage.get(`relay:ledger:${key}`)) ?? null,
    log: () => {},
  });

test('the whole slice: read, capture, accept, persist, enforce, verify, close', async () => {
  const { storage, fake } = site();
  const h = handlersOn(fake, storage);

  // 1. Load a real issue and check it is the one asked for.
  const boot = await h.bootstrap({ context: ctx });
  const loaded = boot.workspace.issues[0];
  assert.equal(loaded.key, 'FS-101');
  assert.equal(loaded.summary, 'Kitchen extractor fan not working');
  assert.equal(loaded.status, 'In Progress');
  assert.equal(loaded.assignee.name, 'Maya Okafor');
  assert.equal(loaded.assignee.id, 'acc-maya');
  assert.equal(loaded.assignee.name, 'Maya Okafor');
  assert.equal(loaded.commitments.length, 0, 'reading a case invents no commitments');

  // The site is configured with a numeric condition field, as a real
  // installation would be, so the field is written on every mutation.
  await h['relay.settings.set']({ payload: { openFieldId: 'customfield_10077' }, context: ctx });

  // 2. Extract a candidate with exact evidence from real comment text.
  const scan = await h['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });
  assert.equal(scan.created.length, 1);
  const code = scan.created[0].code;
  const candidate = scan.issue.commitments.find((c) => c.code === code);
  assert.equal(candidate.status, 'proposed');
  assert.equal(candidate.evidence.commentId, 'c-1042-3');
  assert.equal(candidate.evidence.author.name, 'Tom Whitfield');
  assert.ok(candidate.evidence.quote.length > 20);
  assert.ok(candidate.evidence.body.includes(candidate.evidence.quote));

  // 3. A suggestion is not a commitment, but it does fail closed: nobody has
  //    decided yet, so closure stays shut and the reason says why. The decision
  //    that opens it is a person's, not the extractor's.
  assert.equal(candidate.status, 'proposed');
  assert.equal(scan.issue.closure.awaitingReview, 1);
  assert.equal(scan.issue.closure.ready, false);
  assert.match(scan.issue.closure.validatorMessage, /awaiting review/i);

  // 4. A person accepts it. That is the first thing that blocks closure.
  const acceptedIssue = await h['relay.capture.accept']({
    payload: { key: 'FS-101', code, owner: { id: 'acc-tom', name: 'Tom Whitfield' } },
    context: ctx,
  });
  const accepted = acceptedIssue.commitments.find((c) => c.code === code);
  assert.equal(accepted.status, 'open');
  assert.equal(acceptedIssue.closure.blockingCount, 1);
  assert.equal(acceptedIssue.closure.awaitingReview, 0, 'the suggestion has been decided');
  assert.equal(acceptedIssue.closure.ready, false);
  assert.equal(fake.field.value, 1, 'the condition field counts the open commitment');

  // 5. It persists: a fresh process reading the same storage sees it.
  const reloaded = handlersOn(fake, storage, () => new Date('2026-11-04T10:00:00.000Z'));
  const after = await reloaded.bootstrap({ context: ctx });
  const persisted = after.workspace.issues[0].commitments.find((c) => c.code === code);
  assert.ok(persisted, 'the commitment survives a reload');
  assert.equal(persisted.status, 'open');
  assert.equal(persisted.owner.name, 'Tom Whitfield');
  assert.equal(persisted.evidence.commentId, 'c-1042-3', 'evidence survives with it');
  assert.equal(after.workspace.issues[0].closure.ready, false);

  // 6. It appears in the case workspace with the rest of the case.
  assert.equal(after.workspace.issues[0].key, 'FS-101');
  assert.ok(after.workspace.activity.some((a) => a.commitmentCode === code), 'the decision is in the trail');

  // 7. The gate refuses closure, and says why.
  const blocked = await reloaded['relay.enforcement.check']({ payload: { key: 'FS-101' }, context: ctx });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.counts.open, 1);
  assert.ok(blocked.message && /unresolved commitment/i.test(blocked.message));

  // The Forge workflow validator, reading the same ledger, refuses for the same reason.
  const validator = validatorOn(storage);
  const refusal = await validator({ issue: { key: 'FS-101' } });
  assert.equal(refusal.result, false);
  assert.match(refusal.errorMessage, /unresolved commitment/i);

  // 8. Ownership changes hands without losing the handover trail.
  const handedIssue = await reloaded['relay.commitment.reassign']({
    payload: { key: 'FS-101', code, owner: { id: 'acc-maya', name: 'Maya Okafor' }, reason: 'Maya has the supplier thread.' },
    context: ctx,
  });
  const handed = handedIssue.commitments.find((c) => c.code === code);
  assert.equal(handed.owner.id, 'acc-maya');
  assert.equal(handed.previousOwners.length, 1, 'the handover is on the record');
  assert.equal(handed.previousOwners[0].from.name, 'Tom Whitfield');
  assert.equal(handed.status, 'open', 'a handover does not settle anything');

  // 9. Verification settles it, and both layers come back into step.
  const verifiedIssue = await reloaded['relay.commitment.verify']({
    payload: { key: 'FS-101', code, note: 'Supplier confirmed dispatch; tenant notified.' },
    context: ctx,
  });
  const verified = verifiedIssue.commitments.find((c) => c.code === code);
  assert.equal(verified.status, 'verified');
  assert.equal(verifiedIssue.closure.blockingCount, 0);
  assert.equal(verifiedIssue.closure.ready, true);
  assert.equal(verifiedIssue.closure.projection.value.open, 0, 'the projection was rewritten');
  assert.equal(verifiedIssue.closure.projection.stale, false);
  assert.equal(fake.field.value, 0, 'the condition field was cleared with the ledger');

  // 10. The validator now lets the transition through.
  assert.deepEqual(await validator({ issue: { key: 'FS-101' } }), { result: true });

  // 11. The condition field, where the site has been configured with one, agrees.
  assert.equal(fake.field.value, 0, 'the numeric condition field reads zero when the ledger is clear');

  // 12. The ledger is the authority: it records every decision, in order.
  const ledger = await storage.get('relay:ledger:FS-101');
  assert.equal(ledger.rev >= 4, true);

  // The decision history is the audit stream, ordered by revision.
  const audit = await storage.get('relay:audit:FS-101');
  assert.deepEqual(
    audit.events.map((e) => e.type),
    ['verified', 'reassigned', 'accepted', 'captured'],
    'newest first: every decision is on the record, and the capture is the oldest',
  );
  assert.equal(audit.events[0].commitmentCode, code);
  assert.equal(ledger.commitments[0].evidence.commentId, 'c-1042-3');
  assert.equal(ledger.commitments[0].evidence.start < ledger.commitments[0].evidence.end, true);
});

test('rejecting an unreviewed candidate releases the case, with the reason on the record', async () => {
  const { storage, fake } = site();
  const h = handlersOn(fake, storage);

  await h.bootstrap({ context: ctx });
  const scan = await h['relay.capture.scan']({ payload: { key: 'FS-101' }, context: ctx });
  const code = scan.created[0].code;
  assert.equal(scan.issue.closure.ready, false, 'an unreviewed suggestion fails closed');

  // A short reason is refused: a rejection has to be explainable later.
  await assert.rejects(
    () => h['relay.capture.reject']({ payload: { key: 'FS-101', code, reason: 'no' }, context: ctx }),
    /reason_required/,
  );

  const issue = await h['relay.capture.reject']({
    payload: { key: 'FS-101', code, reason: 'The extractor is a different trade; no promise was made here.' },
    context: ctx,
  });
  const rejected = issue.commitments.find((c) => c.code === code);
  assert.equal(rejected.status, 'dropped');
  assert.match(rejected.droppedReason, /no promise was made here/);
  assert.equal(issue.closure.ready, true);
  assert.equal(issue.closure.awaitingReview, 0);

  // Both layers agree, and the guard the mutation wrote was cleared again.
  assert.deepEqual(await validatorOn(storage)({ issue: { key: 'FS-101' } }), { result: true });
  assert.equal(fake.properties.get('FS-101').open, 0);
  assert.equal(await storage.get('relay:ledger:FS-101').then((l) => l.rev >= 2), true, 'captured, then rejected');
});
