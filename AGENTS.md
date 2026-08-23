# AGENTS.md — Insturix Front-End (read this first)

> Codex entry point. This repo was previously developed with Claude Code; the accumulated
> session history + knowledge base has been migrated into **`docs/agents/`** (see §6). Detailed
> per-session logs are numbered by workstream (Editron 01–46, UIUX 01–04, ThinkForge 01–02, etc.).

## 1. What this is
A large **Next.js 15 / React 19** SaaS bundling several AI content tools:
- **Editron** — AI video auto-editor (flagship; deepest subsystem, all recent work). Renders via Remotion.
- **Alyzitron** — video analysis / transcription / chat. **Clickatron** — AI image editor. **ThinkForge** — script generator. **Musitron** — music. **Socialize** — distribution. **UploaderX** — ingest.

## 2. Stack / tooling
Next.js `15.3.6` (App Router) · React `19.1.2` · TypeScript `5.9.3` · Tailwind `v4` · Remotion `4.0.398` (AWS-Lambda render) · Clerk auth · MongoDB (`mongodb`+`mongoose`) · Upstash Redis/QStash · Google Cloud Storage · Gemini (`@google/genai`) · Modal GPU (Python, `modal/`) · Deepgram · Zustand + TanStack React Query + React Context.
- **Package manager: `pnpm`** (`packageManager: pnpm@10.17.1`). ⚠️ Stray `package-lock.json` + `composer.*` exist — **use pnpm**, ignore those.
- **You are in a git worktree:** this dir is `editron-worktree`, a worktree of branch `infrastructure-improvs-+Editron`. Run all commands here.

**Scripts (`package.json`):** `dev`=`next dev --turbopack` · `build`=`next build` · `lint`=`next lint` · `test`=`vitest run` · (no typecheck script → `npx tsc --noEmit`). Entry: `app/layout.tsx` → `app/page.tsx`; editor at `/dashboard/editron/project/[projectId]`.

## 3. Repo structure (top level)
| Dir | Purpose |
|---|---|
| `app/` | App Router — pages, layouts, **~285 API routes** (`app/api/**/route.ts`) |
| `components/` | UI. `components/editron/editor/version-7.0.0/` = the editor (60+ components, 7 React contexts); `components/ui/` = shadcn/ui; `components/dashboard/<Product>/` per product |
| `lib/` | Logic. `lib/editron/` (`agent/`, `services/`, `engine/`, `motion-graphics/`, `data/`, `db/`), `lib/alyzitron/`, `lib/thinkforge/`, `lib/auth/`, `lib/config/` |
| `stores/`,`contexts/`,`providers/`,`hooks/` | Zustand + app-level React state |
| `modal/` | **Python** Modal GPU workers (V-JEPA/Wav2Vec/Essentia) — separate runtime |
| `tests/` | Vitest (`tests/**/*.test.ts` only is in scope) |
| `schemas/`,`types/`,`data/`,`migrations/`,`workers/`,`public/`,`styles/` | supporting |
| **`docs/agents/`** | **Migrated agent knowledge base — sessions, reference, vault (see §6)** |
| **ignore** | `node_modules/`,`.next/`,`.vercel/`,`.calibration-temp/`,`modal/__pycache__/`,`scripts/` (untracked dev probes) |

## 4. Build & verify — historical snapshot (measured 2026-06-04)

> Re-run these commands before making a current claim. This dated snapshot is
> retained for history and is not current repository truth.
```bash
pnpm install
pnpm dev                 # next dev --turbopack (needs a populated .env.local)
npx tsc --noEmit         # type-check
pnpm lint                # next lint
pnpm test                # vitest run
```
| Check | Status |
|---|---|
| `npx tsc --noEmit` | **196 errors, ALL in one file: `lib/thinkforge/agents/script-section-agent.ts`** (curly/smart quotes used as JS string delimiters → syntax errors). 0 in editron/components/app. **Fix that file → ~0 errors.** This is the only tsc blocker (not distributed debt). |
| `pnpm lint` | **PASS** (0 errors, **708 warnings**; 10 `react-hooks/rules-of-hooks` are the only real-bug-risk ones) |
| `pnpm test` | **PASS — 205/205** (broad `vitest run`); `tests/editron/` = 145/145 |
> `next lint` passes despite the broken file — **green lint ≠ green tsc here. Always run `tsc`.**

