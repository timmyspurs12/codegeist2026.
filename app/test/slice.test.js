/**
 * The vertical slice, walked end to end — now including the management
 * lifecycle that P2.2 adds.
 *
 * This is the brief's list, executed through the same handler surface the Forge
 * binding exposes, against a simulated Jira and an in-memory record store that
 * implements conditional commits. What it proves: the slice works as software.
 * What it does not prove: that Atlassian behaves as documented. Only a
 * deployment does that.
 *
 * The portal path is a Jira expression, evaluated by Jira; it cannot be
 * simulated by calling Relay's own code. The evaluator in `field.js` mirrors it
 * for the state matrix (see `field.test.js`), and the deployment steps are in
 * `docs/P2.2-RUNBOOK.md`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createHandlers } from '../src/handlers.js';
import { createClosureValidator } from '../src/workflow.js';
import { orderEvents } from '../src/audit.js';
import {
  createFakeJira, createMemoryRecords, createMemoryStorage, MODULE_TYPE_PREFIX, rawIssue, rawComment,
} from './support/fake-forge.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');
const ctx = {
  accountId: 'acc-maya',
  account: { displayName: 'Maya Okafor' },
  siteUrl: 'https://onepes930.atlassian.net',
  localId: `${MODULE_TYPE_PREFIX}/relay-workspace`,
  extension: { issue: { key: 'FS-101' } },
};

function site({ failProjection = false } = {}) {
  const storage = createMemoryStorage();
  const records = createMemoryRecords();
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
  return { storage, records, fake };
}

const handlersOn = (fake, storage, records, now = () => NOW) =>
  createHandlers({ jira: fake.jira, storage, records, now, log: () => {} });

/** The Forge-side validator, reading the same record store the resolvers wrote. */
const validatorOn = (records) =>
  createClosureValidator({ readLedger: (key) => records.read(key), log: () => {} });

