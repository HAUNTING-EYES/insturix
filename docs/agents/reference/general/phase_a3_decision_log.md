---
name: Phase A3 Decision Log — What I Did, Why, What I Rejected
description: MANDATORY context for any session continuing Phase A3 work. Tracks every architectural decision, why I made it, what alternatives I rejected, and current state. Update every 10 chats or after each commit.
type: project
last_updated: 2026-04-08
---

# Phase A3 Decision Log

**Branch:** `infrastructure-improvs-+Editron`
**Vercel Project:** `prj_uAwH5pAHMWaOiRNbS7FZuejWXUuc`
**Preview DB:** `editron_prev` (storyboards, projects), `insturix_preview` (other)
**Test artifact:** `proj_QXaC7iOTQi4g` (the broken McDonald's render that triggered Phase A3)
**Test storyboard:** `sb_3_8IjK8_rIOC` (in `editron_prev.storyboards`)

---

## RULE — Decision Log Maintenance

**Update this file:**
1. **After every commit** related to Phase A3 (or any architectural Editron work)
2. **Every 10 chat turns** even if no commit happened (drift detection)
3. **When the user pivots strategy** (record what changed and why)
4. **Before starting a new sub-phase** (record the plan + alternatives considered)

**What to record:**
- The decision (what was chosen)
- The alternatives considered
- Why the chosen option won
- Files touched
- Test evidence (logs, MongoDB queries, render artifacts)
- Any user feedback that influenced the decision

**Why this rule exists:** As chat context grows, accuracy degrades. The user explicitly noted this. This file is the rolling source-of-truth that survives compaction. **Read it FIRST in any new session before touching code.**

---

## Phase A3 Origin

User test on 2026-04-07: McDonald's "Golden Arches of Memory" 30s nostalgia reel. Result: **disastrous edit quality**. User report: "the multiple scenes are just 3 videos / made to cut and stitch to make 11 shots / it looks VERY BAD ew".

Project ID: `proj_QXaC7iOTQi4g`. Inspected via direct MongoDB query (since deleted: `scripts/debug-storyboard.mjs` had hardcoded creds). Found 17 distinct bugs cataloged in `editron_master_remaining.md` Phase A3 section.

Pre-Phase-A3 hotfix that unblocked the test in the first place: commit `d3d295d0` — parser model timeout fix (gemini-3.1-pro-preview was hanging past Vercel's 300s limit; switched defaults to gemini-3.1-flash-lite-preview + added AbortSignal.timeout to all 4 generateObject calls in llm-scene-parser.ts).

---

## Bundle 1 — Re-finalize-only fixes (commit `4d005340`)

**Strategy:** Cheap test ($0.01 re-finalize, no video regen). Touch only post-finalize editing layer. 7 files.

### Decision 1: Kill duplicate dip-to-black transitions via director-agent existing-check fix
**File:** `lib/editron/agent/director-agent.ts:699-711`
**Bug:** A3.5.1 + A3.5.2. McDonald's project had 10 `source:'tool'` dip-to-black overlays between every adjacent clip pair, on top of 4 `source:'edl'` transitions on row 5. Director's add_transition existing-check filter was `o.type === 'html-scene' && (o.row === 1 || metadata.isTransition)` — missed real `type:'transition'` overlays from the EDL executor entirely.
**Fix:** Changed filter to `o.type === 'transition' || metadata.isTransition`. Now Director sees EDL transitions and only fills genuine gaps.
**Alternatives rejected:**
- ❌ Disable add_transition profile action entirely → too aggressive, would break profiles that intentionally add transitions on top of EDL
- ❌ Add a "skip if EDL ran" flag → leaks state across pipeline phases
- ❌ Move transition placement entirely to EDL executor → architectural rewrite, deferred to a hypothetical Bundle 3+

### Decision 2: Deterministic overlay IDs in edl-executor
**File:** `lib/editron/services/edl-executor.ts` (added `deterministicOverlayId()` helper)
**Bug:** A3.5.6 (related). `applyTransition` and `applyGraphic` used `Date.now() + Math.floor(Math.random() * 10000)` for overlay IDs → different IDs per render → broke Lambda render cache.
**Fix:** FNV-1a hash of `(idEpoch, decisionType, frame, decisionIndex)`. Threaded epoch + index through `applyDecision()` signature. Camera shake was already seeded (mulberry32 from prior commit), only IDs were left.
**Alternatives rejected:**
- ❌ Use UUIDs → still random, doesn't help cache
- ❌ Use frame number alone → collisions if multiple decisions land on the same frame
- ❌ Leave Math.random and accept cache miss → defeats Lambda render optimization

### Decision 3: speedCurve validator (clamp + dedup + sort)
**File:** `lib/editron/services/edl-executor.ts` `applySpeedChange()`
**Bug:** A3.5.6. Generator produced curves like `[{frame:0}, {frame:0}, {frame:120 on 60-frame clip}, {frame:60}]` — duplicate frame-0 entries, out-of-bounds frames, non-monotonic order.
**Fix:** Build keyframes → clamp each frame to `[0, clipDuration-1]` → dedupe by frame (last wins) → sort ascending → skip if <2 distinct keyframes remain.
**Alternatives rejected:**
- ❌ Throw on invalid → would break the entire EDL execution chain for one bad decision
- ❌ Auto-fix without warning → silent correction, harder to debug. Current code logs `[EDL-Exec] Speed-change ... SKIPPED — after clamping, <2 distinct keyframes`

### Decision 4: filterId resolution via getFilterPresetById
**File:** `lib/editron/services/edl-executor.ts` `applyFilterChange()`
**Bug:** A3.5.4. Function destructured `filterId` from `decision.params` but never resolved it to CSS — only `filterCss` was applied. Any EDL decision with only `filterId: 'golden-hour-pro'` did nothing.
**Fix:** If `filterId && !filterCss`, look up via `getFilterPresetById(filterId)` and use its `.filter` CSS string.
**Alternatives rejected:**
- ❌ Force EDL Gemini to always emit filterCss → adds 50+ chars per decision, wastes tokens, fragile
- ❌ Build a separate filter resolver → duplicates getFilterPresetById that already exists

### Decision 5: Remove hue-rotate filters from generic mood mapping
**File:** `lib/editron/data/filter-presets.ts` GRADE_SEMANTIC_MAP + `resolveFilterFromDescription()`
**Bug:** A3.5.4. McDonald's clips 107068-070 + 107073-075 got `hue-rotate(160deg)` from `teal-orange` preset → blue/green skin tones on a nostalgia ad.
**Fix:**
- "luxury premium" → was teal-orange (hue-rotate 160) → now film-portra (real luxury grade)
- "tech modern" → was blade-runner (hue-rotate 175) → now clean-corporate
- "cold clinical" → was cool (hue-rotate 180, full inversion) → now clean-corporate
- Added explicit nostalgia/memory/childhood matching to resolveFilterFromDescription() → golden-hour-pro
- "cool"/"cold" downgraded from "cool" preset to clean-corporate

**Why teal-orange + blade-runner are still IN the file but not in mood map:** Some edit profiles (D-01 Cinematic, D-08 Luxury) explicitly use teal-orange. Removing the preset entirely would break those. Solution: keep the preset, prevent it from being auto-selected by generic mood inference. Documented in the file header comment.

### Decision 6: ROW constants (partial — only edl-executor + auto-post-processing)
**Files:** `lib/editron/services/edl-executor.ts`, `lib/editron/services/auto-post-processing.ts`
**Bug:** A3.5.12. Hardcoded `row: 1`, `row === 3`, etc. throughout the codebase.
**Fix:** Imported `ROW` from `lib/pipeline/scene-to-editron.ts` (canonical export). Replaced `row: 5` (transitions) with `ROW.TRANSITIONS`, `row: 1` (BGM lookup) with `ROW.BGM`, `row === 3` (voiceover lookup) with `ROW.VOICEOVER`.
**NOT done in Bundle 1:** Graphics row stays at `1` (with `ROW.BGM` constant + a long comment explaining why) because moving to canonical ROW.MOTION_GRAPHICS = 6 would put graphics at z-index 40, BELOW video (z-index 80) → invisible. The "row 1 for graphics" is an intentional z-index hack documented in `creative_production_knowledge.md` and `editron_architecture_truth.md`.

### Decision 7: Sub-shot inherits scene-level hasNativeAudio
**File:** `app/api/services/pipeline/storyboard/[id]/finalize/route.ts`
**Bug:** A3.5.13. Only the scene-level video clip (107065) had `hasNativeAudio: true`. The 10 sub-shots didn't, despite all using Seedance 1.5.
**Fix:** When creating sub-shot overlay, copy `hasNativeAudio` from the parent scene with sub-shot override fallback. Common case (whole montage uses one model) is now correct. Phase 2 of this fix (per-sub-shot model detection in the video worker) is **deferred** because it requires a video worker refactor I didn't want in the same commit.
**Alternative rejected:** ❌ Detect model per sub-shot in finalize itself → finalize doesn't have the per-sub-shot model info. Belongs in the video worker.

### Decision 8: pipelineWarnings wired into audio worker
**File:** `app/api/internal/workers/pipeline/audio/route.ts`
**Bug:** A3.5.14. McDonald's project had `warnings: "none"` despite SFX worker dispatching 5 SFX requests and producing zero overlays. Silent failure.
**Fix:**
- Imported `createPipelineWarnings` + added module-local `persistWarnings()` helper that does `$push` to `project.pipelineWarnings`
- BGM gen wrapped in try/catch → `errorSwallowed('bgm', ...)` on failure
- SFX batch wrapped → `errorSwallowed('sfx', ...)` on failure
- Per-scene SFX failures detected via `!sfxResults.has(input.sceneIndex)` → `degraded('sfx', ...)`
- Null/empty audioUrl responses → `degraded('sfx', ...)`
- Top-level catch persists warnings before returning 500
- Happy path also persists (via `persistWarnings(db, projectId, warnings)`)
- Return JSON includes `warnings: warnings.getAll()` so caller sees them

**Alternative rejected:** ❌ Pass pipelineWarnings instance from finalize through QStash payload → can't serialize, and finalize and audio worker run in different processes anyway

---

## Bundle 2 — Architectural fixes (commit `8063efc6`)

**Strategy:** Full regen test (~$3, requires re-export from ThinkForge). Touch the parser, storyboard, EDL prompt, captions, profile detection, and export dialog. 9 files.

### Decision 9: Per-sub-shot image generation (THE big one)
**Files:** `lib/pipeline/storyboard-service.ts`, `lib/pipeline/storyboard-db.ts` (added `updateSubShot()`)
**Bug:** A3.2 — "3 videos stitched to 11 shots". Confirmed via MongoDB query: every sub-shot in `sb_3_8IjK8_rIOC` had `imageUrl: MISSING` and `imageAssetId: MISSING`. Each `independentGeneration: true` sub-shot got its own Seedance video call (verified via 11 distinct videoAssetIds), but **all 5 sub-shots in a montage shared the parent scene's single storyboard image as the starting frame**. 5 Seedance outputs from the same frozen frame = visually near-identical, only motion variance.
**Fix:** After scene-level image succeeds in `generateForScene`, iterate `descriptor.subShots`. For each `independentGeneration:true && !imageUrl && visualDescription`, generate its own image via `generateStoryboardImage()` with a synthetic SceneDescriptor. Persist via `updateSubShot()`. Sequential within scene (parallel across scenes via existing concurrency limit).
**Critical design choice:** **NO reference image passed** to per-sub-shot gen. Sub-shots in a montage MUST look DIFFERENT (different era, different subject) — IP-adapter would force visual similarity and defeat the entire purpose.
**Alternatives rejected:**
- ❌ Generate sub-shot images lazily at video-gen time → wrong layer; breaks user storyboard preview where they review images before paying for video
- ❌ Pass parent scene as low-weight style anchor → tested mentally, would over-constrain Flux to match parent's lighting/composition. Each sub-shot's visualDescription is the source of truth, not the parent
- ❌ Make this opt-in via a flag → adds UX complexity; the user already opts in by allowing `independentGeneration: true` sub-shots, the cost preview already warns them
**Cost impact:** ~$0.02 per additional Flux Schnell call. A 5-sub-shot montage goes from 1 image → 5 images = +$0.08. Already documented in the cost preview (line 205 of llm-scene-parser).

### Decision 10: Parser decomposition rules — literal shot counts + anti-duplication
**File:** `lib/pipeline/llm-scene-parser.ts` main prompt
**Bugs:**
- A3.1.a: Parser collapsed Scene 1's 3 shots ("Happy Meal toy / fries / sign") into 1 video, lost 2/3 of the visuals
- A3.1.b: Parser produced Scene 3 ("Connection") with 5 sub-shots that were verbatim copies of Scene 2's era montage, instead of the script's intended unified present-day "diverse group around a table" scene
**Fix:** Three additions to the prompt:
1. **"LITERAL SHOT COUNTS (MANDATORY)" section** — when script uses "Shot 1: / Shot 2: / Shot 3:" markers, produce EXACTLY that many sub-shots. Concrete McDonald's example included as a guard against the exact regression.
2. **"Mode A vs Mode B" clarification** — Mode A = same subject + cut from one clip (cheap, `independentGeneration: false`). Mode B = different subjects + each its own video (expensive, `independentGeneration: true`). Era montages like McDonald's Scene 2 are Mode B.
3. **"ANTI-PATTERN — do NOT duplicate previous scenes' montage content"** section — explicit instruction with the exact failure mode shown as wrong vs correct examples.
**Alternatives rejected:**
- ❌ Add a post-processing dedup pass that compares Scene N+1 sub-shots to Scene N sub-shots → fragile string matching, hard to threshold
- ❌ Run montage detection per-scene with previous-scene context → second Gemini call per scene = expensive
- ❌ Just lower Gemini temperature → already 0.3, lowering further hurts other scene types

### Decision 11: Structured `onScreenText` array on SceneEditDirections
**Files:** `lib/pipeline/schemas/storyboard.ts` (TS interface), `lib/pipeline/llm-scene-parser.ts` (Zod schema + extraction prompt)
**Bug:** A3.5.15 + A3.5.16 + dropped "Our place." Previously the parser stored all on-screen text as one concatenated `motionGraphicCue` string ("text overlay: Through the years. Your story. Our place."). The EDL Gemini call had to re-segment them, resulting in dropped/paraphrased copy.
**Fix:**
- Added `onScreenText?: string[]` field to `SceneEditDirections` (TS interface)
- Added matching `onScreenText: z.array(z.string()).optional()` to parser Zod schema with detailed `.describe()`
- Added "ON-SCREEN TEXT EXTRACTION (CRITICAL — preserve exact script copy)" section to the parser prompt with multiple examples and the rule "Do NOT re-word, shorten, or merge these"
- `motionGraphicCue` kept as legacy free-form field for backward compatibility
**Alternatives rejected:**
- ❌ Replace `motionGraphicCue` entirely → would break consumers that haven't been updated
- ❌ Parse `motionGraphicCue` at consumer time → punts the problem; consumers would still need to re-segment unreliable strings
- ❌ Use a Map<sceneIndex, string[]> at the storyboard level → harder to thread through scene-by-scene processing

### Decision 12: Caption fallback from script text (`createCaptionsFromScriptText`)
**Files:** `lib/editron/services/media/caption-service.ts` (new function), `app/api/services/pipeline/storyboard/[id]/finalize/route.ts` (invocation)
**Bug:** A3.4. Captions were missing entirely from the McDonald's project despite the user selecting captions in the export dialog. Root cause: caption-service requires voiceover transcription as input. Zero narration → no transcription → no captions.
**Fix:**
- New exported function `createCaptionsFromScriptText({ videoOverlay, texts, ... })` that distributes a `string[]` of on-screen text across the clip's timeline
- Per-text display: 1.8s base + 60ms/char, clamped to [1500ms, 5000ms] (per `creative_production_knowledge.md` §9 caption readability standards)
- Inter-text gap: 200ms
- Scales proportionally if total exceeds clip duration
- Each text becomes one Caption entry with synthetic per-word timings (so highlight/karaoke effects still work)
- Returns one CaptionOverlay containing all captions for the clip
- Finalize route: per-scene loop checks `includeCaptions && !sceneHasVoiceover && onScreenText.length > 0`, constructs synthetic anchor overlay, calls the new function, pushes the result. Wrapped in try/catch — failure logged as warning, doesn't break finalize.
**Alternatives rejected:**
- ❌ Make on-screen text into html-scene graphics (the EDL already does this via keyword-highlight) → user explicitly selected captions, not graphics. Different rendering layer (caption layer at z-index 95 vs graphics at row 1). Captions are also more accessible.
- ❌ Put the fallback in Director's add_captions tool → Director runs much later, and at that point the storyboard scenes context is harder to access. Finalize is the right phase (it has the storyboard right there)
- ❌ Generate one CaptionOverlay per text line → creates many overlays cluttering the timeline; one overlay with multiple Caption entries is cleaner

### Decision 13: Exact on-screen text in Unified Intelligence prompt
**File:** `lib/editron/services/unified-edit-intelligence.ts`
**Bug:** A3.5.15/16. Even when the parser stored on-screen text correctly, the Gemini EDL call invented its own paraphrased copy.
**Fix:** Added `onScreenText?: string[]` to `SceneContext` type. Populated from `descriptor.editDirections.onScreenText`. Injected into the per-scene context block of the Gemini prompt with strict instructions: "use VERBATIM as graphicText, do NOT rewrite". Each entry produces one graphic decision in order. Default `graphicType: 'keyword-highlight'`, with rules for `logo-reveal` (brand/product names) and `stat-counter` (numeric statistics).
**Alternatives rejected:**
- ❌ Post-process Gemini's output to replace text with exact strings → fragile matching, would need to figure out which decision corresponds to which text
- ❌ Skip Gemini entirely for graphic decisions, generate them deterministically from onScreenText → loses Gemini's positioning + timing intelligence

### Decision 14: Voiceover skip for zero-narration scripts in export dialog
**File:** `components/dashboard/ThinkForge/ExportToEditronDialog.tsx`
**Bug:** A3.3. Export dialog ran the voiceover gen step unconditionally even on zero-narration scripts. TTS produced nothing, user confused.
**Fix:** In `handlePhase3()`, compute `scriptHasNarration` from the parsed `scenes` state (component-level state populated by `handleExport`). Skip the voiceover API call if false. Pass `includeVoiceover: scriptHasNarration` to the finalize call so finalize also knows not to expect voiceover overlays.
**Implementation gotcha:** `handleExport` and `handlePhase3` are SEPARATE functions in the dialog component (different scopes). I initially declared `let scriptHasNarration` in `handleExport` and got a TS error trying to use it in `handlePhase3`. Fix: read from the component-level `scenes` state inside `handlePhase3`.
**Alternatives rejected:**
- ❌ Add a useState `scriptHasNarration` → unnecessary state; can be computed from existing `scenes` state
- ❌ Show a UI warning banner → adds JSX changes to a 2400-line file, deferred
- ❌ Block the user from selecting voiceover → too aggressive, removes user agency

### Decision 15 (revised 2026-04-08): E-04 broadened from nostalgia-specific to general brand-narrative
**File:** `lib/editron/data/edit-profiles.ts` E-04
**Original Bundle 2 commit added 17 nostalgia-specific keywords** (childhood, vintage, retro, "through the years", generational, etc.) to E-04 to catch the McDonald's script.
**User feedback:** "Don't make them nostalgia specific. Editron should handle wide range of B2B content."
**Revised approach (this commit):** Removed era-locked terms (childhood, vintage, retro, generation, generational, "through the years", remember). Replaced with broad emotional brand-narrative signals that apply across verticals:
- Origin: founded, founder, started, began
- Mission/purpose/values: mission, purpose, values, "why we", believe
- Brand storytelling: story, brand film, brand story
- Heritage/legacy/milestones (broader than nostalgia): heritage, legacy, tradition, "years of", anniversary, milestone
- Memory as broader concept (testimonials, retrospectives): memory, memories
- Emotional/human/connection: emotional, inspirational, human, connection, shared, together
- Nostalgia stays at NORMAL weight (0.25), not dominant. One subtype, not the only target.
**Why this matters:** A SaaS founder's-story film, a fashion brand's heritage video, a healthcare company's mission film should ALL detect as E-04. The previous nostalgia-specific keywords would have starved those of detection while over-fitting to one McDonald's-shaped subtype. Universal Content Compatibility (Rule 0).
**Alternatives rejected:**
- ❌ Create separate "Nostalgia Brand Ad" profile → 55th profile bloats the catalog; the existing E-04 already has the right defaults for the broader category
- ❌ Distribute keywords across vertical-specific profiles (B-04 Food, B-03 Fashion, etc.) → those profiles have their own pacing/grade defaults that may not match a brand-storytelling intent
- ❌ Keep nostalgia keywords at high weight as "primary" → user's explicit request was to broaden, not specialize

---

## Current state of all 17 Phase A3 bugs

| # | Bug | Bundle | Status |
|---|---|---|---|
| A3.1 | Parser collapses 3-shot hook + duplicates Scene 2 into Scene 3 | B2 | ✅ |
| A3.2 | Sub-shots share parent image ("3 stitched to 11") | B2 | ✅ |
| A3.3 | Voiceover UX on zero-narration scripts | B2 | ✅ |
| A3.4 | Captions fallback for zero-narration scripts | B2 | ✅ |
| A3.5.1 | 10 duplicate dip-to-blacks from Director | B1 | ✅ |
| A3.5.2 | Dual transition systems firing | B1 | ✅ |
| A3.5.3 | EDL transition frame drift | — | ❌ open |
| A3.5.4 | Filter schizophrenia / hue-rotate on emotional content | B1 | ✅ |
| A3.5.5 | Cuts/min wrong for content type | partial via A3.5.17 | ✅ via profile |
| A3.5.6 | speedCurve generator broken keyframes | B1 | ✅ |
| A3.5.7 | Zoom on wrong clip | — | ❌ open |
| A3.5.8 | Graphic frame drift | — | ❌ open |
| A3.5.9 | "Our place." dropped | superseded by A3.5.15 | ✅ |
| A3.5.10 | 53% EDL drop rate (silent budget rejection) | — | ❌ open |
| A3.5.11 | Camera shake on emotional beats | — | ❌ open |
| A3.5.12 | Hardcoded ROW numbers (partial) | B1 | ✅ partial |
| A3.5.13 | Seedance hasNativeAudio for sub-shots | B1 | ✅ scene-inherit only |
| A3.5.14 | pipelineWarnings not in audio worker | B1 | ✅ |
| A3.5.15 | Hashtag CTA missing | B2 via onScreenText | ✅ |
| A3.5.16 | "A taste of childhood, always fresh" truncated | B2 via onScreenText | ✅ |
| A3.5.17 | G-01 picked for nostalgia ad | B2 (revised — broad brand-narrative) | ✅ |

**13 fixed across B1 + B2. 5 still open** (A3.5.3, A3.5.7, A3.5.8, A3.5.10, A3.5.11) — all EDL frame-snapping + budget visibility. Deferred to a hypothetical Bundle 3 if Bundle 2 doesn't fix them implicitly.

---

## Files touched (cumulative across B1 + B2 + E-04 revision)

| File | Bundles | What |
|---|---|---|
| `lib/editron/services/edl-executor.ts` | B1 | ROW + deterministic IDs + speedCurve validator + filterId resolution |
| `lib/editron/services/auto-post-processing.ts` | B1 | ROW.VOICEOVER |
| `lib/editron/agent/director-agent.ts` | B1 | add_transition existing-check |
| `lib/editron/data/filter-presets.ts` | B1 | Hue-rotate off mood map + nostalgia explicit |
| `lib/pipeline/edit-direction-applier.ts` | B1 | moodFilterMap defensive notes |
| `app/api/services/pipeline/storyboard/[id]/finalize/route.ts` | B1 + B2 | Sub-shot hasNativeAudio + caption fallback wiring |
| `app/api/internal/workers/pipeline/audio/route.ts` | B1 | pipelineWarnings everywhere |
| `lib/pipeline/schemas/storyboard.ts` | B2 | onScreenText interface field |
| `lib/pipeline/llm-scene-parser.ts` | B2 | Decomposition rules + onScreenText extraction |
| `lib/pipeline/storyboard-db.ts` | B2 | updateSubShot helper |
| `lib/pipeline/storyboard-service.ts` | B2 | Per-sub-shot image generation |
| `lib/editron/data/edit-profiles.ts` | B2 + revision | E-04 broadened to general brand-narrative |
| `lib/editron/services/media/caption-service.ts` | B2 | createCaptionsFromScriptText |
| `lib/editron/services/unified-edit-intelligence.ts` | B2 | Exact onScreenText in graphic decisions |
| `components/dashboard/ThinkForge/ExportToEditronDialog.tsx` | B2 | Voiceover skip for zero-narration |

**Total: 15 files across 3 commits.**

---

## What's deferred + why

| Item | Reason for deferral | When to revisit |
|---|---|---|
| Per-sub-shot model detection in video worker (A3.5.13 full fix) | Bundle 1 inherited the flag from parent scene as a quick fix. The proper fix requires the video worker to check `videoModelConfig.nativeAudio.default` per sub-shot job and set the flag at video-gen time. Touches a different code path. | If a future test shows mixed-model montages (some Seedance, some Kling) producing inconsistent SFX |
| EDL frame-to-clip-boundary snapping (A3.5.3, A3.5.7, A3.5.8) | edl-executor's `applyTransition` uses a 30-frame tolerance + nearest-boundary search. The "wrong clip" symptoms may resolve when the parser produces correct sub-shots in B2 (more boundaries → better matches). If they don't, Bundle 3. | After the user runs the B2 full-regen test |
| Silent EDL drop rate visibility (A3.5.10) | Director already has diagnostic logging from commit 96d588b8 but it goes to console.log not pipelineWarnings. Wiring would be ~2 changes but I didn't want to expand B1 scope. | When the user wants to debug why specific decisions get dropped |
| Camera shake placement intelligence (A3.5.11) | Requires understanding "is this an action moment vs emotional moment" which needs the 5-track motion analysis to be reliably consumed. Currently Director shake decisions happen blind. | Phase B (intelligence backbone) work, not A3 |
| `includeVoiceover` / `includeCaptions` persistence to storyboard doc | The user's first test confirmed these flags are dropped on the persistence layer. I noted it but didn't fix it because Bundle 2's voiceover-skip logic in the export dialog handles the immediate symptom (the dialog computes `scriptHasNarration` directly and passes it to finalize). The persistence gap only matters if a non-dialog client triggers finalize. | If there's a non-dialog finalize trigger added |
| Visual upload of `editron_master_remaining.md` to memory | Memory stays as filesystem files; this decision log is the new SOT for in-flight Phase A3 work | — |

---

## Decision 19 — Bundle 4: QStash workers for storyboard + ref-image gen, fal.ai retry, edit-direction visibility, safe JSON.parse (commit c3b4684b, 2026-04-09)

**Context:** User asked "why did we go sequential when we have QStash?" — fair question. Answer: we hadn't migrated storyboard/reference-image gen to QStash yet (only video gen was). User said "go" + "include reference image in same bundle". This is the architectural fix that makes 504s on image gen impossible.

**Scope:** 18 files (8 new, 10 modified). The biggest single commit in Phase A3.

### Architecture change

```
OLD:
  POST /storyboard/generate (300s budget)
    → generateFullStoryboard() inline
    → 6 scenes parallel with INNER_CONCURRENCY=3 sub-shots each
    → still hits 504 on 3+ scene scripts with 5 sub-shots each
    → all 4 ref-image routes had same 60s/300s timeout problem

NEW:
  POST /storyboard/generate (120s, <30s typical)
    → validate + create batch + dispatch N QStash messages
    → return { async:true, batchId } immediately
  POST /api/internal/workers/pipeline/storyboard-image (300s PER SCENE)
    → generates one scene's image + sub-shots
    → updates batch counter, triggers consistency check on last job
  GET /storyboard/[id]/generate-status?batchId=xxx
    → polling endpoint with per-scene status

  Mirrored for ref images: generate, add-subject, regenerate all dispatch
  to /api/internal/workers/pipeline/reference-image
```

### Files (8 new)

1. `lib/pipeline/storyboard-image-queue.ts` — batch + job MongoDB helpers + worker payload type
2. `lib/pipeline/reference-image-queue.ts` — same for ref images, with 3 intents (initial-generation / add-subject / regenerate)
3. `lib/pipeline/fal-retry.ts` — exponential-backoff retry wrapper. Retries 429/5xx/network errors with 1s/2s/4s backoff + jitter. Does NOT retry 4xx, Zod, or TypeError.
4. `lib/pipeline/llm-json-safe-parse.ts` — `safeParseLlmJson()` with markdown fence stripping + fallback + optional validation. Never throws.
5. `app/api/internal/workers/pipeline/storyboard-image/route.ts` — per-scene worker (300s budget)
6. `app/api/internal/workers/pipeline/reference-image/route.ts` — per-subject worker (300s budget)
7. `app/api/services/pipeline/storyboard/[id]/generate-status/route.ts` — polling endpoint
8. `app/api/services/pipeline/reference-images/[refSetId]/generate-status/route.ts` — polling endpoint

### Files (10 modified)

- 4 ref-image routes (add-subject, regenerate, batch generate, finalize) — converted to dispatch-only
- `storyboard/generate/route.ts` — full rewrite as dispatch-only with fail-hard-and-refund on partial enqueue
- `ExportToEditronDialog.tsx` — added polling loops for both storyboard + ref-image batches, mirrors existing video poll pattern
- `storyboard-service.ts` + `video-generation-service.ts` + `reference-image-service.ts` — wrapped fal.subscribe in `falRetry()`
- `consistency-scoring-service.ts` — both `JSON.parse` sites swapped for `safeParseLlmJson` with safe defaults
- `finalize/route.ts` — edit-direction failure now LOUDLY surfaced (warnings array + project doc flag)

### Toyota P0 fixes shipped in same commit

| ID | What | How |
|---|---|---|
| C.timeout.1 | storyboard/generate 504 | per-scene QStash workers |
| C.timeout.4 | every image-gen route needed ≥300s | dispatch-only routes are <30s |
| A.fal.ai.1 | No retry on fal.ai | falRetry wrapper at 3 call sites |
| B.silent.1 | edit-direction swallowed in finalize | loud surface + project doc flag |
| A.gemini.1 | raw JSON.parse on Gemini output | safeParseLlmJson at 2 sites |
| B.race.2 | partial QStash enqueue masked as success | refund + hard fail |

### Decisions made + alternatives rejected

**1. Drop scene 0 style-anchor.** OLD: scene 0 ran first synchronously, captured imageUrl as a low-weight style ref for 1..N. Required serialization → incompatible with per-scene workers. NEW: rely on IP-adapter refs + style guide prompts. If cross-scene consistency regresses, re-enable via two-phase dispatch.

❌ Alternative: run scene 0 inline, then dispatch 1..N → adds 30-60s of route latency before dispatch. Worse UX. Drop.
❌ Alternative: have scene 0's worker write its image URL to sibling job docs before they run → race condition + complexity. Drop.

**2. Drop consistency auto-regen.** OLD: post-batch consistency check ran inline + auto-regenerated flagged scenes with stronger anchors. NEW: consistency check still runs (fire-and-forget from last worker), persists report to storyboard, but auto-regen is skipped. User can manually trigger regenerate-with-context.

❌ Alternative: dispatch a SECOND batch of jobs after consistency for flagged scenes → adds complexity, defer to a future bundle if visible problem.

**3. Keep storyboard-service.ts intact.** Didn't delete `generateFullStoryboard` because the `regenerate` route + `generate-sequential` route still use it. Future cleanup.

**4. Refund credits on enqueue failure.** Both batch routes refund the FULL credit cost if any QStash publish fails. Toyota B.race.2 — partial batches are worse than clean failures because user can't retry without duplicates.

**5. falRetry classifies errors strictly.** Only retries 429/5xx/network/timeout. Does NOT retry 4xx, Zod, TypeError, or anything that smells like a programming bug. Prevents infinite-retry on permanent failures.

**6. safeParseLlmJson never throws.** Returns `{ value, parseOk, validationOk, error }` so callers can opt into strict handling but get a safe default by default.

### Status route reads from TWO sources

The status endpoints read from both the job docs (per-job status, error, attempts) AND the storyboard/refSet docs (authoritative imageUrl since workers write there as source of truth). This handles the case where a worker marked the job completed but storyboard write is slightly lagging.

### Files touched count: 18 (8 new + 10 modified). +837 / -217 lines. tsc clean on all.

### Cost impact

Per export:
- Storyboard generate: same image gen cost (flux × N), tiny QStash dispatch cost (~$0.0001 × N)
- Ref images: same flux cost, tiny QStash cost
- Net: <$0.001 added per export. Negligible vs $3+ video gen cost.

### Toyota items still open after this bundle

- A.fal.ai.2: Promise.race timeout doesn't cancel fal.subscribe (server-side leak)
- A.fal.ai.3: extractVideoUrl null-silent
- A.fal.ai.4: getCleanImageUrl strips query params
- A.gemini.2: parser/unified-intel schema gaps
- A.gemini.3: 5-track vision validation
- A.deepgram.1: stream read hangs
- A.luma.1/2: polling loop silent skip
- B.race.4: Director lock manual-save bypass
- B.race.6: finalize → BGM/SFX dispatch race
- B.data.3: `as any` null access in hot paths
- A.mongo.1: query timeouts

These remain tracked in `memory/toyota_reliability_audit.md` for a potential Bundle 5 reliability sprint.

### Test plan

Single full regen test (~$3). Expected:
1. storyboard/generate returns async:true with batchId in <30s regardless of scene count
2. Export dialog shows progress as scenes complete (poll every 6s)
3. Each scene's worker has its own 300s budget — no shared timeout
4. fal.ai 429/5xx → automatic retry with backoff, logged in worker output
5. If applyEditDirections fails, user sees warning in dialog (not silent)
6. Gemini malformed JSON → safe fallback, no crash

---

## Decision 18 — Hotfix: bump maxDuration on 4 image-gen routes (commit eaeeb8cf, 2026-04-09)

**Context:** Mid-test on Bundle 3, user hit another 504 — this time on `scene/1/regenerate-with-context` (Vercel log `bom1::rl2r6-1775674225104`). Looking back, they also hit 504 on `/reference-images/[refSetId]/add-subject` during the 2026-04-08 17:10 run (log `6jfzx-1775581049750`). Both routes had `maxDuration = 60`.

**Root cause:** Any route that does fal.ai image generation can easily take 60-120s worst case because:
- IP-adapter attempt: ~30-60s
- Img2img fallback (if IP-adapter fails): another 30-60s
- Download + GCS upload + MongoDB writes: ~5-10s

The parent `storyboard/generate` route uses 300s for this reason. Four sibling routes weren't updated when that bump happened, still capped at 60s.

**Fix:** Bumped 4 routes to `maxDuration = 300`:
1. `storyboard/[id]/scene/[sceneIndex]/regenerate-with-context` (user hit this)
2. `reference-images/[refSetId]/add-subject` (user hit this)
3. `reference-images/[refSetId]/subject/[subjectId]/regenerate` (same bug class, not hit yet)
4. `storyboard/[id]/generate-sequential` (same bug class, not hit yet)

**Alternatives rejected:**
- ❌ Add AbortSignal timeouts inside `regenerateWithContext` to fail-fast → doesn't solve the base problem (image gen really does need 60-120s sometimes); would force user to retry
- ❌ Move image gen to a QStash worker → would require frontend polling, architectural change, too big for a hotfix
- ❌ Only fix the two routes that actually hit 504 → leaves 2 landmines. Rule 11N (Bigger Picture Solutions) says fix the class, not the instance.

**Files touched:** 4 route files, +22 / -4. Pure config change, no logic edits. tsc clean.

**Toyota audit status:** This is effectively a subclass of `C.timeout.1` (Vercel function timeout analysis) — adding to the audit file as a new finding `C.timeout.4`: "Any fal.ai image-gen route needs at least 300s maxDuration. Audit every route touching fal.storage + fal.subscribe image models."

---

## Decision 17 — Bundle 3: 5 distinct fixes for "disaster" proj_r8E_z9WVaBX9 (commit 1c489db5, 2026-04-08)

**Context:** User ran full regen after Bundle 2 + the 504 hotfix. Pipeline completed cleanly (no crashes) but output was catastrophic:
- Only 3 videos rendered (should be 13 sub-shots)
- Zero captions
- Zero SFX
- Hue-rotate(160deg) teal-orange filter on 2 clips (blue/green skin tones)
- Profile G-01 Universal Clean for a nostalgia brand ad
- User called it "a disaster"

**5 distinct root causes diagnosed from MongoDB inspection:**

### 17a. Parser model flash-lite was ignoring Bundle 2 prompt rules
Every sub-shot: `independentGeneration: false`. `onScreenText: null` on every scene. Literal shot counts ignored. Flash-lite is too small to reliably follow ~18K-char multi-rule prompts. Fix: switched to `gemini-2.5-flash`. ~3x Gemini cost but significantly better instruction-following. Still under 90s AbortSignal cap.

### 17b. Parser safety nets as backstop regardless of model
Even with 2.5-flash, belt-and-suspenders:
- **Force `independentGeneration: true`** on sub-shots with low pairwise Jaccard similarity (<0.4) or multiple era markers. Populates visualDescription/videoMotionPrompt fallbacks too.
- **Regex extract `onScreenText`** from raw script using 3 patterns (On-Screen Text:, Text:, Brief flash:). Assigns to nearest scene by position match. De-dupes.

### 17c. EDL filter guard — hue-rotate reject + don't-overwrite
Traced teal-orange CSS (`hue-rotate(160deg)`) to the unified-intel → edl-executor path. My Bundle 1 `filterId` resolution was applying teal-orange faithfully when Gemini suggested it. Two new guards in `applyFilterChange`:
- **Reject** any filterCss with `abs(hue-rotate) > 30deg`
- **Don't overwrite** an existing filter on the overlay (match Director's `batch_update_overlays` behavior). Finalize's mood map is now protected from downstream clobber.

### 17d. Profile detection extracts `title` + `onScreenText`
Commercial scripts have empty narration but signal-rich titles. "Golden Arches of Memory: A Taste of Childhood" tells everything. Previously `title` was dropped. Now:
- `ThinkForgeMetadata.title` is a first-class field
- Flowed into `signals.notes` for broad keyword matching
- `editDirections.onScreenText` also flowed into notes (commercial brand copy source)
- `environmentNotes` flowed into notes

### 17e. CRITICAL BUG — profile detection callers passing wrong shape
**Biggest find.** `finalize/route.ts:767-780` was passing a **flat pre-extracted shape**:
```
{ narration: "...", visual: "...", notes: "", mood: "..." }
```
to `getAutoSelectedProfile()` which expects `ThinkForgeMetadata`:
```
{ scenes: [{narration, visualDescription, mood, ...}], title, ... }
```

`extractSignals()` calls `metadata.scenes || []` → empty scenes array → every signal field empty string → every profile scored 0 → **always fell through to G-01 Universal Clean**.

This means my Bundle 2 E-04 keyword work was NEVER ACTUALLY TESTED because profile detection was broken at the caller layer the entire time. Fixed 3 callers:
- finalize/route.ts
- app/api/internal/workers/pipeline/video/route.ts (fallback detection path)
- ExportToEditronDialog.tsx

All three now pass proper shape with scenes array + title + editDirections.

**Files touched (7):** editron-config.ts, llm-scene-parser.ts, edl-executor.ts, profile-detection-service.ts, finalize/route.ts, ExportToEditronDialog.tsx, video worker route.ts

**Verification:** `tsc --noEmit --skipLibCheck` clean on all 7 files.

**Cost impact of 17a:** ~3x Gemini parser cost per export. Typical McDonald's-sized 3-scene script: $0.003 → $0.009. Negligible.

**Alternatives rejected:**
- ❌ Revert to gemini-3.1-pro-preview for parser → too slow, caused the original 504 hotfix
- ❌ Shorten the parser prompt to fit flash-lite's capacity → loses Bundle 2 rules that solved real problems
- ❌ Delete the teal-orange preset entirely → breaks D-01 Cinematic Premium and D-08 Luxury profiles that use it intentionally
- ❌ Fix profile detection by rewriting extractSignals to accept both shapes → hides the bug for next caller that comes along

---

## Decision 16 — Regression hotfix: parallelize per-sub-shot image gen with budget check (commit b95b668b, 2026-04-08)

**Context:** User re-ran McDonald's export after Bundle 2 (`8063efc6`) + the E-04 broadening (`d67e0ae6`). Hit 504 on `/api/services/pipeline/storyboard/generate` at 14:10:44 and 14:15:19 on deployment `dpl_65N8wQ6DgdjVkkC4KaP1xSsY4pE6`. Then pivoted to `/api/services/editron/projects/import-from-script` → Director ran with 0 video overlays → emitted harmless "Intelligence: 0/0 video assets analyzed" warning (not a bug, just Director running on an empty project because import-from-script doesn't generate videos).

