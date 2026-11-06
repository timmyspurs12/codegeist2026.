/**
 * The one place that binds Relay's product code to Forge.
 *
 * `resolvers.js` (the console) and `index.js` (the validator and the creation
 * trigger) both build their dependencies here, so there is a single answer to
 * "which Jira, which storage, which record store" per invocation.
 */
import api, { route } from '@forge/api';
import { createJira } from './jira.js';
import { createForgeRecords, createForgeStorage } from './forge-store.js';

export const log = (event) => console.log(JSON.stringify(event));

export function forgeDeps() {
  const jira = createJira({
    // asApp(): Relay reads and writes as the installed app, so a resolver does
    // not depend on which user happened to open the console.
    requestJira: (r, init) => api.asApp().requestJira(r, init),
    route,
    log,
  });

  return {
    jira,
    // Key/value storage: settings, tracked list, per-issue meta, audit events.
    storage: createForgeStorage(),
    // The authoritative issue record, with conditional commits on `rev`.
    records: createForgeRecords(),
    log,
  };
}
