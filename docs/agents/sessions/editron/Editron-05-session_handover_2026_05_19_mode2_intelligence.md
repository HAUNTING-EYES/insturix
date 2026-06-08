# Session Handover — 2026-05-19 (Mode 2 Intelligence + Execution Layer)

## READ THIS FIRST — What This Session Was About

Mode 2 (uploaded footage) video output was garbage: zero intelligence, identical zooms, placeholder graphics, no SFX, 4 minutes of black screen. We fixed 12 pipeline bugs, built a Decision Registry architecture, rewrote the creative brief prompt, and identified that the REAL gap is execution craft, not intelligence.

**The one-line summary:** The system now makes smart decisions about WHAT editing to apply and WHERE. But it renders everything as CSS boxes and random Freesound clips. The intelligence is 8/10. The execution craft is 4/10.

---

## What Shipped (10 commits, all on `infrastructure-improvs-+Editron`)

### Architecture Commits
| Commit | What | Impact |
|--------|------|--------|
| `98371059` | **Decision Registry** — `lib/editron/data/decision-registry.ts`. 40 entries. Plugin architecture: add editing feature = add one object. Prompt, validation, budget, execution all read from it. | Foundation for all future editing features |
| `1e7a9d5a` | **Gemini 3.1 Pro Thinking model** — replaced 2.5 Flash. Context caching verified. 100% video coverage vs 27%. | Creative brief quality 10x improvement |
| `ce82037c` | **Path E/D single-execution** — `!pathDHandled` gate. Path E (creative brief) is primary, Path D (signal executor) is fallback only. | Prevents conflicting decisions |

### Bug Fix Commits
| Commit | Bug | Root Cause |
|--------|-----|------------|
| `28fd5d76` | Path D/E dead zone, hook zone kills 53% zooms, transition suppression kills 100%, SFX gate blocks everything | USE_CREATIVE_BRIEF skipped 5-Track → analyses empty → both paths dead. Hook zone per-clip not per-video. Color similarity wrong for single-source. |
| `488f9ab6` | Budget allows 246 transitions, 123 captions for 10-min video | Genre param transition_density=25 uncapped. Caption derived from transitions. |
| `31104e7a` | Gemini output truncated at 27% of video | maxOutputTokens not set (defaulted to 8192). |
| `4a56e58b` | Brief executor discards 59% of decisions. Motion graphics show "minimal text label". SFX type 'sfx' not handled by EDL. | totalDurationMs used post-cut duration. Description map missing. Pre-resolve only checked 'sfx-trigger'. |
| `e5e6c23d` | SFX defaults to 'whoosh' when no type | Silent guess instead of skip with warning. |
| `ae34174b` | 4 min darkness. Graphics wrong type (all keyword-highlight). SFX returns marimba for "ambient". | durationInFrames not updated after silence removal. graphicType read from wrong field. audioDescriptionToSearchQuery bypassed. |
| `d58f722a` | Caption-emphasis returns null (16 decisions wasted). Decisions land in removed content gaps. | Handler explicitly disabled. No original-to-cut frame mapping. |
| `aa71569e` | Empty caption placeholders. Duplicate HTML scenes. Wav2Vec batch timeout. | Guard skipped if any captions exist. No dedup in add_motion_graphic. Uniform 90s timeout. |
| `22000552` | Caption-emphasis crashes: "canvasDimensions is not defined" | Variable name mismatch: `canvasDimensions` vs `canvas` in different function scope. |

### Test Results Across Session
| Metric | Session Start | Session End |
|--------|--------------|-------------|
| Path E | Never ran | 46 decisions, 0 filtered, 100% coverage |
| Duration | 4 min (should be 9) | 8.9 min (correct) |
| Decisions → overlays | 0/0 | 17/34 (50%) |
| Zoom variety | All 1.0→1.1 | 5 unique patterns |
| SFX | 0 | 3 (shimmer, impact, whoosh) |
| Graphics | Generic CSS boxes | Correct types (stat-counter, keyword-highlight) |
| Captions | Empty placeholders | 40 populated with word-level timing |
| Frame mapping | None | 34 mapped, 7 snapped from gap |

---

## How the Mode 2 Pipeline Works Now

