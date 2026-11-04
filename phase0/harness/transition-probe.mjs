#!/usr/bin/env node
/**
 * transition-probe — drive one Jira transition over REST and record what happened.
 *
 * Exists so the customer-transition experiment produces machine-readable evidence
 * from a single command per case, instead of screenshots and prose. It records the
 * HTTP status, the response body, the transition list before and after, and the
 * resulting status of the work item.
 *
 * Credentials come from the environment and are never printed, logged or written:
 *   JIRA_EMAIL   your Atlassian account email
 *   JIRA_TOKEN   an API token (id.atlassian.com/manage-profile/security/api-tokens)
 *
 * Usage:
 *   node phase0/harness/transition-probe.mjs --list --key FS-1 --label c1-listed
 *   node phase0/harness/transition-probe.mjs --customer --list --key FS-2 --label c3-portal-listed
 *   node phase0/harness/transition-probe.mjs --key FS-1 --transition "Mark as done" \
 *        --label c1-blocking-2 --resolution Done        # only where the transition needs one
 *
 * Output: phase0/e1-customer/evidence/<label>.json (+ a one-line summary on stdout)
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { offeredList, classifyAttempt, validatorRan, isListed, buildAttemptBody, findTransition } from './probe-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(HERE, '..', 'e1-customer', 'evidence');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const base = String(arg('base', 'https://onepes930.atlassian.net')).replace(/\/+$/, '');
const key = arg('key');
const label = String(arg('label', `probe-${Date.now()}`));
const listOnly = Boolean(arg('list', false));
const customerPath = Boolean(arg('customer', false));
const transitionArg = arg('transition');
const resolution = arg('resolution', null);

const email = process.env.JIRA_EMAIL;
const token = process.env.JIRA_TOKEN;

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

if (!key) die('--key is required (for example --key FS-1)');
if (!email || !token) die('set JIRA_EMAIL and JIRA_TOKEN in the environment (they are never printed)');
if (!listOnly && !transitionArg) die('give --transition <id or name>, or use --list');

// Built here and never logged.
const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');

/** The customer transition endpoints the portal itself calls. */
const CUSTOMER_API = (k) => `/rest/servicedeskapi/request/${encodeURIComponent(k)}/transition`;

async function jira(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: auth, Accept: 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { _raw: text }; }
  return { status: res.status, body };
}

async function currentStatus() {
  const { status, body } = await jira(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=status`);
  return status === 200 ? { status: body?.fields?.status?.name ?? null, httpStatus: status } : { status: null, httpStatus: status };
}

async function main() {
  const before = await currentStatus();
  const listPath = customerPath ? CUSTOMER_API(key) : `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`;
  const listed = await jira(listPath);

  const record = {
    label,
    capturedAt: new Date().toISOString(),
    site: base,
    issueKey: String(key),
    transitionArg: transitionArg ? String(transitionArg) : null,
    resolution: resolution ? String(resolution) : null,
    statusBefore: before.status,
    transitionsOffered: offeredList(listed.body)?.map((t) => ({
      id: t.id,
      name: t.name,
      to: t.to?.name,
      hasScreen: t.hasScreen,
    })) ?? null,
    // An empty customer-transition set is a finding, not a glitch, so keep the
    // raw body when the expected array is absent rather than recording null.
    listBodyRaw: offeredList(listed.body) ? null : JSON.stringify(listed.body).slice(0, 500),
    listHttpStatus: listed.status,
    transitionIsListed: transitionArg ? isListed(listed.body, transitionArg) : null,
    endpoint: customerPath ? 'servicedeskapi (customer transitions)' : 'rest/api/3 (agent transitions)',
  };

  if (!listOnly) {
    const match = findTransition(listed.body, transitionArg);
    const looksNumeric = /^\d+$/.test(String(transitionArg));

    if (!match && !looksNumeric) {
      // Sending a transition *name* where Jira wants an id produces
      // "This request is invalid" from the service-desk endpoint — a refusal
      // that looks like a gate decision and is not one. Fail loudly instead.
      Object.assign(record, {
        attemptHttpStatus: null,
        attemptBody: null,
        outcome: 'invalid_probe_call',
        validatorRan: 'unknown',
        relayMessage: null,
        note: `transition '${transitionArg}' was not in the listing (HTTP ${listed.status}); refusing to send a name as an id`,
      });
      record.statusAfter = (await currentStatus()).status;
      await mkdir(EVIDENCE_DIR, { recursive: true });
      await writeFile(join(EVIDENCE_DIR, `${label}.json`), JSON.stringify(record, null, 2) + '\n');
      console.error(`error: ${record.note}`);
      console.error(`evidence: phase0/e1-customer/evidence/${label}.json`);
      process.exit(2);
    }

    const id = match?.id ?? String(transitionArg);
    const attemptPath = customerPath ? CUSTOMER_API(key) : `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`;
    const attempt = await jira(attemptPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(customerPath ? { id: String(id) } : buildAttemptBody(id, resolution)),
    });

    const classified = classifyAttempt(attempt.status, attempt.body);
    Object.assign(record, {
      transitionIdTried: String(id),
      attemptHttpStatus: attempt.status,
      attemptBody: attempt.body,
      outcome: classified.outcome,
      validatorRan: validatorRan(classified),
      relayMessage: classified.relayMessage,
    });
  }

  const after = await currentStatus();
  record.statusAfter = after.status;

  await mkdir(EVIDENCE_DIR, { recursive: true });
  const file = join(EVIDENCE_DIR, `${label}.json`);
  await writeFile(file, JSON.stringify(record, null, 2) + '\n');

  const offered = (record.transitionsOffered ?? []).map((t) => `${t.id}:${t.name}->${t.to}`).join(', ') || 'none';
  const summary = listOnly
    ? `${label}: ${key} is '${record.statusBefore}'; offered [${offered}]`
    : `${label}: ${key} '${record.statusBefore}' -> '${record.statusAfter}'; POST ${record.attemptHttpStatus} => ${record.outcome}; validatorRan=${record.validatorRan}`;
  console.log(summary);
  console.log(`evidence: phase0/e1-customer/evidence/${label}.json`);
}

main().catch((err) => die(String(err?.message ?? err)));
