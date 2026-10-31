# V2 → V2.1 change log

**Scope:** every substantive difference between `RELAY-REVIEW-V2.md` and `RELAY-REVIEW-V2.1.md`.
**Not changed:** `phase0/` test results, thresholds, the score of any product, the original v2 and v1 documents.

**Reading note.** v2 was not rewritten. V2.1 replaces it on the eighteen points below and binds the rest by reference (§0.1 of V2.1). Where the two disagree, V2.1 is correct.

---

## A. The six commissioned corrections

| ID | v2 location | What v2 said or did | What V2.1 says instead | Severity | Basis |
|---|---|---|---|---|---|
| **D1** | §0 "The verdict now" | "Relay is now **79** to Close Call's 80 … moves Relay's Atlassian-fit and feasibility scores down" | "Relay is now **level with Close Call at 80** … moves one number: MVP feasibility, 10 → 9" | Corrected before V2.1 (commit `6b484a0`); now machine-checked | Arithmetic (§1.1) |
| **D2** | §4.1, §7.4 | "Uninstall behaviour — **resolved** as far as anyone can without doing it"; "the hazard is: real, blocking, signposted, and sometimes awkward to fix" | Three tiers: third-party documented / inferred / **Relay-tested: nothing**. Hazard is "**plausibly** blocking, **reportedly** signposted, **possibly** awkward". The word "verified" is removed from every uninstall claim | High | §2 |
| **D3** | §9.6 vs §9.8, AC12 | Validator "no writes" **and** a `closureRecord` **and** "every closure carries one state" — with nothing writing the record | Validator writes exactly one content-free `decisionReceipt`; a single event-driven `closureRecorder` writes the record; a sweep closes gaps as `unverified`; invariant stated formally | **Critical** | §3 |
| **D4** | §3.3, §4.4, §6.1 | 92.3% / 50% presented near model discussion without a standing qualifier | Every mention now says **regex baseline**; Forge LLM is stated as **unmeasured** in §4.2; language rules added in §4.4 | High | §4 |
| **D5** | §11.8 submission text | "Built on Forge LLMs; **no data leaves Atlassian**" | "Runs on Atlassian eligible: no external network calls, inference on Atlassian-hosted models." Retention/training terms explicitly **not claimed** | High | §5 |
| **D6** | twelve places | see section B | see section B | mixed | §6 |

---

## B. The twelve consistency findings

| ID | v2 location | Defect | V2.1 change | Severity |
|---|---|---|---|---|
| **C1** | §6.1 vs §6.3 | "No model call exists in … the notification path" contradicts the model drafting the customer update two paragraphs later | Split: no model call in the **gate** or **closure** path; drafting is a model call, human-approved, never auto-sent. The real control is approval, not absence | High |
| **C2** | §9.6 / §9.8 / AC12 | Same as D3 | Same as D3 | Critical |
| **C3** | §10.1, §10.3 | "Experiment 3" referenced twice as a risk signal, never defined; §10.1 heading says "two experiments" over a four-row table | Nine named experiments: T12, E1, T15, T13, T14, E2, E3, E4, T16, in dependency order | High |
| **C4** | §10.4, AC4 | 60% / 70% / 75% precision thresholds with no stated roles | Ladder stated: 60 = pivot floor, 70 = day-0 gate, 75 = release criterion. Values unchanged | Medium |
| **C5** | AC1 | One criterion measuring latency and yield together | Split into AC1a (p90 ≤ 90 s) and AC1b (≥90% yield a decision) | Medium |
| **C6** | §9.4, §9.7, §10.2 | F10 (P0) scheduled in P6 on an unverified REST endpoint, with no transport | Redesigned as a **self-reported installation ledger** — reads Relay's own records, testable offline, honest about what it cannot see. Enumeration demoted to stretch, behind T16 | High |
| **C7** | §9.4 vs §9.13 | F3, F4, F6, F16 had no acceptance test | AC21–AC24 added; matrix in §9.3. No P0 feature is now without a pass condition | High |
| **C8** | §9.10 | "Duplicate events — content hash prevents double extraction" covered extraction only, said nothing about closure events | §3.6: idempotency key, claim protocol, delay/ordering/failed-write rules, all failing toward `unverified`; AC25 | High |
| **C9** | §0 vs §4.2 | Team-managed described as "almost certainly" in one place and "probably" in another | Unified: "third-party evidence says unsupported; T8 is the test" | Low |
| **C10** | §4.1, `manifest.yml` | Probe declares team-managed while §4.1 recommends company-managed only | **Deliberately unchanged.** The probe reproduces Atlassian's documented example and must stay that way to remain evidence. The product manifest declares company-managed only | Low |
| **C11** | §9.7 | `jira:workflowValidator` listed as "Preview" with no explanation of what Preview implies | New §7: Preview is available to all users with GA-level support, but is **opt-in**, "usually turned off by default", and carries a **one-month** deprecation window. New test T12 | High |
| **C12** | §10.2 P7, §11.8 | Company-managed requirement absent from judging instructions and video brief | §8 audit table; corrected submission opening; video must open on a company-managed project; stranger-test exit criterion rewritten | High |

