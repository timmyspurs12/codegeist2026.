#!/usr/bin/env node
/**
 * Offline manifest check.
 *
 * `forge lint` is the real gate, and it needs a Forge login and network access
 * to Atlassian. This script is the part of that gate that can run anywhere —
 * including a Windows machine with only Node and no dependencies — and it
 * checks the things a lint failure usually means in this app:
 *
 *   * a module pointing at a function or resource that is not declared;
 *   * a field module missing the attributes Forge requires (key, name, type,
 *     readOnly) or a duplicate module key;
 *   * an entity whose attributes are not a type the store accepts;
 *   * a trigger on an event Forge does not emit, or without its function;
 *   * a condition expression that does not read both app-owned fields, or whose
 *     parentheses do not balance (an expression that parses differently on the
 *     site than it does here is the defect nobody can see until a customer is
 *     refused).
 *
 * Run: node scripts/manifest-check.mjs [path/to/manifest.yml]
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const path = resolve(process.argv[2] ?? join(here, '..', 'manifest.yml'));
const manifest = readFileSync(path, 'utf8');

const problems = [];
const checks = [];
const ok = (name) => checks.push(`ok   ${name}`);
const fail = (name, detail) => problems.push(`${name}: ${detail}`);

/**
 * A key's block: from its line to the next line indented no deeper. Works for
 * both top-level sections (`app:`) and module keys nested under `modules:`.
 */
