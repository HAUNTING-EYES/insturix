"""
Local unit tests for the pure helpers in concat_chapters.py.

Cover bearer-auth matching, the storage-host allow-list (defense-in-depth against
a poisoned chapter URL), the signed immutable target, the server-owned output
destination, and the ffmpeg concat-list + argument builders — WITHOUT needing
Modal, ffmpeg, AWS, or network. Importing the worker module only builds the
in-memory Modal app graph (no deploy), so this runs anywhere modal + fastapi are
installed.

Run:
    python modal/test_concat_chapters.py            # standalone, prints PASS/FAIL
    python -m pytest modal/test_concat_chapters.py  # if pytest is available
"""

import hashlib
import hmac
import os
import sys

from concat_chapters import (
    authorization_matches,
    build_concat_list,
    canonical_json,
    ffmpeg_concat_args,
    is_allowed_chapter_url,
    parse_signed_target_contract,
    public_s3_url,
    server_owned_output_target,
    validate_signed_target,
)

S3_URL = "https://remotionlambda-useast1-abc123.s3.us-east-1.amazonaws.com/renders/x/chapter-0.mp4"
R2_URL = "https://acct.r2.cloudflarestorage.com/bucket/chapter-0.mp4"
GCS_URL = "https://storage.googleapis.com/bucket/chapter-0.mp4"
CF_URL = "https://d111111abcdef8.cloudfront.net/chapter-0.mp4"


def test_authorization_matches():
    assert authorization_matches("Bearer s3cr3t", "s3cr3t") is True
    assert authorization_matches("bearer s3cr3t", "s3cr3t") is True  # case-insensitive scheme
    assert authorization_matches("Bearer wrong", "s3cr3t") is False
    assert authorization_matches("s3cr3t", "s3cr3t") is False        # missing scheme
    assert authorization_matches(None, "s3cr3t") is False
    assert authorization_matches("", "s3cr3t") is False


def test_is_allowed_chapter_url():
    assert is_allowed_chapter_url(S3_URL) is True
    assert is_allowed_chapter_url(R2_URL) is True
    assert is_allowed_chapter_url(GCS_URL) is True
    assert is_allowed_chapter_url(CF_URL) is True
    assert is_allowed_chapter_url("http://" + S3_URL[8:]) is False     # not https
    assert is_allowed_chapter_url("https://evil.com/chapter.mp4") is False
    assert is_allowed_chapter_url("https://amazonaws.com.evil.com/x.mp4") is False  # suffix spoof
    assert is_allowed_chapter_url("file:///etc/passwd") is False
    assert is_allowed_chapter_url(123) is False
    assert is_allowed_chapter_url("") is False


def signed_target_fixture(token="concat-secret"):
    sources = [
        {
            "index": 0,
            "providerRenderId": "render-child-0",
            "bucketName": "remotionlambda-useast1-source",
            "region": "us-east-1",
            "sourceUrl": S3_URL,
            "sourceSizeBytes": 1234,
        },
        {
            "index": 1,
            "providerRenderId": "render-child-1",
            "bucketName": "remotionlambda-useast1-source",
            "region": "us-east-1",
            "sourceUrl": R2_URL,
            "sourceSizeBytes": 2345,
        },
    ]
    source_manifest_hash = hashlib.sha256(canonical_json(sources).encode("utf-8")).hexdigest()
    generation = "a" * 64
    target = {
        "schemaVersion": 1,
        "scope": "PROJECT_CHAPTER_CONCAT",
        "artifactKind": "REMOTION_AWS_CHAPTER_CONCAT_OUTPUT",
        "parentAdmissionId": "chr_123456789012",
        "projectRenderSnapshotBinding": {
            "schemaVersion": 1,
            "scope": "PROJECT_SNAPSHOT",
            "artifactId": "chr_123456789012",
            "projectId": "project-1",
            "ownerId": "owner-1",
            "bindingHash": "b" * 64,
        },
        "sourceManifestHash": source_manifest_hash,
        "sources": sources,
        "outputBucket": "editron-concat-output",
        "outputRegion": "us-east-1",
        "generation": generation,
        "outputKey": f"editron-concat/v1/{generation}.mp4",
    }
    payload = canonical_json(target)
    contract = {
        "schemaVersion": 1,
        "scope": "PROJECT_CHAPTER_CONCAT",
        "payload": payload,
        "payloadHash": hashlib.sha256(payload.encode("utf-8")).hexdigest(),
        "signature": hmac.new(token.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest(),
    }
    return target, contract


def test_signed_target_contract():
    target, contract = signed_target_fixture()
    assert validate_signed_target(target) is True
    assert parse_signed_target_contract(contract, "concat-secret") == target

    forged = dict(contract, signature="0" * 64)
    assert parse_signed_target_contract(forged, "concat-secret") is None

    altered_target = dict(target, outputBucket="caller-selected-bucket")
    altered = dict(contract, payload=canonical_json(altered_target))
    assert parse_signed_target_contract(altered, "concat-secret") is None

    reordered = dict(target, sources=list(reversed(target["sources"])))
    assert validate_signed_target(reordered) is False


def test_build_concat_list():
    out = build_concat_list(["/tmp/a.mp4", "/tmp/b.mp4"])
    assert out == "file '/tmp/a.mp4'\nfile '/tmp/b.mp4'\n"
    # single quotes in a path are escaped per ffmpeg's concat-demuxer rules
    escaped = build_concat_list(["/tmp/it's.mp4"])
    assert escaped == "file '/tmp/it'\\''s.mp4'\n"


def test_ffmpeg_concat_args():
    args = ffmpeg_concat_args("/tmp/list.txt", "/tmp/out.mp4")
    assert args[0] == "ffmpeg"
    assert "-f" in args and args[args.index("-f") + 1] == "concat"
    assert "-safe" in args and args[args.index("-safe") + 1] == "0"
    assert args[args.index("-c") + 1] == "copy"        # stream copy, no re-encode
    assert "+faststart" in args                          # web-playable moov atom
    assert args[-1] == "/tmp/out.mp4"
    assert "/tmp/list.txt" in args


def test_server_owned_output_target():
    previous_bucket = os.environ.get("EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET")
    previous_region = os.environ.get("EDITRON_CHAPTER_CONCAT_OUTPUT_REGION")
    try:
        os.environ["EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET"] = "editron-concat-output"
        os.environ["EDITRON_CHAPTER_CONCAT_OUTPUT_REGION"] = "us-east-1"
        assert server_owned_output_target() == ("editron-concat-output", "us-east-1")

        os.environ["EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET"] = "chapter-render"
        assert server_owned_output_target() is None
    finally:
        if previous_bucket is None:
            os.environ.pop("EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET", None)
        else:
            os.environ["EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET"] = previous_bucket
        if previous_region is None:
            os.environ.pop("EDITRON_CHAPTER_CONCAT_OUTPUT_REGION", None)
        else:
            os.environ["EDITRON_CHAPTER_CONCAT_OUTPUT_REGION"] = previous_region


def test_public_s3_url():
    assert public_s3_url("b", "us-east-1", "editron-concat/j.mp4") == (
        "https://b.s3.us-east-1.amazonaws.com/editron-concat/j.mp4"
    )


def _run():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"PASS {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(_run())
