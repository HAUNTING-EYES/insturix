# Editron 48 - V-JEPA Atoms + Moment Bundles TODO

Date: 2026-06-04

## Must Not Forget

The V-JEPA visual atoms added to MG atomic plans are observe/metadata-only right now.
They must become behavior-driving inputs in the next phases.

Northstar:

primitive atoms -> moment atoms -> bundle grammar -> overlay outputs

Not:

overlay label -> preset

Preset names are allowed only as compatibility shells while old renderers catch up.
The creative source of truth should be atomic form params.

## Next Behavior Step

Use the primitive visual atoms to influence actual overlay placement/form:

- Protect faces, gaze, high-salience subjects, and on-screen text.
- Let camera/subject motion influence zoom anchors, frame movement, transition direction, and MG entrance.
- Let screen busyness and legibility risk reduce density or move overlays to safer zones.
- Coordinate MG, zoom, caption emphasis, SFX, frame movement, and transitions as one moment bundle.

The existing signal/overlay/MG infra should be reused; do not duplicate systems or copy editor presets.

## Must Refine: Atom Granularity

Do not treat high-level labels as the base atoms.

Primitive atoms should stay small and factual:

- audio: waveform energy, speech energy, silence, transient peak, beat time, beat strength, loudness slope.
- transcript: word text, word start/end, word duration, pause before/after, casing, punctuation, keyword rank.
- visual: face bbox, subject bbox, eye contact, gaze direction, shot scale, text box bbox, text coverage, object count.
- motion: subject motion vector, camera motion vector, motion magnitude, direction change, speed change.
- frame: luma, contrast, saturation, color temperature, edge density, negative-space regions.
- brand/taste: restraint, sharpness, softness, typography weight, motion personality, color temperature preference.

Moment atoms are derived bundles on top:

- speech peak, high emotion, important claim, hook, topic shift, visual salience, human attention, screen busyness.

Rendering should use both, but calibration should preserve the primitive truth so the system can learn better moment bundles later.

## Must Add: Parametric Overlay Forms

Northstar for all overlays:

- MG recipes should become grammar/resolver outputs, not fixed presets. Parts, relations, channels, rhythm, brand taste, and screen context should resolve the form.
- Zoom should resolve `scaleFrom`, `scaleTo`, focal point, attack, duration, hold, easing, drift, and timing offset from atoms. `punch-in`, `slow-push`, and `pull-back` should be compatibility labels only.
- Transitions should resolve direction vector, duration, blur/smear, exposure, mask/reveal relation, softness, timing, and SFX sync from subject/motion/rhythm atoms. Preset names should only wrap the generated form for old renderer paths.
- Caption emphasis, SFX, filters, speed ramps, camera shake, stickers, and non-MG graphics should follow the same rule: atomic form first, legacy type second.
- Calibration should evaluate the generated form params and rendered result, not only whether a preset/category appeared.

## Calibration Standing

Current moment-bundle calibration has a coverage/alignment score, not an aesthetic score.

What the current score means:

- It checks whether a real active overlay family is also available as a system candidate at that moment.
- It is useful for coverage, recall, and "did the system consider the right family?"
- It does not prove the edit looks premium, well-timed, tasteful, or Iman/top-editor level.

Real project `proj_OzG2qgoYudFa` latest observed result:

- 641 moment bundles.
- Visual atom coverage: 640/641.
- System candidate coverage: 640/641.
- Active overlay reference coverage: 641/641.
- Deterministic evaluation: 637 matched, 3 partial, 1 missed.
- Caption recall: 640/640.
- Graphic/MG recall: 46/46.
- SFX recall: 0/4.

Interpretation:

- MG/caption family coverage looks good in this scorecard.
- SFX coverage is weak, but this is about intent/candidate coverage, not external asset quality.
- Aesthetic quality still needs its own evaluator stack.

## Must Add: Aesthetic Scorecard

Add separate calibration layers beyond family coverage:

- Timing score: did the overlay land on the emotional beat, speech peak, keyword, music beat, cut, or transition tail?
- Composition score: did placement avoid faces, eyes, salience, text-on-screen, unsafe zones, and clutter?
- Style score: did form match brand taste, content type, reference examples, typography, color, motion language, and restraint level?
- Combo score: did MG, caption emphasis, zoom/frame movement, SFX, transition, and pacing feel like one layered moment instead of separate random effects?
- Asset quality score: did chosen media/SFX feel premium, clean, and context-appropriate instead of cheap, harsh, meme-y, or noisy?
- Legibility score: text size, contrast, line breaks, casing, duration, motion blur, occlusion, and reading time.
- Human/reference score: compare against curated top-editor examples and human labels to learn taste over time.

End goal:

atoms + relations + rhythm + screen context + brand taste + learned references -> form + timing + combo

Not:

label -> preset -> hope it looks good

## Must Add: SFX Intent Layer

SFX asset quality depends on external libraries, but SFX decision intelligence is ours.

System should decide:

