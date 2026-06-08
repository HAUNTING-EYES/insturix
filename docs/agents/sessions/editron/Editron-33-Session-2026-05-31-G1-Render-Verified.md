# Session 2026-05-31 — G-1 Render-Verified & Committed

**Status:** G-1 (brushwork: text fit-to-box + no mid-word break) **DONE** — render-verified on real pixels, adversarial-passed, committed. #decided

## Commit
- `404a8e38` on `infrastructure-improvs-+Editron`, 2 files `+162/-40` (`composition-renderer.tsx`, `primitive-renderers.ts`). tsc **196 = baseline (+0)**, eslint clean. Not pushed.
- What it does: `fitFontSize()` (longest word fits boxWidth×0.9, multi-word wraps at spaces, fail-loud `[MG-Fit]` warn instead of silent overflow, conservative estimator behind `estimateTextWidth()` for a clean G-1b measureText swap); `computeFittedSize()` caps focal size to a frame-height fraction by role (FOCAL_FRAC) + threads `boxWidthPx`/`canvasHeight`; `SplitTextElement` root fix (split into words, each word `white-space:nowrap` so it can't break mid-glyph); `resolveLayout` corner insets 4%→5% (title-safe, SMPTE ST 2046-1).

## HOW it was verified — the new reusable render harness (untracked scripts in editron-worktree)
The FIRST time MG pixels were actually rendered (prior sessions only code-checked). Renders the **real** `MotionGraphicLayerContent` (no replica) via Remotion `bundle()`+`renderStill`:
1. `scripts/dump-proj-mgs.ts <pid>` → `.calibration-temp/<pid>-mgs.json` (Mongo `editron_prev.projects`, `overlays` filter `type==='motion-graphic'`; reads `MONGODB_URI` from `.env.local`, no hardcoded secret).
2. `scripts/mg-still/{root.tsx,index.ts}` — minimal `<Composition>` rendering `MotionGraphicLayerContent` over dark bg + 5% title-safe guide.
3. `scripts/render-mg-stills.ts <pid|file.json>` — bundle + per-overlay `renderStill` at 0.6 hold-frame; captures browser logs (`[MG-Render]` blank / `[MG-Fit]` overflow).
4. `scripts/adversarial-mg.ts` — 10 hard cases across positions + 9:16.

**Gotchas (cost real time):** Remotion bundler does NOT read tsconfig `@/*` → map `'@'`→cwd in `webpackOverride.resolve.alias`. Must set `@remotion/compositor-*` fallbacks false (esp `win32-x64-msvc`). Fonts NOT loaded → Chromium default; judge layout/overflow not typeface (estimator is font-independent so overflow verdict is valid). **`scripts/render-mg-real.ts` is a DECOY** — replicates `resolveLayout` + calls `buildTextStyle(c, NEUTRAL)` with 2 args, bypassing the G-1 `fittedSizePx` → shows OLD broken output. `proj_OzG2qgoYudFa` is NOT in `real-recipes.json` → must dump from Mongo.

## Results
- **proj_OzG2qgoYudFa (13 MGs):** whole words, fitted, title-safe, 0 overflow, 0 blank renders. "SUPERHERO"/"D-BAG"/"INTERNET"/"EDITING" intact.
- **Adversarial 10/10:** long words, all-caps, CJK no-space, hyphen, emoji, 9:16 ×2, wide-glyph — no frame overflow, no mid-word break. CJK + 9:16 fit cleanly.

## Findings (documented, NOT G-1 scope — for later phases)
1. **WWW / wide-glyph card-spill (damage ~5, synthetic):** the INVENTED 0.66 caps ratio under-counts W/M (~1.0 em) → text spills its *card* (never the frame). → motivates **G-1b** `@remotion/layout-utils measureText`. For realistic text 0.66 over-estimates = safe.
2. **`$1,234,567` → "NaN":** TEST ARTIFACT — force-fed a `$`/comma value into a stat recipe planned for `0.02`, bypassing `planComposition` prefix/suffix split. Whether prod handles currency strings is **UNVERIFIED**. Stat-counter check, not G-1.
3. **Emoji = tofu** — no emoji font in render path (font-loading gap; fit/wrap correct).
4. **Corner card backdrop bleeds ~to frame edge** though the text block is at 5% title-safe — minor (card padding beyond the block), layout polish.
5. **Reconfirmed on real data:** 8/13 graphics are keyword-highlights (**G-7a over-firing**), all the identical gold-uppercase-card-underline treatment (**G-7 sameness**).

## Next (user-directed order)
- **G-7a** — stop keyword over-firing (signal-gated: not every word, not every video). Root cause already located: `signal-executor.ts:717` enforces only a type-agnostic 3s gap (no per-type/total cap); the real keyword cap (`DecisionBudget.KEYWORD_GRAPHIC_PER_30S:7`) is NOT used by Path D; ~4 fallbacks coerce graphics → keyword-highlight (`tools.ts:73,167`, `intent-translator.ts:187,238`).
- **G-2** — brand-wire bombshell (`decision.params.brand` never set → `DEFAULT_BRAND` gold 100%; `edl-executor.ts:1104/1376`, `director-agent.ts:1060-1083`).

## G-7a UPDATE — signal-gate REFUTED by measurement; DEFERRED (user chose to skip to G-2)
- ACTIVE Mode-2 path is **Path E (Creative Brief / Gemini LLM)**, NOT Path D (signal-executor) — proven by overlay `metadata.edlSource: "creative-brief:emphasis_word:word"` (built at `brief-executor.ts:232`). So keyword TYPE is the LLM's choice via the `<graphic_rules>` prompt (`creative-brief.ts:344-361`), not a signal mapping. Path D is only the fallback (`director-agent.ts:695`).
- MEASURED keyword-vs-signal on real data (`scripts/analyze-keyword-signals.ts` on proj_OzG2qgoYudFa): per-moment signals are FLAT per-video (enthusiasm 0.92, formality 0.40, pacing 0.63 — identical for all 13 MGs); the one that varies, `visual_significance`, is SPARSE (5/13) and INVERTED — everyday nouns score HIGHER (YouTube 0.72, comment 0.54) than punchy keepers (superhero 0.52, d-bag 0.29). **A `visual_significance` threshold would CUT the good keywords and KEEP the bad ones.** ⇒ a code-side signal gate is the WRONG fix. DO NOT build it.
- ROOT CAUSE = semantic word-selection by the LLM (Rule 30: language→LLM). 5 causes: (1) LLM picks everyday nouns despite the soft "don't default to keyword" rule (`creative-brief.ts:355-360`); (2) keyword-highlight has NO `maxPerVideo` cap (`decision-registry.ts:422-433` → absent from `MAX_PER_VIDEO_MAP`); (3) EDL keyword budget √-scaled too loose for long-form (`decision-budget.ts:381`); (4) `caption_emphasis`→keyword second tap, a KNOWN bandaid (`edl-executor.ts:458-471`); (5) no per-video zero (`graphic_density` blind to keywords + floors at 1: `genre-parameter-computer.ts:128`, `creative-brief.ts:899`).
- REAL FIX = Rule-35 prompt eval harness (narrow the keyword rule, score vs labeled ground truth) — a sub-project. Deterministic backstop = add keyword `maxPerVideo` (registry). Both DEFERRED. Measurement-first prevented shipping a wrong gate (Rule 29 working as intended).

## G-2 — brand-wire bombshell: DONE (commit `d9fe9485`, 2 files +76/-1)
ROOT: `decision.params.brand` never populated → `resolveMotionTokens(signals, brand||{})` (`edl-executor.ts:1104/1376`) → `{...DEFAULT_BRAND, ...{}}` → gold `#D4A652` 100%. Brand fetched only into the LLM prompt (`buildBrandContextBlock`), dropped before tokens. ACTIVE path = Path E (creative-brief); Path E & D load NO brand — only the legacy path did (into the prompt).
FIX:
- `brand-composition-rules.ts`: NEW `brandInputsFromUnifiedBrand()` — deterministic role mapper from the FLAT `UnifiedBrand.visual.colors` palette → `BrandInputs`. Accent = the most-saturated colour with **≥3:1 WCAG contrast** (SC 1.4.3) on the dark surface. Empty/all-illegible → `{}` → DEFAULT (fail-safe). Reuses `approximateLuminance` (no 4th luminance copy). Seed of the VisualLanguage spine.
- `edl-executor.ts`: resolve the brand ONCE in `executeEDL` (it has projectId/userId) → stamp `decision.params.brand` on graphic/caption-emphasis decisions — the single sink all four director paths reach. Non-fatal (try/catch → DEFAULT).
VERIFIED on real pixels (`scripts/verify-brand-wire.ts` + `render-mg-stills`): blue→blue, orange→orange, teal→teal; adversarial palettes (all-dark/empty/gray/3-digit) → legible colour or gold fallback. The adversarial render **CAUGHT an invisible near-black accent** (#1A1A2E, 2.9:1) — my first luminance floor (0.10) was wrong; replaced with WCAG 3:1 contrast. tsc 196=baseline (+0), eslint clean.
CAVEAT (remaining verification): the COLOUR LOGIC (mapper→resolve→render) is render-verified by injecting test brands. The `executeEDL` Mongo brand-load + full director→render pipeline was NOT run end-to-end (needs a real project with `brandId`+`visual.colors` — likely none exist pre-launch). The DB-load uses existing fns (`findOne` + `getUnifiedBrand`), tsc-verified only. To fully close: run a branded project through the pipeline.
NEXT (G-2.2/G-3): fonts (`UnifiedBrand.visual.typography` → `classifyFont`, which already exists) + full semantic palette roles (surface/neutral/emphasis/alarm) + surface-flip for all-dark brands. G-7a prompt-eval still deferred.

## G-1b — exact canvas measurement: DONE (commit `42a01786`, 2 files +28/-2)
Replaced the G-1 glyph-width ESTIMATOR (INVENTED 0.6/0.68 ratios — over-counts normal text, under-counts W/M) with the render's own canvas `measureText` (exact, sync, NO new dep; `@remotion/layout-utils` isn't installed). `fitFontSize` gains an optional `measure` param (browser canvas) → the estimator stays the Node/script fallback (backward-compatible). Verified by re-render: "WWWWWWWWWWWW" now fits INSIDE its card (was spilling onto bare bg); ENTREPRENEURSHIP 9:16 no longer warns (estimator was over-counting). Closes the one G-1 adversarial finding. tsc 196=baseline, eslint clean.

## Session tally (2026-05-31)
3 render-verified commits: `404a8e38` G-1 (fit + no mid-word break), `d9fe9485` G-2 (brand→render), `42a01786` G-1b (exact measure). Plus the reusable render harness (`scripts/dump-proj-mgs`, `mg-still/`, `render-mg-stills`, `adversarial-mg`, `verify-brand-wire`, `analyze-keyword-signals` — all untracked). Adversarial testing caught + fixed 2 real bugs pre-ship (wide-glyph card-spill → G-1b; invisible near-black brand accent → WCAG 3:1). REMAINING: G-2.2 fonts (needs render-path font loading + typography-string→font-name resolution); **G-3 color roles BLOCKED on a fresh-ingest signal-granularity run** (cinematic_moment absent on real data — needs the deployed ingestion stack, not local); G-7a prompt-eval sub-project.

See [[MG-Generative-Spine-Phase-G]].
