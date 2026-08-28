# Editron editor foundation and route-arbitration ADR — 2026-08-28

## Status

**Accepted direction; implementation not complete.**

This decision does not change the frozen Stage 2.5 `MODIFY` receipt and does
not authorize Stage 3 model-driven mutation, provider spend, a historical
cohort rerun or a customer-project write.

## Decision in one paragraph

Do not rebase Editron's editing core on OpenCut or Palmier. Keep Editron's
ProjectService, media identity, evidence, revision, proof, render and recovery
owners as the canonical core. Redesign the editor shell and timeline experience
using Palmier and OpenCut as interaction references, and selectively adapt
license-compatible OpenCut primitives only after they pass Editron's timebase,
ownership and saved-project compatibility gates. Native, generated composition
and hybrid remain execution strategies chosen per bounded edit region by a
future route broker; they are not three kinds of user request.

## Why a full rebase is the wrong move now

### OpenCut

Two public OpenCut generations were inspected:

- current rewrite commit
  `400f097becba5db0fbc305d5a65348cb81c20356`, licensed MIT; and
- classic commit `cf5e79e919144200294fb9fed22a222592a0aeea`, also MIT.

The current repository says it is being rewritten from the ground up, its
architecture is still being designed and it is not yet accepting outside
contributions. The classic repository says it is archived and no longer
maintained. The classic code contains useful rational `FrameRate`, integer
`MediaTime`, half-open timeline and timestamp-frame access patterns. It also
contains an ingest path that rounds measured FPS, derives one asset rate from
average packet rate, exports to a selected CFR and does not provide the durable
per-presentation PTS/epoch, proxy/master and recovery contracts Editron needs.

Consequently OpenCut can contribute reviewed MIT ideas or isolated components;
it is not a production core that solves Editron's current hard problems. A
wholesale rebase would still require rebuilding Editron's ProjectService CAS,
receipts, evidence lineage, rights, generated-program sandbox, long-form jobs,
provider accounting and proof infrastructure on top of it.