- whether a moment deserves SFX or silence.
- SFX role: impact, soft hit, whoosh, riser, tick, glitch, sparkle, bass drop, camera snap, transition tail, UI blip.
- timing: before beat, on keyword, after keyword, on cut, on MG landing, on zoom start/end, on transition tail.
- intensity: tiny, medium, heavy, or forbidden.
- texture/taste: clean cinematic, creator punchy, luxury soft, tech UI, documentary subtle, etc.
- pairing: keyword emphasis + MG snap + micro push + SFX hit.
- budget: avoid spam, respect brand restraint, suppress if the scene is already busy.
- asset search constraints: tags, duration range, attack shape, brightness, loudness, harshness, tail length.
- fallback: no-op or very subtle bed if no good asset exists.

Example target:

"This changed everything."

- atoms: important claim, high emotion, speech peak, keyword emphasis, face present, visual salience.
- combo: slow push starts before phrase, keyword snaps, MG lands half-beat after, soft cinematic hit at +2 frames, hold 18 frames, then pull/cut.
- SFX intent: role=impact, intensity=0.45, texture=soft cinematic hit, avoid=harsh boom/overused whoosh.

## Remaining Work

- Continue making V-JEPA visual atoms behavior-driving for placement/form, not only metadata.
- Add moment-bundle grammar that coordinates camera movement, MG, captions, SFX, transitions, and pacing.
- Add the aesthetic scorecard above.
- Add SFX intent atoms and deterministic budget/timing rules.
- Improve SFX candidate coverage and bridge real `sound` overlays to `sfx` intent/candidates.
- Build reference/human labeling loop so calibration can learn taste, not only match categories.
- Use generated bundle/evaluation artifacts as the training/eval data source.

## Phase 5 Progress

Visual pressure now affects utility scores even when a candidate has no explicit placement region:

- Busy/text-heavy frames reduce unpositioned graphic candidates.
- High-motion + human-attention frames reduce kinetic zoom/camera candidates.
- Calm/open frames keep unpositioned candidates unchanged.
- Candidate score changes are carried through moment-bundle calibration.

Still not complete:

- Need form-level changes inside MG composition, zoom anchoring, transition direction, and SFX intent.
- Need aesthetic scoring; current calibration is still mostly coverage/alignment.

## Phase 6 Progress

MG composition now has an early visual-form risk gate:

- High `text_on_screen` blocks decorative particles even when budget and particle score pass.
- High `motion_intensity` / `visual_complexity` blocks mask reveals even when budget and mask score pass.
- High-energy char-by-char text split downgrades to word split on busy visual frames.
- Calm/open frames keep the existing expressive behavior.

Still not complete:

- Need transition direction to use subject/motion atoms.
- Need SFX intent atoms and combo timing.
- Need aesthetic scorecard over rendered output, not only planner structure.

## Phase 7 Progress

Zoom/frame movement now uses visual atoms in live render behavior:

- EDL zooms derive a deterministic focal anchor from explicit `zoom_focal_*` or subject atoms like `main_subject_x/y`.
- Video overlays receive `styles.transformOrigin`, so punch/slow-push/pull-back scales around the subject instead of always center-frame.
- Zoom receipts now carry atomic `zoom.focal_x` and `zoom.focal_y` atoms plus focal payload metadata for calibration.
- Renderer layer honors overlay `styles.transformOrigin`, with center as the default fallback.

Still not complete:

- Need transition direction to use subject/motion atoms.
- Need SFX intent atoms and combo timing.
- Need aesthetic scorecard over rendered output, not only planner structure.

## Phase 8 Progress

Zoom is moving from preset selection toward parametric atomic form:

- Added an atomic zoom form resolver that generates focal point, scale delta, duration, attack, hold, easing keyframes, intensity, and visual pressure from signals.
- Existing `punch-in`, `slow-push`, and `pull-back` names are now compatibility labels on the generated form, not the creative source of truth.
- EDL zoom execution uses the generated form directly for live scale keyframes and transform origin.
- Zoom receipts now expose the form version, direction, attack/hold, visual pressure, intensity, focal atoms, and scale atoms for calibration.

Still not complete:

- Add optional x/y drift or parallax-style frame movement as atomic zoom form params.
- Move transition renderer path to the same atomic form model.
- Convert MG recipe resolving into grammar/form solving so recipes are not fixed presets.
- Apply the same parametric-form principle to captions, SFX, filters, speed ramps, camera shake, stickers, and other overlays.

## Phase 9 Progress

Transition planning is moving from preset selection toward parametric atomic form:

- Added an atomic transition form resolver that generates direction vector, duration, softness, blur, smear, exposure, mask feather, intensity, visual pressure, and SFX role from primitive/moment signals.
- Existing transition names like `soft-cut`, `dissolve`, `whip-pan`, and `zoom-punch` are now compatibility labels on the generated form, not the creative source of truth.
- EDL transition execution stores `atomicTransitionForm` and stamps transition receipts with direction/softness/blur/exposure atoms.
- Text-heavy, face/gaze-heavy frames suppress harsh transition forms even if an old path requested `zoom-punch`.

Still not complete:

- Make the transition renderer consume atomic form params directly instead of only `transitionStyle`.
- Add horizontal wipe/slide compatibility or direct renderer support for signed X direction.
- Bridge transition SFX placement to `atomicTransitionForm.sfxRole`.
- Add calibration checks over rendered transition aesthetics/timing, not only receipt structure.
