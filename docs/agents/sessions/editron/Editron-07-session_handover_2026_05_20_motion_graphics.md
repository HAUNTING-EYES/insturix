---
name: session-handover-2026-05-20-motion-graphics
description: "MEGA SESSION: Visual Identity Engine architecture + template routing + signal resolver + StatCounter + 5 pipeline fixes + 4 overlay quality fixes. 15 files changed, 1068 insertions. Full investigation, 3 reviews, project audit. NEXT: editorial intent gate + caption emphasis."
metadata: 
  node_type: memory
  type: project
  date: 2026-05-20
  originSessionId: c2b86359-6f08-4d24-b337-e12536b29ffb
---

# Session Handover — 2026-05-20 (Motion Graphics Overhaul + Pipeline Fixes)

## READ THIS FIRST — What Happened

This session started as "Motion Graphics Overhaul" but expanded into a full-stack investigation, architecture design, and bug fix sprint. Three phases of work:

**Phase A:** Deep investigation into motion graphics (8 research agents: GSAP+Remotion, industry practices, existing code, Remotion skills DB, Phase G vision). Then 3 architecture reviews (CEO, Eng, Design). Then connected to ThinkForge's 47-signal creative doc system — visual identity is derived from the SAME signals as writing.

**Phase B:** Implementation — template routing in applyGraphic, signal-to-token resolver, StatCounter React component, OverlayType.MOTION_GRAPHIC wired into Remotion renderer.

**Phase C:** Testing on real projects (proj_GdjeOnsWL4cR and proj_HMKQa07M3Mnh) revealed 5 pipeline bugs + 4 overlay quality bugs. All fixed, reviewed, shipped.

---

## COMMITS THIS SESSION (on infrastructure-improvs-+Editron)

| Commit | Type | What |
|--------|------|------|
| `85d2442a` | feat | Visual Identity Engine foundation — template routing + signal resolver + StatCounter + theme context |
| `71934462` | feat | Wire StatCounter into Remotion renderer — OverlayType.MOTION_GRAPHIC + layer-content.tsx |
| `49bb9a20` | refactor | Remove dead shouldSuppressAtBoundary function (CEO confirmed) |
| `42ad5013` | fix | 5 critical Mode 2 bugs: QStash retries=0, Director atomic idempotency, recovery cron, captions, label |
| `d9659bbc` | fix | 4 overlay quality bugs: template text bleed, caption zone, budget tracking, template variety |

**Total: 15 files changed, +1068 / -131 lines. All pushed to GitHub.**

---

## NEW FILES CREATED

| File | LOC | Purpose |
|------|-----|---------|
| `lib/editron/data/motion-theme-resolver.ts` | 290 | Pure deterministic rule engine: 8 content signals → 35 visual design tokens. No AI. Tested against 3 archetypes (tech/wedding/fitness). |
| `lib/editron/motion-graphics/types.ts` | 70 | StructureType union, content interfaces (StatCounterContent, LowerThirdContent, etc.), StructureComponentProps |
| `lib/editron/motion-graphics/context/MotionThemeContext.tsx` | 37 | React context for MotionTokens. Wraps all structure components. Ensures 3 Laws of Cohesion. |
| `lib/editron/motion-graphics/themes/minimal-tech.ts` | 64 | Static reference theme for testing. Generated from signals: formality=0.2, enthusiasm=0.6, warmth=0.3. |
| `lib/editron/motion-graphics/structures/StatCounter.tsx` | 239 | Remotion-native animated counter. interpolate() + Easing for entrance/exit/counter. Theme-driven styles. CRG min font 72px. |
| `components/.../motion-graphic/motion-graphic-layer-content.tsx` | 68 | Renderer dispatching MOTION_GRAPHIC overlays to structure components via MotionThemeProvider. |

---

## MODIFIED FILES

