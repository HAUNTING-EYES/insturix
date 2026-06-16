# ThinkForge And Editron Signals Infrastructure Map

Date: 2026-06-13
Branch verified: `codex/infra-creative-chain`
Remote target: `origin/infrastructure-improvs-+Editron`
Status: CODE-MAPPED_DOC_ONLY
Scope: ThinkForge writing signals, ThinkForge to Clickatron handoff context, and Editron video signal infrastructure.

## Executive Summary

The current signals infrastructure is real, but it is not one service-wide signal bus.

It has three connected layers:

1. Shared creative signal vocabulary in `lib/shared/signals`.
2. ThinkForge writing and handoff signals that shape scripts, posts, sidecars, and downstream Clickatron prompt context.
3. Editron video-time signals that drive analysis, moment weights, director evidence, EDL decisions, and motion graphics.

The main architecture warning is this:

ThinkForge and Editron share concepts and some contracts, but they do not yet share one canonical producer, source of truth, and final consumer for every signal. Describe this as shared vocabulary plus partial downstream plumbing, not full convergence.

## Source Roots

This document is written from the `infra-push-creative-chain` worktree, which contains both ThinkForge and Editron source code.

Primary code areas:

| Area | Root |
| --- | --- |
| Shared signals | `lib/shared/signals/` |
| Shared brand context | `lib/shared/brand-*` |
| ThinkForge | `lib/thinkforge/`, `components/dashboard/ThinkForge/`, `app/api/services/thinkforge/` |
| Clickatron handoff consumer | `lib/clickatron/`, `app/api/services/clickatron/`, `app/api/internal/workers/clickatron/` |
| Editron | `lib/editron/`, `components/editron/`, `app/api/services/editron/` |
| Tests | `tests/thinkforge/`, `tests/clickatron/`, `tests/editron/` |

## The Mental Model

Think about signals as three different things, depending on which layer is using them.

```text
Shared vocabulary
  CreativeSignals type system
  signal ranges, derived values, validation metadata

ThinkForge writing layer
  context and BrandDNA
  -> extracted CreativeSignals
  -> writing graph technique selection
  -> author prompt and quality pass
  -> export metadata and Clickatron source context

Editron video layer
  raw footage, transcript, model analysis, music analysis
  -> SignalTimeline grid, event, and global signals
  -> moment weights and atomic moment context
  -> Path E Creative Brief primary decisions
  -> Path D signal-driven fallback, supplement, and evidence
  -> EDL executor and motion graphic renderer
```

The shared layer gives systems a common language. It does not by itself prove one system is reading another system's runtime signal object.

## Shared Signal Contract

Core files:

| File | Purpose |
| --- | --- |
| `lib/shared/signals/index.ts` | Public package-style export for the shared signal vocabulary. |
| `lib/shared/signals/types.ts` | Defines `CreativeSignals`, derived signals, content signal profiles, and envelopes. |
| `lib/shared/signals/validation.ts` | Defines ranges, validation, derived-signal computation, envelope checks, and scope metadata. |

Important behavior:

- `CreativeSignals` is organized into rhetorical, cognitive, emotional, audience, structural, voice, purpose, temporal, craft, and visual-verbal axes.
- Validation lives near the shared type contract, so services can reject impossible or out-of-range signal values.
- This is a vocabulary and validation layer. It is not a queue, database table, or event bus.

What to check:

- `lib/shared/signals/types.ts`
- `lib/shared/signals/validation.ts`
- `lib/shared/signals/index.ts`

## ThinkForge Signal Flow

ThinkForge uses signals mostly as writing intent and prompt-control evidence.

```text
User/project/session context
  -> context source fetch
  -> assembled context stack
  -> BrandDNA/system brief block
  -> heuristic signal extraction
  -> writing graph technique selection
  -> script/post author prompt
  -> quality scoring and optional rewrite
  -> export metadata and downstream sidecars
```

