---
name: resources
description: External service dependencies — APIs, models, infrastructure, auth, payments for Editron/Insturix platform
type: reference
---

# Resources & APIs

---

## New Models Added (2026-04-05)

### Seedance 1.5 Pro (LIVE — fal.ai)
- **Text-to-video**: `fal-ai/bytedance/seedance/v1.5/pro/text-to-video`
- **Image-to-video**: `fal-ai/bytedance/seedance/v1.5/pro/image-to-video`
- **Duration**: 4-15s integers. **Native audio**: `generate_audio: true` (default)
- **Cost**: ~$0.26 per 5s 720p with audio
- **Key**: Only model with native audio sync (foley, ambient, dialogue baked in)
- **Config key**: `seedance-1.5`

### UNI-1 by Luma (WAITLIST — not usable yet)
- **Endpoint**: `POST https://api.lumalabs.ai/dream-machine/v1/generations/image`
- **Auth**: `Authorization: Bearer ${LUMA_API_KEY}`
- **Status**: API waitlist as of 2026-04-05. Code is ready, needs LUMA_API_KEY env var.
- **#1 Elo** for human image preference. Native `character_ref` for face consistency.
- **Cost**: ~$0.09 per image at 2K

### Gemma 4 (LIVE — Google AI Studio, same API as Gemini)
- **Models**: `gemma-4-31b-it`, `gemma-4-26b-a4b-it`
- **Uses same endpoint**: generativelanguage.googleapis.com (same SDK as Gemini)
- **Cost**: FREE on Google AI Studio
- **Status**: Testable via env vars (e.g., `LLM_PARSER_MODEL=gemma-4-31b-it`)

### Default LLM changed to Gemini 3.1 Flash (from 2.5 Flash)
- All pipeline LLM calls now default to `gemini-3.1-flash`
- Except 5-Track analysis — LOCKED to `gemini-2.5-flash` (Files API dependency)
- Configurable via env vars: LLM_PARSER_MODEL, LLM_INTELLIGENCE_MODEL, etc.

---

## AI Music Generation

### MiniMax Music v2 (saved for Musitron)
- **Endpoint**: `fal-ai/minimax-music/v2`
- **Cost**: $0.03/generation
- **Requires**: `prompt` (10-300 chars) + `lyrics_prompt` (10-3000 chars, REQUIRED)
- **Lyrics format**: Use `[Intro]`, `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]` tags, `\n` for line breaks
- **Optional**: `audio_setting` → `{ sample_rate, bitrate, format }`
- **Output**: Complete songs WITH synchronized vocals
- **Best for**: Full song generation where lyrics matter (Musitron use case)
- **Note**: lyrics_prompt is REQUIRED even for instrumental — use structural tags with placeholder words

### CassetteAI Music Generator (currently in use — Editron BGM)
- **Endpoint**: `cassetteai/music-generator`
- **Cost**: $0.02/output minute
- **Requires**: `prompt` (string) + `duration` (integer, 10-180s)
- **Output**: WAV 44.1kHz stereo
- **Best for**: Instrumental background music (no lyrics needed)

### Beatoven (AVOID — permanently queued on fal.ai)
- **Endpoint**: `beatoven/music-generation` / `beatoven/sound-effect-generation`
- **Cost**: $0.10/req
- **Status**: ❌ Permanently IN_QUEUE, never processes. Do not use.

---

## AI Sound Effects

### Mirelo SFX v1.5 (currently in use — Editron SFX)
- **Endpoint**: `mirelo-ai/sfx-v1.5/video-to-audio`
- **Cost**: $0.007/sec/sample
- **Requires**: `video_url` (string, URI)
- **Optional**: `text_prompt`, `num_samples` (2-8), `seed` (default 8069), `duration` (1-10s float), `start_offset`
- **Output**: Array of WAV audio files
- **Best for**: Video-synced SFX (analyzes actual video content)

### Mirelo Video-to-Video (with audio)
- **Endpoint**: `mirelo-ai/sfx-v1.5/video-to-video`
- **Same params as video-to-audio but returns video with audio baked in

---

## SFX Libraries (Royalty-Free)

### Pixabay API (currently in use)
- **Key**: `PIXABAY_API_KEY`
- **License**: Pixabay License — free commercial use, no attribution
- **Docs**: https://pixabay.com/api/docs/
- **Best for**: Quick deterministic SFX lookup by keyword