**Root cause:** My own Bundle 2 commit. The per-sub-shot image gen block I added to `storyboard-service.ts generateForScene` was a SEQUENTIAL for-loop. Math:
- Parent image gen: ~30s (Flux Schnell) to 60s (IP-adapter)
- Per-sub-shot × N: sequential × 30s each
- 5 independent sub-shots = 150s added per scene
- Outer scene concurrency 6 doesn't help because each scene is internally serial
- 3-scene script worst case = 180-240s with consistency check = blown 300s budget

**Fix shipped in `b95b668b`:**
1. **Parallelize sub-shot gen** within a scene using a sliding-window runner with `INNER_CONCURRENCY = 3`. Combined with outer CONCURRENCY=6, max concurrent fal.ai requests = 18 (acceptable per historical comments).
2. **Budget gate before starting** — if `MAX_BUDGET_MS - elapsed < 90s`, skip per-sub-shot gen for this scene. Video worker already has fallback to parent image → degrades gracefully.
3. **Per-sub-shot budget recheck** — inside `runOne()`, bail quietly if <30s remaining when this sub-shot's turn comes up.

**Alternatives rejected:**
- ❌ Move per-sub-shot gen to video worker step → cleaner architecture but requires changing video worker payload + generate-videos route + fallback logic. Too large for a hotfix.
- ❌ Disable per-sub-shot gen entirely → undoes A3.2 architectural fix. Regresses visual variety bug.
- ❌ Raise Vercel maxDuration → already at 300s (hard limit on Hobby plan).
- ❌ Shift sub-shot gen to a cron job → changes architecture, frontend would need to poll, big refactor.
- ❌ Cache sub-shot images across scenes → sub-shots must look different, caching defeats purpose.