Public source: [OpenCut](https://github.com/opencut-app/OpenCut).

### Palmier Pro

The inspected local Palmier snapshot is a polished Swift-native macOS editor.
Its four-panel layout, dense but calm timeline, tool organization, agent/editor
coexistence and visual hierarchy are valuable product references. It is not a
drop-in web foundation:

- it requires macOS 26 on Apple Silicon;
- its code is GPLv3, so copying it into Editron would introduce a material
  product-licensing decision;
- its timeline model stores `fps: Int = 30` and primarily exposes integer
  project-frame placement; and
- although source inspection uses AVFoundation timing, the inspected editor
  contract does not supply Editron's required rational mixed-rate/VFR,
  discontinuity, private PTS and proxy/master proof chain.

Palmier is therefore a design and workflow reference unless the product owner
later makes a separate, informed GPL/platform decision. Its code is not copied
by this ADR.

Public source: [Palmier Pro](https://github.com/palmier-io/palmier-pro).

### Editron V2

The current V2 is not a replacement editor core. Its source calls V1 the source
of truth and describes V2 as a re-skinned shell mounted at `/v2`. Its own TBD
file records runtime-unverified behavior, an empty AI Activity feed, unverified
marker persistence, a modal defect and a later route swap. This is shared
provider/state plumbing and a partial UI convergence—not a completed editor
migration.

The right product move is to retain that adapter boundary, reassess the shell
against the Palmier/OpenCut interaction references and replace UI regions in
bounded, tested slices. UI polish must not become a second timeline state or
write path.

## What native, generated and hybrid actually mean

The user asks for an outcome, such as:

```text
make a filmstrip animation over this interview
```

The system first turns that into requirements:

```text
visual target
protected dialogue and room tone
source and timeline ranges
editability requirements
entry/exit continuity
rights and delivery requirements
```

Only then does it consider execution strategies.

| Strategy | Meaning | Typical strength | Non-negotiable limit |
| --- | --- | --- | --- |
| Native | Existing timeline clips, overlays, effects and keyframes build the result. | Direct timeline editability, interchange and familiar manual correction. | Every requested relationship and proof must be representable by real native owners. |
| Generated composition | A bounded editable program owns the visual result for its declared range. It may animate overlays, video panels, masks or custom graphics; it is not limited to still pictures. | Complex synchronized relationships and custom motion can be expressed coherently. | It owns only declared outputs and cannot silently replace native dialogue, source identity or project state. |
| Hybrid | A generated visual island or overlay runs inside a native timeline while native video/audio/colour/captions/delivery remain authoritative where declared. | Custom visuals plus native continuity and audio ownership. | Exact timebase, audio and entry/exit boundary handoffs are mandatory. |

An episode can use all three strategies in different regions. The route is
chosen per edit subgraph, not once for the whole project.

## Why “native takes many steps; generated is one code write” is insufficient

That observation identifies **authoring surface**, not route correctness.

The DEV-02 filmstrip native baseline required 16 independent overlays, seven
keyframe tracks and 14 keyframes, and represented no cross-element
relationships. The generated program represented the coordinated composition
with six declared layers. That makes generated composition a strong candidate
for this particular relational animation.

But a generated candidate is not operationally one step. It still needs:

```text
program generation/selection
-> schema and source verification
-> rights/font/media binding
-> sandbox compilation and render
-> decoded target/preservation proof
-> ProjectService insertion
-> rollback/undo and delivery proof
```

Therefore operation count and authoring effort are ranking inputs, never a
shortcut such as “more than N native operations means generated.” A many-cut
montage may remain natively simple; one unusual coordinated visual may be much
safer as a generated island.

## Production route-broker contract

The route broker does not invent final visual form. Existing family
resolvers/composers/renderers remain the owners of duration, layout, typography,
keyframes, styling and animation details.

For each bounded edit it must:

1. Materialize the target, preservation, evidence, coordinate, editability,
   delivery and rollback claims.
2. Enumerate only strategies backed by currently registered owners.
3. Reject a candidate before ranking if it cannot prove source identity,
   timebase, audio ownership, boundaries, rights, current revisions, locks,
   requested editability, delivery or rollback.
4. Compare remaining candidates in this order:
   target fidelity; preservation confidence; canonical editability and
   round-trip; continuity/correction locality; quality risk; latency; compute
   and provider cost; authoring surface.
5. Use an explicit project policy or a bounded user comparison when materially
   equivalent candidates remain.
6. Lower the selected graph into the existing canonical owners. The broker,
   model and generated runtime receive no direct project-write authority.

If two candidates are genuinely equivalent, prefer native by default for
timeline editability and interchange. That is a tie-breaker, not a rule that
native always wins. A project may instead declare a generated-first policy for
branded relational motion, or ask the user to choose between proved previews.

## Filmstrip decision under this contract

For the already-tested filmstrip family:

- **Native is feasible** as an approximation, but its independent overlay and
  keyframe surface is large and brittle for coordinated panel relationships.
- **Generated composition is the preferred visual-form owner** for the bounded
  filmstrip island because the motion is relational and custom.
- **Hybrid is the complete reel strategy** when existing timeline footage,
  dialogue, room tone, colour, captions or the return shot remain native.

This is a decision for the current filmstrip requirements and evidence. It is
not a global rule for every montage, split screen or image placement.

## UI modernization boundary

The editor-modernization programme should proceed independently of the media
core migration but consume the same canonical commands:

1. Freeze an interaction inventory covering media browser, source/program
   monitor, timeline, inspector, AI activity, review/proof and delivery.
2. Create route-neutral wireframes inspired by Palmier/OpenCut without copying
   GPL implementation or visual assets.
3. Bind every manual action to an existing or explicitly missing CAP-2 owner;
   no local-only shadow mutation.
4. Prototype the shell against an immutable ProjectService read model and
   command adapter.
5. Certify keyboard, accessibility, timeline performance, save/reload, undo,
   conflicts and proof states before swapping the main route.

This preserves the user's preferred cleaner interface direction while avoiding
a risky core rewrite disguised as a redesign.

## Consequences

- OpenCut/Palmier research is complete enough to reject a wholesale rebase now.
- Selective OpenCut adoption remains allowed only with provenance, license,
  compatibility and gap tests.
- Palmier may influence information architecture and interaction design, not
  code, unless a separate GPL decision is approved.
- Editron still needs the canonical rational/PTS time foundation, universal
  mutation preconditions, a production route broker and family-by-family
  certification.
- RHC-01 through RHC-04 remain canaries. They do not prove all editing.

## Proof boundary

This ADR is based on current Editron code and receipts, the local OpenCut source
inspection above, the local Palmier source snapshot, official public NLE
behavior and the existing production parity audit. It makes no claim to have
inspected proprietary Adobe/Blackmagic internals, to have completed a live
Palmier/OpenCut comparative usability study, or to have implemented the route
broker or redesigned shell.
