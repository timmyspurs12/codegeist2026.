# Relay design system

Relay is a place of work for people who carry promises on behalf of other people. The
interface has one job: make it impossible to confuse **a thing someone said** with **a thing
someone agreed to do**, and make the difference between *resolved* and *still owed* visible
at a glance.

Everything below is implemented in `app/ui/src/styles/*.css` and
`app/ui/src/components/*`. This document explains the reasoning; the code is the source of
truth.

---

## 1. Art direction

**Mineral canvas, petrol shell, sodium signal.**

| | | |
|---|---|---|
| **Canvas** | `#F2F3EE` | cool mineral grey-green — not cream, not white |
| **Shell** | `#16211F` | petrol-black navigation, the only dark mass on screen |
| **Signal** | `#E59313` | sodium amber: primary action, active marker, "look here" |

The palette is borrowed from operational signage — hi-vis marking on a site board — because
Relay's subject is operational accountability, not collaboration software. Amber is used
**once per screen region**, never as a wash, and never as text on white without the darker
`--sodium-ink` variant.

State colours are the only other hues, and each has one meaning:

| State | Colour | Meaning |
|---|---|---|
| awaiting review | `#2F5185` aniline blue | a human decision is owed |
| verified | `#0F5F52` oxidised copper | proven, with evidence |
| overdue | `#A32319` dried red | the clock ran out |
| dropped | `#64706B` slate | closed out on purpose, with a reason |

No gradients. No shadows except on overlays. Borders do the structuring.

### Typography

One grotesque plus one mono. Both bundled locally (`@fontsource`), so the interface cannot
render in a fallback font because of a network policy — Forge Custom UI often cannot reach
external font CDNs.

- **Schibsted Grotesk** 400/500/600/700 — UI, headings, prose. Sharp terminals, a slightly
  narrow fit; it reads as *made* rather than *default*.
- **IBM Plex Mono** 400/500 — issue keys, commitment codes, timestamps, counts, projections.
  Monospace is reserved for **identifiers and numbers**, never for labels or prose.

Scale: 30 / 22 / 16 / 14 / 12.5 / 11px, with `-0.02em` tracking at display sizes and
`1.5` line-height for body. Prose is capped at 62–66 characters.

---

## 2. Layout

Three-part shell, all CSS grid, no layout libraries:

```
┌──────────┬──────────────────────────────────────────────┐
│  rail    │ topbar: search · state flag · review count    │
│  236px   ├──────────────────────────────────────────────┤
│          │ page                        │ inspector 372px │
│  nav     │                             │ (case workspace)│
│  footer  │                             │                 │
└──────────┴──────────────────────────────────────────────┘
```

- The rail collapses to 64 px (icons only) and auto-collapses under 900 px.
- The inspector is contextual to the case workspace and hides below 1180 px.
- Pages cap at 1240 px (1560 px for the capture inbox, which is a working surface).
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48.
- Radii: 3 px controls, 5 px inputs and buttons, 8 px panels, 12 px overlays. A circle is
  only ever an avatar or a status node.

---

## 3. Components

| Component | Rule |
|---|---|
| **Button** | 32 px (26 px small). One primary per view — amber, ink text. Default buttons are white with a hairline; quiet buttons have no border until hover. |
| **Lozenge** | Status only. 20 px, 3 px radius, leading 5 px square dot, always with text. No pill shapes. |
| **Owner** | Avatar initials + name, never a bare name. An unowned commitment shows a dashed avatar and "Unassigned" — visible, not silent. |
| **Table** | Hairline rows, 11 px column heads, rows are clickable and keyboard reachable. Numeric cells are tabular mono. |
| **Baton rail** | The commitment thread: a vertical rule with one node per commitment, coloured by state. Handovers are counted on the node and expanded in the drawer. |
| **Evidence block** | A quoted sentence with its author, comment id and age, plus a "show in source" jump. The quote is monospace-free and marked with an underline rule, not a highlighter smear. |
| **Connector** | In the capture inbox, a rule and arrow that physically join the highlighted sentence to the suggestion. This is the product's central claim made visible. |
| **Confidence ticks** | Five 9×3 px ticks. Deliberately not a percentage dial — it is a *roughness* signal, and the number is beside it. |
| **Readiness band** | The overview's loud element: a state sentence, a segmented meter, and three numbers. It is the only place amber/wash fills are used at scale. |
| **Drawer / dialog / palette** | All overlay the content, all close on Escape, all trap focus where they are modal. |

### The distinction the whole product rests on

A suggestion is visually **inside** an amber-tinted, amber-bordered container labelled
*"Suggestion — not yet a commitment"*. An accepted commitment is a plain bordered node in
the thread with an owner and a due date. They never share a visual treatment, at any zoom
level.

---

## 4. Motion

Four animations exist in the entire product: scrim fade, drawer slide, dialog pop, toast
entry — plus a shimmer for skeletons. Duration 120–180 ms on `cubic-bezier(.2,.8,.2,1)`.
Hover changes colour and border only. `prefers-reduced-motion` sets **all** durations to 0 ms
via the token layer, so the product degrades to instant rather than to "less smooth".

---

## 5. Accessibility

- Visible focus ring on every control (`:focus-visible`, 2 px, offset 2 px).
- Skip link to the workspace.
- `aria-current="page"` on navigation, `aria-pressed` on segmented filters,
  `aria-checked` on switches, `role="switch"`, `aria-live="polite"` on toasts.
- Status is never colour-only: every lozenge has a word and a shape; the baton nodes carry a
  state word in the card body.
- Contrast, measured rather than asserted (WCAG relative luminance):

  | Pair | Ratio |
  |---|---|
  | body ink on canvas | 16.0:1 |
  | secondary ink on canvas | 9.5:1 |
  | tertiary ink on canvas | 5.5:1 |
  | muted (timestamps, labels) on canvas | **5.3:1** |
  | muted on white | 5.9:1 |
  | shell ink on shell | 13.8:1 |
  | status inks on their own washes | 6.3–6.8:1 |
  | ink on the sodium button | 7.5:1 |

  The muted grey started at `#77817C` (3.61:1) and was darkened after measurement —
  it failed AA for the small text it is used on.
- Dialogs and drawers close on Escape and restore the page scroll lock.

---

## 6. Responsive behaviour

| Width | Behaviour |
|---|---|
| ≥ 1180 px | rail + content + inspector |
| 900–1180 px | inspector drops below the case thread |
| < 900 px | rail collapses to icons; search becomes an icon button |
| < 640 px | page head stacks; the due-date column is dropped from list tables |

Tap targets stay ≥ 32 px; the small buttons are only used inside dense table rows.

---

## 7. What this system refuses

No purple gradients. No glassmorphism. No card grid as a page structure. No all-caps
eyebrow above every heading. No `A · B · C` meta strings. No emoji. No decorative charts —
the meter exists because it encodes the ratio of blocked to verified work, and it is removed
where that ratio is not the question.
