# Editron reference backtracking and GeneratedCompositionProgram

## Decision

Editron must support two complementary ways to make an edit:

1. **Certified native operations** for cuts, trims, tracks, masks, grades,
   captions, transitions, audio, keyframes and other normal editable actions.
2. **`GeneratedCompositionProgramV1`** for a job-specific composite whose
   footage layout, typography, masks, graphics and motion are most naturally
   expressed as code.

The generated program is a first-class creative operation, not an emergency MG
fallback. It is also not a second project, timeline, writer, renderer authority
or unrestricted code shell. It is an immutable, source-bound render program
which produces a nested composition through the canonical ProjectService
command, receipt and proof path.

The normal strategy is **hybrid**. A reference-driven event reel may use native
source selection, trims, timeline clips, audio mix and transitions around a
generated filmstrip composition. A match cut usually remains a native compound
operation. A unique moving collage can be a generated composition. A simple
trim must never be hidden inside generated code.

## Forensic case study: how the Claude event recap was actually made

This reconstruction is grounded in the original Claude JSONL, the resulting
source files and the rendered artifacts. It corrects the earlier shorthand
that a model simply “looked at the reference and copied it.”

### Evidence read

The conversation spans:

```text
C:\Users\admin\.claude\projects\C--Users-admin-OneDrive-Desktop-Nimit\
  ac772dee-b2d1-4d8b-a5ca-1c38a044a08e.jsonl
C:\Users\admin\.claude\projects\C--Users-admin-OneDrive-Desktop-Nimit\
  74e4176f-475e-4b28-ba45-663dc2d28a17.jsonl
```

The standalone implementation is under:

```text
C:\Users\admin\AppData\Local\Temp\claude\
  C--Users-admin-OneDrive-Desktop-Nimit\
  ac772dee-b2d1-4d8b-a5ca-1c38a044a08e\scratchpad\
```

The decisive files are `mg/src/FilmStrip.tsx`, `mg/src/Title.tsx`,
`mg/src/OutroText.tsx`, `mg/src/Root.tsx` and `build_edit_v2.py`.

### What happened, without handwaving

#### 1. Claude first made the wrong abstraction

It probed two 720x1280 reference videos, made one-frame-per-second contact
sheets, detected cuts and analysed the music. It correctly found the roughly
95 BPM cut rhythm, the flash opening and the broad narrative order. It then
made a first 35-second FFmpeg edit from 25 Pexels clips.

That edit did **not** contain the signature filmstrip or adequate motion type.
Claude nevertheless described the reference grammar as rebuilt. The user's
correction exposed the failure.

The cause is concrete: scene-change detection saw the filmstrip section as one
long shot, and sparse contact sheets did not show its internal state changes.
This is exactly the kind of failure a production system must catch. Google's
current Gemini video documentation likewise says its normal one-frame-per-
second sampling can miss rapid motion and quick changes. Reference inspection
therefore needs adaptive dense sampling, not blind faith in one model pass.

#### 2. The second pass changed the evidence resolution

After the correction, Claude extracted every second frame, and for critical
regions every frame, around these intervals:

- MSME reference 4.3-10.6 seconds: filmstrip entry, scroll and exit;
- workshop reference 0-3.2 seconds: title and white-out;
- workshop reference 8.8-12 seconds: centre-slice reveal;
- workshop reference 17.2-18.8 seconds: flash/smear cut frames.

That denser evidence exposed five observable filmstrip states:

```text
full-frame entry image
  -> entry image shrinks into the centre cell
  -> three columns become visible
  -> centre column travels down while side columns travel up
  -> a different centre cell expands to full frame
```

The yellow title stayed fixed in screen space while the cells moved behind it.
That observation determined that the title and cell group needed separate
transform layers.

#### 3. Claude translated observations into a layout model

It chose a 1080x1920 output and represented the visible result as:

