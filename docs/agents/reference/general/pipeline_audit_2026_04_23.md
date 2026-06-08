---
name: Pipeline Audit — April 24, 2026 (Pre-Merge) v3 VERIFIED
description: Full pipeline audit against NEW vision (replaces Adobe+DaVinci) and creative doc v2 (37pg). All key claims personally verified via grep+CRG. Overall 4.1/10.
type: project
last_updated: 2026-04-24
audit_status: v3 VERIFIED — grep+CRG confirmed. Graphify CLI needs vendor/ exclusion rebuild.
originSessionId: 4d413f79-e253-433c-aec2-c835ed7c9b20
---
# Pipeline Audit v3 — April 24, 2026 (VERIFIED)

**Status:** DRAFT. Findings from 2 parallel sub-agents reading actual code. NOT yet verified against creative_production_knowledge.md, DIRECTOR_KNOWLEDGE_BASE.md, CRG, or Graphify. Scores are directionally correct but need re-validation against the REAL vision bar: "would a professional trust this output enough to ship to a client without checking?"

---

## Scorecard

| Stage | System | File | Score | Critical Gap |
|-------|--------|------|-------|-------------|
| 1 | Scene Parser | `lib/pipeline/llm-scene-parser.ts` | 8/10 | Prompt 8500 words, temp 0.3 (should be 0.0-0.1), no few-shot |
| 2 | Storyboard Images | `lib/pipeline/storyboard-prompt-builder.ts` | 5/10 | Does NOT use cinema-prompt-config, generic tokens, flat prompt |
| 3 | Video Generation | `lib/pipeline/video-generation-service.ts` + video worker | 7/10 | Temp 0.7, Veo length unenforced, cinema gap with storyboard |
| 3b | Reference Images | `lib/pipeline/reference-image-service.ts` | 7/10 | No schema enforcement on LLM output |
| 4a | TTS | `lib/pipeline/tts-service.ts` | 7/10 | WAV duration hardcodes 24kHz, no retry, no language support |
| 4b | BGM | `lib/pipeline/bgm-service.ts` | 6/10 | Duration approximate, stale MiniMax header, no retry |
| 4c | SFX Chain | `lib/pipeline/sfx-service.ts` + `sfx-library-service.ts` | 7/10 | Pixabay dead code lies in `isSFXLibraryAvailable`, CassetteAI wrong for SFX |
| 5 | Finalize | `app/api/services/pipeline/storyboard/[id]/finalize/route.ts` | 8/10 | Non-deterministic BGM ID, profile error swallowed |
| 6a | Unified Intelligence | `lib/editron/services/unified-edit-intelligence.ts` | 7/10 | NO RETRY on Gemini call, briefing lookup broken by index |
| 6b | Intent Translator | `lib/editron/services/intent-translator.ts` | 8/10 | Motion peak uses first not strongest, cross-scene leak |
| 6c | EDL Executor | `lib/editron/services/edl-executor.ts` | 8/10 | SFX volume 0.25 hardcoded (config says 0.3), 3 types silently null |
| 6d | Auto Post-Processing | `lib/editron/services/auto-post-processing.ts` | 8/10 | Drift zoom unwired from config, SFX queries compound |
| S1 | Asset Briefing | `lib/editron/services/asset-briefing.ts` | 8/10 | fps=30 hardcoded, no slop severity aggregation |
| S2 | Quality Review | `lib/editron/services/quality-review-service.ts` | 5/10 | Only 7 checks (claims 12), dead type, missing critical checks |
| S3 | Editron Config | `lib/editron/config/editron-config.ts` | 8/10 | Static only, budgets not length-scaled, genre-agnostic |
| S4 | Asset Search | `lib/editron/services/asset-search-service.ts` | 4/10 | Loads all to memory, embeddings never generated |
| S5 | Continuity Service | `lib/editron/services/continuity-service.ts` | 5/10 | Text-only, no video data, string color matching |

**Overall: 6.8/10**

---

## P0 Fixes (will cause production failures)

### 1. No retry on creative intent Gemini call
- **File:** `unified-edit-intelligence.ts:616`
- **Impact:** Single Gemini 429 kills ALL smart editing for the project
- **Evidence:** proj_2E2ulOY-LSSs had "Unified Intelligence failed" → reactive fallback → 0 decisions executed
- **Fix:** Wrap in `geminiRetry()` like the legacy path at line 494

