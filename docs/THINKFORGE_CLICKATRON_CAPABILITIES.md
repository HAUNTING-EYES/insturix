# Insturix — ThinkForge & Clickatron Capabilities

> Branch: `infrastructure-improvs-+Editron` (infra — the test branch).
> Last verified: 2026-06-27. Every capability below is grounded in code on this branch.
> Status legend: **LIVE** (wired + in the default path) · **LEGACY** (works, but only powers a secondary path) · **GATED** (behind a flag/precondition) · **STRANDED** (built but unreachable) · **BROKEN** (known defect).

---

## Part 1 — ThinkForge (AI content writing)

ThinkForge takes a prompt and produces ideas, scripts, social posts, and edits, then hands off to Clickatron (images) and Editron (video). It is wrapped in a session-scoped chat workspace.

### 1.1 The two writer stacks (read this first)

There are **two parallel writer stacks**, reached by different routes:

| | Stack A — flat writers | Stack B — orchestrated author |
|---|---|---|
| Agents | `PostWriterAgent`, `ScriptWriterAgent` | `generateScriptDraft` → `ScriptOutlineAgent` + `ScriptContractAgent` + `ScriptAuthorAgent` + `StylistAgent` |
| Reached by | chat draft (`chat-service.ts:876/906`) — the default | `/script/edit`, `/script/edit-blocks`, blueprint builds (`chat-service.ts:379`) |
| Prompt | XML-structured, single-shot | multi-stage (outline→contract→author→stylist) |
| Writing knowledge graph | **PostWriter only** (this session) + filler gate — removed from ScriptWriter (A/B-proven regression, min 92→75) | techniques + filler |
| Post-gen compliance scoring | **yes (this session)** — scoring + surfacing, no auto-repair | yes + stylist auto-repair |
| Writing-context cache (doc) | yes (both writers) | yes |
| Eval | `eval-thinkforge-writers.ts` (current, regression baselines, judge) | `eval-thinkforge-author.ts` |
| Latency | lower | higher |

**Stack A vs Stack B parity:** after this session, Stack A is the stronger *generation* path on every axis except one. It now has XML prompt hygiene + seed + context cache + the technique graph + the current regression eval + **post-gen profile-compliance scoring** (wired this session). Stack B's only remaining unique edge is the **stylist auto-repair stage** (it rewrites on a critical compliance violation; Stack A scores + surfaces + logs loud but does not auto-rewrite) and **multi-artifact orchestration** for blueprint/edit. So for a single draft, Stack A now leads; Stack B is retained for edit/blueprint orchestration and its repair loop. The last optional step to full parity = give Stack A a repair pass (regenerate on critical) — deliberately deferred (needs its own eval).

### 1.2 Capabilities

**Ideation** — LIVE. 4 diverse, platform-tagged idea cards. `POST /thinkforge/ideas` → `IdeasAgent` (`ideas-agent.ts`), code-enforced platform/intent correctness, seed 42. Brand-aware via systemBrief only. Sibling: `/enhance` streams a raw concept expansion.

**Script writing** — LIVE (Stack A). Markdown scripts with Narration/Visual split + 1:1 scene prompts for handoff. `ScriptWriterAgent.runStructured` (`script-writer-agent.ts`). Uses the writing-context cache, the filler gate (+ self-repair), content-signal grounding. The writing-graph technique block is deliberately NOT injected here — a 10-seed A/B showed it regresses the rigid script format (min 92%→75%, variance 8→25pp); it stays on PostWriter only.

**Post / social writing** — LIVE (Stack A). Platform-tuned posts (hook/body/CTA/hashtags) + embedded Clickatron prompts (`singleImagePrompt` / `carouselPrompts`). `PostWriterAgent` (`post-writer-agent.ts`). XML prompt, publishable-quality gate.

**Editing** — LIVE but on **Stack B (legacy)**. Full-doc (`/script/edit` → `generateScriptDraft`), block-level (`/script/edit-blocks` → `ScriptAuthorAgent`), in-chat refinement (`ScriptRefinementAgent`). Versioned persistence (`command-service.ts`). (The P5 migration of edit paths to the flat writers is on `p5-edit-migration`, not yet merged.)

**Chat workspace** — LIVE. SSE-streamed, intent-routed: EDIT → refinement; DRAFT → writers; RESEARCH → `research-agent` (live google grounding); CHAT → `chat-agent`. Session lifecycle routes (`/session`, `/sessions/[id]`, `/generation/status|stop`).

**Sidecar specialist panel** — LIVE. `POST /thinkforge/sidecar`: `deconstruct` (IngestorAgent), `storyboard` (ArchitectAgent), `refine_voice` (StylistAgent), `summon_specialist` (Supervisor→Null one-shot agent), `detect_scope`, `discover_blueprint`. (`initialize_blueprint` is a deprecated 410.)

**Content-signal quality** — LIVE. `resolveContentSignalProfile` (`content-signal-resolver.ts`) deterministically resolves rhetorical/format signals + a resolved creative intent, folded into the system brief and persisted as a signal trace (used for the Clickatron handoff). Threaded into the writers this session.

