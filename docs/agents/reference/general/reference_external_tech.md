---
name: External Tech Resources for Editron Integration
description: GitHub repos and technologies researched for Editron integration. Hyperframes (video rendering), Motion (animation), V-JEPA 2 (video understanding), AI avatars, HUMAN stack components. With integration paths and priority.
type: reference
last_updated: 2026-05-02
originSessionId: ec211e6e-f4aa-4e7b-bf44-a171a1990deb
---
# External Tech Resources for Editron

## Rendering & Animation

### HeyGen Hyperframes — Apache 2.0 video rendering
- **Repo:** https://github.com/heygen-com/hyperframes
- **What:** Write HTML → render video. GSAP timelines, data-* attributes for timing. Built for AI agents.
- **Why for Editron:** LLMs write HTML far better than React. For Phase G (SaaS motion graphics) and any AI-generated compositions, Hyperframes is the better authoring target. Also supports AI avatar composition.
- **Integration:** Dual renderer — Remotion for main timeline, Hyperframes for LLM-generated template rigs + avatar scenes.
- **Priority:** Phase G (SaaS motion graphics)
- **Also:** Hyperframes supports AI avatar video composition natively (HeyGen's core business). This enables Mode 5: AI Avatar Videos.

### Motion (formerly Framer Motion) — React animation library
- **Repo:** https://github.com/motiondivision/motion
- **What:** Production-grade animation for React. Spring physics, gestures, layout animations. 30M+ npm downloads/month.
- **Why for Editron:** (1) Editor UI — smoother panels, timeline interactions. (2) Phase G easing system — spring physics math for keyframe-evaluator.ts.
- **Integration:** Install as dependency. Extract spring math for custom Bezier curves.
- **Priority:** Next UI sprint + Phase G easing system

### Editframe — Build Video With Code (rendering backend candidate)
- **Site:** https://editframe.com/
- **Docs:** https://editframe.com/docs/video-editor
- **GitHub:** https://github.com/editframe
- **What:** Declarative video compositions in HTML + CSS. Renders in browser, CLI, or cloud. GPU workers (NVIDIA L4) for WebGL/Three.js. SSE progress streaming. Webhook on completion.
- **Why for Editron:** Every LLM writes HTML/CSS natively — Editframe is purpose-built for AI-authored video compositions. Our transitions and motion graphics ARE HTML overlays already. Editframe could render them faster/cheaper than Remotion Lambda, with GPU support for complex effects.
- **Integration path:** Editframe as ALTERNATIVE rendering backend alongside Remotion Lambda. Use Editframe for:
  1. Motion graphics / template rendering (HTML compositions — our templates are already HTML)
  2. GPU-accelerated effects (WebGL, Three.js, complex CSS animations)
  3. Cloud rendering with parallel encoding (their infra, not our Lambda)
  Keep Remotion Lambda for main timeline compositing (proven, stable).
  Could also replace Remotion entirely long-term if Editframe handles full compositions.
- **Key advantage over Remotion:** No React overhead. HTML/CSS input = what our AI already generates. GPU rendering for heavy effects. Built-in Claude Code MCP skill exists.
- **Key risk:** Vendor dependency. Remotion is OSS (self-hosted). Editframe is a service.
- **Priority:** Evaluate after Phase C (Asset-Centric). Compare render speed + cost vs Remotion Lambda on real projects.
- **Added:** 2026-05-09

## Video Understanding

### V-JEPA 2 / TRIBE v2 — Meta's self-supervised video model
- **Repos:** https://github.com/facebookresearch/tribev2 + https://github.com/facebookresearch/vjepa2
- **Paper:** https://arxiv.org/abs/2506.09985
- **What:** Self-supervised video understanding trained on 1M+ hours. Understands actions, motion semantics, temporal relationships. TRIBE v2 adds Wav2Vec-BERT (audio) + LLaMA 3.2 (text) + WhisperX (speaker diarization).
- **Why for Editron:** Replace Gemini Vision's guessed scene analysis with actual temporal video understanding. V-JEPA 2 features tell you what's HAPPENING, not just what's in the frame. WhisperX adds speaker diarization (interview detection).
- **Integration:** Deploy on fal.ai as custom model → extract features → feed into 5-Track as richer Track 2 + Track 4.
- **Priority:** Tier 2 (needs GPU inference, 600M+ params)

## AI Avatars

### Topic: https://github.com/topics/ai-avatars

Key repos researched:
- **Duix-Avatar** (duixcom/Duix-Avatar) — offline video synthesis, appearance+voice cloning
- **ai-avatar-system** (PunithVT) — upload photo, clone voice, real-time lip-sync, WebSocket streaming
- **Linly-Talker** (Kedreamix) — LLM + visual model for conversational avatars, MuseTalk for real-time
- **AI-Faceless-Video-Generator** (SamurAIGPT) — topic → script → TTS → face animation → video

### HeyGen Avatar IV (commercial reference)
- 175+ languages, natural lip sync, hand gestures, emotions
- Digital Twins from single photo
- API available on higher plans
- Hyperframes is HeyGen's own rendering framework — avatar composition is native

### Best Repos for Editron (ranked)

1. **SkyReels-V3** (SkyworkAI) — https://github.com/SkyworkAI/SkyReels-V3
   - Most advanced open-source avatar model. 720p/24fps. Multi-language lip sync.
   - Single portrait + audio → talking video. Long-form support. Multi-character.
   - Diffusion Transformer architecture with audio-visual alignment + region masking.
   - **Best fit for Editron:** deploy on fal.ai, user uploads photo + our TTS generates audio → SkyReels generates avatar video.

2. **InfiniteTalk** (MeiGen-AI) — https://github.com/MeiGen-AI/InfiniteTalk
   - Unlimited-length talking video. Image-to-video AND video-to-video.
   - Sparse-frame dubbing framework.
   - **Best fit:** long-form avatar content (tutorials, presentations).

3. **ai-avatar-system** (PunithVT) — https://github.com/PunithVT/ai-avatar-system
   - Production-ready platform. Upload photo + 5s voice clip → real-time conversation.
   - MuseTalk lip-sync, WebSocket streaming.
   - **Best fit:** real-time avatar chat feature (future).

4. **TalkingHead** (met4citizen) — https://github.com/met4citizen/TalkingHead
   - JavaScript 3D avatar with real-time lip-sync in browser.
   - **Best fit:** interactive 3D avatars in editor preview (no server needed).

5. **Awesome-Talking-Head-Synthesis** — https://github.com/Kedreamix/Awesome-Talking-Head-Synthesis
   - Research paper collection. Reference for staying current.

### Editron Integration Path (Mode 5: AI Avatar Videos)
1. User provides: script + photo (or selects stock avatar)
2. TTS generates voiceover (Kokoro/Deepgram — already have)
3. Lip-sync model generates talking head video from photo + audio
4. Hyperframes composes: avatar video + background + graphics + captions
5. Director Agent applies: pacing, transitions, color, quality review
6. Remotion renders final output

**Open source path:** Duix-Avatar or ai-avatar-system for lip-sync generation. Deploy on fal.ai.
**API path:** HeyGen API for avatar generation, Hyperframes for composition.

## Auto-Editing Intelligence (from GitHub research 2026-05-01)

### mazsola2k/ai-video-editor
- **Repo:** https://github.com/mazsola2k/ai-video-editor
- **What:** ResNet-50 + CLIP + Qwen2.5-VL classifies each frame as boring/low/moderate/interesting. Speed multipliers 1x-6x.
- **Useful concept:** Scene quality scoring from visual features. NOT the teaser/intro/outro structure.
- **Integration:** Content quality proxy already handled by transcript features (filler rate, speech coverage). Visual quality scoring deferred until V-JEPA 2 integration.

### debarch777/AI-Video-Editor
- **Repo:** https://github.com/debarch777/AI-Video-Editor
- **What:** Whisper transcription → LLM → structured editing JSON → B-roll insertion + captions + SFX.
- **Useful concept:** "Transcript → editing decisions" pattern. We implemented this in raw-footage-processor.ts.

### WyattBlue/auto-editor
- **Repo:** https://github.com/WyattBlue/auto-editor
- **What:** Audio loudness → silence detection → jump cuts. Also motion detection mode.
- **Useful concept:** Silence removal. We implemented this in silence-removal-executor.ts.

## HUMAN Stack Components (from user's parallel project)

### Tier 0 — Port First
1. **QualityGate** — before/after metrics per edit operation
2. **Anti-pattern detector** — expand 21 quality checks with deterministic rules
3. **Thompson Sampling** — bandit over edit profiles, learns from Graphiti outcome data

### Tier 1 — Build After Testing
4. **NegativeModelBuilder** — regression detection per edit
5. **FAN layers** — rhythmic pattern capture for beat-sync
6. **DreamCoder** — successful edit patterns → reusable templates

### Tier 2 — Needs Data Volume
7. **JEPA** — predict edit outcome before executing
8. **EML** — discover engagement laws from data
9. **Understanding Engine** — cross-content-type learning

### Core Principle
Rule-driven where rules suffice. Learned models where patterns emerge. LLM only for genuinely novel creative decisions. With full HUMAN stack, LLMs exit the editing decision loop entirely.

## Master Resource Repos (Added 2026-05-22)

### sindresorhus/awesome — THE rabbit hole
- **Repo:** https://github.com/sindresorhus/awesome
- **What:** Curated list of ALL awesome lists. The master index.
- **MG-relevant sub-lists (verified 2026-05-22):**
  - awesome-web-animation — JS/CSS/SVG animation libraries
  - awesome-creative-coding — "programming something expressive"
  - awesome-canvas — Canvas API for 2D graphics + animation
  - awesome-webgl — GPU-accelerated graphics
  - awesome-webgpu — next-gen GPU computing for rendering
  - awesome-svg — scalable vector graphics (animatable)
  - awesome-webaudio — Web Audio API (for audio-reactive)
  - awesome-audio-visualization — visual representations of audio
  - awesome-design-systems — reusable components + rules for consistency
  - awesome-music — music production + audio tools
  - awesome-babylon.js — 3D graphics engine with animation
- **How to use:** When exploring ANY new domain, search awesome first.
- **Priority:** Reference (always available)

### nexu-io/open-design — Open-source Claude Design alternative
- **Repo:** https://github.com/nexu-io/open-design
- **What:** 19 skills, 71 brand-grade design systems. Generates prototypes + slides + images + videos + HyperFrames. Apache-2.0.
- **MG-relevant content:**
  - `skills/motion-frames/` — CSS-animated hero sections (rotating type, globe, timer). Simpler than expected — CSS animation patterns, not full video MG composition.
  - `skills/video-hyperframes/` — HTML→MP4 via HeyGen HyperFrames. Product reveals, kinetic typography, data charts, social overlays, logo outros.
  - `skills/hyperframes/` — HTML-in-Canvas for interactive storyboards
  - `skills/sprite-animation/` — Sprite-based animation
  - 71 design systems with anti-AI-slop mechanisms (5-dimensional self-critique, P0/P1/P2 checklists)
- **Integration potential:** Study their quality gates for our CRG validator. Study HyperFrames approach for rendering.
- **Priority:** Reference + study quality gates
