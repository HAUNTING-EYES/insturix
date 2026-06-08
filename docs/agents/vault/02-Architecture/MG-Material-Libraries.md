# MG Material Libraries — Fonts & Color, Signal-Scored (the "register" mechanism, production spec)

Status: SPEC (2026-05-31, user-directed). Sharpens Phase B (type + color) of [[MG-Spine-Build-Plan]]; it is how the spine gets CHARACTER (the editor "meh fonts" + director "coherence≠character" gaps). #open

## Principle (keeps it consistent with no-presets)
A font / color is **paint, not a stencil** — a raw MATERIAL, one input to generation. Selecting a material by `signals × brand` and then GENERATING the composition with it is the same move as G-2 picking the brand's accent. The preset sin was picking a *finished graphic*. A big tagged material library makes the engine MORE generative. **Trap to avoid:** don't pre-bundle font+color+motion into "looks" you pick whole — let signals pick each material independently; the coherent "register" EMERGES.

Note: half the prototype's "meh fonts" is the unfixed **font-loading gap (Phase 0.1)** — no real font loaded, everything fell back to Chromium default. This spec is INERT until 0.1 ships.

## ⚠️ COLOUR CORRECTION (4-lens review, 2026-05-31 — supersedes any "signal picks a palette" framing)
The founder flagged the colour design as "weird"; all four lenses confirmed the *preset-palette* part was a category error. **→ FULL GROUNDED MODEL: [[MG-Colour-Engine]]** (4-strand research deep-dive). **Corrected rule: mood DOES drive colour — via SATURATION + BRIGHTNESS + TEMPERATURE (evidence-based: Valdez-Mehrabian, Wilms-Oberfeld physiology), NOT by swapping HUE.** Hue stays brand (sovereign) + semantic (fixed). (The earlier "mood lives only in type/motion" undersold colour's real mood role; the points below otherwise stand.)
- **HUE = brand (identity, ~always) + MEANING (a FIXED semantic set: success/warning/alarm, positive/negative — content-triggered, one element, brand-independent, mood-independent).** Arousal/mood may touch ONLY temperature/saturation (grade), never which hue an element gets. (Damage case: "hype-red because energy high" would repaint a +revenue stat red = reads as loss.)
- **A colour PALETTE is a PRESET** (more so than a font — a font is atomic paint; a 4-colour palette is a pre-bundled look). By D-017's own test ("signal picks one = a preset library"), the signal→palette picker violates the moat. The live resolver never wired it anyway (`motion-theme-resolver.ts` reads brand-hex → gold default, never the 16 palettes) — so DON'T finish building it.
- **Demote the 16 palettes to BRAND-LESS FALLBACK only** (no brand colour supplied), chosen by brand IDENTITY/category, NOT arousal; prune to the safe ones; **kill `neon-cyber #00FFC6`** (blooms/clashes) and **kill gold as the default**.
- **Derive a brand's full set with a FIXED-HUE TONAL RAMP** (same hue, stepped lightness/saturation) — NOT "rotate accent toward surface" (proven to collapse `primary` into a muddy near-invisible band). Keep the bounds (sat ≤+20%, AA contrast, skin I-line ±5°).
- **Legibility is a FOOTAGE-AWARE FLOOR, not an optional move:** MG sits OVER video, not a dark canvas. Compute a mandatory scrim/stroke from the MEASURED background luminance under each text box (the existing `surfaceBase`+`surfaceOpacity`+`backdropBlur` + `textShadow`, currently optional/0). This is the signal-driven part of colour — the contrast treatment, not the hue.
- **Fix the gold fallback:** an all-dark brand must fall back to a neutral derived from ITS OWN hexes (like the gray-brand render correctly does), never foreign gold.
Net: the FONT library stands (type/motion is the right home for mood variety); the colour half becomes **brand + semantic-meaning + footage-aware legibility**, with the palette set surviving only as a brand-less fallback + a calibration corpus.

## CANONICAL DATA → `mg-material-library.json` (this folder)
**67 fonts** across 9 categories (sans 12, geometric 11, grotesque 5, serif 11, slab 4, display 9, mono 6, script 5, rounded 4) + **16 colour palettes with real HEX codes** + `harmonyRules` (derive a full role-set from one brand hex). Each font: `{category, roles, signals{f,e,w}, personality, weights, pairsWith, constraints, googleFont}`. Each palette: `{mood, signals, surface/neutral/primary/accent HEX, harmony}`. **Validated JSON; extensible to hundreds in the same format** — this is the curated starter, the JSON is the source of truth (prose below is a human summary). **Colour:** the BRAND's own hex codes OVERRIDE the palette set; the 16 palettes + harmonyRules are the fallback/variation when the brand is sparse.

## Material = a scorable resource (same shape as overlay-definitions → reuses utility-scorer)
```
FontResource {
  id; family; category: sans|serif|slab|geometric|display|mono|script;
  role: heading | body | mono;                 // selected as PAIRS, never solo
  considerations: [{ signalId, curveType, params, invert }];  // formality/energy/warmth/… → fit score
  constraints: { minSizePx; headlineOnly?; neverCaptions? };
  pairsWith: [ids];                            // designer-vetted pairings (coherence)
  source: googleFont | local;                  // must be loadable in render (0.1)
}
ColorTreatment { id; harmony: complementary|analogous|triadic|mono|split; moodConsiderations: [...]; gradeShift; brandRoleMap }
```

## Selection mechanism (no new engine — `scoreAllOverlays`)
Score each material's `considerations` against the video's signal snapshot → best fit, **filtered by brand bounds + constraints**. Pick a **heading+body PAIR** from `pairsWith` (not two independent fonts) + **one** ColorTreatment → materials can't clash (mashup guard baked into selection). Coherence rules: max 2-3 families; contrast on ONE axis; persist per video.

## Resolution LEVEL — per VIDEO, not per moment (THE key decision)
The font pair + palette + motion family are resolved **once per project** (that bundle = the emergent "register") → different videos get different type/color WORLDS (cross-video variety = "videos have different fonts"), consistent WITHIN a video (one-font-pair / one-motion-language law). Per MOMENT, only intensity moves inside the fixed register. register = video's material picks; spine = per-moment loudness within it.

## Brand bounds (brand always wins)
Brand specifies fonts/colors → those ARE the materials (or the allowed set). Brand open → library selects by signals. Library fills gaps + varies; never overrides a brand choice ("one off-brand element breaks the spell").

## Starter font library (≈20, tagged — refine)
- **Sans (default/clean):** Inter, Plus Jakarta Sans, Geist — formality mid, energy mid, heading+body.
- **Geometric (premium):** Poppins, Montserrat, Sora — formality high, "designed," heading.
- **Serif (authority/editorial):** Playfair Display, Fraunces, Lora — formality high, warmth/authority, heading/body.
- **Slab (impact):** Zilla Slab, Bricolage Grotesque — energy high, bold, heading.
- **Display/condensed (hype):** Bebas Neue, Anton, Archivo — energy very-high, formality low, heading-only.
- **Mono (technical/data):** JetBrains Mono, Space Mono — technical, mono/stat role.
- **Script (personal):** Caveat — casual, headline-only, never <36px.
Each tags `considerations` from the doc's font-category→personality + bouba-kiki (rounded=friendly, angular=authoritative). E.g. Bebas Neue {display, energy↑, formality↓, role:heading, pairsWith:[Inter,Archivo]}; Playfair {serif, formality↑, authority, role:heading, pairsWith:[Lora,Inter]}.

## Starter color-treatment library (from doc §5.2 color-mood menu)
warm / cool / teal-orange / desaturated-muted / high-saturation / monochromatic / pastel-soft / earth-tones / neon-cyberpunk — each tagged by signal (formality, energy, valence) + brand-category, bounded by the grade limits (sat ≤+20%, temp ±500K, skin I-line ±5°, ≤2-3 grade shifts/video).

## Build capabilities (what to actually make)
1. Populate + tag the font library (the FontResource entries) + color-treatment library.
2. The selection scorer (reuse `utility-scorer`): video signals → font pair + palette, brand-bounded.
3. Font loading in the render path for the SELECTED fonts (Phase 0.1 — @remotion/google-fonts, Lambda-safe).
4. Pairing/coherence rules + the per-video resolution.
Verify on REAL VIDEO renders across ≥8 content types: two different videos → visibly different (appropriate) type/color worlds; within a video → consistent; brand-specified fonts → honored.

See [[MG-Spine-Build-Plan]] (Phase B / B2), [[MG-Visual-Language-Spine-Redesign]] (§4.1 color, §4.2 type, §6 registers).
