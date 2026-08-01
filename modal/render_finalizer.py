"""Authenticated Modal endpoint for exact-duration Editron render delivery."""

from __future__ import annotations

import os
import re
import subprocess
import tempfile

import fastapi
import modal

from render_finalizer_core import (
    authorization_matches,
    is_allowed_render_url,
    normalize_duration_ms,
    parse_s3_target,
    public_s3_url,
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

MAX_INPUT_BYTES = 3_000_000_000
DOWNLOAD_TIMEOUT_S = 180
SAFE_JOB_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
SAFE_BUCKET = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
SAFE_REGION = re.compile(r"^[a-z]{2}(?:-gov)?-[a-z]+-\d$")


@app.function(
    image=image,
    secrets=[finalizer_secret],
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

    target = parse_s3_target(input_url)
    output_bucket = body.get("outputBucket")
    output_region = body.get("outputRegion")
    if output_bucket is not None or output_region is not None:
        if (
            not isinstance(output_bucket, str)
            or not SAFE_BUCKET.fullmatch(output_bucket)
            or not isinstance(output_region, str)
            or not SAFE_REGION.fullmatch(output_region)
        ):
            return error(400, "invalid_output_target", "outputBucket and outputRegion must be valid and supplied together.")
        target = output_bucket, output_region
    if not target:
        return error(400, "unresolved_output_bucket", "Could not resolve an S3 output target.")
    bucket, region = target
    output_key = f"editron-finalized/{job_id}.mp4"

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
            s3 = boto3.client("s3", region_name=region, config=BotoConfig(retries={"max_attempts": 3}))
            s3.upload_file(
                output_path,
                bucket,
                output_key,
                ExtraArgs={"ContentType": "video/mp4", "ACL": "public-read"},
            )
        except Exception as exc:  # noqa: BLE001
            return error(502, "upload_failed", f"Finalized upload failed: {type(exc).__name__}.")

    return JSONResponse(status_code=200, content={
        "ok": True,
        "url": public_s3_url(bucket, region, output_key),
        "sizeBytes": size_bytes,
        "expectedDurationMs": expected_duration_ms,
        "receipt": receipt,
    })
