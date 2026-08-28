# VIBE CONTENT OS — COMBINED BUILD PLAN

**Date:** 2026-08-23 · **Worktree:** `vibe-os-worktree` (branch `vibe-content-os`, off `infrastructure-improvs-+Editron` @ `ec681ebde`)
**Inputs:** full front-end census (5 parallel explorations of all 79 pages + 429 API routes), vibe-coding interface research (Cursor 3 / Claude Code / Replit / v0 / Lovable + first-hand agent-harness knowledge), the Claude handover (`VIBE_CONTENT_OS_HANDOVER_2026-08-23.md`), and the approved design mockups (`vibe-system-v3.html`).

---

## 0. THE ONE-PARAGRAPH THESIS

Insturix already **is** a multi-engine content OS — 8 products, 277 service API routes, SSE streaming, credit gates, checkpoints, job queues. What it lacks is the **vibe layer**: one conversation that orchestrates all engines, and a stage that auto-follows the work. The build is therefore **NOT an engine rewrite** — it is (a) a unified **Deliverable/Artifact object model**, (b) a cross-service **Turn Orchestrator** with an SSE turn protocol, and (c) a new **vibe shell UI** that absorbs the per-product dashboards as stage views. Every existing feature either gets absorbed, re-homed, or explicitly retired — nothing silently disappears. That mapping is §3, the plan's core.

---

## 1. GROUND TRUTH — WHAT EXISTS TODAY (census)

### 1.1 The products and their objects
| Product | Route(s) | Core object | What it does (user-visible) |
|---|---|---|---|
| **Editron** | `/dashboard/editron/*` (10 routes) | `project` | Upload or generate → auto-edit processing (8 stages) → full editor (Remotion player, free-form overlay timeline, 24 overlay types) → chat-to-edit (67-tool registry, SSE, receipts, confirm gates, checkpoints) → render (SSR/Lambda, resume-on-refresh, audio-rights gate) |
| **ThinkForge** | `/dashboard/thinkforge` | `session` | Ideation (4 ideas + editorial angles, trend workflow, URL-to-brief) → Tiptap scripting w/ AI co-writer chat (SSE) → export to Editron (storyboard pipeline) or Clickatron (creative spec) → Shoot Kit |
| **Clickatron** | `/dashboard/clickatron(+lab)` | `canvas session` | Prompt/sketch/selection → 11-model generation (multipliers, credit badge) → variations gallery, fine-tuning, curves → commit (optionally attaches to Editron project) |
| **Alyzitron** | `/dashboard/alyzitron(+report)` | `task` | Link-or-file ingest (R2 multipart, YouTube/IG/X) → intent-aware scorecard (score/strengths/metrics/timestamps seek) → chat interrogation over transcription (SSE) → share/privacy/PDF |
| **CalOS** | `/dashboard/calos(+v3, campaigns)` | `campaign` + `deliverable` | Month/week/day calendar per brand, drag-reschedule, editorial lifecycle (idea→…→approved), cadence suggest (regex table), auto-fill + AI-plan + generation review, approval-queues-publish (cron sweeper, atomic claim, version-bound snapshots) |
| **UploaderX** | `/dashboard/uploaderx` | `video` + platform metadata | Connect 5 platforms (OAuth, token health/reconnect states), arm platforms w/ capability-gated fields (publishAt: YT+FB only), resumable chunked uploads, partial-failure retry (failed-only), scheduled calendar |
| **Musitron** | `/dashboard/musitron` | `task` | 4-model music generation (credit-gated), DAW (multi-track, mixer, FX, piano roll, automation, export), jukebox collections |
| **Socialize** | `/dashboard/socialize` + public `/profile/[u]` | socialize profile | Link-in-bio: banner/links/notifications editor + live phone preview + public page |
| **Storyboard** | `/dashboard/storyboard/[id]` | `storyboard` | Scene images → approve/reject/regenerate → TTS voiceover → per-scene AI video (credit breakdown) → finalize into Editron project |
| **Avatar Vault** | `/dashboard/avatar-vault(+v2)` | `avatar profile` + pipeline job | 6-step persona forge (identity/style/performance/voice/persona/rights), AI auto-infer, render pipeline (voice clone → face video → composite) with staged polling |
| **Brand Vault** | `/dashboard/brand-vault` | brand + signal profile | Scan website/socials/uploads → AI refinery extracts signals → human review/conflict resolution → brand truth used by all tools; domain verification; scan history |