- centre cells: 520x650 pixels;
- 10-pixel inter-cell/border gap, giving a 660-pixel pitch;
- side cells: 264x330 pixels;
- three vertical columns;
- fixed yellow `#FFD400` outlined title;
- centre and side columns with opposing vertical motion;
- one focused entry cell and one focused exit cell.

These were not “Remotion presets.” They were constants in custom React code.
Some were measured or algebraically derived, while others were model/design
approximations. The implementation does not preserve a per-constant provenance
ledger, so Editron must add one.

#### 4. It solved the filmstrip motion as a constrained geometry problem

The centre scroll starts at frame 28 and stops at frame 151. The intended exit
cell is two centre-cell pitches away:

```text
required travel = 2 * 660 = 1320 pixels
travel frames   = 151 - 28 = 123 frames
centre speed    = 1320 / 123 = 10.7317 pixels per frame downward
```

The side columns use `-8` pixels per frame, creating the opposing parallax. A
520x650 centre cell becomes full height when scaled by:

```text
full scale = 1920 / 650 = 2.9538
```

The entry spring animates from that scale down to 1. The exit spring animates
from 1 back to that scale around the new focused cell. The selected cell's
border simultaneously falls from 10 pixels to zero, avoiding a black border on
the full-frame endpoint.

This is the important logic: the model proposed the representation, but simple
math guaranteed that the intended cell arrived at the exact exit position.

#### 5. It chose and bound source material manually through visual curation

Claude downloaded 25 stock clips, extracted one thumbnail from each and viewed
a 5x5 curation sheet. It selected footage for venue, arrival, people, speakers,
coding, collaboration and celebration roles. For the filmstrip it extracted 14
still images plus entry and exit images into the Remotion public directory.

The final mappings are hard-coded asset filenames and source in-points. The
transcript does not contain a reproducible scoring table showing why a given
clip beat every alternative. Therefore this was competent agent-assisted manual
curation, not a product-grade `SourceMatch` system.

#### 6. It generated a program and assembled it with other operations

Claude created an isolated Remotion project with three compositions:

- a 76-frame kinetic title;
- a 190-frame filmstrip;
- a 152-frame transparent outro type sequence.

`build_edit_v2.py` then built a 58-beat, 1099-frame timeline. It combined those
generated compositions with native FFmpeg operations: exact source ranges,
centre crops, grades, zooms, a centre-opening wipe, flash/smear transitions,
22 one-beat montage shots, audio seek, loudness normalisation and fade-out.

This is already the native/generated **hybrid** architecture we want—except it
was a one-off script with hard-coded paths and no canonical project mutation.

#### 7. Render feedback changed the implementation

The first v2 assembly used the concat demuxer. Remotion outputs and the FFmpeg
segments had incompatible timebases, producing frozen frames and a black tail.
The visual contact sheet caught it. Claude changed the assembly to FFmpeg's
concat filter, which decodes and retimes each input.

It then verified 1099 frames, 36.633 seconds, 48 detected cuts, dense entry/exit
filmstrip sheets and a whip-cut sheet. This render-inspect-revise loop is not
optional product polish. It is part of the execution algorithm.

### What the example proves—and does not prove

It proves that a strong coding/multimodal agent can:

- inspect references at multiple temporal resolutions;
- infer a useful composition representation;
- write custom motion code;
- combine it with media tools;
- render, inspect a failure and revise the implementation.

It does **not** prove that the model always understands editing, that its first
analysis is reliable, that source choices are reproducible, that arbitrary code
is safe to run, or that the result can be applied to a concurrently edited
project. Current editing benchmarks report a substantial gap between large
multimodal models and human editing cognition, and complex multi-edit requests
still frequently lose requested changes or damage content that should remain
unchanged. Editron must productise the successful loop, not productise trust in
one provider.

## The production backtracking pipeline

The exact production flow is:

```text
user goal + references + Brand Vault + source media
  -> ReferenceObservation records
  -> ReferenceBlueprint
  -> source-role requirements
  -> SourceIndex retrieval and dense verification
  -> SourceAssignment set
  -> candidate ExecutionDAGs
  -> deterministic plan compilation
  -> native / generated / hybrid execution selection
  -> isolated preview render
  -> visual + audio + semantic comparison
  -> revision or user review
  -> ProjectService apply
  -> receipt + proof + safe undo
```

No arrow means “the model works it out somehow.” Each is defined below.

## Point 5 in detail: how source matching actually works

### 5.1 Build a range-addressable SourceIndex once

Ingest preserves the immutable master asset and creates proxies. Analysis then
stores observations attached to exact source ranges, not just whole-file tags:

```text
asset id and checksum
source start/end and frame/timecode identity
shot boundary and available trim handles
transcript, words and speaker
OCR and visible logos/text
people, objects, actions and setting
subject boxes and screen position
camera and subject motion vectors
shot scale, angle, focus and depth cues
dominant colour, exposure and crop viability
dialogue/music/noise/silence
rights, territory, expiry and allowed use
observation model/version/confidence
```

These are fallible observations. The master and source identity remain truth.

### 5.2 Convert the reference into required roles

The `ReferenceBlueprint` describes roles rather than demanding the original
reference assets. For the filmstrip:

```text
role entry: one full-frame people/event image with safe centre crop
roles centre-1..n: varied workshop/activity images with clear subjects
roles left-1..n and right-1..n: complementary vertical crop candidates
role exit: a shot that can continue as live video after expansion
role title: three lines, fixed centre, high contrast over moving imagery
```

Each role declares hard requirements and soft preferences. “Must have a legal
9:16 crop and 12 frames of exit handle” is hard. “Prefer collaborative energy”
is soft.

### 5.3 Apply hard filters first

The retriever removes candidates that cannot legally or technically work:

- wrong tenant/project or unavailable source;
- rights failure;
- insufficient source range or handles;
- unsupported resolution, alpha, frame rate or codec;
- crop destroys the required subject;
- transcript/dialogue conflicts with the role;
- user or Brand Vault forbids the subject, logo, colour or treatment.

The LLM cannot override these filters.

### 5.4 Retrieve a small candidate set

For remaining ranges, retrieval combines searchable text/semantic embeddings
with measured signals. A role such as “team collaborating, centre-crop safe,
moderate motion” queries all three, rather than trusting a caption alone.

The result is a top-k candidate set with exact ranges and reasons. No raw asset
path invented by the model is accepted.

### 5.5 Reinspect candidate windows at the resolution the edit needs

Sparse project summaries are insufficient for precision work. Editron requests
dense local evidence only around the candidate range:

- several frames per second for shot and crop judgement;
- every frame around a match, fast transition or animation boundary;
- waveform/onsets around music and dialogue boundaries;
- full-resolution crops for text, faces, masks and edges.

The Claude case shows why: one FPS missed the filmstrip's mechanism entirely.

### 5.6 Score candidates and the whole sequence

A candidate receives component scores such as:

```text
semantic/action fit
composition and crop fit
motion/direction fit
continuity and narrative role
brand/reference fit
dialogue and beat compatibility
visual quality
repetition penalty
rights certainty
```

The model may judge semantic, narrative and taste fit. Measured geometry,
handles, rights and timing remain machine-checked. Then a sequence optimiser
selects assignments jointly, because the best clip for one slot may create a
bad repeated or incoherent sequence when viewed with all the others.

For each role it stores:

```json
{
  "roleId": "filmstrip.exit",
  "assetId": "asset-18192389",
  "sourceRange": {"startFrame": 30, "endFrame": 220},
  "cropFocus": {"subjectId": "subject-4", "x": 0.51, "y": 0.44},
  "evidenceRefs": ["shot-44", "motion-44", "rights-9"],
  "alternatives": ["range-98", "range-231"],
  "decisionModel": "source-ranker@version",
  "status": "PROPOSED"
}
```

