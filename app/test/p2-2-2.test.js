/**
 * P2.2.2 regression: the record the Custom Entity Store will accept.
 *
 * The live failure this file exists to prevent was a `422 UNPROCESSABLE_ENTITY`
 * from `entity.set()` on the first Track. Two things were wrong and neither was
 * visible to any existing test:
 *
 *   * the record carried attributes the entity does not declare (`source`,
 *     `trackedBy`), and
 *   * it carried `null` — in `trackedBy` at the top level, and in a dozen places
 *     inside every commitment (owner, due date, acceptedBy, verification note,
 *     and five nullable fields inside `evidence`).
 *
 * The fake record store now enforces the service's value rules and stores the
 * *encoded* record, so these tests exercise the real codec end to end: if
 * `record-codec.js` ever lets a null, an empty string or an undeclared attribute
 * through, the fake rejects it exactly as the service would.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createHandlers } from '../src/handlers.js';
import { createStore } from '../src/store.js';
import { COMMITMENT_STATUSES, counts, digestOf, emptyLedger } from '../src/ledger.js';
import { decideClosure } from '../src/gate.js';
import { RECORD_ATTRIBUTES, RecordShapeError, fromStored, toStored } from '../src/record-codec.js';
import {
  assertEntityValue, createFakeJira, createMemoryRecords, createMemoryStorage, forgeContext, rawComment, rawIssue,
} from './support/fake-forge.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');
const ctx = () => ({ ...forgeContext(), extension: { issue: { key: 'FS-101' } } });
/** A Forge context with no `accountId`: a trigger or an automation call, not a person. */
const ctxWithoutAccount = () => {
  const base = ctx();
  delete base.accountId;
  delete base.account;
  return base;
};

function site({ records = null } = {}) {
  const storage = createMemoryStorage();
  const recordStore = records ?? createMemoryRecords();
  const fake = createFakeJira({ issue: rawIssue(), comments: [rawComment()], issues: ['FS-101'] });
  const handlers = createHandlers({ jira: fake.jira, storage, records: recordStore, now: () => NOW, log: () => {} });
  const store = createStore({ storage, records: recordStore, now: () => NOW, log: () => {}, wait: async () => {} });
  return { storage, records: recordStore, fake, handlers, store };
}