| File | Changes |
|------|---------|
| `lib/editron/services/edl-executor.ts` | Template routing in applyGraphic (findBestTemplate before inline CSS). mapDecisionParamsToSlots + fillTemplateWithSlotValues helpers. MOTION_GRAPHIC overlay for stat-counter. Keyword-highlight: cleared unfilled text slots, moved to top 10%, budget tracking fix. usedGraphicTemplateIds for variety. |
| `lib/editron/services/motion-graphics-service.ts` | findBestTemplate accepts optional usedTemplateIds Set, 0.3x penalty for already-used templates |
| `components/.../types.ts` | OverlayType.MOTION_GRAPHIC enum + MotionGraphicOverlay interface + union member |
| `components/.../layer-content.tsx` | New case for MOTION_GRAPHIC → MotionGraphicLayerContent |
| `app/api/services/editron/auto-edit/from-asset/route.ts` | Upstash-Retries: '1' → '0' (stops double-dispatch) |
| `app/api/cron/recover-stuck-projects/route.ts` | Added 'transcribing' and 'cleaning' to ACTIVE_AUTO_EDIT_STATES |
| `app/api/internal/workers/director/route.ts` | Atomic findOneAndUpdate idempotency gate (replaces unconditional updateOne) |
| `lib/editron/services/media/caption-service.ts` | 0-word segments return empty gracefully instead of throwing |
| `lib/editron/data/decision-registry.ts` | stat-counter: added 'label' to requiredParams and defaultParams |

---

## ARCHITECTURE: Visual Identity Engine

### The Core Insight
Visual identity is derived from the SAME 47-signal system as ThinkForge's creative writing. Not a separate 4-score model. The signals that make writing warm also make graphics warm.

### How It Works
```
47 Content Signals (from creative writing system)
  → resolveMotionTokens() selects 8 launch signals
  → deterministic rule engine (lerp + threshold rules)
  → 35 visual design tokens (animation, typography, color, surface, layout)
  → applied to Structure components via React context
  → rendered by Remotion (interpolate + Easing, Lambda-safe)
```

### 8 Launch Signals
formality (-1 to +1), enthusiasm (0-1), warmth (0-1), emotional_arousal (0-1), pacing_velocity (0-1), humor (0-1), visceral_impact (0-1), visual_dependency (0-1)

### 35 Token Categories
- **animation**: entranceEasing, exitEasing, emphasisEasing, durations, stagger, overshoot, entrance/exit patterns
- **typography**: heading/body/mono families, weights, tracking, transform, sizeScale
- **color**: primary, accent, text primary/secondary, surface base/opacity, temperature
- **surface**: style (glass/solid/minimal/gradient), backdropBlur, cornerRadius, border, shadow
- **layout**: density, maxSimultaneous, holdDuration, alignment, paddingScale

### Tested Against 3 Archetypes
| Token | Tech (f=0.2) | Wedding (f=0.8) | Fitness (f=-0.5) |
|-------|-------------|----------------|-----------------|
| Easing | power3.out (snappy) | power1.inOut (gentle) | elastic (bouncy) |
| Duration | 378ms | 621ms | 195ms |
| Weight | 560 (medium-bold) | 390 (light) | 700 (bold) |
| Surface | glass | minimal | solid |
| Radius | 8px (moderate) | 15px (rounded) | 8px (moderate) |

### 6-Level Scope Hierarchy (from ThinkForge creative doc)
BRAND DNA → CAMPAIGN → FORMAT → PROJECT → ACT → SCENE
CSS cascade model — more specific wins. Same hierarchy for both writing and visual identity.

### 3 Laws of Cohesion
1. **Kinetic Unity**: All easing shares one personality
2. **Material Consistency**: All elements share one physical universe
3. **Proportional Hierarchy**: All proportions share one ratio system

### 12 Visual Identity Dimensions (from Director research)
Kinetic Energy, Typographic Weight, Chromatic Relationship, Geometric Language, Spatial Behavior, Material Quality, Opacity/Layering, Information Density, Rhythm/Cadence, Compositional Respect, Transition Philosophy, Self-awareness

---

## GSAP + REMOTION INTEGRATION (Research Complete, Implementation Deferred)

### Proven Pattern: Paused Timeline + Seek
```typescript
const tl = gsap.timeline({ paused: true });
tl.from(".title", { opacity: 0, y: 50, duration: 0.8, ease: "elastic.out(1,0.5)" });
tl.seek(frame / fps); // called every Remotion frame
```

