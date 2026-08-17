# Editron Caption Resolver and Evaluation Contract

**Date:** 2026-08-10  
**Status:** proposed target contract; design-only Slice 3  
**Branch audited:** `infrastructure-improvs-+Editron` at `b3015b2116794956ceb4764f3da1bd6e9f67c712`  
**Depends on:** [final execution plan](EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md), [canonical editorial-spine ADR](EDITRON_ADR_CANONICAL_EDITORIAL_SPINE_AND_DURABLE_WORKFLOW_2026-08-10.md), and IF1 once its ProjectService issuance boundary is wired.

## Decision

Editron will have one future **CaptionFormResolver**. It is the only owner that
turns approved direction, speech, timeline and scene evidence into a concrete
caption form. The LLM may propose intent, retrieve evidence, rank bounded
candidates and explain trade-offs. It may not write arbitrary CSS, choose an
unprovisioned font, mutate an overlay directly or mark a render as successful.

Users do not select a creator imitation or a preset dropdown. They can state a
goal, give an approved brand/reference direction, accept an evidence-backed
result, request alternatives, or make a direct edit. Internally, the resolver
uses a versioned catalog of legal typography, layout, motion and grouping atoms.
That is implementation vocabulary, not a product-facing aesthetic taxonomy.

This document does not wire the resolver, alter a current caption route, delete
legacy code, add a model, collect data or certify caption quality. It defines
the contract and the migration tests that must exist before those actions.

## The problem proved by the current code

The current system is **partial convergence around a shared caption renderer and
some shared track code**, not one caption decision system.

| Current path                 | Actual behaviour                                                                                                                                                                        | Why it cannot be the final authority                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `caption-form.ts`            | Selects `AtomicCaptionPresentation` from a style, display/grouping choices, and three coarse genre signals. Its precedence is user style, strong style, heuristic, hint, then fallback. | It has no command, project revision, transcript provenance, approved brand/reference binding, rights binding or proof requirement.         |
| `canonical-caption-track.ts` | Projects a resolved presentation into caption overlays and protects an explicitly marked manual track when creating.                                                                    | It receives the presentation rather than resolving it, resets word confidence to `1`, and its batch restyle can rewrite manual overlays.   |
| Chat `add_captions`          | Rejects unsafe source-to-cut mapping and uses `replaceOverlayFamilyAtomic`.                                                                                                             | Omitted style defaults to `tiktok` in the tool, which the adapter treats as explicit user authority; its write is not yet IF1/proof-wired. |
| Main Director path           | Projects cut-timeline words and installs the canonical track.                                                                                                                           | Brand Vault data reaches Director/planning prompt context but is not a bound caption-form input.                                           |
| Director action loop         | Can delegate to legacy per-video `add_captions`.                                                                                                                                        | That service independently chooses timing, position and style.                                                                             |
| Manual/V2 UI                 | Creates or edits raw caption overlays and uses separate template/style state.                                                                                                           | It bypasses the intended future resolver/command boundary and does not reliably stamp human authorship.                                    |
| Renderer                     | Shares preview/export `CaptionLayerContent`.                                                                                                                                            | It still interprets competing display/style inputs and permits arbitrary unknown font-family strings.                                      |

The code location evidence is specific:

- `lib/editron/services/caption-form.ts:44-65,248-303` is the closest present
  form selector, but it is brand and revision blind.
- `lib/editron/services/canonical-caption-track.ts:219-328` creates the current
  canonical-ish overlays; `:87-117` protects manual tracks only at creation,
  while `:158-209` can restyle them.
- `lib/editron/agent/tools.ts:2596-2680` and
  `lib/editron/services/chat-canonical-caption-adapter.ts:66-149` make the
  strongest current chat route. The tool reports after persistence, not after a
  bound rendered proof.
- `lib/editron/agent/director-agent.ts:1795-1817` installs the canonical track;
  `:3343-3373,3709-3882` retains an alternative legacy producer.
- `lib/editron/services/caption-preset-registry.ts:1-30` itself acknowledges
  divergent legacy/template/form definitions. `lib/editron/services/media/
caption-service.ts:221-243` has separate hard-coded maps, and
  `components/editron/editor/version-7.0.0/templates/caption-templates.ts`
  exposes a further manual catalog.
