import Resolver from '@forge/resolver';
import { storage } from '@forge/kvs';
import { createClosureValidator } from './workflow.js';

const resolver = new Resolver();
const ledgerKey = (issueKey) => `relay:ledger:${issueKey}`;

const readLedger = async (issueKey) => (await storage.get(ledgerKey(issueKey))) ?? null;
const log = (event) => console.log(JSON.stringify(event));

/* ---------------------------------------------- workflow validator (agent + REST) */

export const closureValidator = createClosureValidator({ readLedger, log });

/* ------------------------------------------------ resolvers used by the console */

export { handler } from './resolvers.js';
