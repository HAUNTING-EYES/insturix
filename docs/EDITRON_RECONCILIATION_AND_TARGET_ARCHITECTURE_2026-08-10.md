# Editron reconciliation and target architecture — 2026-08-10

## Status and purpose

This is a decision and audit record, not a claim that the target has been built.
It records the verified current state of the `infrastructure-improvs-+Editron`
worktree, the desired AI-native editing system, the user journey, the overlay
findings, professional capability gates, external research, and the safe
retirement plan for duplicate motion-graphics systems.

Audit worktree at the time of writing:

```text
D:\google downloads\Front-End-main\editron-worktree
branch: infrastructure-improvs-+Editron
HEAD:   b3015b2116794956ceb4764f3da1bd6e9f67c712
```

The worktree had pre-existing user changes. This document does not alter those
changes. The IF1 artifact remains a separately frozen interface contract at
tag `editron-interface-freeze-1` (`5a47e008…`); it is not a project-wide
runtime migration.

Primary planning source: `D:\google downloads\Editron_All_Parallel_Session_Documents_Except_A\mnt\data\Editron_Parallel_Session_Document_Pack_Except_A\Integration_Owner\01_Editron_Canonical_Modular_Implementation_Master_v3_Complete_Source_Pack.pdf`.

## Executive truth

Editron has valuable media analysis, planning, rendering and evaluation pieces.
It is not yet a dependable single editing system. Existing overlay behaviour can
be generic, absent, misplaced, partially persisted, or reported successful when
the expected visual/audio result did not land.

The main cause is architectural fragmentation, not merely a weak prompt or one
missing transition effect:

1. Several automatic, chat and manual paths decide the same family differently.
2. Several paths directly mutate project state rather than flowing through one
   transaction owner.
3. Hard-coded edit profiles and style defaults still supply creative authority.
4. Render fallbacks can conceal invalid state instead of failing visibly.
5. Some proof is post-save, non-blocking or only validates a weak proxy.
6. Unit tests establish component behaviour but do not establish that a real
   user request produced a brand-appropriate rendered result.

The product target is therefore not “add more AI calls.” It is one fast,
AI-native editing loop in which the model makes bounded editorial proposals and
the system reliably turns the selected proposal into a visible, reversible and
provable result.

## Product decision: AI-native motion graphics only

The intended Editron product direction is:

- In the editing product, motion graphics are generated as code by an AI
  designer/coder and rendered in the controlled Editron runtime.
- The model may use a constrained component kit and declared props. It must not
  receive database write authority or ship arbitrary executable code unscanned.
- The standalone SaaS explainer-video product is a separate product. It is not
  a source of project overlays, timeline ownership or delivery truth.
- Native deterministic MG and legacy HTML/template/generated-scene systems are
  not the desired end-state creative authority.

This is a target decision, not evidence that the current codegen lane is live
or production-ready.

### Current MG truth

The AI design-then-code lane is the closest system to the chosen future. It has
typed moment inputs, design pre-pass, code generation, source scanning,
sandboxed compilation, rendering, a visual judge, durable jobs and a generated
sequence asset path. It is still dark-gated and not live-proven.

The 2026-07-19 battle-test record reported 170/170 lane tests and clean lane
type/lint checks, but explicitly recorded that the lane was dark, had no worker
snapshot deployed, and had not passed live workflow, recovery or held-out
quality promotion gates. `MG-Codegen-Lane-Battle-Test-2026-07-19.md` is the
source record.

The remembered “76-matrix” issue was partially repaired, not finally solved.
Commit `254d985f9` (`fix(editron): resolve 76-matrix product failures + MG
landing chain`) is an ancestor of the current HEAD. It repaired three failures,
including the grounded MG child-job landing/re-drive chain. Later codegen work
improved contracts and acceptance. That proves the specific matrix regressions
were addressed in code. It does **not** prove that real generated graphics land
on top of footage, fit the brand, avoid subjects, pass a live visual-quality
gate, or survive real delivery. Those claims remain unverified.