- `components/editron/editor/version-7.0.0/components/overlays/captions/
caption-layer-content.tsx:3-64` provisions six named fonts, then passes an
  unknown family through as raw CSS. A string-preservation test is not proof
  that the font rendered.

The direct symptom is understandable: a caption track can appear and remain
legible while still looking generic, timing poorly, ignoring the brand, or
disagreeing with a caption produced by another entry point. Existing proof
checks safe area, contrast, density and pixel presence. It does not prove that
the intended brand, font artifact, transcript mapping or chosen caption form
was actually rendered.

## Non-negotiable ownership boundary

```text
User / chat / Director / manual editor
  -> typed CaptionIntent (proposal or direct user constraint)
  -> capability + policy gate
  -> CaptionFormResolver (one final form owner)
  -> canonical ProjectService command with expected revisions
  -> ProjectService receipt
  -> renderer consumes the exact stored form
  -> rendered-proof worker
  -> VERIFIED | FAILED | UNVERIFIABLE
```

The roles are deliberately separate.

| Role                       | May do                                                                                                                                         | Must not do                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Planner / LLM              | Propose caption intent, cite source evidence, request a supported capability, rank bounded candidates, explain uncertainty and ask a question. | Directly write overlay state, raw CSS, a font family, a proof result or a project revision.               |
| Capability and policy gate | Check actor/project permission, content policy, privacy/egress, catalog support, rights, manual-lock state, proof policy and budget.           | Choose typography geometry or fabricate missing evidence.                                                 |
| `CaptionFormResolver`      | Select exact legal grouping, layout, typography, motion/reveal, emphasis and protected-region treatment from the approved catalog.             | Mutate ProjectService state, use arbitrary remote assets or silently replace a human-owned form.          |
| ProjectService             | Check expected revision, apply one canonical command, advance the project revision and issue the receipt.                                      | Re-resolve creative form, decode through a public side door or claim render success.                      |
| Renderer                   | Render the stored `CaptionFormV1` with the exact provisioned artifacts.                                                                        | Select a new style, fall back to an arbitrary system font or turn evidence metadata into a form override. |
| Proof worker               | Inspect the real rendered artifact and record the declared proof outcome.                                                                      | Create a synthetic receipt merely to make a scoring helper pass.                                          |

The frozen IF1 contract remains the eventual command/revision/receipt boundary.
Until the non-wired ProjectService issuer port is actually integrated, this is a
design contract only. It does not authorize a second caption timeline, journal,
receipt store, checkpoint store, registry or job authority.

## `CaptionFormResolverInputV1`

The resolver accepts one complete, immutable input envelope. No field may be
replaced by a hidden global default.

```ts
type CaptionFormResolverInputV1 = {
  version: "caption-form-resolver-input/v1";

  command: {
    operationId: string;
    actorId: string;
    projectId: string;
    expectedProjectRevision: OpaqueProjectRevisionRefV1;
    expectedTimelineRevision: TimelineRevisionRefV1;
    action: "CREATE" | "RESTYLE" | "REPLACE_GENERATED";
    idempotencyKey: string;
    userConstraints: CaptionUserConstraintV1[];
    manualOwnershipPolicy: "PRESERVE" | "EXPLICITLY_TARGETED_BY_USER";
  };

  timeline: {
    timebase: ProjectScopedTimebaseV1;
    sourceToCutMapping: SourceToCutMappingV1;
    targetRanges: TimelineFrameRangeV1[];
    renderContext: RenderContextV1;
    existingCaptionState: CaptionOwnershipStateV1;
  };

  speech: {
    transcriptArtifactId: string;
    transcriptHash: string;
    providerAndModelVersion: string;
    language: string;
    words: SourceWordEvidenceV1[];
    sourceRangeBindings: SourceRangeBindingV1[];
    knownGaps: TranscriptGapV1[];
  };

  direction: {
    creativeDirectionId: string;
    creativeDirectionVersion: string;
    approvedBrandBindings: ApprovedBrandBindingV1[];
    approvedReferenceBindings: ApprovedReferenceBindingV1[];
    audienceAndAccessibility: CaptionAccessibilityPolicyV1;
  };

  sceneEvidence: {
    protectedRegions: DerivedRegionEvidenceV1[];
    visualContrastEvidence: DerivedContrastEvidenceV1[];
    semanticEmphasisCandidates: DerivedEmphasisEvidenceV1[];
  };

  capability: {
    captionCatalogVersion: string;
    availableCaptionAtoms: CaptionAtomIdV1[];
    provisionedFontArtifacts: FontArtifactV1[];
    rendererCompatibilityVersion: string;
    validationPolicyVersion: string;
    proofPolicy: ProofPolicyBindingV1;
  };
};
```

