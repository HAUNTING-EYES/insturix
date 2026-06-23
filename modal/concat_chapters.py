"""
Modal-hosted Editron chapter-concatenation worker.

Reassembles the per-chapter MP4s produced by the chapter renderer
(`lib/editron/services/chapter-renderer.ts`) into ONE downloadable video.

Videos longer than CHAPTER_SPLIT_THRESHOLD (15 min) render as N separate
Remotion-Lambda jobs, one per ~2.5-min chapter. Each chapter is a COMPLETE MP4
with identical codec/resolution/fps (same Remotion composition), so the chapters
concatenate with a STREAM COPY (`-c copy`, no re-encode) — fast and lossless.
This worker is the "real fix" behind the chapter renderer's fail-loud guard:
until it is deployed + wired, multi-chapter jobs fail honestly instead of
shipping a truncated chapter-0 video.

Production wiring (set on the Vercel/Next side):
    EDITRON_CHAPTER_CONCAT_ENDPOINT=https://<workspace>--editron-chapter-concat-concat.modal.run
    EDITRON_CHAPTER_CONCAT_TOKEN=<shared bearer secret>

Deploy / run / smoke: see modal/README.md. Mirrors the structure of
modal/brand_vault_browser_render.py (bearer auth, error envelope, pure helpers).
Pure helpers (auth, url allow-list, ffmpeg-arg + concat-list builders, S3 URL
parsing) are unit-tested in modal/test_concat_chapters.py — no Modal/ffmpeg/AWS
needed to run that test.
"""

from __future__ import annotations

import hmac
import os
import re
import subprocess
import tempfile
from typing import Optional
from urllib.parse import urlsplit

import fastapi
import modal

# ── Modal app + image ─────────────────────────────────────────────────────────

app = modal.App("editron-chapter-concat")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("fastapi[standard]", "boto3", "httpx")
)

# Secret holds the shared bearer token + AWS creds for the output upload:
#   EDITRON_CHAPTER_CONCAT_TOKEN   — bearer secret shared with the Next side
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY — write access to the Remotion output bucket
# (see modal/README.md for `modal secret create editron-chapter-concat ...`).
concat_secret = modal.Secret.from_name("editron-chapter-concat")

# ── Production-safe caps ──────────────────────────────────────────────────────

MAX_CHAPTERS = 64                  # 64 × ~2.5 min ≈ 2.7 h hard ceiling
MAX_BYTES_PER_CHAPTER = 2_000_000_000   # 2 GB download guard per chapter
DOWNLOAD_TIMEOUT_S = 120           # per-chapter download budget
FFMPEG_TIMEOUT_S = 600             # concat (stream-copy) is fast; generous ceiling
# Only fetch chapter MP4s from our own render/storage hosts (these URLs are
# minted by our backend, but defend in depth against a poisoned job document).
ALLOWED_HOST_SUFFIXES = (
    ".amazonaws.com",                 # Remotion Lambda S3 output
    ".r2.cloudflarestorage.com",      # Cloudflare R2
    ".cloudfront.net",                # CDN in front of either
    "storage.googleapis.com",         # GCS
)

# ── Pure helpers (unit-tested in modal/test_concat_chapters.py) ────────────────


def authorization_matches(header: Optional[str], token: str) -> bool:
    if not header:
        return False
    match = re.match(r"^Bearer\s+(.+)$", header, re.IGNORECASE)
    if not match:
        return False
    supplied = match.group(1).strip()
    return hmac.compare_digest(supplied.encode("utf-8"), token.encode("utf-8"))


def is_allowed_chapter_url(raw: object) -> bool:
    """True only for https URLs on one of our known storage/CDN hosts."""
    if not isinstance(raw, str) or not raw.strip():
        return False
    try:
        parts = urlsplit(raw.strip())
    except ValueError:
        return False
    if parts.scheme != "https" or not parts.hostname:
        return False
    host = parts.hostname.lower()
    return any(
        host == suffix.lstrip(".") or host.endswith(suffix)
        for suffix in ALLOWED_HOST_SUFFIXES
    )


def normalize_chapter_urls(raw: object) -> Optional[list[str]]:
    """Validate the ordered chapter URL list. Returns None if anything is off
    (order is the caller's responsibility — we never reorder)."""
    if not isinstance(raw, list) or not raw:
        return None
    if len(raw) > MAX_CHAPTERS:
        return None
    urls: list[str] = []
    for item in raw:
        if not is_allowed_chapter_url(item):
            return None
        urls.append(item.strip())
    return urls


def build_concat_list(local_paths: list[str]) -> str:
    """ffmpeg concat-demuxer playlist. Single-quotes escaped per ffmpeg's rules."""
    lines = []
    for path in local_paths:
        safe = path.replace("'", "'\\''")
        lines.append(f"file '{safe}'")
    return "\n".join(lines) + "\n"


def ffmpeg_concat_args(list_path: str, out_path: str) -> list[str]:
    """Lossless stream-copy concat (inputs share codec/fps — same composition).
    +faststart moves the moov atom to the front for instant web playback."""
    return [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", list_path,
        "-c", "copy", "-movflags", "+faststart",
        "-y", out_path,
    ]