**Writing knowledge graph** — LIVE on **PostWriter + ScriptAuthor (Stack B)**; removed from ScriptWriter (A/B-proven regression). `buildWritingKnowledgeBlock(signals)` (`writing-graph-query.ts`) selects the top technique per category (DO/WHY/NEVER) from the signals. Plus `getAntiAiConstraintBundle()` filler patterns and `quality-scorer.ts`.

**Handoffs** — LIVE. To Clickatron (the creative-spec sidecar — see Part 3). To Editron: `/script/export-for-editron` (LLM scene parser + regex fallback guarded by a quality gate that 422s on narration==visual or leaked editorial metadata).

**Eval / CI** — `eval-thinkforge-writers.ts` (live writers, multi-seed, regression baselines, optional LLM judge with overfit detection), `eval-thinkforge-author.ts`, `-ideas`, `-clickatron-sidecar`, `-provider-comparison`, `-safe-canary`.

### 1.3 Brand Vault integration (ThinkForge)

Voice-centric and **thin**: BrandDNA (`voiceLock`, `nicheMap`, `killList`, `hookArchetypes`, `structuralHabits`) is serialized into the system brief (`fetchContextSources.ts`). Write-back to Brand Vault for 4 signal paths (audience, killList, hookArchetypes, recurringPhrases) via `brand-vault-voice-evidence.ts`. **Stranded:** ThinkForge does not call the brand-effective-resolver / `buildBrandContextBlock`; ~5 of ~50 brand signals reach a prompt. Palette/typography/visual/psychographics are defined in the vault but unconsumed by ThinkForge (and pass through the handoffs only thinly).

### 1.4 ThinkForge gaps

- Two-writer split — a fix to one stack misses the other (edit paths still legacy until P5 lands).
- Brand Vault thin for ThinkForge (voice only).
- Post-gen compliance scoring runs only in Stack B.
- Stranded/dead: `script-section-agent`, `script-coherence-agent`, `cross-doc-sync`, root `/thinkforge` 404.

---

## Part 2 — Clickatron (AI image / thumbnail studio)

Prompt → generate → edit → variations, with model choice, mask-based fill, sketch-edit, brand-awareness, carousel, and a credit/refund system. Async: route → Mongo task → QStash job → worker → `fal.subscribe` → R2.

### 2.1 Capabilities

**Text-to-image** — LIVE. Prompt + aspect ratio + optional refs. `POST /clickatron/session` (3 credits; blank = free). Default model **Imagen4** (`clickatron-models.ts`). `maxDuration=300` so Fal isn't killed mid-generation. Variations capped at 50/session.

**Model selection & registry** — LIVE. 18-model registry: Imagen4, Seedream v4/v4.5/v5-lite, Flux Kontext/Pro/2-Pro, Nano Banana + Pro, Gemini 3 Pro Image, Wan 2.6. Per-model flags: seed (`modelSupportsSeed`), reference-image min/max, inpainting/sketch capability, **text rendering** (`modelSupportsTextRendering`). Context routing (`getAvailableModels`): ideation/newVariation/edit/generativeFill/sketchToEdit. Default = i2i if a parent/ref image exists, else t2i.

**Variations / image-to-image** — LIVE. Iterate from a parent image (`parentVariationId`); worker re-signs the parent R2 URL and edits from it.

**Generative fill (inpainting)** — LIVE. Mask a region → regenerate only it. `POST /session/[id]/generative-fill` (3 credits). Strict "modify ONLY the white masked area" system prompt. Allowed fill models = Seedream 5 Lite / Nano Banana Pro Edit / Gemini 3 Pro Image.

**Sketch-to-edit** — LIVE. Annotate an image (`img2`) → model applies the edits. `POST /session/[id]/sketch-to-edit` (3 credits), default Nano Banana Pro Edit. Best-instrumented route for refunds.

**In-image text vs editable overlays (C2)** — LIVE (this session). `shouldRenderTextInImage(textPolicy, modelId)` (`brand-prompt-context.ts`): explicit `no_generated_text` → suppress; explicit `minimal_generated_text` → render; **default `editable_text_layers` → the user's picked model decides** (text-capable Nano Banana/Seedream/Gemini 3 → bake copy; Imagen4/Flux → text-free). Note `minimal_generated_text` is a valid enum but no upstream path emits it — the model is the live trigger. Render-rules fall back to text-free when no copy is supplied (no invention).

**Carousel** — LIVE (landed this session via the P6 merge). A `kind:'carousel'` spec with per-slide `imagePrompt` + `textLayers` now **fans out N slides → N variations/jobs → N images** (`session/route.ts`, `clickatron-context.ts`, `useCanvasStore.ts`), instead of collapsing into one composite image. Visible-content fallback caps slides at 8.