### 1. Context Is Gathered

Files:

- `lib/thinkforge/context/fetchContextSources.ts`
- `lib/thinkforge/context/assembleContext.ts`
- `lib/thinkforge/context/selectors.ts`

The context layer gathers the inputs that later become signal evidence:

- ThinkForge session state.
- Project metadata.
- Script and block content.
- BrandDNA and system brief.
- Warm semantic facts and interaction patterns where available.

The important output is `systemBrief`, which later becomes model-facing brand context.

### 2. Signals Are Extracted From Context

Files:

- `lib/thinkforge/data/extract-signals.ts`
- `lib/thinkforge/data/writing-graph-query.ts`

`extractSignalsFromContext()` converts context, project type, brief text, and content hints into a partial `CreativeSignals` object.

Current caveat:

The extractor is intentionally minimal and heuristic. It maps defaults and keyword-style evidence into the shared signal shape. The shared signal contract is richer than the current extractor.

`selectTechniques()` then scores writing techniques against the extracted signals.

### 3. The Author Agent Consumes The Signals

Files:

- `lib/thinkforge/agents/script-author-agent.ts`
- `lib/thinkforge/agents/script-draft-agent.ts`
- `lib/thinkforge/data/quality-scorer.ts`
- `lib/thinkforge/data/voice-signature.ts`

Important path:

- `script-author-agent.ts` wraps `context.systemBrief` in `<brand_context>`.
- It extracts signals from the context.
- It selects writing techniques and constraints from the writing graph.
- `script-draft-agent.ts` runs quality scoring and, when needed, a style/quality rewrite.

Final ThinkForge consumers:

- The ThinkForge LLM author prompt.
- The quality/style pass.
- Export metadata for downstream handoffs.

ThinkForge does not currently produce the Editron `SignalTimeline` object. It produces writing-side creative intent and metadata.

## ThinkForge To Clickatron Handoff

This path is real shared downstream plumbing. It carries source context, creative intent, and brand identity from ThinkForge into Clickatron prompt generation.

```text
ThinkForge export UI
  -> /api/services/thinkforge/clickatron-context
  -> buildThinkToClickContext()
  -> ThinkToClickHandoffState
  -> Clickatron session FormData
  -> Clickatron task, variation, and job metadata
  -> worker prompt enrichment
  -> model-specific payload prompt
```

Core files:

| Step | File |
| --- | --- |
| Export UI action | `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts` |
| Handoff dialog/panel | `components/dashboard/ThinkForge/export/ClickatronHandoffDialog.tsx`, `ClickatronHandoffPanel.tsx` |
| Context API route | `app/api/services/thinkforge/clickatron-context/route.ts` |
| Context builder | `lib/thinkforge/clickatron-context.ts` |
| Creative sidecar contract | `lib/thinkforge/schemas/clickatron-creative-contract.ts` |
| Session payload builder | `lib/thinkforge/clickatron-session-payload.ts` |
| Clickatron session route | `app/api/services/clickatron/session/route.ts` |
| Worker consumer | `app/api/internal/workers/clickatron/variation/route.ts` |
| Prompt enrichment | `lib/clickatron/brand-prompt-context.ts` |
| Model payload | `lib/config/clickatron-models.ts` |

### Brand And Source Context

`brandId` is control-plane metadata. It is carried through the handoff so the downstream worker can resolve model-facing context.

The model-facing prompt context comes from:

- `sourceContext`, formatted into a Clickatron source-context prompt block.
- `UnifiedBrand`, formatted into `<brand_context>` when a real brand can be resolved.

Do not call this full Brand Vault convergence yet. Accepted `BrandSignalProfile` records exist elsewhere, but this Clickatron generation path resolves `UnifiedBrand` for the prompt. If `getUnifiedBrand(userId, brandId)` returns null, the generation can still have ThinkForge source context but will not have a brand context block.

Brand files to check:

