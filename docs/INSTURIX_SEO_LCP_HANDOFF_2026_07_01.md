# Insturix SEO And LCP Handoff For Claude

Date: 2026-07-01

Owner recommendation: Claude should take the next implementation phase. The immediate goal is to finish the SEO/domain-health cleanup from stale public URLs, then run a careful LCP improvement pass without flattening or damaging the current UI/UX.

This handoff is intentionally detailed because the repo has a dirty working tree and the performance work can easily regress the public experience if handled as a blunt "remove animations/providers" cleanup.

## Executive Summary

Insturix domain health is being hit by stale public paths that currently return 404 in production. Phase 1 has already been implemented locally in `next.config.ts`: permanent redirects for the old public URLs from the screenshot now point to the closest live routes.

The LCP issue is separate. Deleting old missing pages will not make live pages load faster. The best current evidence points to a large shared JavaScript baseline on public pages, especially the custom production `webpack.optimization.splitChunks` config and public pages inheriting app-heavy providers through the root layout.

The next phase should be a narrow performance experiment, not a design rewrite:

1. Deploy or verify the Phase 1 redirects.
2. Run a measured chunking experiment around `next.config.ts`.
3. Only then consider provider scoping and page-level lazy loading.
4. Preserve public UI/UX as a release gate.

## User Intent And Preferences

The user wants:

- SEO/domain-health fixes for stale 404 public paths.
- A practical explanation of nofollow backlinks and what to do about them.
- A production-level LCP plan.
- No UI/UX damage from LCP work.
- Phased execution. Do not do a broad multi-file refactor in one pass.

The user explicitly challenged whether the old pages should simply be deleted. The answer already given:

- Those pages are already effectively deleted or missing in production because they return 404.
- Keeping them as 404s hurts SEO because old links dead-end.
- Redirecting them is better than deleting for SEO.
- Old missing URLs do not affect `/products`, `/contactus`, or other live page LCP unless their code/components are imported into live bundles.

## Repo And Working Tree Context

Real repo:

```text
D:\google downloads\Front-End-main\Front-End-main
```

Umbrella/root workspace:

```text
D:\google downloads\Front-End-main
```

Important: the working tree is already very dirty with many unrelated changes. Do not revert or normalize unrelated files. Treat unrelated modified/untracked files as user work.

Known Codex changes from this SEO/LCP thread:

- `next.config.ts`: added `stalePublicRedirects` and wired them into `redirects()`.
- This handoff doc: `docs/INSTURIX_SEO_LCP_HANDOFF_2026_07_01.md`.

## Phase 1 Redirect Work Already Done Locally

File:

```text
next.config.ts
```

Added redirect sources:

```text
/about/team                    -> /about
/checkout                      -> /upgrade
/contact-sales                 -> /contactus
/contribute                    -> /support-us
/donate                        -> /support-us
/enterprise                    -> /contactus
/ics25                         -> /showcase
/ics25/gameon                  -> /showcase
/ics25/register                -> /signup
/insturix-creatives-agency     -> /contactus
/pricing                       -> /upgrade
/products/ai-video-editor      -> /products
/products/brand-deals          -> /products
/products/business-analytics   -> /products
/products/influencer-protection -> /products
/products/meditron             -> /products
/products/shield               -> /products
/sponsor                       -> /support-us
/waitlist                      -> /signup
```

Why `/dashboard` is not redirected:

- `/dashboard` is a protected app route, not a retired marketing route.
- A config-level redirect from `/dashboard` would break logged-in users.
- If crawlers reporting `/dashboard` as 404 is a problem, solve it with robots/noindex/auth handling, not by redirecting the actual dashboard route away.

Potential query behavior:

- The screenshot showed checkout variants such as `/checkout?tier=platinum`.
- The exact path redirect for `/checkout` should cover the path while preserving or carrying query behavior per Next/Vercel behavior, but Claude should verify after deploy with the query variants.

## Production Evidence Collected

Live production target:

```text
https://www.insturix.com
```

Vercel production inspect result from this investigation:

```text
Deployment: front-1ye0t8l83-nimit-jains-projects-bd2b522e.vercel.app
Created: 2026-06-30 20:59:43 GMT+0530
Aliases: www.insturix.com, insturix.com
Branch: main
State: ready
```

Live checks before the local Phase 1 redirects:

- Homepage returned `200`.
- All 25 screenshot URLs checked with HEAD and GET returned `404`.
- `robots.txt` returned `200`.
- `sitemap.xml` returned `200`.
- `sitemap-0.xml` returned `200`.
- The old paths did not appear in the sitemap.
- A small crawl of live sitemap pages did not find internal 404 links.

Existing live redirects that were already working:

```text
/products/editron     -> 308 /products
/products/thinkforge  -> 308 /products
```

Live targets verified as `200` during the investigation:

