# Skill stack for Relay's interface

Phase 1 asked for a skill audit before any UI code. This records what was actually read,
what could be installed in this environment, what was deliberately **not** adopted, and
what each source changed in the product.

## Environment findings (first, because they bound everything else)

| Capability | Result |
|---|---|
| `npm` registry | reachable — UI dependencies and webfonts installed normally |
| Atlassian / Forge network | **not reachable** from the build environment; nothing was deployed from here |
| Headless browser (Playwright/Chromium) | **not available** — the browser download is blocked by the egress allowlist |
| Skill CLIs (`ui-ux-pro-max-cli`, `npx skills add …`) | not installed — see below |

Because no browser could be installed, "visual verification" in this milestone means:
screens rendered through `renderToStaticMarkup` with content assertions, the Vite build
compiling cleanly, a typecheck, and the dev server running for inspection in the user's own
browser. **No screenshots were captured, and none are claimed.** That gap is recorded in the
implementation report rather than papered over.

## Sources read

| Source | How it was obtained | Used for |
|---|---|---|
| `anthropics/skills` → `frontend-design/SKILL.md` | fetched in full (9.4 kB) | the art-direction method and the anti-generic checklist |
| `vercel-labs/agent-skills` → `web-design-guidelines` | fetched; it is a pointer to a guidelines URL plus a `file:line` review format | accessibility/usability review discipline |
| `Leonxlnx/taste-skill` → `skills/taste-skill/SKILL.md` ("tasteskill v2") | fetched | the page-vs-app-screen distinction; "put the real output on screen as material" |
| `nextlevelbuilder/ui-ux-pro-max-skill` | not installed (`npm i -g ui-ux-pro-max-cli` was not run) | reference only — its generator produces a design *system* from a prompt, which conflicts with writing Relay's identity by hand |
| `emilkowalski/skills` | not installed | motion principles applied from first-hand knowledge (short, purposeful, reduced-motion aware); no decorative animation shipped |

**Why the CLIs were not installed.** Both are interactive generators aimed at producing a
starting design system. Relay needed the opposite: one considered identity, chosen against
the brief's specific subject (housing repairs, custody of promises, evidence). Running a
generator first would have produced a palette and type scale that then had to be argued back
out of. The methodology was adopted; the tool was not. This is recorded as a deliberate
choice, not an omission.

## The one thing the audit changed

The `frontend-design` skill names the current AI-design tells explicitly: warm cream
background + high-contrast serif + terracotta accent; near-black + a single acid accent;
broadsheet hairlines; the identical rounded-card kit; and template chrome (all-caps
eyebrows, `A · B · C` meta strings, mono labels everywhere).

My first instinct was cream + serif + oxide-orange, which is the first tell on that list, and
it was already half-written when the skill was read. It was discarded. What replaced it is
in `RELAY-DESIGN-SYSTEM.md`; the short version is a **mineral-grey canvas, a petrol-black
navigation shell, and sodium-amber as the only "look here" colour** — a palette borrowed from
operational signage rather than from SaaS. The type is one grotesque (Schibsted Grotesk),
bundled locally, with IBM Plex Mono reserved for identifiers, dates and counts.

The taste-skill's app-screen framing also changed structure: this is a place of work, so the
navigation stays chrome-thin, density is preferred to decoration, and the loudest element on
the overview is the *decision* (what is blocked), not a hero.

## What was adopted, source by source

- **frontend-design** → the two-pass method (plan, critique against the brief, then build);
  the ban on gradient/glow/identical-card decoration; line lengths under 80 characters for
  prose; "spend boldness in one place".
- **web-design-guidelines** → focus visibility on every interactive element, real
  `aria-current`/`aria-pressed` state, `prefers-reduced-motion` honoured in tokens, labels on
  icon-only buttons, no colour-only status (every lozenge carries text and a shape).
- **taste-skill** → treat the screen as something worked in, not read; put the *material* on
  the screen (the actual quoted comment, the actual refusal message an agent sees, the actual
  projection JSON) rather than describing it.
- **Emil Kowalski (motion)** → motion only where it explains a state change or a spatial
  relationship: drawer slide, dialog pop, toast entry, 120–180 ms, one easing curve. Nothing
  animates on hover except colour and border.

## Deliberately not done

- No design-system generator, no Tailwind, no component library. Relay's components are its
  own, in `app/ui/src/components`, because the whole point of the identity is that it is not
  a kit with a theme applied.
- No emoji, no illustration, no gradients as decoration, no glassmorphism, no pill-shaped
  everything.
