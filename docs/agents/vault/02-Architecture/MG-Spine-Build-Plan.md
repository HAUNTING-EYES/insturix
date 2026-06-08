# MG Spine — Executable Build Plan (v2, post 4-lens review)

Implements [[MG-Visual-Language-Spine-Redesign]] + [[D-017-MG-Dissolve-Type-Preset-Menu]]. Architecture PROVEN on pixels 2026-05-31. **Revised after CEO / eng / video-editor / director review (all four: REVISE — architecture right, sequencing+scope+framing wrong).** #open

## Convergent review verdict (what all/most lenses agreed)
1. **Floor before ceiling — pull the DESIGN GATE forward.** Trust = never shipping a broken frame, not occasionally shipping a brilliant one. (CEO #1, Editor Q4, Director GAP4)
2. **Verify MOTION, not stills.** The one real differentiator (choreography, intensity-as-motion, edit-sync) is invisible in every PNG. Render VIDEO/GIF from Phase B on. (CEO #5, Editor caveat, Director GAP5)
3. **Coherence ≠ character.** The spine currently dresses every brand in one tasteful house style = anonymous. REGISTERS + a 4-channel brand wire are the soul move, and the plan shelved registers at "later." (Director GAP1/2, CEO "why pay")
4. **Phase C blast radius is ~5 paths, not 2** — eng-verified; as written it would compile-pass while the menu survives in the paths that render. (Eng #1)
5. **"Calm → zero graphics falls out for free" is FALSE** — three independent floors prevent zero. (Eng #2)

## Hard rules
- ≤5 files/phase; flag everything reversible; threshold sourcing.
- **Verify on RENDERED VIDEO/GIF (≥2s), not stills, from Phase B on** — stills are blind to half the product.
- **Font-loading (0.1) is a HARD blocker on ALL brand/soul evaluation** — "looks coherent" before fonts load measures the wrong thing.
- Render-verify on REAL projects + ≥8 adversarial content types, never the 112-test suite.

---

## Phase 0 — Pre-reqs
- **0.1 Font loading [HARD BLOCKER].** MG render path loads NO fonts (`@remotion/google-fonts@4.0.398` is in package.json but unused; `motion-graphic-layer-content.tsx`/`composition-renderer.tsx` load zero). Until brand fonts render, the type + brand-soul dimensions are inert. Wire `loadFont` (defaults + brand font) with `delayRender`/`waitForFonts`; confirm Lambda-safe (network, timeouts, cold starts). ≤2 files.
- **0.2 Caption min-font conflict** — `crg-constraint-validator.ts:33` enforces 72 generally while per-type floors are 36-64 (lines 26-30) and `caption.min_font_size`=48. Resolve to ONE floor BEFORE the gate (Phase E) goes enforce, or the 72 floor scales every callout/quote label up. 

## Phase E (MOVED EARLY) — Design GATE = the trust floor [observe→enforce, own flag]
Ship the gate BEFORE generation so nothing ugly reaches a frame. Non-negotiable rules: **(1) nothing clips title-safe** (the editor found body text running off-frame on the callout — instant client rejection); **(2) the message-carrying element meets the contrast floor** (the callout body rendered low-contrast gray, below AA 4.5:1); **(3) focal hierarchy** (hero element outranks the rest). Eng caveat: `structural-gate.ts:14` is currently OBSERVE-only; flipping to enforce across all paths is a behavior change — ship in **observe mode + logging first**, diff would-suppress/correct counts vs current renders on ≥8 projects, flip to enforce only when false-positive suppression ≈ 0 (Rule 29). Files: structural-gate.ts, crg-constraint-validator.ts.

## Phase B — Spine resolver (now 7 dimensions, register-first)
`resolveVisualLanguage(brand, signals, content) → VisualLanguage`. **B2: select a REGISTER first** (a mood bundle — Nordic-restraint / Bollywood-maximal / K-drama-patient, from `formality × culture × brand`, doc §6) then resolve the dimensions WITHIN its bounds. Seed ≥3 so the spine produces different *worlds*, not one world recolored. Dimensions:
1. **Palette roles** — 60/30/10 surface/primary/accent (accent already shipped, G-2); harmony per register; persist ≥10s.
2. **Type hierarchy** — Bold/Regular/Medium; ONE font pair; font category from a personality signal.
3. **Motion personality** — ONE entrance family by formality; stagger from **spring physics (Motion lib)**, not a hand-picked number; exit = entrance × 0.8.
4. **Intensity** — formality × energy_baseline × moment_weight; cross-modal louder⇒bigger+brighter+sharper.
5. **Focal-rank [NEW]** — the extractor marks ONE hero; the spine sizes/places/times everything else as subordinate (authored here, validated by the gate — a gate alone can't author a focal point; Director GAP4).
6. **Subject-aware placement [NEW]** — place in negative space *opposite* the subject (reuse the 5-Track subject-tracking already used for zoom), not a fixed corner; legibility scrim/shadow so text survives over ANY footage (Editor #3, Q5).
7. **Timing-anchor [NEW]** — in-point = nearest emphasized word / cut / beat (Essentia + per-word VO already exist); out-point = read-time or next cut. "When" is what makes a graphic feel cut-in vs slapped-on (Editor Q3).
Brand = **4-channel** (font + motion + accent + density), not accent-only (Director GAP2). Restraint is **multi-axis** (count + size + contrast + color-neutrality + motion-speed + *frequency-over-time*) — energetic = bolder-when-present, NOT more-frequent (Editor Q2). Refactor `motion-theme-resolver.ts` to emit roles (one bounds layer). Files: visual-language.ts (new), motion-theme-resolver.ts, composition-planner.ts. **Type (2) + palette (1) are SELECTED from tagged MATERIAL LIBRARIES via the scorer — see [[MG-Material-Libraries]]: a font library + colour-treatment library, each entry tagged by signals ("paint, not stencils"), resolved per-VIDEO (= the register) for cross-video font/colour variety + within-video consistency. This is the character/soul fix (editor "meh fonts" + director "coherence≠character / brand = 4-channel").** COLOUR specifically → **[[MG-Colour-Engine]]** (evidence-grounded): brand-hex → OKLCH harmony derivation; mood via SATURATION/BRIGHTNESS/TEMPERATURE not hue; fixed semantic overlay; footage-aware legibility gate (WCAG vs measured background). Add an OKLCH/HCT colour-space utility + the measured-background contrast gate to this phase.

## Phase C — Dissolve the menu [PATH INVENTORY FIRST — ~5 paths]
The graphic-type decision is NOT one enum in 2 files. Eng-verified inventory (cover ALL or the menu survives where it renders):
1. **Path E (creative-brief)** — `EditTechnique` strings (`creative-brief.ts:40-41`) + the prompt `<graphic_rules>` menu (344-361). Not a `z.enum`.
2. **Path D (scorer→overlay-bridge, the fallback/moat)** — already routes appearance through the scorer, BUT emits a **fixed** `graphicType` (`overlay-definitions.json:204/245/274`) and **only `stat_graphic`+`lower_third` have resolvers** (`overlay-bridge.ts:30-42`) — the other 4 types are silently dropped. For Path D, Phase C = remove the fixed-type output + add the 4 missing content resolvers (or make `analyzeContentShape` the single content path).
3. **`GraphicIntentSchema.type`** (`unified-edit-intelligence.ts:420`) via `generateCreativeIntentPlan` → `intent-translator.ts:172/185/187/238` (active).
4. **`tools.ts:4486`** chat enum.
5. **Legacy `generateUnifiedEditPlan`** (analysis route, still imported).
**Confirm per-project which path actually renders** (proj_OzG2qgoYudFa = Path E by provenance; default/fallback = Path D) before writing code. Flag; keep the menu as production fallback through C. Files: many — scope per path.

## Phase D — LLM → extractor + NARRATIVE role [Rule 35, precision-metric]
Extract content nuggets AND **narrative role** (thesis / turn / payoff / aside / hype). Emphasis = `narrative_importance × audio_energy`, NOT loudness alone — story doesn't peak where audio peaks; the thesis is often delivered quietly (Director GAP3). Make **Murch's hierarchy a selection-time prior**, not just a gate tie-breaker. `GraphicIntentSchema.kind` already implements the content-extraction keep-half. **Metric = PRECISION** (never surface a number/name not in the transcript — objectively checkable against the hallucination guards at `edl-executor.ts:1058`), not a fuzzy F1 on subjective "worth showing" labels (Eng #4). Eval harness first.

## Phase F — Calibration (the dials)
Fix the prototype findings: decoration-BACKWARDS (low-energy ⇒ fewer moves), callout hierarchy, dead particles/brand-pattern. Add the restraint multi-axis. **Zero-graphics = an explicit gate, not "falls out"**: `creative-brief.ts:899` forces `max:Math.max(1,…)` (can't reach 0); Path D has no density-zero path; `intent-translator` injects ≥1 — reconcile all three so a calm explainer can be truly zero (Eng #2). Tune curves vs real VIDEO renders + the threshold bandit; never hand-tune-and-ship.

## Phase G — Override & per-brand learning (the steering wheel) [before GA, not optional]
The biggest strategic gap (CEO #4): agencies won't adopt a tool they can't correct. Every generated graphic editable (color / type / position / on-off); **every override is the training signal** feeding the per-brand spine (the Graphiti bridge already decided, [[D-015-Graphiti-Signal-Bridge]]). Product story: *"generates the on-brand first draft; you nudge; it learns your brand."* This — not "generation" — is what beats Canva for this ICP.

---

## Scope — ship a narrow v0 first (CEO #3)
Do NOT ship the monolith. **v0 = Phase 0 + E-gate + B (register + palette/type/motion; skip the intensity cleverness)** generating the 3 already-proven shapes (number / concept / word). **Defer C/D/narrative/override behind the feature flag until v0 — rendered as VIDEO — beats the preset on the buyer test below.** Keep the type-menu as the production floor; let the spine override when confident.

## Success criteria — buyer-framed + motion (CEO #2, Director GAP2)
Given one brand kit, render 20 moments of a real project **AS VIDEO**: a marketer rates **≥16/20 "on-brand + broadcast-quality," identifies ZERO as template-stock**; two different brands differ in **typeface AND motion AND colour** (not colour alone); **calm = quieter + fewer + can-be-zero, energetic = bolder-when-present (not more frequent)**; **zero clipped or unreadable frames**; calm eases / energetic snaps (watched, not inferred). **Gate Phase C on THIS**, not "compiles + varies."

## Scope boundary (Eng #5)
This dissolves ONLY the graphic-type menu. Transitions / zoom / shake legitimately remain enums (a transition is a discrete operation with no "content shape"; a graphic's form must follow its content). State this so the principle isn't read as inconsistent.

## Sequencing
**0 → E (gate, observe→enforce) → B (spine, register-first) → C (path-inventory-first, flagged) → D (extractor+narrative) → F (calibrate) → G (override+learn).** Highest risk = C (revert-ready flag, verify on multiple real projects incl. a calm one). Each phase a separate commit, render-verified as VIDEO.

## What already stands (2026-05-31)
G-1 (fit), G-1b (exact measure), G-2 (brand accent — the first shipped spine dimension). The render harness is the verification rig (extend it to emit MP4/GIF, not just stills).

See [[MG-Visual-Language-Spine-Redesign]], [[D-017-MG-Dissolve-Type-Preset-Menu]], [[Session-2026-05-31-G1-Render-Verified]].
