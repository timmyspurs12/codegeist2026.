# Unblock: run the two experiments that actually decide Relay

Both experiments were blocked in this environment by missing Atlassian access
(see `ENVIRONMENT.md`). This is the exact sequence to run them elsewhere.
Estimated total: **45–60 minutes**, most of it reading.

You need: a Jira Cloud site you administer, Jira Service Management enabled, and
an Atlassian API token.

---

## 0. Set up

```bash
npm i -g @forge/cli@latest
forge login                     # API token from id.atlassian.com/manage-profile/security/api-tokens
forge settings set usage-analytics false
```

Check the local artefacts still pass:

```bash
cd phase0
node harness/run.mjs                                   # dataset + resolver + conformance + baseline
node --test validator-probe/test/*.test.js             # 48 unit/integration tests
node harness/validate-manifest.mjs                     # needs: npm i --no-save ajv@8 js-yaml@4
```

## 1. Deploy the probe

```bash
cd phase0/validator-probe
forge create                    # name it "relay-phase0-probe"; it rewrites manifest.yml with the real app id
forge deploy
forge install --site <your-site>.atlassian.net --product jira
```

`manifest.yml` currently carries a placeholder `app.id`; `forge create` replaces
it. If you copied the manifest instead, paste the printed id in by hand.

## 2. Wire the gate into a transition  ← this is the test that matters

1. Pick a **company-managed** project with a simple workflow (e.g. *To Do → In
   Progress → Done*).
2. Project settings → **Workflows** → edit the workflow → select the **Done**
   transition → **Validators** → *Add validator* → **Relay closure gate (probe)**.
3. Publish the workflow. **Publish is required** — an unpublished draft does
   nothing, and this is the single most common reason a validator "doesn't work".
4. Repeat in a **team-managed** project to test the `team-managed` entry in
   `projectTypes`.

### Test matrix

| # | Setup | Action | Expected | Result |
| --- | --- | --- | --- | --- |
| T1 | Issue with no labels | Transition to Done | Blocked. Message: *"Relay has unresolved promises attached to this case. Review the obligation ledger before closing it."* | |
| T2 | Add label `relay-block-2` | Transition to Done | Blocked. Message gains *"(2 unresolved)"* | |
| T3 | Labels `relay-block-2 relay-unowned-1 relay-overdue-1` | Transition | Blocked. Message gains *"(2 unresolved: 1 with no owner, 1 overdue)"* | |
| T4 | Remove all labels | Transition to Done | Succeeds | |
| T5 | Same as T2, from the **board** | Drag card to Done | Blocked identically | |
| T6 | Same as T2, from the **issue view** | Click transition | Blocked identically | |
| T7 | Same as T2 via REST | `POST /rest/api/3/issue/{key}/transitions` with the Done id | HTTP 400, error message present | |
| T8 | Same as T2 in a **team-managed** project | Transition | Blocked (verify `projectTypes` works) | |
| T9 | Add a **post function** (e.g. set a field) after the validator | Attempt T2 | Post function **does not run** — proves it blocks, not just warns | |
| T10 | `forge uninstall`, then transition a `relay-block` issue | Transition | Record what actually happens. Expected: the transition is **blocked** because a missing validator evaluates false | |

T9 is the one that distinguishes real enforcement from a cosmetic warning.
T10 is the one that will bite a customer, so record it precisely.

Capture: a screenshot of T3, the raw 400 body from T7, the T9 field value, and
the console log line containing `"event":"gate_decision"` (`forge logs -e
development -n 50`).

## 3. Run the extraction benchmark

```bash
forge webtrigger                      # note the URL
BASE="<webtrigger-url>"

# 3.1 is the LLM module live?
curl -s "$BASE?action=env" | head -40

# 3.2 flip the gate without touching labels
curl -s "$BASE?action=state&key=HOU-1&blocking=2&unowned=1"

# 3.3 run the benchmark in batches of 3 (sync invocation budget is ~25s)
for from in 0 3 6 9 12 15 18 21 24 27; do
  curl -s "$BASE?action=run&runId=r1&from=$from&count=3" | tail -5
  sleep 1
done

# 3.4 score
curl -s "$BASE?action=report&runId=r1" -o report.json
python3 -c "import json;print(json.load(open('report.json'))['markdown'])"
```

The report applies the pre-registered thresholds and prints PASS/FAIL:

- quote-verification ≥ 90%
- high-confidence precision ≥ 70%
- pivot to Close Call if precision < 60% after two iterations

Do not edit the dataset or the scorer to reach a threshold. If the numbers are
bad, the numbers are the finding.

## 4. If `action=env` shows `models: null`

The `llm` module is not active. Check, in order:

1. `manifest.yml` still contains the `llm:` block with `model: [claude]`.
2. You ran `forge deploy` **after** adding it (adding the `llm` module to an
   existing app is a major version change — confirm you accepted the bump).
3. The site has Forge LLM enabled for your app.

Report the exact error string; it is diagnostic.

## 5. What to send back

1. The T1–T10 table filled in, with the actual message text.
2. `report.json` (contains `markdown` plus the full per-comment breakdown).
3. Any `LLM_ERROR` detail strings from step 3.3.
4. `forge logs -e development | grep gate_decision | head -20`.

With those four things the Phase 0 decision is final rather than conditional.
