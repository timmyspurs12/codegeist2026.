/**
 * Forge bindings for the console's resolvers.
 *
 * This file is deliberately thin: it chooses the Forge implementations of
 * storage, HTTP and logging (see `deps.js`), and hands them to `handlers.js`.
 * All product behaviour lives in the handlers so it can be executed in tests
 * without Forge.
 */
import Resolver from '@forge/resolver';
import { createHandlers } from './handlers.js';
import { forgeDeps } from './deps.js';

const deps = forgeDeps();

export const handlers = createHandlers(deps);

const resolver = new Resolver();
for (const [name, fn] of Object.entries(handlers)) {
  resolver.define(name, fn);
}

// Aliases kept so the console's existing call sites keep working while the
// public names (relay.capture.*) describe what the operation actually is.
resolver.define('relay.commitment.accept', handlers['relay.capture.accept']);
resolver.define('relay.commitment.reject', handlers['relay.capture.reject']);
resolver.define('relay.commitment.edit', handlers['relay.capture.edit']);
resolver.define('relay.settings.capture', async ({ payload }) => {
  await handlers['relay.settings.set']({ payload: { capture: payload } });
  return payload;
});

export const handler = resolver.getDefinitions();
