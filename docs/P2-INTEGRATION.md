# Relay Phase 2 — real Jira integration

> **P2.2 supersedes parts of this document.** The management-state field, the
> conditional commit on `rev`, the append-only audit trail and the track/untrack/
> backfill lifecycle are described in [`docs/P2.2-RUNBOOK.md`](P2.2-RUNBOOK.md).
> Where this document says "closure field", read "the two app-owned fields"; where
> it says "no ledger is permitted", read "no record is withheld".

**Phase 2.1 supersedes parts of this document.** The closure condition no longer
reads a hand-made Number field: the app declares its own read-only
`jira:customField`, writes it through the private app-field API, and resolves its
identifier at runtime. See `docs/P2.1-RUNBOOK.md` for deployment and §10 below
for what changed and what it costs. §3, §5, §7 and §8 have been corrected in
place where they were wrong.

Status of this document: written at commit time on branch `arena/06fd2e30-codegeist2026`.
Nothing in it describes a deployment that happened here. The sandbox cannot reach
Atlassian, so the app in this repository has **never been deployed from this environment**.
Everything below distinguishes what ran from what was read.

Site and project under test: `https://onepes930.atlassian.net`, project `FS`
(company-managed Jira Service Management).

---

## 1. What the vertical slice is

One path, end to end, on a real issue:

```
 Jira issue  →  comments  →  candidate with exact evidence  →  human accept
      →  ledger write (rev + read-back)  →  projection property + condition field
      →  Overview / Case Workspace read the ledger  →  gate blocks closure
      →  verify  →  ledger clears  →  gate allows
```

The console talks to exactly one seam (`app/ui/src/lib/api.ts`) and one resolver
surface (`app/src/handlers.js`, bound to Forge in `app/src/resolvers.js`). No screen
builds a URL, and no resolver calls `requestJira` directly — every Jira call goes
through `app/src/jira.js`.

### Resolver surface

| Resolver | Reads / writes | Data source |
| --- | --- | --- |
| `relay.bootstrap` | tracked issues, their ledgers, projections, people | Jira + Relay KVS |
| `relay.issue.get` | one issue | Jira |
| `relay.workspace.track` / `.untrack` | `relay:tracked` list | Relay KVS (+ Jira read to confirm the issue exists) |
| `relay.capture.scan` | comments → candidates | Jira + Relay KVS |
| `relay.capture.accept` / `.reject` / `.edit` | ledger mutation | Relay KVS |
| `relay.commitment.verify` / `.reassign` / `.drop` | ledger mutation | Relay KVS |
| `relay.people.search` | assignable users / picker | Jira |
| `relay.settings.get` / `.set` | `relay:settings` | Relay KVS |
| `relay.enforcement.check` | reconcile one issue and report both layers | Jira + Relay KVS |

Legacy aliases `relay.commitment.{accept,reject,edit}` and `relay.settings.capture`
are defined so older call sites keep working; the console now calls the
`relay.capture.*` names.

### Jira endpoints used (all of them)

| Call where | Endpoint |
| --- | --- |
| `jira.getIssue` | `GET /rest/api/3/issue/{key}?fields=…` |
| `jira.getComments` | `GET /rest/api/3/issue/{key}/comment?startAt=&maxResults=` |
| `jira.searchIssueKeys` | `GET /rest/api/3/search/jql` → logged fallback `GET /rest/api/3/search` |
| `jira.readProperty` / `writeProperty` | `GET|PUT /rest/api/3/issue/{key}/properties/{propKey}` |
| `jira.writeField` | `PUT /rest/api/3/issue/{key}` with `{ fields: { [fieldId]: n } }` |
| `jira.readField` | `GET /rest/api/3/issue/{key}?fields={fieldId}` |
| `jira.myself` | `GET /rest/api/3/myself` |
| `jira.searchPeople` | `GET /rest/api/3/user/picker` → fallback `/rest/api/3/user/assignable/search` |

A failed search fallback is surfaced to the console as `degraded: true` plus a
diagnostic, never as an empty result that looks like "no cases".

---

## 2. How the four kinds of value are kept apart

