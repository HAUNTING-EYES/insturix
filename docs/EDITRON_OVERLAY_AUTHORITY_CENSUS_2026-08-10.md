# Editron overlay authority census - 2026-08-10

## Purpose and confidence

This is a code-grounded census of the current `infrastructure-improvs-+Editron`
worktree at `b3015b2116794956ceb4764f3da1bd6e9f67c712`.  It is an authority map,
not a claim that the current render output is reliable.  It combines direct
inspection of current renderer/types/executor code with the earlier, file-level
overlay decision map.  Any legacy path proposed for retirement must still be
traced from producer to persisted record to renderer to proof before removal.

The finding is unambiguous: Editron has several genuine duplicate decision
paths.  They are not just several buttons for the same safe command.  They
often create different payload shapes, use different form defaults, persist by
different routes, and have different completion/proof behaviour.  This is a
primary explanation for "it exists, but it does not work reliably".

## Current render vocabulary

`components/editron/editor/version-7.0.0/types.ts` mixes persisted overlay
types with UI-only panel concepts.  The actual persisted visual/audio content
types include:

| Persisted type | Current renderer branch | Intended meaning |
|---|---|---|
| `VIDEO` | `LayerContent` | source/B-roll/clip media |
| `IMAGE` | `LayerContent` | still media |
| `TEXT` | `LayerContent` | generic text layer |
| `SHAPE` | `LayerContent` | geometric layer |
| `SOUND` | `LayerContent` | generic audio layer |
| `CAPTION` | `LayerContent` | timed captions |
| `STICKER` | `LayerContent` | sticker/graphic |
| `HTML_SCENE`, `HTML_STICKER` | `LayerContent` | HTML-authored graphics |
| `GENERATED_SCENE` | `LayerContent` | generated visual scene |
| `MOTION_GRAPHIC` | `LayerContent` | native/Remotion graphic |
| `MG_SEQUENCE` | `LayerContent` | code-generated rendered MG sequence |
| `TRANSITION` | `LayerContent` | transition presentation |

The atomic editing layer separately declares 16 families in
`lib/editron/engine/atomic-overlay-core.ts`: motion graphic, video, image,
HTML scene/sticker, text, sound, shape, sticker, zoom, transition, SFX, speed,
fade, camera shake and caption.  Several are *operations* or parameter
families rather than standalone render types.  This is acceptable only if they
all resolve through one owner; currently they do not.

`Lottie`, `Template`, `AI_CHAT`, `AI_SUGGESTIONS`, `QUALITY_REVIEW`,
`SCAN_REPORT`, `TRANSITIONS`, and `SFX_LIBRARY` also appear as editor/UI
categories but are not all distinct `LayerContent` renderer cases.  That
mixing hides lifecycle ambiguity: a panel/category is being treated as though
it were an editable asset type.

## Render-order defect affecting MG

The common layer renderer uses a row-derived stacking order:

```text
caption -> z-index 95
transition -> z-index 85
everything else -> 100 - (row * 10)
```

See `components/editron/editor/version-7.0.0/components/core/layer.tsx`,
lines 27-48.  A normal source-video row of 2 is therefore z=80.  An
`MG_SEQUENCE` generated on `ROW.MOTION_GRAPHICS` (row 6) is z=40, so it can
render *behind* the footage it was intended to decorate.  The sequence
artifact builder writes that row in
`lib/editron/motion-graphics/codegen/sequence-artifacts.ts`.

This is a concrete current rendering conflict, not a taste problem.  The
native fallback sometimes writes a graphic on `ROW.BGM` to get it higher in the
stack.  That makes a semantic audio row carry a visual ordering workaround.
It must be corrected by an explicit visual compositing/track order, never by
more special row choices.

## Family-by-family ownership map

### 1. Captions - multiple form authorities

| Producer | Current form/default | Persistence path | Conflict |
|---|---|---|---|
| Auto/Director path | canonical caption track/form | EDL/Project path | closest thing to a canonical automatic path |
| Chat tool | omitted style defaults to `tiktok` | chat adapter | different default from form resolver |
| Caption form resolver | fallback `subtitle`; may choose `hormozi` for high rate/energy | resolver output | brand information is not a required input |
| Manual V2 overlay UI | `font-sans`; karaoke; five-word display configuration | direct editor mutation | independently chooses form without the automatic resolver |
| older templates/services/presets | capture/template paths | legacy/direct | older layout and typography meanings remain reachable |