- `lib/shared/brand-registry.ts`
- `lib/shared/brand-context-block.ts`
- `lib/shared/brand-signal-profile.ts`
- `lib/shared/brand-signal-lifecycle.ts`
- `lib/shared/brand-signal-profile-repository.ts`
- `lib/shared/brand-vault-mongo-store.ts`

## Editron Signal Flow

Editron has the deepest signal runtime. It converts video, audio, transcript, model-enrichment, music, and user preference data into time-based decisions.

```text
Upload or media asset
  -> auto-edit route
  -> project record
  -> director agent
  -> raw-footage and multimodal analysis
  -> SegmentAnalysis
  -> SignalTimeline
  -> moment weights and atomic moment context
  -> Path E Creative Brief decisions
  -> Path D signal-driven fallback/supplement/evidence
  -> merged decision bundle
  -> EDL executor
  -> editor project overlays
  -> Remotion render
```

### 1. Ingest And Project Creation

Files:

- `app/api/services/editron/auto-edit/from-asset/route.ts`
- `app/api/services/editron/director/execute/route.ts`
- `lib/editron/services/project-service.ts`
- `lib/editron/services/upload-service.ts`

`from-asset/route.ts` accepts the uploaded asset, user preferences, brand ID, and auto-edit options. It creates or updates an Editron project, then dispatches the director path through worker/QStash or inline fallback.

The director execution route calls `executeDirectorPlan()`.

### 2. Analysis Produces Signal Inputs

Files:

- `lib/editron/services/raw-footage-processor.ts`
- `lib/editron/services/five-track-analysis.ts`
- `lib/editron/services/vjepa-service.ts`
- `lib/editron/services/wav2vec-service.ts`
- `lib/editron/services/music-analysis-service.ts`
- `lib/editron/services/segment-analysis-builder.ts`

Input sources:

| Source | What it contributes |
| --- | --- |
| Transcript and word timings | Speech coverage, topics, emphasis, numbers, CTAs, fillers, speaker changes. |
| Five-track analysis | Visual, audio, speech, structure, and content cues. |
| V-JEPA | Visual primitives, motion, scene-change, saliency, screen/content cues. |
| Wav2Vec | Speech/emotion/prosody enrichment. |
| Essentia/music analysis | BPM, music presence, structure, beat and intensity evidence. |
| User preferences and brand | Style constraints and downstream brand scope. |

`segment-analysis-builder.ts` normalizes the raw analysis into a `SegmentAnalysis` shape that the signal registry can consume.

### 3. Signal Registry Builds The Timeline

Core file:

- `lib/editron/services/signal-registry.ts`

Key public concepts:

- `SignalTimeline`
- `SignalSnapshot`
- `EventSignal`
- `buildSignalTimeline()`
- `buildSignalTimelineFromAnalysis()`
- `projectEventsOntoGrid()`

The timeline has three signal forms:

| Signal form | Meaning | Consumer pattern |
| --- | --- | --- |
| `gridSignals` | Regular snapshots, usually every 15 frames / about 0.5 seconds. | Scoring and per-moment sampling. |
| `eventSignals` | Exact events such as emphasized words, topic boundaries, CTAs, speaker changes. | Event-aware decisions and projection onto nearby grid points. |
| `globalSignals` | Whole-video facts such as speech coverage, content type, music presence, BPM, speaker count, and enrichment source. | Genre parameters, routing, broad style choices. |

Important behavior:

- Basic grid signals are built first.
- Composite and smoothed signals are computed after grid creation.
- Transcript events are added as exact event signals.
- Global signals summarize the whole source.
- Bare-key aliases such as `formality`, `enthusiasm`, and `warmth` exist for compatibility with older consumers.
- `projectEventsOntoGrid()` copies event evidence onto nearest grid points for consumers that only read grid snapshots.

### 4. Genre Parameters And Moment Weights

Files:

