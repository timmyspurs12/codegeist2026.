# Relay — Pre-Build Product Review (v2.1)

**Subtitle:** specification consistency and architecture corrections
**Status:** corrects `RELAY-REVIEW-V2.md`. Does not replace it wholesale — see §0.1 for the reading contract.
**Date:** 31 October 2026 · **Deadline:** 22 December 2026 (52 days)
**Phase 0 / 0.2 evidence:** unchanged, unmodified, and re-quoted rather than re-interpreted.

**Evidence labels — revised in this version.** v2 used `[V]` / `[R]` / `[H]`. That conflated two different things: how strong a source is, and whether *we* have tested it. V2.1 uses four labels and applies them to every claim in this document and in the risk register:

| Label | Meaning | Example in this project |
|---|---|---|
| **[V]** verified | read in official Atlassian documentation, in published package internals, or produced by a test we executed | the validator payload shape; `projectTypes` defaulting to `company-managed` |
| **[R]** third-party supported | a documented behaviour reported by someone else — a vendor's documentation, a practitioner on a public forum, a knowledge-base article | Railsware on what happens to a validator when the app is uninstalled |
| **[I]** inferred | our reasoning from how the platform must work. Not observed by anyone | "a rule that cannot evaluate is not satisfied, so the transition is blocked" |
| **[U]** untested / unverified | nobody has checked. In this project, most things that matter live here | whether the gate blocks a transition |

The distinction between **[I]** and **[U]** is the one that v2 blurred worst, and it is the reason this document exists.

---

## 0. What this document is, and the six defects it corrects

### 0.1 Reading contract

v2's substance survives. Its §1 (vision), §2 (originality), §3.1–3.2 (human impact), §5 (the nine-step journey), §6.2–6.5 (quote-first extraction) and §9.1–9.5 (positioning, users, journeys, feature list) are not revisited here and stand as written.

This document replaces v2 on **six specific points**, each of which was either self-contradictory or unsupported. Where V2.1 is silent, v2 stands. Where they disagree, **V2.1 wins**, and `RELAY-V2.1-CHANGELOG.md` lists every difference line by line.

That contract is deliberate. A wholesale rewrite of an 11,000-word document to fix six defects risks introducing six more, and the defect being corrected here is precisely "the prose drifted away from the table".

### 0.2 The six defects

| # | Defect | Where it was | Why it matters |
|---|---|---|---|
| **D1** | The executive summary said Relay scored **79**; the score table said **80**, and always had | v2 §0 vs §8 | The headline number of a review that asks to be trusted with numbers was wrong. Fixed in commit `6b484a0`; now recomputed and machine-guarded here |
| **D2** | Uninstall behaviour was described as "resolved as far as anyone can without doing it", mixing a vendor's documentation, an old issue ticket, and inference into one confident paragraph | v2 §4.1, §7.4 | It was never tested by us. It is now classified in three tiers, and the words "verified" and "resolved" are removed |
| **D3** | **Nothing writes the `closureRecord`.** §9.6 declared the validator does "no writes", §9.8 required a `closureRecord`, and AC12 required every closure to carry exactly one enforcement state | v2 §9.6, §9.8, AC12 | The compliance claim — the product's differentiator — had no implementation path. This is the most serious finding in V2.1 and it is a design gap, not a typo |
| **D4** | The 92.3% / 50% figures were presented close enough to the model discussion that a reader could attribute them to Forge LLM | v2 §3.3, §6.1, §4.4 | They are a **regex baseline**, measuring the dataset's difficulty, not the model's quality. The model has no measured value at all |
| **D5** | "No data leaves Atlassian" appeared in the submission text as an absolute | v2 §11.8 | What is verified is narrower: the app declares no egress, and Forge LLM is Atlassian-hosted. Retention and training guarantees were not established by anything we read |
| **D6** | Twelve smaller inconsistencies: a model call in a path declared model-free, an undefined "Experiment 3", three different precision thresholds with no stated roles, four P0 features with no acceptance test, and a P0 feature scheduled in P6 on an unverified API | v2 §6.1, §10.1, §10.3, §10.4, §9.13 | Each is individually small. Together they are why a judge who reads carefully stops believing the rest |

### 0.3 One finding that got better, and it is not ours to be pleased about

While verifying D5, two authoritative pages were read that v2 did not have:

- **Adding the `llm` module does not break Runs on Atlassian eligibility** — stated directly in the Forge LLMs API reference **[V]**.
- **Preview features are "available to all users, and enjoy the same level of support as GA features", but they are opt-in, "usually turned off by default", and carry a one-month minimum deprecation window rather than GA's six** **[V]** — from Atlassian's release-phases page.

The first strengthens the architectural case. The second adds a risk v2 did not have: `jira:workflowValidator` is Preview, and if a fresh site needs something enabled before the module can be used, **the day-0 experiment can fail for a reason that has nothing to do with Relay**. That is now test T12 (§7, §10.1).

### 0.4 The corrected verdict

Unchanged in substance, and now stated with its arithmetic visible:

> **BUILD RELAY WITH SPECIFIC MODIFICATIONS. Relay 80 / Close Call 80 / Open Door 76. Level, not ahead.**

Eight modifications from v2, plus a ninth that V2.1 forces (§11.1). The decision still rests on two experiments that have not run. V2.1 does not resolve either of them, and §12 says so plainly rather than implying progress.

---

## 1. Scoring: recomputed, reconciled, guarded

### 1.1 The arithmetic, shown

Weights are as specified and sum to 100. Every dimension score is capped at its weight. The totals are computed here rather than asserted:

| Dimension (weight) | Relay | Close Call | Open Door | v1 → v2.1 (Relay) |
|---|---|---|---|---|
| Human impact (20) | 17 | 18 | 17 | 17 → 17 |
| Originality & differentiation (20) | 12 | 13 | 9 | 16 → 12 (−4, release-gate finding) |
| Atlassian ecosystem fit (15) | 14 | 13 | 14 | 14 → 14 |
| AI necessity & technical depth (15) | 14 | 12 | 11 | 14 → 14 |
| MVP feasibility (15) | 9 | 11 | 13 | 10 → 9 (−1) |
| Demo & presentation (15) | 14 | 13 | 12 | 14 → 14 |
| **TOTAL /100** | **80** | **80** | **76** | **81 → 80** |

```
Relay      17 + 12 + 14 + 14 + 9 + 14 = 80
Close Call 18 + 13 + 13 + 12 + 11 + 13 = 80
Open Door  17 +  9 + 14 + 11 + 13 + 12 = 76
```

Two dimensions moved from v1 and only two: **originality 16 → 12**, because Release Readiness Gate publishes Relay's enforcement architecture as a case study and Smart Checklist ships the gate as a product, and **MVP feasibility 10 → 9**, for the three reasons in §1.2. Nothing else moved.

### 1.2 The feasibility deduction, restated

Relay lost one point for three distinct things, and the review should be honest that they are not equal:

1. **Two phases without a live result on the mechanism the product depends on.** Environmental — no Atlassian access in this sandbox — but the risk is now demonstrated rather than theoretical. A team with a site could have answered this in an hour, twice over.
2. **Team-managed projects probably cannot host the enforcement**, and team-managed is the default on new sites. This is the one that actually costs.
3. **The uninstall hazard added a P0 feature** that was not in the original plan — and, per §2.5, a dependency that had to be redesigned.

### 1.3 The defect that shipped, and the guard

v2's §0 said *"Relay is now 79 to Close Call's 80"* and *"moves Relay's Atlassian-fit and feasibility scores down"*. Both statements were false against the table in the same document: Atlassian fit never moved (14), and the total was 80.

It came from a draft in which fit was 13. Nobody caught it because a prose summary and a table are two places, and only one of them was edited.

That is not fixed by being more careful. It is fixed by making the check mechanical: `phase0/harness/check-review.mjs` parses the score table, sums each column, asserts that the total row matches the sum, and asserts that §0 and §11 state the same result as the table. It fails the build if the prose drifts. It was verified the honest way — by reintroducing the old sentence and confirming the check fails — and it now also covers this document.

### 1.4 Level at 80–80, and why that is the finding

