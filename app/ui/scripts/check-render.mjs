/**
 * Render every screen to static markup and assert that expected content is
 * present and that no known-broken values leaked into the output.
 *
 * This is not a substitute for looking at the product. It is the automated
 * floor: it catches a screen that throws, an "Invalid Date", a missing panel or
 * an empty table before anyone opens a browser.
 */
import { renderAll } from '../.prerender/prerender.js';

const out = renderAll();

const expected = {
  overview: ['What needs a decision today', 'The ledger', 'REP-1042', 'cases cannot close'],
  capture: ['lifted verbatim', 'What Relay proposes', 'Accept commitment', 'REP-1039'],
  case: ['Closure readiness', 'Commitments on this case', 'What a customer sees', 'REP-1042'],
  activity: ['Every change to a promise, in order', 'REP-1042'],
  settings: ['How Relay behaves on this site', 'Jira site', 'Enforcement'],
  drawer: ['Handovers', 'Verified by', 'Confidence'],
};

const forbidden = [/Invalid Date/, />undefined</, /\bNaN\b/, /\[object Object\]/];

let failures = 0;
for (const [name, needles] of Object.entries(expected)) {
  const html = out[name] ?? '';
  const missing = needles.filter((n) => !html.toLowerCase().includes(n.toLowerCase()));
  const bad = forbidden.filter((re) => re.test(html)).map(String);
  const ok = missing.length === 0 && bad.length === 0 && html.length > 800;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(9)} ${String(html.length).padStart(6)} chars`);
  if (missing.length) console.log(`     missing: ${missing.join(', ')}`);
  if (bad.length) console.log(`     forbidden values: ${bad.join(', ')}`);
  if (!ok) failures += 1;
}

if (failures) {
  console.error(`\n${failures} screen(s) failed the render check.`);
  process.exit(1);
}
console.log('\nAll screens rendered with expected content.');
