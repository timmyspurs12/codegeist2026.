# Customer-facing transitions — does Relay's gate survive them?

**Status: IN PROGRESS — experiment designed, documented behaviour established,
live results pending.** The decision in §7 is deliberately blank until §4 has data.

This report exists because E1 proved something narrower than it looks. E1 proved the
validator blocks an **agent** transition and a **REST** transition on a
company-managed project. It did not touch the **portal** path, and Jira's workflow
editor displays, next to the customer-transition toggle:

> Rules won't work when customer transitions are enabled.

If that sentence is read literally, enabling customer transitions on a closure
transition would disable Relay's enforcement on that transition entirely. If it is
read narrowly, only portal-initiated transitions bypass validators, and agent and
API closures stay gated. The difference between those readings is the difference
between a scope limitation and an architectural blocker, so it gets tested rather
than argued.

---

## 1. The question, decomposed

| # | Question | How it is answered |
|---|---|---|
| Q1 | What does the warning actually mean? | Documented behaviour (§2) |
| Q2 | Which paths does it cover — portal, agent issue view, REST? | Experiment (§4) |
| Q3 | Does the validator execute on the customer-facing transition? | Experiment (§4) |
| Q4 | Can a customer close a request with unresolved commitments? | Experiment (§4) |
| Q5 | Company-managed only, or other project types? | Documented + prior evidence |
| Q6 | Is there a supported mechanism giving the same invariant? | §5 |

---

## 2. Documented behaviour

### 2.1 The bypass is scoped to portal-initiated transitions

Atlassian, *Jira Service Management Cloud — Show a workflow transition in the portal*
(`support.atlassian.com/jira-service-management-cloud/docs/show-a-workflow-transition-in-the-portal/`):

> Customer transitions in the portal do behave differently however than other
> workflow transitions, for example:
> - Screens don't display in the portal. You can set a resolution for work items
>   that are transitioned in the portal.
> - **Transitioning a work item from the portal ignores validators for the
>   transition.**

Two details in that wording matter:

- The subject is *"transitioning a work item **from the portal**"* — the actor's path,
  not the transition.
- It says **validators** specifically. It does not claim conditions or post functions
  are ignored, and it does not claim the transition stops being gated elsewhere.

The Jira editor's warning is a shortened restatement of this, attached statically to
the toggle rather than scoped to the transition. [DOCUMENTATION VERIFIED]

### 2.2 Validators are otherwise expected to work on JSM transitions

The Forge `jira:workflowValidator` reference states that, *"for Jira Service Desk
transitions"*, two extra context variables are available to the validator:
`customerRequest` and `serviceDesk`.

Those variables only have a purpose if the module is evaluated on JSM transitions by
some path. This is supporting evidence, not proof — but it makes the narrow reading
of the warning the one to test first. [DOCUMENTATION VERIFIED — inference marked as
inference]

### 2.3 What remains undocumented

- Whether enabling the toggle changes behaviour **for non-portal paths on the same
  transition**. Atlassian documents the portal bypass but does not say the transition
  becomes unvalidated everywhere. Our editor note is ambiguous. [NOT DOCUMENTED]
- Whether a **workflow condition** — the mechanism that decides whether a transition
  is offered at all — is honoured on the portal. If it is, a condition could withhold
  the closure button while obligations exist, which is the same invariant by a
  different route. [NOT DOCUMENTED]

---

## 3. Experiment design

### 3.1 Principle

Every case states what would falsify it. A case that passes for the wrong reason is
recorded as inconclusive, not as a pass. A refusal is only counted as Relay's if the
response carries Relay's sentence (`"unresolved promises"`); any other refusal is
classified `refused_by_jira` and treated as no evidence about the gate.

### 3.2 Matrix

| Case | Toggle | Path | `blockingCount` | What would show the gate survived |
|---|---|---|---|---|
| C0 | off | REST | 2 | 400 + Relay sentence — **already recorded in E1 (A20)** |
| C1 | **on** | REST | 2 | 400 + Relay sentence |
| C2 | **on** | agent, issue view | 2 | transition refused in the dialog |
| C3 | **on** | portal | 2 | *expected to close, per §2.1* |
| C4 | **on** | portal | 0 | closes — control proving C3 isn't just a broken button |

### 3.3 Instrumentation