/** Every value the service would accept: no null, no undefined, no empty string. */
function assertNoNulls(value, path = '<root>') {
  if (value === null || value === undefined) assert.fail(`${path} is ${String(value)}: the entity store has no null`);
  if (typeof value === 'string') {
    assert.ok(value.trim() !== '', `${path} is an empty string: the entity store rejects those`);
    return;
  }
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} is not a finite number`);
    return;
  }
  if (typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNulls(item, `${path}[${index}]`));
    return;
  }
  assert.equal(typeof value, 'object', `${path} is a ${typeof value}`);
  for (const [key, nested] of Object.entries(value)) assertNoNulls(nested, `${path}.${key}`);
}

/**
 * `Object.hasOwn`, not `in`: `in` walks the prototype chain, so `toString`,
 * `constructor` or `hasOwnProperty` would read as declared attributes here and
 * let a regression pass.
 */
const declared = (raw) => Object.keys(raw).every((attribute) => Object.hasOwn(RECORD_ATTRIBUTES, attribute));

/* ------------------------------------- 1. the record Track creates, exactly */

test('1. the initial Track record is storable, and its digest is digestOf([])', async () => {
  const { records, store } = site();

  const init = await store.initialise('FS-101', {
    state: 'initializing',
    seed: { source: 'track', trackedBy: 'acc-maya' },
  });
  assert.equal(init.created, true);

  const raw = records.raw('FS-101');
  assertNoNulls(raw);
  assert.ok(declared(raw), `undeclared attribute written: ${Object.keys(raw).filter((k) => !(k in RECORD_ATTRIBUTES))}`);
  assert.deepEqual(raw.commitments, [], 'a new record has no commitments');
  assert.equal(raw.digest, digestOf([]), 'the digest of an empty ledger, not a missing one');
  assert.equal(raw.digest, '0:811c9dc5', 'the digest is stable: a read-back compares it');
  assert.equal(raw.rev, 0);
  assert.equal(raw.state, 'initializing');
  assert.equal(raw.source, 'track');
  assert.equal(raw.trackedBy, 'acc-maya');
  assert.equal(raw.issueKey, 'FS-101');
});

/* ------------------------------------------------- 2. no account id at all */

test('2. a Track with no account id omits the actor instead of writing null', async () => {
  const { records, store } = site();

  await store.initialise('FS-101', { state: 'initializing', seed: { source: 'track', trackedBy: null } });

  const raw = records.raw('FS-101');
  assertNoNulls(raw);
  assert.equal('trackedBy' in raw, false, 'absent, not null: the store has no null for it');
  // …and the domain still sees the same shape it wrote.
  assert.equal((await records.read('FS-101')).trackedBy, null);
});

/* -------------------------------------------------------- 3. console Track */

test('3. console tracking writes a record and a tracked-list entry with no nulls', async () => {
  const { records, storage, handlers } = site();

  const res = await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });
  assert.equal(res.track.status, 'managed');

  const raw = records.raw('FS-101');
  assertNoNulls(raw);
  assert.equal(raw.state, 'managed');

  const list = await storage.get('relay:tracked');
  assert.equal(list.length, 1);
  assertNoNulls(list[0]);
  assert.equal(list[0].key, 'FS-101');
  assert.equal(list[0].addedBy, 'acc-maya');
  assert.equal(list[0].source, 'console');
});

test('3b. console tracking without an account id does not put a null in the list', async () => {
  const { records, storage, handlers } = site();

  await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctxWithoutAccount() });

  const list = await storage.get('relay:tracked');
  assertNoNulls(list[0]);
  assert.equal('addedBy' in list[0], false);
  assertNoNulls(records.raw('FS-101'));
  assert.equal('trackedBy' in records.raw('FS-101'), false);
});

/* --------------------------------------------- 4. the management transition */

test('4. a successful transition records managedAt and still stores cleanly', async () => {
  const { records, fake, handlers } = site();

  await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });

  const raw = records.raw('FS-101');
  assertNoNulls(raw);
  assert.equal(raw.state, 'managed');
  assert.equal(raw.managedAt, NOW.toISOString(), 'when it became managed is part of the record');
  assert.equal(fake.fields.state.value, 'managed');
  assert.equal(raw.digest, digestOf((await records.read('FS-101')).commitments), 'the digest matches the commitments stored');
  assert.ok(raw.rev >= 2, 'initialize → managed is at least two conditional commits');
});

/* ------------------------------------------------------------- 5. untrack */

test('5. untracking stores untrackedAt and untrackedBy, and never a null', async () => {
  const { records, handlers } = site();
  await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });

  const done = await handlers['relay.workspace.untrack']({
    payload: { key: 'FS-101', confirm: true, reason: 'Customer moved to a new request.' }, context: ctx(),
  });
  assert.equal(done.untrack.status, 'unmanaged');

  const raw = records.raw('FS-101');
  assertNoNulls(raw);
  assert.equal(raw.state, 'unmanaged');
  assert.equal(raw.untrackedAt, NOW.toISOString());
  assert.equal(raw.untrackedBy, 'acc-maya');
  assert.ok(raw.commitments.length >= 1, 'the evidence is kept');
});

test('5b. untracking without an account id omits untrackedBy', async () => {
  const { records, handlers } = site();
  await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });
  await handlers['relay.workspace.untrack']({
    payload: { key: 'FS-101', confirm: true, reason: 'Automation offboarding.' }, context: ctxWithoutAccount(),
  });

  const raw = records.raw('FS-101');
  assertNoNulls(raw);
  assert.equal('untrackedBy' in raw, false);
  assert.equal((await records.read('FS-101')).untrackedBy, null);
});

/* ------------------------------------------- 6. trigger and backfill creates */

test('6. the created trigger stores an unmanaged record with its source and no nulls', async () => {
  const { records, handlers } = site();

  const res = await handlers['relay.state.init']({ payload: { key: 'FS-101', source: 'trigger' }, context: ctxWithoutAccount() });
  assert.equal(res.created, true);

  const raw = records.raw('FS-101');
  assertNoNulls(raw);
  assert.equal(raw.state, 'unmanaged');
  assert.equal(raw.source, 'trigger');
  assert.equal(raw.backfilledAt, NOW.toISOString());
  assert.equal(raw.digest, digestOf([]));
  assert.equal('trackedBy' in raw, false);
});

test('6b. a backfill page stores one clean record per issue and skips the rest', async () => {
  const { records, handlers } = site();

  const page = await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx() });
  assert.deepEqual(page.initialised, ['FS-101']);

  const raw = records.raw('FS-101');
  assertNoNulls(raw);
  assert.equal(raw.source, 'backfill');
  assert.equal(raw.state, 'unmanaged');
  assert.equal(raw.digest, digestOf([]));

  const again = await handlers['relay.workspace.init']({ payload: { projectKey: 'FS' }, context: ctx() });
  assert.deepEqual(again.initialised, [], 'a second page never overwrites an existing record');
  assert.deepEqual(again.skipped.map((s) => s.key), ['FS-101']);
});

/* --------------------------------- 7. commitments with every optional field */

test('7. a commitment with empty optional fields stores without nulls and reads back as nulls', async () => {
  const { records, handlers } = site();
  await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });

  const record = await records.read('FS-101');
  const code = record.commitments[0].code;

  // An owner with a name and no account id, and no due date given: the fields
  // that are null until a person fills them in.
  await handlers['relay.capture.accept']({
    payload: { key: 'FS-101', code, owner: { name: 'Tom Whitfield' } }, context: ctx(),
  });
  await handlers['relay.commitment.verify']({ payload: { key: 'FS-101', code }, context: ctx() });

  const raw = records.raw('FS-101');
  assertNoNulls(raw);
  const stored = raw.commitments.find((c) => c.code === code);
  assert.equal(stored.owner.id, undefined, 'an owner with no account id has no id key');
  assert.equal(stored.acceptedBy.id, 'acc-maya');
  assert.equal('verificationNote' in stored, false, 'verified with no note: absent, not null');

  // Whatever the extractor did or did not find, the rule is the same for every
  // nullable commitment key: absent in storage ⇔ null in the domain.
  const nullable = ['dueAt', 'dueBasis', 'suggestedOwner', 'verifiedAt', 'verificationNote', 'droppedReason', 'droppedAt', 'acceptedBy'];
  const read = (await records.read('FS-101')).commitments.find((c) => c.code === code);
  for (const key of nullable) {
    if (key in stored) continue;
    assert.equal(read[key], null, `${key} was absent in storage and must read back as null`);
  }
  assert.ok('dueAt' in stored || read.dueAt === null);
  assert.deepEqual(read.owner, { name: 'Tom Whitfield', initials: 'TW', id: null }, 'the missing id is null again');
  assert.equal(read.status, 'verified');
  assert.equal(read.verifiedBy.id, 'acc-maya');
});

test('7b. a handover stores previousOwners whose nullable from/by survive the round trip', async () => {
  const { records, handlers } = site();
  await handlers['relay.workspace.track']({ payload: { key: 'FS-101' }, context: ctx() });
  const code = (await records.read('FS-101')).commitments[0].code;

  await handlers['relay.capture.accept']({
    payload: { key: 'FS-101', code, owner: { name: 'Tom Whitfield' } }, context: ctx(),
  });
  await handlers['relay.commitment.reassign']({
    payload: { key: 'FS-101', code, owner: { id: 'acc-maya', name: 'Maya Okafor' }, reason: 'Cover while Tom is away' },
    context: ctx(),
  });

  const raw = records.raw('FS-101');
  assertNoNulls(raw);
  const stored = raw.commitments.find((c) => c.code === code);
  assert.equal(stored.previousOwners.length, 1);
  assert.equal('id' in stored.previousOwners[0].from, false, 'the previous owner had no account id, so no id key');

  const read = (await records.read('FS-101')).commitments.find((c) => c.code === code);
  assert.deepEqual(read.previousOwners[0].from, { name: 'Tom Whitfield', initials: 'TW', id: null });
  assert.equal(read.previousOwners[0].by.id, 'acc-maya');
  assert.equal(read.owner.id, 'acc-maya');
});

/* ----------------------------------------------- 8. the codec round trip */

test('8. toStored → fromStored round-trips a record without losing application meaning', () => {
  const commitments = [
    {
      code: 'CM-1',
      issueKey: 'FS-101',
      status: 'open',
      text: 'Chase the supplier',
      originalText: 'I will chase the supplier on Monday.',
      evidence: {
        commentId: 'c-1',
        commentCreatedAt: null,
        body: 'I will chase the supplier on Monday.',
        bodyHash: null,
        bodyFormat: 'adf-text',
        quote: 'I will chase the supplier on Monday.',
        start: 0,
        end: 34,
        author: { id: null, name: 'Tom Whitfield', initials: 'TW' },
        fingerprint: 'fp-1',
        capturedAt: NOW.toISOString(),
      },
      owner: { id: 'acc-maya', name: 'Maya Okafor', initials: 'MO' },
      suggestedOwner: null,
      dueAt: null,
      dueBasis: null,
      confidence: 0.55,
      signals: ['promise'],
      acceptedAt: NOW.toISOString(),
      acceptedBy: { id: null, name: 'Tom Whitfield', initials: 'TW' },
      verifiedAt: null,
      verifiedBy: null,
      verificationNote: null,
      droppedReason: null,
      droppedAt: null,
      previousOwners: [{ from: null, to: { id: 'acc-maya', name: 'Maya Okafor', initials: 'MO' }, by: { id: null, name: 'Tom Whitfield', initials: 'TW' }, at: NOW.toISOString(), reason: 'Handover' }],
    },
  ];

  const record = {
    ...emptyLedger('FS-101', NOW.toISOString(), 'managed'),
    digest: digestOf(commitments),
    rev: 4,
    source: 'track',
    trackedBy: null,
    managedAt: NOW.toISOString(),
    untrackedAt: null,
    untrackedBy: null,
    backfilledAt: null,
    commitments,
  };

  const stored = toStored(record);
  assertNoNulls(stored);
  const present = Object.keys(record).filter((k) => record[k] !== null && record[k] !== undefined);
  assert.deepEqual(Object.keys(stored).sort(), present.sort(), 'every non-null attribute is written, and nothing else');

  const back = fromStored(structuredClone(stored));
  assert.deepEqual(back, record, 'every null and every value survives the round trip');
  assert.equal(back.digest, digestOf(record.commitments), 'and the digest still describes the content');
});

test('8b. an empty string is stored as absent and reads back as null', () => {
  const commitments = [{ code: 'CM-1', status: 'proposed', verificationNote: '', signals: [] }];
  const record = {
    ...emptyLedger('FS-101', NOW.toISOString(), 'managed'),
    untrackedBy: '',
    commitments,
    digest: digestOf(commitments),
  };
  const back = fromStored(toStored(record));
  assert.equal(back.untrackedBy, null);
  assert.equal(back.commitments[0].verificationNote, null);
});

/* ------------------------------------- 9. what the store rejects, and when */

test('9. an undeclared attribute fails locally, naming the attribute, instead of 422-ing remotely', () => {
  const record = { ...emptyLedger('FS-101', NOW.toISOString(), 'managed'), capturedBy: 'acc-maya' };
  assert.throws(
    () => toStored(record),
    (err) => err instanceof RecordShapeError && err.attribute === 'capturedBy' && /not an attribute/.test(err.message),
  );
});

test('9b. a record missing its digest is refused: an unverifiable record is not written', () => {
  const record = emptyLedger('FS-101', NOW.toISOString(), 'managed');
  delete record.digest;
  assert.throws(() => toStored(record), (err) => err instanceof RecordShapeError && err.attribute === 'digest');
});

test('9c. the fake rejects a null even if something bypasses the codec', () => {
  const stored = toStored(emptyLedger('FS-101', NOW.toISOString(), 'managed'));
  assert.throws(
    () => assertEntityValue(RECORD_ATTRIBUTES, { ...stored, source: null }),
    (err) => err.status === 422 && /attribute "source"/.test(err.message),
  );
  assert.throws(
    () => assertEntityValue(RECORD_ATTRIBUTES, { ...stored, commitments: [{ owner: null }] }),
    (err) => err.status === 422 && /commitments\[0\]\.owner" is null/.test(err.message),
  );
});

test('9d. a rejected record fails the create loudly and is not retried or reported as success', async () => {
  // A store whose schema is missing `source`: exactly what the live entity was.
  const broken = createMemoryRecords({ attributes: Object.fromEntries(Object.entries(RECORD_ATTRIBUTES).filter(([k]) => k !== 'source')) });
  const { store } = site({ records: broken });

  await assert.rejects(
    () => store.initialise('FS-101', { state: 'initializing', seed: { source: 'track', trackedBy: 'acc-maya' } }),
    (err) => err.status === 422 && /attribute "source" is not declared/.test(err.message),
  );
  assert.equal(broken.raw('FS-101'), null, 'nothing was stored');
  assert.equal(broken.commits.length, 0);
});

/* -------------------------------------------- 10. a legacy record still reads */

test('10. a record written without a digest reads back with one derived from its content', async () => {
  const { records } = site();
  // Exactly what the pre-P2.2.2 `initialise` wrote: no digest, no metadata.
  records.map.set('FS-101', {
    issueKey: 'FS-101', rev: 2, version: 2, state: 'managed', updatedAt: NOW.toISOString(),
    commitments: [{ code: 'CM-1', status: 'open', evidence: { commentId: 'c-1', author: { name: 'Tom', initials: 'T' } } }],
  });

  const read = await records.read('FS-101');
  assert.equal(read.digest, digestOf(read.commitments));
  assert.equal(read.commitments[0].owner, null, 'the nulls the old writer never stored are restored');
  assertNoNulls(records.raw('FS-101'), 'and the stored value is untouched');
});

/* ---------------------------------- 11. inherited and special property names */

test('11. inherited property names cannot pass as declared attributes', () => {
  const base = emptyLedger('FS-101', NOW.toISOString(), 'managed');

  for (const name of ['toString', 'constructor', 'hasOwnProperty', 'valueOf', 'isPrototypeOf']) {
    assert.equal(Object.hasOwn(RECORD_ATTRIBUTES, name), false, `${name} must not be a declared attribute`);
    assert.equal(declared({ ...base, [name]: 'x' }), false, `the declared() helper must not accept ${name}`);

    const record = { ...base, [name]: 'x' };
    assert.throws(
      () => toStored(record),
      (err) => err instanceof RecordShapeError && err.attribute === name,
      `${name} must be refused as an undeclared attribute`,
    );
  }
});

test('11b. an own __proto__ key is refused and never reaches the prototype chain', () => {
  const base = emptyLedger('FS-101', NOW.toISOString(), 'managed');
  // `{ __proto__: ... }` in a literal sets the prototype; Object.fromEntries (or
  // JSON.parse) creates a real own property, which is the interesting case.
  const record = Object.fromEntries([...Object.entries(base), ['__proto__', { polluted: true }]]);
  assert.equal(Object.hasOwn(record, '__proto__'), true, 'the fixture really carries an own __proto__');

  assert.throws(
    () => toStored(record),
    (err) => err instanceof RecordShapeError && err.attribute === '__proto__',
  );
  assert.equal({}.polluted, undefined, 'Object.prototype was not touched');
});

test('11c. a nested __proto__ inside a commitment stays data, and pollutes nothing', () => {
  const commitments = [JSON.parse('{"code":"CM-1","status":"open","__proto__":{"polluted":true}}')];
  const record = {
    ...emptyLedger('FS-101', NOW.toISOString(), 'managed'),
    commitments,
    digest: digestOf(commitments),
  };

  const stored = toStored(record);
  assert.equal(Object.hasOwn(stored.commitments[0], '__proto__'), true, 'kept as an own property, as `any` allows');
  assert.equal(Object.getPrototypeOf(stored.commitments[0]), Object.prototype, 'the prototype is untouched');
  assert.equal({}.polluted, undefined);

  const back = fromStored(stored);
  assert.equal({}.polluted, undefined, 'reading it back pollutes nothing either');
  assert.equal(back.commitments[0].code, 'CM-1');
});

test('11d. the fake entity store applies the same own-property rule', () => {
  const stored = toStored(emptyLedger('FS-101', NOW.toISOString(), 'managed'));
  for (const name of ['toString', 'constructor']) {
    assert.throws(
      () => assertEntityValue(RECORD_ATTRIBUTES, { ...stored, [name]: 'x' }),
      (err) => err.status === 422 && new RegExp(`attribute "${name}" is not declared`).test(err.message),
      `${name} must be rejected by the fake's entity rules too`,
    );
  }
});

