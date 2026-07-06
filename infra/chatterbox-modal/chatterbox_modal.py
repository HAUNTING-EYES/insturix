"""
Chatterbox TTS on Modal (GPU) — voice-cloning endpoint for Avatar Vault.

Serves the EXACT contract the app's avatar-chatterbox-client.ts speaks:

  POST {base}/v1/audio/speech    multipart/form-data
       input=<script text>       (Form field)
       voice_file=<sample.wav|mp3> (File field, 10-30s clean speech)
    -> 200 audio/wav  (raw WAV bytes)

  GET  {base}/health  -> {"status":"ok", ...}

Why a small custom app instead of the travisvn server: the travisvn server exposes
cloning at /v1/audio/speech/UPLOAD, but the client calls /v1/audio/speech. We own
both ends here, so we serve the client's path directly. Model + GPU pattern follow
Modal's official chatterbox example (A10G, load-once per container, WAV streaming).

Deploy:
  pip install modal
  modal token new                              # one-time auth
  modal secret create chatterbox-auth CHATTERBOX_AUTH_TOKEN=<random-strong-token>
  modal deploy infra/chatterbox-modal/chatterbox_modal.py
  # -> prints a URL like  https://<workspace>--chatterbox-tts-web.modal.run
  # Put that base URL in Vercel as CHATTERBOX_TTS_ENDPOINT (preview + prod),
  # and the same token as CHATTERBOX_TTS_API_KEY.
"""

import io
import os
import tempfile

import modal

# HuggingFace cache lives on a Volume so cold starts don't re-download weights.
HF_CACHE_DIR = "/cache"
hf_cache_vol = modal.Volume.from_name("chatterbox-hf-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "chatterbox-tts==0.1.6",
        "torchaudio",
        "fastapi[standard]",
        "python-multipart",
    )
    .env({"HF_HOME": HF_CACHE_DIR})
)

app = modal.App("chatterbox-tts")

with image.imports():
    import torchaudio as ta
    from chatterbox.tts import ChatterboxTTS
    from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
    from fastapi.responses import StreamingResponse

# Chatterbox synthesizes short-form speech; keep a bound so one request can't hang
# the GPU on a novel-length script. Chunk upstream if you need more. 3000 ← the
# travisvn/chatterboxtts.com documented input ceiling.
MAX_INPUT_CHARS = 3000


@app.cls(
    gpu="a10g",
    image=image,
    volumes={HF_CACHE_DIR: hf_cache_vol},
    secrets=[modal.Secret.from_name("chatterbox-auth")],
    scaledown_window=60 * 5,  # keep warm 5 min after last request
    timeout=60 * 10,
)
@modal.concurrent(max_inputs=2)
class Chatterbox:
    @modal.enter()
    def load(self):
        self.model = ChatterboxTTS.from_pretrained(device="cuda")

    @modal.asgi_app()
    def web(self):
        web_app = FastAPI(title="Avatar Vault Chatterbox")

        def check_auth(authorization: str | None):
            expected = os.environ.get("CHATTERBOX_AUTH_TOKEN", "").strip()
            if not expected:
                return  # open mode — set CHATTERBOX_AUTH_TOKEN to require a bearer token
            if authorization != f"Bearer {expected}":
                raise HTTPException(status_code=401, detail="Invalid or missing bearer token.")

        @web_app.get("/health")
        def health():
            return {"status": "ok", "model_loaded": True, "device": "cuda"}

        @web_app.post("/v1/audio/speech")
        async def speech(
            input: str = Form(...),
            voice_file: UploadFile = File(...),
            authorization: str | None = Header(default=None),
        ):
            check_auth(authorization)

            text = (input or "").strip()
            if not text:
                raise HTTPException(status_code=400, detail="`input` (script text) is required.")
            if len(text) > MAX_INPUT_CHARS:
                raise HTTPException(status_code=413, detail=f"`input` exceeds {MAX_INPUT_CHARS} characters; chunk it.")

            sample_bytes = await voice_file.read()
            if not sample_bytes:
                raise HTTPException(status_code=400, detail="`voice_file` (voice sample) is empty.")

            suffix = os.path.splitext(voice_file.filename or "sample.wav")[1] or ".wav"
            tmp_path = None
            try:
                with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                    tmp.write(sample_bytes)
                    tmp_path = tmp.name
                # audio_prompt_path = the voice to clone from.
                wav = self.model.generate(text, audio_prompt_path=tmp_path)
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    os.unlink(tmp_path)

            buffer = io.BytesIO()
            ta.save(buffer, wav, self.model.sr, format="wav")
            buffer.seek(0)
            return StreamingResponse(buffer, media_type="audio/wav")

        return web_app