- `lib/editron/services/genre-parameter-computer.ts`
- `lib/editron/services/moment-weight-service.ts`

`computeGenreParameters()` converts observed signals into higher-level editing parameters. These affect pace, transition intensity, overlay density, and related editing behavior.

`buildMomentWeightMap()` converts signal timelines and segment analysis into weighted moments. These weights help the director and EDL layer understand which parts of the source deserve emphasis.

### 5. Atomic Moment Context

Files:

- `lib/editron/services/moment-bundle.ts`
- `lib/editron/services/unified-moment-context.ts`
- `lib/editron/services/mg-content-atoms.ts`
- `lib/editron/engine/atomic-overlay-core.ts`

Atoms are structured facts or intents that the motion graphics system can reason over without falling back to hard-coded named templates.

Important atom concepts:

| Concept | Purpose |
| --- | --- |
| `MomentAtom` | One structured signal/content fact for a moment. |
| `AtomicMomentBundle` | Bundle of moment atoms plus coverage metadata. |
| `MOMENT_SIGNAL_KEYS` | Signal keys considered important for atomization. |
| `UnifiedMomentContext` | Frame, transcript, event atoms, signal map, and coverage flags for a moment. |
| `semanticAtoms` | Structured content semantics from the brief or graphic content. |
| Atomic overlay plan/decision | The generated form decision consumed by motion graphic rendering. |

`mg-content-atoms.ts` maps semantic atom content into normalized motion graphic inputs, such as concepts, claims, evidence, quantities, quotes, identities, relations, and series.

### 6. Director Decision Paths

Core file:

- `lib/editron/agent/director-agent.ts`

The director has two important decision paths:

| Path | Role | Files |
| --- | --- | --- |
| Path E | Primary live creative producer when `USE_CREATIVE_BRIEF=true` and raw footage is available. | `creative-brief.ts`, `brief-executor.ts` |
| Path D | Signal-driven fallback, supplement, and evidence path. | `signal-registry.ts`, `genre-parameter-computer.ts`, `moment-weight-service.ts`, `signal-executor.ts` |

Path E:

- Uses Gemini Creative Brief architecture.
- Uses `generateCreativeBrief()` to produce transitions, SFX, graphics, and other creative decisions.
- Uses `executeBrief()` to map brief decisions into frame-level EDL decisions.
- Is the primary producer under the live `USE_CREATIVE_BRIEF=true` raw-footage path.

Path D:

- Computes genre parameters.
- Builds the signal timeline and moment weight map.
- Runs `executeSignalDrivenEdit()`.
- Acts as fallback if Path E is unavailable or fails.
- Also acts as validation/supplement evidence for Path E decisions.

Do not claim Path D and Path E are fully merged. The accurate statement is:

Path E and Path D can feed a shared downstream decision bundle and EDL executor, but the primary producer remains Path E in the live Creative Brief path.

### 7. Decision Bundle Merge

Core file:

- `lib/editron/services/unified-decision-bundle.ts`

Important functions:

- `mergeDecisionBundles()`
- `mergeSignalDrivenBundle()`
- `shouldAddSignalSupplement()`
- `attachSignalValidation()`
- `markSignalSupplement()`

What the merge does:

- Keeps Creative Brief decisions as primary when Path E produced them.
- Adds Path D signal evidence to matching or nearby decisions.
- Allows sparse, high-confidence Path D supplements when they pass density and confidence policy.
- Tracks suppressed signal supplement counts so flooding is observable.
- Avoids turning weak hard-cut hints into excessive extra decisions.

This is shared downstream plumbing, not proof that Path D owns the live creative decision.

### 8. EDL Execution And Motion Graphics

Files:

- `lib/editron/services/edl-executor.ts`
- `lib/editron/motion-graphics/engine/composition-planner.ts`
- `lib/editron/motion-graphics/engine/composition-renderer.tsx`
- `lib/editron/motion-graphics/engine/brand-composition-rules.ts`
- `components/editron/editor/version-7.0.0/components/overlays/motion-graphic/motion-graphic-layer-content.tsx`

