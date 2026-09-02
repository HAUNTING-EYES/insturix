# Editron Codex handover - 2026-08-26

This is the durable takeover document for the long-running Editron
architecture, production-hardening and open-ended editing programme. It is a
map, not the source of truth. Current code, current Git state, executable
receipts and current tests override this file, the chat transcript and all
older handoffs.

## Read-first instruction for the next Codex session

Do not design or edit Editron code until all of the following are complete:

1. Read `AGENTS.md` and `CLAUDE.md` completely.
2. Read this handover completely.
3. Process this exact task transcript completely, in chronological chunks:

   ```text
   C:\Users\admin\.codex\sessions\2026\08\09\
   rollout-2026-08-09T13-46-08-019fe597-f478-71a1-9e15-e44ff8230c0a.jsonl
   ```

   Stable session UUID:
   `019fe597-f478-71a1-9e15-e44ff8230c0a`.

   At handover time the file was append-only, approximately 1.23 GB and more
   than 214,800 JSONL records. Do not dump it into one tool result or pretend it
   fits in model context. Read it sequentially with bounded output, record the
   last processed line/byte after each chunk, and build a redacted decision and
   evidence ledger. The transcript contains user-supplied credentials from
   older turns. Never print, copy into documentation, commit or reuse them.
4. Read the live pointer and the section **Canonical current Stage 2.5
   execution queue - 2026-08-26** in
   `docs/EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md`.
5. Read
   `docs/editron/open-ended-editing/oe-stage25-final-paid-cohort-audit-2026-08-26.md`.
6. Reproduce the worktree, branch, HEAD, remote divergence, dirty paths,
   relevant history and artifact hashes independently.
7. Before touching a capability, trace its actual current path as:

   ```text
   caller -> decision owner -> form/resolver owner -> mutation owner
          -> stored state/revision -> editor/renderer -> visible/audible proof
   ```

8. Return a short grounding receipt naming the transcript line/byte reached,
   current HEAD, preserved dirty paths, the exact Stage 2.5 next slice and any
   code/document contradiction. Only then continue implementation.

The raw transcript cannot honestly be "pinned" inside a model's context. Pin
this handover and the master plan; keep the transcript as a chunk-read archival
record. Never claim the transcript was read completely without recording the
actual final processed record.

## Source-of-truth order

Use this precedence when two claims disagree:

1. Current production code, imports, callers and final consumers.
2. Current executable tests and immutable receipts bound to exact source.
3. Current Git history, tag objects and worktree state.
4. The canonical current queue in the master execution plan.
5. Directly governing current audit/design documents.
6. This handover.
7. The chat JSON and older session documents.

Chat history is required because it contains user intent, rejected ideas,
benchmark mistakes and decisions. It is not authority for a claim about what
the current product actually does.

## Exact repository and worktree truth at handover

| Item | Current truth |
| --- | --- |
| Worktree | `D:\google downloads\Front-End-main\editron-worktree` |
| Branch | `infrastructure-improvs-+Editron` |
| Verified predecessor anchor | `a66890f977caf4f631cc1336c66f12b53147ffae` |
| Tracking branch | `origin/infrastructure-improvs-+Editron` |
| Tracking divergence at anchor | local branch is 335 commits ahead and 0 behind |
| `origin/main` | `69659b92e96addbf2fe4f0f69a138634ef75f932` |
| Main divergence at anchor | anchor has 1,493 commits not in `origin/main`; `origin/main` has 1 commit not in anchor |
| Editron source/doc scope | clean at predecessor anchor `a66890f97` |
| Whole worktree | dirty with unrelated ThinkForge work |

The dirty worktree contained 58 unrelated ThinkForge paths at measurement
time: 43 modified and 15 untracked. They belong to the user/another lane.
Never reset, clean, stash, stage, move or reformat them. Stage only explicit
Editron paths. Do not create a branch or worktree unless the user explicitly
authorizes it in that turn.

Important registered worktrees include:

- IF1 freeze: `D:\google downloads\Front-End-main\editron-if1-freeze-v1`
  on `codex/editron-if1-freeze-v1`.
- P0 hardening: `D:\google downloads\Front-End-main\editron-p0-hardening`
  on `codex/editron-p0-hardening`.
