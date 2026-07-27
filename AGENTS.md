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

## 4. Build & verify — current status (measured 2026-06-04)
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

## 8. Current git state
- Branch `infrastructure-improvs-+Editron`, **ahead of origin by 1** — local commit **`d3991d02`** (zoom pull-back keyframe fix; verified, unit-tested) is **unpushed**.
- Working tree otherwise: untracked dev probes in `scripts/` + `.calibration-temp/` + (new) `docs/agents/` + this `AGENTS.md`. No other tracked modifications.

## 9. Recommended first steps for Codex
1. Read this file, then `docs/agents/SESSION-INDEX.md`, then `docs/agents/vault/00-Index.md` + `vault/02-Architecture/MG-Overlay-Infrastructure-Complete-Map-2026-06-03.md`.
2. Reproduce status: `npx tsc --noEmit`, `pnpm lint`, `pnpm test`.
3. **Quick win:** fix `lib/thinkforge/agents/script-section-agent.ts` curly quotes (unblocks tsc; 1 file, low risk).
4. Decide whether to push `d3991d02`.
5. **Wait for explicit approval** before: the Phase-4 generative FORM engine, decomposing `lib/editron/agent/tools.ts` (5,232 LOC), or any multi-file refactor.

## 10. Largest / riskiest files (refactor backlog)
`lib/editron/agent/tools.ts` (5,232) · `lib/editron/agent/director-agent.ts` (2,758) · `lib/thinkforge/services/db.ts` (2,753) · `components/dashboard/ThinkForge/ExportToEditronDialog.tsx` (2,554) · `lib/editron/services/edl-executor.ts` (1,447). **Dead code:** `runAestheticGate` (`motion-graphics/engine/aesthetic-gate.ts:61`, 0 importers), `scoreGridPoint` (`engine/utility-scorer.ts:150`, test-only).
