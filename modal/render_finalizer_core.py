"""Pure FFmpeg/ffprobe helpers for Editron render finalization."""

from __future__ import annotations

import hmac
import json
import os
import re
import subprocess
from fractions import Fraction
from typing import Any, Optional
from urllib.parse import urlsplit


MAX_DURATION_MS = 3 * 60 * 60 * 1000
FFMPEG_TIMEOUT_S = 900
VERIFY_TOLERANCE_MS = 1.0
ALLOWED_HOST_SUFFIXES = (
    ".amazonaws.com",
    ".r2.cloudflarestorage.com",
    ".cloudfront.net",
    "storage.googleapis.com",
)
SAFE_S3_BUCKET = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")


def authorization_matches(header: Optional[str], token: str) -> bool:
    if not header:
        return False
    match = re.match(r"^Bearer\s+(.+)$", header, re.IGNORECASE)
    if not match:
        return False
    supplied = match.group(1).strip()
    return hmac.compare_digest(supplied.encode("utf-8"), token.encode("utf-8"))


def is_allowed_render_url(raw: object) -> bool:
    if not isinstance(raw, str) or not raw.strip():
        return False
    try:
        parts = urlsplit(raw.strip())
    except ValueError:
        return False
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
        return False
    host = parts.hostname.lower()
    return any(
        host == suffix.lstrip(".") or host.endswith(suffix)
        for suffix in ALLOWED_HOST_SUFFIXES
    )


def normalize_duration_ms(raw: object) -> Optional[int]:
    if isinstance(raw, bool) or not isinstance(raw, int):
        return None
    if raw <= 0 or raw > MAX_DURATION_MS:
        return None
    return raw


def parse_s3_target(render_url: str) -> Optional[tuple[str, str]]:
    try:
        parts = urlsplit(render_url)
        host = (parts.hostname or "").lower()
    except ValueError:
        return None
    match = re.match(
        r"^([a-z0-9.-]+)\.s3[.-]([a-z0-9-]+)\.amazonaws\.com$",
        host,
    )
    if match:
        return match.group(1), match.group(2)
    match = re.match(r"^([a-z0-9.-]+)\.s3\.amazonaws\.com$", host)
    if match:
        return match.group(1), "us-east-1"
    match = re.match(r"^s3[.-]([a-z0-9-]+)\.amazonaws\.com$", host)
    if match:
        bucket = parts.path.lstrip("/").split("/", 1)[0]
        return (bucket, match.group(1)) if SAFE_S3_BUCKET.fullmatch(bucket) else None
    if host == "s3.amazonaws.com":
        bucket = parts.path.lstrip("/").split("/", 1)[0]
        return (bucket, "us-east-1") if SAFE_S3_BUCKET.fullmatch(bucket) else None
    return None


def public_s3_url(bucket: str, region: str, key: str) -> str:
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


def ffmpeg_finalize_args(
    input_path: str,
    output_path: str,
    expected_duration_ms: int,
    has_audio: bool,
) -> list[str]:
    duration = f"{expected_duration_ms / 1000:.6f}"
    args = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-i", input_path,
        "-map", "0:v:0",
    ]
    if has_audio:
        args.extend([
            "-map", "0:a:0",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-af", f"apad=whole_dur={duration},atrim=end={duration},asetpts=PTS-STARTPTS",
        ])
    else:
        args.extend(["-c:v", "copy", "-an"])
    args.extend([
        "-map_metadata", "0",
        "-t", duration,
        "-movflags", "+faststart",
        "-y", output_path,
    ])
    return args


def ffprobe_args(path: str) -> list[str]:
    return [
        "ffprobe", "-v", "error",
        "-show_entries",
        "format=duration:stream=index,codec_type,codec_name,duration,width,height,r_frame_rate,sample_rate,channels",
        "-of", "json", path,
    ]


