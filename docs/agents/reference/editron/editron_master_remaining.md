---
name: Editron Master Remaining — Complete Status
description: COMPLETE inventory of bugs, issues, missing features, and build status. Updated 2026-04-08.
type: project
originSessionId: 6b272c7c-4888-4c9b-8caf-d84e6c03234f
---
# Editron — Complete Status Report (2026-04-08)

**READ ALSO:** `editron_architecture_truth.md` for system state, ROW layout, rules, vision.
**READ ALSO:** `creative_production_knowledge.md` — MANDATORY for any edit/creative decision.

---

## 🚨 PHASE A3 — TOP PRIORITY (added 2026-04-08)

### Context
First real end-to-end test with the parser-timeout hotfix (commit d3d295d0) landed. Script: "Golden Arches of Memory: A Taste of Childhood" — McDonald's 30s nostalgia reel, 3 scenes, 11 shots, ZERO narration (pure visual commercial with music + on-screen text). Generated project: `proj_QXaC7iOTQi4g`, storyboard `sb_3_8IjK8_rIOC`. Used Seedance 1.5, profile `G-01` (default style-blend), preview DB. Output quality: **disastrous**. Detailed inventory below.

### A3.1 — PARSER: sub-shot decomposition wrong in 2 of 3 scenes 🔴 ARCHITECTURAL

**Script actual structure:**
- Scene 1 "Hook" (0-5s): **3 shots** — Happy Meal toy closeup, steaming fries, retro sign
- Scene 2 "Journey" (5-20s): **5 shots** — 1980s child / 1990s teens / 2000s drive-thru / modern PlayPlace / diverse friends
- Scene 3 "Connection" (20-30s): **3 shots** — unified present-day group at table, hands reaching, wide shot + logo