### Why Deferred
Eng review flagged E2: useEffect timing on Lambda. `html-scene-layer-content.tsx:122` documents: "useEffect may fire after the screenshot is taken." GSAP timeline created in useEffect would miss the frame capture. Current StatCounter uses Remotion native `interpolate()` + `Easing.bezier()` — proven on Lambda.

### When to Revisit
After Lambda testing confirms the paused+seek pattern works. Then upgrade StatCounter and add SplitText (character animation), MorphSVG (shape morphing). All GSAP plugins are free since 2025.

### Key GSAP Easing Presets
- `back.out(1.7)` — signature premium pop-in with overshoot
- `power2.out` — sweet spot for most UI
- `elastic.out(1, 0.3)` — bouncy with configurable amplitude/period
- `power4.out` — dramatic deceleration for reveals
- `gsap.parseEase()` — extract any easing as pure function for Remotion's `interpolate()`

---

## PIPELINE BUGS FOUND + FIXED

### BUG 1 (P0): Double Director Dispatch [FIXED]
**Root cause:** `from-asset/route.ts:220` dispatched video-analysis with `Upstash-Retries: '1'`. Analysis takes 7-9 min. QStash timed out, fired retry. Two analyses → two Directors → second overwrote first (full $set on overlays).
**Fix:** `Upstash-Retries: '0'`. Recovery cron handles genuine failures.
**Blast radius:** Every Mode 2 project where analysis exceeded QStash timeout was losing clips.

### BUG 2 (P0): No Director Idempotency [FIXED]
**Root cause:** `director/route.ts:64` did unconditional `updateOne({ $set: { autoEditStatus: 'directing' } })` with no precondition check. Two Directors could both proceed.
**Fix:** Atomic `findOneAndUpdate` with `{ autoEditStatus: { $in: ['analysis_complete', 'directing_queued'] } }`. Only one wins. Loser gets null, returns early.

### BUG 3 (P1): Recovery Cron Missing States [FIXED]
**Root cause:** `recover-stuck-projects/route.ts` ACTIVE_AUTO_EDIT_STATES didn't include 'transcribing' or 'cleaning'. Crash during either = permanently stuck.
**Fix:** Added both states to the list.

### BUG 4 (P1): Caption "No Speech" Throw [FIXED]
**Root cause:** `caption-service.ts:315-320` threw "No speech found" for segments with 0 words. Visual-only segments (silence-removal kept visual, no speech) are expected, not errors.
**Fix:** Return `{ captions: [], words: [], displayConfig }` instead of throwing.
**NOTE:** The "0 segments" in Director logs for segments WITH words is a LOGGING bug — captions ARE saved correctly to MongoDB. The Director reads the return value wrong but data is fine.

### BUG 5 (P2): Stat-Counter Empty Label [FIXED]
**Root cause:** `decision-registry.ts:393-394` had `requiredParams: ['text', 'endValue']` — no 'label'. Gemini never outputs 'label' because it's not in the prompt.
**Fix:** Added 'label' to requiredParams and defaultParams.

---

## OVERLAY QUALITY BUGS FOUND + FIXED

### BUG 6: Template Default Text Bleed-Through [FIXED]
**Root cause:** `edl-executor.ts:922-929` — `mapDecisionParamsToSlots` keyword-highlight case only fills first text slot. Template `co-feature-highlight-004` has body/description slot with default "Work together with your team in real-time, no conflicts." This marketing copy renders ON SCREEN.
**Fix:** Clear all unfilled text-type slots to empty string: `for (const s of template.slots) { if (s.type === 'text' && !slots[s.name]) slots[s.name] = ''; }`

### BUG 7: Keyword-Highlights in Caption Zone [FIXED]
**Root cause:** `edl-executor.ts:1139-1143` — both positioning branches put keywords at 68% or 82% of canvas height (bottom zone). CRG constraint:overlay.graphic_in_caption_zone violated.
**Fix:** `top = isPortrait ? canvas.height * 0.12 : canvas.height * 0.10` (top 10-12%, clear of captions)

