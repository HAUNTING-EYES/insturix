"""Authenticated Modal endpoint for exact-duration Editron render delivery."""

from __future__ import annotations

import asyncio
import os
import re
import subprocess
import tempfile

import fastapi
import modal

from render_finalizer_core import (
    authorization_matches,
    is_allowed_render_url,
    normalize_public_base_url,
    normalize_duration_ms,
    public_r2_url,
    render_output_key,
    run_finalization,
)


app = modal.App("editron-render-finalizer")
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("fastapi[standard]", "boto3", "httpx")
    .add_local_python_source("render_finalizer_core")
)
finalizer_secret = modal.Secret.from_name("editron-render-finalizer")
render_storage_secret = modal.Secret.from_name("editron-render-finalized-r2")

MAX_INPUT_BYTES = 3_000_000_000
DOWNLOAD_TIMEOUT_S = 180
SAFE_JOB_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
SAFE_BUCKET = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
SAFE_R2_ACCOUNT_ID = re.compile(r"^[a-f0-9]{32}$", re.IGNORECASE)


@app.function(
    image=image,
    secrets=[finalizer_secret, render_storage_secret],
    cpu=2.0,
    memory=4096,
    timeout=1200,
    scaledown_window=300,
)
@modal.fastapi_endpoint(method="POST")
async def finalize(request: fastapi.Request):
    import boto3
    import httpx
    from botocore.config import Config as BotoConfig
    from fastapi.responses import JSONResponse

    def error(status: int, code: str, message: str) -> JSONResponse:
        return JSONResponse(
            status_code=status,
            content={"ok": False, "error": {"code": code, "message": message}},
        )

    token = os.environ.get("EDITRON_RENDER_FINALIZER_TOKEN")
    if not token:
        return error(503, "finalizer_token_not_configured", "Render finalizer token is not configured.")
    if not authorization_matches(request.headers.get("authorization"), token):
        return error(401, "unauthorized", "Invalid render finalizer token.")

    try:
        body = await request.json()
    except Exception:
        return error(400, "invalid_json", "Expected a JSON request body.")
    if not isinstance(body, dict):
        return error(400, "invalid_json", "Expected a JSON object.")

    input_url = body.get("inputUrl")
    job_id = body.get("jobId")
    expected_duration_ms = normalize_duration_ms(body.get("expectedDurationMs"))
    if not is_allowed_render_url(input_url):
        return error(400, "invalid_input_url", "inputUrl must be HTTPS on an allowed storage host.")
    if not isinstance(job_id, str) or not SAFE_JOB_ID.fullmatch(job_id):
        return error(400, "invalid_job_id", "jobId must be a safe identifier.")
    if expected_duration_ms is None:
        return error(400, "invalid_duration", "expectedDurationMs must be a positive integer within the production cap.")

    r2_account_id = os.environ.get("R2_ACCOUNT_ID", "").strip()
    r2_access_key_id = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
    r2_secret_access_key = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
    r2_bucket_name = os.environ.get("R2_BUCKET_NAME", "").strip()
    public_base_url = normalize_public_base_url(os.environ.get("CDN_WORKER_URL"))
    if (
        not SAFE_R2_ACCOUNT_ID.fullmatch(r2_account_id)
        or not r2_access_key_id
        or not r2_secret_access_key
        or not SAFE_BUCKET.fullmatch(r2_bucket_name)
        or not public_base_url
    ):
        return error(503, "finalizer_storage_not_configured", "Render finalizer R2/CDN storage is not configured.")
    output_key = render_output_key(job_id)
    output_url = public_r2_url(public_base_url, output_key)

    with tempfile.TemporaryDirectory() as work:
        input_path = os.path.join(work, "source.mp4")
        output_path = os.path.join(work, "finalized.mp4")
        try:
            async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_S, follow_redirects=False) as client:
                written = 0
                async with client.stream("GET", input_url) as response:
                    if response.status_code != 200:
                        return error(502, "render_download_failed", f"Source render returned HTTP {response.status_code}.")
                    with open(input_path, "wb") as handle:
                        async for chunk in response.aiter_bytes(1_048_576):
                            written += len(chunk)
                            if written > MAX_INPUT_BYTES:
                                return error(413, "render_too_large", "Source render exceeds the input size cap.")
                            handle.write(chunk)
                if written == 0:
                    return error(502, "render_empty", "Source render downloaded as 0 bytes.")
        except httpx.HTTPError as exc:
            return error(502, "render_download_failed", f"Source render download failed: {type(exc).__name__}.")

        try:
            receipt = run_finalization(input_path, output_path, expected_duration_ms)
        except subprocess.TimeoutExpired:
            return error(504, "finalization_timeout", "Render finalization exceeded its time budget.")
        except (RuntimeError, ValueError) as exc:
            return error(422, "finalization_verification_failed", str(exc))

        size_bytes = os.path.getsize(output_path)
        try:
            r2 = boto3.client(
                "s3",
                endpoint_url=f"https://{r2_account_id}.r2.cloudflarestorage.com",
                region_name="auto",
                aws_access_key_id=r2_access_key_id,
                aws_secret_access_key=r2_secret_access_key,
                config=BotoConfig(
                    retries={"max_attempts": 3},
                    s3={"addressing_style": "path"},
                    request_checksum_calculation="when_required",
                    response_checksum_validation="when_required",
                ),
            )
            r2.upload_file(
                output_path,
                r2_bucket_name,
                output_key,
                ExtraArgs={
                    "ContentType": "video/mp4",
                    "CacheControl": "public, max-age=31536000, immutable",
                    "Metadata": {"editronRenderJobId": job_id},
                },
            )
        except Exception as exc:  # noqa: BLE001
            return error(502, "upload_failed", f"Finalized upload failed: {type(exc).__name__}.")

        public_verified = False
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
                for attempt in range(3):
                    async with client.stream("GET", output_url, headers={"Range": "bytes=0-0"}) as response:
                        if response.status_code in (200, 206):
                            async for chunk in response.aiter_bytes():
                                if chunk:
                                    public_verified = True
                                    break
                        if public_verified:
                            break
                    if attempt < 2:
                        await asyncio.sleep(0.5 * (attempt + 1))
        except httpx.HTTPError:
            public_verified = False
        if not public_verified:
            return error(502, "public_delivery_unavailable", "Finalized upload is not available through the public CDN.")

    return JSONResponse(status_code=200, content={
        "ok": True,
        "url": output_url,
        "sizeBytes": size_bytes,
        "expectedDurationMs": expected_duration_ms,
        "receipt": receipt,
    })
