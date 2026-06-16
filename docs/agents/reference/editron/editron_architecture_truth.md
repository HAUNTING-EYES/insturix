---
name: Editron Architecture — Single Source of Truth
description: ALWAYS READ AND UPDATE THIS. Complete system state, vision, rules, what works, what's broken.
type: project
---

# Editron Architecture — Single Source of Truth
**Last updated: 2026-04-02 (Session: Full deep dive + strategy pivot)**

## ⚠️ RULE: Always read this file before making changes. Always update it after.

---

## NIMIT'S VISION (Updated 2026-04-02)

Editron = Adobe-level video editor with AI. Mac of video editing (powerful, not overwhelming).

### Target Market: Businesses & Agencies ONLY
- Product ads, brand ads, website ads, UGC content
- NOT consumer/creator tools — enterprise-grade quality
- Videos don't need extreme complexity — clean, professional, on-brand

### Mode 1: Script → AI Video (current priority)
- Script from ThinkForge → storyboard → AI videos → full post-production → finished video
- 4-5 second AI video clips sequenced together (or longer as needed)
- System MUST understand what's in each clip before making edit decisions
- Captions, transitions, keyframes, motion graphics, VFX all still needed

### Mode 2: Pre-shot (Post-Production) — FUTURE
### Mode 3: Hybrid — FUTURE

### Key Principles
- **NO stock video as default.** Users can search stock manually but pipeline doesn't auto-insert.
  (Businesses pay for quality AI clips, stock is a gamble for brand content)
- Ken Burns is ABSOLUTE LAST RESORT
- Script duration is king
- System must understand each asset AND overall video/script/intent
- Must work for ANY business content type (Rule 0)
- Content awareness is CRITICAL — understand every ~10 frames

---

## STRATEGIC CHANGES (2026-04-02)
1. Stock video REMOVED from default pipeline (keep as manual user option in editor)
2. Focus on AI video quality over quantity — fewer clips, better clips
3. Content-aware editing is the #1 priority — system must WATCH what it made
4. Beat-synced assembly needed — music should inform editing, not be added after
5. Post-assembly review loop needed — compare EDL intent vs actual result

---

## ROW LAYOUT (CANONICAL — scene-to-editron.ts)

| Row | Purpose | Z-Index (100-row*10) |
|-----|---------|---------------------|
| 0 | SFX | 100 (top) |
| 1 | BGM | 90 |
| 2 | VIDEO | 80 |
| 3 | VOICEOVER | 70 |
| 4 | CAPTIONS | 60 |
| 5 | TRANSITIONS | 50 |
| 6 | MOTION_GRAPHICS | 40 |

### EXCEPTIONS (intentional divergence):
- **Captions** placed at row 0 (not 4) by add_captions tool for z-index visibility above video
- **Transitions** placed at row 1 (not 5) by transition-templates.ts for z-index above video
- **Graphics** (keyword-highlight, logo-reveal) placed at row 1 by edl-executor for z-index

---

## PIPELINE FLOW (Script → Video)

```
ThinkForge Script
       ↓
1. LLM Scene Parser (Gemini 2.5 Flash)
   → scenes[] with: narration, visualDescription, editDirections,
     subShots, sceneType, assetRecommendation, mood
       ↓
2. Storyboard Service (fal.ai image gen)
   → reference images per scene
       ↓
3. Video Generation (fal.ai: Kling/Wan/LTX/Veo/Luma/MiniMax)
   → AI video clips per scene (async via QStash)
       ↓
4. TTS (Kokoro primary, Deepgram fallback)
   → voiceover audio per scene
       ↓
5. Finalize (scene-to-editron + edit-direction-applier)
   → Editron project with all overlays
   → Duration priority: script > voiceover > video > 5s default
   → Sub-shots use targetDurationSeconds (min 1.5s, max 3s)
   → Smart clip selection via selectBestSegment()
   → Dispatches BGM + SFX workers via QStash
       ↓
6. Director Agent (13-step deterministic executor)
   → 5-Track analysis per video asset (Gemini Vision)
   → Unified Intelligence Engine (single Gemini call, full context)
   → EDL decisions applied (zooms, transitions, graphics, speed, shake)
   → Zoom validation against motion peaks
   → Auto post-processing (drift-zoom, freeze-frame, screen zones)
   → Profile-based actions: filter, transitions, captions, ducking, quality review
   → Auto-injects captions if user selected a style but profile lacks caption action
       ↓
7. Remotion Lambda Render → Final MP4
```

