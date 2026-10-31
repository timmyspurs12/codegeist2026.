# Relay — T12 validation report

**Test:** T12 — *Can `jira:workflowValidator` be enabled and used on a fresh Atlassian development site?*
**Date:** 31 October 2026 · **Captured:** 14:18–14:22 UTC
**Branch:** `arena/06fd2e30-codegeist2026` at `b8a5fad` (V2.1 review)
**Phase 0/0.2 artefacts:** unchanged. 71/71 tests still pass.

---

## Verdict

# BLOCKED

**BLOCKED is not PASS.** No live Atlassian site exists and no Atlassian host is reachable from this environment, so **not one line of T12 has been executed against the platform.** Nothing below is a live observation.

| Question T12 exists to answer | Answer |
| --- | --- |
| Is the validator usable on a fresh site without enabling anything? | **BLOCKED** — untested |
| Is it gated behind a Preview opt-in? | **Documentation says "opt-in: required" in general, and documents no procedure for this module** — so unknown in practice |
| Does a fresh site show it in the workflow editor? | **BLOCKED** — untested |
| Can the probe deploy and install? | **BLOCKED** — `forge deploy` fails at authentication, before the manifest is read |

---

## 1. Environment and site status

Captured verbatim in [`t12/environment.txt`](t12/environment.txt) and [`t12/connectivity.txt`](t12/connectivity.txt).

| Item | State | Evidence |
| --- | --- | --- |
| Node / npm | v22.22.3 · 10.9.8 | `node -v`, `npm -v` |
| Forge CLI | **14.2.0**, installed locally for this session at `/tmp/forge-cli` (not on the global PATH; installs do not persist between sessions) | `forge --version` |
| Forge authentication | **Not logged in** | `forge whoami` → `Error: Not logged in.` (exit 1) |
| Credential store | **absent** | `ls ~/.forge` → no such directory |
| Atlassian environment variables | **none** (names checked, values never printed) | `env \| cut -d= -f1` |
| Development site | **none configured anywhere** in the environment or the repository | no site URL in config or env; the only `*.atlassian.net` strings in the repo are citation links (`railsware.atlassian.net`) and documentation placeholders |
| Jira / JSM availability | **cannot be determined** — needs a site | — |
| Network to Atlassian | **unreachable** | see below |
| Probe manifest | **conforms** to `@forge/manifest` 13.8.0 schema | `harness/validate-manifest.mjs` |
| Probe tests | **71 / 71 pass** | `node --test` |

### Why no live step was possible

```
https://id.atlassian.com        HTTP 000   0.05s   curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL
https://api.atlassian.com       HTTP 000   0.05s
https://developer.atlassian.com HTTP 000   0.05s
https://admin.atlassian.com     HTTP 000   0.06s
https://registry.npmjs.org      HTTP 200   0.05s   <- allowlisted, works
```

Atlassian hostnames resolve — `id`, `api`, `developer` and a `*.atlassian.net` name all to `13.227.180.4`, which looks like an egress proxy; `admin.atlassian.com` to `18.65.238.47` — but the TLS handshake is refused on all four by the sandbox's egress policy. The npm registry, which is on the allowlist, returns 200 from the same shell.

This is a **network policy**, not an Atlassian outage and not a credential problem that a token would fix. The `forge deploy` failure is authentication *because* there is no session; even with a token, no Atlassian endpoint could be reached from here.

### One repository note, disclosed

On starting, the local branch pointer had again drifted to `81369db` (`Initial commit`) while origin was at `b8a5fad`. The working tree was byte-identical to `origin/b8a5fad` — verified by a full tar backup, `git reset --hard origin/arena/06fd2e30-codegeist2026`, and a recursive diff that reported **zero differences**. No file was lost or altered. This is the third occurrence of the same drift; it is a sandbox artefact, not a repository problem.

---

## 2. Official documentation consulted

Full quotations in [`t12/documentation.txt`](t12/documentation.txt). All pages fetched through the page-fetch tool, which is not subject to the sandbox egress block; quotations are verbatim.

