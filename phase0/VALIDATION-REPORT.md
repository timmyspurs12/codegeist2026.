# Relay — Phase 0 technical validation report

**Date:** 30 October 2026
**Scope:** prove or disprove the two load-bearing mechanisms before any product code exists
**Status:** one mechanism partially proven (logic and manifest), one mechanism **blocked** by environment
**Recommendation:** **PROCEED WITH RELAY AFTER SPECIFIC FIXES** — conditional, and not on the evidence you asked for

---

## The headline, before the detail

The brief asks me to prove two things. I could honestly prove neither end-to-end, and I proved quite a lot around them. Saying which is which is the whole point of this document.

| Mechanism | What I could test | What I could not | Verdict |
| --- | --- | --- | --- |
| **Windows into a Jira transition** | Manifest shape, schema conformance, decision logic, all five failure paths, return contract | That Jira invokes it, blocks the transition, and shows the message | **UNVERIFIED LIVE** — 48/48 tests pass, but zero live evidence |
| **AI commitment extraction** | Prompt, tool schema, quote guard, owner grounding, deadline recomputation, injection handling, scoring, dataset | The model's actual precision and recall on 30 comments | **BLOCKED** — not a failure, a missing capability |

This report does not dress either of those up. Section 3 lists the nine checks you specified with a status against each one, and five of them say **NOT TESTED**.

Two things did come out of today that are worth more than a green tick:

1. **The gate mechanism is confirmed at schema level, and the alternative is confirmed dead.** `jira:workflowCondition` has no `function` property in the platform schema at all — verified in two independent versions of `@forge/manifest`. `jira:workflowValidator` has one. The pre-build review was right, and now it is machine-checked rather than argued.
2. **Forge LLM cannot be reached from outside Forge.** `@forge/llm` posts to an internal `https://llm` endpoint through a runtime-provided `__forge_fetch__`. There is no external HTTP surface. This is why the benchmark could not be run here, and why any "results" I produced from a local model would have been a different experiment wearing the same label.

---

## 1. Environment inspection

Full detail in `docs/ENVIRONMENT.md`. Summary:

| Item | Result |
| --- | --- |
| Existing Relay repo or app | **None.** Two markdown documents only. Nothing overwritten |
| Branch / HEAD / tree | `arena/06fd2e30-codegeist2026` · `4fe156b` · clean |
| Node.js | v22.22.3 |
| npm | 10.9.8 |
| Forge CLI | not installed → installed **14.2.0** |
| Forge CLI 15.0.0 | installs, refuses to run (needs Node ≥ 22.23.4; sandbox has 22.22.3) |
| Atlassian development site | **none** |
| Forge login / `~/.forge` | **absent** |
| Credentials present | `GITHUB_TOKEN`, `GH_TOKEN` only — no Atlassian or model credentials |
| `*.atlassian.net`, `id.atlassian.com`, `api.atlassian.com`, `developer.atlassian.com` | **all unreachable** (connection failed) |
| `registry.npmjs.org` | reachable (200) — which is how the package typings below were inspected |

### What is missing and what it costs

| Missing | Blocks | Fix |
| --- | --- | --- |
| Atlassian API token + `forge login` | deploy, install, webtrigger | token from `id.atlassian.com`, then `forge login` |
| Jira Cloud dev site | every live test | free site |
| (optional) JSM on that site | the customer-facing half of the scenario | on by default for new sites |

`docs/UNBLOCK.md` has the exact command sequence. **45–60 minutes** end to end, of which the benchmark is ~3 minutes of machine time.

**No credential, token or site URL was written to any file. No secret appears in this repository.**

---

## 2. Files created and modified

Nothing existing was modified. All new work is isolated under `phase0/` and clearly labelled as a probe.

