# Brand Vault Browser-Render Worker (Modal)

A Modal-hosted Playwright/Chromium worker that renders a public website URL and
returns rendered HTML + CSS + computed visual primitives. Brand Vault calls it as
the **browser-render fallback** when a direct fetch only sees a JavaScript shell,
a bot challenge, or empty/blocked HTML — so JS-heavy React/Next sites still yield
rich brand evidence **without any paid scraper** (no Firecrawl).

- Worker: [`brand_vault_browser_render.py`](brand_vault_browser_render.py)
- Local unit tests (SSRF/auth/caps): [`test_browser_render.py`](test_browser_render.py)
- Post-deploy smoke test: [`smoke_test.py`](smoke_test.py)
- Contract it mirrors: `lib/shared/brand-vault-browser-render-endpoint.ts` (the
  first-party route) and `lib/shared/brand-vault-browser-fallback.ts` (the caller
  + response parser). Provider design: `docs/agents/vault/02-Architecture/Brand-Vault-Browser-Render-Providers-2026-06-14.md`.

It is an **endpoint-backed provider** (`BRAND_VAULT_BROWSER_RENDER_PROVIDER=modal`
is an alias for the self-hosted endpoint path), not a vendor scraper.

---

## What it returns

A flat JSON snapshot — the exact shape `snapshotFromJsonPayload` parses:

```json
{
  "normalizedUrl": "https://example.com/",
  "html": "<!doctype html>…",
  "contentType": "text/html",
  "stylesheets": [{ "url": "https://…/app.css", "css": "…", "contentType": "text/css" }],
  "renderedPrimitives": {
    "sourceField": "website.renderedPrimitives",
    "motionSourceField": "website.renderedMotionPrimitives",
    "excerpt": "Rendered primitives: …",
    "atoms": { "rendered.element_density": 0.42, "…": 0.0 },
    "visual": { "minimalism": 0.6, "densityTolerance": 0.4, "dataVizAffinity": 0.1,
                "expressiveness": 0.3, "geometryTendency": 0.4, "decorationTolerance": 0.2,
                "cornerRadiusBias": 0.4, "layoutSymmetry": 0.5, "contrastPreference": 0.5 },
    "motion": { "motionEnergy": 0.2, "overshootTolerance": 0.1, "transitionSharpness": 0.6, "rhythmRegularity": 0.5 },
    "confidence": 0.66,
    "motionConfidence": 0.62
  },
  "fetchWarnings": ["Modal Playwright browser-rendered evidence was used …"],
  "stylesheetWarnings": []
}
```

The in-browser stylesheet + primitive extraction JS is ported **verbatim** from the
shared local Playwright provider, so Modal evidence is byte-identical to the local
`local_playwright` provider. Errors return a non-200 with `{ "ok": false, "error":
{ "code", "message" } }`; the app treats any non-200 as "fallback unavailable" and
degrades gracefully.

---

## Deploy

### 0. Prerequisites

```bash
pip install modal
modal token new        # one-time: authenticate the Modal CLI to your workspace
```

### 1. Create the bearer-token secret

Pick a strong shared secret (this same value goes into Vercel below):

```bash
# generate one if you don't already have it
TOKEN=$(openssl rand -hex 32)

modal secret create brand-vault-modal-render BRAND_VAULT_MODAL_RENDER_TOKEN="$TOKEN"
echo "Save this token for Vercel: $TOKEN"
```

The worker reads `BRAND_VAULT_MODAL_RENDER_TOKEN` from this secret (it also accepts
`BRAND_VAULT_BROWSER_RENDER_TOKEN` if you prefer to name it that). No token in the
secret → the endpoint returns `503 render_token_not_configured` and never renders.

### 2. Deploy the app

```bash
modal deploy modal/brand_vault_browser_render.py
```

First deploy builds the image (installs Playwright + Chromium); subsequent deploys
are fast. Modal prints the public endpoint URL, of the form:

```
https://<workspace>--brand-vault-browser-render-render.modal.run
```

Copy the **exact** URL Modal prints — that is authoritative.

### 3. Point Vercel (the Next.js app) at it

Set these in Vercel Project → Settings → Environment Variables (Production), then
redeploy the app so they take effect:

| Variable | Value |
| --- | --- |
| `BRAND_VAULT_BROWSER_RENDER_PROVIDER` | `modal` |
| `BRAND_VAULT_MODAL_RENDER_ENDPOINT` | the URL from step 2 |
| `BRAND_VAULT_MODAL_RENDER_TOKEN` | the `$TOKEN` from step 1 |
| `BRAND_VAULT_MODAL_RENDER_TIMEOUT_MS` | `12000` (client-side abort budget) |

`BRAND_VAULT_BROWSER_RENDER_ENDPOINT` / `_TOKEN` / `_TIMEOUT_MS` (the generic names)
are accepted as equivalents and take precedence if both are set.

### 4. Smoke-test the live endpoint

```bash
python modal/smoke_test.py "https://<workspace>--brand-vault-browser-render-render.modal.run" "$TOKEN"
# render a specific JS-heavy site to eyeball richness:
python modal/smoke_test.py "<endpoint>" "$TOKEN" https://your-react-site.com
```

It checks the happy-path contract (html + 9 visual fields + atoms), 401 on
missing/wrong token, and SSRF blocks (localhost, `169.254.169.254`, embedded
credentials, non-http scheme).

---

## Worker-side tuning (optional Modal env vars / secret keys)

Set these as extra keys in the `brand-vault-modal-render` secret (or a second
secret) if you need to override defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BRAND_VAULT_MODAL_RENDER_GOTO_TIMEOUT_MS` | `12000` | Page-navigation timeout (clamped 1000–20000). Keep ≤ the client `TIMEOUT_MS` or the client aborts first. |
| `BRAND_VAULT_MODAL_RENDER_WAIT_UNTIL` | `domcontentloaded` | Playwright nav wait (`domcontentloaded` \| `load` \| `networkidle`). The worker always adds a best-effort `networkidle` settle for SPA hydration. |
| `BRAND_VAULT_BROWSER_RENDER_ALLOW_PRIVATE_HOSTS` | unset | `true`/`1` disables the SSRF guard. **Local debugging only — never set in production.** |

Production caps are constants in the worker: `MAX_HTML_BYTES` (5 MB),
`MAX_STYLESHEETS` (40), `MAX_CSS_BYTES_PER_SHEET` (512 KB), `MAX_TOTAL_CSS_BYTES`
(4 MB).

---

## Security

- **Bearer auth**, timing-safe (`hmac.compare_digest`) against the secret token.
- **SSRF guard** blocks `localhost`/`*.localhost`, all RFC-1918 private ranges,
  loopback, link-local (incl. `169.254.169.254` cloud metadata), CGNAT
  `100.64/10`, benchmarking `198.18/15`, multicast/reserved, IPv6
  `::`/`::1`/`fc00::/7`/`fe80::/10` + IPv4-mapped, embedded URL credentials, and
  non-http(s) schemes. Hostnames are DNS-resolved and **every** resolved address
  is re-checked (defeats DNS-rebind). The blocklist mirrors the first-party route
  and is unit-tested against in/out-of-range edges in `test_browser_render.py`.
- The worker returns **draft evidence only**. It never writes accepted Brand Vault
  truth and does not control service output.

---

## Local development

```bash
# fast logic tests — no Modal/Chromium needed (modal + fastapi must be importable):
python modal/test_browser_render.py

# run the endpoint locally against your Modal workspace (hot-reload):
modal serve modal/brand_vault_browser_render.py
```

> Note: Playwright spawns a browser subprocess, so the full render path can only be
> exercised on Modal (Linux) or a host whose Python asyncio supports subprocesses —
> not inside restricted sandboxes. The pure logic (SSRF/auth/normalize/caps) and the
> extraction JS are verified locally; the render path is verified by `smoke_test.py`
> against the deployed endpoint.

---

## Cost / scaling

- CPU-only (`cpu=2.0`, `memory=2048`), `scaledown_window=300` (idle containers spin
  down after 5 min), function `timeout=120`. Brand Vault calls this only on the
  fallback path (JS-shell / challenge / blocked), so volume is low and bursty —
  scale-to-zero keeps idle cost ~$0. No per-page vendor spend.
