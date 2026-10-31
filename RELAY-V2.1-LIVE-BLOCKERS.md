# Relay — live Atlassian blockers (V2.1)

**Purpose:** everything in V2.1 that cannot be answered from documentation, package internals or offline tests, and exactly what to do on a site to answer it.
**Status of all of it:** nothing below has been run. Phase 0.2's 11-row matrix is `NOT TESTED`; V2.1 adds five more questions and renumbers the experiments.

**Time to clear the critical path: about four hours on a live site.**

---

## 1. Prerequisites (one-time, ~20 minutes)

| # | Where | Action |
|---|---|---|
| 1 | Browser | Sign in or create an account at `https://id.atlassian.com` |
| 2 | Browser | Create an API token at `https://id.atlassian.com/manage-profile/security/api-tokens`, labelled `forge-cli`. It is shown once |
| 3 | Browser | Create a free site at `https://www.atlassian.com/software/jira/free` — Jira Software **and** Jira Service Management. Note the URL |
| 4 | Terminal | `npm i -g @forge/cli@latest` if `node -v` ≥ 22.23.4; otherwise `npm i -g @forge/cli@14.2.0` |
| 5 | Terminal | `forge login` — email + the token from step 2 |
| 6 | Terminal | `cd phase0/validator-probe && forge create` → `relay-phase0-probe`. This writes the real `app.id` into `manifest.yml` |
| 7 | Terminal | `forge deploy && forge install --site <site>.atlassian.net --product jira` |
| 8 | Terminal | `forge webtrigger` → copy the URL; it drives gate state for the matrix |

**Do not paste the API token into any conversation, file or commit.** Run the steps yourself and share only the outputs described in §4.

---

## 2. The tests, in execution order

The order matters: T12 can invalidate three P0 features before anything else is worth doing.

### Tier 1 — decides whether to continue (60 minutes)

| ID | Setup | Expected | Record | If it fails |
|---|---|---|---|---|
| **T12** | **Fresh site, default settings.** Create a **company-managed** project. Add the Relay validator to a transition. Publish | The validator appears in the rule picker and blocks a transition | Whether it appeared at all; whether anything had to be enabled first; the exact menu path | If Preview is opt-in on a fresh site, no judge can reproduce the gate unaided. Escalate before continuing |
| **T1** | Fresh install, no gate state | Transition proceeds (absent state → fail-open) | Outcome | Fail-open assumption wrong; fail-safe design changes |
| **T2** | Gate state `blocking=2` via webtrigger | Blocked with the Relay message | Outcome + message text | Enforcement thesis fails |
| **T3** | `blocking=2, unowned=1, overdue=1` | Message shows dynamic counts, no obligation content | Message text | AC8 untestable as written |
| **T4** | `blocking=0` | Transition proceeds | Outcome | — |
| **T5** | Board path | Blocked identically | Outcome | 3/3 gate fails |
| **T6** | Issue view path | Blocked; message rendered on the issue view | Outcome + screenshot | 3/3 gate fails |
| **T7** | REST path (`POST /rest/api/3/issue/{key}/transitions`) | HTTP 400; message in `errorMessages` | Status code + body | 3/3 gate fails |
| **T9** | Post function after the validator, setting a field | Post function does **not** run | Field value after the blocked attempt | AC7 fails; fallback writer becomes unsafe |

### Tier 2 — decides whether the provenance design is buildable (60 minutes)

These are new in V2.1 and they gate P4.

| ID | Setup | Expected | Record | If it fails |
|---|---|---|---|---|
| **T15** | In the validator, write a small record to Forge storage before returning; force both a blocked and a permitted path | The write completes inside the invocation budget and does not alter the return value | Whether the write succeeded, its latency, and whether a failed write changes the result | Design 4 (post function as receipt source) becomes mandatory, and is only safe if T9 holds. If neither holds, `verified` is unattainable — a pivot-level finding |
| **T13** | Subscribe a function to the Jira transition event; transition an issue; observe delivery | An event arrives with issue key, transition and actor | Event name actually used; payload shape; delivery latency; whether the actor is present | Without an actor, receipts match on issue + time window (bias to `unverified`). Without the event, T15's fallback is mandatory |
| **T14** | Read the project resource for a company-managed and a team-managed project; compare the fields | One field distinguishes them | **Exact field name and value shape**, from the live response — not from memory | F9 cannot be built; §8's messaging degrades to "ask the admin" |

### Tier 3 — settles the declared limitations (30 minutes)