### Why immediate file moves are unsafe

Moving everything called “legacy” into a `legacy/` folder now would be a
cosmetic refactor with a high chance of breaking active imports, routes,
background workers and existing projects. It would not by itself prevent old
code from running. Several supposedly old MG paths still have live producers or
consumers.

The safe prune sequence is:

1. Freeze a baseline of real projects and record every current MG producer,
   consumer, database shape, route, worker, renderer and project migration.
2. Give the AI-codegen lane one canonical project-overlay handoff through
   ProjectService/IF1, with correct z-order and a render/proof receipt.
3. Put old producers behind explicit disabled capability flags. New projects
   cannot create their forms; existing projects remain readable.
4. Migrate or render-compatibly preserve existing projects.
5. Prove parity on the baseline projects.
6. Delete unreachable producers/consumers in small, tested slices. Keep only
   decoders necessary for old project migration, not a second active runtime.

The next engineering task is thus a read-only import and persisted-data census,
followed by an approved, bounded cutover. No MG directory should be moved before
that census.

## Creative Direction is not a preset

`CreativeDirection` is the project’s current creative brief in structured form.
It is not a user-facing “cinematic/corporate/TikTok” preset dropdown.

It belongs in a versioned `EditorialProjectBrief` and contains:

- goal, audience, message, deliverables and aspect-ratio needs;
- the user’s latest instructions and explicitly forbidden forms;
- a pinned `BrandSnapshot`: typography, colour, layout, motion restraint, logo
  policy, accessibility and brand exclusions;
- authorized visual/audio references and accepted examples;
- script, transcript, story beats and supplied assets;
- evidence links to actual footage moments and source metadata;
- rights, privacy, safety, accessibility and delivery constraints;
- user-approved changes made during the project.

Versioning means decisions are explainable and safely invalidated when the
brief changes. It does not mean a user is forced to select a profile. An updated
instruction such as “make the next section restrained and investor-facing” is
new creative direction, and only affected decisions need reconsideration.

Creative precedence is fixed:

```text
legal / privacy / technical limits
  > latest explicit user instruction
  > project and script truth
  > approved brand snapshot
  > authorized references and accepted examples
  > measured footage and audio evidence
  > approved project corrections
  > disclosed generic fallback
```

## Current caption defaults and the correct future

There is no single present-day caption default. Different paths pick different
defaults:

| Path | Current default / fallback | Problem |
|---|---|---|
| Canonical caption form | `subtitle` when no stronger input exists | It is a generic fallback, not a brand decision. |
| Chat tool | `tiktok` is the schema default | Omitted user intent can become a social-caption look. |
| Manual editor / V2 | `font-sans`, karaoke, five words per group | A separate visual default diverges from canonical form. |
| Director legacy action | `subtitle` if no explicit action/profile override | Existing edit profiles remain creative authority. |
| Signal form | High energy + fast speech can select `hormozi` | Coarse hard-coded thresholds stand in for evidence of taste. |

Relevant current files:

- `lib/editron/services/caption-form.ts`
- `lib/editron/services/caption-preset-registry.ts`
- `lib/editron/agent/tools.ts`
- `components/editron/editor/version-7.0.0/components/overlays/captions/default-caption-styles.ts`
- `lib/editron/data/edit-profiles.ts`

The target is one caption authority with a single persisted caption form. The
model can select a **caption communicative job** (for example: accessibility
subtitle, quiet explanatory phrase, energetic emphasis, lyric/karaoke, speaker
identifier, statistic callout). The caption owner then resolves only legal
layout, type, grouping, emphasis and animation from the actual brand snapshot,
footage safe areas, speech timing and accessibility constraints.

### Caption sources worth evaluating

There is no credible, licence-clean, drop-in open dataset of professional
burned-in caption *taste*. Most “caption datasets” teach text recognition,
translation or video description, not typography, hierarchy, safe placement or
brand appropriateness. They should not be used as a production-style oracle.

Useful inputs, after licence review:

- The official [Remotion TikTok template](https://www.remotion.dev/templates/tiktok)
  is a good engineering reference for word-timed, configurable captions. It is
  not a broad style dataset.
- The [Remotion captions and transitions ecosystem](https://www.remotion.dev/docs/transitions/)
  provides frame-accurate primitives. Remotion has a commercial licence
  requirement beyond the free eligibility conditions, so its licence must be
  checked for Editron’s actual company size/use.
- The multi-language subtitle-image dataset is useful for subtitle OCR and
  placement recognition research, not visual taste selection:
  [paper](https://arxiv.org/abs/2411.05043).
- `AVCaps` is useful as an audio/vision/text semantic dataset, not a caption
  design dataset: [dataset paper](https://trepo.tuni.fi/handle/10024/229331).

The right data programme is a rights-cleared internal reference/evaluation set:
short clips plus exact transcript, font/legal entitlement, brand snapshot,
caption form, safe-area result, editor pairwise preference and final customer
approval. Start with a few hundred high-quality, diverse samples. Use it to
evaluate model proposals and tune the caption owner; do not train directly from
scraped creator videos without rights.

## Transition expansion: yes, but not a random effect dump

Editron needs a much broader **supported transition vocabulary**. It should not
give the LLM a flat list of hundreds of flashy effects and let it choose raw
shader parameters.

Transition families to certify separately:

- editorial: hard cut, match cut, J/L-cut, sound bridge, flash/punch cut;
- temporal: dissolve, fade through colour, dip, additive blend;
- spatial: directional wipe, slide/push, shape/iris/clock wipe;
- motivated camera/motion: whip/blur/zoom, match-on-action, directional motion
  carry;
- stylized only when warranted: film burn, ripple, glitch, pixelate, page/cube
  turns, luma/matte transitions;
- compositional: split-screen/reveal, device/UI transition, graphic wipe.

Every transition is a versioned implementation with source-media support,
minimum handles, allowed timing range, available directions, audio policy,
brand restrictions, renderer identity and test/proof requirements.

### External sources worth evaluating

- [Remotion’s transition package](https://www.remotion.dev/docs/transitions/)
  already exposes controlled presentations such as fade, push-cut, slide, wipe,
  flip, clock wipe, iris, zoom/blur, film burn, ripple and crosswarp. It is a
  source of implementation ideas and components, subject to Remotion licensing.
- [GL Transitions](https://github.com/gl-transitions/gl-transitions) is a large
  shader collection with a clear `from`, `to`, `progress` model. Its collection
  licence is MIT by default, but individual shaders may carry their own header
  licence. Every selected shader requires a per-file licence ledger.
- [AutoTransition](https://github.com/Yaojie-Shen/AutoTransition) publishes an
  ECCV 2022 transition-recommendation implementation and a transition-labelled
  dataset. It is useful to study candidate ranking and benchmark design, not as
  an unreviewed runtime model or a licence-free production asset source.
- [Editly](https://github.com/mifi/editly) is a MIT declarative FFmpeg editor
  with GL-transition integration. It is useful as an API/fixture reference,
  not a replacement for Editron’s timeline authority.
- [Match Cutting](https://cove.thecvf.com/datasets/870) provides roughly 20k
  labelled shot pairs from 100 films and can help evaluate semantic match-cut
  retrieval, subject to its research-use terms.
- [AutoTransition’s paper](https://arxiv.org/abs/2207.13479) and newer
  transition-quality benchmarks can inform offline evaluation. They do not know
  the client brand, present project sequence, source handles or user intent.

The build plan is: import no repository wholesale; create a licensed
`TransitionCatalog`; port/evaluate a small representative set per family;
render golden fixtures across video/image/alpha/audio cases; then grow by
families only after the resolver and proof contract are working.

## Fast AI editing without an endless hand-built rules engine

The desire for a smooth “give it footage, references and a request; it edits”
experience is correct. The solution is not to remove all determinism. It is to
use determinism only where computers must be exact and let models handle
creative judgement.

### Three layers, with narrow responsibilities

| Layer | Owner | What it does | What it must not do |
|---|---|---|---|
| Editorial intelligence | high-quality multimodal model | Understands the brief, footage, references and sequence; proposes semantic edits and ranks alternatives | Write raw overlays, invent asset IDs/times, bypass rights or declare success |
| Family authority | caption / transition / MG / SFX owner | Converts a supported semantic proposal into a legal, renderable form | Re-plan the whole project or use unrelated profile defaults |
| Execution and proof | ProjectService + renderer + independent verifier | Commit atomically, render, measure the output, accept/repair/rollback | Substitute a generic fallback and report success |

This is faster to build than a giant deterministic scorer because it avoids
encoding thousands of subjective constants. The required deterministic surface
is deliberately small: project identity, valid target, source handles, allowed
form, licence, timing bounds, safe mutation, and minimum render health.

“Calibration” should also be narrow. It means a compact, versioned evaluation
set of editor/customer preferences that tells us whether candidate A was better
than B for a given brief and moment. It is not a never-ending spreadsheet of
magic thresholds. Use pairwise preferences, rendered comparisons and model
judges constrained by a human scorecard. When evidence is weak, the system
offers a small preview set or keeps the hard cut instead of inventing style.

### Exact transition decision flow

For a request such as “make this moment feel like a fast cinematic transition”:

1. Target resolution finds a real cut or asks the user which moment they mean.
   It returns project/timeline revision, tracks, adjacent clip IDs, source/record
   frames and available handles.
2. Evidence construction gathers the before/after frames, measured motion,
   dialogue, music beats, visual density, protected subjects, current overlays,
   brand motion constraints and reference grammar.
3. The model proposes a bounded semantic intention, for example:

   ```json
   {
     "command": "transition.apply",
     "target": "cut-482",
     "narrativeJob": "reveal-new-location",
     "energyChange": "increase",
     "restraint": "medium",
     "evidenceRefs": ["shot-motion-91", "music-beat-212", "brief-rule-7"]
   }
   ```

4. `TransitionAuthority` retrieves only supported candidate forms plus the
   untouched hard-cut baseline.
5. Small deterministic gates remove impossible candidates: no handles,
   non-adjacent clips, incompatible video/image type, wrong track, visible
   dialogue hazard, unsupported renderer, repeated effect or brand prohibition.
6. The model/ranker assesses the remaining candidates using the actual evidence
   and reference grammar. Direction comes from measured motion/layout; duration
   is bounded by handles, shot length, beat and dialogue spacing; easing and
   geometry come from the versioned transition implementation, not ad-hoc
   model JSON.
7. Editron renders the best 2–3 legal candidates and the hard-cut baseline.
8. Independent checks verify expected clips, exact boundary, visual continuity,
   no black/blank frames and audio continuity. A multimodal judge can compare
   taste after these checks pass.
9. ProjectService commits the chosen form once with undo/replay references.
10. If proof fails, the same family owner repairs, rolls back or asks the user;
    the system cannot claim the transition succeeded merely because a record was
    saved.

The user sees one quick “here are the edits I made” experience. The internal
checks stop missing media, wrong timing and invalid state from becoming a fake
success.

## Ideal user journey

### 1. Open or create a project

The user opens a project, drops in footage, a script, images, a voiceover,
logos, brand files, prior approved videos and optional stock preferences. They
can give a natural-language request such as:

> Make a 45-second launch film from this interview and product footage. Keep it
> premium and restrained like these two references. Use licensed stock only if
> a visual gap is real. Make vertical, horizontal and client-review versions.

There is no “pick an editing profile” step.

### 2. Source preparation happens progressively

The system registers immutable media identity; creates proxies, waveforms and
thumbnails; extracts transcript/OCR/audio/shot/subject evidence; detects music
and beats; records rights; and creates a searchable evidence graph. Short files
finish quickly. Long material is segmented and continues in the background.

The user can begin editing before every derivative is complete. Every result
shows what is ready and what remains processing.

### 3. The brief is assembled and shown back

Editron creates an `EditorialProjectBrief` from the user’s instruction and
files. It shows a concise, editable interpretation:

- goal and audience;
- proposed story beats;
- pinned brand/reference observations;
- available and missing assets;
- rights/stock policy;
- proposed deliverables;
- assumptions that need confirmation.

The user corrects it in ordinary language. That correction becomes part of
creative direction, not a hidden prompt append.

### 4. Plan before destructive edits

The model creates an editorial plan containing cuts, selected moments, caption
jobs, B-roll/stock needs, graphics opportunities, music strategy, transition
intent and deliverables. Every proposal references real evidence and real
project targets.

The UI provides a fast preview and a readable explanation. The user may say:

- “Keep the original opening, but make the product reveal stronger.”
- “No flashy transitions.”
- “Use this stock result for the second beat.”
- “Make captions feel like our last approved campaign.”
- “Remove graphics after 00:24.”

### 5. Execute as reversible batches

Accepted commands are grouped into coherent transactions. A batch does not
partially apply five project writes and leave a broken timeline. It has a receipt,
before/after revisions and an undo reference.

### 6. Render and prove

The user sees progressive previews, not a mysterious spinner. The system checks
state plus rendered visual/audio results. A failed generated MG, bad transition,
missing stock licence or unreadable caption is an explicit failed/repairable
result, not a green “Done.”

### 7. Review, revise, deliver

Clients can comment at timecodes, compare versions, approve/reject, request
changes and receive variants. The complete project retains source identity,
decision history, approvals, delivery evidence and recoverable archive state.

## Long-form architecture

Ten-hour/large-footage capability is an internal scale target, not a product
mode. A short social clip and a feature-length project use the same model:
immutable source identity, elastic segments, section-level evidence, resumable
jobs and hierarchical rendering. Short work simply has fewer segments and is
therefore fast.

Current implementation is not yet qualified for that claim. Present limits and
assumptions include a 3 GB registration guard, short default full-analysis
windows, a roughly three-hour finalization validation path, logical rather than
physical 700 GB test fixtures, and incomplete long-form render/cancellation/QC
proof.

Needed before qualification:

- server-observed multipart/checksum completion and storage reservation;
- immutable source fingerprints and server-owned derivatives;
- durable chunk transcript/OCR/audio/vision merge ledgers;
- hierarchical evidence for sections/moments, not a fixed prompt window;
- virtualized source/record timeline and segmented playback;
- resumable hierarchical render assembly and section QC;
- measured throughput, p95 latency, concurrency, recovery and restore drills.

## Certified operating envelopes, not user presets

Editron should not ask users to choose a “profile.” Internally, it must still
state what it has measured and can honestly sell. Call these **certified
operating envelopes**: for example, agency social/brand editing is certified
only after it passes its scorecard on real projects; film-post is certified only
after its additional scorecard passes. The user sees capability and confidence,
not a preset menu.

## Agency and production-house gates

### Agency gate

Before claiming agency replacement, prove on real projects:

- ingest/proxy/relink/source identity and dependable editing operations;
- correct brand- and rights-aware captions, MG, transitions, B-roll, SFX/music,
  basic colour and dialogue treatment;
- UI/chat parity, safe undo/replay and no false success;
- rendered visual and audio proof, variants, captions, QC and delivery;
- timecoded client comments, comparison, approval and audit;
- three or more real agency projects without hidden engineering rescue.

### Production-house / film-post gate

In addition to the agency gate, prove:

- camera-card/reel/timecode/audio-roll/dailies identity;
- source/record timeline, professional trims, tracks, takes, multicam and locks;
- proxy/relink, conform/reconform and explicit loss-aware OTIO/FCPXML/AAF paths;
- colour management for RAW/log/HDR/SDR, scopes and shot matching;
- professional audio turnover, ADR/restoration, buses, automation and stems;
- VFX pulls, plates, handles, mattes, EXR, versions, change lists and burn-ins;
- picture lock, mastering/QC, IMF/versioning, archive/restore and delivery
  security.

Relevant professional references:

- [Adobe Productions: when to use it](https://helpx.adobe.com/premiere/desktop/collaborate-with-others/collaborate-using-team-projects/when-to-use-team-projects-and-when-to-use-productions.html)
- [Adobe Productions shared-storage practices](https://helpx.adobe.com/premiere/desktop/collaborate-with-others/collaborate-using-productions/general-best-practices-for-using-productions-on-shared-storage.html)
- [Frame.io Camera to Cloud relinking](https://help.frame.io/en/articles/8896457-c2c-getting-started-with-camera-to-cloud)
- [Frame.io comments](https://help.frame.io/en/articles/9105278-comments-panel-overview)
- [OpenTimelineIO feature matrix](https://opentimelineio.readthedocs.io/en/v0.14/tutorials/feature-matrix.html)
- [SMPTE IMF](https://www.smpte.org/standards/st2067)

## Staged programme

### Stage 0 — Rendered truth and capability inventory

Create real reference projects for every overlay family and entry point
(automatic, chat and manual). Record intent, evidence, candidate decision,
mutation receipt, rendered result, proof and a human rating. Build one inventory
of every producer, mutator, renderer and proof owner. Classify every capability:

```text
ABSENT → OBSERVED → INTEGRATED → VERIFIED → CERTIFIED
```

### Stage 1 — EditorialProjectBrief and intelligence boundary

Introduce one creative brief, brand snapshot, evidence reference model, exact
target resolver, provider-neutral model router, semantic command contract,
policy/egress/injection controls, declared effects, reproducibility bindings and
failure dispositions.

### Stage 2 — Overlay verticals, one at a time

For each family: semantic intent → one family authority → legal render form →
IF1 transaction → render → independent proof → accept/repair/rollback.

Order:

1. Captions, because they are the fastest visible brand-quality win.
2. Transitions, because they carry current absent/wrong-time/partial-write risk.
3. AI-generated MG, including correct z-order, durable delivery and proof.
4. B-roll/images/text/reframe.
5. SFX/music/dialogue audio.
6. Colour and finishing.

### Stage 3 — Native web NLE and media fabric

Canonical source/record timeline, source/reel/timecode identity, bins, tracks,
links, locks, trims, takes, multicam, proxies/relink, derivatives, virtualized
timeline, segmented playback and collaborative review.

### Stage 4 — Agency operating system

Review/versioning/approvals, variants, rights, delivery, support and real
project certification.

### Stage 5 — Film/post operating system

Colour, audio, VFX, interchange, conform, mastering, archive and multi-user
post-production certification.

## Immediate next slices

No implementation order should be expanded until each slice is reviewed.

1. **Rendered-truth inventory.** Build the project fixtures, command trace and
   capability/mutator registry. This protects pruning work from deleting hidden
   user behaviour.
2. **Brief and semantic-command boundary.** Add the smallest viable
   `EditorialProjectBrief`/`BrandSnapshot`/evidence/target contract and model
   router. It must produce bounded semantic requests only.
3. **Caption vertical.** Replace conflicting caption defaults with one
   brand-aware owner, atomic project mutation and rendered brand proof.

After review, take transitions next, then the AI-codegen-only MG cutover.

## Non-negotiable architecture rules

- One canonical project/revision/receipt/proof authority. Do not create a
  second ProjectService, checkpoint store, media registry or timeline owner.
- The LLM plans and ranks within bounded candidates. It does not write arbitrary
  overlay JSON, DB records or renderer code into the project.
- Each family has one final form owner. A planner may rank candidates but cannot
  duplicate caption layout, transition geometry, SFX query or MG render form.
- Proof is independent of the producer and must precede a successful outcome.
- Generic fallback is an explicit result, not a hidden replacement for the user
  request.
- Do not claim agency or production-house replacement until the corresponding
  certified operating envelope passes real-world scorecards.