- Old rejected Session A runtime candidate:
  `D:\google downloads\Front-End-main\Front-End-main` on
  `session-a/mutation-spine-v0-rc1`.

Do not assume another worktree's commit is active here. Verify ancestry or
content on the active branch.

This document cannot embed the hash of the commit that contains itself. The
next session must run `git rev-parse HEAD`; the handover commit should be the
first intentional Editron commit after predecessor anchor `a66890f97` unless
the user continued work meanwhile.

## Product destination and settled user intent

Editron is intended to become a web-native, AI-enabled professional NLE and
post-production system with Adobe-class capability coverage. It is not an
Adobe API wrapper. It must support short social work, agencies, long-form
projects and film-post workflows through one scalable architecture. A
four-to-ten-hour project is a scale target, not a separate preset or profile.

The user does not want preset-driven editing. The desired experience is:

1. A user supplies intent, deliverable type, footage/images/audio, script or
   story material, brand context and optionally references or stock permission.
2. Editron builds range-addressable media and timeline evidence instead of
   sending hours of media as one prompt.
3. A model reconstructs observable reference targets and creates a durable
   editorial Sequence/Range Plan.
4. The active plan node receives the relevant complete capability records and
   evidence, then selects exact Editron operations.
5. Native, generated-composition or hybrid execution is proposed without
   mutating the canonical project.
6. Editron validates, previews and inspects the affected range, permits bounded
   repair, and applies approved work only through ProjectService.
7. The user can keep playing or editing unaffected timeline ranges. Disjoint
   user edits may rebase; overlapping or locked ranges return explicit choices.
8. Every accepted mutation has a writer-issued revision, receipt, proof,
   undo/replay binding and delivery state.

The target is a smooth "vibe editing" experience like a coding agent, but the
authoritative objects are media identities, time ranges, plans, revisions and
rendered evidence rather than files and Git.

## Non-negotiable architecture

### One authority per responsibility

- ProjectService is the sole canonical project/timeline mutation authority.
- PlanService owns the durable Sequence/Range Plan and execution lifecycle.
- Existing family resolvers/composers own final form. A planner may rank and
  provide evidence, but may not duplicate duration, keyframes, typography,
  layout, animation, SFX or asset-query form.
- Existing media storage/database owners remain the source of media identity.
- A research harness, agent shell, generated program or compiler cannot become
  a second project, timeline, checkpoint, registry or proof authority.

### IF1 truth

- The canonical IF1 contract is frozen and annotated tag
  `editron-interface-freeze-1` points to
  `5a47e00896e0e915cd4c03e71a0b104ac0c05999`.
- Tag object:
  `71b67a4d9109e65e92d50030d6d97334ed1fd739`.
- The accepted semantic review passed.
- The active branch restored the five-file artifact through `d1402ff38`, but
  the accepted freeze commit itself is not an ancestor of active HEAD.
- The active product does not implement the complete IF1 runtime issuer and
  writer migration. **IF1 artifact frozen** and **IF1 runtime migrated** are
  separate claims.
- Do not patch or revive Session A's old MutationGate/private journal/runtime.

### Capability records and model planning

The current approximately 40-operation CAP-2A packet is a benchmark slice, not
all Editron tools and not Adobe parity. A production operation record must
eventually declare at least:

- owner and resolver handoff;
- exact input/output schema;
- support and certification status;
- planner eligibility and alternatives;
- reads, writes, requires, produces and invalidates;
- coordinate/timebase domain and revision origin;
- deterministic validators and failure dispositions;
- mutation path, state effects and final consumer;
- proof obligations and versioned proof requirements;
- undo, replay and checkpoint binding;
- reproducibility, cost, latency and resource budgets;
- rights, privacy, egress and prompt-injection policy.

Each executable model plan node selects one `selectedOperatorId`.
Non-executed choices use `alternativeOperatorIds`. Multi-tool edits use several
dependency-linked nodes. Stage-4 lowering may bind arguments, revisions,
coordinate conversions and typed result references from schemas. It must add
zero operations and remove zero model-selected operations. It is a mechanical
binder/checker, not a hidden creative planner.

### Durable editorial planning

The intended hierarchy is:

```text
Project direction / EDITRON.md
  -> Sequence/Range Plan DAG
       -> active bounded plan node
            -> exact operation graph
                 -> proposal -> preview -> inspection -> repair -> commit
```

