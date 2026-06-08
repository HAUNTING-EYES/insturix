# MG Colour Engine — Signal-Driven, Brand-Sovereign, Evidence-Grounded

Status: SPEC (2026-05-31). Supersedes the over-correction in [[MG-Material-Libraries]] ("colour carries no mood"). Grounded in a 4-strand research deep-dive (colour-emotion science · harmony/colour-space · semantic/cultural/accessibility · film/MG craft). Founder was right: **colour carries mood** — the science says *how*. #decided (model) #open (build + calibration)

## Thesis (the reconciliation)
Colour DOES carry mood — but via **saturation, brightness, and temperature**, NOT by swapping hue. The brand's **hue is sovereign** (identity/trademark-grade asset); signals move mood **along the brand's saturation/value/temperature ramps**; the full palette is **derived from the brand hex via OKLCH harmony** (generated, not a preset menu); a **fixed semantic overlay** carries meaning (red=loss, green=gain) and may not be mood-overridden; and a **footage-aware legibility gate** is the hard, last constraint. Graphiti learns each brand's preferences over time. Brand + video + signals + Graphiti all feed it — exactly the founder's model.

## CONSTRAINT HIERARCHY (mood operates only inside what's left)
1. **Accessibility (hard, computed):** WCAG 2.2 AA contrast — **4.5:1 normal / 3:1 large** — vs the ACTUAL composited background; CVD-safe categorical encoding + double-encode meaning (icon/▲▼/sign, never colour alone; ~8% of men are red-green CVD). APCA (Lc) = optional quality booster, NOT a replacement (removed from WCAG3 draft 2023; not ratified → legal risk to rely on it).
2. **Semantic correctness (hard, data-bearing):** red=danger/loss, green=success/gain, amber=warning, blue=info — hue follows the data's MEANING, not the video's mood; status colours stay distinct from brand. A "−40%" stat in green = a correctness bug.
3. **Brand hue sovereignty (hard, when brand supplied):** preserve the identity hue (a Distinctive Brand Asset — Ehrenberg-Bass; trademarked colours: Tiffany 1837, UPS brown, T-Mobile magenta). Mood modulates accent/saturation/brightness — NOT the identity hue.
4. **Cultural appropriateness (soft, locale-gated):** white=mourning (East Asia) / purity (West); red=luck (China) / danger (West) — adapt when locale known (celebration/mourning/festival content); when unknown, prefer the portable functional/semantic layer.
5. **Mood / expressive colour (free, INSIDE 1-4):** saturation, brightness, temperature, accent choice, 60/30/10 proportion. This is the spine's latitude.
> One line: *mood owns how vivid/warm/accented; it does NOT own the semantic hue, the brand hue, locale symbolism, or legibility.*

## SIGNAL → COLOUR mappings (evidence-based; the actual mood mechanism)
From Valdez & Mehrabian 1994 (Pleasure=0.69·B+0.22·S; Arousal=−0.31·B+0.60·S; Dominance=−0.76·B+0.32·S), Wilms & Oberfeld 2018 (saturation+brightness drive arousal/valence in self-report AND skin conductance), Gao et al. 2007 (chroma+lightness dominate hue across 7 cultures), Jonauskaite 2020 (30-nation hue-emotion core r≈.88 + cultural overlay).

| Signal | Colour move | Confidence |
|---|---|---|
| High energy / arousal | **↑ saturation (primary lever)**, moderately ↓ lightness (deep+saturated reads intense) | ROBUST (physiological) |
| Calm / low energy | ↓ saturation, ↑ lightness (pale, airy) | ROBUST |
| Positive / uplifting | **↑ lightness (primary)**, moderate saturation | ROBUST ("bright=good" cross-cultural) |
| Sad / sombre | ↓ lightness + ↓ saturation (muted/grey) | ROBUST |
| Powerful / dominant | ↓ lightness + ↑ saturation (dark, intense) | ROBUST |
| Warm / intimate | warm **temperature** shift (toward ~2700-3200K analogue) + warm neutrals | WEAK-assoc (use temp, not hue-swap) |
| Serious / formal | **↓ saturation strongly** (desaturate = grit/prestige; chromophobia tradition), controlled lightness | MODERATE-ROBUST |
| Playful / youthful | ↑ saturation + ↑ lightness | ROBUST (sat/bright part) |
| Specific hue → specific feeling (red=passion, blue=calm) | optional, low-weight, culture-gated nudge only | WEAK (real but small/contextual) |
| ~~"red boosts attention/urgency" as a rule~~ | DO NOT — replication-debunked | MYTH |

