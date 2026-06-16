---
name: Phase F + Phase G — Screencast & SaaS Motion Graphics Roadmap
description: New roadmap phases added 2026-04-16 — OpenScreen-powered screen recording + vector motion graphics engine for Beehiiv-level SaaS product demos. Triggered by user's "crazy tech" excitement + Beehiiv video breakdown.
type: project
last_updated: 2026-04-16
originSessionId: 6b272c7c-4888-4c9b-8caf-d84e6c03234f
---
# Phase F + Phase G — The SaaS Video Gap

**Trigger:** User uploaded `openscreen-main.zip` (Screen Studio OSS clone) + provided Beehiiv launch video breakdown via Gemini analysis. Both pointed at a gap in Editron's capabilities: **SaaS-grade product demo videos**.

**The gap in one sentence:** Pure AI text-to-video can't make SaaS demos. Text blurs, UIs hallucinate, cursor behavior is random, and micro-animations look amateur. For B2B SaaS marketing — the highest-paying ad vertical — Editron needs a different engine.

---

## Phase F — Screencast & Product Demo Mode

**Source:** `openscreen-main.zip` extracted at `reference-repos/openscreen-main/` (gitignored, 31 MB, MIT-licensed Electron app).

### F.1 — Mode 4: Screen Recording → Editron
User uploads `.mp4` from any screen recorder (OpenScreen, Loom, QuickTime). 5-Track analysis detects cursor position per frame. Auto-zoom decisions generated via cursor trajectory — not via Gemini's creative intent.
**OpenScreen code to port:** `src/components/video-editor/videoPlayback/zoomRegionUtils.ts`, `cursorFollowUtils.ts`
**Integration point:** extend 5-Track `Track 4 (Motion)` with cursor event detection. New decision type `cursor-follow-zoom`.

### F.2 — Intelligent Auto-Zoom from Cursor Trajectory
Rule-based (not AI) zoom suggestions: zoom in on cursor when it slows + pauses (user interaction), pull back when cursor moves fast (navigation). No Gemini calls, deterministic.
**OpenScreen code:** `src/components/video-editor/timeline/zoomSuggestionUtils.ts`, `videoPlayback/zoomTransform.ts`
**Editron integration:** new EDL decision type `cursor-zoom`, handled by EDL executor.

### F.3 — Motion Blur on Zoom-Punch Transitions
Current Editron zoom-punch transitions use CSS transforms → flat, harsh. OpenScreen has GPU-accelerated motion blur during camera movements.
**OpenScreen code:** `src/lib/blurEffects.ts`
**Editron integration:** port to Remotion composition. Apply during any scale keyframe change >10% delta.

### F.4 — Web-Based Screen Recorder (later)
Browser-based `getDisplayMedia()` + WebRTC recording, saved directly to Editron project. Skip the desktop download step.
**OpenScreen code:** `src/hooks/useScreenRecorder.ts` (adapt from Electron IPC to Web APIs)
**Effort:** 1 week MVP.

### F.5 — Native Desktop Client (far later)
Fork OpenScreen, rebrand as Editron Desktop, uploads recordings to cloud project. Electron app.
**Effort:** 4-6 weeks (full desktop app productization).

### F.6 — Cursor-Event Classification (subtle)
When cursor stops on a button vs. text vs. blank area → different zoom depth. Classify via on-screen element detection (DOM injection during recording, OR visual classification on upload).
**Effort:** 2 weeks (depends on approach).

---

## Phase G — SaaS Motion Graphics Engine (Beehiiv-level)

**Source:** Beehiiv launch video breakdown (Gemini analysis, 2026-04-16). Key insight: **pure AI video can't do this. A different engine is needed.**

### Why this phase exists

Pure AI text-to-video models (Kling, Seedance, Veo) have four fatal weaknesses for SaaS content:

| Problem | Why AI fails | What Phase G does |
|---|---|---|
| **UI text illegibility** | Pixel-based gen blurs text | Use SVG/vector layers with real fonts |
| **Temporal inconsistency** | Frame-to-frame drift (logo morphs) | Template rigs with fixed keyframes |
| **Micro-animation feel** | AI can't do "ease-in-out-back" precisely | Bezier interpolation, Disney 12 Principles |
| **Modular reuse** | Each AI gen is one-shot | Composable templates with swappable assets |