| # | Page | Used for |
| --- | --- | --- |
| 1 | [Jira workflow validator (Preview)](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-validator/) — all four chunks, last updated 12 Mar 2025 | Module status, project types, payload, scopes, uninstall statement, enablement (absent) |
| 2 | [Forge release phases: EAP, Preview, GA](https://developer.atlassian.com/platform/forge/whats-coming/) — last updated 28 Aug 2026 | What "Preview" means, opt-in requirement, deprecation windows |
| 3 | `@forge/manifest` 13.8.0 (bundled with CLI 14.2.0), read locally | `required` list, `projectTypes` default and enum |

---

## 3. The Preview enablement question

This is the part of T12 that documentation *can* settle, and it settles it in an awkward way.

**What the policy says** — verified:

> "Forge preview features are available to all users, and enjoy the same level of support as GA features. However, preview features are **usually turned off by default** (although they can be enabled on production environments); **for instructions on enabling them, refer to their documentation**."
> — release-phases page

The same page's comparison table marks Preview as **Opt-in: Required**.

**What the module's documentation says about enabling it** — nothing:

> "The `jira:workflowValidator` module defines a validator that can be added to workflow transitions in company-managed projects."

That is the whole of the installation guidance. The page is four chunks long; all four were read. There is no toggle, no site setting, no feature flag, no admin page, no "enable preview features" step — anywhere.

**So the documented supported process is, in full:**

1. Declare `jira:workflowValidator` in the manifest (function form or expression form).
2. `forge deploy` and `forge install` on the site.
3. In a **company-managed** project, open the workflow editor, edit the target transition, add the rule, and **publish the workflow**.

**Which leaves two possibilities, and T12 exists to distinguish them:**

| | Meaning | Consequence if true |
| --- | --- | --- |
| **A** | Nothing needs enabling. "Opt-in" means "you opted in by declaring the module". The platform gates it automatically. | T12 passes by simply doing the three steps; the risk V2.1 §7 raised is overstated |
| **B** | Some site-level or account-level Preview enablement exists but is undocumented — an internal flag, an allow-list, or a per-site toggle reachable only through an admin screen | The judge's fresh site may not have it. This is the scenario that makes three of eleven P0 features unavailable in a demo |

**I cannot distinguish A from B without a site, and I will not guess.** What can be said with confidence is narrower and more useful than V2.1 said: *there is no documented step that anyone is failing to perform.* If the validator does not appear on a fresh site, the cause will be something undocumented, and that is exactly the finding T12 is for.

---

## 4. Commands executed, and their actual results

Every command below was run in this session. Nothing is reconstructed.

| Command | Result |
| --- | --- |
| `npm i @forge/cli@14.2.0 --ignore-scripts` (into `/tmp/forge-cli`) | Installed; exit 0 |
| `forge --version` | `14.2.0` |
| `forge whoami` | `Error: Not logged in. If a local keychain is available, run forge login, otherwise set environment variables before trying again.` — exit 1 |
| `forge settings set usage-analytics false` | `✔ Successfully set usage-analytics as false.` (needed only because the analytics prompt cannot render without a TTY) |
| `forge settings list` | `usage-analytics: false`, `default-environment: Not set` |
| `forge deploy` (in `phase0/validator-probe`) | `Error: Not logged in.` — **fails at authentication, before the manifest is parsed** |
| `node harness/validate-manifest.mjs …` | `manifest conforms to the @forge/manifest JSON Schema` / `modules: jira:workflowValidator, llm, function, webtrigger` |
| `node --test validator-probe/test/*.test.js` | `# tests 71 / # pass 71 / # fail 0` |
| `curl` × 5 hosts | see §1 — four Atlassian hosts return HTTP 000, npm returns 200 |

**What these results do not prove.** A conforming manifest is not a deployable app: it has never been through `forge lint` (which validates scopes against a live account and needs a login), never been bundled, never been deployed, and never been installed. The `deploy` failure happens before any of that. Every statement about deployment readiness here is structural, not behavioural.

**Not run, deliberately:** `forge login`, `forge create`, `forge deploy`, `forge install`, `forge lint`, any REST call. Each requires either credentials this environment does not have or a site that does not exist. `forge create` was specifically avoided — it would have failed anyway, and it is the one command that must run on *your* machine so the real `app.id` is written once.

---

## 5. Logs

Captured, not transcribed:

| File | Contents |
| --- | --- |
| [`t12/environment.txt`](t12/environment.txt) | Toolchain, auth state, credential store, `forge whoami`/`deploy` output, env var names |
| [`t12/connectivity.txt`](t12/connectivity.txt) | DNS, five HTTPS probes with timings, raw TLS error |
| [`t12/probe-readiness.txt`](t12/probe-readiness.txt) | Schema conformance, module list, placeholder `app.id`, dependency check, test counts |
| [`t12/documentation.txt`](t12/documentation.txt) | Verbatim extracts from all sources, with URLs and page dates |

No screenshots exist, because no Atlassian UI was reachable.

---

## 6. Is the validator enabled?

**No — and the question does not yet have a meaning here.** There is no site, so there is no project, no workflow, no transition, and no place the module could be enabled.

Strictly: **NOT TESTED.** It would be wrong to record this as "not enabled", which implies an attempt was made on a site and the module was absent.

---

## 7. Could the probe be deployed and installed?

**No. BLOCKED at authentication**, before deployment. What *is* established about readiness:

| Check | Result | Class |
| --- | --- | --- |
| Manifest conforms to `@forge/manifest` 13.8.0 | Pass | **LIVE VERIFIED** would be wrong — this is **offline, executed**: it is a real test that ran, but it tests the schema, not the platform |
| Declares `jira:workflowValidator`, `llm`, `function`, `webtrigger` | Yes | same |
| Handler references (`index.gate`, `index.lab`) resolve to exports | Yes — `export const gate`, `export const lab` | offline |
| `@forge/api`, `@forge/kvs`, `@forge/llm` declared and every external import matches | Yes | offline |
| `node_modules` present for bundling | **No** — `npm install` needed before deploy | inspection |
| `app.id` | **Still the placeholder** `ari:cloud:ecosystem::app/00000000-…` — `forge create` must run first | inspection |
| Scopes accepted by the account's registry (`forge lint`) | Untested — needs login | **BLOCKED** |
| Deploy / install / rule attaches / transition blocked | Untested — needs site | **BLOCKED** |

Two probe corrections would help on a live run, and **neither has been made** — I am not touching the probe without your say-so:

1. **`npm install` before deploying** (or `forge deploy` will bundle without its dependencies). No file changes; a package-manager command.
2. **Nothing else.** The manifest is deliberately unchanged: it declares both project types because it reproduces Atlassian's documented example, and V2.1 §6 C10 already recorded that decision.

---

## 8. Remaining blockers

| # | Blocker | Whose | Clears |
| --- | --- | --- | --- |
| B1 | No Atlassian account credentials in this environment | yours | nothing on its own |
| B2 | No Atlassian development site | yours | B1, plus 5 minutes |
| B3 | **No network path from this sandbox to any Atlassian host** | not yours — environment policy | nothing you can do here; the live run must happen on your machine |
| B4 | `app.id` placeholder | `forge create`, on your machine | deployment |
| B5 | `node_modules` absent | `npm install` | deployment |

B3 is the one that decides this report's verdict, and it is structural: even with your token and site, **this environment could not reach them.** The live run cannot be delegated to me. It has to happen where the browser and the CLI can both reach Atlassian.

---

## 9. Evidence classification

The five labels you specified, applied to every conclusion in this report.

| # | Conclusion | Class | Basis |
| --- | --- | --- | --- |
| E1 | No Atlassian site is configured | **LIVE VERIFIED** (of this environment) | `ls ~/.forge`, env scan, no site URL anywhere |
| E2 | The Forge CLI is unauthenticated | **LIVE VERIFIED** | `forge whoami` → `Not logged in`, exit 1 |
| E3 | `forge deploy` fails at authentication, not at the manifest | **LIVE VERIFIED** | `forge deploy` output |
| E4 | Atlassian hosts are unreachable from this sandbox | **LIVE VERIFIED** | curl HTTP 000 + TLS error, against a 200 control |
| E5 | The probe manifest conforms to the 13.8.0 schema | **LIVE VERIFIED** as an offline execution — it *ran*, and it is not a platform test | `validate-manifest.mjs` |
| E6 | 71/71 probe tests pass | **LIVE VERIFIED** as an offline execution | `node --test` |
| E7 | `app.id` is a placeholder | **LIVE VERIFIED** (inspection) | `manifest.yml:61` |
| E8 | `jira:workflowValidator` is a Preview feature | **DOCUMENTATION VERIFIED** | module page title and body |
| E9 | Preview features are opt-in; deprecation window is 1 month | **DOCUMENTATION VERIFIED** | release-phases page |
| E10 | No enablement procedure is documented for this module | **DOCUMENTATION VERIFIED** (by exhaustive absence, four chunks) | module page |
| E11 | The module is documented for **company-managed** projects | **DOCUMENTATION VERIFIED** | "can be added to workflow transitions in company-managed projects" |
| E12 | `projectTypes` defaults to `["company-managed"]` | **DOCUMENTATION VERIFIED** + package schema | property description + `@forge/manifest` |
| E13 | The module page's own example contradicts E11 and E12 | **DOCUMENTATION VERIFIED** (as a contradiction) | `projectTypes: ['company-managed','team-managed']` in the Custom UI example |
| E14 | An uninstalled app's validator evaluates to false | **DOCUMENTATION VERIFIED for expression validators** | "It will evaluate to false in all other cases, including … the app … is uninstalled" — in the *Jira expressions* section |
| E15 | The same holds for **lambda** validators after uninstall | **INFERRED** | the sentence does not name the lambda path |
| E16 | Declaring the module + deploying + attaching the rule is the complete supported process | **INFERRED** from E10 | if there were a step, it would be documented |
| E17 | Nothing needs enabling (possibility A in §3) | **NOT TESTED** | requires a site |
| E18 | An undocumented site-level gate exists (possibility B) | **NOT TESTED** | requires a site |
| E19 | The validator appears in a fresh site's workflow editor | **NOT TESTED** | requires a site |
| E20 | The probe deploys and installs | **BLOCKED** | B3 |
| E21 | The scopes are accepted | **BLOCKED** | needs login |
| E22 | The validator blocks a transition | **BLOCKED** — and this is E1's job, not T12's | needs a site |

Note the separation being enforced: E19 is *T12's* question; E22 is *E1's*. T12 can pass with E22 still unknown, and E1 can pass while T12's answer remains split between A and B.

---

## 10. Verdict and decision rule

| Rule | Applies? |
| --- | --- |
| **PASS** — Preview enablement demonstrated on the development site, validator available for the next live test | **No.** Nothing was demonstrated live |
| **FAIL** — the feature cannot be enabled or is unavailable under the documented process | **No.** A FAIL requires attempting the documented process and observing a refusal. No attempt was possible |
| **BLOCKED** — required Atlassian authentication, site or permissions are unavailable | **Yes.** Authentication absent (E2), site absent (E1), network path absent (E4) |

**T12: BLOCKED.** It is not a pass, it is not a failure, and it is not evidence for or against Relay. It is the same standing block as Phase 0 and 0.2, now measured rather than described.

---

## 11. What you need to do — exact steps

All of this happens **on your machine**, where a browser and the CLI can both reach Atlassian. Roughly 20 minutes to a T12 answer.

**Setup**

1. **Browser** — sign in or create an account at `https://id.atlassian.com`.
2. **Browser** — create an API token at `https://id.atlassian.com/manage-profile/security/api-tokens`. Label it `forge-cli`. It is shown once.
3. **Browser** — create a free site at `https://www.atlassian.com/software/jira/free`. Choose **Jira Software** and add **Jira Service Management**. Note the site URL.
4. **Terminal** — `node -v`. If ≥ 22.23.4: `npm i -g @forge/cli@latest`. Otherwise: `npm i -g @forge/cli@14.2.0` (15.x requires a newer Node than some setups have).
5. **Terminal** — `forge login`, then your email and the token from step 2.

**T12 itself**

6. `cd phase0/validator-probe && npm install`
7. `forge create` → name it `relay-phase0-probe`. **This writes the real `app.id` into `manifest.yml`** — it is not committed as a secret, it is just an identifier.
8. `forge deploy -e development`
9. `forge install --site <your-site>.atlassian.net --product jira`
10. In Jira: **create a company-managed project** (choose "Company-managed" / classic template — *not* team-managed).
11. Project settings → **Issues → Workflows** → edit the workflow → select the transition you will use as the closing transition → **Validators** → add rule.
12. **Look for `Relay closure gate (probe)` in the list.** This is the whole test.
13. If it is there: add it, **publish the workflow**, save. If it is not there: stop and record exactly what the picker offered.

**Record these six things — they are what T12 needs**

| # | Observation | Why it matters |
| --- | --- | --- |
| 1 | Did `Relay closure gate (probe)` appear in the validator picker? | the PASS/FAIL line |
| 2 | Did you have to enable anything first — any toggle, banner, admin setting, "enable preview" prompt? | distinguishes possibility A from B |
| 3 | The exact menu path you used to reach the validator picker | the documented path assumes the classic editor |
| 4 | Which workflow editor appeared — classic or the new one? | they behave differently for this module |
| 5 | Any error from `forge lint` or `forge deploy` (paste raw) | scope acceptance (E21) |
| 6 | A screenshot of the picker showing the rule, or of the empty picker | evidence, and the only artefact that settles E19 |

**Then stop.** Do not run E1. Record these six, send them back, and I will write T12 up as PASS or FAIL and update the plan accordingly.

If you would rather I produce the machine-readable result, the shape is in `RELAY-V2.1-LIVE-BLOCKERS.md` §4 under `probes.T12`.

---

## 12. Documentation findings worth acting on later — recorded, not applied

While consulting the sources for T12, three things surfaced that bear on V2.1. **None has been applied**; V2.1 is untouched, per the scope of this task. They are logged here so they are not lost.

| # | Finding | Effect on V2.1 | Suggested timing |
| --- | --- | --- | --- |
| F1 | The module reference states the rule applies to transitions "in **company-managed projects**" — official prose, not just practitioner reports | Upgrades V2.1 §2/R-01 from third-party to documentation-supported. The page's own example still declares both types, so the contradiction stands and E3 still decides | V2.2, after E3 |
| F2 | The same page states a validator "will evaluate to false in all other cases, including … **the app providing the workflow validator is uninstalled**" | Upgrades V2.1's uninstall inference (I-01) to documentation-supported **for expression validators**; the lambda path remains inferred. F10 is unaffected and still P0 | V2.2, after E4 |
| F3 | `resolver` is still marked Required = Yes in the property table while the page's example omits it and the schema does not require it | Confirms V2.1 §4.1 caveat 2 exactly as written; no change needed | — |

F2 is the most consequential: if Atlassian's own documentation says an uninstalled app's validator evaluates to false, the "blocked workflow after uninstall" hazard is no longer a guess. It does not change what Relay must ship — the pre-uninstall audit stays P0 — but it changes how the claim may be stated, from *"this is expected to happen"* to *"Atlassian documents that this happens, for expression-based validators; our lambda case remains untested."*

---

## 13. What this report does not change

- No acceptance criterion, threshold or score.
- No Phase 0/0.2 result, report or test.
- No V2 or V2.1 claim — the three findings in §12 are logged for a later revision, not applied.
- No probe source file, manifest field or architecture decision.
- The closure-receipt design in V2.1 §3 is untouched and still waiting on T15 and T13.

T12 remains the first item in the live sequence, and it remains unrun.

One housekeeping note: `harness/validate-manifest.mjs` rewrites `phase0/harness/results/manifest-validation.json` when it runs, and the only change it made here was the schema path (from the global CLI install to this session's local one). The committed file was restored byte-for-byte, so no Phase 0 result differs because of T12.

---

*Evidence files: `phase0/t12/{environment,connectivity,probe-readiness,documentation}.txt`.*
