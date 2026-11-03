# E1 — Enforcement validation (workflow validator, live)

**Status: IN PROGRESS.** This document is a running log, updated as each step is
observed. It is not a verdict until the status line above says PASS or FAIL.

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

### 2.4 Not established
- That the rule **blocks** anything. Nothing has yet been refused.
- That the rule is **invoked at all** on an allowed transition (see A13 caveat).
- Behaviour from the **board**, from **bulk change**, from the **REST API**.
- Whether a **post function** on the same transition is suppressed when the rule
  blocks it.
- Behaviour when `blocking = 0`.
- Anything at all about **team-managed** projects, the Case/ESM workflows, or
  customer-visible transitions.

---

## 3. Remaining steps

| # | Step | Expectation |
|---|---|---|
| E1.0a | deploy the `lab-request.js` fix, re-probe `?action=bogus` | **done** — parameters arrive |
| E1.0b | add `storage:app`, deploy, `forge install --upgrade` | kvs read/write permitted |
| E1.1 | `Mark as done` on `FS-1` with **no gate state** | proceeds — fail-open (run in A13) |
| E1.2 | write gate state `blocking=2` for `FS-1` | state stored, message computed |
| E1.3 | `Mark as done` on `FS-1` from the issue view | **refused**, message with counts |
| E1.4 | same attempt from the board, if one exists | refused identically |
| E1.5 | same attempt via `POST /rest/api/3/issue/FS-1/transitions` | **HTTP 400** |
| E1.6 | write `blocking=0` | transition proceeds again |
| E1.7 | post function on the same transition (T9) | not run when blocked |

---

## 4. Changed files

| File | Change |
|---|---|
| `phase0/e1/screenshots/*.png` | 36 screenshots of this run (evidence) |
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
