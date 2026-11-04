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
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createHandlers } from '../src/handlers.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const read = (rel) => readFileSync(join(appDir, rel), 'utf8');

const manifest = read('manifest.yml');
const resolversSrc = read('src/resolvers.js');
const indexSrc = read('src/index.js');
const apiSrc = read('ui/src/lib/api.ts');

const handlerNames = Object.keys(createHandlers({ jira: {}, storage: {}, now: () => new Date(), log: () => {} }));

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
  for (const needed of ['storage:app', 'read:jira-work', 'write:jira-work', 'read:jira-user']) {
    assert.ok(scopes.includes(needed), `manifest is missing scope ${needed}`);
  }
});

test('the app id in the manifest is still a placeholder', () => {
  const id = manifest.match(/^\s+id: (ari:cloud:ecosystem::app\/[\w-]+)$/m)?.[1];
  assert.ok(id, 'manifest must declare an app id (register the app to get one)');
  assert.match(
    id,
    /app\/0{8}-0{4}-0{4}-0{4}-0{12}$/,
    'a real app id must never be committed: register locally and keep the id out of git',
  );
});

test('the workflow condition reads a custom field, not an entity property', () => {
  const expression = manifest.match(/expression: "([^"]+)"/)?.[1];
  assert.ok(expression, 'the condition needs an expression');
  // Jira expressions expose custom fields as issue.customfield_NNNNN; app
  // entity properties are not part of the expression context.
  assert.match(expression, /^issue\.customfield_\d+ == 0$/);
  assert.ok(!/properties\[/.test(expression), 'Jira expressions cannot read entity properties');
});

test('the condition field id is site-specific and documented as such', () => {
  assert.match(manifest, /replace customfield_\d+/, 'the manifest must say the field id is replaced at deploy time');
  assert.match(read('ui/src/lib/api.ts'), /openFieldId/);
});
