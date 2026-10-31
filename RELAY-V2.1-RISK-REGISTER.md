# Relay — unresolved risk register (V2.1)

**Purpose:** every substantive claim the build depends on, separated by how it is known, plus the risks that follow.
**Rule:** a claim moves between sections only when there is a new source or a new test result. Nothing moves because the team has grown confident.

Labels: **[V]** verified · **[R]** third-party supported · **[I]** inferred · **[U]** untested.

---

## Part A — Claim register

### A1. Verified **[V]**

Read in official documentation, in published package internals in this environment, or produced by a test we executed.

| # | Claim | Source | Used for |
|---|---|---|---|
| V-01 | The validator receives `{issue:{key}, configuration, transition:{from,to,modifiedFields}}` and returns `{result, errorMessage?}` | validator module reference | the entire gate design |
| V-02 | On `result:false` the transition does not progress and post functions do not execute | validator module reference | blocking semantics (but see U-08: never observed) |
| V-03 | `projectTypes` **defaults to `["company-managed"]`** on validator, condition and post function | `@forge/manifest@13.8.0` | the product manifest; the team-managed scope decision |
| V-04 | Validator `required` is `["description","name","key"]` — `resolver` and `function` are not required by the schema | same | omitting `resolver` |
| V-05 | `jira:workflowCondition` has no `function`; `expression` is the mechanism | schema + docs + third-party probe | rejecting the condition as a gate |
| V-06 | `jira:actionValidator` supports only `workItemTypeChanged` | module reference | rejecting the action validator as a gate |
| V-07 | `jira:workflowPostFunction` exists as a module | `@forge/manifest@13.8.0` | the fallback writer (rejected as primary — §3.3) |
| V-08 | Forge LLM is Atlassian-hosted; adding `llm` retains Runs on Atlassian eligibility | Forge LLMs API reference | the privacy claim, narrowed |
| V-09 | Adding the `llm` module triggers a major version upgrade requiring admin approval | same | install friction note |
| V-10 | Runs on Atlassian certifies Atlassian-hosted compute/storage, residency, egress controls — and **explicitly defers tenant safety and data handling to the shared responsibility model** | Runs on Atlassian page | why "no data leaves Atlassian" was withdrawn |
| V-11 | Preview = available to all users, GA-level support, **opt-in**, "usually turned off by default", 1-month deprecation window | Forge release phases page | §7 and test T12 |
| V-12 | `LlmRequest` has no `response_format`; forced `tool_choice` is the only structured-output route | `@forge/llm@1.0.9` | the extraction contract |
| V-13 | `sonnet-5`, `opus-4-7/4-8`, `opus-5` reject `temperature`/`top_p` | API reference + package | omit sampling parameters |
| V-14 | `ContentPart` is `TextPart` only — no image input | `@forge/llm@1.0.9` | vision excluded from scope |
| V-15 | `@forge/llm` has no public surface (`https://llm` via `__forge_fetch__`) | package internals | why extraction is unmeasurable here |
| V-16 | Deterministic quote verification passes 13/13 adversarial conformance cases | our tests | provenance design |
| V-17 | Date resolver agrees 17/17 with hand-labelled dates | our harness | no model dates persisted |
| V-18 | Regex baseline: 92.3% P / 50.0% R / F1 0.649 on 30 comments, 24 commitments | our harness | the synthetic floor argument |
| V-19 | 71 tests pass across 5 files | `node --test` | Phase 0.2 status |
| V-20 | `deriveEnforcement()` produces exactly one of four states with strict precedence | 14 tests | the provenance decision table |
| V-21 | No label fallback: gate state comes from the entity store only | handler tests | bypass closed |

### A2. Third-party supported **[R]**

Documented behaviour reported by someone else. Evidence that something happened to someone, in some version, at some point.

