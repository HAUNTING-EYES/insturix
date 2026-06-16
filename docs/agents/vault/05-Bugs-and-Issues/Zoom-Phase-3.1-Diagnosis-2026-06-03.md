---
tags: [bug, motion, zoom, phase-3.1, signals, real-data, diagnosis]
date: 2026-06-03
status: SYMPTOM confirmed on real data; CAUSE = arithmetic-certain code defects (one latent inversion) + a cause-ranking that needs runtime signals
project: proj_OzG2qgoYudFa (editron_prev)
supersedes: the prior session's zoom claim (Session-2026-06-03-PM2 §7 — "I do not know zoom's real behavior")
---

# Zoom — Phase 3.1 Diagnosis (read-only investigation, real-data verified)

Plan: `07-Roadmap/MG-Signals-Robustness-Generative-Motion-Master-Plan-2026-06-03.md` (Phase 3.1).
Founder chose **Plan A (follow the plan in order)**, EYES-first for the eventual form work (Phase 4).

## SYMPTOM — CONFIRMED on real data (ground truth, not code-reading)
Read-only probe `scripts/probe-zoom-realdata.ts` (UNTRACKED) on proj_OzG2qgoYudFa:
- `intelligence.decisionLog` is **EMPTY (0 entries)** — decisions not persisted for this project.
- Rendered video-overlay `scale` keyframe tracks (what the viewer sees): **9 of 43 video overlays have a scale track; all 9 are zoom-IN** (1.000 → 1.05–1.15, mean 1.089). **0 pull-backs, 0 statics, 0 punches (nothing ≥1.2).** Sample: `1.000→1.060`, `1.000→1.100`, `1.000→1.150`, `1.000→1.120`.
- → The founder's "always zoom-ins" is now **measured**: 9/9 gentle pushes; no zoom-out, no dramatic punch.

## CODE DEFECTS — arithmetic-certain (independent of real data)
All file:line in `editron-worktree/lib/editron/`:
1. **Pull-back output range is INVERTED.** `utility-scorer.ts:24` `scaleTo = min + score*(max−min)`. The two pull-back overlays (`overlay-definitions.json:95-102` speech winding-down, `:1341-1348` cross-domain post-peak) output `min 0.95, max 1.0`. Worked example for `speech.zoom_pull_back` (single consideration on `speech.energy_delta`, logistic xShift −0.7, invert):
   - `energy_delta = −0.4` (strong winding-down) → score **0.95** → scaleTo **0.9976** (≈1.0, *no* pull-back).
   - `energy_delta = +0.1` (rising) → score **0.011** → scaleTo **0.9506** (max pull-back).
   - **Backwards**: it pulls back hardest when energy RISES, not when it falls. A confident pull-back produces no visible zoom-out.
