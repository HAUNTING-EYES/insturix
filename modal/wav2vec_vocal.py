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
Auth:     Modal proxy authentication (Modal-Key / Modal-Secret)
Consumer: lib/editron/services/wav2vec-service.ts → moment-weight-service.ts (20% Phase 2)

Deploy:   modal deploy modal/wav2vec_vocal.py
Test:     modal serve modal/wav2vec_vocal.py   (local dev server)

Models:   ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition  (emotion classifier)
          librosa for prosodic features (pitch, energy, stress, filler)
GPU:      NVIDIA T4 (16GB VRAM) — wav2vec2-large uses ~1.2GB fp16
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import modal

if TYPE_CHECKING:
    import numpy as np

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
EMOTION_BATCH_SIZE = 8
PROSODY_HOP_LENGTH = 512

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

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def analyze(self, request: dict):
        import time

        t0 = time.time()

        audio_url = request.get("audio_url")
        segments = request.get("segments", [])
        if not audio_url or not segments:
            return {"error": "audio_url and segments[] required", "segments": []}

        # ── 1. Download + decode audio ─────────────────────────────────
        try:
            waveform, sr = _load_audio(audio_url)
        except Exception:
            return {
                "error": "audio_load_failed",
                "segments": [],
                "model_version": "wav2vec-2.0",
                "processing_time_ms": int((time.time() - t0) * 1000),
            }

        chunks: list[tuple[int, dict, "np.ndarray"]] = []
        results: list[dict | None] = [None] * len(segments)
        for index, seg in enumerate(segments):
            start_sample = max(0, int(seg["start_ms"] / 1000.0 * sr))
            end_sample = min(len(waveform), int(seg["end_ms"] / 1000.0 * sr))
            chunk = waveform[start_sample:end_sample]
            if len(chunk) >= sr * 0.1:
                chunks.append((index, seg, chunk))

        if chunks:
            first_sample = min(max(0, int(seg["start_ms"] / 1000.0 * sr)) for _, seg, _ in chunks)
            last_sample = max(min(len(waveform), int(seg["end_ms"] / 1000.0 * sr)) for _, seg, _ in chunks)
            prosody = _build_prosody_track(
                waveform[first_sample:last_sample],
                sr,
                origin_sample=first_sample,
            )
        else:
            prosody = _build_prosody_track(waveform[:0], sr, origin_sample=0)

        classifications = self._classify_emotions(
            [chunk for _, _, chunk in chunks],
            sr,
        )
        for (index, seg, chunk), (emotion_label, emotion_conf) in zip(
            chunks,
            classifications,
        ):
            energy = _compute_energy(chunk, sr)
            pitch_var = _segment_pitch_variability(prosody, seg, sr)
            stress = _segment_stress(prosody, seg, sr)
            filler = _filler_confidence(chunk, sr, pitch_var, energy)
            results[index] = {
                "start_ms": seg["start_ms"],
                "end_ms": seg["end_ms"],
                "emotion_intensity": round(float(emotion_conf), 4),
                "emotional_valence": VALENCE_MAP.get(emotion_label, "neutral"),
                "energy": round(energy, 4),
                "pitch_variability": round(pitch_var, 4),
                "stress_detected": stress,
                "filler_confidence": round(filler, 4),
            }

        completed_results = [result for result in results if result is not None]
        elapsed_ms = int((time.time() - t0) * 1000)
        return {
            "segments": completed_results,
            "model_version": "wav2vec-2.0",
            "processing_time_ms": elapsed_ms,
        }

    def _classify_emotions(
        self, chunks: list["np.ndarray"], sr: int
    ) -> list[tuple[str, float]]:
        """Run length-bucketed GPU batches while preserving input order."""
        import torch
        import numpy as np

        if not chunks:
            return []
        if sr != TARGET_SR:
            import librosa
            chunks = [
                librosa.resample(chunk, orig_sr=sr, target_sr=TARGET_SR)
                for chunk in chunks
            ]

        indexed = sorted(enumerate(chunks), key=lambda item: len(item[1]))
        results: list[tuple[str, float] | None] = [None] * len(chunks)
        for offset in range(0, len(indexed), EMOTION_BATCH_SIZE):
            batch = indexed[offset:offset + EMOTION_BATCH_SIZE]
            inputs = self.feature_extractor(
                [chunk for _, chunk in batch],
                sampling_rate=TARGET_SR,
                return_tensors="pt",
                padding=True,
                return_attention_mask=True,
            )
            model_inputs = {"input_values": inputs.input_values.half().cuda()}
            if "attention_mask" in inputs:
                model_inputs["attention_mask"] = inputs.attention_mask.cuda()
            with torch.no_grad():
                logits = self.model(**model_inputs).logits
            probabilities = torch.softmax(logits, dim=-1).cpu().float().numpy()
            for (source_index, _), probs in zip(batch, probabilities):
                pred_idx = int(np.argmax(probs))
                label = self.labels[pred_idx] if pred_idx < len(self.labels) else "neutral"
                results[source_index] = (label, float(probs[pred_idx]))

        if any(result is None for result in results):
            raise RuntimeError("emotion classifier did not return one result per input")
        return [result for result in results if result is not None]


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


