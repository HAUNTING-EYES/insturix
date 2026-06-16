---
name: Edge Cases Backlog
description: Minor edge cases and UX issues to address after core fixes. Not blocking but should not be forgotten.
type: project
originSessionId: 6b272c7c-4888-4c9b-8caf-d84e6c03234f
---
# Edge Cases Backlog (2026-04-14)

## From A3.2 Fix (per-sub-shot image gen)
1. ~~**Storyboard UI has no sub-shot expansion**~~ — FIXED: StoryboardWorkspace has it. ExportToEditronDialog now has "View Full Storyboard" link. ✅
2. **Style anchor lost if Scene 0 is a montage** — FIX 8 style anchor only captures from standard parent path. If Scene 0 is a full montage, no anchor for subsequent scenes.
3. **Failed sub-shot falls back to first sub-shot image** — not the worst (old behavior was ALL sharing one), but a purpose-built parent fallback would be better.

## From Storyboard Navigation
4. **ExportToEditronDialog sub-shot thumbnails** — the dialog preview grid doesn't show sub-shot images inline. Users must click "View Full Storyboard" to see them. Could add inline expansion.

## Video Artifact Correction (researched 2026-04-14)
5. **Netflix VOID model** — REMOVAL ONLY. Cannot fix geometry, correct logos, edit objects in place. Can remove: unwanted objects, AI text hallucinations, artifacts. Requires A100 GPU (40GB+ VRAM). Available on HuggingFace, Apache 2.0 license. Useful for: removing artifacts, cleaning up generations.
6. **Pika Swaps** — REPLACEMENT + EDITING. Can select objects in video and replace via text prompt or reference image. Has REST API for enterprise. Limited to first 5s, 25MB max. Could fix: logo geometry ("replace warped M with perfect golden arches"), morphed hands, incorrect objects. Best option for in-video editing.
7. **Runway Inpainting** — Video inpainting via cloud API. Mask + replace. Another option for artifact correction.
8. **Re-generation approach** — slop detection in asset-briefing.ts flags artifacts. Could auto-trigger regeneration with refined negative prompts. Zero new infrastructure, uses existing pipeline. Trade-off: costs another generation credit.

## Editor Playback
9. **Still frames at scene start (1-2s)** — editor uses HTML5 Video with pauseWhenBuffering=false. Storyboard posterUrl shows while video buffers. Rendered output fine (OffthreadVideo pre-decodes). Trade-off for smooth timeline scrubbing. Not a bug.

## Filter Presets
10. **neon-nights filter uses hue-rotate(270deg)** — same skin-tone destruction issue as old teal-orange. Avoid for content with people. Should be fixed if used as profile default.

## Libraries / Integrations Researched (2026-04-14)
11. **Motion (framer-motion successor)** — React animation library, 31.5k stars, MIT. GPU-accelerated, springs, gestures, layout transitions. Use for: editor UX polish, asset library animations, motion graphics templates. Phase C or later. https://github.com/motiondivision/motion
12. **Duix Avatar** — AI digital human cloning. Clone face + voice → generate presenter videos from text/audio. 8 languages. $1K/avatar vs $100K traditional. Free commercial use (<100K users). Use for: talking head mode, multilingual content, Mode 2/3 presenter layer. Phase 6. https://github.com/duixcom/Duix-Avatar
13. **Duix Mobile** — Real-time AI avatar SDK for mobile/embedded. <120ms latency, lip-sync, on-device. Use for: interactive preview, mobile app avatar feature. Phase 6+. https://github.com/duixcom/Duix-Mobile
14. **Wan VACE (fal.ai)** — Video inpainting via mask + prompt. $0.04-0.08/sec. Fix logo geometry, replace objects, correct artifacts. Phase D Pro. https://fal.ai/models/fal-ai/wan-vace-14b/inpainting
15. **Netflix VOID** — Video object REMOVAL only (not editing). Physics-aware inpainting. Self-hosted on A100 or fal.ai custom. Phase D Pro. https://github.com/Netflix/void-model
16. **Pika Swaps** — Video object REPLACEMENT via API. Select + prompt → replace. First 5s, 25MB max. Enterprise API. Phase D Pro. https://pika-swaps.com/
17. **Higgsfield Lip Sync** — 9 lip-sync models (Infinite Talk, Wan 2.2 Speech, LTX 2.3, Sync, LatentSync). Portrait + audio → talking video. Phase D Pro. From Open-Higgsfield-AI exploration.

