# Product Integration Plan
#roadmap #products

> ThinkForge is the brain. It plans months of content, brand-aligned, right mix of platforms. Output flows to production tools, then distribution. One connected system, not five islands.

---

## The Five-Product Pipeline

```
ThinkForge (plan + write)
  |-- Posts/Carousels -> Clickatron (design/produce) -> UploaderX (schedule + publish)
  |-- AI Videos -> Editron (produce) -> UploaderX (schedule + publish)
  '-- User-Shot Videos -> Pre-production Storyboard (setup guide + sketches)
                          -> User shoots -> Editron Mode 2 (edit) -> UploaderX

Alyzzitron sits across ALL paths analyzing content quality, generating captions/descriptions.
Brand DNA flows to ALL products.
```

---

## Current State of Bridges

| Bridge | Status | Notes |
|--------|--------|-------|
| [[ThinkForge-State|ThinkForge]] -> Editron | WIRED | Full export pipeline: scene parsing, reference images, storyboard, video gen |
| ThinkForge -> Clickatron | MISSING | Posts/carousels cannot flow to Clickatron |
| Editron -> UploaderX | MISSING | Rendered video has no path to UploaderX |
| Clickatron -> UploaderX | MISSING | Designed posts cannot auto-schedule |
| Alyzzitron -> Content Planning | MISSING | Analysis results orphaned |
| Alyzzitron -> Captions/SEO | MISSING | Should auto-generate, currently manual |
| Brand DNA -> Clickatron | MISSING | Clickatron does not read brand identity |
| Brand DNA -> Editron MG | PARTIAL | hierarchyOverrides param exists, no data source |
| Content Planner | STUB | Bare CRUD, no calendar UI, no strategy |

---

## What Needs Building (Priority Order)

### P0: Content Planner
- Monthly calendar UI with platform mix strategy
- Brand-aligned content cadence (e.g., 3 LinkedIn/week, 2 Reels/week)
- Each planned item links to [[ThinkForge-State|ThinkForge]] session for production
- Trend surfacing integration

### P1: Editron -> UploaderX Bridge
- After Editron render completes, offer "Schedule on UploaderX"
- Auto-fill: video file, title from script, description from Alyzzitron, platform from ThinkForge plan
- Webhook or polling from render completion

### P1: ThinkForge -> Clickatron Bridge
- Post/carousel output formatted for Clickatron's input
- Text layers, brand colors, layout hints from ThinkForge output
- One-click "Design in Clickatron" from ThinkForge

### P1: Alyzzitron Feedback Loop
- Analysis results feed back to Content Planner (what worked, what didn't)
- Auto-generated captions + descriptions + SEO tags from analysis
- Performance data influences future content mix

### P2: Pre-Production Storyboard (User-Shot Video)
- Equipment assessment: how many cameras, lighting type user has
- Setup recommendations per scene: ideal camera positions, lighting adjustments
- Printable rough sketches (pre-generated, not on-demand)
- Shot list with framing guides

### P2: Avatar + SaaS Explainer
- AI avatar integration in Editron (HeyGen/Hyperframes style)
- Animated SaaS explainer templates (screen recordings + motion graphics)

### P3: Brand DNA -> All Products
- Centralized Brand DNA Vault (user-level + project-level)
- All products read from it: Clickatron (colors, fonts), Editron MG (themes), UploaderX (caption voice)
- Auto-extraction from URLs/LinkedIn (see Brand Auto-Extraction section below)

---

## Brand Auto-Extraction

**Why:** Users should not have to manually fill Brand Vault forms. An agency owner making content for 10 clients cannot fill a form for each one. The system should accept URLs, company names, LinkedIn profiles and extract brand context automatically.

**How it applies across the pipeline:**
- Ideation: ideas should be brand-specific from a URL alone
- Script generation: voice/tone should match the brand
- Styling: StylistAgent should check against extracted brand voice

**What exists today:**
- `PromptPanel.tsx` has `extractUrls()`, `onUrlSubmit`, `briefResults` -- URL extraction infrastructure
- `fetchContextSources.ts` has BrandDNA retrieval pipeline
- `voice-signature.ts` has fingerprint extraction from text samples

**What needs to be built:**
1. Server-side URL scraper -- fetch page content, extract brand signals (About page, tone, key terms, audience)
2. Company name -> web search -> extract context (could use Gemini with web grounding)
3. LinkedIn profile -> extract professional context
4. Auto-populate BrandDNA fields from extracted data (or create ephemeral brand context per session)
5. Wire into ALL agents, not just ideation -- brief results should flow to chat-service, script generation, StylistAgent

**Design decision pending:** Should extracted brand context be:
- A) Saved permanently to BrandDNA (persists across sessions for that brand)
- B) Ephemeral per-session context (used once, not saved)
- C) Both -- extract ephemerally, offer to save permanently

**Priority:** P1 -- directly impacts first-time experience and agency use case

---

## Phase F -- Screencast and Product Demo Mode

**Source:** OpenScreen (MIT-licensed, `reference-repos/openscreen-main/`)

The gap: pure AI text-to-video cannot make SaaS demos. Text blurs, UIs hallucinate, cursor behavior is random. For B2B SaaS marketing -- the highest-paying ad vertical -- Editron needs a different engine.

### Sub-phases

| Phase | What | Effort |
|---|---|---|
| F.1 | Mode 4: Screen Recording -> Editron. Cursor detection via 5-Track Track 4 extension. | 1 week |
| F.2 | Intelligent auto-zoom from cursor trajectory. Rule-based (not AI), deterministic. | 1 week |
| F.3 | Motion blur on zoom-punch transitions. GPU-accelerated, port from OpenScreen. | 3 days |
| F.4 | Web-based screen recorder. Browser `getDisplayMedia()` + WebRTC, saved directly to project. | 1 week |
| F.5 | Native desktop client. Fork OpenScreen, rebrand, upload to cloud. | 4-6 weeks (deferred) |
| F.6 | Cursor-event classification. Button vs text vs blank area -> different zoom depth. | 2 weeks (deferred) |

