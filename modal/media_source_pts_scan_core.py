"""Pure continuous-PTS scan codec and immutable staging helpers."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections.abc import Callable, Iterable
from typing import Any


REQUEST_KIND = "EDITRON_MEDIA_SOURCE_PTS_SCAN_REQUEST_V1"
MAP_KIND = "EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_V1"
BATCH_KIND = "EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_V1"
SIDECAR_KIND = "EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_SIDECAR_V1"
RESULT_KIND = "EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_V1"
TIMESTAMP_ORIGIN = "FFPROBE_BEST_EFFORT_TIMESTAMP"
MAX_BATCH_BYTES = 8 * 1024 * 1024
MAX_BATCH_FRAMES = 100_000
MAX_BATCHES = 10_000
SHA256 = re.compile(r"^[a-f0-9]{64}$")
SIGNED = re.compile(r"^-?(0|[1-9][0-9]{0,127})$")
POSITIVE = re.compile(r"^[1-9][0-9]{0,127}$")


class ScanInputError(ValueError):
    pass


class ScanStorageError(RuntimeError):
    pass


def validate_scan_request(value: object) -> dict[str, Any]:
    request = _record(value, "SCAN_REQUEST_INVALID")
    _keys(request, ["kind", "mapBinding", "mapBindingSha256", "resourcePolicy",
                    "schemaVersion", "source_url"], "SCAN_REQUEST_FIELDS_INVALID")
    if request["schemaVersion"] != 1 or request["kind"] != REQUEST_KIND:
        raise ScanInputError("SCAN_REQUEST_INVALID")
    binding = _validate_binding(request["mapBinding"])
    binding_hash = _sha(request["mapBindingSha256"], "SCAN_BINDING_HASH_INVALID")
    if _hash_json(binding) != binding_hash:
        raise ScanInputError("SCAN_BINDING_HASH_MISMATCH")
    policy = _validate_policy(request["resourcePolicy"])
    if policy["policyVersion"] != binding["mapper"]["commandPolicyVersion"]:
        raise ScanInputError("SCAN_POLICY_BINDING_MISMATCH")
    source_url = request["source_url"]
    if not isinstance(source_url, str) or not source_url:
        raise ScanInputError("SCAN_SOURCE_URL_INVALID")
    return {"schemaVersion": 1, "kind": REQUEST_KIND, "mapBinding": binding,
            "mapBindingSha256": binding_hash, "resourcePolicy": policy,
            "source_url": source_url}


def stage_scan_lines(
    lines: Iterable[str], request: dict[str, Any], ffprobe_version: str,
    writer: Callable[[bytes, dict[str, Any]], None],
) -> dict[str, Any]:
    return _stage_scan_lines(lines, request, ffprobe_version, writer, split_safe_deltas=False)


def stage_epoch_scan_lines_v3(
    lines: Iterable[str], request: dict[str, Any], ffprobe_version: str,
    writer: Callable[[bytes, dict[str, Any]], None],
) -> dict[str, Any]:
    """Stage exact continuous runs for V3 without guessing backward causes.

    A later V3 finalizer may classify a positive PTS delta as GAP and a
    still-forward negative duration delta as OVERLAP. Repeated or backward PTS
    requires independently recoverable reset/wrap/edit-list evidence.
    """
    return _stage_scan_lines(lines, request, ffprobe_version, writer, split_safe_deltas=True)


def _stage_scan_lines(
    lines: Iterable[str], request: dict[str, Any], ffprobe_version: str,
    writer: Callable[[bytes, dict[str, Any]], None], split_safe_deltas: bool,
) -> dict[str, Any]:
    validated = validate_scan_request(request)
    binding = validated["mapBinding"]
    if ffprobe_version != binding["mapper"]["ffprobeVersion"]:
        raise ScanInputError("SCAN_FFPROBE_VERSION_MISMATCH")
    state: dict[str, Any] = {"entries": [], "count": 0, "previous_hash": None,
                             "previous_frame": None}
    buffer: list[dict[str, str]] = []
    diagnostic = None
    try:
        for line in lines:
            frame = parse_ffprobe_frame_line(line)
            previous = state["previous_frame"]
            if previous:
                current_pts = int(frame["presentationTimestampTicks"])
                previous_pts = int(previous["presentationTimestampTicks"])
                expected_pts = previous_pts + int(previous["durationTicks"])
                if current_pts != expected_pts:
                    if not split_safe_deltas:
                        raise ScanInputError("SCAN_PRESENTATION_CONTINUITY_INVALID")
                    if current_pts <= previous_pts:
                        raise ScanInputError("SCAN_BACKWARD_BOUNDARY_EVIDENCE_REQUIRED")
                    if buffer:
                        _persist_frames(buffer, validated, state, writer)
                        buffer = []
            state["previous_frame"] = frame
            buffer.append(frame)
            if len(buffer) >= validated["resourcePolicy"]["maxFrameRecords"]:
                _persist_frames(buffer, validated, state, writer)
                buffer = []
        if buffer:
            _persist_frames(buffer, validated, state, writer)
        if not state["entries"]:
            raise ScanInputError("SCAN_FRAMES_EMPTY")
    except ScanInputError as error:
        diagnostic = str(error)
    return _result(validated, ffprobe_version, state, diagnostic)


def parse_ffprobe_frame_line(value: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for token in value.strip().split("|"):
        if "=" in token:
            key, field_value = token.split("=", 1)
            if key in ("best_effort_timestamp", "duration"):
                fields[key] = field_value
    pts = fields.get("best_effort_timestamp")
    duration = fields.get("duration")
    if not isinstance(pts, str) or not SIGNED.fullmatch(pts):
        raise ScanInputError("SCAN_FRAME_PTS_INVALID")
    if not isinstance(duration, str) or not POSITIVE.fullmatch(duration):
        raise ScanInputError("SCAN_FRAME_DURATION_INVALID")
    return {"presentationTimestampTicks": str(int(pts)), "durationTicks": str(int(duration))}


def mark_scan_unverifiable(result: dict[str, Any], diagnostic: str) -> dict[str, Any]:
    return {**result, "status": "UNVERIFIABLE", "diagnostic": _text(diagnostic, "SCAN_DIAGNOSTIC_INVALID")}


def write_exact_r2(s3: Any, bucket: str, canonical_bytes: bytes, sidecar: dict[str, Any]) -> None:
    try:
        s3.put_object(Bucket=bucket, Key=sidecar["objectKey"], Body=canonical_bytes,
                      ContentType="application/json; charset=utf-8", CacheControl="no-store",
                      IfNoneMatch="*")
    except Exception as error:  # boto exceptions are supplied by the Modal image.
        response = getattr(error, "response", {})
        code = str(response.get("Error", {}).get("Code", ""))
        status = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if code not in ("PreconditionFailed", "412") and status != 412:
            raise ScanStorageError("SCAN_STAGING_WRITE_FAILED") from error
    try:
        body = s3.get_object(Bucket=bucket, Key=sidecar["objectKey"])["Body"]
        stored = body.read(sidecar["byteLength"] + 1)
    except Exception as error:
        raise ScanStorageError("SCAN_STAGING_READ_FAILED") from error
    if stored != canonical_bytes or hashlib.sha256(stored).hexdigest() != sidecar["contentSha256"]:
        raise ScanStorageError("SCAN_STAGING_CONTENT_MISMATCH")


def canonical_json(value: object) -> str:
    return json.dumps(_normalize(value), ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _persist_frames(frames: list[dict[str, str]], request: dict[str, Any],
                    state: dict[str, Any], writer: Callable[[bytes, dict[str, Any]], None]) -> None:
    if len(state["entries"]) >= MAX_BATCHES:
        raise ScanInputError("SCAN_BATCH_COUNT_LIMIT_EXCEEDED")
    batch = {"schemaVersion": 1, "kind": BATCH_KIND,
             "mapBindingSha256": request["mapBindingSha256"],
             "resourcePolicy": request["resourcePolicy"],
             "sourceTimebase": request["mapBinding"]["sourceTimebase"],
             "timestampOrigin": TIMESTAMP_ORIGIN,
             "shardSequence": len(state["entries"]), "firstFrameOrdinal": str(state["count"]),
             "previousBatchContentSha256": state["previous_hash"], "frames": frames}
    encoded = canonical_json(batch).encode("utf-8")
    maximum = request["resourcePolicy"]["maxCanonicalJsonBytes"]
    if len(encoded) > maximum and len(frames) > 1:
        middle = len(frames) // 2
        _persist_frames(frames[:middle], request, state, writer)
        _persist_frames(frames[middle:], request, state, writer)
        return
    if len(encoded) > maximum:
        raise ScanInputError("SCAN_BATCH_BYTE_LIMIT_EXCEEDED")
    content_hash = hashlib.sha256(encoded).hexdigest()
    sidecar = {"schemaVersion": 1, "kind": SIDECAR_KIND, "storage": "R2_PRIVATE",
               "objectKey": (f"private/editron/media-source-pts-scan/v1/{request['mapBindingSha256']}"
                             f"/batches/{batch['shardSequence']}/{content_hash}.json"),
               "byteLength": len(encoded), "contentSha256": content_hash}
    writer(encoded, sidecar)
    last = frames[-1]
    state["entries"].append({"shardSequence": batch["shardSequence"],
        "firstFrameOrdinal": batch["firstFrameOrdinal"], "frameCount": str(len(frames)),
        "startPresentationTimestampTicks": frames[0]["presentationTimestampTicks"],
        "endExclusivePresentationTimestampTicks": str(
            int(last["presentationTimestampTicks"]) + int(last["durationTicks"])),
        "previousBatchContentSha256": state["previous_hash"], "sidecar": sidecar})
    state["count"] += len(frames)
    state["previous_hash"] = content_hash


def _result(request: dict[str, Any], version: str, state: dict[str, Any], diagnostic: str | None) -> dict[str, Any]:
    entries = state["entries"]
    return {"schemaVersion": 1, "kind": RESULT_KIND,
            "status": "UNVERIFIABLE" if diagnostic else "COMPLETE", "diagnostic": diagnostic,
            "mapBindingSha256": request["mapBindingSha256"],
            "resourcePolicy": request["resourcePolicy"], "ffprobeVersion": version,
            "videoStreamIndex": request["mapBinding"]["videoStreamIndex"],
            "sourceTimebase": request["mapBinding"]["sourceTimebase"],
            "timestampOrigin": TIMESTAMP_ORIGIN, "batches": entries,
            "totalFrameCount": str(state["count"]),
            "sourceStartPresentationTimestampTicks": entries[0]["startPresentationTimestampTicks"] if entries else None,
            "sourceEndExclusivePresentationTimestampTicks": entries[-1]["endExclusivePresentationTimestampTicks"] if entries else None}


def _validate_binding(value: object) -> dict[str, Any]:
    record = _record(value, "SCAN_BINDING_INVALID")
    fields = ["kind", "mapper", "schemaVersion", "sourceBindingSha256", "sourceTimebase",
              "sourceVersionSha256", "storageVersionSha256", "technicalObservationSha256", "videoStreamIndex"]
    _keys(record, fields, "SCAN_BINDING_FIELDS_INVALID")
    if record["schemaVersion"] != 1 or record["kind"] != MAP_KIND:
        raise ScanInputError("SCAN_BINDING_INVALID")
    mapper = _record(record["mapper"], "SCAN_MAPPER_INVALID")
    _keys(mapper, ["commandPolicyVersion", "ffprobeVersion", "mapperVersion", "timestampOrigin"], "SCAN_MAPPER_FIELDS_INVALID")
    if mapper["timestampOrigin"] != TIMESTAMP_ORIGIN:
        raise ScanInputError("SCAN_TIMESTAMP_ORIGIN_INVALID")
    timebase = _rational(record["sourceTimebase"])
    hashes = ("sourceVersionSha256", "storageVersionSha256",
              "sourceBindingSha256", "technicalObservationSha256")
    return {"schemaVersion": 1, "kind": MAP_KIND,
            **{field: _sha(record[field], f"SCAN_{field.upper()}_INVALID") for field in hashes},
            "videoStreamIndex": _integer(record["videoStreamIndex"], 0, 2**31 - 1, "SCAN_STREAM_INDEX_INVALID"),
            "sourceTimebase": timebase,
            "mapper": {"mapperVersion": _text(mapper["mapperVersion"], "SCAN_MAPPER_VERSION_INVALID"),
                       "ffprobeVersion": _text(mapper["ffprobeVersion"], "SCAN_FFPROBE_VERSION_INVALID"),
                       "commandPolicyVersion": _text(mapper["commandPolicyVersion"], "SCAN_POLICY_VERSION_INVALID"),
                       "timestampOrigin": TIMESTAMP_ORIGIN}}


def _validate_policy(value: object) -> dict[str, Any]:
    record = _record(value, "SCAN_POLICY_INVALID")
    _keys(record, ["maxCanonicalJsonBytes", "maxFrameRecords", "policyVersion"], "SCAN_POLICY_FIELDS_INVALID")
    return {"policyVersion": _text(record["policyVersion"], "SCAN_POLICY_VERSION_INVALID"),
            "maxCanonicalJsonBytes": _integer(record["maxCanonicalJsonBytes"], 1, MAX_BATCH_BYTES, "SCAN_POLICY_BYTES_INVALID"),
            "maxFrameRecords": _integer(record["maxFrameRecords"], 1, MAX_BATCH_FRAMES, "SCAN_POLICY_RECORDS_INVALID")}


def _rational(value: object) -> dict[str, str]:
    record = _record(value, "SCAN_TIMEBASE_INVALID")
    _keys(record, ["denominator", "numerator"], "SCAN_TIMEBASE_FIELDS_INVALID")
    numerator, denominator = str(record["numerator"]), str(record["denominator"])
    if not POSITIVE.fullmatch(numerator) or not POSITIVE.fullmatch(denominator):
        raise ScanInputError("SCAN_TIMEBASE_INVALID")
    import math
    if math.gcd(int(numerator), int(denominator)) != 1:
        raise ScanInputError("SCAN_TIMEBASE_NOT_REDUCED")
    return {"numerator": str(int(numerator)), "denominator": str(int(denominator))}


def _record(value: object, code: str) -> dict[str, Any]:
    if not isinstance(value, dict): raise ScanInputError(code)
    return value
def _keys(value: dict[str, Any], expected: list[str], code: str) -> None:
    if sorted(value) != sorted(expected): raise ScanInputError(code)
def _sha(value: object, code: str) -> str:
    if not isinstance(value, str) or not SHA256.fullmatch(value): raise ScanInputError(code)
    return value
def _text(value: object, code: str) -> str:
    normalized = value.strip() if isinstance(value, str) else ""
    if not normalized or len(normalized) > 256 or any(ord(char) < 32 or ord(char) == 127 for char in normalized): raise ScanInputError(code)
    return normalized
def _integer(value: object, minimum: int, maximum: int, code: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum: raise ScanInputError(code)
    return value
def _hash_json(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()
def _normalize(value: object) -> object:
    if isinstance(value, str): return unicodedata.normalize("NFC", value)
    if isinstance(value, list): return [_normalize(item) for item in value]
    if isinstance(value, dict): return {unicodedata.normalize("NFC", key): _normalize(item) for key, item in value.items()}
    return value
