---
name: Session Handover — April 22, 2026
description: READ FIRST in new session. Complete state of what was done, what's broken, what's next. Expires when work items are completed.
type: project
originSessionId: a103e712-63c2-4153-8f03-b42473023a7a
---
# Session Handover — April 22, 2026

## INFRASTRUCTURE IDs (copy these into your context)
- **GitHub Repo:** `github.com/Insturix/Front-End` (origin)
- **Secondary remote:** `github.com/HAUNTING-EYES/insturix` (haunting)
- **Active branch:** `infrastructure-improvs-+Editron`
- **Vercel Project ID:** `prj_uAwH5pAHMWaOiRNbS7FZuejWXUuc`
- **Vercel Team:** `nimit-jains-projects-bd2b522e`
- **Vercel Preview domain:** `front-end-git-infrastructu-d46f86-nimit-jains-projects-bd2b522e.vercel.app`
- **GCP Project ID:** `insturix-493414` (migrated from `insturix-457914`)
- **GCS Bucket:** `insturix`
- **Cloudflare R2 Bucket:** `editron-cdn`, Worker: `editron-asset-proxy`
- **MongoDB Atlas DB:** `editron_prev` (preview branch — CORRECTED 2026-04-24, was wrongly listed as `insturix_preview`), `editron_prod` (production). Old `insturix_prod` has legacy data only. Check `MONGODB_DB_NAME` env var.
- **Upstash Redis:** render queue + rate limiting
- **Upstash QStash:** async job dispatch (video gen, audio gen, storyboard images, reference images, Director)
- **AWS Lambda (Remotion):** us-east-1, 10-min timeout, 4GB memory
- **User email:** jainnimit728@gmail.com

## CODE REVIEW GRAPH
Located at `.code-review-graph/graph.db` (SQLite). 20930 nodes, 58359 edges.
- Node kinds: Function, File, Class, Test
- Edge kinds: CALLS, CONTAINS, IMPORTS_FROM, TESTED_BY
- **LIMITATION:** does NOT track dynamic imports (`await import()`). Verify those with grep.
- Query with: `scripts/audit-orphans.py` or direct SQLite
- Use to verify: who calls what, orphan functions, import chains

## DOCS TO READ
1. `CLAUDE.md` (project root) — auto-loaded. Full architecture, file map, rules, key files.
2. `DIRECTOR_KNOWLEDGE_BASE.md` (project root) — 19,885 lines. KB rules for editing decisions (transitions, zooms, SFX, graphics, pacing). **MUST consult before creative decisions.**
3. `D:\google downloads\editron_master_v2.docx` — Master plan (696K chars, NOT in repo). Phase breakdown, architecture, roadmap.
4. `D:\google downloads\editron-prompts.md` — Prompt engineering reference.

## MEMORY FILES — READ IN ORDER
1. `AGENT_RULES.md` — MANDATORY every response. All rules.
2. `insturix_vision.md` — The north star. Rule-driven > probabilistic.
3. `feedback_audit_lessons.md` — 10 self-rules from audit. FOLLOW THEM.
4. `creative_production_knowledge.md` — Consult before ANY creative decision.
5. `commit_history_audit_2026_04_21.md` — Ground truth for what was built (475 commits mapped).
6. `editron_master_remaining.md` — Open items + priorities.
7. `system_architecture_map.md` — Pipeline flow, hasNativeAudio, profile system.
8. `editron_architecture_truth.md` — System state, vision, ROW layout.
9. `stable_v2_snapshot.md` — Editron v2.0 stable state (2026-04-14).
10. `pipeline_investigations.md` — Long-form investigation reports. Search before re-investigating.
11. `toyota_reliability_audit.md` — Failure mode catalog.
12. `resources.md` — APIs, models, keys, costs.
13. This file — current session state.

## BRANCH STATE
- **Branch:** `infrastructure-improvs-+Editron` at commit `6c27bcba`
- **Pushed:** yes, in sync with origin
- **Main merged:** yes (commit `6a2f08b1`)
- **Deployment:** dpl_9QqGiadXgL8sRp3taYt2ZdowYT3e on Vercel preview
- **.gitignore:** updated, IDE/agent config excluded
- **Untracked:** `scripts/migrate-gcs-to-r2.mjs` (staged, committed)

## WHAT WAS DONE THIS SESSION

