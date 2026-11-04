# Relay design system (v2)

Relay is a place of work for people who carry promises on behalf of other people. The
interface has one job: make it impossible to confuse **a thing someone said** with **a thing
someone agreed to do**, and make the difference between *resolved* and *still owed* visible
at a glance.

> **v2 replaced the v1 interface.** The audit that forced the replacement is in §8. Everything
> below describes what is in the code now: `app/ui/src/styles/{tokens,base,app,screens}.css`
> and `app/ui/src/components/*`. The code is the source of truth; this document explains the
> reasoning.

---

## 1. Art direction — "Relay is a ledger, not a dashboard"

A dashboard summarises. A ledger **records**, and shows its working: ruled lines, a margin
where running totals accumulate, and stamps applied when something is settled. That metaphor
is the whole visual system, and it is the reason the product does not look like the
sidebar-plus-cards template it was built from.

**Full-bleed paper on a mineral canvas.** There is no white "card" wrapped around the page.
The page *is* the paper (`--paper #fcfcf9`); the canvas (`--canvas #e9eae3`) shows only at the
edges and between bands. Structure comes from **1 px rules**, not from borders plus radii.

| Token | Value | Job |
|---|---|---|
| `--canvas` | `#e9eae3` | mineral grey-green ground; never cream, never white |
| `--paper` | `#fcfcf9` | the working document |
| `--paper-sunk` / `--paper-hover` | `#f4f4ee` / `#f2f3ec` | margin notes, draft surfaces, row hover |
| `--ink` / `--ink-2` / `--muted` | `#14191b` / `#3b4643` / `#5c6561` | three text ranks, nothing else |
| `--rule` / `--rule-strong` / `--rule-faint` | `#d3d7ce` / `#b9bfb4` / `#e4e7df` | hairline, structural rule, internal rule |
| `--pine` / `--pine-soft` | `#1b3a33` / `#e3eae5` | structure and the single primary action |
| `--flame` / `--flame-soft` | `#b33f14` / `#fbeae2` | past the date given, blocked from closing |
| `--verdigris` / `--verdigris-soft` | `#196b55` / `#e2efe9` | proven, verified, permitted |
| `--ochre` / `--ochre-soft` | `#7a5a0f` / `#f6efd7` | a decision is owed by a person |

Colour encodes **operational fact only** — never decoration, never hierarchy. If a surface is
tinted, something is wrong on it or something is proven on it. The masthead is pine because it
is the one structural mass; everything below it is paper.

### Typography

Two families, both bundled locally with `@fontsource` (Forge Custom UI cannot be assumed to
reach a font CDN, and a fallback would destroy the identity).

- **Schibsted Grotesk** 400/500/600/700 — headings and prose. Tight, slightly narrow, sharp
  terminals.
- **IBM Plex Mono** 400/500 — **identifiers and numbers only**: issue keys, commitment codes,
  timestamps, tallies, projections, stamps. Never labels, never prose.

Scale: `--t-display clamp(27px, 2.6vw, 38px)` / 22 / 16.5 / 14 / 12.5 / 11 px. Display sizes
carry `-0.03em` tracking; body line-height is 1.6; prose is capped at `--measure 68ch`.
Page titles use `text-wrap: balance` so a two-line heading never leaves an orphan word.

---

## 2. Shell

No permanent sidebar. Navigation belongs to the document header, because the ledger needs the
width and a 236 px rail only ever bought a generic template look.