## 5. Architecture (the load-bearing truths)
- **Auth:** Clerk; `middleware.ts` protects `/dashboard(.*)`, `/api/{user,services}(.*)`.
- **State:** Zustand (global) + React Query (`lib/QueryClient.ts`) + React Context (editor subsystems in `components/editron/editor/version-7.0.0/contexts/`).
- **Styling:** Tailwind v4 + CSS-var design system (`app/design-tokens.css`) + shadcn/ui (`components/ui/`).
- **Editron auto-edit pipeline (core feature):**
  `upload → GCS + Mongo media_assets` → `POST app/api/services/editron/auto-edit/from-asset/route.ts` → **`lib/editron/agent/director-agent.ts`** → **Path E (LIVE): `services/creative-brief.ts` (Gemini) → `brief-executor.ts` → `edl-executor.ts`** (mutates project overlays) → `app/api/services/editron/cloudrun/render/route.ts` → Remotion Lambda → MP4.
- ⚠️ **Critical:** **Path E (the Gemini "Creative Brief") is the LIVE decision producer** (`USE_CREATIVE_BRIEF="true"` in all `.env.local*`). The signal-scored "utility-scorer" overlay system (Path D: `lib/editron/engine/utility-scorer.ts` + `engine/overlay-definitions.json`, 91 overlays) is a **gated-off fallback** — easy to mistake for live. The 43 MG **styling dials** ARE live (scored in `edl-executor.ts:~1146`); zoom/cut/transition/graphic **placement** comes from the LLM brief.
- **External services + env:** Mongo (`MONGODB_URI`, `EDITRON_MONGODB_DB_NAME`) · GCS (`GOOGLE_CLOUD_CREDENTIALS`, `GCS_BUCKET_NAME`) · Gemini (`GEMINI_API_KEY`/`GOOGLE_API_KEY`) · Upstash (`UPSTASH_REDIS_REST_URL/TOKEN`) · Modal (`MODAL_*`) · Remotion Lambda (`REMOTION_LAMBDA_*`) · Deepgram (`DEEPGRAM_API_KEY`).
- **Full subsystem map:** `docs/agents/vault/02-Architecture/MG-Overlay-Infrastructure-Complete-Map-2026-06-03.md` (every signal, all 91 overlays, scoring→render chain, status ledger). **Read before touching MG.**

## 5A. Editron vision and anti-drift rules (mandatory)

### Current source of truth

- Start every Editron architecture or implementation turn by reading the
  authoritative ledger in
  `docs/EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md`, then verify the relevant
  claims against the current branch, code, imports, consumers, tests and Git
  history. Code and executable evidence override handoffs, old session text and
  dated status tables.
- Keep these two statements separate: **IF1 canonical freeze is complete and
  tagged; IF1 runtime migration across the active product is not complete.**
- `CAP-0` is a broad family census and the current 40-operator benchmark catalog
  is a bounded research slice. Neither is the complete atomic Editron tool
  contract. Do not call either one "all tools".
- Before relying on a numeric threshold, fixture choice, benchmark score,
  sampling rule, timebase claim or production assumption, read
  `docs/editron/open-ended-editing/oe-codex-hardcodes-assumptions-and-evidence-debt-register-2026-08-20.md`.
  Keep fixture, research, provisional-policy, defect and production-contract
  claims separate; append newly discovered material assumptions instead of
  silently promoting or forgetting them.
- Before adding any operation, planner, resolver, renderer, compiler or agent,
  search direct calls, types, strings, dynamic imports, re-exports, tests and
  mocks for an existing owner. Extend or adapt the sole owner; do not create a
  shadow authority.

### Living-plan and compaction discipline

- Update the authoritative master ledger in the same bounded phase whenever
  code, a benchmark, a receipt, an invalidation, a blocker or the next action
  materially changes. Never leave "calls pending" after calls ran, preserve a
  pass after its evidence was invalidated, or report a historical source hash
  as current truth. Record the exact commit, verified boundary, tests/proof,
  remaining blockers and next execution order. Plan maintenance is required
  implementation work, not optional documentation deferred to a later agent.
- During autonomous multi-phase work, refresh the ledger after every bounded
  commit before starting the next phase, and leave concise adjacent authority/
  invariant comments wherever code alone would not preserve the reason across
  compaction or another agent handoff.
- Keep `RAW_EXECUTED`, `VALID_EVIDENCE`, `INVALID_EVIDENCE` and production
  promotion status separate. A paid call, green unit test or attractive render
  is not automatically valid evidence and is never production certification.
- Add concise adjacent code comments when a non-obvious owner, revision origin,
  evidence boundary, proof invariant or failure disposition would otherwise be
  lost during context compaction or a handoff to another agent. Comments must
  explain the authority or reason, not narrate syntax; versioned contracts,
  tests, receipts and the master ledger remain the source of truth.
