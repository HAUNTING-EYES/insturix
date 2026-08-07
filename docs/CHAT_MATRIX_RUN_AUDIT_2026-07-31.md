# Chat-to-Edit Matrix — Run Audit & Results (2026-07-31)

Self-contained audit of the first complete, single-deployment run of the 75-scenario
live chat-to-edit acceptance matrix. Written for independent verification (Codex or
human): every claim below is re-derivable from the artifact paths given, and threats
to validity are listed explicitly. Nothing in this document requires trusting the
session that produced it.

---

## 1. Run identity (attribution)

| Field | Value |
|---|---|
| Suite ID | `full-75-userkey-f7g7w4j6z-001` |
| Commit (frozen) | `028abc2b84125cf1e6f04f410fd8a4a9e60ed36d` |
| Deployment (single, entire run) | `https://front-f7g7w4j6z-nimit-jains-projects-bd2b522e.vercel.app` |
| Requested via branch alias | `https://front-end-git-infrastructu-d46f86-nimit-jains-projects-bd2b522e.vercel.app` |
| Database | `editron_prev` (preview Mongo) |
| Started → completed (UTC) | `2026-07-30T18:52:52.984Z` → `2026-07-30T20:07:05.325Z` (74 min) |
| Gemini key | founder-supplied paid key (branch-scoped Preview `GEMINI_API_KEY`, added 2026-07-31 ~00:20 IST); all three app models probed HTTP 200 immediately before launch (`gemini-3.1-flash-lite`, `gemini-3.1-pro-preview`, `gemini-2.5-flash`) |
| Auth | Clerk session token, re-minted every 40 min by a refresher loop; each case subprocess re-reads the auth file at spawn (`scripts/run-chat-edit-battle.ts:412`) |
| Preflight | `fixture preflight sources=6 status=ready`, `remote preflight sources=6 credits>=75 status=ready` |
| Infra failures during run | **0** |

**Primary artifact:** `.calibration-temp/chat-edit-battle/full-75-userkey-f7g7w4j6z-001/suite-summary.json`
**Per-case reports:** `.calibration-temp/chat-edit-battle/full-75-userkey-f7g7w4j6z-001-0NN/<scenario>.json`
(each contains: full check list with evidence, `invocation.toolEvents`, `mongoBefore/After` digests,
`renderEvidence` with artifact URLs, `uiReload` parity data)

## 2. Scoreboard

```
completed 75 / 75
PASS 59   warn 3   FAIL 13   infrastructure-fail 0
clean pass rate 78.7%  ·  pass+warn 82.7%
```

Failed-check histogram (16 non-passing scenarios):

```
8  render.fresh-evidence
7  mongo.mutation-truth
5  agent.required-owner-path
1  mongo.required-created-overlay-types
1  agent.dynamic-run
1  agent.tool-completion
```

## 3. Check definitions (what a failure means)

| Check | Meaning when it fails |
|---|---|
| `agent.dynamic-run` | No real agent invocation completed for the prompt (dead/empty run) |
| `agent.tool-completion` | A selected tool has no completed result |
| `agent.required-owner-path` | The scenario's required evidence→mutation tool sequence did not execute in order (most often: the mutating tool never ran) |
| `mongo.mutation-truth` | Successful-mutation claims and actual Mongo before/after digests disagree (usually: nothing changed) |
| `mongo.required-created-overlay-types` | Required overlay type(s) were not created |
| `render.fresh-evidence` | Rendered-frame/audio proof captured after the edit failed quality/freshness inspection (edit may have landed; the rendered result failed the bar) |
| `ui.reload-parity` | State after reload does not match state after edit |

## 4. Full per-case results (75)

