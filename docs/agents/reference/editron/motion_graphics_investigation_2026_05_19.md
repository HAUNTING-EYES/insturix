---
name: motion-graphics-investigation
description: Complete investigation into motion graphics overhaul. Visual Identity Engine architecture. Structure x Theme composable system. GSAP+Remotion integration. Industry research. 12 visual identity dimensions. 10 content archetypes. 3 Laws of Cohesion.
metadata: 
  node_type: memory
  type: project
  date: 2026-05-19
  originSessionId: 608fad11-f7dd-4801-a6f5-a3bbb1378ea4
---

# Motion Graphics Investigation — 2026-05-19

## THE CORE INSIGHT
30 templates is Canva. A system that GENERATES a complete motion design language from brand DNA is the gap nobody has filled. Structure x Theme composable architecture, not fixed templates.

## ROOT CAUSE: Two Parallel Pipelines
- **Path A (Creative Brief -> EDL Executor)**: Renders INLINE CSS in `edl-executor.ts:979-1225`. 6 hardcoded switch cases.
- **Path B (Profile Actions -> Agent Tools)**: Uses template system (`findBestTemplate` + `fillTemplateSlots`). 30 curated templates. Works well.
- `applyGraphic()` has ZERO imports from motion-graphics-service. The disconnect is surgical to fix.

## ARCHITECTURE: Visual Identity Engine

### Structure x Theme x Content
- **Structure** = anatomy of graphic type (lower-third = name + title + accent bar)
- **Theme** = visual language (easing, colors, fonts, surfaces, spacing)
- **Content** = actual data (names, numbers, text)
- N structures + M themes = N+M authored, N*M visual outcomes

### The 4-Score Model (from Director research)
- **Energy** (0-10): easing aggression, duration (100ms-800ms), stagger, density
- **Formality** (0-10): typography weight, surface treatment, color restraint
- **Warmth** (0-10): color temperature, corner radius, font personality
- **Self-awareness** (0-10): meta quality, interaction with footage

**NOTE**: 4 scores may be insufficient. ThinkForge creative doc has 47 signals. Visual identity may need more dimensions. Under review.

### 12 Dimensions of Visual Identity
1. Kinetic Energy (easing: elastic/smooth/sharp/linear/gentle)
2. Typographic Weight (heavy/medium/light/mono/handwritten)
3. Chromatic Relationship (extracted/complementary/brand-locked/monochrome/high-contrast)
4. Geometric Language (rectangular/rounded/circular/no-container/line-based/fragmented)
5. Spatial Behavior (grid-locked/rule-of-thirds/floating/screen-filling/peripheral)
6. Material Quality (glass/solid/paper/holographic/neon/invisible)
7. Opacity and Layering (dominant/balanced/subtle/ghost)
8. Information Density (minimal/standard/rich/dense)
9. Rhythm and Cadence (beat-synced/speech-synced/scene-anchored/constant/punctuation)
10. Compositional Respect (face-aware/content-integrated/autonomous/reactive)
11. Transition Philosophy (continuous/discrete/cascading/simultaneous)
12. Self-awareness (invisible/functional/stylized/self-referential)

### 3 Laws of Motion Graphics Cohesion
1. **Kinetic Unity**: All motion shares one easing personality
2. **Material Consistency**: All elements exist in one physical universe
3. **Proportional Hierarchy**: All proportions share one ratio system

### 10 Content-Type Archetypes
Each with specific easing, typography, color, material, density, rhythm recommendations:
- Tech Review: snappy ease-out 150-250ms, Inter/monospace, glass, speech-synced
- Motivational/Fitness: sharp 100-200ms, heavy condensed uppercase, solid, beat-synced
- Tutorial: smooth 250-400ms, humanist sans, semi-transparent, speech-synced
- Documentary: slow fade 400-700ms, serif, invisible material, scene-anchored
- Corporate/SaaS: smooth ease-out 200-350ms, geometric sans, frosted glass, script-synced
- Creative/Art: bespoke per piece, emotionally synced
- Cooking/Lifestyle: gentle 300-450ms, rounded humanist/serif, warm paper, action-synced
- Comedy: elastic bounce, bold playful, solid high-contrast, punchline-synced
- Wedding: ultra-gentle 500-800ms, elegant serif, invisible, moment-anchored
- Real Estate: smooth 200-300ms, geometric sans, frosted glass, room-synced

### Visual Identity Brief Schema (~35 tokens in 8 categories)
1. ANIMATION_PROFILE: easing, durations, stagger, overshoot, direction, exit style
2. TYPE_SYSTEM: families, weights, tracking, case, size scale
3. COLOR_STRATEGY: method, palette (primary/secondary/accent/bg), temperature
4. SHAPE_LANGUAGE: corner radius, container style, separator, icon style
5. MATERIAL: backdrop blur, shadow, texture, border weight/opacity
6. DENSITY_RULES: max simultaneous, hold duration, spacing, frequency
7. COMPOSITIONAL_RULES: placement zone, face avoidance, safe margin, alignment
8. COHESION_CONSTRAINTS: shared easing, shared radius, shared type, accent limit

## GSAP + REMOTION INTEGRATION