```
┌───────────────────────────────────────────────────────────────────────┐
│ masthead 60px: wordmark · workspace chip · search · mode · account    │
├───────────────────────────────────────────────────────────────────────┤
│ tab strip 46px: Overview · Capture · Cases · Activity · Settings      │
├───────────────────────────────────────────────────────────────────────┤
│ page (max 1400px, gutter clamp(16px,3vw,40px))                        │
│                                                   ┌─────────────────┐ │
│   section head ─────────────────────────────────  │ margin 252px    │ │
│   ruled ledger rows                               │ running totals  │ │
│                                                   │ held open       │ │
│   recently changed ─ closing band, full width ────┴─────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

- The masthead is sticky (`--masthead-h 60px`), the tab strip scrolls away with the document.
- Below 861 px the tab strip is replaced by a **bottom tab bar** (`--tabbar-h 58px` plus
  `env(safe-area-inset-bottom)`) with four destinations and a **More** sheet for the rest.
- The overview's right margin is `position: sticky` and collapses into the flow at 1040 px.
- Spacing: 4 / 8 / 12 / 16 / 24 / 32 / 48. Radii: 2 / 3 / 5 / 8 px — nothing is a pill.

---

## 3. Components

| Component | Rule |
|---|---|
| **Button** | 34 px (28 px small). One primary per view — pine, paper text. Default is paper with a hairline; quiet is borderless until hover. |
| **Stamp** | The status device that replaced pills: mono, 10 px, letterspaced small caps, 2 px radius, either hairline-bordered or flat-tinted. States: *Overdue* (flame), *Review* (ochre), *Open* (ink), *Verified* (verdigris), *Dropped* (muted). A stamp is always applied to a settled fact, never to a summary number. |
| **Owner mark** | 20 px initials tile + name. Unassigned is a dashed tile reading "Unassigned" — visible, italic, never blank. |
| **Ledger row** | Six columns (`--ledger-cols: 32px 84px minmax(0,1fr) 138px 104px 88px`): index, case key, the promise itself, owner, due, state. Rows are buttons: hover tints, focus rings, `aria-label` reads the whole row. The wording column gets the width it deserves — this was the single worst failure of v1, where the primary object was starved to 150 px while a case key got 84 px. |
| **Group head** | The ledger is grouped by what the operator must decide: *Past the date given* / *Awaiting a person* / *Within the promise*, each with a count and a plain-language hint. |
| **Measure** | A segmented horizontal rule under the status figure: one tick per case, coloured by worst state. A ruler, not a progress bar. |
| **Tally** | The margin's running totals: label, dotted leader, tabular mono figure. Right-aligned numerals are the only place numbers are loud. |
| **Quote** | The stored source sentence: 2 px rule, author, comment id, age. Verbatim and never editable after acceptance. |
| **Draft** | A suggestion wears a **dashed** border and a `DRAFT` flag in ochre, sitting on the sunk surface. An accepted commitment is a plain ruled row with an owner and a due date. They never share a treatment. |
| **Confidence ticks** | Five 10×3 px ticks plus a percentage. A roughness signal, not a dial. |
| **Sheet / dialog / palette** | All overlays trap focus, close on Escape and lock body scroll. ≤860 px the sheet is full-screen and the dialog becomes a bottom sheet. |

### The distinction the product rests on

A *proposed* commitment is dashed, ochre-flagged, labelled "Review", and lives under a heading
that says so. An *open* commitment is a ruled row with a solid stamp and an owner. A
*verified* commitment carries a verdigris stamp and the note that proved it. At no width do
two of these look alike.

---

## 4. Screen composition (what is different about each)

| Screen | Structure |
|---|---|
| **Overview** | Date line and one decision-sized title → status band (oversized flame numeral, claim sentence, measure, re-evaluation timestamps) → ruled ledger with group heads and a sticky margin of running totals + held-open cases → a full-width **Recently changed** band closing the page. No statistic cards anywhere. |
| **Capture inbox** | Three zones: queue rail (numbered, with case context and a provenance footer), the source comment with the verbatim sentence marked and a metadata column (comment id, author, age, character span), and the proposal beside the decision form. Reading order is *what was said → what we think it promised → what you do*. |
| **Case workspace** | Case head (key, status, priority, title, owner, location, updated, closure action) → commitment thread, one entry per commitment with expandable evidence, handovers and verification → **Activity on this case** log → a sticky sidebar carrying closure readiness (why, what an agent sees, what a customer sees), the condition projection, and case facts. Below 900 px the closure panel becomes a one-line summary strip that opens the same dialog. |
| **Activity & audit** | Day-grouped timeline (`TODAY` / `YESTERDAY` / date), time in mono, state dot, event, detail, case + commitment references, actor. Filters are underlined tabs; search is an input that never hides the result count. |
| **Settings** | A section index (sticky column, becomes a scrolling tab row on mobile) beside one screen's worth of ruled settings, each section opening with a plain-language statement of what it controls. |
| **Commitment detail** | A side sheet at ≥861 px (560 px, 2-column fact grid), full-screen below. Wording, quote, owner, due, confidence, acceptance, handovers, verification and drop reasons — with the actions in a fixed footer. |

---

## 5. Motion

Five animations exist in the product: scrim fade, sheet slide, dialog rise, toast entry and
skeleton shimmer. 110–170 ms on `cubic-bezier(.22,.8,.2,1)`. Hover changes colour and border
only. `prefers-reduced-motion: reduce` sets `--fast` and `--med` to `0ms` **at the token
layer**, so every transition and animation collapses to instant rather than to "less smooth".

---

## 6. Accessibility

- `:focus-visible` — 2 px pine outline, 2 px offset, on every control (verified in a real
  browser, not asserted).
- Skip link to `#main`; single `<h1>` per screen; landmark elements for masthead, nav, main.
- `aria-current="page"` on navigation, `aria-pressed` on segmented filters, `role="switch"` +
  `aria-checked` on toggles, `role="dialog"` + `aria-modal` on overlays, `aria-live="polite"`
  on toasts.
- Status is never colour-only: every stamp carries a word; the measure carries an `aria-label`
  describing the ratio it draws.