`phase0/harness/transition-probe.mjs` performs one transition over REST and writes
`phase0/e1-customer/evidence/<label>.json` containing the status before and after,
the transitions offered to the caller, the HTTP status, the parsed body, and a
classification. Credentials come from `JIRA_EMAIL` / `JIRA_TOKEN` and are never
written or printed.

`phase0/harness/probe-core.test.mjs` tests the classification rules, including that a
2xx response is reported as `validatorRan: unknown` rather than as evidence the
validator was skipped.

### 3.4 Blast radius

The Facilities project contains a single work item (`FS-1`). The toggle is changed on
one transition of one workflow; it is reverted at the end. No other project is
touched. The portal case requires a portal-facing request type, which uses
`FS: Default ESM workflow for Jira Service Management` rather than the Task workflow
`FS-1` runs on.

---

## 4. Results

Evidence: `phase0/e1-customer/evidence/`. Every row below is a recorded run, not a
reading of §2.

### 4.1 The two paths, same transition, same broken invariant

Both attempts target `FS-2` (`Report a maintenance issue`, `In Progress`) and the same
transition, `Resolved` (id `121`, `In Progress → Done`), which carries the
`Relay closure gate (probe)` validator and has the customer-portal switch **on and
published**. Both were made while the gate state for `FS-2` held
`blockingCount: 2` (1 with no owner, 1 overdue).

| Label | Caller / path | Gate state | POST | Result | Final status | Validator ran? |
|---|---|---|---|---|---|---|
| `c3-3-agent-blocking-2` | Agent, `/rest/api/3/issue/FS-2/transitions` | `blockingCount: 2` | **400** | `refused_by_relay` — Relay sentence returned verbatim | `In Progress` (unchanged) | **yes** |
| `c3-7-customer-blocking-2` | Customer, `/rest/servicedeskapi/request/FS-2/transition` | `blockingCount: 2` | **204** | **allowed** | **`Done`** | **no** — the validator never refused |

*Provenance of the gate state.* The gate state for `FS-2` was written once, at
`2026-11-04T10:17:43.500Z`, through the probe app's state webtrigger
(`action=state&key=FS-2&blocking=2&unowned=1&overdue=1`). Nothing in this experiment
writes gate state — the probe reads status and posts transitions only — so that single
write is the state in force for both `c3-3` and `c3-7`. The write was deliberately not
repeated for later runs: re-issuing it would have produced a timestamp *later* than the
attempts it is meant to characterise.

`c3-7` is the finding this experiment existed to produce: **the platform applies the
customer-portal transition without consulting `jira:workflowValidator`.** The same
transition, refused to an agent with the same unresolved commitments, was granted to a
customer. This is LIVE VERIFIED, and it matches the Atlassian documentation quoted in
§2 rather than contradicting it.

### 4.1b What the editor itself calls a "rule"

The transition panel groups four things under **Rules**, as seen on the `Resolved`
transition (screenshots, 2026-11-04):

| Editor label | Workflow concept |
|---|---|
| `Restrict transition` | conditions |
| `Request input` | transition screen |
| `Validate details` | validator (*formerly labelled "Validators"*) |
| `Perform actions` | post functions |

The customer-portal warning is attached to the **Customer transitions** block and reads,
literally: **"Rules won't work when customer transitions are enabled."** It does not say
"validators". Read structurally — LIVE VERIFIED as UI wording — the warning claims the
entire rule set of that transition is skipped for the customer path.

§4.1 proves that claim for `Validate details` and is silent about the other three. It is
therefore a plausible-but-unproven extension to say conditions are skipped too, and so
the condition test in §4.4 is treated as open, not as a formality.

### 4.2 What did not hold up, and is therefore not cited

Recording these matters as much as recording the result — each one was a plausible
"finding" that was really an instrument error.

| Label | What it appeared to show | Why it is unusable |
|---|---|---|
| `c3-0`, `c3-1`, `c3-2` | "the customer endpoint offers two transitions" | Run before the `--customer` flag was present on the test machine; the flag was ignored and the **agent** endpoint was called. Not customer-path evidence. |
| `c3-4-customer-blocking-2` | "the customer path refuses with a Jira error" | Sent the transition *name* where an id is required (`{"id":"Resolved"}`); Jira answered `sd.rest.error.bad.request`. A malformed request, not a decision. |
| `c3-5-customer-blocking-2` | "no customer transition is available" | The harness read the customer list from `transitions`; the service-desk endpoint pages it under **`values`**, so the transition was recorded as absent while Jira was offering `Resolved`. Fixed in `45de185`; a test now pins the paged shape. |
| `c3-6-customer-listed` | same | Kept as the raw body that exposed the shape bug: `{"size":1,…,"values":[{"id":"121","name":"Resolved"}]}`. |

