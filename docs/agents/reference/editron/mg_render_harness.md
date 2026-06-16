---
name: mg-render-harness
description: "How to render any project's motion graphics to real PNG pixels via the REAL renderer (MG verification infra, built G-1)"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 21697ecc-4b7d-412d-9a77-816727f4b599
---

Reusable infra to SEE motion-graphics pixels (built 2026-05-31 for G-1, commit 404a8e38). Renders the **real** `MotionGraphicLayerContent` (no replica), so fit/break/brand/color actually execute. Use for EVERY MG phase (G-2 brand, G-3 color, …) — verify on real pixels, never the 112-test suite (it injects mgScores and masks render bugs).

Run from `editron-worktree` (all scripts UNTRACKED — they read `.env.local`, hold no secret in git):
1. `npx tsx scripts/dump-proj-mgs.ts <projectId>` → `.calibration-temp/<pid>-mgs.json` (Mongo `editron_prev.projects`, filter `overlays` `type==='motion-graphic'`).
2. `npx tsx scripts/render-mg-stills.ts <pid | file.json>` → PNGs in `.calibration-temp/mg-stills/<tag>/`. Bundles `scripts/mg-still/index.ts` (minimal `<Composition>` → `MotionGraphicLayerContent` over dark bg + 5% title-safe guide), `renderStill` at 0.6 hold-frame, captures `[MG-Render]`/`[MG-Fit]` browser logs.
3. `npx tsx scripts/adversarial-mg.ts` then render `adversarial-mgs.json` — 10 hard text cases (long/caps/CJK-no-space/hyphen/emoji/9:16/wide-glyph).

GOTCHAS (each cost time):
- Remotion bundler does NOT read tsconfig `@/*` → must map `'@'`→`process.cwd()` in `webpackOverride.resolve.alias`.
- `webpackOverride` must set `@remotion/compositor-*` fallbacks `false` (esp `win32-x64-msvc`) or the Windows bundle fails.
- Fonts NOT loaded in the render path → Chromium default. Judge layout/size/overflow, not typeface (the fit estimator is font-independent, so the overflow verdict is valid). Add `@remotion/google-fonts` `loadFont()` for faithful type.
- `scripts/render-mg-real.ts` is a **DECOY**: replicates `resolveLayout` + calls `buildTextStyle(c, NEUTRAL)` with 2 args → bypasses the G-1 `fittedSizePx` → shows OLD broken output. Do not trust its HTML.
- `proj_OzG2qgoYudFa` is NOT in `real-recipes.json` → dump from Mongo.

Full session record + findings: vault `D:\Insturix-Brain\04-Session-Notes\Session-2026-05-31-G1-Render-Verified.md`. [[feedback_use_obsidian]]
