"""
Scene / Cut Detection via ffmpeg — Modal Serverless Endpoint
Insturix Editron · EditFingerprint deterministic cut oracle

Detects hard cuts in a reference video deterministically (ffmpeg scene detection), so the
EditFingerprint's cut cadence is MEASURED, not hallucinated by the LLM (Gemini scored F1 0.66 on
cut timing and fabricates a ~1 Hz grid on fast edits). This runs on a Modal worker — NOT on the
Vercel serverless hot path where the analyzer lives — mirroring the Essentia-on-Modal pattern.

Returns:
  - cuts: array of {t_ms, scene_score} — one per detected hard cut
  - duration_ms: total video duration
  - scene_threshold: the threshold used (echoed back)

Endpoint: POST https://jainnimit728--scene-detection-ffmpeg-scenedetector-detect.modal.run
Auth:     Modal proxy authentication (Modal-Key / Modal-Secret)
Consumer: lib/editron/services/scene-detection-service.ts → reference-content-extractor.ts

Deploy:   modal deploy modal/scene_detection_ffmpeg.py
Test:     modal serve modal/scene_detection_ffmpeg.py   (local dev server)

ffmpeg is CPU-bound (no GPU). Mirrors the proven parser in
lib/editron/reference-video/detect-cuts-ffmpeg.ts (metadata=print → pts_time / lavfi.scene_score
pairs on stdout; Duration on stderr).
"""

from __future__ import annotations

import modal

# ─── Modal App ──────────────────────────────────────────────────────────────

app = modal.App("scene-detection-ffmpeg")

# ─── Container Image ────────────────────────────────────────────────────────

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("requests", "fastapi[standard]")
)

# ─── Constants ──────────────────────────────────────────────────────────────

DEFAULT_SCENE_THRESHOLD = 0.3  # ffmpeg conventional hard-cut threshold (validated 0.41–0.73 on cuts)
DOWNLOAD_TIMEOUT_S = 120       # mirrors Essentia _load_audio
FFMPEG_TIMEOUT_S = 180

# ─── Inference Class ────────────────────────────────────────────────────────


@app.cls(
    image=image,
    cpu=2.0,
    memory=2048,
    scaledown_window=300,
    timeout=300,
)
class SceneDetector:
    """Stateless container: ffmpeg per request. Kept warm to avoid cold starts."""

    @modal.enter()
    def setup(self):
        import subprocess

        version = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[:1]
        print(f"[SceneDetector] ready: {version[0] if version else 'ffmpeg'}")

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def detect(self, request: dict):
        import time

        t0 = time.time()
        video_url = request.get("video_url")
        if not video_url:
            return {"error": "video_url required"}
        try:
            threshold = float(request.get("scene_threshold", DEFAULT_SCENE_THRESHOLD))
        except (TypeError, ValueError):
            threshold = DEFAULT_SCENE_THRESHOLD

        try:
            stdout, stderr = _run_scene_detect(video_url, threshold)
        except Exception:  # download / ffmpeg failure → explicit unavailable cut evidence
            print("[SceneDetector] failed")
            return {
                "cuts": [],
                "duration_ms": 0,
                "scene_threshold": threshold,
                "processing_time_ms": int((time.time() - t0) * 1000),
                "error": "scene_detection_failed",
            }

        cuts = _parse_scene_cuts(stdout)
        duration_ms = _parse_duration_ms(stderr)
        processing_time_ms = int((time.time() - t0) * 1000)

        result = {
            "cuts": cuts,
            "duration_ms": duration_ms if duration_ms is not None else 0,
            "scene_threshold": threshold,
            "processing_time_ms": processing_time_ms,
        }
        print(
            f"[SceneDetector] done in {processing_time_ms}ms: {len(cuts)} cuts, "
            f"duration={result['duration_ms']}ms, threshold={threshold}"
        )
        return result


# ─── ffmpeg ─────────────────────────────────────────────────────────────────


def _run_scene_detect(url: str, threshold: float):
    """Download the video, run ffmpeg scene detection. Returns (stdout, stderr)."""
    import requests
    import subprocess
    import tempfile
    import os

    response = requests.get(url, timeout=DOWNLOAD_TIMEOUT_S)
    response.raise_for_status()

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(response.content)
        tmp_path = tmp.name

    try:
        proc = subprocess.run(
            ["ffmpeg", "-i", tmp_path,
             "-filter:v", f"select='gt(scene,{threshold})',metadata=print:file=-",
             "-an", "-f", "null", "-"],
            capture_output=True, text=True, timeout=FFMPEG_TIMEOUT_S,
        )
        # ffmpeg exits 0 for a successful pass even when 0 scenes cross the threshold.
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg exit {proc.returncode}: {proc.stderr[-300:]}")
        return proc.stdout, proc.stderr
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ─── Parsers (mirror detect-cuts-ffmpeg.ts) ─────────────────────────────────


def _parse_scene_cuts(stdout: str) -> list[dict]:
    """
    metadata=print pairs:
        frame:0    pts:28160   pts_time:1.83333
        lavfi.scene_score=0.726533
    A pts_time whose score line is missing is kept (scoreless), not dropped.
    """
    import re

    cuts: list[dict] = []
    pending_ms = None

    def flush():
        nonlocal pending_ms
        if pending_ms is not None:
            cuts.append({"t_ms": pending_ms})
            pending_ms = None

    for line in stdout.splitlines():
        pts = re.search(r"pts_time:([0-9.]+)", line)
        if pts:
            flush()
            pending_ms = round(float(pts.group(1)) * 1000)
            continue
        score = re.search(r"lavfi\.scene_score=([0-9.]+)", line)
        if score and pending_ms is not None:
            cuts.append({"t_ms": pending_ms, "scene_score": round(float(score.group(1)), 6)})
            pending_ms = None
    flush()

    cuts.sort(key=lambda c: c["t_ms"])
    return cuts


def _parse_duration_ms(stderr: str):
    """Parse `Duration: HH:MM:SS.ss` from ffmpeg's stderr header."""
    import re

    m = re.search(r"Duration:\s*(\d+):(\d+):([0-9.]+)", stderr)
    if not m:
        return None
    return round((int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))) * 1000)
