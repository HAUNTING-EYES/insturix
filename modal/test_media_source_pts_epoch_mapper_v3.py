"""No-network contract tests for the distinct V3 epoch mapper selection."""

from __future__ import annotations

import hashlib
from unittest.mock import patch

import pytest

from media_source_pts_mapper import (
    COMMAND_POLICY_VERSION,
    EPOCH_COMMAND_POLICY_VERSION_V3,
    EPOCH_MAPPER_VERSION_V3,
    MAPPER_VERSION,
    _stage_lines_for_mapper,
    _verify_mapper_contract,
    map_source_pts,
    map_source_pts_epochs_v3,
)
from media_source_pts_scan_core import (
    MAP_KIND,
    REQUEST_KIND,
    TIMESTAMP_ORIGIN,
    ScanInputError,
    canonical_json,
    stage_epoch_scan_lines_v3,
    stage_scan_lines,
    validate_scan_request,
)


FFPROBE_VERSION = "ffprobe version 8.1"


def test_modal_functions_bind_distinct_mapper_identities():
    v1_request = request_fixture(MAPPER_VERSION, COMMAND_POLICY_VERSION)
    with patch("media_source_pts_mapper._map_source_pts", return_value={"status": "V1"}) as run:
        assert map_source_pts.get_raw_f()(v1_request) == {"status": "V1"}
        run.assert_called_once_with(v1_request, MAPPER_VERSION, COMMAND_POLICY_VERSION)

    v3_request = request_fixture(EPOCH_MAPPER_VERSION_V3, EPOCH_COMMAND_POLICY_VERSION_V3)
    with patch("media_source_pts_mapper._map_source_pts", return_value={"status": "V3"}) as run:
        assert map_source_pts_epochs_v3.get_raw_f()(v3_request) == {"status": "V3"}
        run.assert_called_once_with(
            v3_request,
            EPOCH_MAPPER_VERSION_V3,
            EPOCH_COMMAND_POLICY_VERSION_V3,
        )


def test_mapper_identity_is_the_only_algorithm_selector():
    assert _stage_lines_for_mapper(MAPPER_VERSION, COMMAND_POLICY_VERSION) is stage_scan_lines
    assert _stage_lines_for_mapper(
        EPOCH_MAPPER_VERSION_V3,
        EPOCH_COMMAND_POLICY_VERSION_V3,
    ) is stage_epoch_scan_lines_v3

    for mapper_version, policy_version in (
        (MAPPER_VERSION, EPOCH_COMMAND_POLICY_VERSION_V3),
        (EPOCH_MAPPER_VERSION_V3, COMMAND_POLICY_VERSION),
        ("unknown-mapper", "unknown-policy"),
    ):
        with pytest.raises(ScanInputError, match="SCAN_MAPPER_CONTRACT_UNREGISTERED"):
            _stage_lines_for_mapper(mapper_version, policy_version)


def test_v1_and_v3_bindings_cannot_cross_mapper_functions():
    v1 = validate_scan_request(request_fixture(MAPPER_VERSION, COMMAND_POLICY_VERSION))
    v3 = validate_scan_request(
        request_fixture(EPOCH_MAPPER_VERSION_V3, EPOCH_COMMAND_POLICY_VERSION_V3),
    )

    _verify_mapper_contract(v1)
    _verify_mapper_contract(v3, EPOCH_MAPPER_VERSION_V3, EPOCH_COMMAND_POLICY_VERSION_V3)
    with pytest.raises(ScanInputError, match="SCAN_MAPPER_CONTRACT_MISMATCH"):
        _verify_mapper_contract(v3)
    with pytest.raises(ScanInputError, match="SCAN_MAPPER_CONTRACT_MISMATCH"):
        _verify_mapper_contract(v1, EPOCH_MAPPER_VERSION_V3, EPOCH_COMMAND_POLICY_VERSION_V3)


def test_v3_selected_algorithm_stages_provable_epoch_boundaries():
    request = validate_scan_request(
        request_fixture(EPOCH_MAPPER_VERSION_V3, EPOCH_COMMAND_POLICY_VERSION_V3),
    )
    writes = []
    result = _stage_lines_for_mapper(
        EPOCH_MAPPER_VERSION_V3,
        EPOCH_COMMAND_POLICY_VERSION_V3,
    )(
        [
            "best_effort_timestamp=0|duration=100\n",
            "best_effort_timestamp=100|duration=100\n",
            "best_effort_timestamp=400|duration=100\n",
            "best_effort_timestamp=450|duration=50\n",
        ],
        request,
        FFPROBE_VERSION,
        lambda body, sidecar: writes.append((body, sidecar)),
    )

    assert result["status"] == "COMPLETE"
    assert result["totalFrameCount"] == "4"
    assert len(writes) == 3
    assert [batch["startPresentationTimestampTicks"] for batch in result["batches"]] == [
        "0", "400", "450",
    ]


def request_fixture(mapper_version: str, command_policy_version: str) -> dict:
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
            "mapperVersion": mapper_version,
            "ffprobeVersion": FFPROBE_VERSION,
            "commandPolicyVersion": command_policy_version,
            "timestampOrigin": TIMESTAMP_ORIGIN,
        },
    }
    return {
        "schemaVersion": 1,
        "kind": REQUEST_KIND,
        "mapBinding": binding,
        "mapBindingSha256": hashlib.sha256(canonical_json(binding).encode()).hexdigest(),
        "resourcePolicy": {
            "policyVersion": command_policy_version,
            "maxCanonicalJsonBytes": 65_536,
            "maxFrameRecords": 100,
        },
        "source_url": "https://tenant.r2.cloudflarestorage.com/source.mov?signature=secret",
    }