The lesson carried into the report: a probe that reports "no transition offered" can be
reporting its own bug, and the only defence is to keep the raw response.

### 4.3 Scope and blast radius of the published changes

`FS: Default ESM workflow for Jira Service Management` serves the request types
`Report a maintenance issue` and `Request an event`. The `FS` project holds two work
items. The validator and the customer-portal switch are reverted once testing ends
(§7); nothing outside this workflow was touched.

### 4.4 Does a condition survive where a validator does not?

A native **`Restrict transition`** rule (`Restrict from all users`, with
*All users, including APIs*) was added to the same `Resolved` transition and published.
It refuses everyone, which makes a refusal prove the rule is live rather than incidental.

| Label | Path | Listing before POST | POST | Final status |
|---|---|---|---|---|
| `c3-10-agent-condition` | agent | `[111:In review]` — `121` gone | **400** `Can't move (FS-2). You might not have permission…` | `In Progress` |
| `c3-11-customer-condition` | customer | `[]` — empty | **400** `You can not make this transition` (`transition.unavailable`) | `In Progress` |

Set against §4.1, where the identical transition, with the identical unresolved
commitments, was **granted** to a customer and **refused** to an agent:

| | Customer listing | Customer POST | Outcome |
|---|---|---|---|
| Validator only (`c3-6`, `c3-7`) | `[{id:121, Resolved}]` | **204** | closure allowed with 2 open commitments |
| Condition added (`c3-11`) | `[]` | **400** | closure refused |

**Conclusion — LIVE VERIFIED:** the customer-portal path ignores `jira:workflowValidator`
but honours workflow **conditions**. The feature that is skipped is the validator, not the
transition's configuration as a whole. Note that this contradicts the plain reading of the
editor warning "Rules won't work…" (§4.1b), which is why it was tested rather than assumed.

### 4.5 What this does not licence

1. **The tested rule is a native JSM condition, not a Forge module.** Whether a
   `jira:workflowCondition` contributed by our app is honoured on the portal path the same
   way is **NOT TESTED**. The rule picker does list `relay-phase0-probe` under
   *Marketplace rules*, so the module type is available to the app; that is an opportunity,
   not a result.
2. **A condition cannot call Relay.** Conditions evaluate the transition's context and the
   work item; they do not make an outbound call. The closure invariant must therefore be
   *materialised onto the work item* — a field or property holding "unresolved commitments:
   N" — and the condition compares that value. The freshness of that field becomes the new
   race: if Relay updates it asynchronously, there is a window in which the field still says
   zero and a customer (or agent) can close. This is the one place where an async write can
   still reintroduce the failure the whole design exists to prevent.
3. **The customer gets no explanation.** The refusal is the generic
   `You can not make this transition`; the customer is not told which commitments are open.
   Validators can carry a message, conditions cannot. Any "your request cannot be closed
   while…" explanation has to be surfaced elsewhere — the portal request description, a
   comment, or the Relay app's own UI — and none of those is synchronous with the refusal.
4. **The `Restrict to when a field is a specific value` rule type exists** (picker,
   screenshot) and is the intended production shape, but was **NOT TESTED**.

### 4.6 Post-revert state

The workflow was restored before the experiment was closed, and the restoration was checked
against the same API the tests used rather than against the editor panel:

| Label | Path | Listing after revert |
|---|---|---|
| `c3-12-post-revert-agent` | agent | `[111:In review, 121:Resolved->Done]` — the transition is offered again, so the condition is gone |
| `c3-13-post-revert-customer` | customer | `[]` — the portal switch is off, so the path does not exist |

What was reverted: the `Restrict from all users` rule, the `Relay closure gate (probe)`
validator, and the customer-transition switch (`Customers can make this transition`), all
on the single `Resolved` transition (`In Progress → Done`) of
`FS: Default ESM workflow for Jira Service Management`. Nothing was changed in any other
workflow, project or request type. The two disposable work items (`FS-1`, `FS-2`) are left
in place as the subjects of the recorded evidence.

The revert mattered operationally, not just hygienically: while the condition was live,
**no user of that workflow could resolve a request at all** — including an administrator.
That is the strongest argument for testing conditions on a disposable transition, and it is
why the revert was verified through the API before anything else was written up.

