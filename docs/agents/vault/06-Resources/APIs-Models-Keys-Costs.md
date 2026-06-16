---
tags:
  - resources
created: 2026-05-24
source: memory/resources.md
---

# APIs, Models, Keys, and Costs

All external service dependencies for the Editron/Insturix platform.

---

## Video Generation Models (5 Active)

| Model | Endpoint | Duration | Key Feature | Config Key |
|-------|----------|----------|-------------|------------|
| Kling 2.1 Pro | `fal-ai/kling-video/v2.1/pro/image-to-video` | 5s or 10s | Default, reliable, cfg_scale | `kling-2.1` |
| Kling 2.6 Pro | `fal-ai/kling-video/v2.6/pro/image-to-video` | configurable | High motion, lip-sync, emphasis markers | `kling-2.6` |
| Seedance 1.5 Pro | `fal-ai/bytedance/seedance/v1.5/pro/image-to-video` | 4-12s integers | Native audio sync, cheapest | `seedance-1.5` |
| Seedance 2.0 | (fal.ai endpoint) | 4-15s | Best audio, multimodal refs | `seedance-2.0` |
| Veo 3.1 | `fal-ai/veo3/image-to-video` | 4s/6s/8s | 4K, 150-300 char prompts | `veo-3.1` |

### Additional Video Models (Available)
- **Kling 1.5 Pro:** `fal-ai/kling-video/v1.5/pro/image-to-video`
- **Luma Ray 2:** `fal-ai/luma-dream-machine/ray-2/image-to-video` (duration as "5s"/"9s" string)
- **Luma Dream Machine:** `fal-ai/luma-dream-machine/image-to-video`
- **MiniMax Video:** `fal-ai/minimax/video-01/image-to-video` (no duration/aspect_ratio params)
- **Google VEO 2:** `fal-ai/veo2/image-to-video` ($0.50/second)

### Seedance 1.5 Pro Details
- **Text-to-video:** `fal-ai/bytedance/seedance/v1.5/pro/text-to-video`
- **Image-to-video:** `fal-ai/bytedance/seedance/v1.5/pro/image-to-video`
- **Cost:** ~$0.26 per 5s 720p with audio
- **Native audio:** `generate_audio: true` (default) -- only model with native audio sync

### UNI-1 by Luma (WAITLIST)
- **Endpoint:** `POST https://api.lumalabs.ai/dream-machine/v1/generations/image`
- **Auth:** `Authorization: Bearer ${LUMA_API_KEY}`
- **#1 Elo** for human image preference. Native `character_ref` for face consistency.
- **Cost:** ~$0.09 per image at 2K

---

## AI Music Generation

### CassetteAI Music Generator (Primary -- Editron BGM)
- **Endpoint:** `cassetteai/music-generator`
- **Cost:** $0.02/output minute
- **Requires:** `prompt` (string) + `duration` (integer, 10-180s)
- **Output:** WAV 44.1kHz stereo
- **Best for:** Instrumental background music (no lyrics needed)

### MiniMax Music v2 (Saved for Musitron)
- **Endpoint:** `fal-ai/minimax-music/v2`
- **Cost:** $0.03/generation
- **Requires:** `prompt` (10-300 chars) + `lyrics_prompt` (10-3000 chars, REQUIRED)
- **Lyrics format:** Use `[Intro]`, `[Verse]`, `[Chorus]`, etc. tags
- **Output:** Complete songs WITH synchronized vocals
- **Note:** lyrics_prompt is REQUIRED even for instrumental

### Beatoven (AVOID)
- **Endpoint:** `beatoven/music-generation`
- **Status:** Permanently IN_QUEUE on fal.ai, never processes. Do not use.

---

## AI Sound Effects

### Mirelo SFX v1.5 (Primary -- Editron SFX)
- **Endpoint:** `mirelo-ai/sfx-v1.5/video-to-audio`
- **Cost:** $0.007/sec/sample
- **Requires:** `video_url` (string, URI)
- **Optional:** `text_prompt`, `num_samples` (2-8), `seed`, `duration` (1-10s), `start_offset`
- **Best for:** Video-synced SFX (analyzes actual video content)
- **Video-to-video variant:** `mirelo-ai/sfx-v1.5/video-to-video`

### SFX Libraries (Royalty-Free)

| Library | Key | License | Size | Best For |
|---------|-----|---------|------|----------|
| Pixabay | `PIXABAY_API_KEY` | Pixabay License (free commercial, no attribution) | Large | Quick deterministic SFX lookup |
| Freesound | `FREESOUND_API_KEY` | Filter for CC0 for commercial | 500k+ sounds | Larger library, license filtering |
| SONNISS GameAudioGDC | Bulk download | Royalty-free, commercial, no attribution | Archive | Seeding curated MongoDB SFX library |

---

## Text-to-Speech

### Kokoro TTS (Primary -- Editron Voiceover)
- **Endpoint:** `fal-ai/kokoro/american-english`
- **Cost:** $0.02/1000 characters
- **Voices:** 20 total
  - 10 Female: af_heart, af_alloy, af_aoede, af_bella, af_jessica, af_kore, af_nicole, af_nova, af_river, af_sarah
  - 10 Male: am_adam, am_echo, am_eric, am_fenrir, am_liam, am_michael, am_onyx, am_puck, am_santa
- **Speed:** 0.1x to 5.0x
- **Output:** WAV

