# Codegeist 2026 — Deep Research, Product Discovery and Competitive Strategy

**Prepared for:** an independent team entering Atlassian Codegeist 2026
**Research date:** 30 October 2026 (54 days before the 22 December 2026 submission deadline)
**Scope:** competition analysis · Atlassian Forge technical reality · human-problem discovery · 19 original product concepts · comparative scoring · 5-item shortlist · top 3 recommendations · full technical and demonstration plan for the recommended build

---

## How to read the evidence in this report

Intellectual honesty matters more than a confident tone. Every substantive claim below is tagged:

| Tag | Meaning |
|---|---|
| **[V]** | **Verified** in primary source — the official Devpost rules page, or Atlassian developer documentation read directly. Treat as fact as of the date above. |
| **[R]** | **Research / third-party evidence.** A published study, regulator, or survey. Confidence is stated where the source is a secondary aggregator rather than the primary study. |
| **[H]** | **Hypothesis or judgement** — my inference, not a sourced fact. Argue with it. |

Where a widely-repeated statistic is weak (many safety and "AI productivity" statistics circulating in 2025–26 come from vendor blogs recycling each other), I say so rather than laundering it into the report.

---

# 1. Executive summary

## 1.1 What the competition actually rewards

Codegeist 2026 is not a "best AI demo" contest. Read the five judging criteria literally: **Technological Implementation, Design, Potential Impact, Innovation, Presentation — 20% each**, with tie-breaks resolved *in that order*, which quietly weights Technological Implementation highest. [V]

Three consequences follow, and they drive every recommendation in this report:

1. **Depth in Forge beats breadth of AI features.** A judge scoring "Technological Implementation" is asking whether you used the platform *skillfully* — modules, scopes, storage, async patterns, Rovo modules, Teamwork Graph — not whether you used a fashionable model. [V]
2. **"Potential Impact" is scored against what is *demonstrated*, not what is claimed.** The rules say the solution must "actually address that problem based on what's demonstrated." A moving problem statement attached to a thin prototype scores badly. [V]
3. **Design is 20%, and most hackathon entries lose it here.** "Not just a technical proof of concept" is explicit. A coherent, permission-aware, empty-state-handling, error-tolerant product experience is worth as much as your cleverest algorithm. [V]

There are **33 prizes**: 9 grand prizes (1st/2nd/3rd in each of three categories) and 24 bonus prizes (6 each across Agents, MCP, Teamwork Graph, Marketplace). With 818 participants at the time of writing [V], the field is large but the prize surface is unusually wide. **Category and bonus-prize selection is a strategic decision, not an afterthought.**

## 1.2 The technical discovery that changes the strategy

Most entrants in previous years assumed that serious AI in Forge meant calling an external model, declaring egress, and losing the Runs on Atlassian badge. **That is no longer true.**

- The **Forge LLMs API** (`@forge/llm`, `llm` manifest module) is now available with Atlassian-hosted Claude models — Haiku, Sonnet and Opus tiers — with **tool calling**, **streaming**, context windows up to **1M tokens** on Sonnet/Opus, and **no data egress**. Apps using it remain "Runs on Atlassian" eligible. [V]
- Rate limits are real but generous for a demo: **100 requests/minute, 500,000 tokens/minute, 5-minute maximum inference**, and **text-only input/output** — no vision. [V]
- **Teamwork Graph** is queryable from Forge via a GraphQL wrapper over Cypher (`api.asUser().requestTeamworkGraph()`), with per-object-type read scopes and a hard 50-scope cap. It is **read-only for queries**; you write data in through the separate `graph:connector` module. It is **Preview**, requires **organisation-admin install permissions**, and currently only works for apps installed into **Jira or Confluence**. [V]

That last pair of constraints is the single most under-appreciated competitive fact in this hackathon. **Teamwork Graph scopes require org-admin approval at install.** If your app *depends* on TWG to function, a judge who is not an org admin on their test site may be unable to complete installation — which risks failing Stage One's pass/fail requirement that the project "must be capable of being successfully installed in a judge's test environment." [V]

**Therefore: build the product so that it is fully functional on Jira/Confluence REST APIs and Forge LLMs, and treat Teamwork Graph as a strictly optional enhancement layer that degrades gracefully.** Then claim the TWG bonus with a recorded demonstration and an explicit "works without TWG" statement. This single architectural decision protects your Stage One pass *and* lets you chase the least-crowded bonus prize.

## 1.3 The strategic gap in the field