/* ------------------------------------- 12. forward compatibility, both ways */

test('12. an attribute this build does not know survives a read, and a write refuses it', async () => {
  const { records, store } = site();
  // Exactly what a newer build would leave behind.
  records.map.set('FS-101', { ...toStored(emptyLedger('FS-101', NOW.toISOString(), 'managed')), capturedBy: 'acc-maya' });

  const read = await records.read('FS-101');
  assert.equal(read.capturedBy, 'acc-maya', 'the read keeps an attribute it does not know');
  assert.equal(read.state, 'managed');
  assert.equal(read.rev, 0);

  await assert.rejects(
    () => store.setState('FS-101', 'unmanaged'),
    (err) => err instanceof RecordShapeError && err.attribute === 'capturedBy',
    'writing it back is refused rather than silently dropping the attribute',
  );
  assert.equal(records.raw('FS-101').state, 'managed', 'the refused write changed nothing');
  assert.equal(records.raw('FS-101').capturedBy, 'acc-maya', 'and the unknown attribute is still there');
});

/* ------------------------------- 13. incomplete or corrupt records are refused */

test('13. a record missing or mis-typing a core field is refused, not filled in', () => {
  const valid = () => toStored(emptyLedger('FS-101', NOW.toISOString(), 'managed'));
  const cases = [
    ['rev', (r) => { delete r.rev; }],
    ['rev', (r) => { r.rev = '3'; }],
    ['rev', (r) => { r.rev = -1; }],
    ['state', (r) => { delete r.state; }],
    ['state', (r) => { r.state = 'tracked'; }],
    ['commitments', (r) => { delete r.commitments; }],
    ['commitments', (r) => { r.commitments = null; }],
    ['commitments', (r) => { r.commitments = {}; }],
    ['issueKey', (r) => { delete r.issueKey; }],
    ['issueKey', (r) => { r.issueKey = '   '; }],
    ['version', (r) => { delete r.version; }],
    ['updatedAt', (r) => { delete r.updatedAt; }],
    ['digest', (r) => { r.digest = null; }],
  ];

  for (const [attribute, mutate] of cases) {
    const stored = valid();
    mutate(stored);
    assert.throws(
      () => fromStored(stored),
      (err) => err instanceof RecordShapeError && err.attribute === attribute,
      `a record with a bad ${attribute} must be refused`,
    );
  }
});