### BUG 8: Budget Counter Stuck at 0/30 [FIXED]
**Root cause:** `edl-executor.ts:297-303` — `onScreenText-safety-net` decisions bypassed `budget.evaluate()` entirely. Counter only increments via evaluate. Budget showed `keywordGraphics: 0/30` despite 11 placed.
**Fix:** Run evaluate for ALL decisions (including safety-net) but only reject non-script graphics. Counter now accurate.

### BUG 9: No Template Variety [FIXED]
**Root cause:** `motion-graphics-service.ts:373-391` — `findBestTemplate` is deterministic. Same query always returns same highest-scoring template. Only `co-feature-highlight-004` matches "keyword highlight".
**Fix:** Added `usedTemplateIds?: Set<string>` parameter. Already-used templates get 0.3x score penalty. EDL executor tracks used templates per execution run.

---

## CEO + DIRECTOR REVIEW FINDINGS (Critical for Next Session)

### "The overlay system lacks editorial intent"
The system answers "what CAN I put on screen" instead of "what SHOULD be on screen." 11 keyword-highlights on a contemplative talk-to-camera video = visual spam. The fixes shipped are guardrails. The deeper fix is an editorial intent gate.

### The 10-Star Version (for this specific video)
5 total overlays, not 56:
1. Opening lower-third (0:02): "Hank Green" + "Vlogbrothers"
2. Pull-quote card: "0.02%" filling the screen (thesis statement)
3. Animated stat: 100K people in a room (visual dots metaphor)
4. Caption emphasis: bold/color WITHIN existing captions for key phrases
5. End card

"The 10-star version is defined by what it removes."

### Key Principles from Director Research
- **Detection is not intent.** Finding a keyword ≠ that keyword needs visual emphasis.
- **"Do nothing" must be a confident decision.** For many clips, zero overlays is correct.
- **Caption emphasis > separate overlays** for keyword emphasis in talk-to-camera content.
- **Every overlay must have a rationale** that can be audited. "I found a keyword" is not valid.
- **No generated text in overlays** — only quoted text or user-provided. "100,000 Viewers" when speaker said "people in a room" is editorializing.

---

## COMPETITIVE POSITIONING

### The Gap Nobody Fills
| Tier | Who | What |
|------|-----|------|
| 1 | Canva, Envato | Template swap |
| 2 | Creatomate, Plainly | API-parameterized templates |
| 3 | Synthesia, Runway | AI video, brand as afterthought |
| **4** | **Nobody** | **Generates complete motion design language from brand DNA** |

### The Moat
The tuned signal-to-visual mapping database. Architecture is describable; mappings are not copyable. 12-18 month window before Canva could replicate.

### TG = Brands and Agencies (user clarified)
Creators are lower priority. BRAND DNA and CAMPAIGN are primary entry points.

---

## OPEN ISSUES (Priority Order for Next Session)

### P0 — Editorial Intent Gate
Every graphic decision must answer: "What editorial purpose does this serve?" Options: emphasis (stat), introduction (person), topic_shift, emotional_beat. "I found a keyword" → reject. This is the single highest-leverage change.

### P0 — Caption Emphasis System
80% of "keyword emphasis" should be bold/color WITHIN the caption renderer, not separate overlay layers. Requires: caption renderer changes to support per-word styling (font-weight, color, scale). The data is already there (word-level timing exists).

### P1 — Content-Type-Aware Graphic Density
Talk-to-camera: 2-3 graphics max. Data explainer: 6-8 allowed. Montage: more. The Creative Brief already detects content type (C-05 interview, confidence=0.75). Wire this to graphic budget caps.

### P1 — SFX Quality
Same shimmer ×3 = bad. SFX should match editorial beats: impact on hard cuts, bass on topic pivots, ding on stat reveals. `audioDescriptionToSearchQuery` needs per-decision-type SFX mapping.

### P2 — More Structure Components
LowerThird, CalloutBox, KeywordHighlight, QuoteBlock as React components (Remotion native). Each reads from MotionTokens context.

### P2 — Signal Extraction
Currently `decision.params.signals` is empty (defaults used). Need to extract actual signals from video analysis (speech pace → pacing_velocity, visual energy → emotional_arousal, etc.) and pass to resolveMotionTokens.