`executeEDL()` mutates the Editron project timeline and overlays.

For motion graphics:

- The EDL executor resolves placement and content.
- It normalizes graphic content and semantic atoms.
- It passes raw signals and moment metadata into atomic overlay planning.
- `buildAtomicOverlayPlan()` and `decideAtomicOverlay()` produce the generated form decision.
- The overlay metadata carries `atomicOverlayPlan`, `atomicOverlayDecision`, `semanticAtoms`, and moment metadata.
- The React motion graphic layer passes those values into the composition renderer.
- The renderer applies form, style, and motion decisions.

Brand styling is handled through the brand composition rules path:

- `lib/editron/motion-graphics/engine/brand-composition-rules.ts`

This is why Editron motion graphics can be signal and brand aware without relying only on fixed template names.

## Producer, Source, Consumer Map

Use this table when evaluating any future claim that the systems are "merged" or "unified."

| Layer | Producer | Decision owner | Source of truth | Final consumer |
| --- | --- | --- | --- | --- |
| Shared signal vocabulary | `lib/shared/signals` | Shared contract authors | TypeScript types and validation metadata | ThinkForge and Editron code paths that import the contract |
| ThinkForge writing signals | `extractSignalsFromContext()` | ThinkForge authoring layer | Session context, project type, BrandDNA/system brief, prompt text | Script author prompt and writing graph technique selector |
| ThinkForge brand context | ThinkForge context assembly | ThinkForge context layer | BrandDNA/system brief and session/project state | ThinkForge LLM prompt |
| ThinkForge to Clickatron source context | `buildThinkToClickContext()` | ThinkForge export layer | Session blocks, project metadata, Clickatron creative spec | Clickatron task/job metadata and prompt enrichment |
| Clickatron brand prompt context | `resolveClickatronBrandContextBlock()` | Clickatron worker | `UnifiedBrand` resolved by user and brand ID | Clickatron model prompt |
| Editron raw analysis | Raw-footage, five-track, V-JEPA, Wav2Vec, Essentia services | Editron analysis layer | Uploaded media, transcript, model outputs, music analysis | Segment analysis and signal timeline |
| Editron signal timeline | `buildSignalTimeline()` | Editron signal registry | Segment analysis, transcript events, enrichment outputs | Director, moment weights, signal executor, EDL/MG planning |
| Editron Path E decisions | `generateCreativeBrief()` and `executeBrief()` | Gemini Creative Brief path | Video context, raw footage URI, prefs, genre params | Unified decision bundle and EDL executor |
| Editron Path D decisions | `executeSignalDrivenEdit()` | Signal executor path | Signal timeline, moment weights, genre params | Fallback/supplement/evidence decisions |
| Editron final overlays | `executeEDL()` | EDL executor | Merged decision bundle and project state | Editor project timeline and Remotion render |

## File Map For Team Review

### Shared Contracts

- `lib/shared/signals/index.ts`
- `lib/shared/signals/types.ts`
- `lib/shared/signals/validation.ts`
- `lib/shared/brand-registry.ts`
- `lib/shared/brand-context-block.ts`
- `lib/shared/brand-signal-profile.ts`
- `lib/shared/brand-signal-lifecycle.ts`
- `lib/shared/brand-signal-profile-repository.ts`
- `lib/shared/brand-vault-mongo-store.ts`

### ThinkForge

