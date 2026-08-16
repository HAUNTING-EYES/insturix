# ThinkForge Authoring Convergence Plan

**Date:** 2026-08-15  
**Status:** approved programme definition; implementation begins only in bounded, verified batches  
**Scope:** ThinkForge-owned authoring, context, persistence, learning, trend consumption, and ThinkForge export producers. This plan does not modify Editron's parser, Clickatron's renderer, Avatar Vault ownership, or trend extraction providers.

## Outcome

ThinkForge must behave as a trustworthy authoring product for brands, agencies, and production teams:

1. A user creates an idea, post, or script deliberately; a post never becomes a script through inference or stale UI state.
2. Every generation has one authorised brand, the latest accepted Brand Vault profile at that moment, authorised facts, and an immutable trace explaining the result.
3. A seven-minute script is a real long-form narrative with acts, scenes, and beats. Provider limits never rewrite the narrative into arbitrary short scenes.
4. The Creative Content Knowledge document governs editorial decisions through a compact, explicit plan. It is not a passive cache dump, a template library, or a collection of regexes.
5. Clickatron and Editron consume typed export compilations. They do not re-infer or silently truncate ThinkForge intent.
6. Failed generation, invalid output, stale state, missing brand context, and provider incompatibility are visible, named, non-billed where appropriate, and recoverable.

## CEO Review

### Decision

**Hold scope, repair the core.** Do not add new agents, new trend providers, avatar features, or UI surfaces while the authoring spine is divided. The product win is a smaller system with one authoritative answer at every stage, not a larger system with more prompt layers.

### Product Principles

- The user chooses the document kind. Intent classification may suggest, never silently replace, that choice.
- Brand safety, kill-list, compliance, and factual constraints are non-negotiable. User requests may select creative variables but cannot override them.
- A session owns a brand ID; each generation resolves the current accepted profile and snapshots the exact revision/checksum. Revision pinning is explicit only.
- Storytelling units are not provider jobs. A narrative scene may span several render segments without being rewritten.
- A CTA, hashtag, emoji, camera setup, on-camera ratio, or trend mechanism appears only when the brief and editorial plan justify it.
- No generic unbranded fallback when the user selected a brand. Fail visibly instead.

### Deliberately Not In Scope

- New TikTok ingestion or a new trend-extraction provider.
- Replacing Clickatron rendering or Editron's pasted-script parser.
- A generic multi-agent supervisor or autonomous prompt writer.
- A visual redesign beyond the state/error/loading fixes required for correctness.

## Engineering Review

### Architecture Decision

Replace the current collection of competing paths with these versioned artifacts:

```text
Selected brand + user brief + project/session facts
                    |
                    v
         ResolvedAuthoringContext (server owned)
                    |
                    v
   EditorialPlan (content doctrine selections + guardrails)
                    |
                    v
 DocumentContract + AuthoringDocumentRevision (server canonical)
                    |
                    +-------------------------+
                    |                         |
                    v                         v
             PostWriter                  ScriptWriter
                    |                         |
                    v                         v
        Typed social visual spec    Narrative sidecar V2
                    |                         |
                    +-------------+-----------+
                                  v
                     export-specific compilation
                       /                         \
                      v                           v
          Clickatron request contract     Editron handoff contract
```

No stage is allowed to reconstruct intent from rendered text when it has access to the canonical document revision. No browser state is an authority for document kind, brand, sidecar, or current revision.

### Canonical Data Rules

| Artifact | Owner | Immutable fields | Mutable fields |
|---|---|---|---|
| `BrandBinding` | Session | `brandId` | none; user explicitly starts a new session to change brand |
| `AuthoringContextSnapshot` | Generation | profile record/revision/checksum, fact IDs, directive IDs, source-ledger IDs, context failures | none |
| `DocumentContract` | Server at document creation | `documentType`, platform surface, content kind, carousel count | explicit user edits through one command |
| `AuthoringDocumentRevision` | Server | revision number, canonical rich text, derived markdown/blocks, system sidecars | none |
| `EditorialPlan` | Server | doctrine version, selected sections/techniques, evidence policy, long-form structure | none per generation |
| `ExportCompilation` | Export service | source document revision, compiler version, provider budget | none; recompile for a later revision |

The canonical editable representation is server-validated Tiptap/ProseMirror JSON. Markdown and block arrays are derived server-side. Clients submit revisioned commands, never replacement metadata blobs.

## What Must Be Removed Or Replaced

1. Multiple document-type owners: regex inference, title/heading inference, and default-to-video-script fallbacks.
2. Legacy production routes and agents that can write directly without the canonical authoring context: `ScriptDraftAgent`, `ScriptAuthorAgent` chains, generic specialist/`NullAgent` sidecar generation, and block-edit persistence.
3. Provider capability rules in the script writer: universal 10-second speaking limits, English fallback, 50% on-camera ratio, and direct render-job mapping.
4. Global CTA/hashtag/emoji/character rules that override the brief.
5. Browser-generated document IDs, parallel `content`/`blocks`/`richText` sources of truth, and stale session selection/export state.
6. Fail-open Brand Vault, sidecar, source ledger, export, and structured-output fallbacks.
7. Unscoped or automatically trusted learned memories and best-effort serverless background work.

