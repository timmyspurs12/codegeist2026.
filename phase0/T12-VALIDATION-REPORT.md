# Relay — T12 validation report

**Test:** T12 — Preview-feature enablement. *Is `jira:workflowValidator` available on a fresh Atlassian development site, and does it appear in Jira's workflow configuration?*
**Specified by:** `RELAY-REVIEW-V2.1.md` §7, §10.1, §10.4 · `RELAY-V2.1-LIVE-BLOCKERS.md` Tier 1
**Branch:** `arena/06fd2e30-codegeist2026` · **Base commit:** `dff8a53`
**Executed:** 1 November 2026, on the operator's machine (the sandbox cannot reach Atlassian — see §11)

---

## Verdict

# PASS

`Relay closure gate (probe)` is offered in Jira's validator list, on a company-managed project's closing transition, on a site where **nothing was enabled for it**. No separate Preview opt-in step was required.

**Scope of the claim, stated up front:** this proves the module is *registered and offered*. It does **not** prove that attaching it blocks a transition. That is E1, and it has not been run.

---

## 1. What was tested, and where

| Item | Value | Source |
| --- | --- | --- |
| Site | `onepes930.atlassian.net` | screenshot, URL and page header |
| Product | Jira + Jira Service Management | project navigation |
| Project | **Facilities**, key `FS`, **company-managed** | confirmed by Jira's own workflow admin (§2.2) |
| Workflow | `FS: Jira Service Management default workflow` | workflow scheme page |
| Transition | **`Mark as done`** — into `DONE`, from `Open` / `Work in progress` / `Reopened` | transition editor |
| App | `relay-phase0-probe` | manifest + operator report |
| App id | `ari:cloud:ecosystem::app/118c23d8-4834-4003-acd4-29dac97137b2` | operator report |
| Developer space | `Relay Development` | operator report |
| Forge CLI | 15.0.0 | operator report |
| Scopes approved | `read:jira-work`, `write:jira-work` | operator report |
| `forge lint` | passed, no issues | operator report |
| Deploy / install | deployed to development; installed on site | operator report |

**Evidence-provenance note.** The deploy, install, lint and CLI facts are **operator-reported** — I did not observe them, because this sandbox has no Atlassian access. Everything in §2 is taken directly from screenshots of the live site and is marked accordingly.

---

## 2. Live observations

Each step below is what the screen showed, in order.

### 2.1 Getting to the workflow

The Facilities project opens into the JSM service view (*Queues, Cases, Service requests, Reports, Knowledge Base, Customers, Channels, Email logs*). It has **no "Project settings" entry** — the modern Spaces navigation replaced it. Route used:

> ⚙ (Jira admin settings) → **Work items** → **Workflows** → `···` → **Edit**, on `FS: Jira Service Management default workflow`

### 2.2 Jira independently confirming the project is company-managed

Before reaching the editor, the **workflow scheme** page showed:

> **"Jira Service Management IT Support Workflow Scheme generated for Space FS" — SHARED BY 1 PROJECT**

with this mapping:

| Work type | Workflow |
| --- | --- |
| Case | `FS: Case Management workflow` |
| Report a maintenance issue, Request an event | `FS: Default ESM workflow for Jira Service Management` |
| Task, Sub-task | `FS: Jira Service Management default workflow` ← the one tested |
| Emailed request, Questions for facilities, Request a move | `FS: Simple ESM workflow for Jira Service Management` |
| All unassigned work types | `Jira Workflow (jira)` |

**Why this matters:** team-managed workflows never appear on this site-level admin page — they live inside their project and cannot be edited from it. Their presence here, attached to a scheme, is Jira's own statement that these are company-managed workflows. The "company-managed" claim is now confirmed by the platform rather than by configuration notes.

### 2.3 The transition, and where validators live

The editor showed the workflow diagram: `OPEN → IN PROGRESS → DONE`, with `PENDING` and `REOPENED`. `DONE` has exactly **one** incoming transition, `Mark as done`, reachable from three statuses.

The transition panel uses **new** terminology, which is worth recording because every older instruction — including V2.1's — uses the old names:

| New label in this Jira version | Old name |
| --- | --- |
| Restrict transition | Conditions |
| Request input | Transition screen |
| **Validate details** | **Validators** |
| Perform actions | Post functions |

`Validate details` was **empty** — no validators attached to this transition before the test.

### 2.4 The result

Clicking **"Add validate details rule"** opened the **Add rule** dialog. Its validator list contained, as the **first entry**:

> **Relay closure gate (probe)**
> *Blocks a transition while unresolved promises remain on the case.*

with the app's icon, above the built-in Jira rules (`Require a request to have a form attached`, `Require form submission on a request`, `Validate a field`, `Validate a request has been through a specific status`, `Validate parent requests are in a specific status`, `Validate that people have a specific permission`, …).

