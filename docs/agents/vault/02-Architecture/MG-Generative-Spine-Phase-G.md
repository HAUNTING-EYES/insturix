---
tags: [architecture, motion-graphics, phase-g, brand, signals, decided]
status: #decided
created: 2026-05-30
revised: 2026-05-30 (rewritten after 6-agent code verification — supersedes the morning draft)
related: [[MG-Signal-Overlay-Architecture]], [[Motion-Graphics-Craft]], [[graphiti-signal-bridge]], [[Rules-and-Constraints]]
verification: 6 parallel research agents cross-checked every claim against editron-worktree code (file:line). Nothing here is assumed from docs.
---

# Phase G — The Generative Motion-Graphics System (FINAL)

> The definitive Phase-G plan. Produced after deep investigation + a 6-agent codebase verification pass ("analyze everything, verify, do not assume"). It **supersedes the morning draft**, whose "spine-first" sequencing the verification corrected.
>
> **Thesis (Rule 29N keystone, Rule 11, never broken):** the system GENERATES designs from `capability × (brand bounds + content + per-moment signals + Graphiti memory)`. It never SELECTS from presets. Even "4 registers, signal picks one" is a preset library. Iman-style is a *capability the engine performs*, not a preset to apply.

---

## 1. Diagnosis (verified, file:line)

The engine produces amateur, identical graphics because **it occupies a single fixed point in an expressive space it should traverse.** Five pins hold it there, each verified in code:

| Pin | Verified fact | Location |
|---|---|---|
| **Color hardcoded** | 2 tokens only. `composeEmphasis` binary `informal ? accent : textPrimary`; others hardcode `textPrimary`/`textSecondary`. `mg.color.accent_usage` only flips a boolean, never picks a hue. No semantic palette roles exist (`alarm`/`warm` = 0 matches). | `composition-planner.ts:507,545,367,615` |
| **Size absolute** | `mg.typography.font_size` → **36-160px absolute**, resolution-blind. `buildTextStyle` = `max(minSize, 64*sizeScale)`, **zero** `maxWidth`/`whiteSpace`/`wordBreak`/`overflowWrap`/measurement. `title-safe` = **0 matches in the entire codebase.** | `overlay-definitions.json:2018`, `primitive-renderers.ts:501-523` |
| **Brand never reaches render** (the bombshell) | **Nothing writes `decision.params.brand`** → both `resolveMotionTokens` call sites resolve `|| {}` → `DEFAULT_BRAND` (gold) **100% of runs, even for a paying user with a full brand.** Brand-registry IS loaded, but only into the Gemini prompt; it dies at the prompt boundary. `composition-planner:268` builds "brand" from the already-resolved default tokens (circular). | `edl-executor.ts:1104,1376`; `director-agent.ts:1060-1083`; `composition-planner.ts:268` |
| **Captions are a jukebox** | 9 hardcoded creator presets, brand-blind. Plus 3 more drifting definitions of "caption style" (`caption-service STYLE_MAP` 9 / `edit-profile-types` 11 / dialog 13). | `caption-service.ts:221-231` |
| **Transitions gated + brand-blind** | Placement requires a clip cut within 45 frames (`snapToClipBoundary`); signal-timed moments aren't cuts → 0 placed. Styling reads no brand. | `edl-executor.ts:590`; `transition-layer-content.tsx` |

**What already works (do not rebuild, do not regress):** 40 `mg.*` overlays scored by the utility engine and consumed by the planner (`edl-executor:1109-1142`, `useCompositionEngine:true`); per-moment V-JEPA/Wav2Vec/Essentia signals genuinely vary on real data (4 painful debugging passes this week, `5021666b`→`ceb6ae8f`); SFX runs through the **same `EditDecision` stream** as MG (already unified at the decision layer); `choreography-computer` computes stagger/entrance from tokens + beats (genuinely computed, not hardcoded frames).

```
CURRENT (verified)                                  TARGET
brand-registry → Gemini prompt  [brand DIES]        brand-registry/Graphiti → VisualLanguage
                                                        (BOUNDS + ROLES + intensity)
Director → EditDecision[]  (params.brand = {})           │ threaded into params.brand
per-moment signals ─┐ (WORKING, varies)             per-moment signals ─┐
                    ▼                                                   ▼
edl:1104 resolveMotionTokens({}, sig) → GOLD        edl:1104 resolveMotionTokens(brand, sig) + spine
                    ▼                                                   ▼
planner: color=HARDCODED accent, size=36-160 abs    planner: color = palette[role(signal)].sample(intensity)
                    ▼                                          size  = fraction(intensity) × frameH → fit-to-box
buildTextStyle: NO width/wrap → OVERFLOW/BREAK      buildTextStyle: measure → fit title-safe, never break word
                    ▼                                                   ▼
BROKEN: oversize, mid-word, monochrome, identical   captions + transitions + SFX read the SAME spine (fusion)
```