**The scores are level.** v1 had Relay ahead by a point, and that lead was an artefact of an originality score given before the competitive research was finished.

A tie is not a non-result. It says the scoring model cannot separate these three products, and pretending otherwise by manufacturing a decimal would be the same class of error as D1. What separates them is not on the dimensions:

- **Relay has the higher ceiling** and the only defensible technical identity in the set — *if* the gate blocks and extraction clears the bar.
- **Relay has the higher chance of a broken demo**, because its centrepiece needs an admin to publish a workflow of a project type the judge may not have.
- **Close Call is the safer bet** for a team whose priority is submitting something that definitely works.

V2.1 does not change the choice. It removes one of the reasons someone might have *unthinkingly* made it.

---

## 2. Uninstall behaviour: three tiers, not one paragraph

v2 wrote: *"Uninstall behaviour — resolved as far as anyone can without doing it."* That sentence is a category error. Three different kinds of knowledge were folded together, and the strongest of them was doing the work of all three. They are separated here.

### 2.1 Tier A — third-party documented

What others have written down. This is evidence that something happened to someone else, in some version of Jira, at some point.

| Claim | Source | What it actually supports | Limits |
|---|---|---|---|
| When the app is uninstalled, the validator **remains attached** to the transition, and Jira surfaces an error suggesting removal of "dangling validators" | Railsware / Smart Checklist documentation **[R]** | A vendor describing their own app's uninstall experience | One vendor, one app, no version or date. Does not say whether transitions are *blocked* or merely abnormal |
| A validator's delete option can be **greyed out**, requiring the workflow to be copied before the rule can be removed | Atlassian knowledge base article **[R]** | A documented recovery obstacle exists in the product itself | A KB article describes the cases that reached support, not the frequency or the default |
| When a plugin supplying a condition, validator or post function is removed, "no warnings are visible in the UI though the transitions do appear", and affected steps "will not render any of the possible transitions" | JRACLOUD-23885 **[R]** | The general shape: a missing rule makes the transition unavailable | An **old, closed suggestion**, not current documentation. Indicative of a failure mode, not proof of present behaviour |

Read together, Tier A supports one sentence: **an uninstalled app can leave a rule behind that interferes with a transition, and the recovery path is not always obvious.** It does not support "blocks", it does not support "with a message", and it does not support "recoverable in N minutes".

### 2.2 Tier B — expected platform behaviour

What follows from how the platform must work. Nobody has observed it in this configuration.

The inference: a workflow rule that cannot be evaluated cannot return true, and a rule that does not return true does not permit its transition. Therefore an orphaned Relay validator should make the closure transition **unavailable or blocked** — and because Relay sits on the closure transition of a customer-facing workflow, "unavailable" means a duty-of-care case cannot be closed. **[I]**

Why this is an inference and not a fact: Forge may resolve an orphaned *function* differently from a legacy plugin-supplied rule, and JRACLOUD-23885 describes the legacy plugin case. Forge apps are also not the same object as a workflow plugin. The inference is strong and it is not evidence.

### 2.3 Tier C — Relay-tested

**Nothing. Zero. No Relay app has ever been uninstalled from a live Atlassian site.**

There is no observation of what an administrator sees, how long the workflow stays blocked, whether the "dangling validators" message names Relay or says something generic, whether publishing the workflow clears it, or whether a copied workflow behaves differently. All of it is **[U]**.

### 2.4 The corrected sentences

| v2 said | V2.1 says |
|---|---|
| "Uninstall behaviour — resolved as far as anyone can without doing it" | "Uninstall behaviour — **third-party documented, inferred, and not tested by us**" |
| "the hazard is: real, blocking, signposted, and sometimes awkward to fix" | "the hazard is: **plausibly** blocking, **reportedly** signposted, **possibly** awkward to fix, and unmeasured" |
| §4.1 heading: "The closure gate — verified, with two new caveats" | Unchanged for the *gate*. The uninstall claim is no longer inside that heading's scope |
| "It stays a P0 feature" | Unchanged. See §2.5 |

The word "verified" now appears nowhere in this document in connection with uninstall. If it appears in the submission, install notes, or listing, that is a defect.

### 2.5 F10 stays P0 — and loses its unverified dependency

v2 made the pre-uninstall audit a P0 feature (correctly — a hazard this serious is a product obligation, not a documentation page) and then scheduled it in **P6** with **no transport**, because enumerating a site's workflows needs a REST endpoint nobody could verify from this environment.

That is a P0 feature depending on an unverified API, scheduled four phases after the thing that would have revealed the dependency. V2.1 resolves it by changing what the feature asserts.

**The defect in the original design:** "list every workflow and transition carrying a Relay rule" requires reading Jira's workflow configuration. That is the unverified API.

**The redesign: a self-reported installation ledger.** Relay already has to tell the administrator exactly where to attach the rule (§9.12) — "add *Relay closure gate* to your Done transition and publish the workflow". It can record that instruction, the project, the transition the admin confirmed, the actor and the timestamp, and then ask for confirmation at uninstall time against a list it owns.

| Property | Site-enumeration design | Installation-ledger design |
|---|---|---|
| Depends on an unverified Jira REST endpoint | **Yes** | **No** — it reads Relay's own records |
| Testable offline | No | **Yes** — AC17 can be written against the ledger today |
| Misses rules added outside Relay's instructions | No | **Yes** — a rule attached manually, or by another admin on another transition, is invisible |
| Fails safe | n/a | **Yes** — the page states plainly that it can only report what Relay told you to install |

The honest description for the UI: *"Relay knows about the rule you were asked to attach on the Done transition of Housing Repairs — North. It cannot see rules added outside this setup, so also check every workflow that uses Relay's validator. Steps to check: …"*

That is a weaker guarantee than v2 promised, and it is a guarantee we can actually ship. The enumeration version stays as a stretch goal behind T16, and — per this project's standing rule — the endpoint is confirmed against the live REST reference before a line of it is written, not remembered.

---

## 3. Closure provenance: the missing write path

This is the defect that could have shipped a product whose central claim was unimplementable.

### 3.1 The defect, stated exactly

Three statements in v2 cannot all be true:

1. **§9.6, architecture diagram:** the workflow validator "reads gate state only, **no LLM, no writes**".
2. **§9.8, data model:** a `closureRecord` exists, carrying `enforcement: verified | unverified | overridden | disabled`.
3. **AC12:** "Every closure carries exactly one of the four states; unverified excluded from compliance."

If the validator does not write, and nothing else in the architecture writes a closure record, then AC12 has no implementation. And if the rule is bent — "the validator writes it" — then the architecture statement is false, and the review has done the thing it accuses others of.

There is a second, quieter version of the same gap. The Phase 0.2 probe *computes* an enforcement state inside `gate()` and **logs** it. A log line is not a record. Nothing in the repository persists a `closureRecord`, and no test exercises a write path, because there is no write path. Phase 0.2's F3 row — "Four closure states on every closure — IMPLEMENTED + TESTED" — is accurate about the **decision table** and silent about the **plumbing**. §3.8 separates those two things.

### 3.2 What each component knows

Design has to start from what is knowable, not from what is convenient.

| Component | Knows | Does not know |
|---|---|---|
| **Gate state record** (entity store) | the obligation counts, `updatedAt`, policy, enabled flag | whether any transition was attempted |
| **Validator** (`gate`) | that it was evaluated, for which issue and transition, by which actor, and what it decided | whether the transition then succeeded |
| **Transition event** (if delivered) | that a transition happened, and (probably) who did it | whether a Relay rule was attached, or what it decided |
| **Post function** (if attached) | that a transition it is attached to reached the post-function stage | whether a validator passed or was absent — unless T9 holds |
| **Nothing at all** | — | anything, when the app is not installed |

No single component has the whole picture. That is why the answer is not "pick one" but "join two, and make the join fail safe".

### 3.3 Designs considered and rejected