- `lib/thinkforge/context/fetchContextSources.ts`
- `lib/thinkforge/context/assembleContext.ts`
- `lib/thinkforge/context/selectors.ts`
- `lib/thinkforge/data/extract-signals.ts`
- `lib/thinkforge/data/writing-graph-query.ts`
- `lib/thinkforge/data/quality-scorer.ts`
- `lib/thinkforge/data/voice-signature.ts`
- `lib/thinkforge/agents/script-author-agent.ts`
- `lib/thinkforge/agents/script-draft-agent.ts`
- `lib/thinkforge/services/chat-service.ts`
- `app/api/services/thinkforge/brand-dna/route.ts`
- `app/api/services/thinkforge/sidecar/route.ts`

### ThinkForge To Clickatron

- `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts`
- `components/dashboard/ThinkForge/export/ClickatronHandoffDialog.tsx`
- `components/dashboard/ThinkForge/export/ClickatronHandoffPanel.tsx`
- `components/dashboard/ThinkForge/export/ExportCompletePanel.tsx`
- `app/api/services/thinkforge/clickatron-context/route.ts`
- `lib/thinkforge/clickatron-context.ts`
- `lib/thinkforge/clickatron-session-payload.ts`
- `lib/thinkforge/schemas/clickatron-creative-contract.ts`
- `lib/thinkforge/utils/clickatron-creative-sidecar.ts`
- `app/api/services/clickatron/session/route.ts`
- `app/api/internal/workers/clickatron/variation/route.ts`
- `lib/clickatron/brand-prompt-context.ts`
- `lib/config/clickatron-models.ts`

### Editron Analysis And Signals

- `app/api/services/editron/auto-edit/from-asset/route.ts`
- `app/api/services/editron/director/execute/route.ts`
- `lib/editron/agent/director-agent.ts`
- `lib/editron/services/project-service.ts`
- `lib/editron/services/upload-service.ts`
- `lib/editron/services/raw-footage-processor.ts`
- `lib/editron/services/five-track-analysis.ts`
- `lib/editron/services/vjepa-service.ts`
- `lib/editron/services/wav2vec-service.ts`
- `lib/editron/services/music-analysis-service.ts`
- `lib/editron/services/segment-analysis-builder.ts`
- `lib/editron/services/signal-registry.ts`
- `lib/editron/services/genre-parameter-computer.ts`
- `lib/editron/services/moment-weight-service.ts`
- `lib/editron/services/signal-executor.ts`

### Editron Decisions, Atoms, And Render

- `lib/editron/services/creative-brief.ts`
- `lib/editron/services/brief-executor.ts`
- `lib/editron/services/unified-decision-bundle.ts`
- `lib/editron/services/moment-bundle.ts`
- `lib/editron/services/unified-moment-context.ts`
- `lib/editron/services/mg-content-atoms.ts`
- `lib/editron/engine/atomic-overlay-core.ts`
- `lib/editron/services/edl-executor.ts`
- `lib/editron/motion-graphics/engine/composition-planner.ts`
- `lib/editron/motion-graphics/engine/composition-renderer.tsx`
- `lib/editron/motion-graphics/engine/brand-composition-rules.ts`
- `components/editron/editor/version-7.0.0/components/overlays/motion-graphic/motion-graphic-layer-content.tsx`

## Tests To Run Or Inspect

### ThinkForge And Clickatron

- `tests/thinkforge/clickatron-creative-sidecar.test.ts`
- `tests/thinkforge/clickatron-creative-contract.test.ts`
- `tests/clickatron/think-to-click-context.test.ts`
- `tests/clickatron/think-to-click-session-payload.test.ts`
- `tests/clickatron/brand-prompt-context.test.ts`

These tests verify sidecar extraction, handoff context, brand ID precedence, source context, and prompt enrichment into model payloads.

### Editron

- `tests/editron/signal-registry-vjepa-primitives.test.ts`
- `tests/editron/unified-decision-bundle.test.ts`
- `tests/editron/director-unified-decision-bundle.test.ts`
- `tests/editron/unified-moment-context.test.ts`
- `tests/editron/moment-bundle.test.ts`
- `tests/editron/mg-content-atoms.test.ts`
- `tests/editron/signals-contract.test.ts`
- `tests/editron/overlay-bridge-vjepa-signals.test.ts`
- `tests/editron/director-brand-scope.test.ts`

