# Phase 1, milestone P1 — implementation report

Status: **shell, design system and all six screens are built and running.** The interface was
rebuilt in this revision: the v1 look was audited from a real 1440 px screenshot, rejected as a
generic dashboard, and replaced with the ledger system documented in
`docs/design/RELAY-DESIGN-SYSTEM.md` (see §0). The enforcement model is implemented and
unit-tested, and **not deployed** — see §7 for exactly why and what that costs.

---

## 0. v2 interface rebuild (this revision)

The brief for this revision was a frontend engineering correction, not a restyle: do not
defend the existing design, do not make cosmetic adjustments. So the v1 interface was
screenshotted at 1440 px and audited first. What the screenshot showed — nine specific
failures, from a single 13–14 px type scale to a dark rail carrying no operational meaning —
is recorded in the design system document, §8. Those failures, not taste, drove the rebuild.

| Area | v1 | v2 |
|---|---|---|
| Identity | light dashboard with a dark sidebar | a ledger: ruled paper on a mineral canvas, a margin of running totals, ink stamps |
| Shell | permanent 236 px rail | masthead + tab strip on desktop, bottom tab bar + More sheet on mobile |
| Status | rounded pills | stamps — mono small caps, 2 px radius, hairline or flat tint |
| Grouping | cards with borders and radii | 1 px rules, group heads, a deliberate margin |
| The primary object | commitment wording truncated at ~150 px | wording gets the widest column; index, key, owner, due and state fit around it |
| Colour | amber/blue used decoratively | flame / verdigris / ochre encode only operational fact |
| Mobile | one breakpoint, tables never transformed | six breakpoints, records instead of tables, bottom sheets, safe areas |
| Overview | four identical statistic cells | one oversized numeral, a segmented measure, a ruled ledger, a closing band |
| Capture | suggestion and source in one column | queue rail, verbatim source with marked span and provenance, draft beside the decision form |

Files replaced: `styles/{tokens,base,app,screens}.css` (1,732 lines), `App.tsx`,
`components/{primitives,overlays,Icons}.tsx`, all five screens plus the new
`screens/CommitmentSheet.tsx` (which replaced `CommitmentDrawer.tsx`). Backend, resolvers,
manifest and the 34 tests were not touched.

---

## 1. What was implemented

| Area | Delivered |
|---|---|
| Forge app | `app/manifest.yml` — global page, issue panel, workflow validator, workflow condition, resolver + validator functions, scopes `storage:app`, `read:jira-work`, `write:jira-work`, zero external fetches |
| UI | React 18 + TypeScript + Vite Custom UI, no component library, no CSS framework |
| Design system | tokens, base, component and screen layers (1,732 lines of CSS) rebuilt as v2, documented in `docs/design/RELAY-DESIGN-SYSTEM.md` |
| Screens | Overview, Capture Inbox, Case Workspace, Activity & Audit, Settings, Commitment detail drawer |
| Interaction | ⌘/Ctrl-K command palette, filters, sorting-free but navigable tables, drawers, dialogs with confirmation, toasts, inline editing, keyboard-dismissable overlays, skeleton boot state, empty states, error/unavailable notices |
| Backend | versioned commitment ledger, projection writer with read-back verification, fail-closed gate, validator handler, append-only audit, Forge resolvers |
| Tests | 34 backend unit tests (`node --test`), TypeScript typecheck, static render check across all six screens |

## 2. Skills

Full record in `docs/design/SKILL-STACK.md`. Summary: the Anthropic `frontend-design`,
Vercel `web-design-guidelines` and `taste-skill` documents were read in full and their
method adopted. The two generator CLIs (`ui-ux-pro-max`, `skills add`) were **not**
installed — they generate a design system from a prompt, which conflicts with choosing one
identity deliberately. The audit directly caused the first palette (cream/serif/terracotta)
to be discarded as a known AI-default.

## 3. Which screens are functional

All six render and all interactions work against the data layer:

- **Overview** — readiness band, four decision metrics, filtered attention table, blocked-case
  list, recent activity.
- **Capture Inbox** — queue, source comment with the exact quoted sentence marked, connector,
  suggestion card with confidence ticks, accept-with-owner-and-date, edit wording, reject with
  a required reason.
- **Case Workspace** — commitment thread with evidence quotes, inspectors for closure
  readiness, what an agent sees, what a customer sees, and the live projection JSON.
- **Commitment drawer** — source, wording, owner, handovers, verification, drop reason, audit
  history, and the verify/reassign/drop flows with confirmation.
- **Activity & audit** — grouped timeline, type filter, search.
- **Settings** — workspace, Jira connection, enforcement status, capture policy, audit.

## 4. Fixture vs live

| | State |
|---|---|
| Data source | **Fixture workspace** (Northgate Housing, six repairs cases) |
| How that is signalled | A `Fixture data` flag in the top bar on every screen; the app only claims `Live Jira data` when a Forge bridge responds |
| Live path | `relay.bootstrap` and the five mutation resolvers are written and typecheck; they have **never run against a real site** |
| Why | No Atlassian network or Forge credentials in the build environment |

The fixture is deliberately mundane — overdue extracts, an unowned commitment, a handover,
a case that can close — because a demo populated with perfect data would hide exactly the
states this product exists to surface.

## 5. Enforcement model (P2 groundwork)