def run_probe(path: str) -> dict[str, Any]:
    proc = subprocess.run(
        ffprobe_args(path),
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or "unknown ffprobe error").strip().splitlines()[-1]
        raise RuntimeError(f"ffprobe failed: {detail[:300]}")
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("ffprobe returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("ffprobe returned an invalid payload")
    return payload


def _duration_ms(raw: object) -> Optional[float]:
    try:
        value = float(str(raw)) * 1000
    except (TypeError, ValueError):
        return None
    return round(value, 3) if value >= 0 else None


def _fps(raw: object) -> Optional[float]:
    try:
        value = float(Fraction(str(raw)))
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    return round(value, 6) if value > 0 else None


def build_probe_receipt(payload: dict[str, Any], expected_duration_ms: int) -> dict[str, Any]:
    raw_streams = payload.get("streams")
    streams = [item for item in raw_streams if isinstance(item, dict)] if isinstance(raw_streams, list) else []
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    audio = next((item for item in streams if item.get("codec_type") == "audio"), None)
    format_data = payload.get("format") if isinstance(payload.get("format"), dict) else {}
    return {
        "expectedDurationMs": expected_duration_ms,
        "formatDurationMs": _duration_ms(format_data.get("duration")),
        "videoDurationMs": _duration_ms(video.get("duration")) if video else None,
        "audioDurationMs": _duration_ms(audio.get("duration")) if audio else None,
        "videoCodec": video.get("codec_name") if video else None,
        "audioCodec": audio.get("codec_name") if audio else None,
        "width": video.get("width") if video else None,
        "height": video.get("height") if video else None,
        "fps": _fps(video.get("r_frame_rate")) if video else None,
        "sampleRate": int(audio["sample_rate"]) if audio and str(audio.get("sample_rate", "")).isdigit() else None,
        "channels": audio.get("channels") if audio else None,
        "verificationToleranceMs": VERIFY_TOLERANCE_MS,
    }


def verify_probe_receipt(
    receipt: dict[str, Any],
    expected_duration_ms: int,
    expect_audio: bool,
    source_video_codec: Optional[str],
) -> None:
    if not receipt.get("videoCodec"):
        raise ValueError("Finalized artifact has no video stream.")
    if source_video_codec and receipt.get("videoCodec") != source_video_codec:
        raise ValueError("Finalization changed the video codec instead of stream-copying it.")
    if expect_audio and receipt.get("audioCodec") != "aac":
        raise ValueError("Finalized artifact does not contain the required AAC audio stream.")
    for field in ("formatDurationMs", "videoDurationMs"):
        actual = receipt.get(field)
        if not isinstance(actual, (int, float)) or abs(actual - expected_duration_ms) > VERIFY_TOLERANCE_MS:
            raise ValueError(f"{field}={actual} does not match expectedDurationMs={expected_duration_ms}.")
    if expect_audio:
        actual = receipt.get("audioDurationMs")
        if not isinstance(actual, (int, float)) or abs(actual - expected_duration_ms) > VERIFY_TOLERANCE_MS:
            raise ValueError(
                f"audioDurationMs={actual} does not match expectedDurationMs={expected_duration_ms}."
            )


def run_finalization(input_path: str, output_path: str, expected_duration_ms: int) -> dict[str, Any]:
    source_receipt = build_probe_receipt(run_probe(input_path), expected_duration_ms)
    source_video_codec = source_receipt.get("videoCodec")
    if not source_video_codec:
        raise ValueError("Source artifact has no video stream.")
    has_audio = bool(source_receipt.get("audioCodec"))
    proc = subprocess.run(
        ffmpeg_finalize_args(input_path, output_path, expected_duration_ms, has_audio),
        capture_output=True,
        text=True,
        timeout=FFMPEG_TIMEOUT_S,
    )
    if proc.returncode != 0 or not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        detail = (proc.stderr or "unknown ffmpeg error").strip().splitlines()[-1]
        raise RuntimeError(f"ffmpeg finalization failed: {detail[:300]}")
    receipt = build_probe_receipt(run_probe(output_path), expected_duration_ms)
    verify_probe_receipt(receipt, expected_duration_ms, has_audio, source_video_codec)
    return receipt