**Engineering rule:** ENERGY = f(saturation ×~3, lightness ×~1, with dark→more intense); VALENCE = f(brightness); WARMTH = temperature shift. **Keep saturation↔arousal and brightness↔valence as SEPARATE dials** (don't conflate "bright=energetic" — bright actually lowers arousal in V&M). Hue = a separate low-weight, culture-gated flavour channel, never load-bearing. Mood is a **trajectory** across the timeline (the Pixar colour-script principle), not one flat grade.

## PALETTE DERIVATION from ONE brand hex (OKLCH — fixes the "muddy" bug)
Work in **OKLCH** (Ottosson 2020; perceptually uniform, native CSS) or Material **HCT** (Tone = CIELAB L*). NOT HSL/HSV (they lie about lightness — `hsl(60,100%,50%)` yellow ≫ `hsl(240,100%,50%)` blue brightness; this is why the prior "rotate-toward-surface" derivation collapsed to mud).
1. Decompose brand hex → OKLCH `(L,C,H)`. **H is the spine for the whole system.**
2. **Build each ramp by fixing H, stepping L in perceptually-even steps, and TAPERING chroma at the extremes** (Tailwind v4 / Material practice — prevents "radioactive" tints + muddy/clipped shades). Hierarchy = value steps on ONE hue, never a second hue.
3. **Neutrals/surfaces** = the brand hue at near-zero chroma (a tinted grey) — greys feel on-brand (Material Neutral/Neutral-variant).
4. **Accent/secondary** = rotate H by the harmony chosen for the mood, at MATCHED L/C (so it reads as family, not a foreign object; avoids complementary "vibration"):
   - calm/premium → monochromatic or analogous (±30°); confident/CTA → **split-complementary (±150/165°) [safe default]**; playful → triadic (±120°); editorial → tetradic (strict dominance). Governed by **60/30/10**.
5. **Contrast = verified, not assumed:** Material **ΔTone ≥ 50 → 4.5:1, ≥ 40 → 3:1** (WCAG-calibrated, safe) as the proposer; ALWAYS verify the actual pair with WCAG 2.2 (and optionally APCA Lc≥75 body / 45 headline). OKLCH ΔL is only a candidate filter, NOT a contrast guarantee (Lea Verou).

## SEMANTIC OVERLAY (fixed, meaning-driven, mood-independent)
A small fixed set, selected by the element's CONTENT/meaning, kept distinct from brand, double-encoded (icon/sign/direction). Anchors (hue is the constraint, exact value tuned to pass contrast): success/positive `#16A34A` · danger/loss `#DC2626` · warning `#D97706` · info `#2563EB`. For categorical data use a CVD-safe set (Okabe-Ito). Never let mood recolour these.

## FOOTAGE-AWARE LEGIBILITY GATE (hard, last — MGs sit OVER video, not a dark canvas)
The colourist/broadcast rule: don't assume the background — MEASURE it. Per text element, across SEVERAL frames (footage moves), sample the title-safe bounding-box background luminance; compute WCAG vs the real pixels; if below floor, **escalate cheapest-first: flip text white↔dark → drop shadow → stroke → adaptive scrim (opacity scales with measured background brightness)** until ≥4.5:1. Keep inside **title-safe 90%** with interior box margins. **Legibility wins over mood, every time** (mood picks a moodier brand shade; if it fails contrast, the protection layer rescues it or the shade is rejected).

## GRAPHITI (per-brand learning)
The brand's accepted/over-ridden colours, preferred harmonies, and intensity range feed back as per-brand biases on the derivation + mood mappings (the [[D-015-Graphiti-Signal-Bridge]] mechanism). Project #1 generic → project #N tuned to this brand's taste.

## What this REFORMS in the plan
Phase B colour dimension (and [[MG-Material-Libraries]]) become: **brand-hex → OKLCH harmony derivation → signal-driven saturation/brightness/temperature mood (NOT hue) → fixed semantic overlay → footage-aware legibility gate → Graphiti tuning.** The 16 "mood palettes" remain only a brand-LESS fallback (chosen by brand identity, not arousal). Add: OKLCH/HCT colour-space utility, the measured-background contrast gate, the CVD-safe semantic set.

## Sources (verified this session; full links in the research agents' reports)
Valdez & Mehrabian 1994 (J.Exp.Psychol.); Wilms & Oberfeld 2018 (Psych.Research); Gao et al. 2007 (Color Res.&App.); Jonauskaite et al. 2020 (Psych.Science, 30 nations); Elliot & Maier colour-in-context; Palmer & Schloss 2010 EVT (PNAS); red-effect debunks (PMC meta-analyses). Ottosson OKLab/OKLCH 2020; Material HCT + tone-delta; Tailwind v4 chroma-taper; chroma.js; WCAG 2.2 + APCA status (Roselli 2026). Kawai et al. 2022 (cross-cultural red-valence, PMC); Singh 2006 (colour & marketing — the real source for the over-cited "80%"); Ehrenberg-Bass Distinctive Assets; Okabe-Ito CVD palette (Wong, Nature Methods). Storaro *Writing with Light*; Pixar colour script (StudioBinder); Kroll colour-grading psychology; WCAG luminance formula; EBU R95 safe areas; adaptive-subtitle contrast patents.

See [[MG-Material-Libraries]], [[MG-Spine-Build-Plan]] (Phase B), [[MG-Visual-Language-Spine-Redesign]] (§4.1), [[D-017-MG-Dissolve-Type-Preset-Menu]].
