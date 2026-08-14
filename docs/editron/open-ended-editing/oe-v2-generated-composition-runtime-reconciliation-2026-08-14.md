# OE V2 Generated Composition Runtime Reconciliation

Date: 2026-08-14  
Branch: `infrastructure-improvs-+Editron`  
Status: code-grounded design boundary; no production wiring

## Outcome

Editron already has useful generated-code infrastructure, but it does not yet
have `GeneratedCompositionProgramV1` as a canonical, editable, source-bound
nested-composition capability. The correct implementation is a new contract
over reused isolation and delivery substrate, not a renamed MG path and not a
second project/timeline authority.

The current DEV-02 Stage-5 decision therefore remains `CAPABILITY_GAP`.

## Current producer-to-consumer truth

### 1. MG codegen

```text
licensed SemanticMgCandidate
  -> MG-specific prompt and kit
  -> generated TSX
  -> regex construction scan
  -> TypeScript compile
  -> render probe and visual judge
  -> durable MG render job and lease
  -> Vercel Sandbox worker
  -> transparent PNG then WebP frame sequence
  -> R2 sequence asset
  -> MG_SEQUENCE overlay
  -> ProjectService.commitMgRenderDelivery
```

Verified owners and consumers:

- `codegen-service.ts` owns the MG-specific generate/scan/compile/judge loop.
- `scan.ts` permits only the MG kit and enforces transparent, brand-tokenised
  motion-graphic construction.
- `worker-contract.ts` binds one semantic MG moment, three visual-evidence
  frames, canvas, request identity, and a transparent WebP sequence result.
- `sandbox-render-worker.ts` owns Vercel Sandbox creation, bounded execution,
  job-scoped storage authorization, polling, and teardown.
- `frame-renderer.ts` creates an isolated Remotion bundle, renders bounded PNG
  frames, transcodes them to WebP, and rejects missing alpha unless the caller
  explicitly declares an opaque output.
- `mg-render-job-runner.ts` persists the sequence asset, builds the MG overlay,
  and delegates the one timeline mutation to
  `ProjectService.commitMgRenderDelivery`.

This is real infrastructure. It is not a general generated composition:

- the input is one semantic MG fact, not arbitrary source slots and ranges;
- the scanner requires the MG `Stage`, `phases`, ambient motion, brand tokens,
  and kit-only imports;
- the saved representation is a baked frame sequence, not an editable program
  with exposed parameters;
- the worker contract assumes a transparent MG result;
- its canonicalizer uses `localeCompare`, so it must not become the new
  cross-runtime program identity implementation.

### 2. Freeform GLM

```text
developer request
  -> local context pack
  -> Ollama model
  -> TypeScript AST/syntax and dangerous-source validation
  -> source code returned to the developer route
```

`freeform-glm/generate-scene.ts` is useful evidence for AST parsing, traceable
element maps, compact repair feedback, and deterministic-source rules. It does
not sandbox-render the output, bind immutable media inputs, produce a render
artifact, or mutate a project. It cannot be promoted directly to production.

### 3. SaaS explainer

```text
crafted scene source files
  -> write into a separate Remotion project
  -> deploy a per-video Lambda site
  -> render public H.264 MP4
```

`saas-explainer/explainer-render.ts` is an intentionally separate scoped
experience. It writes generated files into a shared checkout and deploys a
whole per-video site. It has no program manifest, immutable source-range
binding, nested-composition editability, canonical project command, or general
sandbox contract. It remains separate.

### 4. Legacy HTML scene

`generate_html_scene` is still present in legacy chat/director code, but the
new agent path explicitly bans substituting it for semantic composition. The
V2 operator catalog correctly marks it unsandboxed and not compilable. It is
not a migration shortcut.

## What may be reused

The future generated-composition worker should reuse or generalise these
existing mechanisms without changing their ownership:

1. Durable job identity, leasing, retry, stalled-job recovery, and terminal
   result discipline from the MG render-job service.
2. Vercel Sandbox creation and unconditional teardown.
3. Job-scoped storage authorization rather than permanent cloud credentials.
4. Bounded CPU, memory, wall time, request size, and output size.
5. Hermetic workspace construction and explicit public asset materialization.
6. Remotion bundle/select/render cancellation behavior.
7. Content-addressed artifacts and immutable input hashes.
8. ProjectService-issued delivery using an expected project revision.
9. Receipt-first failure reporting and no success on a failed render.

Reuse is substrate reuse. It does not make MG, freeform GLM, or SaaS explainer
the new composition owner.