def parse_s3_target(chapter_url: str) -> Optional[tuple[str, str]]:
    """Derive (bucket, region) from a Remotion S3 chapter URL so the assembled
    output lands in the SAME bucket the chapters already live in.
    Handles virtual-hosted-style: https://<bucket>.s3.<region>.amazonaws.com/...
    and https://<bucket>.s3.amazonaws.com/... (region defaults to us-east-1)."""
    try:
        host = (urlsplit(chapter_url).hostname or "").lower()
    except ValueError:
        return None
    m = re.match(r"^([a-z0-9.\-]+)\.s3[.\-]([a-z0-9\-]+)\.amazonaws\.com$", host)
    if m:
        return (m.group(1), m.group(2))
    m = re.match(r"^([a-z0-9.\-]+)\.s3\.amazonaws\.com$", host)
    if m:
        return (m.group(1), "us-east-1")
    return None


def public_s3_url(bucket: str, region: str, key: str) -> str:
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


# ── Modal endpoint ────────────────────────────────────────────────────────────


@app.function(
    image=image,
    secrets=[concat_secret],
    cpu=2.0,
    memory=4096,
    timeout=900,
    scaledown_window=300,
)
@modal.fastapi_endpoint(method="POST")
async def concat(request: fastapi.Request):
    import httpx
    import boto3
    from botocore.config import Config as BotoConfig
    from fastapi.responses import JSONResponse

    def error(status: int, code: str, message: str) -> JSONResponse:
        return JSONResponse(
            status_code=status,
            content={"ok": False, "error": {"code": code, "message": message}},
        )

    token = os.environ.get("EDITRON_CHAPTER_CONCAT_TOKEN")
    if not token:
        return error(503, "concat_token_not_configured", "Chapter concat token is not configured.")
    if not authorization_matches(request.headers.get("authorization"), token):
        return error(401, "unauthorized", "Invalid chapter concat token.")

    try:
        body = await request.json()
    except Exception:
        return error(400, "invalid_json", "Expected JSON body with a chapters[] field.")
    if not isinstance(body, dict):
        return error(400, "invalid_json", "Expected JSON body with a chapters[] field.")

    chapter_urls = normalize_chapter_urls(body.get("chapters"))
    if not chapter_urls:
        return error(400, "invalid_chapters", "chapters must be 1..64 https URLs on an allowed storage host.")

    job_id = body.get("jobId")
    if not isinstance(job_id, str) or not re.match(r"^[A-Za-z0-9_\-]{1,128}$", job_id):
        return error(400, "invalid_job_id", "jobId must be a safe identifier.")

    target = parse_s3_target(chapter_urls[0])
    if body.get("outputBucket") and body.get("outputRegion"):
        target = (str(body["outputBucket"]), str(body["outputRegion"]))
    if not target:
        return error(400, "unresolved_output_bucket", "Could not resolve an S3 output bucket from the chapter URLs.")
    out_bucket, out_region = target
    out_key = f"editron-concat/{job_id}.mp4"

    with tempfile.TemporaryDirectory() as work:
        local_paths: list[str] = []
        try:
            async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_S, follow_redirects=True) as client:
                for index, url in enumerate(chapter_urls):
                    dest = os.path.join(work, f"chapter_{index:04d}.mp4")
                    written = 0
                    async with client.stream("GET", url) as resp:
                        if resp.status_code != 200:
                            return error(502, "chapter_download_failed", f"Chapter {index} returned HTTP {resp.status_code}.")
                        with open(dest, "wb") as fh:
                            async for chunk in resp.aiter_bytes(1_048_576):
                                written += len(chunk)
                                if written > MAX_BYTES_PER_CHAPTER:
                                    return error(413, "chapter_too_large", f"Chapter {index} exceeds the size cap.")
                                fh.write(chunk)
                    if written == 0:
                        return error(502, "chapter_empty", f"Chapter {index} downloaded as 0 bytes.")
                    local_paths.append(dest)
        except httpx.HTTPError as exc:
            return error(502, "chapter_download_failed", f"Chapter download failed: {type(exc).__name__}.")

        list_path = os.path.join(work, "concat.txt")
        out_path = os.path.join(work, "output.mp4")
        with open(list_path, "w", encoding="utf-8") as fh:
            fh.write(build_concat_list(local_paths))

        try:
            proc = subprocess.run(
                ffmpeg_concat_args(list_path, out_path),
                capture_output=True, text=True, timeout=FFMPEG_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            return error(504, "concat_timeout", "ffmpeg concat exceeded its time budget.")
        if proc.returncode != 0 or not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
            detail = (proc.stderr or "").strip().splitlines()[-1:] or ["unknown ffmpeg error"]
            return error(502, "concat_failed", f"ffmpeg concat failed: {detail[0][:300]}")

        size_bytes = os.path.getsize(out_path)
        try:
            s3 = boto3.client("s3", region_name=out_region, config=BotoConfig(retries={"max_attempts": 3}))
            s3.upload_file(
                out_path, out_bucket, out_key,
                ExtraArgs={"ContentType": "video/mp4", "ACL": "public-read"},
            )
        except Exception as exc:  # noqa: BLE001 — surface a clean failure, not a stack trace
            return error(502, "upload_failed", f"Concatenated upload failed: {type(exc).__name__}.")

    return JSONResponse(
        status_code=200,
        content={
            "ok": True,
            "url": public_s3_url(out_bucket, out_region, out_key),
            "sizeBytes": size_bytes,
            "chapters": len(chapter_urls),
        },
    )