If the difference between the best candidates is small or a required fact is
unknown, Editron shows alternatives or asks for review. It does not manufacture
certainty.

## Point 6 in detail: how an edit becomes a real execution

### 6.1 Produce target states, not software names

The planner says what must be true:

```text
entry image starts full-frame
entry image becomes centre cell by frame 24
three columns scroll in opposing directions
title remains fixed and legible
exit cell becomes full-frame by frame 189
next live shot must visually continue from the exit image
```

It does not say “use After Effects” or “call Remotion.”

### 6.2 Synthesise candidate graphs from target states and typed operators

The capability registry exposes focused typed operators and the available
native, generated-composition and hybrid execution forms. The **model planner**
must propose candidate bindings and dependencies that could satisfy the target
states. The compiler does not form those creative approaches; it rejects
illegal proposals. Optional approved program memories may be offered in one
benchmark condition, but a separate template-free condition must test whether
the model can derive the graph without them.

For this case the planner may propose three candidate approaches:

1. native layers, crops and transform keyframes;
2. a generated composition with exposed source/font/text parameters;
3. a hybrid: generated filmstrip nested between native clips and audio.

The filmstrip is a strong hybrid candidate because its internal layout is
custom, but its surrounding timeline, sources, mix and delivery should stay
native and editable.

### 6.3 Compile the dependency graph

For the filmstrip:

```text
reference measurements -----------+
source assignments ----------------+-> composition specification
Brand Vault font/colour resolution +

composition specification
  -> GeneratedCompositionProgramV1
  -> static/code validation
  -> isolated preview render
  -> geometry/motion/legibility proof

native entry clip + generated composition + native exit clip + music plan
  -> hybrid sequence preview
  -> continuity/audio proof
  -> canonical apply command
```

The compiler rejects cycles, missing sources, unresolved fonts, unknown imports,
undeclared state effects and impossible frame/range dependencies.

### 6.4 Render against a project snapshot while the user keeps editing

The background job records the project and timeline revisions it read plus the
exact paths/ranges it intends to change. Analysis and preview rendering do not
lock the user's timeline.

When the result is ready:

- if the current revision is unchanged, ProjectService may apply normally;
- if newer edits are provably disjoint, ProjectService may create a newly
  validated command against the current revision;
- if the user changed an overlapping clip/range/layer, the result becomes
  `NEEDS_REBASE_OR_REVIEW` and cannot overwrite the newer edit.

Generated code never performs this merge. ProjectService owns it.

### 6.5 Inspect the actual render and revise

Validators compare real frames/audio with the target:

- cell rectangles and crop focus;
- entry/exit endpoints and motion direction;
- title position, glyph coverage, contrast and safe-zone compliance;
- continuity into and out of the nested composition;
- black/frozen frames, missing assets and duration;
- dialogue/music levels and forbidden flashing.

A multimodal judge may add a semantic/taste score, but it cannot turn a failed
hard check into PASS. A failed preview returns evidence to the planner/code
generator for another bounded attempt. Attempt count, cost and wall time are
limited.

### 6.6 Apply only the approved artifact

The canonical command attaches a particular program hash, input manifest,
renderer environment, output/proxy and exposed parameter schema. The receipt
records before/after/current revisions, changed paths, undo/checkpoint binding
and proof requirement. Later proof records PASS, FAIL or UNVERIFIABLE.

## `GeneratedCompositionProgramV1`

### What it is

A generated program is a versioned bundle with:

```text
program id and source hash
generator model/prompt/tool versions
project, sequence and revision bindings
immutable asset IDs and exact source ranges
canvas, frame rate and duration
declared layers, exposed parameters and output kind
font IDs and licence bindings
allowlisted runtime/dependency versions
declared resource budget
declared state effects
proof obligations and expected reference measurements
preview/final artifact hashes
```