### 2. Asset briefing lookup broken by index
- **File:** `unified-edit-intelligence.ts:761-763`
- **Code:** `Array.from(options.assetBriefings.values()).find((_, idx) => idx === scene.sceneIndex)`
- **Impact:** Scenes get wrong asset briefings when Map insertion order differs from scene indices
- **Fix:** Key lookup by scene's video overlay assetId

### 3. `isSFXLibraryAvailable` lies
- **File:** `sfx-library-service.ts:352`
- **Code:** `return !!(process.env.PIXABAY_API_KEY || process.env.FREESOUND_API_KEY)`
- **Impact:** Returns true when only PIXABAY key set, but Pixabay search is dead code → all lookups silently return nothing
- **Fix:** Remove PIXABAY_API_KEY from the check (or remove dead Pixabay code entirely)

---

## P1 Fixes (quality degradation)

### 4. Storyboard images don't use cinema-prompt-config
- **File:** `lib/pipeline/storyboard-prompt-builder.ts`
- **Impact:** Storyboard image (visual foundation) has no cinema hardware language, but video prompt does → style discontinuity
- **Fix:** Import and call `getCinemaSettingsFromContent` + `buildCinemaFragment` in prompt builder

### 5. LLM temperatures too high for determinism
- Parser: 0.3 → should be 0.0-0.1 (`llm-scene-parser.ts:150`)
- Video prompt refinement: 0.7 → should be 0.2-0.3 (`llm-scene-parser.ts:1873`)
- **Impact:** Violates Vision §2 (deterministic by default). Same script → different scenes/prompts across runs.

### 6. Config values not wired into code
- EDL executor SFX volume: hardcoded 0.25, config says 0.3 (`edl-executor.ts:389`)
- Post-processing drift zoom: hardcoded 0.03/0.01, config has same values but unwired (`auto-post-processing.ts:206-208`)
- Asset briefing fps: hardcoded 30 (`asset-briefing.ts:222`)
- Freeze-frame fps: hardcoded 30 (`auto-post-processing.ts:386`)

### 7. Quality review only has 7 checks (claims 12)
- **File:** `quality-review-service.ts`
- **Missing:** audio clipping, transition collision, overlapping overlays, SFX outside bounds, caption readability, duration sanity, empty asset URLs
- **Dead code:** `color_inconsistency` type declared but no function implements it
- **Type hack:** `'low_analysis' as any` bypasses IssueType union

---

## P2 Fixes (missing functionality)

### 8. Continuity service uses text, not video data
- Has access to 5-Track (color histograms, motion vectors, subjects) via analysis cache
- Currently uses keyword overlap on description strings
- Color matching uses string equality ("#FF0000" != "red")

### 9. BGM duration not measured
- Returns `durationMs: durationSec * 1000` (requested, not actual)
- CassetteAI may return shorter/longer clips

### 10. Asset search has no embeddings on assets
- `semanticEmbedding` field checked but never written by any service
- All searches fall back to basic tag matching
- Mode 2 (user footage) completely blocked

---

## Asset-Centric Infrastructure — Gap Analysis

### What exists
- Asset search service (skeleton, 138 lines)
- 5-Track analysis (works on real footage via Gemini Files API)
- Asset resolver + CDN proxy
- Upload service (R2 primary, GCS mirror)
- Continuity scoring (metadata-only)

### What's missing for Mode 2
1. Asset ingest pipeline (upload → analyze → tag → embed)
2. Transcript alignment (user footage → script matching)
3. Segment extraction (in/out points, Phase C3)
4. Audio detection on upload (speech? music? silence?)
5. Format normalization (non-standard codecs)
6. MongoDB `$vectorSearch` for asset queries

### Estimated gap: 4-6 weeks for minimal Mode 2

---

## Findings NOT yet verified

The following claims from sub-agents need verification against creative doc, KB, CRG, Graphify:
- "No few-shot examples in parser prompt" — is this actually needed or would it cause contamination?
- "Beat-sync keyword includes 'montage'" — does KB say montage implies beat-sync?
- "CassetteAI wrong for SFX" — is there a better model available on fal.ai?
- "Motion peak sorted by frame not intensity" — need to check 5-Track output format
- "Cross-scene analysis leak in translator" — need to verify with actual project data
- All score ratings (may need adjustment after proper vision-bar evaluation)

---

## Re-audit needed

