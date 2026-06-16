# Session Handover — 2026-06-01 — MG Generative Pivot (presets → everything-emergent)

> Memory mirror. FULL doc: `D:\Insturix-Brain\04-Session-Notes\Session-2026-06-01-MG-Generative-Pivot-HANDOVER.md` (read it next session). This is the condensed version.

## The ONE idea — LAW vs TASTE (internalize or you'll rebuild presets)
A thing is a **preset** if it freezes a **TASTE** (one of several aesthetically-valid looks: "stack it vertical", "after is gold", "label = 0.3× value"). It is **NOT** a preset if it encodes a **LAW** (content-invariant + domain-true, picks nothing aesthetic: "a comparison needs two comparable values", "bigger reads as more important", "<36px is unreadable"). **"Hardcoded = preset" is incoherent** (text/shape/curves/lerp are all hardcoded → infinite regress). **The test for every line: FACT to keep, or frozen CHOICE to make scored?** Laws stay; tastes become scored overlays the engine picks from signals. Necessary AND sufficient: the *structure/layout* must be scored, not just the *look* (signal-driven paint on a frozen skeleton is STILL a preset — that's what composeComparison was, founder caught it 3×).

## Architecture (settled): content → FACTS, signals → SCORE every CHOICE, engine ASSEMBLES
Content duck-typed → ContentShape (the fact). Signals score every choice (form, layout, placement, emphasis, connector, size, colour, motion) via the ONE existing utility-scorer (`scoreAllOverlays`→`evaluateCurve`→`min+score*(max-min)`; same mechanism as zoom/transition). `planComposition` assembles from primitives. Adding an emergent choice ≈ 4 files (overlay-def + planner read via `mgWinner`/`mgVal` + renderer honor + verify script). **No new engine.**

## Shipped this session (4 commits, pushed to origin, branch `infrastructure-improvs-+Editron`)
- `e46569d2` Phase 0.1 — MG font loading wired (the #1 blocker; render path loaded ZERO fonts).
- `cca42eb1` Phase E — design gate observe-mode (font-floor + focal-hierarchy checks, logs not acts).
- `d2ad8729` — wired dormant `mg.typography.font_weight` dial (boldness from the curve, not the lerp).
- `717a499f` — **comparison form** (first non-text MG, from `text` primitives, Rule 11) + **signal-scored LAYOUT** (`mg.arrangement.horizontal`/`vertical` — same "12% → 47%" content renders horizontal on energetic signals, vertical on formal. RENDER-PROVEN. First composition decision made emergent).

## What's EMERGENT vs STILL-FROZEN (frozen list = the to-do)
EMERGENT now: layout direction [NEW], position (center_avoidance), structural-moves, type size/lh/tracking/case, font-weight [NEW], entrance. STILL FROZEN (each → make scored, same pattern): (1) size-RATIOS (×0.5/×0.3 → emphasis dial, highest-leverage next), (2) colour→role assignment (to=accent hardcoded), (3) connector-TYPE, (4) split-arrangement (only h/v exist), (5) font-FAMILY (fixed string → variable-axes, needs a load-path RETHINK), (6) all curve PARAMS = INVENTED (calibration-pending). (7) the form-SELECTION (which MG) — designed+proven on proto, NOT wired, and the live path is BROKEN.

## OPEN BUGS (verified — fix before trusting form selection)
- **`director-agent.ts:857`** `selectWinners(results, frame)` = 2-arg call, needs 3 → throws → **swallowed by catch :876** → live utility graphic path DEAD + hidden.
- **`director-agent.ts:872`** discards the scorer's graphic winners anyway.
- Swallowed-error anti-pattern (:876, edl-executor:1156) hid bug #1 → add fail-loud-in-dev.
- T1 false-stat: stat fires on coincidental numbers ("2 cats 3 dogs" 0.24) → needs claim_strength/register gate.
- 3 P0 non-MG bugs spawned as tasks: unguarded JSON.parse ×6 (five-track-analysis), getCleanImageUrl strips GCS signed-URL token (video-generation-service:89), fal Promise.race no-cancel+no-circuit-breaker.
- caption 48-vs-72 graph self-contradiction (fix part-6-constants). Dead code: aesthetic-gate (safe delete), crg-constraint-validator (prod-dead but TEST-referenced by verify-composition-engine.ts:135 — DON'T blind-delete; it's the Phase-E enforce blueprint).

## The 5% problem + reviews
Engine ~40-60% built, output ~5% (text-on-card). Root cause UPSTREAM not renderer: funnel strips to {text} + dormant dials + unwired selection + missing composers + no extraction. 4-lens review (CEO/eng/director/editor) = unanimous REVISE: 3 missing layers — **WARRANT** (worth-a-graphic ≠ possible: register/claim_strength/scarcity/budget), **TIMING/PLACEMENT** (word-anchor/caption-collision/exit/rhythm — ~50% of craft, ~0% of plan), **WHOLE-FILM** (arc/budget/through-line/morph/choreography-to-meaning) + OVERRIDE first-class. Form-selection = forms-as-scored-overlays (AFFORDANCE hard-gate × FIT curves; can lose, can be nothing); EXTRACTION (LLM as content-STRUCTURE reader, never picks form) is the frontier + the risk (build Rule-35 eval + adversarial corpus FIRST).

## NEXT (my recommendation, in order)
1. Keep down the frozen-list: emphasis-as-a-dial (kills size-ratio preset) → colour-role scored → split arrangement. Visible, low-risk, the "everything emergent" march.
2. THEN fix broken form path (bugs above) before extraction.
3. THEN extraction eval harness (Rule 35) before wiring.
Calibration once infra sorted (founder). Variable-fonts = separate spike, don't block.

## Founder decisions / footguns
- NO PRESETS, everything emergent (north star). DON'T font-match from a library. Calibration is the answer to "uncalibrated looks worse" (reference-video pipeline, no users needed) — deferred, ship INVENTED params now.
- NEVER `git add -A`/`scripts/` (Mongo URI) — explicit paths only. `origin` only, NEVER `haunting`.
- Verify on REAL renders (`scripts/render-mg-stills.ts <set>` → read PNG inline); the 112-test suite injects scores + masks render bugs. `render-mg-real.ts` = decoy.
- Founder catches every preset; wants the MECHANISM right over a pretty demo; values brutal honesty; wants CEO/eng/director/editor review on big plans.

Docs: [[MG-Master-Plan-v3]] (plan+v4 review), [[MG-Form-Selection-Architecture]], [[MG-Capability-Map]], [[Doc-vs-Code-Reconciliation-2026-05-31]], [[D-017-MG-Dissolve-Type-Preset-Menu]], [[MG-Colour-Engine]].