Evidence: `lib/editron/services/caption-form.ts`,
`lib/editron/agent/tools.ts` (the chat default near line 2599), and
`components/editron/editor/version-7.0.0/components/overlays/captions/default-caption-styles.ts`.

**Result:** at least four plausible caption style/default authorities exist.
They can all render `CAPTION`, so shared rendering does not make their
decisions equivalent.  The immediate problem is not lack of a 100th caption
preset; it is the absence of one brand-aware `CaptionFormResolver` and one
canonical command path.

### 2. Transitions - split automatic and direct mutations

| Producer | Current form | Persistence/transaction behaviour | Conflict |
|---|---|---|---|
| Brief/EDL executor | `TransitionOverlay` after EDL form resolution | atomic current command route | main automatic lane |
| Signal/storyline helpers | recommend or emit transition candidates | reaches EDL for some flows | secondary automatic producer |
| Manual editor UI | `add_transition` direct handler | direct/manual path | skips the same command/receipt route |
| Chat/direct legacy flows | direct or adapter calls depending on tool | mixed | can differ from EDL choices |
| old template effects | older layout/template behaviour | legacy | overlap with transition visual language |

The executor explicitly states that EDL graphics route through composition
planning near `lib/editron/engine/edl-executor.ts:4625`, but direct/manual
transition operations are still separate.  The current automatic inventory is
also narrow: about 22 renderable styles, while the brief vocabulary covers only
about nine.  Image seams and direct transition commits are known high-risk
cases.

**Result:** two or more authoritative transition writers exist.  A user can
get a different duration, easing, neighbour/handle treatment and proof result
depending on whether they click a panel, talk to chat, or use auto-edit.

### 3. Motion graphics, text and HTML scenes - the largest collision set

| Producer/form family | Current persisted result | What it overlaps |
|---|---|---|
| AI code-generated MG | `MG_SEQUENCE` | native MG, generic text, HTML scene, generated scene |
| native composition/Remotion MG | `MOTION_GRAPHIC` | codegen MG and lower-third/title needs |
| direct generic text | `TEXT` | text-based MG/lower third/title calls |
| HTML scene/sticker | `HTML_SCENE` / `HTML_STICKER` | bespoke MG, cards, product callouts |
| generated scene | `GENERATED_SCENE` | graphics/illustration insert needs |
| templates/Lottie/stickers/shapes | various types or authoring categories | decorative, CTA and branding needs |
| SaaS explainer lane | separate product scope | may share primitives but is explicitly not the auto-edit MG owner |

This is not one "motion graphics system."  It is a set of overlapping ways to
make a visual overlay, each with different layout, timing, render, update and
delivery rules.  The old inline/template branch may no longer be the primary
EDL path, but its reachable producers and content forms must be proven absent
before it can be called retired.

`lib/editron/motion-graphics/codegen/mg-delivery.ts` also has a
`degraded_allowed` client-auto-edit integrity posture by default.  A delivery
may therefore complete with missing graphics and warnings.  That is unsuitable
for any "completed" claim until a strict receipt/proof disposition is added.

**Result:** this family has both authority duplication and a verified compositing
failure.  It is P0.  The desired end-state is precisely two products:

1. **AI-generated Editron MG**: typed intent -> code/scene artifact -> bounded
   renderer -> visual proof -> ProjectService command.
2. **SaaS explainer authoring**: a separately scoped product which may reuse
   render primitives but never becomes a second auto-edit decision owner.

All other MG/template routes first become adapters or quarantined legacy, then
are removed only after parity and migration evidence.

### 4. B-roll, source video and images - overlapping selection and placement

Source video/image placement can originate from manual overlay panels, chat
asset tools, scene/storyboard logic and auto-edit/EDL producers.  `VIDEO` and
`IMAGE` share a renderer but do not consistently share source identity,
rights evidence, placement semantics or undo/proof routes.

**Result:** a future `MediaPlacementResolver` must own the final placement form:
clip/asset identity, source range, timeline range, crop/reframe, safe position,
rights constraint and proof rule.  The LLM may propose a candidate and explain
why; it must not invent a second direct media writer.

### 5. SFX, music and generic sound - three partially separate systems