### Freesound API (currently in use)
- **Key**: `FREESOUND_API_KEY`
- **License**: Filter for `Creative Commons 0` (CC0) only for commercial
- **Docs**: https://freesound.org/docs/api/
- **Best for**: Larger library (500k+ sounds), filter by license

### SONNISS GameAudioGDC Archive (not yet integrated)
- **Type**: Bulk download, not API
- **License**: Royalty-free, commercial use, no attribution, unlimited projects
- **Content**: Whooshes, impacts, ambience, UI clicks, cinematic
- **Best for**: Seeding a curated MongoDB SFX library for offline/instant access
- **URL**: https://sonniss.com/gameaudiogdc

---

## Text-to-Speech

### Kokoro TTS (currently primary — Editron voiceover)
- **Endpoint**: `fal-ai/kokoro/american-english`
- **Cost**: $0.02/1000 characters
- **Voices**: 20 total (10F: af_heart, af_alloy, af_aoede, af_bella, af_jessica, af_kore, af_nicole, af_nova, af_river, af_sarah | 10M: am_adam, am_echo, am_eric, am_fenrir, am_liam, am_michael, am_onyx, am_puck, am_santa)
- **Speed**: 0.1x to 5.0x
- **Output**: WAV
- **Best for**: Natural human-sounding narration

### Deepgram Aura (currently fallback)
- **Key**: `DEEPGRAM_API_KEY`
- **Voices**: aura-asteria-en, aura-luna-en, aura-orion-en, etc.
- **Output**: WAV linear16 24kHz
- **Best for**: Reliable fallback, wider language support

### Chatterbox TTS
- **Endpoint**: `chatterbox/text-to-speech`
- **Best for**: Memes, games, AI agents — more expressive/stylized

### MiniMax Speech 02 HD
- **Endpoint**: `minimax/speech-02-hd`
- **Best for**: High-quality long-form narration

### xAI TTS
- **Endpoint**: `xai/tts/v1`
- **Best for**: Expressive, realistic voice generation

---

## Image Generation — Reference Image Strategies (Updated 2026-04-03)

### What is IP-Adapter?
A lightweight adapter (~22MB) that injects reference image features into the diffusion process
via a separate cross-attention layer. Uses CLIP image encoder. Only works on Flux General on fal.ai.
Other models achieve the same goal (reference consistency) through different native mechanisms.

### Models WITH Reference Image Support
| Model | Endpoint | Reference Method | Max Refs | Best For |
|-------|----------|-----------------|----------|----------|
| Flux General | `fal-ai/flux-general` | IP-adapter LoRA (`ip_adapters` param) | 3 | Style + composition consistency |
| Flux Kontext Pro | `fal-ai/flux-pro/kontext` | Native context edit (`image_url`) | 1 | Character consistency, iterative editing |
| Flux Kontext Dev | `fal-ai/flux-kontext/dev` | Native context edit (`image_url`) | 1 | Same, cheaper |
| Nano Banana 2 | `fal-ai/nano-banana-2/image-to-image` | Image-to-image (`image_urls`) | 14 | Edit + keep character |
| Nano Banana Pro | `fal-ai/nano-banana-pro/edit` | Edit endpoint (`image_urls`) | multiple | Sketch-to-edit |
| Vidu Q2 | `fal-ai/vidu/q2/reference-to-image` | Multi-reference (`reference_image_urls`) | 3 | Multi-ref character |
| MiniMax | `fal-ai/minimax/image-01/subject-reference` | Face reference (`image_url`) | 1 | Face consistency only |

### Models WITHOUT Reference Image Support
| Model | Endpoint | Notes |
|-------|----------|-------|
| Imagen 4 | `fal-ai/imagen4/preview` | Text only, highest quality text gen |
| Seedream V4/V4.5 | `fal-ai/bytedance/seedream/v4.5/text-to-image` | Text only |
| Recraft V3 | `fal-ai/recraft-v3` | Style reference via create-style endpoint (separate workflow) |
| Flux Schnell | `fal-ai/flux/schnell` | Fast text-to-image, no adapters |
| Flux Dev | `fal-ai/flux/dev` | Quality text-to-image, no adapters |
| Flux Pro | `fal-ai/flux-pro/v1.1` | Best Flux text-to-image, no adapters |