### 1.2 The shell today
- **Dashboard home** = "Production Floor": Attention Zone (dismissable alerts), 5-stage Pipeline kanban (board/list/split/cinematic views), Shipped strip, CreditsCard. Sidebar nav uses **phase verbs** (Plan/Script/Edit/Analyze/Design/Distribute + Music/Share/Team/Vault/Avatar/My Content/Credits).
- **ActiveBrand system** (`ActiveBrandProvider`): union of Editron + Brand Vault brands, per-user+org persisted selection, cross-tab event — the multi-brand spine already exists.
- **Billing**: Razorpay; plans Agency Starter/Growth/Scale ($100/$500/$1000); 30 credits = $1; **two wallets** (main workflow + media model-weighted); org wallet pooling (flag-gated); per-action `CreditCostBadge`; insufficient-credits popups; refunds on failure (webhook-driven).
- **Orgs**: Clerk orgs synced to Mongo; roles owner/admin/member; constellation org dashboard; danger-zone delete.
- **Realtime**: SSE only (3 endpoints: editron chat stream, thinkforge chat, alyzitron chat). Everything else polls (2.5–12s cadences, conditionally while in-flight). QStash workers (`api/internal/workers/*`, ~25) + 23 Vercel cron jobs do async heavy lifting.
- **Honesty patterns already in production** (audit-driven): error-never-renders-as-empty (retry states), typed confirms for destructive ops, refund dead-ends, idempotency keys + 409 replay handling, partial-failure receipts, "needs_input" branches with uncovered-beat lists.