| # | Claim | Source | Confidence | What it does not establish |
|---|---|---|---|---|
| R-01 | Forge workflow validators do not work in **team-managed** projects | 3 practitioner sources, incl. one diagnosed with an Atlassian engineer | High | current behaviour; whether it has changed since |
| R-02 | After uninstall, the validator **remains attached**; Jira suggests removing "dangling validators" | Railsware documentation | Medium | whether the transition is blocked, in which versions, for Forge apps |
| R-03 | A validator's delete option can be **greyed out**; the workflow must be copied | Atlassian KB | Medium | frequency, or whether it applies to Forge rules |
| R-04 | A missing rule makes a transition unavailable, with no UI warning | JRACLOUD-23885 (old, closed) | Low–Medium | anything about Forge apps; it describes the legacy plugin case |
| R-05 | A condition with `expression:false` was removed from `/transitions` and forced POST returned 400 | independent live probe, Aug 2026 | High | validator behaviour (it tested a condition) |
| R-06 | Smart Checklist ships a validator that blocks on mandatory items; Release Readiness Gate publishes Relay's enforcement architecture | vendor docs; GitHub case study | High | that either captures promises from prose |
| R-07 | `avi:jira:transitioned:issue` is a real Jira event identifier | Atlassian engineering blog | High | that a **Forge product trigger** can subscribe to it, or its payload |

### A3. Inferred **[I]**

Our reasoning. Nobody has observed it.

| # | Inference | From | Consequence if wrong |
|---|---|---|---|
| I-01 | An unevaluable rule (app uninstalled or function unable to run) leaves the transition blocked or unavailable | R-02 + R-04 + workflow semantics | If wrong, the uninstall hazard is smaller than v2 claimed — and F10 is still worth keeping, because the cost of being wrong in the other direction is a blocked customer workflow |
| I-02 | A validator function can perform a storage write during evaluation | no source; it is a normal Forge function in a different invocation context | **Design-critical.** If wrong, `verified` is unattainable via the receipt design and the post-function fallback becomes mandatory (see U-15) |
| I-03 | A transition event can be matched to a receipt by issue, actor and time window | R-07 + the event carrying an actor | If no actor, matching degrades to issue+window; bias stays toward `unverified` |
| I-04 | Team-managed projects are the default for a judge who creates a project on a fresh site | product experience, not documented | If judges pick company-managed by default, the largest install risk shrinks |
| I-05 | The judge's first action is "create a project", not "install the app on an existing one" | judging flow | If wrong, the risk profile changes favourably |

### A4. Untested **[U]**

Everything below is unverified by anyone. This is the honest centre of the project.

| # | Unknown | Test | Blocks |
|---|---|---|---|
| U-01 | Does the gate block on issue view, board and REST? | E1 | The product thesis |
| U-02 | Are post functions suppressed on a blocked transition? | T9 | AC7; matters for the fallback writer |
| U-03 | Does the validator work on a **fresh, default** site (Preview opt-in)? | **T12** | F7, F8, F11 availability to a judge |
| U-04 | Team-managed: supported or not? | E3 | F9 messaging; §8 claims |
| U-05 | What exactly does an admin see after uninstall, and can they recover? | E4 | F10, §2 claims |
| U-06 | Can a validator function write to storage in its invocation budget? | **T15** | §3 design; AC12, AC25 |
| U-07 | Does a Forge product trigger deliver a Jira transition event, with what payload and latency? | **T13** | §3 recorder |
| U-08 | Does the platform actually fail closed when the app cannot run? | E4 | The "no record needed" argument in §3.5 row 7 |
| U-09 | How does the app detect project type (exact REST field)? | **T14** | F9, AC16 |
| U-10 | Is there a REST endpoint that enumerates workflows and attached rules? | T16 | F10's enumeration upgrade only |
| U-11 | Forge LLM extraction quality — precision, recall, quote rate, per-language | E2 | The whole product |
| U-12 | Whether the 24-commitment ground truth is right | Second annotator (F6) | Every extraction number |
| U-13 | Can a stranger install and configure in under two minutes on a project they created? | P7 | AC16's practical value |
| U-14 | Do Preview modules block a Marketplace listing? | Marketplace policy | Distribution only; not judging |
| U-15 | Forge LLM prompt retention, training use, sub-processors, inference region | Atlassian terms, read by someone qualified | The privacy tab wording, not the build |

