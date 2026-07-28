# Editron Phase 0 Release Receipt - 2026-07-29

Status: Phase 0 baseline complete. This receipt records operational truth; it does
not claim that the recovered edit is visually acceptable.

Plan source:
`docs/agents/sessions/editron/Editron-Final-Execution-Plan-2026-07-29.md`

## 1. Preview Deployment Truth

Preview alias:
`front-end-git-infrastructu-d46f86-nimit-jains-projects-bd2b522e.vercel.app`

The alias served this deployment when the recovery was dispatched:

- Deployment: `dpl_8xSDoQ4iXiLo9gKc5bkSsLBP8b4T`
- Immutable URL:
  `front-29z6hqqv7-nimit-jains-projects-bd2b522e.vercel.app`
- State: `READY`
- Git ref: `infrastructure-improvs-+Editron`
- Git SHA: `a82a9c29b2db13eda5e2e1b2939eb95b951def66`
- Created: `2026-07-28T20:42:36.348Z`

The alias later advanced to:

- Deployment: `dpl_E86PysbLiMRwKhJy96MUThcj1DFF`
- Immutable URL:
  `front-kdd8k5lo0-nimit-jains-projects-bd2b522e.vercel.app`
- State: `READY`
- Git ref: `infrastructure-improvs-+Editron`
- Git SHA: `47edaf8865168b57b52cb61a846cd4082b23bcb0`
- Created: `2026-07-28T21:02:14.304Z`

Git ancestry checks prove that both required commits are present in the current
served commit:

- `baaadc686111bac9045622f3fa220310cf99dbb3`
  (`fix(editron): preserve verified audio rights on server saves`)
- `a82a9c29b2db13eda5e2e1b2939eb95b951def66`
  (`docs(editron): preserve pinned execution commitments`)

## 2. Native-Audio Rights Recovery

Project: `proj_Gn3nVJaDk5Fx`

Before backfill:

- Duration: 16,736 frames
- Overlays: 97
- Video: 91
- Caption: 1
- Transition: 1
- Sound: 4
- Video overlays with persisted rights: 0 of 91
- Source asset with valid stored user attestation: 1 of 1

The backfill used the production native-audio-rights attestation service. It
copied the source asset's existing verified attestation onto each derived video
overlay. It did not synthesize a new rights claim.

Immediately after backfill and before Director rerun:

- Duration remained 16,736 frames.
- Overlay count and family counts remained unchanged.
- Video overlays with valid rights: 91 of 91.
- Video overlays with attestation receipts: 91 of 91.
- A replay returned no new attestations, proving idempotency.

Focused verification:

- `native-video-audio-rights-attestation.test.ts`
- `native-video-audio-rights-route.test.ts`
- `project-save-payload.test.ts`
- Result: 14 of 14 tests passed.

This satisfies the Phase 0 invariant that the rights repair itself must not
change unrelated overlays.

## 3. Director Rerun

Recovery ID:
`phase0-proj_Gn3nVJaDk5Fx-2026-07-28T20:58:25.427Z`

Director QStash message:
`msg_7YoJxFpwkEy3LJPuqYops9z5hBw2preUJxBTtuExbeGr7c9aZUszF`

Final delivery:

- State: `DELIVERED`
- HTTP status: 200
- Completed: `2026-07-28T21:07:35.713Z`
- Provider error: none

Settled Mongo state:

- Updated: `2026-07-28T21:09:41.872Z`
- `autoEditStatus`: `complete`
- `projectStatus`: `needs-attention`
- Duration: 16,736 frames
- Video: 91
- Transition: 1
- Sound: 8
- Caption: 2
- Motion graphic sequence: 0
- Total overlays: 102
- Video overlays with valid rights: 91 of 91
- Video overlays with rights receipts: 91 of 91

Decision audit:

- Source: `unified-decision-bundle`
- Executable producer: `unified-planner`
- Signal candidates: 595
- Added executable signal decisions: 83
- Evidence-only signal decisions: 512
- Final decisions: 83
- Executed decisions: 10

Quality state:

- Overall score: 65
- Issues: 146
- Critical issues: 0
- Warnings: 130
- Largest issue class: `transition_collision` (74)

The rerun passed the narrow recovery test: it completed without inherited
native-audio-rights failure. It did not pass a visual-quality acceptance test.
Compared with the pre-rerun project, it added a second canonical caption track
and duplicated four async audio overlays. It generated no MG sequence.

## 4. Rendered Evidence Outcome

Phase 0 rendered-evidence QStash message:
`msg_7YoJxFpwkEy5zBp35EexMBTDtocDouTTn1PUpd5agxUX7T1jbbxzQ`

Final delivery:

- State: `DELIVERED`
- HTTP status: 200
- Completed: `2026-07-28T21:07:36.872Z`

The worker completed, but fresh still rendering did not:

- Still-evidence status: `skipped`
- Reason: `artifact_pack_not_renderable`
- Blocking issue: `incomplete-sfx-evidence`
- Requested frames: 8
- Newly rendered frames: 0
- Rendered-quality gate: `missing_rendered_evidence`

The project retains an older aesthetic summary with score 0 and status `fail`.
That retained report is not treated as fresh proof for this rerun.

This is a truthful Phase 0 failure finding. A successful worker delivery is not
equivalent to successful pixel evidence.

## 5. Provider-Failure Snapshot

Project: `proj_YWFj2GOO6tUl`

The project and its batch were read only. They were not resumed or modified.

Project state:

- Created: `2026-07-28T09:26:06.774Z`
- Updated: `2026-07-28T09:32:07.675Z`
- `autoEditStatus`: `failed`
- Duration: 0 frames
- Overlays: 0
- Source batch:
  `upload_batch_d3512b58-d93f-48cf-962d-d98ea6f0e2f6`

Batch state:

- `orchestrationStatus`: `failed`
- Orchestration attempt: 6
- Failure count: 2
- Assets: 10 (9 video, 1 image)
- Analysis complete: 10 of 10
- Video transcription complete: 9 of 9
- Video deep analysis complete: 9 of 9
- Terminal cause: Gemini 2.5 Flash returned HTTP 500 while authoritative
  script grounding performed visual coverage verification.

Canonical snapshot:

- Schema: `editron-phase0-provider-failure-snapshot-v1`
- Canonical JSON bytes: 1,187
- SHA-256:
  `6ec096d7edfb9f290999be14fc5ad2f4b9f92e2714fe17000d33b959032ba249`

## 6. Phase 0 Exit Verdict

Phase 0 exit gate: passed for release truth and recovery baseline.

Confirmed:

- The exact preview deployments and commits are known.
- The rights-preservation fix is deployed.
- Rights backfill is scoped, persistent, and idempotent.
- The recovered Director run completed without rights debt.
- The provider-failed batch has a reproducible immutable snapshot.

Open findings carried into later phases:

- Duplicate canonical captions after rerun.
- Duplicate async audio overlays after rerun.
- No generated MG sequence despite licensed MG opportunities.
- Planner-to-executor loss: 83 decisions selected, 10 executed.
- Phase 0 fresh rendered evidence blocked by incomplete SFX evidence.
- Quality score regressed from 70 before rerun to 65 after rerun.
- `proj_YWFj2GOO6tUl` remains failed and intentionally not resumed until the
  durable provider-recovery state machine is implemented.

Per the execution plan, no Phase 1 behavior work begins without explicit
approval.
