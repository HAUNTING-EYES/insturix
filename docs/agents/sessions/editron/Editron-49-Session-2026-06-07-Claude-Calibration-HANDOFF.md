# Editron 49 - Claude Code Calibration Handoff

Date: 2026-06-07
Audience: Claude Code or another long-running operator agent
Repo root: `D:\google downloads\Front-End-main\editron-worktree`

## Mission

Run Editron reference calibration as an operations loop, not as a new architecture project.

The current engineering direction is:

```
primitive atoms + relations + rhythm + screen context + brand taste + learned references
  -> form + timing + placement + overlay bundle
```

Not:

```
LLM/menu/label -> preset
```

Your job is to process reference videos, produce calibration evidence, identify failure clusters, and report which existing signals/curves/resolver coefficients should be tuned. Do not add a hidden preset layer, new scorer menu, or separate SFX database.

## Read First

Read these before running or editing anything:

- `AGENTS.md`
- `docs/agents/SESSION-INDEX.md`
- `docs/agents/vault/02-Architecture/Editron-Signals-Source-of-Truth.md`
- `docs/agents/vault/07-Roadmap/MG-Automated-Eval-Calibration-Plan-2026-06-03.md`
- `docs/agents/sessions/editron/Editron-47-Session-2026-06-04-Atomic-Overlay-Upload-To-Edit-PreCalibration.md`
- `docs/agents/sessions/editron/Editron-48-Session-2026-06-04-VJEPA-Atoms-Moment-Bundles-TODO.md`
- `docs/agents/reference/editron/editron_atomic_overlay_final_plan_2026_06_07.md`
- `docs/agents/reference/editron/editron_mechanical_roadmap_2026_06_07.md`

## Current State

Upload-to-edit live path:

```
project-dashboard.tsx
  -> /api/services/editron/media/upload/url
  -> /api/services/editron/media/upload
  -> /api/services/editron/auto-edit/from-asset
  -> /api/internal/workers/video-analysis
  -> /api/internal/workers/tribe-analysis when available
  -> director-agent.ts
  -> Path E creative brief when USE_CREATIVE_BRIEF=true
  -> brief-executor.ts
  -> edl-executor.ts
  -> editor/render layers
```

Important: live upload-to-edit is mostly Path E when `USE_CREATIVE_BRIEF=true`, but both Path E and Path D converge in `executeEDL(...)`. Calibration must therefore judge the final generated moment bundle, not only Path D utility scorer labels.

Recent SFX state:

- `lib/editron/services/sfx-form.ts` resolves SFX from primitive atoms into intent/timing/mix/asset constraints.
- It now exposes primitive atoms: transient, tail, tone, rhythm, mix, role, policy.
- `lib/pipeline/sfx-library-service.ts` uses provider API candidates, currently Freesound, and materializes only accepted candidates through `uploadMedia(...)`.
- `uploadMedia(...)` is Cloudflare R2-first when R2 env is configured, with GCS fallback.
- `lib/editron/services/moment-bundle-grammar.ts` can emit ready SFX intent/form without selecting/downloading an asset.
- SFX provider APIs supply candidates only. The atom system decides fit.

## Existing Calibration Entry Points

Main runner:

```powershell
npm run calibrate:editron -- --dry-run --limit 1
npm run calibrate:editron -- --labels energetic-vlog,tech-review-premium --dry-run
npm run calibrate:editron -- --url <youtube-url> --label <label> --dry-run
npm run calibrate:editron -- --local-file ".calibration-temp/example.mp4" --label manual --dry-run
```

Package scripts:

- `calibrate:editron`: `tsx scripts/calibrate/calibrate.ts`
- `calibrate:editron:auto`: `tsx scripts/calibrate/calibrate.ts --shuffle`

Reference manifest:

- `scripts/calibrate/reference-videos.json`

