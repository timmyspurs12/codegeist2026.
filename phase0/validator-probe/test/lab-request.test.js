/**
 * Regression tests for the webtrigger request shape.
 *
 * These exist because the lab endpoint shipped with a bug that its own tests
 * could not see: the handler read `request.url`, which the Forge webtrigger
 * runtime never provides, so every live call fell through to `action=env`.
 * The old tests passed `{ url }`, which is convenient and wrong.
 *
 * The first test below uses the shape the runtime actually sends, taken from
 * developer.atlassian.com/platform/forge/events-reference/web-trigger/.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { requestUrl } from '../src/lab-request.js';

/** Exactly what Forge documents for a webtrigger invocation. */
const runtimeEvent = (queryParameters = {}) => ({
  method: 'GET',
  headers: { accept: ['*/*'] },
  body: '',
  path: '/x1/HF5_RgWL9S24E7Q3axF9PZ8Gqt8',
  userPath: '',
  queryParameters,
});

test('reads action from the real webtrigger event shape', () => {
  const url = requestUrl(runtimeEvent({ action: ['state'], key: ['FS-1'], blocking: ['2'] }));

  assert.equal(url.searchParams.get('action'), 'state');
  assert.equal(url.searchParams.get('key'), 'FS-1');
  assert.equal(url.searchParams.get('blocking'), '2');
});

test('an event with no query parameters yields no action', () => {
  const url = requestUrl(runtimeEvent());

  assert.equal(url.searchParams.get('action'), null);
  assert.equal(url.search, '');
});

test('a bogus action survives transport, so the handler can reject it', () => {
  // The live failure: ?action=bogus returned the env payload, proving the
  // parameter never arrived. It must arrive now.
  const url = requestUrl(runtimeEvent({ action: ['bogus'] }));

  assert.equal(url.searchParams.get('action'), 'bogus');
});

test('accepts a plain string value as well as an array', () => {
  const url = requestUrl(runtimeEvent({ action: 'run', count: '3' }));

  assert.equal(url.searchParams.get('action'), 'run');
  assert.equal(url.searchParams.get('count'), '3');
});

test('preserves repeated and encoded values', () => {
  const url = requestUrl(runtimeEvent({ action: ['state'], key: ['FS 1/&x'] }));

  assert.equal(url.searchParams.get('action'), 'state');
  assert.equal(url.searchParams.get('key'), 'FS 1/&x');
});

test('still accepts a synthetic url, so older callers and tests keep working', () => {
  const url = requestUrl({ url: 'https://probe.local/?action=report&runId=r1' });

  assert.equal(url.searchParams.get('action'), 'report');
  assert.equal(url.searchParams.get('runId'), 'r1');
});

test('prefers an explicit url when both shapes are present', () => {
  const url = requestUrl({
    url: 'https://probe.local/?action=env',
    queryParameters: { action: ['state'] },
  });

  assert.equal(url.searchParams.get('action'), 'env');
});

test('tolerates a null or undefined request without throwing', () => {
  assert.equal(requestUrl(undefined).searchParams.get('action'), null);
  assert.equal(requestUrl(null).searchParams.get('action'), null);
});