```text
/about
/contactus
/upgrade
/support-us
/signup
/showcase
/products
/resources/faq
```

## Backlink And Nofollow Context

Screenshot 2 showed:

```text
Referring domains:
  Followed:     6   2.5%
  Not followed: 232 97.5%

Backlinks:
  Followed:     9   2.3%
  Not followed: 385 97.7%
```

Interpretation:

- `nofollow` is a link attribute/hint telling search engines not to treat the link as a normal ranking endorsement.
- It is common on social platforms, directories, comments, UGC, and some listing sites.
- It is not automatically harmful.
- But a profile that is almost entirely nofollow is weak for authority growth.

Action plan for nofollow:

1. Do not disavow nofollow links unless they are toxic/spammy or there is manual-action risk.
2. After redirects deploy, export the backlink report from the SEO tool.
3. Sort by referring-domain quality and by target URL.
4. Prioritize high-quality domains linking to old 404 URLs.
5. Outreach to ask those sites to update their target URLs.
6. Ask for followed links only where editorially appropriate.
7. Build new followed links through partner pages, product directories, founder posts, customer/case-study pages, launch writeups, integrations, and PR.
8. Avoid bought backlink packages.

Measure:

- Followed referring domains.
- Broken backlink count.
- Top linked pages.
- Branded search growth.
- Rankings for product/category queries.

## LCP Evidence Collected

Vercel field-data screenshot showed:

```text
Desktop Real Experience Score: 67
First Contentful Paint: 2.78s
Largest Contentful Paint: 6.14s
Interaction to Next Paint: 136ms
Cumulative Layout Shift: 0.04
```

Problem routes from screenshot:

```text
/dashboard/brand-vault                 9.54s
/dashboard/uploaderx                   6.16s
/signup                                26.4s
/showcase                              33.8s
/products                              7.04s
/dashboard/clickatron/lab/[sessionId]  5.31s
/dashboard/calos                       5.34s
/contactus                             24.79s
/dashboard/thinkforge                  4.36s
/resources/faq                         7.9s
```

Important interpretation:

- TTFB was not the obvious bottleneck on public pages during live curl checks.
- Several public pages had cache hits and reasonable total HTML transfer time.
- The likely issue is client-side render/hydration/script weight delaying the LCP element.

Approximate live curl timings observed:

```text
/products       TTFB 0.781s total 0.832s bytes 106800
/showcase       TTFB 0.737s total 0.839s bytes 38675
/signup         TTFB 0.603s total 0.603s bytes 23269
/contactus      TTFB 0.275s total 0.285s bytes 32095
/resources/faq  TTFB 0.163s total 0.194s bytes 45430
```

Observed asset issue for `/products`:

```text
11 Next scripts
Approx total content-length: 5.46 MB raw
vendor-cac781ce655a9e96.js: 4,608,733 bytes
ui-ccf17bdb524c5a79.js:      462,816 bytes
common-5599bc77787bb625.js:  198,379 bytes
polyfills:                    112,594 bytes
app/products page:             62,431 bytes
```

Inference:

- The custom `splitChunks` config is probably forcing too much node_modules code into shared chunks that public pages have to load.
- This is a high-confidence hypothesis, but Claude should verify by building before/after and comparing generated chunk sizes and route scripts.

PageSpeed API:

- A PageSpeed API request was attempted and returned `429 Too Many Requests`.
- Do not rely on that attempt as a measurement.

## Key Files And Risk Notes

### `next.config.ts`

Relevant responsibilities:

- Redirects.
- `experimental.optimizePackageImports`.
- Custom production `webpack.optimization.splitChunks`.
- Image remote patterns.

Primary LCP suspicion:

```text
webpack: (config, { dev, isServer }) => {
  if (!dev && !isServer) {
    config.optimization.splitChunks = { ... }
  }
}
```

Risk:

- Removing or changing splitChunks should not change visuals directly.
- It can change cache behavior and chunk loading.
- It must be validated by production build and route smoke tests.

### `app/layout.tsx`

Root layout currently wraps all pages in:

```text
ClerkProvider
ReactQueryProvider
ThemeProvider
ClientAnalyticsLoader
SpeedInsights
Toaster
ReactQueryDevtools in development
```

Risk:

- Do not simply remove Clerk or React Query globally.
- Public navigation uses Clerk auth state.
- Public contact/footer forms use React Query.
- Removing these providers without a replacement can break UX.

### `components/shared/site-navbar.tsx`

Observed dependencies:

- Uses `useAuth` and `useUser` from Clerk.
- Uses `framer-motion`.
- Has a logo/name toggle and mobile/menu interactions.

Risk:

- Splitting the navbar into static shell plus auth island may be a good long-term fix.
- But this file is large. If Claude performs a structural refactor and the file is over 300 LOC, follow the user's Step 0 rule: clean dead imports/props/logs first, separately, before the structural change.

