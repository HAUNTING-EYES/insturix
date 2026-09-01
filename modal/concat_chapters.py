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
Pure helpers (auth, URL allow-list, ffmpeg-arg + concat-list builders,
signed-target validation) are unit-tested in modal/test_concat_chapters.py — no
Modal/ffmpeg/AWS needed to run that test.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import subprocess
import tempfile
import unicodedata
from typing import Any, Optional
from urllib.parse import urljoin, urlsplit

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
MAX_REDIRECTS = 5
CONCAT_CONTRACT_SCHEMA_VERSION = 1
CONCAT_CONTRACT_SCOPE = "PROJECT_CHAPTER_CONCAT"
CONCAT_CONTRACT_ARTIFACT_KIND = "REMOTION_AWS_CHAPTER_CONCAT_OUTPUT"
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
PARENT_ADMISSION_RE = re.compile(r"^chr_[A-Za-z0-9_-]{12}$")
PROVIDER_RENDER_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,200}$")
AWS_BUCKET_RE = re.compile(
    r"^(?!.*\.\.)(?!\d{1,3}(?:\.\d{1,3}){3}$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$"
)
AWS_REGION_RE = re.compile(r"^[a-z]{2}(?:-[a-z0-9]+)+-\d+$")
OUTPUT_KEY_RE = re.compile(r"^editron-concat/v1/[a-f0-9]{64}\.mp4$")
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
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
        return False
    try:
        if parts.port not in (None, 443):
            return False
    except ValueError:
        return False
    host = parts.hostname.lower()
    return any(
        host == suffix.lstrip(".") or host.endswith(suffix)
        for suffix in ALLOWED_HOST_SUFFIXES
    )


def canonical_json(value: object) -> str:
    """Canonical JSON for the signed target's already-normalized source fields."""
    def normalize(item: object) -> object:
        if isinstance(item, str):
            return unicodedata.normalize("NFC", item)
        if isinstance(item, list):
            return [normalize(child) for child in item]
        if isinstance(item, dict):
            return {unicodedata.normalize("NFC", str(key)): normalize(child) for key, child in item.items()}
        return item

    return json.dumps(
        normalize(value),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    )


def _is_safe_int(value: object, *, positive: bool = False) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and (value > 0 if positive else value >= 0)
        and value <= 9_007_199_254_740_991
    )


def parse_signed_target_contract(raw: object, token: str) -> Optional[dict[str, Any]]:
    """Authenticate and validate the server-issued target; never trust body copies."""
    if not isinstance(raw, dict):
        return None
    required_contract_keys = {"schemaVersion", "scope", "payload", "payloadHash", "signature"}
    if set(raw) != required_contract_keys:
        return None
    payload = raw.get("payload")
    payload_hash = raw.get("payloadHash")
    signature = raw.get("signature")
    if (
        not isinstance(payload, str)
        or len(payload.encode("utf-8")) > 16_000_000
        or not isinstance(payload_hash, str)
        or not SHA256_RE.fullmatch(payload_hash)
        or not isinstance(signature, str)
        or not SHA256_RE.fullmatch(signature)
        or raw.get("schemaVersion") != CONCAT_CONTRACT_SCHEMA_VERSION
        or raw.get("scope") != CONCAT_CONTRACT_SCOPE
    ):
        return None
    expected_signature = hmac.new(
        token.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, signature):
        return None
    if hashlib.sha256(payload.encode("utf-8")).hexdigest() != payload_hash:
        return None
    try:
        target = json.loads(payload)
    except (TypeError, ValueError):
        return None
    if not isinstance(target, dict):
        return None
    if not validate_signed_target(target):
        return None
    return target