```
phase0/
├── VALIDATION-REPORT.md              ← this document
├── README.md                         ← what the directory is, and what to delete
├── dataset/
│   ├── comments.json                 30 hand-authored comments
│   └── ground-truth.json             hand-labelled truth (24 strict commitments)
├── docs/
│   ├── ENVIRONMENT.md                Part 1 findings
│   ├── MANIFEST-EVIDENCE.md          schema-level proof of the validator/condition finding
│   └── UNBLOCK.md                    exact steps to run the blocked experiments
├── harness/
│   ├── run.mjs                       dataset check + resolver cross-check + conformance + baseline
│   ├── baseline.mjs                  deterministic regex extractor (instrument check, not a model)
│   ├── sync-dataset.mjs              projects canonical dataset into the app
│   ├── validate-manifest.mjs         ajv validation against the real @forge/manifest schema
│   └── results/                      generated: dataset-check, conformance, baseline, manifest-validation, summary
└── validator-probe/                  the Forge app
    ├── manifest.yml                  workflowValidator + llm + webtrigger, no egress
    ├── package.json                  type: module; @forge/api 8.4.0, kvs 2.1.1, llm 1.0.9
    ├── src/
    │   ├── gate.js                   pure decision logic (no I/O, cannot throw)
    │   ├── gate-handler.js           handler with injected I/O (testable failure paths)
    │   ├── index.js                  Forge entry points: gate + lab webtrigger
    │   ├── data/                     generated copy of the dataset (checksummed)
    │   └── extraction/
    │       ├── normalize.js          unicode/whitespace normalisation for the quote guard
    │       ├── verify.js             (folded into normalize.js)
    │       ├── deadline.js           deterministic date resolution, 17 rules
    │       ├── schema.js             emit_obligations tool schema + runtime validator
    │       ├── prompt.js             system prompt, untrusted-content framing
    │       ├── pipeline.js           five-check enforcement layer
    │       └── score.js              matching + metrics + markdown
    └── test/
        ├── gate.test.js              10 tests
        ├── handler.test.js           8 tests
        └── extraction.test.js        30 tests
```

Totals: **19 source files, 48 passing tests, 0 existing files modified.**

---

## 3. Workflow validator — results against your nine checks

### 3.1 The nine checks

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Validator deploys successfully | **NOT TESTED** | No site, no login. Manifest passes schema validation and reached the post-validation stage of `forge lint` |
| 2 | Can be added to a Jira transition | **NOT TESTED** | Documented as a workflow-editor validator; module declared with `projectTypes` and static `errorMessage` |
| 3 | Blocks when state requires blocking | **LOGIC PROVEN, LIVE UNTESTED** | `decideGate` returns `{result:false}` for any positive count; 10 unit tests; 8 handler tests |
| 4 | Permits when state permits | **LOGIC PROVEN, LIVE UNTESTED** | Returns `{result:true}` with no `errorMessage` key at all |
| 5 | Dynamic error message displayed | **CONSTRUCTED, NOT DISPLAYED** | Message is built from live counts and asserted in tests; nothing has rendered it in Jira |
| 6 | Company-managed project | **NOT TESTED** | Schema default is `["company-managed"]`; not exercised |
| 7 | Team-managed compatibility | **DECLARED, NOT TESTED** | `projectTypes` includes `team-managed` (schema enum: `[team-managed, company-managed]`) |
| 8 | Issue view / board / REST paths | **NOT TESTED** | Test matrix rows T5–T7 in `docs/UNBLOCK.md` |
| 9 | Uninstall / app-unavailable effect | **NOT TESTED — and this is the highest-risk open question** | See §6.4 |

Five of nine are untested. I am not going to write "verified" next to any of them.

### 3.2 What was proven, and how

**The mechanism exists and the competing mechanism does not.** From the JSON Schema shipped in `@forge/manifest`, checked in both CLI 14.2.0's bundled copy and the current published 13.8.0:

```
jira:workflowValidator  → create, description, edit, errorMessage, expression,
                          function, key, name, projectTypes, resolver, view
jira:workflowCondition  → create, description, edit, evaluateAgainstOriginalIssue,
                          expression, key, name, projectTypes, resolver, view
```

