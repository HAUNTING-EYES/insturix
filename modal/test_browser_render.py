"""
Local unit tests for the pure helpers in brand_vault_browser_render.py.

These cover the security-critical SSRF guard, bearer-auth matching, URL
normalization, and the production caps WITHOUT needing Modal infra or a
Chromium browser. Importing the worker module only builds the in-memory Modal
app graph (no deploy), so this runs anywhere modal + fastapi are installed.

Run:
    python modal/test_browser_render.py          # standalone, prints PASS/FAIL
    python -m pytest modal/test_browser_render.py # if pytest is available
"""

import sys

from brand_vault_browser_render import (
    authorization_matches,
    cap_stylesheets,
    is_blocked_hostname,
    is_blocked_ip,
    normalize_target_url,
    truncate_html,
    validate_public_target,
    MAX_HTML_BYTES,
    MAX_STYLESHEETS,
    MAX_CSS_BYTES_PER_SHEET,
)

# These mirror the blocklist in lib/shared/brand-vault-browser-render-endpoint.ts.
BLOCKED_IPS = [
    "0.0.0.0",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "224.0.0.1",
    "239.255.255.255",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
]

# Public addresses that must be allowed (including the just-outside-range edges).
ALLOWED_IPS = [
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",  # example.com
    "100.63.255.255",  # one below CGNAT 100.64/10
    "100.128.0.1",  # one above CGNAT 100.64/10
    "172.15.255.255",  # one below 172.16/12
    "172.32.0.1",  # one above 172.16/12
    "192.167.255.255",  # one below 192.168/16
    "192.169.0.1",  # one above 192.168/16
    "198.17.255.255",  # one below 198.18/15
    "198.20.0.1",  # one above 198.18/15
    "223.255.255.255",  # one below multicast 224/4
    "2606:4700:4700::1111",  # Cloudflare DNS IPv6
]


def test_blocked_ips():
    for ip in BLOCKED_IPS:
        assert is_blocked_ip(ip) is True, f"expected {ip} to be blocked"


def test_allowed_ips():
    for ip in ALLOWED_IPS:
        assert is_blocked_ip(ip) is False, f"expected {ip} to be allowed"


def test_blocked_hostnames():
    assert is_blocked_hostname("localhost") is True
    assert is_blocked_hostname("api.localhost") is True
    assert is_blocked_hostname("127.0.0.1") is True
    assert is_blocked_hostname("example.com") is False
    assert is_blocked_hostname("brand.example.io") is False


def test_normalize_target_url():
    assert normalize_target_url("example.com") == "https://example.com"
    assert normalize_target_url("http://example.com/path") == "http://example.com/path"
    assert normalize_target_url("https://Brand.io/Pricing") == "https://Brand.io/Pricing"
    assert normalize_target_url("   ") is None
    assert normalize_target_url("") is None
    assert normalize_target_url(None) is None
    assert normalize_target_url(123) is None
    assert normalize_target_url("ftp://example.com") is None
    assert normalize_target_url("javascript:alert(1)") is None


def test_validate_public_target_unsupported_protocol():
    ok, code, _ = validate_public_target("ftp://example.com", resolver=lambda h: ["93.184.216.34"])
    assert ok is False and code == "unsupported_protocol"


def test_validate_public_target_embedded_credentials():
    ok, code, _ = validate_public_target(
        "https://user:pass@example.com", resolver=lambda h: ["93.184.216.34"]
    )
    assert ok is False and code == "embedded_credentials"


def test_validate_public_target_blocks_localhost():
    ok, code, _ = validate_public_target("http://localhost:3000", resolver=lambda h: ["93.184.216.34"])
    assert ok is False and code == "private_host_blocked"


def test_validate_public_target_blocks_private_literal():
    ok, code, _ = validate_public_target("http://10.0.0.5/admin", resolver=lambda h: [])
    assert ok is False and code == "private_host_blocked"


def test_validate_public_target_blocks_dns_rebind():
    # Public-looking hostname that resolves to a private address (SSRF rebind).
    ok, code, _ = validate_public_target("https://rebind.example.com", resolver=lambda h: ["10.0.0.5"])
    assert ok is False and code == "private_host_blocked"


def test_validate_public_target_resolution_failure():
    def boom(_host):
        raise OSError("nxdomain")

    ok, code, _ = validate_public_target("https://does-not-resolve.example", resolver=boom)
    assert ok is False and code == "host_resolution_failed"


def test_validate_public_target_allows_public():
    ok, code, _ = validate_public_target("https://example.com/pricing", resolver=lambda h: ["93.184.216.34"])
    assert ok is True and code == ""


def test_validate_public_target_allow_private_bypass():
    ok, _code, _ = validate_public_target(
        "http://localhost:3000", resolver=lambda h: [], allow_private=True
    )
    assert ok is True


def test_authorization_matches():
    assert authorization_matches("Bearer secret-token", "secret-token") is True
    assert authorization_matches("bearer secret-token", "secret-token") is True  # case-insensitive scheme
    assert authorization_matches("Bearer  secret-token  ", "secret-token") is True  # trimmed
    assert authorization_matches("Bearer wrong", "secret-token") is False
    assert authorization_matches("secret-token", "secret-token") is False  # missing scheme
    assert authorization_matches("", "secret-token") is False
    assert authorization_matches(None, "secret-token") is False


def test_cap_stylesheets():
    assert cap_stylesheets(None) is None
    assert cap_stylesheets([]) is None
    assert cap_stylesheets("not-a-list") is None
    # Missing css / url dropped.
    assert cap_stylesheets([{"url": "https://x/a.css"}]) is None
    assert cap_stylesheets([{"css": "body{}"}]) is None
    capped = cap_stylesheets([{"url": "https://x/a.css", "css": "body{color:red}"}])
    assert capped == [{"url": "https://x/a.css", "css": "body{color:red}", "contentType": "text/css"}]
    # Count cap.
    many = [{"url": f"https://x/{i}.css", "css": "a{}"} for i in range(MAX_STYLESHEETS + 10)]
    assert len(cap_stylesheets(many)) == MAX_STYLESHEETS
    # Per-sheet byte cap.
    big = cap_stylesheets([{"url": "https://x/big.css", "css": "a" * (MAX_CSS_BYTES_PER_SHEET + 5000)}])
    assert len(big[0]["css"]) == MAX_CSS_BYTES_PER_SHEET


def test_truncate_html():
    small = "<html><body>ok</body></html>"
    assert truncate_html(small) == small
    big = "x" * (MAX_HTML_BYTES + 1000)
    assert len(truncate_html(big)) == MAX_HTML_BYTES


def _run_standalone() -> int:
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_") and callable(value)]
    failures = 0
    for test in tests:
        try:
            test()
            print(f"PASS  {test.__name__}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL  {test.__name__}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"ERROR {test.__name__}: {type(exc).__name__}: {exc}")
    total = len(tests)
    print(f"\n{total - failures}/{total} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(_run_standalone())