Recorded in code and tests, not just prose:

1. **Ledger is the authority** (`app/src/ledger.js`) — versioned, revision-checked mutations,
   so two writers cannot silently overwrite each other.
2. **Projection is derived** (`projection.js`) and stamped with the `ledgerRev` that produced
   it, so a stale copy is detectable rather than indistinguishable from a true zero.
3. **The agent/REST gate fails closed** (`gate.js`, `workflow.js`) — an unreadable ledger
   refuses the closure with a message naming the cause. E1 showed what fail-open looks like
   from outside; this is the opposite policy on purpose.
4. **The portal condition reads the projection** (`manifest.yml`), because a Forge workflow
   condition is a Jira expression and cannot call Relay. This is the decision-B design from
   `phase0/CUSTOMER-TRANSITION-VALIDATION-REPORT.md`.
5. **Sync verifies its own writes** (`sync.js`) — projection written, field written, both read
   back; a silent no-op raises instead of leaving a false zero in place.

Known gaps, stated rather than implied: the condition's custom-field id is site
configuration; a field write and a ledger write are two writes, so the residual window is
between them (bounded by the freshness check, not eliminated); and a Forge-contributed
condition has not yet been shown to behave on the portal the way the built-in rule did.

## 6. Verification performed

| Check | Result |
|---|---|
| `tsc --noEmit` (UI) | clean |
| `vite build` (UI → Forge resource) | clean, 219 kB main chunk / 66 kB gzip |
| `node --test test/*.test.js` (backend) | **34 pass, 0 fail** |
| Static render of all six screens with content assertions (`npm run check:render`) | all pass; no `Invalid Date`, `NaN`, `undefined` or `[object Object]` in output |
| Dev server | running, served for inspection |

### Browser verification (v2)

A headless Chromium (puppeteer-core + a packaged Chromium build, no network install at run
time) was driven against the running dev server. Every screen was rendered and screenshotted at
**1440, 1280, 1024, 768, 390 and 360 px**, and `documentElement.scrollWidth > clientWidth` was
measured on every load: **no horizontal page overflow at any width on any screen**. Overlays
were opened and photographed at 390 px (commitment sheet, closure dialog, command palette,
More sheet) and keyboard focus was photographed on the masthead. Console and page errors were
collected on every run: none.

Two review-and-fix passes were then run against those renders. Pass 1 replaced the capture
inbox's two half-empty side-by-side panes with *quote above, proposal and decision below*, and
moved the overview's recent-activity list out of the margin into a full-width closing band
(the page previously ended in 400 px of empty canvas). Pass 2 fixed the mobile masthead (which
rendered a truncated workspace name and a full account block because inline `display` styles
overrode the media query), removed the duplicated "Why?" affordance on the mobile case screen,
stacked the group-head hints, and loosened the ledger filters from a full-width toggle to an
inline row.

Older passes, done on markup and computed styles before a browser was available, are kept
below because the fixes they produced are still in the product.

Pass 1 (legibility and truth):
- `--muted` measured at 3.61:1 and used for timestamps and eyebrows — below AA. Changed to
  `#5C6663` (5.3:1) everywhere it is used.
- The workspace subtitle was hardcoded to "Northgate Housing"; it now reads from the
  workspace.
- Settings had an editable workspace-name field that saved nothing. It now has an explicit
  Save with a disabled state, and the read-only Jira site is rendered as a value, not an input.
- `g o / g i / g a / g s` shortcuts were advertised in the palette but not wired. They are now
  implemented (with a 1.2 s chord window) rather than the hint removed, because navigation by
  keyboard is part of the product's claim to be a working surface.

Pass 2 (density and copy):
- A commitment six hours overdue rendered as "Due today" beside an `Overdue` lozenge, because
  the day count was rounded. Fixed to count elapsed time, so late work always reads as late.
- The capture inbox printed the author and age twice, once in the section head and once in the
  source block. The section head now says something useful instead of repeating.
- The blocked-case rows had an unstyled chevron; it now has hover and rest colours.

**Not performed: visual inspection in a browser.** Chromium could not be installed
(egress allowlist blocks the Playwright download), so no screenshots exist and none are
claimed. Layout, typography and density have been reasoned about from the CSS and reviewed
in source, which is weaker evidence than looking — this should be the first thing checked on
a machine with a browser.

## 7. Deployment

**Not deployed.** Deploying requires a Forge login and reachability to
`api.atlassian.com`, neither of which exists in this environment, and the app id in the
manifest is intentionally a placeholder. To deploy from the user's machine:

```
cd app
npm install
cd ui && npm ci && npm run build      # emits app/static/relay
cd .. && npx @forge/cli deploy
npx @forge/cli install --upgrade
```

Then register the validator and the condition on the closure transition of the target
workflow, set the numeric field id Relay should project into, and enable the console page.

## 8. What is next (P3/P4)

- Wire the capture pipeline from `phase0/validator-probe/src/extraction` into a real
  `avi:jira:created:comment` trigger, with persisted quote offsets.
- Configure and test the Forge-contributed condition on a real portal (the built-in rule was
  proven in `c3-11`; ours has not been).
- Close the ledger→field write window, or make the gate read the ledger synchronously on the
  transition (it already does for agents; the portal cannot).
- Browser-based visual review and two fix passes, per `phase0` discipline of not claiming an
  unperformed check.
