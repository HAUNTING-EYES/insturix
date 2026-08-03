"""
Wav2Vec 2.0 Vocal Emotion Analysis — Modal Serverless GPU Endpoint
Insturix Editron · TRIBE v2 Phase 2B

Analyzes audio segments using Wav2Vec 2.0 + emotion classifier to extract:
  - emotion_intensity: vocal arousal / stress level (0-1)
  - emotional_valence: positive | negative | neutral | mixed
  - energy: RMS speech energy normalized (0-1)
  - pitch_variability: F0 standard deviation normalized (0-1)
  - stress_detected: word-level emphasis from pitch+energy peaks
  - filler_confidence: probability segment contains filler-like hesitation

Endpoint: POST https://insturix--wav2vec-vocal.modal.run
Auth:     Token {MODAL_TOKEN_ID}:{MODAL_TOKEN_SECRET}
Consumer: lib/editron/services/wav2vec-service.ts → moment-weight-service.ts (20% Phase 2)

Deploy:   modal deploy modal/wav2vec_vocal.py
Test:     modal serve modal/wav2vec_vocal.py   (local dev server)

Models:   ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition  (emotion classifier)
          librosa for prosodic features (pitch, energy, stress, filler)
GPU:      NVIDIA T4 (16GB VRAM) — wav2vec2-large uses ~1.2GB fp16
"""

from __future__ import annotations

import modal

# ─── Modal App ──────────────────────────────────────────────────────────────

app = modal.App("wav2vec-vocal")

# ─── Container Image ────────────────────────────────────────────────────────


def download_models():
    """Download wav2vec2 emotion model at image build time."""
    from transformers import Wav2Vec2ForSequenceClassification, Wav2Vec2FeatureExtractor
    model_id = "ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition"
    Wav2Vec2FeatureExtractor.from_pretrained(model_id)
    Wav2Vec2ForSequenceClassification.from_pretrained(model_id)


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "torch>=2.4",
        "torchaudio>=2.4",
        "transformers>=4.46",
        "huggingface_hub",
        "librosa>=0.10",
        "soundfile>=0.12",
        "numpy>=1.26",
        "requests",
        "fastapi[standard]",
    )
    .run_function(download_models)
)

# ─── Constants ──────────────────────────────────────────────────────────────

EMOTION_MODEL_ID = "ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition"
TARGET_SR = 16000  # wav2vec2 expects 16kHz

# Emotion label → valence mapping
# Model labels: angry, calm, disgust, fearful, happy, neutral, sad, surprised
VALENCE_MAP: dict[str, str] = {
    "angry": "negative",
    "calm": "positive",
    "disgust": "negative",
    "fearful": "negative",
    "happy": "positive",
    "neutral": "neutral",
    "sad": "negative",
    "surprised": "mixed",
}

# Prosodic thresholds (← from speech prosody literature, Bänziger & Scherer 2005)
PITCH_NORM_HZ = 200.0         # typical F0 std dev ceiling for normalization
ENERGY_FLOOR_DB = -60.0       # dBFS below which we consider silence
STRESS_PITCH_ZSCORE = 1.5     # z-score threshold for pitch peak = stress
STRESS_ENERGY_ZSCORE = 1.5    # z-score threshold for energy peak = stress
FILLER_PITCH_FLAT_THRESH = 15.0   # Hz — filler words have very flat pitch
FILLER_ENERGY_LOW_THRESH = 0.3    # normalized — fillers are quiet

# ─── Inference Class ────────────────────────────────────────────────────────


