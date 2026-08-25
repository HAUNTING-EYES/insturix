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

import ipaddress
import json
import os
import socket
from urllib.parse import urlparse

import modal


app = modal.App("editron-media-source-probe")
image = modal.Image.debian_slim(python_version="3.11").apt_install("ffmpeg").pip_install("fastapi[standard]")

PROBE_VERSION = "EDITRON_MEDIA_SOURCE_PROBE_V1"
PROBE_TIMEOUT_SECONDS = 120
DEFAULT_ALLOWED_HOST_SUFFIXES = (".r2.cloudflarestorage.com", "storage.googleapis.com")
STREAM_KEYS = (
    "index", "codec_type", "codec_name", "width", "height", "pix_fmt",
    "time_base", "avg_frame_rate", "r_frame_rate", "nb_frames",
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
        if not isinstance(source_url, str) or not _is_allowed_source_url(source_url):
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
                {key: stream.get(key) for key in STREAM_KEYS}
                for stream in streams
                if isinstance(stream, dict) and stream.get("codec_type") in ("video", "audio")
            ],
            "processing_time_ms": round((time.monotonic() - started) * 1000),
        }


def _is_allowed_source_url(value: str) -> bool:
    """Reject local/private targets; accept only known storage hosts plus operator additions."""
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return False

    hostname = parsed.hostname.lower().rstrip(".")
    suffixes = set(DEFAULT_ALLOWED_HOST_SUFFIXES)
    suffixes.update(
        entry.strip().lower().lstrip(".")
        for entry in os.getenv("EDITRON_MEDIA_PROBE_ALLOWED_HOST_SUFFIXES", "").split(",")
        if entry.strip()
    )
    if not any(hostname == suffix.lstrip(".") or hostname.endswith(suffix if suffix.startswith(".") else f".{suffix}") for suffix in suffixes):
        return False

    try:
        addresses = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False
    for address in addresses:
        candidate = ipaddress.ip_address(address[4][0])
        if candidate.is_private or candidate.is_loopback or candidate.is_link_local or candidate.is_reserved:
            return False
    return True