`EDITRON.md` is a versioned human-readable project constitution stored with the
project direction: deliverable, story, brand/fonts, references and fidelity,
preservation/avoidance rules, rights/privacy/model-egress policy, approvals,
deadline, cost and quality constraints. It is not a second project database.

The Sequence/Range Plan is coarse enough for a five-hour project. Only the
active range expands into detailed tool calls. Durable plan state, evidence and
receipts survive tool-history compaction.

### Layered media evidence

The intended evidence tiers are:

1. Reusable ingest/search evidence: identities, technical metadata,
   transcript, shot structure, coarse visual/audio semantics and uncertainty.
2. Claim-conditioned dense evidence: exact frames, masks, tracks, optical flow,
   crops, PTS/audio windows or stems required by the proposed operation.
3. Rendered/delivery proof: state diffs, stills, ordered frames, short proxies,
   audio windows, milestone renders and final QC.

Dense evidence requirements come from versioned operation/claim policies, not
an opaque model confidence score. Store heavy artifacts in R2/object storage,
canonical observations and invalidation links in Mongo, rebuildable search
vectors in Qdrant, and approved project references/receipts in ProjectService.

The current product does not yet provide the full canonical media/timebase
spine. Source qualification, byte/source-version contracts and bounded probes
exist, but rational mixed-rate/VFR/timecode/reel/proxy-relink identity is not
consumed system-wide. Many product paths still rely on numeric FPS and 30-fps
assumptions.

### Reference reconstruction

A reference is observed in four categories:

- global editorial language;
- recurring design grammar;
- unique hero moments;
- protected literal content such as exact people, logos, copy, music or data.

Application is separate from observation. Each feature becomes `MUST`,
`SHOULD`, `MAY`, `MUST_NOT` or `UNRESOLVED` with versioned prominence,
coverage, user emphasis, fidelity influence and confidence. A filmstrip may be
a hero moment without becoming mandatory unless the request/fidelity requires
it.

### Native, generated-composition and hybrid routes

- Native keeps certified editing state directly editable in the timeline.
- `GeneratedCompositionProgram` is a first-class bounded creative operation
  for relational/procedural layouts, typography, masks, motion and graphics.
- Hybrid is the expected difficult-reference form: native timeline/audio/
  colour/captions around bounded generated islands.

The moving filmstrip itself is generated composition. A complete reference-led
reel containing it is hybrid. Do not route by operation count. Route by target
coverage, existing ownership, editable semantics, cross-element dependencies,
sandboxability, rights, revisions, handoff/interchange, proof and cost. The
relationship-test research is useful but still requires held-out route proof.

Generated islands require declared sources, fonts, timebase, exposed controls,
head/tail handles, sandbox limits, render artifacts and proof. They must not
replace missing professional native masks, tracking, colour, audio, trimming
or timeline semantics.

## What the final Stage 2.5 paid cohort actually did

### Test shape

The final cohort contained eight tasks across three routes/models: GPT-5.6
Luna, GPT-5.6 Terra and Gemini 3.7 Flash.

- `HOLD-DEP-01` through `HOLD-DEP-04` tested evidence barriers, dependency
  ordering, writer-issued receipt chaining and invalidation semantics.
- `RHC-01` through `RHC-04` tested whether the model qualified native,
  generated-composition and hybrid routes from current owner evidence or
  stopped honestly when owners/fixtures were absent.

The cohort tested research planning contracts. It did not edit a real user
project or judge final video quality.

### Authorized execution

- Execution: `stage25-final-paid-4438d1a41-v1`.
- Source: `4438d1a41d7555f760f894da815721ac3515c267`.
- Rows: 24/24.
- Provider dispatches/responses: 32/32. Eight rows used the one permitted
  schema/protocol correction.
- Automatic transport retries: 0.
- Spend: `$1.022770625` under the historical `$5.8056704` cap.
- Project reads/mutations: 0/0.

Raw scorecard headlines were 7 structural passes, 9 safe stops and 8 failures.
That failure headline was not fair.

### Audited result

| Class | Count | Meaning |
| --- | ---: | --- |
| Valid structural plans | 7 | Contract-valid research plans, not rendered/product proof |
| Valid owner-supported safe stops | 9 | Correct refusal because route owner/fixture was absent |
| Genuine model/task failures | 2 | Required preservation evidence was not established before mutation |
| Confounded rows | 5 | The public precedence contract was ambiguous |
| Provider/resource non-evaluation | 1 | Internal thinking-token accounting stopped scoring |

