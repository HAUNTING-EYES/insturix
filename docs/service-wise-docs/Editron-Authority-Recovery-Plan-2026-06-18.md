# Editron Authority Recovery Plan

## Summary

Editron's core issue is not that signals are absent. Signals reach the pipeline, but they are not consistently the decision authority. Creative Brief still outputs executable-looking overlay labels, signal decisions often become evidence-only, and some telemetry can call the system "unified" even when it is only merged downstream.

The target architecture is:

```text
canonical edited timeline
+ Creative Brief facts
+ signals
+ atoms
+ screen context
+ brand
+ budgets
-> unified planner
-> executeEDL
```

Creative Brief stays in the system for holistic story understanding, but becomes semantic and narrative context. Signals and family planners decide executable overlays.

## CEO And Eng Review

CEO verdict:

- Keep Creative Brief for holistic story understanding.
- Stop letting Creative Brief directly choose overlay forms.
- Do not tune or calibrate until planner authority and rendered quality gates are sane.
- Require visible proof from real projects, not just metadata.

Eng verdict:

- Do not claim Path E and Path D are merged unless code proves one producer, one decision owner, one timeline truth, and one final consumer.
- Phase work max 5 files at a time.
- Add tests before behavior changes.
- Keep compatibility labels only at the renderer adapter edge, not as creative authority.

## Phases, Aims, And Absolute Tests

### Phase 0: Truth And WIP Safety

Aim: know branch state, dirty files, divergence, and which existing changes are safe.

Absolute tests:

- `git status -sb` is recorded.
- Dirty files are classified as keep, revert, redo, or unrelated WIP.
- No behavior changes.
- Path E and Path D status is proven from code, not assumed.

### Phase 1: Authority Truth

Aim: stop misleading authority metadata.

Absolute tests:

- `unified-planner` appears only when one planner actually ranked candidates.
- Evidence-only signal runs report `merged-supplemental`.
- Every candidate has selected, evidence-only, rejected, or shadowed plus reason.

### Phase 2: Creative Brief Fact Wrapper

Aim: keep Gemini clarity while removing direct overlay authority.

Absolute tests:

- Brief outputs facts: claim, proof, quote, contrast, process, emotional beat, and topic shift.
- Brief cannot directly force keyword box, zoom push, whip pan, or whoosh.
- Old labels survive only as compatibility hints.

### Phase 3: Signal Candidate Normalizer

Aim: turn raw signals into usable candidates.

Absolute tests:

- Every signal has family, job, timing anchor, evidence, confidence, completeness, risk, and source.
- `momentWeight` is not execution confidence by itself.
- Rejections persist with reasons.

### Phase 4: One Unified Planner

Aim: one planner chooses final overlays.

Absolute tests:

- `executeEDL` receives planner-owned decisions only.
- Strong signals can win without Brief asking.
- Brief hints cannot override safety, timing, density, or family logic.
- Mongo and logs correctly show `creativeBriefRole = semantic-context` and `signalRole = candidate-source`.

### Phase 5: Family Planners

Aim: each overlay family resolves from atoms, jobs, and physical form, not preset labels.

Absolute tests:

- Captions use speech timing, phrase groups, readability, screen safety, and brand.
- Zoom uses subject position, speech and emotion peaks, camera motion, shot scale, and recent memory.
- Transitions use boundary atoms: topic shift, pause, motion, beat, visual change, and emotional jump.
- SFX uses beat, transition/MG/zoom sync, silence pocket, and provider quality.
- MG uses visual explanation contract, semantic atoms, signals, screen context, and brand.
- Repetition and density are explainable.

### Phase 6: Rendered Quality Gate

Aim: judge actual output.

Absolute tests:

- Rendered samples exist for captions, zooms, transitions, SFX, and MG.
- Issues persist overlay id, family, frame range, severity, reason, and artifact path.
- A 0/100 or critical visual failure cannot pass silently.

### Phase 7: Calibration

Aim: tune weights only after structure works.

Absolute tests:

- Calibration refuses live tuning if authority or render gates fail.
- Dataset has diverse creators and a holdout split.
- Failed-quality projects do not write learning.
- Report shows before and after by overlay family.

## Global Done Test

A fresh upload must produce:

- correct authority metadata,
- normalized candidate audit,
- planner-owned final decisions,
- family-specific reasoning,
- rendered quality artifacts,
- persisted issue details,
- and no false pass when output is visibly bad.