No `function` on the condition. `expression` is **required** on it. Meanwhile `resolver` appears on both, which is exactly how people talk themselves into believing a condition can call code — it resolves the *configuration UI*, not the evaluation.

This is a machine-checked confirmation of the review's finding, and it cost nothing to obtain. It should have been the first thing anyone looked at.

**The decision logic is total and safe.** `decideGate` is a pure function that cannot throw and has no I/O. Handed `null`, `undefined`, `{}`, `'nonsense'`, `{blockingCount:'four'}`, negative counts, or `NaN`, it returns a decision. That matters more than it sounds: an exception inside a workflow validator is an unexplained block on a real person's case, which is worse than no validator at all.

**The failure paths work.** The handler takes its dependencies as parameters, so the paths a live deploy only reaches during an outage are covered by tests:

| Path | Behaviour | Test |
| --- | --- | --- |
| Entity store readable, blocking | blocked, counts in message | ✓ |
| Entity store readable, clear | `{result:true}` | ✓ |
| Entity store throws, labels readable | falls back to labels, still blocks | ✓ |
| Both throw | **allows**, writes `GATE_STATE_UNAVAILABLE_ALLOWED` | ✓ |
| Both throw, `policy: fail-closed` | blocks with the fixed message | ✓ |
| Non-`Error` thrown (`throw 'string'`) | does not reject | ✓ |
| Payload shape `{issue:{key}}` / `{issueKey}` / `{issue}` / `{key}` / string / null | key extracted or `UNKNOWN`, decision still safe | ✓ |

**The return contract is exact.** `{result:true}` or `{result:false, errorMessage}` — asserted to have no additional keys, because a validator that returns junk alongside `result` is a validator whose behaviour nobody has verified.

### 3.3 The message

The fixed sentence is preserved verbatim:

> Relay has unresolved promises attached to this case. Review the obligation ledger before closing it.

Counts are appended from live state, which is what makes the message demonstrably dynamic:

> …before closing it. (2 unresolved: 1 with no owner, 1 overdue)

Counts only, never content. Anyone who can transition the issue will see this text, so a message naming a tenant would be a data leak through the error channel. There is a test asserting the message contains no names, addresses or summaries.

### 3.4 Team-managed projects

Declared via `projectTypes: [company-managed, team-managed]`. The schema's default is `["company-managed"]`, so this is opt-in and must be stated in install instructions. Whether team-managed workflows honour a lambda validator in practice is **not verified**, and it is the second item on the unblock matrix (T8).

---

## 4. Test dataset and extraction results

### 4.1 The dataset

30 hand-authored comments in a housing-repairs service desk, all synthetic, written in three registers (formal, terse, non-native) plus three languages. Not generated by the model under test — see the authorship caveat in §4.5.

Coverage, as specified:

| Requirement | Cases |
| --- | --- |
| Explicit promise with deadline | C01, C02, C05, C08, C09, C16, C18, C19, C21, C24, C26 |
| Promise without deadline | C04, C17, C29 |
| Promise without a named owner | C02, C05, C22 |
| Multiple promises in one comment | C03 (3), C23 (2), C29 (2) |
| Duplicate promises, worded differently | C06 / C07 |
| Contradictory / superseding promises | C08 / C09 |
| No promise | C10, C11, C13, C20, C25, C27, C30 |
| Very short comments | C12 (`ok will do`), C13 |
| Ambiguous | C12, C14, C15 |
| Non-native English | C16, C17 |
| Non-English | C18 (Romanian), C19 (Spanish) |
| Prompt injection | C20 (pure), C21 (mixed with a real promise), C22 (owner forgery), C30 (HTML comment) |

Ground truth: **24 strict commitments across 27 comments**, plus 3 comments marked *ambiguous* and reported separately so they can neither inflate nor deflate a score.

**Dataset integrity is machine-checked:** every one of the 24 labelled evidence sentences was verified to be a verbatim substring of its comment before any extraction ran. If a label were wrong, the benchmark would be measuring the label.