```
Upload → Grok STT (transcription) → Transcript Editor (Gemini cuts retakes/filler)
→ Silence Removal (cuts overlays) → Visual Understanding (Gemini watches video)
→ V-JEPA (visual significance) → Wav2Vec (vocal emotion) → Segment Analysis (unified)
→ Director Worker:
    → Path E: Creative Brief (Gemini 3.1 Pro Thinking)
        → Genre params computed (per-video, signal-driven)
        → Decision Registry provides signal→technique map to prompt
        → 5-pass validation (type, reason, params, budget, distribution)
        → Brief Executor maps word indices → frames (original→cut timeline)
        → Constraint Enforcer (50 constraints from creative graph)
        → EDL Executor applies to overlays
    → If Path E fails: Path D (signal executor, 95 graph mappings, deterministic)
    → Post-Path actions: filters, captions, motion graphics, quality review
```

### Key Files (Read These First in New Session)
| File | What it does | LOC |
|------|-------------|-----|
| `lib/editron/data/decision-registry.ts` | **NEW** — Single source of truth. 40 signal→technique mappings. | 620 |
| `lib/editron/services/creative-brief.ts` | Builds Gemini prompt, validates output, computes budgets. Full rewrite this session. | ~500 |
| `lib/editron/agent/director-agent.ts` | Orchestrates Path E, Path D, profile actions. Most-edited file. | 5000+ |
| `lib/editron/services/edl-executor.ts` | Applies EDL decisions to overlays. Zooms, transitions, SFX, graphics. | 1200+ |
| `lib/editron/services/brief-executor.ts` | Resolves word indices → frames. Original-to-cut frame mapping. | ~310 |
| `lib/editron/services/gemini-context-cache.ts` | Caches creative doc in Gemini. Model: gemini-3.1-pro-preview. | ~175 |

---

## Architecture Decisions Made This Session

### 1. No Profiles in Mode 2 Creative Decisions
User explicitly stated Mode 2 is signal-driven, not profile-driven. Genre parameters (9 per-video numbers computed from actual audio/speech signals) replace the 54-profile system. The content type detector maps to profileIDs but that's ignored by the creative brief. Profiles still run for post-processing (filters, captions).

### 2. Decision Registry as Plugin Architecture
Adding a new editing feature = adding one object to `DECISION_REGISTRY` array. The system automatically: includes it in the Gemini prompt, validates it in output, counts it against the right budget, enforces per-type caps, maps it to EDL execution. No code changes for new features.

### 3. Per-Video Genre Parameters, Not Categories
Every video is unique. "Talking head" is a label, not an editing strategy. Genre params are computed from THIS video's actual signals (speech rate, energy, formality, filler rate). The creative brief prompt shows these numbers to Gemini as guardrails, not rules.

### 4. Two-Tier Signal-Decision Map
The creative brief prompt shows Gemini a filtered subset of the decision registry. Tier 1 (active signals detected in this video) gets full entries with params, hints, constraints. Tier 2 (rest of registry) gets compact one-liners so Gemini can still use them if it spots something the signal pipeline missed.

### 5. Original-to-Cut Frame Mapping
Word timestamps reference the original video (before silence removal). Overlays are on the cut timeline (after). `mapOriginalFrameToCutTimeline()` in brief-executor uses `sourceStartFrame` on each clip to convert. Decisions in removed gaps snap to nearest clip boundary (5s tolerance) or skip with warning.

---

## What's Broken / Known Issues

### P0 — Must Fix Soon
| Issue | Details | File |
|-------|---------|------|
| **Transitions can't find clip boundaries** | Frame mapping maps to cut-timeline positions but transitions need clip BOUNDARY (gap between clips) within 45 frames. Most decisions land inside clips, not at boundaries. | edl-executor.ts |
| **Caption-emphasis just shipped** — needs re-test | Variable name fix pushed. Should produce keyword-highlight pop-ups on emphasis words now. | edl-executor.ts |
| **Templates not seeded** | 30 templates exist in code but `motionGraphicTemplates` MongoDB collection is empty. Run: `npx tsx scripts/seed-motion-graphics.ts` | scripts/seed-motion-graphics.ts |

### P1 — Pipeline Bugs
| Issue | Details |
|-------|---------|
| Constraint enforcer kills 87-91/93 Path D decisions | Thresholds calibrated for Mode 1 multi-source, too aggressive for Mode 2 single-source |
| Quality review scores 0/100 | 51 technical checks, zero aesthetic. Needs rhythm/color/hook/accessibility |
| Genre param cold-start: transition_density=25 | When analyses empty, defaults to max. Budget caps it but source is wrong |
| `from-asset/route.ts:229` hardcodes profileId A-01 | Mode 2 shouldn't start with profile ID |
| `shouldSuppressAtBoundary` is dead code | CEO review says delete. Function defined but never called. |
| Dead workers: graphiti-episode 404, graph-sync 400 | Pre-existing, not editing-related |
| 22 DaVinci transition types untested | From A3 audit |
| Wire editronConfig.ts into all services | 100+ hardcoded values still unwired |

