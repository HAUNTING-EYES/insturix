"""
Modal-hosted Brand Vault browser-render worker.

This is the production renderer behind:
    BRAND_VAULT_BROWSER_RENDER_PROVIDER=modal
    BRAND_VAULT_MODAL_RENDER_ENDPOINT=https://<workspace>--brand-vault-browser-render-render.modal.run
    BRAND_VAULT_MODAL_RENDER_TOKEN=<shared bearer secret>
    BRAND_VAULT_MODAL_RENDER_TIMEOUT_MS=12000   # client-side abort budget

It mirrors the first-party route handler in
`lib/shared/brand-vault-browser-render-endpoint.ts` and returns the SAME flat
JSON snapshot the app's `snapshotFromJsonPayload` parser expects
(`lib/shared/brand-vault-browser-fallback.ts`). The in-browser stylesheet and
rendered-primitive extraction JS is ported verbatim from the local Playwright
provider so the evidence is identical across providers.

Deploy / run: see modal/README.md.
Pure helpers (SSRF, normalization, caps) are unit-tested in
modal/test_browser_render.py (no Modal/Playwright needed to run that test).
"""

from __future__ import annotations

import base64
import hmac
import ipaddress
import os
import re
import socket
from typing import Callable, Optional
from urllib.parse import urlsplit, urlunsplit

import fastapi
import modal

# ── Modal app + image ─────────────────────────────────────────────────────────

app = modal.App("brand-vault-browser-render")

PLAYWRIGHT_VERSION = "1.49.1"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(f"playwright=={PLAYWRIGHT_VERSION}", "fastapi[standard]")
    .run_commands(
        "playwright install-deps chromium",
        "playwright install chromium",
    )
)

# Holds BRAND_VAULT_MODAL_RENDER_TOKEN (see README for `modal secret create`).
render_secret = modal.Secret.from_name("brand-vault-modal-render")

# ── Production-safe caps / config ─────────────────────────────────────────────

DEFAULT_GOTO_TIMEOUT_MS = 12_000
MIN_TIMEOUT_MS = 1_000
MAX_TIMEOUT_MS = 20_000
SETTLE_TIMEOUT_MS = 3_500          # best-effort networkidle wait for SPA hydration
MAX_HTML_BYTES = 5_000_000         # ~5 MB rendered HTML cap
MAX_STYLESHEETS = 40
MAX_CSS_BYTES_PER_SHEET = 512_000  # ~512 KB per stylesheet
MAX_TOTAL_CSS_BYTES = 4_000_000    # ~4 MB total CSS
# Screenshot capture (mode == "screenshot"): a clean desktop viewport shot, base64-encoded PNG.
SCREENSHOT_VIEWPORT_WIDTH = 1280
SCREENSHOT_VIEWPORT_HEIGHT = 800
MAX_SCREENSHOT_BYTES = 8_000_000   # ~8 MB — matches the app's visual-asset store cap
MAX_SCREENSHOT_WAIT_MS = 5_000     # extra post-load settle before the shot
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36 BrandVaultRenderer/1.0"
)
LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage"]
VALID_WAIT_UNTIL = {"domcontentloaded", "load", "networkidle"}
DEFAULT_WAIT_UNTIL = "domcontentloaded"
FALLBACK_REASONS = {
    "http_blocked",
    "rate_limited",
    "server_error",
    "browser_challenge",
    "javascript_shell",
    "empty_html",
}

# ── SSRF guard (ported from brand-vault-browser-render-endpoint.ts) ────────────


def _is_blocked_ipv4(addr: str) -> bool:
    try:
        parts = [int(p) for p in addr.split(".")]
    except ValueError:
        return True
    if len(parts) != 4 or any(p < 0 or p > 255 for p in parts):
        return True
    a, b = parts[0], parts[1]
    if a in (0, 10, 127):
        return True
    if a == 100 and 64 <= b <= 127:  # 100.64.0.0/10 CGNAT
        return True
    if a == 169 and b == 254:  # link-local
        return True
    if a == 172 and 16 <= b <= 31:
        return True
    if a == 192 and b in (0, 168):
        return True
    if a == 198 and b in (18, 19):  # benchmarking
        return True
    return a >= 224  # multicast / reserved