### 4.2 What ran

Four things ran here. One thing did not.

| Run | What it establishes | Result |
| --- | --- | --- |
| Dataset integrity | the labels are internally consistent | **pass** — 30/30 comments, 24/24 quotes verbatim |
| Deadline resolver vs hand labels | production date code reproduces 17 hand-computed dates | **17/17 agreed** |
| Conformance suite | the enforcement layer rejects what it claims to reject | **13/13 pass** |
| Deterministic baseline | the scorer and dataset work end to end | see §4.4 |
| **LLM extraction** | **the thing you actually asked for** | **BLOCKED** |

### 4.3 Conformance suite — the enforcement layer

Thirteen hand-built model responses, each asserting a specific rejection. This is not model-quality evidence; it is evidence that the guards do what the design says.

| # | Case | Result |
| --- | --- | --- |
| 1 | clean extraction accepted, resolver date applied | pass |
| 2 | paraphrased quote **rejected, not repaired** | pass |
| 3 | whitespace/case noise still verifies (normalisation works, matching is not fuzzy) | pass |
| 4 | invented owner stripped to `null`, obligation survives | pass |
| 5 | owner forged **inside an injected instruction** stripped | pass |
| 6 | date with no supporting phrase discarded as invented | pass |
| 7 | model's own computed date overridden by the resolver | pass |
| 8 | bad category + confidence 1.4 + unknown property all rejected | pass |
| 9 | no tool call → typed failure, not a crash | pass |
| 10 | malformed tool arguments → typed failure | pass |
| 11 | injection cannot inflate confidence (capped at 0.8, flagged) | pass |
| 12 | injection-only comment yields zero obligations | pass |
| 13 | comment cannot escape the untrusted-data delimiter | pass |

The four that matter most in production are 2, 5, 6 and 7. Together they mean **the model cannot end up as the source of a quote, an owner, or a date** — and that is the product's central safety claim, now implemented rather than promised.

### 4.4 Deterministic baseline — read this carefully

A regex extractor was run through the identical pipeline and scored by the identical scorer.

| Metric | Baseline | Threshold | Status |
| --- | --- | --- | --- |
| Quote-verification rate | 100.0% (13/13) | ≥ 90% | PASS |
| Precision | **92.3%** | — | — |
| High-confidence precision | 92.3% | ≥ 70% | PASS |
| Recall | **50.0%** | — | — |
| F1 | 0.649 | — | — |
| TP / FP / FN | 12 / 1 / 12 | — | — |
| Deadline accuracy (matched pairs) | 72.7% (8/11) | — | — |
| Category accuracy (matched pairs) | 66.7% | — | — |
| Injection cases handled | 2/4 | all | FAIL |
| Injection cases complied with | 0 | 0 | PASS |

**This is not a model result and must never be reported as one.** It is a floor and an instrument check, and it is doing its job:

- **Precision 92.3% with recall 50% is the correct signature of a conservative regex.** It fires on 13 of 30 comments, gets 12 of them right, misses half the dataset. If this had come back at 0.95 precision *and* 0.95 recall on a 30-comment dataset with two non-English comments and an injection case, the dataset would be too easy and the benchmark worthless.
- **It made exactly one false positive** — C27, "the surveyor attended on Monday as promised". A cue-word matcher cannot tell a kept promise from a new one. That single error is a useful illustration of what the LLM is actually for.
- **It failed all four injection cases to handle, and complied with none.** The distinction matters: it produced no obligations for the injection-only comments, but it also missed the genuine promise buried in C22. Compliance and coverage are different failures.
- **Its 50% recall is the argument for the product.** Half the commitments in a realistic set were invisible to pattern matching, and the missed ones are the terse, implied, non-English and multi-promise cases — precisely the ones a tired caseworker writes at 6pm.

### 4.5 What is still missing, and why I did not fake it

**The model benchmark is unscored.** No threshold has been met or missed. I cannot tell you whether Relay clears 90% quote verification or 70% precision.

