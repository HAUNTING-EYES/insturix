---
tags: [roadmap, motion-graphics, generative, plan, canonical, follow-as-is]
status: active
created: 2026-06-02
supersedes: the "harden the composers / frozen-list" framing in MG-Master-Plan-v3 and the spine plan, on the points below
authority: FOUNDER-DIRECTED — "follow as is". Everything signal-driven, no templates anywhere.
grounding: MG-Generative-Grammar-Research-2026-06-02, MG-Colour-Engine, verified live code (2026-06-02 session)
---

# MG Generative Build Plan — the canonical plan

## 0. THE DISCONNECT (root cause, verified)
The renderer works (hand it any recipe of primitives, it renders to pixels deterministically). The 8 "composers" fill ~8 fixed layouts. What is MISSING:
- **EYES** — nothing extracts the STRUCTURE of what is said. The live path (creative-brief) flags shallow triggers only: emphasis_word (always on), number, name, cta. NO detection of comparison / proportion / refutation / trend / list. (creative-brief.ts:728-806 `detectSignalsFromContext`.)
- **A BRAIN** — nothing maps meaning → form. Composers map a content-shape to a FIXED skeleton. The signal-scored generator that could build form is OFF (`USE_UTILITY_LIVE` default false) and CRASHES (`selectWinners` 2-arg call vs 3-arg sig, director-agent.ts:857 / utility-scorer.ts:112; error swallowed :877).
Budget is NOT the limiter: graphic budget ≈ `graphic_density(≈3/min) × minutes` → ~60 allowed on a 20-min video; the real video used 13, ~all keyword. The AI just isn't fed rich triggers and leans on the keyword one.

## 1. END STATE (one sentence)
ONE generative assembler: it takes **(meaning-structure extracted from the moment) × (signals) × (brand)** and COMPUTES **every property** of the motion graphic — which elements exist, and each one's font / weight / size / italic / case / tracking / color / position / motion / timing — bounded by **universal legibility laws** and checked by a **quality gate**. No graphic "type" is ever named. No template. No menu.

## 2. THE THREE MISSING ORGANS (build these)
1. **EYES — extraction.** Transcript → an OPEN structure (entities, quantities, open relations, roles), NOT a type label. e.g. "12% before, 47% after" = {two quantities, change-relation, payoff=second}; "90% are good" = {proportion, positive payoff}; "a third are terrible — false" = {proportion, NEGATED}. The structure is name-independent.
2. **BRAIN — the generative assembler.** structure × signals × brand × laws → a fully-specified recipe with EVERY property computed (§3). Replaces all 8 composers.
3. **JUDGE — quality gate.** No formula for "is this good" exists (research-confirmed). Use a vision model (V-JEPA / a VLM) to score the RENDERED output for legibility/clarity/coherence, calibrate it, + the user quality-review (already vision-capable) as final gate. Human-in-loop; expect a misrecognition floor.

## 3. EVERY PROPERTY SIGNAL-DRIVEN (HARD REQUIREMENT — founder-directed)
Every visual property — DaVinci-grade and more — is COMPUTED from signals (signal → response curve → value), never hardcoded, never template-selected. The list:
- **Type:** font family, weight/boldness, size, italic/oblique, case (upper/lower/small-caps), letter-tracking, line-height.
- **Color:** fill, stroke/outline, shadow/glow, opacity, gradient (§4).
- **Space:** position (x/y), anchor, alignment, scale, rotation, layer/z, focal hierarchy, grouping, spacing.
- **Motion:** entrance pattern, duration, easing, stagger, per-word/char kinetic timing, hold behavior, exit, audio-sync.
- **Composition:** which elements exist, how many, the focal point.
"More than DaVinci" = these are derived AUTOMATICALLY from the video's meaning + feel and are meaning-congruent, not knobs a human sets.
**Wire the 3 dead dials** (`mg.color.saturation_boost`, `mg.styling.surface_complexity`, `mg.animation.entrance_speed`) — they are exactly these channels, built and scored but never connected. Add dials for every property currently hardcoded.

