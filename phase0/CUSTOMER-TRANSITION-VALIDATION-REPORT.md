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

*Pending.* Filled from `phase0/e1-customer/evidence/*.json` and screenshots. No claim
in this section may rest on the documented behaviour in §2.

---

## 5. Alternatives, and what each actually guarantees

| Option | Synchronous? | Guarantee | Verdict |
|---|---|---|---|
| `jira:workflowValidator` (current) | Yes | Transition refused before it is applied, message shown, post functions skipped | **Primary** — proven in E1 for agent and REST |
| `jira:workflowCondition` | Yes | Transition is not offered, and a forced REST POST is rejected | **Candidate defence-in-depth**, *if* conditions are honoured on the portal — untested (§2.3) |
| Automation rule / issue-updated listener that reopens the work item | **No** | Closure happens, then is undone | **Rejected** — explicitly not equivalent; leaves a window in which the closure is real |
| Hiding the closure transition from the portal by policy | Yes | The path does not exist | **Product policy**, enforceable by construction |
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

*Pending §4.*

---

## 8. Evidence index

| File | Contents |
|---|---|
| `phase0/e1-customer/evidence/*.json` | one file per case, machine-readable |
| `phase0/harness/transition-probe.mjs` | the instrument |
| `phase0/harness/probe-core.mjs` | classification rules, tested |
| `phase0/E1-VALIDATION-REPORT.md` | the prior enforcement evidence this builds on |
