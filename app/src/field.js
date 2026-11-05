/**
 * The app-owned fields, and the workflow condition that reads them.
 *
 * A workflow condition is evaluated by Jira from the issue, so it can read a
 * field and nothing else. P2.1 declared one app-owned number field. That is not
 * enough for P2.2, because the condition has to distinguish three states that a
 * count alone cannot express:
 *
 *   * Relay does not manage this issue  → closure permitted;
 *   * Relay is still initialising it    → closure withheld;
 *   * Relay manages it                  → permitted only when the count is 0.
 *
 * A single number cannot say "not managed": zero would permit a case Relay has
 * never seen, which is exactly the fail-open the brief forbids. So the app owns
 * a second field — the management state — and the condition reads both.
 *
 * What this module owns:
 *
 *   1. **Identity.** Each module's type id is
 *      `ari:cloud:ecosystem::extension/{appId}/{environmentId}/static/{moduleKey}`
 *      (Forge manifest reference, "Field lifecycle"). Jira assigns the ordinary
 *      `customfield_NNNNN` id at deploy time, so Relay resolves it and caches
 *      it — it is discovered, never guessed, and never reused across
 *      environments.
 *   2. **The condition expression.** One string, built from the resolved ids and
 *      kept in one place so the manifest, the console, the runbook and the
 *      tests cannot drift apart.
 *   3. **The evaluator.** A faithful mirror of what the expression does, so the
 *      states that matter — unmanaged, initialising, managed with zero, managed
 *      with work, null, missing, invalid — can be tested without a live site.
 *      The mirror is a mirror. Only Jira evaluates the real expression; the
 *      authority for enforcement inside Relay is the ledger record.
 */

/** The two fields, as declared in manifest.yml under `jira:customField`. */
export const FIELD_SPECS = Object.freeze({
  count: {
    name: 'count',
    moduleKey: 'relay-closure-count',
    fieldName: 'Relay open commitments',
    description:
      'Relay’s internal closure projection: the number of unresolved commitments on this issue. Read-only. Written only by the Relay app. A workflow condition reads this value to withhold closure.',
    // Deliberately not a number: an unresolved expression must fail, and a
    // failure is a refusal (the condition module is fail-closed).
    placeholder: 'customfield_relay_closure_count',
    type: 'number',
  },
  state: {
    name: 'state',
    moduleKey: 'relay-management-state',
    fieldName: 'Relay management state',
    description:
      'Whether Relay manages this issue (managed, initializing or unmanaged). Read-only. Written only by the Relay app. A workflow condition reads this value so an unmanaged issue is never blocked and a half-initialised one never opens.',
    placeholder: 'customfield_relay_management_state',
    type: 'string',
  },
});

export const FIELD_KEYS = Object.freeze(['count', 'state']);

/** Module keys declared in manifest.yml. Changing them changes field identity. */
export const CLOSURE_FIELD_MODULE_KEY = FIELD_SPECS.count.moduleKey;
export const STATE_FIELD_MODULE_KEY = FIELD_SPECS.state.moduleKey;

export const CLOSURE_FIELD_NAME = FIELD_SPECS.count.fieldName;
export const CLOSURE_FIELD_DESCRIPTION = FIELD_SPECS.count.description;

/** The token the manifest carries until the app has resolved the real ids. */
export const CLOSURE_FIELD_PLACEHOLDER = FIELD_SPECS.count.placeholder;
export const STATE_FIELD_PLACEHOLDER = FIELD_SPECS.state.placeholder;

/**
 * Thrown when Sync needs a field and the app cannot name it. Never caught and
 * ignored: a mutation that cannot write the condition's fields must not be
 * reported as successful, because the portal would read the old values.
 */
export class ClosureFieldUnavailable extends Error {
  constructor(detail = 'the app-owned closure field could not be resolved') {
    super(`closure_field_unresolved: ${detail}`);
    this.name = 'ClosureFieldUnavailable';
    this.reason = 'closure_field_unresolved';
  }
}

const MODULE_ID = /^(ari:cloud:ecosystem::extension\/[^/]+\/[^/]+)(?:\/static\/.+)?$/;

/**
 * A custom field's type id for the app and environment that invoked us.
 *
 * `localId` is the invoked module's own id
 * (`ari:cloud:ecosystem::extension/<app>/<env>/static/<invoked-module>`). A
 * custom field's id shares the app and environment segments and ends in the
 * field module's key, so the invoked segment is replaced rather than trusted:
 * the console is usually invoked from the global page, not from a field.
 */
export function moduleTypeIdFrom(localId, moduleKey = CLOSURE_FIELD_MODULE_KEY) {
  const match = MODULE_ID.exec(String(localId ?? ''));
  if (!match) return null;
  return `${match[1]}/static/${moduleKey}`;
}

/** True for the numeric id Jira generates; anything else is not a field id. */
export function isFieldId(value) {
  return typeof value === 'string' && /^customfield_\d+$/.test(value);
}

/** True for a management state the condition expression recognises. */
export function isConditionState(value) {
  return value === 'managed' || value === 'unmanaged';
}