### P2 — Architecture/Features
| Item | Status |
|------|--------|
| Motion Graphics Overhaul (GSAP, Remotion, content-aware) | **NEXT — research phase** |
| Quality Review Overhaul (aesthetic checks) | Planned |
| Audio Design Pipeline (ambient beds, risers, impacts) | Planned |
| Editorial DNA (creative brief outputs style guidance) | Planned |
| Caption Styling (per-word emphasis in renderer) | Planned |
| Transition Research (professional approaches) | Planned |
| Gemma 4 fine-tuning for transcript editor | Planned |
| Profile removal from Mode 2 post-actions | Planned |
| Phase G SaaS Motion Graphics Engine | Vision exists, unbuilt |

---

## The Strategic Gap — "Execution Craft"

**Saved to:** `memory/vision_execution_craft_gap.md`

The system makes decent decisions (WHERE to edit) but has no craft (HOW to execute).

| What the system does | What it should do |
|---------------------|-------------------|
| Stat counter = CSS dark box with text | Count UP with momentum easing, glow, scale |
| Keyword highlight = pill with green dot | Elastic bounce, branded font, color-shift |
| Transitions = zero placed | Dissolves at topic shifts, fades at chapters, SFX paired |
| SFX = 3 random Freesound clips | Ambient bed, transition sounds, risers, impacts synced |
| Captions = uniform subtitles | Word-by-word reveal, emphasis scaling, color by emotion |
| Color = film-portra everywhere | Adapt to scene emotional temperature |
| Every video looks the same | Each video has its own editorial identity |

**Three pillars needed:**
1. **Editorial Voice** — creative brief outputs an editorial PHILOSOPHY per video, not just decisions
2. **Execution Craft** — GSAP animations, template system, synced audio design, styled captions
3. **Adaptive Technique Selection** — decision registry with conditions (technique varies by video identity)

**User's vision:** "I want our system to be capable to understand what video and user wants and actually make that happen. Anything. Everything. For anyone."

---

## Motion Graphics System Status

### Layer 1: 30 Templates (In Code, NOT in MongoDB)
- File: `lib/editron/data/motion-graphic-templates.ts` (1241 LOC)
- 5 lower thirds, 5 title cards, 5 callouts, 5 data viz, 5 social, 5 lists
- CSS keyframes only (no GSAP, no animated counters, no elastic easing)
- Slot-fill via Gemini Flash (~200ms)
- Template search via MongoDB text index + regex fallback
- **NOT SEEDED** to MongoDB. Run: `npx tsx scripts/seed-motion-graphics.ts`
- Grade: A for structure, D for Hormozi-level quality