## 4. COLOR SIGNAL-DRIVEN (research-grounded; founder-directed)
Grounded in color↔emotion research (Valdez & Mehrabian 1994; MG-Colour-Engine). Rules:
- **Mood = saturation + brightness + temperature, NOT hue.** High arousal/energy → ↑saturation; calm → ↓saturation. Positive → ↑brightness; negative → ↓brightness. Warmth → temperature (warm↔cool). (KEEP saturation↔arousal and brightness↔valence as SEPARATE dials.)
- **Brand hue is sovereign** — preserve the brand's identity hue; mood modulates its saturation/brightness/temperature, never the hue.
- **Semantic colors are fixed** — green=good/gain, red=bad/loss/false, amber=warning, blue=info. Follow the DATA's meaning, never mood. (My spike got this right: "90% good"=green, "NOT TRUE"=red.)
- **Palette from one brand hex, derived in OKLCH** (perceptual space — even steps, no mud). Neutrals = brand hue at near-zero chroma (greys feel on-brand). Accent = brand hue rotated by a harmony rule chosen by signal: calm → analogous (±30°); punchy/CTA → split-complementary (±150°); playful → triadic (±120°).
- **Same-palette vs contrasting:** MG colors come from the brand palette; the ACCENT (loud color) is reserved for the focal element of the highest-energy moments; contrast creates the one focal point.
- **Footage-aware legibility (HARD, last):** sample the actual background behind the text; if contrast < floor (WCAG 4.5:1 normal / 3:1 large), escalate cheapest-first: flip text light/dark → drop shadow → stroke → scrim. Legibility beats mood, always.
→ "what segment gets what color" = per-moment signals shift the brand palette's MOOD; semantic meaning fixes data-colors; focal element gets the accent; footage contrast is the hard floor. (Optional: a dedicated deep color-research pass before building this subsystem.)

## 5. NO TEMPLATES ANYWHERE (dissolve list)
- LLM-picks-a-type menu → GONE. The AI only EXTRACTS structure; it never names a type.
- The 8 composers → GONE. Replaced by the one generative assembler.
- Chart types (ring/bar/sparkline fixed components) → GONE. A chart is ONE encoding the assembler emits by rule, built from primitives.
- Particle presets → GONE. Particles generated from signals (count/behavior/color) if used at all.
- Per-type guardrails ("if keyword, apply X") → REPLACED by UNIVERSAL laws (§6).
- Old hand-coded components (StatCounter, themes/minimal-tech, MotionThemeContext) → DELETE.
- Dead code: empty template registry (composition-templates), dead validators (crg-constraint-validator, aesthetic-gate), dead/non-deterministic GSAP → delete or rebuild deterministically.

## 6. THE LAWS (the fence — UNIVERSAL, not per-type, so NOT templates)
Applied to ANY generated form: ONE focal point · LEGIBLE (fit-to-frame, size floors, footage contrast) · RELATED things group · MOTION serves meaning (cognitive-science: wrong kinematics read as a DIFFERENT meaning → motion-congruence is a HARD law) · COLOR accessibility + semantic correctness are hard, mood operates within. These are physics, not layouts.

## 7. WHETHER / HOW-MANY (signal-driven, not forced, not absent)
A moment gets an MG when signals warrant it (salience) AND there is encodable structure — could be 0, could be many. Fix + enable the dead signal-scored decision path (the selectWinners crash + the OFF flag) so this runs.

## 8. SEQUENCING (frontier build — no fake shortcuts; verify on the SYSTEM's real output, never hand-authored)
1. **EYES (extraction)** — eval-harness-FIRST on real footage transcripts; metric = precision (a mis-tag = a wrong graphic). Keystone + highest risk.
2. **BRAIN v1 (assembler)** — structure × signals → recipe, every property computed (wire all dials incl the 3 dead), bounded by universal laws. Replace composers. Run REAL content through the REAL engine; render the SYSTEM's output.
3. **COLOR subsystem** (§4) wired into the assembler.
4. **MOTION** — every motion property signal-driven + motion-congruence law + kinetic typography from primitives (not GSAP).
5. **JUDGE** — vision-model quality gate + human review.
6. **WHETHER/HOW-MANY** — fix + enable the signal-scored appearance decision.
7. **Cleanup** — delete dead code; **Calibration** — tune curves on real videos (ongoing).

## 9. HONESTY RULES (non-negotiable, founder-enforced)
- The SYSTEM generates; never me hand-authoring a recipe in a script and calling it generated.
- Verify on real renders of real content through the real engine. No 112-test suite. No "looks good = proof."
- Every threshold traces to a source (graph node / research) or is flagged INVENTED. No fabricated numbers.
- Brutal honesty: report what's broken, what's faked, what's unproven.

## 10. STATUS POINTERS
Active/dead inventory + the live-vs-template breakdown: see the 2026-06-02 session status. Research basis: [[MG-Generative-Grammar-Research-2026-06-02]]. Color basis: [[MG-Colour-Engine]]. The disconnect + this plan supersede "harden the composers."

