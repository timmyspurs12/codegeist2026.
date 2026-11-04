# E1 — Enforcement validation (workflow validator, live)

**Status: PASS — core question answered live.**

`jira:workflowValidator` **blocks** a transition on a company-managed project, from
the issue view and from the REST API, with a message built from stored state at
call time; it **releases** the same transition when the stored count is zero; and a
refusal **does not apply** the transition.

That PASS covers exactly what §2.1 lists. What it does not cover is in §2.4, and
none of that should be implied by this verdict.

**Question E1 answers:** `jira:workflowValidator` is *offered* in Jira's workflow
configuration (proven in T12). Does it actually **block** a transition, and with
what behaviour?

**Environment**

| Item | Value |
|---|---|
| Site | `onepes930.atlassian.net` |
| Project | Facilities (`FS`) — company-managed |
| Workflow | `FS: Jira Service Management default workflow` (used in 1 space) |
| Transition under test | `Mark as done` — Open / Work in progress / Reopened → **Done** |
| Test work item | `FS-1` — work type `Task`, request type `None` |
| Rule | `Relay closure gate (probe)` (module group `relay-phase0-probe`) |

**Evidence rule for this document.** Every claim carries one of:
LIVE VERIFIED (seen on screen in this site), OPERATOR-REPORTED (the operator says
so, not independently seen), INFERRED (follows from something else), NOT TESTED.
A screenshot that would look identical whether or not the step worked is not
evidence of the step — see §2.3.

---

## 1. Action log

### A1 — create the test work item (`FS-1`)
- Clicking **Create** does *not* open a plain create form. It opens a Service
  Management **request form**, pre-selecting request type `Report a maintenance
  issue` in space `Facilities support (FS)`. [LIVE VERIFIED — image-28..31]
- The form carries a **Work type** dropdown, which is the escape hatch out of the
  request path. It offers: Report a maintenance issue, Request a move, Request an
  event, Questions for facilities, Emailed request, **Task**, Case. [image-32]
- Selecting **Task** rebuilds the form as a plain work item: `Request type`
  resolves to `No request type`, `Use request type fields` greys out, and
  **Summary** is the only field requiring input. [image-36..38]
- Summary entered exactly `Relay E1 gate test`; everything else default. [image-39]
- Result: **`FS-1`**, status `Open`, request type `None`, reporter `Pes one`.
  [image-40]
- **`FS-1` is the first work item ever created in this project** — the project
  held nothing before it. Blast radius of any subsequent misbehaviour is one issue.

### A2–A3 — reach the editor
- Site-level workflow admin: `https://onepes930.atlassian.net/jira/settings/issues/workflows`.
  Four `FS:` workflows are listed, all included in Facilities support and all in
  *Jira Service Management IT Support Workflow Scheme generated for Space FS*.
  [image-41]
- The scheme page independently confirms the mapping: `FS: Jira Service Management
  default workflow` carries **Task** and **Sub-task**. [image-42]
- Route into the editor: row **···** → **Edit**. Editor opens with
  `Update workflow` greyed and `Used in 1 space`. [image-43]

### A4–A5 — the transition panel
- Clicking `DONE` opens its status panel: `Incoming 1` = `Mark as done` from
  Open / Work in progress / Reopened; `Outgoing 1` = `Reopen issue` → Reopened.
  [image-44]
- The transition panel shows four rule sections — **Restrict transition**,
  **Request input** (badge 1, a screen: the "Jira Service Desk Resolve Issue
  Screen (1)"), **Validate details**, **Perform actions**. [image-47]

### A6–A8 — attach the rule (the write, part 1)
- `Add validate details rule` → **Add rule** picker lists `Relay closure gate
  (probe)` first, above every built-in Jira rule, grouped under MARKETPLACE RULES
  → `relay-phase0Probe`. [image-49]
- Selecting it opens a configuration screen that states **"This rule requires no
  configuration."** and asks only which transition it applies to (already
  `Mark as done`). [image-50]