It normally appears in the NLE as an editable nested composition. The user can
open its exposed text, source slots, colours, timing and other declared controls.
Replacing it with a flattened video is permitted only as an explicit render/
handoff choice, not as the only saved representation.

### When Editron should use it

Use it when all are true:

- the result is a bounded visual/audio composition, not a project mutation
  mechanism;
- certified native tools cannot express it cleanly or would require a brittle
  explosion of opaque generated keyframes;
- inputs and outputs can be fully declared;
- the result can be previewed and validated before applying;
- the sandbox and resource budget support it;
- the user requested or allowed generative composition behaviour.

Good examples:

- the three-column filmstrip;
- a reference-driven multi-panel recap layout;
- bespoke typography integrated with footage windows and masks;
- a one-off data-driven or product-UI animation;
- a unique opener whose parameters remain exposed.

Do not use it for:

- ordinary cuts, trims, ripple edits or track operations;
- normal caption forms already owned by `CaptionFormResolver`;
- a certified transition already owned by `TransitionFormResolver`;
- whole-shot grading, audio mixing or mask tracking when native owners exist;
- arbitrary network research, database writes or project file access;
- hiding an unsupported capability and then claiming it is certified.

### “Allowed API” in concrete terms

The model does not receive normal Node.js or unrestricted browser authority. It
writes against a small Editron composition SDK, backed initially by pinned
React/Remotion rendering primitives.

An illustrative API is:

```ts
defineComposition(spec, render)
useFrame()
asset(assetToken)
video(assetToken, sourceRange)
image(assetToken)
font(fontToken)
text(value, textStyleToken)
rect(bounds, paintToken)
mask(maskAssetToken)
transform(node, boundedTransform)
interpolate(frame, inputRange, outputRange, easingToken)
spring(frame, approvedSpringConfig)
sequence(startFrame, durationFrames, children)
composite(children)
emitLayerManifest()
```

Asset and font tokens resolve only through the immutable input manifest. Style
tokens resolve through Brand Vault or an approved licensed default. The SDK
checks finite numbers, canvas bounds, maximum layer count, media duration and
parameter domains.

The following are unavailable:

```text
fetch / sockets / DNS
fs / process / environment variables / secrets
child_process / shell / native addons
eval / Function / unrestricted dynamic import
database, ProjectService or queue clients
arbitrary package installation
unbounded loops, workers or memory
unmanifested local paths
```

The security boundary is not just an import regex. Before production use it
requires static import/AST validation, a pinned bundle, artifact and secret
scanning, a network-disabled isolated worker or microVM, read-only tokenised
input mounts, a write-only output mount, tenant isolation, CPU/memory/disk/frame/
wall-time quotas, cancellation and complete audit logs.

The output is data and media returned to the trusted host. The program cannot
call ProjectService. The trusted host validates the result and creates the
canonical command.

### Job-specific use and system-wide promotion

A generated program starts as job-specific. If editors repeatedly approve the
same structure, a separate promotion workflow can parameterise it, establish
rights, add golden fixtures, adversarial inputs, performance limits and proof
rules, and publish it as a certified catalog capability.

The statuses are:

```text
DRAFT -> EXPERIMENTAL -> CERTIFICATION_CANDIDATE -> CERTIFIED
                                                -> REJECTED
CERTIFIED -> DEPRECATED -> RETIRED
```

No model can promote its own program.

## How the model can propose a multi-tool editing graph

We cannot guarantee that a general model “understands editing.” Current
research explicitly shows a gap. More importantly, an external technique
library does not solve that gap: a library of legal DAG templates can retrieve
only decompositions that somebody already entered.

The near-term mechanism is therefore a falsifiable model bet, not a hidden
template system:

```text
gold/derived observable BehaviourBrief
  + focused typed OperatorSpecs
  + exact project evidence
  + post-production principles
  -> model-proposed candidate DAGs
  -> deterministic compile/reject
  -> isolated proxy render
  -> target + preservation comparison
  -> bounded predicate-specific repair or decline
```

