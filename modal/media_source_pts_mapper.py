"""Durable continuous presentation-order PTS scanner for Editron.

Modal performs measurement and private staging only. The TypeScript
MEDIA_ASSETS owner must reread and canonicalize staged batches before any map
checkpoint or CFR/VFR conclusion exists.

Deploy: modal deploy modal/media_source_pts_mapper.py
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from typing import Any

import fastapi
import modal

from media_source_pts_scan_core import (
    RESULT_KIND,
    ScanInputError,
    ScanStorageError,
    mark_scan_unverifiable,
    stage_scan_lines,
    validate_scan_request,
    write_exact_r2,
)
from media_source_url_policy import is_allowed_media_source_url


app = modal.App("editron-media-source-pts-mapper")
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("boto3", "fastapi[standard]")
    .add_local_python_source("media_source_pts_scan_core", "media_source_url_policy")
)
private_storage_secret = modal.Secret.from_name("editron-media-source-pts-private-r2")
SAFE_CALL_ID = re.compile(r"^fc-[A-Za-z0-9_-]{8,128}$")
SAFE_SUBMISSION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$")
SAFE_ACCOUNT_ID = re.compile(r"^[a-f0-9]{32}$", re.IGNORECASE)
SAFE_BUCKET = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
FRAME_SCAN_TIMEOUT_SECONDS = 86_400
MAPPER_VERSION = "continuous-ffprobe-v1"
COMMAND_POLICY_VERSION = "continuous-ffprobe-v1"


@app.function(
    image=image,
    secrets=[private_storage_secret],
    cpu=2.0,
    memory=4096,
    timeout=FRAME_SCAN_TIMEOUT_SECONDS,
    scaledown_window=300,
)
def map_source_pts(request: dict[str, Any]) -> dict[str, Any]:
    validated = validate_scan_request(request)
    _verify_mapper_contract(validated)
    source_url = validated["source_url"]
    if not is_allowed_media_source_url(source_url, "EDITRON_MEDIA_PTS_ALLOWED_HOST_SUFFIXES"):
        raise ScanInputError("SCAN_SOURCE_URL_NOT_ALLOWED")

    account_id, access_key, secret_key, bucket = _private_r2_configuration()
    version = _ffprobe_version()
    binding = validated["mapBinding"]
    if version != binding["mapper"]["ffprobeVersion"]:
        raise ScanInputError("SCAN_FFPROBE_VERSION_MISMATCH")
    _verify_selected_stream(
        source_url,
        binding["videoStreamIndex"],
        binding["sourceTimebase"],
    )

    import boto3
    from botocore.config import Config as BotoConfig

    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        region_name="auto",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=BotoConfig(
            retries={"max_attempts": 3},
            s3={"addressing_style": "path"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as stderr:
        process = subprocess.Popen(  # noqa: S603
            ["ffprobe", "-v", "error", "-select_streams", str(binding["videoStreamIndex"]),
             "-show_frames", "-show_entries", "frame=best_effort_timestamp,duration",
             "-of", "compact=p=0:nk=0", source_url],
            stdout=subprocess.PIPE,
            stderr=stderr,
            text=True,
            encoding="utf-8",
        )
        if process.stdout is None:
            raise ScanStorageError("SCAN_FFPROBE_STDOUT_UNAVAILABLE")
        try:
            result = stage_scan_lines(
                process.stdout,
                validated,
                version,
                lambda body, sidecar: write_exact_r2(s3, bucket, body, sidecar),
            )
        except Exception:
            process.kill()
            process.wait()
            raise
        return_code = process.wait()
    return result if return_code == 0 else mark_scan_unverifiable(result, "SCAN_FFPROBE_FRAME_SCAN_FAILED")


@app.function(image=image, secrets=[private_storage_secret], timeout=120)
@modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
async def submit_source_pts_scan(request: fastapi.Request):
    from fastapi.responses import JSONResponse

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"ok": False, "error": "SCAN_REQUEST_INVALID"})
    try:
        if not isinstance(body, dict) or sorted(body) != [
            "kind", "request", "schemaVersion", "submissionId",
        ] or body.get("schemaVersion") != 1 \
                or body.get("kind") != "EDITRON_MEDIA_SOURCE_PTS_SCAN_SUBMISSION_V1" \
                or not isinstance(body.get("submissionId"), str) \
                or not SAFE_SUBMISSION_ID.fullmatch(body["submissionId"]):
            raise ScanInputError("SCAN_SUBMISSION_INVALID")
        submission_id = body["submissionId"]
        validated = validate_scan_request(body["request"])
        _verify_mapper_contract(validated)
        if not is_allowed_media_source_url(
            validated["source_url"], "EDITRON_MEDIA_PTS_ALLOWED_HOST_SUFFIXES",
        ):
            raise ScanInputError("SCAN_SOURCE_URL_NOT_ALLOWED")
    except ScanInputError:
        return JSONResponse(status_code=400, content={"ok": False, "error": "SCAN_REQUEST_INVALID"})
    try:
        _private_r2_configuration()
    except ScanStorageError:
        return JSONResponse(status_code=503, content={"ok": False, "error": "SCAN_STORAGE_NOT_CONFIGURED"})
    call = await map_source_pts.spawn.aio(validated)
    return {"ok": True, "submissionId": submission_id,
            "mapBindingSha256": validated["mapBindingSha256"],
            "functionCallId": call.object_id}


@app.function(image=image, timeout=120)
@modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
async def poll_source_pts_scan(request: fastapi.Request):
    from fastapi.responses import JSONResponse

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"ok": False, "error": "SCAN_POLL_INVALID"})
    if not isinstance(body, dict) or sorted(body) != [
        "functionCallId", "mapBindingSha256", "submissionId",
    ]:
        return JSONResponse(status_code=400, content={"ok": False, "error": "SCAN_POLL_INVALID"})
    call_id, binding = body.get("functionCallId"), body.get("mapBindingSha256")
    submission_id = body.get("submissionId")
    if not isinstance(call_id, str) or not SAFE_CALL_ID.fullmatch(call_id):
        return JSONResponse(status_code=400, content={"ok": False, "error": "SCAN_POLL_INVALID"})
    if not isinstance(binding, str) or not re.fullmatch(r"[a-f0-9]{64}", binding):
        return JSONResponse(status_code=400, content={"ok": False, "error": "SCAN_POLL_INVALID"})
    if not isinstance(submission_id, str) or not SAFE_SUBMISSION_ID.fullmatch(submission_id):
        return JSONResponse(status_code=400, content={"ok": False, "error": "SCAN_POLL_INVALID"})
    try:
        result = await modal.FunctionCall.from_id(call_id).get.aio(timeout=0)
    except TimeoutError:
        return JSONResponse(status_code=202, content={"ok": True, "status": "PENDING",
                                                       "submissionId": submission_id,
                                                       "mapBindingSha256": binding})
    except modal.exception.OutputExpiredError:
        return JSONResponse(status_code=410, content={"ok": False, "error": "SCAN_RESULT_EXPIRED"})
    except Exception:
        return JSONResponse(status_code=502, content={"ok": False, "error": "SCAN_EXECUTION_FAILED"})
    if not isinstance(result, dict) or result.get("kind") != RESULT_KIND \
            or result.get("mapBindingSha256") != binding:
        return JSONResponse(status_code=502, content={"ok": False, "error": "SCAN_RESULT_BINDING_INVALID"})
    return {"ok": True, "status": "TERMINAL", "submissionId": submission_id,
            "mapBindingSha256": binding, "result": result}


def _ffprobe_version() -> str:
    completed = subprocess.run(["ffprobe", "-version"], capture_output=True, text=True,
                               timeout=30, check=False)
    if completed.returncode != 0 or not completed.stdout.splitlines():
        raise ScanInputError("SCAN_FFPROBE_UNAVAILABLE")
    return completed.stdout.splitlines()[0].strip()


def _verify_mapper_contract(request: dict[str, Any]) -> None:
    mapper = request["mapBinding"]["mapper"]
    if mapper["mapperVersion"] != MAPPER_VERSION \
            or mapper["commandPolicyVersion"] != COMMAND_POLICY_VERSION:
        raise ScanInputError("SCAN_MAPPER_CONTRACT_MISMATCH")


def _verify_selected_stream(source_url: str, stream_index: int, timebase: dict[str, str]) -> None:
    completed = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", str(stream_index),
         "-show_entries", "stream=index,time_base", "-of", "json", source_url],
        capture_output=True, text=True, timeout=120, check=False,
    )
    if completed.returncode != 0:
        raise ScanInputError("SCAN_STREAM_PROBE_FAILED")
    try:
        streams = json.loads(completed.stdout).get("streams")
    except (json.JSONDecodeError, AttributeError) as error:
        raise ScanInputError("SCAN_STREAM_PROBE_INVALID") from error
    expected = f"{timebase['numerator']}/{timebase['denominator']}"
    if not isinstance(streams, list) or len(streams) != 1 \
            or streams[0].get("index") != stream_index or streams[0].get("time_base") != expected:
        raise ScanInputError("SCAN_STREAM_BINDING_MISMATCH")


def _private_r2_configuration() -> tuple[str, str, str, str]:
    account = os.getenv("EDITRON_MEDIA_PTS_R2_ACCOUNT_ID", "").strip()
    access = os.getenv("EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID", "").strip()
    secret = os.getenv("EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY", "").strip()
    bucket = os.getenv("EDITRON_MEDIA_PTS_R2_BUCKET_NAME", "").strip()
    if not SAFE_ACCOUNT_ID.fullmatch(account) or not access or not secret \
            or not SAFE_BUCKET.fullmatch(bucket) or bucket == "editron-cdn":
        raise ScanStorageError("SCAN_PRIVATE_R2_NOT_CONFIGURED")
    return account, access, secret, bucket