| Kind | Where it comes from | How the console marks it |
| --- | --- | --- |
| Real Jira data | `jira.js` | `workspace.dataSource === 'jira'`; the masthead chip reads **LIVE** |
| Relay-persisted data | KVS ledger, audit, settings | every commitment shows its own decision trail; `ledgerRev` in the enforcement check |
| Calculated presentation | `gate.js`, `workspace.js` | closure panel is labelled as Relay's own reasoning, separate from "what a customer sees" |
| Demo fixtures | `app/ui/src/fixtures/workspace.ts` | fixture fallback only outside Forge; chip reads **FIXTURE**, Settings says "Fixture preview … nothing here is written anywhere" |

Two hard rules, both covered by tests:

1. Inside Forge, a failing bridge is an **error screen**, not a fixture fallback.
   `connectBridge()` throws inside an Atlassian frame; the console shows "Relay
   could not open the ledger" rather than demo cases.
2. Missing Jira fields are `null` all the way to the DOM, and the UI renders `—`.
   No default is invented at any layer.

---

## 3. Enforcement architecture, restated against the live storage model

- **Ledger** (`relay:ledger:{key}`) is authoritative. Every mutation bumps `rev`,
  appends to `relay:audit:{key}`, and stores `digestOf()` of the canonical content.
- **Projection** (`issue.properties['relay.closure']`) is what the workflow
  *condition* reads. It is derived; it is never the thing that decides.
- **Closure field** (an app-owned, read-only `jira:customField` of type `number`)
  mirrors `open` so a Jira expression can read it. Only the owning app can write
  it, through `PUT /rest/api/3/app/field/{fieldIdOrKey}/value`; a 204 is not
  proof, so every write is read back and compared.
- **Validator** (`createClosureValidator`) reads the ledger at transition time and
  can explain itself.

Write order for any mutation that could increase `open`:

```
1. guard: projection AND the app field both written to the planned open count
          (only if either reader does not already say > 0)
2. ledger write       (rev + digest read-back verification)
3. projection + app field, both verified by reading them back
```

A failure at step 1 aborts the mutation. A failure at step 3 leaves the guard in
place, so the portal stays blocked and `diagnostics` report `projection_write_failed`
/ `field_out_of_step`. This is ordering, not atomicity — see §7.

There is no compare-and-swap in Forge storage. Two concurrent mutations can both
write. Relay therefore:

- takes a best-effort `relay:lock:{key}` (4 s TTL, 3 attempts, injectable clock),
- re-reads the ledger after writing and compares `digestOf()` content,
- retries or throws `RevisionConflict` when another writer replaced it.

A lost update becomes a detected conflict or a thrown error — never a silent
overwrite. The trade-off is stated plainly: **this is not mutual exclusion**; it
is detection.

---

## 4. Evidence rule

`extract.js` never invents a quotation:

- the comment body is projected from ADF to plain text (`adf.js`),
- a candidate stores `start`/`end` into that projection, plus the exact `quote`,
- the quote is re-sliced from `body.slice(start, end)` and compared; a mismatch is
  `rejected: [{ quote, reason: 'anchor_mismatch' }]`,
- `fingerprint = sha256(issueKey \0 commentId \0 start \0 end \0 quote)` makes a
  rescan idempotent and makes an edited comment produce a *new* candidate rather
  than mutating old evidence.

Hours and weekdays are parsed conservatively: "Thursday access slot" yields no due
date (`parseDue` returns `null` when the phrase is not a date), and the test suite
holds that line.

---

## 5. Verification inventory

### LIVE VERIFIED — executed against `onepes930.atlassian.net` in Phase 0 (probe app)

| # | Observation | Evidence |
| --- | --- | --- |
| V1 | Agent transition is refused by the workflow validator with Relay's message | `c3-3`, HTTP 400, `refused_by_relay` |
| V2 | The customer portal **admits** the same transition, proving the portal skips validators | `c3-7`, HTTP 204 |
| V3 | A workflow condition then refuses the customer path | `c3-11`, HTTP 400 |
| V4 | Transition ids on the FS workflow | `81 / 91 / 111 / 121 / 141` |

Recorded in `phase0/`; not re-run here (no network).

### DOCUMENTATION VERIFIED — read from current Atlassian docs, not executed here