@app.cls(
    image=image,
    gpu="T4",
    scaledown_window=300,
    timeout=300,
)
class Wav2VecAnalyzer:
    """Stateful container: emotion model + librosa loaded once."""

    @modal.enter()
    def load_model(self):
        import torch
        from transformers import (
            Wav2Vec2ForSequenceClassification,
            Wav2Vec2FeatureExtractor,
        )

        self.feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(
            EMOTION_MODEL_ID,
        )
        self.model = Wav2Vec2ForSequenceClassification.from_pretrained(
            EMOTION_MODEL_ID,
            torch_dtype=torch.float16,
        ).cuda()
        self.model.eval()

        # Build label list from model config
        self.labels: list[str] = []
        if hasattr(self.model.config, "id2label"):
            self.labels = [
                self.model.config.id2label[i]
                for i in range(len(self.model.config.id2label))
            ]
        if not self.labels:
            self.labels = [
                "angry", "calm", "disgust", "fearful",
                "happy", "neutral", "sad", "surprised",
            ]

        print(f"[Wav2VecAnalyzer] Model loaded, labels={self.labels}")

    @modal.fastapi_endpoint(method="POST")
    def analyze(self, request: dict):
        import time
        import numpy as np

        t0 = time.time()

        audio_url = request.get("audio_url")
        segments = request.get("segments", [])
        if not audio_url or not segments:
            return {"error": "audio_url and segments[] required", "segments": []}

        # ── 1. Download + decode audio ─────────────────────────────────
        try:
            waveform, sr = _load_audio(audio_url)
        except Exception as e:
            print(f"[Wav2VecAnalyzer] Audio load failed: {e}")
            return {
                "segments": [_empty(s) for s in segments],
                "model_version": "wav2vec-2.0",
                "processing_time_ms": int((time.time() - t0) * 1000),
            }

        # ── 2. Analyze each segment ────────────────────────────────────
        results: list[dict] = []

        for seg in segments:
            start_sample = int(seg["start_ms"] / 1000.0 * sr)
            end_sample = int(seg["end_ms"] / 1000.0 * sr)
            chunk = waveform[start_sample:end_sample]

            if len(chunk) < sr * 0.1:  # <100ms, too short
                results.append(_empty(seg))
                continue

            # ── Emotion classification ─────────────────────────────────
            emotion_label, emotion_conf = self._classify_emotion(chunk, sr)
            valence = VALENCE_MAP.get(emotion_label, "neutral")

            # Emotion intensity = model confidence (higher = more expressive)
            emotion_intensity = float(emotion_conf)

            # ── Prosodic features via librosa ──────────────────────────
            energy = _compute_energy(chunk, sr)
            pitch_var = _compute_pitch_variability(chunk, sr)
            stress = _detect_stress(chunk, sr)
            filler = _filler_confidence(chunk, sr, pitch_var, energy)

            results.append({
                "start_ms": seg["start_ms"],
                "end_ms": seg["end_ms"],
                "emotion_intensity": round(emotion_intensity, 4),
                "emotional_valence": valence,
                "energy": round(energy, 4),
                "pitch_variability": round(pitch_var, 4),
                "stress_detected": stress,
                "filler_confidence": round(filler, 4),
            })

        elapsed_ms = int((time.time() - t0) * 1000)
        print(
            f"[Wav2VecAnalyzer] {len(results)} segments in {elapsed_ms}ms "
            f"(avg emotion={np.mean([r['emotion_intensity'] for r in results]):.2f})"
        )

        return {
            "segments": results,
            "model_version": "wav2vec-2.0",
            "processing_time_ms": elapsed_ms,
        }

    def _classify_emotion(
        self, chunk: "np.ndarray", sr: int
    ) -> tuple[str, float]:
        """Run wav2vec2 emotion classifier on audio chunk."""
        import torch
        import numpy as np

        # Resample to 16kHz if needed
        if sr != TARGET_SR:
            import librosa
            chunk = librosa.resample(chunk, orig_sr=sr, target_sr=TARGET_SR)

        inputs = self.feature_extractor(
            chunk,
            sampling_rate=TARGET_SR,
            return_tensors="pt",
            padding=True,
        )
        input_values = inputs.input_values.half().cuda()

        with torch.no_grad():
            logits = self.model(input_values).logits

        probs = torch.softmax(logits, dim=-1)[0].cpu().float().numpy()
        pred_idx = int(np.argmax(probs))
        label = self.labels[pred_idx] if pred_idx < len(self.labels) else "neutral"
        confidence = float(probs[pred_idx])

        return label, confidence


# ─── Audio Loading ──────────────────────────────────────────────────────────


def _load_audio(url: str) -> tuple["np.ndarray", int]:
    """Download audio from URL, decode to mono float32 numpy at native SR.
    Handles R2 presigned URLs and CDN proxy URLs (query params stripped for extension detection)."""
    import tempfile
    import os
    import requests
    import librosa
    from urllib.parse import urlparse

    resp = requests.get(url, timeout=120, stream=True)
    resp.raise_for_status()

    # Parse URL path (strip query params) to get real file extension
    parsed_path = urlparse(url).path.lower()
    ext = ".wav"
    if parsed_path.endswith(".mp3"):
        ext = ".mp3"
    elif parsed_path.endswith(".mp4") or parsed_path.endswith(".m4a"):
        ext = ".mp4"
    elif parsed_path.endswith(".ogg") or parsed_path.endswith(".opus"):
        ext = ".ogg"
    elif parsed_path.endswith(".webm"):
        ext = ".webm"
    elif parsed_path.endswith(".flac"):
        ext = ".flac"
    else:
        # Fall back to Content-Type header
        content_type = resp.headers.get("content-type", "").lower()
        if "mp3" in content_type or "mpeg" in content_type:
            ext = ".mp3"
        elif "mp4" in content_type or "m4a" in content_type:
            ext = ".mp4"
        elif "ogg" in content_type or "opus" in content_type:
            ext = ".ogg"
        elif "webm" in content_type:
            ext = ".webm"

    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    try:
        for chunk in resp.iter_content(chunk_size=8192):
            tmp.write(chunk)
        tmp.close()

        # librosa loads to mono float32 at target SR (ffmpeg backend handles all formats)
        waveform, sr = librosa.load(tmp.name, sr=TARGET_SR, mono=True)
        return waveform, sr
    finally:
        os.unlink(tmp.name)