## Post-merge Priorities (flagged 2026-04-16 during Fix 1.3)

20. **Editron AI Chat unstable/unusable** — user flag: "chat system quite unstable or unusable we need to work a lot on that." Currently uses Gemini 2.0 Flash via native @google/genai SDK with 35+ tools. Symptoms/scope TBD — needs dedicated audit session. Touch points: `components/editron/editor/version-7.0.0/llm-service-google.ts`, `lib/editron/agent/tools.ts`, `lib/editron/agent/agent-graph.ts`, `lib/editron/services/chat-service.ts`. Deferred to post-merge.

21. **On-screen text from script is always-on — should be optional/profile-driven** — commit `55106894` made script on-screen text overlays appear for ZERO-VO scripts as a fallback. User flags: for Hormozi-style content, text needs to be much more dynamic and inline with video design theme/pacing/language. Not just "splat the script text on screen." True dynamic typography is a separate work stream (Phase G territory: kinetic captions, word-by-word reveals, emphasis scaling, position shifts per Hormozi patterns from creative_production_knowledge.md §9). FIX: add `onScreenTextFromScript: 'auto' | 'always' | 'never'` flag to profile or user preference. Default 'auto' = current behavior. 'never' = disable for users who want kinetic captions instead. Deferred to post-merge (feature, not bug). Related work: Phase G.4 easing + Phase G.5 audio-to-marker sync.

22. **Hormozi / MrBeast / Ali-Abdaal / Corporate caption styles not visible in UI** — flagged 2026-04-19 during proj_3jE3Q8mx5fB5 review. FIXED (commit 156e89ad 2026-04-19): dropdown now exposes all 9 STYLE_MAP presets; `getStylePresets()` now derives from STYLE_MAP keys.

    ⚠️ **Deeper architectural drift NOT fixed** — discovered during the investigation, worth addressing later:

    Four parallel definitions of "caption style" exist in the codebase, each with a different set of values:

    - `caption-service.ts STYLE_MAP`: 9 keys (the actual rendering presets)
    - `addCaptionsSchema.style` enum in `agent/tools.ts`: 9 values (matches STYLE_MAP — ✓ healthy)
    - `edit-profile-types.ts CaptionStyle` type: 11 values including `'fancy'`, `'word-by-word'`, `'keyword-highlight'` which are NOT STYLE_MAP keys
    - `ExportToEditronDialog` dropdown: now 13 options (9 STYLE_MAP + `fancy` + `word-by-word` + `auto` + `none`)

    Semantic confusion:
    - `'fancy'` is a META-SELECTOR — it routes the caption action through `add_fancy_captions` (Gemini-generated HTML kinetic typography, different rendering path), NOT through `add_captions` + STYLE_MAP. Should probably be a separate boolean flag like `renderMode: 'preset' | 'ai-kinetic'`, not a style value.
    - `'word-by-word'` is a DISPLAY MODE (how words are chunked on screen), not a style (visual design). The caption service's `DISPLAY_CONFIG_MAP` already has `mode: 'word-by-word' | 'phrase' | 'karaoke' | 'subtitle'` as a separate axis. So 'word-by-word' in the style field is a type confusion — any style could theoretically use word-by-word display.
    - `'keyword-highlight'` is a graphic TYPE in EDL (not caption), bleeding into this enum for unclear reasons. Appears orphaned.

    Clean long-term model would be two independent axes:
    - `stylePreset: CaptionStylePreset` — visual design (tiktok, hormozi, mrbeast, ...)
    - `displayMode: CaptionDisplayMode` — chunking (word-by-word, phrase, karaoke, subtitle)
    - `renderMode: 'preset' | 'ai-kinetic'` — 'ai-kinetic' invokes Gemini HTML generation instead of preset rendering

    Currently 2 profiles use `captionStyle: 'word-by-word'` and 3 use `captionStyle: 'fancy'` in `edit-profiles.ts`. Any refactor must preserve these profile semantics (word-by-word profiles should still render word-by-word; fancy profiles should still invoke kinetic HTML).

    Scope when picked up: `edit-profile-types.ts` (type split), `edit-profiles.ts` (54 profiles to re-annotate across 2 fields), `director-agent.ts:454-469` (tool routing logic), `ExportToEditronDialog.tsx` (two dropdowns instead of one), plus whatever else reads `profile.captionStyle`. Medium-sized refactor, worth doing but not urgent.

    **Second follow-up:** no visual style previews in UI. Users pick blind. Visual picker = significant UX upgrade, Phase G polish bucket.

