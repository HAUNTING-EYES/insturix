---
tags: [session, handover, motion-graphics, calibration, architecture, deep-map, decided]
date: 2026-06-03
covers: 2026-06-02 → 2026-06-03
branch: infrastructure-improvs-+Editron
status: HANDOVER — read this FIRST next session
---

# ★ HANDOVER — MG Sprint (Stage 1 + 6-lens review + Calibration deep-map) — 2026-06-02→03

> **If you read ONE thing:** the MG "generative engine" today is **8 fixed composer templates** (`composition-planner.ts:238` `switch(primary.kind)`) with **43 signal-driven dials** that style *inside* those templates. The dials are LIVE and signal-driven, but they **cannot change the form** because the composer is chosen from content fields (`content-shape-analyzer.ts:14`, dial-blind). **The form is the production-level lever.** The curve + calibration infra IS the generative engine (not throwaway) — but it must drive a **generated form**, not the templates. Don't tune today's template-dials; their tuning won't transfer when the form is dissolved.

> **The mistake that cost this session:** I reviewed and re-decided repeatedly from **partial reads + fading memory** (context decay). The §4 architecture map below is what I should have had on minute 1. Read it before touching anything.

---

## 0. TL;DR — where we are, what's next

- **Shipped + pushed:** 3 commits (crash-fix, dead-theme delete, 90%-stat fix). Tree clean. Branch `infrastructure-improvs-+Editron`, origin = `Insturix/Front-End` (NEVER haunting).
- **Decided:** Build **B** = OPEN extraction + generative form (no menu), eval-first, hardened guardrails. Staged path approved (6 stages). Composers KEPT as fallback until the generator beats them.
- **The one realization to carry:** the generative engine = **form (assembler) + signal-driven curves + eval/calibration loop** — ONE body of work. Sequence: **form → curves driving it → calibration tuning them.** You calibrate something that exists, so the form (assembler) comes first.
- **Immediate next:** Stage 2 = the **EYES** (bimodal extraction: heard structure + seen visual/face/space), eval-first. In parallel/after: build a minimal real **assembler** for ONE structure end-to-end + the **eval harness** (render → structural-gate → score; deterministic; aesthetic-gate observe-only; human judge), render it, founder judges vs the baseline.
- **Do NOT:** wire the existing bandit/calibration to tune the current template-dials (wrong layer + can't reach production-level + the bandit literally can't tune curves today).

---

## 1. North Star + the B decision

