# ADR-001 — How Relay enforces closure

**Status:** Proposed (pending the experiment in `CUSTOMER-TRANSITION-VALIDATION-REPORT.md` §4)

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

*Pending §4 of the validation report.* The candidate position, to be confirmed or
rejected by the experiment:

1. **Primary mechanism — workflow validator.** Synchronous, refuses before the
   transition is applied, carries a message derived from stored state, and is proven
   on the agent and REST paths.
2. **Defence in depth — workflow condition, if the portal honours it.** Conditions
   decide whether a transition is offered at all. If a Forge condition can withhold
   the closure button while obligations exist, the portal path is closed by the same
   mechanism rather than by policy alone.
3. **Product policy — closure transitions must not be portal-exposed while Relay is
   armed**, unless (2) holds. This is a configuration constraint Relay can check and
   surface, and it is honest: it removes the path rather than pretending to gate it.

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

- If the portal bypass is confirmed and no condition-based remediation exists, Relay
  ships with a **disclosed scope limitation**: agent and API closures are gated;
  a customer closing their own request from the portal is not.
- Relay should detect portal-exposed closure transitions at configuration time and
  refuse to arm, or warn loudly. Silent arming on a workflow where a customer can
  bypass the gate is the failure mode this ADR exists to prevent.
- The gate must stay **fail-open on unreadable state** for availability reasons, so
  configuration errors can masquerade as "no obligations". Whatever the final model,
  Relay needs an observable signal when state cannot be read — E1's defect was
  invisible for exactly this reason.