test('13b. an empty or non-object stored value is refused, not read as an empty ledger', () => {
  for (const value of [null, undefined, 'FS-101', [], 42]) {
    assert.throws(() => fromStored(value), (err) => err instanceof RecordShapeError && err.attribute === '<record>');
  }
});

test('13c. a corrupt record surfaces at read, and no caller ever sees a fabricated ledger', async () => {
  const { records, store } = site();
  // No commitments attribute: the shape the pre-P2.2.2 create wrote *minus* the
  // field that makes "nothing open" true. Reading it must not become rev 0/[].
  records.map.set('FS-101', {
    issueKey: 'FS-101', rev: 4, version: 2, state: 'managed', updatedAt: NOW.toISOString(),
  });

  await assert.rejects(() => records.read('FS-101'), (err) => err instanceof RecordShapeError && err.attribute === 'commitments');
  await assert.rejects(() => store.readLedger('FS-101'), (err) => err.attribute === 'commitments');
});

/* ------------------------------------------- 14. the legacy repair, bounded */

test('14. legacy repair covers the digest and nothing else', () => {
  const legacy = {
    issueKey: 'FS-101',
    rev: 3,
    version: 2,
    state: 'managed',
    updatedAt: NOW.toISOString(),
    commitments: [{ code: 'CM-1', status: 'open', evidence: { commentId: 'c-1', author: { name: 'Tom', initials: 'T' } } }],
  };

  const read = fromStored(legacy);
  assert.equal(read.digest, digestOf(read.commitments), 'the one field the old writer omitted is derived');
  assert.equal(read.rev, 3, 'and every field it did write is kept exactly as stored');
  assert.equal(read.issueKey, 'FS-101');
  assert.equal(read.state, 'managed');
  assert.equal(read.version, 2);
  assert.equal(read.updatedAt, legacy.updatedAt);
  assert.equal(read.trackedBy, null, 'metadata the old writer never wrote reads as null');
  assert.equal(read.commitments[0].owner, null);

  // The repair is for an *absent* digest. A present but unusable one is corrupt.
  for (const digest of [null, '', 7]) {
    assert.throws(
      () => fromStored({ ...legacy, digest }),
      (err) => err instanceof RecordShapeError && err.attribute === 'digest',
      `digest ${JSON.stringify(digest)} must be refused, not repaired`,
    );
  }
});

