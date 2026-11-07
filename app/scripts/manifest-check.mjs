#!/usr/bin/env node
/**
 * Manifest gate: parse the YAML, then check it against the manifest rules Relay
 * actually depends on.
 *
 * `forge lint` is the authoritative gate, and it needs a Forge login and network
 * access to Atlassian. This script is the part of that gate that runs anywhere —
 * Windows, CI, no Atlassian account — and it exists because the cheaper checks
 * that came before it passed a manifest that Forge would have rejected:
 *
 *   * an unquoted `: ` inside a description is not YAML. The old check scanned
 *     text line by line and never parsed the file, so it could not notice.
 *   * a `jira:customField` without a `resolver` is rejected by Forge (the
 *     manifest reference marks it required and the JSON schema accepts it; the
 *     platform will not create the field without one). The old check never
 *     looked at the module's attributes one by one.
 *
 * So this version parses with a real YAML parser (`yaml`, a dev dependency) and
 * then validates the parsed document. It deliberately does not regex the text:
 * anything that depends on how a line is spelled is decided by the parser, and
 * everything else is decided by the parsed values.
 *
 * Scope, in order: YAML syntax → required sections → module shape (per module
 * type) → function/resource references and whether the referenced handler is
 * really exported → the entity declaration the store writes to → the closure
 * condition's semantics → the schema Forge itself ships (`@forge/manifest`, the
 * library `forge lint` validates with), which catches everything the rules
 * above only approximate: unknown properties, wrong enums, a handler with no
 * file behind it, a resource path that is not there.
 *
 * Run: node scripts/manifest-check.mjs [path/to/manifest.yml]
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';
import { validate as validateManifest } from '@forge/manifest';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const manifestPath = resolve(process.argv[2] ?? join(appRoot, 'manifest.yml'));
// Handler files, resources and the icon are all resolved from the manifest's
// own directory, so checking a copy reports that copy's problems.
const appDir = dirname(manifestPath);

const checks = [];
const problems = [];
const notes = [];
const ok = (name) => checks.push(name);
const fail = (name, detail) => problems.push(`${name}: ${detail}`);
const note = (line) => notes.push(line);

/* --------------------------------------------------------------- 1. parse it */

const text = readFileSync(manifestPath, 'utf8');

if (text.charCodeAt(0) === 0xfeff) {
  // A BOM is legal for a reader, not for a deploy: Forge reads the file as-is.
  fail('yaml', 'the file starts with a UTF-8 BOM; save it as UTF-8 without a BOM');
}

// `uniqueKeys` is on by default and is what catches a duplicated `key:` block;
// it is named here so the behaviour is not accidental.
const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false, strict: true });

if (doc.errors.length) {
  for (const err of doc.errors) {
    fail('yaml', `${err.message}${err.linePos ? ` (line ${err.linePos[0].line + 1}, column ${err.linePos[0].col + 1})` : ''}`);
  }
} else {
  ok(`yaml parses (${text.split(/\r?\n/).length} lines, ${text.includes('\r\n') ? 'CRLF' : 'LF'} line endings)`);
}