### Required input rules

1. **Word timing is evidence with provenance.** A source word preserves its
   original word ID, time range, confidence, transcript engine/model/version
   and source-to-cut mapping. Character-proportional pseudo-word timings do not
   become equal to measured timings merely because they fit the schema.

2. **A missing or unsafe mapping declines the command.** The correct result is
   `DECLINED_TRANSCRIPT_UNAVAILABLE`, `DECLINED_SOURCE_MAPPING_UNSAFE`, or
   `NEEDS_TRANSCRIPT_CORRECTION`, not synthetic words, guessed timing or a
   success toast. This preserves the useful fail-closed behaviour in the current
   chat adapter.

3. **CreativeDirection is approved project direction, not raw prompt text.**
   It binds the brief, brand rules, permitted visual range, accessibility needs,
   references approved for this job, forbidden choices and approved examples.
   A rich external reference, scraped webpage or model-extracted suggestion is
   untrusted until the project owner approves a bounded binding.

4. **Derived scene evidence stays derived.** OCR boxes, protected regions,
   visual-energy scores, WPM, formality, emphasis confidence and placement
   scores carry their producer/version/confidence. They advise the resolver; no
   renderer may read them as an overriding form.

5. **Fonts are binary artifacts, never arbitrary names.** A valid
   `FontArtifactV1` has a content hash; family, weight and style; source;
   licence identifier/URL; commercial and embedding scopes; expiry/revocation
   state; and a renderer-load confirmation. A remote CSS URL, `font-sans`, or
   an unknown string is not a usable font binding.

6. **User direction is explicit and bounded.** A user can say "more restrained",
   "no animated words", "use the approved display font" or directly edit a
   result. The instruction is recorded as a constraint or as a new user-owned
   form. It does not turn an ambiguous implicit default into claimed user
   authority, as the present omitted-style chat default does.

## `CaptionFormV1` and resolver outcomes

`CaptionFormV1` is the sole final-render form. It contains no creator-name,
freeform CSS, unlicensed URL, mutable global setting or unresolved evidence.

```ts
type CaptionFormResolutionV1 =
  | {
      status: "RESOLVED";
      form: CaptionFormV1;
      rankedAlternatives: CaptionFormAlternativeV1[];
      decisionRecord: CaptionFormDecisionRecordV1;
      proofObligations: ProofObligationV1[];
    }
  | {
      status: "NEEDS_REVIEW";
      reasons: CaptionReviewReasonV1[];
      evidenceBindings: EvidenceBindingV1[];
    }
  | {
      status: "DECLINED";
      code:
        | "TRANSCRIPT_UNAVAILABLE"
        | "SOURCE_MAPPING_UNSAFE"
        | "MANUAL_OWNERSHIP_PROTECTED"
        | "DIRECTION_UNAPPROVED"
        | "FONT_UNAVAILABLE_OR_UNLICENSED"
        | "RENDERER_UNSUPPORTED"
        | "POLICY_DISALLOWS";
      evidenceBindings: EvidenceBindingV1[];
    };

type CaptionFormV1 = {
  version: "caption-form/v1";
  formId: string;
  formHash: string;
  ownership: "SYSTEM_GENERATED" | "USER_OWNED";
  projectAndTimelineBinding: ProjectTimelineBindingV1;
  transcriptBinding: TranscriptBindingV1;
  groups: CaptionGroupV1[];
  typography: CaptionTypographyAtomSetV1;
  layout: CaptionLayoutAtomSetV1;
  displayAndReveal: CaptionDisplayAtomSetV1;
  emphasis: CaptionEmphasisAtomSetV1;
  collisionPolicy: CaptionCollisionResolutionV1;
  renderArtifactBindings: FontArtifactBindingV1[];
  catalogAndRendererBinding: CatalogRendererBindingV1;
};
```