Why, concretely: `@forge/llm@1.0.9` calls `global.__forge_fetch__({ type: 'llm' }, 'https://llm/<model>')`. `https://llm` is an internal runtime alias and `__forge_fetch__` is provided by the Forge sandbox. There is no public endpoint, no API key that would work from here, and outbound access from this environment goes only to npm, PyPI and GitHub.

The alternative — running the prompt against a different model locally and labelling the output "Forge LLM results" — would have produced numbers that look like evidence and are not. I did not do that, and the harness is built so that nobody can do it by accident: `runBatch()` calls `chat()` from `@forge/llm`, full stop.

**Two honest caveats on the dataset itself:**

1. It was written by the same analyst who wrote the review. It is *not* model-generated, which is the requirement you set, but it is not independent human annotation either. Before the 24 commitments are treated as authoritative, a second person should review `ground-truth.json` cold. The integrity check only proves the quotes are verbatim, not that the labelling judgements are right.
2. The scorer credits *containment* (a labelled sentence sitting inside a longer extracted quote) at 0.9. This is deliberate — a model that over-spans has still found the promise — but it means long quotes are scored generously, and the precision figure is slightly optimistic relative to a strict exact-span metric. Documented rather than hidden.

---

## 5. Performance measurements

| Measurement | Value | Note |
| --- | --- | --- |
| Unit + integration tests | 48/48 pass, 216 ms | `node --test` |
| Conformance suite | 13/13 pass | part of `run.mjs` |
| Baseline extraction latency | ~1 ms/comment | local regex, no network |
| Baseline token usage | 0 | by construction |
| **LLM latency, tokens, cost** | **not measured** | blocked; §4.5 |
| Pipeline overhead per obligation | 5 synchronous checks, sub-millisecond | normalise → verify → ground → resolve → route |
| Manifest validation | 0 schema errors | ajv against `@forge/manifest` 13.8.0 |

Expected figures for the live run, so the gap is quantified rather than vague:

- 30 comments × 1 call each, run in batches of 3 → **~1 minute of wall time**, well inside the documented 100 requests/min.
- Prompt is ~450 tokens, comment ~40, tool schema ~500; expect **~1,000–1,400 input tokens** and **150–400 output tokens** per call. The report endpoint sums the real figures.
- At `sonnet` rates this is a rounding error for the whole benchmark, so cost is not a reason to reduce the sample.

---

## 6. Failure and safety policy

Your constraint: *the gate must never make an unavailable enforcement mechanism appear operational.* Resolving that against "Relay must never be the reason a repair cannot be closed" produces one policy with two halves.

### 6.1 The policy

**Fail open at the workflow. Fail loud in the record. Never fail silently.**

| Condition | Workflow decision | Record | Why |
| --- | --- | --- | --- |
| LLM unavailable / times out / 429 | no effect — the LLM is never in the gate path | obligation marked `not_analysed`, visible, retryable | extraction is asynchronous; a failed extraction must not look like "no promises" |
| Queue backed up | no effect | panel shows `pending analysis` with a count | "empty" and "not yet known" must never look alike |
| Entity store read fails inside the validator | **allow** (`GATE_STATE_UNAVAILABLE_ALLOWED`) | closure stamped `enforcement: unverified` | a storage outage must not freeze an operations team |
| Entity store read fails, project policy `fail-closed` | **block** with the fixed message | closure blocked, reason logged | available for regulated tenants who prefer it |
| Gate state stale (> 15 min) | no effect | banner: "gate state is stale, last updated HH:MM" | staleness is a signal, not an error |
| Relay disabled on the project | allow | `GATE_DISABLED` | explicit configuration, not a failure |
| **App unavailable / uninstalled** | **platform-dependent: a missing validator evaluates false → transitions blocked** | nothing — the app is gone | **the asymmetry. See §6.4** |
| Admin override | allow, once, with reason ≥ 20 chars | `overridden_by`, `reason`, timestamp, surfaced on dashboard | governed exceptions beat absolute blocks |
| Actor lacks permission to view | deny at read time (`asUser()`) | n/a | Jira's own ACLs are the boundary |