def is_blocked_ip(value: str) -> bool:
    """True if `value` is an IP literal in a private/local/reserved range."""
    cleaned = value.strip().strip("[]").lower()
    try:
        ip = ipaddress.ip_address(cleaned)
    except ValueError:
        return False  # not an IP literal — hostname handling is the caller's job
    if (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return True
    if isinstance(ip, ipaddress.IPv4Address):
        return _is_blocked_ipv4(str(ip))
    # IPv6 explicit parity with the TS guard
    if cleaned in ("::", "::1") or cleaned.startswith(("fc", "fd", "fe80:")):
        return True
    mapped = re.match(r"^::ffff:(\d+\.\d+\.\d+\.\d+)$", cleaned)
    if mapped:
        return _is_blocked_ipv4(mapped.group(1))
    if ip.ipv4_mapped is not None:
        return _is_blocked_ipv4(str(ip.ipv4_mapped))
    return False


def is_blocked_hostname(host: str) -> bool:
    lowered = host.strip().strip("[]").lower()
    if lowered == "localhost" or lowered.endswith(".localhost"):
        return True
    return is_blocked_ip(lowered)


def normalize_target_url(raw: Optional[str]) -> Optional[str]:
    if not isinstance(raw, str):
        return None
    candidate = raw.strip()
    if not candidate:
        return None
    lowered = candidate.lower()
    if not (lowered.startswith("http://") or lowered.startswith("https://")):
        # Reject explicit non-http scheme URLs (javascript:, data:, mailto:, ftp://, file:).
        # The negative lookahead distinguishes a scheme ("javascript:a") from a bare
        # host:port ("example.com:8080"), which is upgraded to https below.
        if "://" in candidate or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:(?![0-9])", candidate):
            return None
        candidate = "https://" + candidate
    try:
        parts = urlsplit(candidate)
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    return urlunsplit(parts)


def _resolve_hostname(hostname: str) -> list[str]:
    infos = socket.getaddrinfo(hostname, None)
    return [info[4][0] for info in infos]


def validate_public_target(
    normalized_url: str,
    resolver: Callable[[str], list[str]] = _resolve_hostname,
    allow_private: bool = False,
) -> tuple[bool, str, str]:
    """Returns (ok, error_code, message). Blocks SSRF to private/local targets."""
    try:
        parts = urlsplit(normalized_url)
    except ValueError:
        return (False, "invalid_url", "Brand Vault browser render target is not a valid URL.")
    if parts.scheme not in ("http", "https"):
        return (False, "unsupported_protocol", "Brand Vault browser render only supports http(s) URLs.")
    if parts.username or parts.password:
        return (False, "embedded_credentials", "Brand Vault browser render URLs cannot contain credentials.")
    host = parts.hostname
    if not host:
        return (False, "invalid_url", "Brand Vault browser render target is missing a host.")

    if allow_private:
        return (True, "", "")

    if is_blocked_hostname(host):
        return (False, "private_host_blocked", "Brand Vault browser render blocked a private or local host.")

    try:
        addresses = resolver(host)
    except Exception:
        return (False, "host_resolution_failed", "Brand Vault browser render could not resolve the target host.")
    if not addresses:
        return (False, "host_resolution_failed", "Brand Vault browser render could not resolve the target host.")
    if any(is_blocked_ip(address) for address in addresses):
        return (False, "private_host_blocked", "Brand Vault browser render blocked a private or local resolved address.")

    return (True, "", "")


def authorization_matches(header: Optional[str], token: str) -> bool:
    if not header:
        return False
    match = re.match(r"^Bearer\s+(.+)$", header, re.IGNORECASE)
    if not match:
        return False
    supplied = match.group(1).strip()
    return hmac.compare_digest(supplied.encode("utf-8"), token.encode("utf-8"))


def _truthy(value: Optional[str]) -> bool:
    return value == "1" or (value or "").strip().lower() == "true"


def _clamp_timeout(value: Optional[str], default: int) -> int:
    try:
        parsed = int(value) if value else default
    except (TypeError, ValueError):
        parsed = default
    return min(MAX_TIMEOUT_MS, max(MIN_TIMEOUT_MS, parsed))


def cap_stylesheets(sheets: object) -> Optional[list[dict]]:
    if not isinstance(sheets, list):
        return None
    capped: list[dict] = []
    total = 0
    for raw in sheets[:MAX_STYLESHEETS]:
        if not isinstance(raw, dict):
            continue
        url = raw.get("url")
        css = raw.get("css")
        if not isinstance(url, str) or not isinstance(css, str) or not css.strip():
            continue
        css = css[:MAX_CSS_BYTES_PER_SHEET]
        if total + len(css) > MAX_TOTAL_CSS_BYTES:
            break
        total += len(css)
        capped.append({"url": url, "css": css, "contentType": "text/css"})
    return capped or None


def truncate_html(html: str) -> str:
    return html if len(html) <= MAX_HTML_BYTES else html[:MAX_HTML_BYTES]


# ── In-browser extraction JS (ported verbatim from the local Playwright provider
#    in lib/shared/brand-vault-browser-fallback.ts so evidence is identical) ────

STYLESHEETS_JS = """
() => {
  return Array.from(document.styleSheets)
    .map((sheet, index) => {
      try {
        const css = Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\\n').trim();
        if (!css) return null;
        return {
          url: sheet.href || `${location.href}#playwright-stylesheet-${index}`,
          css,
          contentType: 'text/css',
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
"""

PRIMITIVES_JS = """
() => {
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const round = (value) => Math.round(clamp01(value) * 100) / 100;
  const visibleElements = Array.from(document.body?.querySelectorAll('*') ?? [])
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      if (area <= 4 || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.02) return null;
      return { element, rect, style, area };
    })
    .filter(Boolean);
  if (visibleElements.length === 0) return null;

  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const totalArea = visibleElements.reduce((sum, item) => sum + Math.min(item.area, viewportArea), 0);
  const textArea = visibleElements
    .filter((item) => Boolean(item.element.innerText?.trim()))
    .reduce((sum, item) => sum + Math.min(item.area, viewportArea), 0);
  const mediaArea = visibleElements
    .filter((item) => /^(IMG|PICTURE|VIDEO|SVG|CANVAS)$/.test(item.element.tagName))
    .reduce((sum, item) => sum + Math.min(item.area, viewportArea), 0);
  const dataVizCount = visibleElements.filter((item) =>
    /^(TABLE|CANVAS|SVG)$/.test(item.element.tagName) ||
    /\\b(?:chart|graph|metric|stat|dashboard|analytics|data-viz|datatable)\\b/i.test(`${item.element.className} ${item.element.id} ${item.element.getAttribute('aria-label') ?? ''}`),
  ).length;
  const interactiveCount = visibleElements.filter((item) =>
    /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(item.element.tagName) || item.element.getAttribute('role') === 'button',
  ).length;
  const radiusValues = visibleElements.flatMap((item) =>
    [item.style.borderTopLeftRadius, item.style.borderTopRightRadius, item.style.borderBottomRightRadius, item.style.borderBottomLeftRadius]
      .map((value) => Number.parseFloat(value))
      .filter((value) => Number.isFinite(value) && value > 0),
  );
  const centerAlignedCount = visibleElements.filter((item) =>
    item.style.justifyContent === 'center' ||
    item.style.alignItems === 'center' ||
    item.style.textAlign === 'center' ||
    Math.abs((item.rect.left + item.rect.width / 2) - window.innerWidth / 2) < window.innerWidth * 0.08,
  ).length;
  const decoratedCount = visibleElements.filter((item) =>
    item.style.boxShadow !== 'none' ||
    item.style.textShadow !== 'none' ||
    item.style.filter !== 'none' ||
    item.style.backdropFilter !== 'none' ||
    item.style.backgroundImage.includes('gradient') ||
    item.style.borderStyle !== 'none',
  ).length;
  const geometryCount = visibleElements.filter((item) =>
    item.style.display === 'grid' ||
    item.style.display === 'flex' ||
    item.style.transform !== 'none' ||
    /^(SVG|CANVAS)$/.test(item.element.tagName),
  ).length;
  const transitionItems = visibleElements.filter((item) =>
    item.style.transitionDuration.split(',').some((duration) => parseCssDurationMs(duration) > 0),
  );
  const animationItems = visibleElements.filter((item) =>
    item.style.animationName !== 'none' &&
    item.style.animationDuration.split(',').some((duration) => parseCssDurationMs(duration) > 0),
  );
  const transformCount = visibleElements.filter((item) => item.style.transform !== 'none').length;
  const durations = [...transitionItems, ...animationItems].flatMap((item) => [
    ...item.style.transitionDuration.split(',').map(parseCssDurationMs),
    ...item.style.animationDuration.split(',').map(parseCssDurationMs),
  ]).filter((value) => value > 0);
  const easingCount = visibleElements.filter((item) =>
    /cubic-bezier\\([^)]*(?:1\\.\\d|-\\d)/i.test(`${item.style.transitionTimingFunction} ${item.style.animationTimingFunction}`),
  ).length;
  const elementDensity = clamp01(visibleElements.length / 80);
  const textCoverage = clamp01(textArea / viewportArea);
  const mediaCoverage = clamp01(mediaArea / viewportArea);
  const dataVizDensity = clamp01(dataVizCount / Math.max(1, visibleElements.length) * 8);
  const interactionDensity = clamp01(interactiveCount / Math.max(1, visibleElements.length) * 4);
  const averageRadius = radiusValues.length ? radiusValues.reduce((sum, value) => sum + value, 0) / radiusValues.length : 0;
  const radiusBias = clamp01(averageRadius / 28);
  const decorationDensity = clamp01(decoratedCount / Math.max(1, visibleElements.length) * 3);
  const geometryDensity = clamp01(geometryCount / Math.max(1, visibleElements.length) * 3);
  const layoutSymmetry = clamp01(0.36 + centerAlignedCount / Math.max(1, visibleElements.length) * 0.82 - interactionDensity * 0.12);
  const transitionDensity = clamp01(transitionItems.length / Math.max(1, visibleElements.length) * 5);
  const animationDensity = clamp01(animationItems.length / Math.max(1, visibleElements.length) * 5);
  const transformDensity = clamp01(transformCount / Math.max(1, visibleElements.length) * 4);
  const averageDurationMs = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
  const durationRegularity = durations.length > 1 ? 1 - clamp01(durationStdDev(durations) / Math.max(1, averageDurationMs)) : 0.5;
  const fastness = durations.length ? clamp01(1 - averageDurationMs / 900) : 0.45;
  const motionEnergy = clamp01(animationDensity * 0.45 + transitionDensity * 0.35 + transformDensity * 0.2);
  const atoms = {
    'rendered.element_density': round(elementDensity),
    'rendered.text_coverage': round(textCoverage),
    'rendered.media_coverage': round(mediaCoverage),
    'rendered.data_viz_density': round(dataVizDensity),
    'rendered.interaction_density': round(interactionDensity),
    'rendered.corner_radius_bias': round(radiusBias),
    'rendered.decoration_density': round(decorationDensity),
    'rendered.geometry_density': round(geometryDensity),
    'rendered.layout_symmetry': round(layoutSymmetry),
    'rendered.motion_intensity': round(motionEnergy),
    'rendered.transition_density': round(transitionDensity),
    'rendered.animation_density': round(animationDensity),
  };

  return {
    sourceField: 'website.renderedPrimitives',
    motionSourceField: 'website.renderedMotionPrimitives',
    excerpt: `Rendered primitives: ${visibleElements.length} visible elements, ${dataVizCount} data-viz markers, ${transitionItems.length} transitions, ${animationItems.length} animations.`,
    atoms,
    visual: {
      minimalism: round(clamp01(0.78 - elementDensity * 0.34 - decorationDensity * 0.34 - mediaCoverage * 0.12)),
      densityTolerance: round(clamp01(0.32 + elementDensity * 0.34 + textCoverage * 0.2 + dataVizDensity * 0.28)),
      dataVizAffinity: round(clamp01(dataVizDensity * 0.76 + geometryDensity * 0.16 + textCoverage * 0.08)),
      expressiveness: round(clamp01(decorationDensity * 0.34 + mediaCoverage * 0.24 + motionEnergy * 0.24 + geometryDensity * 0.18)),
      geometryTendency: round(clamp01(geometryDensity * 0.5 + layoutSymmetry * 0.28 + dataVizDensity * 0.22)),
      decorationTolerance: round(decorationDensity),
      cornerRadiusBias: round(radiusBias),
      layoutSymmetry: round(layoutSymmetry),
      contrastPreference: 0.5,
    },
    motion: transitionItems.length + animationItems.length + transformCount > 0
      ? {
          motionEnergy: round(motionEnergy),
          overshootTolerance: round(clamp01(easingCount / Math.max(1, transitionItems.length + animationItems.length) + animationDensity * 0.18)),
          transitionSharpness: round(clamp01(fastness * 0.55 + transitionDensity * 0.25 + geometryDensity * 0.2)),
          rhythmRegularity: round(clamp01(durationRegularity * 0.7 + (transitionItems.length > 0 && animationItems.length === 0 ? 0.15 : 0))),
        }
      : undefined,
    confidence: 0.66,
    motionConfidence: 0.62,
  };

  function parseCssDurationMs(value) {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\\d+(?:\\.\\d+)?)(ms|s)$/i);
    if (!match) return 0;
    return match[2].toLowerCase() === 's' ? Number.parseFloat(match[1]) * 1000 : Number.parseFloat(match[1]);
  }

  function durationStdDev(values) {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }
}
"""


async def render_snapshot(
    url: str,
    user_agent: str,
    goto_timeout_ms: int,
    wait_until: str,
    http_status: Optional[int],
) -> Optional[dict]:
    """Launch Chromium, render the URL, return the flat snapshot dict (or None)."""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=LAUNCH_ARGS)
        try:
            context = await browser.new_context(user_agent=user_agent)
            page = await context.new_page()
            response = await page.goto(url, timeout=goto_timeout_ms, wait_until=wait_until)
            # Best-effort SPA settle; never let a hung socket block the response.
            try:
                await page.wait_for_load_state("networkidle", timeout=SETTLE_TIMEOUT_MS)
            except Exception:
                pass

            html = await page.content()
            if not html.strip():
                return None

            stylesheets = cap_stylesheets(await page.evaluate(STYLESHEETS_JS))
            primitives = await page.evaluate(PRIMITIVES_JS)

            final_url = response.url if response else url
            content_type = (response.headers.get("content-type") if response else None) or "text/html"
            status = response.status if response else http_status

            warnings = [
                "Modal Playwright browser-rendered evidence was used because direct "
                "Brand Vault website fetch did not produce usable HTML.",
            ]
            if status is not None:
                warnings.append(f"Modal Playwright renderer received HTTP {status}.")
            if stylesheets:
                warnings.append(
                    "Modal Playwright renderer attached CSSOM stylesheet evidence for color and font extraction."
                )
            if primitives:
                warnings.append(
                    "Modal Playwright renderer attached computed layout and motion primitives for visual signal extraction."
                )

            return {
                "normalizedUrl": final_url,
                "html": truncate_html(html),
                "contentType": content_type,
                "stylesheets": stylesheets,
                "renderedPrimitives": primitives,
                "fetchWarnings": warnings,
                "stylesheetWarnings": [],
            }
        finally:
            await browser.close()