Screenshots: `phase0/t12/screenshots/T12-add-rule-dialog-relay-present.png`, `T12-add-rule-dialog-scrolled.png`, `T12-validate-details-empty.png`, `T12-mark-as-done-incoming.png`, `T12-workflow-editor.png`.

**Nothing was selected, added, or published.** The **Update workflow** button stayed greyed out throughout; the dialog was closed without choosing an entry.

---

## 3. The finding: there is no separate enablement step

V2.1 §7 raised the possibility that Preview features are "opt-in" in a way that requires a site-level action, which would mean a judge on a fresh site sees nothing. §4.4 of the previous revision of this report laid out two possibilities:

| | Meaning | Status after this test |
| --- | --- | --- |
| **A** | Nothing needs enabling; "opt-in" means opting in by **declaring the module in the manifest** | **CONFIRMED** |
| **B** | An undocumented site- or account-level Preview gate exists | **NOT PRESENT** in this environment |

No toggle, banner, admin setting or prompt was used at any point between installing the app and seeing the rule in the list. The documented procedure — declare, deploy, install, attach the rule in a company-managed project — was sufficient, and it is the *only* procedure the documentation describes.

This does not prove that no Preview gate exists anywhere in Atlassian's estate. It proves that on a standard fresh site, with a standard Forge app, none was encountered.

---

## 4. What PASS means, and what it does not

**Established (LIVE VERIFIED):**

- The app's `jira:workflowValidator` module registers with Jira's workflow configuration.
- It appears in the validator picker of a **company-managed** project's transition, with the manifest's `name` and `description` rendered correctly.
- No enablement step is required on a fresh site.
- The workflow editor, scheme page and rule dialog all behave normally with the app installed.

**Not established — and none of it is implied:**

| Question | Owner |
| --- | --- |
| Does attaching the rule **block** the transition, from issue view, board and REST? | **E1** |
| Are post functions suppressed on a blocked transition? | **E1 / T9** |
| Does adding the rule and publishing the workflow succeed? | **E1** (and it is a write — T12 deliberately did not do it) |
| Is the rule offered on the **Case** or **ESM** workflows (the request-facing ones)? | only the Task/Sub-task workflow was checked |
| Is it offered on **team-managed** projects? | E3 — the manifest declares both types; only company-managed was tested |
| Does the lambda payload arrive as documented? | E1 / T15 |
| Does it work on **JSM customer transitions**? | untested; the tested transition has "Customers can make this transition" **off** |

**A deployed, installed, lint-clean app was already known before this test** and told us nothing about the workflow editor. The thing that changed is one observation: the rule is in the list. That is the whole of the result.

---

## 5. V2.1 acceptance criteria, against the result

> "On a *freshly created* site with default settings, does the Relay validator appear in a company-managed workflow editor…" — V2.1 §7

> "A fresh site can run the validator without enabling anything undocumented — **Yes**" — V2.1 §10.4, day-0 gate

| Criterion | Result |
| --- | --- |
| Validator appears in a company-managed workflow editor | **PASS** |
| No undocumented enablement step needed | **PASS** |
| Rule is attachable to a closing transition | **Not tested** (would require adding it; T12 stopped short deliberately) |
| Blocks a transition | **Not in scope** — E1 |

**V2.1 §10.4's day-0 gate is now satisfied.** The Preview risk that V2.1 §7 ranked as a potential showstopper for judge reproducibility is closed in the favourable direction, for company-managed projects.

---

## 6. The documented procedure, as performed

The documentation was consulted before the live run and is unchanged by it:

> "Forge preview features are available to all users… However, preview features are **usually turned off by default**… for instructions on enabling them, **refer to their documentation**." — Forge release phases

> "The `jira:workflowValidator` module defines a validator that can be added to workflow transitions in **company-managed projects**." — module reference

The module's own page documents no enablement step, and none was needed. The procedure that worked, in full:

1. Declare `jira:workflowValidator` in the manifest.
2. `forge deploy` → `forge install --site <site> --product jira`.
3. Company-managed project → workflow editor → transition → **Validate details** → **Add validate details rule**.

Sources: `phase0/t12/documentation.txt`.

---

## 7. Registration record

The probe's manifest carries `app.id: ari:cloud:ecosystem::app/118c23d8-4834-4003-acd4-29dac97137b2` — a real id, written by `forge create` and reported by the operator. The all-zero placeholder that the sandbox inspection found in the repository has been replaced on their checkout; the committed manifest still holds the placeholder by design (no account-specific identifier belongs in the repository).

No duplicate app was created. The Developer Console check described in the previous revision of this report was the safeguard, and the result is consistent with a single registration.