## 2. Mental model (locked)

- **Expressive space.** A moment is a point across axes: intensity (mute↔loud), voice (script↔mono↔bold), color deployment (which brand role, where, *why*), motion, composition, sound (SFX), density. The engine must *traverse* it, not sit at one point.
- **Iman = mobility, not a look.** His editor goes whisper-script → red-3D-bold in one video, same brand. We build the mobility.
- **Generate, never select.** Compute color/type/size/layout/motion from inputs, fresh. No menu.
- **Brand = bounds. Signals = navigation. Graphiti = learned bias.** Cohesion from shared bounds; variety from signal selection within them. Both at once.
- **Content decides the region; signals decide the point.** A calm vlog lives in the quiet corner and barely uses graphics; a hook reaches loud. MGs as-needed, not throughout. Intensity is a real signal-driven dial (mute/mid/loud), not a fixed setting.
- **Color carries meaning.** Red "LOCKED" = the system reading "negative/locked concept at a tense beat" and pulling the brand's alarm role. Bounded, never random, never hardcoded.
- **LLM boundary (Rule 30).** Reading what content *means* is language perception → LLM as an input that becomes a signal. The design *logic* stays native.

## 3. How it composes with the existing overlay system (no duplication)

The 40 `mg.*` overlays keep producing per-moment values from signals. The spine adds the **bounds + semantic roles + resolution-relative sizing** those values resolve against. `overlay value → spine bound → final`. The spine FEEDS the overlay's clamp range, it does not parallel it. **Boundary (to avoid the duplication risk the verification flagged):** spine owns *brand-scoped* bounds (palette roles, intensity floor/ceiling, frame-fraction, font families); overlays own *signal→value response within those bounds*; `motion-theme-resolver` is refactored to emit bounds so there is ONE bounds layer, not two. Position stays in the `mg.layout.center_avoidance` overlay; the spine does not re-decide position.

## 4. Phasing — RISK-ORDERED (the verification's correction)

The morning draft said spine-first. Verification flipped it: the visible bugs are **contained correctness fixes** that need neither brand nor the signal pipeline, while the spine is bigger and riskier than written (it must *wire brand into the render*, absent today, by refactoring the file every graphic flows through, right after that pipeline took 4 passes to stabilize). So phases go in **risk/value order**: cheapest-safest-most-visible first, riskiest-deepest last, each ≤5 files, each verified on a REAL render before the next.

### G-1 — Brushwork (correctness). Lowest risk, highest visibility. FIRST.
Fix the broken screenshots. Zero touch to brand or the signal pipeline.
- `buildTextStyle`: measure → fit to title-safe box, never break a word, resolution-relative + **aspect-aware** size (9:16 vs 16:9). Measurement: `@remotion/layout-utils` primary, deterministic estimator fallback.
- Fix the char-split flex-wrap (`SplitTextElement`) so words never break mid-glyph.
- `mg.typography.font_size`: absolute 36-160 → a frame-fraction (or intensity 0-1 resolved against frame height).
- **Files:** `primitive-renderers.ts`, `composition-renderer.tsx`, `overlay-definitions.json`, `recipe-types.ts` (+ measurement dep). ≤5.
- **Why first:** broken text is a *bug*, fixed independent of everything. You can't judge color/variety while "SUPERHERO" overflows.
- **Verify:** real render of `proj_OzG2qgoYudFa` ("superhero", "d-bag"); **adversarial ≥8 content types** (long word, all-caps, CJK, multiline, numerics, 9:16/16:9) — Rule 29; one damage-8 overflow = not production-grade.

