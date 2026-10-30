#!/usr/bin/env node
/**
 * Validates manifest.yml against the JSON Schema shipped in @forge/manifest.
 *
 * `forge lint` will not run without an Atlassian login (it validates scopes
 * against the account's registry). This script performs the part of lint that
 * is purely structural and needs no account: draft-07 schema conformance of the
 * manifest document itself.
 *
 * Requires two dev dependencies that are not vendored here:
 *   npm i --no-save ajv@8 js-yaml@4
 *
 * The schema is read from the @forge/manifest package that @forge/cli depends
 * on, so it always matches the CLI in use:
 *   /usr/local/lib/node_modules/@forge/cli/node_modules/@forge/manifest/out/schema/manifest-schema.json
 *
 * Usage:
 *   node phase0/harness/validate-manifest.mjs [schemaPath] [manifestPath]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Ajv = require('ajv');
const yaml = require('js-yaml');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const schemaPath = resolve(process.argv[2] ?? '/usr/local/lib/node_modules/@forge/cli/node_modules/@forge/manifest/out/schema/manifest-schema.json');
const manifestPath = resolve(process.argv[3] ?? join(ROOT, 'validator-probe/manifest.yml'));

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const manifest = yaml.load(readFileSync(manifestPath, 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
const validate = ajv.compile(schema);
const ok = validate(manifest);

const report = {
  schemaPath,
  schemaTitle: schema.title ?? null,
  manifestPath,
  valid: ok,
  errors: (validate.errors ?? []).map((e) => ({
    instancePath: e.instancePath,
    keyword: e.keyword,
    message: e.message,
    params: e.params,
  })),
  modulesDeclared: Object.keys(manifest.modules ?? {}),
  summary: ok
    ? 'manifest conforms to the @forge/manifest JSON Schema'
    : `${(validate.errors ?? []).length} schema violation(s)`,
};

mkdirSync(join(HERE, 'results'), { recursive: true });
writeFileSync(join(HERE, 'results/manifest-validation.json'), JSON.stringify(report, null, 2));

console.log(report.summary);
for (const e of report.errors) console.log(`  ${e.instancePath || '(root)'} ${e.keyword}: ${e.message}`);
console.log(`modules: ${report.modulesDeclared.join(', ')}`);
process.exitCode = ok ? 0 : 1;