## What must remain distinct

- Caption, transition, mask/tracking, colour, audio, source-range, and timeline
  owners retain their native state and form authority.
- A generated composition may consume their versioned outputs; it may not
  secretly implement or persist a second version of them.
- The model may generate composition source; it may not call ProjectService,
  Mongo, R2, Qdrant, queues, secrets, or external networks.
- The sandbox renderer may produce preview/final artifacts; it may not insert
  them into a project.
- ProjectService alone applies an approved program reference or a deliberate
  flattened handoff artifact to the canonical project revision.

## Required `GeneratedCompositionProgramV1` contract

The first research contract must bind all of the following before any code is
executed:

- program ID, contract version, source hash, and generator provenance;
- project ID plus opaque expected project revision;
- immutable source asset/version IDs and exact source-coordinate ranges;
- project, source, and composition-local rational timebases;
- canvas raster, pixel aspect, colour intent, duration, and head/tail handles;
- declared source slots, text/font slots, masks/tracks, and exposed parameters;
- resolved font file hashes, faces, weights, axes, glyph coverage, and licence;
- allowlisted rendering API and exact dependency/runtime versions;
- output kind: transparent island, opaque island, or declared audio-bearing
  island;
- audio cue handoff only; final SFX/music/dialogue placement remains native;
- network/secret/database/project mutation policy, which defaults to deny;
- CPU, memory, wall-time, frame-count, input-byte, and output-byte budgets;
- declared state effects, which must be empty during research preview;
- proof obligations and expected target/preservation measurement references;
- preview/final artifact identities and exposed-parameter schema.

Raw URLs, ambient filesystem paths, float-only frame-rate identity, implicit
fonts, undeclared packages, and direct project state are forbidden.

## Required verifier boundary

The verifier is deterministic code, not an LLM judgment. It must reject:

- stale or cross-project revision bindings;
- non-reduced or unsupported rational rates;
- source ranges outside their immutable authorised windows;
- missing rights, font, mask, track, or reference facts;
- unknown imports/API calls and any network, secret, process, storage, eval, or
  dynamic-code authority;
- source whose hash differs from the program manifest;
- undeclared inputs, outputs, parameters, state effects, or artifacts;
- resource budgets above the tenant/task policy;
- a program that claims project mutation or proof it cannot produce;
- a flattened-only representation when editable nested form is required.

Static source validation is necessary but not sufficient. Passing source must
also compile in the isolated workspace, render a bounded preview, satisfy hard
geometry/legibility/continuity/accessibility checks, and retain PASS, FAIL, and
UNVERIFIABLE as separate proof results.

## Known blockers before a production worker

1. The main editor does not yet have canonical rational timebase and immutable
   source-PTS identity. It is practically a 30-fps CFR system with many
   hard-coded conversions. A general program must not inherit that ambiguity.
2. The MG worker's transparent WebP sequence is not an editable nested program
   representation and can be very large for long islands.
3. The MG sandbox currently permits narrowly scoped font/R2 network access.
   General composition should materialize authorised assets/fonts before
   execution and default to no runtime network.
4. Regex scanning is insufficient for a general allowed API. The new verifier
   needs AST/module-graph validation plus sandbox enforcement.
5. Preview proof for geometry, motion, crop focus, legibility, continuity,
   frozen/black frames, flashing, audio, and preservation is not yet one
   certified composition proof owner.
6. No canonical project representation for an editable nested composition and
   exposed parameters exists yet.

## Bounded implementation sequence

1. Freeze a research-only manifest, source-bundle, and verifier contract. No
   code execution or project mutation.
2. Author a deterministic legal DEV-02 fixture program by hand and prove the
   verifier accepts it while adversarial variants fail.
3. Add a dedicated generated-composition worker contract that reuses the MG
   sandbox substrate but has its own immutable inputs/outputs and default
   deny-all egress.
4. Compile and proxy-render the fixture without inserting it into a project.
5. Add hard rendered checks and a bounded model repair experiment.
6. Only after proxy proof, define the ProjectService adapter for one editable
   nested-composition project representation. Do not add a second writer.
7. Run forced native/generated/hybrid comparison and blind editor review before
   changing capability support from research-only.

## Honest status

- Durable sandbox/render substrate: live for MG, reusable with adaptation.
- Generated composition contract: specified in docs, not yet implemented.
- General allowed API: not yet frozen.
- Editable nested composition state: missing.
- DEV-02 proxy execution: blocked.
- Production mutation: not authorised.