The two genuine failures were:

- `HOLD-DEP-01:GOOGLE_FLASH`: preservation evidence
  `EV-D01-PRESERVE` was absent from every pre-writer evidence path.
- `HOLD-DEP-04:OPENAI_TERRA`: audio evidence `EV-D04-AUDIO` appeared on
  mutation nodes rather than being established before destructive cuts.

Five rows were confounded because the contract used `{before, after}` without
stating which was predecessor. Canonical key sorting showed `after` first.
Luna reversed all four dependency tasks and Terra reversed DEP-03 while their
summaries described that interpretation. Those are benchmark defects, not fair
model failures.

The Gemini DEP-03 correction returned 1,908 visible response tokens and 7,312
thinking tokens. The old guard combined both under one 8,192-token rule and
the scorecard misclassified the resource terminal as a model failure. The
persisted submission passes the corrected structural evaluator, but receives
no retroactive cohort credit.

### Corrections made after the run

| Commit | Correction |
| --- | --- |
| `75d290712` | Immutable paid-run reconciliation and 7/9/2/5/1 classification |
| `857debf9a` | Explicit predecessor/successor fields and distinct provider/resource status |
| `ddfea7795` | Separate visible response and total billable generated-token accounting |
| `e8a801d01` | Bind provider-native generated-token ceilings |
| `f0211af58` | Reissue future authorization identity and corrected spend bound |
| `601beb86d` | Reissue source gate V1.5 with 74 authoritative tests |
| `a66890f97` | Update the paid audit and canonical master queue |

The old paid responses and result remain immutable. They were not rewritten or
rerun.

### Fresh corrected zero-inference preflight

The cached production Gemini key was stale and the first current-HEAD attempt
stopped at a metadata HTTP 400 before provider inference. A fresh ignored
Vercel Production snapshot returned the exact Gemini model identity. The
temporary secret snapshot was deleted after use.

Accepted execution:
`stage25-final-provider-preflight-601beb86d-v2`.

- 74/74 readiness assertions passed.
- 3 model metadata GETs.
- 8 official Google `countTokens` POSTs.
- 0 inference calls.
- 0 canonical project mutations.
- Initial-attempt upper bound: `$3.5900052`.
- Absolute two-attempt ceiling: `$9.2463104`.
- Readiness receipt:
  `19c7d43214e769e59a0e524761857b59b1c95444c85f8511bbe2622d7c182d72`.

The historical `$5.8056704` confirmation cannot authorize this corrected
identity. No new paid run is authorized. No immediate rerun is needed to begin
building real route candidates.

## Stage 2.5 completed evidence

| Gate | Current evidence | Honest ceiling |
| --- | --- | --- |
| HREF-01 reference review | Sole project owner watched full video, dense 3-second motion window and audio; all nine requirements passed | Single reviewer; independent agreement unavailable |
| Dependency task design | Four new shapes, public rules and equivalent/safe-stop/tamper sentinels | Research contracts |
| DEP owner mechanics | 24/24 synthetic current-edit sentinels across DEP-01..04 | No real evidence quality, render or canonical project apply |
| RHC-01 candidates | Native, generated and hybrid candidate state exists | Human-authored research fixtures |
| RHC-01 rendering | Three playable 1080x1920, 30/1, 210-frame silent H.264 proxies | Synthetic, unjudged, no ProjectService mutation |
| Project conflict trial | Real owner logic with stateful in-process persistence proves disjoint rebase, overlap/lock rejection and receipt chaining for cut/update | Not live Atlas, broad writers or multi-user product proof |
| Resume gate | Source-bound zero-spend resume suite passed | No paid model interruption or live hosted recovery |
| Long-form mechanics | Synthetic 4.5-hour evidence scale proxy and local long-duration container/window hydration passed | No real creative multi-hour retrieval or production playback/render |
| Final structural cohort | 24 paid rows executed and audited | Planning/safe-stop evidence only |
| Corrected provider gate | 74/74 with zero inference | Readiness only, no authorization |

## Exactly what remains in Stage 2.5

Stage 2.5 is not closed. The benchmark plumbing and one structural planning
cohort are complete; the central product-quality proof remains.