`CaptionFormV1` owns exact temporal groups, type scale, font artifact, weights,
case treatment, outline/shadow/background, placement, safe-region choice,
display/reveal and emphasis. It is allowed to use internal atoms to make those
choices reproducible. The renderer must consume those resolved atoms exactly;
it cannot interpret a named “style” and choose its own rules.

`CaptionFormDecisionRecordV1` sits beside, not inside, the render form. It
records input hashes, catalog/resolver/model versions, candidate ranks,
confidence, citations, rejected candidates and explanations. It is audit
evidence. Editing it must not change pixels.

An alternative is a bounded valid `CaptionFormV1` candidate, not an unbounded
design request. A user selecting it produces a new canonical command with its
own receipt. The resolver does not overwrite the project in order to show an
option.

## Decision procedure: how a caption is actually chosen

This is the non-hand-wavy path. Each stage has an input, an output and a
failure disposition.

| Step                      | Inputs                                                                              | Action                                                                                                                                          | Output / failure                                                      |
| ------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Authorize              | actor, project, permission, command revision                                        | Verify the actor may create/restyle captions in this project.                                                                                   | Reject unauthorised or stale command.                                 |
| 2. Establish speech truth | word IDs, source ranges, cut mapping, confidence/gaps                               | Prove every targeted cut-range word maps to a source word and that timing quality satisfies the chosen policy.                                  | Decline or ask transcript correction. No invented words.              |
| 3. Preserve human work    | existing caption ownership, explicit target and user intent                         | Keep user-owned caption forms untouched unless the user explicitly targets them.                                                                | `MANUAL_OWNERSHIP_PROTECTED`.                                         |
| 4. Bind direction         | approved CreativeDirection, accessibility and reference/brand bindings              | Reduce approved direction to declarative allowed/forbidden caption constraints.                                                                 | Needs review if direction is unapproved or contradictory.             |
| 5. Bind what can render   | renderer version, licensed provisioned fonts, caption atom catalog, output geometry | Remove impossible or illegal atoms before creative ranking.                                                                                     | Decline if no legal renderable candidate exists.                      |
| 6. Build candidates       | legal atoms, speech pacing, protected regions, contrast and content evidence        | Produce a small finite candidate set. The candidate generator may be model-assisted but can output only catalog IDs and parameter ranges.       | No direct render object from an LLM.                                  |
| 7. Resolve form           | candidates plus hard constraints                                                    | The resolver selects one exact form and records why each competing candidate lost. It fixes timing/grouping/geometry only here.                 | `RESOLVED` or `NEEDS_REVIEW` if no candidate can satisfy constraints. |
| 8. Validate before write  | exact form, source ranges, font artifacts and timeline                              | Deterministically validate transcript mapping, supported atoms, font rights/loading, safe regions, initial contrast/collision and state effect. | Reject before ProjectService mutation.                                |
| 9. Apply once             | canonical command, expected project/timeline revision                               | ProjectService records state and returns a writer-issued receipt.                                                                               | `APPLIED_PENDING_PROOF`, never “rendered successfully.”               |
| 10. Prove real result     | receipt, actual render artifact, sampled active-caption frames                      | Verify the exact stored form rendered at its claimed ranges.                                                                                    | `VERIFIED`, `FAILED` or `UNVERIFIABLE`.                               |

The LLM's practical role is Steps 4 and 6: it can translate a brief and approved
references into constraints, identify emphatic moments from speech/scene
evidence, and rank legal candidates. It cannot jump over Steps 2, 3, 5, 8 or 10. That is what keeps a natural-language edit smooth without making it
unreliable or impossible to debug.

## Human authority and direct editing

Hard safety, rights and access restrictions always win. Subject to those
restrictions, explicit human direction wins over a planner proposal and a prior
system-generated form.

- **User-owned form:** a direct manual edit creates or updates a form marked
  `USER_OWNED` through the same canonical command path. Later system restyles
  must preserve it unless the user explicitly selects it.
- **System-generated form:** the user can lock it, accept it, request a bounded
  alternative, or replace it with a manual form. Each action is receipted.
