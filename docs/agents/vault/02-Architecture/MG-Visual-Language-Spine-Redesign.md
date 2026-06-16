# MG Visual-Language Spine — Dissolve the Type Menu, Generate from Signals

Status: PLAN (2026-05-31). Supersedes the G-7 "calibrate keyword firing" framing. Implements [[D-017-MG-Dissolve-Type-Preset-Menu]]. Grounds the spine in creative doc v3/v2 + the knowledge graph. #decided (direction) #open (build + the look-good proof)

---

## 0. The one-paragraph version
Stop letting an LLM pick a graphic TYPE from a fixed menu (keyword-highlight / stat-counter / …). Per moment: the LLM only **reads** (what's worth showing + what it is — a number, name, claim); **signals decide IF** a graphic appears (zero is normal); a **visual-language spine** resolves ONE coherent look for the moment (palette roles, type hierarchy, motion personality, intensity); the **utility scorer** selects/shapes treatments from signal-described overlays (the engine that already does this for animations); the **composition engine generates** the graphic from content-shape × spine; a **design gate** validates it can't ship ugly. The "type" emerges; it is never chosen.

---

## 1. Why (grounded — this is the documented intent, not a deviation)
- Creative doc **v3 L246-248**: *"The system should never classify content into a type and then apply preset values — that's the v2 profile problem with different names."* Content type is **EMERGENT** from computed dials (**v3 L198**). The cold-start fallback is deliberately ONE row, not eight (**v3 L286-295**).
- Yet the live pipeline does exactly the forbidden thing: the LLM picks `graphicType` from `z.enum([...])` (`unified-edit-intelligence.ts:420`, `tools.ts:4486`), and `keyword-highlight` is the catch-all default (`edl-executor.ts:1027`, `tools.ts:167`) → 8/13 collapse to it on proj_OzG2qgoYudFa.
- **The render engine is already generative** (KEEP): `planComposition` + `analyzeContentShape` + structural-move vocabulary + signal choreography; `kindMap`/`buildShapeFromKind` already removed (Tier-3). Only the **selection layer** is the preset.

## 2. Target pipeline (per moment)
1. **LLM = content extractor only** (Rule 30: language→LLM). Output: the salient text + what it is (number / name / claim / phrase / quote). NOT a graphic type.
2. **Signals gate IF** a graphic appears — falls out of the scorer's `minScore`; a calm video scores nothing → zero graphics (no separate on/off hack).
3. **Spine resolves ONE visual language** for the moment (§4).
4. **Utility scorer selects/shapes treatments** from signal-described overlays (§3 — already exists for properties; extend to appearance).
5. **Composition engine generates** the graphic from content-shape × spine × selected treatments.
6. **Design gate** validates against the constraint quality-score (§5.4); auto-corrects or suppresses.

## 3. The connection mechanism (verified in code — already runs)
`utility-scorer.ts`: every overlay/treatment declares `considerations` = `{signalId, curveType, params, invert}` ("which signals make me a good fit, and how strongly"). Per moment, the signal snapshot is scored against each overlay (each signal → response curve → 0-1, **multiplied** × `weight` = utility score). Above `minScore` = candidate; sorted by `rank` then score; **one winner per category** with `minGapFrames` spacing (`selectWinners`). The score ALSO drives each `outputParam` **within its [min,max] bounds** (`resolveOutputValues`). This already runs for `mg-property` / zoom / transition / filter; the `graphic` category exists in the winners map but the appearance decision is currently bypassed by the LLM enum. **The move = define graphic-appearance overlays (signal-described) and route the decision through this scorer.** The per-mapping `weightResponse{high/medium/low}` ladders in the graph are the intensity discretization the scorer interpolates.

## 4. THE SPINE — one visual language per moment (the new build; grounded)
Resolve these FOUR dimensions ONCE per moment; every selected treatment inherits them. Brand BOUNDS each.

### 4.1 Palette roles  (today's gap — no role constant exists; author it)
- **60% neutral / 30% primary / 10% accent** [v2 §9.1] — the documented restraint ratio for how much "loud" color a frame may carry. (v3 dropped it; restore.)
- **Accent = the one loud color, reserved for the highest-weight moment** (every mapping's `weightResponse` = "accent on the high-weight word"). G-2 already wires accent = brand's signature colour (commit d9fe9485).
- Harmony STRUCTURE from `technique:color-theory.*` (complementary=dramatic, analogous=calm, monochromatic=minimal). Persist a palette **≥10s** — `technique:color-theory.simultaneous_contrast` (Albers): colour is relational; a shift shorter than perceptual adaptation won't read.
- Hard floors: skin-tone I-line ±5° (NOT_OVERRIDABLE), saturation ceiling +20%, grade temp ±500K, ≤2-3 grade shifts/video.

### 4.2 Typography hierarchy
- **Bold headline / Regular body / Medium label** [v2 §9.1] — restore (v3 dropped). ONE font pair; **max 2-3 families; contrast on ONE axis only** (size OR weight OR style) — `>3 = ransom note`.
- Font CATEGORY from a personality signal via bouba-kiki (`theory:sound_symbolism.bouba_kiki`): rounded=friendly, angular=authoritative. Categories: sans=default, serif=authority, slab=impact, geometric=premium, mono=technical, script=headlines-only-never-<36px.
- Min sizes: `constant:typography.*` (keyword 48 / stat 64 / lower-third-name 48 / quote 42 / callout 36 / legal 24). **⚠️ RESOLVE: caption floor conflicts 48 vs 72** across three nodes (`caption.min_font_size`=48 NOT_OVERRIDABLE vs `typography.captions_min_font`=72 vs `constraint:overlay.graphic_too_small`<72). Pick one before wiring.

### 4.3 Motion personality
- **ONE entrance family per video** — `constraint:overlay.graphic_animation_inconsistency` (mixing styles "feels like different editors"). Select by **formality ladder** (>0.7 fade; 0.5-0.7 fade|slide; 0.3-0.5 scale-pop|slide; <0.3 bounce|drop|scale-pop) — `neverUseWhen formality>X` gates are the brand bound on motion.
- Exit = entrance × 0.8 (⚠️ `LEARNING_TARGET`, not a standard — 0.6-0.9 fine). Per-type enter/hold/exit from `constant:animation.*`.
- Stagger: ⚠️ INVENT the numeric curve (doc gives one-at-a-time staging + breathing-room, not a formula) — ground in `visual_clutter` (stagger new until oldest exits +0.3s).

### 4.4 Intensity / loudness  (already solved — reuse, don't invent)
- **`formality` = the register dial** (bundles animation family + grade world + caption mode + grain/shake permission). Computed from speech_formality + scene_type + visual_quality.
- **`energy_baseline` (0.2-0.8) = amplitude floor** (this video's "normal" energy).
- **`moment_weight` (0-1) = per-moment multiplier** — the amplitude knob; every mapping ships a `weightResponse` ladder (0.9→shout, 0.5→standard, 0.2→whisper/skip).
- Cross-modal grounding (`theory:spence.cross_modal_correspondences`): **louder ⇒ bigger + brighter + sharper.** That's how intensity touches all three other dimensions at once.

## 5. How "looks good," not a dirty mashup — the four guarantees
1. **Bounds, not free choice** — the scorer's `outputParams` clamp to [min,max]; signals position within, never invent.
2. **One shared look per moment** — the spine (§4). All treatments inherit one palette/type/motion/intensity, so pieces can't clash. *This is the linchpin; without it, generation IS a mashup.*
3. **Restraint** — one focal: `constraint:overlay.visual_clutter` (≤2 non-caption overlays, ">2 = viewer reads NONE"); aggregate the distributed caps (emphasis ≤1/8-10s, keyword ≤1/15s, stat not within 3s, cinematic ≤3/min, ≤3 techniques at once).
4. **Design gate** — the 100-point quality score (Critical −15 / Warning −5): contrast AA 4.5:1 (blocker), graphic<72px, clutter, caption-zone, overlap, density>130%, flash-safety (NON-overridable). Auto-correct or suppress before ship. Seeds exist: `structural-gate.ts` + `crg-constraint-validator.ts`.
- Tie-breaker when these conflict: **Murch's Rule of Six** (`theory:murch.*`) — Emotion 51% > Story 23% > Rhythm 10% > Eye-trace 7% > Planarity 5% > Spatial 4%. Sacrifice from the bottom; a graphic that's pixel-perfect but emotionally wrong loses.

## 6. Registers (optional, later) — coherent mood bundles
The only COMPLETE palette+type+motion+pacing packages in the corpus are the cultural-aesthetic nodes (doc 5.7): **Nordic-minimalism** (restrained, "editing interventions minimal — content speaks through restraint" — the "clean tech" register), **Bollywood** (maximal, rich saturation, 16-24 cuts/min), **K-drama** (patient, +30-100% holds). Seed named spine registers from these once the base spine works. A "register" = a pre-bundled {palette-roles, font-pair, motion-family, intensity-ceiling} the brand/signals select — supported by formality+culture but not yet a named primitive.

## 7. Migration path (incremental, de-risked — each step verified on REAL renders, never the test suite)
- **A. Prototype-to-SEE (do first).** → **DONE 2026-05-31: PROVEN** (`scripts/spine-prototype.ts` → `render-mg-stills spine-proto-mgs.json`). Fed the real `resolveMotionTokens → scoreAllOverlays → planComposition` chain hand-picked content + brand + signal profiles with **NO graphicType**. Result: content drove the shape (number→counter, concept→title+body, word→bold word) via `analyzeContentShape`; ONE spine = one coherent look across all (a family, not a mashup); brand swapped colour cleanly (blue↔orange); intensity showed on the type itself (energetic=UPPERCASE brand-blue bold, calm=lowercase gray quiet). Architecture viable. **Calibration findings → feed G-7c:** (1) decoration BACKWARDS — calm fired MORE structural moves than energetic (should be Nordic-minimal); re-tune so low-energy→fewer. (2) Callout hierarchy inverted — body bigger than title + low-contrast gray; needs §4.2 Bold/Regular/Medium hierarchy + contrast gate. (3) brand-pattern + ambient-particles render invisible — check if dead. (4) stats mid-count at the 0.6 frame (frame choice).
- **B. Spine resolver** — `resolveVisualLanguage(brand, signals, content)` → one visual language (the 4 dims). This subsumes G-2.2 (fonts = §4.2) and G-3 (color/intensity = §4.1/4.4) — they're spine dimensions, not separate phases.
- **C. Graphic-appearance overlays** — define them signal-described; route selection through `scoreAllOverlays`; retire the LLM type enum.
- **D. Shrink the LLM** to content extraction only.
- **E. Strengthen the design gate** (wire the full constraint set + auto-correct).
- **F. Calibration** (the "later thing") — tune curves/bounds/weights against real renders + the threshold bandit. NEVER hand-tune-and-ship.

## 8. Open issues to resolve before/in build
1. **Caption min-font 48 vs 72** conflict across 3 nodes.
2. **No accent/palette-role constant** — spine authors roles (60/30/10 from v2).
3. **`exit_speed` 0.8** is a learning target, not a standard.
4. **Font-loading gap** (this session): the MG render path loads NO fonts → MGs render in Chromium default, not the intended/brand typeface. §4.2 is moot until this is fixed (load defaults + brand font via @remotion/google-fonts in the render path).
5. **Stagger curve** must be invented (ground in staging + breathing-room).

## 9. What stands from the 2026-05-31 session
G-1 (fit), G-1b (exact measure), G-2 (brand→accent) are type-AGNOSTIC and are the FIRST spine dimension already shipped (accent role). They survive the pivot intact.

## 10. Honest risks
- Generative can look WORSE than the menu before it looks better — templates are a known-good floor; we're trading it for a higher ceiling that takes calibration to reach.
- The spine (§4.2 one shared look) is the make-or-break; weak spine = mashup, guaranteed.
- De-risk = the prototype-and-render loop (step A) + adversarial content types + calibration. Prove, don't promise.

See [[D-017-MG-Dissolve-Type-Preset-Menu]], [[MG-Generative-Spine-Phase-G]], [[Session-2026-05-31-G1-Render-Verified]].
