---
name: session-phase0-1-fonts
description: "Phase 0.1 DONE — MG font loading wired + render-verified; how, and the overflow-bug discovery"
metadata: 
  node_type: memory
  type: project
  originSessionId: 024cf1ed-a7cf-4684-b03c-46c8321337c8
---

**Phase 0.1 of the MG spine build (the #1 blocker) is DONE and render-verified, 2026-05-31.** 2 files, uncommitted on `infrastructure-improvs-+Editron`.

The MG render path loaded ZERO fonts → everything rendered in Chromium default. Fix = NEW `lib/editron/motion-graphics/mg-fonts.ts` doing static top-level `@remotion/google-fonts` `loadFont` (Plus Jakarta Sans {300-800}, JetBrains Mono {400,700,800}, Inter {400,600,700}, subsets ['latin']) — copying the proven pattern in `components/.../overlays/text/text-layer-content.tsx`. Side-effect-imported by `motion-graphic-layer-content.tsx`, the single shared entry for harness (`scripts/mg-still/root.tsx`) + production (`core/layer-content.tsx:127`). 12 fetches < 20-warning threshold → Lambda-safe by bound. Static (module-eval) chosen over dynamic `getAvailableFonts` because it loads before frame 1 (no measurement race) and can't throw on a missing weight (which would cancelRender).

VERIFIED: tsc +0 over the 196 baseline, eslint clean, harness rendered proj_OzG2qgoYudFa 13/13 with zero errors; before/after PNGs show real fonts. No-font baseline saved at `.calibration-temp/mg-stills/proj_BEFORE-fonts/`.

**KEY DISCOVERY:** loading fonts ALSO fixed a real bug — G-1b's `measureText` (`composition-renderer.tsx:297`) was measuring the FALLBACK font, so text overflowed cards (the "When your sample isn't random" callout spilled off-frame; now wraps correctly). Every prior MG-stills "fits/looks coherent" judgement before this was measuring the WRONG pixels.

CAVEAT: Lambda render not directly tested — relies on text-overlay precedent (same mechanism runs on this Lambda) + bounded requests. Confirm on Lambda before GA.

NEXT: Phase 0.2 (caption 48-vs-72 reconcile) → harness MP4/GIF → Phase E (gate) → Phase B (spine). See [[session_handover_2026_05_31_mg_spine_pivot]], [[mg_render_harness]], [[mg_no_preset_menu]]. Full note: vault `Session-2026-05-31-Phase0.1-Fonts-Render-Verified.md`.
