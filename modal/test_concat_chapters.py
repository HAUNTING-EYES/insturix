"""
Local unit tests for the pure helpers in concat_chapters.py.

Cover bearer-auth matching, the storage-host allow-list (defense-in-depth against
a poisoned chapter URL), the chapter-count/validation caps, the ffmpeg concat-list
+ argument builders, and S3 target parsing — WITHOUT needing Modal, ffmpeg, AWS,
or network. Importing the worker module only builds the in-memory Modal app graph
(no deploy), so this runs anywhere modal + fastapi are installed.

Run:
    python modal/test_concat_chapters.py            # standalone, prints PASS/FAIL
    python -m pytest modal/test_concat_chapters.py  # if pytest is available
"""

import sys

from concat_chapters import (
    authorization_matches,
    is_allowed_chapter_url,
    normalize_chapter_urls,
    build_concat_list,
    ffmpeg_concat_args,
    parse_s3_target,
    public_s3_url,
    MAX_CHAPTERS,
)

S3_URL = "https://remotionlambda-useast1-abc123.s3.us-east-1.amazonaws.com/renders/x/chapter-0.mp4"
S3_URL_NOREGION = "https://my-bucket.s3.amazonaws.com/renders/x/chapter-0.mp4"
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


def test_normalize_chapter_urls():
    assert normalize_chapter_urls([S3_URL, R2_URL]) == [S3_URL, R2_URL]
    assert normalize_chapter_urls([]) is None
    assert normalize_chapter_urls("not a list") is None
    assert normalize_chapter_urls([S3_URL, "https://evil.com/x.mp4"]) is None
    assert normalize_chapter_urls([S3_URL] * (MAX_CHAPTERS + 1)) is None
    # order is preserved exactly (we never reorder chapters)
    three = [S3_URL, R2_URL, GCS_URL]
    assert normalize_chapter_urls(three) == three


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


def test_parse_s3_target():
    assert parse_s3_target(S3_URL) == ("remotionlambda-useast1-abc123", "us-east-1")
    assert parse_s3_target(S3_URL_NOREGION) == ("my-bucket", "us-east-1")
    # us-east-2 style
    assert parse_s3_target(
        "https://b.s3.us-east-2.amazonaws.com/k.mp4"
    ) == ("b", "us-east-2")
    assert parse_s3_target(R2_URL) is None   # not S3 → caller must pass outputBucket
    assert parse_s3_target("https://evil.com/x") is None


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
