"""
Post-deploy smoke test for the Modal Brand Vault browser-render worker.

Hits the LIVE deployed endpoint and asserts the response contract the app's
fallback parser expects (`lib/shared/brand-vault-browser-fallback.ts`), plus the
auth + SSRF guards. Uses only the Python standard library (no subprocesses), so
it runs anywhere — including from a CI step or your laptop after `modal deploy`.

Usage:
    python modal/smoke_test.py <endpoint-url> <token>
    # or via env:
    BRAND_VAULT_MODAL_RENDER_ENDPOINT=... BRAND_VAULT_MODAL_RENDER_TOKEN=... python modal/smoke_test.py
    # optionally render a specific (JS-heavy) site to eyeball richness:
    python modal/smoke_test.py <endpoint-url> <token> https://your-react-site.com
"""

import json
import os
import sys
import urllib.error
import urllib.request

VISUAL_FIELDS = [
    "minimalism",
    "densityTolerance",
    "dataVizAffinity",
    "expressiveness",
    "geometryTendency",
    "decorationTolerance",
    "cornerRadiusBias",
    "layoutSymmetry",
    "contrastPreference",
]


def post(endpoint, token, body, timeout=30):
    data = json.dumps(body).encode("utf-8")
    headers = {"content-type": "application/json", "accept": "application/json"}
    if token is not None:
        headers["authorization"] = f"Bearer {token}"
    request = urllib.request.Request(endpoint, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8") or "{}"
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"raw": raw}


def main():
    args = [a for a in sys.argv[1:]]
    endpoint = args[0] if len(args) >= 1 else os.environ.get("BRAND_VAULT_MODAL_RENDER_ENDPOINT")
    token = args[1] if len(args) >= 2 else os.environ.get("BRAND_VAULT_MODAL_RENDER_TOKEN")
    target = args[2] if len(args) >= 3 else "https://example.com"

    if not endpoint or not token:
        print("usage: python modal/smoke_test.py <endpoint-url> <token> [target-url]")
        print("   or set BRAND_VAULT_MODAL_RENDER_ENDPOINT and BRAND_VAULT_MODAL_RENDER_TOKEN")
        return 2

    failures = 0

    def check(name, condition, detail=""):
        nonlocal failures
        if condition:
            print(f"PASS  {name}")
        else:
            failures += 1
            print(f"FAIL  {name}  {detail}")

    # 1. Happy path: a public URL renders and returns the snapshot contract.
    status, payload = post(endpoint, token, {"url": target, "reason": "javascript_shell"}, timeout=40)
    data = payload.get("data") or payload.get("result") or payload
    html = data.get("html") or data.get("content")
    check("render returns 200", status == 200, f"got {status}: {str(payload)[:200]}")
    check("html is non-empty", isinstance(html, str) and bool(html.strip()), f"html len={len(html or '')}")
    check("contentType present", isinstance(data.get("contentType"), str))
    rp = data.get("renderedPrimitives")
    if isinstance(rp, dict):
        visual = rp.get("visual") or {}
        check("renderedPrimitives.visual has 9 fields", all(k in visual for k in VISUAL_FIELDS), f"got {sorted(visual)}")
        check("renderedPrimitives.atoms non-empty", isinstance(rp.get("atoms"), dict) and bool(rp.get("atoms")))
    else:
        check("renderedPrimitives present", False, "renderedPrimitives missing (page may have no visible body)")

    # 2. Missing auth -> 401.
    status, _ = post(endpoint, None, {"url": target})
    check("missing token rejected (401)", status == 401, f"got {status}")

    # 3. Wrong token -> 401.
    status, _ = post(endpoint, token + "-wrong", {"url": target})
    check("wrong token rejected (401)", status == 401, f"got {status}")

    # 4. SSRF: localhost blocked -> 400 private_host_blocked.
    status, payload = post(endpoint, token, {"url": "http://localhost:3000"})
    code = (payload.get("error") or {}).get("code")
    check("localhost blocked (400)", status == 400 and code == "private_host_blocked", f"got {status}/{code}")

    # 5. SSRF: private literal blocked.
    status, payload = post(endpoint, token, {"url": "http://169.254.169.254/latest/meta-data/"})
    code = (payload.get("error") or {}).get("code")
    check("link-local metadata IP blocked (400)", status == 400 and code == "private_host_blocked", f"got {status}/{code}")

    # 6. Embedded credentials blocked.
    status, payload = post(endpoint, token, {"url": "https://user:pass@example.com"})
    code = (payload.get("error") or {}).get("code")
    check("embedded credentials blocked (400)", status == 400 and code == "embedded_credentials", f"got {status}/{code}")

    # 7. Non-http scheme rejected.
    status, payload = post(endpoint, token, {"url": "ftp://example.com"})
    check("non-http scheme rejected (400)", status == 400, f"got {status}")

    print(f"\n{'PASS' if failures == 0 else 'FAIL'}: {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
