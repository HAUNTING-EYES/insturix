# Chatterbox TTS on Modal — deploy guide

Deploys the voice-cloning service the Avatar Vault pipeline calls. Chatterbox is a
GPU model (PyTorch) — it runs here on Modal, **not** in the browser and **not** on
Vercel. Vercel (the Next.js app) just calls this URL.

## Flow

```
browser records / uploads a voice sample  →  R2  →  our backend
        → POST {CHATTERBOX_TTS_ENDPOINT}/v1/audio/speech (input + voice_file)
        → Chatterbox on Modal (A10G GPU) clones the voice → WAV
        → we store the WAV → fal OmniHuman animates the avatar with it
```

## 1. Deploy to Modal

```bash
pip install modal
modal token new                                            # one-time browser auth

# Strong shared secret so your GPU URL isn't open to the internet:
modal secret create chatterbox-auth CHATTERBOX_AUTH_TOKEN=$(openssl rand -hex 24)

modal deploy infra/chatterbox-modal/chatterbox_modal.py
```

`modal deploy` prints a public URL, e.g.:

```
https://<your-workspace>--chatterbox-tts-web.modal.run
```

That is your **base URL** (no `/v1/audio/speech` on the end).

## 2. Wire it into Vercel (preview AND production)

Set these env vars in the Vercel project (Settings → Environment Variables), for
**both** Preview and Production:

| Var | Value |
|-----|-------|
| `CHATTERBOX_TTS_ENDPOINT` | the Modal base URL from step 1 |
| `CHATTERBOX_TTS_API_KEY`  | the same token you put in the `chatterbox-auth` secret |

(`FAL_AI_API_KEY`, the R2 vars, and `MONGODB_URI` are already set app-wide.)

Redeploy the Vercel preview/prod so the new env is picked up.

## 3. Smoke test

```bash
TOKEN=<your token>
URL=https://<your-workspace>--chatterbox-tts-web.modal.run

curl "$URL/health"                                  # {"status":"ok",...}

curl -X POST "$URL/v1/audio/speech" \
  -H "Authorization: Bearer $TOKEN" \
  -F "input=Hey, this is a quick avatar pipeline test." \
  -F "voice_file=@sample.wav" \
  --output out.wav                                  # play out.wav
```

## Notes / gotchas

- **Cold start:** first call after idle downloads weights + boots the GPU (~1-3 min).
  Weights are cached on a Modal Volume (`chatterbox-hf-cache`) so later cold starts are
  faster. `scaledown_window` keeps a container warm 5 min after the last request.
- **Cost:** A10G is billed per second while warm. Lower `scaledown_window` to save money,
  raise it to avoid cold starts during a demo.
- **Sync call:** our backend calls this synchronously inside the create-pipeline-job route.
  A cold start can exceed Vercel's function timeout — warm it (hit `/health`) before a demo,
  or raise that route's `maxDuration`.
- **Input length:** capped at 3000 chars per request (Chatterbox is short-form). Chunk longer
  scripts upstream.
- **Sample quality:** 10-30s of clean single-speaker speech, ≤10MB, WAV/MP3.
- **Model access:** `chatterbox-tts` (resemble-ai) is public; no HF token needed. If a future
  pinned version gates weights, add `modal secret create hf-token HF_TOKEN=...` and include it
  in the `@app.cls(secrets=[...])` list.
