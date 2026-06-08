---
name: session-handover-2026-05-31-mg-spine-pivot
description: Canonical handover for the MG architecture pivot (dissolve type-preset menu) + colour engine. Read FIRST next session.
metadata: 
  node_type: memory
  type: project
  originSessionId: 21697ecc-4b7d-412d-9a77-816727f4b599
---

# Handover 2026-05-31 — MG Spine Pivot + Colour Engine

**FULL doc (read this first):** `D:\Insturix-Brain\04-Session-Notes\Session-2026-05-31-MG-Spine-Pivot-HANDOVER.md`. This file is the memory mirror — the must-knows + pointers. Supersedes [[session_handover_2026_05_31_mg_g1_brushwork]] (that was the kickoff; this is where the arc landed).

## The 5 must-knows
1. **PIVOT: dissolved the graphic-TYPE preset menu** (D-017). Old = LLM picks type from `z.enum` menu → 8/13 graphics collapsed to keyword-highlight on proj_OzG2qgoYudFa (the monotony the founder flagged). New = LLM only READS content → signals gate IF → spine resolves ONE look → utility-scorer selects treatments → engine GENERATES → type EMERGES. Connection mechanism = the EXISTING `utility-scorer` (overlays declare signal `considerations`; already runs for zoom/transition/filter/mg-property). Move = define graphic-appearance overlays + route through scorer. NO new engine.
2. **3 commits, render-verified, UNPUSHED:** `404a8e38` G-1 text-fit · `d9fe9485` G-2 brand→render · `42a01786` G-1b exact canvas measure. Branch `infrastructure-improvs-+Editron`, worktree `editron-worktree\`, 3 ahead of origin.
3. **#1 BLOCKER (verified): MG render path loads ZERO fonts** — no `loadFont`/`@remotion/google-fonts` anywhere in `lib/editron/motion-graphics`. All type/brand-soul work is INERT until Phase 0.1 wires it (Lambda-safe). Any "looks coherent" judgement before this measures Chromium default.
4. **Plan reviewed by 4 lenses (CEO/eng/editor/director) → REVISED.** Verdict: architecture right, sequencing/scope/framing wrong. Convergent: (a) ship DESIGN GATE first — floor before ceiling; (b) verify MOTION not stills (harness renders stills only — extend to MP4/GIF); (c) coherence≠character → registers + 4-channel brand wire (font+motion+accent+density); (d) Phase C = ~5 paths not 2; (e) "calm→0 graphics for free" is FALSE (3 floors). Plan = [[MG-Spine-Build-Plan]] v2.
5. **Colour deep-dive: founder was RIGHT — colour carries mood, via SATURATION+BRIGHTNESS+TEMPERATURE, NOT hue.** Brand hue sovereign (Ehrenberg-Bass) + semantic fixed (red=loss/green=gain). Palette DERIVED from brand hex via OKLCH (not HSL — HSL caused the muddy bug; not a preset menu). Footage-aware WCAG legibility gate measures REAL background. "Red boosts X" = debunked myth. (I'd earlier overcorrected to "colour carries no mood" — WRONG, corrected.) Spec = [[MG-Colour-Engine]] (Valdez-Mehrabian, Wilms-Oberfeld physiology, Gao, Ottosson OKLCH).

## State: PROVEN on pixels + prototype; production wire NOT started. Next session = build from Phase 0.

## Phase sequence (each = 1 commit, verify as VIDEO): 0 (font-load HARD BLOCKER + caption 48v72) → E (gate observe→enforce) → B (spine, register-first, 7 dims) → C (dissolve menu, path-inventory-first, flagged) → D (extractor + narrative role, metric=PRECISION) → F (calibrate, reconcile zero-graphics floors) → G (override + per-brand Graphiti learning). v0 = 0+E+B (3 proven shapes), defer C/D/G behind flag until v0-as-VIDEO beats preset on buyer test (≥16/20 on-brand, ZERO template-stock, two brands differ in typeface AND motion AND colour).

## How to SEE output (the harness — your eyes)
- `scripts/render-mg-stills.ts` = the good path (Remotion SSR; webpack override must map `@`→cwd + disable `@remotion/compositor-*`). PNGs → `editron-worktree\.calibration-temp\mg-stills\{proj_OzG2qgoYudFa,adversarial,brands,spine-proto}\`.
- ⚠️ `render-mg-real.ts` is a DECOY (2-arg buildTextStyle, no fittedSizePx → old broken output). Avoid.
- ⚠️ 112-test suite INJECTS mgScores → masks render bugs. Verify on REAL renders only.
- See [[mg_render_harness]].

## Footguns
- **NEVER `git add -A`/`git add scripts/`** — harness scripts hold a Mongo URI. Add real source by explicit path.
- U+00A0 nbsp breaks exact-match edits (grep exact bytes).
- DEFAULT_BRAND gold = `motion-theme-resolver.ts:133-140`; fires when brand absent.
- Brand wire lands at `edl-executor.ts:1128` (resolveMotionTokens reads decision.params.brand).
- DON'T re-fix the signal pipeline — it works (8017a70a); the MENU was the monotony, not signals.
- Don't edit during a verify sprint (a prior session broke prod: `'800'` missing Go duration unit → HTTP 400).

## Open issues: font-load (HARD); caption 48v72 (3 nodes); zero-graphics 3 floors (creative-brief.ts:899 forces max≥1, Path D no zero, intent-translator injects ≥1); 5 type-menu paths (Path E creative-brief ACTIVE / Path D overlay-bridge only has 2 of 6 resolvers / GraphicIntentSchema.type / tools.ts:4486 / legacy) = 163 occ / 19 files; exit_speed 0.8 = learning-target; stagger curve must be invented.

## Docs this session: D-017, [[MG-Visual-Language-Spine-Redesign]], [[MG-Spine-Build-Plan]] (v2), [[MG-Material-Libraries]] (67 fonts + mg-material-library.json), [[MG-Colour-Engine]], Session-2026-05-31-G1-Render-Verified, + this handover. Memory: [[mg_render_harness]], [[mg_no_preset_menu]].