### G-2 — Brand wire + VisualLanguage shape (additive, de-risks the spine). SECOND.
Fix the bombshell + introduce the spine shape, *without* changing MG appearance yet.
- NEW `visual-language.ts`: `VisualLanguage` type (semantic palette ROLES surface/neutral/emphasis/alarm/warm/cool, each a brand-bounded ColorBound; type weight/case ranges + frame-fraction size model; motion personality; intensity floor/ceiling) + `resolveVisualLanguage(brand, signals, graphitiBias?)`.
- `motion-theme-resolver.ts`: refactor to emit bounds/roles (collapse the duplicate value-emitter).
- `director-agent.ts:1060-1083`: thread the already-loaded `UnifiedBrand.visual` into every emitted decision's `params.brand` (the missing wire). Fix `composition-planner:268` circular brand.
- `edl-executor.ts:1104`: resolve the spine once per project, pass alongside `mgScores`.
- **Files:** ≤4. **Additive:** MG renders the same (brand now flows + the shape exists; planner still hardcodes color until G-3).
- **Verify:** a real-brand test project → brand fonts/accent reach the render (no longer gold-always).

### G-3 — Generative color + intensity (the mobility). THIRD.
Now the thesis lands, on a correct + brand-wired base.
- `composition-planner.ts`: color = `spine.palette[role chosen by signal/meaning].sample(intensity)` (kill hardcoded `accent`); intensity axis drives size/decoration/case (kill `uppercase if enthusiasm>0.7`).
- `property-resolver.ts`: resolution-scaled CRG floors; consume spine bounds.
- **Files:** ≤2. **Verify:** color varies by meaning, intensity varies by moment (`check-mg-recipe.ts` tallies + real render). Confirm the moat is now *visible*.

### G-4 — Captions onto the spine. Kill the jukebox.
Captions generate from the spine (white→bold weight emphasis when low-intensity, color role when the signal demands). Resolve the 4-definition caption-style drift (3 axes: stylePreset × displayMode × renderMode). Blocked by D-016 profile-removal Phase 3B.

### G-5 — Fusion / Moments + transitions + SFX.
Transition snap-to-nearest-cut (fixes 0-placed); transitions read the spine; SFX (already in the EditDecision stream) co-times into moments; the caption-word→MG promotion. The premium fused beat.

### G-6 — Graphiti.
Generalize the lone Graphiti read (`director-agent.ts:2152`, transition-only) to feed per-brand learned biases into the spine bounds.

### G-7 — Selection + Calibration (cross-cutting; "the dial settings"). RUNS THROUGHOUT, not last.
The signals vary, but the **numbers that act on them are mostly guessed** — every threshold in the planner + overlay defs is tagged ⚠️ INVENTED. That is *why* the engine **over-fires keywords** (8 of 13 graphics on `proj_OzG2qgoYudFa` were keyword-highlights) and puts a graphic on nearly every video. Three parts:

**7a. Selection — not every word, not every video (both signal-driven).**
- *Not every word:* the "make this a keyword" trigger is too eager. Gate it on signals (importance / emphasis / visual-significance) and rank-and-cap harder, so only the few moments that matter get a graphic. The filler-word filter + cap exist but are uncalibrated.
- *Not every video:* a per-video signal gate that can legitimately produce **zero** graphics for content that doesn't want them (calm explainer, dense talking-head). MGs are *as-needed*, not a quota. Suppression exists for montage only; extend it to a real "does this video want graphics?" signal.

**7b. Calibration testing — the harness. Build EARLY.** A real-data eval that, for a set of real projects, reports the **actual decisions in plain numbers**: keywords-per-video and density, *which threshold let each one through*, sizes vs frame, whether the per-video gate fired. Built on REAL project data / real renders — NOT the 112-test suite (it injects scores and masks exactly this). Extends the existing `check-mg-*` scripts into a scored sweep. This is how we *see* whether a threshold is right instead of guessing.

**7c. Calibration — the tuning.** Move every ⚠️ INVENTED number into `editronConfig` (currently unwired), then tune against 7b + reference (real-render eyeball + the existing threshold bandit, per [[MG-Signal-Overlay-Architecture]]). Never hand-tune-and-ship. Each phase (G-1 focal-cap, G-3 intensity/palette bounds, …) drops its invented numbers here; the harness re-scores after each phase's real render.

**Sequencing:** 7b (harness) is built early so every later phase is *measured*, not eyeballed-once. 7a (selection / over-firing) is the first calibration target because it's the most visible offender. Full bandit calibration trails the phases that introduce the thresholds.

