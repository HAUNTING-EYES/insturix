# Editron Atomic Overlay Final Plan - 2026-06-07

## Northstar

Editron should not work as:

`label -> preset -> hope it looks good`

It should work as:

`primitive atoms + relations + rhythm + screen context + brand taste + learned references -> form + timing + combo`

Legacy labels can stay as compatibility wrappers while old render paths catch up, but they must not be the creative source of truth.

## Existing Plans Reconciled

This plan merges:

- `docs/agents/vault/02-Architecture/MG-Spine-Build-Plan.md`
- `docs/agents/vault/02-Architecture/MG-Generative-Spine-Phase-G.md`
- `docs/agents/vault/07-Roadmap/Product-Integration-Plan.md`
- `docs/agents/reference/general/phase_f_g_saas_motion.md`
- `docs/agents/reference/editron/atomic_overlay_northstar_todo_2026_06_07.md`

Important reconciliation:

- The older SaaS Phase G plan is a capability target, not an implementation recipe.
- UI primitives, vector layers, screen-demo effects, and audio-marker sync are still valuable.
- Fixed template rigs must not become the new preset menu.
- Phase G capabilities should be exposed as atomic parts, relations, layers, timing markers, masks, vectors, and asset roles that the resolver can compose.

## Current Ground Truth

Already strong enough to build on:

- Upload-to-edit pipeline exists: upload asset, create project, analyze, run TRIBE/V-JEPA/Wav2Vec/music, run Director, create overlays.
- Overlay receipts are stamped through editor state, save/persistence, checkpoints, EDL paths, and live editor updates.
- MG content now has atomic structural signatures before legacy kind projection.
- Caption/text now have glyph, word, emphasis, hierarchy, row, casing, font role, color role, highlight, and motion atoms.
- Caption/text renderers consume atomic `fontPlan` and `colorPlan`.
- Zoom has a parametric atomic form resolver.
- Transition has a parametric atomic form resolver and renderer-side atomic render params.
- V-JEPA primitives exist in the model: subject bbox, text boxes, negative space, motion vector, object/face counts.
- Moment-bundle calibration now includes atomic aesthetic scores.

Not complete yet:

- Rendered aesthetic verification is not built enough.
- V-JEPA atoms are not behavior-driving everywhere.
- SFX intent and asset quality strategy are weak.
- Stickers, shapes, images, HTML scene/sticker, Lottie, speed, fade, and camera-shake have generic receipts but not deep family-specific form intelligence.
- MG recipe resolving still has legacy/preset-like compatibility paths.
- Reference creator calibration has not been run end to end.
- Override/per-brand learning is not built.
- Phase F/G SaaS demo capabilities are not current priority until the core edit engine can prove premium output.

## Final Phase Order

### Phase 1 - Rendered Aesthetic Verification

Goal: prove the output looks good, not only that metadata scores look good.

Build frame/video checks for:

- text readability against actual footage
- overlap with subject, face, gaze, and on-screen text
- title-safe and action-safe violations
- blank / missing / invisible overlays
- caption crowding and bad line breaks
- contrast and local background luminance
- zoom/transition harshness
- overlay combo clutter

Verification target:

- real project render frames
- adversarial caption/text cases
- at least one talking-head, one screen-record/tutorial, one high-motion creator clip

### Phase 2 - Complete Basic Atoms For Every Overlay Family

Goal: every overlay has family-specific primitive atoms, not only generic metadata.

Families to finish:

- sound/SFX: role, attack, tail, loudness, texture, timing anchor, source quality, fallback
- image/media/avatar/logo: subject role, crop, alpha, focal point, brand relation, inspection region
- shape/sticker/Lottie: semantic role, path/shape type, motion role, density, layer relation
- HTML scene/sticker: generated source, semantic blocks, font/color extraction, animation lanes
- speed/fade/camera-shake: curve atoms, amplitude, axis, attack/hold/release, safety limits

Shared atoms required:

- position, anchor, region, bbox
- start, duration, end, timing anchor
- entry, exit, curve, intensity
- role, evidence, source confidence
- constraints, avoid regions, collisions
- brand/taste bounds

### Phase 3 - Make V-JEPA Behavior-Driving

Goal: V-JEPA should affect placement and form, not just appear in receipts.

Use V-JEPA primitives to drive:

- avoid face/gaze/text/salient subject
- choose negative-space region
- pick zoom focal anchor and optional x/y drift
- shape transition direction from subject/camera motion
- reduce caption/MG density on busy frames
- suppress harsh motion when human attention is high
- prefer minimal overlays when footage already carries the moment

Verification target:

- same moment with subject left vs right produces different placement
- text-heavy frame reduces overlay density
- moving subject influences zoom/transition direction

### Phase 4 - Moment Bundle Grammar

Goal: stop treating MG, captions, zoom, SFX, transitions, and pacing as separate effects.

Build a resolver that takes:

- what is being said
- how intense it is
- what is visible
- where the viewer eye should go
- what rhythm the moment needs
- brand/taste bounds

And outputs a coordinated bundle:

- frame movement
- MG form/timing
- caption emphasis
- transition form
- SFX intent
- hold/cut timing
- density/restraint budget

Example target:

When a speaker says "this changed everything," the system can coordinate a slow push, keyword snap, MG landing, tiny SFX hit, short hold, then pull/cut on the next thought.

### Phase 5 - SFX Intent Layer

Goal: make SFX intelligence ours even when assets come from external libraries.

System decides:

- whether sound should happen or silence is better
- role: impact, soft hit, whoosh, riser, tick, glitch, sparkle, bass drop, camera snap, transition tail, UI blip
- timing: before beat, on keyword, after keyword, on cut, on MG landing, transition tail
- intensity and loudness budget
- texture/taste: cinematic, creator punchy, luxury soft, tech UI, documentary subtle
- search constraints: duration, attack shape, brightness, harshness, tail length
- fallback: no-op or subtle cached asset when no good external sound exists

Also bridge:

- `atomicTransitionForm.sfxRole`
- caption/MG landing markers
- bundle-level anti-spam budget

### Phase 6 - MG Recipe Resolving Without Presets

Goal: finish the original MG northstar.

Do not `switch(primary.kind)` into composers as the core creative step.

Instead:

- content atoms define structure: scalar, text, series, identity, media, relation, brand
- relations define hierarchy and grouping
- series structure drives data-viz form: cardinality, trend, variance, comparison, rank
- visual-language spine resolves type, color, layout, motion, and restraint
- renderer composes from parts and relations
- compatibility labels are projected after the form exists

Keep the older MG spine order as the sub-plan:

- Phase 0: pre-reqs and font/floor cleanup
- Phase E: design gate, observe to enforce
- Phase B: visual-language spine/registers
- Phase C: dissolve menu paths behind a flag
- Phase D: extractor plus narrative role
- Phase F: calibration
- Phase G: override and per-brand learning

### Phase 7 - Calibration And Reference Learning

Goal: tune curves/weights from real creator/editor references, not guesses.

Use a wide creator/reference set:

- hooks and claims
- talking-head education
- luxury/product
- vlog/creator energy
- documentary/narrative
- screen-record/tutorial
- podcast/interview
- music/beat-driven edits

Measure:

- timing alignment to word/beat/cut/emotion
- placement and avoid-region quality
- density/restraint
- caption readability and rhythm
- MG form appropriateness
- transition/zoom/SFX combo quality
- style distribution vs references
- rendered aesthetic failures

Then feed back into:

- signal weights
- thresholds
- response curves
- resolver budgets
- brand/taste biases

Human/founder labels are used as calibration anchors, not as per-render gates.

### Phase 8 - Live Intelligence

Goal: receipts and atoms stop being only audit data.

Use fresh in-memory atomic forms for:

- live collision checks
- avoid-face placement
- safe-zone nudging
- caption density limits
- overlay combo budgeting
- warning/correcting stale receipts
- smart editor suggestions

Prerequisite: rendered aesthetic checks and false-positive measurement.

### Phase 9 - Override And Per-Brand Learning

Goal: the user can steer the engine, and the system learns.

Every user edit becomes training data:

- move overlay
- resize
- change color/font
- turn effect off
- swap SFX
- accept/reject suggestion
- choose quieter/louder style

Feed this into:

- per-brand visual-language bounds
- per-user restraint preferences
- SFX taste
- caption style taste
- transition/zoom tolerance

This is the strategic Phase G from the MG spine plan: the steering wheel.

### Phase 10 - SaaS Demo Phase F/G Capabilities

Goal: build SaaS/product-demo capability after the core editor is trustworthy.

Phase F capability:

- screen-recording ingestion
- cursor detection
- cursor-follow zoom
- interaction classification
- web recorder
- motion blur on frame movement

Phase G capability:

- vector/SVG layers with real fonts
- UI primitives as atomic parts, not finished presets
- composable layer stack, masks, blend modes
- audio-marker sync
- shimmer/glow/particles as atomic effects
- screen recording plus motion overlays

Rule:

- old "template rigs" may be used as reference capability examples
- production implementation must expose parts/relations/markers, not choose fixed rigs as presets

## Immediate Next Phase

Build Phase 1: rendered aesthetic verification.

Why this is first:

- The user correctly challenged that internal scores do not prove output looks good.
- It protects every later phase.
- It gives calibration real failure signals.
- It prevents building more atomic metadata that never becomes visual quality.

## Definition Of Done For Northstar Alignment

Editron is aligned when:

- every overlay family has primitive atoms and family-specific form atoms
- V-JEPA and screen context drive placement/form
- moment bundles coordinate effects together
- renderer output passes deterministic visual checks
- references and human labels tune curves/weights
- presets are compatibility shells only
- user overrides become per-brand learning
- upload-to-edit can produce a premium-looking edit without manual rescue