- **Migration requirement:** current manual UI must stamp ownership and change
  provenance correctly before it can be a resolver adapter. The current
  create-only manual guard and broad restyle behaviour are insufficient.
- **No hidden “AI vs manual” fork:** manual UI produces the same command family
  as chat and Director. It remains an escape hatch, not a second auto-edit
  authority.

## Proof contract

The receipt and proof are separate. The command becomes
`APPLIED_PENDING_PROOF` after ProjectService commits it. It is not complete
until the proof worker binds a real output artifact.

`CaptionRenderedProofV1` must bind all of the following:

1. canonical command ID and writer-issued receipt;
2. before, after and current project/timeline revisions;
3. `CaptionFormV1` hash, resolver/catalog/model versions and CreativeDirection
   snapshot hash;
4. transcript artifact hash, word IDs/times/confidence and source-to-cut
   mappings used by the form;
5. every used `FontArtifactV1`, licence state and actual renderer font-load log;
6. renderer/container build identifier plus final video/still artifact hashes;
7. sampled real rendered frames at caption entry, active emphasis, exit,
   reframe/cut and protected-region overlap moments;
8. a caption-disabled control render or equivalent pixel isolation evidence;
9. deterministic results for transcript text/timing, safe area, collision,
   contrast, font fallback, render structural integrity and the declared visual
   and semantic obligations.

The result has only these proof statuses: `PASS`, `FAIL`, `UNVERIFIABLE`.
“Proof not required” belongs to the receipt policy, not the proof status. A
missing render, missing font-load log, unavailable sampled frame or inconclusive
OCR/timing check is `UNVERIFIABLE`, not a pass. A synthetic receipt constructed
inside a scoring helper cannot satisfy this contract.

## Caption evaluation set: learning taste legally

There is no open dataset that confers professional caption taste. Subtitle/OCR
datasets can help analysis, but they do not establish what is right for a
particular client, brief, language, shot or product. Do not scrape creator work
or label it “looks like X.” The owned evaluation set uses only material with
explicit rights for this purpose.

### Immutable records

