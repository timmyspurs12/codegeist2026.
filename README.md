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

Both reviews' scores are machine-checked: `node phase0/harness/check-review.mjs` sums each score table, verifies the totals, checks that the prose headline matches the table, and rejects stale wording from earlier drafts.

No application code has been written. That is deliberate: the review gates the build. The one thing standing between this and a decision is a site, a login and four hours.