### Deepgram Aura (Fallback)
- **Key:** `DEEPGRAM_API_KEY`
- **Voices:** aura-asteria-en, aura-luna-en, aura-orion-en, etc.
- **Output:** WAV linear16 24kHz
- **Best for:** Reliable fallback, wider language support

### Other TTS Options
- **Chatterbox TTS:** `chatterbox/text-to-speech` -- memes, games, AI agents (expressive/stylized)
- **MiniMax Speech 02 HD:** `minimax/speech-02-hd` -- high-quality long-form narration
- **xAI TTS:** `xai/tts/v1` -- expressive, realistic voice generation

---

## Image Generation

### Models WITH Reference Image Support

| Model | Endpoint | Reference Method | Max Refs | Best For |
|-------|----------|-----------------|----------|----------|
| Flux General | `fal-ai/flux-general` | IP-adapter LoRA (`ip_adapters`) | 3 | Style + composition consistency |
| Flux Kontext Pro | `fal-ai/flux-pro/kontext` | Native context edit (`image_url`) | 1 | Character consistency |
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
| Recraft V3 | `fal-ai/recraft-v3` | Style reference via create-style (separate workflow) |
| Flux Schnell | `fal-ai/flux/schnell` | Fast text-to-image, no adapters |
| Flux Dev | `fal-ai/flux/dev` | Quality text-to-image |
| Flux Pro | `fal-ai/flux-pro/v1.1` | Best Flux text-to-image |

### IP-Adapter Note
Lightweight adapter (~22MB) that injects reference image features into diffusion via separate cross-attention layer. Uses CLIP image encoder. Only works on Flux General on fal.ai. Other models achieve reference consistency through native mechanisms.

### Pipeline Reference Strategy (storyboard-service.ts)
1. Flux General -- use IP-adapter (`ip_adapters` param)
2. Nano Banana 2/Pro -- use image-to-image endpoint with `image_urls`
3. Vidu Q2 -- use `reference_image_urls` array
4. MiniMax -- use `image_url` for face reference
5. Imagen 4 / Seedream / Recraft -- text-only, reference descriptions in prompt
6. Flux Kontext -- use `image_url` for context editing

---

## Motion Graphics

### LottieFiles (Integrated -- service ready, UI panel pending)
- **API:** REST + GraphQL at `lottiefiles.com/api/v2/`
- **Key:** `LOTTIEFILES_API_KEY` (optional, basic search works without)
- **Format:** Lottie JSON (lightweight, scalable, loopable)
- **Best for:** Animated icons, lower thirds, decorative overlays

---

## AI Vision / Analysis

### Gemini Models
- **Gemini 2.0 Flash** -- image upload analysis, Edit DNA extraction, HTML scene generation, fancy captions
- **Gemini 2.5 Flash** -- LLM scene parsing, video prompt refinement, caption generation (LOCKED for 5-Track -- Files API dependency)
- **Gemini 3.1 Flash** -- default for all pipeline LLM calls (except 5-Track)
- **Keys:** `GEMINI_API_KEY` / `GOOGLE_API_KEY`
- **Configurable via:** LLM_PARSER_MODEL, LLM_INTELLIGENCE_MODEL, etc.

### Gemma 4 (Free on Google AI Studio)
- **Models:** `gemma-4-31b-it`, `gemma-4-26b-a4b-it`
- **Same endpoint:** generativelanguage.googleapis.com (same SDK as Gemini)
- **Testable via env vars:** e.g., `LLM_PARSER_MODEL=gemma-4-31b-it`

---

## Infrastructure

### Queue / Async Jobs
| Service | Keys | Used For |
|---------|------|----------|
| Upstash Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Storyboard queue, render queue |
| Upstash QStash | `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Video gen workers, audio gen workers |

### Video Rendering
- **Remotion Lambda**
  - Keys: `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_LAMBDA_FUNCTION_NAME`, `REMOTION_LAMBDA_SERVE_URL`
  - Region: us-east-1
  - Function: `remotion-render-4-0-398-mem2048mb-disk2048mb-240sec`

### Storage
| Service | Details | Cost |
|---------|---------|------|
| Google Cloud Storage | Bucket: `insturix` (Project: insturix-457914). Signed URLs: 7-day expiry, auto-refreshed | Standard GCS pricing |
| Cloudflare R2 | Bucket: `editron-cdn`, Worker: `editron-asset-proxy` | $0.015/GB storage, $0 egress |

### Email
- **AWS SES** -- Region: ap-south-1, $0.10/1000 emails

---

## Auth and Payments

| Service | Used For |
|---------|----------|
| Clerk | User auth, session management |
| Razorpay | Payment processing (India) |

---

## Hosting

- **Vercel:** Hosting, serverless functions, edge middleware (nimit-jains-projects-bd2b522e)
- **MongoDB Atlas:** All databases -- Cluster: main-cluster.glgebdc.mongodb.net
  - `editron_prod` (production, 21 projects)
  - `editron_prev` (preview, 104 projects)
  - `thinkforge_db`
  - `insturix_prod` (31 legacy projects from Jan 2026)

---

## GCP Projects

- **insturix-493414** -- Clerk sign-in OAuth client (verified domain, no scary screen)
- **clerk-oauth-v2** -- YouTube OAuth + sensitive scopes (pending Google verification)

---

## Cross-References

- [[Rules-and-Constraints]] -- Model ID rules, deployment rules
- [[Prompt-Engineering-Methodology]] -- Gemini prompt best practices