### Hybrid Approach (proven pattern)
- **Simple animations**: Remotion `interpolate()` + GSAP `parseEase()` for premium curves
- **Complex choreography**: Paused GSAP timeline + `seek(frame/fps)` on every frame
- **Physics bounces**: Remotion `spring()`
- **All GSAP plugins FREE** since 2025 (CustomEase, SplitText, MorphSVG)
- **GSAP already installed**: `gsap: ^3.13.0` in package.json, unused

### The useGSAPTimeline Hook
```typescript
function useGSAPTimeline(ref, builder, theme) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tlRef = useRef(null);
  useEffect(() => {
    const tl = gsap.timeline({ paused: true });
    builder(tl, ref.current, theme);
    tlRef.current = tl;
    return () => tl.kill();
  }, []);
  useEffect(() => { tlRef.current?.seek(frame / fps); }, [frame, fps]);
}
```

### GSAP Easing Presets That Matter
- `back.out(1.7)` — signature premium pop-in with overshoot
- `power2.out` — sweet spot for most UI
- `elastic.out(1, 0.3)` — bouncy with configurable amplitude/period
- `power4.out` — dramatic deceleration for reveals
- `CustomEase` — literally any curve via SVG path

## EXISTING CODE STATE

### 30 Templates (motion-graphic-templates.ts, 1241 LOC)
- Solid intermediate CSS: cubic-bezier(0.22,1,0.36,1), staggered delays, glassmorphism, SVG stroke
- Weaknesses: no exit animations, fake counters (visual, not actual count-up), fixed item counts, 1920x1080 only

### Template Service (motion-graphics-service.ts, 391 LOC)
- MongoDB-backed: text search + regex fallback
- `findBestTemplate()` + `fillTemplateSlots()` (LLM slot-fill)
- Score threshold 0.15 in add_motion_graphic tool (very permissive)

### EDL Executor applyGraphic() (edl-executor.ts:979-1225)
- 6 hardcoded types: stat-counter, callout, lower-third, quote-card, logo-reveal, keyword-highlight
- All render inline CSS
- Zero template system integration
- graphicType derived from decision.technique via string replace

### Decision Registry (5 graphic entries)
- graphic-stat-counter, graphic-lower-third, graphic-callout, graphic-keyword-highlight, graphic-logo-reveal
- All map edlType: 'graphic'

### Remotion Skills Database (254 components, UNINTEGRATED)
- Full TSX components using Remotion native APIs
- Categories: 13 CTAs, 12 borders, 36 backgrounds, 133 heroes, 7 comparisons, 7 clients
- Missing: lower thirds, stat counters, caption bars, transitions
- Animation primitives (spring, stagger, sine breathing) are reusable building blocks

## PROPOSED FILE STRUCTURE
```
lib/editron/motion-graphics/
  types.ts                    # All interfaces
  themes/                     # 8-15 theme definitions
    index.ts, minimal-tech.ts, bold-energy.ts, warm-organic.ts,
    cinematic-dark.ts, corporate-clean.ts, neon-gaming.ts,
    editorial-serif.ts, playful-rounded.ts
  structures/                 # 14 structure components
    StatCounter.tsx, LowerThird.tsx, CalloutBox.tsx, TitleCard.tsx,
    ProgressBar.tsx, FeatureHighlight.tsx, QuoteBlock.tsx,
    ComparisonTable.tsx, StepList.tsx, SocialProof.tsx,
    SubscribeCTA.tsx, NotificationPopup.tsx, DataChart.tsx, Timeline.tsx
  animations/                 # GSAP animation builders
    entrance.ts, exit.ts, emphasis.ts, counter.ts, text-reveal.ts, draw.ts, stagger.ts
  hooks/
    use-gsap-timeline.ts, use-motion-theme.ts, use-entrance-exit.ts
  context/
    MotionThemeContext.tsx
  utils/
    resolve-theme.ts, position-calculator.ts, font-loader.ts
```

## COMPETITIVE POSITIONING
| Tier | Who | Limitation |
|------|-----|-----------|
| 1 | Canva, Envato | Template swap only |
| 2 | Creatomate, Plainly | API-parameterized but template-bound |
| 3 | Synthesia, Runway | AI video, brand as afterthought |
| **4** | **Nobody** | **Generates complete motion design language from brand DNA** |

## IMPLEMENTATION PATH
1. VisualIdentityProfile + Token Resolution (foundation)
2. Structural Templates (refactor existing 30 → structural skeletons + var())
3. Pipeline Wiring (route applyGraphic through identity-aware system)
4. Brand Extraction (URL scraping, content-type inference, Brand Studio UI)

## INDUSTRY FINDINGS (2026)
- After Effects still standard but programmatic (Remotion + AI) gaining fast
- "Dynamic Minimalism" trend: retain mechanics, remove noise
- 6 premium differentiators: custom easing, staggered entry, anticipation+overshoot, audio sync, typography consistency, exit animations
- GSAP easing is the single biggest quality differentiator
- Remotion supports: Lottie (@remotion/lottie), Skia, Three.js, Rive. GSAP via custom hook.
- Claude Code + Remotion is a documented production workflow in 2025-2026

## CROSS-REFERENCES
- [[creative_content_doc_research]] — 47 signals may map to visual identity dimensions
- [[vision_execution_craft_gap]] — This investigation addresses the execution craft gap
- [[phase_f_g_saas_motion]] — Phase G vision aligns with this architecture
- [[editron_architecture_truth]] — Pipeline state and ROW layout