2. **Direction inference erases it.** `edl-executor.ts:855` `zoomType = ... (scaleTo < scaleFrom(1.0) ? 'pull-back' : push/slow-push)`. An inverted pull-back lands ≈1.0 (not `<1.0`) → classified as a (tiny) push/slow-push = zoom-IN.
3. **Vocabulary + magnitude asymmetry.** 12 zoom overlays = **9 push/punch/in/drift (scaleTo ≥1.0)**, **2 weak pull-back (max −5%: 0.95)**, **1 reset (fixed 1.0)**. Push reaches **+30%** (punch 1.1→1.3); pull-back maxes at **−5%**. Even a working pull-back is far subtler than a push.
4. **Defaults + validator both bias IN.** Default `scaleTo = 1.1` (`edl-executor.ts:840`); the 5-Track validator downgrades off-peak zooms to `slow-push` capped at `1.05` (`:826`) — still a push.
5. **Refuted a stale doc claim.** `Utility-AI-Phase1-Quality-Issues` said `evaluateCurve` clamps negative `energy_delta` to 0. It does **not** — `response-curves.ts:53` clamps the curve *output*; the *input* passes through signed (`utility-scorer.ts:38`). So the inversion (#1), not clamping, is the suspect.

## CAUSE RANKING — honest, not overclaimed
Rendered evidence shows **zero near-1.0 tracks** (no statics, no 0.95–1.0). If pull-backs were *firing-but-inverting*, we'd expect ~1.0 tracks. We see none. → leans toward **pull-backs don't win/fire at all** (signal distribution / zoom-category competition / budget / 5-Track), rather than fire-but-invert. The inversion (#1) is a **real latent defect** but likely **secondary** until the wiring lets pull-backs win. Pinning the exact cause needs the runtime signal snapshot — see constraint.

## VERIFICATION CONSTRAINT — key for Phase 3.2
The zoom-driving signals (`speech.energy_delta`, `speech.energy_surprise`, `visual.motion_intensity`, `composite.cinematic_moment`, …) are **NOT persisted** on overlays. Persisted MG `content.signals` = personality globals + `visceral_impact` / `visual_change_rate` / `visual_significance` only; **`cinematic_moment` absent**. There is **no MG-style "recompose"** path for zoom (zoom comes from the live signal-executor/director run). So verifying a zoom fix on real data needs either:
- (i) a faithful **offline signal-snapshot reconstruction + re-score** (reuse the runtime signal builder; no project mutation), or
- (ii) a **live re-run on a COPY** project (mutates/costs an LLM run), or
- (iii) unit-prove the inversion/direction fixes + re-measure rendered tracks on the next natural pipeline run.

## NEXT (Phase 3.2 — pending founder approval, Phased-Execution gate)
Fix the structural defects (1–4) AND rewire zoom to per-moment signals that actually vary (motion/significance/post-peak, per the plan), so direction + magnitude track the moment and pull-backs can win + render visibly. DO NOT edit production code (overlay-definitions.json + edl-executor.ts = creative output → Evidence Blocks) until the verify approach is chosen.

Footgun: `scripts/probe-zoom-realdata.ts` is UNTRACKED (holds no secret, but lives in the Mongo-URI zone) — never `git add scripts/`.

---

## REAL-DATA REFRAME — the offline harness overturned the diagnosis (2026-06-04)

Built `scripts/probe-zoom-reconstruct.ts` (UNTRACKED, read-only): reconstructs the REAL per-frame signals for proj_OzG2qgoYudFa via the actual `buildSignalTimeline` (a pure fn) and scores the 12 zoom overlays at all 2,351 grid points. Findings:

- **`speech.energy_delta` is ALL ZEROS** across 2,351 points — derived from the 5-Track `energyCurve`, which is SKIPPED under Creative Brief (`director-agent.ts:222`). Every overlay reading `energy_delta` (line-3 push, line-75 pull-back) is BLIND in the live config. (Real signal-derivation gap, separate from the inversion.)
- Scored on real signals, the zoom overlays produce **mostly pull-backs + resets**: cross-domain pull-back WINS 1,384/2,338 (59%), entity.zoom_reset 595; winner scaleTo p50=1.000, min 0.97 — imperceptible. **NOT** zoom-ins.
- But the RENDERED output was 9/9 zoom-INs (1.05–1.15). **They don't match → the rendered zooms did NOT come from the zoom overlays.**

**Conclusion (corrects §6 and the map's §6):** the zoom overlays + their inversion live in the **utility-scorer / Path-D mechanism, GATED OFF** (`USE_UTILITY_LIVE`). **Path E (Creative Brief LLM) is the live producer** (`brief-executor.ts:229,278` emits zoom-type decisions). Drift-zoom only does ±3% alternating (`auto-post-processing.ts:199-208`), ≠ the rendered all-in 1.05–1.15. So **the live zoom monotony is an LLM-brief behavior, not an overlay-scoring behavior. Fixing the overlay inversion changes NOTHING live.**

**Discipline note:** 3rd real-data overturn of a code-read this session. The verify-first harness did its job — caught the wrong fix target BEFORE any edit.

**Corrected fix target (OPEN):** live zoom direction/magnitude is decided in Path E (brief LLM + applyZoom defaults / technique interpolation) — NOT yet fully traced. Real fix lives there (likely a Rule-35 prompt-eval task), not in `overlay-definitions.json`. The inversion (overlay-definitions.json:75,1309) + `energy_delta`-dead remain real but **DORMANT** bugs (hygiene only).

### CONFIRMED Path-E root cause (2026-06-04) — traced at the founder's chosen layer
Founder chose "trace + fix the live producer (Path E)." Trace result:
- **`brief-executor.ts:228-236`** builds the zoom decision `{type: TYPE_MAP[type]||'zoom', technique: type, params: {...params}}` — sets `technique`, spreads the brief's params, but does NOT translate the technique into a direction.
- **`edl-executor.ts` applyZoom (:839-855)**: direction/magnitude from `params.scaleFrom||1.0` + `params.scaleTo||1.1` + `params.zoomType || (scaleTo<scaleFrom?pull-back:push)`. **Never reads `decision.technique`.** So `zoom_pull_back` without explicit `params.scaleTo<1.0` → renders as a 1.1 zoom-IN.
- **`creative-brief.ts` prompt**: `zoom_pull_back` is in the BriefDecisionType enum (`:33`) but **absent from all guidance**. Prompt frames zoom as EMPHASIS/push/drift: `:309,461,597` ("zoom for … emphasis"), `:571` ("zoom_push on static shots"), `:572,583` ("zoom_drift … subtle movement"), `:582` ("zoom_push … Ken Burns"). The LLM is given no reason/instruction to ever pull back.

**ROOT CAUSE (live zoom-in monotony):** (1) PRIMARY = **prompt bias** — the brief LLM is taught zoom=emphasis/push/drift, pull_back orphaned → outputs all-in scaleTos (rendered 1.05–1.15 varied → LLM IS choosing them, all ≥1.0). Rule-35 prompt problem. (2) SECONDARY = **technique→params gap** — applyZoom ignores `technique`, defaults to 1.1 in. Dormant until #1 fixed.

**FIX PLAN (Rule 35 — eval harness FIRST):**
1. Build a zoom eval harness: run the Creative Brief on test inputs (replay proj segments), score the zoom DIRECTION distribution (in/out/static). Confirms the bias + is the before/after gauge.
2. Revise the prompt: add `zoom_pull_back` guidance (release tension — after a peak, establishing/wide shots, post-claim) + reframe so zoom isn't only "emphasis." Re-eval; ship only if direction diversifies without harming other decisions (adversarial test across content types — Rule 29).
3. Companion deterministic wiring fix: brief-executor translates `technique` → params.scaleTo/zoomType when the brief omits scaleTo. Regression test: technique=zoom_pull_back → scaleTo<1.0.
Do #1 before touching the prompt. Overlay inversion + energy_delta-dead stay out of scope (dormant Path-D).

### FIX LANDED — mechanism 3 corrected + harness finding (2026-06-04)
Rule-35 eval harness `scripts/probe-brief-zoom-eval.ts` (runs the REAL `generateCreativeBrief`, seeded) on proj_OzG2qgoYudFa: 27 decisions, 6 zooms = `zoom_push` 3, `zoom_punch` 2, **`zoom_pull_back` 1 (~17%)**, `zoom_drift` 0. → **Mechanism 1 (prompt orphans pull-back) is only PARTIAL** — the LLM DOES pick pull-back ~17%. Mechanism 3 was the decisive bug.

FIX: extracted the keyframe builder to a pure module `lib/editron/services/zoom-keyframes.ts` (`buildZoomKeyframes`) and corrected the pull-back branch: was `scaleTo→scaleFrom` (rendered 1.0→1.06 = zoom-IN), now `scaleFrom→scaleTo` (renders 1.06→1.0 = zoom-OUT), matching the DECISION_REGISTRY convention + the other branches. `edl-executor.ts` imports it; the inline switch is replaced by a call at `:900`. (Extraction was required because importing `edl-executor` in a unit test throws — `gcs-service.ts:11` needs GOOGLE_CLOUD_CREDENTIALS at import.)

VERIFIED: `tests/editron/zoom-keyframes.test.ts` 5/5 pass (pull-back out / push in / punch holds / invariant / fail-safe default); `tsc --noEmit` +0 (196=196, no errors in touched files). LEVEL: 2 (unit) + compiles. **Level-3 (live end-to-end render of a real pull-back) still owed** — needs a pipeline run.

EFFECT: the ~17% pull-backs the brief ALREADY emits will now render as real zoom-OUTs instead of inverting to zoom-ins → immediate zoom-direction diversity with no prompt change. OPTIONAL follow-up: mechanism-1 prompt tune to raise pull-back share (Rule-35: eval→revise→re-eval). NOT committed yet (changeset: zoom-keyframes.ts, zoom-keyframes.test.ts, edl-executor.ts).

RENDER-INSTRUCTION CONFIRMATION (2026-06-04, `scripts/verify-zoom-render.ts`): real registry params → applyZoom's real zoomType inference → fixed buildZoomKeyframes. zoom_pull_back (1.08→1.0) and (1.06→1.0) now produce scale tracks 1.08→1 and 1.06→1 = **OUT** (2/2); before the fix both were 1→1.08 / 1→1.06 = IN (0/2). pushes/punches = IN (unchanged). Confirms the render INSTRUCTION (the scale keyframe track); actual video pixels need the source clip (expired) + Remotion pipeline = Level-3-full still optional. Verification level: 2 (unit 5/5) + compile (+0 tsc) + render-instruction (real code path).
