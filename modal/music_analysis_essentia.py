"""
Music Analysis via Essentia — Modal Serverless Endpoint
Insturix Editron · Phase 6+7 Music Mode Activation

Analyzes audio for music characteristics using Essentia:
  - bpm: tempo in beats per minute
  - beats: array of {timestamp_ms, strength} for each beat
  - sections: array of {start_ms, end_ms, label} for musical sections
  - music_presence: 0-1 ratio of audio that is music vs speech/silence
  - key: musical key (e.g., "C major")
  - energy_curve: per-frame energy values
  - duration_ms: total audio duration

Endpoint: POST https://jainnimit728--music-analysis-essentia-analyzer-analyze.modal.run
Auth:     Modal proxy authentication (Modal-Key / Modal-Secret)
Consumer: lib/editron/services/music-analysis-service.ts → director-agent.ts

Deploy:   modal deploy modal/music_analysis_essentia.py
Test:     modal serve modal/music_analysis_essentia.py   (local dev server)

Algorithms: Essentia RhythmExtractor2013, BeatTrackerMultiFeature,
            KeyExtractor, music/speech classifier
CPU-only:   Essentia is CPU-bound (no GPU needed). Uses modal.Image.debian_slim.
"""

from __future__ import annotations

import modal

# ─── Modal App ──────────────────────────────────────────────────────────────

app = modal.App("music-analysis-essentia")

# ─── Container Image ────────────────────────────────────────────────────────

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1", "libfftw3-dev")
    .pip_install(
        "essentia>=2.1b6.dev1034",
        "numpy>=1.26",
        "requests",
        "soundfile>=0.12",
        "fastapi[standard]",
    )
)

# ─── Constants ──────────────────────────────────────────────────────────────

TARGET_SR = 44100  # Essentia standard sample rate

# ─── Inference Class ────────────────────────────────────────────────────────


@app.cls(
    image=image,
    cpu=2.0,
    memory=2048,
    scaledown_window=300,
    timeout=300,
)
class EssentiaAnalyzer:
    """Stateful container: Essentia loaded once, reused across requests."""

    @modal.enter()
    def setup(self):
        import essentia.standard as es

        self.es = es

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def analyze(self, request: dict):
        import time
        import numpy as np

        t0 = time.time()

        audio_url = request.get("audio_url")
        if not audio_url:
            return {"error": "audio_url required"}

        # ── 1. Download + decode audio ─────────────────────────────────
        try:
            audio, sr = _load_audio(audio_url, TARGET_SR)
        except Exception:
            return _empty_response(0, t0)

        duration_ms = len(audio) / sr * 1000

        # ── 2. BPM + Beat tracking ─────────────────────────────────────
        try:
            bpm, beats_frames, beats_confidence, _, _ = self.es.RhythmExtractor2013()(audio)
            beat_timestamps = (beats_frames / sr * 1000).tolist()

            beat_tracker = self.es.BeatTrackerMultiFeature()
            bt_ticks, bt_confidence = beat_tracker(audio)
            bt_timestamps = (bt_ticks * 1000).tolist()

            # Use BeatTrackerMultiFeature timestamps if available (more accurate)
            if len(bt_timestamps) > len(beat_timestamps) * 0.5:
                final_beats = bt_timestamps
                final_strengths = [float(bt_confidence)] * len(bt_timestamps)
            else:
                final_beats = beat_timestamps
                final_strengths = beats_confidence.tolist() if hasattr(beats_confidence, 'tolist') else [0.5] * len(beat_timestamps)

            # Normalize strengths to 0-1
            if final_strengths:
                max_s = max(final_strengths) if max(final_strengths) > 0 else 1.0
                final_strengths = [s / max_s for s in final_strengths]

        except Exception:
            bpm = 0
            final_beats = []
            final_strengths = []

        # ── 3. Key detection ───────────────────────────────────────────
        try:
            key, scale, key_strength = self.es.KeyExtractor()(audio)
            key_str = f"{key} {scale}" if key_strength > 0.3 else None
        except Exception:
            key_str = None

        # ── 4. Energy curve ────────────────────────────────────────────
        try:
            frame_size = int(sr * 0.05)  # 50ms frames
            hop_size = frame_size // 2
            energy_curve = []
            for i in range(0, len(audio) - frame_size, hop_size):
                frame = audio[i:i + frame_size]
                rms = float(np.sqrt(np.mean(frame ** 2)))
                energy_curve.append(rms)

            # Normalize
            if energy_curve:
                max_e = max(energy_curve) if max(energy_curve) > 0 else 1.0
                energy_curve = [e / max_e for e in energy_curve]
        except Exception:
            energy_curve = []

        # ── 5. Music presence estimation ───────────────────────────────
        # Ratio of audio that has detectable rhythmic content
        try:
            music_presence = _estimate_music_presence(
                audio, sr, bpm, len(final_beats), duration_ms, energy_curve
            )
        except Exception:
            music_presence = 0.0

        # ── 6. Section detection ───────────────────────────────────────
        # Simple energy-based segmentation (Essentia's SBic or structural segmentation)
        try:
            sections = _detect_sections(audio, sr, energy_curve, duration_ms)
        except Exception:
            sections = []

        processing_time_ms = int((time.time() - t0) * 1000)

        result = {
            "bpm": round(float(bpm), 1),
            "beats": [
                {"timestamp_ms": round(t, 1), "strength": round(s, 3)}
                for t, s in zip(final_beats, final_strengths)
            ],
            "sections": sections,
            "music_presence": round(float(music_presence), 3),
            "key": key_str,
            "energy_curve": [round(e, 3) for e in energy_curve[:500]],  # cap at 500 points
            "duration_ms": round(duration_ms, 1),
            "processing_time_ms": processing_time_ms,
        }

        return result