async def screenshot_capture(
    url: str,
    user_agent: str,
    goto_timeout_ms: int,
    wait_until: str,
    full_page: bool,
    wait_after_ms: int,
) -> Optional[dict]:
    """Launch Chromium, render the URL, return a base64 PNG screenshot dict (or None on empty/oversized)."""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=LAUNCH_ARGS)
        try:
            context = await browser.new_context(
                user_agent=user_agent,
                viewport={"width": SCREENSHOT_VIEWPORT_WIDTH, "height": SCREENSHOT_VIEWPORT_HEIGHT},
                device_scale_factor=1,
            )
            page = await context.new_page()
            await page.goto(url, timeout=goto_timeout_ms, wait_until=wait_until)
            # Best-effort SPA settle; never let a hung socket block the response.
            try:
                await page.wait_for_load_state("networkidle", timeout=SETTLE_TIMEOUT_MS)
            except Exception:
                pass
            if wait_after_ms > 0:
                await page.wait_for_timeout(min(wait_after_ms, MAX_SCREENSHOT_WAIT_MS))

            png = await page.screenshot(full_page=full_page, type="png")
            if not png or len(png) == 0 or len(png) > MAX_SCREENSHOT_BYTES:
                return None
            return {
                "screenshotBase64": base64.b64encode(png).decode("ascii"),
                "contentType": "image/png",
            }
        finally:
            await browser.close()