Only the model proposes the conceptual decomposition. The compiler checks
ports, types, preconditions, effects, invalidations, conflicts and proof
requirements; it cannot manufacture the missing creative graph. The renderer
and validators prove or disprove the proposal; they do not make it intelligent.

For “background teal while the person moves to centre,” the planner must infer
that preserving the subject forbids whole-frame grading, that a background-only
change requires region separation, and that movement over time requires a
time-varying transform. A candidate can then bind tracking/mask, inverse-mask
grade, subject transform and composite operators. The experiment must include a
condition where no technique name or graph template supplies that answer.

### Known techniques become optional program memory

Approved technique/program records remain useful as certified fast paths,
planner warm starts and evaluation baselines. Retrieval uses the full target
behaviour and evidence, not literal alias matching. Aliases are only search
metadata. A memory cannot license a missing primitive, waive compilation/render
proof or define the finite boundary of possible edits.

Unknown terms follow the same target-first path: derive an observable result,
ask whether current operators can express it, compile and preview with an
`EXPERIMENTAL` status, or record the exact missing primitive/evidence/validator.
Runtime web search may provide cited knowledge, but it cannot install code or
promote a system-wide capability.

The full correction, current-code reconciliation, deliberate-footage-reuse
policy, long-form latency cascade and experiment conditions are recorded in
[`EDITRON_OPEN_ENDED_EDITING_RESEARCH_RECONCILIATION_2026-08-12.md`](./EDITRON_OPEN_ENDED_EDITING_RESEARCH_RECONCILIATION_2026-08-12.md).

### Replaceable model roles

Do not assume one model wins every role. Benchmark separately:

- orchestrator and graph proposer;
- reference observer/measurer;
- source retriever/ranker;
- composition code generator;
- visual similarity and taste judge;
- audio/music/dialogue judge;
- repair agent after compiler/render failures.

The selected route may use one strong multimodal model for several roles, but
the plan, evidence and project authority remain provider-neutral.

### Model evaluation programme

The held-out Editron set must include the real filmstrip reconstruction plus
harder cases: subject isolation with motion and grade, a multi-shot match cut,
caption reflow with Brand Vault fonts, dialogue-preserving music edits, custom
product animation and ten-hour retrieval tasks.

Measure:

```text
reference measurement error
target decomposition and missing-evidence honesty
correct source-range selection
valid graph rate before compiler repair
compile and render success
number/cost/latency of repair attempts
instruction completion and preservation of untouched content
visual, audio and editorial human preference
rights/privacy/injection violations
false-success rate
```

A stronger model will probably improve first-pass observation and code
generation. It cannot remove the need for dense evidence, compiler validation,
sandboxing or rendered proof.

## Match cut, declared and undeclared

### Current Editron truth: the name exists; the capability is partial

The current repository already knows the words `match-cut`. This was verified
across its producers and consumers, not inferred from the knowledge graph alone:

- `creative-knowledge-graph.json` and `part-3-techniques.json` define a visual
  match through shape, motion, composition or colour;
- `continuity-service.ts` calculates a shallow visual-similarity score from
  description keyword overlap, a short subject-word list and shot-type strings,
  then recommends `match-cut` above a threshold;
- `intent-translator.ts` converts the match-cut intent to a hard cut because the
  executor has no separate visual effect to render;
- `edl-executor.ts` can anchor the label to an already adjacent clip boundary
  and records a zero-visual-change editorial-cut result;
- `transition-layer-content.tsx` renders no tile, correctly reflecting that the
  cut itself is the transition.

That is **partial semantic plumbing**, not a production match-cut capability.
It does not search the source library for the incoming range, densely inspect
outgoing/incoming action phases, solve spatial alignment, compare candidate
renders or prove the viewer perceives the intended connection. The existing
keyword Jaccard score also cannot justify the graph's stronger semantic claims.
Those current paths should be recovered and adapted into the technique contract,
not duplicated by a new transition owner.