/* --------------------------- 15. the four legitimate commitment statuses */

/**
 * A stored record, with a digest that genuinely describes its commitments, so a
 * test can vary one thing without tripping the other checks.
 */
const storedWith = (commitments, overrides = {}) => ({
  issueKey: 'FS-101',
  rev: 1,
  version: 2,
  state: 'managed',
  updatedAt: NOW.toISOString(),
  commitments,
  digest: digestOf(commitments),
  ...overrides,
});

test('15. all four commitment statuses read back unchanged, and keep their classification', () => {
  const commitments = ['proposed', 'open', 'verified', 'dropped'].map((status, index) => ({
    code: `CM-${index + 1}`,
    status,
    text: `the ${status} commitment`,
  }));

  const read = fromStored(toStored(storedWith(commitments)));
  assert.deepEqual(read.commitments.map((c) => c.status), [...COMMITMENT_STATUSES], 'no status is rewritten, normalised or dropped');
  assert.deepEqual([...COMMITMENT_STATUSES], ['proposed', 'open', 'verified', 'dropped'], 'the set is the four Relay writes');

  // The classification downstream is unchanged: proposed and open are the open
  // count, verified and dropped are settled.
  const c = counts(read);
  assert.equal(c.open, 2);
  assert.equal(c.awaitingReview, 1);
  assert.equal(c.overdue, 0);
});

