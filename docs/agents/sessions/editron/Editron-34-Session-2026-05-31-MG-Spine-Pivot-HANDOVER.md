# SESSION HANDOVER — 2026-05-31 — MG Spine Architecture Pivot + Colour Engine

> **This is the canonical handover for the MG redesign arc.** Supersedes [[session_handover_2026_05_31_mg_g1_brushwork]] (that was the *kickoff*; this is where the arc actually landed). Read this FIRST next session. Everything below is VERIFIED against the codebase this session (git, grep) — file:line and commit hashes are real, not remembered. #open

---

## 0. TL;DR — if you read nothing else (5 things)

1. **We pivoted the whole MG architecture.** The system used to let an LLM pick a graphic *type* from a fixed menu (`keyword-highlight` / `stat-counter` / …). That is the v2-profile-preset sin in new clothes, and it collapsed 8/13 graphics on a real project to one type. **New model ([[D-017-MG-Dissolve-Type-Preset-Menu]]): LLM only READS content → signals gate IF a graphic appears → a visual-language SPINE resolves ONE coherent look → the utility-scorer selects treatments → the engine GENERATES → the type EMERGES.** It is never chosen.
2. **3 commits shipped & render-verified, NOT pushed:** `404a8e38` (G-1 text-fit), `d9fe9485` (G-2 brand→render), `42a01786` (G-1b exact canvas measure). All on `infrastructure-improvs-+Editron`, 3 ahead of origin.
3. **The #1 blocker is invisible and verified:** the MG render path **loads ZERO fonts** (no `loadFont` anywhere in `lib/editron/motion-graphics`). Until Phase 0.1 fixes this, ALL type + brand-soul work renders in Chromium default and any "looks coherent" judgement measures the wrong thing.
4. **The plan was reviewed by 4 lenses (CEO / eng / video-editor / director) and REVISED.** All four: architecture right, *sequencing + scope + framing* wrong. The revised, executable plan is [[MG-Spine-Build-Plan]] (v2). **Headline change: ship the DESIGN GATE first (floor before ceiling), verify on VIDEO not stills, treat brand as 4 channels not just accent colour.**
5. **The colour sub-system got a research deep-dive and the founder was proven RIGHT.** Colour DOES carry mood — via **saturation + brightness + temperature**, NOT by swapping hue. Brand hue stays sovereign; palette is *derived* from the brand hex via OKLCH (not a preset menu). Grounded spec: [[MG-Colour-Engine]]. (I had earlier overcorrected to "colour carries no mood" — that was wrong; corrected everywhere.)

**Nothing is in production. The architecture is PROVEN on pixels + a prototype; the production wire is planned-and-reviewed but NOT started.** Next session = build, starting at Phase 0.

---

## 1. Where the code is (orient here first)