## 11. REFINEMENT — THE ALPHABET (founder co-design, 2026-06-02)
Letters are a fixed small set → infinite language; letters are ATOMS, not templates. The ONLY fixed things in MG are the irreducible atoms. Everything above them is generated from signals, bounded by laws.
The atoms:
- **Parametric geometry** — a mark defined by NUMBERS (sides, corner-radius, curvature, aspect, stroke-vs-fill), NOT a named shape. `rect/circle/line/pill` are NOT atoms — they are parameter-presets (rect = 4 corners radius 0; circle = fully round) = baby templates → DISSOLVE into the parametric geometry. **Geometry itself is SIGNAL-DRIVEN** (bouba/kiki: warmth → round/soft, energy/urgency → sharp/angular). Add geometry params to the §3 property list.
- **Fill / stroke / color** (signal-driven, §4).
- **Text glyphs** (from a font — the letterform alphabet for text).
- **Position** in space.
- **Motion over time.**
**Particles** = NOT a primitive concept — just MANY geometry-atoms generated (count / spread / drift / color from signals). Keep the deterministic placement math; KILL the 4 presets (confetti/dust/sparks/bokeh); make it signal-driven; let it fire when warranted (not budget-locked-off).
**RENDERER WORK (honest):** the current shape primitive only does rect/circle/line/pill via CSS; it CANNOT draw arbitrary parametric geometry deterministically (the only path/SVG capability is the dead, non-deterministic GSAP). So "shapes from signals" needs a NEW **deterministic parametric-geometry primitive**. Start with basic shapes (render today) signal-driving size/position/color NOW; add the parametric-geometry atom as a near-term renderer piece. Phased, no faking.
**GSAP clarification:** GSAP = an animation LIBRARY (motion math over time), NOT a renderer. We use it for easing + 3 fancy plugins (scramble/draw/morph). The plugins are dead + scramble is non-deterministic (`Math.random`) → breaks on Lambda. Our own choreography already computes motion frame-by-frame (correct/reproducible). KILL the fancy plugins; GSAP shrinks to (optional) easing math; motion stays our own deterministic code.

## 12. OPTION 3 — parallel "safe wins" track (alongside the eyes/extraction build)
Independent of the frontier extraction; lower-risk; real visible progress toward "signal-driven + no templates"; gives the assembler a clean base. NOT the core (core = eyes + brain).
1. **Clean house (pure win):** delete the empty template registry (`composition-templates`), the dead validators (`crg-constraint-validator`, `aesthetic-gate`), the old hand-coded components (`StatCounter`, `themes/minimal-tech`, `MotionThemeContext`), the dead/non-deterministic GSAP plugins, the stray `.g1-diff.txt`.
2. **Signal→property scoring groundwork:** wire the 3 dead dials (`saturation_boost`, `surface_complexity`, `entrance_speed`) as real signal→value channels the **generative assembler** will read — NOT bolted onto the doomed composers. Proves "a property's value comes from a signal" on 3 real properties; reusable.

## 13. REVISED EXECUTION — v2, STAGED PATH (AUTHORITATIVE — follow THIS; §1-12 are the vision/rationale)
After a 6-lens review (CEO / Eng / outside-voice / Elon / Director / Editor) + founder approval of the staged path. **Destination unchanged** (everything signal-driven, no templates, generative). What changed: the ROUTE (stages, measure-first, prove-one-first, keep a fallback), two organs the reviews caught were missing (a **DIRECTOR** for soul; **CUT-CRAFT** for the timeline), and the **EYES is bimodal (heard + seen)**.

### 13.1 The organs (revised)
- **DIRECTOR (NEW — top-down, runs ONCE per video):** reads the whole video (heard + seen) and commits the through-line — one visual voice (type system), one motion character, one accent strategy, the rhythm/tempo, AND the ONE hero moment + a narrative role per moment (setup / build / turn / payoff / aside / breather / landing). Every per-moment graphic EXPRESSES this; it never invents in a vacuum. This is what makes output AUTHORED not sprayed. Its choices are signal-driven too — so "everything signal-driven" still holds, just at the right altitude: **identity decided ONCE, emphasis decided per-moment.**
- **EYES (bimodal — heard + seen):**
  - HEARD (transcript) → the STRUCTURE / what's worth showing (comparison / proportion / trend / negation). Structure is heard-led.
  - SEEN (footage) → visual signals (energy / busyness / motion — we HAVE these: V-JEPA visual_significance / visual_change_rate / motion_intensity; verified varying per-moment) + SPATIAL (face / subject location → free-space map; we track the subject but don't yet feed it to MG) + scene-type. Governs WHETHER a graphic appears, WHERE (don't cover the face), HOW LOUD, and whether the footage already does the job. Advanced (later): when the visual IS the content (product / demo / pointing), the graphic references what's shown.