The Beehiiv video (34 seconds) has: envelope→phone morph, 2.5D rotation, app icon shimmer, push notification springy entrances, particle-style visual clutter, and a clean logo outro — all repeating templates with different assets. **Zero of this could be produced by AI video generation.**

### G.1 — Vector/SVG Rendering Engine
- Remotion already supports SVG + path animation (primitive exists, needs wrapping)
- **Path morphing**: animate `<path d="...">` attribute with keyframes (envelope flaps opening, phone frame fade-in)
- **SVG filter effects**: native CSS filters within SVG (blur, color, shadow)
- **Sharp scalable output**: rendered at any resolution without blur

**What to build:** `lib/editron/services/motion-graphics/svg-engine.ts` — wrapper around Remotion SVG primitives. Exports: `<MorphPath>`, `<VectorIcon>`, `<AnimatedText>`.

### G.2 — UI Primitives Library
Pre-built React components that accept brand props:

| Primitive | Example Props | Beehiiv moment |
|---|---|---|
| `<AppIcon>` | logo, background, shimmerColor, cornerRadius | [00:11] home screen icon |
| `<PushNotification>` | title, body, appIcon, entryDirection, springiness | [00:13] slide-down notification |
| `<PhoneFrame>` | variant (iPhone/Pixel/Generic), content, rotation | [00:02] morph target |
| `<BrowserFrame>` | url, theme (Safari/Chrome/Firefox), content | [00:07] "Add App" UI |
| `<DesktopFrame>` | os (macOS/Windows), menuBar, content | various |
| `<Envelope>` | closed, openAnimation, content | [00:00] hook |
| `<Cursor>` | position (x,y), click, trail | Phase F integration |
| `<Avatar>` | image, position, ring | [00:22] central avatar |
| `<TypingText>` | text, speed, cursor | typewriter reveals |
| `<StatusBar>` | time, battery, signal | phone context |

**What to build:** `lib/editron/motion-graphics/primitives/` — ~15 components, each with Remotion-native animation.
**Effort:** 2-3 weeks for the set.

### G.3 — Template Rigs (Composable Animation Patterns)
Pre-defined animation sequences with swappable assets. Each rig is a JSON descriptor + React composition.

| Rig | Animation | Swappable assets |
|---|---|---|
| `envelope-to-phone-morph` | Envelope opens → paper extracts → morphs to phone | brand logo, paper text, phone variant |
| `app-launch-splash` | Icon zooms from home screen → app opens | app icon, splash screen |
| `notification-cascade` | 3 notifications slide in with stagger | notification contents |
| `before-after-split` | Two panels, wipe reveal | left content, right content |
| `logo-reveal-clean` | Logo fade-in with tagline | logo SVG, tagline |
| `feature-highlight-loop` | Feature + label + arrow | feature image, label |
| `stat-counter-burst` | Number counts up with particle burst | start, end, prefix, suffix |
| `side-by-side-compare` | Competitor vs. you | left brand, right brand |
| `testimonial-card` | Quote fade + avatar + rating | quote, author, rating |
| `particle-clutter` | Multiple content windows float | window contents × N |

**What to build:** `lib/editron/motion-graphics/rigs/` — each rig is a folder: `rig.json` (descriptor + asset slots) + `composition.tsx` (Remotion component).

**LLM integration:** ThinkForge extracts rig intent from script ("show app icon appearing with shimmer"). Parser maps to rig ID. Finalize renders rig with user's brand assets.

### G.4 — Advanced Easing System
Beehiiv's "premium" feel comes from **custom Bezier curves** — not linear, not default ease.

**Curve library:**
- `ease-out-expo` (sharp start, smooth settle) — for reveals
- `ease-in-out-back` (overshoot+settle) — for pops and entrances
- `spring-stiff` (physics-based, high stiffness) — for notifications
- `spring-loose` (soft bounce) — for playful elements
- `anticipation` (pull-back before move) — Disney Principle 2
- `follow-through` (overshoot on stop) — Disney Principle 5
- `matrix-settle` (overshoot + oscillate + settle) — for numbers/stats

**Where it lives:** extend `components/editron/editor/version-7.0.0/utils/keyframe-evaluator.ts` with custom easing presets. Already has linear/ease-in/ease-out. Add spring physics (using `react-spring` math).