**North star (founder's words):** signals don't SELECT which MG to use, they MAKE an MG from primitives, bounded by legibility LAWS — "anything as an MG." Priority = **footage editing (Mode 2), not AI video gen.**

**The "5% problem":** engine ~40-60% built, output ~5%. Baseline = thin, monotonous, corner-boxed graphics (8/13 a word in a box). Proven by real render this session (see §3 baseline).

**A vs B (DECIDED = B):**
- A = closed relation set (comparison/proportion/trend/negation). Production-capable but caps creativity = the menu the founder rejects.
- B = OPEN extraction (extract whatever structure the content expresses), measured incrementally on common relations first ("open system, growing test" — the extractor is open from day 1; only our *measurement* starts narrow because that's where we have answer-keys; maturity gradient, not a cap).
- **B is locked.** Guardrails (hardened, §7): JUDGE = laws-checklist + VLM-flag + human (NOT a VLM score); confidence gate = eval-measured/calibrated (NOT raw LLM confidence); eval with human ground-truth is mandatory (no auto-metric for "meaningful").

---

## 2. What shipped (commits — all pushed to origin/infrastructure-improvs-+Editron)

| Commit | What | Files | Verified |
|---|---|---|---|
| `5a819519` | fix latent `selectWinners` crash in Director utility path + fail-loud | `director-agent.ts` | tsc +0 (196 baseline), eslint clean. Behind `useUtilityLive` (OFF) → no live-output change |
| `b58ed3b6` | delete dead preset theme `minimal-tech.ts` (zero importers, grep-verified path+export) | `motion-graphics/themes/minimal-tech.ts` (+ stray untracked `.g1-diff.txt`) | tsc 196 unchanged |
| `a0af90ec` | count-up stat preserves a trailing `%` ("90%" was rendering "90") | `composition-renderer.tsx` (`CountUpText`) | **render-verified on real pixels**: 90% shows; 100,000 + 0.02 unchanged. tsc +0 |

Prior HEAD was `cb60b736`. **`aesthetic-gate.ts` was RESCUED from the delete list** — it's a built Gemini-Flash vision quality gate (the JUDGE seed), dormant but kept.

The `selectWinners` fix detail: the live call passed `frame` (a number) where a `recentDecisions: Map` was expected → `.get()` threw → swallowed by the catch (path reported "skipped"). Fix: maintain `recentDecisions` across grid points + correct 3-arg call + fail-loud in dev. **Note:** the `:872` merge in `director-agent.ts` still DISCARDS the scorer's graphic winners (keeps signal-executor graphics) — contradicts the `:831` comment ("REPLACE … graphic"). Left as a Stage-6 reconciliation decision. `utilityTotal` is a dead var in that block.

---

## 3. The baseline (the yardstick) — what current output actually looks like

Rendered the REAL persisted graphics of **proj_OzG2qgoYudFa** (editron_prev, 13 MGs) → PNGs (looked at the actual pixels):
- Composition: **8 keyword-highlight, 4 stat-counter, 1 callout.**
- Honest read: **thin** (~75% of frame empty, a box in one corner), **monotonous** (8/13 identical word-in-a-box), **low-contrast gray captions**, **cramped left-padding** on bottom-left stats. The "5% problem" made visible.
- Positive: no render crashes, no fit warnings, legible, gold-on-dark readable, "1/3" fraction renders correctly.
- This is the fixed "before" every Stage-2 change is measured against. PNGs: `.calibration-temp/mg-stills/proj_OzG2qgoYudFa/`.

---

## 4. ★★★ THE DEEP ARCHITECTURE MAP (the thing to have on minute 1) ★★★

*Verified at file:line by 4 deep parallel agent reads. This is ground truth.*

### 4a. Live MG generation flow (`edl-executor.ts` ~1129-1234, `useCompositionEngine`=true default at `editron-config.ts:499`)
```
decision.params.signals (rawSignals)
  → resolveMotionTokens(rawSignals, brand)            [motion-theme-resolver.ts:185, PURE, no Mongo]
  → mgScores computed INLINE [edl-executor.ts:1146-1172]:
       filter overlay-defs to category==='mg-property',
       split SELECTION_IDS (entrance/hold → multiplicative) vs property dials (additive),
       scoreAllOverlays → mgScores[id] = { score, values }
  → planComposition(content, tokens, rawSignals, mgScores)   [composition-planner.ts:81]
  → checkCompositionStructure(recipe, tokens)         [structural-gate, OBSERVE-ONLY @ :1194, logged not acted]
  → push motion-graphic overlay (recipe, resolvedTokens, content)
```
**mgScores IS LIVE** (computed inline; do NOT call it dormant). It just tunes properties *inside* the template the composer already chose.

### 4b. The form is chosen DIAL-BLIND → dials can't change it
- `analyzeContentShape` (`content-shape-analyzer.ts:14`) picks `primary.kind` from **content fields only** — `mgScores` is never passed to it.
- `composeElements` → `switch(primary.kind)` (`composition-planner.ts:238-262`) → one of **8 fixed composers**: `composeNumeric / composeIdentity / composeQuotation / composeEmphasis / composeBrand / composeStructured / composeDataSeries / composeComparison`. **This is the template library (Rule 11).** Dials parameterize whichever composer the content already selected. **No dial changes the form.**

### 4c. The 43 mg-property overlays (`overlay-definitions.json`) — the "curves"
- **43** overlays (not ~15), **~88 considerations**, **~176 practical tunable curve params** (slope/xShift/yShift/exponent per consideration).
- **13 continuous dials** (read by value via `mgVal`): `mg.typography.font_size` (36-160), `font_weight` (300-800), `letter_tracking`, `line_height`, `text_transform_tendency`, `mg.emphasis.scale_contrast` (1.4-2.2), `mg.layout.center_avoidance`, `mg.styling.container_opacity`/`corner_radius`/`surface_complexity`, `mg.color.saturation_boost`/`accent_usage`, `mg.animation.entrance_speed`.
- **30 discrete winners** (argmax of `.score` via `mgWinner`): 8 entrances, 4 holds, 4 particles, 2 masks, 10 structures, 2 arrangements.
- Output value = `min + totalScore*(max-min)` (single lerp from totalScore — NOT independently curve-driven). `resolveOutputValues` `utility-scorer.ts:13-28`.
- **Hardcoded INVENTED consumption-gates** (tuning a curve sees NO output change until it crosses these): structural top-K GATE 0.45, particle 0.15, mask 0.5, centerAvoidance 0.6, hold 0.15, PEER_SHAPES (horizontal arrangement only allowed for `comparison` kind). All in `composition-planner.ts`.
- `response-curves.ts`: 6 curve types (linear/polynomial/logistic/logit/normal/sine), `evaluateCurve` PURE + deterministic, clamp [0,1], NaN→0.5.

### 4d. The bandit (`threshold-bandit.ts`) — what it can/can't tune
- Thompson sampling, Normal-Normal conjugate. Tunes **scalar adjustments to ~35 `threshold-registry.ts` entries** — NOT curve params.
- **Reward = 3-value enum** `{kept:1, modified:0.5, removed:0}` → `rewardSign ∈ {−1,+1}` → ×0.1 dampening. **A continuous float silently no-ops:** `OUTCOME_REWARD[0.73] ?? 0.5` → rewardSign 0 → ZERO learning. (TRAP.)
- **MG curves are NOT in the bandit's arm space.** They live in static `overlay-definitions.json`. To tune them you'd need (net-new): (a) register ~176 curve params as arms, (b) a curve-param sampler (current is scalar-add only), (c) a writable curve store + production sink. None exist.
- **Only 5 routing thresholds have a live sink** (`director-agent.ts:447-453`, Path E). Path D samples but DISCARDS (logs only, `:816-820`). The other ~30 adaptive thresholds + ALL mg-property curves: no production sink.
- Convergence: tens-to-hundreds of same-direction samples **per (threshold,context) arm** (`MIN_DECISIONS_FOR_ACTIVATION=10`, ±0.1 dampening). No guardrail vs a biased judge dragging `mu` to ±2σ. Persisted in Mongo `threshold_bandit_states` keyed by `userId`.

### 4e. The calibration pipeline (`scripts/calibrate/calibrate.ts`)
- 4 stages: **download** (yt-dlp→GCS) → **analyze** (5-Track via Gemini + Wav2Vec + V-JEPA + Essentia + transcript Grok/Whisper/Gemini) → **score** (`buildSignalTimeline` → AVERAGE every gridSignal to ONE global snapshot → `scoreAllOverlays` → `systemDecisions` + `referencePatterns` from Gemini's editing JSON) → **feedBandits**.
- **Reward = 3-5 binary kept/removed flags per video** comparing system signals/scores vs Gemini's reported reference EDITING patterns (cuts/min, dissolve presence, music presence) + 2 hardcoded bounds (fontSize 48-160, formal≠pop).
- **Renders NOTHING** (zero Remotion).
- **MG checks leak into the wrong threshold:** the 2 MG checks emit `reason='energy_peak'/'vocal_emphasis'` → `findRelatedThresholds` keys on `reason` (ignores `technique`) → updates `speech-coverage-threshold`. **No mg-property curve is tuned.**
- **Bandit never activates:** per-label state `calibration-<label>` → 3-5 outcomes/state vs activation floor 10. The loop is, for MG purposes, near-dead.
- Signals are AVERAGED to one global snapshot/video; MGs are per-moment → mismatch.
- `reference-videos.json` = **20 videos** (energetic-vlog, MrBeast, Neistat, Veritasium, Kurzgesagt, Fireship, Johnny Harris, Mark Rober, MKBHD, LTT, Corridor, Ali Abdaal, ColdFusion, Vox, Apple, Kolder…). **No structured MG ground-truth** (only free-text `notes`). `expectedSignals` is NOT consumed by the script.

### 4f. The gates
- **`structural-gate.ts`** — `checkCompositionStructure(recipe, tokens, frameContext?)` → `{pass, score 0-100, issues}`. **Operates on the RECIPE (pre-render, NO pixels).** Checks: WCAG contrast (sourced), per-role font floors (CRG-sourced w/ graph node IDs), density>6 (INVENTED), focal hierarchy >1 hero (INVENTED), brightness-match (INVENTED + **DEAD** — no `frameContext` passed in prod). `PASS_THRESHOLD=60` (uncalibrated). Deduction magnitudes 8/10/5/15/12 = INVENTED. **Live = OBSERVE-ONLY** (`edl-executor.ts:1194`, logged, never acted).
- **`aesthetic-gate.ts`** — `runAestheticGate(frameBase64, mimeType, recipeContext?)` → `{pass, score 0-100, issues, reasoning}`. **Operates on a RENDERED FRAME (pixels → Gemini 2.5-flash, seed 42 [soft], temp 0.1).** `PASS_THRESHOLD=70`. **FULLY DORMANT (zero callers).** **Auto-passes score 100 if no API key** (silent reward-poison). Error → score 0. ~$0.001/frame (its own claim, unverified).

### 4g. The render harness (`render-mg-stills.ts` + `mg-still/root.tsx` + `index.ts`)
- `bundle()` once + `selectComposition` + `renderStill` per MG (~1-2s, single PNG). Renders the **REAL** `MotionGraphicLayerContent`.
- **Needs NO Mongo** — renders from an in-memory recipe/overlay object. `dump-proj-mgs.ts` does the Mongo dump → `.calibration-temp/<pid>-mgs.json`.
- Programmatically callable (plain `@remotion/renderer` API). Render frame = `floor(dur*0.6)` (mid-hold). Captures `[MG-Render]`/`[MG-Fit]` browser logs so blanks aren't silent. **UNTRACKED scripts (hold Mongo URI — never git add).**

---

## 5. Key architectural truths (carry these)

1. **mgScores is LIVE** but tunes within fixed templates. The form is the lever.
2. **The form = the 8 composers + dial-blind `content-shape-analyzer`.** Dissolving `switch(primary.kind)` is the production-level work (D-017 pivot).
3. **The curve + calibration infra IS the generative engine** (properties-from-signals = curves; learn-not-invent = calibration). NOT throwaway. But it must drive the GENERATED FORM. Don't tune template-dials (won't transfer).
4. **The EYES (structure extraction) is genuinely MISSING.** `creative-brief.ts:728 detectSignalsFromContext` is signal-PRESENCE detection (`emphasis_word` added unconditionally @ :735 → keyword flood), not structure. The EYES must be bimodal: HEARD (transcript→structure) + SEEN (visual signals + face/free-space).
5. **The calibration pipeline as-built rewards editing-pattern match, renders nothing, never activates** the bandit. Reusing it for MG-quality = rebuilding most of it.
6. The structural-gate (recipe-based, no render) is the cheap deterministic floor; aesthetic-gate (VLM, needs a render) is the unreliable flag; the human is the quality judge.

---

## 6. Bugs

**Fixed this session:** `selectWinners` crash (`5a819519`); 90%→90 stat (`a0af90ec`).

**Found, NOT fixed (open):**
- `director-agent.ts:872` merge discards scorer graphic winners (contradicts `:831` comment) — Stage-6 decision (which brain wins graphics).
- `utilityTotal` dead var in the Path-D scoring block.
- Baseline visual defects: cramped left-padding on bottom-left stats; low-contrast gray captions.
- `aesthetic-gate` auto-passes score 100 with no API key (poison trap if used as reward).
- Calibration never activates (10-outcome floor vs 3-5/label, per-label keying).
- structural-gate brightness check DEAD (no `frameContext` in prod → footage-blind).
- MG-property calibration reward leaks into `speech-coverage-threshold` (reason-keyed).

---

## 7. Research (this session)

**`MG-Open-Approach-Shortcomings-2026-06-02.md`** — shortcomings of OPEN extraction → open generation. (Deep-research VERIFIER broke again — same StructuredOutput bug; SEARCH worked, 10 PRIMARY papers; claims are **primary-sourced but NOT double-checked**; ignore the "all refuted/inconclusive" summary, it's the harness mislabeling abstentions.)
- **No auto-detector for "valid-but-wrong/meaningless"** — Calliope (arXiv:2010.09975) deliberately uses a CLOSED 10-fact menu; admits it cannot guarantee meaningful output. THE reason everyone ships a menu.
- **VLM-as-judge unreliable** (2602.05662, 2604.25235, 2503.05977, 2604.18164): lenient (passes bad output), ~32-34% human agreement, can rank but not score absolutely, needs a human reference.
- **Confidence-gating on raw LLM confidence ≈ random** (2306.13063 AUROC ~0.55; 2510.26995 nominal 99% interval covers ~65%). Fix = calibration layer (conformal) or eval-measured thresholds.
- **Hardened guardrails (→ plan §13.6):** JUDGE = symbolic LAWS as a structured checklist + VLM flag-only + HUMAN gate. CONFIDENCE GATE = eval-measured/calibrated, never raw. EVAL with human ground-truth MANDATORY.

Prior: **`MG-Generative-Grammar-Research-2026-06-02.md`** — Draco/Vega-Lite backbone; grammar dissolves the chart-type menu; the brutal truth (no system has auto-generated composite MOTION graphics end-to-end; AutoClips 20.5% misrecognition / 66.9% coverage; no goodness metric; human-in-loop forever).

---

## 8. Reviews + verdicts

**6-lens plan review** (CEO / Eng / outside-voice / Elon / Director / Editor — ran as 6 parallel agents): **5/6 said REVISE.**
- CEO/Eng/Outside/Elon (consensus): over-scoped into an unsolved research bet — **narrow it.** Judge-first; ~5 properties not 25; **keep composers as fallback (don't delete)**; defer geometry-primitive + bespoke-VLM-judge; promote the cleanup track; narrow extraction; fence the generator as ONE spike.
- **Director (the SOUL gap):** no "director" organ — add a top-down piece that commits ONCE per video the through-line / one visual voice / one motion character / the ONE hero moment + narrative-role per moment. Signals capture *intensity* not *intent*. Motion is coded as correctness not *expression*. "A graphic whenever warranted" = spray; restraint + hero + rhythm are the craft.
- **Editor (the CUT-CRAFT gap):** add timing/dwell, exit-before-next-cut, face-safe + caption-safe zones, **audio-sync is DEAD** (`syncData` never reaches the renderer — one wire away), anti-spray pacing, no-repeat, caption co-tenancy.

**Calibration plan review** (CEO+Eng, deep, after the §4 map): the original "wire gates → bandit reward → tune MG curves" plan rested on **4 false premises** the code disproves (calibration doesn't eval MG quality; bandit can't tune curves; tuning dials can't change form; a gate score can't be the reward as-is). **Corrected:** build the curve+calibration infra as PART of the generative engine, pointed at the generated FORM, with a continuous reward + deterministic-gate reward (structural-gate) + VLM as a flag. The review = the SPEC for building it right.

---

## 9. Decisions log

| # | Decision | Status |
|---|---|---|
| 1 | Build **B** (open extractor + generative form, no menu) | LOCKED |
| 2 | Staged path (6 stages) | APPROVED |
| 3 | EYES is **bimodal** (heard structure + seen visual/face/space) | LOCKED |
| 4 | Add a **DIRECTOR** organ (through-line/voice/motion-character/hero/narrative-role) | ADDED to plan §13.1 |
| 5 | Add **CUT-CRAFT laws** (timing/dwell/exit-on-cut/face+caption-safe/anti-spray/audio-sync) | ADDED to plan §13.3 |
| 6 | **Hardened guardrails** (laws-checklist+VLM-flag+human; calibrated confidence; eval mandatory) | plan §13.6 |
| 7 | **Composers KEPT as fallback** until generator beats them | LOCKED |
| 8 | Calibration: **build the curve+calibration infra (it's the engine), pointed at the generated form, NOT the current template-dials** | CORRECTED (founder was right it's not throwaway) |
| 9 | DEFERRED to Stage 6: parametric-geometry primitive; bespoke-VLM-judge; full ~25 properties; open-OpenIE | DEFERRED |

---

## 10. Open issues / questions

- The **FORM (assembler) is unbuilt** — the real production lever. Everything else is groundwork.
- The eval/calibration must be **pointed at the generated form** (which doesn't exist yet) → sequence form-first.
- The :872 graphic-merge reconciliation (Stage 6).
- Audio-sync is dead (`syncData` not wired to the renderer) — Editor's #1 cut-craft fix.
- GSAP decision: DROP it (use our own deterministic easings — elastic/bounce/back as closed-form). The dead plugins (scramble/draw/morph) deletable; scramble uses Math.random (non-deterministic). NOT a Stage-1 quick-delete (renderer touch). Easing rebuild = motion step.

---

## 11. What next (the corrected shape)

**The generative engine = form (assembler) + signal-driven curves + eval/calibration loop. ONE body of work. Sequence: form → curves → calibration.**

1. **Stage 2 — the EYES (bimodal extraction), eval-first.** HEARD: transcript → structure (comparison/proportion/trend/negation, OPEN extractor measured on these first). SEEN: visual signals + face/free-space. Build the eval/answer-key FIRST (Rule 35) on the REAL transcript. Metric = per-structure precision+recall (confusion matrix). "Unsure → keyword fallback."
2. **Prove ONE structure end-to-end** with a minimal REAL assembler (system-generated, NOT hand-authored — the thing I got caught faking): extract → assembler builds the form from primitives → render → human judges vs the baseline. If it beats the thin keyword-box → real proof. If not → the gap is the form, found cheaply.
3. **The eval harness** = render → `structural-gate` (deterministic laws score) → number + pass/fail floor + regression detection. `aesthetic-gate` = observe-only flag (logged, calibrated vs human over time). Human = quality judge. (NOT a bandit reward yet — that comes once the form is generative.)
4. **Don't tune the current template-dials.** Don't bolt calibration onto the broken existing bandit.

Real transcript structure-carrying moments (proj_OzG2qgoYudFa, for the answer-key): seg155 "ninety percent are good" (proportion 90%), seg129/131 "a third…not true" (refuted proportion), seg86 "0.02 human beings" (magnitude/scarcity), seg137 "hundred thousand…stadium" (magnitude), seg120 "much more nasty than the real world" (comparison), seg77/78 "worst IN people→worst people" (reframe/negation), seg121 "fewer and fewer…worse and worse" (decline/trend), seg134 "selection bias" (concept). The crude keyword regex MISSED several → proof EYES needs MEANING, not keywords.

---

## 12. Techniques / how-to (so the next session doesn't re-learn)

- **Render the real baseline:** from the worktree → `npx tsx scripts/dump-proj-mgs.ts proj_OzG2qgoYudFa` (Mongo→JSON) → `npx tsx scripts/render-mg-stills.ts proj_OzG2qgoYudFa` (→ PNGs in `.calibration-temp/mg-stills/proj_OzG2qgoYudFa/`). Then **Read the PNGs — actually look at the pixels.**
- **Dump transcript:** `npx tsx scripts/dump-transcript.ts proj_OzG2qgoYudFa`.
- **Verify code:** `npx tsc --noEmit` (196-error BASELINE — look for +0 in your touched files; exit 2 is expected, errors exist) + `npx eslint <file>`. Run from the worktree.
- **Verify on REAL renders + look at the pixels.** NOT the 112-test suite (injects scores, masks render bugs). Adversarial-verify before claiming "production-ready" (happy-path renders are a "good hit," not proof).
- Gates: `structural-gate` runs on the RECIPE (no render needed); `aesthetic-gate` needs a RENDERED frame.
- The render harness is programmatically callable (bundle once, loop `renderStill` over in-memory overlays) — no Mongo needed for the render itself.

---

## 13. Footguns / gotchas (DO NOT repeat)

- **NEVER `git add -A` / `git add scripts/`** — the untracked scripts (`dump-proj-mgs.ts`, `render-mg-stills.ts`, calibrate stuff) hold a live **Mongo URI**. Stage explicit source paths only.
- **Push to `origin` ONLY** (`Insturix/Front-End`). **NEVER `haunting`** (`HAUNTING-EYES/insturix`).
- `.env.local` (worktree root) holds MONGODB_URI + GEMINI/GOOGLE key (both present). Don't print values.
- **The deep-research VERIFIER keeps breaking** (subagents don't call StructuredOutput → all claims "abstain"→mislabeled "killed"). SEARCH works. Treat findings as primary-sourced-not-double-checked. Don't trust the "all refuted" summary.
- **Context decay is real** — CHECK THE RECORD (this handover, the plan, the code at file:line). Do NOT re-derive from memory (I did, repeatedly, and got it wrong).
- `render-mg-real.ts` = decoy. mgScores IS live (not dormant). `aesthetic-gate` auto-passes 100 with no key.
- proj_OzG2qgoYudFa is in `editron_prev` (NOT `_prod`). 13 MGs, 204 transcript segments.
- `useCompositionEngine` = true by default → the recipe engine (composers) is the LIVE path, NOT a dormant flag.

---

## 14. All docs + paths + IDs

**Code:**
- Worktree (PRIMARY / deploy branch): `D:\google downloads\Front-End-main\editron-worktree` → `infrastructure-improvs-+Editron`.
- Key files: `lib/editron/services/edl-executor.ts` (live MG flow 1129-1234), `motion-graphics/engine/composition-planner.ts` (8 composers, mgVal/mgWinner), `content-shape-analyzer.ts` (dial-blind kind selection), `motion-graphics/engine/structural-gate.ts` + `aesthetic-gate.ts` (gates), `engine/overlay-definitions.json` (43 mg-property defs), `engine/utility-scorer.ts` + `response-curves.ts` (scoring/curves), `services/threshold-bandit.ts` + `data/threshold-registry.ts` (bandit), `agent/director-agent.ts` (Paths D/E), `services/creative-brief.ts:728` (current signal-presence "extraction"), `scripts/calibrate/calibrate.ts` (+ `reference-videos.json`).

**Vault (`D:\Insturix-Brain\`):** read `00-Index.md` first.
- **THE PLAN (AUTHORITATIVE):** `07-Roadmap\MG-Generative-Build-Plan-2026-06-02.md` — **§13 = the staged path** (13.1 organs incl. DIRECTOR + bimodal EYES, 13.2 the 6 stages, 13.3 cut-craft laws, 13.4 destination, 13.5 deferred, **13.6 hardened guardrails**).
- Research: `01-Research\MG-Generative-Grammar-Research-2026-06-02.md`, `01-Research\MG-Open-Approach-Shortcomings-2026-06-02.md`, `01-Research\Motion-Graphics-Craft.md`.
- Architecture: `02-Architecture\MG-Capability-Map.md`, `MG-Form-Selection-Architecture.md`, `MG-Master-Plan-v3.md`, `MG-Colour-Engine.md`, `MG-Anchor-System-Tier3.md`, `Rules-and-Constraints.md`.
- Decisions: `03-Decisions\D-017-MG-Dissolve-Type-Preset-Menu.md` (the pivot).
- Audits/bugs: `05-Bugs-and-Issues\MG-Production-Readiness-Audit-2026-06-01.md`.
- Session notes: `04-Session-Notes\Session-2026-06-02-Stage1-Baseline.md` (this session's Stage-1 record), prior `Session-2026-06-01-MG-Audit-Generative-Pivot-HANDOVER.md`, `Session-2026-05-31-MG-Spine-Pivot-HANDOVER.md`.

**Memory:** `C:\Users\admin\.claude\projects\D--google-downloads-Front-End-main\memory\MEMORY.md` (the auto-loaded index).

**IDs:** real project `proj_OzG2qgoYudFa` (editron_prev). Vercel `prj_uAwH5pAHMWaOiRNbS7FZuejWXUuc`.

---

## 15. ★ What I (you, next session) SHOULD have had at minute 1 — the smooth-start checklist

The founder explicitly asked for this. If you'd had these, this whole sprint would have been clean:
1. **§4 (the deep architecture map).** #1 thing. I rushed reviews from partial reads → wrong conclusions → had to redo. **Read §4 before reviewing or proposing anything.**
2. **mgScores tunes-WITHIN-templates; the form is the lever.** I re-derived this 3×.
3. **A-vs-B already settled → B.** Don't re-litigate.
4. **The render harness usage + that it needs no Mongo + look at the pixels.**
5. **The calibration/bandit reality** (renders nothing, never activates, can't tune curves, 3-value reward no-ops a float).
6. **The curve+calibration infra IS the engine** (not throwaway) — build it for the generated form, not the templates.
7. **The footguns (§13)** — esp. never-git-add-scripts, origin-only, the verifier-breaks.
8. **The open bugs (§6)** + the :872 merge + dead audio-sync.
9. **The discipline: don't rush. Deep-read before reviewing. Check the record, don't re-derive.** The founder's repeated, correct refrain this session.
10. **Sequence truth:** form → curves → calibration. You calibrate something that exists.

---

### Session arc (honest, incl. my mistakes — so they're not repeated)
6-lens review → staged path approved → Stage 1 (crash-fix + deletes + baseline render + 90% fix, 3 commits pushed) → B-vs-A (settled B) → deep-research on B's shortcomings (verifier broke; hardened guardrails) → EYES grounding + transcript dump → calibration deep-dive (4 agents mapped the full machinery) → calibration review → founder corrected my "defer calibration" framing (the infra IS the engine). **My recurring mistake:** drifting/reframing/re-deciding from fading memory instead of grounding in the code, and reviewing before deeply reading. The §4 map is the antidote.