| # | Design | Fatal flaw |
|---|---|---|
| 1 | **Validator writes the closure record directly** | The validator runs on *blocked* attempts too. It would need to know the attempt would succeed, which it cannot. It would also race with itself on retry |
| 2 | **Derive from the transition event alone** | The event fires for every transition, including ones with no Relay rule attached, another admin's rule, or a rule whose project has no gate state. Every closure would be `verified` — a compliance claim with no gate behind it |
| 3 | **Timestamp proximity**: closure happened within N seconds of a clear gate state | Two closures in one window, a delayed event, or a stale-but-fresh-looking state all produce `verified` without an evaluation. This is a heuristic that fails in the direction that matters |
| 4 | **Post function alone** | Correct only if T9 holds — post functions suppressed on blocked transitions. If T9 fails, records are written for closures that never happened: **false compliance**, the worst possible failure. Also a second configuration point for the admin, and its payload is undocumented here **[U]** |
| 5 | **Read the issue's status afterwards** | Post-function timing relative to the status commit is unspecified; and it still cannot distinguish "validator passed" from "validator absent" |

Designs 1 and 4 fail by *inventing* compliance. Designs 2 and 3 fail by *overstating* it. A design is only acceptable if its failure mode is "unknown", never "compliant".

### 3.4 The chosen design: decision receipt, single recorder

Two records and one rule.

**New record — `decisionReceipt`.** Written by the validator, once per evaluation, immediately before it returns. Append-only, tenant-scoped, never mutated except to record that a closure claimed it.

```
decisionReceipt (keyed by issueKey + actorAccountId + issuedAt)
  issueKey, fromStatusId, toStatusId, actorAccountId,
  decision: CLEAR | CLEAR_FAIL_OPEN | CLEAR_STALE | OVERRIDE | BLOCKED | DISABLED,
  gateStateVersion, counts: {blocking, unowned, overdue},
  issuedAt, claimedBy: null | closureId, claimedAt
```

It contains **counts and identifiers only** — never a quote, never an obligation summary, never a beneficiary label. AC26 asserts this, because a receipt is written on a path with no user context and must not become a leak.

**The rule — the validator writes one receipt and returns its decision. Nothing else.**

**The writer — `closureRecorder`.** A single async consumer on the transition event. It is the only component that creates a `closureRecord`. It:

1. derives the closure identity `K = sha256(issueKey | closedAt | actorAccountId | toStatusId)`;
2. if a record with key `K` exists → **no-op** (duplicate delivery);
3. otherwise looks for an unclaimed receipt for `issueKey` (+ actor, if the event carries one) with `issuedAt ≤ closedAt` and `closedAt − issuedAt ≤ W`;
4. claims it atomically, writes the `closureRecord` with the state derived by the existing, tested `deriveEnforcement()`, and links `receiptId`;
5. no receipt → writes `unverified` with reason `NO_RECEIPT_FOUND`. **Never `verified`.**

**`W` is a policy constant, not a platform fact.** It starts at 10 minutes and must be re-set after T13 measures real event latency. Any value chosen now is a guess and is labelled as one.

**Why this component and not the post function:** the two candidate writers fail in opposite directions. A missing event delivery loses a record → the closure is stamped `unverified` → the organisation under-reports its own compliance. A post function that runs when it should not (T9 false) *invents* a record for a closure that never happened → the organisation **over-reports**. For a compliance feature, the second is disqualifying and the first is a bug. Pick the writer whose failure mode is safe.

**And the architecture is amended, in public.** v2's "no writes in the validator" was a good instinct expressed too strongly: it made AC12 unsatisfiable. The corrected invariant is narrower and truer:

> The validator performs **no obligation state writes, no model calls and no gate-state mutation**. It performs **exactly one append-only receipt write**, bounded in size, wrapped so that its failure cannot change the validator's decision, and stripped of content.

That sentence replaces §9.6's "no writes" in every downstream document.

### 3.5 The seven situations, component by component

Every closure that actually happens receives exactly one state. Here is who writes what, and when, for each way it can happen.

| # | Situation | Validator | Receipt | Recorder | Resulting state | Reason code |
|---|---|---|---|---|---|---|
| 1 | **Successful evaluation, clear** | reads fresh gate state, returns `true` | `CLEAR` | claims receipt, writes record | `verified` | `GATE_EVALUATED_CLEAR` |
| 2 | **Store unavailable during validation** | cannot read state, returns `true` (fail-open policy) | `CLEAR_FAIL_OPEN` — or **no receipt**, if the write store is the same unavailable store | claims, or finds none | `unverified` | `GATE_STATE_UNAVAILABLE` / `NO_RECEIPT_FOUND` |
| 3 | **Stale gate state** (>15 min) | treats as unavailable, returns `true` | `CLEAR_STALE` | claims | `unverified` | `GATE_STATE_STALE` |
| 4 | **Audited override** | finds a valid override record, returns `true` | `OVERRIDE` | claims | `overridden` | `OVERRIDE_ACCEPTED` |
| 5 | **Enforcement disabled** — Relay off on the project, or rule never attached | not invoked, or returns `true` with `DISABLED` | `DISABLED`, or none | claims, or falls back to project config | `disabled` | `RELAY_NOT_ENFORCING` |
| 6 | **Event processing failure** | unaffected | `CLEAR` exists, unclaimed | **never runs** | no closure record; the receipt is surfaced by the sweep as an unresolved provenance gap, **not** as a closure | `PROVENANCE_LOST` |
| 7 | **App unavailable** (function cannot execute) | never runs; the platform treats an unevaluable rule as unsatisfied and the transition does not proceed **[I]** — this is the inference T10 exists to test, not a verified behaviour | none | event may still fire if the app is reachable in another context | normally no closure occurs → **no record needed**; if one does, `unverified` | `NO_RECEIPT_FOUND` |

Row 7 is the one worth reading twice. If the platform fails closed when our function cannot run — which is what the validator documentation implies and what T10 will test — then the dangerous case produces *no closure*, and therefore needs no record. The dangerous case and the recordable case are disjoint. That is a property of the design, not a coincidence.

Row 2 contains the subtle one: if the entity store is unavailable, the receipt write may fail for the *same reason* the gate-state read failed. The design must not assume the receipt exists. It is written inside a `try` whose failure is logged and swallowed, and the validator's return value is computed before the write. A receipt is therefore *evidence*, never a precondition for permitting a closure.

### 3.6 Duplicates, delays, ordering, failed writes

The user-visible question behind all four: **can an organisation's compliance figure be wrong in its own favour?** The answer is a set of rules, each of which fails toward `unverified`.

**Duplicate events.** Keyed by `K = sha256(issueKey | closedAt | actor | toStatusId)`, written if absent. A replay produces the same `K` and is a no-op. A second, genuinely different closure of the same issue has a different `closedAt` and therefore a different `K` — which is correct: reopening and re-closing a case is a second closure.

**Delayed events.** Receipts are retained for 7 days and are matched on `issuedAt ≤ closedAt`, not on arrival time. A closure whose event arrives 40 minutes late still finds its receipt and still becomes `verified` — because the evidence is about what happened, not about when we heard. If two closures by the same actor on the same issue occur inside `W`, the second finds its receipt already claimed and becomes `unverified`. That is a deliberate bias: we would rather under-report than mis-attribute.

**Out-of-order delivery.** The claim is per-receipt, not positional. Two events arriving swapped claim their own receipts; neither can claim the other's because `issuedAt ≤ closedAt` is checked per record.

**Failed writes.** The recorder retries with exponential backoff (3 attempts), then writes a dead-letter entry and stops. It never writes `verified` on a retry path.

**Reconciliation, and its limit.** A daily `reconciliationSweep` looks for **unclaimed receipts older than 15 minutes whose decision was not `BLOCKED`** — that is, transitions Relay evaluated and permitted, for which no record exists. Each one is surfaced as a *provenance gap*, with the reason `PROVENANCE_LOST`, in a separate bucket from closures.

Two honest limits on that. First, a permitted receipt does not prove the transition committed — another validator, a required field or a race can still have stopped it — so the sweep must not create a `closureRecord` from a receipt alone. It reports a gap; it does not invent a closure. Second, if the event never arrives *and* the receipt write failed, nothing observes the transition at all, and neither the recorder nor the sweep can say anything. That case is invisible by construction, which is why the dashboard reports **three** numbers — verified closures, unverified closures, and provenance gaps — rather than a single compliance percentage.