The creative graph does provide useful advisory constraints for this programme:
flash accessibility, transition density/repetition, speech-overlap avoidance,
black-frame rejection, visual-clutter limits, caption-zone protection and
word-emphasis fatigue. Its `DETERMINISTIC` labels and numeric taste thresholds
are hypotheses until their actual producer, measurement, validator and held-out
evidence are verified. The graph informs planning; it is not execution or proof
authority.

### When the capability is declared

A match cut is not one renderer effect. It is an editorial relationship across
an outgoing and incoming range. The technique definition can consider graphic,
action, composition, direction, colour, sound and conceptual similarity.

A concrete request follows this logic:

1. Inspect the outgoing window densely and record subject/object, screen
   position, silhouette, colour, motion vector, action phase and audio event.
2. Search eligible incoming source ranges for one or more corresponding
   features.
3. Reject candidates without rights, handles, crop viability or continuity.
4. Reframe/crop candidates so the matching feature occupies a compatible
   position and scale.
5. Align the cut at the relevant action, shape or sound phase.
6. Optionally apply a bounded colour alignment or audio overlap only when its
   owner and evidence permit it.
7. Render several candidate cuts.
8. Check geometry/timing/audio facts and use an editorial judge or human to rank
   whether the relationship actually reads as a match.
9. Apply the selected native command graph and preserve the alternatives.

This can use search, select-range, trim, reframe, grade, cut and audio-overlap
operators. It usually does not require a special “match-cut shader.”

### What “experimental composition of certified primitives” means

Suppose those component operations are certified, but Editron has not yet
certified the semantic technique named `match-cut`. The system may still build
and preview this graph:

```text
certified source search
  -> certified source-range selection
  -> certified trims and reframes
  -> certified hard cut
  -> certified optional colour/audio adjustment
```

Each operation is safe and reversible. What remains unproven is the claim that
the result is a *good match cut*. Therefore the preview is labelled
`EXPERIMENTAL_TECHNIQUE`, requires user/editor approval and cannot count toward
the system's certified match-cut capability score.

### If Editron has never heard the term

Runtime web search must not silently install production abilities. The safe
path is:

```text
unknown user term
  -> search internal technique aliases/library
  -> ask the planner to describe the observable target
  -> determine whether certified primitives can express it
  -> if yes, make an experimental preview with explicit status
  -> if no, report the missing primitive honestly
  -> create a capability-gap record
```

A separate R&D workflow may research authoritative editing sources on the web,
create a `CapabilityProposal`, cite the definition, map candidate operators,
generate sandbox tests and examples, and submit it for engineering/editorial/
rights review. Only the promotion workflow can add it system-wide.

This gives Editron the compounding behaviour the user wants: a novel request can
identify a missing capability and start its addition, without letting a prompt
download code and mutate every customer's production runtime.

## Fonts and word emphasis

Typography is resolved, not guessed in generated code.

1. Use the active, approved Brand Vault typography and licensed font files.
2. Honour an explicit user-approved font override when its rights and glyph
   coverage are valid, recording that it overrides the brand choice.
3. If no applicable font exists, choose a versioned, licensed Editron default
   for the language/script and report the fallback rather than inventing a font.
4. Bind the exact font file hash, face, weight, axes and glyph coverage to the
   render.

Word emphasis starts from transcript meaning, spoken stress, user/reference
evidence and the caption/typography family's permitted emphasis forms. The form
owner chooses within bounded ranges: weight, colour, scale, background, timing
or motion. If emphasis increases font size, it must re-run line breaking,
reading-rate, safe-zone, face/object collision and glyph-overflow checks on the
actual render. A model cannot emit arbitrary `fontSize: 142` and call it
brand-correct merely because that happened in the Claude demo.

## This is not an MG-only programme

The filmstrip case is the current architecture example because it exposes the
hardest mixture of reference analysis, source matching and generated code. The
programme covers every editing vertical:

| Vertical | Normal owner/path | GeneratedCompositionProgram use |
|---|---|---|
| Cuts, trims, tracks, multicam | native NLE/editorial owners | none for normal operations |
| Captions and typography | CaptionFormResolver + Brand Vault | rare bespoke composite type; resolver still owns legality |
| Transitions | TransitionFormResolver + catalog | custom experimental transition only through its owner |
| Titles, lower thirds, panels, collages | graphics/composition owner | frequent for unique job-specific compositions |
| B-roll, images and reframe | source matcher + placement/reframe owners | may fill declared composition slots |
| Masks, mattes and tracking | native mask/tracking owners | consumes versioned mask outputs; does not secretly track |
| Colour | colour owner | consumes declared grade outputs; does not shadow colour management |
| SFX, music and dialogue | audio resolvers/mixer | may emit timed cues/stems, never own the final mix |
| Speed, retime, stabilise and camera motion | native temporal/motion owners | only composed through declared inputs |
| AI-generated video/image assets | separate generative-media capability | may consume the resulting rights-bound asset |

Stage 4 still repairs and certifies one representative end-to-end path per
vertical. Generated composition becomes shared creative infrastructure, not a
reason to postpone captions, transitions, audio, B-roll, colour, masks or the
professional NLE.

## Near-term implementation slices

The architecture should be implemented in this order after the existing safety
and editorial-spine gates:

1. **Forensic fixture:** preserve the filmstrip reference observations,
   blueprint, source roles and expected rendered frames as a legal internal
   evaluation case. Do not import the stock or reference media without a rights
   decision.
2. **Frozen battle-test contracts:** specify a gold `BehaviourBrief`, target
   and preservation predicates plus research-only `OperatorSpec` adapters for
   30–50 existing operations. Include realistic distractors; do not wire a new
   owner or runtime.
3. **Planner-only model benchmark:** compare candidate models over repeated
   trials, including a condition with no technique names or graph templates.
   Decide whether graph synthesis works before productising its control plane.
4. **Sandbox compile/render trial:** compile the best legal candidates and
   prove pinned/allowlisted composition code can proxy-render with no network
   or secrets, immutable tokenised inputs, resource limits, cancellation,
   artifact scanning and tenant isolation. Bound repair attempts.
5. **Conditional filmstrip product slice:** only after the experiment gate
   passes, reproduce the filmstrip through the typed pipeline, attach it as a
   nested composition through ProjectService, and prove save/reload/render/undo
   plus stale-user-edit conflict behaviour.
6. **Program-memory and gap lifecycle:** only after real approved programs
   exist, use match cut as the first partial-capability recovery case, then add
   semantic memory retrieval, experimental status, precise gap records and
   reviewed promotion. Never make aliases/templates the competence boundary.

## External evidence

- [Google Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)
  documents video input, timestamp reasoning, one-FPS default sampling and the
  risk of missing rapid changes.
- [Google Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)
  demonstrates that a model can select typed external functions; the
  application still defines and executes the actual functions.
- [VEBench](https://arxiv.org/abs/2605.03276) evaluates editing-technique
  recognition and operational source selection and reports a substantial gap
  between current multimodal models and human editing cognition.
- [CoVEBench](https://arxiv.org/abs/2606.08415) reports that current models often
  omit requested edits or violate preservation constraints on compositional
  multi-edit instructions.
- [Adobe's match-cut overview](https://www.adobe.com/in/creativecloud/video/discover/match-cut.html)
  describes graphic, action, audio, composition, directional and conceptual
  relationships; this supports treating match cut as an editorial relation,
  not one visual plug-in.

## Acceptance rule

The architecture is successful only when a held-out difficult reference can be
converted into cited observations, exact source assignments, a valid native/
generated/hybrid graph, an isolated render, an honest comparison and a
receipt-bound project edit—while a concurrent user can keep working and a stale
result cannot overwrite their newer changes.