| Item | Source |
| --- | --- |
| `jira:workflowCondition` is expression-based and **fails closed** (non-boolean, evaluation error, uninstalled app ⇒ false) | Forge manifest reference, "Jira workflow condition (Preview)", fetched 2026-11-04 |
| Condition context variables `user, issue, project, transition, workflow, config, groupOperator, customerRequest, serviceDesk` | same |
| Condition cannot call app code; it evaluates a Jira expression | same |
| `@forge/resolver`, `@forge/kvs` `storage.*`, `@forge/api` `api.asApp().requestJira`, `route` tagged template | Forge runtime docs (as previously cited in `docs/P1-IMPLEMENTATION-REPORT.md`) |

### INFERRED — believed correct, not observed

| Item | Why it is inferred |
| --- | --- |
| Jira expressions expose a custom field by id (`issue.customfield_NNNNN`) and by key (`issue['com.example.key']`) | Jira expressions type reference, "Issue" — corrected in P2.1; Phase 2 called this inferred |
| Entity properties **are** in the expression context (`issue.properties`) | Jira expressions type reference lists `properties` on `Issue`. **This corrects Phase 2**, which assumed the opposite. The field-based condition is kept by design; the property path is untested in a workflow condition |
| A workflow-condition expression is static and cannot resolve a field at evaluation time | Forge manifest reference: `expression` is a manifest string. Hence the resolved-id step |
| Read-only app fields are not rendered on issue create, transition or portal request screens | Forge manifest reference, "Read-only fields" |
| A field hidden in the active field configuration reads as `null` in Jira expressions | Jira expressions type reference — the reason Step 5 of the runbook exists |
| `PUT /rest/api/3/app/field/{fieldIdOrKey}/value` returns 204 and only the owning app may call it; `write:app-data:jira` is documented as optional today and planned to become mandatory | REST v3, "Issue custom field values (apps)" |
| `/rest/api/3/search/jql` exists on this site | `search/jql` is the current endpoint; the site's behaviour was never called |
| `read:jira-user` is the scope behind the person picker | Matches the REST scope table; install-time consent not observed |
| `projectTypes: [company-managed]` accepts a JSM project | JSM service projects are company-managed; not exercised by `forge deploy` |

### NOT TESTED — code exists, nothing has run it against a real site

- Every resolver in this build: `relay.*` was executed only against `test/support/fake-forge.js`.
- KVS behaviour under real latency, eventual consistency, and concurrent invocations.
- Issue property writes and app-field writes on a real issue.
- That Jira resolves `schema.custom` for a deployed `jira:customField` to the
  module id Relay computes from `localId` (the lookup is exact-match on that id).
- The six expression states against a real site (zero, positive, missing field,
  null field, invalid value, expression failure). They are mirrored in JS and
  tested there; only Jira evaluates the real expression.
- Whether a read-only app field can be read by a workflow condition in a JSM
  project when it is not on the portal screens — the runbook adds it to a screen
  precisely because this is unproven.
- ADF→text projection against real JSM comment bodies (including mentions, inline
  cards, and truncated `body` when `maxResults` paginates).