This audit was run by sub-agents. The main agent (me) did NOT:
- Personally read each file against the creative doc
- Query CRG or Graphify for semantic connections
- Cross-reference against KB rules
- Evaluate against the REAL vision bar ("would a pro trust this?")
- Check pipeline_investigations.md for prior findings

Re-run with proper rule compliance before using these findings to make code changes.

---

## v3 VERIFIED SCORES (2026-04-24)

Audited against: NEW vision ("replaces Adobe+DaVinci"), creative doc v2 (37 pages).
Bar: "Would Marvel's post-production team trust this output?"
Methodology: Sub-agent code reading + personal grep/CRG verification of all key claims.

| Stage | System | v3 Score | Verified evidence |
|-------|--------|----------|-------------------|
| 1 | Scene Parser | **4/10** | `narrativeArc` enum line 85: 5 values (doc has 20+). grep cultural: 0 results |
| 2 | Storyboard Images | **3/10** | Line 136: hardcoded "rule of thirds". CRG: 0 cinema-config imports |
| 3 | Video Generation | **5/10** | Worker 99-101: cinema config wired. But 4/8 prompt elements |
| 4a | TTS | **3/10** | Speed param exists but never set. Zero WPM tiers |
| 4b | BGM | **3/10** | Line 144: binary BPM (120-140 or 80-100). Doc has 7 tiers |
| 4c | SFX | **4/10** | 3-tier fallback works. No three-layer model |
| 5 | Finalize | **5/10** | Assembly solid. No platform-specific delivery |
| 6a | Unified Intelligence | **6/10** | Murch at line 838. Eisenstein/Pearlman/Tarkovsky: 0 grep results |
| 6b | Intent Translator | **6/10** | Waterfall architecture sound. Mechanical not emotional |
| 6c | EDL Executor | **5/10** | Budget enforcement good. SFX vol 0.25 vs config 0.3 |
| 6d | Quality Review | **3/10** | ~7 checks. Doc §11: 24+ checks |
| S1 | Asset Briefing | **5/10** | 5/8 AI artifact detectors |
| S2 | Continuity | **3/10** | Keyword overlap. No 5-Track data |
| S3 | Profile Detection | **4/10** | Semantic embeddings added. Zero cultural context |
| S4 | Config | **6/10** | Ducking params match §6.4. Missing LUFS, caption specs |
| S5 | Asset Search | **4/10** | Skeleton. Embeddings never written |

**Overall: 4.1/10**

### Fix categories

**A) Quick wins (days):** Config wiring, temperature fixes, dead code removal, Graphify vendor exclusion
**B) Prompt engineering overhaul (1-2 weeks):** Parser structures, storyboard composition menus, audio creative control
**C) Cultural awareness layer (2-3 weeks):** Parser + storyboard + video + audio all need cultural technique menus
**D) Quality gate buildout (1 week):** §11 full implementation
**E) Asset-centric infrastructure (4-6 weeks):** Mode 2 user footage support

### Graphify action needed
Add `vendor/` to `.graphifyignore` and rebuild. Current full-codebase graph has 10K+ vendor nodes drowning CLI queries.

### Key insight
Creative doc v2 philosophy: "No rules — only menus of techniques." Current pipeline does the opposite: hardcoded rules everywhere. The fix pattern: replace hardcoded defaults with technique menus, let LLM or rule-engine select from menu based on context.

### Deferred audio fixes (not priority, add when doing audio overhaul)

**Dialogue tail cutoff (Option A — production-level):**
Extend native-audio clips to the next speech gap instead of hard-cutting at scriptDurationSec. Requires 5-Track speech detection (Track 1 word timestamps) to be available at finalize time. Currently 5-Track runs in video worker AFTER finalize, so the data isn't available. Fix: either move 5-Track earlier in the pipeline, or do a post-finalize adjustment in the Director that reads the cached 5-Track data and extends clips.

**Native audio crossfade at scene boundaries:**
Seedance clips have baked-in ambient audio. When clip A→B transitions, the ambient audio (restaurant buzz → outdoor air) hard-cuts. BGM IS present underneath (ducked to 20%) but the native audio transition is jarring. Fix: add 3-5 frame audio crossfade in `video-layer-content.tsx` for native-audio clips at boundaries. Needs Remotion client-side work + browser testing.

**Three-layer sound model:**
Creative doc v2 §6.2 defines ambient bed + spot SFX + feature SFX. Current system generates ONE SFX per scene. Needs architectural rework of the SFX pipeline to generate/search for all 3 layers per scene.
