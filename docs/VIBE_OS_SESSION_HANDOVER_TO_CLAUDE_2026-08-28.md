# VIBE OS — SESSION HANDOVER (GLM/zcode → Claude)

**Date:** 2026-08-28 · **Branch:** `vibe-content-os` (worktree `D:\google downloads\Front-End-main\vibe-os-worktree`, 33+ commits, pushed to origin only) · **Status:** UI live on branch preview, five capabilities production-verified, hardening not started.

---

## 0. WHY THIS HANDOVER EXISTS

The founder wants a second brain on one design question above all:

> **Chat is great for planning/modifying the calendar — but for planning MONTHS ahead, is chat even right?**

Our current answer (mockup `calos-vibe-mockup.html`): calendar as a stage view + conversation as editor + trends as thread cards + drag-equals-talk. The founder likes it for modification, doubts it for long-horizon strategy. **Your job: read everything below, then propose alternatives** — planning canvases, plan documents co-edited by the agent, quarterly/campaign layers, hybrid modes — as concrete mockups/docs. Challenge our assumptions where warranted.

## 1. THE LOCKED MODEL (do not drift, but critique honestly)

- ONE conversation per Deliverable is the only command surface; the agent orchestrates all engines; the user never picks a tool.
- The stage auto-follows the conversation; status pips are read-only; read/talk to change view.
- Five capabilities behind one dispatcher: write/edit/design/analyze/distribute (+auto-edit from media attachments).
- Honesty spine: literal receipts, 8 designed states, typed outcomes (done/needs-clarification/capability-gap), gates for spend/publish/destructive, errors never silent.
- Founder's three historical wrong turns (rooms/tabs/selecting) must not return — but if long-horizon planning genuinely needs a non-chat surface, that's a NEW surface decision to make deliberately, not a drift.

## 2. FILE MAP (everything this session produced)

**Plans & docs (read first, in order):**
- `docs/VIBE_OS_PLAN.md` — the master plan (§8 mission control; §3 disposition matrix maps EVERY old feature → its new home)
- `docs/USER_JOURNEY_AND_MEDIA_PLAN.md` — dashboard-click-to-publish journey; composer media spec (§2); ICP testing seam (§3)
- `docs/CONNECTIVITY_MAP.md` — code-verified census of every engine surface → wiring status (trends tier marked NEXT)
- `docs/VIBE_OS_WIRING_CHECKLIST.md` — the living DONE/OPEN tracker with evidence
- `docs/contracts/PHASE0_CONTRACTS.md` — object model, turn protocol, manifests, credits quotes
- Root mockups: `vibe-system-v3.html` (approved shell), `calos-vibe-mockup.html` (the calendar question, §0)

**Contracts (lib/studio/contracts/):** `objects.ts` (Deliverable/Artifact/Edge/Thread, v0.3.0) · `turn.ts` (SSE protocol + confirm continuations) · `manifest.ts` (domain manifests + risk policy) · `credits.ts` (pre-flight quotes)

**Orchestrator (lib/studio/orchestrator/):** `write.ts` (ThinkForge direct: session→processChat, + ideas agent) · `edit.ts` (chat/stream bridge) · `auto-edit.ts` (from-asset bridge) · `design.ts` (Clickatron + spend gate) · `analyze.ts` (Alyzitron + gate) · `distribute.ts` (cadence + publish gate + queue) · `manifests/*` (five domains; edit mounts the real 66-tool registry — the drift seam)

**UI (app/studio + components/studio/):** session/thread/stage/home/composer-media/reel-embed/stage-iframe/use-artifact-polling · `app/api/studio/{turns,deliverables,overview,media}`

**Tests:** `scripts/studio/*` (smoke: write e2e, edit bridge, distribute)

## 3. VERIFIED STATE (what's proven, on the production preview with the founder's real account)

Write e2e (0.2cr, real draft) · design gate→session→lab embed (9cr) · edit live-loop (real project, registry receipt) · distribute cadence+gate · analyze gated submit · auto-edit from composer media w/ 8-stage rail · mission control (12 in-flight, 50 deliverables, real data) · all gates serverless-safe (confirm ends stream, answer re-posts, server re-derives price) · org admin role-check fixed. NOT done: UploaderX arming, destructive pre-flight gate, storyboard chain, account skin, hardening (a11y/perf/mobile/legacy redirects).

## 4. THE OPEN DESIGN QUESTIONS (where we want your alternatives)

1. **Long-horizon planning** (§0) — months-ahead strategy in a chat-first system. Our sketch: a "planning mode" where the agent drafts a quarterly plan DOCUMENT/canvas the user edits structurally (themes → campaigns → slot templates), chat narrates, one confirm propagates to the calendar. Is that right? Better shapes?
2. **Chat ↔ direct-manipulation boundary** — drag-equals-talk keeps receipts but what about bulk ops (move 12 posts), scenario comparison (this week vs next), undo across a whole replan?
3. **Campaign layer** — CalOS has campaigns; the plan made them optional overlays. Do quarterly arcs deserve first-class presence in mission control?
4. **Mission control vs planning** — is one screen enough for both "status of everything" and "shape the next quarter"?
5. Smaller: destructive pre-flight gate UX; account shell skin; trends card density in thread.

## 5. RULES FOR THIS CONSULTATION

- READ-ONLY on the codebase; deliverables are docs + self-contained HTML mockups in the Front-End-main root (founder reacts to artifacts).
- Ground claims in the files above; cite paths. The census (CONNECTIVITY_MAP) is code-verified — trust it over memory.
- Founder style: hates verbosity, loves reacting to concrete artifacts, "quality over speed" but gets frustrated when you explain instead of deliver.
- Do not reintroduce rooms/tabs/user-tool-picking. If a new surface is genuinely needed (e.g. planning), propose it explicitly as a deliberate exception with tradeoffs.

*End of handover. The plan is alive in the checklists; the code is on the branch; the calendar question is yours to attack.*