- Contrast measured from the shipped tokens (WCAG relative luminance, measured 2026-11-04):

  | Pair | Ratio |
  |---|---|
  | ink on paper | 17.25:1 |
  | ink on canvas | 14.64:1 |
  | secondary ink on paper | 9.53:1 |
  | secondary ink on canvas | 8.09:1 |
  | muted on paper | 5.86:1 |
  | muted on canvas | 4.97:1 |
  | muted on sunk | 5.45:1 |
  | flame on paper / on its wash | 5.62:1 / 4.94:1 |
  | verdigris on paper / on its wash | 6.24:1 / 5.42:1 |
  | ochre on paper / on its wash | 6.20:1 / 5.53:1 |
  | paper on pine | 12.02:1 |

  The muted rank started v2 at `#626c68`, measured **4.49:1 on the canvas** — a fail for the
  10–11 px labels it is used on — and was darkened to `#5c6561` (4.97:1).

---

## 7. Responsive behaviour

Breakpoints are chosen by *when the composition stops working*, not by device names:
**1180 / 1040 / 1000 / 900 / 861 / 640 / 400**.

| Width | Shell | Content |
|---|---|---|
| ≥ 1181 px | masthead + tab strip | full 6-column ledger; sticky 252 px margin; capture in three zones; case sidebar 340 px |
| 1001–1180 px | as above | ledger still 6 columns, margin narrows to 232 px; case sidebar 300 px |
| 861–1000 px | as above | ledger becomes **two-column record rows** (key + state, wording, owner + due); capture queue goes horizontal; settings index becomes a scrolling tab row |
| 641–860 px | **bottom tab bar + More sheet**; masthead compresses (search → icon, account name hidden, fixture chip keeps its word); sheets go full-screen, dialogs become bottom sheets | case sidebar moves below the thread and a closure strip appears above it; provenance stacks under the quotation |
| 401–640 px | as above; workspace chip collapses to its monogram | page head stacks with full-width actions; section tools take their own row; group-head hints wrap under the label |
| ≤ 400 px | masthead gaps tighten | single column everywhere; ledger rows become stacked records (`key / state`, wording, owner + due); draft facts stack; the queue rail becomes a horizontal scroller of 78 %-wide cards |

Rules that hold at every width: `min-width: 0` on every flex/grid child that holds text,
`minmax(0, 1fr)` instead of bare `1fr` for text columns, `overflow-wrap: anywhere` on quotes
and long keys, safe-area insets on the masthead, tab bar and sheet footers, and **no
`overflow-x` on the page as a workaround** — measured, not assumed (see §9).

---

## 8. Why v1 was replaced (the audit)

v1 was judged from a real 1440 px screenshot, not from its documentation. What it showed:

1. **Zero hierarchy** — nav, eyebrow, H1, subtitle, band, four statistic cells, table and rail
   all shared one weight and one 13–14 px scale.
2. **Four identical rounded white cards** stacked in the left column, two more in the right;
   border + radius was the only grouping device.
3. **Reading order was wrong** — the rail's "blocked from closing" repeated the band above it
   and the table below it, giving the eye three competing entry points.
4. **The primary object was starved** — commitment wording got ~150 px and truncated, while a
   case key got 84 px for eight characters; rows were 72 px tall to hold the truncation.
5. **The dark rail was the loudest element** on the page and carried no operational meaning.
6. **Pills carried meaning** (`Overdue`, `Awaiting review`) as low-contrast lozenges, unstable
   next to metric numerals.
7. **Orphan affordances** — an unlabelled `2` button, hairline dividers that read as
   skeletons, alert chips styled like text fields.
8. **Density was decorative** — the same five facts appeared three times.
9. **No responsive concept** — one breakpoint, no mobile navigation, tables never transformed.

v2 answers each one by construction: rules instead of cards, one status band, the wording
column given the width, stamps instead of pills, a labelled margin instead of a dark rail, and
a mobile interface designed as its own thing (tab bar, sheets, records) rather than a squeezed
desktop.

---

## 9. How this was verified

Every claim above was checked in a real browser (puppeteer-core driving headless Chromium),
not by reading CSS or server-rendered HTML:

- Six screens rendered and screenshotted at **1440, 1280, 1024, 768, 390 and 360 px**.
- `documentElement.scrollWidth > clientWidth` measured at every width, on every screen: all
  false. Horizontal scrollers that exist by design (the mobile capture queue, the mobile
  settings index) are inside their own `overflow-x: auto` containers and do not move the page.
- Overlays opened and photographed at 390 px: commitment sheet (full-screen, body scroll
  locked), closure dialog (bottom sheet), command palette (full-width, scrim measured at
  `rgba(20,25,27,.36)`), More sheet.
- Keyboard focus ring photographed on the masthead search control.
- Two review-and-fix passes were run against those renders; the fixes (capture panes collapsing
  from two half-empty columns to *quote above, decision below*; the empty overview footer that
  became the Recently-changed band; the mobile masthead that rendered a truncated workspace
  name; the duplicated "Why?" affordances on mobile) are all in this branch.

---

## 10. What this system refuses

No purple or blue gradients. No glassmorphism. No card grid as page structure. No four-up
statistic cells. No all-caps eyebrow above every heading. No `A · B` meta strings as a
substitute for layout. No emoji. No decorative charts — the measure exists because it encodes
the ratio of blocked to verified work. No rounded rectangle drawn around everything: if a
group of things needs a boundary, a rule is enough.