## Programme Of Work

Each implementation batch touches at most five production/test files, gets its own focused tests, typecheck, lint, and a fresh code read before editing. The workstreams below are sequenced; they are not permission to batch them into one giant refactor.

### A. Canonical Document And Session State

**Goal:** make the document kind and revision unambiguous everywhere.

1. Introduce a versioned canonical document state normaliser, derived markdown/block projections, and a server-owned `DocumentContract` resolver.
2. Make generation, save, current-document, and edit paths call the same document command service; retire direct legacy persistence and title/heading based type inference.
3. Fix client hydration so a session ID is never treated as proof that its document loaded; clear prior tabs/selection/export state on a real session switch; preserve a visible error for failed hydration.
4. Add optimistic revision conflict handling that fetches/rebases the server revision instead of retaining stale content and overwriting it.
5. Make generation lifecycle thread/document-addressable, cancel underlying requests where possible, and never let a cancelled generation commit.

**Acceptance:** post/script classification is explicit across generation, reopen, edit, export, and refresh; a saved Tiptap document never appears blank; concurrent edit tests prove no lost user changes.

### B. Context, Brand Vault, And Knowledge Integrity

**Goal:** one proven source of brand truth and factual evidence.

1. Complete `ResolvedAuthoringContext` as the only context constructor for ideas, posts, scripts, edits, sidecar actions, CalOS calls, and exports.
2. Repair Brand Vault voice update as an ACL-checked CAS patch against the accepted revision rather than a replacement profile; retain immutable accepted history and one active pointer per scope.
3. Enforce explicit brand failure; remove sidecar/ideas fail-open context paths and unscoped user-global memory reads.
4. Promote DataBank/vector ownership to first-class scope and lifecycle metadata: owner type, user/org/brand/session IDs, source, consent, classification, freshness, expiry.
5. Quarantine legacy unscoped data; introduce durable Mongo/vector reconciliation before deleted or superseded facts can remain retrievable.

**Acceptance:** opposite-brand test tenants cannot retrieve each other's facts or voice; a newer accepted profile appears in the next generation and is traceable; late enrichment cannot overwrite accepted truth.

### C. Editorial Intelligence And Writer Convergence

**Goal:** writers apply the content doctrine deliberately rather than obeying generic prompt checklists.

1. Build a server-owned `EditorialPlan` from the current Creative Content Knowledge version, resolved signals, selected evidence, document kind, platform surface, and user variables.
2. The plan selects relevant doctrine sections, techniques, narration mode/range, long-form hierarchy, CTA stance, and evidence rules. It never exposes a full graph dump to the model.
3. Make the Ideas agent consume the same plan and emit typed angles/contracts. Remove English-only regex form detection and post/video mutation after the model output.
4. Make Post and Script writers consume the same context/plan. Remove mandatory CTA/hashtags/emojis and fixed character floors; retain only versioned actual platform/API limits in a platform-policy module.
5. Replace passive quality logging with a shared enforcement gate. Invalid structured output, factual errors, wrong document kind, or unmet required evidence gets one bounded repair or a named failure before persistence.

**Acceptance:** post/script are distinct from first idea through final edit; long-form scripts have doctrine-selected acts/scenes/beats; held-out cases retain facts and brand voice without checker-word overfitting.

### D. Narrative Sidecar And Production Guidance

**Goal:** preserve an editable story while enabling production and video handoff.

1. Version the script sidecar into hierarchy: `acts -> narrativeScenes -> beats -> renderSegments`; establish one canonical spoken-text source.
2. Let the writer author narrative units. A later technical segmentation step produces provider-safe render segments linked to exact beats/lines.
3. Move avatar language, lip-sync duration, on-camera ratio, room geometry, microphone counts, and spend constraints to the production/render planner. They become explicit user choices, warnings, alternatives, or export requirements; they do not silently alter story structure.
4. Persist an approved Shoot Kit plan snapshot with source revision/hash, resolved space/equipment evidence, and assumptions requiring confirmation. Never invent room measurements.
5. Keep current V1 documents readable with an adapter; do not silently reparse or overwrite historic scripts.

**Acceptance:** a seven-minute brief produces a coherent long-form story even when no renderer is available; provider limits yield a render plan or visible compatibility choice, never a rewritten script.

### E. Strict Export Compilation

**Goal:** turn canonical creative intent into safe, provider-ready jobs without loss or surprise.

1. Compile Clickatron specs from typed authoring output, including explicit single/carousel choice and user-selected count. Count is a first-class contract field, not text parsed from the prompt.
2. Validate and budget prompt payloads before billing/job creation. Provider character limits cause a visible `needs_user_input` or compiler decision, never silent truncation and never an invalid Fal job.
3. Compile Editron handoff from the saved sidecar/document revision. Fail closed if a claimed sidecar is invalid; fallback is allowed only for genuinely sidecar-less legacy documents.
4. Preserve casting, source refs, shot intent, visual text policy, brand evidence, and compilation provenance through each handoff.
5. Make preview pure; make long-running jobs durable/resumable and partial completion explicit rather than reporting `done` with failed assets.