# ─── Prosodic Feature Helpers ───────────────────────────────────────────────


def _compute_energy(chunk: "np.ndarray", sr: int) -> float:
    """RMS energy normalized to 0-1."""
    import numpy as np

    rms = np.sqrt(np.mean(chunk ** 2))
    if rms < 1e-8:
        return 0.0

    # Convert to dBFS, normalize against typical speech range (-50 to -10 dBFS)
    db = 20.0 * np.log10(rms + 1e-10)
    normalized = (db - ENERGY_FLOOR_DB) / (-ENERGY_FLOOR_DB)
    return float(min(1.0, max(0.0, normalized)))


def _compute_pitch_variability(chunk: "np.ndarray", sr: int) -> float:
    """F0 standard deviation normalized to 0-1."""
    import librosa
    import numpy as np

    try:
        f0, voiced_flag, _ = librosa.pyin(
            chunk,
            fmin=librosa.note_to_hz("C2"),   # ~65 Hz
            fmax=librosa.note_to_hz("C7"),   # ~2093 Hz
            sr=sr,
        )

        voiced_f0 = f0[voiced_flag] if voiced_flag is not None else f0[~np.isnan(f0)]
        if len(voiced_f0) < 3:
            return 0.0

        std = float(np.std(voiced_f0))
        return min(1.0, max(0.0, std / PITCH_NORM_HZ))
    except Exception:
        return 0.0


def _detect_stress(chunk: "np.ndarray", sr: int) -> bool:
    """Detect vocal stress from pitch + energy peaks exceeding z-score thresholds."""
    import librosa
    import numpy as np

    try:
        # Frame-level energy
        rms = librosa.feature.rms(y=chunk, frame_length=2048, hop_length=512)[0]
        if len(rms) < 3:
            return False

        energy_z = (rms - rms.mean()) / (rms.std() + 1e-8)
        energy_peaks = np.any(energy_z > STRESS_ENERGY_ZSCORE)

        # Frame-level pitch
        f0, voiced, _ = librosa.pyin(
            chunk,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
            sr=sr,
        )
        voiced_f0 = f0[voiced] if voiced is not None else f0[~np.isnan(f0)]
        if len(voiced_f0) < 3:
            return bool(energy_peaks)

        pitch_z = (voiced_f0 - voiced_f0.mean()) / (voiced_f0.std() + 1e-8)
        pitch_peaks = np.any(pitch_z > STRESS_PITCH_ZSCORE)

        return bool(energy_peaks and pitch_peaks)
    except Exception:
        return False


def _filler_confidence(
    chunk: "np.ndarray",
    sr: int,
    pitch_var: float,
    energy: float,
) -> float:
    """
    Estimate filler word probability from prosodic cues.

    Filler words (um, uh, like) exhibit:
    - Very flat pitch (low F0 variability)
    - Lower energy than surrounding speech
    - Typically 200-800ms duration
    """
    duration_s = len(chunk) / sr

    # Fillers are typically short segments
    if duration_s > 3.0:
        return 0.0

    indicators = 0.0

    # Low pitch variability → filler-like
    if pitch_var < (FILLER_PITCH_FLAT_THRESH / PITCH_NORM_HZ):
        indicators += 0.4

    # Low energy → filler-like
    if energy < FILLER_ENERGY_LOW_THRESH:
        indicators += 0.3

    # Very short segment (200-800ms) → more likely filler
    if 0.15 <= duration_s <= 1.0:
        indicators += 0.3
    elif duration_s < 0.15:
        indicators += 0.1

    return min(1.0, indicators)


def _empty(seg: dict) -> dict:
    return {
        "start_ms": seg.get("start_ms", 0),
        "end_ms": seg.get("end_ms", 0),
        "emotion_intensity": 0.5,
        "emotional_valence": "neutral",
        "energy": 0.5,
        "pitch_variability": 0.0,
        "stress_detected": False,
        "filler_confidence": 0.0,
    }
