---
name: Commit History Audit — infrastructure-improvs-+Editron branch
description: Comprehensive map of every commit since 2026-03-21 (474 total). Grouped by week, thematic clusters. Source of truth for "what was actually built" — use this instead of inferring from memory. Last updated 2026-04-21.
type: reference
last_updated: 2026-04-21
originSessionId: in-progress
---

# Commit History Audit — Mar 21 → Apr 21, 2026

**Scope:** All 475 commits on `infrastructure-improvs-+Editron` branch since 2026-03-21 (branch start) through 2026-04-21.

**Methodology:** `git log --stat` per week, every commit read with its file changes. Thematic grouping within week. No commit dropped from the record. Cross-referenced against memory files for context.

**Why this exists:** AI-session audits built on "memory file inference" keep getting caught out-of-date (memory files are 14+ days stale, commits touch files memory hasn't noted). This doc is the ground-truth map for any future session asking "what have we built?"

---

## Week 1 — March 21 (the "build everything" day)

**Volume:** ~55 commits in 24 hours. This was apparently the day the branch got its architectural scaffolding.

### Reference image pipeline
- `f706831a` — Complete rebuild of reference image pipeline for accuracy. Touched `reference-image-service.ts` (+303), `llm-scene-parser.ts` (+96), `ExportToEditronDialog.tsx` (+313). Foundation of IP-adapter-based consistency.
- `bb6488cc` — Fix: storyboard regeneration now respects user feedback (was ignoring it entirely). `storyboard-interactive-service.ts` +90.
- `82cb5cd3` — Wire IP-adapter ref images into ALL storyboard generation paths. Previously only some paths used them. `storyboard-service.ts` + `storyboard-interactive-service.ts` + generate route.
- `4675c203` — Comprehensive storyboard pipeline fixes: image accuracy, feedback handling. 7 files, +125 lines.
- `246b7112` — Fix video generation 422 errors + add reference-match mode for storyboard consistency.
- `eb86469f` — Make reference-match detection generic and data-driven (was hardcoded).
- `99c77e50` — Remove all product-specific hardcoding from pipeline prompts and detection.

### Editron editor UI/UX
- `ff973a27` — Editron editor fixes: AI chat race condition, playback, UX. 13 files: AI chat panel, editor core, video player, video details, video-layer-content, timeline controls, timeline, constants, use-autosave, use-history, NEW use-timeline-shortcuts (+62 lines), use-video-player, react-video-editor.
- `d9214eba` — AI chat editing bug fixes + NEW `cut_section` tool. `tools.ts` +239 lines.
- `dfcc64f5` — Storyboard-project linking, reference chain, video models, playback lag. 8 files.
- `6cdb400a` — Smooth playback architecture + per-scene SFX generation. NEW `sfx-service.ts` (+161 lines). Remotion main reworked.
- `aae7f2b3` — Pipeline optimizations + NEW contextual-action-bar.tsx (+362 lines) + timeline-grid +27.
- `20a6fc03` — AI suggestions panel (+494 lines), shorthand commands (+389), fal pre-warm (+87), exportData fix. 8 files, +1550 lines — big feature day.

### The big phase-ship day (commit 42450848)
- `42450848` — **3900 lines across 16 files in a single commit.** Created:
  - `auto-edit/route.ts` (+117) — Mode 2 script+footage auto-edit endpoint
  - `motion-graphics/route.ts` (+174) — motion graphics search endpoint
  - `style-transfer/route.ts` (+160) — extract editing DNA from reference video
  - `auto-edit-service.ts` (+494) — the 470-line "Mode 2" service (which I earlier claimed was orphan — it actually has 1 static importer via the route)
  - `motion-graphics-service.ts` (+386) — Gemini slot filler for motion graphic templates
  - `style-transfer-service.ts` (+488) — extract cut rhythm / transitions / color / graphics style from reference video
  - `consistency-scoring-service.ts` (+309) — Gemini Vision pair-wise image QA (distinct from `continuity-service.ts`!)
  - `motion-graphic-templates.ts` (+1241) — the template library
  - Schema extensions + DB constants + agent tools
- `c81c9c67` — Add STYLE_PROFILES collection constant.

### fal.ai endpoint corrections (lots of churn — APIs were moving)
- `991ec77c` — Fix video 422 errors, storyboard detail loss, empty scenes guard.
- `f58debcd` — Correct fal.ai video model endpoints, revert prompt ordering.
- `2575d32f` — Correct all fal.ai model parameters from actual API docs.
- `5d7eb39f` — Wire cross-scene chaining into fal.ai video gen (end-image continuity).
- `35236bae` — Fix 3 dead fal.ai endpoints: IP-adapter, BGM, SFX.
- `40c9f173` — Fix storyboard 504 timeout: IP-adapter circuit breaker + time budget tracking.
- `c6a7a22f` — Video gen timeout 180s → 300s.

### Beat detection system (NEW)
- `a1098eee` — Add beat detection & audio-driven cut sync system. **1283 lines new:**
  - `analyze-beats/route.ts` (+132)
  - `beat-detection-service.ts` (+570) — core beat detection
  - `use-beat-sync.tsx` (+230) — editor hook
  - `agent/tools.ts` +216 (new beat-sync chat tools)
  - `media/types.ts` (+70)
- `af791cf1` — Install node-web-audio-api (pnpm lock fix).
- `8142d551` — Wire snap-to-beat in timeline snapping hook.

---

## Week 1b — March 22 (the "Phase 0B through 5A" day — even bigger than Day 1)

**Volume:** ~40 commits. This is when the major architectural phases landed. Each `Phase X` commit maps to a section of the master plan.

### Queue architecture (Redis → QStash migration)
- `eddec3bb` — Fix video gen browser timeout (long request handling in the dialog).
- `e0f16ed3` — **Async parallel video generation** — queue architecture replaces blocking sequential. NEW `video-queue-service.ts` (+349), `process-video-queue/route.ts`, `generate-videos/status/route.ts`.
- `cf194b63` — **Scale to 5-minute (60-scene) videos.** NEW `storyboard-queue-service.ts` (+369) + storyboard queue cron + status route.
- `6e7fadb1` — Fix video gen fetch failures: retry Redis + better errors.
- `35cfa59b` — Fix JSON parse errors in export dialog.
- `329a88de` — Fix video gen failures + deep scan type errors. 9 files, +240 lines.
- `8d5ca212` — Fix Redis cold-start race: lazy-init Redis client.
- `18d4d4e5` — **Replace Redis queue with QStash for video gen.** NEW video worker (+158), +225 changes in generate-videos route.
- `47a4c564` — Fix finalize 504: timeout-guard BGM + SFX gen.
- `e78e65c8` — Debug + fix QStash video worker delivery.
- `c24002e6` — Fix QStash worker URL: use VERCEL_URL not NEXT_PUBLIC_APP_URL.
- `8e813fb2` — Debug + fix asset resolver for video overlays.
- `3269b970` — Fix video playback: remove crossOrigin for CORS with GCS.

### Phase 0B — production notes preservation
- `cecf764d` — Phase 0B: Preserve production notes from ThinkForge scripts (meta-section content that was being dropped).

### Phase 1A+1B+6A — audio infrastructure
- `a77cb197` — **Phase 1A+1B+6A shipped.** Audio ducking, mixing standards, expanded filters. 7 files:
  - NEW `audio-ducking.ts` (+105)
  - NEW `audio-standards.ts` (+52) — LUFS targets
  - NEW `media-filter-presets.ts` (+121)
  - sound-layer-content, rendering-context, Remotion main, finalize route updated

### Phase 2A+2B+2D+4A — edit directions system
- `5d47d555` — Phase 2A: Edit directions SCHEMA (SceneEditDirections type +49 in storyboard.ts).
- `b35ed907` — Phase 2B: LLM parser extracts edit directions from scripts. +52 lines in parser.
- `79376978` — Phase 4A+2D: Transition system + edit direction applier. NEW `transition-templates.ts` (+209), NEW `edit-direction-applier.ts` (+122). Finalize wires them.
- `07cce06e` — Wire edit directions through FULL pipeline: LLM → export → storyboard → finalize. 4 files.
- `6f2f73f2` — P0 verification fix: server-safe filter imports + cleanup. NEW `filter-presets.ts` (+87 lines) — the server-safe preset catalog.

### Phase 3A+3C — 54 profiles + auto-detection
- `c81763da` — **Phase 3A: 54 edit profiles across 7 categories.** NEW `edit-profile-types.ts` (+144) + `edit-profiles.ts` (+492). This is the profile catalog.
- `7b782f1e` — **Phase 3A+3C: Auto-detection engine + Director Agent.** NEW `director-agent.ts` (+233) + `profile-detection-service.ts` (+258) + director execute route (+55). **This commit IS the Director Agent's birth.**

### Phase 4B+5A — Continuity + Quality
- `d1ed3202` — **Phase 4B+5A: Continuity scoring + Quality review.** NEW `continuity-service.ts` (+136) + `quality-review-service.ts` (+266). **IMPORTANT: continuity-service is the one that's STILL orphan today — was shipped March 22, never wired.**

### Bug fixes & infra
- `17cc7165` — Director agent uses `loadProject` not `getProject`.
- `51ca245a` — Fix overlay overlapping, VO bleed, BGM/SFX, scene chaining.
- `2f9b14c8` — Image upload for reference subjects + storyboard scenes. 3 new routes/UI, +373 lines.
- `7f92e4bd` — Video/voiceover cutoff fix + add Nano Banana image models.

---

---

## Week 1c — March 23-28 (continued infrastructure + Phase B + P7 + SFX library + QA UIs)

### March 23 — Integrations, TTS, UI panels
- `1a3aa6ac` — **LottieFiles integration + SFX library + scene chaining toggle.** NEW `lottie-service.ts` (+250), NEW `sfx-library-service.ts` (+244). Freesound + LottieFiles GraphQL wired.
- `1aeeb3f7` — Remove Beatoven entirely → CassetteAI.
- `89020925` — Swap BGM priority: CassetteAI primary, MiniMax secondary.
- `163d4d5b` — **P2 Step 1+4: Director Agent executes ALL profile actions** (+118 lines). This is when Director became a real orchestrator.
- `f18c7686` — P2 Step 2+3: Project Brief form + pacing adjustments in applier.
- `7664cbb9` — Switch TTS to Kokoro, remove storyboard images when video exists. `tts-service.ts` +140.
- `c326d4e5` — Fix mirelo endpoint v1→v1.5, integer durations.
- `1d91cd90` → `4fd48e65` — Add/remove RESOURCES.md (docs churn).
- `7f38a036` — Parallel generation + notifications for refs & storyboard.
- `87c08e2e` — Fix core pipeline: narration extraction, prompt pollution, collages.
- `521e448d` — **P5B: Quality Review Panel UI** in Editron editor (+215 lines).
- `2c1c0b2c` — Fix voice default to Kokoro, provider field.
- `f44091b5` — Fix BGM/SFX not appearing: push to BOTH overlay arrays.

### March 24 — Mega day: P7 editing primitives + Phase A editor fixes + critical bugs
- `fca9c54f` — One-time audio migration route.
- `6a557556` — Cancel render button UI.
- `bc1cdcda` — Fix duplicate overlays, SFX volume, quality review panel.
- `9be64dba` — Fix transcription, scene regen, caption invocation.
- `9995744e` — Draggable playhead + context-aware SFX from library.
- `3053ba3f` — Add Wan 2.2, LTX 2.3, Veo 3.1 video models.
- `ed97103f` — Smart motion graphics: auto-analyze narration for placement.
- `d983e462` — **P7A: Keyframe animation system** — NEW types + NEW `keyframe-evaluator.ts` (+170). Layer rendering.
- `95b57872` — **P7B + P7C: L-Cut/J-Cut audio decoupling + Speed ramping** in sound & video layer-content.
- `3328a9f4` — P7A Step 6: `set_keyframes` tool (35th AI chat tool).
- `63c34f32` — P7A Step 7: True dissolve transition via opacity keyframes.
- `2eb7b923` — Wire script camera directions → keyframe tracks in finalize (`edit-direction-applier.ts` +52).
- `371dd95c` — Fix narration extraction, remove text boxes, fix duration, fix playhead.
- `36c9e09d` — Fix scene regen + AI chat selection awareness.
- `dd530736` — Fix AI chat auto-sync + transcription URL refresh.
- `4f442358` — Fix Director Agent: caption ALL video overlays, not just first.
- `b5bc221e` — Fix audio ducking: identify voiceover by assetId, not just row (ROW.BGM was the bug).
- `8b3817ba` — Fix 3 critical issues: captions, scene regen, transitions.
- `1f665070` — Fix playhead drag: `setCurrentFrame` during marker drag.
- `9c3153a0` — Fix captions: synthetic word timings when Deepgram fails (+100 lines). This is the "Deepgram returned nothing, fake the timings" safety net.
- `123f4e8e` — Remove Deepgram voices from UI, add Gemini transcription (+103 lines).
- `0a4d8298` — **Wire transitions into Director Agent + all 54 profiles.** `tools.ts` +90, `edit-profiles.ts` +115.
- `9c690b10` — **Parallel SFX library prefetch during video gen.** NEW `prefetch-sfx/route.ts` (+76). This is the prefetch path I later fixed in S-25.
- `be12103c` — Smart motion graphics + autonomous AI chat (+154 tools).
- `2d63f9de` — P7D: Enhanced style transfer — URL support + auto-detect first video.
- `576ec5a9` — **CRITICAL: Captions were never executing** — switch fall-through bug in director-agent.
- `83acc2c7` — Fix SFX library: Freesound primary, fix Pixabay API endpoint.
- `215d6f66` — Fix transitions: correct `buildTransitionOverlay` call signature.
- `4409bf28` — **A2: Caption font scales proportionally with box resize.**
- `21af02f7` — **A3: Show storyboard image when video fails to load.**
- `7299a87e` — **A4: Smarter AI chat** — inject scene index, stronger action-first prompt.
- `a54231ee` — **A5: Keyframe editor UI** — NEW inspector panel (+277) + timeline diamonds (+74).
- `8a0d4dea` — A5: Wire keyframe UI into video settings panel + timeline + context menu.

### March 25 — Phase B Intelligence Backbone lands + A6/A7 UI + adversarial audit
- `17349c0f` — **A6 + A7: L-Cut/J-Cut visual extensions + Speed curve editor** (+172 lines speed-curve-editor).
- `00fd0a59` — A8: UI simplification — progressive panel disclosure.
- `ca3cbeb0` — **PHASE B: Intelligence Backbone LANDS.** 1658 lines across 5 NEW files:
  - `five-track-analysis.ts` (+571) — the core analysis engine
  - `reactive-edit-engine.ts` (+433) — EDL generation from analysis
  - `cinematic-moment-detector.ts` (+220)
  - `content-graphic-map.ts` (+342) — 15 content types → graphic templates
  - `analysis/route.ts` (+92) — endpoint
- `1ea4b3e1` — Wire EDL Executor into Director Agent. NEW `edl-executor.ts` (+361). **This is when analysis started driving editing.**
- `387e805b` — **Rebuild Phase B: Full brainstorm architecture.** 1073 ins / 766 del — major refactor of the same services. Extensive rework of five-track + reactive-edit within 24h of shipping.
- `0ab631ff` — Dual-flow analysis: AI videos use storyboard metadata (cheap), real footage uses clip analysis (expensive).
- `7bda7ed1` — **CRITICAL: Director Agent no longer clobbers BGM/SFX overlays.**
- `b4846622` — Fix Director Agent execution failures (transitions, graphics, captions).
- `8358ca21` — Fix EDL graphics: html-scene with glass overlay, not text boxes.
- `a88573eb` — Beat analysis auth: accept userId from request body for internal calls.
- `a22bfa5c` — Fix 5-Track + wire script edit directions into EDL.
- `361c1dd7` — Add 13 new transition types (20 total) + transition browser data.
- `88db3ddb` — Fix motion graphics: auto-fallback to Gemini gen when no template matches.
- `549b693f` — **Fix 5-Track: real video analysis via Gemini Files API upload.** The Gemini Vision integration for actual video (vs metadata-only).
- `7ee48586` — Fix transcription: robust narration lookup for synthetic timings.
- `8dd61dcd` — yt-dlp update (alyzitron-related, less relevant for Editron).
- `7db60934` — **Adversarial audit v1: 6 CRITICAL + 3 HIGH fixed.** Race conditions, data clobbering, silent failures.
- `0a416c6c` — Fix F6.6 race: user save no longer clobbers audio worker results.
- `6dd31345` — 8 MEDIUM audit fixes (IDs, TTS, voiceover status, warnings, URLs).
- `c1145a5c` — **Script transitions ALWAYS win over profile transitions.** Enshrines user-intent precedence.
- `33b794a3` — Fix playhead live drag, quality review 404, transition detection.
- `48036595` — **Production transition system.** NEW `transition-system.ts` (+424). Real clip-overlap compositing rules.
- `ada6d382` — Wire production transitions into `add_transition` tool.
- `d4ebea06` — Wire production transitions into finalize edit directions.
- `f79cc9d6` — **Add transition browser panel** to editor sidebar (+153).
- `9334c980` — **SFX library browse panel** with Freesound search (+180).
- `ec3ae384` — **LottieFiles animation panel** (+177). Wire SFX + Lottie into sidebar.

### March 26-27 — Transition overlay tile + Phase D (infra) + renderer fixes
- `e977d2fc` — Fix SFX + LottieFiles search, rename Lottie→Graphics.
- `077aae67` — Transcription parallel support (mostly Alyzitron).
- `ce3c3807` — Fix motion graphics crash: null reference on match.template.defaultDuration.
- `235676ae` — **Add TRANSITION overlay type** — visible tile on timeline (DaVinci-style). 5 files.
- `3f477295` — `add_transition` tool creates visible TRANSITION tiles.

### March 26-27 — A5/A6 interactive UI + keyframes interactive
- `dacf0bd5` — **Deep fix: interactive keyframe diamonds** — click, drag, delete. `timeline-keyframe-diamonds.tsx` +112.
- `3a05ad36` — **Deep fix: L-Cut/J-Cut draggable audio boundary handles** (A6 UI complete). `timeline-item.tsx` +94.
- `25438071` — Fix auto-transitions: use `'transition'` type instead of `'html-scene'` (previous regression).
- `82de2b54` — Always show reference review step even when extraction fails.
- `54d04f13` — Fix playhead drag: use `seekTo` from hook (updates state + player).
- `5da87bcc` — **Add `add_sfx` tool: real Freesound search + download + GCS upload.** `tools.ts` +97.
- `cc64ac3d` — Fix LottieFiles search: correct GraphQL endpoint URL.
- `698447af` — Fix transition z-index + chat input persistence on panel switch.
- `6a3a3da9` — Fix duplicate captions: Director always overwrites existing.

### March 26-27 — Adversarial audit v2 (6 CRITICAL + 5 HIGH fixed)
- `82c3e7d6` — **Adversarial audit v2: fix 6 CRITICAL + 5 HIGH failures.** `tools.ts` +87, `five-track-analysis.ts` +16. Second round of pre-deploy failure-mode testing.
- `6f958996` — Fix remaining CRITICAL/HIGH + add batch caption editing. `tools.ts` +95.
- `31341c3d` — Adversarial audit v2: fix all 5 CRITICAL issues. 8 files (workers/audio, generate-videos, voiceover, storyboard-generate, ExportToEditronDialog, asset-resolver, project-service, creditsService).
- `84d43cb4` — Adversarial audit v2: fix 6 HIGH issues. 5 files.
- `c342342c` — Fix MEDIUM issues: profile validation, voiceover gcsPath verified. `director-agent.ts` +10.
- `8376821a` — Fix UI: keyframe dots + L-Cut handles interactive.
- `462cf3d0` — Video regen progress UI: toast notifications + background polling.

### March 26-27 — PHASE D INFRASTRUCTURE LANDS (W1-W7 rollout)
- `e1059701` — **Phase D W7+W3: MongoDB pooling + Gemini call batching.** `mongodb.ts` +17, `editron-mongo.ts` -29, `five-track-analysis.ts` +159. W3 merges the 5-Track Gemini calls into 1 structured prompt.
- `68cae303` — **Phase D W4: URL proxy service — never-expiring asset URLs.** NEW `assets/url/[assetId]/route.ts` (+109). `asset-resolver.ts` +9.
- `f7bab7ec` — **Move 5-Track analysis to video worker — pre-cache on generation.** `workers/pipeline/video/route.ts` +33. This is when B1 analysis became free for AI videos (runs in worker, doesn't block).
- `d51b663e` — **Phase D W2: Browser IndexedDB asset cache.** NEW `utils/asset-cache.ts` (+248) + NEW `hooks/use-cached-asset.ts` (+132). 380 lines of client-side persistent caching.
- `8c7864cb` — **Phase D W6: Chapter-based rendering for long-form video.** NEW `chapter-renderer.ts` (+412). Segment + parallel Lambda + concatenate.
- `fa4893a7` — Wire Phase D W2+W6 into live code. `cloudrun/render/route.ts` +40, `remotion/main.tsx` +75.
- `f019b1b7` — **Phase D W1: Cloudflare R2 CDN — resolve route + CDN URL generation.** NEW `assets/cdn-resolve/route.ts` (+83). `asset-resolver.ts` +16.
- `918b13bf` — **Phase D W5: AWS IAM — STS AssumeRole for short-lived credentials.** NEW `utils/aws-credentials.ts` (+105) + package.json adds @aws-sdk/client-sts (+844 in pnpm-lock).
- `7a286d42` — Fix build: remove stray break statement in generate-videos.
- `aefc935a` — Phase D W1: Wire asset resolver to use CDN URLs.

### March 26-27 — Zod/build failures + drag-drop transition UI + Gemini Files REST
- `4288c607` — Fix ALL tool failures: remove Zod `.strict()` + fix saveProject undefined. `tools.ts` +8. **This is where Rule 4 was born** (never use `.strict()` on Zod schemas).
- `959cb1fb` — Fix transition panel: add projectId from context.
- `bc125b7a` — Fix L-Cut handles + Lottie rendering + SFX resilience. `sfx-library/search` +17, `finalize/route.ts` +6, `lottie-panel.tsx` +16.
- `a1906868` — **Add transition drag-drop + batch caption UI button.** `caption-style-panel.tsx` +38, `timeline-grid.tsx` +51.
- `354675e3` — Fix build: wrap caption-style-panel JSX in fragment.
- `ee59eb30` — **Fix Gemini Files upload: use REST API instead of broken SDK method.** `five-track-analysis.ts` +43. This is where REST became the canonical Gemini upload path.
- `1ec021df` — Fix extract-subjects 500 + project page retry + Gemini Files REST API.
- `aa13aafb` — Fix: add missing useCallback import in caption-style-panel.
- `7f934baa` — Fix: add useCallback import to timeline-grid.tsx.
- `f6aa3e81` — Fix build: correct import names (searchAndDownloadSFX + beat-detection path).
- `ba655e1c` — **Fix CRITICAL: remove stray `()` that broke ALL Zod schemas.** `tools.ts` -1.

### March 26-27 — Credits race condition + pipeline bugs
- `a8e15ea5` — **Fix credits race condition + remove page reloads from transition/caption UI.** `creditsService.ts` +477/-226 — a big rewrite of credit debiting to be atomic. The page-reload removal is what made post-Zod-fix tool calls feel snappy.
- `7dd036e2` — Fix: add `'bonus'` to credit transaction type enum in Mongoose schema.
- `d7d1c98f` — **Fix 8 Editron bugs: voiceover playback, scene stretching, SFX, transitions, keyframes.** 8 files, +219/-79. One of the biggest polish passes of the week.
- `cdc80ace` — Fix SFX generation endpoint + video regen now updates project overlay.

### March 26-27 — SFX 3-tier + Phase B hardening + PHASE C BEGINS
- `50b0a3f3` — **SFX 3-tier pipeline (mirelo+CassetteAI+Freesound) + keyframe UX legend.** `tools.ts` +119. Three-layer fallback: mirelo video-to-audio → CassetteAI → Freesound search.
- `2dbba2ef` — **Phase B hardening: per-asset isolation, 5 graphic templates, EDL summary.** `director-agent.ts` +213, `edl-executor.ts` +138, **`content-graphic-map.ts` REMOVED (-342)** — content-to-graphic mapping got folded into the template system. Claude-plan.md +172 documents the hardening.
- `579eed71` — **PHASE C LANDS: Asset analysis on ingest, semantic search, cross-service brain.** 980 lines across 6 files:
  - NEW `workers/asset-analysis/route.ts` (+240)
  - NEW `media/search/route.ts` (+169) — semantic media search endpoint
  - NEW `media/upload/route.ts` (+34)
  - `local-media-gallery.tsx` +113 — search UI
  - NEW `asset-search-service.ts` (+138) — **one of the 2 truly orphan services I found in the code-review audit**
  - NEW `universal-analysis.ts` (+295) — shared analysis module for cross-service brain
- `26b3a55f` — **C3 + C5: Segment extraction + Chapter rendering UI + asset drop-to-timeline.**

### March 26-27 — Anti-slop + video quality gate
- `b06b2b70` — **Anti-slop: negative prompts on all video models + duration fix + camera direction.** First push toward "don't let the model drift."
- `b5aacb0b` — **Video quality gate + IP-Adapter + style motion + 5 audit fixes.** The quality-gate enforcement.
- `7b2701e6` — Video regen UI: persistent banner with polling + auto-refresh.
- `48e818ba` — Fix 5 errors from Vercel logs: quality check, analysis, transitions.
- `dbe2caf2` — **Refactor: derive quality score from 5-Track analysis (zero extra cost).** Big architectural win — quality review no longer pays for its own Gemini call.

---

## Week 2 — March 28 (audio validation + parser rewrite + prompt audit)

**Volume:** ~10 commits. Themes: parser gets an intelligence upgrade, debug panel lands, Gemini upgrade path starts.

### Parser gets smart — format-agnostic + subject-grouped decomposition
- `c93b76cd` — **Audio validation: prevent corrupt files from crashing Remotion render.** `sfx-service.ts` +34, `tools.ts` +27. Validates audio before it reaches the renderer.
- `2a578d1c` — **Smart scene decomposition: LLM groups shots by subject, not scene headings.** `llm-scene-parser.ts` +23. First move toward "scenes are semantic, not textual."
- `9d9a39c2` — **Prompt pipeline audit P0+P1: format-agnostic parser, pipeline wiring, dynamic negatives.** 6 files, +349 changes — the scene parser got a MAJOR rework (349 lines rewritten). BGM, SFX, TTS, video-gen, edit-direction-applier all wired to the new output shape.
- `2077a67f` — **Prompt audit P0-P2: 3-tier scoring, image negatives, mood→filter wiring.** `consistency-scoring-service.ts` +201/-73 — rewrite of the pair-wise QA logic. Mood→filter mapping added to the applier.

### Debug panel for visibility
- `d2a4a32a` — **Add Editron debug panel at `/dashboard/editron/debug`.** NEW `analysis/route.ts` +23, NEW debug page (+499). First UI surface for inspecting pipeline state.
- `1027b9e5` — Fix build error: prefer-rest-params in TTS + hooks order in keyframes.
- `ef8bc0d4` — Fix collage/multi-panel storyboard images. *(Immediately reverted next commit.)*
- `3620347d` — Revert "Fix collage/multi-panel storyboard images." A case of "the fix broke more than it fixed."

---

## Week 2 — March 29 (the parser/assembly rewrite + Gemini 2.5 Flash + debug panel expansion)

**Volume:** ~17 commits. Heavy parser/assembly work — standardized ROW layout, Gemini upgrade, Files API stabilization.

### Generation units + sub-shots + standardized ROW layout
- `19f17f99` — **Generation unit grouping + sub-shot system in parser + schema.** `llm-scene-parser.ts` +92, `schemas/storyboard.ts` +36. First move toward "one scene can have multiple independently-generated sub-shots."
- `9ef670d3` — **Rewrite scene-to-editron.ts with proper row layout + sub-shot cutting.** 307 lines rewritten (+177/-130). This is when ROWs became canonical.
- `fef1c7c4` — Update tools + applier to use standardized ROW layout.
- `11347895` — **CRITICAL: Unify row layout across finalize + audio worker.** The two paths had drifted — fix forces both onto the same ROW constants.

### Debug panel v2 + 5-Track diagnostic
- `79b69a09` — **5-Track diagnostic trace + Video Analysis test endpoint + debug tab.** NEW `analysis/test-single/route.ts` (+98), debug page +147, `five-track-analysis.ts` +80. First visibility into WHY an analysis came back wrong.
- `99a3d86a` — Debug panel: full URLs + copy button; keyframe hooks fix.

### Gemini Files API stabilized
- `d051d0a2` — **Fix Gemini Files upload: use SDK instead of manual multipart.** `five-track-analysis.ts` +44/-57 — undid the REST workaround from `ee59eb30` after SDK got fixed. 3-day arc of "SDK broken → REST workaround → SDK fixed → revert to SDK."
- `a5f59daf` — Fix 5 parser prompt issues (mood/visual/transitions/sfx/quality). `llm-scene-parser.ts` +35.

### Gemini 2.0 → 2.5 Flash upgrade
- `cf0b9668` — **Upgrade all Gemini 2.0 Flash → 2.5 Flash (14 files).** `lib/thinkforge/agents/model-factory.ts`, `five-track-analysis.ts`, `llm-scene-parser.ts`, `consistency-scoring-service.ts`, `motion-graphics-service.ts`, `style-transfer-service.ts`, `media/transcription-service.ts`, `tools.ts`, `reference-image-service.ts`, `creditCosts.ts`, clickatron + thinkforge routes, asset-analysis worker. 14 files touched.
- `b6e72070` — Fix Gemini 2.5 Flash structured output — add `structuredOutputs` flag.
- `75a68c8d` — Debug panel: assembly simulator (+55 NEW route, +143 NEW page) + Gemini 2.5 Flash timeout fix.

### Playback + EDL bugs
- `fc0b0c75` — Fix 4 critical playback bugs: transitions, voiceover, EDL, SFX. 4 files.
- `f0fb91df` — Fix EDL crash: guard `subject.frames` undefined before `.length`.
- `e833ca1e` — **R2 primary storage: all uploads go to Cloudflare R2 via unified upload-service.** 17 files, +807. NEW `r2-service.ts` (+169), NEW `upload-service.ts` (+146). All pipeline services (bgm/sfx/tts/video/storyboard/reference-image) now route through one upload path.
- `1e0036dc` — Fix stuck 'Loading project...' overlay.
- `9bf1fb18` — Trigger redeploy — fix 401 on org endpoint.
- `ccafc545` — Redeploy: restore `NEXT_PUBLIC_AUTHORIZED_PARTIES` with branch alias.

---

## Week 2 — March 30-31 (the MEGA day — Unified Intelligence Engine, Knowledge Base, Montage system)

**Volume:** ~60+ commits. This is where the Director Knowledge Base, Unified Intelligence Engine, Montage sub-shot system, and DecisionBudget tracker all landed. Also the "revert → restore" montage arc.

### SFX library + EDL subject decisions
- `6ac9a10b` — Fix SFX library downloading JPEG images instead of audio. `sfx-library-service.ts` +19. Content-type validation after download.
- `571edf1e` — Fix EDL subject decisions + SFX library downloading images. `reactive-edit-engine.ts` +56/-15.
- `de97f306` — Parser post-processing: fix montage, pacing propagation, SFX extraction. `llm-scene-parser.ts` +58.
- `ca40dd6c` — **Add Sound Transitions category: L-Cut, J-Cut, Audio Crossfade.** `transition-system.ts` +46.
- `34639321` — **Add 4 caption styles + fix row corruption bug.** NEW `caption-service.ts` (+103).

### Production hardening
- `18e80481` — **Production hardening: upload size limits, health check, catch logging, rate limiting.** 9 files, +114. NEW `app/api/health/route.ts` (+22). `rate-limiter.ts` +47.
- `e0067ddd` — Adjust rate limits and file size caps for real usage.
- `806f925f` — **Critical fixes: Director auto-run + R2 key storage + voiceover r2Key.** 4 files, +94.
- `07406172` — Fix 3 empty catch blocks — add console.error logging for debugging.

### Montage sub-shot system lands (M1-M4)
- `80316655` — **M1: Montage decomposition — SubShot schema + parser for independent video gen.** `llm-scene-parser.ts` +24, `schemas/storyboard.ts` +29.
- `d41eacb6` — **M3: Per-sub-shot video dispatch for montage scenes.** `generate-videos/route.ts` +140/-85 — routing logic for sub-shot dispatch.
- `d3bfae7b` — **M4: Finalize assembles montage sub-shots as sequential video overlays.** `finalize/route.ts` +53.
- `c2254087` — **MC1-MC2: Match-cut detection via visual similarity scoring.** `continuity-service.ts` +47.
- `fe82ef0c` — **P1: Pixabay stock footage service — video + image search.** NEW `pixabay-service.ts` (+177).
- `0a03b916` — **B1: Beat-synced cutting — alignCutsToBeats() for montage sub-shots.** `scene-to-editron.ts` +86. *(This is the Prateek-era alignCutsToBeats file.)*
- `528777bd` — **AI1-AI2: EDL suggestions panel in AI chat on project open.** NEW `edl-suggestions.tsx` (+178).
- `c5ffe0fd` — **P2: Stock footage AI chat tool — search Pixabay videos/images.** `tools.ts` +77.

### Storyboard concurrency + sub-shot review UI
- `1f0f153d` — Fix reference image timeout: 30s → 120s for Gemini analysis.
- `a931d754` — Increase storyboard concurrency: 2/3 → 4/6 to prevent 504 timeout.
- `bf0df1de` — **Sub-shot review UI: montage detection, cost breakdown, collapse option.** `StoryboardWorkspace.tsx` +184.

### Director dispatch moved + R2 key mismatches
- `4ccf9b6b` — **Move Director dispatch from finalize → video worker (post-completion).** `video/route.ts` +49, `finalize/route.ts` +14/-37. Director now runs after video worker finishes, not during finalize.
- `7bb278b1` — **Fix R2 asset key mismatch — use caller's assetId as R2 key.** 7 files across pipeline services.
- `abdcc9c8` — Fix ALL remaining R2 key mismatches — 18/18 upload calls now pass customAssetId.
- `82208491` — Fix Director dispatch: resolve projectId from storyboard when batch lacks it.
- `d44669c9` — **Fix EDL frame offsets: decisions now span entire timeline, not just scene 0.** `reactive-edit-engine.ts` +15. Major correctness bug.
- `94ac40ad` — Fix caption row: always row 0 (topmost z-index for visibility).
- `6f5fc171` — **Director: per-scene transitions from script editDirections.** `director-agent.ts` +55.
- `9e0f0c0f` — Fix analysis API: add timeline offsets + null guards for EDL viewer.
- `076c0f46` — Add comprehensive logging to Director add_captions step.

### Montage post-processor + caption pre-warm
- `04202191` — Add montage post-processor: auto-detect multi-subject scenes.
- `e6e0aa0a` — Director caption pre-warm + EDL quality improvements. `reactive-edit-engine.ts` +75.
- `784bc935` — Add video pipeline watchdog to task timeout cron. NEW watchdog in `cron/check-task-timeouts/route.ts` (+58).

### Parser post-processors + Unified Edit Intelligence Engine (MAJOR)
- `8bdd5264` — Parser post-processors: transitions, durations, improved montage + Assembly Sim fix. `llm-scene-parser.ts` +117.
- `ad90cd2c` — **Unified Edit Intelligence Engine — single Gemini call with full project context.** NEW `unified-edit-intelligence.ts` (+427), `director-agent.ts` +65, `analysis/route.ts` +46. **This is the "one call per project" architecture.**
- `f9fe1bfe` — Fix Unified Intelligence Engine build errors + parser "null" string cleanup.
- `6f87e198` — **Replace regex montage detector with dedicated Gemini call.** `llm-scene-parser.ts` +63/-64.
- `735622ca` — Fix finalize duration for rapid-cut montage scenes.
- `07273caf` — Pass through montage fields in export-for-editron route.

### The montage revert/restore arc
- `1ab8328c` — Revert montage sub-shot video generation system. -137 lines (took out M1+M3).
- `306e1b6f` — Revert "Revert montage sub-shot video generation system." +137 lines (put M1+M3 back). 10-minute oops-arc.
- `028ff38a` — Restore montage system + fix generate-videos timeout 60s → 300s.

### Audit sweeps + Director fixes
- `5f37128d` — Fix 5 CRITICAL pipeline failures found in exhaustive audit.
- `a3d09ca5` — **Fix ALL 7 CRITICAL + 9 HIGH pipeline issues from exhaustive audit.** 9 files, +192.
- `d27c2d06` — Fix storyboard regeneration ignoring composition feedback.
- `4dc91c21` — Fix Director: `storyboardScenes` scope + wrong row checks for conditions.
- `51b832db` — **EDL prompt upgrade + Hormozi captions + camera-shake handler.** `unified-edit-intelligence.ts` +72, `edl-executor.ts` +49. Hormozi-style captions for social.
- `a5ad153e` — Fix video regen: validate storyboard + scene index before HTTP calls.
- `a2722abc` — Add logo-reveal graphic template to EDL executor.

### DIRECTOR_KNOWLEDGE_BASE.md + DecisionBudget
- `1eba3612` — **DecisionBudget tracker + Knowledge Base enforcement in EDL executor.** NEW `DIRECTOR_KNOWLEDGE_BASE.md` (+1529), NEW `decision-budget.ts` (+335), `edl-executor.ts` +45. **This is the 19,885-line knowledge base origin.**
- `41d45152` — Wire Director Knowledge Base rules into Unified Intelligence prompt. `unified-edit-intelligence.ts` +66.
- `18e1f1aa` — **Auto post-processing: drift-zoom, screen zones, transition SFX map.** NEW `auto-post-processing.ts` (+297). The file I and Prateek both cherry-picked into later.
- `bb883b60` — Implement remaining KB rules: narrative arc, platform, freeze-frame, pacing. `auto-post-processing.ts` +103, `unified-edit-intelligence.ts` +87.
- `a3a18594` — **Fix hardcoded assumptions: aspect-ratio, canvas-relative, profile-configurable.** 4 files. Making the system actually profile-aware instead of hardcoded-1080p.
- `0b531e29` — **Asset type classification + SFX priority fix + montage interleaving fix.** 8 files, +280.
- `77ce0d59` — Fix syntax error: wrap else block in braces for asset type routing.
- `cbed62c8` — Add deterministic asset classification post-processor. `llm-scene-parser.ts` +53.
- `dd6e5c05` — Pass assetRecommendation through export-for-editron mapping.
- `2eb73a67` — Add assetRecommendation + videoSkipped to type interfaces.
- `6e63c77a` — Fix asset classification: all main scenes = ai-video, stock = sub-shots only. `llm-scene-parser.ts` +43/-55.
- `d23ad55c` — **Stock video search + content-type bias fixes.** NEW `prefetch-stock-video/route.ts` (+141), NEW `stock-video-service.ts` (+259). 8 files, +474.
- `51c3b95b` — Remove logo-reveal forced animated-still, always mark sub-shots stock.
- `607d2a94` — Fix parser over-decomposition: restore scene count guardrails.
- `36b3bac4` — Remove hard limits, restore cost-based grouping signals.
- `23f7ad6a` — Fix sub-shot video storage + director logging.
- `52d0b404` — Force redeploy. (empty commit)
- `1a1d9f4d` — Fix sub-shot duration bloat + voiceover row check for captions.

---

## Week 3 — April 1-4 (TypeScript cleanup + EditronConfig + confidence tracking + strategy pivot)

**Volume:** ~30 commits. Themes: massive TS error sweep (~160 errors), centralized config, stock video REMOVED from pipeline default (strategy pivot), confidence tracking wired everywhere.

### Alyzitron → Apify migration (outside Editron scope, noted for completeness)
- `ea7ff7ef` — **feat(alyzitron): replace yt-dlp with Apify extraction + GCS stream bridge.** 11 files, +964. NEW `apify.ts` (+259), NEW `streamToGCS.ts` (+105). Rewrote YouTube extraction off yt-dlp (which was getting rate-limited by YouTube).

### Post-processing + Unified Intelligence bug sweep
- `c4b1b559` — **Fix 5 post-processing bugs: deterministic shake, transition alignment, freeze-frame sizing, VO desync, drift-zoom budget.** `auto-post-processing.ts` +70, `edl-executor.ts` +58.
- `e5bf0d9c` — Fix 4 data merge bugs in Unified Intelligence context assembly. `unified-edit-intelligence.ts` +55.

### EditronConfig — centralized config (partial wire-up — many values still hardcoded)
- `8859d169` — **Add centralized EditronConfig — replaces 100+ hardcoded values across pipeline.** NEW `lib/editron/config/editron-config.ts` (+408). *(Master plan explicitly calls out ~100 values still hardcoded in memory/editron_master_remaining.md.)*

### Reference system (multi-strategy + user-choice respect)
- `dc6b9065` — **Multi-strategy reference system: model-specific reference image handling.** `storyboard-service.ts` +133. Each image model gets the right ref-image format.
- `c939b4f8` — **Fix silent model override: respect user's image model choice over IP-adapter.** Previously IP-adapter was silently clobbering user's model selection.
- `bb716632` — **Fix 3 critical issues from Nike test: broken playback, stale cache, wrong profile.** 3 files, +47. Learnings from a real client test.

### Phase 1 — dense frame analysis + confidence tracking + multi-anchor
- `9520a461` — **Phase 1: Dense frame analysis + confidence tracking + multi-anchor system.** `five-track-analysis.ts` +60, `unified-edit-intelligence.ts` +134. "Multi-anchor" = multiple reference frames per scene, not just keyframe.
- `0d05c3de` — Fix Phase 1C: revert fallback TTL to 7 days + make prompt FPS-aware.
- `7987680f` — **Wire confidence tracking into post-processing + EDL executor.** `auto-post-processing.ts` +25, `edl-executor.ts` +32. Quality-gated decision execution.

### Director guardrails + error visibility
- `00131b0b` — **Add error visibility system, caption diagnostics, Director split-clip capability.** NEW `pipeline-warnings.ts` (+111). 4 files.
- `93ff318f` — Add hard guardrails to Director `split_clips` to prevent rogue behavior. `director-agent.ts` +71.

### TypeScript error sweep (~160 errors across 48 files)
- `a20d2d9d` — **Fix Next.js 15 params-as-Promise type annotations in 10 route files.**
- `3f8f542a` — **Fix ~130 TypeScript errors across all Editron + pipeline production files.** 48 files touched. Mass sweep to get `tsc --noEmit` to pass after Next.js 15 upgrade.
- `0de62b95` — Fix 17 TypeScript errors in edl-executor + reactive-edit-engine.
- `d045e61e` — Fix 14 pre-existing TypeScript errors in pipeline files.

### STRATEGY PIVOT — stock video REMOVED from default
- `45e5c91a` — **Remove stock video from pipeline default (strategy pivot: businesses pay for AI quality).** 3 files, +19/-57. Stock remains as manual user option only. **Mentioned in CLAUDE.md §15: "Stock video REMOVED from pipeline default (manual user option only)."**
- `efe24216` — Fix sub-shot duration cap: apply to ALL sub-shots not just `sceneType=montage`.

### Captions auto-inject
- `6c0ee11e` — Fix caption injection to respect user's export dialog choice.
- `c7474797` — **Auto-inject captions when profile omits `add_captions` action.** `director-agent.ts` +22.
- `6d3286a1` — **CRITICAL: Fix `storyboardScenes` block-scoping bug — captions, filters, transitions, quality review ALL broken.** `director-agent.ts` -3/+6. A scope bug that broke 4 features at once.

### Timeline + zoom + sub-shot fixes
- `e059bc76` — **Fix timeline gaps, zoom bounce, sub-shot bounds + smart clip selection + zoom validation.** 5 files, +255. `five-track-analysis.ts` +119 (zoom validation).

### Merges + stock video wire
- `41f168fe` — Merge `origin/main` into `infrastructure-improvs-+Editron`.
- `b27e0bf2` — Merge `origin/thinkforge-enhancement`.
- `3c8fb114` — Wire stock video pipeline: minDuration + type fields + structured logging.

### ROW layout correctness + script duration rule
- `ef86804f` — **Fix ALL wrong ROW references across 4 files (10 edits).** Cleanup after ROW canonicalization.
- `9f038ea9` — **CRITICAL: Script duration is king, not video duration.** `finalize/route.ts` +17/-26. Fixes long-standing bug where finalize would truncate to video duration.
- `7b897da5` — **Add comprehensive Editron pipeline test script.** NEW `scripts/test-editron-pipeline.ts` (+405). The reference test runner.
- `c0d68e12` — Fix caption crash: remove undefined `hasCollisionAtRow0` variable.

---

## Week 3b — April 5-8 (Model adapters + Phase A3 Bundles + Gemini model thrash)

**Volume:** ~45 commits. Themes: Phase S1/S2 config-driven model adapters, Seedance 1.5 + UNI-1 + Gemma 4 integration, Gemini 3.1 model ID thrash (doesn't exist → reverted), Phase A3 Bundles 1-4 stabilization, QStash worker expansion for storyboard + ref images.

### Phase S1+S2 — config-driven model adapters
- `91d93648` — **Phase S1: Config-driven model adapters + Seedance 1.5 + UNI-1 + Gemma 4 + native audio.** 14 files, +1173/-440. MASSIVE: NEW `image-model-configs.ts` (+391), NEW `video-model-configs.ts` (+541), `storyboard-service.ts` rewrite (+363/-190 core), `video-generation-service.ts` simplified (-115). This is when model handling became declarative config.
- `e3fa752b` — **Phase S2: Gemma 4 default for parsing + analysis, centralized model factory.** NEW `gemini-model-factory.ts` (+131). 8 files touched, services migrated to factory.

### Alyzitron migration (continued, off-Editron)
- `c8104fec` — fix(alyzitron): rotate dynamic stream import to top-level for Turbopack.
- `6c1d97d3` — fix(alyzitron): replace apify-client with direct REST API fetch calls. Package removed, -234 in pnpm-lock.
- `45f61140` — fix(alyzitron): use verified Apify Actor IDs from store.

### Gemini 3.1 model thrash (April 5-6 saga)
- `06dfbe5e` — **HOTFIX: gemini-3.1-flash does not exist — revert to gemini-2.5-flash.** 4 files. Also creates NEW `scripts/test-gemma4-files-api.ts` (+187).
- `8a5d76d1` — Fix model IDs: gemini-3.1-pro-preview for parsing + decisions, Gemma 4 for vision.
- `83520e61` — **Move LLM prompt refinement from route to worker — fixes 504 timeout on 14+ scenes.** `generate-videos/route.ts` +42/-75, video worker +57. Heavy work moved off the blocking route.
- `e4943987` — Fix parsing timeout: revert parser to gemini-2.5-flash (3.1-pro too slow).
- `f0318616` — **Switch parsing to gemini-3.1-flash-lite-preview (fast + accurate).** Current config state.

### Teammate integration + parser fix
- `a60d5225` — Integrate teammate's improvements: anti-hallucination rule + chat agent rewrite. `chat-agent.ts` +28.
- `314b797b` — Fix 3 pipeline issues: parsing model + duration cap + caption row. 5 files.
- `96d588b8` — Add diagnostic logging to EDL executor — trace why decisions are skipped.

### Alyzitron polish (continued)
- `7fcdb064` — fix(alyzitron): add mediaType inference + downloadedVideo candidate to apify.ts. 3 files, +177/-363 cleanup.
- `e6dc98b7` — **Fix render timeout: asset resolver was overwriting working URLs with empty strings.** `asset-resolver.ts` +21. Critical.

### Whisper + transcription
- `f6731c0a` — feat(frontend): improve analysis history UI.
- `d395459f` — feat(frontend): extract username and platform from video URLs.
- `9ae52ee1` — **Add Whisper Large V3 as primary transcription for user-uploaded videos.** `transcription-service.ts` +46.

### Render URL thrash
- `b439991f` — Fix render: Lambda needs GCS signed URLs, not CDN proxy. `cloudrun/render/route.ts` +11.
- `81d48889` — Fix render: proper forceGCS param + detailed per-asset logging.
- `2356cf63` — **Revert forceGCS render — use CDN proxy URLs like before (which worked).** 3-commit arc: broke → tried to fix → reverted.

### Black frames + gap fixes
- `82a17eb5` — **Fix black frame gaps: advance timeline by actual sub-shot content, not planned duration.** `finalize/route.ts` +4.
- `9000d725` — **Fix gaps + transitions: close gaps in finalize, use TransitionOverlay tiles.** `edl-executor.ts` +59, `finalize/route.ts` +38.

### Alyzitron transcription 3-tier + diarization
- `8dfcc8f5` — fix(alyzitron): transcription migration and build fixes.
- `b5ee3317` — **feat(alyzitron): 3-tier transcription failover — Deepgram + Fal.ai Whisper.** `transcriptionService.ts` +231/-129.
- `d2802422` — refactor(alyzitron): enable diarization for Fal.ai and update Deepgram VAD settings.

### 6 duplicate system conflicts + prompt quality
- `5aa2e2a4` — **Fix 6 duplicate system conflicts: captions, filters, graphics, zoom, pacing.** 3 files, +85. "Duplicate systems" = post-processing vs EDL vs profile all setting the same field.
- `749610ed` — **Improve prompt quality: artifact avoidance + composition + nuanced rules.** `llm-scene-parser.ts` +26.
- `4b1fd3cb` — Fix 4 remaining bugs: screen zones, BGM row, HTML escaping, log levels.

### Config wiring + pipeline warnings
- `19dbc51c` — **Wire editronConfig into 5 consumer files + fix 3 config mismatches.** 6 files. Partial wire-up of the 408-line config.
- `e6de945e` — **Wire pipeline warnings into finalize + Director + confidence into quality review.** 3 files. Quality score now influenced by confidence.

### Alyzitron + Gemini file API
- `fb73660b` — feat(alyzitron): switch to native gemini transcription.
- `d93d465e` — chore(alyzitron): update media storage and reporting components.
- `f6872e89` — added google file api. NEW `lib/services/geminiFileService.ts` (+80).
- `cf632209` — added google file api-II.

### Hotfix: export-for-editron 504
- `d3d295d0` — **Hotfix: fix export-for-editron 504 timeout — parser model + abort guards.** `llm-scene-parser.ts` +15.

### Phase A3 Bundles 1-4 (stabilization + per-sub-shot generation + QStash expansion)
- `4d005340` — **Phase A3 Bundle 1: kill duplicate transitions, fix filters, determinism, visibility.** 7 files, +213.
- `8063efc6` — **Phase A3 Bundle 2: per-sub-shot images, parser fixes, exact on-screen text, zero-narration captions.** 9 files, +464. `caption-service.ts` +123.
- `d67e0ae6` — Phase A3 follow-up: broaden E-04 from nostalgia-specific to general brand-narrative. `edit-profiles.ts` +58.
- `b95b668b` — Phase A3 regression hotfix: fix storyboard/generate 504 from Bundle 2 per-sub-shot gen. `storyboard-service.ts` +92/-42.
- `1c489db5` — **Phase A3 Bundle 3: parser model + safety nets + EDL filter guard + profile detection fix.** 7 files, +290. `llm-scene-parser.ts` +167 — major.
- `eaeeb8cf` — Hotfix: bump `maxDuration` 60s → 300s on 4 image-gen routes (504 timeouts).
- `c3b4684b` — **Phase A3 Bundle 4: QStash workers for storyboard + ref images, fal.ai retry, edit-direction visibility, safe JSON.parse.** 18 files, **+2269**. Biggest bundle. NEW:
  - `workers/pipeline/reference-image/route.ts` (+216)
  - `workers/pipeline/storyboard-image/route.ts` (+368)
  - `fal-retry.ts` (+121)
  - `llm-json-safe-parse.ts` (+136)
  - `reference-image-queue.ts` (+197)
  - `storyboard-image-queue.ts` (+242)
  - Plus route expansions, add-subject +135, generate route +197, storyboard generate +288

---

## Week 4 — April 9-12 (Seedance + cinema prompting + 3-layer creative intent)

**Volume:** ~35 commits. Themes: Seedance 1.5/2.0 integration, cinema prompt engineering, 3-layer creative intent architecture (commit 18224fb7 — the big rewrite), Apify PR merge, profile auto-detection fix, Director scene matching fix, model registry strip.

### Extract subjects + diagnostics + rate limits
- `96f95557` — Hotfix: raise `extractSubjectsFromScenes` abort timeout from 60s to 110s.
- `00e02ee2` — Add diagnostic logging to export-for-editron 422 path.
- `f929df0b` — **Fix extract-subjects: model fallback chain when Gemini is rate-limited.** `llm-scene-parser.ts` +41.
- `d50ab109` — Fixed the model issue gemini-3.1-flash-lite-preview (in vertexAiService).
- `c4e8a131` — updated .env.example.

### pnpm + Apify PR merge + YT link fix
- `6b797b16` — fixed youtube links error. `alyzitron/processor/route.ts` +80.
- `957f45c1` — Spread extraParams into API request options.
- `59978b92` — Update pnpm configuration in package.json.
- `99634e00` — Delete pnpm-workspace.yaml.
- `88cbe359` — Fix packageManager formatting in package.json.
- `30125e34` — **Merge PR #91: feat/alyzitron-apify-implementation.** (merge commit)

### Async worker polling + Seedance
- `adfe007a` — **Fix add-subject + regenerate: poll for async worker completion.** `ExportToEditronDialog.tsx` +119. UI now waits for QStash workers.
- `1d8ed293` — **Fix Seedance Chinese voiceover + add 2.0 config + tighten parser duration scaler + fix B-07 greedy matching.** `video-model-configs.ts` +47, `llm-scene-parser.ts` +57. Chinese voiceover was Seedance hallucinating speech in Chinese.
- `3aaa5707` — **Add Seedance 2.0 (live on fal.ai), fix transition apply-to-all bug, tune native audio prompt.** 3 files.

### Timeline playback + transitions
- `9550b98e` — **Fix playback lag at 25+ clips: proximity-based blob URL management.** `remotion/main.tsx` +67. Long-form playback fix.
- `0aae17c4` — Fix transition tiles: clicking now opens Transition Browser panel.
- `34aa3809` — **Fix double transition: clean up clip-overlap keyframes when EDL places tile.** `edl-executor.ts` +48.

### Parser + Director scene matching
- `32be17eb` — Fix `independentGeneration`: don't force on same-setting emotional shots. `llm-scene-parser.ts` +47.
- `1f909eae` — **Fix Director scene matching: use `clipB.metadata.sceneIndex` not overlay array index.** Director was confusing scene-0 with "first overlay in row" — different things.
- `9021d6be` — **Fix BGM ducking for Seedance native audio (embedded in video element).** `sound-layer-content.tsx` +18.

### Error logging + parser validators + model registry strip
- `217c68e4` — Implement error logging in analyze route.
- `689e02dd` — **Add 5 parser post-processing validators for LLM output quality.** `llm-scene-parser.ts` +198. Quality gates for LLM drift.
- `d571e6e9` — **Fix multi-subject visual descriptions producing collage storyboard images.** `llm-scene-parser.ts` +38.
- `276b7a1c` — **Strip video model registry to 5 models: Kling 2.1/2.6, Seedance 1.5/2.0, Veo 3.1.** 5 files, -229 lines in `video-model-configs.ts`. **Current active set.**

### Voiceover + native audio arc
- `f31e4d55` — Fix voiceover overlapping with Seedance native audio. *(Binary-kill approach.)*
- `64a44253` — **Revert "Fix voiceover overlapping with Seedance native audio".** Binary kill was wrong.
- `e70dd414` — **Duck native video audio under voiceover instead of killing it.** `video-layer-content.tsx` +58. Option B (12% ducking) replaces Option A (kill entirely). **This is the "professional audio mixing" approach from memory/MEMORY.md.**

### Cinema prompt engineering
- `e2502b8c` — **Add cinema prompt engineering system for video generation quality.** NEW `lib/editron/data/cinema-prompt-config.ts` (+249). 6 cameras, 11 lenses, 6 focal lengths, 5 apertures.
- `435abb83` — Fix Seedance 1.5 max duration: 12s not 15s (verified via fal.ai API docs).

### A3 fixes (bundle continuation)
- `d7732001` — **Fix A3.2: skip parent image for full-montage scenes, generate sub-shots directly.** `storyboard-service.ts` +187.
- `90267a82` — **Fix A3.5.1/A3.5.2: remove duplicate transition system from finalize.** `edit-direction-applier.ts` -97. Director/EDL single-source-of-truth for transitions.
- `4a4fca1c` — **Fix EDL frame drift: snap decisions to actual clip boundaries.** `edl-executor.ts` +132.
- `55106894` — Fix A3.4: on-screen text overlays created regardless of voiceover presence.
- `cabfed08` — **Fix profile auto-detection: use top match instead of defaulting to G-01.** `profile-detection-service.ts` +13. High-impact: **54 profiles were being ignored** because detector kept returning default.

---

## Week 4b — April 13-15 (3-layer intelligence rewrite + GCP migration + beat-sync + transition SFX)

**Volume:** ~40 commits. Themes: The 3-layer creative intent architecture (commit 18224fb7) — a MASSIVE rewrite. GCP account migration (insturix-457914 → insturix-493414). Beat-sync wiring (Phase F). Transition SFX placer. musicDescription/sfxDescription through-wire.

### hasNativeAudio + 3-layer intelligence rewrite (THE big April commit)
- `f3b19867` — **Fix `hasNativeAudio`: reflect actual audio request, not model config default.** `video-generation-service.ts` +16. Previously hasNativeAudio was set from model capability; now set from actual audio request.
- `18224fb7` — **Intelligence rewrite: creative intent architecture (3-layer editing).** 5 files, **+1301**:
  - NEW `asset-briefing.ts` (+438) — Compresses 5-Track → 200-token briefing. Includes AI slop detection (5 checks).
  - NEW `intent-translator.ts` (+432) — Maps LLM creative intent enums to frame-accurate EDL decisions. Waterfall: VO word → subject → motion peak → energy → temporal → fallback.
  - `unified-edit-intelligence.ts` +380 — Adds creative intent mode.
  - `director-agent.ts` +78 — Wires the 3-layer flow.
  - `edl-executor.ts` +6.
  - **Layer 1 (LLM):** WHAT + WHY, no frame numbers. Constrained enums (~30 intent types).
  - **Layer 2 (Code):** "zoom at smile" → exact frame 82 using 5-Track.
  - **Layer 3 (Existing):** EDL executor unchanged.

### Parser timeout + analysis model
- `f9f13645` — Increase LLM parser timeout from 90s to 120s.
- `555b90ab` — Fix 5-Track analysis: switch from gemma-4 to gemini-3.1-flash.
- `7a67e73f` — Add sub-shot image thumbnails to storyboard UI.
- `807dbde2` — Fix analysis model: replace gemma-4 default in model factory + analysis service.

### ROW constants cleanup + DaVinci-style transition tile
- `4d7d6c22` — **Fix 20+ hardcoded row numbers — import ROW constants everywhere.** 10 files. Final ROW canonicalization.
- `11fb7481` — **Move transition tiles to video row — DaVinci-style inline between clips.**
- `bbcb438e` — Fix montage duration capping: skip for scenes with independent sub-shots.
- `1ad38cf7` — Fix transition z-index: add type override (85) for inline video row.

### Phase 4: musicDescription + sfxDescription
- `f76c252e` — **Phase 4a: Add musicDescription + sfxDescription to schema + parser.** `llm-scene-parser.ts` +42.
- `9ce8596b` — **Phase 4b: Wire musicDescription + sfxDescription into consumers.** 3 files. BGM + prefetch-sfx now receive parsed intent.
- `884599c8` — Add missing credit cost entries for pipeline actions. `creditCosts.ts` +41.
- `8408672c` — Fix nano-banana image-to-image 404: change to text-only reference.
- `ba741385` — Fix consistency scoring fallback + mark storyboard queue deprecated.
- `101bbd20` — Wire editronConfig audio ducking values into director-agent.
- `2527a183` — Fix analysis model: `gemini-3.1-flash` does not exist, use `gemini-3.1-flash-lite-preview`.

### Revert/restore arcs (music/sfx description + filter schizophrenia)
- `d2607991` — Fix musicDescription + sfxDescription dropped in export-for-editron.
- `d04847df` — Fix filter schizophrenia + double transitions in Director agent.
- `b3088c60` — Revert "Fix filter schizophrenia + double transitions in Director agent." (double-reversion arc)
- `9a85ea7d` — Revert "Fix musicDescription + sfxDescription dropped in export-for-editron."
- `2d509e2c` — Fix musicDescription + sfxDescription dropped in export-for-editron. (second attempt — stuck this time)
- `f02fa3de` — **Fix filter schizophrenia: disable EDL filter-change, profile overwrites.** 2 files. Profile now authoritative for filters.
- `b68fcdef` — Fix double transitions: push in-memory marker for dedup between iterations. `director-agent.ts` +15.
- `c42409ec` — Fix teal-orange + blade-runner filter presets: remove skin-destroying hue-rotate.

### UI polish
- `14d1c976` — Add 'View Full Storyboard' link to ExportToEditronDialog done step.

### GCP ACCOUNT MIGRATION (insturix-457914 → insturix-493414)
- `ee06d32d` — **chore: add GCP account migration runbook (insturix-457914 → insturix-493414).** 15 files, **+2720**. Entire `migrations/gcp-account-switch/` folder: oauth guide, data migration, code changes, testing plan, master plan, phase scripts (1-gcloud-setup, 3-data-migration, 6-mongodb-url-rewrite), troubleshooting, vercel env checklist, verification checklist.
- `2739a04e` — chore: update hardcoded GCP project ID fallbacks for new account. 5 files.
- `270ce7b0` — **Merge: migrate to new GCP account (insturix-493414).** (merge commit)
- `e133a19d` — **Merge `main` into `infrastructure-improvs-+Editron`.** (merge commit — this is the merge referenced in memory/MEMORY.md)

### Transition SFX placer (KB A-001/A-002) + Seedance dialogue suppression
- `e99d6c58` — **Fix SFXLib compound query: extract single atomic KB token.** `sfx-library-service.ts` +131. Fixes "whoosh + impact + rise" being sent as one Freesound query.
- `0de726f5` — **Add transition SFX placer: rule-driven whoosh/impact on KB A-001/A-002.** NEW `transition-sfx-placer.ts` (+312), `director-agent.ts` +34.
- `b9efaffa` — **Add profile-driven `transitionSFXPolicy` field.** 3 files. Profile can control transition SFX policy.
- `164dd21a` — **Suppress Seedance dialogue + inject sfxDescription into video prompts.** 4 files, +82. Seedance's hallucinated-speech mitigation at prompt level.

### Parser scale-up sub-shots + slop-aware best segment
- `d5c79f8a` — Parser: scale sub-shots UP to fill parent scene duration. `llm-scene-parser.ts` +45.
- `87e7b6a4` — **`selectBestSegment`: slop-aware window scoring + wire `detectSlop` in finalize.** `five-track-analysis.ts` +58.

### Beat-detection + beat-sync wiring (Phase F)
- `31df7b3a` — **Add beat-detection service: heuristic BPM-based grid primitive.** NEW `beat-detection-service.ts` (+229). *(Wait — earlier `a1098eee` created beat-detection-service.ts too at +570. This must be a rewrite; confirm with stat — yes, 229 lines is the new version, replacing/augmenting the Mar-21 version.)*
- `6875d02a` — Parser: detect beat-sync signals + extract BPM from script.
- `8efc06df` — **Finalize: sync BGM dispatch + beat grid on `beatSyncActive` flag.** `finalize/route.ts` +122.
- `040548e5` — **Director: beat-sync alignment step 3.5 (wires alignCutsToBeats dead code).** `director-agent.ts` +42. **This is when the March-30 `alignCutsToBeats` function finally got wired in.**

### Profile detection — LLM category filter
- `b0e142f2` — **Profile detection: LLM category filter eliminates cross-category false positives.** 7 files, +87. `profile-detection-service.ts` +55.

---

## Week 5 — April 16-21 (Ship-prep: S-16 through S-29 + admin auth + Toyota audit batches)

**Volume:** ~40 commits. Themes: the S-series ship-prep fixes (S-16 parser regression, S-17 filter preset, S-18 pacing compound, S-19 ref routing, S-20 dead field, S-21 link-node 422, S-22/S-23/S-24 hallucination, S-25/S-26/S-28 SFX, S-27 transitions, S-29 asset-centric speech), admin auth hardening, Toyota audit micro-fixes (Batches 1-5), caption styles dropdown, onScreenText fallback kill.

### Profile detection (continued from Week 4b)
- `42a3fc16` — **Profile detection: absolute-score normalization + config centralization.** `editron-config.ts` +82. Scoring no longer depends on relative top-match; uses absolute threshold.

### Parser defense + dispatch hardening
- `fce2ccdd` — **Export-for-editron: reject garbage parser output (Rule 2N).** 91 lines new. Guards against parser returning junk before it reaches Editron.
- `3ffd1a70` — Parser: bump LLM abort timeout 120s → 180s (cold-start headroom).
- `3175b9d3` — Video dispatch: model-aware duration cap (replaces hardcoded 10s limit).

### Transition ghost fixes (A1/B1/B3)
- `8362b5dc` — Director: strip in-memory dedup markers before save (ghost transition fix A1).
- `eca8daed` — **Transitions: clip-pair dedup + post-composition safety net (B1 + B3).** `director-agent.ts` +200.

### Admin auth
- `758f7835` — **Admin auth: rename to ADMIN_EMAILS + remove client-side allowlist leak.** 4 files. NEW `app/api/admin/whoami/route.ts` (+35). Important security fix — previously the allowlist was exposed client-side.
- `432203c7` — Docs: rename NEXT_PUBLIC_ADMIN_EMAILS → ADMIN_EMAILS in admin runbooks.

### onScreenText fallback killed + Caption styles exposed
- `dd758500` — **Finalize: kill onScreenText caption fallback (refined Option 1, fixes duplicate-text bug).** `finalize/route.ts` -19, `caption-service.ts` -128. Fixed duplicate caption-text that came from two code paths both injecting captions.
- `156e89ad` — **Caption styles: expose Hormozi/MrBeast/Ali-Abdaal/Corporate in UI dropdown (Item B).** 2 files.

### Director add_transition + AssetBriefing defensive
- `a74ddcba` — Director: fix `add_transition` params so EDL transition diversity survives.
- `ce5df796` — AssetBriefing: defensive array checks so partial cache shapes don't crash. `asset-briefing.ts` +76.

### Toyota audit — Batches 1-5 (micro-fixes across pipeline)
- `846a4459` — **Batch 1: defensive input validation + schema guard (Toyota audit micro-fixes).** 2 files.
- `2c617206` — **Batch 2: content-length-aware decision density + duration-snap visibility.** 2 files.
- `9be691ba` — **Batch 3: Nano Banana reference passthrough — inline-image-urls capability.** `storyboard-service.ts` +48.
- `8f76b94f` — **Batch 4: Gemini 429 / transient retry (Toyota A.gemini.6).** NEW `gemini-retry.ts` (+154). Rate-limit retry with exponential backoff.
- `079c0ae7` — **Batch 5: EDL onScreenText safety net + VO zone reservation.** `intent-translator.ts` +60.

### S-16 THROUGH S-29 (THE SHIP-PREP SERIES — my work this session)
- `f41b4e52` — **P0-4 / S-16: Root-cause fix for regex parser garbage output.** `script-to-scenes.ts` +60, `export-for-editron/route.ts` +16. Routes editorial headers to rawProductionNotes, kills `narration.substring(0, 2000)` copy-back.
- `987a4692` — **S-17: Filter-preset single-source refactor (Rule 18N drift prevention).** `filter-presets.ts` +13, `llm-scene-parser.ts` +5. Adds FILTER_PRESET_IDS typed for z.enum.
- `57f72532` — **S-18: Contributor #2 fix: pacing multiplier skip on explicit duration + VO floor (Rule 8N).** 5 files, +83. `edit-direction-applier.ts` +54. Adds durationWasExplicit field, VO-bound floor math.
- `975442a6` — **S-19: Scene-type-aware ref routing — fix NB2 montage regression.** `storyboard-service.ts` +45. getMaxRefsForSceneType() logic: montage=0, text-card=0, logo-reveal=1, talking-head=2, continuous=3.
- `b1553b10` — **S-20: Delete dead `profile.pacingMultiplier` field.** 3 files, -107 in profiles. Dead field removed from 54 profile entries via sed.
- `57d7fa29` — **S-21: Fix 422 on ThinkForge blocks containing link-node text.** 2 files. `script-to-scenes.ts` recursive link-node text extraction.

### Prateek's cherry-picks
- `c070504b` — **alignCutsToBeats() wired in pipeline/audio/route.ts after BGM generation.** Prateek commit. `audio/route.ts` +46.
- `8da7e998` — **Confidence tracking expanded** — previously only in EDL executor, now also in auto-post-processing, reactive-edit-engine, quality-review-service. Prateek commit. 3 files, +73.

### S-22-S-24: Parser hallucination arc
- `d40a10c0` — **S-22: Parser hallucination fix — prompt decontamination + output validator.** `llm-scene-parser.ts` +118. Replaces McDonald's examples with tech/fitness/real-estate (WRONG — overfits).
- `85249d4a` — **S-23: Revert domain-shifted examples to rule-only.** `llm-scene-parser.ts` +72/-58. Removes ALL concrete content, uses ALL_CAPS_UNDERSCORE placeholder tokens + rules only.
- `8f59bdd4` — **S-24: Audit completion for 2 remaining prompts.** `llm-scene-parser.ts` +13. Subject Extraction + VideoPromptMaster examples cleaned.

### S-25-S-29: SFX + transition keyword + asset-centric speech
- `b98f8d58` — **S-25: SFX 3-chain Phase B2 — fix prefetch tokenization + music-prompt routing.** `prefetch-sfx/route.ts` +35. Uses `audioDescriptionToSearchQuery`, removes music-leak fallback.
- `4a1dcc78` — **S-26: SFX 3-chain Phase B3 — remove Seedance hasNativeAudio filter + drop audioDescription fallback.** `finalize/route.ts` +48. **WRONG CALL** (user flagged: mandates SFX on every scene, doesn't respect native-audio scenes).
- `966b7022` — **S-27: Transition keyword extraction — rule-driven over probabilistic (Rule 18N).** `llm-scene-parser.ts` +140. 22 patterns for rapid cuts/smash cut/dissolve/etc.
- `b279d7eb` — **S-28: Split S-26 — restore !hasNativeAudio filter, keep music-leak fix.** `finalize/route.ts` +50/-38. Corrected over-reach from S-26.
- `4667b309` — **C2 / S-29: Phase C asset-centric speech verification (Option F).** `five-track-analysis.ts` +107. Transcribes AI-gen silent-intent clips via Deepgram, flags `hasHallucinatedSpeech`.

---

## Week 6 — April 26 (ThinkForge V2 sprint)

**Volume:** 8 commits across 2 branches. ThinkForge bug fixes + Bucket B stability.
**Branch:** `thinkforge-enhancementsV2` (primary), `infrastructure-improvs-+Editron` (B1 hotfix).

### ThinkForge bug fixes (B1-B7)
- `365a4621` *(infrastructure-improvs-+Editron)* — **B1: Prevent auto-draft on saved project open.** `ChatPanel.tsx` +22/-7. scriptRef + blocks check + 3s timer. Root cause: `script?.content` always `""` for blocks-based scripts + 800ms too short for Vercel cold starts.
- `84be94a3` *(infrastructure-improvs-+Editron)* — **B6+B2: Stabilize chat suggestions + export cancel button.** `ChatPanel.tsx` +14/-8, `ExportToEditronDialog.tsx` +6. Deterministic hash-seeded suggestions, Cancel Export button.
- `e2d08abf` *(thinkforge-enhancementsV2)* — **Sync B1+B6+B2 fixes from Editron branch.** 5 files, +45/-64. Aligned worktree with verified Editron fixes.
- `e2834b7f` *(thinkforge-enhancementsV2)* — **B4: Sync projectMeta hook state after idea update.** `useThinkForgeSession.ts` +1 (expose setProjectMeta), `page.tsx` +5 (call after API persist). Fixes rename-not-propagating bug.

### Bucket B — ThinkForge stability
- `373aed5f` — **Credit checks on 3 revenue-leak routes.** `sidecar/route.ts`, `refinery/route.ts`, `script/edit/route.ts`. +15. `checkCredits` + `deduct` before agent work.
- `83b44dd5` — **Credit refund on error for same 3 routes.** +3. `creditCheck.refund()` in catch blocks.
- `263c6bf9` — **Remove 4 empty placeholder files.** `ideas.ts`, `useSimpleIdeas.ts`, `safeJson.ts`, `mappers/__init__.ts`. Triple-grep-verified dead. Versioning dir confirmed ALIVE (used by BranchEditor + ScriptEditor).
- `acc19eec` — **Zod input validation on 5 high-risk routes.** `brand-dna`, `script/save`, `script/blocks`, `sidecar`, `script`. +88/-72. `.safeParse()` + `.passthrough()` for backward compat.

### Intent safety
- `373aed5f` (same commit) — **Intent classifier default EDIT→CONTINUE.** `intent-classifier.ts` +2/-1. EDIT as silent fallback was destructive; CONTINUE is non-destructive.

### Verified NOT dead (corrected from initial audit)
- `lib/thinkforge/versioning/` — ALIVE, used by useVersionManager, BranchEditor, ScriptEditor
- `lib/thinkforge/mappers/diff-engine.ts` — ALIVE, used by edit-blocks route
- `lib/thinkforge/services/event-log.ts` — ALIVE, used by sidecar + chat-service + events route

---

## Summary — 474+8 commits, 36 days (Mar 21 → Apr 26)

### What was built (architectural layers)
1. **Pipeline Foundation (Phase 0)** — Mar 21-22. ThinkForge script → storyboard → video → audio → finalize → render. QStash workers, GCS + R2, Gemini upload, 5 video models + 3 image models.
2. **Edit Intelligence (Phase 1-2)** — Mar 22-25. Audio ducking, 54 edit profiles, profile auto-detection, edit directions, transition system.
3. **Phase B Intelligence Backbone** — Mar 25. 5-Track analysis + Reactive Edit Engine + Cinematic Moment Detector + Content-Graphic Map.
4. **Phase D Infrastructure** — Mar 26-27. R2 CDN + IndexedDB cache + Gemini batching + URL proxy + AWS STS + Chapter rendering + MongoDB pool.
5. **Phase C Asset Analysis (C2)** — Mar 27-28. Universal analysis, media search endpoint, asset-analysis worker — but asset-search-service.ts still orphan (never called by Director).
6. **Director Knowledge Base** — Mar 31 (1529-line KB) + Unified Edit Intelligence Engine (single-call-per-project) + DecisionBudget tracker + auto post-processing.
7. **Montage Sub-Shot System** — Mar 30-31. M1-M4, MC1-MC2 match-cut, P1-P2 Pixabay, B1 beat-sync, AI1-AI2 EDL suggestions.
8. **Model Adapters (Phase S1+S2)** — Apr 5. Config-driven image+video adapters, centralized Gemini factory. Current 5 video models: Kling 2.1/2.6, Seedance 1.5/2.0, Veo 3.1.
9. **Cinema Prompt Engineering** — Apr 12. 6 cameras × 11 lenses × 6 focals × 5 apertures, content-mood-aware auto-selection.
10. **3-Layer Creative Intent Architecture** — Apr 14 (commit 18224fb7, +1301). Asset briefing + Intent translator + existing EDL. LLM describes WHAT+WHY, code resolves WHERE.
11. **GCP Migration** — Apr 15-16. 2720-line runbook, account switch to insturix-493414.
12. **Beat-Sync Phase F** — Apr 15-16. Beat detection service + finalize sync + Director step 3.5 + audio-worker wire (Prateek).
13. **Transition SFX Placer** — Apr 15. Rule-driven whoosh/impact on KB A-001/A-002.
14. **S-Series Ship-Prep** — Apr 17-21. S-16 through S-29: parser defense, filter preset, pacing compound, ref routing, dead field, link-node 422, hallucination decontamination, SFX chain fixes, transition keyword extraction, asset-centric speech verification.

### Patterns observed across the audit
- **Multiple revert/restore arcs:** montage (1ab8328c→306e1b6f), musicDescription (d2607991→9a85ea7d→2d509e2c), filter schizophrenia (d04847df→b3088c60→f02fa3de), voiceover-native-audio (f31e4d55→64a44253→e70dd414), render URLs (b439991f→81d48889→2356cf63). Pattern: fix → realized wrong → reverted → second attempt.
- **Many "CRITICAL" labels:** 6d3286a1 (storyboardScenes scope), 11347895 (row layout unify), 9f038ea9 (script duration is king), ba655e1c (Zod strays), 576ec5a9 (captions never executing), 7bda7ed1 (Director clobbering), 549b693f (Gemini Files API). Pattern: landed-broken → caught same day.
- **Recurring TypeScript sweeps:** 3f8f542a (+160 errors / 48 files), a20d2d9d (Next 15 params), 0de62b95 (+17), d045e61e (+14). Pattern: major changes → batch cleanup → pre-deploy verification.
- **Gemini model ID thrash:** `gemini-3.1-flash` doesn't exist → `gemini-2.5-flash` → `gemini-3.1-flash-lite-preview` → `gemini-3.1-pro-preview` → back. Pattern: docs misled, HOTFIX reverts.
- **Adversarial audits (2 rounds):** v1 (7db60934 — 6 CRIT + 3 HIGH + 8 MED) + v2 (82c3e7d6 / 6f958996 / 31341c3d / 84d43cb4 / c342342c — 6+5+5+6 issues). Plus exhaustive audits (a3d09ca5 — 7 CRIT + 9 HIGH, 5f37128d — 5 CRIT).
- **Dead-code wire-ups recurring:** `alignCutsToBeats` dead from Mar 30 → wired Apr 15 (040548e5, c070504b). `asset-search-service.ts` from Mar 27 still orphan today. `continuity-service.ts` unused.
- **Duration inflation:** 60s → 120s → 180s → 300s timeouts as the pipeline got heavier.

### Still-orphan services (updated 2026-04-22)
- ~~`lib/editron/services/asset-search-service.ts`~~ — **WIRED** in `c0d813a2` (Apr 22). Director Step 0: `findMatchingFootage()` informational search per scene.
- ~~`lib/editron/services/continuity-service.ts`~~ — **WIRED** in `c0d813a2` (Apr 22). Director Step 2.5: `analyzeAllScenePairs()` informs transition selection.
- `lib/editron/services/universal-analysis.ts` (295 lines) — DON'T wire. Graphiti/Graphify obsoletes this. Delete when knowledge graph lands.

### Key files with highest change concentration (rough count)
- `lib/pipeline/llm-scene-parser.ts` — touched in 70+ commits (parser is the hottest file).
- `lib/editron/agent/director-agent.ts` — touched in 40+ commits (Director agent churn).
- `lib/editron/services/edl-executor.ts` — touched in 25+ commits.
- `lib/editron/services/five-track-analysis.ts` — touched in 25+ commits.
- `lib/editron/agent/tools.ts` — touched in 30+ commits (AI chat tools).
- `app/api/services/pipeline/storyboard/[id]/finalize/route.ts` — touched in 30+ commits.
- `app/api/internal/workers/pipeline/video/route.ts` — touched in 20+ commits.

### Cross-reference to MEMORY.md
- `editron_master_remaining.md` shows 56 open items; this audit shows the reasons: config still partially wired, orphan services, dead-code wire-ups pending, profile-semantic-embeddings (C4) deferred.
- `stable_v2_snapshot.md` (2026-04-14) dates to commit `18224fb7` — the 3-layer rewrite is the v2 stable state.
- `toyota_reliability_audit.md` Batches 1-5 (846a4459-079c0ae7) are the audit entries it catalogs.

---
*End of audit — first pass. All 475 commits Mar 21 → Apr 21 mapped.*

---

## Appended — post-audit commits (chronological)

### 2026-04-21 (post-audit)
- `6a2f08b1` — **Merge `origin/main` into branch** — pulls down 5 main commits since last merge (`e133a19d`): Apify audioUrl simplification, `parseResponse.ts` utility, refund-config tests. Sitemap conflict resolved with `--ours`.
- `8e9bdb04` — **chore: update gitignore + add GCS→R2 migration script.** Ignores `.claude/`, `.cursor/`, `.opencode.json`, dev-only scripts. Stages `scripts/migrate-gcs-to-r2.mjs` (+280 lines). Pushed to origin.
- `43b12bec` — **fix: reference-image worker sends wrong params to Nano Banana (500s).** `reference-image-service.ts` `buildModelInput()` had hardcoded if/else only knowing flux/imagen/seedream/recraft. Nano Banana fell to default → sent `image_size:{w,h}` instead of `aspect_ratio` + `resolution` → fal.ai 500. Fix: delegate to `buildImageInputFromConfig()` from adapter system. 1 file, +13/-29.
- `07943698` — **fix: profile detection falls back to all profiles when LLM category scores < 30%.** LLM category filter locked to `platform-native` when script mentioned "Instagram/TikTok" as target platform → excluded E-04 Brand Narrative → A-02 YouTube Short won at 15%. Fix: if top score in LLM category < 0.30, fall through to all 54 profiles. 1 file, +9/-6.
- `ab3758ec` — **fix: separate pacing keywords from transitions + relax budget for short-form.** McDonald's proj_vGGN9Sva5Yiw: (1) S-27 "rapid cuts"/"QUICK CUT" treated as scene-level transitions → all hard-cuts, zero dissolves. Fix: split into PACING_KEYWORDS (sets pacing) and TRANSITION_KEYWORD_PATTERNS (sets transition). Skip shot prefixes. (2) Budget G-002 90-frame gap rejected 3/4 on-screen text on 32s video. Fix: ≤45s videos get proportionally relaxed gap (floor 45 frames). 2 files, +56/-6.
- `637c2ef2` — **fix: sort EDL decisions by confidence + script text bypasses budget.** Budget was first-come-first-served → best decisions rejected. Now sorts by confidence descending. Script on-screen text (`onScreenText-safety-net` source) bypasses budget entirely. 1 file, +20/-3.
- `29473979` — **fix: add subject-track strategy to intent translator waterfall.** 12/17 decisive moments fell to midpoint because translator didn't read 5-Track subject tracking. New strategy 4: match subject category/label from LLM description → find frame with largest bounding box. 1 file, +34/-2.
- `08c80d44` — **refactor: profile detection — LLM category as boost, not filter.** Score ALL 54 profiles always. LLM category adds +0.25 boost to matching profiles instead of filtering. Removes the <30% fallback patch. +26/-42 = simpler.
- `6c27bcba` — **fix: Director maxDuration 120s → 300s (Gemini bottleneck verified).** `director/execute/route.ts`. Gemini creative-intent call measured at 61s, 120s timeout was too tight. 1 file.

### 2026-04-22 (new session — McDonald's bug fixes + rule compliance audit)
- `12d19a15` — **fix: implement KB M-002 montage transition consistency + T-022 guard.** `director-agent.ts` +42/-11. Added `sceneType` to storyboardScenes projection. Same-scene (montage sub-shots) → hard-cut. Montage entry/exit → dissolve. T-022 (WEIGHT 10) override prevents dip-to-black in montage sequences. Verified against DIRECTOR_KNOWLEDGE_BASE.md rules T-001, T-010, T-022, M-002. Code review graph blast radius: `applyDecision` 2 internal callers only.
- `d83e32cb` — **fix: resolve sfx-trigger EDL decisions into actual sound overlays.** `edl-executor.ts` +50/-6. Previously `sfx-trigger` case returned null (informational only). Now pre-resolves unique SFX tokens (whoosh/pop/ding/bass-hit/riser) via Freesound before decision loop, caches in Map, creates sound overlays at decision frame. Volume 0.25 (≈-12dB, within creative_production_knowledge.md §3 Feature SFX range). Deterministic IDs via existing `deterministicOverlayId`. Import added: `searchAndDownloadSFX` from sfx-library-service (4th importer, no circular deps per graph).
- `6483842e` — **fix: warn when scene has narration but no voiceover audio.** `finalize/route.ts` +4. Adds pipelineWarnings.degraded() when `descriptor.narration` exists but `voiceover.audioUrl` is missing. Root cause of McDonald's VO count (1 instead of 2): parser LLM assigned narration to only 1 of 3 scenes (confirmed via Vercel log: `[Voiceover] Generating for 1 scenes`). Parser prompt quality issue, not code bug.
- `c0d813a2` — **feat: wire orphan services into Director Agent.** `director-agent.ts` +59/-3. (1) continuity-service wired as Step 2.5: `analyzeAllScenePairs()` runs before profile actions, recommends transitions as fallback (script > M-002 > continuity > profile default). Zero cost. (2) asset-search-service wired as Step 0: `findMatchingFootage()` checks user media library per scene, logs matches as warnings. Informational only, no auto-replacement. Both orphan since March 27 — now active. *(Updates still-orphan list: continuity-service and asset-search-service removed.)*
- `995c8b80` — **fix: add KB T-012 guard to continuity-informed transitions.** `director-agent.ts` +13/-3. T-012 (WEIGHT 9): never dissolve between contrasting moods. When continuity recommends soft-cut/dissolve but energyMatch < 0.4, force hard-cut. Also fixed `as any` cast by adding `energyMatch` to inline type. Retroactive compliance fix caught during rule audit. Verified against KB T-001/T-010/T-012/T-020/T-022 + creative_production_knowledge §6 + code review graph blast radius.
- `37e2dcb7` — **feat: add semantic embedding layer to profile detection.** `profile-detection-service.ts` +206, `finalize/route.ts` +5/-2. 54 profiles embedded via Gemini text-embedding-004, cached per process. Script text embedded at detection time, cosine similarity blended with keyword scores (60/40). Async variant `getAutoSelectedProfileWithEmbeddings()` wired into finalize. Sync variant unchanged for UI. Falls back to keyword-only if API unavailable. Blast radius: 3 callers (only finalize changed).
- `23fd7945` — **chore: add Graphify knowledge graph config.** `.graphifyignore` +20. Graphify installed as Claude Code skill, 20MB graph built (AST-only, zero LLM cost). Complements `.code-review-graph/`.
- `a82bc996` — **chore: gitignore graphify-out/.** `.gitignore` +1.
- `5e68d1f9` — **fix: guard undefined frames in subject-track moment resolution.** `intent-translator.ts` +1/-1. Strategy 4 (commit 29473979) accessed `matching[0].frames.length` without null guard. AI-gen videos use storyboard metadata path which produces subject tracks WITHOUT per-frame bounding boxes. Crashed Unified Intelligence → fell back to reactive engine → zero smart edits. Root cause of proj_2E2ulOY-LSSs having no zooms, no graphics, no SFX triggers.
- `c069d129` — **fix: guard Unified Intelligence against undefined LLM output fields.** `unified-edit-intelligence.ts` +17/-15. Vercel AI SDK `generateObject` can return undefined for nested arrays when Gemini omits optional fields. Added null coalescing on `sceneIntents`, `audioIntent`, `graphicIntents`, and all enum fields. Prevents "Cannot read properties of undefined (reading 'length')" crash. Blast radius: 1 caller (director-agent:277).
- `cca4f653` — **fix: rework video quality scoring with real artifact detection.** `video/route.ts` +101/-20. OLD: subject count + energy/brightness variance (meaningless proxy). NEW: 2-tier hybrid. Tier 1 (zero cost): motion smoothness, subject stability, description consistency, composition. Tier 2 (Gemini Vision, $0.003, borderline scores only): sends keyframes + prompt to check for melted fingers, face morphing, text hallucination, temporal flickering. Per creative_production_knowledge.md §7. Stores qualitySource, qualityDeterministic, qualityVision, qualityVisionIssues.
- `ce337a10` — **fix: preserve transition keyframes + run audio ducking post-BGM-merge.** `director-agent.ts` +36. (1) Step 4 now merges keyframeTracks from DB into in-memory overlays before save — fixes dissolve transitions showing as tiles but not rendering (keyframes were clobbered by saveProject overwrite). (2) Step 4.5 runs audio ducking after async BGM merge — fixes hasBGM=false skipping ducking because BGM arrives via QStash after Step 3 actions.
- `e225b839` — **fix: guard all overlay creation against durationInFrames=0.** `edl-executor.ts` +1, `director-agent.ts` +5/-2. Math.max(1,...) on SFX and transition tile durations. Save gate filters out durationInFrames<=0 overlays. Root cause: Freesound returned durationMs=0 → Remotion crashed with "durationInFrames must be positive."
- `dcde77d3` — **Merge feat/uploaderx-new.** 73 files, LinkedIn/X/Facebook/Instagram publishing. No Editron conflicts.
- `1b956cc5` — **chore: regenerate pnpm-lock.yaml** after uploaderx merge (CI ERR_PNPM_OUTDATED_LOCKFILE).
- `0c89849d` — **fix: lazy QStash verification in asset-analysis worker.** Skip verifySignatureAppRouter when QSTASH_CURRENT_SIGNING_KEY missing (CI build).
- `1f13634a` — **fix: P0 quick wins.** (1) geminiRetry on creative intent call. (2) Asset briefing lookup by assetId not iteration index — added assetId to SceneContext. (3) isSFXLibraryAvailable checks only FREESOUND_API_KEY (Pixabay dead code).







## Week 6 — April 26-27, 2026 (Knowledge Graph Build)

**Thematic cluster: Knowledge Graph Foundation (Neo4j + Graphiti)**

- `868efe9a` — **feat: Phase 1 — Knowledge Graph foundation.** Neo4j connection singleton, graph-service (node CRUD, vector search, Graphiti stubs), graph-sync QStash worker (9 actions), upload/analysis wiring, asset-search-service rewrite (Neo4j primary, MongoDB fallback). +2206 lines, 10 files.
- `bbced672` — **fix: prefix UploaderX R2 env vars.** `UPLOADERX_R2_BUCKET_NAME` / `UPLOADERX_R2_PUBLIC_BASE_URL` to avoid Editron CDN conflict. 1 file.
- `1957672d` — **security: remove hardcoded API keys from graphiti-test.py.** Gemini + Neo4j credentials were committed in plaintext. Now reads env vars.
- `a3aadf95` — **feat: Phase 2 — Project intelligence.** Finalize dispatches project_created + scene_batch. Director dispatches project_director_complete. Profile seed script (54 nodes). 3 files.
- `5274b0fa` — **fix: graph service reads GRAPH_GEMINI_API_KEY first.** Separate env var for graph Gemini key.
- `051c9246` — **feat: Phase 3 — Graphiti episode ingestion.** Python Vercel function for graphiti-core. addGraphitiEpisode dispatches via QStash. searchGraphitiFacts queries Neo4j vector index. 3 files.
- `c2668d13` — **feat: Phase 4 — contextual scoring + intelligence wiring.** Removal penalties scoped by mood+sceneType. Director queries Graphiti for transition preferences. Profile Detection queries Graphiti for override patterns. Project outcome episode on Director completion. 3 files.
- `c6c8b588` — **fix: move Graphiti profile boost to server-side.** profile-detection-service imported by client components, pulling neo4j-driver into browser bundle. Moved to finalize route. 2 files.
- `7c777f71` — **feat: wire media search API to graph-based search.** /api/services/editron/media/search now tries Neo4j first. 1 file.
- `ee90eaef` — **feat: Brand CRUD + overlay diff + override tracking.** Brand create/update/delete with Graphiti episodes. Project save diffs overlays for USED_IN/REMOVED_FROM edges. Override detection for transitions/filters. 3 files, +401 lines.

**Thematic cluster: Bug fixes + rule violation cleanup (2026-04-27, new session)**

- `ebb026ab` — **fix: caption skip for silent AI videos + beat alignment Vercel crash.** (1) tools.ts: add_captions now checks `metadata.generationUnitId` — pipeline-generated videos with no overlapping voiceover skip gracefully (`status:'skipped'`). User-uploaded footage still falls through to video-based transcription. Director handles `skipped` without logging errors. (2) audio/route.ts: replaced `node-web-audio-api` AudioContext (needs libasound.so.2 = crashes on Vercel) with `audio-decode` (pure WASM). Adapted AudioData → analyzeBeatsFull duck-typed shape. Beat alignment failure now fires pipelineWarnings.add() (Rule 18N). 5 files.
- `95256fe1` — **fix: 4 rule violations — REMOVED_FROM enrichment, brand scoping, as-any, catches.** (1) Rule 23N: save/route.ts REMOVED_FROM edges had 9 hardcoded neutral values → graph-sync worker now queries Neo4j for real Asset (mood, energy, colorTemp) + Scene (mood, sceneType) attributes and computes contrast flags. (2) Rule 11N: brands routes + save route use groupId:brandId (not userId) for Graphiti episodes. (3) Rule 12N: OverlayLike interface replaces 17 `as any` casts (0 remain). (4) Rule 11.75N+18N: 5 bare catch{} blocks replaced with console.warn. Adds scripts/verify-graph-state.ts (10-check Neo4j health script). 5 files.

**Thematic cluster: Mode 2 + model fix (2026-04-28)**

- `b0324593` — **feat: Mode 2 — Edit My Video.** New API route `POST /api/services/editron/auto-edit/from-asset` — accepts assetId, creates project with single video overlay, auto-detects profile, runs Director with real 5-Track analysis. UI: "Edit My Video" card on ProjectDashboard with file upload + progress spinner. 3 files (+275 lines).
- `7306074f` — **fix: replace deprecated gemini-2.0-flash with gemini-2.5-flash.** VideoWorker vision quality check was 404ing on every video (model deprecated by Google). Zero quality checks were running. Also cleaned duplicate entry in VALID_GOOGLE_AI_MODELS. 2 files.

**Thematic cluster: Master fix list P1-P6 completion (2026-04-28 to 2026-04-29)**

- `a1004ac0` — **fix: vision quality on ALL videos (Fix 6).** Gate `deterministicScore < 75` → `kfAnalyses.length > 0`. 1 file.
- `2f37d15d` — **fix: real dissolve via keyframe crossfade.** createTrueDissolve wired into EDL executor. Duration 18→36 frames. 2 files.
- `dc1e7ab8` — **fix: Mode 2 upload 3-step GCS signed URL flow.** Was sending FormData to JSON endpoint. 1 file.
- `c3ca7432` — **fix: dissolve cleanup — keyframeBased metadata + revert dead code.** 2 files.
- `c63d4d62` — **fix: ESLint underscore ignore + require→import.** 2 files.
- `761de910` — *(cherry-pick Prateek)* BGM key/mode. 1 file.
- `486f539f` — **fix: BGM song structure (Fix 19).** Percentage-based intro/build/peak/resolve. 1 file.
- `0445942f` — **fix: transition-sound pairing table (Fix 22).** Added 5 missing types + LLM prompt table. 2 files.
- `bb6ca491` — **feat: platform specs + LUFS (Fix 30+31).** 7 platforms in PLATFORM_SPECS. 1 file.
- `da4709f8` — **fix: SFX three-layer prompt (Fix 20).** Ambient bed + spot effects in single clip. 1 file.
- `33b57ac9` — **fix: Murch emotion-first resolution (Fix 25).** Reordered waterfall: emotion→subject→motion→VO→temporal. 1 file.
- `3504353e` — **fix: editorial transition aliases (Fix 23).** invisible-cut/l-cut/j-cut. 1 file.
- `683e1e2c` — **feat: Eisenstein montage vocab (Fix 21).** 5 methods in unified-intel prompt. 1 file.
- `f1444771` — **fix: continuity uses 5-Track data (Fix 24).** perAssetAnalysis Map → dominant colors + keyframe descriptions. 1 file.
- `7a4a33e4` — **fix: merge BGM structure + non-Western music (Fix 19+28).** Combined ours+Prateek. Raga/maqam/polyrhythm added. 1 file.
- `d8fdbe24` — **fix: cultural visual grammar (Fix 27).** Composition rules: Bollywood/anime/ukiyo-e/nordic/wes-anderson/arabic. 1 file.
- `7ff9ef96` — **fix: cultural context in profile detection (Fix 29).** detectCulturalContext() regex + culturalContext signal field. 1 file.

**Thematic cluster: Mode 2/3 completion + Match Edit (2026-04-29 to 2026-04-30)**

- `07f5278b` — **feat: video-understanding-service.** Gemini Vision → SyntheticStoryboard. Director Path B. 3 files.
- `bf15cd74` — **feat: multi-path Mode 2 entry.** script/ref/images/platform optional inputs. 1 file.
- `743274bb` — **feat: use_matching_footage AI chat tool (Mode 3).** Swap AI clip w/ user footage. 1 file.
- `22e5c443` → `9f043a69` — **Match Edit rewrite.** Deleted monolithic route. New: /analyze + /generate-gap + reference-content-extractor + footage-matcher. 6 files.
- `77eac635` → `91de21ef` → `13623075` — **Mode 2 upload saga.** Server proxy (4.5MB Vercel limit) → R2 presigned (CORS) → R2 CORS fixed → gcsPath optional. 3 files.
- `d2213e99` — **fix: video size cap 50-100MB → 2GB.** Gemini Files API actual limit. 3 files.
- `3dda129e` — **feat: video-analysis QStash worker.** Async Mode 2 processing. from-asset dispatches to worker. 2 files.
- `74ab4772` — **fix: QStash URL from env var + status polling.** 6 hardcoded URLs → `process.env.QSTASH_URL`. Dashboard polls autoEditStatus. 6 files.

**Thematic cluster: UploaderX env vars (social platform integration)**

**Thematic cluster: ThinkForge V2 Sprint (2026-04-26 to 2026-04-27)**

*Bug fixes:*
- `365a4621` — **fix(thinkforge): prevent auto-draft on saved project open (B1).** scriptRef + blocks check + 3s timer. ChatPanel.tsx only.
- `84be94a3` — **fix(thinkforge): stabilize chat suggestions + export cancel (B6, B2).** Deterministic seed for suggestions, Cancel Export button. 2 files.
- `f20094fa` — **fix(thinkforge): hydrate fresh script before export.** ExportToEditronDialog fetches from /script/blocks before calling export-for-editron. Fixes blocks/richText content mismatch.

*Bucket B — hygiene:*
- `73c85656` — *(merged by other session)* Includes: B4 projectMeta sync (expose setProjectMeta), credit checks on /sidecar + /refinery + /script/edit (with refund on error), intent classifier EDIT→CONTINUE, Zod validation on 5 routes, geminiFileService lazy init build fix.

*Bucket A — V2 architecture (Editron-ready authoring):*
- `9034f9d0` — **feat(thinkforge): Phase 4A — SceneBlock + EditorialBlock schema + extensions.** New ThinkForgeBlockKind values 'scene'|'editorial', SceneSlots + EditorialSlots interfaces, Tiptap extensions (scene-block.tsx, editorial-block.tsx), CSS in thinkforge-editor.css. 5 files, +455 lines.
- `4ac97aa9` — **feat(thinkforge): Phase 4B — mapper round-trip.** tiptap-schema (Zod schemas for sceneBlock/editorialBlock), thinkforge-to-tiptap (case 'scene'/'editorial'), tiptap-to-thinkforge (reverse with slot reconstruction). 3 files, +125 lines.
- `01784c00` — **feat(thinkforge): Phase 4C — agent output.** document-authoring-contract rules 3+4 (scene/editorial blocks), script-author-agent video_script role profile. 2 files, +38 lines.
- `efe638b7` — **feat(thinkforge): Phase 4D+4E — Brand DNA in export + block validation.** ExportToEditronDialog fetches /brand-dna, includes in POST. Save routes upgraded from z.array(z.any()) to z.array(ThinkForgeBlockSchema). 3 files, +33 lines.
