"""No-network tests for the durable continuous PTS scanner."""

from __future__ import annotations

import hashlib
import pathlib
import sys
from unittest.mock import patch

import pytest

import media_source_pts_scan_core as scan_core
from media_source_pts_mapper import _verify_mapper_contract
from media_source_pts_scan_core import (
    BATCH_KIND,
    MAP_KIND,
    REQUEST_KIND,
    TIMESTAMP_ORIGIN,
    ScanInputError,
    ScanStorageError,
    canonical_json,
    stage_scan_lines,
    validate_scan_request,
    write_exact_r2,
)
from media_source_url_policy import is_allowed_media_source_url


FFPROBE_VERSION = "ffprobe version 8.1"


def test_python_canonical_batch_matches_typescript_fixture():
    assert request_fixture()["mapBindingSha256"] == (
        "1f7c9f18a590f05683e9bad42069a45367f78fed1e5feafc630733e40a7acc92"
    )
    batch = {
        "schemaVersion": 1,
        "kind": BATCH_KIND,
        "mapBindingSha256": "a" * 64,
        "resourcePolicy": {
            "policyVersion": "continuous-ffprobe-v1",
            "maxCanonicalJsonBytes": 65_536,
            "maxFrameRecords": 100,
        },
        "sourceTimebase": {"numerator": "1", "denominator": "90000"},
        "timestampOrigin": TIMESTAMP_ORIGIN,
        "shardSequence": 0,
        "firstFrameOrdinal": "0",
        "previousBatchContentSha256": None,
        "frames": [
            {"presentationTimestampTicks": "0", "durationTicks": "3003"},
            {"presentationTimestampTicks": "3003", "durationTicks": "3003"},
        ],
    }
    encoded = canonical_json(batch).encode()
    assert len(encoded) == 593
    assert hashlib.sha256(encoded).hexdigest() == (
        "f64f8ba465edb897feaf31f4a7d504ff03332403c57547616c17ceac46a32ad3"
    )


def test_continuous_scan_stages_bounded_hash_chained_batches():
    writes = []
    request = request_fixture(max_frames=2)
    result = stage_scan_lines(
        [
            "best_effort_timestamp=0|duration=3003|side_data_type=ignored\n",
            "best_effort_timestamp=3003|duration=3003\n",
            "best_effort_timestamp=6006|duration=3003\n",
            "best_effort_timestamp=9009|duration=3003\n",
        ],
        request,
        FFPROBE_VERSION,
        lambda body, sidecar: writes.append((body, sidecar)),
    )

    assert result["status"] == "COMPLETE"
    assert result["totalFrameCount"] == "4"
    assert result["sourceStartPresentationTimestampTicks"] == "0"
    assert result["sourceEndExclusivePresentationTimestampTicks"] == "12012"
    assert len(writes) == 2
    assert result["batches"][1]["previousBatchContentSha256"] == writes[0][1]["contentSha256"]
    assert result["batches"][1]["firstFrameOrdinal"] == "2"


def test_missing_duration_and_pts_gap_are_unverifiable_without_inference():
    missing = stage_scan_lines(
        ["best_effort_timestamp=0|duration=N/A\n"],
        request_fixture(),
        FFPROBE_VERSION,
        lambda _body, _sidecar: None,
    )
    assert missing["status"] == "UNVERIFIABLE"
    assert missing["diagnostic"] == "SCAN_FRAME_DURATION_INVALID"
    assert missing["totalFrameCount"] == "0"

    writes = []
    gap = stage_scan_lines(
        ["best_effort_timestamp=0|duration=3003\n",
         "best_effort_timestamp=7000|duration=3003\n"],
        request_fixture(max_frames=1),
        FFPROBE_VERSION,
        lambda body, sidecar: writes.append((body, sidecar)),
    )
    assert gap["status"] == "UNVERIFIABLE"
    assert gap["diagnostic"] == "SCAN_PRESENTATION_CONTINUITY_INVALID"
    assert gap["totalFrameCount"] == "1"
    assert len(writes) == 1


def test_batch_count_limit_fails_closed_before_an_extra_write():
    writes = []
    with patch.object(scan_core, "MAX_BATCHES", 1):
        result = stage_scan_lines(
            ["best_effort_timestamp=0|duration=3003\n",
             "best_effort_timestamp=3003|duration=3003\n"],
            request_fixture(max_frames=1),
            FFPROBE_VERSION,
            lambda body, sidecar: writes.append((body, sidecar)),
        )

    assert result["status"] == "UNVERIFIABLE"
    assert result["diagnostic"] == "SCAN_BATCH_COUNT_LIMIT_EXCEEDED"
    assert result["totalFrameCount"] == "1"
    assert len(writes) == 1


def test_request_binding_and_actual_ffprobe_version_cannot_be_forged():
    request = request_fixture()
    request["mapBindingSha256"] = "f" * 64
    with pytest.raises(ScanInputError, match="SCAN_BINDING_HASH_MISMATCH"):
        validate_scan_request(request)

    with pytest.raises(ScanInputError, match="SCAN_FFPROBE_VERSION_MISMATCH"):
        stage_scan_lines([], request_fixture(), "ffprobe version forged", lambda _body, _sidecar: None)


