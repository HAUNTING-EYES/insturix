# Reference Video Adaptive Template Plan

Status: PINNED / DEFERRED

Implementation must not start until the BGM, SFX, reference-track, and audio
render-boundary work is closed and battle-tested.

## Product Decision

Editron will not promise pixel-for-pixel or timestamp-for-timestamp cloning of a
reference video. A reference supplies measured rhythm, structure, energy, and
creative relationships. Director adapts those signals to the user's footage,
speech, brand, duration, and platform using adaptive templates.

The target experience is:

```text
Uploaded / YouTube / Instagram reference
  -> canonical private reference asset
  -> demuxed video and audio
  -> measured cuts, beats, sections, energy, and soundtrack identity
  -> canonical EditFingerprint
  -> adaptive reference plan
  -> Director timeline composition
  -> same-song preview or export-cleared audio
  -> rendered similarity verification
```

## Verified Current Reality

The current systems provide partial, disconnected evidence:

1. `lib/thinkforge/trends/trend-source-analysis.ts` asks Gemini to infer
   sections, beats, drops, and reusable instructions from the whole video.
   Validation proves timestamp order and bounds, not measured audio-beat
   accuracy.
2. `lib/thinkforge/brief/apply-trend-spec.ts` converts the result into duration
   boundaries, copy slots, constraints, choices, and a performance script. It
   does not transfer the exact beat list or soundtrack identity as executable
   Editron instructions.
3. `lib/editron/services/reference-content-extractor.ts` calls the FFmpeg cut
   detector in the production Match Edit path, then collapses detected cut
   timestamps into average cuts per minute and average clip duration.
4. `lib/editron/reference-video/extract-visual-fingerprint-with-cuts.ts`
   retains exact cut timestamps, but production does not call it.
5. `lib/editron/reference-video/edit-fingerprint-audio.ts` and
   `lib/editron/reference-video/edit-fingerprint-assembler.ts` contain useful
   audio/fingerprint plumbing, but they are not the production source of truth.
6. Director has attempted to emit a `cutsPerMinute` override, while
   `ProjectBrief.overrides` in `lib/editron/data/edit-profile-types.ts` does not
   accept that field. The override is therefore not executable.
7. The fixed FFmpeg scene threshold is not ground truth. The repo's own
   `docs/agents/reference/editron/Cut-Classification-Research-2026-06-08.md`
   documents severe motion false positives and recommends adaptive detection
   plus an evaluation harness.

Result: the production system can transfer broad style and pacing intent, but
cannot truthfully claim exact soundtrack identification, measured beat
transfer, exact cut transfer, or adaptive replay of the reference choreography.

## Locked Constraints

1. No blind exact-sequence replay.
2. No fixed-threshold cut detector may be called ground truth.
3. No LLM-authored beat timestamp may be labeled measured evidence.
4. One canonical `EditFingerprint` must be the producer-to-Director contract.
5. Detector output remains evidence. Director owns adaptation to the target
   footage and narrative.
6. The final timeline resolver remains the owner of concrete cuts,
   transitions, motion forms, and SFX placement.
7. A reference-only song may drive preview, waveform, beats, and timing, but it
   must be removed from clean export unless the user chooses Include in export
   and supplies the required attestation.
8. Editron does not classify an uploaded song as copyrighted or
   non-copyrighted. It records the user's export intent and the asset's
   provenance, then enforces the selected render mode.

## Adaptive Template Model

The reference becomes a normalized template rather than a literal timeline:

- Structural slots: hook, setup, build, proof, peak, resolution, CTA.
- Rhythm anchors: downbeats, section changes, drops, pauses, and energy turns.
- Cut relationships: normalized position within each slot, preferred beat
  division, cut density range, and variance.
- Visual relationships: shot-size progression, motion direction, transition
  family, graphic density, and emphasis hierarchy.
- Audio relationships: soundtrack identity, source cue offset, beat entry,
  sections, energy envelope, and speech/music priority.