**Brand-aware generation** — LIVE + **default-ON** for Clickatron (`brand-flags.ts`, kill-switch `BRAND_VAULT_SOURCE_CLICKATRON`). Reads the accepted `BrandSignalProfile` and builds a rich `<brand_context>` (palette/typography/9 visual directives/audience/hooks/kill-list) from actionable signals; falls back to legacy `UnifiedBrand` else. **Fail-open** (non-`strict`) — a missing/failed profile silently falls back rather than refusing (the caller-adoption gap). Brand learning: the committed thumbnail is written back as a visual-signal learning event.

**Credits & refunds** — LIVE; hardened this session (P7 merge). 3 credits per generation/variation/fill/sketch (multipliers exist but are unused, so flat 3). Idempotency-Key short-circuits duplicate enqueue without re-charging. P7 added an idempotent refund guard, fixed the cron refund=0 no-op (handle-failure action name vs `CREDIT_COSTS`), and the stuck-slide watchdog refund.

**Reliability / watchdog** — LIVE. `check-task-timeouts` cron flips Clickatron tasks stuck >5 min to failed + refund (now non-zero post-P7). Worker validates Fal key, job ownership, ref-image counts; re-signs expired R2 URLs; maps Fal errors to friendly messages.

**Housekeeping** — LIVE, no credits: chat history, upload-image, rename, delete (+R2 cleanup), enhance-prompt (rate-limited), history, R2 signing.

### 2.2 Clickatron gaps / known issues (infra)

- **Auth holes (pre-existing, NOT fixed):** `r2/sign` and `utils/get-signed-url` have no `auth()`; `save-sketch-result` writes by `_id` only (cross-user). Recommend fixing.
- **Brand `strict` mode unwired** — generation is fail-open; a missing/failed brand profile silently falls back instead of refusing.
- **LOUDFAIL instrumentation present** on carousel/credit money paths (temporary, from the P6/P7 merge) — remove via `grep -rn LOUDFAIL` once carousel + credits are verified stable.
- **Dead code:** duplicate unreachable `seedream/v4/edit` case in `generateModelPayload`; unused `requestTypeMultipliers`.

---

## Part 3 — ThinkForge → Clickatron handoff (the creative spec)

ThinkForge authors a post/carousel and emits a hidden creative spec that pre-fills a Clickatron session.

- **Contract:** `clickatron-creative-contract.ts` — `ClickatronCreativeSpec` with `kind` (single_post_visual | carousel), `creativeBrief` (objective/coreMessage/keyClaims/cta/visualMetaphor), `brand` (hard/soft constraints), `renderPlan` (textPolicy + imagePrompt + textLayers + slides), `validation`.
- **Produced by (priority):** writer-output prompts → hidden LLM sidecar (`<!-- THINKFORGE_CLICKATRON_EXPORT … -->`) → visible-content fallback.
- **Reaches the worker** via `/thinkforge/clickatron-context` → `sessionDraft` → `buildClickatronSessionFormData` → `/session`, consumed at generation time by `buildClickatronSourceContextBlock`. Key claims are passed as *visual concepts to evoke*, not text to render. Brand hard-constraints are honored; palette/typography are not carried in the spec (brand visuals reach Clickatron via its own vault read, not the handoff).
- **textPolicy reality:** only `editable_text_layers` (default) and `no_generated_text` are ever emitted; `minimal_generated_text` is read-only/dead.

---

## Part 4 — What changed this session (infra commits)

- `0243f455` — C2 model-driven in-image text rendering.
- `27a3d60e` — merge: land P6 carousel fan-out + P7 credit fixes onto infra.
- `9e2a38b6` — wire the writing knowledge graph into the flat Post/Script writers (Stack A); DRY the technique block into `writing-graph-query.ts`. **Partly reverted by `28f48280`** — removed from ScriptWriter (10-seed A/B showed it regressed scripts min 92→75); kept on PostWriter.
- `0efbc7cd` — AI-filler self-repair guard (bounded LLM rewrite, fail-soft); cleans posts, can't fully zero long scripts.
- `28f48280` — remove graph from ScriptWriter + baseline held-out eval cases 9–15 (kept 5/7 at 0.92 — fixed cause, not gate).
- `038cf8ad` — run profile-compliance scoring on Stack A output (scores + surfaces + logs critical; closes the A↔B scoring gap).
- Earlier infra: `a1c8a7de` (inject keyClaims + brand hardConstraints into the Fal prompt), `13b3b439` (worker maxDuration=300), plus brand-learning + orgId-threading work.

## Part 5 — Top follow-ups

1. ~~Give Stack A the post-gen compliance scorer~~ — **done** (`038cf8ad`). Optional next: a Stack A repair pass (regenerate on critical violation) to match Stack B's stylist auto-repair (needs its own eval).
2. Land P5 (edit paths → flat writers) so edits stop running the legacy chain.
3. Fix the Clickatron auth holes (`r2/sign`, `utils/get-signed-url`, `save-sketch-result`).
4. Decide brand `strict` adoption (currently fail-open everywhere).
5. Strip LOUDFAIL instrumentation once carousel + credits are verified in real runs.