- After **Add**, the rule appears inside **Validate details** with badge `1` and
  the label `relay-phase0-probe`. [image-51]

### A9–A10 — publish (the write, part 2)
- With the rule staged, `Update workflow` turns blue and a **Discard changes**
  button appears beside it. [image-52]
- `Update workflow` pressed. No confirmation dialog was surfaced; the editor
  returned to `Update workflow` greyed, `Discard changes` gone, `Close` restored.
  The rule was still displayed. [image-53]

### A11 — persistence check
- The editor was **closed and reopened** via `···` → `Edit`, and the rule is still
  present under **Validate details** with badge `1`. [image-56, plus the
  operator's confirmation that this was a fresh load]
- **See §2.3** — this step is what separates "staged" from "saved", and it was
  performed rather than assumed.

### A12 — the site had no resolutions at all (environment defect, not Relay)
- Submitting `Mark as done` failed with **"Resolution is required"** while the
  Resolution picker returned **`No matches found`**. [image-60]
- The admin page is reachable only by clicking **Jira admin settings → Work item
  attributes → Resolutions**. Both `/jira/settings/issues/resolutions` and the
  legacy `/secure/admin/Resolutions!default.jspa` return **404**. [image-62..65]
- The table was **empty**: no resolutions defined on the site.
- Consequence beyond this test: **on this site, no work item could be marked done
  in any project, by anyone**, until a resolution existed. This predates E1 and is
  unrelated to Forge or Relay.
- Fixed by adding a single resolution named `Done` (site configuration, reversible
  from the row's Actions menu). [image-66]

### A13 — fail-open baseline PASSES
- `Mark as done` on `FS-1` was submitted with a `Done` resolution and **succeeded**:
  status became `Done`, no error banner, no mention of Relay anywhere.
  [image-67..69]
- **Caveat, stated deliberately:** "the validator allowed the transition" and "the
  validator was never invoked" are indistinguishable from this observation alone.
  Only a refusal can prove the rule is in the code path. The blocking test (§3,
  E1.3) is what separates those two readings; this step alone proves only that
  publishing the rule **broke nothing**.

### A14 — webtrigger created, and found broken on first use
- `forge webtrigger list` → **"No webtrigger URLs created."** The manifest declared
  the trigger, but Forge mints a URL per installation on request. Created with
  `forge webtrigger create` (function `relayLab`).
- Calling it with `?action=state&key=FS-1&blocking=2&unowned=1&overdue=1` returned
  the **`env`** payload. Repeating with **`?action=bogus`** also returned the `env`
  payload — it should have returned `{"error":"unknown action: bogus"}` with 400.
- Diagnosis: the Forge webtrigger runtime passes
  `{ method, headers, body, path, userPath, queryParameters }` and **no `url`**
  (DOCUMENTATION VERIFIED, events-reference/web-trigger). `src/index.js` did
  `new URL(request?.url ?? 'https://probe.local/')`, so on every live call `url`
  was undefined, the fallback carried no query string, and `action` defaulted to
  `'env'` — silently, for every request. [LIVE VERIFIED + DOCUMENTATION VERIFIED]
- Why 71 unit tests missed it: they pass a synthetic `{ url }`, a shape the runtime
  never sends. A test double more convenient than the real event tests nothing
  about the real event.
- Fix: `src/lab-request.js` builds a URL from either shape; `index.js` now calls it.
  Eight regression tests use the documented runtime shape. **79/79 tests pass.**
- **NOT YET DEPLOYED.** The fix has no effect on the site until `forge deploy` runs,
  so the gate-state step (§3, E1.2) remains blocked.

### A15 — incidental: Forge LLM is live on this installation
- The `env` payload returned eight models, `configuredModel: claude-sonnet-4-6`,
  `llmError: null`. The `@forge/llm` module resolves and lists models here.
- This says **nothing** about extraction quality or forced tool-calling, which
  remain UNSCORED. It only retires the open question of whether the LLM module
  works on this environment at all.

### A16 — the published validator could never have blocked anything
- Writing gate state returned
  **`{"error":"Request principal is not authorized to use storage resource"}`**.
- Cause: `@forge/kvs` requires the **`storage:app`** scope in the manifest. The
  probe declared only `read:jira-work` and `write:jira-work`.
  [DOCUMENTATION VERIFIED — kvs-api reference]
- What that means for the rule already published on `Mark as done`: every
  `kvs.get` throws; `gate-handler.js` catches it, sets
  `state = { stateAvailable: false }`; `decideGate` then applies its fail-open
  policy and allows. **The validator has therefore never had access to gate state,
  and cannot block under any configuration.** [LIVE VERIFIED at the endpoint,
  INFERRED at the validator by the same scope governing both]
- **This re-reads A13.** The `FS-1` closure was allowed because a storage
  authorization error was swallowed, not because the ledger was empty. Behaviour
  was fail-open either way, which is why it looked correct. The mechanism was not.
- It also exposes a trap for the product: under `policy=fail-closed`, the same
  missing scope would have blocked **every** closure on the site. The probe's
  fail-open default is hiding a configuration error rather than reporting one,
  and the audit event it emits goes to a log nobody was watching.
- Fix applied to the manifest: `storage:app` added. **Not yet deployed** — a
  permission change forces a major version bump, a redeploy and
  `forge install --upgrade` (re-consent).

### A17 — the gate blocks a live closure (issue view)
- The scope fix was deployed as **3.0.0** (`--approve MAJOR_VERSION_RULE`) and
  installed with `forge install --upgrade`; the consent listed exactly one new
  scope, `storage:app`. The webtrigger URL was **not** reissued.
- Gate state for `FS-1` written: `blockingCount: 2`, `unownedCount: 1`,
  `overdueCount: 1`, `policy: fail-open`, `updatedAt 2026-11-03T10:04:47Z`.
  Response captured in `phase0/e1/evidence/gate-state-FS-1.json`.
- `FS-1` was reopened via `Reopen issue` (no validator on that transition) and put
  back to `Reopened`, then `Mark as done` was submitted with `Resolution: Done`.
- Jira **refused**. The transition dialog stayed open, carrying a red banner:

  > Relay has unresolved promises attached to this case. Review the obligation
  > ledger before closing it. (2 unresolved: 1 with no owner, 1 overdue)

  [image-70 → `E1-A17-blocked-on-mark-as-done.png`]
- The counts match the state written seconds earlier, so the message is derived
  from storage at call time. It is not a constant string in the app.

### A18 — the refusal did not apply the transition
- The dialog was cancelled; `FS-1` still read **`Reopened`** and `Mark as done` was
  still offered. No partial state change. [image-71 → `E1-A18-…png`]

### A19 — there is no board on this site
- `/jira/software/projects/FS/boards` → **404**. The app switcher lists Loom, Teams,
  Goals, Projects and **no Boards**. The project sidebar offers **Queues**, not a
  board. [image-72, image-73]
- **Board path: NOT APPLICABLE** in this environment. A JSM queue lists work but
  does not perform transitions, so it is not a substitute for the board test.

### A20 — the REST path is gated too
- `GET /rest/api/3/issue/FS-1/transitions` → `Mark as done` is **id 61**,
  `hasScreen: true`.
- `POST /rest/api/3/issue/FS-1/transitions` with
  `{"transition":{"id":"61"},"fields":{"resolution":{"name":"Done"}}}` returned:

  ```
  HTTP 400
  {"errorMessages":["Relay has unresolved promises attached to this case. Review
  the obligation ledger before closing it. (2 unresolved: 1 with no owner, 1
  overdue)"],"errors":{}}
  ```
- So integrations and automations have **no bypass**: the validator fires on the
  API path with the same message as the browser path.

### A21 — the gate releases when the count is zero
- State rewritten with `blocking=0`: `blockingCount: 0`, `message: null`.
- The **identical** POST — same issue, same transition, same payload, same user —
  then returned **`HTTP 204`** and `FS-1` closed.
- The only variable was the stored count. The gate discriminates between "unresolved
  obligations" and "none", which is the difference between a validator and a lock.

### A22 — a post function was added to the same transition
- Under **Perform actions** on `Mark as done`: *Update a request field* → **Labels**
  → add `relay-postfunction-ran`, with "Add to the existing selections" and
  "Clear this field" off. Published; **Perform actions `1`** persisted.
  [image-77..84]
- Run order was chosen deliberately: the blocked run comes **first**, because a
  label is sticky. Had the control run gone first, its label would still have been
  on the issue during the blocked run and the evidence would have been worthless.

### A23 — blocked run: the post function did not run
- `blockingCount: 2` written (`updatedAt 2026-11-04T06:23:23Z`). `FS-1` reopened from
  `Done` to `Reopened` via `Reopen issue` (no rules on that transition), then
  `Mark as done` attempted.
- Refused with the same message; status stayed `Reopened`; **`Labels: None`**.
  [image-85..88]

### A24 — control run: the post function runs when allowed
- `blockingCount: 0`, `message: null`. The same transition was then submitted.
- It succeeded: status `Done`, and **`Labels: relay-postfunction-ran`**.
  [image-89]
- Same issue, transition, payload and post function; only the stored count differed.
- **T9 answered: post functions on the transition do not run when the validator
  refuses it.** A rejected closure leaves no side effect behind — no label, no field
  change, no comment.

### A25 — cleanup: the post function was removed, and the removal persisted
- The Perform actions rule was deleted, the workflow published, and then verified
  after a **fresh editor load**: Perform actions empty (no badge), Validate details
  still `1` with `Relay closure gate (probe)`, `Update workflow` grey and no
  `Discard changes`. [image-92..99]
- A Jira behaviour turned up during this and is worth recording: reopening the
  workflow editor once restored an **unpublished draft** (blue `Update workflow`,
  with no edit made since the load). Jira keeps editor drafts server-side per user.
  This is exactly why a reload is the only accepted evidence of persistence in this
  report — and why one earlier "grey button" reading was corrected rather than
  trusted.

---

---

## 2. What is established so far

### 2.1 Proven (LIVE VERIFIED)
1. The rule **attaches** to a transition in a company-managed Service Management
   workflow.
2. The rule **saves**: `Update workflow` accepts the draft.
3. The rule **persists**: it survives closing and reopening the editor.
4. The rule takes **no configuration** — the module supplies no settings form.
5. Publishing a validator into this workflow produced **no confirmation dialog**
   and no visible warning about Preview status.
6. It **blocks a live transition**, from the issue view and from the REST API, with
   a message whose counts come from stored state at call time (A17, A20).
7. A refusal **does not apply the transition** — the status is unchanged (A18).
8. It **releases** when the stored count is zero: the identical request succeeds
   (A21).
9. A **post function** on the same transition does not run when the validator
   refuses, and does run when it allows (A23, A24).

### 2.2 A platform constraint recovered from the UI
The transition panel states, above the customer-transitions toggle:
*"Rules won't work when customer transitions are enabled."* The toggle
`Customers can make this transition` is **off** on `Mark as done`.
[LIVE VERIFIED — image-46/53]
This is why `FS-1` is a usable vehicle: it has no request type, so no customer can
reach it. It also means **any conclusion here does not transfer to a transition
where customers can act.** JSM customer-facing behaviour remains NOT TESTED.

### 2.3 The evidence distinction this document insists on
A rule that is staged-but-not-saved and a rule that is saved look identical in the
editor panel. The only separator is discarding the editor's in-memory state and
reloading from the server — which is what A11 did. Claims of persistence rest on
that reload, not on the panel still being on screen.

### 2.4 Not established — do not imply these from the verdict
- **Team-managed** projects (E3). Atlassian's community and docs say validators are
  inert there; nothing in this run tests a team-managed project.
- **Customer-facing** JSM transitions. Customer transitions were **off** on the
  tested transition, and Jira states on screen that rules do not apply when they
  are on.
- The **Case** and **ESM** workflows. Only the Task/Sub-task workflow
  (`FS: Jira Service Management default workflow`) was exercised.
- The **~25s synchronous budget** under real load. Every call here was a single
  manual invocation with a warm function.
- **Bulk change** and automation-rule transitions.
- Anything about **extraction quality** — Forge LLM is reachable (A15) but
  extraction remains UNSCORED.

---

### 2.5 State the site was left in

| Item | State |
|---|---|
| Validator on `Mark as done` | **still published** — deliberate, left for the team-managed and customer-transition questions |
| Post function used for T9 | **removed and published**; verified by reload |
| Gate state | `FS-1` at `blockingCount: 0`; no other work item has state |
| Resolutions | one resolution `Done` **added** (the site had none; see A12) |
| App version | `3.0.0`, development environment, `storage:app` granted |
| API token used for the REST test | **operator to revoke** — it is a credential and has served its purpose |

The validator being left published is a judgement call, stated plainly: it is inert
under the states listed above, because a missing gate state fails open. "Inert" here
is inferred from the policy and from `FS-1`'s stored count, not exhaustively tested
against every work item in the project.

---

## 3. Test ledger

| # | Step | Result |
|---|---|---|
| E1.0a | deploy the `lab-request.js` fix, re-probe `?action=bogus` | **done** — parameters arrive, 400 `unknown action` |
| E1.0b | add `storage:app`, deploy 3.0.0, `forge install --upgrade` | **done** — kvs read/write permitted |
| E1.1 | `Mark as done` with no gate state | **allowed** (A13) — but see A16: the allow was a swallowed storage error, so it is not evidence about an empty ledger |
| E1.2 | write `blocking=2` | **done** — state stored, message computed |
| E1.3 | `Mark as done` from the issue view | **REFUSED** with counts (A17) |
| E1.4 | same attempt from a board | **NOT APPLICABLE** — no board exists on this site (A19) |
| E1.5 | same attempt via REST `POST …/transitions` | **HTTP 400** with the same message (A20) |
| E1.6 | write `blocking=0`, repeat | **HTTP 204**, transition applied (A21) |
| E1.7 | post function on the same transition (T9) | **SKIPPED when blocked**, runs when allowed — control included (A23, A24) |

## 4. Changed files

| File | Change |
|---|---|
| `phase0/e1/screenshots/*.png` | 63 screenshots of this run (evidence) |
| `phase0/e1/evidence/gate-state-FS-1.json` | the state write that produced the refusal |
| `phase0/E1-VALIDATION-REPORT.md` | this document |
| `phase0/validator-probe/src/lab-request.js` | **new** — builds a URL from the webtrigger event (runtime or synthetic) |
| `phase0/validator-probe/src/index.js` | one line: use `requestUrl(request)` instead of `request?.url` |
| `phase0/validator-probe/test/lab-request.test.js` | **new** — 8 regression tests using the documented runtime event |
| `phase0/validator-probe/manifest.yml` | added `storage:app` scope — without it the validator can never read state |

The probe's validator path is untouched: `gate-handler.js`, `gate.js` and the
`jira:workflowValidator` function are unmodified, so the rule already published on
`Mark as done` keeps the exact behaviour it was published with. No manifest change. The live Jira site *was* changed:
the validator is now published on `Mark as done` in the Facilities workflow. Removal
is the same route in reverse — open the rule, delete it, press `Update workflow`.