### 1. Materialize and render RHC-02, RHC-03 and RHC-04

Use the existing frozen tasks without tuning their target predicates after
seeing results:

| Task | Required real candidate evidence |
| --- | --- |
| `RHC-02` interview chapter | Two stills and editable chapter text, complete/intelligible sentence, continuous room tone, clean return to authored interview, unchanged outside range |
| `RHC-03` synchronized dual view | Same marked action phase in both views, subject-safe readable label, exact return frame, unchanged synchronized production audio |
| `RHC-04` results card | Correct source/number pairings, editable numbers/sources/hold, final 10-percent closeup, measured correction without regenerating unrelated approved state |

For each task:

1. Materialize exact source/media/font/rights evidence.
2. Reuse or extract existing native form owners behind an isolated
   revision-issued proposal writer. Do not copy form logic.
3. Issue task-specific generated programs through the existing verifier and a
   deny-all sandbox. Do not relabel DEV-02 or RHC-01 fixtures.
4. Compose explicit timebase, audio and boundary handoffs for hybrid.
5. Render every actually legal route against the same target.
6. Bind state, media, code, renderer and proof hashes.
7. Keep absent owners as explicit capability gaps instead of inventing them.

RHC-01 also still needs its formal blind human review. Its existing previews
are playable but unjudged. Its native font identity, deny-all generated
sandbox, transitive executable closure and ProjectService application remain
unproved.

### 2. Extend conflict, lock and rebase proof through real product authority

The current stateful trial is cut-focused and in-process. Stage 2.5 still needs:

- exact range/effect declarations for every participating writer;
- stale user edit versus proposal trials across disjoint and overlapping
  ranges;
- real locked-range behavior and lock lifecycle;
- safe rebase that preserves user work;
- truthful ripple/invalidation receipts;
- durable Atlas/multi-user or equivalent production-owner evidence;
- no mutation when revision, range, evidence or lock bindings are stale.

Do not build a generic second conflict engine. ProjectService owns this.

### 3. Prove model episode compaction and resume

The zero-spend owner mechanics exist. A later separately authorized test must
interrupt a real model-driven episode and prove that a fresh worker restores:

- the same plan and active node;
- typed opaque tool-result references;
- writer-issued project/timeline revisions;
- cumulative inference/render/storage budget;
- prior evidence and preservation rules;
- no duplicate inference, mutation or settlement;
- correct behavior when the user changed the range during interruption.

Run a fresh no-spend gate and obtain explicit spend approval before this test.

### 4. Replace synthetic long-form confidence with real media evidence

Run realistic multi-hour creative sources through the intended storage and
retrieval boundaries. Prove:

- streaming/resumable ingest and analysis rather than whole-file buffering;
- canonical source/version, proxy/master, relink and invalidation identity;
- rational source/timeline/composition/analysis/delivery rates;
- CFR, VFR, mixed-rate, PTS, timecode and discontinuity handling;
- semantic retrieval quality and dense-range escalation;
- live Mongo/R2/Qdrant or selected owners under bounded context and memory;
- playback and dirty-range preview while background work continues;
- affected-range render, final delivery and recovery after interruption.

Short-form must stay fast on the same architecture by using smaller work
units. Do not introduce separate long-form presets or profiles.

### 5. Collect rendered/editor quality evidence

For the held-out candidates collect:

- target and preservation predicate results;
- actual visual and audio proof;
- blind human preference and defect notes;
- correction time and number of repair rounds;
- editability and round-trip preservation;
- latency, provider/render/storage/egress cost;
- false-success and safe-stop rates;
- route-specific limitations.

One project-owner review is valid qualified evidence when recorded honestly,
but independent agreement stays unavailable until a real second reviewer
exists. Never fabricate a second reviewer.

### 6. Run only the successor model evaluation that the new evidence requires

Do not automatically rerun the historical 24 rows. Once RHC-02..04 have real
qualified candidates and product-authority evidence, freeze a successor
task/scorecard/source identity. Run zero-spend sentinels first. Only if model
inference is still required for the final gate should the user receive a new
exact capped authorization string.

The successor must test a whole bounded editing episode, not one-shot JSON:
target reconstruction, range planning, evidence retrieval, exact operator
selection, proposal, preview inspection, bounded repair, user conflict, resume
and honest completion/gap.