## 5. Verified injection points (from the code-truth agent)
1. `edl-executor.ts:1104` & `:1376` — the chokepoint feeding `resolveMotionTokens`; always `{}` today.
2. `director-agent.ts:1060-1083` — brand loaded here for the prompt; thread `UnifiedBrand.visual` into `params.brand`.
3. `caption-service.ts:221-231` + `director-agent.ts:2492` — caption brand-token layer + selection precedence.
4. `composition-planner.ts:268` — break the circular `brandFromTokens`.
5. `motion-theme-resolver.ts:185-204` — `resolveMotionTokens` already accepts `hierarchyOverrides` (deep-merge); clean spine injection seam.
6. `director-agent.ts:2152` — the lone Graphiti read to generalize (G-6).

## 6. Must-NOT-regress (verified fixed; brushwork must not touch)
`color.surfaceOpacity` backdrop fix (`structural-moves.ts:62`) · fraction/suffix static-stat fix (`StatCounter.tsx:97`) · transition dedup/`afterOverlayId` stability · per-moment signal injection (`8017a70a`) · rank-and-cap calibration.

## 7. Risks & open questions
- **Signal granularity (the one unverified leg).** The spine's mobility depends on per-moment signals actually varying. Run 4 confirmed the *current* pipeline populates them, but a **fresh-ingest Level-4 confirmation is owed** before G-3. If signals are flat, the spine has nothing to navigate by. Verify before building G-3.
- **Invented thresholds.** Intensity floor/ceiling, size fractions, palette role ranges = ⚠️ INVENTED (Rule 31/E4). Land them in `editronConfig` (currently unwired), calibrate on real renders / bandit, do not hand-tune-and-ship. Owned by **G-7 (Selection + Calibration)** — the standing test-and-tune track.
- **Spine vs overlay bounds.** Single source: CRG = universal bounds, brand = brand bounds, spine = composes. Don't re-type numbers across both.

## 8. Out of scope (named, not silently dropped)
- **Screencast / Phase F** (OpenScreen, MIT-licensed, deterministic cursor-zoom) — a separate, vision-aligned track. Not this redesign.
- **The old `phase_f_g_saas_motion.md` component-library / rigs framing is DEAD** — it is the exact preset jukebox Rule 11 forbids. Only its problem statement + audio-marker-sync survive (absorbed into G-5).
- **Full 3D-rendered scenes** (the Iman safe). Bespoke 3D/asset work, not the composable engine.

## 9. Evidence Block (per the rules, for the G-1 code)
```
E1 Graph: safe_zone.title_safe=90%/5%, action_safe=93%; graphic_too_small=<72px@1080p (resolution-relative);
          type mins stat64/kw48/lt48-36/quote42 — OVERRIDABLE bounds. G-1 makes size fit these, not floor on them.
E2 Docs: Motion-Graphics-Craft.md (4 laws: hierarchy/restraint/title-safe-text-fit/variety); MG-Signal-Overlay-Architecture
          ("CRG=bounds, overlay=value, 64≠base"); this doc §3-4.
E3 Deps: buildTextStyle → composition-renderer ×4 + 1 untracked script. Recipe pre-computed pipeline-time, canvas-agnostic →
          fit MUST run render-time (useVideoConfig). Brand wire (G-2): edl:1104/1376, director:1060-1083. Blast radius G-1: every MG text; G-2: every MG token; isolated from the signal pipeline.
E4 Thresholds: focal size = intensity × frameHeight-fraction ← ⚠️ INVENTED, calibrate; title-safe 90% ← CRG safe_zone; readability floor = CRG_role_min × (canvasH/1080) ← graphic_too_small.
E5 Rules: R11 generate/extend-engine; R29N signals-not-presets; R18N deterministic (spine = pure fn of brand+signals); R23N no-MVP; R30 LLM-language-only; R0 any-brand/content; R29 adversarial ≥8 types.
Northstar: occipital (legibility) + Da Vinci necessità (size from space+content). Why: text must fit its frame and the engine must move through the space, not stamp one point.
```

## 10. Expected outcome
G-1: the screenshots stop being broken (visible, immediate). G-2: real brands reach the render for the first time. G-3: color + intensity vary per moment — the moat becomes visible. G-4-5: one coherent visual language across captions/MG/transitions/SFX, the fused premium moment. G-6: better on-brand over time. End state: an engine that *traverses* the expressive space, navigated by signals, bounded by brand. Iman-dramatic emerges for dramatic content; clean-tech for an explainer. None of them written down.

**Verify every phase on REAL renders (`proj_OzG2qgoYudFa`), never the 112-test suite (it injects mgScores and masks render bugs).**
