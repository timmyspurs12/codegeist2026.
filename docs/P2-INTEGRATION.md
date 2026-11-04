# Relay Phase 2 — real Jira integration

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
- **Condition field** (`customfield_…`, configured per site) mirrors `open` so a
  Jira expression can read it.
- **Validator** (`createClosureValidator`) reads the ledger at transition time and
  can explain itself.

Write order for any mutation that could increase `open`:

```
1. guard projection   (only if planned open > 0 and not already blocking)
2. ledger write       (rev + digest read-back verification)
3. projection + condition field
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
| Jira expressions expose a custom field as `issue.customfield_NNNNN` | True for Jira expressions generally; the condition doc's own example only shows `issue.assignee` |
| Entity properties are **not** in the expression context (hence the numeric field) | Not contradicted by the docs; not demonstrated either |
| `/rest/api/3/search/jql` exists on this site | `search/jql` is the current endpoint; the site's behaviour was never called |
| `read:jira-user` is the scope behind the person picker | Matches the REST scope table; install-time consent not observed |
| `projectTypes: [company-managed]` accepts a JSM project | JSM service projects are company-managed; not exercised by `forge deploy` |

### NOT TESTED — code exists, nothing has run it against a real site

- Every resolver in this build: `relay.*` was executed only against `test/support/fake-forge.js`.
- KVS behaviour under real latency, eventual consistency, and concurrent invocations.
- Issue property writes and the condition field write on a real issue.
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
# tests 71, pass 71, fail 0

cd app/ui && npx tsc --noEmit      # clean
cd app/ui && npm run check:render  # 6 screens, all expected content, no forbidden values
cd app/ui && npx vite build        # emits app/static/relay (gitignored)
```

What the 71 tests cover: ADF projection and anchoring (7), storage semantics
including lock/digest/concurrency (8), resolver behaviour against a simulated Jira
(12), the end-to-end slice and rejection path (2), plus the pre-existing ledger,
gate, projection, sync, workflow and audit suites (42), and manifest/console
contract checks (8).

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
3. **The condition field id is site configuration.** Jira expressions cannot read
   app entity properties, so a numeric field must exist and its id must be set in
   both `manifest.yml` and Relay's Settings. A field id that does not exist makes
   the expression fail, which Jira treats as false — closed to customers.
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

New: `app/src/{adf,extract,jira,store,workspace,handlers}.js`,
`app/test/{extract,store,handlers,slice,contract}.test.js`,
`app/test/support/fake-forge.js`, this document.

Rewritten: `app/src/resolvers.js` (thin Forge binding over `handlers.js`).

Modified: `app/src/ledger.js` (helpers), `app/src/projection.js` (guard is stale),
`app/src/sync.js` (guard handling), `app/manifest.yml` (condition expression,
`read:jira-user`, `external` removed), `app/ui/src/App.tsx` (scan wiring, bridge
error state), `app/ui/src/lib/{api,types,format}.ts`, `app/ui/src/screens/{CaseWorkspace,Overview,Settings,types}.tsx`,
`app/ui/src/styles/screens.css`.