- Before a handoff, reconcile the ledger against current code and artifacts and
  record the exact version/hash/path needed to resume. Do not rely on chat
  memory to carry unresolved assumptions or the next executable step.

### Mandatory pre-implementation grounding gate

Before designing or editing any Editron slice, the agent must complete and
report this gate. Do not infer completion from a handoff, plan paragraph,
passing unit test or memory of an earlier turn.

1. Re-read the authoritative master ledger and the directly governing design,
   contract and audit documents for the slice. Treat supporting session/chat
   history as discovery evidence, never current truth.
2. Reproduce the active worktree, branch, HEAD, status and relevant history.
   Preserve unrelated or user-owned dirty changes.
3. Search the current codebase for the capability, type, owner and execution
   path across manual UI, chat, Director, workers, APIs, tests and fixtures.
   Check direct calls, type references, strings, dynamic imports, re-exports,
   mocks and final consumers before concluding that something is missing.
4. Trace the verified current path as `caller -> decision owner -> form owner
   -> mutation owner -> stored state/revision -> renderer -> proof`, and label
   every absent or unverified link honestly.
5. State the bounded pre-edit contract in plain language: intended result,
   exact scope/files, preserved authorities and required proof. A phase may not
   exceed five files and may not silently repair unrelated runtime behavior.
6. For an unproved architecture or infrastructure choice, freeze the shared
   fixture, inputs, outputs, failure cases and scorecard first; test every
   serious candidate against that same contract before selecting or wiring a
   production implementation. In particular, preview-observation and durable
   agent orchestration must be proven by bounded spikes before rollout.
7. After editing, re-read every touched file, run focused verification and the
   repository typecheck/lint required below, then update the master ledger with
   code-grounded status. If code disproves the intended slice, stop and revise
   the plan instead of forcing the implementation.

### Product destination

Editron is a web-native, AI-enabled professional editing and post-production
system. The destination is Adobe-class capability infrastructure on the web,
not an Adobe API wrapper and not a collection of chat shortcuts. Native manual
controls and agent-accessible controls must converge on the same certified
owners.

The system must serve short social edits, agency work, and long-form/film-post
work through one globally scalable architecture. Four-, five- or ten-hour
projects are scalability targets, not separate user presets; short-form remains
fast because it uses smaller ranges and work units on the same infrastructure.
Never claim agency or production-house replacement until real certification
gates pass.

### The agentic or "vibe editing" system

Yes, Editron includes an agent system. Its production loop is:

```text
EDITRON.md + user brief/script/brand/references
  -> layered source-media and timeline evidence
  -> reference target reconstruction
  -> complete atomic capability/tool context
  -> model-selected typed edit plan
  -> evidence and revision binding
  -> generic schema-driven argument lowering
  -> isolated proposal execution and bounded preview
  -> visual/audio inspection and bounded repair
  -> user review or safe ProjectService commit
  -> receipt, proof, undo/replay and delivery state
```

- `EDITRON.md` is the human-readable, versioned editorial constitution: desired
  output, story, references, brand rules/fonts, preservation/avoidance rules,
  rights/privacy/model-egress policy, quality/cost/deadline constraints and
  approval requirements. It is not a second project database.
- Layered evidence is reusable ingest evidence plus decision/claim-conditioned
  dense evidence plus rendered/delivery proof. Models retrieve bounded source
  ranges; they do not ingest a multi-hour project as one monolithic prompt.
- Reference reconstruction separates global editorial language, recurring
  design grammar, unique hero moments and literal protected details. Observed
  features receive `MUST`, `SHOULD`, `MAY`, `MUST_NOT` or `UNRESOLVED` treatment
  with fluid prominence/fidelity/confidence—not automatic copying.
- One orchestrator may route to tested visual, audio, code-generation or
  retrieval specialists, but all specialists share one plan and one project
  authority. Model choice is benchmarked; it is not permanently Gemini-,
  OpenAI-, Qwen- or vendor-specific.
- Users must be able to play and edit unaffected timeline ranges while agents
  prepare background proposals. ProjectService applies non-overlapping rebases
  and returns structured conflicts for overlapping changes.

### Native, generated-composition and hybrid execution

- **Native** editing uses certified Editron owners and editable timeline state:
  cuts/trims/tracks, captions, standard transitions/effects, keyframes, masks,
  mattes, tracking, retiming, colour and audio operations.