| What | Value |
|---|---|
| Branch | `infrastructure-improvs-+Editron` (the deploy branch) |
| Worktree | `D:\google downloads\Front-End-main\editron-worktree\` |
| Vercel project | `prj_uAwH5pAHMWaOiRNbS7FZuejWXUuc` |
| Preview DB | `editron_prev` · Prod DB `editron_prod` |
| Test project used all session | `proj_OzG2qgoYudFa` (renders via **Path E**, proven by `metadata.edlSource="creative-brief:..."`) |

### Commits this session (3, UNPUSHED — 3 ahead of origin)
```
42a01786 perf(editron): MG text fit uses exact canvas measurement (G-1b)
d9fe9485 fix(editron): wire customer brand into MG render — no more DEFAULT_BRAND gold (G-2)
404a8e38 fix(editron): MG text fit-to-box + no mid-word break (G-1 brushwork)
```
### Already pushed earlier in this arc (the signal-pipeline fixes — DO NOT re-touch, they work)
```
ceb6ae8f TRIBE idempotency guard (duplicate QStash bails)
8017a70a MG monotony — per-frame signals into Path-E (not a flat average)
14f9a0a1 QStash Upstash-Timeout needs a unit ('800'->'800s')
b83832c1 TRIBE worker double-fire — QStash timeout match
5021666b MG 0-graphics — thread graphicsDensity through EDL graphic path
93ea08cb chore: remove dead code in composition-planner
4eb80496 MG numeric stat rendering — fractions/suffixed values + legible labels
5d2e1223 MG backdrop opacity — surfaceOpacity is under color, not surface
25371c4d chore: gitignore hardening — never stage .env.local.* secrets
```

### Uncommitted / untracked (status --short) — **all intentional, see footguns**
- `.calibration-temp/` — the rendered PNGs (the eyes of the operation).
- `scripts/*.ts` (~24 files) — the render/verify/probe harness. **THESE HOLD A MONGO URI. NEVER `git add` them. NEVER `git add -A`.** Add individual real source files by path only.
- `.g1-diff.txt`, `modal/__pycache__/` — scratch, ignore.

---

## 2. How to SEE output — the render/verification harness (this is your eyes)

The 112-test suite **injects `mgScores` and masks render bugs** — it will tell you everything passes while the pixels are broken. **Verify on REAL renders, always.** The rig:

- **`scripts/render-mg-stills.ts`** — the good path. Remotion SSR `bundle()` + `renderStill`. Reads MG JSON dumps, renders PNGs to `.calibration-temp/mg-stills/<set>/`.
  - **Webpack alias gotcha (will cost you an hour if forgotten):** the bundler does NOT resolve the `@/` path alias by default. The override maps it: `alias: { ...config.resolve?.alias, '@': path.resolve(process.cwd()) }`, and disables `@remotion/compositor-*`. Keep this.
- **`scripts/dump-proj-mgs.ts`** — pulls a project's real MG decisions from Mongo → JSON the renderer eats.
- **`scripts/adversarial-mg.ts`** — generates the ≥8 hard content types (Rule 29 destructive test).
- **`scripts/spine-prototype.ts`** — the no-type-menu proof: feeds hand-picked content+brand+signals through the REAL `resolveMotionTokens → scoreAllOverlays → planComposition` chain with NO graphicType, dumps `spine-proto-mgs.json`.
- **`scripts/verify-brand-wire.ts`** — proves brand hex reaches the render (G-2).

### PNG locations (exact — the founder asked for these)
```
D:\google downloads\Front-End-main\editron-worktree\.calibration-temp\mg-stills\
   proj_OzG2qgoYudFa\   ← the real project's 13 graphics
   adversarial\         ← the ≥8 hard cases (G-1 size test)
   brands\              ← brand-swap proof (G-2: blue↔orange↔gray)
   spine-proto\         ← the generative-spine proof
```

### ⚠️ DECOY: `scripts/render-mg-real.ts`
Do **NOT** use it. It calls `buildTextStyle(c, NEUTRAL)` with 2 args, omits `fittedSizePx`, and renders the OLD broken (pre-G-1) output — it will make you think G-1 regressed. Use `render-mg-stills.ts`.

### Owed: the harness renders STILLS only. The 4-lens review's #2 finding = **MOTION is the real product and is invisible in every PNG.** Extend the harness to emit MP4/GIF (≥2s) before judging Phase B onward. Stills are blind to choreography, intensity-as-motion, and edit-sync — the actual differentiators.

---

## 3. THE PIVOT (the headline) — dissolve the type-preset menu · [[D-017-MG-Dissolve-Type-Preset-Menu]]

### Why (this is documented intent, not a deviation)
- Creative doc **v3 L246-248**: *"The system should never classify content into a type and then apply preset values — that's the v2 profile problem with different names."* Type is **EMERGENT** from computed dials (v3 L198). Cold-start fallback is deliberately ONE row, not eight (v3 L286-295).
- But the live pipeline does exactly the forbidden thing: LLM picks `graphicType` from `z.enum([...])` (`unified-edit-intelligence.ts:420`, `tools.ts:4486`); `keyword-highlight` is the catch-all default (`edl-executor.ts:1027`). Result on proj_OzG2qgoYudFa: **8/13 graphics collapsed to keyword-highlight** → monotony. That monotony was the symptom the founder flagged that started the whole pivot.
- **The render engine is ALREADY generative** (KEEP it): `planComposition` + `analyzeContentShape` + structural-move vocabulary + signal choreography. `kindMap`/`buildShapeFromKind` were already removed in Tier-3. **Only the selection layer is the preset.** We are dissolving the menu, not rebuilding the engine.

### Target pipeline (per moment)
1. **LLM = content extractor only** (Rule 30: language→LLM). Outputs salient text + what it IS (number / name / claim / phrase / quote) — NOT a type.
2. **Signals gate IF** a graphic appears — falls out of the scorer's `minScore`; calm video scores nothing → zero graphics (no on/off hack).
3. **Spine resolves ONE visual language** for the moment (palette roles, type hierarchy, motion personality, intensity — see §5).
4. **Utility scorer selects/shapes treatments** from signal-described overlays (the engine that already does zoom/transition/filter).
5. **Composition engine generates** from content-shape × spine × treatments.
6. **Design gate validates** — auto-correct or suppress before ship.

### The connection mechanism — VERIFIED already running (this is why it'll work)
`utility-scorer.ts`: every overlay declares `considerations = {signalId, curveType, params, invert}` ("which signals make me a good fit, how strongly"). Per moment: signal snapshot → each signal's response curve → 0-1 → **multiplied × weight** = utility score. Above `minScore` = candidate; `selectWinners` picks one-per-category with `minGapFrames` spacing; the score also drives each `outputParam` **within its [min,max] bounds** (`resolveOutputValues`). **This already runs for `mg-property`/zoom/transition/filter.** The `graphic` category exists in the winners map but its appearance is currently bypassed by the LLM enum. **The move = define graphic-appearance overlays (signal-described) + route the decision through this scorer.** No new engine.

### Scope boundary (so the principle isn't read as inconsistent)
This dissolves ONLY the graphic-type menu. **Transitions / zoom / shake legitimately stay enums** — a transition is a discrete operation with no "content shape"; a graphic's *form must follow its content*, so it can't be a fixed menu.

---

## 4. "Will it look good, or a dirty mashup?" — the proof + the four guarantees

The founder's central worry. We PROVED it on pixels (`spine-prototype.ts` → `spine-proto/`): fed the real chain hand-picked content+brand+signals with NO graphicType. Result: content drove the shape (number→counter, concept→title+body, word→bold word) via `analyzeContentShape`; **ONE spine = one coherent family across all of them (not a mashup)**; brand swapped colour cleanly (blue↔orange); intensity showed on the type itself (energetic = UPPERCASE brand-blue bold, calm = lowercase gray quiet). **Architecture viable.**

The four guarantees that keep generation from being a mashup:
1. **Bounds, not free choice** — the scorer clamps every output to [min,max]; signals position within, never invent.
2. **One shared look per moment** — the spine. All treatments inherit one palette/type/motion/intensity, so pieces *can't* clash. **This is the linchpin; weak spine = guaranteed mashup.**
3. **Restraint** — one focal (`constraint:overlay.visual_clutter`: ≤2 non-caption overlays, ">2 = viewer reads NONE") + the distributed caps.
4. **Design gate** — the 100-point quality score (contrast AA 4.5:1 blocker, graphic<72px, clutter, caption-zone, overlap, density>130%, flash-safety). Tie-breaker when guarantees conflict: **Murch's Rule of Six** (Emotion 51% > Story 23% > Rhythm 10% > Eye-trace 7% > Planarity 5% > Spatial 4%) — sacrifice from the bottom.

**Honest risk (write this on the wall):** generative can look WORSE than the menu before it looks better. The menu is a known-good floor; we're trading it for a higher ceiling that takes calibration to reach. De-risk = the prototype→render loop + adversarial types + calibration. **Prove, don't promise. Keep the menu as the production fallback behind a flag until the spine beats it on the buyer test (§8).**

---

## 5. The SPINE — one visual language per moment (the new build, 7 dimensions)

`resolveVisualLanguage(brand, signals, content) → VisualLanguage`. **Register-first** (B2): select a mood bundle (Nordic-restraint / Bollywood-maximal / K-drama-patient — from `formality × culture × brand`, doc §6) THEN resolve dimensions within its bounds, so the spine produces different *worlds*, not one world recoloured.

1. **Palette roles** — 60/30/10 surface/primary/accent (accent shipped in G-2); harmony per register; persist ≥10s. → governed by [[MG-Colour-Engine]].
2. **Type hierarchy** — Bold/Regular/Medium; ONE font pair; category from a personality signal (bouba-kiki: rounded=friendly, angular=authoritative). → selected from [[MG-Material-Libraries]].
3. **Motion personality** — ONE entrance family by formality; stagger from **spring physics (Motion lib)**, not a hand-picked number; exit = entrance × 0.8.
4. **Intensity** — formality × energy_baseline × moment_weight; cross-modal **louder ⇒ bigger + brighter + sharper**.
5. **Focal-rank [NEW]** — extractor marks ONE hero; spine sizes/places/times the rest as subordinate (a gate alone can't AUTHOR a focal point — director GAP4).
6. **Subject-aware placement [NEW]** — place in negative space *opposite* the subject (reuse 5-Track subject-tracking from zoom); scrim/shadow so text survives over ANY footage.
7. **Timing-anchor [NEW]** — in-point = nearest emphasized word / cut / beat (Essentia + per-word VO already exist); out-point = read-time or next cut. "When" is what makes a graphic feel cut-in vs slapped-on.

**Brand = 4 channels** (font + motion + accent + density), not accent-only. **Restraint = multi-axis** (count + size + contrast + colour-neutrality + motion-speed + *frequency-over-time*) — energetic = **bolder-when-present, NOT more-frequent**.

---

## 6. The COLOUR deep-dive — founder was right · [[MG-Colour-Engine]]

The founder flagged the colour design as "weird." The 4-lens review confirmed the *preset-palette* part was a category error. THEN a 4-strand research deep-dive (colour-emotion science · harmony/colour-space · semantic/cultural/accessibility · film craft) reformed it on evidence. **Key correction: the founder's "colours give mood" instinct was RIGHT** — I had earlier overcorrected to "mood lives only in type/motion," which the literature flatly contradicts. The science just tells us *which dial*.

### The reconciled model
- **Colour carries mood via SATURATION (→ arousal) + BRIGHTNESS (→ valence) + TEMPERATURE — NOT by swapping hue.**
- **Hue is sovereign + fixed:** brand hue = a Distinctive Brand Asset (Ehrenberg-Bass; trademark-grade); semantic hue = a fixed set (red=loss, green=gain) that mood may NOT override. A "−40%" stat rendered green is a correctness bug, not a style choice.
- **Palette is DERIVED, not picked:** brand hex → **OKLCH** decomposition → fixed-hue tonal ramp + chroma taper → harmony rotation for the accent. Use OKLCH (Ottosson 2020), **NOT HSL** — HSL lies about lightness, which is exactly what caused the earlier "muddy near-invisible primary" bug.
- **Contrast = verified, not assumed:** Material ΔTone≥50→4.5:1 as proposer; ALWAYS verify the real pair with WCAG 2.2 vs the **actual composited background**. APCA is optional polish (removed from WCAG3 draft 2023, not ratified → don't rely on it legally).
- **Footage-aware legibility gate (hard, last):** MGs sit OVER video, not a dark canvas. MEASURE the background luminance under each text box across several frames; escalate cheapest-first (flip text colour → shadow → stroke → adaptive scrim) until ≥4.5:1. **Legibility wins over mood every time.**
- **CVD:** Okabe-Ito categorical set, double-encode meaning (icon/▲▼/sign, never colour alone — ~8% of men are red-green CVD).
- **Graphiti** tunes per-brand: accepted/overridden colours + preferred harmonies feed back as per-brand biases.

### The science (cited, verified this session)
Valdez & Mehrabian 1994 (`Pleasure=0.69·B+0.22·S; Arousal=−0.31·B+0.60·S`); Wilms & Oberfeld 2018 (saturation+brightness drive arousal/valence in **skin conductance**, not just self-report); Gao et al. 2007 (chroma+lightness **dominate hue across 7 cultures**); Jonauskaite 2020 (30-nation hue-emotion core + cultural overlay). **"Red boosts attention/performance/attraction" = replication-DEBUNKED myth — do not encode it.** OKLCH/OKLab (Ottosson); Material HCT + tone-delta; Tailwind v4 chroma-taper; WCAG 2.2 + APCA status; Ehrenberg-Bass distinctive assets; Okabe-Ito (Wong, Nature Methods); Storaro *Writing with Light*; Pixar colour-script (mood is a **trajectory** across the timeline, not one flat grade).

---

## 7. Material libraries — fonts + colour as scorable "paint" · [[MG-Material-Libraries]] + `mg-material-library.json`

**Principle:** a font/colour is **paint, not a stencil** — a raw material, one input to generation. Selecting a material by `signals × brand` then GENERATING with it is the same move as G-2 picking the brand accent. The preset sin was picking a *finished graphic*. A big tagged material library makes the engine MORE generative. **Trap:** don't pre-bundle font+colour+motion into "looks" you pick whole — let signals pick each material independently; the coherent register EMERGES.

- **Canonical data: `02-Architecture/mg-material-library.json`** (VALID JSON, this folder): **67 fonts** across 9 categories (sans/geometric/grotesque/serif/slab/display/mono/script/rounded) + 16 palettes + `harmonyRules`. Each font: `{category, roles, signals{f,e,w}, personality, weights, pairsWith, constraints, googleFont}`. Extensible to hundreds in the same format — this is the curated starter, the JSON is the source of truth.
- **Resolution level = per VIDEO, not per moment** (THE key decision): font pair + palette + motion family resolved ONCE per project (that bundle = the emergent "register") → different videos get different type/colour WORLDS (the "videos have different fonts" variety the founder wanted), consistent WITHIN a video. Per moment, only intensity moves inside the fixed register.
- **Reuses the same scorer** (`scoreAllOverlays`) — materials are scorable resources with `considerations`, no new engine. Pick a heading+body PAIR from `pairsWith` (never two independent fonts) so materials can't clash.
- **Colour half is governed by [[MG-Colour-Engine]]** (the 16 palettes are demoted to brand-LESS fallback only). The FONT half stands as-is.
- **INERT until Phase 0.1** (font loading) ships — see §9.

---

## 8. The build plan — reviewed & sequenced · [[MG-Spine-Build-Plan]] (v2)

### 4-lens review verdict (CEO / eng / video-editor / director — all four said REVISE: architecture right, sequencing+scope+framing wrong). Convergent findings:
1. **Floor before ceiling — pull the DESIGN GATE forward.** Trust = never shipping a broken frame, not occasionally shipping a brilliant one.
2. **Verify MOTION, not stills.** The one real differentiator is invisible in every PNG. Render VIDEO/GIF from Phase B on.
3. **Coherence ≠ character.** The spine currently dresses every brand in one tasteful house style = anonymous. **Registers + a 4-channel brand wire are the soul move.**
4. **Phase C blast radius is ~5 paths, not 2** (eng-verified — see §9). As written it would compile-pass while the menu survives where it renders.
5. **"Calm → zero graphics for free" is FALSE** — three independent floors prevent zero.

### Phase sequence (each = a separate commit, render-verified as VIDEO)
**0 → E → B → C → D → F → G**
- **Phase 0 — pre-reqs.** 0.1 Font loading **[HARD BLOCKER]** (wire `loadFont` defaults + brand font, Lambda-safe). 0.2 Caption min-font 48-vs-72 reconcile.
- **Phase E (moved EARLY) — Design GATE = the trust floor.** Ship in **observe mode + logging first**, diff would-suppress counts on ≥8 projects, flip to enforce only when false-positive suppression ≈ 0 (Rule 29). `structural-gate.ts` is currently OBSERVE-only. Rules: nothing clips title-safe; message-element meets contrast floor; focal hierarchy.
- **Phase B — Spine resolver (register-first, the 7 dims above).** Subsumes the old G-2.2/G-3.
- **Phase C — Dissolve the menu (PATH-INVENTORY-FIRST, flagged).** See §9 for the 5 paths.
- **Phase D — LLM → extractor + NARRATIVE role** (thesis/turn/payoff/aside/hype). Emphasis = `narrative_importance × audio_energy`, NOT loudness alone. **Metric = PRECISION** (never surface a number/name not in the transcript — objectively checkable), not a fuzzy F1.
- **Phase F — Calibration** (the dials; fix decoration-backwards, callout hierarchy; reconcile the zero-graphics floors).
- **Phase G — Override & per-brand learning** (the steering wheel; every override = a training signal → the Graphiti bridge [[D-015-Graphiti-Signal-Bridge]]). CEO: *this*, not "generation," is what beats Canva for agencies.

### Scope — ship a NARROW v0 first
**v0 = Phase 0 + E-gate + B (register + palette/type/motion; skip the intensity cleverness)** generating the 3 already-proven shapes (number/concept/word). Defer C/D/override behind the flag until v0 — **rendered as VIDEO** — beats the preset on the buyer test. Keep the type-menu as the production floor.

### Success criteria (buyer-framed + motion — gate Phase C on THIS, not "compiles + varies")
Given one brand kit, render **20 moments of a real project AS VIDEO**: a marketer rates **≥16/20 "on-brand + broadcast-quality," identifies ZERO as template-stock**; two brands differ in **typeface AND motion AND colour** (not colour alone); **calm = quieter + fewer + can-be-zero, energetic = bolder-when-present (not more frequent)**; **zero clipped or unreadable frames**; calm eases / energetic snaps (watched, not inferred).

---

## 9. Open issues / blockers (the landmines — resolve before/in the relevant phase)

1. **Font-loading gap [HARD BLOCKER, VERIFIED]** — zero `loadFont`/`@remotion/google-fonts`/`waitForFonts` in `lib/editron/motion-graphics`. `@remotion/google-fonts@4.0.398` is in package.json but unused. **Until this ships, §5.2/§7 are inert and any "looks coherent" judgement is invalid.** Wire defaults + brand font via `delayRender`/`waitForFonts`; confirm Lambda-safe (network, cold starts).
2. **Caption min-font 48 vs 72 conflict** across 3 nodes: `caption.min_font_size`=48 (NOT_OVERRIDABLE) vs `typography.captions_min_font`=72 vs `crg-constraint-validator.ts:33` enforces 72. Pick ONE floor before the gate goes enforce.
3. **Zero-graphics has THREE floors that each prevent zero** (so "calm→0 falls out" is false): `creative-brief.ts:899` forces `max:Math.max(1,…)`; Path D has no density-zero path; `intent-translator` injects ≥1. Reconcile all three in Phase F so a calm explainer can be truly zero.
4. **The type menu is ~5 paths, not 2** (cover ALL or it survives where it renders):
   - **Path E (creative-brief, ACTIVE for proj_OzG2qgoYudFa)** — `EditTechnique` strings (`creative-brief.ts:40-41`) + prompt `<graphic_rules>` menu (344-361).
   - **Path D (scorer→overlay-bridge, the fallback/moat)** — already routes appearance through the scorer BUT emits a **fixed** `graphicType` (`overlay-definitions.json:204/245/274`) and **only `stat_graphic`+`lower_third` have resolvers** (`overlay-bridge.ts:30-42`) — **the other 4 types are silently dropped.** Phase C here = remove fixed-type output + add the 4 missing resolvers (or make `analyzeContentShape` the single content path).
   - **`GraphicIntentSchema.type`** (`unified-edit-intelligence.ts:420`) → `intent-translator.ts:172/185/187/238`.
   - **`tools.ts:4486`** chat enum.
   - **Legacy `generateUnifiedEditPlan`** (analysis route, still imported).
   - Total `graphicType`/`z.enum`/`keyword-highlight`/`EditTechnique` footprint = **163 occurrences / 19 files** (grep-verified) → flag everything, keep the menu as fallback through C.
5. **`exit_speed` 0.8 = a LEARNING_TARGET, not a standard** (0.6-0.9 fine) — don't hardcode it as gospel.
6. **Stagger curve must be INVENTED** — the doc gives one-at-a-time staging + breathing-room, not a formula. Ground it in `visual_clutter` (stagger new until oldest exits +0.3s), mark ⚠️ INVENTED.
7. **DEFAULT_BRAND gold** lives at `motion-theme-resolver.ts:133-140` (gold `#D4A652`). G-2 fixed the wire so a real brand reaches `edl-executor.ts:1128`, but the gold fallback still fires when no brand is supplied — and an all-dark brand must fall back to a neutral derived from ITS OWN hexes, never foreign gold.

---

## 10. Verified vs NOT (honesty gate — Rule 34: "works" = produced output in a real run)

| Claim | Level | Evidence |
|---|---|---|
| G-1 text fits box, no mid-word break | **PIXELS VERIFIED** | rendered proj_OzG2qgoYudFa + 10 adversarial, no damage-8 |
| G-1b exact measure beats estimate | **PIXELS VERIFIED** | native `measureText` vs invented 0.6/0.68/1.05 ratios |
| G-2 brand hex reaches render | **VERIFIED** | `verify-brand-wire.ts` + grep `edl-executor.ts:1128` |
| Generative spine looks designed, not mashup | **PROTOTYPE-PROVEN (stills)** | `spine-proto/` PNGs |
| Spine looks good in MOTION | **NOT VERIFIED** | harness renders stills only — owed |
| Production wire of the pivot | **NOT STARTED** | planned + reviewed only |
| Colour engine / OKLCH derivation | **SPEC ONLY** | [[MG-Colour-Engine]], no code |
| Font/material library selection | **SPEC + DATA ONLY** | JSON exists, no scorer wire, fonts don't even load |

---

## 11. Techniques & learnings (the meta — what makes work in THIS codebase smooth)

1. **Verify on REAL renders, never the 112-test suite** — it injects `mgScores` and masks render bugs. This has bitten every prior session.
2. **`render-mg-real.ts` is a DECOY** (2-arg `buildTextStyle`, no `fittedSizePx` → old broken output). Use `render-mg-stills.ts`.
3. **Remotion bundler needs the `@/` alias mapped** in `webpackOverride` (`'@': path.resolve(process.cwd())`) + `@remotion/compositor-*` disabled, or `@/` imports fail.
4. **U+00A0 (nbsp) footgun** — invisible non-breaking spaces in source break exact-match `Edit` calls. When an edit fails on text that looks identical, grep the exact bytes / re-Read and copy the literal string.
5. **Native `measureText` > invented width ratios** — G-1's `estimateTextWidth` used invented 0.6/0.68/1.05 ratios; G-1b replaced them with real canvas measurement. When you can measure, measure.
6. **When relaying a review, don't over-rotate.** I took "palette is a preset" and over-generalised to "colour carries no mood" — wrong, and it took a research deep-dive to undo. Verify a strong claim against primary sources before baking it into a plan. (The founder caught this — trust the domain instinct, then go verify it.)
7. **Path provenance is your friend** — `metadata.edlSource` tells you which of the 5 paths actually rendered a given project. Check it before editing "the" path.
8. **The signal pipeline WORKS — do not re-fix it.** The monotony was the *type menu*, not the signals (the previous session already fixed per-frame signal injection, 8017a70a). Conflating the two wastes a session.
9. **Don't edit during a verify sprint** — a prior session broke the pipeline by editing mid-verification (`'800'` missing the Go duration unit → HTTP 400). Verify, THEN edit, THEN re-verify.

---

## 12. Research index (so you don't re-search)

- **Creative knowledge:** `creative_production_knowledge_v3 (1).md` (5838 lines, signal-centric) + v2 PDF; **knowledge graph** `lib/editron/data/creative-knowledge-graph.json` (671 nodes, 799 edges) + part files in `creative-graph-parts/`. **Query this before any creative decision.** Key nodes used this session: `constraint:overlay.visual_clutter`, `theory:murch.*`, `theory:spence.cross_modal_correspondences`, `theory:sound_symbolism.bouba_kiki`, `technique:color-theory.*`, `constant:typography.*`, `constant:animation.*`.
- **Colour science:** Valdez-Mehrabian 1994 · Wilms-Oberfeld 2018 · Gao 2007 · Jonauskaite 2020 · Elliot-Maier colour-in-context · Palmer-Schloss EVT 2010 · Ottosson OKLCH 2020 · Material HCT/tone-delta · Tailwind v4 chroma-taper · WCAG 2.2 + APCA status · Okabe-Ito CVD · Ehrenberg-Bass · Storaro · Pixar colour-script. Full list in [[MG-Colour-Engine]] §Sources.
- **Material/type:** bouba-kiki sound-symbolism for font-category→personality; `@remotion/google-fonts` for Lambda-safe loading.

---

## 13. What next (immediate, in order)

1. **Phase 0.1 — wire font loading** in the MG render path (HARD BLOCKER; everything type/brand is inert without it). ≤2 files, Lambda-safe.
2. **Phase 0.2 — reconcile the caption 48-vs-72 floor** to one number.
3. **Extend the harness to emit MP4/GIF** (so Phase B+ is verified on MOTION, per review finding #2).
4. **Phase E — design gate in observe mode** + log would-suppress counts on ≥8 real projects; flip to enforce only at ≈0 false-positives.
5. **Phase B — `resolveVisualLanguage` (register-first)**, the 7 dimensions, wired to [[MG-Material-Libraries]] + [[MG-Colour-Engine]].
6. Then **C → D → F → G** per [[MG-Spine-Build-Plan]], gating Phase C on the buyer test (§8), keeping the menu as fallback behind a flag the whole way.
7. **Push the 3 G-commits** when the founder approves (currently local-only).

---

## 14. Footguns (consolidated — the "don't repeat my mistakes" list)
- **NEVER `git add -A` / `git add scripts/`** — the harness scripts hold a Mongo URI. Add real source files by explicit path only.
- **`render-mg-real.ts` is a decoy** — use `render-mg-stills.ts`.
- **The 112-test suite masks render bugs** — verify on real renders.
- **U+00A0 nbsp** breaks exact-match edits.
- **Remotion `@/` alias** must be in webpackOverride.
- **Gold default** (`motion-theme-resolver.ts:133`) fires whenever brand is absent.
- **Don't re-fix the signal pipeline** — it works; the menu was the problem.

---

## 15. Doc index — everything written/touched this session

**Vault (`D:\Insturix-Brain\`):**
- `03-Decisions/D-017-MG-Dissolve-Type-Preset-Menu.md` — the decision (#decided)
- `02-Architecture/MG-Visual-Language-Spine-Redesign.md` — the full architecture + the look-good proof
- `02-Architecture/MG-Spine-Build-Plan.md` — **v2, 4-lens reviewed, executable** (start here to build)
- `02-Architecture/MG-Material-Libraries.md` — fonts + colour as scorable paint
- `02-Architecture/mg-material-library.json` — 67 fonts / 16 palettes / harmonyRules (the data)
- `02-Architecture/MG-Colour-Engine.md` — **the evidence-grounded colour spec** (founder was right)
- `04-Session-Notes/Session-2026-05-31-G1-Render-Verified.md` — the G-1 verification note
- `04-Session-Notes/Session-2026-05-31-MG-Spine-Pivot-HANDOVER.md` — **this doc**

**Memory (`C:\Users\admin\.claude\projects\D--google-downloads-Front-End-main\memory\`):**
- `mg_render_harness.md` — how to render/verify
- `mg_no_preset_menu.md` — the pivot in one file
- `session_handover_2026_05_31_mg_spine_pivot.md` — the memory mirror of this handover

See [[D-017-MG-Dissolve-Type-Preset-Menu]], [[MG-Spine-Build-Plan]], [[MG-Visual-Language-Spine-Redesign]], [[MG-Colour-Engine]], [[MG-Material-Libraries]].
