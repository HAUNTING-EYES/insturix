"""Editron canonical-media technical probe, hosted on Modal.

This endpoint is a bounded, read-only ffprobe adapter. It reads only the
container headers/ranges reachable from a short-lived storage URL and returns a
strict, minimal technical report. It does not create media records, hash every
source byte, create PTS mappings, classify CFR/VFR, map a proxy, or mutate a
project. Those claims remain unavailable until their dedicated owners exist.

Deploy: modal deploy modal/media_source_probe.py
Consumer (after a separate ingress wiring phase):
lib/editron/services/media-source-probe-v1.ts
"""

from __future__ import annotations

import json
import re

import modal

from media_source_url_policy import is_allowed_media_source_url


app = modal.App("editron-media-source-probe")
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("fastapi[standard]")
    .add_local_python_source("media_source_url_policy")
)

PROBE_VERSION = "EDITRON_MEDIA_SOURCE_PROBE_V1"
PROBE_TIMEOUT_SECONDS = 120
STREAM_KEYS = (
    "index", "codec_type", "codec_name", "width", "height", "pix_fmt",
    "time_base", "start_pts", "duration_ts", "avg_frame_rate", "r_frame_rate", "nb_frames",
    "sample_rate", "channels", "channel_layout", "color_space",
    "color_transfer", "color_primaries", "color_range", "tags",
)
FORMAT_KEYS = ("format_name", "duration", "start_time")


@app.cls(image=image, cpu=1.0, memory=1024, timeout=180, scaledown_window=300)
class MediaSourceProbe:
    @modal.enter()
    def setup(self):
        import subprocess

        completed = subprocess.run(
            ["ffprobe", "-version"], capture_output=True, text=True, check=False,
        )
        self.ffprobe_version = completed.stdout.splitlines()[0] if completed.returncode == 0 else "ffprobe-unavailable"
        print(f"[MediaSourceProbe] ready: {self.ffprobe_version}")

    # Modal rejects unauthenticated traffic before this method can receive a
    # short-lived source URL. The TypeScript boundary sends Modal-Key/Secret.
    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def probe(self, request: dict):
        import subprocess
        import time

        started = time.monotonic()
        source_url = request.get("source_url")
        if not is_allowed_media_source_url(
            source_url,
            "EDITRON_MEDIA_PROBE_ALLOWED_HOST_SUFFIXES",
        ):
            return {"ok": False, "error": "SOURCE_URL_NOT_ALLOWED"}

        try:
            completed = subprocess.run(
                [
                    "ffprobe", "-v", "error", "-show_format", "-show_streams",
                    "-of", "json", source_url,
                ],
                capture_output=True,
                text=True,
                timeout=PROBE_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "FFPROBE_TIMEOUT"}

        if completed.returncode != 0:
            print(f"[MediaSourceProbe] ffprobe failed: {completed.stderr[-400:]}")
            return {"ok": False, "error": "FFPROBE_FAILED"}

        try:
            raw = json.loads(completed.stdout)
        except json.JSONDecodeError:
            return {"ok": False, "error": "FFPROBE_JSON_INVALID"}

        format_data = raw.get("format") if isinstance(raw.get("format"), dict) else {}
        streams = raw.get("streams") if isinstance(raw.get("streams"), list) else []
        return {
            "ok": True,
            "probe_version": f"{PROBE_VERSION}; {self.ffprobe_version}",
            "format": {key: format_data.get(key) for key in FORMAT_KEYS},
            "streams": [
                _response_stream(stream)
                for stream in streams
                if isinstance(stream, dict) and stream.get("codec_type") in ("video", "audio")
            ],
            "processing_time_ms": round((time.monotonic() - started) * 1000),
        }


def _response_stream(stream: dict) -> dict:
    """Preserve PTS integers as JSON text so JavaScript cannot round large ticks.

    This is a bounded technical observation only. It does not create a PTS map,
    classify cadence, or grant any timeline operation permission.
    """
    response = {key: stream.get(key) for key in STREAM_KEYS}
    response["start_pts"] = _signed_integer_text(stream.get("start_pts"))
    response["duration_ts"] = _non_negative_integer_text(stream.get("duration_ts"))
    return response


def _signed_integer_text(value: object) -> str | None:
    if isinstance(value, bool):
        return None
    candidate = str(value).strip() if isinstance(value, int) else value.strip() if isinstance(value, str) else None
    if candidate is None or re.fullmatch(r"-?(0|[1-9][0-9]*)", candidate) is None:
        return None
    return "0" if candidate == "-0" else candidate


def _non_negative_integer_text(value: object) -> str | None:
    candidate = _signed_integer_text(value)
    return candidate if candidate is not None and not candidate.startswith("-") else None
