# Environment inspection — 30 October 2026

Recorded before any file was created. No secrets are reproduced here; only
variable names and reachability results.

## Workspace

| Item | Result |
| --- | --- |
| Working directory | `/home/user/codegeist2026.` (the repository directory name ends with a dot — not a typo) |
| Pre-existing Relay app | **None.** Repo contained `README.md` plus two markdown research documents |
| Branch | `arena/06fd2e30-codegeist2026` |
| Working tree at start | clean |
| HEAD | `4fe156b Add Relay pre-build red-team product review and build specification` |
| Remote | `origin https://github.com/timmyspurs12/codegeist2026..git` |

Nothing was overwritten. The two existing documents are untouched.

## Toolchain

| Tool | Result |
| --- | --- |
| Node.js | **v22.22.3** |
| npm | 10.9.8 |
| Forge CLI | **not installed** at start |
| Forge CLI (installed) | **14.2.0** — the highest version that runs on Node 22.22.3 |
| Forge CLI 15.0.0 | Installs, but refuses to run: `The CLI requires Node.js ^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1` |
| `@forge/manifest` schema used | 13.8.0 (also cross-checked against the copy bundled in CLI 14.2.0) |

Install note: `npm i -g @forge/cli` fails on this machine because the `keytar`
dependency needs to compile against Node headers fetched from `nodejs.org`
(blocked). Installing with `--ignore-scripts` succeeds, which is fine because
keytar is only used for credential storage and no credential exists.

## Atlassian access

| Check | Result |
| --- | --- |
| `~/.forge` (CLI credentials) | **absent** |
| `FORGE_*` / `ATLASSIAN_*` env vars | **none present** |
| `forge whoami` | not logged in |
| `forge login` | **cannot complete** — requires a browser/token exchange with `id.atlassian.com` |
| Development site | **none available** |
| App installation | **none** |

## Network reachability (GET, 8s timeout)

| Host | HTTP result |
| --- | --- |
| `registry.npmjs.org` | **200** |
| `github.com` / `api.github.com` | reachable (git push succeeded) |
| `id.atlassian.com` | connection failed |
| `developer.atlassian.com` | connection failed |
| `api.atlassian.com` | connection failed |
| `*.atlassian.net` | connection failed |
| `api.anthropic.com` | connection failed |

Consequence: **no Atlassian product API, no Forge deploy, no model inference.**
Everything in this phase therefore splits cleanly into what could be executed
here and what could not. That split is the structure of the validation report.

## What is missing, and exactly what it costs

| Missing | Blocks | Fix |
| --- | --- | --- |
| Forge login (API token) | `forge deploy`, `forge install`, `forge webtrigger` | Create an API token at `id.atlassian.com/manage-profile/security/api-tokens`, then `forge login` |
| A Jira Cloud development site | every live test in Part 2 and Part 3 | Free site at `go.atlassian.com/platform/forge/getting-started` |
| Jira Service Management on that site | the customer-facing half of the scenario | Enabled by default on new free sites |
| Rovo entitlement | only the optional agent bonus | Not needed for Phase 0 |

`docs/UNBLOCK.md` contains the exact command sequence to run the two blocked
experiments once those three things exist. Estimated time: **45–60 minutes**,
of which the model benchmark is about 3 minutes of wall time and 10 minutes of
reading.

## Credentials hygiene

- No token, password, API key or site URL was written to any file in this
  repository.
- `.env`, `node_modules/`, and any local credential files are outside the
  committed tree (`node_modules` is excluded by the repository's existing
  ignore conventions and by the workspace snapshot rules).
- The manifest deliberately declares **no external fetch permissions**, so the
  app cannot make outbound calls even if someone later tries to add one without
  changing the manifest.