- **BRAIN (assembler):** per-moment, builds the graphic from primitives + the director's identity + signals + laws. v1 = the ~5 highest-value properties signal-driven (layout/position, size/focal, colour-mood, motion-character, emphasis); the rest = brand-derived defaults, EXPANDING over time.
- **JUDGE:** the existing human quality-review, OBSERVE-MODE first (log "good?" before it ever gates). Bespoke vision-model judge = DEFERRED (research project; revisit later).

### 13.2 The route (each stage SHIPS + is MEASURED; composers stay as the fallback until Stage 6)
1. **MEASURE + CLEAN (now, zero risk):** stand up the quality yardstick (human review, watch-only) + fix plumbing (the `selectWinners` crash, wire the 3 dead dials, drop GSAP, delete genuinely-dead code).
2. **EYES (narrow):** extraction of 3-4 structures (heard) + wire the visual/spatial signals (seen). Eval/answer-key FIRST; metric = per-structure precision + recall (confusion matrix); "unsure → keyword fallback."
3. **PROVE ONE structure end-to-end** (e.g. comparison) on the real video, real pixels. GATE: must BEAT today's output on the yardstick. Composers stay as fallback. Fails → fix before spending more.
4. **DIRECTOR + high-value properties:** add the top-down director pass + wire the ~5 signal-driven properties within its identity.
5. **CUT-CRAFT:** timing/dwell/exit signal-and-cut-driven; wire the dead audio-sync; the cut-craft laws (13.3).
6. **EXPAND + RETIRE TEMPLATES:** roll generation to all structures, widen properties to the full §3 list, build the colour subsystem (§4) fully, add the parametric-geometry shape primitive (§11) if it earns its place. Retire the composers ONLY once the generator beats them across the board. Calibrate dials on real videos (ongoing).

### 13.3 CUT-CRAFT laws (added to §6 — universal, the Editor's lens)
- A graphic EXITS on/before the next cut that ends its supporting clip (no bleeding across edits).
- Graphics avoid the FACE-SAFE region + the CAPTION-SAFE band (use the tracked subject bbox).
- DWELL time is computed (read-time of the text + salience), clamped by the cut — NOT a per-type constant.
- Land on the beat/word (wire `syncData` — it exists, one hop from the renderer).
- ANTI-SPRAY: minimum-gap/pacing law (signal-modulated) + NO-REPEAT-in-window. Restraint is relational, not a per-moment threshold.
- CAPTION CO-TENANCY: if the caption already carries the word, the bar to ALSO draw a graphic of it is much higher (no triple-redundancy).

### 13.4 What stays the destination (unchanged)
Everything signal-driven (§3) + no templates (§5) + the atoms (§11). v1 narrows to prove it SAFELY; Stage 6 reaches it fully. The composers are a temporary SEATBELT (fallback when the generator isn't confident / for uncovered moments), removed once the generator wins — so we still reach "no templates," with a net + proof instead of on faith.

### 13.5 DEFERRED (revisit at/after Stage 6, not v1)
Full ~25-property signal-driving (v1 = ~5); the new parametric-geometry renderer primitive (§11); the bespoke vision-model JUDGE; open-ended OpenIE extraction (v1 = 3-4 closed structures); the full OKLCH colour subsystem (v1 = semantic + mood-saturation/brightness on brand palette).

### 13.6 GUARDRAILS — HARDENED (per open-approach research, [[MG-Open-Approach-Shortcomings-2026-06-02]])
The NAIVE guardrails are rejected — research is convergent (10 primary papers) that they fail:
- **JUDGE is NOT a VLM score.** Vision models rate pretty-but-wrong output highly and are lenient (pass bad output); ~32-34% agreement with humans, can rank but not score absolutely. The JUDGE = the symbolic LAWS as a STRUCTURED CHECKLIST (legibility / value-correctness / motion-congruence) + the VLM only as a flag/rank assist + the HUMAN review as the real gate. (The bespoke VLM scorer stays deferred per §13.5.)
- **CONFIDENCE GATE is NOT raw LLM confidence** (≈ random for gating, AUROC ~0.55; systematically overconfident). It = eval-MEASURED per-structure thresholds (or a calibration layer / conformal prediction), never the model's self-rating.
- **EVAL with human ground-truth is MANDATORY** — there is NO automatic metric for "meaningful/right" output (Calliope's admitted limitation; the reason every shipped system keeps a menu). We cannot self-certify open generation; the human stays in the loop.