The sweep has **no code path to `verified`**; that is asserted by test, not by intention.

**Closures Relay never saw.** If the app was uninstalled, or the event was never delivered, no record exists at all. The dashboard must therefore never say "100% of closures were verified" — it says "of the closures Relay observed, **X** were gate-verified, **Y** were not, **Z** are unknown". `complianceSummary()` already excludes `disabled` from the denominator and returns `null` rather than `0` when nothing is evaluable; the UI must render that as "not enforced", never as a perfect score.

### 3.7 The invariant

Written once, plainly, because it is the thing everything else protects:

> A closure is recorded as **`verified`** if and only if there exists a receipt `r` such that `r.decision = CLEAR`, `r.issuedAt ≤ closure.closedAt ≤ r.issuedAt + W`, `r.claimedBy` is this closure and no other, the gate state was fresh at issuance, and no valid override applies.
>
> **Absence of evidence never produces `verified`.** Every unknown resolves to `unverified`, which is excluded from every compliance figure and reported separately.

### 3.8 What is implemented, and what is only specified

Being precise here is the whole point of the exercise.

| Piece | Status |
|---|---|
| The decision table (`deriveEnforcement`, precedence, staleness, override validation, `complianceSummary`) | **Implemented, 14 tests passing** — and its `decision` argument is exactly what a receipt provides, so the tested function is reused rather than replaced |
| `decisionReceipt` record, claim protocol, recorder consumer, reconciliation sweep | **Specified only.** No code, no test, no transport |
| Phase 0.2 probe's provenance behaviour | **Logs** the derived state. Persists nothing |
| Live behaviour of anything in §3.5 | **Untested** — T13, T15 |

So the correct status line for F3, everywhere it appears, is: **"decision table implemented and tested; write path specified, unimplemented, untested."** Not "implemented + tested", which is what v2's F-row implies and what a reader would reasonably conclude from AC12.

No Phase 0 or 0.2 artefact is being changed by this restatement. The 14 tests are real and they pass. What changes is the claim made about their scope.

### 3.9 The dependencies this creates

The design is only as good as three unverified facts. They are now explicit, and they gate P4.

| Test | Question | If the answer is bad |
|---|---|---|
| **T15** | May a workflow-validator function write to Forge storage during evaluation, and does the write complete inside the invocation budget? | Fall back to design 4 (post function as receipt source), which is only safe if T9 holds. If neither holds, **`verified` is unattainable** and the compliance claim must be withdrawn — a pivot-level outcome, not a workaround |
| **T13** | Does a Forge product trigger deliver a Jira transition event, with what payload (actor? transition?) and what latency? | Without the actor, receipts are matched on issue + time window only; the bias stays toward `unverified`, which is acceptable. Without the event at all, T15's fallback becomes mandatory |
| **T9** | Are post functions suppressed on a blocked transition? | Only matters if T15 fails. If T15 passes, T9 is a nice-to-have that determines whether the post-function fallback is viable |

None of this is a reason to weaken AC12. It is a reason to run T13 and T15 **before** P4 rather than during it — which is a change to the plan in §10.

---

## 4. Extraction: what was measured, and what was not

### 4.1 The measured instrument

Everything numeric about extraction in this project comes from **one** artefact: a deterministic cue-word regex extractor, run over a 30-comment, hand-labelled dataset, scored by `phase0/harness`.

| Metric | Value | Denominator | Source |
|---|---|---|---|
| Comments | 30 (27 strict) | — | `results/dataset-check.json` |
| Labelled commitments (strict) | 24 | 27 strict comments | same |
| Ambiguous comments | 3 | 30 | same |
| Precision | **92.3%** | 12 TP / 13 predicted | `results/baseline.json` |
| Recall | **50.0%** | 12 TP / 24 commitments | same |
| F1 | 64.9% | — | same |
| High-confidence precision | 92.3% | 12 / 13 | same |
| Quote verification rate | 100% | 13 proposed, 13 verified | same |
| Deadline accuracy | 72.7% | 8 / 11 checked | same |
| Category accuracy | 66.7% | 8 / 12 checked | same |
| Injection cases handled | 2 / 4 | 0 complied | same |
| Latency | ~1 ms/comment | 2 calls | same |

The label on this artefact inside `report.json` is already correct and should be quoted verbatim anywhere the numbers appear:

> "deterministic regex baseline — validates the measurement instrument; **NOT a model quality result**"

### 4.2 The unmeasured model

**Forge LLM has no measured extraction performance.** Not precision, not recall, not quote-verification rate, not latency, not token cost, not per-language results.

The reason is mechanical, not an oversight: `@forge/llm` posts to an internal `https://llm/<model>` through the runtime-provided `__forge_fetch__` and **has no public surface**. There is no way to call it from outside a deployed Forge app. The benchmark harness exists, the dataset exists, the scoring code exists, the webtrigger that would run it exists — and it has never been executed against a model. `PHASE-0.2-REPORT.md` marks extraction **UNSCORED**, and `report.json → live.llmBenchmark` is absent rather than zero-filled.

That is the correct state. Zero-filled metrics would be the worst possible artefact.

### 4.3 Why the dataset supports a direction and not a precision claim

Even for the regex baseline, the numbers are coarser than they look:

- **24 commitments across 27 comments.** One additional false positive moves precision from 92.3% to 85.7% (7.7 points). One additional find moves recall from 50.0% to 54.2% (4.2 points).
- **A single annotator (F6 in Phase 0.2 is "NOT DONE").** Until a second person labels the same 30 comments cold, "24 commitments" is one person's judgement, and precision is measured against that judgement.
- **One FP, total.** The whole precision figure rests on distinguishing one comment (C27, which is already-kept rather than open) from twelve.

So the defensible claim is directional: **the syntactic floor is low enough that a rules-only approach misses about half of what matters, and the misses cluster in exactly the registers a tired caseworker produces.** That is a real, useful finding, and it is the argument for using a model.

It is not "AI achieves 92% precision". Nobody has measured that, and this dataset could not support the claim even if they had.

### 4.4 Language rules for the remainder of the project

These are binding on the submission, the video, the README and any future review.

| Never write | Write instead |
|---|---|
| "Precision 92%" / "92% accurate" | "A regex baseline reached 92% precision at 50% recall on our 30-comment dataset" |
| "The model achieves…" | "The model has not been measured" (until Experiment 2 runs) |
| "50% recall proves AI is needed" | "50% recall is the floor a rules-based approach hit; the model's recall is unmeasured" |
| "92% precision" anywhere near the words "Claude", "LLM" or "AI" | nothing — this pairing is the defect |
| "F1 0.65" as a headline | "F1 0.65 for the baseline instrument" |

And the threshold sentence from v2 §3.3 stays, with its role made explicit: **"a model that does not comfortably beat 50% recall is not earning its place"** is a *pre-registered threshold*, not a result. It is quoted in the day-0 checkpoint (§10.1) precisely so it cannot be revised after the fact.

### 4.5 Three thresholds, three jobs

v2 contained 60%, 70% and 75% for precision without ever saying which governed what. A reader could reasonably conclude the numbers were negotiable. They are not; they are a ladder, and each rung has a different scope and a different consequence.

| Threshold | Where | What it governs | Dataset | Consequence |
|---|---|---|---|---|
| **60%** | v2 §10.4 | **Pivot floor.** Below this after two prompt iterations, Relay's premise fails | day-0 benchmark, 30 comments | Pivot to Close Call on day 11 |
| **70%** | v2 §10.4 | **Day-0 proceed gate.** Below this, do not start P1 | day-0 benchmark, high-confidence subset | Stop and re-scope the contract before writing product code |
| **75%** | AC4 | **Release acceptance.** Two reviewers, 50 items, high-confidence subset | larger than day-0 | Do not submit the claim; fix or narrow |

The ordering is deliberate: the day-0 gate is looser than the release criterion because it is measured on a smaller, noisier sample and its job is to prevent a wasted month, not to certify quality. **None of the three values changes in V2.1.** §9 restates them explicitly so the ladder is visible in one place.

---

## 5. Model data handling: narrowing a claim we could not support

### 5.1 What was verified

