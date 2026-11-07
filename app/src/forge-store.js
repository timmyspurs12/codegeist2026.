/**
 * The Forge bindings for Relay's storage.
 *
 * Everything here is deliberately thin and is imported *only* by the Forge
 * entry points (`resolvers.js`, `index.js`). The product code in `store.js`
 * talks to the interfaces defined here, so the tests can run the real
 * concurrency logic without Forge and without pretending a serial in-memory
 * map is a database.
 *
 * ## Why the record is an entity, not a key
 *
 * `kvs.set` is a blind overwrite. The Custom Entity Store gives Relay two
 * things a plain key cannot:
 *
 *   * a **conditional write** — `kvs.transact().set(key, value, { entityName,
 *     conditions })` is committed only if the conditions still hold when the
 *     transaction lands, which is compare-and-swap on the revision;
 *   * **create-only** writes — `entity.set(key, value, { keyPolicy:
 *     'FAIL_IF_EXISTS' })`, which is how two simultaneous Track clicks, or the
 *     creation trigger racing the backfill, produce one record and not two.
 *
 * The entity is declared in `manifest.yml` under `app.storage.entities`; the
 * attribute list there is exhaustive because the store enforces types.
 */
import { kvs, Filter, FilterConditions, WhereConditions } from '@forge/kvs';
import { RecordExists, RevisionConflict, isAlreadyExists, isConditionFailed } from './store.js';
import { fromStored, toStored } from './record-codec.js';

/** Must match `app.storage.entities[].name` in manifest.yml. */
export const RECORD_ENTITY = 'relay-ledger';

/** The page size the KVS query API accepts per request. */
const QUERY_PAGE = 100;

export function createForgeStorage() {
  return {
    get: (key) => kvs.get(key),
    set: (key, value, options) => (options ? kvs.set(key, value, options) : kvs.set(key, value)),
    /**
     * One page of keys under a prefix, newest-first not required by the caller
     * (it sorts). Cursors are forwarded so a trail longer than one page is read
     * completely rather than silently truncated.
     */
    async list(prefix, { limit = 200, cursor } = {}) {
      const items = [];
      let token = cursor ?? null;
      let nextCursor = null;

      while (items.length < limit) {
        const take = Math.min(QUERY_PAGE, limit - items.length);
        let query = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(take);
        if (token) query = query.cursor(token);
        const page = await query.getMany();
        const results = Array.isArray(page?.results) ? page.results : [];
        for (const row of results) items.push(row.value);
        nextCursor = page?.nextCursor ?? null;
        if (!nextCursor || results.length === 0) {
          nextCursor = null;
          break;
        }
        token = nextCursor;
      }

      return { items, nextCursor };
    },
  };
}

/**
 * Read/commit an issue record with a condition on the revision it was derived
 * from. `expectedRev` is `null` only on create.
 *
 * Every value crosses `record-codec.js` on its way in and out. That is not
 * decoration: the ledger is full of nulls (an owner, a due date, a verification
 * note — all null until something happens) and the Custom Entity Store rejects
 * nulls, empty strings and undeclared attributes with
 * `422 UNPROCESSABLE_ENTITY`. Encoding here keeps the domain honest and keeps
 * the constraint in exactly one place.
 *
 * `toStored` throws *before* the network call when a record cannot be stored, so
 * the failure names the attribute instead of surfacing as an opaque 422; it is
 * not retried by `store.js` (only conflicts are) and it is never reported as a
 * successful write.
 */
export function createForgeRecords() {
  const entity = kvs.entity(RECORD_ENTITY);

  return {
    async read(issueKey) {
      const stored = await entity.get(issueKey);
      return stored ? fromStored(stored) : null;
    },

    async create(issueKey, record) {
      const stored = toStored(record);
      try {
        await entity.set(issueKey, stored, { keyPolicy: 'FAIL_IF_EXISTS' });
      } catch (err) {
        if (isAlreadyExists(err)) throw new RecordExists(issueKey);
        throw err;
      }
    },

    async update(issueKey, expectedRev, record) {
      const stored = toStored(record);
      try {
        await kvs
          .transact()
          .set(issueKey, stored, {
            entityName: RECORD_ENTITY,
            // The commit lands only while the stored revision is still the one
            // the mutation was derived from. This is the compare in
            // compare-and-swap.
            conditions: new Filter().and('rev', FilterConditions.equalTo(expectedRev)),
          })
          .execute();
      } catch (err) {
        // A failed condition means someone else committed first: that is a
        // conflict to retry, not an outage to report.
        if (isConditionFailed(err)) throw new RevisionConflict(expectedRev);
        throw err;
      }
    },
  };
}
