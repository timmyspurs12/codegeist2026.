# Manifest evidence: what the platform schema actually permits

These findings come from the JSON Schema that ships inside `@forge/manifest`,
which is the same schema `forge lint` validates against. They are machine-checked
facts, not documentation summaries, and they independently confirm the central
claim of the pre-build review.

Sources (both inspected locally):

- `/usr/local/lib/node_modules/@forge/cli/node_modules/@forge/manifest/out/schema/manifest-schema.json` (bundled with CLI 14.2.0)
- `@forge/manifest@13.8.0` unpacked from the npm tarball (current published version)

Both versions agree on everything below.

## 1. `jira:workflowCondition` cannot run application code

```
jira:workflowCondition
  properties : create, description, description__i18n, edit,
               evaluateAgainstOriginalIssue, expression, key, name,
               name__i18n, projectTypes, resolver, view
  required   : description, expression, name, key
```

There is **no `function` property**. `expression` is **required**. A manifest that
declares `function:` on a condition does not fail lint — the property is simply
not part of the module — and the function is never invoked.

`resolver` exists on both conditions and validators, but it resolves the
*configuration UI* (`create`/`edit`/`view` resources), not the condition's
evaluation. Reading `resolver` as "conditions can call code" is the exact
mistake that produces a gate which silently never blocks.

**Verdict: a workflow condition is unusable as an enforcement mechanism. Confirmed
at schema level, independently of the documentation.**

## 2. `jira:workflowValidator` can run application code

```
jira:workflowValidator
  properties : create, description, description__i18n, edit, errorMessage,
               errorMessage__i18n, expression, function, key, name,
               name__i18n, projectTypes, resolver, view
  required   : description, name, key
```

`function` is present and permitted. `errorMessage` accepts a string, an i18n
object, or `{ expression: "..." }` for a computed message. `projectTypes`
defaults to `["company-managed"]` with `team-managed` as the only alternative.

**Verdict: this is the only module that can run code inside a transition and
return a blocking decision. It is the correct and only choice for the gate.**

## 3. `llm` module shape

```
llm
  properties : key, model, modelDisplayNames
  required   : key, model
  model.items.enum : ["claude"]
```

So the correct declaration is:

```yaml
modules:
  llm:
    - key: relay-llm
      model:
        - claude
```

The model *version* (sonnet/haiku/opus) is chosen at call time in `chat()`, not
in the manifest.

## 4. `@forge/llm@1.0.9` request surface

Read from the published TypeScript declarations, not from prose:

```ts
chat({ model, messages, temperature?, max_completion_tokens?, top_p?, tools?, tool_choice? })
  → { choices: [{ finish_reason, message: { role, content, tool_calls? } }], usage? }

ToolChoice = 'auto' | 'none' | 'required' | { type: 'function', function: { name } }
ToolCall   = { id, type: 'function', index, function: { name, arguments: object } }
Content    = string | ContentPart[]        // ContentPart = TextPart only
```

Three consequences that shaped the build:

1. **No `response_format`.** Forced tool calling is the only supported route to
   structured output. `tool_choice: { type:'function', function:{ name:'emit_obligations' } }`
   is supported.
2. **Text-only.** `ContentPart` is `TextPart` only — no image parts. Photo
   analysis is not available, confirming the review's "D" classification.
3. **`arguments` arrives already parsed** as an object, but the implementation
   still defends against a string, because the transport type is `object` while
   the wire format is usually a JSON string.

Client-side validation (`validators.js`) checks only: model present, temperature
in [0,1], max_completion_tokens a positive integer, messages non-empty, top_p in
[0,1]. It does **not** validate tool schemas or model names — those fail at the
server. This matters because `claude-sonnet-5`, `opus-4-7`, `opus-4-8` and
`opus-5` reject `temperature`/`top_p`; passing them passes client validation and
fails remotely. The probe omits both.

## 5. Forge LLM is unreachable from outside the runtime

From `@forge/llm/out/llm-client.js`:

```js
static LLM_BASE_URL = 'https://llm';
... global.__forge_fetch__({ type: 'llm', model }, `${LLM_BASE_URL}/${model}`, ...)
```

`https://llm` is an internal alias resolved by the Forge runtime, and
`__forge_fetch__` is a runtime-provided global. There is no public HTTP endpoint
and no SDK that works outside Forge. **This is why the model benchmark could not
be run in this environment, and why no substitute was attempted.**

## 6. Custom Entity Store surface

From `@forge/kvs@2.1.1` declarations:

```ts
kvs.entity<T>(entityName).get(key) / .set(key, value) / .delete(key) / .query()
kvs.get/set/batchGet/batchSet/delete/query/transact
```

Sufficient for the obligation ledger without Forge SQL, as the review recommended.

## Reproduction

```bash
# schema check
node phase0/harness/validate-manifest.mjs
# -> "manifest conforms to the @forge/manifest JSON Schema"

# raw schema inspection
python3 - <<'PY'
import json
p='/usr/local/lib/node_modules/@forge/cli/node_modules/@forge/manifest/out/schema/manifest-schema.json'
d=json.load(open(p))['definitions']['ModuleSchema']['properties']
for k in ['jira:workflowValidator','jira:workflowCondition','llm']:
    print(k, sorted(d[k]['items'].get('properties',{}).keys()))
PY
```
