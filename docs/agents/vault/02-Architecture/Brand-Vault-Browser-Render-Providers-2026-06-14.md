---
tags: [architecture, brand-vault, browser-render, evidence-ingestion]
date: 2026-06-14
status: implemented-provider-contract-and-internal-route
owner: Brand Vault shared core
scope:
  - Brand Vault website evidence ingestion
  - browser-render fallback provider selection
out_of_scope:
  - service-specific Brand Vault consumers
  - accepted Brand Vault truth decisions
---

# Brand Vault Browser Render Providers - 2026-06-14

## Decision

Brand Vault must not require a paid scraper to make website setup work.

The default product stance is:

1. Direct Brand Vault website fetch first.
2. Self-hosted browser render endpoint when direct fetch is blocked, JS-thin, or too empty.
3. Optional local Playwright renderer for self-hosted workers that run the app code with Playwright installed.
4. Firecrawl only as an explicit paid opt-in.

This keeps Brand Vault setup "free forever" at the software layer. It still needs compute somewhere because browser rendering consumes CPU/RAM, but it does not require per-page vendor spend.

## Runtime Provider Order

`createBrandVaultBrowserFallbackFetchFromEnvironment()` resolves providers in this order:

1. `BRAND_VAULT_BROWSER_RENDER_PROVIDER=off`
   - disables browser fallback.
2. `BRAND_VAULT_BROWSER_RENDER_ENDPOINT` or `BRAND_VAULT_MODAL_RENDER_ENDPOINT`
   - preferred production path.
   - points at our own Playwright/Crawlee/browser worker, including Modal-hosted workers.
   - `BRAND_VAULT_BROWSER_RENDER_PROVIDER=modal` is an endpoint-backed alias, not a paid scraper.
   - wins even if Firecrawl env is present.
3. `BRAND_VAULT_BROWSER_RENDER_PROVIDER=local_playwright`
   - uses the shared local Playwright provider.
   - requires the runtime/worker to have the `playwright` package and browser binaries available.
   - does not require a paid scraping vendor.
4. `BRAND_VAULT_BROWSER_RENDER_PROVIDER=firecrawl`
   - uses Firecrawl only when `FIRECRAWL_API_KEY` is also configured.
   - paid/credit-backed provider, never automatic from key presence alone.
5. No provider
   - no browser fallback; the direct website scan continues to report normal weak/blocked evidence warnings.

## Recommended Production Env

Self-hosted endpoint:

```env
BRAND_VAULT_BROWSER_RENDER_ENDPOINT=https://render-worker.example.com/api/brand-vault/refinery/browser-render
BRAND_VAULT_BROWSER_RENDER_TOKEN=<internal shared secret>
BRAND_VAULT_BROWSER_RENDER_TIMEOUT_MS=12000
```

Modal-hosted endpoint:

```env
BRAND_VAULT_BROWSER_RENDER_PROVIDER=modal
BRAND_VAULT_MODAL_RENDER_ENDPOINT=https://<workspace>--<app-name>-<function-name>.modal.run
BRAND_VAULT_MODAL_RENDER_TOKEN=<internal shared secret>
BRAND_VAULT_MODAL_RENDER_TIMEOUT_MS=12000
```

The repo-owned route is:

- `POST /api/brand-vault/refinery/browser-render`

It requires `Authorization: Bearer <BRAND_VAULT_BROWSER_RENDER_TOKEN>` or `Authorization: Bearer <BRAND_VAULT_MODAL_RENDER_TOKEN>`, blocks private/local render targets by default, and returns only draft evidence snapshots.

Local Playwright worker:

```env
BRAND_VAULT_BROWSER_RENDER_PROVIDER=local_playwright
BRAND_VAULT_PLAYWRIGHT_TIMEOUT_MS=12000
BRAND_VAULT_PLAYWRIGHT_WAIT_UNTIL=networkidle
```

Paid Firecrawl escape hatch:

```env
BRAND_VAULT_BROWSER_RENDER_PROVIDER=firecrawl
FIRECRAWL_API_KEY=YOUR_FIRECRAWL_API_KEY
BRAND_VAULT_FIRECRAWL_WAIT_MS=1000
BRAND_VAULT_FIRECRAWL_TIMEOUT_MS=12000
```

Do not set Firecrawl as the default production path unless the team explicitly accepts vendor quota/cost.

## Evidence Contract

Every provider returns `BrandWebsiteBrowserFallbackSnapshot`:

- `html`: browser-rendered HTML evidence.
- `normalizedUrl`: final rendered URL when known.
- `contentType`: usually `text/html`.
- `stylesheets`: optional CSS evidence for color/font extraction.
- `fetchWarnings`: provider provenance and degradation notes.

Provider output remains draft evidence. It does not accept Brand Vault truth and does not directly control service output.

## Creative Guardrails

The creative knowledge graph reinforces the same boundary:

- color and typography evidence can inform draft palette/typography signals.
- color contrast and color-only accessibility remain constraints.
- logo placement and brand identity rules must come from uploaded brand assets, brand guidelines, or user review.
- Firecrawl/Playwright/Crawlee evidence is source evidence, not canonical brand law.

## Built Route

The first-party render route is implemented as a thin shell over the shared handler:

- `app/api/brand-vault/refinery/browser-render/route.ts`
- `lib/shared/brand-vault-browser-render-endpoint.ts`
- `tests/brand-intelligence/brand-vault-browser-render-endpoint.test.ts`

The route is intentionally internal-token authenticated rather than user-authenticated because it is called by Brand Vault infrastructure, not by a browser user session.

## Next Work

Build the full crawler layer around Crawlee or Playwright:

- sitemap and internal-link discovery.
- deterministic crawl limits: max pages, max depth, max bytes, max duration.
- rendered HTML collection for JS-heavy pages.
- CSSOM stylesheet collection for colors/fonts.
- logo/favicon/Open Graph image inventory.
- per-page warnings and source notes.
- no accepted profile writes from the worker.