Current manifest already includes a broad spread: Iman Gadzhi, MrBeast, Casey Neistat, Veritasium, Kurzgesagt, Fireship, Johnny Harris, Mark Rober, Dude Perfect, MKBHD, Linus Tech Tips, Corridor Crew, Ali Abdaal, ColdFusion, Peter McKinnon, Vox, Yes Theory, Ryan Trahan, Apple, Sam Kolder.

Rendered aesthetic harness:

```powershell
npx tsx scripts/render-editron-aesthetic.ts --help
```

Relevant tests:

```powershell
npx vitest run tests\editron\moment-bundle-calibration.test.ts tests\editron\moment-bundle-grammar.test.ts tests\editron\sfx-form.test.ts tests\editron\sfx-library-service.test.ts tests\editron\rendered-aesthetic.test.ts tests\editron\rendered-aesthetic-harness.test.ts tests\editron\vjepa-service.test.ts tests\editron\vjepa-coverage-audit.test.ts tests\editron\signal-registry-vjepa-primitives.test.ts tests\editron\overlay-bridge-vjepa-signals.test.ts
```

## Environment And Local Tools

Calibration runner expects:

- `MONGODB_URI`
- `GOOGLE_CLOUD_CREDENTIALS`
- `GCS_BUCKET_NAME`
- `MODAL_TOKEN_ID`
- `MODAL_TOKEN_SECRET`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- `FAL_AI_API_KEY` or `FAL_KEY`
- `XAI_API_KEY` optional for Grok STT
- `FREESOUND_API_KEY` for SFX candidate lookup
- R2 storage when available: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, optional `R2_BUCKET_NAME`, `CDN_WORKER_URL`

Local binaries likely needed:

- `yt-dlp`
- `ffprobe` / ffmpeg

Cache/output hygiene:

- Use `.calibration-temp/` or `C:\tmp\editron-calibration\`.
- Do not commit downloaded videos, rendered frame dumps, huge JSON logs, or API outputs unless explicitly requested.
- If adding report artifacts, keep them small and text/JSON summary oriented.

## Calibration Goal

Do not optimize for "same label." Optimize for the whole editorial moment:

```
what is being said
+ speech intensity
+ beat/rhythm
+ visual context / subject / negative space
+ viewer eye target
+ brand restraint
-> MG + caption + zoom + transition + SFX + pacing on the same emotional beat
```

For every reference/generation comparison, record:

- Did the system place the right families on the same beat?
- Did MG/caption/zoom/transition/SFX feel coordinated?
- Did V-JEPA primitives improve placement/form or only exist as metadata?
- Did captions/text remain legible and aesthetically sane?
- Did SFX fit tone/timing or feel random/API-ish?
- Did the rendered aesthetic harness catch visible failures?
- Which exact signal/curve/resolver parameter appears responsible?

## Suggested Work Plan

1. Smoke-test calibration infra.
   - Run one short dry run with `--limit 1`.
   - If it fails, fix only the runner/runtime issue needed to get a dry run completing.
   - Record env/tool missing errors separately from code bugs.

2. Expand/validate reference manifest.
   - Keep the existing broad creator set.
   - Add only if a major class is missing: vertical short-form caption-heavy, podcast/talking-head, SaaS/product-demo screen recording, high-end ad/commercial.
   - Avoid overfitting to Iman/MrBeast style. They are important, not the entire target.

3. Run dry-run batches first.
   - Example:
     `npm run calibrate:editron -- --labels energetic-vlog,tech-review-premium,documentary-explainer --dry-run`
   - Confirm V-JEPA primitive coverage logs: motionVector, mainSubject, textBoxes, negativeSpace, objectCount, faceCount.
   - Confirm no bandit writes during dry runs.

4. Produce calibration report.
   - Store a small report under `docs/agents/reference/editron/` or `docs/agents/sessions/editron/`.
   - Include per-video rows and aggregate clusters.
   - Prefer specific file/param references over general complaints.

5. Only then consider non-dry-run bandit update.
   - Do not update production-like bandit state until dry-run evidence is reviewed.
   - If unsure, stop at report.

## Report Format Requested

Create a markdown report with these sections:

### Run Metadata

- date/time
- git branch/commit/worktree dirty summary
- command(s)
- env/tool availability summary
- videos attempted/completed/failed

### Reference Coverage

Table columns:

- label
- creator/style
- duration
- analysis success
- V-JEPA primitive coverage
- transcript success
- rendered aesthetic success
- notes

### Failure Clusters

Use these categories:

- MG form/timing
- caption/text legibility and style
- zoom/frame movement
- transition form/timing
- SFX intent/timing/source quality
- pacing/cut density
- V-JEPA placement/form influence
- rendered aesthetic false positives/false negatives
- calibration runner/runtime failures

Each cluster should include:

- observed issue
- example video/frames
- likely source files
- likely parameters/signals
- confidence
- recommended code change

### Tuning Targets

Map recommendations to actual files:

- `lib/editron/engine/overlay-definitions.json`
- `lib/editron/data/threshold-registry.ts`
- `lib/editron/services/zoom-form.ts`
- `lib/editron/services/transition-form.ts`
- `lib/editron/services/sfx-form.ts`
- `lib/editron/services/moment-bundle.ts`
- `lib/editron/services/moment-bundle-grammar.ts`
- MG recipe/decision modules under `lib/editron/motion-graphics/engine/`
- rendered aesthetic modules under `lib/editron/motion-graphics/engine/eval/`

### Do Not Change

Explicitly list any tempting but rejected changes:

- no preset menu layer
- no LLM choosing exact frames/placements/assets
- no local SFX database as primary search path
- no tuning only Path D if Path E bypasses it
- no judging labels without visual/render evidence

## Current Verification Snapshot Before Handoff

Most recent focused verification passed:

```powershell
npx vitest run tests\editron\sfx-form.test.ts tests\editron\sfx-library-service.test.ts tests\editron\edl-atomic-sfx-form.test.ts tests\editron\non-mg-overlay-atomic-receipts.test.ts tests\editron\moment-bundle.test.ts tests\editron\moment-bundle-grammar.test.ts tests\editron\moment-bundle-calibration.test.ts tests\editron\atomic-overlay-aesthetic.test.ts tests\editron\rendered-aesthetic.test.ts tests\editron\rendered-aesthetic-harness.test.ts tests\editron\vjepa-service.test.ts tests\editron\vjepa-coverage-audit.test.ts tests\editron\signal-registry-vjepa-primitives.test.ts tests\editron\overlay-bridge-vjepa-signals.test.ts
```

Result: 14 test files, 52 tests passed.

Touched-file TypeScript filter passed for SFX/moment grammar files.

Scoped ESLint passed for touched files.

Known ambient repo issues remain:

- Full `npx tsc --noEmit` fails on unrelated mailing, ThinkForge, UploaderX, scripts, etc.
- Full `npx eslint . --quiet` fails on unrelated lint issues in `remotion.config.ts`, migration scripts, `tailwind.config.ts`, `test-r2.cjs`, and `scripts/test-numeric-detection.ts`.

Do not block calibration on those ambient failures unless they directly break the calibration runner.

## Operational Warnings

- Some reference YouTube downloads may fail due to availability, region, age, or yt-dlp issues. Mark as source failure, do not silently replace with a different kind of video.
- If Modal/V-JEPA is deployed but stale, record primitive coverage before assuming code is wrong.
- Calibration may take a long time and spend API/GPU quota. Start with `--dry-run --limit 1`.
- If downloads or generated outputs are huge, keep them out of git.
- If the runner needs code fixes, keep each fix narrowly scoped and verify with the relevant tests.

## Final Deliverable Back To Codex

Bring back:

1. The calibration report path.
2. Exact commands run.
3. Which videos completed/failed.
4. Top 5 failure clusters.
5. Exact recommended code changes by file/parameter.
6. Any runner bugs fixed.
7. Whether non-dry-run bandit updates were performed.

The next Codex coding pass should use that evidence to patch resolver weights, curves, thresholds, and aesthetic checks.