// Nothing downstream is worth reading if the file is not YAML: a parser error
// usually means the *shape* is wrong (an unquoted colon turns one scalar into a
// nested mapping), so the module checks below would report the wreckage rather
// than the cause.
if (doc.errors.length) {
  for (const line of checks) console.log(`ok   ${line}`);
  console.error(`\n✗ ${problems.length} problem(s) in ${manifestPath}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const manifest = doc.toJS() ?? {};
if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
  console.error(`\n✗ ${manifestPath}\n  - yaml: the document is not a mapping`);
  process.exit(1);
}

/* ------------------------------------------------------------- 2. sections */

for (const key of ['app', 'modules', 'resources', 'permissions']) {
  if (!(key in manifest)) fail('structure', `missing top-level "${key}"`);
}
if ('function' in manifest) {
  fail('structure', '"function" is declared at the top level; the manifest schema allows it only under "modules.function"');
}
if (!problems.some((p) => p.startsWith('structure'))) ok('sections present: app, modules, resources, permissions');

const app = manifest.app ?? {};
if (typeof app.id !== 'string' || !/^ari:cloud:ecosystem::app\/[0-9a-f-]{36}$/i.test(app.id)) {
  fail('app.id', 'not an app ARI (ari:cloud:ecosystem::app/<uuid>)');
} else if (/app\/0{8}-0{4}-0{4}-0{4}-0{12}$/.test(app.id)) {
  ok('app.id is the placeholder (register the app locally before deploying)');
} else {
  note('app.id is a registered id — make sure a local build is not committed with it');
  ok('app.id is a registered app id');
}
if (app.runtime?.name !== 'nodejs22.x') fail('app.runtime', `expected nodejs22.x, found ${String(app.runtime?.name)}`);

for (const section of Object.keys(app)) {
  const known = ['id', 'runtime', 'storage', 'connect', 'licensing', 'compatibility', 'permissions', 'remotes'];
  if (!known.includes(section)) fail('app', `unexpected property "${section}"`);
}

/* --------------------------------------------------------------- 3. modules */

const MODULE_RULES = {
  'jira:customField': {
    required: ['key', 'name', 'description', 'type'],
    allowed: ['key', 'name', 'description', 'type', 'collection', 'validation', 'readOnly', 'resolver',
      'view', 'edit', 'value', 'searchSuggestions', 'function', 'resource', 'parser',
      'migratedFromConnect', 'connectFieldProperty', 'displayConditions', 'isUIModificationsEnabled'],
  },
  'jira:globalPage': {
    required: ['key', 'title'],
    allowed: ['key', 'title', 'resource', 'resolvedResourceEntry', 'resourceUploadId', 'resolver', 'layout',
      'render', 'renderRuntimeType', 'icon', 'pages', 'sections', 'displayConditions', 'function'],
  },
  'jira:issuePanel': {
    required: ['key', 'title', 'icon'],
    allowed: ['key', 'title', 'icon', 'resource', 'resolvedResourceEntry', 'resolver', 'resourceUploadId',
      'viewportSize', 'render', 'renderRuntimeType', 'displayConditions', 'allowMultiple', 'config', 'function'],
  },
  'jira:workflowValidator': {
    required: ['key', 'name', 'description'],
    allowed: ['key', 'name', 'description', 'function', 'expression', 'errorMessage', 'resolver', 'view',
      'edit', 'create', 'projectTypes'],
  },
  'jira:workflowCondition': {
    required: ['key', 'name', 'description', 'expression'],
    allowed: ['key', 'name', 'description', 'expression', 'resolver', 'view', 'edit', 'create', 'projectTypes',
      'evaluateAgainstOriginalIssue'],
  },
  trigger: {
    required: ['key', 'function', 'events'],
    allowed: ['key', 'events', 'function', 'filter', 'payload'],
  },
  function: {
    required: ['key', 'handler'],
    allowed: ['key', 'handler', 'providers', 'timeoutSeconds', 'runtime'],
  },
};

const FIELD_TYPES = ['string', 'number', 'user', 'group', 'date', 'datetime', 'object'];
const PROJECT_TYPES = ['company-managed', 'team-managed'];
const modules = manifest.modules ?? {};
if (!modules || typeof modules !== 'object' || Array.isArray(modules)) {
  fail('modules', 'not a mapping of module type → list');
}

const moduleKeys = new Map(); // key → `${type}[${index}]`

for (const [type, list] of Object.entries(modules)) {
  if (!(type in MODULE_RULES)) {
    fail('modules', `unknown module type "${type}" (a typo here is a module that silently never loads)`);
    continue;
  }
  if (!Array.isArray(list) || list.length === 0) {
    fail(`modules.${type}`, 'must be a non-empty list');
    continue;
  }
  const rule = MODULE_RULES[type];

  list.forEach((mod, index) => {
    const at = `${type}[${index}]${mod?.key ? ` ${mod.key}` : ''}`;

    if (!mod || typeof mod !== 'object' || Array.isArray(mod)) {
      fail(at, 'not a mapping');
      return;
    }
    for (const prop of rule.required) {
      if (mod[prop] === undefined) fail(at, `missing required "${prop}"`);
    }
    for (const prop of Object.keys(mod)) {
      if (!rule.allowed.includes(prop)) fail(at, `unexpected property "${prop}"`);
    }
    if (mod.key !== undefined) {
      if (typeof mod.key !== 'string' || !/^[A-Za-z0-9_-]+$/.test(mod.key)) fail(at, 'key must match ^[A-Za-z0-9_-]+$');
      else if (moduleKeys.has(mod.key)) fail(at, `duplicate module key (also ${moduleKeys.get(mod.key)})`);
      else moduleKeys.set(mod.key, `${type}[${index}]`);
    }
    if (mod.title !== undefined && typeof mod.title !== 'string') fail(at, 'title must be a string');
    if (mod.name !== undefined && typeof mod.name !== 'string') fail(at, 'name must be a string');
    if (mod.icon !== undefined && (typeof mod.icon !== 'string' || !mod.icon)) fail(at, 'icon must be a non-empty string');

    if (type === 'jira:customField') {
      if (!FIELD_TYPES.includes(mod.type)) fail(at, `type "${String(mod.type)}" is not one Forge stores`);
      if (typeof mod.description !== 'string' || mod.description.length > 1000) {
        fail(at, 'description must be a string of at most 1000 characters');
      }
      if (typeof mod.readOnly !== 'boolean') {
        fail(at, 'readOnly must be an explicit boolean — Relay writes these fields and users must not');
      }
      // Required by the manifest reference, and the platform refuses the module
      // without it. Named here, once, so a future edit cannot drop it.
      const resolver = mod.resolver;
      if (!resolver || typeof resolver !== 'object') {
        fail(at, 'missing "resolver" (Forge requires it on jira:customField, even for a read-only field)');
      } else {
        const keys = Object.keys(resolver);
        if (keys.length !== 1 || !['function', 'endpoint'].includes(keys[0])) {
          fail(at, 'resolver must be exactly one of { function } or { endpoint }');
        }
        if (keys[0] === 'function' && typeof resolver.function !== 'string') fail(at, 'resolver.function must be a string');
      }
      // A read-only field with a custom view or edit is a different product: it
      // would need a UI Kit resource and a value function, and Relay would be
      // rendering a value it does not compute.
      for (const surface of ['view', 'edit', 'value', 'function', 'resource']) {
        if (surface in mod) fail(at, `"${surface}" is not used: these fields are readOnly and render natively`);
      }
    }

    if (type === 'jira:workflowValidator' || type === 'jira:workflowCondition') {
      if (typeof mod.description !== 'string' || !mod.description) fail(at, 'description must be a non-empty string');
      if (mod.projectTypes !== undefined) {
        if (!Array.isArray(mod.projectTypes) || !mod.projectTypes.length) fail(at, 'projectTypes must be a non-empty list');
        else for (const p of mod.projectTypes) if (!PROJECT_TYPES.includes(p)) fail(at, `projectTypes "${p}" is not a Jira project type`);
      }
    }

    if (type === 'trigger') {
      if (!Array.isArray(mod.events) || !mod.events.length) fail(at, 'events must be a non-empty list');
      else for (const e of mod.events) if (typeof e !== 'string' || !/^[a-z0-9]+(:[a-z0-9-]+)+$/.test(e)) fail(at, `event "${String(e)}" is not a Forge event name`);
      if ('endpoint' in mod) fail(at, 'endpoint (Forge Remote) is not used; the trigger is a hosted function');
    }
  });

  ok(`modules.${type}: ${list.length} module${list.length === 1 ? '' : 's'}, shape checked`);
}

/* ------------------------------------ 4. functions, handlers and resources */

// Functions are modules (`modules.function`), not a top-level section: the
// schema's root has additionalProperties:false and no "function" key, so the
// old top-level block is a manifest Forge will not accept.
const functions = manifest.modules?.function;
if (!Array.isArray(functions) || !functions.length) fail('function', 'no "modules.function" entries declared');

const functionKeys = new Set();
for (const [index, fn] of (Array.isArray(functions) ? functions : []).entries()) {
  const at = `function[${index}]${fn?.key ? ` ${fn.key}` : ''}`;
  if (!fn || typeof fn !== 'object') { fail(at, 'not a mapping'); continue; }
  if (typeof fn.key !== 'string' || !/^[A-Za-z0-9_-]+$/.test(fn.key)) fail(at, 'key must match ^[A-Za-z0-9_-]+$');
  else if (functionKeys.has(fn.key)) fail(at, 'duplicate function key');
  else functionKeys.add(fn.key);
  if (typeof fn.handler !== 'string' || !/^[\w-]+\.[A-Za-z_$][\w$]*$/.test(fn.handler)) fail(at, 'handler must be "<module>.<export>"');
}

// Exports of the handler module, read from source rather than hardcoded: the
// point of the check is that the manifest and the code agree.
const exportCache = new Map();
function exportsOf(moduleName) {
  const file = join(appDir, 'src', `${moduleName}.js`);
  if (!existsSync(file)) return null;
  if (exportCache.has(file)) return exportCache.get(file);
  const src = readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  for (const m of src.matchAll(/^export\s+\*\s+from\s+'\.\/([\w.-]+)\.js'/gm)) {
    for (const name of exportsOf(m[1]) ?? []) names.add(name);
  }
  exportCache.set(file, names);
  return names;
}

const declaredHandlers = (Array.isArray(functions) ? functions : []).filter((f) => typeof f?.handler === 'string');
for (const fn of declaredHandlers) {
  const [moduleName, exportName] = fn.handler.split('.');
  const exported = exportsOf(moduleName);
  if (!exported) fail(`function ${fn.key}`, `handler module src/${moduleName}.js does not exist`);
  else if (!exported.has(exportName)) fail(`function ${fn.key}`, `src/${moduleName}.js does not export "${exportName}"`);
}

const usages = [];
function recordFunctionUsage(mod, prop, at) {
  if (mod?.[prop] === undefined) return;
  const key = mod[prop];
  usages.push({ key, at, prop });
  if (typeof key !== 'string') fail(at, `${prop} must be a string`);
  else if (!functionKeys.has(key)) fail(at, `${prop} references undeclared function "${key}"`);
}

const resources = manifest.resources;
const resourceKeys = new Map();
if (!Array.isArray(resources) || !resources.length) fail('resources', 'no resources declared');
for (const [index, res] of (Array.isArray(resources) ? resources : []).entries()) {
  const at = `resources[${index}]${res?.key ? ` ${res.key}` : ''}`;
  if (!res || typeof res !== 'object') { fail(at, 'not a mapping'); continue; }
  for (const prop of Object.keys(res)) if (!['key', 'path', 'tunnel'].includes(prop)) fail(at, `unexpected property "${prop}"`);
  if (typeof res.key !== 'string' || !/^[A-Za-z0-9_-]+$/.test(res.key)) fail(at, 'key must match ^[A-Za-z0-9_-]+$');
  else if (resourceKeys.has(res.key)) fail(at, 'duplicate resource key');
  else resourceKeys.set(res.key, res.path);
  if (typeof res.path !== 'string' || !/^\w[\w./-]*$/.test(res.path) || res.path.includes('..')) {
    fail(at, 'path must be a relative path inside the app directory');
  }
}

const referencedResources = [];
for (const [type, list] of Object.entries(modules ?? {})) {
  if (!Array.isArray(list)) continue;
  list.forEach((mod, index) => {
    const at = `${type}[${index}]${mod?.key ? ` ${mod.key}` : ''}`;
    recordFunctionUsage(mod, 'function', at);
    if (mod?.resolver) recordFunctionUsage(mod.resolver, 'function', `${at} resolver`);
    if (mod?.resolver && 'endpoint' in mod.resolver) {
      fail(at, 'resolver.endpoint is Forge Remote; Relay resolves through a hosted function');
    }
    if (mod?.resource !== undefined) {
      referencedResources.push({ key: mod.resource, at });
      if (typeof mod.resource !== 'string' || !resourceKeys.has(mod.resource)) {
        fail(at, `resource "${String(mod.resource)}" is not declared`);
      }
    }
    // A module that renders a resource needs a resolver: the UI calls the
    // console's resolvers by name through the bridge.
    if (mod?.resource !== undefined && mod?.resolver === undefined) {
      fail(at, 'a module with a resource needs a resolver (the console calls named resolvers)');
    }
  });
}

for (const [, path] of resourceKeys) {
  const dir = join(appDir, path);
  if (!existsSync(dir)) {
    note(`resource not built: ${path} — run "npm --prefix ui run build" before deploying (the path is where vite writes)`);
    continue;
  }
  if (!statSync(dir).isDirectory()) { fail('resources', `"${path}" is not a directory`); continue; }
  const index = join(dir, 'index.html');
  if (!existsSync(index)) { fail('resources', `"${path}" has no index.html`); continue; }
  const html = readFileSync(index, 'utf8');
  const absolute = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  if (absolute.length) fail('resources', `${path}/index.html references absolute paths (${absolute.slice(0, 3).join(', ')}); Forge serves it under a nested URL, so set vite base: './'`);
  ok(`resource ${path}: index.html present, asset paths relative`);
}

// The issue panel icon is a path inside the declared resource, so it has to
// exist in the build — vite copies ui/public into it.
const issuePanel = (modules['jira:issuePanel'] ?? []).filter((m) => m?.resource);
for (const panel of issuePanel) {
  const dir = join(appDir, resourceKeys.get(panel.resource) ?? '');
  if (typeof panel.icon === 'string' && !/^https?:\/\//.test(panel.icon) && existsSync(dir)) {
    if (!existsSync(join(dir, panel.icon))) fail('jira:issuePanel', `icon "${panel.icon}" is not in ${resourceKeys.get(panel.resource)}/`);
    else ok(`jira:issuePanel icon resolves inside the resource (${panel.icon})`);
  }
}

if (!problems.some((p) => p.startsWith('resources') || p.startsWith('function') || p.startsWith('modules'))) {
  ok(`references: ${usages.length} function uses → ${functionKeys.size} declared functions; ${referencedResources.length} resource uses → ${resourceKeys.size} declared resources`);
}

/* ------------------------------------------------- 5. entity and its store */

const entities = app.storage?.entities;
if (!Array.isArray(entities) || !entities.length) {
  fail('app.storage.entities', 'no entity declared: the record needs a Custom Entity Store entity');
} else {
  const storeFile = join(appDir, 'src', 'forge-store.js');
  const declaredName = existsSync(storeFile)
    ? readFileSync(storeFile, 'utf8').match(/RECORD_ENTITY\s*=\s*'([\w-]+)'/)?.[1]
    : undefined;
  if (!declaredName) fail('app.storage.entities', 'src/forge-store.js does not export RECORD_ENTITY');
  const ATTRIBUTE_TYPES = ['string', 'integer', 'float', 'boolean', 'any'];
  for (const [index, entity] of entities.entries()) {
    const at = `app.storage.entities[${index}]${entity?.name ? ` ${entity.name}` : ''}`;
    if (!entity || typeof entity !== 'object') { fail(at, 'not a mapping'); continue; }
    for (const prop of Object.keys(entity)) if (!['name', 'attributes', 'indexes'].includes(prop)) fail(at, `unexpected property "${prop}"`);
    if (typeof entity.name !== 'string') { fail(at, 'name must be a string'); continue; }
    if (declaredName && entity.name !== declaredName) fail(at, `the store writes to "${declaredName}"`);
    const attributes = entity.attributes ?? {};
    if (!attributes || typeof attributes !== 'object') { fail(at, 'attributes must be a mapping'); continue; }
    for (const [attr, spec] of Object.entries(attributes)) {
      if (!spec || typeof spec !== 'object') { fail(at, `attribute ${attr} must be a mapping`); continue; }
      if (!ATTRIBUTE_TYPES.includes(spec.type)) fail(at, `attribute ${attr} has type "${String(spec.type)}", which the entity store does not accept`);
    }
    // `rev` carries the conditional write and `commitments` is stored opaquely;
    // both are load-bearing, so they are required by name.
    for (const required of ['issueKey', 'rev', 'state', 'commitments']) {
      if (!(required in attributes)) fail(at, `attribute "${required}" is not declared (the store enforces declared types)`);
    }
    if (attributes.rev && attributes.rev.type !== 'integer') fail(at, 'rev must be type: integer (the conditional write compares numbers)');

    // The declaration and the writer must be the same list. `record-codec.js`
    // is what actually shapes a record for this entity, and the entity store
    // rejects (with 422) any attribute it does not declare, and any null.
    const codec = await import(pathToFileURL(join(appDir, 'src', 'record-codec.js')).href).catch(() => null);
    if (!codec) fail(at, 'src/record-codec.js could not be imported, so the attributes cannot be compared');
    else {
      for (const [attr, type] of Object.entries(codec.RECORD_ATTRIBUTES)) {
        const spec = attributes[attr];
        if (!spec) fail(at, `"${attr}" is written by record-codec.js but not declared here: the store would reject the record`);
        else if (spec.type !== type) fail(at, `"${attr}" is written as ${type} but declared as ${spec.type}`);
      }
      const unwritten = Object.keys(attributes).filter((attr) => !(attr in codec.RECORD_ATTRIBUTES));
      for (const attr of unwritten) {
        // Not a failure: a deployed attribute can never be removed. But an
        // attribute nothing writes is dead weight, and worth saying out loud.
        note(`entity attribute "${attr}" is declared but record-codec.js never writes it (deployed attributes cannot be removed)`);
      }
    }
    if (!problems.some((p) => p.startsWith('app.storage.entities'))) {
      ok(`entity ${entity.name}: ${Object.keys(attributes).length} attributes, types valid, matches record-codec.js, name matches the store`);
    }
  }
  const stray = Object.keys(app.storage ?? {}).filter((k) => k !== 'entities');
  for (const key of stray) fail('app.storage', `unexpected "${key}"; only entities are used`);
}

/* --------------------------------------------------------- 6. condition text */

const conditions = modules['jira:workflowCondition'] ?? [];
for (const [index, condition] of conditions.entries()) {
  const at = `jira:workflowCondition[${index}]${condition?.key ? ` ${condition.key}` : ''}`;
  const expression = condition?.expression;
  if (typeof expression !== 'string') { fail(at, 'expression must be a string'); continue; }

  const open = (expression.match(/\(/g) ?? []).length;
  const close = (expression.match(/\)/g) ?? []).length;
  if (open !== close) fail(at, `unbalanced parentheses (${open} open, ${close} close)`);
  if (/!=\s*"unmanaged"/.test(expression)) fail(at, 'treats "not unmanaged" as permission');
  if (/\|\|\s*(true|1)\b/.test(expression)) fail(at, 'has a constant true branch');
  if (!/==\s*"unmanaged"/.test(expression)) fail(at, 'does not permit an explicitly unmanaged issue');
  if (!/==\s*"managed"/.test(expression)) fail(at, 'does not require an explicitly managed issue');
  if (!/==\s*0\b/.test(expression)) fail(at, 'does not require the count to be exactly zero');
  if (/<=\s*0/.test(expression) || /!=\s*0/.test(expression)) fail(at, 'count comparison is not exactly zero');

  const refs = [...new Set([...expression.matchAll(/issue\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))];
  if (refs.length !== 2) fail(at, `expected exactly two field references, found ${refs.length}: ${refs.join(', ') || 'none'}`);
  for (const ref of refs) {
    if (!/^customfield_\d+$/.test(ref) && !/^customfield_relay_(closure_count|management_state)$/.test(ref)) {
      fail(at, `"${ref}" is neither a resolved custom field id nor the documented placeholder`);
    }
  }
  if (!problems.some((p) => p.startsWith('jira:workflowCondition'))) {
    ok(`condition ${condition.key}: two field references, balanced, exact "unmanaged" / "managed" + 0`);
  }
}

/* -------------------------------------------------------------- 7. scopes */

const scopes = manifest.permissions?.scopes;
if (!Array.isArray(scopes) || !scopes.length) fail('permissions.scopes', 'no scopes declared');
else {
  const KNOWN = ['storage:app', 'read:jira-work', 'write:jira-work', 'read:jira-user', 'write:app-data:jira',
    'read:app-data:jira', 'read:jira-user:application-roles'];
  for (const scope of scopes) {
    if (typeof scope !== 'string' || !/^[a-z]+:[a-z0-9:-]+$/.test(scope)) fail('permissions.scopes', `"${String(scope)}" is not a scope name`);
    else if (!KNOWN.includes(scope)) note(`scope "${scope}" is not one this app used before — confirm it exists`);
  }
  for (const required of ['storage:app', 'read:jira-work', 'write:jira-work']) {
    if (!scopes.includes(required)) fail('permissions.scopes', `"${required}" is required by the store and the field writes`);
  }
  if (!problems.some((p) => p.startsWith('permissions'))) ok(`scopes: ${scopes.length} declared`);
}

/* ------------------------------------------- 8. the schema Forge itself ships */

// `@forge/manifest` is the library the CLI lints with, so this is the same
// schema check `forge lint` runs before its own rules — offline, and without
// the login lint insists on. It also checks that every handler resolves to a
// file and every resource path exists, which the rules above approximate.
const schema = await validateManifest(false, manifestPath);
for (const error of schema.errors ?? []) {
  const where = error.line ? ` @${error.line}:${error.column}` : '';
  const message = String(error.message).split('\n')[0];
  // The most common reason a resource is "missing" is that the UI was never
  // built: say so, instead of leaving someone to guess at a path that is right.
  const hint = /missing resource '([^']+)'/.test(message) && !existsSync(join(appDir, RegExp.$1))
    ? ' (not built: run "npm --prefix ui run build")'
    : '';
  fail('forge schema', `${error.reference ?? 'invalid'}${where} — ${message}${hint}`);
}
if (!(schema.errors ?? []).length) ok('forges schema (@forge/manifest): 0 errors, 0 warnings');

/* ---------------------------------------------------------------- report */

for (const line of checks) console.log(`ok   ${line}`);
for (const line of notes) console.log(`note ${line}`);
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s) in ${manifestPath}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`\n${checks.length} checks passed: YAML parsed, structure and the Forge manifest schema validated offline.\n\`npx @forge/cli lint\` adds Forge's lint rules on top of this schema, and needs an Atlassian login.`);