| Record                         | Required contents                                                                                                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CaptionEvalCaseV1`            | Source media hash; evaluation-rights receipt; consent scope, expiry and revocation; aspect/FPS/language/accessibility; exact source/cut ranges; transcript engine/version/hash; word IDs/timings/confidence; project/CreativeDirection snapshot hashes.                                        |
| `CaptionCandidateRenderV1`     | Candidate form atoms, resolver/catalog/model bindings, ranking rationale, input hashes, renderer/container build, font artifacts and rights manifests, and final still/video hashes. No creator/preset label.                                                                                  |
| `CaptionPairwiseObservationV1` | Two or more independently collected, blind A/B observations over actual contextual renders with audio, cut handles and normal playback. Randomise left/right. Result is `A`, `B`, `TIE`, `REJECT_BOTH`, `NEEDS_TRANSCRIPT_CORRECTION` or `UNVERIFIABLE`, plus timecode and structured reasons. |
| `CaptionEvaluationScorecardV1` | Versioned hard gates, holdout metrics, collection protocol, observer/adjudicator identity, sampling plan, baselines, threshold version and result disposition.                                                                                                                                 |

Structured reason tags include transcript correctness, timing, readability, safe
area/collision, contrast, brand fit, pacing, emphasis, accessibility and
language. Reviewer disagreement remains unresolved until an explicit human
adjudicator chooses. An LLM may generate candidates or assist a reviewer; it
never becomes ground truth and never auto-merges conflicting human choices.

Split evaluation data by client/series/campaign, not random clips, so a brand
does not leak from calibration into holdout. Store the source/rights record
separately from the preference label. Removal or consent revocation must make
the corresponding case unavailable to later tuning or evaluation.

### Release scorecard

The first audited baseline establishes the non-safety numerical thresholds. We
will not invent a universal “taste score” before real, rights-cleared examples
exist. But the hard release gates are fixed now:

- zero missing, expired or revoked evaluation/font rights receipts;
- zero missing project/timeline/transcript/render bindings;
- zero source-word mapping failures for a claimed verified result;
- zero silent font fallbacks;
- zero structurally failed renders reported as success;
- every measurement uses held-out cases, not the same cases used for tuning;
- every manual rescue is recorded and contributes to the scorecard.

The scorecard must additionally report blinded pairwise win rate versus the
current baseline, reject-both rate, inter-reviewer agreement, structural render
pass rate, transcript/timing defect rate, collision/accessibility defect rate,
human correction minutes, client approval, latency and cost. A caption vertical
cannot be marketed as agency-capable until a signed threshold version passes on
real projects with no unrecorded engineering rescue.

## Migration plan without premature pruning

Nothing is deleted because it looks old. Each current producer becomes a reader
or adapter only after the replacement owns its full input, output, command and
proof path.

1. **Freeze the target contract in tests and documentation.** Add contract
   fixtures for valid/declined/review outcomes, manual-ownership protection,
   omitted-style chat semantics, input hash binding and font artifact refusal.
   No caption UI migration yet.
2. **Make current data observable.** Build lossless readers/adapters for
   `caption-form`, canonical track, registry, manual templates and legacy
   caption service. Classify each as system-generated, user-owned or unknown;
   do not assign ownership silently.
3. **Implement resolver and catalog behind a feature gate.** The catalog starts
   small and legal. It has atom support, licence/provisioning, renderer
   compatibility and validation metadata. Existing names become migration aliases
   only; new product behaviour does not depend on them.
4. **Wire the canonical command after Stage 1 and Stage 1.5 are ready.** The
   resolver output is carried through the one ProjectService command/revision
   path. Direct raw overlay producers move one at a time to adapters.
5. **Make renderer compliance strict.** It consumes only `CaptionFormV1`, loads
   only bound font artifacts and fails visibly if an artifact cannot load. It
   cannot substitute an arbitrary CSS family.
6. **Build proof then evaluation.** First bind real render output and deterministic
   checks; then collect owned pairwise feedback and tune against a held-out
   scorecard. Do not train/tune from unreviewed edits or references.
7. **Retire each legacy authority only after migration proof.** For every
   producer, prove save/reload/render/undo/replay/UI-chat parity and preservation
   of manual work. Keep a read-only compatibility path for saved projects until
   the project migration policy permits removal.

### Explicit entry criteria

Runtime caption migration cannot start merely because this document exists. It
requires all of the following first:

- Stage 1 writer-issued ProjectService command/revision/receipt/proof lifecycle;
- Stage 1.5 project-scoped editorial spine and conflict rule;
- Stage 3 CreativeDirection, capability/policy guard, model/version binding and
  privacy/egress policy;
- a migration-safe reader for existing caption forms and a manual-ownership
  representation;
- renderer ability to bind a verified, licensed font artifact;
- a declared proof policy and a minimal surface that shows pending, verified,
  needs-review, failed and unverifiable states.

Before those gates, allowed work is discovery, test fixtures, data provenance
design and non-binding evaluation tooling only. No caller may claim this has
unified captions or improved production caption taste.

## Acceptance evidence for the eventual vertical

The implementation is admissible only when these cases pass end to end:

1. UI, chat and Director make equivalent requests that resolve through one form
   owner and one ProjectService command family.
2. An omitted chat style does not silently become an authoritative creator-style
   default.
3. A non-renderable, unlicensed or unloaded font is declined before mutation.
4. A word-timing/source-mapping failure cannot produce a verified caption.
5. A user-owned caption is preserved unless the user explicitly targets it.
6. The stored form, after save/reload, produces the same renderer inputs and
   same sampled output under the bound renderer build.
7. A render/proof failure is visible as `FAILED` or `UNVERIFIABLE`; no success
   result is returned on persistence alone.
8. Direct/manual, chat and Director routes have parity tests for state effect,
   receipt and proof disposition.
9. Real held-out human comparisons meet the signed scorecard, with all manual
   interventions recorded.
10. Legacy producer removal happens only after the producer-to-command-to-proof
    ledger has no live unadapted caller and saved-project compatibility is proven.

## What this slice changes now

It establishes the caption target as a tractable vertical: we know why captions
are currently generic, which routes disagree, what exact data a resolver needs,
where the LLM stops, how a form becomes a ProjectService change, and what proof
and real human evaluation are required before making a quality claim.

It deliberately does **not** promise that captions are fixed today, choose a
model provider, import a creator-style catalog, deprecate existing paths or
start evaluating human taste. Those are later, gated implementation slices.