# ─── Audio Loading ──────────────────────────────────────────────────────────


def _load_audio(url: str, target_sr: int):
    """Download audio from URL, decode to numpy array at target sample rate."""
    import requests
    import tempfile
    import subprocess
    import soundfile as sf

    response = requests.get(url, timeout=120)
    response.raise_for_status()

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_in:
        tmp_in.write(response.content)
        tmp_in_path = tmp_in.name

    tmp_wav_path = tmp_in_path.replace(".mp4", ".wav")

    try:
        subprocess.run(
            ["ffmpeg", "-i", tmp_in_path, "-ac", "1", "-ar", str(target_sr),
             "-f", "wav", "-y", tmp_wav_path],
            capture_output=True, check=True, timeout=120,
        )
        audio, sr = sf.read(tmp_wav_path, dtype="float32")
        return audio, sr
    finally:
        import os
        for p in [tmp_in_path, tmp_wav_path]:
            try:
                os.unlink(p)
            except OSError:
                pass


# ─── Music Presence Estimation ──────────────────────────────────────────────


def _estimate_music_presence(
    audio, sr: int, bpm: float, beat_count: int,
    duration_ms: float, energy_curve: list[float],
) -> float:
    """
    Estimate how much of the audio is music (vs speech/silence/noise).

    Heuristic based on:
      - Beat regularity: rhythmic content has consistent beat intervals
      - BPM plausibility: music typically 60-200 BPM
      - Energy variance: music has more dynamic range than speech
      - Beat density: more beats = more rhythmic

    Returns 0-1. Above 0.6 = music-dominant (triggers music mode in Director).
    """
    import numpy as np

    score = 0.0

    # BPM in plausible music range (60-200)
    if 60 <= bpm <= 200:
        score += 0.3
    elif 40 <= bpm <= 250:
        score += 0.15

    # Beat density: expect at least 1 beat per 2 seconds for music
    duration_sec = duration_ms / 1000
    if duration_sec > 0 and beat_count > 0:
        beats_per_sec = beat_count / duration_sec
        if beats_per_sec >= 0.5:  # at least 30 BPM effective
            score += 0.3
        elif beats_per_sec >= 0.2:
            score += 0.15

    # Energy variance: music has dynamic range
    if energy_curve:
        energy_std = float(np.std(energy_curve))
        if energy_std > 0.15:
            score += 0.2
        elif energy_std > 0.08:
            score += 0.1

    # Non-silence ratio
    if energy_curve:
        non_silence = sum(1 for e in energy_curve if e > 0.05) / len(energy_curve)
        if non_silence > 0.7:
            score += 0.2
        elif non_silence > 0.4:
            score += 0.1

    return min(1.0, score)


# ─── Section Detection ─────────────────────────────────────────────────────


def _detect_sections(
    audio, sr: int, energy_curve: list[float], duration_ms: float,
) -> list[dict]:
    """
    Detect musical sections from energy contour changes.

    Simple approach: find significant energy changes and label sections
    based on relative energy level (high=chorus/drop, low=verse/bridge,
    very low=intro/outro).
    """
    import numpy as np

    if not energy_curve or duration_ms < 5000:
        return []

    # Smooth energy curve
    kernel_size = min(20, len(energy_curve) // 4)
    if kernel_size < 3:
        return []

    smoothed = np.convolve(energy_curve, np.ones(kernel_size) / kernel_size, mode='same')

    # Find boundaries: significant energy changes
    diff = np.abs(np.diff(smoothed))
    threshold = np.mean(diff) + 1.5 * np.std(diff)

    boundaries_idx = [0]
    min_section_frames = max(10, len(energy_curve) // 20)  # minimum section length

    for i, d in enumerate(diff):
        if d > threshold and (i - boundaries_idx[-1]) > min_section_frames:
            boundaries_idx.append(i)

    boundaries_idx.append(len(energy_curve) - 1)

    # Convert to timestamps and label
    ms_per_frame = duration_ms / len(energy_curve) if energy_curve else 1

    sections = []
    energy_values = []

    for i in range(len(boundaries_idx) - 1):
        start_idx = boundaries_idx[i]
        end_idx = boundaries_idx[i + 1]
        section_energy = float(np.mean(smoothed[start_idx:end_idx]))
        energy_values.append(section_energy)

        sections.append({
            "start_ms": round(start_idx * ms_per_frame),
            "end_ms": round(end_idx * ms_per_frame),
            "_energy": section_energy,
        })

    if not sections:
        return []

    # Label based on relative energy
    max_energy = max(energy_values) if energy_values else 1.0
    for i, sec in enumerate(sections):
        rel_energy = sec["_energy"] / max_energy if max_energy > 0 else 0

        if i == 0 and rel_energy < 0.5:
            label = "intro"
        elif i == len(sections) - 1 and rel_energy < 0.5:
            label = "outro"
        elif rel_energy > 0.8:
            label = "chorus"
        elif rel_energy > 0.5:
            label = "verse"
        elif rel_energy > 0.3:
            label = "bridge"
        else:
            label = "breakdown"

        sec["label"] = label
        del sec["_energy"]

    return sections


# ─── Helpers ────────────────────────────────────────────────────────────────


def _empty_response(duration_ms: float, t0) -> dict:
    import time

    return {
        "bpm": 0,
        "beats": [],
        "sections": [],
        "music_presence": 0.0,
        "key": None,
        "energy_curve": [],
        "duration_ms": round(duration_ms, 1),
        "processing_time_ms": int((time.time() - t0) * 1000),
    }