### `components/shared/contact-page.tsx`

Observed dependencies:

- `formik`.
- `@tanstack/react-query` via `useMutation`.
- `axios`.
- `framer-motion`.
- `AnimatePresence`.

Risk:

- This page likely contributes to public JS weight.
- Replacing Formik/React Query with native form state/fetch could help.
- But preserve validation, loading state, success state, error state, and visual motion polish.

### `components/shared/site-footer.tsx`

Observed dependencies:

- `@tanstack/react-query` via `useMutation`.
- Toast feedback for newsletter subscription.

Risk:

- Provider scoping can break footer newsletter if the footer remains on public pages without a query provider.

### `components/shared/products/products-page.tsx`

Observed shape:

- Client component.
- Imports multiple product/mockup components at top level.
- Likely loads interactive/below-fold visual sections eagerly.

Risk:

- Good target for lazy-loading below-fold mockups and tours.
- Preserve the above-fold first impression and reserve dimensions to avoid CLS.

### `components/shared/showcase/showcase-gallery.tsx`

Observed dependencies:

- Client component.
- Uses `framer-motion` and `AnimatePresence`.

Risk:

- Do not remove motion wholesale.
- Consider lazy-loading gallery interactivity below first viewport and preserving static visible content.

### `app/signup/page.tsx`

Observed dependencies:

- Client page using Clerk `<SignUp>`.
- Very bad field LCP in screenshot.

Risk:

- This may be an auth-vendor page rather than an SEO landing page.
- Consider `noindex` for auth/account routes if they are not intended SEO targets.
- Do not optimize this as a marketing page until indexability/product intent is decided.

## UI/UX Guardrail

The user asked whether the LCP solutions could hurt UI/UX. The answer is yes if done bluntly.

Bad approach:

```text
Remove animations.
Remove providers.
Delete components.
Make everything static.
Call it faster.
```

Good approach:

```text
Keep the same first impression.
Load the LCP-critical pixels first.
Move heavy interactivity below the fold or behind user intent.
Reserve dimensions for lazy content.
Verify screenshots and interactions before shipping.
```

Do not optimize by making the site feel cheaper. The brand/product surface still needs to feel premium.

## Recommended Phased Plan

Keep each phase to no more than 5 files. Wait for explicit approval before starting the next phase if following the user's current instructions strictly.

### Phase 1 - Redirect stale public URLs

Status: implemented locally in `next.config.ts`.

Remaining for Claude:

1. Confirm diff is only the intended redirect addition.
2. Deploy or have the user deploy.
3. Verify every stale URL now returns 308/301 to the chosen live target.
4. Verify `/dashboard` still works for authenticated users and is not config-redirected.
5. Re-run SEO tool crawl after deployment/index refresh.

Suggested verification after deploy:

```powershell
$urls = @(
  "https://www.insturix.com/contribute",
  "https://www.insturix.com/products/ai-video-editor",
  "https://www.insturix.com/products/meditron",
  "https://www.insturix.com/ics25/register",
  "https://www.insturix.com/contact-sales",
  "https://www.insturix.com/pricing",
  "https://www.insturix.com/checkout?tier=platinum"
)
foreach ($u in $urls) {
  curl.exe -I -L $u
}
```

### Phase 2 - Chunking experiment only

Goal:

- Prove or disprove that the custom splitChunks config is causing oversized shared JS for public pages.

Scope:

- Prefer 1 file: `next.config.ts`.
- Do not touch public UI components in this phase.

Implementation idea:

- Temporarily remove or relax the custom production `webpack.optimization.splitChunks` override and let Next's default chunking work.
- Keep redirects and image config unchanged.

Required before/after measurements:

1. Production build output.
2. Script URLs and script byte totals for:
   - `/`
   - `/products`
   - `/contactus`
   - `/showcase`
   - `/resources/faq`
   - `/signup`
3. Visual screenshots before/after.
4. Basic interactions:
   - desktop navbar
   - mobile navbar
   - contact form visible states
   - footer newsletter
   - FAQ expand/collapse

Expected good outcome:

- Public pages no longer load a giant shared `vendor` chunk.
- UI should look the same.

Rollback:

- Revert only the splitChunks experiment if chunks or runtime behavior regress.

### Phase 3 - Provider scoping, but only after audit

Goal:

- Stop public pages from paying for app-heavy providers unless required.

Do not start by deleting providers from `app/layout.tsx`.

Safer path:

1. Map every public component that uses Clerk, React Query, toast, theme, or analytics.
2. Keep `ThemeProvider` global unless proven unnecessary.
3. Keep Clerk available to the public navbar until the navbar is split into:
   - static navigation shell
   - small auth/status island
4. Either keep React Query where public forms need it or migrate those forms first.
5. Move dashboard/app-specific provider weight into dashboard/app route boundaries only after dependencies are mapped.