def validate_signed_target(target: dict[str, Any]) -> bool:
    required_target_keys = {
        "schemaVersion", "scope", "artifactKind", "parentAdmissionId",
        "projectRenderSnapshotBinding", "sourceManifestHash", "sources",
        "outputBucket", "outputRegion", "generation", "outputKey",
    }
    if set(target) != required_target_keys:
        return False
    if (
        target.get("schemaVersion") != CONCAT_CONTRACT_SCHEMA_VERSION
        or target.get("scope") != CONCAT_CONTRACT_SCOPE
        or target.get("artifactKind") != CONCAT_CONTRACT_ARTIFACT_KIND
        or not isinstance(target.get("parentAdmissionId"), str)
        or not PARENT_ADMISSION_RE.fullmatch(target["parentAdmissionId"])
        or not SHA256_RE.fullmatch(str(target.get("sourceManifestHash", "")))
        or not SHA256_RE.fullmatch(str(target.get("generation", "")))
        or not isinstance(target.get("outputBucket"), str)
        or not AWS_BUCKET_RE.fullmatch(target["outputBucket"])
        or target["outputBucket"] == "chapter-render"
        or not isinstance(target.get("outputRegion"), str)
        or not AWS_REGION_RE.fullmatch(target["outputRegion"])
        or not isinstance(target.get("outputKey"), str)
        or not OUTPUT_KEY_RE.fullmatch(target["outputKey"])
        or target["outputKey"] != f"editron-concat/v1/{target['generation']}.mp4"
    ):
        return False

    binding = target.get("projectRenderSnapshotBinding")
    if not isinstance(binding, dict):
        return False
    if (
        binding.get("schemaVersion") != 1
        or binding.get("scope") != "PROJECT_SNAPSHOT"
        or binding.get("artifactId") != target["parentAdmissionId"]
        or not isinstance(binding.get("projectId"), str)
        or not binding.get("projectId")
        or not isinstance(binding.get("ownerId"), str)
        or not binding.get("ownerId")
        or not SHA256_RE.fullmatch(str(binding.get("bindingHash", "")))
    ):
        return False

    sources = target.get("sources")
    if not isinstance(sources, list) or not 2 <= len(sources) <= MAX_CHAPTERS:
        return False
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            return False
        source_keys = {
            "index", "providerRenderId", "bucketName", "region", "sourceUrl", "sourceSizeBytes",
        }
        if set(source) != source_keys:
            return False
        if (
            source.get("index") != index
            or not isinstance(source.get("providerRenderId"), str)
            or not PROVIDER_RENDER_ID_RE.fullmatch(source["providerRenderId"])
            or not isinstance(source.get("bucketName"), str)
            or not AWS_BUCKET_RE.fullmatch(source["bucketName"])
            or source["bucketName"] == "chapter-render"
            or not isinstance(source.get("region"), str)
            or not AWS_REGION_RE.fullmatch(source["region"])
            or not isinstance(source.get("sourceUrl"), str)
            or not is_allowed_chapter_url(source["sourceUrl"])
            or not _is_safe_int(source.get("sourceSizeBytes"), positive=True)
            or source["sourceSizeBytes"] > MAX_BYTES_PER_CHAPTER
        ):
            return False
    return hashlib.sha256(canonical_json(sources).encode("utf-8")).hexdigest() == target["sourceManifestHash"]


