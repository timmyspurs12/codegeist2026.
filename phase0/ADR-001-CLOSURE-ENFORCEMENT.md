# ADR-001 — How Relay enforces closure

**Status:** Accepted 2026-11-04 — decision **B**, build with a documented scope limitation.
Evidence: `CUSTOMER-TRANSITION-VALIDATION-REPORT.md` §4.1 (validator bypassed on the portal),
§4.4 (condition honoured on the portal), §7 (decision and preconditions).

## Context

Relay's premise is that a case cannot be closed while unresolved obligations remain
attached to it. That premise is only worth anything if the refusal happens **before**
the closure is applied, on every path a closure can take.

E1 established, live and with controls, that a `jira:workflowValidator`:

- refuses an agent's transition in the issue view;
- refuses the same transition over `POST /rest/api/3/issue/{key}/transitions` with
  HTTP 400 and the same message;
- leaves the status unchanged and does not run the transition's post functions;
- allows the identical request when the stored count is zero.

Two defects had to be fixed before that was true, and both had made the gate silently
useless: the app had no `storage:app` scope (every state read threw, and fail-open
allowed everything), and the lab endpoint read a request field the runtime never sends.

What E1 did **not** establish is the portal path. Atlassian documents that
*"transitioning a work item from the portal ignores validators for the transition"*.
The open question is whether that bypass is scoped to portal-initiated transitions or
disables validation on the transition entirely.

## Decision

1. **Primary mechanism — workflow validator.** Synchronous, refuses before the
   transition is applied, carries a message derived from stored state, and is proven on
   the agent and REST paths (E1; `c3-3`). It is **not** applied on the customer-portal
   path (`c3-7`), so it cannot be the only mechanism.

2. **Portal coverage — a workflow condition backed by Relay's open-commitment field.**
   Conditions *are* honoured on the portal path (`c3-10`, `c3-11`), where validators are
   not. Because a condition cannot call Relay, the invariant must be materialised onto
   the work item (open commitments: N) and the condition must refuse while N > 0.
   This is a **build item, not a shipped capability**: the tested rule was a native JSM
   condition, and a Forge-contributed `jira:workflowCondition` is not yet shown to
   behave the same way on that path.

3. **Configuration constraint — customer closure off where the condition is absent.**
   Relay should detect a portal-exposed closure transition with no backing condition and
   refuse to arm, or warn loudly. Removing the path is honest; pretending to gate it is
   not.

**The residual race, stated plainly.** The condition is only as fresh as the field it
reads. If Relay writes "open commitments" asynchronously with respect to the ledger
mutation that creates the obligation, there is a window in which the field says zero and
a close is permitted. Closing that window — write-before-or-with the ledger change — is a
precondition of shipping, not a refinement.

**Consequence for the release.** Relay's gate holds on every path *provided* the
condition is present. Where it is not, and customer closure is enabled, a customer can
close a request with unresolved commitments. That limitation must appear in the user-facing
documentation in those terms, not as a footnote about "validators".

## Explicitly rejected

- **Asynchronous compensation** (automation or an issue-updated listener that reopens
  the case). It allows the closure to be real, then undoes it: a window exists in
  which the case is closed, downstream notifications have fired, and the record shows
  a closure that compliance reporting may already have consumed. It is not equivalent
  to a synchronous refusal and must not be described as such.
- **Claiming portal protection from the validator's behaviour elsewhere.** If the
  portal bypasses validators, the honest statement is that it does, not that the
  validator "covers closure".

## Consequences

- The portal bypass is confirmed. Relay therefore ships with a **disclosed scope
  limitation**: agent and API closures are gated by the validator; a customer closing
  their own request from the portal is gated only where a condition is configured.
- Validators carry a message to the user; conditions do not. The portal refusal is
  Jira's generic "You can not make this transition", so any explanation of *why* has to
  be surfaced by Relay elsewhere — asynchronously, and therefore not as part of the
  refusal.
- Relay should detect portal-exposed closure transitions at configuration time and
  refuse to arm, or warn loudly. Silent arming on a workflow where a customer can
  bypass the gate is the failure mode this ADR exists to prevent.
- The gate must stay **fail-open on unreadable state** for availability reasons, so
  configuration errors can masquerade as "no obligations". Whatever the final model,
  Relay needs an observable signal when state cannot be read — E1's defect was
  invisible for exactly this reason.
