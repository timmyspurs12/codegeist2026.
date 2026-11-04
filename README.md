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
  src/                ledger, projection, gate, sync, audit, resolvers, workflow handlers
  test/               34 unit tests — `npm test`
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

Build and deploy from a machine with Forge credentials:

```
cd app/ui && npm run build     # emits app/static/relay
cd .. && npx @forge/cli deploy && npx @forge/cli install --upgrade
```