---

## WHAT WORKS (verified 2026-04-02)

| Feature | Status | Notes |
|---------|--------|-------|
| Script parsing (8 formats) | ✅ | Gemini 2.5 Flash, montage detection, sub-shots |
| Storyboard image gen | ✅ | 10+ models, IP-adapter consistency |
| Video generation | ✅ | 7 models, async QStash, sub-shot individual gen |
| Voiceover TTS | ✅ | Kokoro→Deepgram fallback chain |
| BGM generation | ⚠️ | CassetteAI via fal.ai (depends on credits) |
| SFX generation | ⚠️ | 3-tier: Freesound→mirelo→CassetteAI (depends on fal.ai credits) |
| Finalize assembly | ✅ | Script duration priority, sub-shot targeting, smart clip selection |
| Edit direction applier | ✅ | Filters, transitions, pacing, clip-overlap transitions |
| 5-Track analysis | ✅ | Gemini Vision per asset, cached in MongoDB |
| Unified Intelligence | ✅ | Single Gemini call, produces 25-60 decisions |
| EDL executor | ✅ | Zoom type branching, motion peak validation |
| Decision budget | ✅ | Profile-configurable limits |
| Auto post-processing | ✅ | Drift-zoom, freeze-frame, screen zones |
| Director Agent | ✅ | 13-step, auto profile detection, storyboardScenes fixed |
| storyboardScenes scope | ✅ | FIXED (6d3286a1) — was block-scoped, now function-scoped |
| Filter application | ✅ | FIXED — blade-runner filter applied successfully |
| Quality review | ✅ | FIXED — score=89/100, suggestions working |
| Caption auto-inject | ✅ | FIXED (6c0ee11e) — respects user's export dialog choice |
| Captions service | ✅ | 9 styles, word-level timing, synthetic timings with stored audioDurationMs |
| Transitions | ⚠️ | TWO systems: clip-overlap (correct) + HTML overlay (misaligned) |
| Keyframe animation | ✅ | scale, x, y, opacity, rotation, speed |
| AI Chat (36 tools) | ✅ | Natural language editing |
| R2 CDN storage | ✅ | Primary, permanent URLs |
| Render pipeline | ✅ | Remotion Lambda, chapter-based for long videos |
| Smart clip selection | ✅ | selectBestSegment() content-type aware |
| Zoom type branching | ✅ | punch-in (hold), slow-push (gradual), pull-back |
| Zoom validation | ✅ | Rejects zooms not near motion peaks |

---

## WHAT'S BROKEN / NEEDS FIXING

| Issue | Severity | Root Cause | Status |
|-------|----------|-----------|--------|
| Captions: user must select style | HIGH | Profile B-07 etc have captionStyle:'none' — if user picks "Auto" on these profiles, no captions | User must pick a style in export dialog; auto-inject respects choice |
| Transition misalignment | HIGH | EDL places transitions at decision.frame but actual clip boundaries differ | Needs fix: anchor transitions to clip boundaries, not EDL frame |
| fal.ai BGM/SFX failures | HIGH | API credits/rate limits | External — depends on fal.ai account balance |
| Content-aware SFX | HIGH | SFX based on script text, not actual video content | NOT BUILT — needs video-frame analysis before SFX assignment |
| Post-assembly review loop | HIGH | Pipeline is one-shot, no feedback loop | NOT BUILT |
| Beat-synced assembly | MEDIUM | BGM generates AFTER finalize, so cuts can't sync to beats | Architecture backwards — music should inform editing |
| Sub-shot src="" | MEDIUM | Some sub-shot video overlays have `src: ""` (empty string) | Asset resolver fails for some sub-shot videoAssetIds |

---

## DEAD CODE / CLEANUP

| Item | Location | Status |
|------|----------|--------|
| visualInspectFrame tool | tools.ts line 5390 | DEAD — disabled/decoy, never registered |
| useCachedAsset hook | hooks/use-cached-asset.ts | DEAD — exported, never imported |
| stock-video-service.ts | lib/pipeline/ | POTENTIALLY DEAD — superseded by pixabay-service inline logic |
| auto-edit-service.ts | lib/editron/services/ | DEAD — never imported |
| content-graphic-map.ts | Referenced in old docs | DOES NOT EXIST — Phase B4 claim was false |

