# Editron Mechanical Roadmap Reference - 2026-06-07

Status: working memory / must-read before continuing overlay, V-JEPA, calibration, Phase F, or Phase G work.

## Mechanical Rule

Before choosing "what next" for Editron overlay work, read this file first.

Do not rely on memory. Do not collapse old roadmap phases into the current overlay plan. Treat labels and presets as compatibility shells only unless the source doc explicitly says the phase is a separate product capability track.

## Current Overlay Northstar

Editron overlay decisions should move from:

`label -> preset -> hope it looks good`

to:

`primitive atoms + relations + rhythm + screen context + brand taste + learned references -> form + timing + combo`

LLMs may propose intent, but the atom system and deterministic rules must validate timing, placement, density, safe zones, collisions, brand bounds, render safety, and calibration signals.

## Current Overlay Roadmap Order

1. Rendered aesthetic verification.
   Prove the output looks good on pixels/video, not only metadata. Check legibility, overlap, blank/invisible overlays, frame contrast, caption crowding, zoom/transition harshness, and combo clutter.

2. Complete primitive atoms for every overlay family.
   Family-specific atoms must cover sound/SFX, image/media/avatar/logo, shape/sticker/Lottie, HTML scene/sticker, speed/fade/camera-shake, captions, text, MG, zoom, and transitions.

3. Make V-JEPA behavior-driving.
   Subject boxes, face/gaze/text boxes, negative space, motion vectors, object counts, and visual busyness must affect placement, density, zoom anchors, transition direction, and form restraint.

4. Build moment-bundle grammar.
   Coordinate MG, captions, zoom/frame movement, SFX, transitions, holds, cuts, and pacing as one timed emotional beat.

5. Add SFX intent layer.
   Decide whether sound should happen, role, timing, intensity, texture, loudness budget, asset constraints, fallbacks, and anti-spam. External SFX quality is a source problem, but SFX intent is ours.

6. Finish MG recipe resolving without presets.
   Move away from `switch(primary.kind)` as the creative core. Content atoms, relations, rhythm, brand, and screen context resolve the recipe. Legacy kind labels are projected after the form exists.

7. Run reference calibration.
   Use diverse creator/reference videos and human/founder labels. Tune weights/curves against rendered output, not category recall alone.

8. Make receipts power live intelligence.
   Receipts/forms become live collision, avoid-face, density, safe-zone, combo-budget, and smart-editor suggestions after false positives are measured.

9. Add override and per-brand learning.
   User edits become training signals for brand taste, caption style, SFX taste, transition/zoom tolerance, and restraint.

10. Return to Phase F product-demo work when the core editor can prove premium output, unless the user explicitly pivots to screencast/SaaS demo work.

## Phase F Definition

Phase F is Screencast / Product-Demo Mode: screen recording with intelligent cursor-zoom. It is OpenScreen-based, deterministic, and separate from the MG engine.

Product roadmap source: `docs/agents/vault/07-Roadmap/Product-Integration-Plan.md`
Comparison/source doc: `docs/agents/reference/general/phase_f_g_saas_motion.md`

What Phase F contains:

- F.1 Mode 4: screen recording to Editron. User uploads an `.mp4` from OpenScreen, Loom, QuickTime, etc.
- F.2 Intelligent auto-zoom from cursor trajectory. Deterministic, not Gemini. Zoom when cursor slows/pauses; pull back when cursor moves fast.
- F.3 Motion blur on zoom/camera movements, ported from OpenScreen-style code.
- F.4 Web-based screen recorder using `getDisplayMedia()` and WebRTC.
- F.5 Native desktop client later.
- F.6 Cursor-event classification: button vs text vs blank area changes zoom depth.

Reference source: `reference-repos/openscreen-main/` / uploaded `openscreen-main.zip`.

## Phase G Definition

Phase G is the Generative Motion-Graphics System: the MG craft/spine work.

Definitive source: `docs/agents/vault/02-Architecture/MG-Generative-Spine-Phase-G.md`

Live sub-phases:

- G-1 Fit / brushwork.
- G-2 Brand-to-render wiring.
- G-3 Color and intensity.
- G-4 Captions onto the spine.
- G-5 Fusion: moments, transitions, and SFX.
- G-6 Graphiti bridge.
- G-7 Selection and calibration.

Do not replace this definition with the older SaaS-video Phase G wording. The SaaS-video source remains useful for product-demo capability and Phase F-vs-G comparison, but the live Phase G name refers to the generative MG system above.

## Alias Trap

The older `Session-2026-05-31-MG-Spine-Pivot-HANDOVER` lettering used:

- F = calibration dials.
- G = override / per-brand learning.

That scheme is superseded by the dedicated Phase-G doc:

`docs/agents/vault/02-Architecture/MG-Generative-Spine-Phase-G.md`

Use the product-roadmap meaning live now:

- Phase F = Screencast / Product-Demo Mode.
- Phase G = Generative Motion-Graphics System.

## Source Authority Notes

- `docs/agents/reference/editron/atomic_overlay_northstar_todo_2026_06_07.md` is the current atomic overlay northstar TODO.
- `docs/agents/sessions/editron/Editron-48-Session-2026-06-04-VJEPA-Atoms-Moment-Bundles-TODO.md` is the current V-JEPA/moment-bundle TODO.
- `docs/agents/vault/07-Roadmap/MG-Generative-Build-Plan-2026-06-02.md` is the MG no-template destination.
- `docs/agents/vault/02-Architecture/MG-Generative-Spine-Phase-G.md` is the definitive Phase G doc.
- `docs/agents/vault/07-Roadmap/MG-Automated-Eval-Calibration-Plan-2026-06-03.md` controls calibration sequencing: eval harness early, tuner after form/curves exist.
- `docs/agents/vault/02-Architecture/MG-Overlay-Infrastructure-Complete-Map-2026-06-03.md` is the top-down overlay/signal infrastructure map, but verify code before editing.
- `docs/agents/vault/07-Roadmap/Product-Integration-Plan.md` is the product roadmap source for Phase F and the F-vs-G comparison.
- `docs/agents/reference/general/phase_f_g_saas_motion.md` is the older/migrated SaaS video source. Use it for screencast/product-demo capability details, not to redefine live Phase G.

## Do Not Forget

- Calibration paused until rendered aesthetic checks and form foundation are solid enough.
- Family coverage scores do not prove premium aesthetics.
- Moment labels like "hook" or "important claim" are derived atoms, not the base atoms.
- Base atoms are smaller: glyphs, boxes, paths, anchors, positions, x/y/z transforms, timing, curves, entry/hold/emphasis/reactive/exit phases, color roles, stroke/fill, screen regions, constraints, collisions, evidence, and source confidence.
- Phase F is a real screencast/product-demo capability track. Phase G is the MG generative spine. Do not merge the names again.