### 7. Freeze the Stage 2.5 decision

Publish one source-bound `GO`, `MODIFY` or `NO-GO` using the predeclared
scorecard. Stage 3 production model-driven mutation cannot begin until this
decision allows it.

## What must not be repeated

- Do not rerun the old nine-row cohort, V4R, HOLD-01..08, old DEV-01..04 or the
  completed 24-row cohort as if they were new evidence.
- Do not score hidden evaluator requirements that were absent from the model's
  packet.
- Do not require one exact low-level graph when equivalent legal graphs exist.
- Do not let a compiler insert creative operations or turn a model omission
  into a pass.
- Do not call a provider timeout/rate/resource terminal an editing failure.
- Do not combine structural pass, safe-stop pass, rendered pass and product
  proof in one green count.
- Do not modify a frozen task after seeing model output.
- Do not call models merely because a key is available.
- Qwen3.8-Max is historical evidence only by user decision. Do not add it to a
  new cohort or routing slot. Current research providers are Luna, Terra and
  Gemini 3.7 Flash, subject to fresh provider verification.

## Why earlier benchmark work drifted

Several older tests mixed editorial intelligence with low-level contract
serialization. The model sometimes proposed sensible operations, but failed
because it did not manually reproduce plumbing that the packet said a compiler
could supply. Later, task-specific lowering and hidden evaluator rules made
some hand-authored expectations look like model truth. Sparse tiled contact
sheets also confused temporal states with simultaneous panels.

Corrections now treated as law:

- Target reconstruction, route choice, evidence binding, exact lowering,
  isolated execution and rendered quality are separate scores.
- The model sees the relevant complete tool records and selects real operator
  IDs.
- Resolver-owned mechanical data may be bound after selection, but no creative
  operation may be invented.
- Ordered timestamped images and native video/audio are different evidence
  arms. Sparse frames cannot prove audio, easing or unsampled motion.
- Every evaluator rule must map to model-visible information or an explicitly
  owner-resolved value.
- Known-good, equivalent-good, known-bad, safe-stop and tamper sentinels run
  before paid inference.
- Raw responses stay immutable and are audited before model rankings.

## Current broader programme position beyond Stage 2.5

### Safety and project authority: partial

Several high-risk workers and writers now fail closed or use narrow
ProjectService owners. Director progress/lifecycle and pipeline-audio delivery
have bounded migrations. Remaining legacy writers, Assist/stuck recovery,
generic range effects, full IF1 receipts, broad undo/replay and deployment
proof remain. Do not call project-wide writer convergence complete.

### Canonical media/timebase spine: partial

Source probes, provider-storage observations, streamed byte hashing,
`MediaSourceVersionV1` and guarded proxy/master work exist in bounded paths.
The product still lacks one fully consumed professional source/record model,
rational timebase everywhere, complete proxy/relink/PTS/timecode identity,
durable evidence invalidation and long-form production proof.

### Stage 3 intelligence control plane: blocked by Stage 2.5

After a Stage 2.5 `GO` or suitably scoped `MODIFY`, implement the production
`CreativeDirection`, `EditorialPlan`, complete capability registry,
constraint/evidence materialization, model routing, prompt/tool isolation,
durable agent loop, proposal UI and approval/repair controls. Reuse selected
Deep Agents, OpenCode or JCode ideas only after a bounded spike. Their shell,
filesystem or Git model may never own Editron projects.

### Adobe-class native capability programme: large remaining build

The destination still needs audited and certified professional trimming,
tracks/takes/multicam, masks/mattes/rotoscoping/tracking, stabilization,
retiming, captions/titles/graphics/transitions, colour management/scopes/HDR,
dialogue/music/SFX mixing, proxy/relink/timecode, collaboration/review,
interchange/conform, VFX pulls, mastering/QC/delivery and archive. Adobe feature
names are not tool records, and model knowledge does not implement missing
owners.

### Creative vertical recovery: pending after foundation/research gates

The existing overlay systems conflict and frequently do not produce acceptable
captions, transitions, MG, B-roll or audio. The plan includes a full overlay
owner audit, legacy isolation/pruning and one-family-at-a-time product proof.
Motion graphics should use AI-generated compositional code and primitives, with
the SaaS explainer kept as its separate vertical. Do not add another named MG
template library.