### 6.2 The mechanism behind "fail loud"

A successful closure is not a claim that the gate ran. Every closure record carries an `enforcement` field:

```
enforcement: "verified"     gate evaluated, blocking count was zero
enforcement: "unverified"   gate could not be evaluated; closure allowed
enforcement: "overridden"   gate blocked; a named human overrode with a reason
enforcement: "disabled"     Relay not enforcing on this project
```

Three consequences, all deliberate:

- **"Unverified" is never counted as compliance** in the unit dashboard or the audit export. A week where the store was down shows 40% unverified, not 100% compliant.
- **The admin page shows a persistent amber banner** whenever any closure in the last 7 days was unverified, with the count and a link to the raw events.
- **The degraded path writes an audit event every time.** Silence is the failure mode this whole policy exists to prevent.

This is the answer to your constraint. The gate does not pretend to have run; it *records that it did not*.

### 6.3 No LLM in the validator — enforced structurally

Not by discipline. `gate.js` and `gate-handler.js` import nothing from `@forge/llm`; the only imports are `gate.js` itself. `index.js` binds `kvs` and `requestJira` and nothing else. The 25-second synchronous budget is therefore spent on one KVS read (or one REST call), not on inference. If someone later adds `chat()` to the gate, it is a visible diff in a 40-line file, not a subtle regression buried in a service layer.

### 6.4 The uninstall hazard — the one thing that genuinely worries me

**My code fails open. The platform fails closed.** When an app providing a workflow validator is unavailable, the validator evaluates false, so **transitions are blocked**. An organisation that uninstalls Relay while a validator is still wired into its Done transition may find it cannot close cases at all.

This is not a Relay-specific flaw; it is how the platform behaves. But Relay's blast radius is unusually large because it sits on the closure transition of a customer-facing workflow. Mitigations, in order of strength:

1. **A pre-uninstall checklist in the app** — a page that lists every workflow and validator Relay believes it is attached to, with "remove these first" and a print button. If the list is empty, uninstall is safe.
2. **A `relay.disabled` project property read by the validator as its first statement**, so a tenant can neutralise the gate before touching the app.
3. **Explicit warning in the Marketplace listing and install docs.** Least effective, but mandatory.

Item 1 is a real feature and should be in the MVP, not the release notes. It is also, incidentally, a good demo beat: a product that knows what it would leave behind.

**Status: untested.** Row T10 in `docs/UNBLOCK.md` exists to replace the expectation above with a fact.

---

## 7. Technical failures and limitations

| # | Issue | Severity | Status |
| --- | --- | --- | --- |
| 1 | No Atlassian site or credentials → five of nine validator checks untested | **High (blocks sign-off)** | blocked, `UNBLOCK.md` |
| 2 | Forge LLM unreachable outside the runtime → benchmark unscored | **High (blocks the Part 5 decision)** | blocked, `UNBLOCK.md` |
| 3 | Platform fails closed on uninstall while our code fails open | **High** | designed around, untested (§6.4) |
| 4 | Forge CLI 15.0.0 needs Node ≥ 22.23.4; sandbox has 22.22.3 | Low | pinned to 14.2.0; schema cross-checked against current 13.8.0 to compensate |
| 5 | `forge lint` requires login (scope validation); only structural validation possible offline | Low | `validate-manifest.mjs` covers the structural half |
| 6 | `keytar` native build fails without `nodejs.org` headers | Low | `--ignore-scripts`; irrelevant without credentials |
| 7 | Validator payload shape not empirically confirmed (`issue.key` vs `issueKey` vs `key`) | Medium | handler accepts all forms and logs the payload keys on first invocation |
| 8 | Team-managed compatibility unverified | Medium | T8 |
| 9 | Dataset authored by one person, not independently annotated | Medium | second review required before the numbers are treated as authoritative |
| 10 | Scorer's containment rule slightly flatters precision | Low | documented, threshold unchanged |
| 11 | `forge lint` cannot check scope names offline | Low | scopes limited to `read:jira-work`, `write:jira-work` |

