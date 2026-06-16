# Session 2026-05-31 — Phase E: Design Gate (OBSERVE-mode) shipped

Phase E of [[MG-Spine-Build-Plan]] — the trust floor, observe-mode first. Commit `cca42eb1` (pushed, origin). #decided

## What shipped (1 file, observe-only, ZERO output change)
`lib/editron/motion-graphics/engine/structural-gate.ts` — the ONLY live MG gate (called observe-only at `edl-executor.ts:1169`; `pass` is logged, never acted on). Added:
- **Per-role CRG font floors** (counter 64 / primary 48 / secondary 36 / label 36, else general 72) from `constraint:overlay.graphic_too_small` + per-role constants — replaces the weak `<24px`-only check. This is the dead `crg-constraint-validator`'s job, now live as an observe check (the validator stays dead; harvested its constants).
- **Focal hierarchy** — flag 2+ hero-role (primary/counter) text elements = no single focal point (Director GAP4: gate VALIDATES hierarchy, spine AUTHORS it).
- **Structured `[MG-Gate] WOULD-SUPPRESS` log** (dims + score) for offline observe sweeps.
- **Title-safe deliberately NOT added at plan-time** — the recipe has no pixel bounds at gate time; title-safe is already enforced by the layout's 5% insets (`composition-renderer resolveLayout`) + G-1's render-time fit. A plan-time heuristic would be redundant + FP-prone. Documented in the header.

## Verification (REAL recipes + self-test, not the 112-suite)
Harness `scripts/eval-mg-gate.ts` (UNTRACKED):
- **Self-test — all 4 checks FIRE** on known-bad recipes: tiny-font→readability(80), below-floor(primary 40<48)→readability(92), two-heroes→hierarchy(88), low-contrast→contrast(70). Proves the checks aren't silent no-ops (the failure paths the real recipes don't exercise).
- **Sweep — 0/36 would-suppress (0% false-positive)** across proj_OzG2qgoYudFa (13) + adversarial (10) + brands (5) + spine-proto (8). The real `composed-emphasis` recipes are pristine on these structural checks (one big `primary` ≈145px, white-on-dark ~20:1, ≤2 foreground).
- tsc +0 over the 196 baseline; eslint clean.

## Observe findings (shape the enforce flip — NOT done yet)
1. **Threshold 60 is lenient** — a SINGLE issue scores 70–92 (above 60), so it wouldn't suppress. The issue-DETECTION is the signal, not pass/fail. → **enforce-mode should AUTO-CORRECT per-issue** (bump font to floor, like the old validator) **rather than binary-suppress the whole graphic.**
2. **brightness-match is DEAD in prod** — `edl-executor.ts:1169` calls the gate with NO `frameContext`, so check #4 never fires. The real legibility risk (text over BRIGHT footage) is invisible to this gate. → **footage-aware contrast (text vs MEASURED background) is genuinely Phase B** (needs the measured frame luminance passed in).
3. Real recipes don't exercise the failure paths — the gate's value will show on the richer multi-element / branded-color recipes Phase B/C generate.

## Caption floor decision (folded-in 0.2)
Captions and graphics are different overlay types: **caption/subtitle floor = 48px** (BBC/Facebook industry, `constant:caption.min_font_size`); **graphic text floor = 72px general + per-role** (`graphic_too_small`). The MG gate validates graphics → uses the graphic floors; captions are a separate path. **Open data bug:** the graph self-contradicts — `constant:typography.captions_min_font`=72 vs `constant:caption.min_font_size`=48, with an edge (graph:23564) falsely claiming "same value." Fix in `creative-graph-parts/part-6-constants` + re-merge (align captions_min_font→48). Small follow-up, separate from the gate.

## Next
- **Enforce flip** (later): per-issue auto-correct, gated on the clean observe data (now 0% FP) + a calibrated threshold; verify on richer recipes.
- **Phase B** (the spine: register-first font-pair + OKLCH palette) — add the footage-aware contrast gate (the measured-background check) HERE, since the gate has nowhere to measure it yet.
- Graph part-file caption-floor fix.

See [[MG-Spine-Build-Plan]], [[Doc-vs-Code-Reconciliation-2026-05-31]], [[Session-2026-05-31-Phase0.1-Fonts-Render-Verified]].