---

## 5. Alternatives, and what each actually guarantees

| Option | Synchronous? | Guarantee | Verdict |
|---|---|---|---|
| `jira:workflowValidator` (current) | Yes | Transition refused before it is applied, message shown, post functions skipped | **Primary for agent and REST** — proven (E1, `c3-3`). **Not applied on the portal path** (§4.1). |
| `jira:workflowCondition` | Yes | Transition is not offered, and a forced POST is rejected | **Required for portal coverage** — honoured on the portal path where the validator is not (§4.4). Carries no message. |
| Field-backed condition (`Restrict to when a field is a specific value`), fed by Relay | Yes | Same as above, with the value maintained by Relay | **Intended production shape** — rule type confirmed present, **NOT TESTED**; freshness of the field is its own race (§4.5.2) |
| Automation rule / issue-updated listener that reopens the work item | **No** | Closure happens, then is undone | **Rejected** — explicitly not equivalent; leaves a window in which the closure is real |
| Leaving the customer-transition switch off | Yes | The path does not exist at all | **Valid fallback**, but it is a setting an administrator can flip (§4.1 is what happens when they do) |
| Required-fields / screens on the transition | — | Screens do not display in the portal at all (§2.1) | **Not available** for the portal path |

---

## 6. What this report does not cover

- Team-managed projects (E3) — separate question, untouched here.
- Whether Relay should *itself* detect that a closure transition is portal-exposed,
  and warn at configuration time. That is a product decision, not a platform fact.
- Performance of the validator under portal-scale traffic.
- Any project type other than company-managed JSM.

---

## 7. Build-readiness decision

**B — BUILD WITH A DOCUMENTED SCOPE LIMITATION.**

**What is proven.** Relay's synchronous closure gate is enforced on the agent and REST
paths, and is not enforced on the JSM customer-portal path. That is demonstrated, not
inferred: the same transition, on the same work item, with the same two unresolved
commitments, refused an agent and admitted a customer (`c3-3` vs `c3-7`).

**What bounds the decision.** A supported, synchronous mechanism *does* govern the portal
path — a workflow condition (§4.4). So this is not an architectural blocker; the invariant
can be defended on every path, but not by the validator alone.

**The limitation to be documented, in the words a user would need:**

> Relay's closure gate is enforced whenever a colleague or integration closes a request.
> If a project is configured to let **customers** close their own requests from the portal,
> Jira applies that closure without running Relay's gate, and a request can be closed with
> unresolved commitments. Relay therefore requires, for any request type where customer
> closure is enabled, a workflow condition on that transition backed by Relay's open-
> commitment field. Where that condition is absent, the safe configuration is to leave
> customer closure switched off.

**Preconditions before this becomes A.** Any one left undone keeps the decision at B:

1. A Forge `jira:workflowCondition` is shown to be honoured on the portal path — the same
   test as §4.4, run with our module rather than a built-in rule.
2. The open-commitment field is written **before or atomically with** the ledger change that
   would block a close, so there is no window in which the field says zero and the ledger
   does not. This is the residual race and the only one that matters.
3. The condition is verified to fail closed on app uninstall or evaluation error, as the
   validator is.
4. Tests cover the four combinations: agent/portal × blocked/unblocked — with the portal arm
   driven by the same probe used here.

**What would move this to C.** If a Forge condition is *also* ignored on the portal path,
the hole is closable only by switching customer closure off, and whether that is acceptable
becomes a product question rather than an engineering one. On the present evidence it is
not: the built-in condition was honoured, and the app's module type exists.

**The assumption under test.** This decision assumes Relay's first release does not
*require* customer self-closure — customers raise and comment, agents close. If customer
self-closure is a first-class requirement, the same evidence supports **C** until
preconditions 1–4 are discharged, because today the product would be shipping a closure path
it cannot gate.

---

## 8. Evidence index

| File | Contents |
|---|---|
| `phase0/e1-customer/evidence/*.json` | one file per case, machine-readable. `c3-3` agent refusal, `c3-7` customer closure, `c3-10`/`c3-11` condition arms |
| `phase0/harness/transition-probe.mjs` | the instrument |
| `phase0/harness/probe-core.mjs` | classification rules, tested |
| `phase0/E1-VALIDATION-REPORT.md` | the prior enforcement evidence this builds on |