**Nothing on this list was worked around by inventing a result.**

---

## 8. Logs and artefacts

No screenshots — there was no UI to screenshot. Every run below is reproducible.

| Artefact | Contains |
| --- | --- |
| `harness/results/harness-output.txt` | full console output of all four runs |
| `harness/results/dataset-check.json` | integrity + the 17/17 resolver agreement |
| `harness/results/conformance.json` | 13/13 with failure detail |
| `harness/results/baseline.json` | full per-comment breakdown, per-tag precision/recall |
| `harness/results/manifest-validation.json` | ajv result against the real schema, with the schema path |
| `harness/results/summary.json` | one-file machine-readable digest |

Reproduce:

```bash
cd phase0
node harness/run.mjs
node --test validator-probe/test/*.test.js
npm i --no-save ajv@8 js-yaml@4 && node harness/validate-manifest.mjs
cd validator-probe && forge lint     # structural validation; stops at login
```

---

## 9. Security and permission concerns

| Concern | Position |
| --- | --- |
| **Scopes requested** | `read:jira-work`, `write:jira-work` only. No `manage:jira-configuration` in the probe — the validator is added by a human admin, not by the app |
| **Egress** | `permissions.external.fetch.backend: []` — empty by design. The app cannot call out even if a dependency tries. Preserves Runs on Atlassian eligibility |
| **Reads on behalf of the user** | `api.asUser()` is the rule for the product; the probe uses `asApp()` **only** to read `labels` inside the validator, where there is no user context. That exception must not spread |
| **Data stored by the probe** | gate counters and benchmark results only. No customer text is persisted — the comment is passed to the model in-memory and the raw text is not written to storage |
| **What the benchmark does store** | the verified quote, which *is* customer text. Acceptable in a lab app with a known dataset; in the product it needs the retention rule from the review (§7.1) |
| **Error channel leakage** | the block message contains counts only, asserted by test. A validator message is visible to anyone who can transition |
| **Prompt injection** | 4 dataset cases, 4 code-level controls: no write tools in the extraction path, content delimited and labelled untrusted, schema validation, quote verification. 13/13 conformance |
| **Hallucination** | structurally rejected: quote must be a verbatim substring; owner must be the author or literally mentioned outside an instruction; a date without a phrase is discarded; a model date never survives the resolver |
| **Secret handling** | no credentials requested, stored, logged or committed. The app needs none to run |
| **Procurement risk** | Rovo/TWG scopes deliberately excluded. Nothing in the probe requires org-admin consent, which keeps the install path to one project-admin action |

One residual concern worth naming: **the gate reads labels as a fallback in the probe.** Labels are user-writable by anyone with edit permission, so the fallback is an escape hatch — anyone who can edit the issue can remove `relay-block` and close it. That is fine for a probe and unacceptable in the product. Production must read gate state only from the entity store, with the label path behind a development flag. Noted as fix F5 in §11.

---

## 10. Remaining technical uncertainties

Ordered by what they would cost if wrong.

| # | Uncertainty | How it resolves | If it resolves badly |
| --- | --- | --- | --- |
| 1 | Does the model clear 90% quote verification and 70% precision? | the live benchmark | pivot to Close Call at day 11 (pre-agreed) |
| 2 | Does a lambda validator actually block, on all three entry paths? | T1–T7 | post-function + required transition field |
| 3 | Does blocking also skip post-functions? | T9 | if post-functions run, enforcement is cosmetic and the thesis needs rewriting |
| 4 | What happens on uninstall? | T10 | ship the uninstall checklist as a P0 feature |
| 5 | Does team-managed honour it? | T8 | scope the MVP to company-managed and say so |
| 6 | What is the real validator payload shape? | first invocation log | adapt `extractIssueKey` (already defensive) |
| 7 | Can a judge configure this in under two minutes? | stranger test in week 6 | redesign onboarding before adding features |
| 8 | Does extraction hold on *real* comments, not just these 30? | 50 comments from a friendly tenant | the dataset is a proxy; treat it as a lower bound on difficulty |