Known public dependency warnings:

```text
site-navbar.tsx uses Clerk auth state.
contact-page.tsx uses React Query.
site-footer.tsx uses React Query.
```

Test gate:

- Signed-out nav state works.
- Signed-in nav state works.
- Sign out works.
- Contact form works.
- Footer newsletter works.
- Toasts or equivalent feedback still work.

### Phase 4 - Page-level lazy loading and server/client split

Goal:

- Reduce JS needed before LCP while preserving polish.

Candidates:

- `components/shared/products/products-page.tsx`
- `components/shared/showcase/showcase-gallery.tsx`
- `components/shared/contact-page.tsx`
- `app/resources/faq/page.tsx`

Rules:

- Above-fold content should render immediately.
- Below-fold heavy visual/mockup/gallery sections can be `next/dynamic` or moved behind viewport/interaction.
- Reserve layout dimensions so CLS does not regress.
- Do not remove motion wholesale. Prefer lighter motion or deferred motion.
- Keep SEO text server-rendered where possible.

### Phase 5 - Auth/app route SEO hygiene

Goal:

- Stop auth/dashboard pages from polluting SEO/LCP interpretation if they are not SEO targets.

Candidates:

- `/signup`
- `/signin`
- `/dashboard/*`
- account/checkout-only pages where appropriate

Approach:

- Decide whether each is an SEO landing page.
- If not, add `robots: { index: false, follow: false }` or equivalent route metadata.
- Do not hide pages users need. This is search-index hygiene, not UX deletion.

## Verification Commands And Current Outcomes

Commands already run after Phase 1 local redirects:

```powershell
npx tsc --noEmit
```

Outcome:

- Failed with many unrelated baseline TypeScript errors across existing areas.
- No `next.config.ts` redirect error surfaced.
- Do not claim repo-wide typecheck clean unless those baseline errors are fixed.

```powershell
npx eslint . --quiet
```

Outcome:

- Passed with no output during this investigation.

```powershell
npx eslint next.config.ts --quiet
```

Outcome:

- Passed.

```powershell
git diff --check -- next.config.ts
```

Outcome:

- Passed, with Windows line-ending warning only.

```powershell
npx tsx -e "(async()=>{ const mod = await import('./next.config.ts'); const cfg = mod.default; const redirects = await cfg.redirects(); const sources = redirects.map((r:any)=>r.source); const missing = ['/pricing','/waitlist','/contact-sales','/products/meditron','/ics25/register'].filter((s)=>!sources.includes(s)); console.log({ redirectCount: redirects.length, missing }); })()"
```

Outcome:

- Passed.
- Reported `redirectCount: 27` and `missing: []`.

Note:

- An earlier `tsx -e` attempt with top-level await failed because CJS eval does not support top-level await. The async wrapper version above passed.

## Suggested Claude Starting Checklist

1. Re-read this handoff.
2. Re-read `next.config.ts`.
3. Run `git diff -- next.config.ts`.
4. Confirm no unrelated files are touched for Phase 1.
5. Decide with the user whether to deploy redirects first or combine with Phase 2.
6. If doing Phase 2, create before measurements before editing chunking.
7. Do not start provider surgery until Phase 2 proves the chunking hypothesis.

## Suggested Claude First Message

Use something like:

```text
I have the handoff. Phase 1 redirects are already in next.config.ts locally; I will first verify that diff and either deploy/verify those redirects or run the narrow Phase 2 chunking experiment, depending on what you want. I will not remove providers or animations blindly because site-navbar uses Clerk and contact/footer use React Query.
```

## Risks And Non-Negotiables

- Do not redirect `/dashboard` at the config level.
- Do not delete old routes as an SEO fix. Redirect them.
- Do not remove Clerk globally without handling navbar auth.
- Do not remove React Query globally without handling contact/footer forms.
- Do not remove `framer-motion` wholesale to chase a metric.
- Do not worsen CLS with lazy-loaded sections.
- Do not claim LCP is fixed immediately after deploy; field data needs time.
- Do not claim repo-wide typecheck clean until existing baseline errors are resolved.
- Keep changes phased and under 5 files per phase.

## Success Definition

SEO success:

- Old public 404 paths become permanent redirects.
- No old URLs appear in sitemap.
- SEO tool broken-page report drops after recrawl.
- High-value broken backlinks now land on live pages.

Performance success:

- Public routes no longer load oversized shared vendor chunks.
- LCP improves in lab checks immediately and in Vercel field data after enough traffic/time.
- Public UI screenshots match or improve.
- Navbar, forms, FAQ, showcase, products, and signup still function.

UI/UX success:

- The site still feels premium.
- First viewport renders fast.
- Motion is tasteful and not blocking critical paint.
- Interactions remain intact on desktop and mobile.

