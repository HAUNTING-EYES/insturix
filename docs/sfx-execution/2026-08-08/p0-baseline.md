# SFX P0 Baseline — 2026-08-08

Session G0. Audit-first, read-only. No code changed.

## 1. Baseline identity

- Branch: `infrastructure-improvs-+Editron`
- HEAD: `ea19f3488e73830f48e8c819465e302c9ea885c1`
- Working tree: dirty with UNRELATED pre-existing modifications (assist-lane, billing from-batch, client-reel-export, robots/sitemap, saas-benchmark). None touch owned SFX paths.
- Manifest: `public/sfx/manifest.json` — `sfx-catalog-v1`, generated 2026-08-01, **49 entries**.

## 2. Manifest inventory (from the file, reconciled)

- **Roles**: tick 17, foley 8, ambience 7, whoosh 5, pop 4, logo-sting 3, impact 3, shimmer 2. **multi-role entries: 0.**
- **Surfaces**: motion-graphic 42, ui 21, caption 21, scene 18, transition 10, chapter 10, logo 5.
- **direction**: 49/49 neutral (no directional audio). **motionSpeed**: fast 29, medium 13, still 7. **material**: recorded 21, physical 11, environmental 7, air 5, musical 3, tonal 2.
- **layerRole**: oneshot 36, bed 7, sting 3, impact 3.
- **semanticEvidence**: 49/49 present (CLAP, in-manifest).
- **rights**: 49/49 `library` / `attested` / `licensed:true`, all `freesound` `cc0-1.0`. Clean.
- **qualityPolicy**: minimumSelectionScore 0.6, silenceFloorLufs −60, maxTruePeak −1 dBTP, minSampleRate 44100, channels [1,2], blockedTags [vocal,speech,music,meme,noisy,comedic,distorted,clipping].

Artifacts: `.calibration-temp/sfx-p0/p0-2026-08-08/manifest-inventory.json`, `coverage-matrix.json`.

## 3. Semantic retrieval is DISABLED (confirmed)

- `SFX_SEMANTIC_RETRIEVAL_URL`, `SFX_SEMANTIC_RETRIEVAL_TOKEN`, `SFX_SEMANTIC_MODAL_PROXY_TOKEN_ID`, `SFX_SEMANTIC_MODAL_PROXY_TOKEN_SECRET` — **absent** from `.env.local`, `.env.local.prod`, `.env.local.vercel`, `.env.preview`, `.env.local.bak`, and process env. Matches ledger §4.7 fail decision.

## 4. Caller map — every SFX producer is audited

| Producer | Path | Via | Audited |
|---|---|---|---|
| Auto-Edit / Director | `lib/editron/services/edl-executor.ts` (2 sites) | `resolveDecisionAtomicSfxForm` → `searchAndDownloadSFX(form)` | ✅ |
| MG landing | `lib/editron/services/kinetic-sfx-service.ts` | `searchAndDownloadSFX` | ✅ |
| Chat | `lib/editron/agent/tools.ts` (5630, 5809) + `generateSFX` (5652) | library + generation | ✅ |
| Storyboard | `finalize/route.ts`, `pipeline/audio/route.ts` | `generateSFXForScenes` → `searchAndDownloadSFX` | ✅ |
| API | `transitions/suggest-sfx`, `storyboard/[id]/prefetch-sfx` | `searchAndDownloadSFX` | ✅ |

All catalog selection funnels through `lib/pipeline/sfx-catalog.ts::selectSfxCatalogEntry` (deterministic 49-manifest) and `sfx-library-service.ts::searchAndDownloadSFX`, with `sfx-form.ts` owning place/silence/timing/mix. Direct `type:'sound'` creation sites elsewhere are **voiceover (ROW.VOICEOVER)** or **BGM (ROW.BGM)** — out of SFX scope. **No hidden SFX render-audio producer found.**

Artifact: `.calibration-temp/sfx-p0/p0-2026-08-08/caller-map.json`.

## 5. Focused tests (clean cache run)

- Core SFX suite: 9 files, **74/74 pass** (sfx-form, sfx-library-service, provider-outage, render-canary, render-mix, edl-atomic-sfx-form, native-video-audio-rights, catalog-publish, catalog-curation).
- Canary + rights routes: 3 files, **12/12 pass** (uploaded-sfx-render-canary, sfx-library-route, uploaded-export-audio-rights x2).
- `npx tsc --noEmit`: 10 errors, **0 in owned SFX paths**. Pre-existing/unrelated: `lib/services/email/providers/ses-provider.ts` (missing `@aws-sdk/client-sesv2`) and stale `.next/types` generated route types (music/sfx-library search|ingest) — repo-wide tsc is pre-existingly broken per AGENTS.md; not G0-owned.

Artifact: `.calibration-temp/sfx-p0/p0-2026-08-08/test-receipt.json`.

## 6. P0 stop/go — GO

- Baseline reproducible ✅
- Semantic confirmed disabled ✅
- Focused tests green (74/74 + 12/12) with every pre-existing failure documented ✅
- No hidden SFX caller remains unaudited ✅
- No rights failures observed ✅
- Manifest reconciles with receipts (49 entries, single source) ✅

**GO: proceed to S1 (evidence plumbing) and S6-A (review metadata hardening) in parallel. No S3/S4/S5 behavior introduced.**

## 7. S1 evidence baseline (pre-change)

`selectSfxCatalogEntry` request today carries `{ query, maxDurationSec, form, semanticSimilarityByAssetId }`. It does **not** yet receive explicit `surface`, `direction`, `motionSpeed`, `material` from callers — these are the S1 additions. Future baseline selection report for all S2 seed cases to be generated before S1 code changes.