**Total Phase F:** 4-6 weeks

**Key code to port from OpenScreen:**
- `zoomRegionUtils.ts`, `cursorFollowUtils.ts` -- cursor tracking
- `zoomSuggestionUtils.ts`, `zoomTransform.ts` -- auto-zoom logic
- `blurEffects.ts` -- motion blur
- `useScreenRecorder.ts` -- web recording (adapt from Electron IPC to Web APIs)

---

## Phase G -- SaaS Motion Graphics Engine (Beehiiv-level)

**Source:** Beehiiv launch video analysis. Pure AI video has four fatal weaknesses for SaaS content:

| Problem | Why AI fails | What Phase G does |
|---|---|---|
| UI text illegibility | Pixel-based gen blurs text | SVG/vector layers with real fonts |
| Temporal inconsistency | Frame-to-frame drift (logo morphs) | Template rigs with fixed keyframes |
| Micro-animation feel | AI cannot do precise easing curves | Bezier interpolation, Disney 12 Principles |
| Modular reuse | Each AI gen is one-shot | Composable templates with swappable assets |

### Sub-phases

| Phase | What | Effort |
|---|---|---|
| G.1 | Vector/SVG rendering engine wrapper around Remotion SVG primitives | 1 week |
| G.2 | UI primitives library (~15 components: AppIcon, PushNotification, PhoneFrame, BrowserFrame, etc.) | 3 weeks |
| G.3 | Template rigs (~10 composable animation patterns with JSON descriptors) | 3 weeks |
| G.4 | Advanced easing system (custom Bezier curves, spring physics) | 1 week |
| G.5 | Audio-to-marker sync engine (visuals timed to VO word boundaries + emphasis) | 2 weeks |
| G.6 | Composable layer system (After Effects-style layer stack, blend modes, masks) | 1 week |
| G.7 | Shimmer + interactive effects (gradient sweeps, particles, glow, pulse) | 1 week |
| G.8 | Phase F bridge (screen recording + motion graphics overlay) | 1 week |

**Total Phase G:** 8-12 weeks

### Template Rigs (G.3)

Pre-defined animation sequences with swappable assets:
- `envelope-to-phone-morph` -- envelope opens, paper extracts, morphs to phone
- `app-launch-splash` -- icon zooms from home screen, app opens
- `notification-cascade` -- 3 notifications slide in with stagger
- `before-after-split` -- two panels, wipe reveal
- `logo-reveal-clean` -- logo fade-in with tagline
- `feature-highlight-loop` -- feature + label + arrow
- `stat-counter-burst` -- number counts up with particle burst
- `side-by-side-compare` -- competitor vs. you
- `testimonial-card` -- quote fade + avatar + rating
- `particle-clutter` -- multiple content windows float

Each rig gets a `soundSignature` field for template-baked SFX via opportunistic caching (Approach C).

### Audio-to-Marker Sync (G.5)

The single biggest quality multiplier. Visuals are timed to VO:
1. Detect VO word boundaries (already available via transcription)
2. Detect emphasis words (stress, pitch, volume peaks)
3. Generate markers per emphasis point
4. Stretch/compress animation template to hit markers

Integration: 5-Track Track 1 (Speech Semantic) already has word timestamps. Needs emphasis detection (new Gemini Vision call on spectrogram or Whisper logits as proxy).

---

## Phase F vs Phase G -- Which Solves What

| SaaS Video Use Case | Phase F (Screencast) | Phase G (Motion Graphics) |
|---|---|---|
| Product feature walkthrough (real UI) | Primary | Adds callouts/zooms |
| App launch announcement (abstract/promo) | -- | Primary (Beehiiv-style) |
| Competitor comparison | -- | Primary (stat cards, charts) |
| Tutorial / how-to | Primary (cursor-follow) | Adds typography emphasis |
| Brand film / hero video | -- | Primary (logo animations) |
| Customer testimonial with UI B-roll | B-roll source | Text cards + callouts |

Phase F + Phase G together = full SaaS video capability. Neither alone is sufficient.

---

## Strategic Positioning

Phase F + Phase G make Editron the first platform combining:
1. AI video generation (hero shots, abstract scenes) -- existing Phase 0
2. Structured editing intelligence (pacing, transitions, color) -- existing Phase B
3. Screen recording with intelligent zoom -- Phase F
4. Vector motion graphics with audio sync -- Phase G
5. Brand DNA layer on top -- CTO roadmap Year 1

No competitor has all five. Screen Studio does only #3. After Effects does only #4 (manual). Synthesia does only #1. Descript does #1+#2 for talking-head.

---

## Design Decisions Pending

1. Content Planner: separate page or tab within ThinkForge?
2. Bridges: webhook-based (async) or direct API calls (sync)?
3. Alyzzitron feedback: real-time or batch (weekly digest)?
4. Pre-production storyboard: AI-generated sketches or template-based?

---

## Dependencies

- Phase G.5 (audio-to-marker) needs 5-Track Track 1 + emphasis detection
- Phase G.8 depends on Phase F.1-F.2 being built first
- Build Tier 0-1 first (SFX wiring, beat-sync, montage fix), then re-prioritize to F/G

---

## Related

- [[Mode-2-Architecture]] -- Mode 2 sits in the Editron production pipeline
- [[ThinkForge-State]] -- ThinkForge is the brain feeding all products