### Layer 2: Remotion Reference (254 files, NOT integrated)
- Location: `D:\google downloads\Front-End-main\remotion-skills-database-main\`
- 254 markdown-described React components from 21st.dev, magic-ui, motion-primitives
- Categories: 12 borders, 13 CTAs, 7 comparisons, 36 backgrounds, 19 docks, 25 footers, 133 heroes
- Zero code integration. Sitting as raw reference material.

### Layer 3: Phase G (Unbuilt)
- Vision in: `memory/phase_f_g_saas_motion.md`
- Vector/SVG engine, 15 UI primitives, 10 template rigs, spring physics, audio-to-marker sync

### Current Pipeline: Creative Brief Graphic → EDL Executor → Inline CSS
- Creative brief outputs `graphic_stat_counter` with `params: { text: "$50K", endValue: 50000 }`
- Brief executor maps to EDL type `graphic`
- EDL executor's `applyGraphic()` reads `graphicType` from `decision.technique` (our fix)
- Renders hardcoded inline CSS per type (stat-counter, callout, lower-third, etc.)
- Template system (`findBestTemplate`) is only reached via profile action `add_motion_graphic`

### What Needs to Change
- Route `applyGraphic` through template system instead of inline CSS
- GSAP for professional easing (bounce, elastic, custom curves)
- Animated counter component (count from 0 to N with acceleration)
- Content-aware slot-fill (pass transcript context, scene colors, speaker energy)
- Connect 254 Remotion reference components

---

## Freesound API Key
- **Working key in .env.local:** starts with `dUHks0WO`, 40 chars
- **User provided client secret:** `QEyNRaid7kDyvCEsFUVyvumFrwqRg0WboDPAmOms` — this is NOT the API key for token auth
- **Verify Vercel has the correct key**, not the client secret
- SFX search now goes through `audioDescriptionToSearchQuery()` for KB token mapping

---

## CEO Reviews Conducted This Session

### Transition Suppression Removal — KEEP
Verdict: removal is correct. Color similarity gate solved a theoretical problem that doesn't exist in single-source footage. Professional editors place transitions based on narrative intent, not color similarity. Four independent budget layers already constrain transitions. The function `shouldSuppressAtBoundary` is now dead code — should be deleted.

### Quality Review Standards — NEEDS OVERHAUL
51 technical checks, zero aesthetic. Measures "does it work?" not "does it look good?" Missing: rhythm shape (build/peak/release), color grading quality (skin tone on I-line), hook strength (first 2s), energy trajectory alignment, accessibility (flash rate, contrast), platform-specific pacing, AI-tell detection (metronomic beat-lock). Scoring is flat deduction (100 - issues) with no severity scaling.

### Motion Graphics — STRUCTURALLY SOUND, CREATIVELY BASIC
30 templates, clean slot-fill architecture, MongoDB search works. But CSS-only animations, no GSAP, no content awareness, no animated counters, no letter animation. Grade: A for code quality, D for Hormozi-level output.

---

## Key Learnings From This Session

1. **The execution layer is the bottleneck, not intelligence.** Creative brief makes good decisions. They die or render ugly in the EDL executor.
2. **Frame coordinate spaces are fundamental.** Word timestamps = original video. Overlays = cut timeline. Every decision must be mapped between these spaces. `sourceStartFrame` on each overlay enables this.
3. **Gemini 3.1 Pro Thinking vs 2.5 Flash is a 10x quality difference.** Flash: 246 jump_cuts at 62/min. Thinking: 34 decisions across 12 types with 100% coverage.
4. **Budget formulas from genre params need caps.** transition_density=25 (raw signal max) * 10 minutes = 250 transitions. Must cap at professional editing rates.
5. **`saveProject` is unreliable for backend-computed fields.** The overlay merge/URL-strip pipeline can lose fields. Direct MongoDB `$set` is the belt-and-suspenders fix.
6. **"return null" handlers are silent feature killers.** `case 'caption-emphasis': return null` killed 36% of all creative decisions. Always check what switch cases return null.
7. **Variable scope matters across function nesting.** `canvasDimensions` exists in `executeEDL` but the switch case runs inside `applyDecision` where it's called `canvas`. TypeScript doesn't catch this because it's passed via `any`-typed spread.
8. **The user's vision is "anything for anyone," not "Hormozi for everyone."** The system should adapt its editorial language to match each video's identity. A meditation video gets gentle edits. A product launch gets aggressive ones.

---

## Next Session: Start Here

### Priority 1: Motion Graphics Research + GSAP Integration
- Web search: What do Hormozi/Iman/top agencies actually use?
- Research: GSAP + Remotion integration approaches
- Investigate: How to route EDL graphic decisions through template system
- Design: Content-aware slot-fill architecture
- Plan: Template upgrade roadmap (CSS → GSAP → Remotion components)

### Priority 2: Transition System Fix
- The 45-frame boundary matching is broken for Mode 2
- After frame mapping, transition decision frames land inside clips, not at boundaries
- Need to snap transitions to the nearest clip boundary specifically

### Priority 3: Audio Design Pipeline
- Ambient beds automatically placed
- Transition SFX paired with every dissolve/wipe
- Risers before reveals
- Impacts synced to zoom punches

### Before Starting Any Code
- Run `npx tsx scripts/seed-motion-graphics.ts` to seed template DB
- Verify Vercel has correct Freesound API key
- Test caption-emphasis fix (should produce keyword-highlight pop-ups now)
- Delete dead `shouldSuppressAtBoundary` function

---

## Projects Tested This Session
| Project | Video | Duration | Key Finding |
|---------|-------|----------|-------------|
| proj_1nzETeCiCUmF | Vlogbrothers 720P | 19.6 min raw → 9.8 min clean | Original test subject. Duration cascade (4 min output), zero intelligence. All bugs found here. |
| proj_14pCR5SHw1TL | Same video, re-processed | Same | Duration fixed (527s). Both paths fired (double-exec bug found). 5/12 decisions survived. |
| proj_t5xanESZclT6 | Same video, re-processed | Same | All 12 bugs fixed. 23/45 decisions survived. SFX placed. Graphics correct type. Caption-emphasis crashed (variable name). |
| proj_0MGDqociqDP2 | Same video, re-processed | Same | Latest test. 17/34 decisions survived (50%). Caption-emphasis variable fix shipped. Frame mapping working. Duration correct. |