These tests verify signal enrichment, Path E and Path D bundle behavior, moment context, atom persistence, and signal-to-overlay handoff.

## Live Verification Checklist

Use this when proving the infrastructure with a real run.

### ThinkForge Writing

1. Create a ThinkForge session with BrandDNA/system brief present.
2. Generate a script/post.
3. Inspect whether the author prompt includes `<brand_context>`.
4. Inspect selected writing techniques from `selectTechniques()` if debug logging is enabled.
5. Compare output against the quality score path in `script-draft-agent.ts`.

### ThinkForge To Clickatron

1. Generate a post or carousel in ThinkForge.
2. Use "Send to Clickatron".
3. Confirm the handoff debug payload includes `brandId`, `sourceContext`, creative kind, platform, aspect ratio, image prompt, and source block IDs.
4. Confirm the Clickatron session stores `brandId` and source metadata.
5. Inspect worker logs for source and brand context application.
6. Confirm the final model prompt contains source context and, when the brand resolves, `<brand_context>`.

### Editron

1. Start an auto-edit from a real uploaded media asset.
2. Confirm `from-asset/route.ts` stores project, asset, preferences, and brand scope.
3. Confirm the director enters Path E when `USE_CREATIVE_BRIEF=true` and raw footage is available.
4. Confirm `signal-registry.ts` builds grid, event, and global signals.
5. Confirm Path D signal evidence is merged as validation or sparse supplement, not blindly appended.
6. Confirm `executeEDL()` creates project overlays.
7. Confirm motion graphic overlays carry atomic plan/decision metadata.
8. Render and inspect the final output.

## Known Boundaries And Gaps

1. Shared `CreativeSignals` is a vocabulary, not a runtime bus.
2. ThinkForge's current signal extraction is lightweight compared with the full shared signal type system.
3. ThinkForge does not produce Editron's `SignalTimeline` object.
4. ThinkForge to Clickatron is shared downstream plumbing, not complete Brand Vault convergence.
5. Clickatron prompt context currently resolves `UnifiedBrand`; accepted `BrandSignalProfile` records are not the live canonical prompt source for that path.
6. Editron Path E and Path D share downstream bundle/EDL plumbing, but Path E remains the live creative producer under `USE_CREATIVE_BRIEF=true`.
7. Path D should be described as fallback, supplement, and evidence unless code proves it is the primary producer for a specific run.
8. Atomic motion graphics are signal-aware, but the system still has fallback paths for safety.
9. Graphiti and learning infrastructure exist elsewhere, but this document does not claim every signal path reads Graphiti facts live.

## Short Version For Engineers

If you only have ten minutes, inspect these files in order:

1. `lib/shared/signals/types.ts`
2. `lib/thinkforge/data/extract-signals.ts`
3. `lib/thinkforge/data/writing-graph-query.ts`
4. `lib/thinkforge/agents/script-author-agent.ts`
5. `lib/thinkforge/clickatron-context.ts`
6. `lib/clickatron/brand-prompt-context.ts`
7. `app/api/services/editron/auto-edit/from-asset/route.ts`
8. `lib/editron/agent/director-agent.ts`
9. `lib/editron/services/signal-registry.ts`
10. `lib/editron/services/unified-decision-bundle.ts`
11. `lib/editron/services/edl-executor.ts`
12. `components/editron/editor/version-7.0.0/components/overlays/motion-graphic/motion-graphic-layer-content.tsx`

The smallest accurate architecture sentence is:

ThinkForge uses shared creative signals for writing intent and downstream handoff context; Editron builds its own video-time signal timeline for editing decisions; Clickatron consumes ThinkForge source and brand context in prompt generation; these paths share vocabulary and downstream plumbing, but they are not one fully unified signal pipeline yet.