| Need | Current lane | Principal issue |
|---|---|---|
| SFX | atomic/EDL SFX with catalog work and a kinetic context path | provider starvation and separate asynchronous context/delivery behaviour |
| music/BGM | dedicated BGM service, intentionally outside the EDL in places | timing/cut-sync and rights rules are not one shared audio form owner |
| generic sound | direct `SOUND` overlay/editor controls | bypasses selection/ranking/rights decisions |
| dialogue treatment/ducking | audio-duck and other operations | no unified mix/session model |

The S2 pilot is not a library cap.  Its 11 opportunities are a *small,
human-listened ground-truth evaluation set*.  The 50-60-ish current SFX assets
are a bootstrap catalog, not a production-house inventory.  A production
system needs a licensed, indexed and rights-auditable library at much larger
coverage, plus an asset resolver; an LLM cannot create missing licensed assets.

### 6. Zoom, reframing and camera motion - direct keyframes versus resolver

EDL has a resolver-led zoom path, while direct chat/editor flows can write
visual/keyframe changes and post-processing can apply drift zoom.  Their
timing, subject evidence, visual form and undo semantics differ.  Some old
zoom keys are not consumed by the current renderer.

**Result:** create a single `CameraMotionResolver` that accepts subject/motion
evidence and returns a bounded transform form.  Direct UI and chat call the
same command; neither writes independent keyframes as an alternative owner.

### 7. Speed, fades, shake and colour - incomplete family owners

| Family | Current condition | Consequence |
|---|---|---|
| Speed | automatic resolver works in some EDL paths; user veto/preview and direct parity are weak | inappropriate speed change is hard to correct safely |
| Fade | handler exists but automatic producer is largely absent | capability looks available but is rarely selected |
| Camera shake | thin, separately parameterised | easy to overuse; little evidence or proof |
| Colour/filter | automatic normalisation, ThinkForge/storyboard and manual-chat CSS filter paths differ | no colour-management/grade owner or show look authority |

These should not receive more knobs before their owner boundary is made
explicit.  In professional work, colour is a grade/colour-management domain,
not an ad-hoc CSS-filter mutation.

### 8. Pacing, cuts and editorial structure - not an overlay but a governing conflict

Transcript/R0, Director brief execution, story/pacing helpers and BGM beat
sync can influence editorial structure separately.  They need a single
`EditorialPlan` that owns selected takes, cuts, timing and motivation.  Effects
must consume that plan; they must not silently rewrite a cut after the fact.

## Why shared helpers are not a single system

For every family above, a path is only truly unified when all of these are
identical and code-verified:

```text
producer -> canonical command -> one final form resolver -> ProjectService
        -> canonical projection -> renderer -> versioned proof -> receipt/undo
```

Today several families merely share a React renderer or an asset helper.  They
remain separate systems because producer, decision owner, source of truth and
final consumer differ.  We must call this **partial downstream sharing**, not
unification.

## P0 pruning and consolidation order

Do not move a directory called `legacy` first.  That would break unknown direct
imports and create two active paths.  Use the following safe order:

1. Build a generated producer -> command -> persisted type -> renderer -> proof
   ledger for every item in this census and exercise it with a minimal fixture.
2. Declare the intended canonical owner and compatibility policy per family.
3. Route one caller family at a time through an adapter to that owner; retain
   a temporary read-only compatibility renderer only where old projects need it.
4. Compare render and receipt output on golden fixtures.  Migrate saved
   documents where needed, with reversible migration records.
5. Remove the old producer/imports only when search plus tests prove no callers
   remain.  Archive static reference assets, not executable duplicate writers.

The first three P0 consolidation targets are:

1. **MG/text/HTML**: repair stacking, define one auto-edit MG owner, make missing
   MG a structured non-success; preserve SaaS explainer separately.
2. **Transitions**: put manual UI/chat/automatic requests through one catalog
   and `TransitionFormResolver`; eliminate direct mutation parity gaps.
3. **Captions**: one brand-aware form resolver and canonical command adapter;
   use a human-owned taste evaluation set rather than multiplying defaults.

## Investigation limits

This census establishes conflicting authority and the concrete MG z-order bug.
It does not assert that every historical template is currently reachable in a
production deployment, nor that the codegen MG quality is now good in real
customer work.  Those need rendered fixture tests and controlled end-to-end
projects.  The next phase is a source/import/consumer ledger before modifying
or moving any legacy code.