def _build_prosody_track(waveform: "np.ndarray", sr: int, origin_sample: int) -> dict:
    """Compute one fast pitch/energy track for the requested source span."""
    import librosa
    import numpy as np

    if len(waveform) == 0:
        empty = np.array([], dtype=np.float32)
        return {"rms": empty, "f0": empty, "origin_sample": origin_sample}
    rms = librosa.feature.rms(
        y=waveform,
        frame_length=2048,
        hop_length=PROSODY_HOP_LENGTH,
    )[0]
    try:
        f0 = librosa.yin(
            waveform,
            fmin=librosa.note_to_hz("C2"),   # ~65 Hz
            fmax=librosa.note_to_hz("C7"),   # ~2093 Hz
            sr=sr,
            hop_length=PROSODY_HOP_LENGTH,
        )
        shared_length = min(len(f0), len(rms))
        f0 = f0[:shared_length]
        rms = rms[:shared_length]
        rms_db = librosa.amplitude_to_db(rms, ref=1.0)
        f0[rms_db <= ENERGY_FLOOR_DB] = np.nan
    except Exception:
        f0 = np.full(len(rms), np.nan, dtype=np.float32)
    return {"rms": rms, "f0": f0, "origin_sample": origin_sample}


def _segment_track_values(prosody: dict, track_name: str, seg: dict, sr: int) -> "np.ndarray":
    track = prosody[track_name]
    origin_sample = prosody["origin_sample"]
    start_sample = int(seg["start_ms"] / 1000.0 * sr) - origin_sample
    end_sample = int(seg["end_ms"] / 1000.0 * sr) - origin_sample
    start_frame = max(0, int(start_sample / PROSODY_HOP_LENGTH))
    end_frame = min(
        len(track),
        max(start_frame + 1, int(end_sample / PROSODY_HOP_LENGTH) + 1),
    )
    return track[start_frame:end_frame]


def _segment_pitch_variability(prosody: dict, seg: dict, sr: int) -> float:
    import numpy as np

    f0 = _segment_track_values(prosody, "f0", seg, sr)
    voiced_f0 = f0[np.isfinite(f0)]
    if len(voiced_f0) < 3:
        return 0.0
    std = float(np.std(voiced_f0))
    return min(1.0, max(0.0, std / PITCH_NORM_HZ))


def _segment_stress(prosody: dict, seg: dict, sr: int) -> bool:
    """Detect vocal stress from source-level pitch and energy frame evidence."""
    import numpy as np

    rms = _segment_track_values(prosody, "rms", seg, sr)
    if len(rms) < 3:
        return False
    energy_z = (rms - rms.mean()) / (rms.std() + 1e-8)
    energy_peaks = np.any(energy_z > STRESS_ENERGY_ZSCORE)

    f0 = _segment_track_values(prosody, "f0", seg, sr)
    voiced_f0 = f0[np.isfinite(f0)]
    if len(voiced_f0) < 3:
        return bool(energy_peaks)
    pitch_z = (voiced_f0 - voiced_f0.mean()) / (voiced_f0.std() + 1e-8)
    pitch_peaks = np.any(pitch_z > STRESS_PITCH_ZSCORE)
    return bool(energy_peaks and pitch_peaks)


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
