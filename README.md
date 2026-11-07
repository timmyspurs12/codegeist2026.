# codegeist2026.

Atlassian Codegeist 2026 — research, review and Phase 0 validation for **Relay**.

| Document | What it is | Status |
|---|---|---|
| `RELAY-REVIEW-V2.1.md` | **Read this first.** Corrects v2 on six defects — most importantly the missing closure-provenance write path — and adds the risk register's evidence classes, the Preview-status analysis, and the reordered experiment plan. | **current** |
| `RELAY-V2.1-CHANGELOG.md` | Every difference between v2 and v2.1, with what was deliberately left alone. | current |
| `RELAY-V2.1-RISK-REGISTER.md` | Every claim the build rests on, separated into verified / third-party / inferred / untested, plus the ranked risks. | current |
| `RELAY-V2.1-LIVE-BLOCKERS.md` | Every question that needs a live Atlassian site: setup, expected result, what it decides. ~4 hours of work. | **blocked** |
| `RELAY-REVIEW-V2.md` | The v2 review. Superseded by V2.1 where they disagree; still the reference for vision, originality, human impact, the nine-step journey and the build spec. | superseded |
| `RELAY-PRE-BUILD-RED-TEAM-REVIEW.md` | v1 review. Three conclusions are corrected by v2. | superseded |
| `CODEGEIST-2026-RESEARCH-REPORT.md` | The original 12-section competition and opportunity research. | background |
| `phase0/` | Technical validation: probe app, 30-comment labelled benchmark, 71 tests, reports. | **blocked** |
| `phase0/PHASE-0.2-REPORT.md` | Latest validation status, the live test matrix, and the exact user actions required. | current |
| `phase0/T12-VALIDATION-REPORT.md` | **T12 — is the validator available on a fresh site?** Verdict **PASS**: `Relay closure gate (probe)` appears in Jira's validator list on a company-managed transition, with no enablement step. Blocking behaviour is E1 and is untested. | **passed** |
| `phase0/E1-VALIDATION-REPORT.md` | **E1 — does the validator actually block?** Verdict **PASS**: a live `Mark as done` transition was refused from the issue view and via `POST /rest/api/3/issue/…/transitions` (HTTP 400) with counts read from stored state, and the identical request succeeded (HTTP 204) once the count was zero. A post function on the same transition is skipped when it blocks and runs when it allows (control-tested). Team-managed projects, customer-facing transitions and the Case/ESM workflows remain untested. | **passed** |

Both reviews' scores are machine-checked: `node phase0/harness/check-review.mjs` sums each score table, verifies the totals, checks that the prose headline matches the table, and rejects stale wording from earlier drafts.

No application code has been written. That is deliberate: the review gates the build. The one thing standing between this and a decision is a site, a login and four hours.

---

## Relay product (Phase 1)

The application lives in `app/`:

```
app/
  manifest.yml        Forge modules: global page, issue panel, workflow validator,
                      workflow condition (portal coverage)
  src/                data access (jira.js), extraction, storage, ledger, projection,
                      gate, sync, audit, handlers, Forge binding (resolvers.js)
  test/               99 tests — `npm test` (unit, handler, field, end-to-end slice, contract)
  ui/                 Custom UI (React + TS + Vite), own design system
  ui/src/screens/     Overview · Capture inbox · Case workspace · Activity · Settings
docs/design/          design system + skill audit
docs/P1-IMPLEMENTATION-REPORT.md
```

Run the interface locally:

```
cd app/ui && npm install && npm run dev     # http://localhost:5180
npm run check:render                        # renders every screen, asserts content
npm run typecheck
```

The UI runs against a clearly flagged fixture workspace until it is served inside Forge.
Inside Forge it reads the real site; a failing bridge is an error screen, never a
silent fall back to fixtures.

**Phase 2 (real Jira integration)** — what was built, what is live-verified,
documented-verified, inferred, untested or blocked: `docs/P2-INTEGRATION.md`.

**Phase 2.1 (app-owned closure field)** — the condition reads a read-only
`jira:customField` the app owns and writes through the private app-field API:
`docs/P2.1-RUNBOOK.md` (deploy steps) and §10 of `docs/P2-INTEGRATION.md`.

**Phase 2.2 (management state, conditional commits, append-only audit)** — the
condition now reads two app-owned fields (count + management state), every
ledger write is a conditional commit on the record's revision, the audit trail is
one key per event, and issues move through a tracked lifecycle
(backfill → initialising → managed → unmanaged):
`docs/P2.2-RUNBOOK.md` (deploy order, lint commands, rollback) and §11 of
`docs/P2-INTEGRATION.md`.

**P2.2.1 (manifest corrections)** — the manifest P2.2 shipped could not be
parsed on Windows (an unquoted `: ` inside a field description), the two
`jira:customField` modules were missing the resolver Forge requires, the issue
panel was missing its icon, and `function:` sat at the top level where the
manifest schema does not allow it. All four are fixed; `npm run check:manifest`
now parses the YAML with a real parser and validates it against the schema Forge
itself ships (`@forge/manifest`), so a manifest that only *looks* right no longer
passes. See §12 of `docs/P2.2-RUNBOOK.md`.

**P2.2.2 (the 422 on the first Track)** — the record was written straight into
the Custom Entity Store, which has no `null` value of any type and rejects
attributes that are not declared: `trackedBy` was null, every commitment carried
a dozen nulls, `source`/`trackedBy` were undeclared, and the created record had
no `digest`. `src/record-codec.js` is now the single encode/decode boundary — it
omits nulls (absent and null both mean *not recorded*) and restores them on read,
refuses an undeclared attribute before the network call, and `emptyLedger()`
carries `digestOf([])`. The fake entity store enforces the same rules, so the
suite runs under them. Not yet proven live: the corrected build has not been
deployed. See §13 of `docs/P2.2-RUNBOOK.md`.

Build and deploy from a machine with Forge credentials:

```
cd app && npm install          # dev dependencies: yaml, @forge/manifest
npm test && npm run check:manifest
cd ui && npm run build         # emits app/static/relay
cd .. && npx @forge/cli deploy && npx @forge/cli install --upgrade
```