### 1.3 Gems the vibe layer must inherit (not reinvent)
1. **`lib/editron/agent/chat-tool-registry.ts`** — 67 tools each with `label/shortLabel/iconCategory/riskLevel/receiptLabel/loadingMessages/executionType/exposure/turnContract`. This is literally a domain manifest for the vibe UI.
2. **SSE chat patterns** — `ChatSseJsonParser`, `contentSegments` (interleaved text+tool rendering), token streaming, abort + route-change guards.
3. **`clientContext`** — spatial cursor over preview/timeline sent with every turn (the agent knows what you're pointing at). The single most vibe-coding mechanic already shipped.
4. **Checkpoints** (`initial/before-llm/after-llm/user-edit` + restore receipts with state-hash verification) and autosave-paused-during-AI.
5. **Confirm/economics gates** — 402 credit bubbles, Auto-Director confirmation, render quality gate, audio-rights attestation, retry-duplicate warnings.
6. **EDL suggestions + AI Suggestions panel** — analysis-derived next-action chips that prefill the chat.
7. **Deliverable lifecycle + publishing safety** (CalOS): approval-is-the-gate, atomic queue claims, version-bound snapshots, capability matrix (supported/planned/blocked), token health → reconnect-before-queue.

---

## 2. VIBE-CODING INTERFACE PRINCIPLES → CONTENT TRANSLATION

Distilled from Cursor 3's agent-first redesign, Claude Code, Replit checkpoints, v0/Lovable plan-visibility, and first-hand operation inside an agent harness:

| # | Principle (in coding tools) | Insturix translation |
|---|---|---|
| P1 | **One composer is the command surface.** You never open a "refactor tool" | One thread per Deliverable; the omnibar accepts any intent (write/cut/design/schedule/analyze). ⌘K global. |
| P2 | **Plan visibility before action** (plan mode, inspectable + interruptible) | Every turn opens a plan card (steps + real tool names + risk); Ask mode = plan-then-confirm, Direct mode = plan-while-running; interrupt button mid-run. |
| P3 | **Progress streaming ≠ token streaming** — steps/checks stream separately from prose | Turn protocol events: `turn.plan → step.start → step.progress → step.done(receipt) → turn.done`; step receipts use literal `receiptLabel`s. |
| P4 | **Workspace auto-follows the agent** (files open themselves, diffs appear) | Stage auto-follows: script view → timeline → canvas grid → scorecard → calendar; "why am I seeing this" header + follow badge. |
| P5 | **Checkpoints before destructive actions, one-click restore, clear restore semantics** | Reuse Editron checkpoints; thread shows restore points; "undo" quick-reply maps to `restore_ai_edit_checkpoint`; staleness flags downstream. |
| P6 | **Override architecture** (interrupt, correct mid-flight, take over manually) | Manual-control escape hatch: every stage view offers "take the wheel" → full editor (like Cursor: agent AND hand-editing coexist). Director Mode is the in-editor version of this. |
| P7 | **Progressive autonomy** (agents earn trust; modes) | Ask/Direct segment (already designed); per-risk confirm gates (high-risk tools always confirm); session memory of granted permissions is a later iteration. |
| P8 | **Context attachment & pointing** (@files, selection, cursor) | @-mentions for brands/assets/scripts; **spatial cursor** (exists!); attachments picker (exists); "show me X" view commands. |
| P9 | **Economics visible** (token costs, diffs of spend) | Confirm-before-spend cards with wallet balance (exists as 402 flow — make it pre-flight, not post-failure); per-turn credits-consumed badge (exists). |
| P10 | **Honest failure** (never fake done; typed outcomes) | Turn outcomes: `done · needs-clarification · capability-gap · declined`; the 8 designed states (empty/streaming/job/error/offline/queued/stale/done) as acceptance criteria. |

---

## 3. FEATURE DISPOSITION MATRIX — every surface, where it goes

Legend: **ABSORB** = becomes conversation capability + stage view · **STAGE** = embedded viewer/editor in the stage · **ACCOUNT** = account shell (configure, not make) · **KEEP** = stays as-is · **RETIRE** = deleted with reason · **FLAG** = decision needed.

### 3.1 Editron
| Current | Disposition |
|---|---|
| New-project doors (upload/generate), recent strip | **ABSORB** into Home + thread: "make a reel from this footage" (attachments) or script-first; upload = attachment w/ rights attestation |
| Auto-edit processing screen (8 stages, needs_input beats, rescue-to-director, refund) | **ABSORB** as turn steps + processing state in thread; `needs_input` = clarification card listing uncovered beats; rescue = capability-gap card offering Director Mode |
| Full editor (player, timeline, overlays, keyframes, markers) | **STAGE** (primary). v2 shell re-skinned as the Reel stage; "open full editor" = P6 escape hatch (same route, full-screen) |
| Chat-to-edit panel + sessions CRUD | **ABSORB** — the thread IS this, generalized. Session list → thread history per deliverable |
| AI Suggestions / EDL suggestions / Quality panel | **ABSORB** as agent-proactive cards ("3 fixes found — apply?") + quality score in stage header |
| Render flow (gates, resume, history, audio rights) | **STAGE** action + confirm card; render-resume claim logic reused |
| SaaS explainer intake+studio | **ABSORB** as a flow template the agent runs ("make a SaaS explainer" → brief → script → render as plan steps) |
| Debug + mg-review consoles | **KEEP** operator tools (INTERNAL_TOOLS gate); link from admin |
| Director Mode / assist lane (scan briefing + starter chips) | **ABSORB** as the Ask-mode archetype: agent scans first, proposes, then acts |

### 3.2 ThinkForge
| Current | Disposition |
|---|---|
| Ideation (prompt+knobs, 4 ideas, trends, URL-brief) | **ABSORB**: intent → agent runs ideation, ideas render as artifact cards in thread; trends = agent capability ("what's trending for DTC?") |
| Authoring knobs (3 kinds, platform, duration, hashtags) | **ABSORB** as lightweight inline chips on the FIRST turn (progressive disclosure), not a form; inferOutputFormat does the rest |
| Script editor (Tiptap, tabs, AV view) | **STAGE** (Script view) with P6 manual editing |
| Co-writer chat | **ABSORB** (it becomes the thread itself) |
| Export pipelines (→Editron storyboard, →Clickatron spec) | **ABSORB** as typed artifact edges: script.reel, script.carousel — agent traverses them, staleness flows along them |
| Shoot Kit | **STAGE** panel on Script artifact (production planning) |
| Planning mode | Already redirects to CalOS — **RETIRE** shim |

### 3.3 Clickatron
| Current | Disposition |
|---|---|
| Lab grid / sessions | **ABSORB**: canvases are artifacts; Home lists them; thread opens stage |
| Canvas stage (variations, fine-tune, curves, sketch, selection, generative fill) | **STAGE** (Design view) — full manual control preserved |
| AI console (prompt, model selector, enhancer, references) | **ABSORB** into thread; model choice = agent decision surfaced in step ("using flux — text-heavy") with override chip |
| Commit/attach to Editron | **ABSORB** as artifact edge (thumbnail → reel) |
| Credits per model | P9 cards |

### 3.4 Alyzitron
| Current | Disposition |
|---|---|
| Link/file ingest + context selector | **ABSORB**: "teardown this URL" in thread; context = clarifying chips |
| Scorecard report | **STAGE** (Analyze view); timestamps seek the stage player |
| Chat interrogation | **ABSORB** (thread, scoped to analysis artifact) |
| Share/privacy/PDF | Artifact actions |

### 3.5 CalOS + UploaderX
| Current | Disposition |
|---|---|
| Calendar (views, drag, review rail, health states) | **STAGE** (Schedule view) + Home widget; agent edits it conversationally ("move Tuesday's post") |
| Cadence suggest / auto-fill / AI plan / trends | **ABSORB** as agent capabilities with generation-review cards (the existing snapshot-review pattern) |
| Campaigns | Deliverable grouping in Home (campaign = optional overlay, per handover) |
| Content modal (brief, dates, image gen, delivery states) | **ABSORB** into thread + schedule stage detail |
| Platform connections (OAuth, token health, assign models A/B) | **ACCOUNT** (Connections) with health surfaced in-thread before queueing (reconnect card) |
| Publish gates (approval, duplicate-retry, cron safety) | **KEEP logic**; confirm-before-publish card in thread |
| UploaderX fragmentation/publish/reveal flow | **ABSORB**: "post this everywhere" → platform arming card w/ capability matrix (blocked fields honest), per-platform receipts in thread |
| Scheduled calendar (YT/FB native) | Part of Schedule stage |
| Socialize link-in-bio | **ACCOUNT-adjacent**: brand profile config; agent can update it ("add my new reel to my page") |

### 3.6 Musitron / Storyboard / Avatar Vault
| Current | Disposition |
|---|---|
| Music generation + history | **ABSORB** as audio artifact + thread steps ("give it a lo-fi bed") |
| DAW | **STAGE** (audio view) — heavy, lazy-loaded, P6 escape hatch |
| Storyboard workspace | **STAGE** on the script→reel edge (approve/reject scene cards in stage; agent drives) |
| Avatar forge + render pipeline | **ACCOUNT** (persona library) + **ABSORB** render as thread flow ("make Maya present this script") |

### 3.7 Shell / platform
| Current | Disposition |
|---|---|
| Production Floor home (attention, pipeline, shipped) | **REPLACED** by vibe Home: "What do you want to make?" + producing-now + deliverables-by-brand (designed in v3). Attention zone → agent-raised items in threads + Home |
| Sidebar (14 entries) | **GONE** in vibe surface (the whole point). Dashboard routes keep it until migration completes |
| ActiveBrand | **KEEP + elevate**: brand switcher in topbar (v3 design) |
| Billing/upgrade/Razorpay/modals | **ACCOUNT** shell; confirm-before-spend reads wallet |
| Org pages | **ACCOUNT** |
| My Content | **ABSORB** into Home/deliverables + artifact search in omnibar |
| Brand Vault | **ACCOUNT** (brand management) but **agent-invokable** ("rescan Nike's site") with review cards in thread |
| Public site, admin, ICS/bronze/cashback, legal, resources | **KEEP untouched** (out of vibe scope) |
| `/api/ics25/admin/bronze-promotions` referenced by admin UI but not in repo | **FLAG** — dead endpoint or external; file an issue, don't block |

---

## 4. TARGET ARCHITECTURE

### 4.1 Routes
```
/studio                     vibe Home (auth'd; replaces /dashboard eventually)
/studio/d/[deliverableId]  the vibe surface: thread + auto-following stage
/studio/d/[id]/full/[…]    full-editor escape hatches (editron editor, DAW, canvas)
/account/*                  org, billing, connections, brands (vault), avatars, storage
/dashboard/*                LEGACY — frozen, feature-flagged redirect after parity
(+ unchanged: public site, admin, api)
```

### 4.2 Object model (the one true unification)
```
Deliverable (brand-scoped; optional campaign overlay)
 ├─ thread (one direction conversation, spans everything)
 ├─ artifacts[] — typed: script | reel | thumbnail | image-canvas | audio |
 │   music | analysis | schedule | avatar-video | carousel | email | post…
 │   each: status (8 states), revisions[], checkpoints[], provenance
 ├─ edges[] — typed: derived-from, stale-if, attaches-to
 └─ stageFocus (what the agent is showing + why)
```
Mapping from today's objects: Editron `project`→Deliverable(reel), ThinkForge `session`→script artifact (or standalone Written deliverable), Clickatron `session`→canvas artifact, CalOS `deliverable`→schedule artifact + lifecycle, Alyzitron/Musitron `task`→analysis/audio artifacts, Storyboard→edge view, Avatar job→render flow. **Adapter layer first** (read-side aggregation over existing Mongo collections), storage unification later — never big-bang.

### 4.3 Turn Orchestrator (the new backend piece)
- `POST /api/studio/turns` (SSE): `turn.received → turn.plan → step.start/progress/done{receipt} → turn.done{outcome, creditsConsumed} | turn.needs_clarification | turn.capability_gap`.
- A **domain manifest registry** generalizing `chat-tool-registry.ts` to all five capabilities (tools, cost, risk, canvas type, artifact type) — the "UI is the spec" contract from the handover.
- Reuses: credits middleware (pre-flight quote + confirm), QStash for long steps (fixes the known `apply_editorial_intent` serverless-timeout class of bug), SSE parser, checkpoints, existing service routes as tools.
- Interrupt support: `DELETE /api/studio/turns/:id` (cooperative cancel + refund semantics already exist per-tool).

### 4.4 Frontend structure (new, isolated)
```
app/studio/**            routes (thin)
components/studio/
  shell/                 topbar, brand switcher, mode segment, credits chip
  thread/                messages, plan-card, step, artifact-mini, receipt,
                         clarify/gap/confirm cards, composer, omnibar
  stage/                 stage host + views: ScriptView, ReelView (embeds
                         editor v2 providers), CanvasView, AnalyzeView,
                         ScheduleView, AudioView, StoryboardView
  home/                  hero prompt, producing-now, deliverable rows
lib/studio/              client SDK: turn client (SSE), deliverable store,
                         stage-focus router, mock orchestrator (Phase 1)
```
No edits to engine internals except adapters + a few registries. Legacy stays shippable throughout.

---

## 5. PHASED BUILD PLAN

> Rules per phase: ≤ ~5 files touched per approval window where feasible, `npx tsc --noEmit` + `npx eslint . --quiet` clean before "done", each phase ends with a founder demo + explicit approval before the next. Work happens ONLY in `vibe-os-worktree`. Push to `origin` only.

**Phase 0 — Contracts (docs + types only).**
Deliverable/Artifact/Edge schemas (zod), turn SSE event protocol spec, domain-manifest registry format, adapter inventory (which collection ↔ which artifact), credits pre-flight quote contract. Exit: founder approves the object model.

**Phase 1 — Vibe shell on mock orchestrator.**
`/studio` + `/studio/d/[id]` with `lib/studio/mock-orchestrator.ts` replaying scripted turns (write→edit→design→schedule demo, all honesty cards, all 8 states, all stage views as static embeds). Visual system from `vibe-system-v3.html` productized (tokens from `design-tokens.css`, single source — kill the duplicated inline token objects). Exit: the mock proves the whole interaction model live; founder reacts.

**Phase 2 — Orchestrator v1 + Write family real.**
Real `POST /api/studio/turns` behind a flag, ThinkForge tools wired (ideate/draft/refine/export), Script stage view editable (Tiptap embed), script artifacts real. Exit: "write me a launch post" works end-to-end on real data.

**Phase 3 — Edit family.**
Editron tool registry mounted into orchestrator; ReelView embeds editor v2 providers (timeline/monitor/chat-context spatial cursor); checkpoints + undo in thread; render confirm + resume. Exit: full reel deliverable in one thread.

**Phase 4 — Design + Distribute.**
CanvasView (Clickatron embed, model-routing surfaced); ScheduleView (CalOS embed: calendar, review rail, delivery states); confirm-before-publish card; connection-health cards. Exit: thumbnail + schedule artifacts live in the same thread.

**Phase 5 — Analyze + Music + Avatar + Storyboard.**
AnalyzeView (scorecard, timestamp seek), AudioView (generation + DAW hatch), StoryboardView (approve/regenerate scene cards), avatar render flow. My-Content absorbed into Home search.

**Phase 6 — Home + Account shell.**
Vibe Home real (deliverable aggregation adapters, producing-now live states, attention items); `/account/*` (org, billing, connections, brand vault re-homed, avatar library, storage); brand switcher wired to ActiveBrand system.

**Phase 7 — Migration + hardening.**
Feature-flag redirects `/dashboard → /studio` per-product as each reaches parity; a11y pass (focus, keyboard, reduced-motion); perf (lazy stages, virtualized threads); delete dead sidebar; monitoring.

---

## 6. RISKS & OPEN QUESTIONS
1. **Thread identity vs. existing chat sessions** — thread = superset of Editron chat sessions; migrate or wrap? (Phase 2 decision.)
2. **Heavy editors in stage** — Remotion/DAW in a half-pane may be cramped; mitigations: resizable split, full-editor hatch, per-view minimum widths. Needs real usage testing.
3. **Polling → SSE gap** — most engines poll; orchestrator should own progress events and fan in polled states server-side (client keeps one SSE connection). QStash already gives durable jobs.
4. **Org wallet flag** (`ORG_WALLET_BILLING`, default OFF) — decide before pricing confirm cards show org vs personal wallet.
5. **`/api/ics25/admin/*` missing endpoint** — file separately; not a blocker.
6. **Vercel builds currently failing** from the unrelated dashboard-maturity session — must be fixed (or confirmed fixed) before Phase 1 CI matters; it lives outside this worktree's scope but blocks deploys.

## 7. VERIFICATION PROTOCOL (every phase)
`npx tsc --noEmit` · `npx eslint . --quiet` · `npm test` (vitest suites exist per engine) · Playwright smoke on `/studio` states · visual diff against approved mockups. No phase is "done" on file-writes alone.

---
*Sources for §2: [Cursor agent best practices](https://cursor.com/blog/agent-best-practices) · [Cursor 3 agent-first interface](https://zenvanriel.com/ai-engineer-blog/cursor-3-agent-first-interface-developer-guide/) · [Agent UX 2026](https://fuselabcreative.com/ui-design-for-ai-agents/) · [Checkpoints & Restore pattern](https://aiuxplayground.com/pattern/checkpoints-and-restore) · [Replit checkpoints](https://docs.replit.com/features/version-control/checkpoints-and-rollbacks) · [UX for Agents — LangChain](https://www.langchain.com/blog/ux-for-agents-part-1-chat-2) · [v0 vs Lovable](https://vercel.com/i/v0-vs-lovable) · [Architecture of AI app builders](https://www.beam.cloud/blog/agentic-apps) · [Streaming pattern anatomy](https://www.setproduct.com/blog/ai-chat-interface-ui-design)*

---

## 8. MISSION CONTROL DASHBOARD (founder directive 2026-08-28)

Entry = one screen with the status of ALL work + project management + start doors.

**Data (verified census):**
- Attention: GET /api/dashboard/attention (failed batches; dismiss via DELETE)
- Editron: projects/list → pipelineStage, projectStatus, qualityScore; detail → autoEditStatus/proxy in-flight
- ThinkForge: Session.activeGeneration (status running/failed + progress) — metadata route strips it; call db.getUserSessions directly
- Alyzitron: analyses list → status listed/queued/processing/completed/failed (+unread, refunded)
- Musitron: history → listed/processing/completed/failed
- Clickatron: per-variation status only (generating/completed/failed) — session detail fetch
- CalOS: deliverables (brandId) → editorialStatus + imageStatus; publish-status → pending/claimed/publishing/published/failed (+canRetry)

**Layout:** [Needs you] attention items w/ dismiss → [In flight] per-engine running rows (stage, engine dot, link) → [Your work] deliverable rows (existing) → [Start new] doors: chat-first (reel/post/email via /studio/d/live) + heavy doors (upload→editron, saas-explainer, music, avatar).
Aggregation: GET /api/studio/overview (self-fetch bridges with forwarded auth; TF direct).