The 2025 winners (Secure Notes, Frank., FleetOps, YardMaster, Sherlock Sync, AI Backlog, Sidekick4All) share a pattern worth internalising: **each captures structured truth at the point of work, inside a governance model, and then makes that truth reusable.** None of them was "an AI assistant." They were *instruments* — a secure notes console, an HR permission layer, a field incident capture tool. [R — Atlassian's own winner announcement]

The 2026 theme is "build with context… decisions that actually move work forward." The obvious reading is "summarise more things." The reading that wins is: **organisations already contain the context needed to prevent harm; the failure is not retrieval, it is that nobody is accountable for carrying a specific commitment across a boundary — a shift change, a department, a language, a channel.** Almost all mainstream AI tooling optimises retrieval. Very little optimises *continuity of obligation*. That gap is where this report lands.

## 1.4 The recommendation

**Recommended build: "Relay" — a promise-and-obligation ledger for high-consequence shift operations.**

Relay extracts the *commitments an organisation has made to real people* from the surfaces where they are actually buried — Jira tickets and comments, Confluence handover notes, intake forms — binds each to a named owner and a due moment, carries them across shift and department boundaries, and refuses to let a shift close while any commitment is unowned. Its headline artefact is not a summary; it is a **handover debt** number and a signed, auditable handover record.

Why it wins on each criterion: it needs the LLM (extracting and reconciling free-text commitments that no regex can find), it needs Forge specifically (work + people + docs + permissions in one graph, with agent surfaces inside Jira), it is measurable (dropped-obligation rate, time-to-ownership, handover completion), and it demos in three minutes with a visible, emotional "we nearly missed this" moment.

Its weaknesses are stated plainly in §9.4. The most serious: **handover summarisation is a known pattern**, so the concept only survives if the demo leads with closed-loop accountability and never looks like a summary.

Runners-up: **Close Call** (near-miss learning that proves the fix worked) and **Open Door** (a barrier-reporting loop that starts from disabled users' own words rather than from a scanner).

## 1.5 What I will not tell you

I will not tell you any of these can win. Nine grand prizes across three categories means roughly a 1-in-90 chance for an average entry; strong execution in a lightly-contested category moves that materially, but the judges are Atlassian staff and partners scoring 800+ submissions in a four-week window. What I can tell you is which ideas are *defensible*, which are *derivative*, and where the field is likely to be crowded.

---

# 2. Official Codegeist 2026 competition analysis

## 2.1 Verified facts

| Item | Detail | Source |
|---|---|---|
| Sponsor / administrator | Atlassian Pty Ltd / Devpost | [V] rules §2 |
| Registration & submission window | Tue 27 Oct 2026 09:00 PT → **Tue 22 Dec 2026 12:00 PT** (= 15:00 ET / 20:00 UTC / 21:00 WAT) | [V] rules §1 |
| Judging | 5 Jan 2027 13:00 PT → 3 Feb 2027 17:00 PT | [V] rules §1 |
| Winners announced | ~15 Feb 2027 | [V] rules §1 |
| Prize pool | $120,000+ cash | [V] |
| Grand prizes | Per category: 1st $15,000 (×3), 2nd $8,000 (×3), 3rd $5,000 (×3) = **$84,000** | [V] rules §8 |
| 1st place extras | 2 × Team 2027 (AMER) tickets per winning team, travel not included; blog recognition; signed Atlassian Williams Racing swag | [V] |
| Bonus prizes | 4 categories × 6 winners × $1,500 = **$36,000** | [V] rules §8 |
| Participation | 300 × Atlassian Developer Swag Pack, first-come, max 4 per submission | [V] |
| Categories | Apps for Software Teams · Apps for Business Teams · Apps for Specialized Industries | [V] |
| Judging criteria | 5 × 20%, tie-break in criterion order (Tech → Design → Impact → Innovation → Presentation) | [V] rules §6 |
| Video | Under 5 minutes, public on YouTube; **"judges are not required to watch beyond three minutes"** | [V] rules §4 |
| Install | Must be installable in a judge's environment via **installation link** + full configuration instructions | [V] |
| Language | All materials in English (or full English translation) | [V] |
| New/existing work | Must be new, **or** rebuilt/updated on Forge after 27 Oct 2026, with a manifest and ≥1 Forge module | [V] |

## 2.2 Prize mechanics that matter

**One grand prize + one bonus prize maximum per submission.** [V] This is the most important sentence in the rules for planning purposes. You cannot stack four bonuses. You must choose **one** bonus track and optimise for it deliberately from day one.

**Grand prizes are awarded per category** ("3 winners, 1 per Category"). [V] You are not competing against all 818 participants for a single trophy; you are competing against the submissions in your chosen category. Category choice is therefore a *portfolio decision about the density and quality of your competition*, and you will never see that density before submitting. Judgement call: **Specialized Industries** historically attracts fewer but more domain-authentic entries; **Business Teams** attracts the largest volume of HR/sales/marketing productivity apps; **Software Teams** attracts the highest technical density (many professional Atlassian ecosystem developers enter here).

**Stage One is pass/fail** on "reasonably fits the theme and reasonably applies the required APIs/SDKs." [V] This is where TWG-only architectures die. Make the core path bulletproof on the most boring APIs available.

## 2.3 Eligibility — checked against your location

The hackathon is open to individuals at least the age of majority in their country of residence, teams, and organisations. Excluded countries/territories listed: **Belarus, Brazil, Crimea, Cuba, Iran, North Korea, Myanmar, Quebec, Russia, Sudan, Syria**, plus US sanctions-list entities and anyone connected to the promotion entities. [V]

**Nigeria is not on the excluded list.** You are eligible as an individual residing in Lagos, subject to the age-of-majority requirement and to your own tax/prize-receipt obligations. Two practical notes: prize delivery requires "completed winner affidavit and other required forms" within ten business days [V], and monetary prizes are paid by mail or electronic transfer — if you win, ensure your payment details and identity documents are ready and consistent, because a failed affidavit step can forfeit a prize. [V]

## 2.4 The four bonus prizes, assessed honestly

| Bonus | Requirement [V] | Effort to qualify | Likely crowding | Verdict |
|---|---|---|---|---|
| **Best Agents** (Rovo/assignable agents) | `rovo:agent`, `rovo:agentConnector`, or reusable `rovo:skill` + `rovo:action` modules other agents can invoke | Low–medium: an agent module plus 3–6 actions | **High** — cheapest bonus to claim, so most entries will tick it | Claim it, but do not let it shape the product |
| **Best app with Atlassian MCP** | Expose tools via `rovo:mcp` (max one module, ≤50 tools, ≤64-char action keys) | **Very low** — largely declarative | **Very high** — a manifest block | Almost free. Add it late. Judges will discount it if it is the only thing you did |
| **Best Teamwork Graph integration** | Connect data into the graph (`graph:connector`) and/or consume it via the TWG API | **High** — org-admin install, granular scopes, Preview churn, Cypher fluency | **Likely the lowest of the four** because of that friction | **Best expected value per unit of genuine engineering**, *if* the product still works without it |
| **Best Marketplace published app** | Published to Marketplace or submitted for listing; provide listing link or review ticket | Medium — listing metadata, privacy/security tab, licensing decision, review queue | **Low, because most teams never do it** | **Highest asymmetry in the whole competition.** Requires starting the listing process in week 1–2, not week 7 |

**Recommendation:** target **Best Teamwork Graph integration** as your primary bonus, because it is the one where a genuine capability gap (org-admin-only approval, Preview instability, Cypher) filters out lazy entries — *and* your Stage One-safe architecture lets you pursue it without risk. **Then also submit the Marketplace listing** if you can start it by mid-November; note the rules permit selecting only the bonus prizes you meet, and only one bonus prize can be won, so decide which single claim you foreground in the submission text.

## 2.5 What "excellent" looks like under each criterion

| Criterion | What most entries do | What an excellent entry does |
|---|---|---|
| **Technological Implementation (20%)** | One resolver, one LLM call, one issue panel | Multiple surfaces (issue panel + agent + MCP + macro); correct async event fan-out for long LLM jobs; storage with a real schema; granular scopes (least privilege); graceful degradation when a scope is absent; no invented APIs |
| **Design (20%)** | A textarea and a "Generate" button | Empty states, loading skeletons, failure explanations, permission-aware UI that hides what the user may not see, keyboard/focus management, plain-language copy, and a coherent visual identity that looks like a product rather than a Forge template |
| **Potential Impact (20%)** | "Healthcare is a $10T market" | One named user, one named harm, one number that changes, and a demonstrated before/after inside the video |
| **Innovation (20%)** | "AI agent swarm" | A mechanism nobody has built, or a familiar mechanism applied to a population nobody serves; explicitly distinguished from adjacent products |
| **Presentation (20%)** | 5-minute screen recording with mouse wandering | A 3-minute cut: problem (25s) → live product (100s) → measured outcome (30s) → architecture flash (20s) → close (15s), with captions and a legible cursor |

---

# 3. Technical requirements and Atlassian ecosystem opportunities

This section is the engineering reality check. Everything here was verified against Atlassian developer documentation.

## 3.1 Forge runtime — the constraints that shape design

| Capability / limit | Detail | Design implication |
|---|---|---|
| Runtime | Node.js (`nodejs24.x` in current examples) [V] | Modern syntax available; no filesystem, no native modules |
| Synchronous function timeout | **~25 seconds** [V/R — long-standing platform limit, repeatedly confirmed in community threads] | **Any LLM call that may exceed ~20s must run in an async event**, with the UI polling storage or receiving a Realtime event |
| Async functions | Up to **900 seconds**, opted in via function `timeout` [R — RFC-57 / community confirmation] | Use for extraction over a whole shift's worth of tickets |
| Async events | Queue + consumer pattern | Fan-out one event per work item to stay inside per-invocation limits |
| Scheduled triggers | Cron-style, shared invocation limits [V] | Ideal for the "06:00 shift-readiness check" heartbeat |
| Web triggers | Static vs dynamic; **dynamic web triggers break Runs on Atlassian eligibility, static ones do not** [R — developer community, Atlassian staff answer] | If you need external ingress (e.g. voice-note upload), use a *static* trigger with a fixed response shape |
| UI Kit | Declarative React-like components rendered by Atlassian | Fastest route to a coherent, accessible UI; strongly recommended for Design marks |
| Custom UI | Bring your own React app, iframe-sandboxed | Needed for rich interactions (drag-and-drop ledger, live board); you own accessibility |
| Storage | Key-value store, custom entity store, **Forge SQL** (MySQL-compatible/TiDB, ~1 GiB per installation, no foreign keys), Object Store [V/R] | For Relay's obligation ledger, Forge SQL with explicit indexes is the right call; verify GA status in your dev environment in week 1 |
| Realtime | Forge Realtime (EAP/Preview) [V] | Live handover board updates; optional, degrade to polling |
| Egress | Declared per-domain in `permissions.external.fetch.backend`; any egress (beyond analytics) makes the app **ineligible for Runs on Atlassian** [V] | Avoid entirely; use Forge LLMs |
| Marketplace | Licensing flag, privacy/security tab, review queue [V] | Start listing early if chasing the Marketplace bonus |

## 3.2 Forge LLMs — the capability that should anchor your AI design

```yaml
modules:
  llm:
    - key: relay-llm
      model:
        - claude
```

- SDK: `@forge/llm` with `list()`, `chat()`, `stream()`. [V]
- Request shape: `messages[]`, optional `temperature`, `max_completion_tokens`, `top_p`, **`tools[]`** and **`tool_choice`** — i.e. genuine function calling. [V]
- Response reports token usage per request. [V]
- Models (as documented): `claude-haiku-4-5-20251001`, `claude-sonnet-4-5-20250929`, `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-opus-4-6/4-7/4-8`, `claude-opus-5`. [V]
- Context windows: **Haiku 200K in / 64K out; Sonnet and Opus 1M in / 128K out**. [V]
- Limits per installation: **100 requests/min, 500,000 tokens/min, 5-minute inference cap**. [V]
- **Text only.** "Only text input/output is currently supported; multimodal support may be considered later." [V]
- Adding the `llm` module triggers a **major version upgrade requiring admin approval** for existing installs. [V]
- Requests pass through Atlassian's moderation; high-risk messages per the Acceptable Use Policy are blocked. [V]

**Implications you must design around:**

1. **No vision.** Any concept relying on "workers photograph the hazard and AI reads it", or "upload the scan and AI finds the problem", requires an external multimodal provider → egress → loses Runs on Atlassian and adds key management. Design text-first, and let photos be *evidence attachments* rather than model input.
2. **1M-token context is a superpower.** You can put an entire shift's ticket corpus, the last seven handover pages, plus the unit's policy document in a single call. Very few entrants will notice this. It enables *reconciliation across time*, not just summarisation of one artefact.
3. **100 rpm is not a bottleneck for a demo but will be for a batch job.** A 400-ticket backfill must be batched and queued.
4. **The 5-minute inference cap plus the 25s sync limit** forces the "kick off async → poll/notify" pattern. Doing this properly is itself a Technological Implementation signal to judges.
5. **Moderation screening is a feature, not a bug, for sensitive domains** — but it also means a product whose core input is graphic content (moderation, child safety) will hit blocks. Say so openly in your design and keep the LLM operating on *metadata and reporter narratives*, not on the harmful material itself.

## 3.3 Rovo surfaces

| Module | What it gives you | Gotchas [V] |
|---|---|---|
| `rovo:agent` | A named agent with `prompt` (inline or as a resource), `conversationStarters`, `actions`, `skills`, `followUpPrompt`. Surfaces: Rovo chat side panel (Jira/Confluence), `/ai` toolbar, Automation rules, and programmatic launch via `@forge/bridge` rovo API | Name ≤30 chars; app can have several agents; long inline prompts bloat the manifest (use a resource file); Atlassian runs safety screening and can block a deployment |
| `rovo:action` | Executable operation invoked by the agent. `actionVerb` ∈ GET / CREATE / UPDATE / DELETE / TRIGGER; inputs typed `string`/`integer`/`number`/`boolean`; **5 MB data ceiling** | **Agents invoked by automation rules cannot call CREATE/UPDATE/DELETE/TRIGGER actions.** Plan read-only automation paths, write paths via triggers/direct functions |
| `rovo:skill` (Preview) | A `SKILL.md` playbook plus optional reference files, declared against specific actions. Keeps multi-step orchestration out of the prompt | No executable scripts in skill directories during Preview |
| `rovo:mcp` (Preview) | Exposes up to 50 of your actions as MCP tools to Rovo Studio agents **and third-party MCP clients**. Max one module per app | Tool keys <64 chars; data access is scoped to the workspace where installed (multi-product needs multi-app compatibility) |
| `rovo:agentConnector` | Bridges an external A2A 1.0 agent into Jira so it can be assigned work and @mentioned | Requires you to host an A2A server (JSON-RPC 2.0); sync timeout 55s, streaming 900s; the app system user stops being mentionable |

**Assignable agents are GA in Jira** (May 2026) — an agent appears in the assignee picker like a teammate, can be @mentioned, and can be placed in workflows, with admin-defined permissions and completion criteria. [R — Atlassian announcement + trade press] For Forge agents, assignability depends on the agent's configured **work-item surface**; verify this on your own dev site in week 1 rather than assuming it. [H, based on community guidance for Studio-created agents]

This is the most strategically under-used feature in the hackathon. An agent that *holds* a work item — rather than answering a question — is qualitatively different from a chatbot, and it is precisely what the "Best Agents" bonus describes.

## 3.4 Teamwork Graph — power and trapdoors

**Query path:** GraphQL at `/gateway/api/graphql/twg`, invoked from a Forge function via `api.asUser().requestTeamworkGraph(query, variables)` or from Custom UI via `requestTeamworkGraph` from `@forge/bridge`. Cypher is wrapped in a GraphQL field (`cypherQuery` or a persisted `customQuery`), and results are typed (`CypherQueryResultNode` for a single object, `CypherQueryResultListNode` for `collect()` results). [V]

**Scope model:** per object type, `read:graph:<object>:<product>` — e.g. `read:graph:issue:jira`, `read:graph:page:confluence`, `read:graph:user:atlassian`, `read:graph:project:jira`. **Every type you traverse needs a scope, even if you never return it.** Forge caps scopes at 50. [V] Admins can toggle individual scopes on or off in Atlassian Administration. [V]

**Object types available for query** include Confluence page/blogpost/comment/space/database/whiteboard; Jira work item, comment, status, priority, remote link, worklog, space (project), board, sprint, version; Atlassian user; Atlassian team; Loom meeting/video; Opsgenie team; and "external" objects ingested by connectors. [V]

**Writing into the graph:** the `graph:connector` Forge module plus the Connector SDK, mapping your data to standardised object types (Work item, Document, Pull request, Calendar event, Deal, Customer organisation, Service, Test, Deployment, Vulnerability…). Scopes: `write:object:jira`, `read:object:jira`, `delete:object:jira`. Jira-only installs today. [V]

**Trapdoors, in order of severity:** [V]
1. **Org-admin permissions required to install** apps with TWG scopes; only Jira/Confluence installs supported.
2. **Preview** — breaking changes with a minimum 1-month notice; the EAP-wide `read:graph:jira` scopes are being retired in favour of per-object scopes, and existing installs must re-consent.
3. Gates documentation warns apps should **only be installed in test organisations** unless there is an approved production path, because org-wide graph access is sensitive.
4. Read-only for queries; you cannot "write back" without the connector module.

None of this makes TWG unusable. It makes it a **deliberate, optional, well-documented enhancement**.

## 3.5 Product surfaces available to you

| Product | Surfaces worth knowing |
|---|---|
| **Jira** | `jira:issuePanel`, `jira:issueAction`, `jira:issueGlance`, `jira:projectPage`, `jira:globalPage`, `jira:adminPage`, `jira:dashboardGadget`, plus workflow validators/conditions/post-functions and event triggers |
| **Jira Service Management** | portal header/subheader/footer, request-create property panel, request detail (main + right sidebar), request view action, queue page, organisation panel, Assets import type, UI modifications [V — from the JSM module index] |
| **Confluence** | global page, space page, content byline item, macro, content action (verify exact module keys against the Confluence module index before writing the manifest) |
| **Cross-product** | Events (`avi:jira:created:issue`, comment events, transition events), scheduled triggers, web triggers, async events |

The JSM surface set is *far* richer than most entrants realise, and it is the natural home for any product where the person experiencing the problem is **not** the person using Jira. That asymmetry — the vulnerable human is a portal user, the accountable human is a Jira user — is the structural key to several of the concepts below.

## 3.6 Cost reality for a 7-week build

- Forge has been on **consumption-based pricing since 1 January 2026**, with a free allowance (order of 100,000 GB-seconds of compute, 5 GB storage) and paid overage. [V/R]
- **Forge LLM usage is billed in credits to the app developer**, not the customer. [V] At demo volumes this is trivial; a careless scheduled job that re-processes every ticket every hour is not.
- Practical budget guidance: cap your demo dataset (e.g. 60–120 work items), batch extraction, cache results in Forge SQL keyed by content hash so re-renders never re-invoke the model. **Caching-by-hash is both a cost control and a quality signal** — judges notice idempotence.

---

# 4. Existing solutions and market gaps

## 4.1 What already exists, by problem domain

**Digital accessibility.** The Atlassian Marketplace already contains AccessLens for Confluence (space scanning, severity triage, exceptions, CSV/JSON export), Accessible Web for Jira (syncs manual audit results from the RAMP platform into Jira), Remediator.app (accessibility custom fields plus one-click VPAT generation), and Unstoppable for Confluence (in-product navigation/alt-text improvements). [R — Marketplace listings] Outside Atlassian: Deque axe, Level Access, TestParty, Siteimprove, UserWay. [R]

*Where they fail:* nearly all are **auditor-side**. They begin from an automated scan or an imported audit CSV, and they end at a task in a backlog. None begins from **a disabled person's own description of a barrier**, in their own language and vocabulary, and none closes the loop **back to that person** with a plain-language status and an accessible workaround in the meantime. Automated scanners also systematically miss the criteria that matter most to real users (keyboard traps, screen-reader announcement quality, cognitive load, caption accuracy). [R/H — well-established criticism in the accessibility profession]

**Patient and care coordination.** EHR-embedded tools (Epic, Oracle Health), care-transition platforms (CarePort and similar), and social-care referral networks (Unite Us, findhelp) dominate. [R] They are expensive, hospital- or payer-anchored, and closed. **Inter-organisational coordination** — the space between a hospital, a home-care agency, a family, and a GP surgery — remains largely manual: phone calls, faxes, PDFs, and a WhatsApp group. This is not a technology gap; it is an *accountability* gap.

**Workplace safety / EHS.** Mature incumbents: SafetyCulture (iAuditor), Intelex, Cority, Benchmark Gensuite, Enablon. [R] Their own 2026 benchmarking reports that **90% of incidents, hazards and near misses are under-reported**, up from 79% the year before, and that verifying whether corrective actions actually worked remains an unmet need. [R — Benchmark Gensuite 2026 EHS Benchmarking Report, via trade press; medium confidence, vendor-sponsored research]

*Where they fail:* they are separate systems of record that a frontline worker must be persuaded to open. They optimise for the safety professional's dashboard, not the worker's thirty seconds. And critically, they rarely close the loop back to the reporter ("here is what changed because you reported") — which is the single strongest lever on reporting participation.

**Trust & safety / content moderation.** Tooling exists (ActiveFence, TaskUs/CenCore operations, platform-internal queues, the Berkeley Protocol-style wellbeing frameworks). [R/H] The research consensus is that the harm is *organisational*, not merely exposure-driven: a University of Washington study found that hours of exposure was not a robust predictor of outcomes, while perceived workplace culture, negative automatic thoughts, perceived stress and avoidant coping were; probable PTSD was ~26% and probable depression 42–49% across samples. [R — arXiv/UW study reported by Zevo Health; medium confidence on exact figures, high confidence on the direction]

*Where they fail:* nothing in the workflow *counts exposure and enforces limits*. A reviewer's queue is optimised for through-put, not for the human processing it. And almost nothing prevents the same human from seeing the same traumatic item twice because two users reported it.

**Vulnerable customers and financial harm.** Banks run fraud analytics on transactions; regulators require vulnerable-customer policies (UK FCA Consumer Duty; equivalent duties emerging elsewhere). [R/H] Fraud scoring does not read the *narrative* of a case, and case teams handling bereavement, scam recovery, hardship and power-of-attorney disputes work in disconnected systems.

## 4.2 Patterns in successful Codegeist submissions

From the 2025 winners and the 2024 highlights: [R]

1. **Instrument, not assistant.** Every top-three project was a purpose-built instrument for a specific job (secure notes, HR profiles, fleet incident capture, yard orchestration, code-to-doc linking, backlog shaping, calendar bridging).
2. **Permission-awareness as a headline feature.** "Frank." won Business Teams largely on HR-safe permissions; Secure Notes won Software Teams on governance and auditability.
3. **A named operational artefact.** Winners produced *a thing*: a secure note, a consolidated profile, a structured incident record, a shift of yard movements. Not "insights".
4. **One strong surface, done well.** Not four half-built surfaces.
5. **Rovo used where it earns its place** — answering permission-aware questions over data the app owns.

**Anti-patterns visible in losing submissions** (inferred from the judging criteria and gallery descriptions rather than measured): generic summarisers, dashboards without decisions, "multi-agent" architectures with no user-visible benefit, and apps whose only Atlassian integration is an issue-panel text box. [H]

## 4.3 The gap, stated precisely

> **Existing tools manage *records*. Almost nothing manages *obligations* — the specific, time-bound promises an organisation has made to a specific person, which must survive the transition between the humans who are accountable for them.**

Closely related, and equally under-served:

- **Evidence of care** — proof, for a regulator or a family, that a commitment was seen, owned, and closed (not just that a ticket existed).
- **The loop back to the person affected** — most tools stop at the internal task; almost none tell the human what happened.
- **Silence as signal** — nobody measures who *isn't* reporting, complaining, or asking. Under-representation is invisible by construction.

Each of these is a product opportunity that is genuinely new terrain rather than a repackaging exercise.

---

# 5. Important overlooked human problems

Ranked by (severity × prevalence × neglect). Ages, genders, incomes, abilities and geographies are noted because a solution that only works for literate, English-speaking, smartphone-owning adults in rich countries excludes the people with the worst outcomes.

| # | Problem | Who carries it | Evidence | Why it is neglected |
|---|---|---|---|---|
| 1 | **Commitments dropped at handover boundaries.** A promised call-back, a pending result, a family's question, a care task — lost between shifts, departments or organisations | Patients and residents; their families; frontline staff who inherit the failure | Joint Commission: miscommunication at handoffs implicated in up to **80% of serious medical errors**; I-PASS structured handover cut preventable adverse events **23–30%** (NEJM/AHRQ); discharge-communication interventions cut 30-day readmissions **13.5% → 9.1%** (JAMA Netw Open meta-analysis) **[R — high confidence on direction, treat exact percentages as indicative]** | The fix is organisational, not technological, so no vendor owns it; incumbents sell EHR modules, not coordination across boundaries |
| 2 | **Near-miss silence.** Workers see the close call, do not report it, and the injury happens later | Frontline workers in manufacturing, construction, care, logistics, utilities — disproportionately lower-income, migrant, and non-native-language workers | Vendor benchmarking: **90%** of incidents/hazards/near misses under-reported (up from 79%); separate Oct 2026 survey: **63%** of industrial sites say fewer than 1 in 20 workers report monthly, or do not track it; only 15–20% of near misses get investigated **[R — vendor/industry surveys, medium confidence]** | Reporting tools are built for compliance evidence, not for the worker's incentive; blame culture persists |
| 3 | **Barriers reported by disabled people are not the barriers being fixed.** Organisations remediate what scanners find, not what users hit | Disabled people — blind/low-vision, Deaf/hard of hearing, motor-impaired, cognitively diverse; ~16% of the global population | EAA enforceable since **28 Jun 2025**; ADA Title II WCAG 2.1 AA deadlines **26 Apr 2027/2028**; HHS §504 **May 2026/2027**; ~3,117 federal website accessibility suits in 2025 **[R — regulatory dates high confidence; litigation count medium]** | Accessibility is procured as audit + VPAT, which is a *document* deliverable, not an outcomes deliverable |
| 4 | **Moderator and responder trauma.** The people who protect others from harmful content carry clinical-level harm | Content moderators, trust & safety analysts, abuse-desk staff, emergency dispatchers | ~**26%** probable PTSD and **42–49%** probable depression in moderator samples; organisational factors (culture, pacing, disclosure) predict outcomes better than exposure hours **[R — peer-reviewed + UW study, high confidence on direction]** | The workforce is invisible, often outsourced, and the problem is framed as individual resilience rather than work design |
| 5 | **Employed family caregivers navigating leave and support alone.** People quietly collapse under care work while holding a job | 59M US adults caring for an adult; 63M including children with complex needs; ~27 hrs/week average; 23% in debt because of caregiving; 70% of working-age caregivers employed **[R — AARP/NAC 2025 & AARP Valuing the Invaluable 2026, high confidence]** | Benefits/HR teams answer these questions case-by-case; policies are scattered across PDFs and intranets; nobody owns the employee's *journey* |
| 6 | **Elder financial exploitation** handled case-by-case with no pattern learning | Adults 60+, disproportionately women and those living alone; their families | FBI IC3 2025: **201,266 complaints** from 60+, **$7.748B** reported losses, +59% YoY; crypto present in **$4.35B** of it **[R — FBI primary data via official releases, high confidence]** | Fraud analytics model transactions; the *narrative* and the *vulnerability context* are unmodelled; victims under-report from shame |
| 7 | **Administrative burden ("time tax")** that falls hardest on the poorest and least literate | Low-income households, disabled people, older people, migrants | US households spend ~**12 billion hours/year** on government paperwork (~6 working days per person), valued at ~$430B; the poorest spend ~73 more hours/year waiting than the affluent **[R — Annie Lowrey, "The Time Tax" (2026), citing federal and AAF estimates; medium-high confidence]** | Digitising a form does not reduce burden; it relocates it |
| 8 | **Reasonable accommodation requests** denied, delayed or never made | Disabled and chronically ill workers, neurodivergent workers | Deloitte (10,000 workers): **75%** of those who disclosed a disability requested no accommodation; of those who did, nearly **3 in 4** had at least one request rejected. 2026 survey: 56.8% found the process very/extremely challenging, 31.4% got no communication after asking. JAN: **61%** of implemented accommodations cost nothing; median one-time cost **$300** **[R — high confidence]** | HR case management is seen as admin, not as a duty of care |
| 9 | **Care-plan discontinuity for people living with dementia** across rotating carers | 57M people with dementia worldwide; ~13M US unpaid carers providing ~19B hours (~$446B) **[R — WHO/Alzheimer's Association, high confidence]** | Every new carer re-learns the person; preferences and routines live in someone's head |
| 10 | **Bereavement administration** — one death, dozens of organisations, each with its own process | Recently bereaved families; disproportionately older widows | No single-jurisdiction "tell us once" equivalent in most countries; the burden lands in the worst weeks of a person's life **[R/H]** | Nobody wants to productise grief, so it stays manual |

**Hypothesis worth stating plainly [H]:** the highest-leverage AI products for human welfare in 2026 are not diagnostic or generative. They are **accountability instruments** — systems that make a specific commitment to a specific person visible, owned, time-bound, and provably closed. That is a design pattern, and it is applicable to at least six of the ten problems above.

---

# 6. Nineteen original product concepts

Each concept is described against the seven requested dimensions (A–G). Concepts are ordered by final score (§7). Items marked **[core]** are the ones I would actually build.

A note on how these were generated: I deliberately did **not** start from technologies. I started from the ten problems in §5 and from one design question — *"what would have to be true for the person with the least power in this situation to be better off?"* — then asked which Atlassian surface that person's counterpart already works in. Concepts that survived that test are the ones that appear here.

---

## 6.1 **[core] Relay** — the promise ledger for shift-based operations

**A. Identity**
*One-liner:* Relay turns the commitments an organisation makes to real people into an owned, time-bound ledger that survives every shift change.
*Vision:* No promised call-back, pending result, or care task is ever lost because the person who knew about it went home.

**B. Human problem**
In any 24/7 operation — a care home, a hospital ward, a home-care agency, a plant, a utility control room — the outgoing shift knows things the incoming shift does not. Some of that knowledge is written down (badly, in free text); most of it is in someone's head. The people who absorb the failure are not the staff: they are residents, patients, families and customers who were told "someone will call you tomorrow" and nobody did. The Joint Commission associates handoff miscommunication with up to 80% of serious medical errors, and structured handover protocols reduce preventable adverse events by 23–30%. [R] In social care and home care the equivalent failure is quieter but constant: a missed medication prompt, a physio review nobody booked, a family question that died in a shift note.

**C. AI solution**
Relay does not summarise; it **extracts obligations and then audits them**. From work items, comments, handover pages and intake free text, the model identifies *commitments to a person* ("call Mrs Adeyemi's daughter about the discharge date", "chase the bloods result", "physio to review Tuesday") and normalises each into: who it was promised to, what was promised, by when, who owns it now, and what evidence would close it. It then performs three jobs no human reliably does:
1. **Reconciliation across time** — diff the last N shifts' obligations against the incoming plan using a 1M-token context window, and surface anything unowned.
2. **Debt computation** — a deterministic score (`handover debt`) of open, unowned or overdue obligations per unit per shift.
3. **Closed-loop enforcement** — an assignable Rovo agent holds the "Shift Handover" work item and cannot complete it until every obligation is accepted, reassigned, or explicitly dropped *with a written reason by a named human*.

*Why AI is necessary:* the signal lives in unstructured prose written under time pressure by people with different vocabularies. A rules engine cannot find "she was asking again about whether Dad can have his own room" and know it is an open commitment with a due date. The LLM is doing entity-and-intent extraction and cross-document reconciliation — genuinely hard NLP, not decoration.
*Context required:* work items + comments + status history, Confluence handover/unit pages, rota/assignment data, prior handover records, and (optionally) TWG relationships between people, work and documents.
*Human judgement stays:* clinical and operational priority is never decided by the model. Relay proposes; the receiving shift lead confirms. Dropping an obligation requires a human reason, which is retained as evidence.

**D. Human impact**
*Direct:* residents/patients/families who stop being dropped. *Indirect:* shift staff, who stop inheriting invisible failures; managers, who get an auditable handover record for inspections.
*Measurable:* dropped-obligation rate (obligations open > 24h with no owner), median time-to-ownership, handover completion rate, and repeat-omission rate per unit — all computable from the ledger itself. A realistic pilot target is a 50%+ reduction in unowned obligations within four weeks; that is a claim you can *demonstrate* rather than assert.
*Inclusion:* obligations can be captured from **voice notes** transcribed upstream (text-only model is fine), displayed in the worker's own language via the Forge i18n API and LLM translation at render time, and surfaced on the JSM customer portal so a family member can see "your request is owned by X, due Tuesday" without phoning anyone. Works on low-bandwidth: the portal is server-rendered text; no app install.

**E. Atlassian integration**
Modules: `jira:issuePanel` (obligation ledger on the work item), `jira:projectPage` (unit-level handover board), `jsm:portalRequestDetailPanel` (family-facing status), `rovo:agent` + `rovo:action` ×5–6 + `rovo:skill` (the handover playbook), `rovo:mcp` (expose `get_handover_debt` to third-party agents), `llm`, `function` (sync + async), `consumer` (LLM fan-out), `scheduledTrigger` (06:00 readiness sweep), Forge SQL for the ledger.
Products: Jira (system of record for work), JSM (system of record for the person's request), Confluence (handover knowledge and the signed record), Rovo (the accountability agent), Teamwork Graph (optional: one Cypher traversal from person → work → document instead of three REST round-trips).
*Why the ecosystem makes it better:* the obligations are already in Jira and Confluence; the permissions already exist; the agent can appear in the assignee picker next to humans. Rebuilding that outside Atlassian means building an identity system, a permission model and a workflow engine first.
*Bonus:* Teamwork Graph (primary), Agents (secondary claim available).

**F. Competitive advantage**
Existing handover tools are *forms* (I-PASS/SBAR templates) or EHR modules; existing "AI summariser" apps produce a paragraph nobody is accountable for. Relay's defensible mechanism is the **ledger + refusal-to-close + debt metric**: an artefact with legal and regulatory value, not a summary. The memorable moment in a demo is the agent *blocking a shift close* on a hook this reviewer has personally felt.

**G. Demonstration potential**
Screen 1: "Night Shift Handover" work item, with the Relay agent assigned. Screen 2: the ledger — 9 obligations, 2 unowned, 1 overdue, highlighted in amber. Screen 3: the shift lead clicks "Accept", one is reassigned, one is dropped with a reason. Screen 4: the agent refuses completion while debt > 0, showing a named human gate. Screen 5: the *family portal view* updating to "Your request is now owned by Grace, due Tuesday". Screen 6: seven days of history showing debt falling from 11 → 2. That is a three-minute story with a villain (silence), a hero (accountability) and a number.

---

## 6.2 **[core] Close Call** — near-miss learning that proves the fix worked

**A.** *One-liner:* A thirty-second, blame-free way for frontline workers to report a close call, and an AI that finds the systemic pattern across sites and verifies that the corrective action actually held.
*Vision:* Every near miss becomes a fix that is proven, not a form that is filed.

**B. Human problem** Frontline workers in manufacturing, construction, logistics, care and utilities see close calls constantly and report almost none of them: vendor research puts under-reporting at 90%, and a separate Oct 2026 survey found 63% of industrial sites reporting under 5% monthly participation or no tracking at all. [R] The consequence is not paperwork — it is that the injury that follows had a visible predecessor nobody acted on. Reporting collapses for three reasons: friction, fear of blame, and the well-founded belief that nothing will happen.

**C. AI solution** Capture in the worker's own modality and language (short text, voice note transcribed, optional photo as evidence only — **not** sent to the model, because Forge LLMs are text-only). AI then: normalises the report into a hazard taxonomy; **strips identifying detail by default** (the reporter is a hash, not a name); **clusters semantically across sites and months** to find weak signals a site-level system cannot see ("third near-miss this quarter involving the same contractor's loading bay across two plants"); tags contributing factors; drafts a corrective action with an owner; and — the differentiator — after the action is marked done, **schedules verification**: a re-check prompt, a targeted inspection task, and a measured drop in the cluster's frequency. Finally it writes back to the reporter: *"You reported this on 3 March. The guard rail was replaced on 11 March. There have been no similar reports since."*
*Why AI:* semantic clustering across differently-worded reports from different languages and sites is the whole value; keyword taxonomies produce noise and are abandoned. Verification requires reasoning over the cluster's time-series, not just one record.
*Human judgement:* no automated disciplinary outcome is ever produced; the safety professional owns classification and closure; the model is explicitly barred from naming individuals.

**D. Impact** Direct: workers (fewer injuries). Indirect: families, contractors, insurers, regulators. Measurable: reporting participation rate, near-miss-to-incident ratio (should rise then stabilise), repeat-pattern frequency within 90 days, and verified-closure rate — all native to the product. Inclusion: voice-first for low-literacy and migrant workers, multilingual by design, works on a phone browser with no app, anonymity as default rather than an option.

**E. Atlassian** `jsm:portalRequestCreatePropertyPanel` + portal header for intake, `jsm:queuePage` for the safety professional, `jira:issuePanel` for the CAPA, `rovo:agent` ("Safety Signals") for natural-language queries over clusters, `rovo:skill` for the verification playbook, `scheduledTrigger` for the 90-day re-check, `llm`, async events for clustering, Forge SQL for cluster state. TWG **connector** could ingest contractor/site entities. Clear fit for **Specialized Industries** (manufacturing is named in the category description).

**F. Advantage** Incumbents are systems of record that the worker must be persuaded to open; this is an instrument built for the worker's thirty seconds plus an AI that does the cross-site pattern work no single site can. The defensible innovation is **verified closure** — the thing the incumbents' own research says is missing.

**G. Demo** A maintenance technician reports a close call by voice in Portuguese; it appears anonymised in the safety queue 4 seconds later; AI shows it is the third in a cluster spanning two sites; a CAPA is created and owned; a 90-day timer visibly fires on a seeded dataset; the cluster line on the chart flattens; the worker gets a "what changed" message. Strong, fast, and it ends on evidence.

---

## 6.3 **[core] Open Door** — the accessibility loop that starts with the person, not the scanner

**A.** *One-liner:* A portal where disabled people describe barriers in their own words, and an AI that turns those words into classified, prioritised, owned fixes — then answers the person back.
*Vision:* Organisations stop remediating what scanners find and start fixing what people actually hit.

**B. Human problem** Accessibility compliance is now legally live almost everywhere that matters: the European Accessibility Act has been enforceable since 28 June 2025; ADA Title II sets WCAG 2.1 AA deadlines of April 2027/2028 for US state and local government; HHS §504 obligations began in 2026. [R] Organisations respond by buying audits, which produce spreadsheets and VPATs. Meanwhile a screen-reader user hits a keyboard trap on a checkout flow, has no way to report it in terms the organisation can act on, and gets no reply. Scanner-found issues get fixed; user-found issues — often the ones that actually block someone — do not.

**C. AI solution** The user submits a barrier in any language, by typing or by voice-note transcription, with no accessibility vocabulary required ("I can't get past the bit where you pick a delivery slot"). AI: (1) classifies the report against WCAG 2.2 success criteria and EN 301 549 with a confidence score; (2) merges it with existing findings and duplicates so the same barrier is not fixed twice; (3) infers blast radius (which component, which journey, how many users likely affected) and proposes severity; (4) drafts a fix hypothesis **and a test script** a developer can follow; (5) generates an interim accessible workaround for the reporter; (6) writes a plain-language reply and, on closure, a verification request.
*Why AI:* mapping lived-experience language onto a formal conformance framework is a translation problem that no form can solve — users do not know that "the focus jumps away" is SC 2.4.3. This is a genuine NLP classification task with a measurable accuracy target.
*Human judgement:* an accessibility specialist confirms classification and severity before anything enters the backlog; a human (ideally with assistive technology) verifies the fix.

**D. Impact** Direct: disabled users who get a reply, a workaround, and a fixed journey. Indirect: compliance, legal and product teams who now have defensible evidence of a *listening* process. Measurable: barriers reported, median time-to-first-response, % closed with user confirmation, % of user-reported barriers that were invisible to automated scanning (a compelling number to publish), and repeat-report rate per journey. Inclusion: multilingual and voice input, WCAG-conformant portal itself (and prove it), plain language at a target reading age, works without JavaScript for the report form.

**E. Atlassian** JSM portal for intake (`portalRequestCreatePropertyPanel`, `portalRequestDetailPanel`, `portalRequestViewAction`), Jira for remediation with a custom "WCAG criterion" field and linked components, Confluence for a **self-updating accessibility statement** (which is itself a legal requirement under the EAA), `rovo:agent` for "what barriers have we had this quarter on checkout?", `rovo:mcp` to expose `classify_barrier` to third-party agents, `llm` with tool-calling to query existing findings before creating duplicates. Fit: **Business Teams** (compliance/legal/content) or **Specialized Industries**.

**F. Advantage** Marketplace incumbents (AccessLens, Remediator, Accessible Web) are auditor-side and stop at backlog tickets. Open Door's differentiator is **citizen-side intake + closed loop back to the reporter + the self-maintaining statement**. That is a category difference, not a feature difference — and it is the difference a disabled judge will notice immediately.

**G. Demo** A voice note in accented English becomes a classified SC 2.1.1 keyboard-trap finding in 6 seconds; the app shows it duplicates an existing low-priority ticket and *merges rather than creates*; the specialist confirms; a fix and test script appear; the reporter receives a workaround and a status link; on closure, a verification request; the Confluence accessibility statement updates with a dated change. Ends with the number: "of the 41 barriers reported this quarter, 17 were never caught by automated scanning."

---

## 6.4 **Safehouse** — protecting the people who protect everyone else

**A.** *One-liner:* A harm-triage and exposure-budgeting layer for trust & safety teams that deduplicates traumatic material before a human sees it, and enforces limits on how much of it any one person processes.
*Vision:* The work of keeping platforms safe stops costing the workers their health.

**B. Human problem** Content moderators and abuse-desk analysts show probable PTSD rates around 26% and probable depression of 42–49% in published samples, and the strongest predictors are organisational — culture, pacing, disclosure, workload design — rather than raw hours of exposure. [R] Meanwhile most queues are constructed purely for throughput: the same traumatic item is seen multiple times because several users reported it, and there is no mechanism that says "this person has had enough this week".

**C. AI solution** (1) **Deduplication before human review**: perceptual hashing plus text-narrative clustering groups reports of the same item so a reviewer sees it once. (2) **Severity triage from metadata and reporter narrative**, never from the media itself. (3) **Exposure budgeting as a first-class constraint**: a deterministic scheduler assigns work such that no reviewer exceeds a configurable exposure weight per hour/day, with mandatory breaks and rotation, and routes the most severe categories only to staff who have opted in and are rostered for it. (4) **Early-warning signals**: patterns in a reviewer's own case mix and cadence (not sentiment surveillance of the person) trigger a human-initiated support check. (5) **Regulator-ready transparency reporting** from the same data.
*Why AI:* semantic dedupe and severity inference from messy multi-lingual report text; and the whole thing depends on a classifier that is good enough to be trusted with a human's daily load.
*Human judgement:* all enforcement decisions remain human; the model never sees nor judges the offending media; wellbeing signals are advisory to a human manager and never automated.

**D. Impact** Direct: the reviewers (often outsourced, often in lower-income countries, often multilingual). Indirect: everyone who depends on accurate moderation at speed without burnt-out staff. Measurable: duplicate exposure per item, % of reviewers within exposure budget, voluntary attrition, self-reported wellbeing (validated instruments pre/post), time-to-decision.
*Inclusion:* designed explicitly for outsourced, multilingual, low-bandwidth workforces; the exposure model is language- and jurisdiction-aware; the UI works on modest hardware.

**E. Atlassian** JSM for the report queue, Jira workflow for review and appeal, `jira:issuePanel` showing "you have 3 remaining high-severity items before a break", `rovo:agent` for policy questions ("what is our rule on implied nudity in this market?"), `scheduledTrigger` for rotation, Forge SQL for exposure accounting, `llm` for narrative clustering and policy Q&A.

**F. Advantage** Nothing in the Atlassian ecosystem does this, and very little anywhere does. It is the most *memorable* concept in this report — the kind of thing judges discuss afterwards. Its weakness is the same as its strength: it is hard to demo tastefully.

**G. Demo** A queue of 40 reports collapses to 11 unique items; the reviewer's panel shows an exposure budget draining as they work and a scheduled break; a supervisor dashboard shows nobody exceeded budget this week; a transparency report exports. **Critical:** use synthetic text with no real imagery. Handled carefully, this is a powerful two minutes.

*Ethical caution:* do not build anything that infers a specific person's mental health state. Budget exposure; do not diagnose people.

---

## 6.5 **Second Shift** — the employed caregiver's navigation system

**A.** *One-liner:* An HR-side system that turns a panicked employee's "my mother has been diagnosed and I don't know what to do" into a lawful, deadline-aware plan built from the employer's own policies.
*Vision:* Nobody loses a job or a parent's savings because they could not decode leave policy.

**B. Human problem** 59M US adults care for an adult, averaging 27 hours a week; 70% of working-age caregivers hold a job; 23% are in debt because of caregiving; fewer than half know where to turn for guidance. [R] Employers field these questions through HR with no structure: FMLA eligibility, state paid-leave schemes, flexible-working rights, employer-specific compassionate leave, power of attorney, and eldercare benefits all interact, and the employee has to discover them while exhausted.

**C. AI solution** A JSM portal intake (no diagnosis required, ever) producing a **plan**: which entitlements likely apply, in what order, with document checklists, statutory clocks, and drafts of the two letters most people need (manager notification; leave application). The model reasons over the *employer's own* Confluence policies plus a jurisdiction rule pack, and produces a task list in Jira with deadlines assigned to the right people.
*Why AI:* policy is scattered, contradictory and written in legalese; mapping a messy human situation to the subset of rules that apply is exactly what LLMs are now good at — provided retrieval is grounded in the employer's documents.
*Human judgement:* HR/legal confirms eligibility; the tool must never state a legal conclusion as fact — it presents "likely applies, confirm with HR" with sources.

**D. Impact** Direct: caregiver-employees. Indirect: their families, and employers facing avoidable attrition. Measurable: time from request to first substantive HR response, % of cases with a complete document set first time, leave-application rejection rate, employee retention at 6 months post-event. Inclusion: plain language at a 6th–8th grade level, multilingual, printable plan for employees without reliable home internet.

**E. Atlassian** JSM portal + queue, Confluence as the policy corpus with permission-aware retrieval, Jira for the case with statutory deadlines, `rovo:agent` ("Ask HR about leave") answering within the existing permission model, `llm` for grounded generation.

**F. Advantage** HR app competition is intense (Frank. won Business Teams in 2025), but that competition is about *profiles and onboarding*. This is about a high-stakes legal-and-emotional moment, with deadlines and documents — closer to casework than to a chatbot. Adoptable by any employer with a JSM instance.
**G. Demo** A 90-second intake in the employee's own words → a plan with three entitlements, two deadlines, one letter drafted, one task assigned to a named HR partner, and a "confirm with HR" gate visible on every legal claim. Then the employer view: 14 open caregiver cases, 3 with deadlines inside 10 days.

---

## 6.6 Guardian Signal — vulnerable-customer case intelligence

**A.** *One-liner:* Narrative-level fraud and vulnerability detection for case teams handling scams, bereavement, hardship and power-of-attorney disputes.
**B.** Adults 60+ reported **$7.748B** in losses to the FBI in 2025 across 201,266 complaints, up 59% year-on-year, with crypto present in $4.35B of it. [R] Transaction models catch the payment; nobody reads the *story* ("he says a police officer told him not to discuss it with his daughter") which is the giveaway.
**C. AI** Cluster case narratives into emerging typologies across branches, flag coercion and secrecy markers, draft trauma-informed victim-support scripts and SAR-ready narratives, and escalate live-risk cases. Human investigator decides everything; no automated account action.
**D.** Measurable: detection lead time, recovery rate, victim re-contact rate, staff handling time. Inclusion: scripts in the customer's language, plain language, call-centre-friendly.
**E.** JSM case management, Jira for investigation, Confluence for typology library, `rovo:agent` for "what's emerging in the north region this week?", Forge LLM keeps PII on-platform — a genuine selling point to a bank.
**F.** Differentiator: narrative and vulnerability context, not transaction scoring. Weakness: banks are not typically Jira shops; credit unions and telco/utility "vulnerable customer" teams are more plausible first buyers.
**G.** Demo: three cases that individually look routine cluster into a new coercion typology; a fourth live case is flagged and escalated to a named investigator; a support script appears in the customer's language.

---

## 6.7 Front Door — administrative burden reduction for public services

**A.** *One-liner:* An intake layer that converts a resident's messy, multilingual, low-literacy narrative into a structured, correctly-routed, deadline-tracked case.
**B.** US households spend ~12B hours a year on government paperwork; the burden is regressive (the poorest spend ~73 more hours a year waiting). [R] People abandon eligible benefits because the form defeats them.
**C. AI** Voice-first intake in any language; extract facts; screen for likely eligibility across programmes; detect urgent risk (eviction, medical crisis, domestic abuse) and escalate immediately; generate the citizen's next-steps letter in plain language; track statutory response clocks.
**D.** Measurable: application completion rate, abandonment rate, time-to-decision, % of cases where an urgent risk was surfaced that the original form would have missed. Inclusion is the *entire point*: voice, multilingual, low literacy, no smartphone required.
**E.** JSM portal + queue, Jira for casework, Confluence for policy/eligibility rules, `rovo:agent` for caseworker queries, Forge LLM for on-platform processing of sensitive data.
**F.** Advantage: most "govtech" digitises the form; this removes it. Weakness: procurement reality is slow, and legal caution is high — the demo must be scrupulous about not promising eligibility.
**G.** Demo: a four-minute voice intake produces three programme routes, two urgency flags, one plain-language letter, and a case with three statutory clocks.

---

## 6.8 **Keepsake** — continuity of care for people living with dementia

**A.** *One-liner:* A shared "who I am and what happens next" record that any new carer can act on in ninety seconds.
**B.** 57M people live with dementia worldwide; ~13M US unpaid carers provide ~19B hours (~$446B); ~70% of lifetime care cost falls on families. [R] With rotating carers, the person is re-learned from scratch every visit.
**C. AI** Maintain a living profile (preferences, routines, triggers, what calms them, who they are) plus a daily brief; detect change signals from carer logs (repeated falls, appetite, new confusion) and raise them for clinical review; translate the brief into the language of whichever carer is on shift.
**D.** Measurable: carer-reported confidence at first visit, incidents of distress, missed medication prompts, family-reported continuity. Inclusion: voice input for carers with low literacy, print view, multilingual.
**E.** Confluence for the shared plan, Jira for tasks, JSM for family requests, `rovo:agent` for "what do I need to know before I visit Mrs Okafor?", Forge LLM for summarisation and change detection.
**F.** Distinct from generic care-plan tools by being *person-centred narrative*, not a task list. Weakness: requires an organisational buyer (home-care agency, memory clinic) or it becomes a consumer app that cannot use Jira.
**G.** Demo: a new carer opens the brief, gets a 90-second read, logs a concern; the system raises it to the clinical lead; the family sees an update.

---

## 6.9 Afterward — bereavement administration coordination

**A.** *One-liner:* One case that coordinates every departmental process triggered by a death, and never asks the family for the same fact twice.
**B.** In most jurisdictions there is no "tell us once" service; a bereaved family deals with 10–30 organisations in the worst weeks of their lives. [H/R]
**C. AI** Build a jurisdiction-and-organisation-specific obligation map from a death notification; generate each department's required artefacts; track statutory clocks; draft letters in trauma-informed language; detect when the same fact is being requested twice and intervene.
**D.** Measurable: number of times a family is asked for the same information, days-to-close per organisation, complaint rate, staff handling time. Inclusion: plain language, translated, printable, telephone-assisted.
**E.** JSM portal as the family's single front door, Jira for internal departmental tasks, Confluence for policy, `rovo:agent` for staff, Forge LLM for drafting.
**F.** Emotionally unforgettable; almost no competition in the Atlassian ecosystem. Weakness: single-organisation demos look narrow; cross-organisation coordination needs partnerships.
**G.** Demo: one notification spawns 14 correctly-scoped internal tasks across six departments, three letters, and a family view with zero repeat questions.

---

## 6.10 Safeguarding — consistent concern recording for non-specialists

**A.** *One-liner:* Helps teachers, coaches and volunteers record a safeguarding concern in factual, non-judgemental language within statutory expectations — without ever pretending to make the safeguarding decision.
**B.** In schools, sports clubs and community organisations, the person who notices is rarely the designated safeguarding lead; recording quality and timeliness vary enormously, and failures surface only at inspection or after harm. [H/R]
**C. AI** Structured prompted recall (what was said, seen, when, who else present), language coaching away from opinion toward observation, completeness checks against the organisation's policy, statutory clock tracking, and pattern surfacing across a child's history for the DSL's *review*.
**D.** Measurable: % of concerns recorded within policy window, % meeting quality checklist, DSL time-to-triage, referral decision audit trail. Inclusion: works for volunteers with minimal training, multiple languages, mobile-first.
**E.** Jira/JSM for case records with strict permission scoping, Confluence for policy, `rovo:agent` restricted to procedural guidance, Forge LLM on-platform only.
**F.** Enormously important and rarely built well. Biggest risk: appearing to automate child-protection judgement. Must be designed so the AI coaches the *writing*, and the human makes every decision.
**G.** Demo: a coach's 90-second recording becomes a quality-checked concern routed to the DSL with a clock; a second concern on the same child surfaces the pattern to the DSL only.

---

## 6.11 Constituent Voice — measuring who is *not* complaining

**A.** *One-liner:* Detects under-representation in feedback by comparing who complains against who uses the service.
**B.** Service organisations hear disproportionately from the confident, literate, English-speaking and able. The people with the worst outcomes are structurally silent, so improvement work optimises for the loud. [H — strong inference, thin direct literature]
**C. AI** Join service-usage cohorts to feedback volume and sentiment; model expected complaint volume per cohort; surface "silent segments" (e.g. a language community with high usage and near-zero contact); generate culturally appropriate outreach hypotheses and translate feedback that does arrive.
**D.** Measurable: representation gap per cohort over time, contact rate per cohort, resolved-outcome parity. Inclusion is the product.
**E.** JSM for feedback, Confluence for published equity reporting, TWG/connector to bring in external service data, `rovo:agent` for "which communities are we not hearing from?", Forge LLM for multilingual clustering.
**F.** Genuinely novel metric ("silence gap") and a strong presentation hook. Weakness: it is analytics, and judges may find it abstract without a person in the story.
**G.** Demo: two cohorts, identical usage, 40× difference in contact rate; a targeted outreach produces new reports from the silent cohort in week two.

---

## 6.12 Steady — the "second victim" of serious incidents

**A.** *One-liner:* Structured, blame-free support and learning for the humans involved in a serious incident.
**B.** Clinicians, pilots, engineers and on-call staff involved in adverse events experience shame, isolation and impaired practice — the "second victim" phenomenon; most organisations have no process that reaches them. [R/H]
**C. AI** Run a guided debrief in Confluence, produce a learning review separated from any disciplinary record, check that support was *offered and accepted*, and aggregate organisational patterns of harm.
**D.** Measurable: % of involved staff offered support within 72h, uptake, return-to-work, repeat-incident involvement. Inclusion: confidential channels, multilingual, no performance linkage.
**E.** Jira incident workflow, Confluence review template, `rovo:agent` for the debrief, scheduled triggers for follow-up.
**F.** Original and humane, but narrow and hard to demo emotionally without real cases.
**G.** Demo: an incident closes; the humans involved get a private, structured path; the org view shows support coverage, not names.

---

## 6.13 On-call Load Radar

**A.** *One-liner:* Detects unsustainable on-call and incident-load patterns and proposes roster changes before people break.
**B.** Software and operations teams accumulate invisible load; burnout is attributed to individuals rather than schedules. [R/H]
**C. AI** Model per-person load from incident assignments, after-hours pages, recovery time and context switching; propose specific roster changes; forecast risk for the next quarter.
**D.** Measurable: after-hours pages per person, recovery time, voluntary attrition, roster-change adoption. 
**E.** Jira + incident data, JSM on-call schedules, `rovo:agent` for "who is at risk next month?", dashboard gadget.
**F.** Useful but "software teams" is the most technically crowded category and this is close to existing reporting. **Low innovation score, high feasibility.**
**G.** Demo: two rosters, one with a hidden 3am clustering; a proposed swap; forecast improvement.

---

## 6.14 Plainly — plain-language and multilingual knowledge at the point of need

**A.** *One-liner:* Turns dense policy and runbooks into plain-language, translated and spoken versions, and keeps them in sync when the source changes.
**B.** Frontline and low-literacy workers cannot use the documents written for them; language barriers turn safety procedures into decoration. [R/H]
**C. AI** Simplify to a target reading level, translate with a domain glossary, generate audio via in-browser speech synthesis (no egress), detect when the source changed and mark derived versions stale, and run short comprehension checks.
**D.** Measurable: comprehension-check pass rate, time-to-competency, translation coverage, stale-content rate. Inclusion is the product.
**E.** Confluence macros, `rovo:agent`, `rovo:mcp`, Forge LLM, i18n API.
**F.** Honest assessment: **this is close to "AI summarisation", which the brief and the judges both discount.** Include it in a portfolio, do not lead with it.
**G.** Demo: a 6-page policy becomes a 60-second audio brief in three languages, with a comprehension check.

---

## 6.15 Appeals Advocate — clinical denials and benefit appeals for small practices

**A.** *One-liner:* Drafts evidence-grounded appeal letters against insurer denials for clinics that cannot afford a denials team.
**B.** Claim denials are a large, growing administrative cost; small practices lack the staff to appeal, so they write off legitimate revenue and patients lose care. [R/H]
**C. AI** Parse the denial reason, retrieve the payer policy and relevant guideline, assemble the clinical evidence, draft the appeal with citations, track the appeal clock.
**D.** Measurable: appeal rate, overturn rate, days-to-appeal, revenue recovered. Inclusion: works for small/rural practices.
**E.** JSM intake, Jira case workflow, Confluence policy library, Forge LLM (on-platform, important for PHI).
**F.** Commercially compelling; **but the beneficiary is the practice, and the human-impact story is indirect.** Judges scoring "Potential Impact" may see a revenue tool.
**G.** Demo: a denial becomes an appeal with four citations in 40 seconds; overturn recorded.

---

## 6.16 Consent Clarity — comprehension-checked consent for research and clinical programmes

**A.** *One-liner:* Verifies that a person actually understood what they consented to, in their language, at their reading level.
**B.** Consent forms are routinely signed without comprehension, which undermines both ethics and trust, particularly for low-literacy and non-native speakers. [R]
**C. AI** Convert consent documents into layered plain-language explanations, run teach-back dialogue, flag comprehension failures to the researcher, and record the interaction.
**D.** Measurable: teach-back pass rate, withdrawal rate, complaints. Inclusion is the point.
**E.** Confluence for documents, JSM for participant workflow, `rovo:agent`, Forge LLM.
**F.** Ethically excellent, narrow commercially, and legally sensitive. **Moderate ceiling.**
**G.** Demo: a participant in Yoruba works through a layered explanation and fails one teach-back item; the researcher is prompted to re-explain.

---

## 6.17 Safe Exit — workplace safety planning for employees experiencing domestic abuse

**A.** *One-liner:* A confidential HR route that produces a practical workplace safety plan and holds the organisation to its duty of care.
**B.** Domestic abuse follows people to work; employers are increasingly regulated to act, yet disclosure is terrifying and processes are ad hoc. [R/H]
**C. AI** Guide a disclosure without requiring detail, generate a plan (access changes, screening calls, flexible location, emergency contacts), coordinate with security and facilities *without disclosing the reason*, and track review dates.
**D.** Measurable: time-to-plan, % of plans reviewed on schedule, incidents at work, employee-reported safety. Inclusion: multilingual, no written trail the abuser could find, works via phone.
**E.** JSM confidential request type, Jira with restricted permissions, `rovo:agent` for policy.
**F.** Extremely high human value; **extremely high risk of causing harm if designed carelessly** (a visible Jira ticket can be dangerous). Would need a permission architecture scoped to a handful of named roles. I would not attempt this in seven weeks.
**G.** Demo would have to be deliberately abstract — which undermines the presentation score.

---

## 6.18 Access Gate — pre-release accessibility checks inside the delivery workflow

**A.** *One-liner:* Blocks a release when new UI introduces accessibility regressions, with evidence.
**B.** Organisations remediate at audit time rather than preventing at build time; regressions re-enter continuously. [R]
**C. AI** Analyse issue descriptions, design specs and (via external tools) test artefacts to predict which WCAG criteria a change is likely to break, attach acceptance criteria to the ticket, and require evidence at release.
**D.** Measurable: regression rate per release, % of tickets with a11y acceptance criteria, audit findings trending down.
**E.** Jira workflow validators and conditions, Bitbucket pipelines, `rovo:agent`, Forge LLM.
**F.** Genuinely useful and technically elegant (workflow validators impress judges), **but it is more "shift-left tooling" than human-centred**, and overlaps existing CI accessibility tooling.
**G.** Demo: a release is blocked by a validator that cites a specific criterion and a specific test; the criterion is added to the ticket.

---

## 6.19 Many Hands — humanitarian caseload deduplication

**A.** *One-liner:* Deduplicates aid requests across agencies so vulnerable households are counted once and served once.
**B.** In displacement and disaster response, duplicate registration wastes scarce capacity while the digitally invisible are missed entirely. [R/H]
**C. AI** Probabilistic household matching with privacy-preserving identifiers, needs triage, and detection of households only reachable offline.
**D.** Measurable: duplicate registration rate, coverage of offline households, time-to-first-service. Inclusion is the entire design constraint (offline-first, low bandwidth).
**E.** Jira for casework, Confluence for protocols, Forge LLM for triage, limited egress to keep data sovereign.
**F.** High moral weight, **low demonstrated feasibility for a hackathon** — no credible partner data, and the demo would be synthetic in a way judges can feel.
**G.** Demo would rely entirely on fabricated data. **Weak.**

---

# 7. Comparative evaluation and scoring

## 7.1 Primary score — the five official criteria (×20)

Scores are deliberately conservative. **Almost nothing scores above 90**, because a 19/20 requires execution that does not exist yet — these are assessments of *potential*, capped by what a small team can plausibly ship by 22 December.

| # | Concept | Tech (20) | Design (20) | Impact (20) | Innovation (20) | Presentation (20) | **Total** |
|---|---|---|---|---|---|---|---|
| 1 | **Relay** | 19 | 18 | 19 | 16 | 19 | **91** |
| 2 | **Close Call** | 17 | 17 | 18 | 16 | 18 | **86** |
| 3 | **Open Door** | 17 | 18 | 18 | 14 | 18 | **85** |
| 4 | **Safehouse** | 15 | 15 | 18 | 19 | 16 | **83** |
| 5 | Guardian Signal | 16 | 15 | 17 | 15 | 15 | **78** |
| 6 | **Second Shift** | 15 | 16 | 16 | 15 | 15 | **77** |
| 7 | Front Door | 15 | 14 | 17 | 15 | 14 | **75** |
| 8 | Keepsake | 14 | 15 | 15 | 14 | 15 | **73** |
| 9 | Afterward | 13 | 14 | 15 | 16 | 14 | **72** |
| 10 | Safeguarding | 13 | 13 | 16 | 15 | 13 | **70** |
| 11 | Constituent Voice | 14 | 13 | 13 | 15 | 13 | **68** |
| 12 | Steady | 13 | 14 | 13 | 14 | 13 | **67** |
| 13 | Safe Exit | 11 | 12 | 15 | 15 | 12 | **65** |
| 14 | Access Gate | 15 | 14 | 11 | 10 | 14 | **64** |
| 15 | Appeals Advocate | 12 | 12 | 13 | 12 | 12 | **61** |
| 16 | On-call Load Radar | 14 | 15 | 10 | 9 | 12 | **60** |
| 17 | Many Hands | 10 | 10 | 14 | 13 | 11 | **58** |
| 18 | Plainly | 12 | 14 | 10 | 8 | 12 | **56** |
| 19 | Consent Clarity | 11 | 12 | 10 | 11 | 11 | **55** |

**Why Relay scores 19 on Technology:** it requires the async-event pattern, Forge SQL, six-plus actions, an agent, a skill, an MCP module, a scheduled trigger, and an optional TWG traversal — while remaining installable with boring scopes. That is the maximum surface area a judge can *see* working in three minutes.
**Why Relay loses 4 on Innovation:** handover AI exists in healthcare IT. The score reflects real differentiation risk, not the concept's novelty to the judge pool.
**Why Safehouse scores 19 on Innovation and 15 on Design:** nothing else looks like it; but a tasteful, coherent UI for a distressing workflow in seven weeks is genuinely hard.
**Why Open Door loses 6 on Innovation:** accessibility tooling is a populated category. Its differentiation is real but must be argued, not assumed.

## 7.2 Secondary assessment

| Concept | MVP feasibility (7 wks) | Dev complexity | Infra/API cost | Competition relevance | Bonus eligibility | Long-term potential | Key dependency risk |
|---|---|---|---|---|---|---|---|
| Relay | **High** — all primitives exist | Medium-high | Low (LLM credits only) | Very high (theme is literally "context → decisions") | TWG + Agents | High (every 24/7 operator) | Domain credibility in the demo |
| Close Call | High | Medium | Low | High (manufacturing named in category) | TWG connector + MCP | High (EHS is a real market) | Vendor-saturated perception |
| Open Door | **Very high** | Low-medium | Low | High (compliance tailwind) | Marketplace + MCP | High (procurement-friendly) | Being read as "another scanner" |
| Safehouse | Medium | Medium | Low | High (memorability) | Agents | Medium (narrow buyers) | Tasteful demo; content policy limits |
| Guardian Signal | Medium | Medium | Low | High | Agents + TWG | Medium | Bank ≠ Jira shop assumption |
| Second Shift | High | Low-medium | Low | Medium (HR category crowded) | MCP | Medium | Perceived as policy chatbot |
| Front Door | Medium | Medium | Low | High | MCP | Medium (long sales cycles) | Legal caution dilutes the demo |
| Keepsake | Medium | Low | Low | Medium | Agents | Medium | Needs an organisational buyer |
| Afterward | Medium | Medium | Low | High | TWG | Low-medium | Cross-org partnerships |
| Safeguarding | Medium | Low | Low | Medium | none obvious | Medium | Ethical framing risk |

## 7.3 The honest weakness of each top-five concept

- **Relay** — *"I've seen this pitch."* Handover summarisation is a well-known idea and a judge will pattern-match within ten seconds unless the demo's first 30 seconds establish that this is a *ledger with enforcement*, not a summary. Second weakness: it needs a believable operational setting; a generic "team" demo will feel invented.
- **Close Call** — *"SafetyCulture already does this."* True for capture; false for cross-site semantic clustering and verified closure. Third weakness: Forge LLMs cannot read photos, which will feel like a hole to anyone who has used a modern EHS app.
- **Open Door** — *"This is a scanner with a form on the front."* The only defence is to demonstrate a user-reported barrier that automated tooling *cannot* find, and to show the reply going back to the person.
- **Safehouse** — *"You can't build this responsibly in seven weeks."* Possibly correct. It is the highest-ceiling, highest-variance concept in the report.
- **Guardian Signal** — *"Banks don't use Jira."* Largely true for core banking; not true for fraud-operations and vulnerable-customer case teams in mid-size institutions. The demo has to earn that assumption rather than assert it.

---

# 8. The five strongest concepts, in shortlist form

## 8.1 Relay

1. **Name:** Relay.
2. **Core problem:** commitments to real people are lost at shift and department boundaries.
3. **Target users:** shift leads and frontline staff in care homes, home-care agencies, hospital-adjacent services, manufacturing plants, utilities control rooms, dispatch centres; secondarily the families/customers on the receiving end.
4. **Unique AI capabilities:** obligation extraction from unstructured prose; cross-shift reconciliation with 1M-token context; semantic matching of "the same promise described twice"; an agent that enforces closure.
5. **Architecture:** Forge app (UI Kit panels + project page) → async queue → Forge LLM extraction with tool-calling → Forge SQL ledger → agent/MCP read surfaces → optional TWG Cypher for cross-entity context.
6. **Atlassian strategy:** Jira as the work system, JSM as the person-facing channel, Confluence as the signed handover record, Rovo as the accountability agent, TWG as the optional context accelerator.
7. **Bonus:** Teamwork Graph (primary claim), Agents (secondary).
8. **MVP:** one project, one unit, obligations from issues + comments + a handover page; ledger panel; agent-blocked closure; 7-day debt chart; portal status view.
9. **Main risks:** originality perception; needing credible domain detail; LLM extraction precision on terse notes.
10. **Why judges would like it:** it turns the hackathon's own theme ("context that moves work forward") into a measurable accountability artefact, and it uses the platform's newest primitives for a purpose that is obviously not a gimmick.
11. **Differentiation:** it does not summarise; it binds, enforces and audits.
12. **Impact measurement:** unowned obligations, time-to-ownership, handover completion, repeat omissions, family re-contact rate.

## 8.2 Close Call

1. **Name:** Close Call.
2. **Core problem:** 90% of near misses are never reported, so the injury arrives with no warning.
3. **Target users:** frontline workers and EHS leads in manufacturing, construction, logistics, facilities and care.
4. **Unique AI:** multilingual semantic clustering across sites; anonymisation by default; verification that the fix held.
5. **Architecture:** JSM portal intake (text/voice/photo-as-evidence) → async clustering → Forge SQL cluster state → Jira CAPA → scheduled 90-day verification → feedback message to reporter.
6. **Atlassian:** JSM for intake and queue, Jira for CAPA, Confluence for the learning library, Rovo for "what's clustering in region 3?", TWG connector for contractor/site entities.
7. **Bonus:** TWG connector integration; MCP secondary.
8. **MVP:** one site, 60 seeded reports, clustering view, one CAPA lifecycle, one verification cycle, reporter feedback message.
9. **Risks:** perceived as an incumbent clone; photo limitation; synthetic data credibility.
10. **Judge appeal:** the loop-back-to-worker mechanic is emotionally and operationally persuasive.
11. **Differentiation:** verified closure and cross-site weak-signal detection.
12. **Measurement:** participation rate, near-miss-to-incident ratio, 90-day repeat-pattern reduction, verified-closure rate.

## 8.3 Open Door

1. **Name:** Open Door.
2. **Core problem:** organisations fix what scanners find, not what disabled people hit.
3. **Target users:** accessibility and compliance leads, product teams, and the disabled users of public-facing services.
4. **Unique AI:** lived-experience → WCAG/EN 301 549 classification; duplicate merging across findings; fix + test-script drafting; plain-language reply generation.
5. **Architecture:** JSM portal intake → Forge LLM classification with tool-calling against existing findings → Jira issue with criterion field → Confluence accessibility statement auto-update → reply to reporter.
6. **Atlassian:** JSM portal modules, Jira custom fields and components, Confluence macro/global page, Rovo agent, MCP.
7. **Bonus:** Marketplace (strong — this is a purchasable product) and MCP.
8. **MVP:** intake form with voice note, classification with confidence, merge-not-create, specialist confirm, statement update, reporter reply.
9. **Risks:** category saturation; classification accuracy needs a real evaluation set.
10. **Judge appeal:** legally urgent, ethically unimpeachable, and unusually concrete.
11. **Differentiation:** citizen-side intake and closure, versus auditor-side tooling.
12. **Measurement:** time-to-first-response, % closed with user confirmation, % of barriers invisible to scanners, repeat-report rate.

## 8.4 Safehouse

1. **Name:** Safehouse.
2. **Core problem:** the people protecting everyone else are being harmed by the work design around them.
3. **Target users:** trust & safety teams, abuse desks, escalation teams, and the BPO partners who staff them.
4. **Unique AI:** pre-human deduplication; severity inference from narrative metadata; exposure-budget scheduling.
5. **Architecture:** JSM queue + Jira review workflow + Forge SQL exposure ledger + scheduled rotation + transparency export.
6. **Atlassian:** JSM, Jira, Confluence policy library, Rovo agent for policy Q&A.
7. **Bonus:** Agents.
8. **MVP:** dedupe, exposure meter, break enforcement, supervisor dashboard, one export.
9. **Risks:** tasteful demo; scope discipline; content-policy limits on the model.
10. **Judge appeal:** no other entry will be about this.
11. **Differentiation:** the only product that treats a human's processing capacity as a schedulable constraint.
12. **Measurement:** duplicate exposure per item, % of reviewers within budget, attrition, validated wellbeing scores.

## 8.5 Second Shift

1. **Name:** Second Shift.
2. **Core problem:** employed family caregivers must decode leave policy alone, at the worst possible moment.
3. **Target users:** HR/people teams, benefits teams, and caregiver-employees.
4. **Unique AI:** grounded policy reasoning across employer documents and jurisdiction rules; document drafting; deadline orchestration.
5. **Architecture:** JSM portal → retrieval over Confluence with permissions → plan generation → Jira case with statutory clocks → letter drafts.
6. **Atlassian:** JSM, Confluence, Jira, Rovo, Forge LLM.
7. **Bonus:** MCP.
8. **MVP:** one employer policy set, one jurisdiction, plan output, two letter drafts, deadline tracking.
9. **Risks:** "policy chatbot" perception; legal caution; HR category crowding.
10. **Judge appeal:** humane, quantified (59M carers), and clearly useful in week one.
11. **Differentiation:** a plan with clocks and documents, not an answer.
12. **Measurement:** time-to-first-response, first-time-complete document rate, rejection rate, 6-month retention.

---

# 9. The top three, and why Relay is first

## 9.1 Third choice — Open Door

**Why it is here:** it has the cleanest ethical story of any concept in the report (the people with the least power are the intake), the least ambiguous legal tailwind (EAA live, ADA Title II deadlines landing), and the best Marketplace path — this is something a compliance director would actually buy on a purchase order. Its technical build is genuinely achievable in seven weeks.

**Why it is not first:** accessibility tooling is a populated category in the Marketplace, and the judging criterion "does the project differ from existing concepts" is where it is most exposed. It is also, frankly, a *workflow product* — the AI is essential but the product's soul is process design, which is harder to make thrilling in three minutes than a ledger refusing to close.

## 9.2 Second choice — Close Call

**Why it is here:** the strongest combination of a vivid human stake (someone gets hurt), a shocking, citable problem (90% under-reporting), a demo that ends on evidence rather than assertion, and a category match — "manufacturing" is named in the Specialized Industries description. The "here is what changed because you reported it" mechanic is the single most emotionally effective feature in this entire report.

**Why it is not first:** two structural risks. First, EHS is a mature, well-funded vendor category, and a judge with industry knowledge may discount the concept before seeing the verified-closure mechanism. Second, the Forge LLM's text-only constraint removes photo analysis, which is what many people picture when they think "modern safety reporting" — leaving you explaining a gap instead of demonstrating a capability.

## 9.3 First choice — Relay

**Why Relay is the strongest overall bet.** Seven reasons, in order of weight:

1. **It is the theme, made operational.** The competition asks for apps that use connected context to help teams "ship with confidence", turning organisational data into "a decision that actually moves work forward." Relay's entire mechanism is: gather context across surfaces → identify the specific things that must not be dropped → force a named human decision → record it as evidence. You are not stretching to fit the brief; you are the brief.

2. **The AI is load-bearing and defensible.** The judgement a judge must make about "Technological Implementation" is whether the AI is essential or decorative. Here it is unmistakably essential: the input is terse, idiosyncratic human prose ("she asked again about Dad's room"), and the output is a structured, deduplicated, time-bound obligation set. No rules engine does that. An evaluator can see the model doing real work on screen, with the extraction visible and correctable by a human.

3. **It exercises the platform deeply without gambling the install.** Relay's MVP needs only Jira + JSM + Confluence REST scopes and Forge LLMs — the safest possible foundation for Stage One. On top of that it can add `rovo:agent`, `rovo:skill`, `rovo:mcp`, `scheduledTrigger`, async events, Forge SQL, and optional TWG Cypher. That is the rare architecture that scores high on "genuinely non-trivial implementation" *and* installs on a judge's site in ninety seconds.

4. **It has a number, and judges can watch the number move.** "Handover debt" is a metric a judge can understand in one sentence, believe because it is computed from a visible ledger, and see fall from 11 to 2 across a seeded week. The rules require impact to be demonstrated, not asserted. Relay makes demonstration trivial.

5. **The three-minute video writes itself.** Silence (an obligation nobody owns) → discovery (the agent refuses to close the shift) → human decision (accept / reassign / drop with reason) → the person on the other end (portal update) → evidence (seven-day trend). No contrived storytelling, no fake dashboards.

6. **It generalises without becoming vague.** The primary demo is a care setting because that is where the human stake is highest and the story is clearest. But the same mechanism works verbatim in a plant, a utility control room, a dispatch centre, or a claims operation — which lets you answer "is this a real market?" convincingly in one breath, in the Q&A-less world of a three-minute video: show twenty seconds of the same ledger in a manufacturing handover.

7. **The domain has a documented, quantified harm and an established improvement mechanism.** Joint Commission handoff findings, I-PASS/NEJM reductions in preventable adverse events, and the JAMA Network Open discharge-communication readmission result give you a credible causal story: *this class of intervention works; here is the instrument that makes it work in the tools the organisation already has.* You are not claiming AI will fix healthcare. You are claiming a specific, evidenced mechanism can be enforced.

**What could still go wrong.** Be clear-eyed:
- A judge may classify it as "AI summarises the shift" and stop thinking. Mitigation: the first 20 seconds of the video must show the *refusal to close* and the word "unowned", never a paragraph of summary.
- A judge may ask why this needs Atlassian. Answer in the video, not the text: because the obligations, the people, the permissions and the documents are already there, and the agent can hold a work item next to a human.
- Extraction precision on terse notes is the real engineering risk. Mitigation: a human confirmation step is not a weakness — it is the design, and it buys you accuracy.
- If you cannot secure even one credible domain conversation, the care setting will feel researched rather than lived. One hour with a care-home manager or a ward sister is worth more than a week of prompt tuning.

## 9.4 Honest competitive assessment

Against 800+ submissions, the realistic outcome distribution for a well-executed Relay is: **a bonus prize is plausible; a category 2nd or 3rd is plausible; a category 1st requires both flawless execution and a favourable field in Specialized Industries.** The concept does not have the shock value of Safehouse or the moral clarity of Open Door — it has the best *engineering-to-story ratio*, which is what the five equally weighted criteria actually reward.

---

# 10. Detailed technical breakdown of Relay

## 10.1 Manifest sketch

```yaml
modules:
  # ---- AI ----
  llm:
    - key: relay-llm
      model: [claude]

  # ---- Accountability agent (Best Agents bonus) ----
  rovo:agent:
    - key: relay-handover-agent
      name: Relay Handover
      description: Owns shift handover. Will not close while obligations are unowned.
      icon: resource:relay-assets;icons/relay.svg
      prompt: resource:relay-prompts;handover-agent.md
      conversationStarters:
        - What is unowned on my unit right now?
        - Show me the handover debt for the last 7 shifts
        - Who is carrying overdue promises?
      skills: [handover-audit]
      actions: [get-open-obligations, get-handover-debt, assign-obligation, drop-obligation, verify-closure]

  rovo:skill:
    - key: handover-audit
      source: { dir: skills/handover-audit }
      dependencies:
        tools: [get-open-obligations, get-handover-debt]

  # ---- Tools also exposed to third-party agents (MCP bonus) ----
  rovo:mcp:
    - key: relay-mcp
      name: Relay Obligations
      tools: [get-open-obligations, get-handover-debt, assign-obligation]

  action:
    - key: get-open-obligations
      function: getOpenObligations
      actionVerb: GET
      description: List obligations for a unit, optionally filtered by owner status
      inputs:
        unit: { title: Unit, type: string, required: true, description: Jira project key of the unit }
        unownedOnly: { title: Unowned only, type: boolean, required: false }
    # ... assign-obligation (UPDATE), drop-obligation (UPDATE), verify-closure (UPDATE)

  # ---- Human surfaces ----
  jira:issuePanel:      # the obligation ledger on the Handover work item
    - key: relay-ledger
      function: ledgerPanel
      title: Obligations
      resource: main
  jira:projectPage:     # unit-level handover board
    - key: relay-board
      function: unitBoard
      title: Handover
      resource: main
  jira:adminPage:
    - key: relay-config
      function: adminConfig
      title: Relay settings
      resource: main
  # JSM portal status for the person on the other end
  jiraServiceManagement:portalRequestDetailPanel:
    - key: relay-portal-status
      function: portalStatus
      title: What we owe you
      resource: main

  # ---- Compute ----
  function:
    - key: extractObligations      # async: LLM extraction fan-out
      handler: resolvers/extract.handler
      timeout: 300
    - key: reconcileShift          # async: cross-shift reconciliation
      handler: resolvers/reconcile.handler
      timeout: 600
    - key: readinessSweep          # scheduled: 06:00 unit sweep
      handler: resolvers/sweep.handler
    - key: ledgerPanel
      handler: resolvers/ui.handler
    # ...
  consumer:
    - key: obligation-extractor
      queue: relay-extract
      function: extractObligations
  scheduledTrigger:
    - key: readiness
      function: readinessSweep
      interval: hour
  trigger:                        # on issue created/updated/comment added
    - key: onWorkItemChange
      function: enqueueExtraction
      events: [avi:jira:created:issue, avi:jira:updated:issue, avi:jira:created:comment]

permissions:
  scopes:
    - read:jira-work
    - write:jira-work
    - read:confluence-content.summary
    - read:servicedesk-request
    - write:servicedesk-request
    # TWG (optional, feature-flagged; app remains functional without it)
    # - read:graph:issue:jira
    # - read:graph:page:confluence
    # - read:graph:user:atlassian
  external:
    fetch:
      backend: []                # deliberately empty: no egress, Runs on Atlassian eligible

app:
  runtime:
    name: nodejs24.x
```

*Verify every module key against the manifest reference before building — the Confluence macro/global-page key names in particular are worth confirming rather than assuming, and JSM portal module keys should be copied from the JSM module index.*

## 10.2 Data model (Forge SQL, MySQL-compatible)

```
obligations
  id CHAR(26) PK
  installation_id, unit_key, source_type (issue|comment|page|portal)
  source_ref, source_hash                      -- idempotency: never re-extract unchanged text
  promisor_account_id, promised_to_label       -- "Mrs Adeyemi's daughter" (no PII in the open)
  statement TEXT, normalised_category
  due_at, created_at, state (open|owned|dropped|closed|verified)
  owner_account_id, acceptance_at
  drop_reason TEXT, dropped_by_account_id
  confidence DECIMAL(3,2), extraction_run_id

obligation_links      -- dedupe / "same promise described twice"
  obligation_id, linked_obligation_id, similarity DECIMAL(4,3)

handover_shifts
  id, unit_key, shift_key, boundary_at, debt_score, opened_obligations,
  closed_obligations, dropped_obligations, signed_off_by, signed_off_at

extraction_runs
  id, source_hash, model_id, prompt_version, latency_ms, input_tokens, output_tokens, status
```

Notes: no foreign keys in Forge SQL [R], so enforce referential integrity in code. Index on `(unit_key, state, due_at)` and on `source_hash` for cheap idempotency. Retention policy per installation; a documented deletion path (`@forge/api` privacy API) is a design mark.

## 10.3 Three flows

**Flow 1 — extraction (write path).**
Issue/comment/page event → `enqueueExtraction` computes a content hash → if hash already processed, stop (cost control) → push to `relay-extract` queue → async function batches up to N items → one Forge LLM call with a **tool definition** for `emit_obligations` (structured output is far more reliable than JSON-in-prose) → validate, deduplicate against existing obligations via embedding-free cosine on token sets or a second LLM comparison for low-confidence cases → insert → update `handover_shifts.debt_score`.

**Flow 2 — reconciliation (the differentiator).**
At shift boundary, or on demand: pull the last 7 shifts' open obligations + the incoming shift's plan + the unit's standing instructions → single Sonnet call with a large context → output: obligations still valid, obligations now obsolete (with evidence), obligations with no owner, and conflicts ("two people told the family different dates"). Target: one call per unit per shift, not per ticket.

**Flow 3 — closure gate (the demo moment).**
The `Relay Handover` work item cannot transition to Done unless: every obligation in scope has `state ∈ {owned, dropped, closed}`. Implement as a **Jira workflow condition on the app's own transition plus an explicit agent response**, and — critically — show the *reason* on screen when it blocks. Dropping requires `drop_reason` text; the agent refuses to accept "n/a" and asks a follow-up question. That refusal is the product.

## 10.4 Prompt and guardrail strategy

- **System prompt as a resource file**, not inline (manifest size discipline) [V].
- **Extraction prompt contract:** "You return obligations only where a specific person was promised something specific. If unsure, return it with low confidence rather than omitting it — a human will triage. Never infer clinical priority. Never assign an owner who has not been mentioned."
- **Confidence surfaced in the UI**, with an inline "edit" affordance. A human correcting the AI is not friction; it is the audit trail.
- **Guardrails:** never generate a clinical recommendation; never name a patient in a public Confluence page (use the promised-to *label*, not identity, unless the viewer has permission); always cite the source line for every extracted obligation so a human can verify in one click. Explainability is cheap here and scores under Design and Impact.
- **Fail-open on the read path, fail-safe on the write path:** if the LLM is unavailable, the ledger still renders from stored obligations (degraded), but the closure gate *still blocks* — never silently let a shift close because a model timed out.

## 10.5 Cost, quota and performance plan

| Concern | Mitigation |
|---|---|
| 100 req/min, 500k tokens/min | Hash-based idempotency; batch 20–40 items per call; one reconciliation call per shift |
| 25s sync limit | All extraction is async; UI shows "analysing…" with a Realtime or polling update |
| 5-minute inference cap | Reconciliation chunked per unit, never per organisation |
| Forge SQL 1 GiB | Trivial at demo scale; define a retention policy anyway |
| LLM credits | Cap spend per installation per day in app config; log token usage per run; show it in the admin page (a cost-transparency feature judges rarely see) |
| Cold starts | Warm the panel with cached data first; never block first paint on a model call |

## 10.6 Security, privacy and responsible-AI statement (put this in the submission text)

- **No egress.** Forge LLMs keep data inside Atlassian; the app declares an empty `external.fetch.backend`. Runs on Atlassian eligible. [V]
- **Least privilege.** Five read/write scopes; TWG scopes are commented out by default and enabled only by admins who want the optional layer.
- **Human-in-the-loop by construction.** The system proposes obligations; humans accept, reassign, or drop with a reason. No automated clinical or disciplinary action exists in the codebase.
- **Explainability.** Every obligation links to the sentence that produced it.
- **Bias.** The model is not asked to judge a person's worth or priority; it extracts commitments. Where language variety or terseness reduces extraction quality, confidence is shown and the human triages — and the app logs extraction quality by unit so bias in performance becomes visible rather than hidden.
- **Vulnerable populations.** Family-facing portal views show status and ownership only, never clinical detail, and never more than the requester is entitled to see.
- **Data minimisation.** Obligation records store a *label* for the person owed, not identifying detail.

---

# 11. MVP, build sequence and demonstration strategy

## 11.1 MVP — what is in, what is out

**In (must ship):**
1. Ledger panel on a work item; obligations extracted from issues + comments with source citations.
2. Handover project page: debt score, unowned list, 7-shift trend.
3. Closure gate: blocks Done while debt > 0; requires a reason to drop.
4. `Relay Handover` Rovo agent with three actions; visible in Rovo chat and (if confirmed on your site) assignable.
5. JSM portal status panel: "what we owe you" in plain language.
6. Admin page: enable/disable units, daily LLM spend cap, retention setting.
7. Seeded demo dataset + one-click seed script (a "demo mode" toggle that never touches real data).

**Out (say so explicitly):** voice-note transcription (needs egress — park it and say why), multi-language UI beyond two languages, Slack/Teams ingress, predictive risk scoring, mobile app, TWG-dependent features beyond a recorded optional demo.

**Stretch (only if week 5 is comfortable):** `rovo:mcp` module, TWG Cypher traversal with feature flag, Confluence-signed handover record.

## 11.2 Seven-week plan (11 Nov → 22 Dec, working backwards)

| Week | Goal | Exit criteria |
|---|---|---|
| **0 (now–10 Nov)** | Decide; set up dev site + Forge CLI; verify `llm` module, agent assignability, JSM portal module rendering, Forge SQL provisioning **on day 2**; talk to one care-home manager or ward coordinator | A "hello world" that proves every risky primitive works. **Start the Marketplace listing draft this week.** |
| **1** | Data model + extraction pipeline + seed dataset | 60 seeded work items → obligations extracted with >80% precision on a hand-labelled sample of 30 |
| **2** | Ledger UI + debt metric + trend | A judge could read the panel and understand it without narration |
| **3** | Closure gate + agent + actions | Agent demonstrably blocks a close and asks for a reason |
| **4** | JSM portal status + admin page + empty/error states | Every failure state has a designed message; no raw stack traces |
| **5** | Polish: accessibility pass (keyboard, contrast, screen-reader labels), i18n for 2 languages, performance | The app passes its own WCAG checklist — and say so on screen. Do this in week 5, not week 7 |
| **6** | Record video; submission text; installation instructions; TWG optional-layer recording; Marketplace submission | Video cut at 2:50 and 4:30; instructions tested by a stranger on a clean site |
| **7 (buffer)** | Fix whatever the stranger broke. Submit by **18 Dec** (4 days early) | Submitted |

Judge-install instructions must include: what to enable (Rovo, JSM), how to seed demo data, what to click in what order, and a note that TWG features are optional and off by default.

## 11.3 The three-minute video — beat sheet

| Time | Beat | On screen |
|---|---|---|
| 0:00–0:20 | **The lie of "we'll call you back."** One sentence of problem, one number (80% of serious medical errors involve handoff miscommunication). [R] | A short, real-looking handover note fading out; a name with no owner |
| 0:20–0:40 | **The product in one line.** "Relay turns promises into an owned ledger — and won't let a shift close without them." | The ledger panel, unowned items in amber |
| 0:40–1:10 | **Extraction.** Paste a messy note; two obligations appear, each citing its source sentence; one is corrected by a human | Live, with the source line highlighted |
| 1:10–1:40 | **The gate.** Shift lead tries to close; the Relay agent blocks; they accept one, reassign one, drop one with a typed reason | The refusal, verbatim on screen |
| 1:40–2:00 | **The person on the other end.** The family portal view updates: "owned by Grace, due Tuesday" | Portal, plain language, no clinical detail |
| 2:00–2:25 | **Evidence.** Seven shifts of debt: 11 → 8 → 8 → 5 → 4 → 2 → 2. Same mechanism, second setting (a plant handover) for 8 seconds | Trend chart; split-second domain switch |
| 2:25–2:50 | **Architecture flash.** Forge modules, Forge LLMs (no egress), agent, optional Teamwork Graph | One clean diagram, 20 seconds, no narration competition |
| 2:50–3:00 | **Close.** Who it is for, what changes, what you would measure | Text card |

Everything past 3:00 is bonus material for a judge who keeps watching: MCP demo, TWG Cypher demo, accessibility statement, admin cost controls.

## 11.4 Judging-day risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Judge installs without Rovo/JSM enabled | Medium | Detect missing capability and show a clear in-app explanation instead of an error; document prerequisites in the first three lines of the instructions |
| TWG scopes block install | High if not handled | Ship with TWG commented out; document the optional path; provide a recording rather than requiring a live org-admin grant |
| LLM latency on first run | High | Pre-warm, cache, and show progress; never a spinner with no text |
| Judge's site has no demo data | Certain | One-click seed + a "demo mode" that works on an empty project |
| Agent assignability differs by plan | Medium | Verify in week 0; if unavailable, demo agent-in-chat plus a workflow transition gate (same story, different surface) |
| Content moderation blocking a prompt | Low for this domain | Avoid unnecessary personal detail in prompts |

---

# 12. Research sources and documentation links

## 12.1 Competition (primary sources)

- Codegeist 2026 — official site: https://codegeist2026.devpost.com/
- Codegeist 2026 — official rules: https://codegeist2026.devpost.com/rules
- Codegeist 2026 — resources (module links, samples, videos): https://codegeist2026.devpost.com/resources
- Codegeist 2025 winners announcement: https://www.atlassian.com/blog/development/meet-the-winners-of-codegeist-2025-atlassian-williams-racing-edition
- Start sharing your app (installation links): https://developer.atlassian.com/platform/forge/distribute-your-apps/#start-sharing-your-app

## 12.2 Atlassian platform (primary sources, read directly)

- Forge LLMs API: https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api/
- Forge LLMs API reference (`@forge/llm`, tools, streaming): https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-reference/
- Forge LLMs models + context windows: https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-models/
- Forge LLM limits (100 rpm, 500k tpm, 5-min inference): https://developer.atlassian.com/platform/forge/limits-llm/
- Platform limits and usage (consumption pricing): https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/
- Permissions, scopes, external egress: https://developer.atlassian.com/platform/forge/manifest-reference/permissions/
- Forge SQL: https://developer.atlassian.com/platform/forge/storage-reference/sql-api/ and …/sql-api-schema/
- Release phases (EAP / Preview / GA): https://developer.atlassian.com/platform/forge/whats-coming/
- Rovo Agent module: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/
- Rovo Action module: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/
- Rovo Skill module: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-skill/
- Rovo MCP module: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/
- Rovo Agent Connector (A2A): https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent-connector/
- Integrate remote agents with Jira: https://developer.atlassian.com/platform/forge/remote-agents-in-jira/
- Jira Service Management modules: https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-jsm/
- Teamwork Graph — call the API: https://developer.atlassian.com/platform/teamwork-graph/call-the-teamwork-graph-api/
- Teamwork Graph — object types: https://developer.atlassian.com/platform/teamwork-graph/object-types/
- Teamwork Graph — scopes: https://developer.atlassian.com/platform/teamwork-graph/scopes/
- Teamwork Graph — limitations: https://developer.atlassian.com/platform/teamwork-graph/limitations-and-considerations/
- Teamwork Graph — build a connector: https://developer.atlassian.com/platform/teamwork-graph/build-a-teamwork-graph-connector/
- Marketplace — list a Forge app: https://developer.atlassian.com/platform/marketplace/listing-forge-apps/
- Runs on Atlassian: https://developer.atlassian.com/platform/marketplace/runs-on-atlassian/

## 12.3 Human-problem evidence

- Joint Commission handoff/sentinel-event material and I-PASS results (NEJM; AHRQ), summarised at: https://www.wolterskluwer.com/en/expert-insights/improving-patient-handoff-safety
- JAMA Network Open meta-analysis on discharge communication and 30-day readmission (summary): https://cliniciancore.com/blog-articles/care-transition-failures-readmission-risk/ — *secondary summary; verify the primary study before citing in the submission*
- AARP / National Alliance for Caregiving, *Caregiving in the U.S. 2025*; AARP Public Policy Institute, *Valuing the Invaluable 2026*: https://www.cnbc.com/2026/03/26/family-caregivers.html
- Alzheimer's Association, *Facts and Figures*: https://www.alz.org/alzheimers-dementia/facts-figures
- FBI IC3 2025 elder fraud reporting: https://www.fbi.gov/news/stories/scammers-target-older-adult-victims
- Benchmark Gensuite 2026 EHS Benchmarking Report (90% under-reporting): https://www.worksafety247.com/article/new-research-finds-90-of-incidents-hazards-near-misses-are-underreported — *vendor-sponsored research; treat as indicative*
- University of Iowa / RISC Summit 2026 hazard-reporting survey: https://prnewswire.com/news-releases/nearly-two-thirds-of-industrial-professionals-surveyed-say-under-5-of-workers-report-hazards-monthly-or-they-dont-track-it-302923209.html
- Content moderator mental health (peer-reviewed replication): https://doi.org/10.3390/bs15040487
- University of Washington moderator wellbeing study (summary): https://www.zevohealth.com/blog/the-real-risk-in-content-moderation-is-not-just-exposure-it-is-the-system-around-it/
- Deloitte disability inclusion at work (accommodation requests): https://www.supplychaindive.com/news/workers-are-willing-to-disclose-disability-but-dont-ask-for-accommodation/734878/
- UK Parliament, Work and Pensions Committee, *Employment support for disabled people* (reasonable adjustments): https://publications.parliament.uk/pa/cm5901/cmselect/cmworpen/1227/report.html
- Annie Lowrey, *The Time Tax* (2026) — 12B hours / ~$430B framing, via: https://we-news.com/us/new-book-frames-american-paperwork-as-a-costly-time-tax-on-citizens
- European Accessibility Act / ADA Title II / HHS §504 deadline summary: https://whatisada.com/deadlines — *verify dates against EUR-Lex and ADA.gov before submission use*
- Existing accessibility apps (competitive set): https://marketplace.atlassian.com/apps/1421596041/accesslens-for-confluence · https://remediator.app/ · https://marketplace.atlassian.com/apps/1231503/accessible-web-for-jira

## 12.4 Confidence warnings

Three categories of source in this report should be re-verified before you put a number in a video or submission text:

1. **Vendor-sponsored safety statistics** (90% under-reporting, 58% fear of blame, "3 billion near misses a year"). Directionally credible, numerically soft.
2. **Secondary summaries of peer-reviewed work** (the JAMA Network Open and I-PASS figures). The direction is well established; the exact percentages should be traced to the primary papers.
3. **Regulatory dates.** EAA (28 Jun 2025) and ADA Title II (Apr 2027/2028, following an April 2026 DOJ interim final rule that extended the original dates) are the two that matter most — check EUR-Lex and ada.gov directly, because a wrong date in a video is an avoidable credibility wound.

Everything marked **[V]** in this report was read directly from the official documentation cited above and can be relied on as of 30 October 2026 — but Atlassian ships fast, so re-check the module references in your first week of building.

---

## Closing note

The strongest idea in this report is not the most futuristic one. It is the one that takes a mechanism we already know works — a structured handover, a closed loop, a named owner — and uses AI for the part humans are genuinely bad at: finding the promise buried in a tired sentence, and remembering it when the shift changes.

That is the shape of product most likely to survive the judging period, and, more importantly, the shape of product worth building whether or not it wins.