- Confidence and provenance: detector, model, version, source span, and
  uncertainty for every signal.

Adaptation maps each reference slot to available target material and may move,
drop, or split an anchor when required by speech, action continuity, brand
rules, or duration. It never invents unavailable footage merely to preserve a
reference timestamp.

## Creative Graph Requirements

The implementation must preserve these existing graph rules:

- `mapping:audio.cut_on_downbeat`: speech boundaries override beats; do not
  beat-lock every cut; humanize after repeated beat-aligned cuts.
- `mapping:audio.music_section_transition`: align major visual changes with
  measured section changes and adapt density to the musical section.
- `mapping:audio.music_energy_tracking`: track sustained energy changes, while
  speech pacing retains priority where speech is active.
- `mapping:structural.pacing_tolerance_exceeded`: choose speech boundary, then
  motion peak, then beat, rather than arbitrary timing.
- `mapping:composite.charged_silence_protection`: preserve narratively charged
  silence and do not fill it with cuts, graphics, or SFX.
- `constraint:temporal.pacing_monotony`: avoid metronomic shot durations.
- `constraint:rhythm.energy_mismatch`: flag sustained disagreement between
  music energy and edit density.

## Deferred Build Order

### Phase R0: Evaluation Corpus

Create licensed/internal reference fixtures with human-annotated cuts, beats,
sections, drops, and soundtrack identity. Include camera motion, flashes,
speed ramps, dialogue, montage, and intentional silence. Establish precision,
recall, timing-error, and rendered-similarity baselines before selecting the
production detector.

### Phase R1: Canonical Asset And Demux

Materialize every accepted URL/upload as a private scoped asset. Record source,
owner, duration, hashes, retrieval receipt, and audio usage mode. Demux once and
make the canonical asset ID mandatory for every downstream stage.

### Phase R2: Measured Evidence

Use adaptive cut detection calibrated against R0. Evaluate PySceneDetect
AdaptiveDetector as the initial production candidate and TransNetV2 as an
offline oracle, not an assumed runtime dependency. Measure audio beats,
downbeats, sections, onsets, energy, and silence from decoded audio.

### Phase R3: Soundtrack Identity

Fingerprint the demuxed audio and resolve canonical recording identity through
an approved recognition provider. Preserve recording ID, title, artist, ISRC
when available, confidence, cue offset, and provider receipt. Never obtain the
song by scraping or downloading an unauthorized stream.

### Phase R4: Canonical EditFingerprint

Unify measured visual, audio, semantic, and identity evidence. Every field must
carry units, confidence, source, algorithm version, and coordinate space.
ThinkForge and Editron consume this same contract.

### Phase R5: Adaptive Planning

Normalize the reference into structural slots and rhythm relationships. Map
those slots to target footage and narration. Director resolves conflicts using
speech, action continuity, narrative pressure, brand, duration, and platform
constraints before emitting concrete timeline decisions.

### Phase R6: Rendered Verification

Analyze the rendered result, not only the plan. Compare structural alignment,
beat/section alignment, energy trajectory, cut-density curve, shot-duration
variance, and protected-silence behavior. Fail visibly when the requested
reference match cannot be achieved with the available material.

## Production Exit Gates

- Cut detector beats the current fixed-threshold baseline on the R0 corpus.
- Beat/downbeat timing error is measured and reported.
- No production path collapses precise timestamps into cuts per minute before
  adaptive planning.
- No unused fingerprint extractor is presented as production capability.
- Reference song identity and cue offset survive into the delivery receipt.
- Same-song preview and clean export are both covered end to end.
- Speech-boundary, charged-silence, and non-metronomic rhythm tests pass.
- Rendered similarity is verified against the source fingerprint and the
  adaptation plan.

## Explicit Non-Goals

- Downloading copyrighted audio from YouTube or another streaming platform.
- Automated legal classification of a user's uploaded song.
- Exact visual cloning where target footage, script, brand, or duration differ.
- Treating Gemini estimates or one FFmpeg threshold as measured ground truth.