function block(key) {
  const lines = manifest.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^\\s*${key}:\\s*$`).test(l));
  if (start === -1) return null;
  const indent = (lines[start].match(/^\s*/) ?? [''])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const lead = (lines[i].match(/^\s*/) ?? [''])[0].length;
    if (/\S/.test(lines[i]) && lead <= indent) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

/* --------------------------------------------------------------- structure */

for (const key of ['app', 'modules', 'function', 'resources', 'permissions']) {
  if (!block(key)) fail('top-level key', `missing "${key}:"`);
}
if (!problems.length) ok('top-level keys present: app, modules, function, resources, permissions');

const appId = manifest.match(/^\s+id:\s*(ari:cloud:ecosystem::app\/[\w-]+)\s*$/m)?.[1];
if (!appId) fail('app id', 'no app id declared');
else if (!/app\/0{8}-0{4}-0{4}-0{4}-0{12}$/.test(appId)) {
  // Not fatal — a registered app has a real id — but it must never be committed.
  checks.push('note app id is not the placeholder; make sure this is a local build, not a commit');
} else ok('app id is the placeholder (register it locally before deploying)');

/* ------------------------------------------------------------------ fields */

const fieldBlock = block('jira:customField');
if (!fieldBlock) fail('jira:customField', 'no custom field module declared');
else {
  const modules = [...fieldBlock.matchAll(/^\s{4}- key: ([\w-]+)$/gm)].map((m) => m[1]);
  const dupes = modules.filter((k, i) => modules.indexOf(k) !== i);
  if (dupes.length) fail('jira:customField', `duplicate module keys: ${[...new Set(dupes)].join(', ')}`);
  if (modules.length !== 2) fail('jira:customField', `expected two fields (count + state), found ${modules.length}`);
  if (!modules.includes('relay-closure-count')) fail('jira:customField', 'relay-closure-count is missing');
  if (!modules.includes('relay-management-state')) fail('jira:customField', 'relay-management-state is missing');

  const readOnly = [...fieldBlock.matchAll(/readOnly:\s*true/g)].length;
  if (readOnly !== modules.length) fail('jira:customField', 'every field must be readOnly: true');
  const types = [...fieldBlock.matchAll(/^\s+type:\s*(number|string)$/gm)].map((m) => m[1]);
  if (!types.includes('number')) fail('jira:customField', 'the count field must be type: number');
  if (!types.includes('string')) fail('jira:customField', 'the state field must be type: string');
  if (!problems.some((p) => p.startsWith('jira:customField'))) ok(`jira:customField: ${modules.length} read-only fields, distinct keys, valid types`);
}

/* ---------------------------------------------------------------- entities */

const appBlock = block('app') ?? '';
const entityBlock = appBlock.slice(appBlock.indexOf('storage:'));
if (!/storage:/.test(appBlock)) fail('app.storage', 'no storage section: the record needs a Custom Entity Store entity');
else {
  const entity = entityBlock.match(/-\s*name:\s*([\w:-]+)/)?.[1];
  if (entity !== 'relay-ledger') fail('app.storage.entities', `expected entity "relay-ledger", found ${entity ?? 'none'}`);
  const attrs = [...entityBlock.matchAll(/^\s{10}([A-Za-z_][\w]*):\s*$/gm)].map((m) => m[1]);
  for (const required of ['issueKey', 'rev', 'state', 'digest', 'updatedAt', 'commitments']) {
    if (!attrs.includes(required)) fail('app.storage.entities', `attribute "${required}" is not declared (the store enforces declared types)`);
  }
  const types = [...entityBlock.matchAll(/^\s{12}type:\s*(\w+)\s*$/gm)].map((m) => m[1]);
  for (const t of types) {
    if (!['string', 'integer', 'float', 'boolean', 'any'].includes(t)) fail('app.storage.entities', `unsupported attribute type "${t}"`);
  }
  if (!problems.some((p) => p.startsWith('app.storage.entities'))) ok(`entity ${entity}: ${attrs.length} attributes, all types valid`);
}

/* ---------------------------------------------------------------- functions */

const functionKeys = [...manifest.matchAll(/^\s{2}- key: ([\w-]+)\n\s{4}handler: ([\w.]+)$/gm)];
const declaredHandlers = functionKeys.map((m) => m[2]);
const referenced = [...manifest.matchAll(/^\s+function: ([\w-]+)$/gm)].map((m) => m[1]);
for (const f of referenced) {
  if (!functionKeys.some(([, key]) => key === f)) fail('modules', `references undefined function "${f}"`);
}
for (const handler of declaredHandlers) {
  const [, fnName] = handler.split('.');
  if (!['handler', 'closureValidator', 'onIssueCreated'].includes(fnName)) {
    fail('function handler', `"${handler}" is not an export of src/index.js`);
  }
}
if (!problems.some((p) => p.startsWith('modules') || p.startsWith('function'))) {
  ok(`${referenced.length} module references resolve to ${functionKeys.length} declared functions`);
}

/* ----------------------------------------------------------------- trigger */

const triggerBlock = block('trigger') ?? block('modules')?.slice(block('modules').indexOf('trigger:')) ?? '';
if (!/trigger:/.test(manifest)) fail('trigger', 'no trigger module: new issues would have no record');
else {
  if (!/avi:jira:created:issue/.test(manifest)) fail('trigger', 'expected the avi:jira:created:issue event');
  if (!/relay-trigger/.test(manifest)) fail('trigger', 'no function declared for the trigger');
  else ok('trigger: avi:jira:created:issue → relay-trigger');
}

/* --------------------------------------------------------------- condition */

const conditionBlock = block('jira:workflowCondition') ?? '';
const expression = conditionBlock.match(/expression:\s*'([^']+)'/)?.[1] ?? conditionBlock.match(/expression:\s*"([^"]+)"/)?.[1];
if (!expression) fail('jira:workflowCondition', 'no expression');
else {
  const open = (expression.match(/\(/g) ?? []).length;
  const close = (expression.match(/\)/g) ?? []).length;
  if (open !== close) fail('condition expression', `unbalanced parentheses (${open} open, ${close} close)`);
  if (!/==\s*"unmanaged"/.test(expression)) fail('condition expression', 'does not permit an explicitly unmanaged issue');
  if (!/==\s*"managed"/.test(expression)) fail('condition expression', 'does not require an explicitly managed issue');
  if (!/==\s*0/.test(expression)) fail('condition expression', 'does not require the count to be exactly zero');
  if (/!=\s*"unmanaged"/.test(expression)) fail('condition expression', 'must not treat "not unmanaged" as permission');
  const refs = [...expression.matchAll(/issue\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  const unique = [...new Set(refs)];
  if (unique.length !== 2) fail('condition expression', `expected exactly two field references, found ${unique.length}: ${unique.join(', ')}`);
  for (const ref of unique) {
    if (!/^customfield_\d+$/.test(ref) && !/^customfield_relay_(closure_count|management_state)$/.test(ref)) {
      fail('condition expression', `"${ref}" is neither a resolved custom field id nor the documented placeholder`);
    }
  }
  if (!problems.some((p) => p.startsWith('condition'))) ok(`condition expression: two field references, balanced, ${open} groups`);
}

/* --------------------------------------------------------------- resources */

const resources = [...manifest.matchAll(/^\s{2}- key: ([\w-]+)\n\s{4}path: (.+)$/gm)];
for (const [, key, p] of resources) {
  if (!/\S/.test(p)) fail('resources', `${key} has an empty path`);
}
const referencedResources = [...manifest.matchAll(/^\s+resource: ([\w-]+)$/gm)].map((m) => m[1]);
for (const r of referencedResources) {
  if (!resources.some(([, key]) => key === r)) fail('resources', `module references undefined resource "${r}"`);
}
if (!problems.some((p) => p.startsWith('resources'))) ok(`resources: ${resources.length} declared, all references resolve`);

/* ------------------------------------------------------------------ report */

for (const line of checks) console.log(line);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('\nmanifest.yml is structurally valid for Relay. Run `forge lint` for the authoritative check.');
