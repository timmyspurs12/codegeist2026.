# Relay — Phase 0 (technical validation)

**This directory is a disposable probe. It is not the Relay application.**

It exists to answer two questions before any product code is written:

1. Can a Forge workflow validator actually block a Jira transition? (`validator-probe/`)
2. Can a model extract commitments with verifiable provenance? (`dataset/`, `harness/`)

Read `VALIDATION-REPORT.md` first. It states plainly which checks passed, which
are untested, and which are blocked — and there are more of the last two than of
the first.

## Status at a glance

| Mechanism | Status |
| --- | --- |
| Validator module exists in the platform schema | **verified** (machine-checked, two schema versions) |
| Validator logic, failure paths, return contract | **tested** (48 unit/integration tests) |
| Validator actually blocks a live transition | **untested** — no Atlassian site available |
| Extraction pipeline (quote guard, owner grounding, date recomputation, injection) | **tested** (13/13 conformance) |
| Model extraction quality on 30 comments | **blocked** — Forge LLM is unreachable outside the Forge runtime |

## Quick start

```bash
cd phase0

# everything that can run without an Atlassian site
node harness/run.mjs
node --test validator-probe/test/*.test.js

# manifest conformance against the real @forge/manifest JSON Schema
npm i --no-save ajv@8 js-yaml@4
node harness/validate-manifest.mjs
```

Results land in `harness/results/`.

## To run the two blocked experiments

See `docs/UNBLOCK.md`. You need a Jira Cloud site and a Forge login. About
45–60 minutes, most of it reading.

## Directory map

| Path | What it is |
| --- | --- |
| `VALIDATION-REPORT.md` | the deliverable: findings, evidence, decision |
| `docs/ENVIRONMENT.md` | what was available and what was missing |
| `docs/MANIFEST-EVIDENCE.md` | schema-level proof that conditions cannot run code and validators can |
| `docs/UNBLOCK.md` | exact steps for the blocked experiments, with a test matrix |
| `dataset/` | 30 hand-authored comments + hand-labelled ground truth (canonical) |
| `harness/` | dataset checks, conformance suite, baseline, manifest validation |
| `validator-probe/` | the Forge app: gate + benchmark webtrigger |

`validator-probe/src/data/` is generated from `dataset/` by
`node harness/sync-dataset.mjs`. Do not edit it.

## Delete this when

T1–T10 and the live benchmark are done and the numbers are recorded in the
report. Nothing here should be extended into the product — the probe uses a
label-based gate toggle and a webtrigger that must not exist in a shipped app.
