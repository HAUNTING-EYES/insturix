---
tags:
  - architecture
  - stable
aliases:
  - Stable V2
  - V2 Snapshot
last_updated: 2026-04-14
source: stable_v2_snapshot.md
---

# Editron Stable Version 2.0 — Snapshot (2026-04-14)

> Complete system state after 4-week sprint. Reference point for regression detection. If something worked here and doesn't now, it's a regression.

See also: [[Editron-Pipeline-Map]] for full architecture details.
See also: [[Insturix-Vision]] for the north star.

---

## Branch and Deploy

- **Branch:** `infrastructure-improvs-+Editron`
- **Latest commit:** `c42409ec` (Fix teal-orange filter preset)
- **Vercel project:** `prj_uAwH5pAHMWaOiRNbS7FZuejWXUuc`
- **DB:** `editron_prev` on `main-cluster.glgebdc.mongodb.net`

---

## Pipeline Status: WORKING

```
Script -> Parse -> Storyboard -> Video Gen -> Audio -> Finalize -> Director -> Render
```

All stages functional. Verified with McDonald's "Golden Arches" 30s ad script.

---

## What Works (Verified in Production)

| Feature | Notes |
|---------|-------|
| LLM parser | Gemini 2.5 Flash, 120s timeout, structured output |
| Storyboard images | Per scene + per-sub-shot (montage-first, Flux Schnell) |
| Video gen | 5 models: Seedance 1.5/2.0, Kling 2.1/2.6, Veo 3.1 |
| Cinema prompt engineering | 6 cameras, 11 lenses, content-mood aware |
| Voiceover TTS | Kokoro primary, Deepgram fallback |
| BGM generation | CassetteAI, reads musicDescription |
| Finalize assembly | Script-duration priority |
| On-screen text overlays | Regardless of voiceover presence |
| 3-layer creative intent | LLM intent -> code frame resolution -> EDL execution |
| Asset briefing | 5-Track -> 200 tokens + AI slop detection |
| 5-Track analysis | gemini-3.1-flash-lite-preview, video+audio multimodal |
| Profile-based editing | 54 profiles, auto-detection uses top match |
| Single filter source of truth | Profile overwrites, EDL filter-change disabled |
| Single transition source of truth | EDL/creative intent, Director dedup with in-memory markers |
| Transitions inline | On video row (DaVinci-style, z-index 85) |
| Audio ducking | Native audio at 12% under VO, BGM with professional ramps |
| ROW constants | Used across all server-side files |
| hasNativeAudio | Reflects actual audio request (not model config default) |
| Credits | Charged for all pipeline actions |
| SFX | Uses sfxDescription (not music descriptions) |

---

## Known Limitations (Design Trade-offs, Not Bugs)

- Editor playback shows 1-2s storyboard image before video loads (pauseWhenBuffering=false for smooth scrubbing, rendered output is fine)
- ExportToEditronDialog popup doesn't show sub-shot thumbnails (StoryboardWorkspace page does)
- Sub-shot storyboard images use Flux Schnell (faster but lower quality than heavier models)
- CSS filter presets can't do true split-toning (teal-orange is approximated with sepia+hue-rotate)
- Creative intent decisive moments fall back to midpoint when 5-Track data is thin
- neon-nights filter still uses hue-rotate(270deg) -- avoid for content with people

---

## Architecture: 3-Layer Editing

```
5-Track Analysis -> Asset Briefing (compressed) -> LLM creative intent -> Intent Translator -> EDL -> Executor
                 -> Raw data (preserved)        -----------------------> (frame resolution) ---/
```

- **Layer 1 (LLM):** ~30 constrained intent enums, decisiveMoment in natural language, reasoning
- **Layer 2 (Code):** Waterfall resolution: VO word -> subject -> motion peak -> energy -> temporal -> fallback
- **Layer 3 (Existing):** EDL executor unchanged, snap functions exported for translator
- **Fallback:** If creative intent fails -> reactive edit engine (legacy)

---

## Models (Verified Working)

| Model | Use | API Name |
|-------|-----|----------|
| Gemini 2.5 Flash | LLM parsing, chat | gemini-2.5-flash |
| Gemini 3.1 Flash Lite | 5-Track analysis | gemini-3.1-flash-lite-preview |
| Gemini 3.1 Pro | Intelligence/decisions | gemini-3.1-pro-preview |
| Seedance 1.5 Pro | Video gen (native audio, 4-12s) | fal-ai/bytedance/seedance/v1.5/pro |
| Seedance 2.0 | Video gen (best audio, 4-15s) | bytedance/seedance-2.0 |
| Kling 2.1 Pro | Video gen (default, reliable) | fal-ai/kling-video/v2.1/pro |
| Kling 2.6 Pro | Video gen (high motion, lip-sync) | fal-ai/kling-video/v2.6/pro |
| Veo 3.1 | Video gen (4K premium) | fal-ai/veo3.1 |
| Flux Schnell | Storyboard images (fast) | fal-ai/flux/schnell |
| Kokoro | TTS primary | fal-ai/kokoro/american-english |
| CassetteAI | BGM generation | cassetteai/music-generator |

---

## Key Files (New/Modified in V2 Sprint)

| File | Status |
|------|--------|
| `lib/editron/services/asset-briefing.ts` | NEW: 5-Track compression + slop detection |
| `lib/editron/services/intent-translator.ts` | NEW: creative intent -> EDL |
| `lib/editron/data/cinema-prompt-config.ts` | NEW: camera/lens prompt engineering |
| `lib/editron/services/unified-edit-intelligence.ts` | MODIFIED: creative intent schema + prompt |
| `lib/editron/agent/director-agent.ts` | MODIFIED: 3-layer integration, filter overwrite, transition dedup |
| `lib/editron/services/edl-executor.ts` | MODIFIED: exported snaps, filter-change disabled, transitions on ROW.VIDEO |
| `lib/pipeline/storyboard-service.ts` | MODIFIED: montage-first image gen |
| `lib/pipeline/llm-scene-parser.ts` | MODIFIED: musicDescription + sfxDescription |
| `lib/pipeline/adapters/video-model-configs.ts` | MODIFIED: Seedance 1.5 duration, prompt tuning |
| `components/editron/editor/version-7.0.0/components/overlays/video/video-layer-content.tsx` | MODIFIED: native audio ducking |
| `components/editron/editor/version-7.0.0/components/core/layer.tsx` | MODIFIED: transition z-index 85 |

---

## What Needs to Happen Next (From V2 Baseline)

1. Add sub-shot thumbnails to ExportToEditronDialog popup
2. Gemini Context Caching for intelligence calls
3. Beat-synced assembly (alignCutsToBeats exists, dead code)
4. Essentia.js for real music analysis
5. Phase C: Asset-Centric Architecture
6. Phase D Pro: DaVinci features
7. Mode 2/3: User footage + hybrid

See also: [[CTO-3-Year-Plan]] for how these fit into the long-term roadmap.

---

## Session Commits (Chronological)

~35 total commits on infrastructure-improvs-+Editron from `64a44253` to `c42409ec`. See git log for full list.

---

## Rules and Docs at Time of Snapshot

- AGENT_RULES.md: 17 rules + Rule 17N (Deliberate Before Implementing)
- feedback_audit_lessons.md: 10 self-rules from 4-week audit (A1-A10)
- creative_production_knowledge.md: Murch, Eisenstein, Three-Layer Sound Model
- system_architecture_map.md: Complete pipeline reference
- edge_cases_backlog.md: Minor issues for later
