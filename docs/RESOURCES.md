# Resources & APIs — Future Reference

Collected APIs, models, and tools for future use across Insturix products.

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

## Image Generation

### Nano Banana 2 (currently in use — storyboard)
- **Endpoint**: `fal-ai/nano-banana-2`
- **Best for**: Fast storyboard images

### SeedrEam v4.5 (currently in use — storyboard fallback)
- **Endpoint**: `fal-ai/bytedance/seedream/v4.5/text-to-image`
- **Best for**: High quality when IP-adapter fails

### FLUX with IP-adapter (currently in use — reference consistency)
- **Endpoint**: `fal-ai/flux-general/image-to-image`
- **Best for**: Maintaining product/character consistency across scenes

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
- **Bucket**: `insturix-prev-gcs`
- **Signed URLs**: 7-day expiration, auto-refreshed by asset resolver
