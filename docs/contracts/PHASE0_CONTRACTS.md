# Phase 0 — Vibe OS Contracts

**Status:** complete, awaiting founder approval of the object model.
**Files:** `lib/studio/contracts/{objects,turn,manifest,credits}.ts` (zod 4, pure types — no runtime wiring yet).
**Version:** `STUDIO_CONTRACTS_VERSION = 0.1.0`

---

## 1. Object model (summary)

```
Deliverable (brand-scoped, campaign optional)
 ├─ threadId → one direction thread (StudioThreadItem union:
 │    user · prose · plan(steps) · artifact_born · receipt · quick_replies)
 ├─ artifacts[]  — kind + status(8 honesty states) + sourceRef(engine, externalId)
 │                 + progress(real telemetry only) + revisions[](+checkpointRef)
 ├─ edges[]      — derived_from · stale_if · attaches_to
 └─ stageFocus   — { artifactId, reason: agent_working|user_asked|artifact_changed, why, since }
```

Key decisions:
- **Artifact kinds (12)** are coarser than formats. The 14 `OutputFormat`s all map to `script` (format lives in the payload; `artifactKindForOutputFormat`). Video→`reel`, canvas→`image_canvas`/`thumbnail`, CalOS→`schedule`, etc.
- **Status = the 8 designed states.** `offline` is transport-derived, client-side only, never persisted. `progress.percent` is nullable — real telemetry or honestly nothing.
- **sourceRef is the adapter seam**: every artifact points back to its engine object; the vibe layer aggregates, it does not own engine state.
- **Thread wraps, not replaces**: an Editron chat session becomes the thread's edit-capability history (adapter surfaces `contentSegments` as `prose` + `plan` items).

## 2. Turn protocol (SSE)

`POST /api/studio/turns` → event stream, discriminated on `type`:

```
turn.received{turnId}
turn.plan{planId, summary, steps[{stepId, capability, toolName, label, riskLevel, quotedCost?}]}
(step.start{loadingMessage?} → step.progress{stage?, percent|null} → step.done{receipt} | step.error{retryable, refundIssued})*
turn.confirm_required{kind: spend|publish|destructive, quote?, publishTargets?}   ← pauses; answered by POST …/:id/confirm
turn.done{summary, creditsConsumedTotal, artifactIds[], stageFocus?}
  | turn.needs_clarification{question, options[2+]}     ← exactly one question
  | turn.capability_gap{reason, alternative?}           ← named reason, real alternative
  | turn.error{retryable, refundIssued}
  | turn.interrupted{reason}
```

- `StudioTurnRequest` carries `operationId` (uuid idempotency), `mode: ask|direct`, `clientContext` (focused/selected artifact, timecode, **spatialCursor**) — the Editron clientContext generalized.
- Long steps queue behind QStash and stream progress (kills the inline-serverless-timeout class of bug).
- Interrupt = `DELETE /api/studio/turns/:id`, cooperative; refund semantics reuse the existing per-tool refund paths.

## 3. Domain manifests

`StudioDomainManifest` per capability: `{capability, stageView, artifactKinds, tools[]}`. Tool fields mirror `chat-tool-registry.ts` 1:1 (`label/shortLabel/iconCategory/riskLevel/executionType/receiptLabel/loadingMessages/exposure`) **plus** `whenToUse`, `costRef{service,action}` (into `CREDIT_COSTS`), `produces[]` — so the existing 67 Editron entries mount mechanically in Phase 3.

**Risk policy (single owner, `STUDIO_RISK_POLICY`):** `high` risk always confirms; generative tools with a `costRef` quote+confirm pre-flight; publishing always hard-gates. Planners rank/license/plan — they never duplicate final render form (AGENTS.md §12 honored at contract level).

## 4. Credits pre-flight

`StudioTurnCostQuote{lines[], totalByPool{main,media}, expiresAt}` + `StudioWalletSnapshot` → `StudioSpendConfirmCard{quote, wallet, sufficient, topUpHref}`. Pools, multipliers, consumption order, and org-wallet flag semantics copied verbatim from `lib/config/creditCosts.ts` (`MEDIA_POOL_ACTIONS`, 30cr/USD). The 402-bubble becomes a pre-flight card; insufficiency offers the `/account/billing` seam.

## 5. Adapter inventory (read-side aggregation first)

| Engine object | → Artifact kind | Source (existing) | Manual hatch |
|---|---|---|---|
| Editron `project` | `reel` | `GET /api/services/editron/projects/{id}` | `/dashboard/editron/project/{id}` (editor v2) |
| Editron render | reel revision | `/render/history`, resume claims | render panel |
| ThinkForge `session` | `script` | `script/blocks`, `sessions/list` | Tiptap stage |
| Clickatron `session` | `image_canvas` \| `thumbnail` (if committed+attached) | `history`, session store | `/dashboard/clickatron/lab/{id}` |
| CalOS `deliverable` | `schedule` (+`post` per scheduled item) | `deliverables` API | `/dashboard/calos` |
| CalOS campaign | Deliverable grouping | `campaigns` API | — |
| Alyzitron `task` | `analysis` | `analyses` API | report page |
| Musitron `task` | `music` | `history` API | DAW |
| Storyboard `storyboard` | `storyboard` (edge view script→reel) | `pipeline/storyboard/{id}` | workspace page |
| Avatar pipeline job | `avatar_video` | `avatar-vault/profiles/{id}/pipeline-jobs` | vault v2 |
| UploaderX video | `post` (published) | `/videos` | — |

CalOS editorial → artifact status mapping: `idea|drafting`→`empty|streaming`, `generated`→`done(draft)`, `in_review|approved`→`done`, `changes_requested`→`stale`-adjacent flag, publish states (`claimed|publishing`)→`running`, `failed`→`error`.

## 6. Open items carried forward (non-blocking)
1. Thread ↔ legacy chat-session migration strategy — decide at Phase 2 gate.
2. `post` artifact identity vs UploaderX metadata — finalized when Phase 4 adapter lands.
3. Org wallet display — pending `ORG_WALLET_BILLING` decision (risk #4 in the plan).

## 7. Verification
`npx tsc --noEmit` clean (contracts compile against zod 4 + `@/` alias); `npx eslint lib/studio --quiet` clean. No engine files touched — zero blast radius.