---

## C. Claims that were strengthened (new evidence)

These are not corrections — they are new findings from sources v2 did not have. All were verified in this environment.

| Finding | Effect | Basis |
|---|---|---|
| Adding the `llm` module **retains** Runs on Atlassian eligibility | Narrows D5 honestly *and* strengthens the architecture story | Forge LLMs API reference **[V]** |
| `projectTypes` **defaults to `["company-managed"]`** on the validator, condition and post function | The probe's team-managed declaration is an opt-in, not a default; the product manifest is a one-line change | `@forge/manifest@13.8.0` **[V]** |
| `jira:workflowPostFunction` exists as a module | Makes the post-function fallback concrete rather than aspirational — and §3.3 explains why it is *not* the primary writer | `@forge/manifest@13.8.0` **[V]** |
| Preview features are opt-in and "usually turned off by default" | A new high-severity install risk with a 15-minute test | Release-phases page **[V]** |
| Runs on Atlassian explicitly defers "tenant safety and data handling" to the shared responsibility model | The absolute privacy claim was never supportable from the badge | Runs on Atlassian page **[V]** |
| Adding the `llm` module triggers a major version upgrade requiring admin re-approval | New install-friction note for §9.12 | Forge LLMs API reference **[V]** |

---

## D. What was deliberately not changed

| Thing | Why |
|---|---|
| All thresholds (70%, 75%, 60% precision; 60% recall; 100% quote verification; 3/3 enforcement) | The instruction was not to weaken them. §9.1 restates them in one place so any future change is visible |
| Any `phase0/` file, test, result or report | Phase 0 and 0.2 evidence is preserved byte-for-byte. F3's *description* is re-scoped in the review (§3.8), not in the report |
| The scores of any product | 80 / 80 / 76, recomputed and confirmed (§1.1) |
| The probe's `manifest.yml` | It is evidence of Atlassian's documented example; editing it would destroy that |
| v2 and v1 | Both remain in the repository. v2.1 supersedes v2 only where it speaks |
| Eight of the nine modifications | Only #7 (F10 design) and the new #9 (write path) changed |

---

## E. Files touched

| File | Change |
|---|---|
| `RELAY-REVIEW-V2.1.md` | **New** — the corrected review |
| `RELAY-V2.1-CHANGELOG.md` | **New** — this file |
| `RELAY-V2.1-RISK-REGISTER.md` | **New** — claim and risk register |
| `RELAY-V2.1-LIVE-BLOCKERS.md` | **New** — everything that needs a live site |
| `RELAY-REVIEW-V2.md` | **Status banner added** under the title, pointing here. Content otherwise untouched |
| `README.md` | Document index updated: v2.1 current, v2 superseded |
| `phase0/harness/check-review.mjs` | Extended to check both review documents |

No application code was written. No Phase 0 artefact was modified.