---

## TRANSITION SYSTEM (TWO PATHS — needs unification)

### Path A: Clip-Overlap (Production — correct)
- Used by: edit-direction-applier.ts, add_transition tool
- Extends outgoing clip + starts incoming clip early → they overlap
- Keyframe tracks on both clips control the blend
- No separate overlay object
- ✅ Visually correct: true cross-fade/wipe between clips

### Path B: HTML Overlay (EDL/Director — misaligned)
- Used by: buildTransitionOverlay() in transition-templates.ts, EDL executor
- Creates separate overlay on row 1 with CSS animations
- Placement: `decision.frame - floor(duration/2)` — centered on EDL frame
- ❌ Problem: EDL frame ≠ actual clip boundary → transition visual doesn't align with cut

### Fix needed: EDL executor's applyTransition should anchor to actual clip boundaries

---

## CAPTION CHAIN (fully traced 2026-04-02)

1. User picks style in ExportToEditronDialog → "" means "Auto from profile"
2. "" is falsy → `brief.overrides.captionStyle` = undefined
3. `applyBriefOverrides`: undefined ?? profile.captionStyle → uses profile default
4. Auto-inject: only adds captions if resolvedCaptionStyle !== 'none'
5. If injected → add_captions tool → finds voiceover (row 3, time overlap) → gets transcription
6. Transcription: getNarrationTextForAsset() → storyboard DB lookup by audioAssetId
7. Synthetic timings: uses stored audioDurationMs (accurate) or words*400ms (estimate)
8. Caption overlay created with word-level timing at row 0

### Key: If user leaves "Auto" on a profile with captionStyle:'none', NO captions. User must explicitly pick a style.

---

## PHASE STATUS (updated 2026-04-02)

| Phase | Status | What it covers |
|-------|--------|---------------|
| Phase 0-4: Pipeline + Intelligence | ✅ WORKING | Script→video, 5-Track, profiles, transitions |
| Phase A: Stability | ✅ DONE | UI fixes, keyframe editor, L-cut handles |
| Phase B: Intelligence Backbone | ✅ DONE | 5-Track, Unified Intel, EDL, post-processing |
| Phase C: Asset-Centric | 🟡 PARTIAL | Smart clip selection DONE. Stock pipeline DEPRECATED (strategy pivot). Semantic search NOT done |
| Phase D Infra | ✅ CODE COMPLETE | R2 CDN, Redis queue, Lambda render, health checks |
| Phase D Pro | ❌ NOT STARTED | Color grading, audio FX, tracking, masking |
| Phase E Scale | ❌ NOT STARTED | 3hr video, multi-platform, batch, collaboration |

---

## WHAT'S LEFT (Priority Order, updated 2026-04-02)

### Tier 0: Make Current Output Professional
1. **Fix transition alignment** — anchor to clip boundaries, not EDL decision frames
2. **Ensure captions generate** — test with explicit style selection in export dialog
3. **Fix sub-shot src="" issue** — some video asset IDs not found in media_assets DB
4. **fal.ai BGM/SFX** — keep credits topped up

### Tier 1: Content Awareness (THE BIG ONE)
5. **Content-aware SFX** — analyze video frame content before assigning SFX
6. **Post-assembly review loop** — after Director, check: gaps? SFX match video? Zooms on dead frames?
7. **Deep frame analysis** — understand every ~10 frames of each clip (extend 5-Track)
8. **SFX-to-video validation** — compare SFX cue against actual video content

### Tier 2: Architecture Improvements
9. **Beat-synced assembly** — generate BGM BEFORE finalize, use beats to inform cut placement
10. **Music-understanding editing** — not just beat sync but mood/section awareness
11. **Remove stock video from default pipeline** — keep as manual user option in editor

### Tier 3: Phase D Pro (DaVinci-level tools)
12. Color grading (Lift/Gamma/Gain, HSL, LUT, scopes) — 24h
13. Audio FX (EQ, compression, reverb, de-esser) — 20h
14. Subject tracking + motion-locked overlays — 6 weeks
15. Masking (shape, PiP, isolation) — 16h
16. Style transfer UI — 12h