/**
 * The Jira expression the workflow condition evaluates.
 *
 *   (issue.<state> == "unmanaged")
 *     || (issue.<state> == "managed" && issue.<count> == 0)
 *
 * Which is true only when:
 *
 *   - the state field holds exactly `"unmanaged"`; or
 *   - the state field holds exactly `"managed"` **and** the count holds exactly
 *     the number 0.
 *
 * False for `"initializing"`, for null, for any other string, and for any count
 * that is not zero (including null, a string or an object — no coercion to
 * zero). An evaluation error — a field that does not exist, which is the state
 * before the app has resolved the ids — is treated by Jira as false. So every
 * state short of "explicitly unmanaged" or "managed and confirmed zero"
 * refuses the transition, and `missing` is never read as `unmanaged`.
 */
export function closureExpression({ count = CLOSURE_FIELD_PLACEHOLDER, state = STATE_FIELD_PLACEHOLDER } = {}) {
  const countId = isFieldId(count) ? count : CLOSURE_FIELD_PLACEHOLDER;
  const stateId = isFieldId(state) ? state : STATE_FIELD_PLACEHOLDER;
  return `(issue.${stateId} == "unmanaged") || (issue.${stateId} == "managed" && issue.${countId} == 0)`;
}

/** The expression as written in the manifest before either id is known. */
export const PLACEHOLDER_EXPRESSION = closureExpression({});

/**
 * `expression: '...'`, ready to paste into manifest.yml.
 *
 * Single-quoted because the expression itself contains double quotes and
 * backslash-escaping them inside a YAML double-quoted scalar is a defect
 * waiting for a copy-paste.
 */
export function expressionLine(expression = PLACEHOLDER_EXPRESSION) {
  return `expression: '${expression.replace(/'/g, "''")}'`;
}

/**
 * What the expression does with a pair of values, mirrored in JavaScript.
 *
 * `stateExists` / `countExists: false` stand for the property-access error Jira
 * raises when the expression names a field that is not on the issue at all.
 * `missing` — no record, no field, null value, unrecognised state — is always a
 * refusal.
 */
export function evaluateClosureCondition(
  { state = null, count = null } = {},
  { stateExists = true, countExists = true, error = null } = {},
) {
  if (error) return { allow: false, code: 'expression_error', detail: String(error) };
  if (!stateExists) return { allow: false, code: 'expression_error', detail: 'state field does not exist' };

  if (state === 'unmanaged') {
    return { allow: true, code: 'unmanaged', detail: 'Relay does not manage this issue' };
  }
  if (state === null || state === undefined) {
    return { allow: false, code: 'state_null', detail: 'state field is empty' };
  }
  if (state !== 'managed') {
    return { allow: false, code: 'state_not_managed', detail: `state is "${String(state)}"` };
  }

  return evaluateClosureValue(count, { fieldExists: countExists });
}

/**
 * The count half of the condition, in isolation. Kept separate because it is
 * the part with the coercion traps, and because a managed issue's count is the
 * number a human argues about.
 */
export function evaluateClosureValue(value, { fieldExists = true, error = null } = {}) {
  if (error) return { allow: false, code: 'expression_error', detail: String(error) };
  if (!fieldExists) return { allow: false, code: 'expression_error', detail: 'count field does not exist' };
  if (value === null || value === undefined) return { allow: false, code: 'null_value', detail: 'count field is empty' };
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { allow: false, code: 'invalid_value', detail: `expected a number, got ${typeof value}` };
  }
  if (value === 0) return { allow: true, code: 'clear', detail: 'zero unresolved commitments' };
  if (value > 0) return { allow: false, code: 'open_commitments', detail: `${value} unresolved` };
  return { allow: false, code: 'invalid_value', detail: `negative count ${value}` };
}

/**
 * Everything the console and the runbook need to say about one field.
 * `resolved: false` is a first-class state: it means the condition cannot read
 * anything yet, which is never "zero open" and never "unmanaged".
 */
export function describeField(which, { id = null, key = null, typeId = null, resolvedAt = null } = {}) {
  const spec = FIELD_SPECS[which];
  if (!spec) throw new Error(`unknown_field: ${which}`);
  const resolved = isFieldId(id);
  return {
    which,
    moduleKey: spec.moduleKey,
    name: spec.fieldName,
    type: spec.type,
    typeId: typeId ?? null,
    id: resolved ? id : null,
    key: key ?? null,
    resolved,
    resolvedAt: resolvedAt ?? null,
    placeholder: spec.placeholder,
  };
}

/**
 * Both fields, plus the expression that depends on both. This is the shape the
 * console, the reconcile report and the runbook all print.
 */
export function describeFields({ count = {}, state = {} } = {}) {
  const c = describeField('count', count);
  const s = describeField('state', state);
  const expression = closureExpression({ count: c.resolved ? c.id : CLOSURE_FIELD_PLACEHOLDER, state: s.resolved ? s.id : STATE_FIELD_PLACEHOLDER });
  return {
    count: c,
    state: s,
    resolved: c.resolved && s.resolved,
    expression,
    manifestLine: expressionLine(expression),
    /** Kept for the console's older wording: the count field is the closure field. */
    id: c.id,
    key: c.key,
    typeId: c.typeId,
    resolvedAt: c.resolvedAt,
    placeholder: CLOSURE_FIELD_PLACEHOLDER,
  };
}