### P2 — GSAP Lambda Testing
Test the paused-timeline+seek pattern on Lambda. If it works: upgrade StatCounter, add SplitText for character animation. If not: stay on Remotion native.

### P3 — Brand Inputs
No brand colors/fonts passed yet. Need Brand Studio UI or URL extraction to feed into resolveMotionTokens brand parameter.

---

## RESEARCH FINDINGS (Reference for Future Sessions)

### Industry Motion Graphics (2026)
- After Effects still standard but Remotion + AI gaining fast
- "Dynamic Minimalism" trend: retain mechanics, strip noise
- 6 premium differentiators: custom easing, staggered entry, anticipation+overshoot, audio sync, typography consistency, exit animations
- Claude Code + Remotion is a documented production workflow

### GSAP Easing = Single Biggest Quality Differentiator
- `back.out(1.7)` for premium pop-in
- `power2.out` for professional default
- `elastic.out(1, 0.3)` for playful bounce
- CSS can't do elastic/bounce with configurable parameters
- All GSAP plugins FREE since Webflow acquisition (2025)

### Remotion Skills Database (254 Components)
Location: `remotion-skills-database-main/` (may not be on disk — check)
- 13 CTAs, 12 borders, 36 backgrounds, 133 heroes, 7 comparisons
- All frame-deterministic TSX using Remotion native APIs
- Missing: lower thirds, stat counters, caption bars (we built these)
- Animation primitives (spring, stagger, sine breathing) are reusable

### CRG Overlay Constraints (Query Before Any Graphic Work)
- `constraint:overlay.visual_clutter` — max 2 non-caption overlays simultaneously
- `constraint:overlay.graphic_in_caption_zone` — bottom 15-25% reserved
- `constraint:overlay.graphic_too_small` — min 72px text @1080p
- `constraint:overlay.graphic_animation_inconsistency` — one animation style per video
- `constraint:overlay.overlay_spatial_overlap` — max 20% area overlap

---

## MAIN vs INFRA BRANCH DIVERGENCE (Checked 2026-05-20)
- Main has 114 commits infra doesn't (dashboard UI redesigns, UploaderX fixes, billing)
- Infra has 291+ commits main doesn't (all Editron pipeline work)
- Dashboard files: 64 files, +2,216 / -11,868 lines diverged
- User decision: defer merge, test MG first. Merge later.

---

## PROJECTS TESTED THIS SESSION

| Project | Video | Duration | Key Finding |
|---------|-------|----------|-------------|
| proj_GdjeOnsWL4cR | Vlogbrothers | 4.2 min (should be ~10) | Double-dispatch caused 7 clips lost. Old deployment (pre-fix). |
| proj_HMKQa07M3Mnh | Same video, re-processed | 9.1 min (correct) | Single Director, 38 clips, templates working, MOTION_GRAPHIC rendered. 11 keyword-highlights = spam. |

---

## RULE VIOLATIONS CAUGHT THIS SESSION (Self-Audit)

1. **Rule 1 (dead code):** Didn't clean shouldSuppressAtBoundary before structural edits. Fixed later.
2. **Rule 9 (post-edit read):** Didn't re-read after every edit initially. Fixed mid-session.
3. **Rule 4 (forced verification):** Initially ran only tsc, not eslint. Fixed — both run on every change after.
4. **Pre-edit hook:** Answered fully per logical group, not per individual Edit call. Improved over session.
5. **Assumed cuts were bad** without reading the actual transcript. User corrected — cuts are near-perfect.

---

## CROSS-REFERENCES
- [[motion-graphics-investigation]] — Full 8-agent investigation + 12 dimensions + 10 archetypes + 3 Laws
- [[mg-reviews-2026-05-19]] — CEO + Eng + Design reviews with specific verdicts
- [[creative_content_doc_research]] — 47 signal taxonomy (same signals drive visual identity)
- [[creative_doc_scope_system]] — 6-level scope hierarchy with cascade
- [[vision_execution_craft_gap]] — The gap this session addresses
- [[session_handover_2026_05_19_mode2_intelligence]] — Previous session's Mode 2 work (Decision Registry, Creative Brief rewrite)