### G.5 — Audio-to-Marker Sync Engine
The Beehiiv video's visuals are TIMED to VO: a notification appears exactly when VO says "notifications." This is the single biggest quality multiplier.

**What it does:**
- Detect VO word boundaries (already have via Whisper/Deepgram transcription)
- Detect emphasis words (stress, pitch, volume peaks — via speech analysis)
- Generate "markers" per emphasis point
- Stretch/compress animation template to hit markers

**Example:**
- VO: "Get instant **notifications** right on your **home screen**."
- Markers: at "notifications" word → trigger notification slide-in rig; at "home screen" → trigger app icon shimmer rig
- Rig durations auto-fit the word-to-word timing

**What to build:** `lib/editron/services/motion-graphics/audio-marker-sync.ts` — takes rig sequence + VO transcription + emphasis detection → outputs timed rig invocations.

**Integration with existing:** 5-Track Track 1 (Speech Semantic) already has word timestamps. Needs: emphasis detection (new Gemini Vision call on spectrogram, OR use Whisper's logits for emphasis proxy).

### G.6 — Composable Layer System
After Effects-style layer stack, code-driven:

```
Layer 10: Annotations (text, arrows, drawings)
Layer 9:  Cursor / interaction indicators
Layer 8:  Notifications / overlays
Layer 7:  UI screen content
Layer 6:  Device frame
Layer 5:  Background / wallpaper
```

Each layer: independently animatable, own keyframes, own blend mode (normal/multiply/screen/overlay), own mask (shape/alpha/luma).

**Already exists partially:** Editron has overlay rows + keyframe tracks. Needs: blend modes (currently always 'normal'), shape masks, alpha masking.

### G.7 — Shimmer + Interactive Effects
Animated gradient masks, particle systems, glow/pulse.

- **Shimmer**: linear gradient CSS keyframe that sweeps across element (for "live" feel on app icons)
- **Particle clutter**: PixiJS-based (OpenScreen has this — `src/lib/compositeLayout.ts`) or react-particles-js
- **Glow**: CSS `filter: drop-shadow()` with keyframed blur radius
- **Pulse**: scale 1.0 → 1.05 → 1.0 with ease-in-out, 1.5s loop

**Where it lives:** `lib/editron/motion-graphics/effects/` — each effect is a reusable hook or component.

### G.X — Template SFX via Approach C (Opportunistic Caching)

**Architectural note (2026-04-16):** Approach C (template-baked SFX with opportunistic cache) was considered and rejected for transition SFX in favor of Approach B (rule-based post-pass). However, **C is the RIGHT pattern for template/rig-based SFX** in Phase G because:

- Each rig or primitive has a SIGNATURE sound that should always play with it (e.g., envelope-opens-and-paper-extracts has a specific sound)
- Asset consistency matters MORE for brand-level output (users notice when the "same" template has different sounds)
- Cache hit rate approaches 100% after first use
- First-call latency acceptable for async render pipeline

**Implementation pattern for Phase G:**

```
rig = { id: 'envelope-to-phone', audioAssetId: null }

at render time:
  if rig.audioAssetId is null:
    search library for rig's soundSignature ("envelope open paper rustle")
    download best match
    upload to R2 with stable assetId
    persist rig.audioAssetId in MongoDB
  place audio overlay with rig.audioAssetId

next render of same rig:
  read cached assetId from MongoDB
  place overlay instantly
```

**Storage:** ~10-50 template sounds total across rigs + primitives. R2 costs ~$0.0001 per file. Total: negligible.

**Integration point:** Phase G.3 (Template Rigs) and G.2 (UI Primitives) — each descriptor gets `soundSignature: string` field. Rig renderer uses the opportunistic-cache utility.

### G.8 — Screen Recording Integration (Phase F bridge)
For hybrid videos (SaaS demo with real UI + motion graphics overlay):
- Phase F ingests screen recording with cursor events
- Phase G overlays motion graphics (callouts, zoom indicators, feature highlights)
- Audio-to-marker sync coordinates both
- Result: real product demo + branded motion graphics + VO sync

**Example output:** CEO records feature walkthrough → Phase F detects cursor events → Phase G adds callouts at decisive moments → final video = Beehiiv-quality product demo.

---

## Phase F vs Phase G — which problem does which solve?

| SaaS Video Use Case | Phase F (Screencast) | Phase G (Motion Graphics) |
|---|---|---|
| Product feature walkthrough (real UI) | ✅ primary | ✅ adds callouts/zooms |
| App launch announcement (abstract/promo) | ❌ | ✅ primary (Beehiiv-style) |
| Competitor comparison | ❌ | ✅ primary (stat cards, charts) |
| Tutorial / how-to | ✅ primary (cursor-follow) | ✅ adds typography emphasis |
| Brand film / hero video | ❌ | ✅ primary (logo animations) |
| Customer testimonial with UI B-roll | ✅ B-roll source | ✅ text cards + callouts |

**Bottom line:** Phase F + Phase G together = full SaaS video capability. Neither alone is sufficient.

---

## Priority in roadmap

**Proposed placement (after current Tier 0-4):**
- **Tier 5 — Phase F (Screencast)** — 4-6 weeks
  - F.1 cursor detection + Mode 4 ingestion: 1 week
  - F.2 auto-zoom: 1 week
  - F.3 motion blur: 3 days
  - F.4 web recorder: 1 week
  - F.5/F.6: deferred
- **Tier 6 — Phase G (SaaS Motion Graphics)** — 8-12 weeks
  - G.1 SVG engine wrapper: 1 week
  - G.2 UI primitives library (15 components): 3 weeks
  - G.3 Template rigs (10 rigs): 3 weeks
  - G.4 Easing system: 1 week
  - G.5 Audio-to-marker sync: 2 weeks
  - G.6/G.7: 2 weeks
  - G.8 Phase F bridge: 1 week (after both are built)

**Dependencies:**
- Phase G.5 needs 5-Track Track 1 (already have) + emphasis detection (new Gemini call or Whisper feature)
- Phase G.8 depends on Phase F.1-F.2 existing

**Why this priority:** Phase F unblocks tutorial/demo content (already the existing Editron gap). Phase G unblocks SaaS marketing content (highest-paying vertical). Both are substantially larger than current Tier 0-4 backlog. Build Tier 0-1 first (SFX wiring, beat-sync, montage fix), then re-prioritize.

---

## Strategic positioning (CTO roadmap alignment)

Phase F + Phase G together make Editron the FIRST platform that combines:
1. AI video generation (hero shots, abstract scenes) — existing Phase 0
2. Structured editing intelligence (pacing, transitions, color) — existing Phase B
3. Screen recording with intelligent zoom — new Phase F
4. Vector motion graphics with audio sync — new Phase G
5. Brand DNA layer on top (when built) — CTO roadmap Year 1

**No competitor has all five.** Screen Studio does only #3. After Effects does only #4 (manual). Synthesia does only #1. Descript does #1+#2 for talking-head. Editron would own "the stack."

---

## Next session should

1. Verify this roadmap is reviewed/approved by user
2. Do NOT start implementation yet — finish Tier 0 first (SFX, beat-sync, montage duration)
3. When ready: build G.1 + G.2 first (SVG engine + 5 primitives) as proof of concept
4. Test with: a single Beehiiv-inspired scene (envelope → phone) to validate the approach before full rig library

---

## Files affected (for future implementation)

- NEW: `lib/editron/services/motion-graphics/svg-engine.ts`
- NEW: `lib/editron/motion-graphics/primitives/` (folder, ~15 components)
- NEW: `lib/editron/motion-graphics/rigs/` (folder, ~10 rigs)
- NEW: `lib/editron/services/motion-graphics/audio-marker-sync.ts`
- EXTEND: `components/editron/editor/version-7.0.0/utils/keyframe-evaluator.ts` (easing presets)
- EXTEND: `lib/editron/services/five-track-analysis.ts` (cursor event detection for Phase F, emphasis detection for Phase G)
- EXTEND: `lib/pipeline/llm-scene-parser.ts` (rig intent extraction from script)
- EXTEND: `lib/pipeline/storyboard-service.ts` (rig-based rendering path, bypasses AI video gen for SaaS scenes)

Reference repos (gitignored, for porting code):
- `reference-repos/openscreen-main/` — Phase F code source