@app.function(
    image=image,
    secrets=[render_secret],
    cpu=2.0,
    memory=2048,
    timeout=120,
    scaledown_window=300,
)
@modal.fastapi_endpoint(method="POST")
async def render(request: fastapi.Request):
    from fastapi.responses import JSONResponse

    def error(status: int, code: str, message: str) -> JSONResponse:
        return JSONResponse(status_code=status, content={"ok": False, "error": {"code": code, "message": message}})

    token = os.environ.get("BRAND_VAULT_MODAL_RENDER_TOKEN") or os.environ.get("BRAND_VAULT_BROWSER_RENDER_TOKEN")
    if not token:
        return error(503, "render_token_not_configured", "Brand Vault browser render token is not configured.")
    if not authorization_matches(request.headers.get("authorization"), token):
        return error(401, "unauthorized", "Invalid Brand Vault browser render token.")

    try:
        body = await request.json()
    except Exception:
        return error(400, "invalid_json", "Expected JSON body with a url field.")
    if not isinstance(body, dict):
        return error(400, "invalid_json", "Expected JSON body with a url field.")

    normalized = normalize_target_url(body.get("url") or body.get("normalizedUrl"))
    if not normalized:
        return error(400, "invalid_url", "Expected a public http(s) url or normalizedUrl field.")

    allow_private = _truthy(os.environ.get("BRAND_VAULT_BROWSER_RENDER_ALLOW_PRIVATE_HOSTS"))
    ok, code, message = validate_public_target(normalized, allow_private=allow_private)
    if not ok:
        return error(400, code, message)

    user_agent = body.get("userAgent") if isinstance(body.get("userAgent"), str) and body.get("userAgent").strip() else DEFAULT_USER_AGENT
    http_status = body.get("httpStatus") if isinstance(body.get("httpStatus"), int) else None
    goto_timeout_ms = _clamp_timeout(os.environ.get("BRAND_VAULT_MODAL_RENDER_GOTO_TIMEOUT_MS"), DEFAULT_GOTO_TIMEOUT_MS)
    wait_until = (os.environ.get("BRAND_VAULT_MODAL_RENDER_WAIT_UNTIL") or DEFAULT_WAIT_UNTIL).strip().lower()
    if wait_until not in VALID_WAIT_UNTIL:
        wait_until = DEFAULT_WAIT_UNTIL

    # Screenshot mode: the app's website-screenshot capture posts { mode: "screenshot", fullPage, waitFor }.
    # Return a base64 PNG the app stores to R2 as first-party "Website screenshot" evidence. Any other mode
    # (or none) falls through to the unchanged HTML-snapshot path below.
    mode_value = body.get("mode") or body.get("format")
    if isinstance(mode_value, str) and mode_value.strip().lower() == "screenshot":
        raw_full_page = body.get("fullPage")
        full_page = raw_full_page is True or (isinstance(raw_full_page, str) and _truthy(raw_full_page))
        raw_wait = body.get("waitFor")
        wait_after_ms = raw_wait if isinstance(raw_wait, int) and not isinstance(raw_wait, bool) else 0
        wait_after_ms = min(MAX_SCREENSHOT_WAIT_MS, max(0, wait_after_ms))
        try:
            shot = await screenshot_capture(normalized, user_agent, goto_timeout_ms, wait_until, full_page, wait_after_ms)
        except Exception as exc:  # noqa: BLE001 - surface a clean failure, never a stack trace
            return error(502, "screenshot_failed", f"Brand Vault browser screenshot failed: {type(exc).__name__}.")
        if not shot:
            return error(502, "screenshot_failed", "Brand Vault browser render did not produce a screenshot.")
        return JSONResponse(status_code=200, content={"ok": True, "normalizedUrl": normalized, **shot})

    try:
        snapshot = await render_snapshot(normalized, user_agent, goto_timeout_ms, wait_until, http_status)
    except Exception as exc:  # noqa: BLE001 - surface a clean failure, never a stack trace
        return error(502, "render_failed", f"Brand Vault browser render failed: {type(exc).__name__}.")

    if not snapshot or not snapshot["html"].strip():
        return error(502, "render_failed", "Brand Vault browser render did not produce usable HTML.")

    return JSONResponse(status_code=200, content=snapshot)