def test_mapper_runtime_rejects_forged_mapper_and_policy_identity():
    _verify_mapper_contract(validate_scan_request(request_fixture()))

    mapper_forged = request_fixture()
    mapper_forged["mapBinding"]["mapper"]["mapperVersion"] = "forged-mapper"
    mapper_forged["mapBindingSha256"] = hashlib.sha256(
        canonical_json(mapper_forged["mapBinding"]).encode(),
    ).hexdigest()
    with pytest.raises(ScanInputError, match="SCAN_MAPPER_CONTRACT_MISMATCH"):
        _verify_mapper_contract(validate_scan_request(mapper_forged))

    policy_forged = request_fixture()
    policy_forged["mapBinding"]["mapper"]["commandPolicyVersion"] = "forged-policy"
    policy_forged["resourcePolicy"]["policyVersion"] = "forged-policy"
    policy_forged["mapBindingSha256"] = hashlib.sha256(
        canonical_json(policy_forged["mapBinding"]).encode(),
    ).hexdigest()
    with pytest.raises(ScanInputError, match="SCAN_MAPPER_CONTRACT_MISMATCH"):
        _verify_mapper_contract(validate_scan_request(policy_forged))


def test_private_r2_retry_rereads_exact_bytes_and_rejects_tampering():
    client = FakeS3()
    body = b'{"exact":true}'
    sidecar = {"objectKey": "private/test.json", "byteLength": len(body),
               "contentSha256": hashlib.sha256(body).hexdigest()}
    write_exact_r2(client, "private-bucket", body, sidecar)
    write_exact_r2(client, "private-bucket", body, sidecar)
    client.objects[sidecar["objectKey"]] = b'{"exact":false}'
    with pytest.raises(ScanStorageError, match="SCAN_STAGING_CONTENT_MISMATCH"):
        write_exact_r2(client, "private-bucket", body, sidecar)


def test_source_url_policy_rejects_private_dns_and_mapper_never_seeks_chunks():
    with patch("media_source_url_policy.socket.getaddrinfo", return_value=[
        (2, 1, 6, "", ("127.0.0.1", 0)),
    ]):
        assert not is_allowed_media_source_url(
            "https://tenant.r2.cloudflarestorage.com/source.mov",
            "EDITRON_MEDIA_PTS_ALLOWED_HOST_SUFFIXES",
        )
    with patch("media_source_url_policy.socket.getaddrinfo", return_value=[
        (2, 1, 6, "", ("104.16.1.1", 0)),
    ]):
        assert is_allowed_media_source_url(
            "https://tenant.r2.cloudflarestorage.com/source.mov",
            "EDITRON_MEDIA_PTS_ALLOWED_HOST_SUFFIXES",
        )

    source = pathlib.Path(__file__).with_name("media_source_pts_mapper.py").read_text(encoding="utf-8")
    assert "-read_intervals" not in source
    assert "map_source_pts.spawn.aio(validated)" in source
    assert source.count("requires_proxy_auth=True") == 2
    assert "modal.FunctionCall.from_id(call_id).get.aio(timeout=0)" in source


def request_fixture(max_frames: int = 100) -> dict:
    binding = {
        "schemaVersion": 1,
        "kind": MAP_KIND,
        "sourceVersionSha256": "1" * 64,
        "storageVersionSha256": "2" * 64,
        "sourceBindingSha256": "3" * 64,
        "technicalObservationSha256": "4" * 64,
        "videoStreamIndex": 0,
        "sourceTimebase": {"numerator": "1", "denominator": "90000"},
        "mapper": {
            "mapperVersion": "continuous-ffprobe-v1",
            "ffprobeVersion": FFPROBE_VERSION,
            "commandPolicyVersion": "continuous-ffprobe-v1",
            "timestampOrigin": TIMESTAMP_ORIGIN,
        },
    }
    return {
        "schemaVersion": 1,
        "kind": REQUEST_KIND,
        "mapBinding": binding,
        "mapBindingSha256": hashlib.sha256(canonical_json(binding).encode()).hexdigest(),
        "resourcePolicy": {
            "policyVersion": "continuous-ffprobe-v1",
            "maxCanonicalJsonBytes": 65_536,
            "maxFrameRecords": max_frames,
        },
        "source_url": "https://tenant.r2.cloudflarestorage.com/source.mov?signature=secret",
    }


class FakePrecondition(Exception):
    response = {"Error": {"Code": "PreconditionFailed"},
                "ResponseMetadata": {"HTTPStatusCode": 412}}


class FakeBody:
    def __init__(self, value: bytes): self.value = value
    def read(self, limit: int): return self.value[:limit]


class FakeS3:
    def __init__(self): self.objects = {}
    def put_object(self, **input_value):
        key = input_value["Key"]
        if key in self.objects: raise FakePrecondition()
        self.objects[key] = input_value["Body"]
    def get_object(self, **input_value):
        return {"Body": FakeBody(self.objects[input_value["Key"]])}


if __name__ == "__main__":
    sys.exit(pytest.main([__file__]))
