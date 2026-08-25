"""Pure local tests for source-probe PTS serialization.

The test imports only the Modal module's in-memory graph and its pure response
normalizer. It performs no network, ffprobe, storage, deployment, or project
operation.

Run:
    python -m pytest modal/test_media_source_probe.py
"""

import sys

from media_source_probe import _response_stream


def test_response_stream_preserves_large_pts_as_text_without_rounding():
    response = _response_stream({
        "index": 0,
        "codec_type": "video",
        "time_base": "1/90000",
        "start_pts": -4500,
        "duration_ts": 9007199254740993,
    })

    assert response["start_pts"] == "-4500"
    assert response["duration_ts"] == "9007199254740993"


def test_response_stream_rejects_non_integral_or_invalid_duration_ticks():
    response = _response_stream({
        "index": 1,
        "codec_type": "audio",
        "start_pts": "-0",
        "duration_ts": "-1",
    })
    assert response["start_pts"] == "0"
    assert response["duration_ts"] is None

    malformed = _response_stream({
        "index": 2,
        "codec_type": "video",
        "start_pts": 1.5,
        "duration_ts": True,
    })
    assert malformed["start_pts"] is None
    assert malformed["duration_ts"] is None


def _run():
    tests = [value for key, value in sorted(globals().items()) if key.startswith("test_") and callable(value)]
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
