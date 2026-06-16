---
name: Editron Pipeline Architecture
description: ThinkForge-to-Editron import pipeline, video generation, storyboard, audio, and edit profiles
type: project
---

Insturix's pipeline converts ThinkForge scripts → Editron video projects.

**Key flow:**
1. ThinkForge script → Export API → `SceneDescriptor[]`
2. Extract subjects → Generate reference images → User review (upload supported)
3. Profile auto-detection → User confirms/overrides from 54 profiles (7 categories)
4. Storyboard images via fal.ai (nano-banana-2, seedream, flux IP-adapter)
5. AI video clips via QStash workers → fal.ai (Kling 2.1/2.6/1.5, Luma, MiniMax, VEO)
6. Voiceover via Deepgram Aura TTS (parallel, 8 concurrent)
7. Finalize → create Editron project → dispatch BGM worker (MiniMax Music v2) + SFX worker (mirelo video-to-audio → beatoven fallback)
8. Director Agent applies edit profile tool calls (P1)

**Audio generation:**
- BGM: fal-ai/minimax-music/v2 ($0.03/req), requires lyrics_prompt with structural tags
- SFX: mirelo-ai/sfx-v1/video-to-audio (needs video_url, integer duration 1-10, num_samples 2+)
- Fallback: beatoven/music-generation and beatoven/sound-effect-generation (permanently queued — avoid)
- Both run as async QStash workers post-finalize, push overlays to project via MongoDB $push

**Planned SFX improvements (phase plan):**
- Tier 2: Pre-built SFX library — Pixabay API (royalty-free, zero licensing), Freesound API (filter CC0), or SONNISS GameAudioGDC archive (bulk download → seed MongoDB)
- Motion graphics: LottieFiles API for animated overlays

**VEO models:**
- veo-3: fal-ai/veo3/image-to-video ($0.50/sec, needs fal.ai account activation)
- veo-2: fal-ai/veo2/image-to-video ($0.50/sec)
- Both accept: image_url, prompt, aspect_ratio, duration ("4s"/"6s"/"8s"), resolution, generate_audio

**Scene chaining:**
- Optional (enableChaining=false by default) — uses next scene's storyboard image as end_image_url/tail_image_url
- Kling 2.6: start_image_url + end_image_url
- Kling 2.1/1.5: image_url + tail_image_url
- Luma: end_image_url
- MiniMax/VEO: no chaining support

**Key files:**
- `lib/pipeline/script-to-scenes.ts` — parsing
- `lib/pipeline/scene-to-editron.ts` — overlay generation
- `lib/pipeline/storyboard-service.ts` — image gen (fal.ai)
- `lib/pipeline/video-generation-service.ts` — video gen (fal.ai)
- `lib/pipeline/bgm-service.ts` — MiniMax Music v2 BGM
- `lib/pipeline/sfx-service.ts` — mirelo + beatoven SFX
- `lib/pipeline/edit-profiles.ts` — 54 profiles, 7 categories
- `app/api/internal/workers/pipeline/video/route.ts` — QStash video worker
- `app/api/internal/workers/pipeline/audio/route.ts` — QStash audio worker
- `components/dashboard/ThinkForge/ExportToEditronDialog.tsx` — UI