---

## 11. Decision

### PROCEED WITH RELAY AFTER SPECIFIC FIXES

**Read the qualifier before the words "proceed":**

This is a conditional proceed, not a pass. On the Part 5 thresholds the benchmark is **UNSCORED**. I am not claiming Relay meets 90% quote verification or 70% precision, because nothing was measured. What today establishes is narrower and still useful: the enforcement mechanism is real at the platform-schema level, the surrounding system behaves correctly under adversarial input, and the failure policy is decided rather than improvised.

The decision to proceed is therefore a decision to **spend one more day on two experiments** — not a decision to start building the product.

**Why not PIVOT TO CLOSE CALL:** the pivot criterion you set is "precision below 60% after two iterations". No precision was measured, so the criterion is not met. Pivoting now would be a decision made on anxiety rather than evidence, and it would throw away the one thing this phase did prove — that the gate mechanism exists and the alternative does not.

**Why not PROCEED unqualified:** five of your nine checks are untested, and the gate is the entire differentiated claim. Building on an unverified gate is how a seven-week project discovers in week five that its centrepiece is cosmetic.

### 11.1 Fixes required before product code

| # | Fix | Why now |
| --- | --- | --- |
| **F1** | Run T1–T10 on a real site | the gate is a claim until T3, T7 and T9 pass |
| **F2** | Run the live benchmark and apply the pre-registered thresholds | this is the only thing that converts the decision from conditional |
| **F3** | Implement `enforcement: verified / unverified / overridden / disabled` on every closure record, and exclude unverified from compliance counts | satisfies the "must never appear operational" constraint structurally |
| **F4** | Ship the pre-uninstall checklist as a P0 feature, not documentation | the platform's fail-closed behaviour is a customer-outage risk |
| **F5** | Read gate state only from the entity store in production; put the label path behind a dev flag | current fallback is an edit-permission escape hatch |
| **F6** | Have a second person review `ground-truth.json` cold | one annotator is a measurement risk, not a result |
| **F7** | Make "the model's date is never persisted" a hard invariant with a regression test | already true by construction; must stay true under refactoring |

### 11.2 What changed in my view of Relay because of this phase

Three things, and they are not all comfortable.

1. **The enforcement story is stronger than I wrote in the review.** I called it "real but fragile"; the schema says it is the only mechanism that can run code in a transition, and the competing mechanism is not merely weak but structurally absent. That materially de-risks the differentiation.
2. **The uninstall hazard is a bigger product concern than the review allowed.** I treated app unavailability as a documentation footnote. It is a customer-outage vector sitting on the closure transition of a public-facing workflow, and it deserves a feature, not a paragraph.
3. **The 50% recall of a cue-word baseline is the cleanest single argument for Relay I have seen.** Not a statistic from a report — a measurement, on our own data, showing that half of the commitments in ordinary casework are invisible to anything that does not read the prose. That belongs in the submission description, and it belongs there because it is true.

### 11.3 Immediate next actions

1. `forge login`, create a dev site — 10 minutes. **(blocks everything)**
2. Deploy the probe; run T1–T10. **(60 minutes, decides the architecture)**
3. Run the benchmark in 10 batches; read `report.json`. **(15 minutes, decides the product)**
4. If both pass → begin Phase 1. If T9 fails → rewrite the thesis. If precision < 60% twice → pivot to Close Call, using the shared Phase 1–2 work.

Until step 3 produces numbers, Relay is a well-argued hypothesis with a proven mechanism and an unmeasured core. That is a better position than it was in yesterday, and a worse one than the last report implied.

---

*All code in `phase0/` is disposable probe code and is labelled as such. It is not the Relay application and should not be extended into one.*