test('16. a commitment whose status is missing, empty or unknown is refused at its path', () => {
  const unknown = [null, '', '   ', 'settled', 'OPEN', 'Open', 'closed', 0, 3, true, {}, ['open']];
  for (const status of unknown) {
    assert.throws(
      () => fromStored(storedWith([{ code: 'CM-1', status }])),
      (err) => err instanceof RecordShapeError && err.attribute === 'commitments[0].status',
      `status ${JSON.stringify(status)} must be refused`,
    );
  }

  // Missing entirely, which is what a truncated write or a hand edit leaves behind.
  assert.throws(
    () => fromStored(storedWith([{ code: 'CM-1', text: 'no status at all' }])),
    (err) => err instanceof RecordShapeError
      && err.attribute === 'commitments[0].status'
      && /missing or empty/.test(err.message),
  );

  // The path names the commitment, not just the field.
  assert.throws(
    () => fromStored(storedWith([{ code: 'CM-1', status: 'open' }, { code: 'CM-2' }])),
    (err) => err instanceof RecordShapeError && err.attribute === 'commitments[1].status',
  );
});

/* ------------------------------------- 17. the digest is verified, not carried */

test('17. a stored digest is checked against the commitments, and never repaired', () => {
  const commitments = [{
    code: 'CM-1',
    status: 'open',
    text: 'Send the drawing',
    owner: { id: 'acc-1', name: 'Maya', initials: 'MB' },
    dueAt: '2026-11-10T00:00:00.000Z',
  }];
  const digest = digestOf(commitments);
  const record = storedWith(commitments);

  // A matching digest is accepted, and is stable across a write and a read.
  const back = fromStored(toStored(record));
  assert.equal(back.digest, digest);
  assert.equal(digestOf(back.commitments), digest, 'the normalised record digests to the same value the writer computed');

  // Every field the digest covers is protected: change one, keep the digest, and
  // the record no longer describes itself.
  const covered = [
    ['text', (c) => { c.text = 'Send the drawing tomorrow'; }],
    ['code', (c) => { c.code = 'CM-9'; }],
    ['status', (c) => { c.status = 'verified'; }],
    ['owner identity', (c) => { c.owner = { id: 'acc-2', name: 'Tom', initials: 'TL' }; }],
    ['dueAt', (c) => { c.dueAt = '2026-12-01T00:00:00.000Z'; }],
  ];
  for (const [field, mutate] of covered) {
    const copy = structuredClone(record);
    mutate(copy.commitments[0]);
    assert.throws(
      () => fromStored(copy),
      (err) => err instanceof RecordShapeError && err.attribute === 'digest',
      `a changed ${field} must not pass the digest`,
    );
  }

  // Adding or removing a commitment moves the count in the digest too.
  assert.throws(() => fromStored({ ...record, commitments: [] }), (err) => err.attribute === 'digest');
  assert.throws(
    () => fromStored({ ...record, commitments: [...commitments, { code: 'CM-2', status: 'open' }] }),
    (err) => err.attribute === 'digest',
  );

  // A digest that belongs to something else, and a digest that is not a usable string.
  for (const value of [digestOf([]), null, '', '   ', 7, {}]) {
    assert.throws(
      () => fromStored({ ...record, digest: value }),
      (err) => err instanceof RecordShapeError && err.attribute === 'digest',
      `digest ${JSON.stringify(value)} must be refused, not repaired`,
    );
  }

  // An absent digest is the only repair, and it is derived from what is there.
  const derived = fromStored({ ...record, digest: undefined });
  assert.equal(derived.digest, digest, 'the legacy record gets exactly the digest its content implies');

  // The boundary, asserted rather than left to prose: the digest covers the
  // fields Relay decides from, not the evidence chain (see `digestOf` in
  // ledger.js). This is the documented limit of the guarantee.
  const outside = structuredClone(record);
  outside.commitments[0].verificationNote = 'edited outside Relay';
  outside.commitments[0].evidence = { quote: 'a different sentence', start: 0, end: 5 };
  assert.equal(fromStored(outside).digest, digest, 'evidence and notes are outside the digest by design');
});