test('the whole slice: backfill, track, capture, accept, verify, enforce, untrack', async () => {
  const { storage, records, fake } = site();
  const h = handlersOn(fake, storage, records);

  // 1. An issue with no record is withheld. Nothing has been recorded, so Relay
  //    has no management state — and "no state" is not "unmanaged".
  const boot = await h.bootstrap({ context: ctx });
  assert.equal(boot.workspace.issues.length, 0, 'nothing is tracked yet');
  const validator = validatorOn(records);
  const unknown = await validator({ issue: { key: 'FS-101' } });
  assert.equal(unknown.result, false);
  assert.match(unknown.errorMessage, /backfill/i);

  // 2. Backfill records the project's existing issues as unmanaged, and writes
  //    the state field so the condition and the record agree.
  const backfill = await h['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx });
  assert.deepEqual(backfill.initialised, ['FS-101']);
  assert.equal(backfill.done, true);
  assert.equal(fake.stateField.value, 'unmanaged');
  assert.equal(fake.field.value, 0);
  assert.equal(backfill.fields.resolved, true, 'both app-owned fields resolved for this environment');

  // 3. An unmanaged issue is permitted on both paths — which is the point of
  //    the second field: Relay must not block work it does not manage.
  assert.deepEqual(await validator({ issue: { key: 'FS-101' } }), { result: true });

  // 4. Track: the lifecycle runs, captures real comment text, and settles as
  //    managing the issue. The suggestion is unresolved, so closure is withheld.
  const tracked = await h['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx });
  assert.equal(tracked.track.status, 'managed');
  assert.equal(tracked.track.created.length, 1);
  const code = tracked.track.created[0].code;
  const issue = tracked.workspace.issues.find((i) => i.key === 'FS-101');
  assert.equal(issue.management.state, 'managed');
  assert.equal(issue.closure.ready, false, 'an unreviewed suggestion fails closed');
  assert.equal(issue.closure.awaitingReview, 1);
  assert.equal(fake.stateField.value, 'managed');
  assert.equal(fake.field.value, 1, 'the count field counts the open suggestion');

  const refusal = await validator({ issue: { key: 'FS-101' } });
  assert.equal(refusal.result, false);
  assert.match(refusal.errorMessage, /awaiting review/i);

  // 5. A person accepts it: the promise is now owned and due, and the field
  //    still holds one.
  const acceptedIssue = await h['relay.capture.accept']({
    payload: { key: 'FS-101', code, owner: { id: 'acc-tom', name: 'Tom Whitfield' } },
    context: ctx,
  });
  const accepted = acceptedIssue.commitments.find((c) => c.code === code);
  assert.equal(accepted.status, 'open');
  assert.equal(acceptedIssue.closure.blockingCount, 1);
  assert.equal(fake.field.value, 1);

  // 6. Verification settles it and both layers come back into step.
  const verifiedIssue = await h['relay.commitment.verify']({
    payload: { key: 'FS-101', code, note: 'Supplier confirmed dispatch; tenant notified.' },
    context: ctx,
  });
  assert.equal(verifiedIssue.closure.blockingCount, 0);
  assert.equal(verifiedIssue.closure.ready, true);
  assert.equal(fake.field.value, 0, 'the count field was cleared with the record');
  assert.equal(fake.stateField.value, 'managed');

  // 7. The validator now lets the transition through for the same reason.
  assert.deepEqual(await validator({ issue: { key: 'FS-101' } }), { result: true });

  // 8. The record is the authority, and it is read back from the conditional
  //    store — not from an in-memory copy.
  const record = await records.read('FS-101');
  assert.ok(record.rev >= 3);
  assert.equal(record.commitments[0].evidence.commentId, 'c-1042-3');

  // 9. The trail is append-only: one key per event, newest first.
  const audit = await storage.list('relay:audit:FS-101:', { limit: 50 });
  // One key per event: the trail is the set of decisions, not a rewritten array.
  assert.deepEqual([...new Set(orderEvents(audit.items).map((e) => e.type))].sort(), ['accepted', 'captured', 'tracked', 'verified']);

  // 10. Offboarding requires confirmation, names what it leaves behind, and
  //     only then moves both sides to unmanaged.
  const preview = await h['relay.workspace.untrack']({ payload: { key: 'FS-101' }, context: ctx });
  assert.equal(preview.untrack.status, 'confirmation_required');
  assert.equal(preview.untrack.requiresConfirmation, true);
  assert.equal(preview.untrack.state, 'managed', 'nothing changed without confirmation');

  const done = await h['relay.workspace.untrack']({
    payload: { key: 'FS-101', confirm: true, reason: 'Customer migrated to a new request.' },
    context: ctx,
  });
  assert.equal(done.untrack.status, 'unmanaged');
  assert.equal(fake.stateField.value, 'unmanaged');
  assert.equal((await records.read('FS-101')).state, 'unmanaged');
  assert.deepEqual(await validator({ issue: { key: 'FS-101' } }), { result: true });
  const trail = (await storage.list('relay:audit:FS-101:', { limit: 50 })).items;
  assert.ok(trail.some((e) => e.type === 'untracked'), 'the offboarding is on the record');
});

test('rejecting an unreviewed candidate releases the case, with the reason on the record', async () => {
  const { storage, records, fake } = site();
  const h = handlersOn(fake, storage, records);

  await h['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx });
  const tracked = await h['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx });
  const code = tracked.track.created[0].code;

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
  assert.equal(fake.field.value, 0);
  assert.deepEqual(await validatorOn(records)({ issue: { key: 'FS-101' } }), { result: true });
});

test('a capture that cannot read comments leaves the issue initialising, not open', async () => {
  const { storage, records, fake } = site();
  fake.state.commentsFail = true;
  const h = handlersOn(fake, storage, records);

  await h['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx });
  const tracked = await h['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx });

  assert.equal(tracked.track.status, 'failed');
  assert.equal(tracked.track.stage, 'capture');
  assert.equal((await records.read('FS-101')).state, 'initializing');
  assert.equal(fake.stateField.value, 'initializing');
  const res = await validatorOn(records)({ issue: { key: 'FS-101' } });
  assert.equal(res.result, false);
  assert.match(res.errorMessage, /initialising/i);
});

test('tracking twice captures nothing new and keeps the issue managed', async () => {
  const { storage, records, fake } = site();
  const h = handlersOn(fake, storage, records);
  await h['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx });

  const first = await h['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx });
  const second = await h['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx });

  assert.equal(first.track.status, 'managed');
  assert.equal(second.track.status, 'already_managed');
  const record = await records.read('FS-101');
  assert.equal(record.commitments.length, 1, 'evidence fingerprints deduplicate the scan');
});
