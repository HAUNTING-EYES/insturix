# D-017 — Dissolve the MG graphicType Preset Menu

Tags: #decided (the problem) #open (the how + the look-good risk)
Date: 2026-05-31 — user-confirmed ("good you do get it")

## Decision
MG selection must NOT pick from a fixed `graphicType` enum (keyword-highlight, stat-counter, callout, quote-card, lower-third, logo-reveal). That enum is a PRESET MENU and contradicts the Phase-G thesis ("it never SELECTS from presets") and Rule 11 / 29N.

## The precise boundary (verified this session)
- **Render engine = already generative (KEEP):** `planComposition` + `analyzeContentShape` (content duck-typing) + the structural-move vocabulary + signal-driven choreography build each graphic from primitives. The old `kindMap`/`buildShapeFromKind` preset switch was already removed (Tier-3).
- **Selection layer = preset menu (REMOVE):** the LLM picks `graphicType` from `z.enum([...])` (`unified-edit-intelligence.ts:420` GraphicIntentSchema; `tools.ts:4486`). `keyword-highlight` is ALSO the catch-all default (`edl-executor.ts:1027`, `tools.ts:167`) → everything collapses into it (measured 8/13 keyword on proj_OzG2qgoYudFa).

## Target architecture
Per moment: (1) **signals decide IF** a graphic appears (can legitimately be zero); (2) the **CONTENT there** (number / name / key phrase, from the transcript) drives the shape via the existing content-shape analysis; (3) the **engine GENERATES** the treatment from shape × signals × brand. No type enum — the "type" EMERGES. Legitimate vs preset: content *kinds* (numeric/identity/emphasis) are DERIVED from content, fine; the preset is the *enum you pick from*.

## Reframes G-7
G-7 changes from "calibrate keyword firing" → "DISSOLVE the type menu." The deferred G-7a prompt-eval (teach the LLM to pick keywords better) was tuning INSIDE the preset paradigm — superseded by this.

## Candidate HOW (user's idea — OPEN, being investigated)
Reuse the existing OVERLAY-as-SIGNALS infra: every overlay/treatment is described BY the signals that warrant it; the video's per-moment signals are scored against overlay definitions (`scoreAllOverlays`, utility-scorer) to select/shape the right treatment — no LLM type-pick. The MG-property overlays already do this for visual *properties*; the move is to extend it to the graphic-appearance decision itself. Connection mechanism being read from code. Calibration = explicitly a LATER thing.

## THE OPEN RISK (the real question the user raised)
Will signal-generated MGs actually LOOK GOOD, or a "dirty mashup"? Signals are NOT what make it look good — naive free-choice generation looks worse than the menu. Resolution hinges on: (1) a COHERENCE layer = one visual language per moment so elements don't clash (the spine); (2) design GUARDRAILS = auto-reject/correct low-contrast, clutter, off-safe-zone (structural-gate + crg-constraint-validator already partial); (3) RESTRAINT = one focal, few supports, signals set intensity not chaos; (4) calibration. MUST be designed + proven on real renders before committing.

## This session
Shipped type-AGNOSTIC infra that stands regardless: G-1 (fit), G-2 (brand→render), G-1b (exact measure). See [[Session-2026-05-31-G1-Render-Verified]], [[MG-Generative-Spine-Phase-G]].