### Bugs fixed (7 commits, all pushed)
| Commit | What | File(s) |
|--------|------|---------|
| `43b12bec` | Reference-image worker sent wrong params to Nano Banana (500s). buildModelInput didn't use adapter config. | `reference-image-service.ts` |
| `07943698` | Profile detection <30% fallback (patch, later replaced by `08c80d44`) | `profile-detection-service.ts` |
| `ab3758ec` | Separated pacing keywords from transitions. "rapid cuts" → pacing, not transition. Budget relaxed for ≤45s videos. | `llm-scene-parser.ts`, `decision-budget.ts` |
| `637c2ef2` | EDL decisions sorted by confidence (best-first). Script on-screen text bypasses budget. | `edl-executor.ts` |
| `29473979` | Subject-track strategy added to intent translator waterfall. Matches subject bounding boxes from 5-Track. | `intent-translator.ts` |
| `08c80d44` | Profile detection: LLM category as BOOST (+0.25), not filter. Scores all 54 profiles always. -42 lines. | `profile-detection-service.ts` |
| `6c27bcba` | Director maxDuration 120→300s. Gemini creative-intent call bottleneck verified at 61s. | `director/execute/route.ts` |

### Analysis done (no code changes)
- **475-commit audit** completed in `commit_history_audit_2026_04_21.md`
- **Post-4.7 audit** (April 16-21): 46 commits reviewed by 2 sub-agents. 2 bugs found (both already fixed). All commits production-safe.
- **Vision alignment check**: 80% aligned, 20% needs correction (see below).
- **McDonald's project deep analysis** (`proj_vGGN9Sva5Yiw`): 7 failures identified, 5 fixed this session.

## WHAT'S STILL BROKEN (from McDonald's test)

### 1. KB M-002 not implemented in Director add_transition
DIRECTOR_KNOWLEDGE_BASE.md Rule M-002: "Montage sub-shots use hard-cut internally. Montage ENTERS and EXITS with dissolve/dip-to-black."

Currently: Director `add_transition` (director-agent.ts:943-1057) doesn't distinguish montage-internal boundaries from scene boundaries. Both fall to profile default. Need to add: if clipA and clipB are in SAME scene (montage sub-shots) → hard-cut. If DIFFERENT scenes → use script transition or profile default.

### 2. SFX returning null
All sfx-trigger EDL decisions returned null in McDonald's project. The EDL executor tries whoosh/pop/ding/bass-hit/riser but nothing resolves. Need to investigate: is the SFX prefetch path running? Are Freesound queries matching? Is the SFX cache populated?

### 3. Only 1 voiceover generated
Script has VO in Scene 2 AND Scene 3 but only 1 VO overlay exists. Need to check: did parser merge narration into fewer scenes? Did TTS only generate for one? Check storyboard doc in MongoDB.

### 4. Director should be QStash worker (long-term)
Currently: browser POST and QStash both hit the same route with 300s limit. Long-term: dedicated `/api/internal/workers/director/route.ts` with QStash verification. Browser route returns immediately with "Director running in background."

## ARCHITECTURAL ISSUES FLAGGED (not yet fixed)

### 1. Transition dedup (236 lines) is a band-aid
`eca8daed` added `dedupTransitionsByClipPair()` to director-agent.ts. This exists because Creative Intent AND Director both generate transitions. The RIGHT fix: Creative Intent should NOT generate transitions (only zooms/graphics/timing). Transitions owned by: script (parser) + profile default (Director). Delete intent-translator transition generation + delete dedup.

**BUT**: verify this against DIRECTOR_KNOWLEDGE_BASE.md first. KB rules T-* define transition logic. Check if Creative Intent needs to generate transitions for KB compliance.

### 2. Sync BGM path in finalize
`8efc06df` added 122 lines of synchronous BGM generation in finalize for beat-sync. Not deliberated per Rule 17N. Alternative: run beat detection in audio worker AFTER async BGM completes. Lower risk, no timeout concern.

### 3. `dd758500` caption fallback removal
Removed `createCaptionsFromScriptText` (128 lines). EDL is now sole owner of on-screen text rendering. But EDL budget CAN reject graphics. The `637c2ef2` fix (script text bypasses budget) partially addresses this, but needs verification that ALL script on-screen text now renders.

## SYSTEMS STATUS