Four things, all from Atlassian's own documentation or from our manifest:

1. **Forge LLM is an Atlassian-hosted model service.** The API reference describes "invoking Atlassian-hosted LLMs directly from Forge runtime functions" **[V]**.
2. **Adding the `llm` module preserves Runs on Atlassian eligibility** — stated explicitly: "The app retains its **Runs on Atlassian** eligibility after the module is added" **[V]**.
3. **Runs on Atlassian certifies three things, and they are specific:** apps "exclusively use Atlassian-hosted compute and storage"; apps "support data residency that matches data residency provided by the host Atlassian app"; and "customers can control external data egress … via admin controls" **[V]**.
4. **Relay's manifest declares no external egress at all** — `external.fetch.backend: []` — which is a property of the app we control and can assert without qualification **[V]**.

### 5.2 What was not verified, and must not be implied

The same Runs on Atlassian page contains the sentence that limits it:

> "While controls that limit external data egress are in place, these controls **do not prevent misuse of access granted to the app** during installation or abuse of the app runtime. The boundaries of **tenant safety and data handling** are defined in the [Shared responsibility model]." **[V]**

From this and the shared-responsibility page, the following are **not established** by anything in this review:

- how long Atlassian retains LLM prompts or completions;
- whether prompt content is used for model training or evaluation;
- which sub-processors, if any, sit behind the hosted models;
- in which region inference runs relative to the tenant's data-residency pin;
- whether prompts appear in Atlassian-side logs or support tooling that the customer can audit.

None of these is a reason to think anything bad happens. They are simply **not verified**, and a submission that asserts them is making a claim its author cannot defend two minutes into a judge's question.

### 5.3 The replacement wording

**Delete from every artefact:** "no data leaves Atlassian."

**Use instead, in order of strength:**

> **In the submission and listing:** "Runs on Atlassian eligible: Relay makes no external network calls and runs its inference on Atlassian-hosted models. No third-party AI provider is involved."

> **In the privacy tab:** "Relay stores obligation metadata and verbatim source quotes in Forge-hosted storage. Model inference uses Atlassian's Forge LLM; Relay does not call any external model provider. Data-handling boundaries for the Forge platform are set by Atlassian's shared responsibility model."

> **If asked directly by a judge:** "No egress — that we control and can prove from the manifest. Retention and training terms for Forge LLM are Atlassian's to state, and I haven't verified them, so I'm not going to claim them."

The last sentence is worth more than the claim it replaces. A judge who catches an overclaim stops listening; a judge who hears a precise limit starts trusting the rest.

### 5.4 The egress-free risk nobody was watching

Every obligation quote Relay stores is a verbatim fragment of a case comment about a real person — and every extraction call sends the **whole comment** to the model. Both stay inside Atlassian. That is the platform's guarantee, and it is not the same as *"this data is invisible to people who should not see it"*.

Three concrete consequences that belong in §7 of the review proper, not in a footnote:

1. **Logs are a surface.** The Phase 0 probe logs model I/O. Product code must log counts, ids and reason codes — never comment text, never quotes. Add to AC26.
2. **The receipt path has no user context.** A receipt written from the validator cannot be permission-checked, so it must contain nothing that would matter if read by the wrong person. Counts only (§3.4).
3. **The customer update is drafted from the obligation, not the comment.** If a draft is generated from raw case text, it can carry internal detail into a customer-visible comment. v2 §9.11 has a leak guard; it needs an acceptance test (§9, AC27).

### 5.5 One install consequence of using Forge LLM

From the same API reference, and new to this review:

> "When you add the `llm` module to an app's `manifest.yml`, it triggers a **major version upgrade and requires administrators of existing installations to review and approve the update**." **[V]**

For the Codegeist submission this is mostly benign — a fresh install is a first install. But it means:

- every future release that touches `llm` needs admin re-approval, which is friction a judge trying an updated build may not complete;
- do not add the `llm` module late in the plan "to be safe" — it re-triggers approval on any existing test installation;
- the install instructions in §9.12 must mention that the app requests the LLM module, so an admin is not surprised by an approval prompt.

---

## 6. The consistency sweep: twelve findings

Beyond the five defects the review was commissioned to fix, a full pass over v2 found these. Each is small; the first two are not.

| # | Finding | Location | Severity | Resolution |
|---|---|---|---|---|
| **C1** | "No model call exists in … the notification path" — but the same section has the model *drafting* the customer update | §6.1 vs §6.3 | **High** — it is an absolute claim about the safety architecture that the architecture contradicts | Reworded: no model call in the **gate path or the closure path**; drafting is a model call whose output is human-approved and never auto-sent |
| **C2** | The validator "does no writes", yet a `closureRecord` must exist | §9.6 vs §9.8/AC12 | **Critical** | Fixed in §3: architecture amended, receipt written, single recorder owns the record |
| **C3** | "**Experiment 3**" is referenced twice as the signal for two risks, and defined nowhere — §10.1 defines Experiments 1 and 2 while its own table has four rows and its heading says "two experiments" | §10.1, §10.3 | **High** — a risk table pointing at a test that does not exist | Renumbered to four experiments (E1 gate, E2 extraction, E3 team-managed, E4 uninstall), plus five new probes T12–T16 (§10.1) |
| **C4** | 60% / 70% / 75% precision thresholds with no stated roles | §10.4, AC4 | Medium | §4.5 above: pivot floor, day-0 gate, release criterion |
| **C5** | AC1 mixes latency and yield: "≥90% of new comments yield an obligation or an explicit 'no commitment' within 90s" | §9.13 | Medium | Split into AC1a (latency) and AC1b (coverage), both ≥90%, both measured separately |
| **C6** | **F10 (P0) scheduled in P6 and dependent on an unverified REST endpoint** | §9.4, §9.7, §10.2 | **High** — a P0 feature that cannot be finished as designed | §2.5: installation-ledger design, testable offline, enumeration demoted to a stretch goal behind T16 |
| **C7** | **F3, F4, F6 and F16 have no acceptance test** | §9.4 vs §9.13 | **High** — a P0 without a pass condition is a wish | AC21–AC23, AC25 added; matrix in §9.2 |
| **C8** | "Duplicate events — content hash prevents double extraction" addresses extraction only and says nothing about closure events | §9.10 | Medium (became High once D3 was found) | §3.6: closure idempotency key, claim protocol, sweep |
| **C9** | Team-managed status stated as "almost certainly" in §0 and "probably unsupported" in §4.2 | §0, §4.2 | Low | Unified to: **"third-party evidence says unsupported; T8 is the test"** |
| **C10** | The probe declares `projectTypes: [company-managed, team-managed]` while §4.1 recommends reducing to company-managed | §4.1, `manifest.yml` | Low | **Deliberately not changed.** The probe reproduces Atlassian's documented example and must stay that way to remain evidence. The *product* manifest declares company-managed only |
| **C11** | §9.7 lists `jira:workflowValidator` as "Preview" with no discussion of what Preview implies | §9.7 | **High** | New §7 |
| **C12** | Judging instructions never state the company-managed requirement, and the video brief does not start on the right project type | §10.2 P7, §11.8 | **High** — a judge can do everything right and still see a broken product | New §8 audit table with binding requirements |

### 6.5 The two that were nearly missed

**C1 is more serious than its wording suggests.** "No model call in the notification path" was doing real work: it is the sentence that makes Relay defensible to a safety reviewer, because it says a model can never speak to a vulnerable person unsupervised. That is still true — but it is true because of *approval*, not because of *absence of inference*. Stating it as absence was both wrong and weaker: the actual control is stronger than the claim.

**C6 is the pattern this project keeps repeating.** A P0 feature was designed against an API nobody had opened. It happened with the uninstall transport, and V2.1 found it again in the same feature. The remedy in §2.5 works because it changes the question from "what does Jira know?" to "what do we know?", and the second is answerable today.

---

## 7. Preview status: availability and distribution risk

`jira:workflowValidator` is documented as **Preview**. v2 carried that word in a table and never explained it. Atlassian publishes what Preview means, and it cuts both ways.