### Pipeline Reference Strategy (storyboard-service.ts)
When user selects a model AND has reference images:
1. **Flux General** → use IP-adapter (current behavior, `ip_adapters` param)
2. **Nano Banana 2/Pro** → use image-to-image endpoint with `image_urls`
3. **Vidu Q2** → use `reference_image_urls` array
4. **MiniMax** → use `image_url` for face reference
5. **Imagen 4 / Seedream / Recraft** → text-only, put reference descriptions in prompt
6. **Flux Kontext** → use `image_url` for context editing

---

## Video Generation

### Kling 2.1 Pro (currently default)
- **Endpoint**: `fal-ai/kling-video/v2.1/pro/image-to-video`
- **Params**: `image_url`, `tail_image_url` (chaining), `duration` ("5"/"10"), `aspect_ratio`, `cfg_scale`

### Kling 2.6 Pro (high motion)
- **Endpoint**: `fal-ai/kling-video/v2.6/pro/image-to-video`
- **Params**: `start_image_url`, `end_image_url` (chaining), `duration`, NO aspect_ratio

### Kling 1.5 Pro
- **Endpoint**: `fal-ai/kling-video/v1.5/pro/image-to-video`

### Luma Ray 2
- **Endpoint**: `fal-ai/luma-dream-machine/ray-2/image-to-video`
- **Params**: Duration as "5s"/"9s" string

### Luma Dream Machine
- **Endpoint**: `fal-ai/luma-dream-machine/image-to-video`

### MiniMax Video
- **Endpoint**: `fal-ai/minimax/video-01/image-to-video`
- **Note**: No duration/aspect_ratio params, no chaining

### Google VEO 3
- **Endpoint**: `fal-ai/veo3/image-to-video`
- **Cost**: $0.50/second (expensive!)
- **Params**: Duration "4s"/"6s"/"8s", aspect_ratio "auto"/"16:9"/"9:16", resolution "720p"/"1080p"
- **Note**: Requires fal.ai account activation

### Google VEO 2
- **Endpoint**: `fal-ai/veo2/image-to-video`
- **Cost**: $0.50/second

---

## Motion Graphics

### LottieFiles (integrated — service ready, UI panel pending)
- **API**: REST + GraphQL at `lottiefiles.com/api/v2/`
- **Key**: `LOTTIEFILES_API_KEY` (optional, basic search works without)
- **Best for**: Animated icons, lower thirds, decorative overlays
- **Format**: Lottie JSON (lightweight, scalable, loopable)
- **URL**: https://lottiefiles.com/

---

## AI Vision / Analysis

### Gemini 2.0 Flash (currently in use)
- **Key**: `GEMINI_API_KEY` / `GOOGLE_API_KEY`
- **Used for**: Image upload analysis, Edit DNA extraction, HTML scene generation, fancy captions

### Gemini 2.5 Flash (currently in use)
- **Used for**: LLM scene parsing, video prompt refinement, caption generation

---

## Infrastructure

### Upstash Redis (queue management)
- **Keys**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **Used for**: Storyboard queue, render queue

### Upstash QStash (async job dispatch)
- **Keys**: `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
- **Used for**: Video generation workers, audio generation workers

### Remotion Lambda (video rendering)
- **Keys**: `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_LAMBDA_FUNCTION_NAME`, `REMOTION_LAMBDA_SERVE_URL`
- **Region**: us-east-1
- **Function**: `remotion-render-4-0-398-mem2048mb-disk2048mb-240sec`

### Google Cloud Storage (media assets)
- **Used for**: All generated media (images, videos, audio, voiceover)
- **Bucket**: `insturix` (Project: insturix-457914)
- **Signed URLs**: 7-day expiration, auto-refreshed by asset resolver

### Cloudflare R2 (CDN cache)
- **Bucket**: `editron-cdn`
- **Worker**: `editron-asset-proxy`
- **Used for**: CDN cache for media assets ($0.015/GB storage, $0 egress)

### AWS SES (email)
- **Region**: ap-south-1
- **Used for**: Transactional email ($0.10/1000)

---

## Auth & Payments
| Service | Used For |
|---------|----------|
| Clerk | User auth, session management |
| Razorpay | Payment processing (India) |

## Hosting
- **Vercel**: Hosting, serverless functions, edge middleware (nimit-jains-projects-bd2b522e)
- **MongoDB Atlas**: All databases — Cluster: main-cluster.glgebdc.mongodb.net (editron_prod, thinkforge_db, insturix_prod)