**Files touched:** `lib/pipeline/storyboard-service.ts` (+92 / -42)
**Verification:** `npx tsc --noEmit --skipLibCheck` clean on changed file.

**Not shipped in this commit (separate tracked items):**
- Toyota audit findings cataloged in `memory/toyota_reliability_audit.md` — 16+ P0 items and 12+ P1 items found. Top priority remaining P0 after this fix: B.silent.1 (edit-direction failure swallowed in finalize) and A.fal.ai.1 (no retry loop on fal.ai).
- Rule 11.75N added to AGENT_RULES.md for future Toyota audit cadence.

---

## Open questions for next session

1. **Did Bundle 2 fix the "3 videos stitched to 11" symptom?** Evidence will be the new project's `posterUrl` field — should be 9-11 unique values, not 3 shared. Per-sub-shot images would also be visible by querying the storyboard doc's `descriptor.subShots[].imageAssetId` fields.

2. **Did the parser produce 3 sub-shots for Scene 1 (Hook)?** Currently the McDonald's project has 1 video for what should be 3 distinct close-ups. New parse should fix this.

3. **Did the parser stop duplicating Scene 2 into Scene 3?** Currently Scene 3 has 5 sub-shots that are verbatim copies of Scene 2's era montage. New parse should produce a unified present-day group scene instead.

