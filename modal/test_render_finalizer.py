"""Pure and local-FFmpeg tests for the exact-duration render finalizer."""

import os
import shutil
import subprocess
import sys
import tempfile

from render_finalizer_core import (
    MAX_DURATION_MS,
    authorization_matches,
    build_probe_receipt,
    ffmpeg_finalize_args,
    is_allowed_render_url,
    normalize_public_base_url,
    normalize_duration_ms,
    public_r2_url,
    render_output_key,
    run_finalization,
    run_probe,
    verify_probe_receipt,
)


S3_URL = "https://remotionlambda-useast1-abc123.s3.us-east-1.amazonaws.com/renders/job/out.mp4"


def test_authorization_matches():
    assert authorization_matches("Bearer secret", "secret") is True
    assert authorization_matches("bearer secret", "secret") is True
    assert authorization_matches("Bearer wrong", "secret") is False
    assert authorization_matches("secret", "secret") is False
    assert authorization_matches(None, "secret") is False


def test_source_storage_url_validation():
    assert is_allowed_render_url(S3_URL) is True
    assert is_allowed_render_url("https://storage.googleapis.com/bucket/out.mp4") is True
    assert is_allowed_render_url("https://evil.example/out.mp4") is False
    assert is_allowed_render_url("https://amazonaws.com.evil.example/out.mp4") is False
    assert is_allowed_render_url("http://bucket.s3.amazonaws.com/out.mp4") is False
    assert is_allowed_render_url("https://user:pass@bucket.s3.amazonaws.com/out.mp4") is False


def test_public_delivery_url_validation():
    assert normalize_public_base_url("https://cdn.example.test/\n") == "https://cdn.example.test"
    assert normalize_public_base_url("https://cdn.example.test/base/") == "https://cdn.example.test/base"
    assert normalize_public_base_url("http://cdn.example.test") is None
    assert normalize_public_base_url("https://user:pass@cdn.example.test") is None
    assert normalize_public_base_url("https://cdn.example.test?token=secret") is None
    assert render_output_key("rnd_abc-123") == "editron_render_rnd_abc-123.mp4"
    assert public_r2_url(
        "https://editron-asset-proxy.example.workers.dev/",
        "editron_render_rnd_abc-123.mp4",
    ) == "https://editron-asset-proxy.example.workers.dev/asset/editron_render_rnd_abc-123.mp4"
    try:
        render_output_key("../unsafe")
        raise AssertionError("unsafe render job IDs must be rejected")
    except ValueError:
        pass


def test_duration_validation():
    assert normalize_duration_ms(38_000) == 38_000
    assert normalize_duration_ms(0) is None
    assert normalize_duration_ms(True) is None
    assert normalize_duration_ms(1.5) is None
    assert normalize_duration_ms(MAX_DURATION_MS + 1) is None


def test_ffmpeg_args_copy_video_and_condition_audio():
    args = ffmpeg_finalize_args("in.mp4", "out.mp4", 38_000, True)
    assert args[args.index("-c:v") + 1] == "copy"
    assert args[args.index("-c:a") + 1] == "aac"
    audio_filter = args[args.index("-af") + 1]
    assert "apad=whole_dur=38.000000" in audio_filter
    assert "atrim=end=38.000000" in audio_filter
    assert args[args.index("-t") + 1] == "38.000000"
    assert args[-1] == "out.mp4"

    silent_args = ffmpeg_finalize_args("in.mp4", "out.mp4", 38_000, False)
    assert "-an" in silent_args
    assert "-c:a" not in silent_args


def test_probe_receipt_verification():
    payload = {
        "streams": [
            {"codec_type": "video", "codec_name": "h264", "duration": "38.000", "width": 1920, "height": 1080, "r_frame_rate": "30/1"},
            {"codec_type": "audio", "codec_name": "aac", "duration": "38.000", "sample_rate": "48000", "channels": 2},
        ],
        "format": {"duration": "38.000"},
    }
    receipt = build_probe_receipt(payload, 38_000)
    verify_probe_receipt(receipt, 38_000, True, "h264")
    assert receipt["fps"] == 30.0
    assert receipt["sampleRate"] == 48_000

    bad = {**receipt, "audioDurationMs": 38_080.0}
    try:
        verify_probe_receipt(bad, 38_000, True, "h264")
        raise AssertionError("80 ms AAC tail should fail verification")
    except ValueError as exc:
        assert "audioDurationMs=38080.0" in str(exc)

    malformed = build_probe_receipt({"streams": [None, {"codec_type": "video"}]}, 38_000)
    assert malformed["fps"] is None
    assert malformed["videoCodec"] is None


def test_real_ffmpeg_removes_aac_tail_exactly():
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        print("SKIP test_real_ffmpeg_removes_aac_tail_exactly (ffmpeg unavailable)")
        return
    with tempfile.TemporaryDirectory() as work:
        source = os.path.join(work, "source.mp4")
        output = os.path.join(work, "output.mp4")
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-f", "lavfi", "-i", "color=c=black:s=320x240:r=30:d=1",
            "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=1.08",
            "-c:v", "mpeg4", "-q:v", "5", "-c:a", "aac", "-y", source,
        ], check=True)

        source_receipt = build_probe_receipt(run_probe(source), 1_000)
        assert source_receipt["audioDurationMs"] > 1_000

        receipt = run_finalization(source, output, 1_000)
        assert receipt["formatDurationMs"] == 1_000
        assert receipt["videoDurationMs"] == 1_000
        assert receipt["audioDurationMs"] == 1_000
        assert receipt["videoCodec"] == "mpeg4"
        assert receipt["audioCodec"] == "aac"


def _run():
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_") and callable(value)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"PASS {test.__name__}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(_run())