/* -------------------------------- 18. a malformed commitment cannot fail open */

test('18. a commitment with a lost status never reads back as a zero-open ledger', async () => {
  const commitments = [{ code: 'CM-1', text: 'Ship the bracket', evidence: { commentId: 'c-1' } }];
  const record = storedWith(commitments); // matching digest: the status is the only thing wrong
  const { records, store } = site();
  records.map.set('FS-101', record);

  await assert.rejects(
    () => records.read('FS-101'),
    (err) => err instanceof RecordShapeError && err.attribute === 'commitments[0].status',
  );
  await assert.rejects(
    () => store.readLedger('FS-101'),
    (err) => err instanceof RecordShapeError && err.attribute === 'commitments[0].status',
  );

  // What an unchecked read would have handed to the closure gate: zero open, and
  // a gate that says the case may close. `isUnresolved` answers false for any
  // status it does not recognise, so this is the fail-open the check prevents.
  assert.equal(counts({ commitments }).open, 0, 'an unrecognised status counts as settled');
  const gate = decideClosure({
    ledger: record,
    projection: { ledgerRev: record.rev, updatedAt: record.updatedAt, open: 0 },
    nowMs: NOW.getTime(),
  });
  assert.equal(gate.allow, true, 'the unchecked ledger would have permitted closure');
});