**What parser produced:**
- Project Scene 0: **1 video** (collapsed Scene 1's 3 shots into 1 — LOST Happy Meal toy + fries + retro sign shots)
- Project Scene 1: **5 sub-shots** matching script Scene 2 ✅
- Project Scene 2: **5 sub-shots** with era descriptions ("1980s child reaching for fry", "1990s teens booth", etc.) ❌ — **DUPLICATED Scene 2's montage**. Script Scene 3 is supposed to be a present-day unified group scene, not another era montage.

**Effect:** Ad has no resolution beat. Structure is "hook → era montage → era montage" instead of "hook → era montage → resolution". Viewer never gets emotional payoff.

**Root cause:** LLM scene parser's montage decomposition logic in `lib/pipeline/llm-scene-parser.ts`:
- The "When to SPLIT into separate generation units" rules (line 269+) need to recognize that script Scene 3's "Diverse group gathered around a table" is ONE unified scene, not a multi-era montage
- The "When to MERGE into one generation unit" rules need to NOT collapse Scene 1's 3 distinct close-ups (Happy Meal toy / fries / sign) into one shot

**Fix:** Rework the montage-decomposition prompt around Dancyger/Murch principles from `creative_production_knowledge.md`:
- Count the shot boundaries in the script literally — Scene 1 says "Shot 1 / Shot 2 / Shot 3" explicitly
- Recognize "unified present-day scene with eye contact and shared moments" as resolution, not montage
- When the script explicitly numbers shots, output exactly that many sub-shots with `independentGeneration: true`

### A3.2 — VIDEO GEN: sub-shots share ONE reference image, creating "3 videos stitched to 11 shots" 🔴 ARCHITECTURAL

**Observation from proj_QXaC7iOTQi4g:**
- Project scene 0 (1 clip): `posterUrl = storyboard_cL3qO-zBktXc`
- Project scene 1 montage (5 sub-shots 107066-107070): **ALL share `posterUrl = storyboard_3MsLWvHRHAMn`**
- Project scene 2 montage (5 sub-shots 107071-107075): **ALL share `posterUrl = storyboard_eBWj53KRslcX`**

Only **3 unique storyboard images** for 11 videos. Each sub-shot's Seedance video was generated from the same frozen frame as the other 4 in its montage, with only motion-prompt variation. Result: 5 Seedance outputs that look near-identical — same subject, same location, same lighting, same composition, minor motion variance. User perceives it as repetitive footage, NOT era shifts across time.

**Root cause:** `lib/pipeline/storyboard-service.ts` or video worker only generates ONE image per scene-level generation unit, reusing it for all sub-shots even when `independentGeneration: true`. Phase S1 (91d93648) rewrote storyboard-service around new adapters but sub-shot image generation was never verified.

**Per-sub-shot image gen IS the documented cost model** — the LLM parser prompt explicitly says "Each sub-shot with independentGeneration=true costs 3 credits" (line 205). That comment implies the sub-shot gets its own video (currently true) AND its own image (currently false).

**Fix:** In `storyboard-service.ts`, for each sub-shot with `independentGeneration: true`, generate a per-sub-shot reference image from `subShot.description` / `subShot.visualDescription` BEFORE dispatching the video worker. Store the result in `subShot.imageUrl` / `subShot.imageAssetId`. Video worker then uses the sub-shot's own image, not the parent scene's.

**Credit impact:** per montage with 5 subs, cost goes from 1 image + 5 videos = ~$0.08 to 5 images + 5 videos = ~$0.40. This is already what the cost-preview UI expects per the parser comment. Users opt into it by allowing sub-shot decomposition.

**Confirmation needed:** query MongoDB `sb_3_8IjK8_rIOC` to verify sub-shot `imageUrl` / `imageAssetId` fields are missing (reusing parent) vs present (already per-sub-shot).

### A3.3 — VOICEOVER UX: silent drop when script has no narration 🟡 UX

**Situation:** User checked "voiceover" in export dialog. Script has zero narration (Audio sections only mention music + ambient sounds, no VO/NARRATOR lines). Parser correctly extracted `narration: ""` per its own rule 173. Finalize dispatched no TTS jobs. User sees no voiceover and thinks the system is broken.

**Fix:** `ExportToEditronDialog.tsx` should check the parsed scenes' `narration` field totals before allowing voiceover selection. If all `narration.length === 0`, either:
- Gray out "voiceover" checkbox with tooltip "Script has no narration lines"
- OR show a warning modal: "Your script has no spoken dialogue. Voiceover will be skipped. Would you like to auto-generate narration from your script's visual + mood?"

Parallel fix: the caption pipeline depends on voiceover transcription. For zero-narration scripts, caption service should fall back to extracting text from scene `editDirections.onScreenText` field and timing it to scene boundaries, instead of silently producing no captions.

### A3.4 — CAPTIONS: completely missing despite being selected 🔴 DESIGN GAP

**Observation:** User selected captions. Project has zero caption overlays (row 4 empty).

**Root cause:** Captions are derived from voiceover transcription. No voiceover → no transcription → no captions. The caption service (`lib/editron/services/media/caption-service.ts`) has no code path for "script has on-screen text, generate captions from that instead".

**Fix:** Add a new caption source mode for commercial/zero-narration scripts:
- Scene parser already extracts on-screen text from script Audio or explicit "On-Screen Text:" sections
- Store as `scene.editDirections.onScreenText: string[]`
- Caption service new mode: `sourceType: 'script-text'` → reads from scene editDirections, times each entry to scene duration (appears at scene start + 0.5s, disappears at scene end - 0.5s, per caption timing rules in creative doc)
- OR: push on-screen text as motion-graphic overlays on row 6 instead of captions row 4 (simpler, already partially happening via EDL graphic decisions)

### A3.5 — EDL OUTPUT BUGS (from proj_QXaC7iOTQi4g inspection)

These are all visible in the project overlays array and the EDL response. All confirmed against creative_production_knowledge.md principles.

| # | Bug | Evidence | Creative doc violation |
|---|-----|----------|---|
| A3.5.1 | **10 dip-to-black transitions spammed between every clip pair** (from `source:"tool"` on row 2) despite EDL only asking for 5 transitions | 10× `type: transition, transitionStyle: dip-to-black, source: tool` entries in overlays | Transition Psychology table: dip-to-black = "end of chapter / dramatic pause", never between sub-shots |
| A3.5.2 | **Dual transition systems firing** — `edit-direction-applier` placing tool transitions on row 2 AND `edl-executor` placing EDL transitions on row 5. No dedup. Commit 5aa2e2a4 ("fix 6 duplicate system conflicts") didn't cover transitions | row 2 has 10 tool transitions, row 5 has 4 EDL transitions | Rule 2N (no fallbacks as solutions) — two systems masking each other |
| A3.5.3 | **EDL transition frame drift up to 426 frames** — decisions at frame 143/491/563/755/815 landed at 569/dropped/625/745/800 | Compare EDL decisions list vs row-5 overlay `from` values | — |
| A3.5.4 | **Filter schizophrenia, wrong color temperature for content** — 4 different filters including `hue-rotate(160deg)` which turns skin blue/green | clips 107068-107070 and 107073-107075 | Color Grading Psychology: nostalgia ad needs **warm golden/orange ACROSS ALL scenes**. Current alternates warm/cool/broken |
| A3.5.5 | **Cuts/min is 22.7, should be 6-10** for nostalgia brand ad | 11 cuts in 29s | Pacing by Content Type table: "Brand ad (nostalgia) = 6-10 cuts/min, 3-6s shots" |
| A3.5.6 | ✅ **FIXED** ~~Broken speedCurve on final clip~~ — Fixed: edl-executor.ts:837-857 validates monotonic order, deduplicates same-frame keyframes, clamps to clip duration. Requires >=2 distinct keyframes post-validation. | clip 107075.speedCurve | Disney Principle 6: ease curves must be monotonic + within bounds |
| A3.5.7 | **Zoom decisions land on wrong clips** — EDL pull-back at frame 755 ended up as weird scale on clip 107070 (frames 491-581) with no starting keyframe | clip 107070.keyframeTracks.scale | — |
| A3.5.8 | **Graphic drift -79 frames** — "A taste of childhood" decision at frame 695 landed at frame 616 (wrong clip) | Compare EDL graphic decisions vs html-scene overlay `from` values | — |
| A3.5.9 | **"Our place." graphic entirely dropped** — EDL decision at frame 563, no overlay produced | — | — |
| A3.5.10 | ✅ **FIXED** ~~16 of 28 EDL decisions executed (57% drop rate)~~ — Fixed: commit 87418599 adds `rejectedDecisions[]` to ExecutionResult with per-decision reason+ruleId. Budget rejections, null-return guards, errors all tracked. Summary log groups by rejection type. Drop rate itself unchanged — but reasons are now VISIBLE. | `intelligence.decisionsExecuted=16` vs `decisionsGenerated=28` | — |
| A3.5.11 | **Camera shake on emotional montage** — 10-frame micro-shake burst on clip 107070 during a nostalgia shot | clip 107070.keyframeTracks.x/y | Murch Rule of Six: emotion = 51%. Shakes belong on impact, never on emotional beats |
| A3.5.12 | **Row collisions** — graphics placed on row 1 (same as BGM), tool transitions on row 2 (same as video). ROW constants still hardcoded | scene-to-editron.ts ROW spec vs actual overlays | — |
| A3.5.13 | **`hasNativeAudio` flag only on scene-level clip, missing from all 10 sub-shots** despite all being Seedance 1.5 | Only clip 107065 has the flag | Phase S1 partial wiring |
| A3.5.14 | **ZERO SFX generated** — EDL asked for 5, none landed. Audio worker failed silently, no pipelineWarnings entry | overlays array has no row 0 entries | Three-Layer Sound Model: "Never leave a scene silent" |
| A3.5.15 | **Missing on-screen text "Share your McDonald's memories. #GoldenArchesOfMemory"** — script Scene 3's second text line not in overlays | — | — |
| A3.5.16 | **Truncated on-screen text "A taste of childhood, always fresh" → "A taste of childhood"** | clip 107072 html-scene content | — |
| A3.5.17 | **Profile detection picked G-01 (default style-blend) for a nostalgia brand ad** — should have picked a nostalgia-appropriate profile from B (industry) or E (narrative mode) categories | `pendingDirectorProfileId: "G-01"` | — |

### A3 — ROOT CAUSE SYNTHESIS (these cascade from 3 architectural problems)

1. **Parser's montage decomposition doesn't respect explicit shot counts in scripts** → A3.1 + part of A3.2
2. **Sub-shot image generation was never wired through Phase S1's adapter rewrite** → A3.2 (the "3 videos stitched" feel)
3. **`edit-direction-applier` and `edl-executor` are two parallel editing systems with no dedup/ordering contract** → A3.5.1, A3.5.2, A3.5.3, A3.5.4, A3.5.7, A3.5.8, A3.5.9, A3.5.10, A3.5.12

### A3 — FIX ORDER (recommended)

**P0 (unshippable until fixed):**
1. A3.2 — per-sub-shot image generation (biggest visual impact, kills the "3 videos stitched" feel)
2. A3.1 — parser decomposition respects explicit shot counts (structural)
3. A3.5.1 + A3.5.2 — kill duplicate transition system, EDL as source of truth
4. A3.5.4 — lock filter to single warm grade for nostalgia content, remove hue-rotate preset

**P1 (quality gates):**
5. A3.3 + A3.4 — voiceover UX + caption-from-script-text fallback
6. A3.5.3 + A3.5.7 + A3.5.8 + A3.5.9 — EDL frame-to-clip-boundary snapping (one bug causing 4 symptoms)
7. ~~A3.5.6 — speedCurve generator bounds/order validation~~ ✅ FIXED (edl-executor.ts:837-857, monotonic validation)
8. ~~A3.5.10 — surface EDL drop reasons in pipeline warnings~~ ✅ FIXED (commit 87418599, rejectedDecisions[] in ExecutionResult)
9. A3.5.14 — pipeline-warnings wired into audio worker so SFX failures visible
10. A3.5.13 — Seedance hasNativeAudio propagation to sub-shots
11. A3.5.5 + A3.5.17 — content-aware pacing (cuts/min should match content type), profile auto-detection for nostalgia ads

**P2 (polish):**
12. A3.5.11 — shake placement restricted to impact/action only
13. A3.5.12 — ROW constants everywhere (already flagged, 13+ sites)
14. A3.5.15 + A3.5.16 — on-screen text carry-through + truncation fix

### A3 — Notes for next session
- Verify A3.2 by querying MongoDB `sb_3_8IjK8_rIOC` for per-sub-shot `imageUrl` / `imageAssetId` fields
- Script + project available for reference: user has the script text, project ID `proj_QXaC7iOTQi4g`, user `user_336qtL6xQAa0KqtxnG5RjAY5KOA`, preview DB `insturix_preview` / `editron_prev`
- Parser-timeout hotfix commit `d3d295d0` confirmed working (this test passed the parse step)
- `scripts/debug-storyboard.mjs` written but NOT YET RUN — pending user permission

---

## SECTION 1: ACTIVE BUGS (Affect Video Output)

### CRITICAL

| # | Bug | File | Impact | Status |
|---|-----|------|--------|--------|
| 1 | **Camera shake non-deterministic** — `Math.random()` produces different shake patterns on every render | `edl-executor.ts:200-201` | Same video renders differently each time. Breaks QA, A/B testing, client previews. | ✅ FIXED (c4b1b559) |
| 2 | **Transition misalignment** — EDL places transitions at `decision.frame`, not actual clip boundary | `edl-executor.ts:228` | Transitions float mid-clip instead of bridging scenes | ✅ FIXED (c4b1b559) |

### HIGH

| # | Bug | File | Impact | Status |
|---|-----|------|--------|--------|
| 3 | **Duration variety desyncs voiceover** | `auto-post-processing.ts:349` | Viewer hears scene 3's narration over scene 4's video | ✅ FIXED (c4b1b559) |
| 4 | **Drift-zoom conflicts with budget-rejected zooms** | `auto-post-processing.ts:155-166` | Scene that should NOT have zoom gets drift-zoom | ✅ FIXED (c4b1b559) |
| 5 | **Freeze-frame on tiny corner graphics** | `auto-post-processing.ts:298-300` | 4-second video freeze for a 312x56px text box | ✅ FIXED (c4b1b559) |
| 6 | **Screen zone validation bypassed by user graphics** — only checks EDL-generated graphics | `auto-post-processing.ts:237-238` | User-placed graphics can overlap captions | ⚠️ PARTIAL FIX (commit `079c0ae7` Batch 5 — now reserves Zone 3 on VO-present frames AND caption-present frames; still doesn't check user-placed graphics explicitly, but the move-out-of-Zone-3 path applies to ALL html-scene overlays regardless of source) |
| 7 | **BGM row hardcoded to 1** — uses `row === 1` instead of `ROW.BGM` constant | `director-agent.ts`, `edl-executor.ts` | Breaks if BGM is on different row | ✅ FIXED (confirmed via audit 2026-04-19 — `director-agent.ts:719, 1206, 1280` all use `ROW.BGM`) |

### MEDIUM

| # | Bug | File | Impact | Status |
|---|-----|------|--------|--------|
| 8 | **40+ console.warn for actual failures** — should be `console.error` | `director-agent.ts`, `tools.ts`, `five-track-analysis.ts` | Hard to spot failures in production logs | ❌ UNFIXED (deferred post-launch, low user impact) |
| 9 | **HTML entity escaping incomplete** — only escapes `<` and `>`, misses `&`, `"`, `'` | `edl-executor.ts:426` | Potential XSS if Gemini outputs malicious text | ✅ FIXED (confirmed via audit 2026-04-19 — `edl-executor.ts:749-754` escapes all 5 entities; Toyota entry was stale) |
| 10 | **Gemini prompt contradictions** — "max 3 zooms/30s" vs "5 for short-form", freeze-frame vs stable-frames-only | `unified-edit-intelligence.ts:479-603` | Gemini picks rules arbitrarily | ❌ UNFIXED — user tackling this separately (expert prompt audit) |
| 11 | **Decision density identical for all video lengths** — `0.6-1.0 per second` regardless of 30s short or 10min video | `unified-edit-intelligence.ts:~1161` | Long videos over-edited, short videos under-edited | ✅ FIXED (commit `2c617206` Batch 2 — 5-tier content-length-aware: short-form 0.6-1.0/s → long-form 0.12-0.25/s, grounded in creative_production_knowledge.md §5) |

### NEW items shipped 2026-04-18 / 2026-04-19 (for reference):

| # | Fix | Commit |
|---|---|---|
| S-01 | Ghost transition markers (in-memory dedup leaking to MongoDB) | `8362b5dc` |
| S-02 | Transition clip-pair dedup (B1) + post-composition safety net (B3) | `eca8daed` |
| S-03 | `add_transition` tool applyToAll silent-fallthrough overwriting EDL transitions | `a74ddcba` + `846a4459` schema refine |
| S-04 | AssetBriefing partial-cache crash (consumer mitigated; producer still drifts) | `ce5df796` |
| S-05 | onScreenText caption fallback duplicate vs graphic rendering | `dd758500` |
| S-06 | Hormozi/MrBeast/AliAbdaal/Corporate caption styles not in UI dropdown | `156e89ad` |
| S-07 | Admin email allowlist leaked via `NEXT_PUBLIC_ADMIN_EMAILS` | `758f7835` |
| S-08 | ADMIN_SECRET_KEY rotated, ancient Preview-monolith-backend entry cleaned | (env var ops, not commit) |
| S-09 | Admin docs renamed (`NEXT_PUBLIC_ADMIN_EMAILS` → `ADMIN_EMAILS`) | `432203c7` |
| S-10 | Hardcoded 10s video duration cap (violated Rule 8N on Seedance 1.5/2.0 capable of 12/15s) | `3175b9d3` |
| S-11 | Defensive input validation (bare catch, non-null assertion, subShots null, schema guard) | `846a4459` |
| S-12 | Duration snap visibility — logs delta > 0.5s | `2c617206` |
| S-13 | Nano Banana `inline-image-urls` capability — reference passthrough restored | `9be691ba` |
| S-14 | Gemini 429 / transient retry wrapper | `8f76b94f` |
| S-15 | EDL onScreenText deterministic safety-net + VO zone pre-emptive reservation | `079c0ae7` |
| S-16 | P0-4 parser regex fallback rewrite — editorial-header paragraphs route to rawProductionNotes, `narration.substring(0, 2000)` copy-back removed in ThinkForge-blocks + CIR converters, single-source `EDITORIAL_HEADER_PATTERNS` | `f41b4e52` |
| S-17 | Filter-preset single-source refactor — `FILTER_PRESET_IDS` export from `filter-presets.ts`, scene parser uses `z.enum()` for strict validation, exposed 5 hidden presets (vintage/polaroid/expired/kodak/super8/wesAnderson). Same drift-prevention pattern as `EDITORIAL_HEADER_PATTERNS` (S-16). | `987a4692` |
| S-18 | Contributor #2 (Rule 8N pacing compound) — `durationWasExplicit` flag on `SceneDescriptor`, set by timestamped-script parser + LLM Fix-4 post-processor. Edit-direction-applier skips pacing multiplier when flag true + adds VO-bound floor (never chop narration mid-sentence). `profile.pacingMultiplier` audited via grep — defined in all 54 profiles but NEVER read, dead field. | `57f72532` |
| S-19 | Scene-type-aware ref routing for NB2 — fixes the montage regression introduced by S-13 (reference-passthrough globally applied refs to montage sub-shots, contaminating subject identity across different eras/subjects). `getMaxRefsForSceneType()` caps refs by `SceneDescriptor.sceneType`: montage=0, text-card=0, logo-reveal=1, talking-head=2, continuous=3, undefined=3. Applied at ref-branch entry, gates ALL branches (Luma / IP-adapter / image-to-image / inline-image-urls). Flux ref pipeline audited — already production-grade (flux-dev default, approval gate works), no changes needed there. | `975442a6` |
| S-20 | Delete dead `profile.pacingMultiplier` field — defined on all 54 profiles (0.65–1.2 range), NEVER read anywhere in the codebase. 54 decorative numbers pretending to express editorial intent. Removed from EditProfile interface + sed'd out of all profile entries. | `b1553b10` |
| S-21 | Parser 422 fix — ThinkForge blocks with link-node text returning empty rawContent. Route had inline `n.text \|\| ''` extraction that dropped link nodes (their text is nested at `content[].text`). Exported `richTextToPlain` from script-to-scenes.ts + use in route. Added diagnostic logging for future 0-length extraction regressions. | `57d7fa29` |
| — | Prateek's `alignCutsToBeats()` wired in audio worker + bgm-service — aligns montage sub-shots to beats. | `c070504b` (cherry-pick) |
| — | Prateek's confidence tracking — analysis score now used in auto-post-processing, reactive-edit-engine, quality-review-service (previously only EDL executor). | `8da7e998` (cherry-pick) |
| S-22 | Parser hallucination fix round 1 — LLM prompt saturated with March A3 McDonald's test script content. Initial fix shipped domain-diverse replacement examples (tech/fitness/real-estate) + hallucination validator. | `d40a10c0` |
| S-23 | Parser hallucination fix round 2 — user flagged S-22 as lateral motion: "tech/fitness/real-estate" examples just move the overfitting surface. Corrected fix shipped: all concrete example content replaced with ALL_CAPS_UNDERSCORE placeholder templates + rules. Violated Rule 17N in S-22 by jumping to a fix without deliberating whether swapping domains eliminates the problem (it doesn't). This commit is the deliberated version. | `85249d4a` |
| S-24 | Parser hallucination audit completion — deep audit across ALL LLM call sites (10+ prompts) found 2 more contaminated prompts in llm-scene-parser.ts: Subject Extraction (4 concrete product/vehicle/food/character examples) and VideoPromptMaster (McDonald's-adjacent "fries/packets" anti-pattern examples). Both replaced with placeholder templates + domain-neutral rules. All other LLM prompts (consistency scoring, style transfer, motion graphics, 5-track, media analysis, unified intelligence, Director Agent, reference image master) verified clean. | `8f59bdd4` |
| S-25 | SFX 3-chain Phase B2 — prefetch-sfx route had two bugs: (1) passed raw natural-language queries to Freesound instead of using the existing `audioDescriptionToSearchQuery()` tokenizer, (2) fell back to the DEPRECATED `audioDescription` field which holds MUSIC content, searching Freesound for music = zero hits. Both fixed + logging upgraded to show raw→tokenized→result trace. | `b98f8d58` |
| S-26 | SFX 3-chain Phase B3 round 1 — bundled two fixes: (a) removed `!hasNativeAudio` filter citing "never leave a scene silent," (b) removed audioDescription music-leak fallback. User flagged (a) as over-reach — blanket-layering Freesound on top of clips that already carry audio is over-mixing, and "never silent" was being quoted out of context. Also violated "ambient beds continuous in single-location scenes." Correction shipped as S-28. | `4a1dcc78` |
| S-27 | Transition keyword extraction (S-27) — rule-driven regex post-processor scans raw script per-scene chunk for 22 transition keywords (QUICK CUT / RAPID CUTS / HARD CUT / SMASH CUT / DISSOLVE / FADE TO BLACK / whip pan / iris wipe / etc.). Overrides LLM's transition choice when script has explicit keyword (user intent beats LLM inference). Rule 18N — rule-driven over probabilistic for signals the script gives us explicitly. Vocabulary grounded in creative_production_knowledge.md §5 Transition Psychology. | `966b7022` |
| S-28 | S-26 correction — restored `!hasNativeAudio` filter (content SFX dispatches only when clip has no native audio; avoids over-layering on Seedance or future user-uploaded Mode 2/3 footage). KEPT audioDescription music-leak removal (that part of S-26 was right). Logging refined to distinguish "no intent" vs "all scenes have native audio" vs "dispatched." Notes the future Mode 2/3 gap where `hasNativeAudio` flag doesn't yet track user-recorded audio — architectural work for Phase C. Self-audit note: S-26 violated Rule 10 (cited creative doc without reading); S-28 is the re-read correction. | `b279d7eb` |
| S-29 | C2 Option F — Phase C asset-centric speech verification. Closes the "trust script intent, never verify actual output" gap user flagged. Track A in 5-Track analysis now transcribes AI-gen clips when script narration is empty (silent intent) and flags `hasHallucinatedSpeech: true` when Seedance/Veo/Kling actually generated speech. Populates speechSegments from transcribed content so downstream cut placement + audio gating can avoid mid-speech boundaries. Gated by Deepgram availability + time budget. ~$0.001/clip cost. Follow-up phase wires the flag into S-28's SFX dispatch filter (scenes with hallucinated speech → treat as "no clean native audio" → Freesound layer). Rule 10 + Rule 18N + Rule 2N aligned: verify vs trust, deterministic threshold, close the loop properly. | `4667b309` |

---

## SECTION 2: CODE THAT EXISTS BUT IS NOT WIRED

| # | What | File | Why It Matters |
|---|------|------|---------------|
| 1 | **editronConfig.ts** — centralized config for 100+ values | `lib/editron/config/editron-config.ts` | Created but NO consumer uses it. All services still have hardcoded values. |
| 2 | **Pipeline warnings system** — error visibility | `lib/editron/services/pipeline-warnings.ts` | Created but NOT integrated into finalize or Director responses. |
| 3 | **Split-clip capability** — Director can split clips at anchor points | `director-agent.ts:545+` | Tool exists with guardrails but ZERO profiles use `splitClips()` action. |
| 4 | **alignCutsToBeats()** — snap montage cuts to music beats | `lib/pipeline/scene-to-editron.ts:311` | Function complete and correct. Never called. |
| 5 | **Confidence tracking** — analysis quality scores | `five-track-analysis.ts` | Scores computed but only EDL executor checks them. Auto-post-processing, quality review, reactive engine don't. |
| 6 | **Multi-strategy reference system** — model-specific image reference | `storyboard-service.ts` | Built for Nano Banana, Vidu Q2, MiniMax, Kontext. Untested in production. |
| 7 | **Analysis version tracking** — v1→v2 invalidates old cache | `five-track-analysis.ts` | Version check works but untested with real cached data. |

---

## SECTION 3: DEAD CODE

| # | File | Lines | What It Is | Verdict |
|---|------|-------|-----------|---------|
| 1 | `lib/editron/services/auto-edit-service.ts` | 470 | Script+footage auto-edit (Mode 2 feature) | **KEEP** — needed for Mode 2. Wired via AI chat `tools.ts:4218` + route `/api/services/editron/auto-edit/route.ts`. Callable by typing command. No UI button. |
| 2 | `visualInspectFrame` tool in `tools.ts` | ~20 | Disabled decoy, no implementation | **DELETE** — pure stub |
| 3 | `useCachedAsset` hook | ~130 | IndexedDB asset cache hook | **KEEP** — underlying `asset-cache.ts` IS used |
| 4 | `splitClips()` in `edit-profiles.ts` | ~10 | Profile action helper for split_clips | **KEEP** — feature exists, no profile uses it yet |
| 5 | `lib/editron/services/style-transfer-service.ts` | 488 | Extract Edit DNA from reference video + apply | **KEEP** — wired via AI chat `tools.ts:4301,4354` + route `/api/services/editron/style-transfer/route.ts`. Callable by command. No UI surface. |
| 6 | `lib/editron/services/motion-graphics-service.ts` | 386 | Template search + slot-fill for motion graphics | **DELIBERATE** — wired via AI chat + route, but match criteria is TIGHT (keyword overlap scoring, minSize=2). Misses more than hits. See TODO below. |

---

## SECTION 3b: SYSTEMS NEEDING DELIBERATION (added 2026-04-21)

### Motion Graphics (1241-line template library, rarely triggered)
**Status:** wired end-to-end (AI chat tool + route + template DB). Template match rarely scores high enough to activate.

**Why rarely fires:**
- `searchTemplates()` uses MongoDB `$text` search → regex fallback (motion-graphics-service.ts:70)
- `computeRelevanceScore()` (line ~330) gives 2pts name-match + 1pt description-match
- Director only triggers `add_motion_graphics_sequence` step when EDL has `graphic` decisions — which the LLM often skips or budget rejects
- Even when triggered, LLM `findBestTemplate()` returns null if score < threshold

**Possible fixes (Rule 17N — deliberate before implementing):**
- **Option A — Loosen match:** drop threshold, let weaker matches in. Risk: ugly graphics on mismatched scenes.
- **Option B — LLM-adapted:** use Gemini to map script content → template slots even when keywords don't match. Reuses existing fillTemplateSlots. Risk: cost + latency per scene.
- **Option C — Seed-and-embed:** run seed-motion-graphics.ts, add semantic embeddings to each template, cosine-match against scene description. Symmetric to asset-search approach. Risk: requires DB migration.
- **Option D — Profile-driven:** tag each of 54 profiles with preferred template categories. Match scene → profile → template-category → pick best in category. Rule-driven. Low-risk.

**Recommendation:** Option D + C in parallel. D is 1-day rule-driven win; C is the 1-week structural upgrade. Skip A (regression risk). Skip B unless user wants latency.

**Next action:** pull motion-graphic-templates.ts sample entries, count by category, decide which categories per profile-type. Deliberate before coding.

---

## SECTION 4: WHAT'S LEFT TO BUILD

### Tier 0: Make Current Output Professional (days)

| # | What | Effort | Impact |
|---|------|--------|--------|
| 1 | Wire editronConfig.ts into all services (replace hardcoded values) | 6h | Foundation for everything |
| 2 | Fix camera shake determinism (seed with projectId + frameNumber) | 1h | Reproducible renders |
| 3 | Fix transition alignment (anchor to clip boundaries) | 2h | Visual alignment |
| 4 | Fix freeze-frame logic (research-backed readTime, skip tiny graphics) | 2h | No more 4s freezes |
| 5 | Fix duration variety (don't desync voiceover) | 1h | Audio-visual sync |
| 6 | Fix drift-zoom/budget conflict | 1h | Budget decisions respected |
| 7 | Integrate pipeline warnings into finalize + Director responses | 2h | Error visibility |

### Tier 1: Intelligence & Content Awareness (weeks)

| # | What | Effort | Impact |
|---|------|--------|--------|
| NEW | **5-Track merge vision + music into one Gemini call** — currently `analyzeVideoComprehensive` (motion + keyframes + subjects) is one call but `analyzeMusicStructure` is a separate round-trip. Since the video is already uploaded to Gemini Files API, we can ask Gemini to infer beat-grid + musical-sections in the same call (~10% more tokens vs a full separate call). Saves ~3s latency + 1 API call per clip (~33s + ~$0.001 for an 11-clip project). `analyzeAudio` (Deepgram transcription) stays separate — different provider, can't merge. | 3-4h | Latency + cost saving at scale |
| 8 | Knowledge graph from DIRECTOR_KNOWLEDGE_BASE.md (19,885 lines) | 2 weeks | System understands editing, not just follows rules |
| 9 | Beat-synced assembly (BGM before finalize, use `alignCutsToBeats`) | 1 week | Cuts aligned to music |
| 10 | Essentia.js integration (real music analysis) | 1 week | Accurate beats, BPM, key, energy, mood |
| 11 | Content-aware SFX validation | 1 week | SFX matches actual video content |
| 12 | Wire confidence tracking into ALL consumers | 3h | Low-confidence = conservative decisions |
| 13 | Fix Gemini prompt contradictions | 2h | Consistent decisions |
| 14 | Fix decision density formula (content-length-aware) | 1h | Appropriate edit density |

### Tier 2: Components & Tools (weeks)

| # | What | Effort | Impact |
|---|------|--------|--------|
| 15 | Integrate Remotion skills database (200+ components) | 2 weeks | Replace HTML string graphics with React components |
| 16 | Give Director access to all 33 tools (currently 14) | 1 day | More editing capabilities |
| 17 | Research-backed smart clip selection weights | 3h | Better segment selection |
| 18 | Fix index-based scene matching in context assembly | ✅ DONE (e5bf0d9c) | Correct data per overlay |
| 19 | Fix voiceover matching (time overlap instead of ±15 frames) | ✅ DONE (e5bf0d9c) | J-cuts work |
| 20 | Fix motion segment reporting (all segments, not just first) | ✅ DONE (e5bf0d9c) | Gemini sees full motion |
| 21 | Fix keyframe description truncation | ✅ DONE (e5bf0d9c) | Gemini sees all keyframes |

### Tier 2.5: Phase C — Asset-Centric + Brand Vault (DEFERRED, 6-10 weeks)

**Corrected scope (user confirmation 2026-04-20):** not just "library + search." Editron understands every asset in a project AND across brand. Repurposes clips/segments like a real editor. Sources = AI-generated in project + brand/profile-level + user uploads (NOT stock — needle in haystack). Memory layer likely Graphiti for queryable brand knowledge brain (per `insturix_vision.md`).

| # | What | Effort | Vision alignment |
|---|------|--------|------|
| C-1 | **5-Track runs on user uploads on ingest** (not just AI-generated pipeline clips). New worker hook after upload success. | 1 week | Rule 18N — makes asset understanding universal |
| C-2 | **Brand vault persistence** — 5-Track results stored per-brand (not per-project). Cross-project queryable. Graphiti-backed. | 2 weeks | Brand DNA Vault from vision doc |
| C-3 | **Segment-level analysis** — 10s clip → 3 discrete 3s segments, each independently searchable. Requires in/out-point schema + UI + analyzer changes. | 3-4 weeks | Real editor behavior |
| C-4 | **Semantic embedding + search** — 5-Track results → searchable vectors. "Find close-up of blue bottle" returns matches. `asset-search-service.ts` exists, unwired to Director. | 1 week to wire + 1 week to test | Rule 18N — deterministic search vs probabilistic generate |
| C-5 | **Director searches vault BEFORE generating.** New step 0 in Director: query brand vault for matching asset; only generate if no match above threshold. | 3-5 days | Cost reduction + brand consistency |
| C-6 | **Chapter-based render integration** — `chapter-renderer.ts` exists (Phase D W6). Wire into finalize for long-form compose-from-vault projects. | 1 week | Enables 3-hour videos |

**Total:** 6-10 weeks. Not for current runway push. Do AFTER Tier 0-1 stabilization + Tier 2 components.

### Tier 3: Phase D Pro — DaVinci Features (weeks each)

| # | What | Effort | Impact |
|---|------|--------|--------|
| 22 | Color grading (Lift/Gamma/Gain, HSL, LUT import, scopes) | 24h | Professional color |
| 23 | Audio FX (EQ, compression, reverb, de-esser) | 20h | Professional audio |
| 24 | Subject tracking + motion-locked overlays | 6 weeks | Overlays follow subjects |
| 25 | Masking (shape, PiP, product isolation) | 16h | Isolate elements |
| 26 | Style transfer UI | 12h | Learn editing style from reference |
| 27 | Smart reframe (16:9 → 9:16 intelligent crop) | 8h | Multi-platform output |

### Tier 4: Phase E Scale (months)

| # | What | Impact |
|---|------|--------|
| 28 | 3hr video support (chapter renderer exists) | Long-form content |
| 29 | Multi-platform auto-reformat | One source → all platforms |
| 30 | Batch project processing | Agency workflow |
| 31 | Team collaboration | Multi-user editing |
| 32 | Version control for projects | Branching, merge |
| 33 | Direct social publish | YouTube, Instagram, TikTok APIs |

### Tier 4.5: Netflix VOID Integration (Object Removal + Physics)

| # | What | Effort | Impact |
|---|------|--------|--------|
| NEW | **Netflix VOID model** — video object inpainting with physics-aware interaction deletion | 2 weeks | Remove unwanted objects/people from footage, fix AI artifacts post-generation |
| | Apache 2.0 licensed. Built on CogVideoX-Fun. Preferred 64.8% vs Runway 18.4%. | | |
| | Use cases for Editron: remove AI text hallucinations from generated video, remove unwanted objects from user footage (Mode 2), clean up AI artifacts (extra fingers, morphing), replace backgrounds | | |
| | Repo: `huggingface.co/netflix/void-model` / `github.com/Netflix/void-model` | | |
| | Integration: Run as fal.ai custom model OR self-hosted via HuggingFace Inference Endpoints | | |

### Tier 4.6: Draw-to-Edit (Clickatron Tech) — added 2026-05-07

| # | What | Effort | Impact |
|---|------|--------|--------|
| NEW | **Draw-to-Edit** — user draws on video frame to add/edit specific images, elements, graphics at a specific moment. Reuses Clickatron's chat+draw scene editing tech. User sketches → system interprets as element placement (logo, text, image, graphic). | 3-4 weeks | Enables visual editing intent — "I want a graph HERE" becomes a drawn annotation, not text. Bridges gap between verbal direction and spatial placement. |
| | Integration: Clickatron's canvas annotation system → Editron overlay placement. Draw → element type inference → overlay creation at drawn position + timestamp. | | |
| | Use cases: add lower thirds by drawing position, place logos by pointing, annotate where text should appear, mark regions for zoom/crop. | | |

### Tier 5: Mode 2 & 3

| # | What | Impact |
|---|------|--------|
| 34 | Mode 2: Upload footage → AI edits (post-production) | User's own footage |
| 35 | Mode 3: Hybrid (user footage + AI fills gaps) | Mixed content |

### Tier 6: Phase F — Screencast & Product Demo Mode (added 2026-04-16)

Full spec: `phase_f_g_saas_motion.md`. OpenScreen (gitignored at `reference-repos/openscreen-main/`) is the code source.

| # | What | Effort | Notes |
|---|------|--------|-------|
| F1 | Mode 4: Screen recording ingestion + cursor detection | 1 week | Port OpenScreen's cursor/zoom utils. Extends 5-Track Track 4 |
| F2 | Intelligent auto-zoom from cursor trajectory | 1 week | Deterministic, no Gemini. New EDL decision type `cursor-zoom` |
| F3 | Motion blur on zoom-punch transitions | 3 days | Port `blurEffects.ts` to Remotion |
| F4 | Web-based screen recorder (browser) | 1 week | `getDisplayMedia()` + WebRTC |
| F5 | Native desktop client (Editron Desktop) | 4-6 weeks | Fork OpenScreen, rebrand |
| F6 | Cursor-event classification (button vs text) | 2 weeks | Different zoom depths per element type |

### Tier 7: Phase G — SaaS Motion Graphics Engine (added 2026-04-16)

Full spec: `phase_f_g_saas_motion.md`. Triggered by Beehiiv launch video breakdown. **Solves the gap pure AI video can't fill.**

| # | What | Effort | Why it matters |
|---|------|--------|---------------|
| G1 | Vector/SVG rendering engine (Remotion wrapper) | 1 week | Sharp UI text vs blurry AI text |
| G2 | UI primitives library (~15 components: AppIcon, PushNotification, PhoneFrame, BrowserFrame, etc.) | 3 weeks | Template components with brand props |
| G3 | Template rigs (~10: envelope→phone, notification cascade, stat counter, logo reveal, etc.) | 3 weeks | Modular reusable animation sequences |
| G4 | Advanced easing system (spring physics, Bezier presets, Disney 12) | 1 week | "Premium" feel — not linear |
| G5 | Audio-to-marker sync engine | 2 weeks | Animation timing matches VO words — the biggest quality multiplier |
| G6 | Composable layer system (blend modes, masks) | 1 week | After Effects-style layering |
| G7 | Shimmer + particle effects | 1 week | Live-feel on app icons, "clutter" scenes |
| G8 | Phase F bridge (screen recording + motion graphics overlay) | 1 week | Real product demo + branded overlays + VO sync |

### UI Gaps

| # | What | Status |
|---|------|--------|
| 36 | Beat grid visualization on timeline | Backend exists, no frontend |
| 37 | Style transfer UI panel | Backend exists, no frontend |
| 38 | AI suggestions human-readable formatting | Needs UI work |
| 39 | LottieFiles player in Remotion | Partial — editor preview works, render incomplete |
| 40 | Sentry error tracking | Not started |
| 41 | Structured logging + correlation IDs | Not started |

### Infrastructure

| # | What | Status |
|---|------|--------|
| 42 | Claude Code rule enforcement via settings.json hooks | Noted, not implemented |
| 43 | Essentia.js WASM deployment on Vercel | Feasible, not configured |

---

## SECTION 4B: PRODUCTION READINESS ROADMAP (from 2026-04-06 video analysis)

### Tier P0: Fix Editron Output Quality (from McDonald's test analysis)

| # | What | Root Cause | Effort |
|---|------|-----------|--------|
| P1 | **Black frames between scenes** — gaps at 0:24, 0:27, 0:31, 0:40 | Duration capping leaves gaps when video < script duration | 2h |
| P2 | **Missing transitions** — many dissolves skipped by EDL executor | buildTransitionOverlay returns null / filter-change has no filterCss | 4h |
| P3 | **On-screen text not generated** — script says "McDonald's. A Taste of Childhood." | motionGraphicCue extracted but not executed as graphic overlay | 2h |
| P4 | **SFX too sparse** — no ambient bed, no layered SFX, hollow sound | 1 SFX per scene, keyword-based not content-aware | Phase B |
| P5 | **Captions only on scenes with VO** — should have none on VO-free scenes | Working as designed, but only 1 caption block shows | 1h |

### Tier P1: Large File Handling (Cloudflare Worker + Lambda)

| # | What | Status | Effort |
|---|------|--------|--------|
| P6 | **Worker Range header support** — Lambda needs seekable URLs | ✅ FIXED (2026-04-06) | Done |
| P7 | **Worker large file streaming** — files >128MB hit Worker memory limit | NOT FIXED — current Worker buffers entire file on cache miss | 4h |
| P8 | **Lambda concurrency limit** — default 10, blocks multi-user rendering | Quota increase requested (needs admin AWS account) | 1h |
| P9 | **Lambda memory** — 2048MB may not handle 18+ video overlays | Monitor via CloudWatch, increase to 4096MB if needed | 1h |

### Tier P2: Rendering Robustness

| # | What | Effort |
|---|------|--------|
| P10 | **Remotion bundle redeploy** — S3 bundle may be stale vs Vercel code | 1h |
| P11 | **Asset URL validation before render** — reject render if any URL returns non-200 | 2h |
| P12 | **Render retry with exponential backoff** — auto-retry failed chunks | 4h |
| P13 | **Render progress webhook** — notify user when render completes/fails | 2h |

---

## SECTION 5: RECENTLY FIXED (This Session + Previous)

| # | What | Commit | Date |
|---|------|--------|------|
| 1 | Timeline gaps (videoDurationMs → targetDurationSeconds) | e059bc76 | 2026-04-02 |
| 2 | Zoom bounce → type branching (punch-in/slow-push/pull-back) | e059bc76 | 2026-04-02 |
| 3 | Sub-shot duration bounds (min 1.5s, max 3s) | efe24216 | 2026-04-02 |
| 4 | Smart clip selection (selectBestSegment) | e059bc76 | 2026-04-02 |
| 5 | Zoom validation against motion peaks | e059bc76 | 2026-04-02 |
| 6 | storyboardScenes block-scoping (CRITICAL — captions/filters/transitions/QR all broken) | 6d3286a1 | 2026-04-02 |
| 7 | Caption injection respects user choice | 6c0ee11e | 2026-04-02 |
| 8 | Stock video removed from pipeline default | 45e5c91a | 2026-04-02 |
| 9 | ~130 TypeScript errors fixed across pipeline | 3f8f542a | 2026-04-02 |
| 10 | Next.js 15 params-as-Promise types | a20d2d9d | 2026-04-02 |
| 11 | Pipeline warnings system created | 00131b0b | 2026-04-02 |
| 12 | Director split-clip capability with guardrails | 93ff318f | 2026-04-02 |
| 13 | Dense frame analysis (1/sec) + confidence tracking | 9520a461 | 2026-04-02 |
| 14 | Confidence wired into post-processing + EDL executor | 7987680f | 2026-04-02 |
| 15 | Sub-shot src="" fix (register assets in media_assets) | bb716632 | 2026-04-03 |
| 16 | Analysis version tracking (v1→v2 forces re-analysis) | bb716632 | 2026-04-03 |
| 17 | B-05 athletic keywords for Nike-type content | bb716632 | 2026-04-03 |
| 18 | Model selection respects user choice (no silent IP-adapter override) | c939b4f8 | 2026-04-03 |
| 19 | Multi-strategy reference system (6 model-specific strategies) | dc6b9065 | 2026-04-03 |
| 20 | editronConfig.ts centralized config (100+ values) | 8859d169 | 2026-04-04 |
| 21 | Fix 4 data merge bugs (scene matching, VO matching, motion segments, keyframe descriptions) | e5bf0d9c | 2026-04-04 |
| 22 | Fix 5 post-processing bugs (shake, transitions, freeze-frame, VO desync, drift-zoom) | c4b1b559 | 2026-04-06 |
| 23 | Phase S1: Config-driven model adapters + Seedance 1.5 + UNI-1 + native audio | 91d93648 | 2026-04-06 |
| 24 | Phase S2: Gemma 4 for analysis + centralized model factory | e3fa752b | 2026-04-06 |
| 25 | Move LLM prompt refinement from route to worker (504 fix) | 83520e61 | 2026-04-06 |
| 26 | Parsing model: gemini-3.1-pro-preview (300s budget) | 8a5d76d1+ | 2026-04-06 |
| 27 | Captions moved to row 4 + z-index 95 in layer.tsx | 314b797b | 2026-04-06 |
| 28 | Duration capping (video < script → use video length) | 314b797b | 2026-04-06 |
| 29 | EDL executor diagnostic logging | 96d588b8 | 2026-04-06 |
| 30 | Whisper Large V3 as primary transcription | 9ae52ee1 | 2026-04-06 |
| 31 | Asset resolver: never overwrite working URL with empty | e6dc98b7 | 2026-04-06 |
| 32 | Cloudflare Worker: Range + Content-Length headers (render fix) | Worker deploy | 2026-04-06 |
| 33 | Teammate's agent-graph anti-hallucination + chat-agent rewrite | a60d5225 | 2026-04-06 |

---

## SECTION 6: TOTAL COUNTS

| Category | Count |
|----------|-------|
| Active bugs (CRITICAL) | 2 |
| Active bugs (HIGH) | 5 |
| Active bugs (MEDIUM) | 4 |
| Code exists but not wired | 7 |
| Dead code items | 4 |
| Features to build (Tier 0) | 7 |
| Features to build (Tier 1) | 7 |
| Features to build (Tier 2) | 4 |
| Features to build (Tier 3 — DaVinci) | 6 |
| Features to build (Tier 4 — Scale) | 6 |
| Features to build (Tier 5 — Modes) | 2 |
| UI gaps | 6 |
| Infrastructure items | 2 |
| Recently fixed (this session) | 21 |
| **TOTAL open items** | **56** |
| **TOTAL fixed this session** | **21** |