### Tier 4: Phase E Scale
17. 3hr video support
18. Multi-platform auto-reformat
19. Batch project processing
20. Team collaboration

---

## RULES (from Nimit — non-negotiable)

### Rule 0: Universal Content Compatibility
Must work for: product ads, brand ads, website ads, UGC, tutorials, talking heads, any business content.

### Rule 1: Post-Phase Verification
After EVERY phase, verify nothing is broken/unwired/placeholder/conflicting.

### Rule 2: No Fallbacks as Solutions
Fix root cause. Fallbacks mask problems.

### Rule 3: Adversarial Testing
Find every way it can fail before declaring done.

### Rule 4: Never Delete Env Vars
NEVER run `vercel env rm` without explicit user permission.

### Rule 5: "Preview" = Vercel Preview
Not local dev server.

### Rule 6: Deep Dive Before Fixing
Understand the entire system before touching code. Read every file, every line.

### Rule 7: Ken Burns = Last Resort
Animated stills (Ken Burns zoom on image) is ABSOLUTE LAST RESORT.

### Rule 8: Script Duration is King
If the script says 4s, show 4s. Don't stretch to video clip length.

### Rule 9: Understand Assets
System should understand each asset and overall video/script/intent.

### Rule 10: No Assumptions
Check the actual data, code, and user choices. Never assume behavior.

### Rule 11: Code Quality Standards (Priyank Standard)
- **One concern per commit.** Don't mix features + bug fixes + optimizations.
- **Comment old vs new pattern** when changing an approach, with rationale.
- **Don't touch business logic when optimizing.** Perf fixes are separate from feature changes.
- **Use proper types, not `as any`.** If a type is missing, add it to the interface first.
- **Test in isolation before committing.** Verify the single change works before moving on.
- **No experimentation in production code.** If unsure, test in debug panel first.

---

## KEY FILES QUICK REFERENCE

| What | File |
|------|------|
| ROW constants (CANONICAL) | `lib/pipeline/scene-to-editron.ts` |
| Scene parser | `lib/pipeline/llm-scene-parser.ts` |
| Finalize (timeline assembly) | `app/api/services/pipeline/storyboard/[id]/finalize/route.ts` |
| Director Agent | `lib/editron/agent/director-agent.ts` |
| AI Chat Tools (36) | `lib/editron/agent/tools.ts` |
| Unified Intelligence | `lib/editron/services/unified-edit-intelligence.ts` |
| EDL Executor | `lib/editron/services/edl-executor.ts` |
| 5-Track Analysis | `lib/editron/services/five-track-analysis.ts` |
| Decision Budget | `lib/editron/services/decision-budget.ts` |
| Auto Post-Processing | `lib/editron/services/auto-post-processing.ts` |
| Quality Review | `lib/editron/services/quality-review-service.ts` |
| Edit Direction Applier | `lib/pipeline/edit-direction-applier.ts` |
| Transition System | `lib/editron/data/transition-system.ts` |
| Transition Templates | `lib/editron/data/transition-templates.ts` |
| Edit Profiles (54) | `lib/editron/data/edit-profiles.ts` |
| Caption Service | `lib/editron/services/media/caption-service.ts` |
| Transcription Service | `lib/editron/services/media/transcription-service.ts` |
| Export Dialog | `components/dashboard/ThinkForge/ExportToEditronDialog.tsx` |
| Video Worker | `app/api/internal/workers/pipeline/video/route.ts` |
| Audio Worker | `app/api/internal/workers/pipeline/audio/route.ts` |
| Director KB | `DIRECTOR_KNOWLEDGE_BASE.md` (repo root) |

---

## COMMITS THIS SESSION (2026-04-02)

| Commit | Description |
|--------|-------------|
| e059bc76 | Fix timeline gaps, zoom bounce, sub-shot bounds + smart clip selection + zoom validation |
| 6d3286a1 | CRITICAL: Fix storyboardScenes block-scoping bug — captions, filters, transitions, quality review ALL broken |
| c7474797 | Auto-inject captions when profile omits (wrong — assumed instead of checking) |
| 6c0ee11e | Fix caption injection to respect user's export dialog choice |
| efe24216 | Fix sub-shot duration cap: apply to ALL sub-shots not just sceneType=montage |
