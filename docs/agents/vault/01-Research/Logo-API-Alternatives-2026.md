# Logo API Alternatives (Post-Clearbit Shutdown)

**Date:** 2026-05-29
**Context:** Clearbit Logo API shut down Dec 8, 2025 (HubSpot acquisition). Researched for future Graphiti brand asset integration.
**Tags:** #research #brand #api #deferred

## Recommendation for Editron MG Pipeline

**Primary: Brandfetch** — free 500K/month, no attribution, SVG on free tier, 60M+ brands
**Fallback: Logo.dev** — Clearbit founder's replacement, 30M+ brands, SVG on Enterprise only
**Brand data: Context.dev** — returns logo + colors + fonts + metadata in one call (most useful for Graphiti)

## Top Options

### Brandfetch (RECOMMENDED)
- URL: brandfetch.com/developers/logo-api
- Free: 500K req/month, no attribution required
- SVG on free tier (critical for MG — vector scales to any resolution)
- 60M+ brands (largest coverage)
- CDN pattern: `https://logo.brandfetch.com/{domain}`
- Brand API ($99/month): returns colors + fonts + metadata per brand
- Rate limit: 2,400 req per 5 minutes

### Logo.dev
- URL: logo.dev
- Built by Clearbit co-founder. Official migration path.
- Free: 500K req/month (attribution required)
- CDN pattern: `https://img.logo.dev/{domain}?token=TOKEN`
- SVG only on Enterprise plan
- 30M+ brands

### Context.dev (formerly Brand.dev)
- URL: context.dev / brand.dev/logo-api
- Returns FULL brand data: logo + colors + fonts + social links
- Free: 500 API credits + 10K logo link requests
- SVG, PNG, WebP, JPEG with background variant detection
- TypeScript SDK available
- Best option when Graphiti needs brand colors/fonts alongside logos

### Others (lower priority)
- **LogoKit** (logokit.com) — 50M+ logos, 5K/day free, stock/crypto specialty
- **RiteKit** — SVG-first approach, returns brand colors, 100 credits/month free
- **CompanyEnrich** — no API key needed, no SLA, PNG only

## Integration Path (when Graphiti ships)
1. Entity.name detects "Nike" in transcript
2. Graphiti checks local cache for brand data
3. Cache miss → Brandfetch API (logo SVG + colors) or Context.dev (full brand kit)
4. Store in Graphiti: logo URL, primary color, accent color, font preference
5. Next mention of "Nike" → cache hit, no API call
6. Content payload: {name: "Nike", logo: "https://...", brand: true}
7. composeBrand() renders logo via image primitive + brand-specific colors