| ID | Setup | Expected | Record | If it fails |
|---|---|---|---|---|
| **E3 / T8** | Team-managed project, same rule attachment | **Uncertain — this is the test.** Third-party evidence says the rule will not appear | Whether the rule is offered; whether it blocks if attached | If it works, §8 and the submission opening are deleted, not softened. If it does not, F9 and the setup card are mandatory |
| **T10** | Uninstall the app, then attempt the transition | Per inference: transition unavailable or blocked | What the admin sees; whether a message names anything | Confirms or kills the P0 framing of F10 |
| **T10b** | Remove the orphaned rule and publish the workflow | Transitions return | How long; what had to be done; whether the delete option was greyed out | If recovery is not possible through the UI, F10 becomes a hard shipping requirement and the runbook needs rewriting |

### Tier 4 — the number that decides the product (2 hours)

| ID | Setup | Expected | Record | If it fails |
|---|---|---|---|---|
| **E2** | Webtrigger benchmark over the 30-comment dataset through the **real Forge LLM**, forced `tool_choice`, quote verification applied | No expectation — this is the measurement | Precision, recall, F1, high-confidence precision, quote-verification rate, injection handling, latency, tokens, per-language breakdown | <60% hi-conf precision after two iterations → pivot to Close Call on day 11 |

**One methodological requirement on E2:** the second annotator (F6) should review `ground-truth.json` **before** the model scores are known. Otherwise the ground truth gets quietly nudged toward whatever the model produced, and the benchmark becomes a mirror.

### Tier 5 — optional, only affects a stretch goal

| ID | Setup | Expected | Record | If it fails |
|---|---|---|---|---|
| **T16** | Look for a REST endpoint that enumerates a site's workflows and their attached rules | Unknown | Endpoint, response shape, scopes | F10 stays as the installation ledger (its shipped design). No loss |

---

## 3. What each result changes

| Outcome | Consequence |
|---|---|
| All Tier 1 pass | Enforcement story holds; proceed to P1 |
| T12 passes only after enabling a site setting | Document the setting; every judge must be told; add it to the video |
| T12 fails | Stop. No judge-facing enforcement exists |
| T9 fails | AC7 must be rewritten; post-function fallback becomes unsafe |
| T15 passes, T13 passes | §3 design ships as written |
| T15 passes, T13 fails | Receipts exist but nothing consumes them — the sweep becomes the primary writer, and every closure is `unverified` until a new writer is found |
| T15 fails, T9 passes | Post-function writer; AC25 must be rewritten around it |
| T15 fails, T9 fails | Withdraw the compliance claim. Relay becomes a ledger with an advisory gate |
| E3 shows team-managed works | Delete §8 entirely. This is a *good* outcome and still a documentation change |
| E2 ≥70% / ≥50% | Day-0 gate met; proceed with the contract as designed |
| E2 60–70% | Proceed, but narrow to explicit-deadline commitments and raise review-queue share |
| E2 <60% twice | Pivot to Close Call |

---

## 4. Reporting results back

Drop raw observations into `phase0/live-results.json`. The existing schema (documented in `PHASE-0.2-REPORT.md` §9) covers `validatorMatrix` and `llmBenchmark`; V2.1 adds a `probes` block for the new questions:

```jsonc
{
  "validatorMatrix": { "T1": { "status": "PASS", "observed": "…" }, "…": {} },
  "llmBenchmark": { "status": "SCORED", "metrics": {}, "byLanguage": {} },
  "probes": {
    "T12": { "status": "PASS|FAIL", "observed": "…", "enabledFirst": null, "menuPath": "…" },
    "T13": { "status": "…", "eventName": "…", "payloadKeys": ["…"], "actorPresent": true, "latencyMs": 0 },
    "T14": { "status": "…", "fieldName": "…", "values": { "company": "…", "team": "…" } },
    "T15": { "status": "…", "writeOk": true, "writeLatencyMs": 0, "decisionUnchanged": true },
    "T16": { "status": "…", "endpoint": null, "notes": "…" }
  }
}
```

Then `node phase0/harness/build-report.mjs` regenerates `report.json`.

**Honest note:** `build-report.mjs` currently promotes `validatorMatrix` and `llmBenchmark`. The `probes` block is additive and is **not yet consumed** by the generator — it will be wired when there are results to wire. Do not read its presence in the file as evidence that anything ran.

---

## 5. What not to do

- Do not record a result you did not observe, and do not infer a PASS from a documentation claim.
- Do not mark T9 as passing because the docs say post functions are skipped. The docs are the hypothesis; T9 is the test.
- Do not re-run E2 with a different prompt and report the better number without reporting both.
- Do not enable `allowLabelFallback` to make a blocked transition behave; that path exists only to prove the bypass is closed.
- Do not paste tokens, site URLs containing personal data, or screenshots of real customer issues into the repository.
