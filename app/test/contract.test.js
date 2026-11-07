/**
 * Contract tests: the manifest, the resolver surface and the console must agree.
 *
 * These are cheap and they catch the class of defect that only shows up after a
 * deploy — a screen calling a resolver name nobody defines, a module pointing at
 * a function key that does not exist, a scope that was never declared. Forge
 * lint would be the better tool, but it cannot run in this environment (it
 * contacts Atlassian), so this is the local floor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createHandlers } from '../src/handlers.js';
import {
  CLOSURE_FIELD_MODULE_KEY, CLOSURE_FIELD_PLACEHOLDER, STATE_FIELD_MODULE_KEY, STATE_FIELD_PLACEHOLDER,
} from '../src/field.js';
import { createMemoryRecords } from './support/fake-forge.js';
import { RECORD_ATTRIBUTES } from '../src/record-codec.js';
import { createJira } from '../src/jira.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');

/**
 * Text reads are normalised to LF. A Windows checkout with `core.autocrlf=true`
 * hands these tests CRLF, and every assertion here is about content, not about
 * which newline the checkout uses — the first version of this file failed on
 * Windows for exactly that reason and said nothing about the manifest.
 */
const read = (rel) => readFileSync(join(appDir, rel), 'utf8').replace(/\r\n/g, '\n');

const manifest = read('manifest.yml');
const resolversSrc = read('src/resolvers.js');
const indexSrc = read('src/index.js');
const apiSrc = read('ui/src/lib/api.ts');

const handlerNames = Object.keys(createHandlers({
  jira: {}, storage: {}, records: createMemoryRecords(), now: () => new Date(), log: () => {},
}));