23. **Graphics / caption positional conflict — screen zones not enforced across systems** — flagged 2026-04-19 during proj_3jE3Q8mx5fB5 review. `edl-executor.applyGraphic` places keyword-highlight / lower-third / stat-counter HTML-scene overlays without checking whether a caption overlay would render in the same screen zone. Per Toyota audit H7 (screen zone validation bypassed by user graphics), the zone-check logic exists but only runs on EDL-generated graphics, not all overlays, and doesn't reserve the caption zone when VO is present. RESULT: captions and graphics visually collide at bottom-center on VO+onScreenText scenes. Fix direction: formalize caption zone exclusion in `auto-post-processing.ts` screen-zone logic. When scene has VO → bottom-center zone is caption-reserved, graphic placement falls to lower-third-offset, upper-third, or corner. When scene has no VO → center-frame zone is graphic-owned. See creative_production_knowledge.md §13 safe zones + §9 caption positioning rules.

24. **HTML-scene graphics feel placeholder vs proper motion graphics** — flagged 2026-04-19. The `keyword-highlight`, `lower-third`, `stat-counter`, `callout` overlays that `applyGraphic` emits are inline-CSS HTML scenes (`type: 'html-scene'`), cheap and programmatic. They render as styled pill-chips or boxes with Tailwind-like inline styles. User's visual language expectation is closer to Phase G motion graphics — animated vector/SVG with spring physics, particle effects, audio-to-marker sync (see `memory/phase_f_g_saas_motion.md`). Short-term polish: upgrade HTML-scene templates to at least match creative_production_knowledge.md §10 Motion Graphics entry/exit patterns (pop 0.2-0.3s in, hold, 0.15-0.2s out, with Disney 12 easing). Long-term: replace with Phase G engine outputs for premium profiles. Related: backlog item #21, refined Option 1 implementation.

## Phase F + G Additions (2026-04-16)
18. **OpenScreen (siddharthvaddem/openscreen)** — Electron + React + PixiJS screen recorder with intelligent auto-zoom, cursor following, motion blur. MIT licensed. Extracted at `reference-repos/openscreen-main/` (gitignored). **→ Phase F primary source.** Key files to port: `zoomSuggestionUtils.ts`, `zoomRegionUtils.ts`, `zoomTransform.ts`, `cursorFollowUtils.ts`, `blurEffects.ts`, `compositeLayout.ts`. Full roadmap in `phase_f_g_saas_motion.md`.
19. **Beehiiv launch video (reference target)** — 34s SaaS product demo analyzed via Gemini on 2026-04-16. Techniques: envelope→phone path morph, 2.5D rotation, app icon shimmer, springy push notifications, particle clutter, template-based animation rigs. Pure AI video can't reproduce this — needs vector/SVG engine, UI primitives library, template rigs, Bezier easing, audio-to-marker sync. **→ Phase G motivating reference.** Full breakdown + implementation plan in `phase_f_g_saas_motion.md`.

20. **ImageBind (Meta/FAIR) — cross-modal embedding model** — user confirmed interest (2026-04-17). Creates shared embedding space for vision + audio + text. Unlocks: audio-visual alignment validation (does this SFX match this visual?), semantic SFX/BGM search (match by mood not keyword), cross-modal quality checks. **Current gap it fills:** keyword-based SFX matching misses semantic mismatches — Mirelo might pass back audio that doesn't match the visual event, we don't catch it. ImageBind would. **Infrastructure required:** not a trivial API call. Options: (a) HuggingFace Inference API (simplest if supported), (b) Replicate.com hosted endpoint, (c) self-host on Modal/RunPod GPU (~1GB weights, needs persistent GPU), (d) fal.ai if they add an endpoint. PyTorch-based; Vercel serverless not a fit for inference. **Deferred to post-merge.** Integration effort estimate: 1-2 weeks including infrastructure setup. Related work: content validation layer (would sit alongside asset-briefing's slop detection).
