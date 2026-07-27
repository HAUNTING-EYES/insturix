# Editron Chat-To-Edit Phase 3C Evidence - 2026-07-16

## Authority

This record supplements:

- `Editron-Chat-To-Edit-Battle-Audit-2026-07-16.md`
- `Editron-Chat-To-Edit-Phase3B-Evidence-2026-07-16.md`

It records the local Phase 3C implementation and code-level evidence. It does not upgrade a battle-matrix verdict to live PASS without the corresponding disposable-project journey and rendered proof.

## Root Cause Verified

The upload pipeline persisted rich per-asset analysis in `editron_asset_analyses`, including transcript segments, semantic visual facts, OCR, V-JEPA primitives, vocal evidence, music evidence, and moment weights.

Live chat did not read that collection. Transcript and visual chat tools searched project/overlay text with exact, lexical, and character n-gram matching. The model therefore saw timeline boxes while the footage understanding remained stranded in another collection.

The existing V-JEPA path does not persist a true frame/image embedding. Phase 3C does not relabel VLM prose or a text embedding as an image embedding. Missing image vectors remain explicit.

## Implemented Contract

`lib/editron/services/chat-multimodal-evidence.ts` is the canonical read and retrieval layer for chat grounding.

For each authorized project asset it:

1. Reads `editron_asset_analyses` by `projectId` and timeline `assetId`.
2. Builds bounded evidence documents from transcript, VLM semantic windows, OCR, V-JEPA spatial/motion primitives, vocal evidence, music events, and moment weight.
3. Projects source-relative segment timing through clip source offsets onto the canonical edited timeline.
4. Preserves repeated timeline occurrences of the same source asset as separate frame-addressed evidence.
5. Generates and lazily caches text embeddings with a descriptor fingerprint.
6. Keeps true image embeddings in a separate model/dimension contract when they actually exist.
7. Validates model id, declared dimensions, vector length, finite values, and non-zero content before scoring.
8. Ranks exact, Unicode lexical, text-semantic, image-semantic, and corroborated evidence without inventing missing-modality scores.
9. Persists a bounded retrieval audit with accepted/rejected status, scores, modality presence, missing modalities, source paths, and rejection reasons.
10. Marks the ranking policy `invented-needs-calibration`; these thresholds are not presented as learned truth.

Collections:

- `editron_chat_evidence`: fingerprinted text-embedding cache.
- `editron_chat_retrieval_audits`: 30-day TTL retrieval evidence and rejection audit.

## Chat Tool Wiring

`find_transcript_moment` and `resolve_transcript_edit` now:

- retain the measured exact-word path as the only authority for automatic transcript cuts;
- skip semantic retrieval when an exact, unambiguous phrase already resolves;
- use canonical evidence for vague topic/paraphrase discovery;
- expose audit id and evidence scores;
- keep semantic segment candidates `safeForAutoEdit: false` because a broad segment is not an exact word boundary.

`find_visual_moment` and `resolve_visual_edit` now:

- retain exact stored visual evidence as a deterministic path;
- use canonical per-asset evidence for vague visual/object/action queries;
- stop character-vector similarity from authorizing automatic edits;
- permit a spatially grounded, unambiguous canonical candidate to produce a highlight;
- allow read-only frame inspection of an accepted semantic candidate;
- require confirmation for every semantic visual cut range.

This phase does not choose transition form, MG form, caption style, zoom form, or SFX assets. It is evidence grounding only and does not create a shadow family planner.

## Safety Boundary

The service rejects or records:

- evidence with no source-to-cut mapping;
- evidence missing the modality required by the query intent;
- invalid or mixed embedding model/dimension contracts;
- zero/non-finite vectors;
- below-threshold candidates;
- ambiguous top candidates;
- absent true image embeddings.

Exact word alignment remains required for destructive transcript edits. Semantic visual ranges remain confirmation-only. Read-only inspection can proceed with weaker evidence because it does not mutate the project.

## Absolute Verification

Focused Phase 3C suite:

- three assets (two video clips and one image) map correctly to edited timeline frames;
- a negative leftward motion vector is preserved as real motion evidence;
- Roman Hinglish transcript and OCR survive document construction;
- missing image embeddings remain explicit;
- wrong model, dimension, vector length, non-finite, and zero vectors are rejected;
- a vague visual meaning beats an unrelated lexical `hand` match;
- text-only semantic evidence can retrieve but cannot mutate;
- compatible text plus true image evidence can corroborate an unambiguous highlight;
- retrieval cache writes and audit persistence are deterministic with injected dependencies;
- real transcript/visual LangChain tools consume canonical candidates;
- semantic transcript cuts and semantic visual cuts fail closed;
- read-only visual inspection remains available.

Verification result:

- `tests/editron/chat-multimodal-evidence.test.ts`: 6/6 passed.
- Combined Phase 3 chat regression: 55/55 passed.
- Focused ESLint on Phase 3C implementation files: passed.
- Full TypeScript has no Phase 3C errors; repository baseline remains red only in unrelated Avatar Vault, Calos, prompt-probe, and temporary SaaS files.

## Battle Verdict Impact

Code-level capability now exists for:

- semantic transcript paraphrase/topic discovery;
- Roman Hinglish semantic topic discovery;
- per-asset visual object/action/scene discovery;
- visual-only image evidence documents;
- explicit evidence and rejection provenance.

These rows remain live-proof pending. The Phase 3B harness must still run them against disposable projects. The browser frame-capture round trip remains Phase 3F and is not claimed fixed here.

## Honest Remaining Work

1. Phase 3D: compile vague language into grounded editorial jobs and dispatch those jobs to existing family owners; route chat script edits to the Phase 2 multi-asset planner.
2. Phase 3E: durable pre-mutation transaction, idempotency, complete undo, and rollback.
3. Phase 3F: SSE carry buffer, selected/visible/spatial client context, and actual rendered frame inspection.
4. Phase 3G: HTML edit-in-place, evidence-owned BGM replacement, and project-fps coercion.
5. Phase 3H: machine-checkable postconditions and rendered pixel/audio verification.
6. Execute all 36 Phase 3B journeys and update the battle matrix only from those reports.
7. Calibrate retrieval thresholds on diverse holdouts after the architecture and rendered verification are stable.