| Property | Preview | GA | Consequence for Relay |
|---|---|---|---|
| Availability | "available to all users" **[V]** | all users | **No distribution block.** A Preview module is not a private beta |
| Support level | "the same level of support as GA features" **[V]** | same | No operational disadvantage |
| Opt-in | **Required**; preview features are "usually turned off by default (although they can be enabled on production environments)" **[V]** | Not required | **This is the risk.** If a site must enable something before the validator can be used, a judge's fresh site may show nothing |
| Deprecation window for breaking changes | **1 month minimum** **[V]** | 6 months | A breaking change could land inside the 52-day build or in the weeks a judge is evaluating |
| Stability commitment | "has passed Atlassian standards for stability, reliability, and security" **[V]** | same | Lower risk than an EAP feature — this is not an experiment |

**What this changes in the plan:**

1. **New experiment, T12 — run it first.** On a *freshly created* site with default settings, does the Relay validator appear in a company-managed workflow editor, and does it block? This is the judge's exact situation and nobody has tested it. If T12 fails, the entire enforcement story is unavailable to most judges and the plan stops before P1.
2. **Do not build a demo that depends on the preview module staying available.** The video must still be convincing if the validator is disabled on the recording site — meaning the obligation ledger, the handover brief and the refusal message need to exist as a coherent experience even in "advisory" mode.
3. **Ship the fallback in the same release, not later.** v2's fallback for a non-blocking validator — a post function plus a required transition-screen field, honestly labelled "advisory enforcement" — was listed as a contingency. Given Preview's one-month deprecation window, it should be treated as a design that exists, not a plan that might.
4. **Pin nothing.** The app cannot pin a module's behaviour. What it can do is detect at runtime that the rule did not evaluate (no receipt) and say so, which §3's `NO_RECEIPT_FOUND` path already does. **The provenance design is what makes a Preview dependency survivable**: if the module breaks after submission, closures stop being recorded as `verified`, and the organisation can see that, rather than silently receiving a compliance number computed from nothing.

Whether a Preview *module* is permitted in a Marketplace listing is a separate question, and it was not established here. No statement was found that it blocks listing, and no statement was found that it permits it. **Unverified [U]** — it does not matter for Codegeist judging (install link, not a listing), and it matters if Relay is ever published.

---

## 8. Company-managed only: is it reflected everywhere it has to be?

The constraint is worthless if it appears in the architecture and nowhere a human reads it. Audited against every surface where someone could form the wrong expectation:

| Surface | Where the constraint must appear | v2 status | Required change |
|---|---|---|---|
| Product vision / scope | §1.4 | ✅ stated | — |
| Install instructions | §9.12 item 2: "A company-managed project" | ✅ stated | Move to the **first** line, before site/JSM requirements |
| First-run experience | §9.10 error table + §9.11 setup card | ✅ designed | Add: the card must appear **before** any configuration step, not after a failed attempt |
| Admin page | §9.11 | ⚠️ implied | Add an explicit project-type row and a "create a company-managed project" link |
| Listing / submission text | §11.8 | ❌ **absent** | First two lines must state it (see below) |
| Video | §10.2 P7 | ❌ **absent** | The video must open on a company-managed project's board. No cut, no ambiguity about which project type is being shown |
| Judge-facing README | not covered by v2 | ❌ **absent** | One line at the top: "Relay enforces closure on **company-managed** Jira projects. Team-managed projects are not supported — here is why, and here is how to create one in 60 seconds" |
| Stranger test (P7) | §10.2 | ⚠️ "reproduces J4 unaided" | Exit criterion must be: *a stranger who creates a project of their own choosing either lands on a working gate or correctly understands why not within 60 seconds* |
| Demo seed | §9.14 | ✅ company-managed | Unchanged |

