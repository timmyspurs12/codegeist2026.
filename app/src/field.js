/**
 * The app-owned closure field.
 *
 * A workflow condition is evaluated by Jira from the issue, so it can read a
 * field and nothing else. Phase 2 used a number field an administrator created
 * by hand, which meant the app depended on a value it could not identify, could
 * not own, and could not guarantee. Phase 2.1 declares the field in the app's
 * own manifest (`jira:customField`), which makes the app the owner of the field
 * and gives the field an identifier derived from the app, the environment and
 * the module key — never a number someone typed.
 *
 * What this module owns:
 *
 *   1. **Identity.** The module's type id is
 *      `ari:cloud:ecosystem::extension/{appId}/{environmentId}/static/{moduleKey}`
 *      (Forge manifest reference, "Field lifecycle"). Jira assigns the ordinary
 *      `customfield_NNNNN` id when the field is created at deploy time, so the
 *      app resolves that id from Jira and caches it — it is discovered, never
 *      guessed.
 *   2. **The condition expression.** A single string, built from the resolved
 *      id, kept in one place so the manifest, the console and the tests cannot
 *      drift apart.
 *   3. **The evaluator.** A faithful mirror of what the expression does with a
 *      value, so the six states the brief requires — zero, positive, missing,
 *      null, invalid, error — can be tested without a live site. The mirror is
 *      a mirror; only Jira evaluates the real expression.
 */

/** Module key declared in manifest.yml. Changing it changes the field's identity. */
export const CLOSURE_FIELD_MODULE_KEY = 'relay-closure-count';

export const CLOSURE_FIELD_NAME = 'Relay open commitments';

export const CLOSURE_FIELD_DESCRIPTION =
  'Relay’s internal closure projection: the number of unresolved commitments on this issue. Read-only. Written only by the Relay app. A workflow condition reads this value to withhold closure.';

/**
 * The token the manifest carries until the app has resolved the real field id.
 * It is deliberately not a number: an unresolved expression must fail, and a
 * failure is a refusal (the condition module is fail-closed), never an allowance.
 */
export const CLOSURE_FIELD_PLACEHOLDER = 'customfield_relay_closure_count';

/**
 * Thrown when Sync needs the field and the app cannot name it. Never caught and
 * ignored: a mutation that cannot write the condition field must not be
 * reported as successful, because the portal would read the old value.
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
 * The custom field's type id for the app and environment that invoked us.
 *
 * `localId` is the invoked module's own id
 * (`ari:cloud:ecosystem::extension/<app>/<env>/static/<invoked-module>`). The
 * custom field's id shares the app and environment segments and ends in the
 * field module's key, so the invoked segment is replaced rather than trusted:
 * the console is usually invoked from the global page, not the field.
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

/**
 * The Jira expression the workflow condition evaluates.
 *
 * `issue.<id> == 0` is:
 *   - true  only when the field holds the number 0;
 *   - false when it holds any other number;
 *   - false when it holds null, a string or an object (no coercion to zero);
 *   - an evaluation error when the field does not exist — and Jira treats an
 *     expression error as false.
 *
 * So every state other than a confirmed zero refuses the transition.
 */
export function closureExpression(fieldId = CLOSURE_FIELD_PLACEHOLDER) {
  const id = isFieldId(fieldId) ? fieldId : CLOSURE_FIELD_PLACEHOLDER;
  return `issue.${id} == 0`;
}

/** The expression as written in the manifest before the id is known. */
export const PLACEHOLDER_EXPRESSION = closureExpression(CLOSURE_FIELD_PLACEHOLDER);

/**
 * What the expression does with a value, mirrored in JavaScript.
 *
 * `fieldExists: false` stands for the property access error Jira raises when
 * the expression names a field that is not on the issue at all.
 */
export function evaluateClosureValue(value, { fieldExists = true, error = null } = {}) {
  if (error) return { allow: false, code: 'expression_error', detail: String(error) };
  if (!fieldExists) return { allow: false, code: 'expression_error', detail: 'field does not exist' };
  if (value === null || value === undefined) return { allow: false, code: 'null_value', detail: 'field is empty' };
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { allow: false, code: 'invalid_value', detail: `expected a number, got ${typeof value}` };
  }
  if (value === 0) return { allow: true, code: 'clear', detail: 'zero unresolved commitments' };
  if (value > 0) return { allow: false, code: 'open_commitments', detail: `${value} unresolved` };
  return { allow: false, code: 'invalid_value', detail: `negative count ${value}` };
}

/**
 * Everything the console and the runbook need to say about this field.
 * `resolved: false` is a first-class state: it means the condition cannot read
 * anything yet, which must never be reported as "zero open".
 */
export function describeField({ id = null, key = null, typeId = null, resolvedAt = null } = {}) {
  const resolved = isFieldId(id);
  return {
    moduleKey: CLOSURE_FIELD_MODULE_KEY,
    name: CLOSURE_FIELD_NAME,
    typeId: typeId ?? null,
    id: resolved ? id : null,
    key: key ?? null,
    resolved,
    resolvedAt: resolvedAt ?? null,
    // What the manifest's condition expression must contain once the id is
    // known. Until it does, the deployed expression still names the placeholder
    // and fails closed.
    expression: closureExpression(resolved ? id : CLOSURE_FIELD_PLACEHOLDER),
    manifestLine: `expression: "${closureExpression(resolved ? id : CLOSURE_FIELD_PLACEHOLDER)}"`,
    placeholder: CLOSURE_FIELD_PLACEHOLDER,
  };
}