**Acceptance:** single post and carousel exports generate a deterministic, audited request; invalid/oversize contracts are rejected before credit spend; an ordinary text edit cannot erase the script's production context.

### F. Learning, Trends, Observability, And Proof

**Goal:** make learning and trend use safe, bounded, and measurable.

1. Treat generated output as an untrusted candidate, never an automatic voice exemplar. Store only approved/outcome-backed learning with correct brand/session provenance.
2. Move observer/refinery/post-mortem work to durable jobs with idempotency keys, leases, retries, dead-letter visibility, and deletion only after replacement vector writes are durable.
3. Make TrendSpec a read contract: selected, authorised, evidence-backed trends can propose a motif or section plan but never overwrite an explicit requested duration. Raw trend text remains untrusted prompt data.
4. Persist calendar opportunity decisions and brand-fit rationale; test real positive/negative matching paths, not only synthetic positives.
5. Add diagnostics for context resolution, profile revision, selected doctrine, fact IDs, output contract, compiler result, provider/model, retries, and failure code.

**Acceptance:** old video text cannot contaminate another brand, serverless restarts do not lose generation/learning state, and every output has a supportable trace.

### G. Test, Migration, And Rollout Gates

**Goal:** make the repair measurable rather than another hopeful deployment.

1. Add deterministic backend cases for brand scope, concurrent revisions, malformed client state, typed intent, sidecar hierarchy, export budgets, trend duration preservation, and durable job idempotency.
2. Build ThinkForge Playwright flows with a disposable tenant and stub provider: two opposite brands, idea -> post -> edit -> carousel export, idea -> long script -> reopen -> Editron handoff, switch brand/org, errors/cancel/retry, and stale session/browser state.
3. Define the editorial 95% gate before running it: held-out ICP corpus, independent judge rubric, minimum sample size, multi-run policy, no factual fabrication hard fail, and separate known-vs-held-out reporting.
4. Backfill/migrate only records with authoritative provenance. Quarantine ambiguous legacy data. Ship read adapters before write migration, then cut traffic behind flags and retain a rollback path.
5. Production release requires a deployed smoke run with real private-context Gemini, a provider-stub export suite, metrics/alerts, and an operator runbook.

## Error Contract

| Failure | Server result | User experience | Billing |
|---|---|---|---|
| Explicit brand cannot resolve | `BRAND_CONTEXT_UNAVAILABLE` | clear retry/select-brand state | no generation charge |
| Writer schema or quality failure | `AUTHORING_CONTRACT_FAILED` | named failure with retry; no empty editor | refund/no charge per provider state |
| Stale document revision | `DOCUMENT_REVISION_CONFLICT` | reload/rebase choice | no charge |
| Missing required carousel/production choice | `NEEDS_USER_INPUT` | choose count/asset/capability | no export charge |
| Provider prompt or aspect incompatibility | `EXPORT_COMPILATION_UNSUPPORTED` | change requested format or choose compatible provider | no provider-job charge |
| Durable job failure | `JOB_FAILED` with retry state | visible status and retry | charge only if provider confirms consumption |

## Test Matrix

```text
unit: contracts, context scope, editorial plan, sidecar hierarchy, compilers
  |
integration: DB revision/CAS, vector reconciliation, job idempotency, routes
  |
provider-stub: structured writer, Clickatron/Fal/Imagen budget and error mapping
  |
Playwright: browser state, brand switching, generation, reopen, edit, export
  |
held-out eval: quality, factual grounding, voice, form distinction, diversity
  |
deployed smoke: private Gemini generation + one approved export request
```

## Migration And Rollback

1. Add readers/adapters before changing writers or exports.
2. Dual-read canonical and legacy document state only during migration; canonical wins when a verified revision exists.
3. Do not dual-write arbitrary client blobs. All new writes go through the canonical command service.
4. Gate each new path by feature flag and emit trace/metric comparison before cutover.
5. Roll back traffic flags, not data migrations. Preserve original legacy records until the backfill/reconciliation report is complete.

## Execution Order

1. Canonical document/session state.
2. Context/Brand Vault/knowledge integrity.
3. EditorialPlan and writer/idea convergence.
4. Sidecar V2 and production guidance separation.
5. Strict Clickatron/Editron compilation.
6. Durable learning/trend work.
7. Full test, migration, and deployed release gates.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Status | Findings |
|---|---|---|---|---|
| CEO Review | `plan-ceo-review` | Product scope and trust | HOLD SCOPE | Stop adding authoring paths; converge on one reliable authoring spine. |
| Eng Review | `plan-eng-review` | Architecture, migration, testability | ISSUES FOLDED | Require canonical state, versioned contracts, fail-closed boundaries, and release gates. |

**VERDICT:** CEO + engineering review support the convergence programme. The current architecture is not ready for more prompt tuning or feature expansion.

NO UNRESOLVED DECISIONS