### Orphan services (not wired)
| Service | What it does | Wire plan |
|---------|-------------|-----------|
| `asset-search-service.ts` (138 lines) | Semantic search over user media. `findMatchingFootage()` for Director step-0. | Wire into Director as step-0: search before generate. 1 week. |
| `continuity-service.ts` (179 lines) | Scene-pair continuity scoring. Recommends transition type. | Wire into Director step-4. Feed into transition-sfx-placer. 3-5 days. |
| `universal-analysis.ts` (295 lines) | Cross-service analysis interface. | DON'T wire — Graphiti obsoletes this. Delete when Graphiti lands. |

### Systems verified as working
- 5-Track analysis: pre-caches in video worker, 14 consumers verified
- Asset briefing: compresses to ~200 tokens, slop detection works
- Intent translator: waterfall now includes subject-track strategy
- Decision budget: confidence-sorted, short-form adjusted
- Profile detection: scores all 54 profiles, category as boost
- Transition keyword extraction: pacing separated from transitions
- Auto-post-processing: drift-zoom + screen zones + SFX map
- Quality review: 12 deterministic checks

### Things that work but are underused
- Style transfer (wired via AI chat, no UI button)
- Auto-edit Mode 2 (wired via AI chat, no UI button)
- Motion graphics (tight match criteria, needs deliberation — see editron_master_remaining.md SECTION 3b)
- Cinematic moment detector (used in reactive fallback only, not Creative Intent primary path)
- Beat-sync (gated behind beatSyncActive flag, works when triggered)

## NEXT PRIORITIES (user confirmed)

1. **Fix remaining McDonald's issues** (KB M-002, SFX null, VO count)
2. **Wire orphan services** (asset-search as Director step-0, continuity as step-4)
3. **Profile semantic embeddings** (54 profiles embedded, cosine vs script)
4. **Graphiti brainstorm** (brand vault + per-project asset graph)
5. **Merge to main** (after testing passes)

## PR PLAN (user approved)
- PR-A: Phase D Infra + R2 + CI/CD (includes `.github/workflows/ci.yml`)
- PR-B: Phase B Intelligence + Unified Engine + 3-Layer rewrite
- PR-C: S-16 through S-29 ship-prep (current sprint)
- PR-D: Misc (Director polish, cinema prompts, Seedance, profile detection)

Note: main has NO `.github/` folder. Our branch introduced CI. PR-A must land first. 92 TS errors in non-Editron files are pre-existing on main (not our blocker). ~11 errors are ours (universal-analysis × 5, creditCosts × 1, StoryboardWorkspace × 4, StoryboardingMode × 1).

## RULES THE PREVIOUS SESSION VIOLATED (learn from these)