---

## Part B — Risk register

Ranked by expected damage to the submission. "Signal" is what you would see first; "fallback" is what you do if it happens.

| # | Risk | Sev | Likelihood | Early signal | Fallback |
|---|---|---|---|---|---|
| 1 | **Validator does not block** as documented | Critical | Low–Medium | E1 | Post function + required transition field, labelled "advisory enforcement". If that also fails, the enforcement half of the product is gone |
| 2 | **T12 fails** — the validator is unavailable on a default site | Critical | Medium | T12 | If it is an opt-in toggle: document it, and the video must show how. If it cannot be enabled on a fresh site at all: no judge can reproduce J4 unaided, and the plan stops |
| 3 | **Extraction precision unusable** | Critical | Medium | E2 | Narrow the contract to explicit-deadline commitments. Below 60% after two iterations, pivot to Close Call on day 11 |
| 4 | **T15 fails** — no receipt write from the validator | High | Medium | T15 | Post-function-as-receipt-source, gated on T9. If both fail, `verified` is unattainable and the compliance claim must be withdrawn before submission |
| 5 | Judge's only project is team-managed | High | Medium | E3 + judge behaviour | Setup card, video segment, submission first two lines (§8) |
| 6 | Uninstall leaves a blocked workflow with no obvious recovery | High | Medium | E4 | F10 as an installation ledger; runbook in the app; warn in the listing |
| 7 | Closed-provenance records are wrong in the organisation's favour | High | Low (design fails safe) | AC25 fuzz tests | Stop-ship defect: any path from absence to `verified` |
| 8 | Preview module changes during the build or judging window | Medium | Low–Medium | changelog / T12 re-run | Provenance detects it (no receipt → `unverified`); video does not depend on the module |
| 9 | Judge cannot configure the gate in two minutes | High | Medium | P7 stranger test | Screenshot-led onboarding; demo on your own site in the video |
| 10 | Scope creep back toward "platform" | High (self-inflicted) | High | any feature after P5 | Freeze at end of P5 |
| 11 | Single-annotator ground truth distorts the benchmark | Medium | Certain until F6 | E2 result looks surprisingly good or bad | Second annotator before E2 is scored against the pivot threshold |
| 12 | Rate limiting during seeding | Medium | Medium | P1 | Batch, back off, seed once |
| 13 | Privacy claim overreaches in the submission | Medium | Low (now worded defensibly) | D5 wording check | §5.3 wording is the only approved wording |

---

## Part C — What would change the recommendation

Stated in advance, so it cannot be rationalised afterwards.

| Event | Recommendation becomes |
|---|---|
| E1 passes 3/3, T12/E3/E4 confirm, T15 and T13 hold, E2 ≥70% hi-conf precision at ≥50% recall | **BUILD AS PROPOSED** (modifications 1–9 adopted) |
| E2 lands 60–70% hi-conf precision | **BUILD WITH MODIFICATIONS** — narrow the contract to explicit-deadline commitments, raise the review-queue share |
| E2 below 60% after two prompt iterations | **PIVOT TO CLOSE CALL** (day 11, ~70% shared work) |
| E1 fails but the post-function fallback blocks 3/3 | **BUILD WITH MODIFICATIONS** — advisory enforcement, repositioned away from the gate |
| T12 fails and cannot be enabled | **PIVOT.** No judge-facing enforcement experience exists |
| T15 and T9 both fail | **BUILD WITH MODIFICATIONS** with the compliance claim withdrawn — or pivot, if the compliance story was the reason for choosing Relay |