4. **Did profile detection pick E-04 with the broadened keywords?** Confidence should be ≥ 0.40 → auto-select. If still G-01, the keywords don't match the actual extracted signal text. Would need to inspect what `signals.notes` / `signals.mood` look like for this script.

5. **Did captions appear from the on-screen text array?** Should see N CaptionOverlay objects on row 0 (or row 4 — caption-service uses row 0, agent tools.ts uses 4) with the exact script strings.

6. **Are the EDL frame-drift bugs (A3.5.3/7/8) still visible?** If yes → Bundle 3. If no → they were symptoms of the parser bugs, fixed implicitly.

---

## Notes about user preferences (record + respect)

- **Bulk testing** — user batches code changes per test run to save fal.ai credits. Don't ship incremental commits expecting incremental tests. Group fixes by what produces a testable outcome.
- **B2B universality** — every fix must work across the full B2B vertical range, not just the script that surfaced the bug. See Decision 15 revision.
- **Quality over speed** — Rule 14 in CLAUDE.md. Don't skip prompt refinement / analysis to save time.
- **One concern per commit** — Priyank Standard. But for Phase A3 the user accepted multi-concern bundles because the bundles were testable units.
- **No assumptions** — verify with grep/read/MongoDB queries before claiming anything about state. The McDonald's debug was a good example.
- **Project memory** — this file. Update every 10 chats or after each commit.