1. **Rule 10N (No Assumptions)**: Made claims about duplicates/orphans without reading the files. Corrected after user pushed back.
2. **Rule 15 (Consult Creative Knowledge)**: Did NOT read DIRECTOR_KNOWLEDGE_BASE.md before making pacing/transition split fix. KB M-002 has the exact rule needed.
3. **Rule 17N (Deliberate)**: Proposed fixes without comparing alternatives. Multiple times.
4. **Rule 19N (Domain Expert Check)**: Skipped "would a film editor do it this way?" on several suggestions.
5. **Rule 6N (Deep Dive Before Fixing)**: Rushed to suggest causes without tracing code paths fully.
6. **Rule 21N (Update commit audit)**: Forgot once after merging main. Fixed after self-catching.
7. **Rule A3 (Don't change values reactively)**: Verified before bumping Director timeout (bottleneck is Gemini LLM, not architecture).

## TEST PROJECT
- **Project ID:** `proj_vGGN9Sva5Yiw`
- **Script:** "Golden Arches of Memory: A Taste of Childhood" — McDonald's nostalgic 30s brand ad
- **Profile:** E-04 (Origin Story / Brand Narrative) — film-portra, dissolve, slow pacing
- **Video model:** Kling 2.1 (user selected)
- **Image model:** Nano Banana (user selected)
- **Scenes:** 3 script scenes → 17 sub-shots (parser decomposed montage)
- **Storyboard DB ID:** check via `scripts/debug-proj.mjs` or MongoDB query
- **Vercel log export:** `D:\google downloads\front-end-log-export-2026-04-21T18-04-13.csv`
- **Issues found:** see "WHAT'S STILL BROKEN" section above

## KEY FILES (quick reference)
| What | Path |
|------|------|
| Editor entry | `components/editron/editor/version-7.0.0/react-video-editor.tsx` |
| All overlay types | `components/editron/editor/version-7.0.0/types.ts` |
| AI chat tools (35+) | `lib/editron/agent/tools.ts` |
| Director Agent | `lib/editron/agent/director-agent.ts` (1462 lines) |
| 5-Track Analysis | `lib/editron/services/five-track-analysis.ts` |
| Asset Briefing | `lib/editron/services/asset-briefing.ts` |
| Intent Translator | `lib/editron/services/intent-translator.ts` |
| Unified Intelligence | `lib/editron/services/unified-edit-intelligence.ts` (1201 lines) |
| EDL Executor | `lib/editron/services/edl-executor.ts` |
| Decision Budget | `lib/editron/services/decision-budget.ts` |
| Auto Post-Processing | `lib/editron/services/auto-post-processing.ts` |
| Transition SFX Placer | `lib/editron/services/transition-sfx-placer.ts` |
| Profile Detection | `lib/editron/services/profile-detection-service.ts` |
| Quality Review | `lib/editron/services/quality-review-service.ts` |
| 54 Edit Profiles | `lib/editron/data/edit-profiles.ts` |
| Scene Parser | `lib/pipeline/llm-scene-parser.ts` (hottest file — 70+ commits) |
| Finalize Route | `app/api/services/pipeline/storyboard/[id]/finalize/route.ts` (1059 lines) |
| Video Worker | `app/api/internal/workers/pipeline/video/route.ts` |
| Audio Worker | `app/api/internal/workers/pipeline/audio/route.ts` |
| Director Route | `app/api/services/editron/director/execute/route.ts` |
| Storyboard Service | `lib/pipeline/storyboard-service.ts` |
| Reference Image Service | `lib/pipeline/reference-image-service.ts` |
| Image Model Configs | `lib/pipeline/adapters/image-model-configs.ts` |
| Video Model Configs | `lib/pipeline/adapters/video-model-configs.ts` |
| Editron Config | `lib/editron/config/editron-config.ts` |
| ROW Constants | `lib/pipeline/scene-to-editron.ts` (ROW.SFX=0, BGM=1, VIDEO=2, VO=3, CAPTIONS=4, TRANSITIONS=5, GRAPHICS=6) |
| MongoDB Connection | `lib/editron/db/mongodb.ts` |
| R2 Service | `lib/editron/services/r2-service.ts` |
| Upload Service | `lib/editron/services/upload-service.ts` |

## EXTERNAL SERVICES
| Service | Used For | Critical? |
|---------|----------|-----------|
| **fal.ai** | Video gen, image gen, TTS (Kokoro), BGM (CassetteAI), SFX (mirelo) | YES |
| **Google Gemini** | Parsing (3.1-flash-lite), AI chat (2.0 Flash), Vision (5-Track), creative intent | YES |
| **Deepgram** | TTS fallback, transcription, speech verification (S-29) | MEDIUM |
| **Freesound** | SFX library search | MEDIUM |
| **LottieFiles** | Motion graphics search (GraphQL) | LOW |

## VIDEO MODELS (5 active)
| Model | Endpoint | Audio | Max Duration |
|-------|----------|-------|-------------|
| Kling 2.1 Pro | fal-ai/kling-video/v2.1/pro/image-to-video | No | 10s |
| Kling 2.6 Pro | fal-ai/kling-video/v2.6/pro/image-to-video | No | 10s |
| Seedance 1.5 Pro | fal-ai/seedance-1.5-pro | Native audio | 12s |
| Seedance 2.0 | fal-ai/seedance-2.0 | Best audio | 15s |
| Veo 3.1 | fal-ai/veo-3.1 | No | 8s |

## USER CONTEXT

- User is Nimit (jainnimit728@gmail.com), founder/CTO of Insturix
- ~1 month runway, clients waiting
- Frustrated with long text responses — keep it SHORT
- Frustrated with rule violations — FOLLOW EVERY RULE EVERY TIME
- Switched from Opus 4.7 to Opus 4.6 mid-session ("4.7 is all talk no do")
- Testing McDonald's "Golden Arches of Memory" script as benchmark
- Wants to merge to main after testing passes
- Wants to brainstorm Graphiti after merge
- Values: rule-driven > probabilistic, simple > clever, verify > assume