Captions need one `CaptionFormResolver`, licensed/original style families,
brand-font selection with a lawful fallback, real rendered comparisons and a
rights-cleared Caption Evaluation Set. Transitions need a licensed, tested
catalog and rendered golden fixtures. Music/dialogue structure is established
early; final SFX is generally resolved after stable picture timing from
semantic event anchors.

Agency or production-house replacement cannot be claimed until real customer
projects pass safety, quality, collaboration, interchange, conform, mastering,
delivery and recovery gates without hidden engineering rescue.

## Separate SFX S2 pilot status

Do not confuse this with Stage 2.5 model planning.

- Reviewer UI repair `9d4e83909` and validation/exclusion hardening
  `b3015b211` are ancestors of active HEAD.
- The reviewer route, schema and tests exist.
- `.calibration-temp/sfx-eval-labelling/` contains 22 proxy persona records and
  a proxy-only tooling-validation manifest.
- Human observation files at handover: 0/22.
- The proxy observations are tooling validation only and must never become
  frozen ground truth.

The real pilot still requires two independent human listeners over the exact
11 allowlisted opportunities, or an explicitly redesigned single-reviewer
evidence claim. Do not simulate listening or adjudication. The reviewer-ID
blank-screen issue was addressed in committed UI tooling, but reverify the
actual browser route before asking humans to use it.

## Required reading after the master/current audit

Read these according to the slice being resumed:

- `docs/EDITRON_REFERENCE_BACKTRACKING_AND_GENERATED_COMPOSITION_PROGRAM_2026-08-11.md`
- `docs/EDITRON_EVIDENCE_SUFFICIENCY_AND_VIBE_EDITING_CONTROL_LOOP_2026-08-13.md`
- `docs/editron/open-ended-editing/oe-agentic-editorial-planning-and-benchmark-reconciliation-2026-08-17.md`
- `docs/editron/open-ended-editing/oe-durable-editorial-orchestration-spike-2026-08-23.md`
- `docs/editron/open-ended-editing/oe-model-provider-capabilities-and-benchmark-protocol-2026-08-19.md`
- `docs/editron/open-ended-editing/oe-codex-hardcodes-assumptions-and-evidence-debt-register-2026-08-20.md`
- `docs/editron/open-ended-editing/oe-stage25-heldout-route-freeze-v1.md`
- `docs/editron/open-ended-editing/oe-stage25-heldout-route-owner-materialization-v1.md`
- `docs/editron/open-ended-editing/oe-stage25-dependency-diversity-freeze-2026-08-25.md`
- `docs/editron/open-ended-editing/oe-stage25-final-paid-cohort-audit-2026-08-26.md`

Older external packs remain discovery evidence:

- `D:\google downloads\Editron_Codex_Handoff_2026-08-09.md`
- `D:\google downloads\Editron_Codex_Addendum_Reference_First_Empty_Project_2026-08-09.md`
- `D:\google downloads\Editron_All_Parallel_Session_Documents_Except_A\`
- `D:\google downloads\Editron_All_Parallel_Session_Documents_Except_A\mnt\data\Editron_Parallel_Session_Document_Pack_Except_A\Integration_Owner\01_Editron_Canonical_Modular_Implementation_Master_v3_Complete_Source_Pack.pdf`
- `D:\google downloads\Editron_Open_Ended_Editing_Research_Pack\`

Do not let those older artifacts override current code or the current master
queue.

## Immutable/local artifacts needed for resumption

- Paid cohort root:
  `.calibration-temp/open-ended-planner-v2/stage25-final-generalisation-paid-cohort/stage25-final-paid-4438d1a41-v1/`
- Corrected provider gate root:
  `.calibration-temp/open-ended-planner-v2/stage25-final-generalisation-provider-preflight/stage25-final-provider-preflight-601beb86d-v2/`
- RHC-01 preview root:
  `.calibration-temp/open-ended-planner-v2/stage25-rhc01-preview/rhc01-preview-0dcbe01c4-v1/`
- Paid audit code:
  `lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-audit-v1.ts`
- Final cohort contract:
  `lib/editron/research/open-ended-planner/stage25-final-generalisation-cohort-v1.ts`
- Final route fixtures:
  `tests/fixtures/editron/open-ended-planner-v2/stage25-heldout-route-tasks-v1.json`

These `.calibration-temp` artifacts are local and gitignored. Verify existence,
hashes and source bindings before relying on them. Do not reconstruct a missing
artifact and call it the original run.

## User working preferences and anti-drift rules

- Explain every architecture choice in simple operational logic. Names without
  owner/data/control-flow reasoning are handwaving.
- Check code, tests, Git and current documents before agreeing with a claim.
- Before adding anything, prove an equivalent owner/capability does not already
  exist across UI, chat, workers, APIs, dynamic imports, re-exports and tests.
- Keep the master plan current after every bounded phase.
- Treat new framework/model ideas as optional candidates. Append them at the
  right future stage only if useful. Ask before a real pivot or reordering.
- Do not burn credits through broad agent fan-out. Work single-threaded unless
  the user explicitly asks for parallel lanes; then use only genuinely
  independent bounded work.
- Do not spend on a provider without an exact fresh preflight and explicit cap.
- Do not use profiles/presets as the product architecture.
- Do not claim a pretty proxy is a production capability.
- Preserve manual timeline access and convergence with AI operations.
- End implementation/status handoffs with:

  ```text
  Result:
  Scope:
  Will not touch:
  Proof:
  ```

## Immediate next bounded slice

After the new session completes the read/grounding gate, resume at route
candidate product evidence, not another model run.

Start with a read-only RHC-02 owner/fixture reconciliation:

1. Trace current native chapter/title/still/audio owners and their actual
   isolated proposal path.
2. Trace current GeneratedCompositionProgram verifier/sandbox and identify the
   exact RHC-specific input contract that is absent.
3. Trace hybrid timebase, continuous-dialogue/room-tone and boundary proof.
4. Confirm no existing RHC-02 fixture/program/renderer already exists.
5. Return the smallest <=5-file implementation slice with result, preserved
   owners and proof before editing.

Do not implement RHC-02, RHC-03 and RHC-04 in one patch. Complete and document
one bounded task at a time, then update the canonical current queue.

## Copy-paste prompt for the new Codex session

```text
You are taking over the Editron production-hardening and open-ended editing
programme in D:\google downloads\Front-End-main\editron-worktree on branch
infrastructure-improvs-+Editron.

FIRST read AGENTS.md and CLAUDE.md completely. Then read
docs/editron/open-ended-editing/EDITRON_CODEX_HANDOVER_2026-08-26.md completely.

You must also process this exact chat transcript completely and chronologically
in bounded chunks:
C:\Users\admin\.codex\sessions\2026\08\09\rollout-2026-08-09T13-46-08-019fe597-f478-71a1-9e15-e44ff8230c0a.jsonl

It is about 1.23 GB and contains old secrets. Never print or reuse credentials.
Record the final processed line/byte. Do not claim the raw transcript is pinned
in context; pin the handover/master ledger and keep a redacted decision ledger.

Then read the canonical current Stage 2.5 queue in
docs/EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md and the final paid-cohort audit.
Independently reproduce branch/HEAD/status/worktrees/history, preserve all dirty
ThinkForge paths, and verify every relevant claim against code/tests/receipts.

Do not create another project/timeline/plan/checkpoint/registry/proof authority.
Do not revive Session A MutationGate/journal runtime. Do not reset, clean,
stash, stage or rewrite user work. Do not make provider calls without a fresh
zero-spend gate and explicit capped authorization. Do not rerun historical
cohorts. Qwen is historical-only.

Return first:
1. exact transcript read checkpoint;
2. exact repo/branch/HEAD/dirty truth;
3. Stage 2.5 completed evidence and proof ceilings;
4. exact remaining Stage 2.5 work;
5. contradictions found between handover, master plan and code;
6. the next <=5-file bounded slice.

After grounding, continue with read-only RHC-02 owner/fixture reconciliation.
Use code and facts, not memory. Update the master plan in the same bounded phase
as every implementation/evidence change.
```

## Handover proof

The predecessor closeout passed:

- Stage 2.5 provider/source readiness: 74/74.
- Repository `pnpm exec tsc --noEmit`.
- Repository `pnpm exec eslint . --quiet`.
- Editron source/doc scope clean at `a66890f97` before this handover edit.

This document does not close Stage 2.5, authorize inference, mutate a project
or certify agency/production-house replacement.