**Corrected submission opening** (replacing v2 §11.8's opening):

> **Relay — promises to people don't get lost.**
> Built for Jira Service Management **company-managed** projects, where Relay's closure gate is enforced by a workflow validator.

Naming the limitation in the first two lines costs nothing and prevents the single worst judging outcome: an evaluator who spends ten minutes concluding the product is broken.

**And the corresponding honesty requirement:** if T8 shows team-managed projects *do* work, this section is deleted rather than softened. A declared limitation that turns out to be false is still a defect in a document that claims to be evidence-led.

---

## 9. Acceptance criteria: every P0 feature gets a pass condition

### 9.1 Thresholds — unchanged, and stated together

V2.1 does not weaken anything. For the avoidance of doubt:

| Threshold | Value | v2.1 vs v2 |
|---|---|---|
| High-confidence precision (day-0 gate) | ≥70% | unchanged |
| High-confidence precision (release, AC4) | ≥75% | unchanged |
| Recall (release, AC5) | ≥60% | unchanged |
| Pivot floor | <60% after 2 iterations | unchanged |
| Quote verification (AC2) | 100% | unchanged |
| Quote verification (day-0) | ≥90% | unchanged |
| Enforcement paths blocked (AC6) | 3 / 3 | unchanged |
| Compliance counting | `verified` only | unchanged |

### 9.2 The full criteria, with the gaps filled

| # | Criterion | Feature | Pass test |
|---|---|---|---|
| AC1a | **Latency** | F1 | p90 ≤ 90s from comment creation to a stored decision (obligation or explicit none); measured on 30 seeded comments |
| AC1b | **Coverage** | F1 | ≥90% of new comments produce *either* an obligation *or* an explicit `no_commitment` record. A comment that produces neither is a failure, not a blank |
| AC2 | Provenance integrity | F2 | 100% of stored obligations have a quote that is a verbatim substring of the stored source after the documented normalisation |
| AC3 | No invented owners | F2 | 0 obligations with an owner not explicitly named or structurally assigned (audit 50 records) |
| AC4 | Precision | F2 | ≥75% of high-confidence obligations confirmed correct by **two** reviewers on 50 items |
| AC5 | Recall | F2 | ≥60% of commitments found by two human reviewers are captured on 30 documents |
| AC6 | Enforcement | F7 | Transition blocked from issue view, board and REST when blocking count > 0 |
| AC7 | Post functions | F7 | Post functions do not execute on a blocked transition |
| AC8 | Message quality | F7 | Blocking message states counts and next action; contains no obligation content, no names, no quote fragments |
| AC9 | Override | F8 | Requires ≥20 chars, records actor/time, appears on dashboard and in export |
| AC10 | Transfer | F5 | Assignee change moves obligations to `pending_transfer` and requires acceptance |
| AC11 | False closure | F4 | No code path sets `resolved` from model output |
| AC12 | Closure provenance | F11 | Every closure Relay observed carries exactly one of the four states; `unverified` excluded from every compliance figure; zero counts as `null`, not 100% |
| AC13 | Permission isolation | F3 | A user without project B access sees no B obligations on any surface |
| AC14 | Injection resistance | F2 | An instruction-bearing comment creates no obligation and no state change, and is logged |
| AC15 | Fail-safe | F11 | Store unavailable → gate allows, `unverified` stamped, audit event written |
| AC16 | Project-type detection | F9 | Installing into a team-managed project shows the actionable card, not a silent no-op |
| AC17 | Pre-uninstall audit | F10 | Lists every rule Relay recorded as installed for this tenant, and states plainly that it cannot see rules added outside Relay's setup |
| AC18 | Accessibility | all | Keyboard-only completion of J1–J5; visible focus; ≥4.5:1 contrast; screen-reader labels |
| AC19 | Empty state | F3 | Fresh project renders a helpful setup state with no console errors |
| AC20 | Performance | all | Panel first paint <1.5s with 200 obligations; gate p95 <2s |
| **AC21** | **Handover brief** | **F6** | Every obligation in `{owned, pending_transfer, unowned}` for the viewer's projects appears exactly once, grouped by owner, unowned first, overdue sorted by date. Asserted against a seeded set of 25 |
| **AC22** | **Drop with reason** | **F4** | Drop requires ≥20 characters, records actor and timestamp, sets state `dropped`, and the gate then blocks on the remaining items only; an empty or short reason is rejected by the server, not the UI |
| **AC23** | **Seed idempotency** | **F16** | Running the seed twice creates no duplicate obligations; a documented removal action leaves zero orphan records and no gate state |
| **AC24** | **Panel completeness** | **F3** | Every obligation for the issue is rendered exactly once with quote, due, owner, confidence and state; the header counts equal the row counts; clicking a quote opens the source comment |
| **AC25** | **Provenance write path** | **F11** | Duplicate delivery → one record. Delayed delivery within the retention window → `verified` with the correct receipt. Missing receipt → `unverified`. Reordered deliveries → each closure claims its own receipt. **No input produces `verified` without a claimed clear receipt** |
| **AC26** | **No content in receipts or logs** | F11 | A receipt and every log line emitted by the validator contain identifiers and counts only — zero comment text, zero quotes, zero beneficiary labels. Asserted by scanning captured output for seeded strings |
| **AC27** | **Customer draft leak guard** | F12 | A draft generated from a case containing internal-only terms (a colleague's name, a clinical detail, an internal code) is either blocked or flagged before posting; zero internal terms reach the public comment in 20 adversarial cases |

AC21–AC27 close C7 and C8. AC25 is the test that makes §3 real; AC26 is the one most likely to be forgotten under deadline pressure and the cheapest to write.

### 9.3 Feature-to-criterion matrix

| Feature | Priority | Criteria |
|---|---|---|
| F1 Extraction (event-driven) | P0 | AC1a, AC1b |
| F2 Obligation with verified quote | P0 | AC2, AC3, AC4, AC5, AC14 |
| F3 Issue panel ledger | P0 | AC13, AC19, AC24 |
| F4 Accept / reassign / resolve / drop | P0 | AC11, AC22 |
| F5 Ownership transfer | P0 | AC10 |
| F6 Handover brief | P0 | AC21 |
| F7 Workflow validator gate | P0 | AC6, AC7, AC8 |
| F8 Audited override | P0 | AC9 |
| F9 Project-type detection | P0 | AC16 |
| F10 Pre-uninstall audit | P0 | AC17 |
| F11 Four closure states + write path | P0 | AC12, AC15, AC25, AC26 |
| F16 Demo seed | P0 (judging) | AC23 |
| F12 Customer update | P1 | AC27 |
| F13–F15 | P1 | covered by AC12, AC19, AC20 |

**No P0 feature is without a pass condition.** That was not true in v2, and it is the kind of gap that gets discovered in week six, on the day someone asks "is this done?".

---

## 10. Order of work: does it respect the dependencies?

### 10.1 The experiments, renumbered and extended

v2 had "two experiments" in a heading, four rows in a table, and references to a third that was never defined. Here are all nine, ordered by what they block.

| ID | Question | Blocks | Time |
|---|---|---|---|
| **T12** | On a **fresh, default-configured** site, does the Relay validator appear in a company-managed workflow and block a transition? (Preview opt-in) | Everything. If this fails, 3 of 11 P0 features are unavailable to a judge | 20 min |
| **E1** | Does the validator block on **all three entry paths**, suppress post functions, and render the message? | P4 | 40 min |
| **T15** | May a validator function **write a receipt** to Forge storage during evaluation, inside the budget? | P4 / §3 design | 20 min |
| **T13** | Does a Forge product trigger deliver a **Jira transition event**, with actor and transition, at what latency? | P4 recorder | 20 min |
| **T14** | How does the app **detect project type** from the REST project resource (exact field, confirmed against the reference — not guessed)? | P1 / F9 / AC16 | 15 min |
| **E2** | Forced-`tool_choice` extraction over 30 comments through the real Forge LLM, quote-verified, scored | P2, and the product decision | 2 h |
| **E3** | Team-managed behaviour (T8 in the matrix) | F9 messaging, §8 claims | 10 min |
| **E4** | Uninstall behaviour and recovery (T10, T10b) | F10, §2 claims | 20 min |
| **T16** | Is there a REST endpoint that enumerates a site's workflows and attached rules? | F10's *enumeration* upgrade | 20 min |

**Ordering logic:** T12, E1, T15 and T13 are all about the same subsystem and can be done in one sitting on one site. E2 needs the deployed app and the LLM module. Nothing here is speculative work; every item closes a question that a design decision is currently guessing at.

### 10.2 Dependencies the v2 plan violated

| Violation | Consequence in v2 | Fixed by |
|---|---|---|
| F10 (P0) scheduled in **P6** while its transport was unwritten and its API unverified | A P0 feature that could not start until phase 6, then could not finish | Ledger design (§2.5); logic moves to P1, UI stays in P6 |
| The closure recorder had **no owner and no phase** while AC12 was scheduled in P4 | P4 would have "passed" AC12 by asserting a record nothing writes | §3 design + T13/T15 before P4 |
| F9 project-type detection in **P1** with no verified detection method | A P1 exit criterion that could not be met on day one | T14 before P1 |
| "Experiment 3" referenced as a risk signal but never defined | Two risks with no early signal | E3/E4 named and placed |
| Preview status of the validator never tested on a fresh site | The judge's exact scenario, unexercised | T12 first |

### 10.3 Revised phases

Only the rows that change are shown; P2, P3, P5 keep v2's shape.

| Phase | Days | Work | Depends on | Exit criteria |
|---|---|---|---|---|
| **P0** | 0–2 | T12, E1, T15, T13, T14, E2, E3, E4 | site + login | §10.4 gates met |
| **P1** | 2–6 | Schema; admin page; seed; panel shell; **project-type detection (T14)**; **installation ledger (F10 logic)** | P0, T14 | AC16, AC17 (logic), AC23, AC19 |
| **P2** | 5–13 | Trigger → queue → consumer; prompt; quote verification; review queue | P0/E2 | AC1a, AC1b, AC2–AC5, AC14 |
| **P3** | 10–17 | Accept/reassign/resolve/drop; transfer; audit events | P2 | AC10, AC11, AC21, AC22, AC24 |
| **P4** | 15–20 | Gate state maintenance; validator; **receipt write (T15)**; **closure recorder (T13)**; **sweep**; override; fail-safe | P3, E1, T13, T15 | AC6–AC9, AC12, AC15, AC25, AC26 |
| **P6** | 20–31 | Handover board, debt trend, empty states, keyboard pass, **F10 UI** | P4, P5 | AC13, AC18, AC20 |
| **P7** | 29–38 | Stranger test **on a company-managed project they created**; video opening on that project; submission text | all | §8 exit criterion |

P4 is now twice its v2 size because it absorbed the write path that v2 left unowned. That is honest accounting of work that always existed.

### 10.4 The day-0 checkpoint, with one addition

v2's five gates stand unchanged. One is added, because V2.1 introduced the dependency:

| Gate | Threshold |
|---|---|
| Gate blocks on all three entry paths | 3/3 |
| Post functions suppressed when blocked | Yes |
| Quote-verification rate | ≥90% |
| Precision on high-confidence obligations | ≥70% |
| A team-managed project shows the actionable card | Yes |
| **A fresh site can run the validator without enabling anything undocumented** | **Yes** (T12) |

And the standing pivot rule is unchanged: **if precision is below 60% after two iterations, or the validator cannot block, pivot to Close Call on day 11.**

---

## 11. Decision

### BUILD RELAY WITH SPECIFIC MODIFICATIONS — now nine

The verdict does not change, because none of the six defects touches the reason for building Relay: a documented problem, a platform mechanism that exists, a provenance constraint nobody else implements, and the highest ceiling in the set.

What changes is that the *implementation* of the differentiator turned out to be undesigned, and now is designed.

### 11.1 The nine modifications

v2's eight, plus one:

1. Declare company-managed support, detect project type on first run, never let a team-managed install look broken.
2. Stop selling the gate; lead with capture and provenance.
3. Make quote verification the architectural centrepiece.
4. Custom Entity Store, not Forge SQL; no Teamwork Graph in the MVP.
5. Beneficiary visibility via a human-approved customer comment.
6. Ship the four closure states; exclude `unverified` from every compliance figure.
7. Ship the pre-uninstall audit as P0 — **now as a self-reported installation ledger, not site enumeration**.
8. Freeze scope at the end of P5.
9. **Own the closure-provenance write path**: validator writes one content-free receipt; a single event-driven recorder writes the record; a sweep closes gaps as `unverified`; nothing else may ever produce `verified`.

### 11.2 What V2.1 changes about how the work is done

- **Provenance is a subsystem, not a field.** It has records, a claim protocol, idempotency, a sweep and four tests. It was one line in a data model.
- **Uninstall claims are now honest about their evidence.** This lowers what the submission may say and raises what the product must do.
- **Preview is a named risk with a test**, not a word in a table.
- **The review's own numbers are guarded by a script**, because the headline was wrong once.

### 11.3 The corrected submission description

The only approved wording. It replaces v2 §11.8 entirely, because that paragraph contained the one claim V2.1 could not support.

> **Relay — promises to people don't get lost.**
> Built for Jira Service Management **company-managed** projects.
> Service teams make commitments in the middle of casework: *"I'll get a surveyor out by Thursday."* When the agent changes shift, goes on leave or leaves, the promise survives only as a sentence nobody reads. Relay finds those commitments in case comments, turns each into an obligation anchored to the exact sentence that created it, keeps it owned through staff changes, and blocks case closure while a promise is unresolved — unless a named person drops it with a reason. If the quote isn't in the case, the promise is thrown away.
> **Runs on Atlassian eligible:** no external network calls, inference on Atlassian-hosted models, no third-party AI provider.

Three changes from v2's version, and each one is a claim the team can defend under questioning: the project type is stated first, the provenance line does the persuading, and the privacy line says what is true rather than what sounds strongest.

### 11.4 The recommendation

Stated in full at the end of this document, after the sources, so that it is the last thing read rather than the middle thing skimmed.

---

## 12. What V2.1 still cannot tell you

Stated plainly, so that no reader of this document mistakes an organised argument for evidence:

| Question | Status | Where the answer will come from |
|---|---|---|
| Does the gate block? | **Untested** | E1 |
| Does it work on a fresh site? | **Untested** | T12 |
| Team-managed: supported? | **Third-party evidence says no; untested by us** | E3 |
| What does uninstall actually do? | **Third-party documented, inferred, untested** | E4 |
| Can the validator write a receipt? | **Untested — and the design depends on it** | T15 |
| Does the transition event arrive, with an actor? | **Untested — and the design depends on it** | T13 |
| Is extraction good enough? | **Unmeasured. No number exists** | E2 |
| Is the dataset's ground truth right? | **Single annotator** | Second reviewer (F6) |
| Are retention/training terms for Forge LLM acceptable? | **Not verified** | Atlassian's terms, read by someone qualified to interpret them |
| Does a Preview module block a Marketplace listing? | **Not verified** | Marketplace policy, if Relay is ever published |

Six of those ten are answered by four hours on a live site. Two need a second human. Two need a legal read, and neither blocks the build.

This is the honest position: **a well-specified product with an unvalidated core and a short, cheap path to validating it.** That is a much better position than it was in yesterday, and it is not the same thing as being ready.

---

## 13. Sources

**Added in V2.1 — verified**

- Runs on Atlassian — eligibility scope, data residency, egress controls, and the explicit limitation on what the badge covers: https://developer.atlassian.com/platform/forge/runs-on-atlassian/
- Forge LLMs API reference — Atlassian-hosted inference; "retains its Runs on Atlassian eligibility"; the `llm` module triggering a major version upgrade requiring admin approval; the `temperature`/`top_p` model list: https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-reference/
- Forge release phases — EAP vs Preview vs GA, opt-in, one-month deprecation window for Preview: https://developer.atlassian.com/platform/forge/beta-limitations
- Shared responsibility model — tenant safety is shared; the boundary RoA defers to: https://developer.atlassian.com/platform/forge/shared-responsibility-model/
- `@forge/manifest@13.8.0`, read in this environment: `jira:workflowPostFunction` exists; `projectTypes` **defaults to `["company-managed"]`** on the validator, the condition and the post function; validator `required` is `["description","name","key"]`

**Added in V2.1 — third-party**

- `avi:jira:transitioned:issue` as a real Jira event identifier (Atlassian engineering blog): https://www.atlassian.com/blog/how-we-build/using-an-event-driven-architecture-to-improve-jira-software-responsiveness

**Carried from v2**

- Jira workflow validator module (Preview), payload and `resolver` contradiction: https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-validator/
- Jira workflow condition (expression only, no `function`): https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-condition/
- JSM portal request detail panel — no anonymous access: https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-service-management-portal-request-detail-panel/
- Async Events API: https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api/
- KVS / Custom Entity Store limits: https://developer.atlassian.com/platform/forge/limits-kvs-ce/
- Jira Cloud rate limiting: https://developer.atlassian.com/cloud/jira/platform/rate-limiting/
- Team-managed limitation — three independent practitioner sources: https://community.developer.atlassian.com/t/neither-tutorial-nor-sample-app-is-working/58826 · https://community.atlassian.com/forums/Jira-questions/Scriptrunner-custom-workflow-validator/qaq-p/3042854 · https://community.atlassian.com/forums/Jira-Service-Management/Validator-or-Conditional-Closing-Workflow-Restrictions-amp/qaq-p/2854233
- Uninstall behaviour: Railsware https://railsware.atlassian.net/wiki/spaces/CHK/pages/3807641616/ · Atlassian KB https://confluence.atlassian.com/jirakb/unable-to-delete-validator-from-workflow-transition-1095768243.html · JRACLOUD-23885 https://jira.atlassian.com/browse/JRACLOUD-23885
- Release Readiness Gate (Forge case study): https://github.com/mikekotas/jira-release-readiness-gate
- Smart Checklist validator: https://railsware.atlassian.net/wiki/spaces/CHK/pages/3807641616/
- Codegeist 2026 rules: https://codegeist2026.devpost.com/rules

**Own executed evidence (unchanged by this document)**

- `phase0/harness/results/*` — dataset integrity, resolver 17/17, conformance 13/13, regex baseline, manifest validation
- `phase0/VALIDATION-REPORT.md`, `phase0/PHASE-0.2-REPORT.md`, `phase0/report.json`
- `phase0/validator-probe/` — 71 passing tests (gate 11, handler 10, extraction 29, enforcement 14, uninstall 7)

---

*V2.1 supersedes v2 on the six points in §0.2 and the twelve in §6. Elsewhere, v2 stands. Where this document and v2 disagree, this one is correct, and `RELAY-V2.1-CHANGELOG.md` records every difference.*

---

## Recommendation

# PROCEED TO LIVE VALIDATION

Not **correct further.** There is nothing left in these documents that another week of writing would improve. Every remaining uncertainty is empirical, and the experiments that would resolve most of it fit in one afternoon on a site that already exists. A fourth review would be a way of avoiding the first test.

Not **pivot to Close Call.** The pivot criterion is precision below 60% after two prompt iterations, and no precision has been measured — not by Forge LLM, not by anything. Pivoting now would be a decision made from discomfort, which is exactly what Phase 0.2 refused to do when it would have been easy.

**The order, and it is not negotiable:**

1. **T12** — a fresh site with default settings: does the validator work at all? Fifteen minutes that determine whether three of eleven P0 features exist for a judge.
2. **E1** — three entry paths, post-function suppression, the blocking message.
3. **T15 and T13** — can the validator write a receipt, and does the transition event arrive with an actor.
4. **E2** — the extraction benchmark, with the second annotator reviewing ground truth *before* the scores are known.
5. **E3, E4, T14, T16** — the declared limitations and the stretch endpoint.

If T12, E1, T15 and T13 all pass, Relay's hardest design problem is solved and what remains is execution. If T12 fails, the product cannot be demonstrated to a judge who creates a project of their own, and the plan stops at P0 rather than at P4.

**What must not happen:** building P1–P3 first because those are the parts whose shape is already known. v2 made that tempting — it put the decisive test on day 0 and then let five phases proceed regardless of the answer. The gate is not a phase. It is the product.

**And the standing condition, unchanged since Phase 0:** no product code until E1 passes and the benchmark has numbers. If E1 fails, the enforcement thesis is rewritten before anything else is built. If precision lands under 60% twice, Relay becomes Close Call using the shared Phase 1–2 work.

V2.1 fixed what could be fixed from a desk. Everything that remains needs a browser, a login and four hours.