/** Names the console asks for, read straight out of the single data seam. */
const invocations = [...apiSrc.matchAll(/invokeRemote\(\s*'([^']+)'/g)].map((m) => m[1]);

/** Names defined explicitly in resolvers.js (aliases), plus the handler map. */
const explicitDefines = [...resolversSrc.matchAll(/resolver\.define\(\s*'([^']+)'/g)].map((m) => m[1]);
const definesHandlerMap = /Object\.entries\(handlers\)/.test(resolversSrc);

test('every resolver the console invokes is defined on the Forge side', () => {
  assert.ok(invocations.length >= 10, `expected the console to use the resolver surface, found ${invocations.length} calls`);
  const missing = invocations.filter((name) => !handlerNames.includes(name) && !explicitDefines.includes(name));
  assert.deepEqual(missing, [], `console calls resolvers nothing defines: ${missing.join(', ')}`);
});

test('every handler is reachable from the Forge binding', () => {
  assert.ok(definesHandlerMap, 'resolvers.js must loop the handler map into resolver.define');
  const unreachable = handlerNames.filter((name) => !apiSrc.includes(`'${name}'`) && name !== 'relay.enforcement.check');
  // Not an error to have a resolver the console does not use yet, but each one
  // should be deliberate. This asserts the loop exists rather than forbidding
  // extras; the interesting direction is the test above.
  assert.ok(handlerNames.length >= 14, `expected the full resolver surface, found ${handlerNames.length}`);
  assert.ok(unreachable.length < handlerNames.length, 'the loop covers every handler');
});

test('every module points at a declared function and resource', () => {
  const functionKeys = [...manifest.matchAll(/^\s+- key: ([\w-]+)\n\s+handler: /gm)].map((m) => m[1]);
  const resourceKeys = [...manifest.matchAll(/^\s+- key: ([\w-]+)\n\s+path: /gm)].map((m) => m[1]);

  const referencedFunctions = [...manifest.matchAll(/^\s+function: ([\w-]+)$/gm)].map((m) => m[1]);
  assert.ok(referencedFunctions.length >= 2, 'expected validator and resolver functions to be referenced');
  for (const key of referencedFunctions) {
    assert.ok(functionKeys.includes(key), `module references undefined function ${key}`);
  }

  const referencedResources = [...manifest.matchAll(/^\s+resource: ([\w-]+)$/gm)].map((m) => m[1]);
  assert.ok(referencedResources.length >= 1);
  for (const key of referencedResources) {
    assert.ok(resourceKeys.includes(key), `module references undefined resource ${key}`);
  }
});

test('the resource path matches where the UI build writes', () => {
  const resourcePath = manifest.match(/^\s+path: (.+)$/m)?.[1];
  const viteOut = read('ui/vite.config.ts').match(/outDir:\s*'([^']+)'/)?.[1];
  assert.ok(resourcePath && viteOut, 'both the manifest resource path and the Vite outDir must be declared');
  // Vite writes relative to app/ui, the manifest reads relative to app/.
  assert.equal(viteOut.replace('..\/', ''), resourcePath);
  // The bundle itself is gitignored on purpose; deploying without building is
  // the failure mode this check exists to make obvious.
  if (!existsSync(join(appDir, 'static/relay/index.html'))) {
    assert.match(read('package.json'), /ui run build/, 'the deploy script must build the UI first');
  }
});

test('declared scopes cover every Jira call the code makes', () => {
  const scopes = [...manifest.matchAll(/^\s+- ([\w:-]+)$/gm)].map((m) => m[1]);
  for (const needed of ['storage:app', 'read:jira-work', 'write:jira-work', 'read:jira-user', 'write:app-data:jira']) {
    assert.ok(scopes.includes(needed), `manifest is missing scope ${needed}`);
  }
});

test('the registered app id is local, not committed', () => {
  const idPattern = /^ari:cloud:ecosystem::app\/[\w-]+$/;
  const localId = manifest.match(/^\s+id: (ari:cloud:ecosystem::app\/[\w-]+)$/m)?.[1];

  assert.ok(localId, 'manifest must declare an app id');
  assert.match(localId, idPattern, 'local manifest must contain a valid app id');

  const committedManifest = execFileSync('git', ['show', 'HEAD:app/manifest.yml'], {
    cwd: appDir,
    encoding: 'utf8',
  });
  const committedId = committedManifest.match(/^\s+id: (ari:cloud:ecosystem::app\/[\w-]+)$/m)?.[1];

  assert.ok(committedId, 'committed manifest must declare an app id');
  assert.match(
    committedId,
    /app\/0{8}-0{4}-0{4}-0{4}-0{12}$/,
    'the registered app id must remain local and must not be committed',
  );
});

test('the app declares its own two read-only fields, and the state field is the one that says "unmanaged"', () => {
  assert.match(manifest, /^\s+jira:customField:$/m, 'the fields must be declared as jira:customField modules');
  const block = manifest.slice(manifest.indexOf('jira:customField:'), manifest.indexOf('jira:globalPage:'));
  assert.match(block, new RegExp(`\\s+- key: ${CLOSURE_FIELD_MODULE_KEY}\\n`), 'the count module key is a field identity');
  assert.match(block, new RegExp(`\\s+- key: ${STATE_FIELD_MODULE_KEY}\\n`), 'the state module key is a field identity');
  assert.match(block, /\n\s+type: number\n/);
  assert.match(block, /\n\s+type: string\n/);
  const readOnly = block.match(/readOnly: true/g) ?? [];
  assert.equal(readOnly.length, 2, 'users and the Edit Issue API must not be able to write either field');
  assert.match(block, /Read-only|read-only/, 'the description must say the fields are Relay’s and read-only');

  // Forge requires a resolver on every jira:customField module — a field
  // declared without one is rejected at deploy, and the field never exists.
  const fieldModules = block.split(/\n    - key: /).slice(1);
  assert.equal(fieldModules.length, 2, 'expected exactly two field modules');
  for (const mod of fieldModules) {
    assert.match(mod, /^ {6}resolver:\n {8}function: relay-resolver$/m,
      'every custom field needs the resolver, or Forge refuses the module');
  }
  assert.match(manifest, /- key: relay-resolver\n\s+handler: index\.handler/, 'that resolver key must be a declared function');
});

test('every description is a quoted scalar, so a colon inside it cannot break the YAML', () => {
  const bare = manifest
    .split('\n')
    .map((line, i) => [line, i + 1])
    .filter(([line]) => /^\s+(description|title|name): (?!["'])/.test(line) && /: /.test(line.replace(/^\s+[\w]+: /, '')));
  assert.deepEqual(bare.map(([, n]) => n), [], 'unquoted ": " in a scalar: quote the whole value (see line numbers)');
});

test('the condition expression needs both fields and never treats a missing one as unmanaged', () => {
  const expression = manifest.match(/expression: '([^']+)'/)?.[1]?.replace(/\s+/g, ' ').trim();
  assert.ok(expression, 'the condition needs an expression');
  assert.equal(
    `customfield_${CLOSURE_FIELD_MODULE_KEY.replace(/-/g, '_')}`,
    CLOSURE_FIELD_PLACEHOLDER,
    'the count placeholder is derived from its module key',
  );
  assert.equal(
    `customfield_${STATE_FIELD_MODULE_KEY.replace(/-/g, '_')}`,
    STATE_FIELD_PLACEHOLDER,
    'the state placeholder is derived from its module key',
  );
  // Either the placeholders (before the app resolves the ids) or real ids.
  // Never a field somebody created by hand: that is what P2.1 removed.
  const state = '(issue\\.(customfield_\\d+|customfield_relay_management_state))';
  const count = '(issue\\.(customfield_\\d+|customfield_relay_closure_count))';
  assert.match(expression, new RegExp(`^\\(${state} == "unmanaged"\\) \\|\\| \\(${state} == "managed" && ${count} == 0\\)$`));
  assert.ok(!/properties\[/.test(expression), 'the condition reads fields, not an entity property');
  assert.match(manifest, /relay\.field\.resolve/, 'the manifest must say how the ids are obtained');
});

test('the record entity is declared, with the revision the conditional commit checks', () => {
  assert.match(manifest, /^\s+storage:$/m, 'the manifest must declare app storage');
  const block = manifest.slice(manifest.indexOf('storage:'), manifest.indexOf('modules:'));
  assert.match(block, /- name: relay-ledger/);
  assert.match(block, /rev:\n\s+type: integer/, 'the revision is an integer attribute: transactions condition on it');
  assert.match(block, /state:\n\s+type: string/);
  assert.match(block, /commitments:\n\s+type: any/);
});

test('every attribute the record codec writes is declared on the entity, with the same type', () => {
  const block = manifest.slice(manifest.indexOf('storage:'), manifest.indexOf('modules:'));
  const declared = Object.fromEntries(
    [...block.matchAll(/^ {10}([A-Za-z_][\w]*):\n {12}type: (\w+)$/gm)].map((m) => [m[1], m[2]]),
  );

  for (const [attribute, type] of Object.entries(RECORD_ATTRIBUTES)) {
    assert.equal(
      declared[attribute],
      type,
      `relay-ledger must declare ${attribute}: ${type}. An attribute the code writes but the entity does not declare is a 422 at runtime.`,
    );
  }
  const unused = Object.keys(declared).filter((attribute) => !(attribute in RECORD_ATTRIBUTES));
  assert.deepEqual(unused, [], 'a declared attribute nothing writes is dead weight (and cannot be removed once deployed)');
});

test('commits are conditional and creates are create-only', () => {
  const src = read('src/forge-store.js');
  assert.match(src, /kvs\.transact\(\)/, 'writes go through a transaction');
  assert.match(src, /FilterConditions\.equalTo\(expectedRev\)/, 'the transaction conditions on the revision it was derived from');
  assert.match(src, /keyPolicy: 'FAIL_IF_EXISTS'/, 'create must not overwrite an existing record');
  assert.match(src, /beginsWith/, 'the audit trail is read by prefix, paginated');
  assert.ok(!/import \{[^}]*\bstorage\b[^}]*\} from '@forge\/kvs'/.test(read('src/deps.js')), '@forge/kvs exports kvs, not storage');
});

test('the created trigger records new issues and points at a declared function', () => {
  assert.match(manifest, /^\s+trigger:$/m, 'the trigger module is how new issues get a record');
  assert.match(manifest, /avi:jira:created:issue/);
  assert.match(manifest, /relay-trigger/);
  assert.match(indexSrc, /onIssueCreated/, 'the function the trigger names must be exported');
  assert.match(indexSrc, /relay\.state\.init/, 'and it runs the same handler the backfill uses');
});

test('the issue panel has the icon Forge requires, and it ships inside the resource', () => {
  const panel = manifest.slice(manifest.indexOf('jira:issuePanel:'), manifest.indexOf('jira:workflowValidator:'));
  const icon = panel.match(/\n      icon: (\S+)\n/)?.[1];
  assert.ok(icon, 'jira:issuePanel requires an icon; without one the module is invalid');
  if (!/^https?:\/\//.test(icon)) {
    // A relative icon is resolved inside the declared resource, so it has to be
    // in the source that vite copies (ui/public) *and* in the build.
    assert.ok(existsSync(join(appDir, 'ui/public', icon)), `ui/public/${icon} must exist: vite copies it into the resource`);
    if (existsSync(join(appDir, 'static/relay'))) {
      assert.ok(existsSync(join(appDir, 'static/relay', icon)), `${icon} is missing from the built resource`);
    }
  }
});

test('the field is written through the private app-field API and never through Edit Issue', () => {
  const api = createJira({
    requestJira: async () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }),
    route: (strings, ...values) => strings.reduce((acc, part, i) => acc + part + (values[i] ?? ''), ''),
  });
  assert.equal(typeof api.writeAppFieldValue, 'function');
  assert.equal('writeField' in api, false, 'the Edit Issue write path must not exist');
  const src = read('src/jira.js');
  assert.match(src, /\/rest\/api\/3\/app\/field\/\$\{fieldIdOrKey\}\/value/);
  assert.match(src, /'PUT'|method: 'PUT'/);
});