/* -------------------------------- 19. the same rules apply before the write */

test('19. an unreadable commitment is refused before it is stored, not after', () => {
  // A record that is written but cannot be read back is worse than a local
  // error: it fails closed on every later read, and only a manual
  // untrack/backfill repairs it.
  const base = () => emptyLedger('FS-101', NOW.toISOString(), 'managed');

  for (const status of [undefined, '', 'settled', 'OPEN']) {
    const commitment = status === undefined ? { code: 'CM-1' } : { code: 'CM-1', status };
    const record = { ...base(), commitments: [commitment], digest: digestOf([commitment]) };
    assert.throws(
      () => toStored(record),
      (err) => err instanceof RecordShapeError && err.attribute === 'commitments[0].status',
      `status ${JSON.stringify(status)} must not reach the store`,
    );
  }

  const commitments = [{ code: 'CM-1', status: 'open' }];
  assert.throws(
    () => toStored({ ...base(), commitments, digest: digestOf([]) }),
    (err) => err instanceof RecordShapeError && err.attribute === 'digest',
    'a digest that does not describe what is being written is refused too',
  );
});

test('19b. a mutator that produces an unreadable commitment changes nothing', async () => {
  const { store, records } = site();

  await assert.rejects(
    () => store.mutateLedger('FS-101', (l) => [...l.commitments, { code: 'CM-1', status: 'settled' }]),
    (err) => err instanceof RecordShapeError && err.attribute === 'commitments[0].status',
  );

  assert.equal(records.raw('FS-101'), null, 'nothing was stored');
  assert.equal(await store.readLedger('FS-101'), null, 'and the issue has no half-written record');
});

test('19c. the four statuses all write cleanly through the store', async () => {
  const { store, records } = site();
  const statuses = ['proposed', 'open', 'verified', 'dropped'];

  await store.mutateLedger('FS-101', (l) => [
    ...l.commitments,
    ...statuses.map((status, index) => ({ code: `CM-${index + 1}`, status, text: status })),
  ]);

  const read = await store.readLedger('FS-101');
  assert.deepEqual(read.commitments.map((c) => c.status), statuses);
  assert.equal(read.digest, digestOf(read.commitments));
  assertNoNulls(records.raw('FS-101'), 'and every stored value is still storable');
});