| # | Scenario | Status | Failed checks |
|---|---|---|---|
| 1 |explicit-text|pass|—|
| 2 |explicit-asset|pass|—|
| 3 |selected-overlay-edit|pass|—|
| 4 |explicit-cut|pass|—|
| 5 |spoken-phrase-english|pass|—|
| 6 |spoken-phrase-devanagari|pass|—|
| 7 |untimed-transcript-cache|pass|—|
| 8 |semantic-transcript-topic|pass|—|
| 9 |roman-hinglish-phrase|pass|—|
| 10 |visual-object-exact|pass|—|
| 11 |visual-object-paraphrase|pass|—|
| 12 |inspect-rendered-frame|pass|—|
| 13 |multiasset-script-intake|pass|—|
| 14 |multiasset-script-chat|pass|—|
| 15 |vague-enhance|**fail**|render.fresh-evidence|
| 16 |vague-transitions|warn|render.fresh-evidence|
| 17 |vague-motion-graphics|pass|—|
| 18 |motivated-zoom|pass|—|
| 19 |vague-sfx-beat|pass|—|
| 20 |clean-captions|pass|—|
| 21 |create-html-scene|**fail**|mongo.mutation-truth + mongo.required-created-overlay-types|
| 22 |edit-html-scene|pass|—|
| 23 |bgm-explicit|pass|—|
| 24 |bgm-vague|pass|—|
| 25 |mixed-multi-step|pass|—|
| 26 |undo-overlay-edit|pass|—|
| 27 |undo-full-state|pass|—|
| 28 |rollback-partial-failure|warn|render.fresh-evidence|
| 29 |retry-idempotency|pass|—|
| 30 |project-chat-isolation|pass|—|
| 31 |fragmented-sse|pass|—|
| 32 |visible-range-reference|**fail**|mongo.mutation-truth|
| 33 |spatial-cursor-reference|pass|—|
| 34 |reference-style-transfer|**fail**|render.fresh-evidence|
| 35 |post-edit-render-proof|pass|—|
| 36 |batch-overlay-update|pass|—|
| 37 |split-selected-overlay|pass|—|
| 38 |trim-selected-overlay|pass|—|
| 39 |delete-selected-overlay|pass|—|
| 40 |sync-overlay-style|pass|—|
| 41 |close-timeline-gaps|**fail**|render.fresh-evidence|
| 42 |transcript-overview|pass|—|
| 43 |transcript-moment-search|pass|—|
| 44 |visual-moment-search|pass|—|
| 45 |audio-moment-search|pass|—|
| 46 |speech-anchored-sticker|**fail**|agent.dynamic-run + agent.tool-completion + agent.required-owner-path + mongo.mutation-truth|
| 47 |manual-keyframe-zoom|pass|—|
| 48 |audio-anchored-camera-shake|pass|—|
| 49 |visual-speed-ramp|**fail**|agent.required-owner-path + mongo.mutation-truth|
| 50 |selected-overlay-fade|pass|—|
| 51 |reorder-overlay-layer|pass|—|
| 52 |move-retime-overlay|**fail**|agent.required-owner-path|
| 53 |selected-clip-filter|pass|—|
| 54 |selected-dialogue-dubbing|pass|—|
| 55 |vertical-subject-reframe|**fail**|render.fresh-evidence|
| 56 |manual-impact-sfx|**fail**|agent.required-owner-path + mongo.mutation-truth|
| 57 |dialogue-ducking|**fail**|mongo.mutation-truth|
| 58 |content-analysis|pass|—|
| 59 |plain-caption-track|warn|render.fresh-evidence|
| 60 |fancy-caption-track|**fail**|render.fresh-evidence|
| 61 |refresh-plain-captions|pass|—|
| 62 |refresh-fancy-captions|pass|—|
| 63 |batch-caption-edit|pass|—|
| 64 |analyze-selected-audio|pass|—|
| 65 |analyze-selected-video|pass|—|
| 66 |read-completed-clip-analysis|pass|—|
| 67 |regenerate-existing-scene|pass|—|
| 68 |beat-sync-cuts|**fail**|agent.required-owner-path + mongo.mutation-truth|
| 69 |replace-selected-sfx|pass|—|
| 70 |list-uploaded-assets|pass|—|
| 71 |search-uploaded-assets|pass|—|
| 72 |inspect-uploaded-asset|pass|—|
| 73 |place-uploaded-asset|pass|—|
| 74 |search-stock-footage|pass|—|
| 75 |replace-with-uploaded-footage|pass|—|

## 5. Failure family analysis

### Family A — evidence-loop / mutation-never-executed (5 fails)
`visual-speed-ramp`, `move-retime-overlay`, `manual-impact-sfx`, `beat-sync-cuts`, `speech-anchored-sticker`

Shared signature: `agent.required-owner-path` (+ `mongo.mutation-truth` with identical
before/after digests). The agent gathers evidence and never invokes the mutating tool.

Root cause was pinned on 2026-07-30 (report
`targeted-root-families-20260730-028abc2b-001-008/visual-speed-ramp.json`):
1. `resolve_visual_edit` returns `status:"ambiguous"` with candidates but accepts NO
   candidate-selection parameter — disambiguation is structurally unclosable
   (`lib/editron/agent/chat-visual-tools.ts`, no `candidateFrame`/`candidateId` input).
2. The frame verifier throws "Visual verification provider returned invalid JSON"
   (`lib/editron/services/chat-frame-visual-verification.ts:169`) — Gemini call at
   `:140` has `maxOutputTokens:768`, no `responseMimeType`/schema, no seed → truncation.
3. Agent retries the resolver with an IDENTICAL query → deterministic same answer → dead end.

Designed fix (not yet implemented, awaiting go): enforce structured JSON + seed + one
retry in the verifier; add `candidateFrame` to `resolve_visual_edit`; policy that an
ambiguous-resolver retry must carry new information, else terminal grounded
clarification (already an accepted harness outcome, cf. commit `d8ce832f`).
Expected to clear most of this family.

### Family B — rendered-proof quality (5 fails + 3 warns)
`vague-enhance`, `reference-style-transfer`, `close-timeline-gaps`,
`vertical-subject-reframe`, `fancy-caption-track` (+ warns `vague-transitions`,
`rollback-partial-failure`, `plain-caption-track`)