def server_owned_output_target() -> Optional[tuple[str, str]]:
    bucket = os.environ.get("EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET", "").strip()
    region = os.environ.get("EDITRON_CHAPTER_CONCAT_OUTPUT_REGION", "").strip()
    if (
        not AWS_BUCKET_RE.fullmatch(bucket)
        or bucket == "chapter-render"
        or not AWS_REGION_RE.fullmatch(region)
    ):
        return None
    return bucket, region


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
        return error(400, "invalid_json", "Expected a signed concat contract.")
    if not isinstance(body, dict):
        return error(400, "invalid_json", "Expected a signed concat contract.")

    target = parse_signed_target_contract(body.get("contract"), token)
    if not target:
        return error(400, "invalid_concat_contract", "A valid signed server-issued concat target is required.")
    destination = server_owned_output_target()
    if not destination:
        return error(503, "concat_output_destination_not_configured", "Concat output destination is not configured.")
    out_bucket, out_region = destination
    if target["outputBucket"] != out_bucket or target["outputRegion"] != out_region:
        return error(409, "concat_output_destination_mismatch", "Concat target does not match the server-owned destination.")
    out_key = target["outputKey"]
    sources = target["sources"]
    output_url = public_s3_url(out_bucket, out_region, out_key)
    expected_metadata = {
        "editron-parent-admission-id": target["parentAdmissionId"],
        "editron-generation": target["generation"],
        "editron-source-manifest-hash": target["sourceManifestHash"],
        "editron-chapters": str(len(sources)),
    }
    s3 = boto3.client("s3", region_name=out_region, config=BotoConfig(retries={"max_attempts": 3}))

    # The key is deterministic, so a lost response can safely be replayed only
    # when the existing object's server-owned identity matches exactly. A
    # collision is quarantined instead of being silently overwritten.
    try:
        existing = s3.head_object(Bucket=out_bucket, Key=out_key)
    except Exception as exc:  # noqa: BLE001 — classify the provider response without exposing it
        provider_code = str(getattr(exc, "response", {}).get("Error", {}).get("Code", ""))
        if provider_code not in {"404", "NoSuchKey", "NotFound"}:
            return error(502, "concat_output_head_failed", "Could not inspect the concat output identity.")
        existing = None
    if existing is not None:
        existing_metadata = {str(key).lower(): str(value) for key, value in (existing.get("Metadata") or {}).items()}
        existing_size = existing.get("ContentLength")
        if (
            any(existing_metadata.get(key) != value for key, value in expected_metadata.items())
            or not _is_safe_int(existing_size, positive=True)
        ):
            return error(409, "concat_output_identity_conflict", "The deterministic concat key has conflicting metadata.")
        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "generation": target["generation"],
                "sourceManifestHash": target["sourceManifestHash"],
                "outputBucket": out_bucket,
                "outputRegion": out_region,
                "key": out_key,
                "url": output_url,
                "sizeBytes": existing_size,
                "chapters": len(sources),
            },
        )

    with tempfile.TemporaryDirectory() as work:
        local_paths: list[str] = []
        try:
            # Do not let httpx follow redirects implicitly. Every Location is
            # resolved and checked against the same initial storage allow-list.
            async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_S, follow_redirects=False) as client:
                for index, source in enumerate(sources):
                    current_url = source["sourceUrl"]
                    dest = os.path.join(work, f"chapter_{index:04d}.mp4")
                    written = 0
                    for redirect_count in range(MAX_REDIRECTS + 1):
                        if not is_allowed_chapter_url(current_url):
                            return error(400, "chapter_source_not_allowed", f"Chapter {index} source is not allow-listed.")
                        async with client.stream("GET", current_url, follow_redirects=False) as resp:
                            if resp.status_code in {301, 302, 303, 307, 308}:
                                location = resp.headers.get("location")
                                if not location or redirect_count >= MAX_REDIRECTS:
                                    return error(502, "chapter_redirect_invalid", f"Chapter {index} redirect chain is invalid.")
                                current_url = urljoin(current_url, location)
                                continue
                            if resp.status_code != 200:
                                return error(502, "chapter_download_failed", f"Chapter {index} returned HTTP {resp.status_code}.")
                            with open(dest, "wb") as fh:
                                async for chunk in resp.aiter_bytes(1_048_576):
                                    written += len(chunk)
                                    if written > MAX_BYTES_PER_CHAPTER:
                                        return error(413, "chapter_too_large", f"Chapter {index} exceeds the size cap.")
                                    fh.write(chunk)
                            break
                    if written == 0:
                        return error(502, "chapter_empty", f"Chapter {index} downloaded as 0 bytes.")
                    if written != source["sourceSizeBytes"]:
                        return error(409, "chapter_size_mismatch", f"Chapter {index} changed after it was bound.")
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
            s3.upload_file(
                out_path, out_bucket, out_key,
                ExtraArgs={
                    "ContentType": "video/mp4",
                    "ACL": "public-read",
                    "Metadata": expected_metadata,
                },
            )
            # upload_file has no conditional-create option. The deterministic
            # preflight plus exact post-HeadObject verification prevents a
            # mismatched object from being accepted after a race.
            uploaded = s3.head_object(Bucket=out_bucket, Key=out_key)
            uploaded_metadata = {
                str(key).lower(): str(value) for key, value in (uploaded.get("Metadata") or {}).items()
            }
            if (
                any(uploaded_metadata.get(key) != value for key, value in expected_metadata.items())
                or uploaded.get("ContentLength") != size_bytes
            ):
                return error(409, "concat_output_postverify_conflict", "Concat output identity verification failed.")
        except Exception as exc:  # noqa: BLE001 — surface a clean failure, not a stack trace
            return error(502, "upload_failed", f"Concatenated upload failed: {type(exc).__name__}.")

    return JSONResponse(
        status_code=200,
        content={
            "ok": True,
            "generation": target["generation"],
            "sourceManifestHash": target["sourceManifestHash"],
            "outputBucket": out_bucket,
            "outputRegion": out_region,
            "key": out_key,
            "url": output_url,
            "sizeBytes": size_bytes,
            "chapters": len(sources),
        },
    )