- **GeneratedCompositionProgram** is a first-class bounded creative operation,
  not merely an MG emergency fallback. It can express reference-specific
  footage layout, typography, masks, motion, graphics and relational/procedural
  behavior through sandboxed code, declared sources/fonts/timebase, exposed
  controls, handles, artifacts and proof.
- **Hybrid** is the normal difficult-reference route: native timeline, source
  selection, adjacent cuts, audio, colour, captions and delivery around bounded
  generated-composition islands. The moving filmstrip is a generated island;
  the complete reel is hybrid.
- Route by mandatory target coverage, certified ownership, editable semantics,
  cross-element relationships/procedural geometry, sandboxability, proof,
  rights, revisions, interoperability and render budget. Never route merely by
  number of steps.

### Model-planning and benchmark law

- Before changing, issuing or interpreting an Editron model benchmark, read
  `docs/editron/open-ended-editing/oe-model-provider-capabilities-and-benchmark-protocol-2026-08-19.md`
  completely and re-verify the exact provider model IDs, returned identities,
  official tool/structured-output settings, modalities, limits and pricing.
  Never score an unsupported transport option as an editing failure.
- Keep coding-agent performance, structured-plan/schema performance,
  provider-native tool-calling performance and rendered editorial quality as
  separate evidence. A failure in one is not automatically a failure in the
  others. The governing future cohort is Luna, Terra and Gemini 3.7 Flash.
  Qwen3.8-Max is historical evidence only and MUST NOT receive a new benchmark
  call, repair, score or production-routing slot.
- The model receives the actual request/reference evidence and the relevant
  `CAP-2` atomic tool sheet. Each tool row must declare owner, exact inputs and
  outputs, support/certification, planner eligibility, state effects,
  reads/writes/requires/produces/invalidates, mutation path, revisions,
  deterministic validator, proof, failure, undo/replay, reproducibility,
  rights/privacy/egress/injection policy, cost/latency and final consumer.
- Every executable Stage-2 node selects exactly one `selectedOperatorId`.
  Non-executed choices belong in `alternativeOperatorIds`; multi-tool edits use
  multiple dependency-linked nodes.
- Stage-4 lowering is a generic mechanical binder. It fills exact arguments,
  coordinate conversions, revisions, typed input/output references and receipt
  bindings from operator schemas. It must add **zero** catalog operations and
  drop **zero** model-selected operations. It is a checker/binder, not a hidden
  planner or creative repair system.
- Keep target reconstruction, native/generated/hybrid routing, evidence
  binding, exact compilation, capability-gap behavior, isolated execution and
  blind rendered review as separately scored stages.
- Preserve raw model output. Never substitute a canonical hand-authored graph,
  evaluator-approved handoff or task-specific compiler topology and then call
  the result model success.
- Freeze evaluator policy before provider calls; give every provider equivalent
  information and fair per-attempt token/time budgets. `PASS`, `FAIL`,
  `UNVERIFIABLE` and capability gap remain distinct.
- Do not implement production model mutation until fair connected native,
  generated and hybrid trials prove the premise. A research proxy may never
  become a second timeline or project authority.

### Production truth and no-handwaving rule

For every architecture or capability claim, trace and cite:

```text
caller -> decision owner -> resolver/form owner -> mutation owner
       -> stored state/revision -> editor/renderer -> visible/audible proof
```

Also state input/output schemas, support status, failure disposition,
undo/replay, rights/privacy policy and certification boundary. If any link is
missing, say `PARTIAL`, `NOT_WIRED`, `UNVERIFIABLE` or `MISSING`; do not bridge
the gap with prose. Knowledge entries, Adobe feature names, model familiarity,
passing unit tests and one attractive render are not production certification.

Missing deterministic capabilities remain real work even when a model knows
how they should behave. Implement and certify the professional timeline,
multicam, masks/mattes/tracking, colour management, professional audio,
interchange/conform, VFX pulls, mastering/QC, collaboration and archive paths.
Do not let generated code shadow those native owners.

### Mandatory handoff footer

End every implementation/status handoff with these four plain-language lines:

```text
Result: what the user can now rely on.
Scope: exact files/systems changed.
Will not touch: explicit preserved areas and authorities.
Proof: tests, rendered evidence or reproducible checks.
```