Mutations landed; rendered frames failed quality inspection. The caption-geometry
defect (title-safe area) recurs in `plain/fancy-caption-track` despite 4 prior fix
attempts (`86e0a66d`, `42fa23ed`, `3043d79a`, `9934932a`) — per Rule 33 this needs a
single-owner root-cause on where final text geometry is decided before render, not a
fifth patch. Inspect each case's `renderEvidence.issues[]` for exact frames/dimensions.

### Family C — mutation-truth stragglers (3 fails)
- `create-html-scene`: also misses required overlay types. Likely the known product
  gap: MG request declines with no fallback overlay (open founder ruling).
- `visible-range-reference`, `dialogue-ducking`: claimed mutations not present in
  Mongo digests. Not previously diagnosed — genuinely new; read their reports first.

`speech-anchored-sticker` additionally shows `agent.dynamic-run` fail (dead run) — check
its `invocation.error` before assuming Family A; could be a one-off provider hiccup.

## 6. Threats to validity (read before trusting)

1. **Harness had uncommitted local edits during the run.** Dirty-diff fingerprint at
   launch: `sha256(git diff scripts/run-chat-edit-battle-suite.ts
   tests/editron/chat-edit-battle-suite.test.ts scripts/run-chat-edit-battle.ts)[:16]
   = 35d02c2777f61745`. 14 tracked files dirty in the worktree overall. The DEPLOYED
   product code is exactly `028abc2b` (server-side, unaffected by local dirt), but the
   local scorer/runner is not byte-reproducible from git alone. To re-run identically,
   commit or stash-record those files first.
2. **Superseded partial runs exist with the same commit.** `full-75-frozen-028abc2b-001`
   contains 11 passes from an earlier deployment (`front-dw7coboaz…`) whose provider
   died mid-run (quota); its 26 rate-limit-poisoned results were purged from its
   summary at the time. It was NOT merged into this run — the suite's deployment-binding
   guard (`run-chat-edit-battle-suite.ts:95`) refused resume across deployment IDs, so
   this run re-ran all 75 fresh. Ignore all `full-75-frozen-*`, `chat-live-*`,
   `targeted-*` result dirs for scoring; they are moving-target or partial runs.
3. **Provider context.** Earlier same-night failures were Google quota exhaustion
   (`RESOURCE_EXHAUSTED`, incl. an explicit "monthly spending cap" message on the
   founder's project, raised at ai.studio/spend before this run). If re-running,
   re-probe the three model IDs first; per-model quotas differ.
4. **Key/env history that evening (all branch-scoped Preview `GEMINI_API_KEY`):**
   original 6d-old key removed → env temporarily inherited the general-Preview key →
   dev-env key added + redeploy (`front-p9cw…`) → founder key added + redeploy
   (`front-f7g7w4j6z`, this run). Production env untouched throughout. Removed values
   are backed up locally (session scratchpad, not in repo).
5. **Fixtures** are provisioned per case from seed projects and cleaned after
   (`fixture-cleanup` logged per case); DB is `editron_prev`, not production.

## 7. How to independently verify (Codex checklist)

1. Recompute the scoreboard from the artifact, not this doc:
   `node -e "const s=require('./.calibration-temp/chat-edit-battle/full-75-userkey-f7g7w4j6z-001/suite-summary.json'); console.log(s.passCount, s.warnCount, s.failCount, s.completedCount, s.commitSha)"`
2. Spot-audit ≥3 passes: open their per-case JSON, confirm `mongoBefore/After` digests
   differ where mutation was expected, `renderEvidence.artifactRefs` URLs exist, and
   `checks[]` are all pass.
3. Spot-audit ≥3 fails: confirm the failed check's `evidence` matches the family
   assignment in §5 (e.g. Family A: `toolNames` lack the mutating tool; digests equal).
4. Confirm single-deployment attribution: `suite-summary.json.baseUrl` equals
   `front-f7g7w4j6z…` and every per-case report shares it.
5. Re-run any single case (needs fresh Clerk auth + the same base URL):
   `npx tsx scripts/run-chat-edit-battle-suite.ts --base-url=<branch-alias> --auth-header-file=<file> --env-file=.calibration-temp/vercel-preview.env --suite-id=verify-001 --cases=<scenario-id>`
   Note: a new run hits the CURRENT deployment — re-verify the alias target first.

## 8. Open decisions & queued work (post-run)

1. **Go/no-go on the Family A designed fix** (verifier JSON+seed, `candidateFrame`,
   futile-retry policy) — expected to clear ~5 fails.
2. **Caption/text final-geometry root-cause** (Family B; fifth attempt must be a
   redesign of the decision point, not a patch).
3. **MG decline-without-fallback product ruling** (`create-html-scene`).
4. Read `visible-range-reference` + `dialogue-ducking` reports (new, undiagnosed).
5. Harness improvement: honor `retryable:true` + `retryAfterSeconds` on provider 503s
   instead of recording instant failures (cost of ignoring it on 2026-07-30: 26
   poisoned results in 6 minutes).
6. Commit the dirty harness files so future runs are byte-reproducible.