---

## 8. Evidence classification

| # | Conclusion | Class |
| --- | --- | --- |
| E1 | The validator appears in the rule list of a company-managed transition | **LIVE VERIFIED** — screenshot |
| E2 | The rendered name and description match the manifest | **LIVE VERIFIED** — screenshot |
| E3 | No enablement step was required | **LIVE VERIFIED** — the whole session is the evidence; no toggle was touched |
| E4 | The FS project's workflows are company-managed | **LIVE VERIFIED** — they appear on the site-level workflow admin page attached to a scheme shared by 1 project |
| E5 | `DONE` has exactly one incoming transition, `Mark as done` | **LIVE VERIFIED** — transition panel |
| E6 | The transition carried no validators before the test | **LIVE VERIFIED** — empty "Validate details" |
| E7 | Nothing was added or published | **LIVE VERIFIED** — "Update workflow" greyed throughout |
| E8 | Deploy, install, lint, scopes, CLI version | **OPERATOR-REPORTED** — not independently observed |
| E9 | The module is documented for company-managed projects only | **DOCUMENTATION VERIFIED** — module reference |
| E10 | Preview features require no site-level enablement for this module | **INFERRED** from E3 — one site, one app; not a general proof |
| E11 | The rule blocks a transition | **NOT TESTED** — E1 |
| E12 | The rule attaches and survives publishing | **NOT TESTED** — deliberately not attempted |
| E13 | Team-managed behaviour | **NOT TESTED** — E3 |
| E14 | Availability on the Case / ESM workflows | **NOT TESTED** — only the Task/Sub-task workflow was opened |

---

## 9. Verdict against the decision rule

| Rule | Applies? |
| --- | --- |
| **PASS** — Preview enablement demonstrated on the development site, validator available for the next live test | **Yes** |
| FAIL — cannot be enabled or unavailable | No |
| BLOCKED — authentication, site or permissions unavailable | No (that was the sandbox's state; the operator's machine has all three) |

**T12: PASS.**

---

## 10. Next action

**E1 is next, and it has not been started.** It is a different test with a different risk profile, because it requires a **write** — adding the rule and publishing the workflow — which T12 deliberately avoided.

E1's questions, in order:

1. Attach `Relay closure gate (probe)` to the `Mark as done` transition and publish the workflow. Does it save?
2. With `blocking > 0` in gate state, does the transition refuse — from the **issue view**?
3. From the **board**?
4. From the **REST API** (`POST /rest/api/3/issue/{key}/transitions`)? Expect HTTP 400 with the message.
5. Does a **post function** on the same transition run when it shouldn't?
6. With `blocking = 0`, does it proceed?

That will need gate state written for a real issue. The probe exposes a webtrigger for exactly that (`?action=state&key=…&blocking=2`), which is a terminal step — the first one in this project that genuinely requires it.

Awaiting instruction before starting.

---

## 11. History of this report

| Date | State | Note |
| --- | --- | --- |
| 31 Oct 2026, 14:18–14:24 UTC | **BLOCKED** | Attempted from the sandbox. No Atlassian session, no site, and no network path: `id.atlassian.com` returned HTTP 000 against `registry.npmjs.org` HTTP 200. `forge whoami` → `Not logged in`. Not a FAIL — the documented process was never attempted |
| 1 Nov 2026 | **PASS** | Run by the operator on `onepes930.atlassian.net`. The rule is present in the validator list |

The earlier BLOCKED section has been removed from the body of this report but its conclusion is preserved above, because a blocked attempt and a passed test are different kinds of evidence and the record should show both.

The sandbox still cannot reach Atlassian. Every remaining live test must be run by the operator; this environment can analyse results but cannot produce them.

---

## 12. What this does not change

- No acceptance criterion, threshold or score.
- No Phase 0 / Phase 0.2 artefact.
- No V2 or V2.1 text — the day-0 gate result and the terminology mapping in §2.3 are recorded here for a future V2.2 rather than edited into V2.1.
- No probe source, manifest field or architecture decision. The closure-receipt design still waits on T15 and T13.

### For a future V2.2

1. **V2.1 §10.4's Preview gate is met** — T12 PASS. The risk ranking in §7 of V2.1 should drop from "critical if it fails" to closed-for-company-managed.
2. **Jira's new workflow terminology** (*Restrict transition / Request input / Validate details / Perform actions*) should replace the old names everywhere in the plan. Anyone following the current instructions will look for "Validators" and not find it.
3. **The company-managed claim is now platform-confirmed** (§2.2), not just configuration-reported.

---

*Evidence: `phase0/t12/{environment,connectivity,probe-readiness,documentation}.txt` and `phase0/t12/screenshots/`.*