## 6. The knowledge base — `docs/agents/`
Migrated from the prior Claude-Code sessions. Layout:
- **`docs/agents/sessions/<workstream>/`** — numbered session logs: **`editron/` (45)**, `uiux/` (4), `thinkforge/` (2), `general/` (21 daily/cross-cutting). Files named `Editron-NN-<original>.md`. **Index + summaries: `docs/agents/SESSION-INDEX.md`.** The most recent Editron work = **Editron-44** (dials/timeline/FORM-truth) and this migration session (Editron-46, below).
- **`docs/agents/reference/<workstream>/`** — non-session knowledge (visions, audits, specs, `UIUX_RULES.md`, `prompt_engineering_methodology.md`, feedback/lessons). 114 files.
- **`docs/agents/vault/`** — distilled architecture/decisions/bugs/roadmap/research (72 files; the Obsidian "second brain"). Start at `vault/00-Index.md`.

## 7. Constraints (from the previous agent's `CLAUDE.md` — apply these)
- **Phased execution:** multi-file changes in explicit phases, **≤5 files/phase**, wait for approval between phases.
- **Forced verification:** never report "done" without `npx tsc --noEmit` (+ `pnpm lint`); fix new errors. Prefer verifying on **real data/the real path**, not code-reading (3 code-read hypotheses were overturned by real-data checks in the latest session).
- **Edit safety:** re-read a file immediately before editing; when renaming, grep every reference kind (calls, types, strings, dynamic imports, re-exports, tests).
- **Motion Graphics Rule 11:** don't reduce MGs to named template components; the system should *generate* form, not select presets.
- **Single form owner:** before adding or changing any planner/resolver/composer/renderer, grep for the existing owner of that overlay family. Planners may rank, license, reject, normalize atoms/signals, and attach audit metadata, but must not duplicate final form logic already owned by atomic resolvers/composers/renderers (duration, keyframes, scale, blur, style, SFX token, asset query, layout, typography, animation form). If a field looks like final render form, cite the owning resolver and prove it is only an input alias/evidence, or move it to the owner.
- **No unsolicited branches/worktrees:** never create a new local branch, remote branch, git worktree, temporary push branch, or detached push lane unless the user explicitly requested it in that turn or you ask first and receive approval. If branch isolation seems safer, explain the risk and request permission before running `git switch -c`, `git branch`, `git worktree add`, or any push that targets a branch other than the currently approved branch.
- **Footguns:** never `git add scripts/` or `-A` (untracked dev probes + `.calibration-temp/`); `.env.local*` hold **real secrets** (do not commit/print); push to **origin only**.

## 8. Historical git-state snapshot

> This section is dated migration history. Always run `git status`,
> `git branch --show-current`, `git rev-parse HEAD` and `git worktree list`
> before reporting current repository truth.
- Branch `infrastructure-improvs-+Editron`, **ahead of origin by 1** — local commit **`d3991d02`** (zoom pull-back keyframe fix; verified, unit-tested) is **unpushed**.
- Working tree otherwise: untracked dev probes in `scripts/` + `.calibration-temp/` + (new) `docs/agents/` + this `AGENTS.md`. No other tracked modifications.

## 9. Current first steps for Codex

1. Read this file and the authoritative current ledger in
   `docs/EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md`; open older session/vault
   documents only as supporting evidence.
2. Reproduce repository/worktree truth and run proportionate verification. Do
   not trust the historical status tables above.
3. Commit `eaef92685` wires the exact `d42c1af5b` registration owner into the
   remote-URL source canonicalizer and derived-frame sampler with content-
   addressed object identities. Next, canonicalize or safely promote existing
   uploaded/YouTube/Instagram asset sources through that same owner and make
   the main analysis worker sample only the returned canonical identity. Do not
   claim all reference materializers are wired until those paths pass.
4. Compose the existing canonical-media, CreditsService guard, isolated
   ProjectService clone, native dispatcher, proof and live transport owners
   behind the definition-bound execution owner; only then export the signed
   route and run non-production Atlas/QStash crash-redelivery proof. Paid model
   or render work still requires a fresh zero-inference preflight and explicit
   approval.

Fail-closed internal-worker authentication, IF1 runtime migration, timebase and
stale-writer safety are production-risk interrupts. They must be resolved
before deployment or production-replacement claims even while research slices
continue.

## 10. Largest / riskiest files (refactor backlog)
`lib/editron/agent/tools.ts` (5,232) · `lib/editron/agent/director-agent.ts` (2,758) · `lib/thinkforge/services/db.ts` (2,753) · `components/dashboard/ThinkForge/ExportToEditronDialog.tsx` (2,554) · `lib/editron/services/edl-executor.ts` (1,447). **Dead code:** `runAestheticGate` (`motion-graphics/engine/aesthetic-gate.ts:61`, 0 importers), `scoreGridPoint` (`engine/utility-scorer.ts:150`, test-only).