- Comment pagination beyond the first page.
- The `search/jql` → `search` fallback path.
- The workflow validator being **attached** to the closure transition of the
  product app (the probe app's attachment does not transfer).

### BLOCKED in this environment

| Blocked | Reason |
| --- | --- |
| `npx @forge lint` | CLI exits 1 with no output (needs Atlassian network / auth). Tried `@forge/cli@15` and `@latest`; the node engine requirement is also unmet (22.22 vs ^22.23.4). A local `app/test/contract.test.js` checks the manifest instead. |
| `npx @forge deploy`, `install`, `tunnel` | No Atlassian network, no app registration, no credentials — and credentials must not be requested here. |
| Any live Jira REST call | `curl` to `*.atlassian.net` returns 000 from this sandbox. |
| Portal closure path on the real site | Requires a deployed condition attached to the transition. **No claim is made that the portal is protected by this build.** |

BLOCKED is not PASS.

---

## 6. Tests and build — executed here

```
cd app && npm test
# tests 140, pass 140, fail 0

cd app/ui && npx tsc --noEmit      # clean
cd app/ui && npm run check:render  # 6 screens, all expected content, no forbidden values
cd app/ui && npx vite build        # emits app/static/relay (gitignored)
```

What the 99 tests cover: field identity and the six expression states, field
resolution, the private write path, read-back verification, guard ordering and
reconciliation (28), ADF projection and anchoring (7), storage semantics including
lock/digest/concurrency (8), resolver behaviour against a simulated Jira (12), the
end-to-end slice and rejection path (2), the pre-existing ledger, gate, projection,
sync, workflow and audit suites (33), and manifest/console contract checks (9).

The slice test (`app/test/slice.test.js`) walks the twelve live steps as far as a
simulator can: load → scan → accept → reload from the same storage → workspace →
gate refuses → validator refuses → reassign → verify → gate allows → field agrees.
Step 12 of the live list (a customer attempting closure through the portal) is not
reachable from Relay's own code and is **not** claimed.

---

## 7. Limitations, stated rather than hidden

1. **No atomicity.** Forge KVS and Jira issue properties are separate stores with
   no transaction spanning them. Relay orders writes so the failure mode is
   "blocked", never "silently open", and reports diagnostics when the layers
   disagree. It does not claim the write is atomic.
2. **The lock is advisory.** Detection, not exclusion (§3).
3. **The expression is static; the field id is not.** A Jira expression is a
   manifest string, evaluated by Jira with no way to look up a field at
   evaluation time. Relay resolves the id, prints the exact line, and refuses to
   guess — but one paste-and-redeploy remains (runbook Steps 3–4). Until it is
   done, the expression names a field that does not exist, which Jira treats as
   false: closed to customers, never silently open.
4. **A hidden field is null inside the condition.** If the app field is not in
   the project's active field configuration, the expression sees `null` and
   refuses everyone. That is fail-closed and indistinguishable from a real
   refusal, which is why the runbook makes adding it to a screen a prerequisite.
5. **`write:app-data:jira` is declared but currently optional** according to the
   REST docs. Relay declares it now so the day it becomes mandatory is not an
   outage.
4. **An unreviewed candidate fails closed.** A machine-suggested candidate holds
   closure until a person accepts or rejects it; the refusal names it as "still
   awaiting review". This is deliberate: the extractor must not be able to open a
   case by guessing, and a human decision must be the thing that closes one. The
   cost is that a false positive needs one human click to clear.
5. **The portal still cannot show Relay's reason.** The condition is silent by
   nature. The console says so in the closure panel; no customer-facing messaging
   was added.
6. **Workflow attachment is not observable from the app.** Settings shows
   "Not verified" and explains that registration is confirmed on the site, because
   an app cannot read a workflow's configuration.

---

## 8. Deploying it yourself — exact commands

> **Superseded by `docs/P2.1-RUNBOOK.md`.** The steps below describe the Phase 2
> hand-made field and must not be followed for P2.1. They remain for history.

Prerequisite: Node ≥ 22, and your own already-authenticated Forge CLI. Run from the
repository root. Nothing here needs a token pasted anywhere.

```bash
cd app
npm install                       # only if app/node_modules is missing
npm --prefix ui install           # only if app/ui/node_modules is missing

npm --prefix ui run build         # emits app/static/relay (required by the manifest resource)
npx --yes @forge/cli login        # opens the browser, once per machine
npx --yes @forge/cli register     # writes a real app id into app/manifest.yml — DO NOT COMMIT IT
npx --yes @forge/cli deploy
npx --yes @forge/cli install --site onepes930.atlassian.net --product jira --environment development
```

Then, on the site (this is the part no code can do for you):

1. **Create the number field.** Project settings → Fields → add a *Number* field,
   e.g. "Relay open commitments". Note its id (`customfield_NNNNN`).
2. **Put the id in the manifest.** Replace `customfield_10077` in
   `app/manifest.yml` (`jira:workflowCondition.expression`) and redeploy.
3. **Set the same id in Relay.** Settings → Enforcement → Condition field → Save.
4. **Attach the validator.** Workflow → the closure transition → Validators →
   "Relay closure gate".
5. **Attach the condition.** The same transition → Conditions → "Relay closure
   readiness".
6. **Reconcile.** Settings → Enforcement → Reconcile and check. It reports the
   ledger revision, the projection's `open`, the field value, and any diagnostic.
7. **Walk the twelve steps** on an `FS` issue: load → scan → accept → reload →
   Case Workspace → change owner → gate consistent → closure refused → verify →
   ledger and projection updated → closure permitted. Test agent, REST and portal
   separately; the portal path is only proven once the condition is attached and
   observed refusing.

A local build is not a deployment. Until step 5 is done on the site, this build
protects agents and the API only.

---

## 9. Files changed in this phase

Phase 2.1 adds `app/src/field.js`, `app/test/field.test.js` and
`docs/P2.1-RUNBOOK.md`, and changes the manifest, `sync.js`, `handlers.js`,
`workspace.js`, `store.js`, `jira.js` and the Settings screen. §10 below.

New: `app/src/{adf,extract,jira,store,workspace,handlers}.js`,
`app/test/{extract,store,handlers,slice,contract}.test.js`,
`app/test/support/fake-forge.js`, this document.

Rewritten: `app/src/resolvers.js` (thin Forge binding over `handlers.js`).

Modified: `app/src/ledger.js` (helpers), `app/src/projection.js` (guard is stale),
`app/src/sync.js` (guard handling), `app/manifest.yml` (condition expression,
`read:jira-user`, `external` removed), `app/ui/src/App.tsx` (scan wiring, bridge
error state), `app/ui/src/lib/{api,types,format}.ts`, `app/ui/src/screens/{CaseWorkspace,Overview,Settings,types}.tsx`,
`app/ui/src/styles/screens.css`.


---

## 10. Phase 2.1 — the app-owned closure field

### 10.1 What the app declares

```yaml
modules:
  jira:customField:
    - key: relay-closure-count
      name: Relay open commitments
      description: Relay's internal closure projection: the number of unresolved
        commitments on this issue. Read-only, written only by Relay. A workflow
        condition reads it to withhold closure.
      type: number
      readOnly: true
```

One locked field instance is created per app and environment at deploy time
("Field lifecycle", Forge manifest reference). It is read-only for users and for
the Edit Issue API, and it disappears when the app is uninstalled.

The manifest does **not** declare a `resolver` for the field. The property table
says `resolver` is required, but the same page's own manifest example omits it,
and a static read-only field has no value function or edit experience to resolve.
`forge lint` would settle it, and it cannot run here (**BLOCKED**). If lint
complains, the fix is one line — `resolver: { function: relay-field-resolver }` —
and `relay-field-resolver` does not exist yet, so the field block would need a
function module too. This is recorded as the one schema ambiguity in the change.

### 10.2 How the identifier is obtained

| Step | Mechanism |
| --- | --- |
| Type id | Derived from the invocation context: `context.localId` is `ari:cloud:ecosystem::extension/{appId}/{environmentId}/static/{invoked-module}`; Relay keeps the app and environment segments and appends `/static/relay-closure-count` |
| Numeric id | `GET /rest/api/3/field`, matched **exactly** on `schema.custom === typeId` (Forge documents that field as the module id) |
| Cache | `relay:settings` stores `closureFieldId`, `closureFieldKey`, `closureFieldTypeId`, `closureFieldResolvedAt` |
| Invalidation | A different `typeId` (another environment) discards the cache and looks the field up again, so an app promoted from development to production never writes into the previous environment's field |
| Failure | No match, no `localId` and no cache ⇒ `resolved: false`. Nothing is written; `relay.enforcement.check` reports `closure_field_unresolved`. **Unresolved is never reported as 0** |

The console renders this at Settings → Enforcement → Closure field, with a copy
button for the exact manifest line. `relay.field.resolve` returns the same data.

### 10.3 How the value is written

```
PUT /rest/api/3/app/field/{fieldIdOrKey}/value
{ "updates": [ { "issueIds": [ 10042 ], "value": 1 } ] }
```

- `issueIds` are numeric Jira issue ids, so the write fetches the issue and uses
  its `id` — a key is not enough.
- The call is made as the app (`api.asApp().requestJira`).
- Errors are typed (`AppFieldError`) with the reason mapped: `403`
  `not_field_owner_or_missing_scope`, `404` `field_not_found`, `400`
  `value_rejected`, `5xx` `jira_unavailable`, `429` `rate_limited`. None of them
  is retried as if it were success, and none is read as a zero.
- **A 204 is not proof.** After every write the value is read back through
  `GET /rest/api/3/issue/{key}?fields={fieldId}` and compared with the ledger. A
  mismatch throws `field_write_unverified` and becomes a diagnostic; the guard
  path throws `guard_field_write_unverified` and aborts the mutation instead.
- The Edit Issue API path (`writeField`) was **removed**. The contract test fails
  if it comes back.

### 10.4 Scopes

| Scope | Used for |
| --- | --- |
| `storage:app` | ledger, audit, settings |
| `read:jira-work` | issues, comments, field reads, field search |
| `write:jira-work` | issue properties (the projection) |
| `read:jira-user` | person picker / assignable users |
| `write:app-data:jira` | the private app-field write; documented as optional today and planned to become mandatory |

### 10.5 The condition and what backs each claim

The expression Relay prints is:

```
issue.customfield_NNNNN == 0
```

| State | What the expression returns | Effect |
| --- | --- | --- |
| `0` — zero unresolved | `true` | transition offered |
| `1` or more | `false` | transition withheld |
| field missing (wrong id, module not deployed) | evaluation error | Jira treats an error as `false` — withheld |
| field `null` (never written, or hidden by field configuration) | `false` | withheld |
| invalid value (`"0"`, object, negative) | `false` | withheld |
| expression evaluation failure | `false` | withheld |

**DOCUMENTATION VERIFIED**: expressions are fail-closed on error and on
non-boolean results; `issue.<customfield id>` is the documented access form;
hidden fields read as `null`; read-only fields are not rendered on create,
transition or portal screens.

**NOT TESTED**: everything about how Jira actually behaves on this site. The six
states above are mirrored in `evaluateClosureValue()` and covered by tests, but a
mirror is not Jira. In particular, whether a read-only app field can be read by a
workflow condition in a JSM project when it is absent from the portal screens is
**not proven** — which is why the runbook adds it to a screen first.

**Corrected from Phase 2**: `issue.properties` *is* documented on the Jira
expressions `Issue` type, so Phase 2's "expressions cannot read entity
properties" was wrong. The field-based condition is kept because the brief
requires an app-owned field, not because the property path is unavailable.

### 10.6 Consistency tests added

`app/test/field.test.js` proves, against the simulated site:

- the type id is derived from the app and environment, not from the invoked module;
- the id is discovered once and cached, and re-resolved when the environment changes;
- an unresolved field writes nothing and is never reported as zero;
- writes go through the private API with the numeric issue id, never Edit Issue;
- a refused write stops the mutation before the ledger moves;
- a 204 that did not change the value is caught by read-back;
- a Jira failure during reconciliation is reported as a failed case, not a success;
- the ledger and the field agree after scan, accept, verify and drop;
- a missing field is repaired from the ledger, including the initial zero;
- a stale field does not open the gate, and reconciliation repairs it;
- duplicate decisions do not write the field twice;
- two concurrent decisions leave the field equal to the ledger;
- the field is written **before** the ledger whenever the count is about to rise;
- reconciliation reports partial repairs as partial;
- sync does not rewrite a field that already matches.

One defect was found and fixed by these tests: `relay.capture.scan` previously
increased the unresolved count (a suggestion counts as unresolved) without
writing the projection or field, so the portal could have read "zero" while a
candidate awaited review. The scan now goes through the same guard ordering as
every other mutation, and `syncIssue` treats a field that disagrees with the
ledger as stale even when the projection is fresh.

### 10.7 Remaining manual actions

1. Register the app once, with its own identity (`npx @forge register`; do not commit the id).
2. Deploy and install (`npx @forge deploy`, `npx @forge install --site … --product jira`).
3. Read the resolved field id from Settings → Enforcement → Closure field.
4. Paste the printed expression into `manifest.yml` and deploy again.
5. Add the field to the project's screens.
6. Reconcile every tracked case.
7. Attach **Relay closure gate** (validator) and **Relay closure readiness**
   (condition) to the closure transition.
8. Walk the twelve steps, including the portal, with the condition attached.
9. Press **Record as deployed** so the console stops warning about the manifest.

Everything in this list requires Atlassian access this environment does not have.

---

## 11. Phase 2.2 — management state, conditional commits, append-only audit

Full runbook: [`docs/P2.2-RUNBOOK.md`](P2.2-RUNBOOK.md). This section is the
summary and the corrections this phase makes to §3, §5 and §7 above.

### 11.1 What changed

| P2.1 | P2.2 | Why |
| --- | --- | --- |
| one app-owned field (count) | two (count + management state) | a number cannot say "Relay does not manage this issue"; zero would permit a case Relay has never recorded |
| advisory lock, mutation ran even when the lock was not acquired | conditional commit on `rev` via `kvs.transact().set(..., { conditions: Filter.equalTo('rev', expected) })` | the lock was never a guarantee, and KVS has no compare-and-swap |
| ledger read-modify-write with a read-back | record read, mutate, **conditional commit**, retry on conflict | a lost update was possible between the write and the read-back |
| audit: one key per issue, `get → prepend → set` | one key per event, `FAIL_IF_EXISTS`, prefix-paginated reads | concurrent appends lost events silently |
| an issue with no ledger was **permitted** | an issue with no record is **withheld** | "missing" is not "unmanaged" |
| reconcile counted `no_ledger` as already in step | `noLedger` / `initializing` / `failed` / `inaccessible` are reported categories | a missing record is a failure to record, not a success to hide |
| track was a list edit | lifecycle: `initializing` → capture → `managed`, every write verified | an interrupted capture left a "managed" issue with no code path back |

### 11.2 The record, and the entity it lives in

The record (`issueKey`, `rev`, `state`, `digest`, `commitments`, `version`,
`updatedAt`, plus the lifecycle metadata `source`, `trackedBy`, `managedAt`,
`untrackedAt`, `untrackedBy`, `backfilledAt`) is a Custom Entity Store entity
`relay-ledger`, declared in `manifest.yml` under `app.storage.entities`.
Attribute types are enforced by the store, so the declaration is exhaustive — and
so is the writer: `src/record-codec.js` holds the same attribute list, strips
every `null` on the way in and restores it on the way out (§11.6). `rev` is what
every commit is conditioned on; `state` is what the condition reads.

### 11.3 The condition, restated

```
(issue.<stateField> == "unmanaged") || (issue.<stateField> == "managed" && issue.<countField> == 0)
```

`unmanaged` permits; `managed` permits only on an exact numeric zero;
`initializing`, null, any other string, and any expression error refuse. The
validator asks `decideClosure` over the same record, so the two cannot disagree
about an issue (`test/p2-2.test.js`, check 12).

### 11.4 Corrections to this document

* **§3** says the projection is the only thing the condition can see. In P2.2 it
  reads *two fields*, and the state field is what makes an unmanaged issue
  permitted.
* **§5** lists "an untracked issue is not blocked" as a verified property. That
  is now the opposite: an issue with no record is withheld. `test/workflow.test.js`
  and `test/p2-2.test.js` assert the new rule.
* **§7** says `@forge/kvs` storage is last-write-wins with no CAS. True for
  `kvs.set`; the **Custom Entity Store** transaction API is the exception P2.2
  uses. The old claim was too broad.
* `import { storage } from '@forge/kvs'` (P2.1's binding) does not exist in
  `@forge/kvs@2.1.1` — the export is `kvs`. Fixed in `src/deps.js`.

### 11.5 Verification

```
npm test                 177/177   (140 P2.2, 142 P2.2.1, 161 P2.2.2,
                                    170 P2.2.2 review, 177 read validation)
npx tsc --noEmit         clean
npm run check:render     all screens rendered
npm run build            ok
npm run check:manifest   17 checks: YAML parsed, structure, Forge schema,
                         entity attributes compared with record-codec.js
```

Not verified, and stated as such: `forge lint`, `deploy`, `install`, any live
Jira REST call, the real field-instance creation, and — in this sandbox — the
1440/390 screenshots (no browser available; see the runbook §8). The runbook §9
is the sequence to run on a machine with a Forge login.

### 11.6 P2.2.2 — the record the store will accept

§11.2's claim that the declaration was exhaustive was true of the manifest and
false of the writer. The first Track after P2.2 deployed failed with
`HTTP 422 UNPROCESSABLE_ENTITY` at `src/forge-store.js` `entity.set()`:

* the record carried `source` and `trackedBy`, which the entity did not declare;
* it carried `null` — `trackedBy` at the top level, and inside every commitment
  (`owner`, `dueAt`, `acceptedBy`, `verificationNote`, and five nullable fields
  in `evidence`). The Custom Entity Store has no null value of any type, `any`
  included, and rejects an empty string too;
* the created record had **no `digest`**, because `emptyLedger()` did not set one
  and `initialise()` wrote it verbatim.

The fix is one boundary: `src/record-codec.js` encodes a record for the entity
and decodes it back. A null (or empty string) is **omitted**, not defaulted —
"absent" and "null" mean the same thing here, *not recorded* — and the decoder
restores the nulls from an explicit list of nullable keys, so the record a caller
reads has the shape it wrote. An undeclared attribute, a non-finite number or a
null array element is a `RecordShapeError` **before** the network call: a failed
storage write is reported, never retried as a conflict and never reported as
success. Declaration is tested with `Object.hasOwn` (an inherited name such as
`toString` is not an attribute), and both the top-level record and nested objects
are assembled with `Object.fromEntries`, so a `__proto__` key is data rather than
a prototype write.

Reading is asymmetric on purpose. An attribute this build does not know survives
a read (forward compatibility) but is refused on a write, so nothing is dropped
silently. Core state is required rather than defaulted: `issueKey`, `rev`,
`version`, `state`, `commitments` and `updatedAt` must be present and sane, and a
record missing one throws — a fabricated `rev` breaks the conditional write, and
a fabricated empty `commitments` would read as *nothing open* and permit closure.
The only legacy repair is the digest, for records created before P2.2.2; a
present-but-unusable digest is treated as corruption, not repaired. `emptyLedger()` now carries `digestOf([])`, and `initialise()` verifies
the revision, the state and the digest of what it reads back.

Two more read-time rules close the fail-open side of that contract. First, a
commitment status outside `proposed`/`open`/`verified`/`dropped` is refused at
`commitments[n].status`: `isUnresolved()` answers false for anything it does not
recognise, so a lost or corrupted status would count as settled and drop out of
the open count the closure condition reads. Those four are the only values the
codebase has ever written. Second, a present digest is *verified* against the
stored commitments and a mismatch throws at `digest` — never repaired, because
the disagreement is the only evidence that the record does not describe its own
contents. Both rules also run on the way in, so `toStored` refuses to write a
record that could not be read back: a stored-but-unreadable record fails closed
on every later read, which is worse than a local error.

The digest covers `code`, `status`, owner identity, `dueAt` and `text`: the
fields Relay decides from, plus the wording a person accepted. It does not cover
the `evidence` chain or the acceptance/verification provenance, and it is
documented as a same-revision consistency check rather than tamper evidence —
FNV-1a is 32 bits and unseeded, so the revision in the conditional write is the
real guard. The algorithm is frozen because reads now verify it: changing which
fields it hashes would make every stored record fail its own check and withhold
closure project-wide. A versioned `v2:` algorithm is the path if the guarantee is
ever restated as record-wide integrity (runbook §13.2.2 has the coverage table).

The fake record store now stores the encoded record and enforces the service's
value rules (declaration by own property too), so the whole suite runs under them: a null that reaches it fails the
test with the service's complaint. That is what `test/p2-2-2.test.js` (34 tests)
covers, including the live lifecycle: initial Track, a Track with no account id,
console tracking, the managed transition, untracking, trigger and backfill
creates, commitments with optional fields, and a codec round trip.

**Not claimed:** that the live 422 is fixed. The corrected build has not been
deployed and no Track has run against Jira. The remaining live uncertainty is the
one assumption this cannot prove offline — that the entity store accepts a record
that *omits* a declared optional attribute (the alternative would be to invent a
placeholder value, which is worse). Runbook §13 has the verification steps.
