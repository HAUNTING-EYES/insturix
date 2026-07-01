---
name: Session Handover — 2026-04-27 (UPDATED — ThinkForge V2 sprint complete)
description: ThinkForge V2 sprint shipped: 4 bugs fixed, credit checks, Zod validation, SceneBlock+EditorialBlock architecture, brand DNA flow, save-time validation. All on infrastructure-improvs-+Editron.
type: project
originSessionId: 6342a39e-a0a7-4607-a725-4f31258ab8d2
---
# Session Handover — April 27, 2026

## READ FIRST (in order)
1. `memory/MEMORY.md` — full index of all memory files
2. `memory/AGENT_RULES.md` — ALL rules (0-24N). Rule 24N is NEW (never trigger production deploys)
3. `memory/insturix_vision.md` — north star vision. Insturix replaces Adobe/DaVinci. Automatic car model.
4. `memory/feedback_audit_lessons.md` — 10 self-rules from 4-week audit. Config≠code, verify ALL code paths.
5. `memory/system_architecture_map.md` — complete pipeline reference
6. `memory/editron_architecture_truth.md` — system state, vision, rules, ROW layout
7. `memory/creative_doc_graph_vision.md` — creative doc as living knowledge graph
8. `memory/project_brand_scoping.md` — agencies need brand-scoped Graphiti (groupId=brandId)
9. `memory/project_rebrand.md` — UI rebrand coming, don't polish current UI
10. `memory/project_parallel_branches.md` — worktree setup, NEVER git checkout

## MANDATORY DOCUMENTS
- `docs/KNOWLEDGE_GRAPH_ARCHITECTURE.md` — 13-section graph design doc (Neo4j + Graphiti)
- `docs/creative-production-knowledge-v2.pdf` — 37 pages, 12 sections. "Menus not rules" philosophy.
- `docs/INSTURIX_VISION.pdf` — vision document
- `CLAUDE.md` (repo root) — complete project context, 15 sections
- `DIRECTOR_KNOWLEDGE_BASE.md` (repo root) — 19,885 lines of editing rules

## GRAPHS & TOOLS
- **Graphify** — AST-based code knowledge graph at `graphify-out/graph.json` (19,340 nodes, 33,075 edges). Query with `/graphify query "..."`. Rule 22N mandates querying before editing.
- **Neo4j Aura** — Runtime knowledge graph. 54 Profile nodes seeded. Connection verified working from local.
- **Graphiti** — Python episodic knowledge graph (graphiti-core). Worker at `app/api/internal/workers/graphiti-episode/route.py`.
- **GSTACK skills** — `/review`, `/ship`, `/investigate`, `/qa`, `/browse`, `/office-hours`, `/design-consultation`, etc. See CLAUDE.md for full list. Rule: use `/review` before shipping, `/investigate` for bugs.

## PHASE STATUS (complete map)
```
Phase 0: Pipeline Foundation           ✅ DONE
Phase 1-2: Edit Intelligence           ✅ DONE
Phase P7: Advanced Editing             ✅ BACKEND DONE (UI partial)
Phase A: Stability                     ✅ DONE
Phase B: Intelligence Backbone         ✅ DONE
Phase D: Infrastructure                ✅ CODE COMPLETE

Knowledge Graph Phase 1: Foundation    ✅ DONE (this session)
Knowledge Graph Phase 2: Project Intel ✅ DONE (this session)
Knowledge Graph Phase 3: Graphiti      ✅ INFRA DONE, triggers pending
Knowledge Graph Phase 4: Pipeline Intel ✅ DONE (this session)

Phase C: Asset-Centric Architecture    ✅ MOSTLY DONE
  C1: Asset Library Panel              ✅ EXISTS (LocalMediaGallery)
  C2: Asset Analysis on Ingest         ✅ DONE (graph does this)
  C3: Segment Extraction               ✅ EXISTS (segment-extractor.tsx)
  C4: Semantic Segment Search          ✅ DONE (graph vector search)
  C5: Chapter-Based Rendering          ✅ WIRED (render route lines 58-78)

Phase D Pro: Professional Grade        ❌ NOT STARTED
Phase E: Scale & Distribution          ❌ NOT STARTED
Phase F: Screencast (OpenScreen)       ❌ NOT STARTED
Phase G: SaaS Motion Graphics          ❌ NOT STARTED
```

## KEY FILES CREATED/MODIFIED THIS SESSION
```
NEW:  lib/editron/db/neo4j.ts                              — Neo4j connection singleton
NEW:  lib/editron/services/graph-service.ts                 — Full graph service (928 lines)
NEW:  app/api/internal/workers/graph-sync/route.ts          — QStash worker (9 actions)
NEW:  app/api/internal/workers/graphiti-episode/route.py    — Python Graphiti worker
NEW:  app/api/internal/workers/graphiti-episode/requirements.txt
NEW:  app/api/services/editron/brands/route.ts              — Brand CRUD
NEW:  app/api/services/editron/brands/[brandId]/route.ts    — Brand update/delete
NEW:  scripts/seed-graph-profiles.ts                        — 54 profile seeder
NEW:  scripts/graphiti-test.py                              — Graphiti test (env vars only)
MOD:  lib/editron/services/asset-search-service.ts          — Neo4j primary, MongoDB fallback
MOD:  lib/editron/agent/director-agent.ts                   — Graph-sync + Graphiti dispatches
MOD:  lib/editron/services/profile-detection-service.ts     — (reverted client import)
MOD:  app/api/services/pipeline/storyboard/[id]/finalize/route.ts — Graph-sync + Graphiti
MOD:  app/api/services/editron/projects/[projectId]/save/route.ts — Overlay diff + overrides
MOD:  app/api/services/editron/media/upload/route.ts        — asset_created dispatch
MOD:  app/api/services/editron/media/search/route.ts        — Graph search primary
MOD:  app/api/internal/workers/asset-analysis/route.ts      — asset_enriched dispatch
MOD:  lib/uploaderx-storage.ts                              — UPLOADERX_R2_* prefix
```

## What This Session Built (12 commits)

### Knowledge Graph (Phases 1-4)
| Commit | What |
|--------|------|
| `868efe9a` | Phase 1: Neo4j connection, graph-service, graph-sync worker, upload/analysis wiring, asset-search rewrite |
| `a3aadf95` | Phase 2: finalize + Director graph-sync wiring, profile seed script |
| `051c9246` | Phase 3: Python Graphiti worker, episode dispatch + search |
| `c2668d13` | Phase 4: contextual scoring, Director queries Graphiti for transitions, Profile Detection queries Graphiti |
| `c6c8b588` | Fix: moved Graphiti profile boost to server-side (client bundle crash) |
| `7c777f71` | Phase C: media search API wired to graph-based search |
| `ee90eaef` | Brand CRUD + overlay diff edges + override tracking |
| `73c85656` | Review fixes: brand node corruption, embedding mismatch, resource leak |

### Other
| Commit | What |
|--------|------|
| `bbced672` | UploaderX R2 env var prefix (UPLOADERX_R2_BUCKET_NAME) |
| `1957672d` | Security: removed hardcoded API keys from graphiti-test.py |
| `5274b0fa` | Graph service reads GRAPH_GEMINI_API_KEY first |
| `bc751e38` | Empty commit (caused production deploy incident — see Rule 24N) |

## Infrastructure IDs

### Branch Structure — CRITICAL
```
YOUR BRANCH:  infrastructure-improvs-+Editron  (ALL Editron work goes here)
OTHER BRANCH: thinkforge-enhancementsV2        (ThinkForge work, separate Claude session)
PRODUCTION:   main                             (merged PRs only, Vercel production)
```

**Git worktree** — two directories, two branches, same repo:
```
D:\google downloads\Front-End-main\Front-End-main\     → infrastructure-improvs-+Editron (YOU WORK HERE)
D:\google downloads\Front-End-main\thinkforge-worktree\ → thinkforge-enhancementsV2 (OTHER SESSION)
```

**NEVER** run `git checkout`. Each directory is permanently locked to its branch.
**ALWAYS** push to both remotes: `git push haunting <branch> && git push origin <branch>`
**NEVER** trigger deploys programmatically (Rule 24N). Tell user to redeploy from Vercel dashboard.

### Neo4j Aura (NEW instance — created 2026-04-26)
- **Instance:** Instance02 / `8e902642`
- **URI:** `neo4j+s://8e902642.databases.neo4j.io`
- **Username:** `8e902642`
- **Password:** `D2wKzgXi0Gr4W5oSJuNG2gG-4Uju2d5clQWcZOHYCCY`
- **Database:** `8e902642`
- **Credentials file:** `D:\google downloads\Neo4j-8e902642-Created-2026-04-26.txt`
- **State:** 54 Profile nodes seeded. 0 Asset/Project/Scene (pipeline ran but Neo4j env vars were missing from Preview — just fixed)

### Vercel
- **Project ID:** `prj_uAwH5pAHMWaOiRNbS7FZuejWXUuc`
- **Team:** `nimit-jains-projects-bd2b522e` / `team_I1KWlM0rMN13dmFCVxzKSODS`
- **Git connected to:** `Insturix/Front-End` (origin)
- **Deploys triggered by:** `HAUNTING-EYES/insturix` (haunting remote)
- **Production branch:** `main`
- **Preview branch:** `infrastructure-improvs-+Editron`

### Vercel Env Vars — CRITICAL STATUS
**Production:** All keys set (GEMINI_API_KEY, GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GRAPH_GEMINI_API_KEY, NEO4J_*)
**Preview (infrastructure-improvs-+Editron):**
- NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE, GRAPH_GEMINI_API_KEY — **JUST ADDED, needs redeploy**
- GEMINI_API_KEY — **exists from Apr 17, was updated to new key**
- GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY — **CHECK if updated on Preview too**

**New Gemini API key:** `<redacted; set directly in Vercel/provider dashboard>`
**WARNING:** This key may also be flagged as leaked (it appeared in this chat). If still failing, user must generate a NEW key from Google Cloud Console and add directly via Vercel dashboard (NEVER paste in chat).

### MongoDB
- **Preview DB:** `editron_prev` (NOT `insturix_preview`)
- **Production DB:** `editron_prod`

### Git Worktree Setup
```
D:\google downloads\Front-End-main\Front-End-main\     → infrastructure-improvs-+Editron (Editron)
D:\google downloads\Front-End-main\thinkforge-worktree\ → thinkforge-enhancementsV2 (ThinkForge)
```
NEVER run `git checkout` to switch branches. Each directory is locked to its branch.

### Remotes
- `origin` = `github.com/Insturix/Front-End`
- `haunting` = `github.com/HAUNTING-EYES/insturix` (triggers Vercel deploys)
- Always push to BOTH: `git push haunting <branch> && git push origin <branch>`

## Bugs Found During Testing (NOT FIXED)

### Bug 1: Caption service tries to transcribe every video clip
- `add_captions` iterates all 17 video overlays and attempts transcription on each
- Should match video overlays to voiceover by scene index/time range
- Only 1 voiceover exists (`voiceover_D5g4l1FwJejQ`, 2600ms, 32 chars)
- Videos without voiceover fail: "No speech found in the selected video segment"
- File: `lib/editron/agent/director-agent.ts` add_captions case (~line 1100+)

### Bug 2: Beat alignment crash on Vercel
- `[AudioWorker] Beat alignment enhancement failed: libasound.so.2: cannot open shared object file`
- Essentia.js or similar native audio library not available on Vercel serverless
- File: audio worker beat detection path

### Bug 3: Neo4j graph-sync returning 503 (NOW FIXED — env vars added to Preview)
- All `project_created`, `scene_batch` calls failed
- Root cause: NEO4J_* env vars only existed on Production, not Preview
- Fix: env vars added to Preview for `infrastructure-improvs-+Editron` branch
- **NEEDS REDEPLOY** with no build cache to take effect
- QStash will auto-retry failed dispatches

## What's Left

### Immediate (before next pipeline test)
1. Redeploy Preview with no build cache (Neo4j env vars)
2. Verify Gemini API key works (may need fresh key from Google Cloud Console)
3. Run pipeline again → check Neo4j for Asset/Project/Scene nodes

### Knowledge Graph Remaining
- Overlay diff context enrichment (REMOVED_FROM edges have hardcoded neutral values)
- Brand entity as proper Neo4j node type (currently Graphiti episodes only)
- Caption/pacing override detection in save endpoint
- Graphiti episode batching (30s debounce for rapid edits)

### Pipeline Bugs
- Caption service video-to-voiceover matching (Bug 1 above)
- Beat alignment native library on Vercel (Bug 2)

### Future Phases
- Phase D Pro (color grading, audio FX, subject tracking)
- Phase E (scale, multi-platform, batch)
- Phase F (screencast via OpenScreen)
- Phase G (SaaS motion graphics)
- Brand/Client CRUD UI
- Mode 2 UI flow (upload footage → AI edits)
- Rebrand (new UI/UX coming — don't invest in current UI polish)

## PREVIOUS SESSION CONTEXT
- `memory/session_handover_2026_04_22.md` — previous handover (7 bugs fixed, 4 broken, architectural issues)
- `memory/pipeline_audit_2026_04_23.md` — v3 pipeline audit, 4.1/10 against "Marvel would trust it" bar
- `memory/commit_history_audit_2026_04_21.md` — 475+ commits mapped (updated this session with 12 new)
- `memory/editron_master_remaining.md` — 56 open items
- `memory/phase_f_g_saas_motion.md` — Phase F (screencast) + Phase G (SaaS motion graphics) roadmap
- `memory/resources.md` — APIs, models, keys, costs
- `memory/stable_v2_snapshot.md` — Editron v2.0 stable state reference
- `memory/pipeline_investigations.md` — long-form investigation reports
- Previous session transcript: `C:\Users\admin\.claude\projects\D--google-downloads-Front-End-main\3cd5392e-f7f6-4484-92e6-4524cd35f4a1.jsonl`

## PIPELINE TEST RESULTS (2026-04-27)
- Script: McDonald's nostalgia reel (exported from ThinkForge)
- 4 storyboard scenes, 17 video overlays, 1 voiceover, BGM + SFX
- Finalize: ✅ succeeded (project + scenes created)
- Director: ✅ ran (filters, transitions, SFX placed)
- Graph-sync: ❌ all 503 (Neo4j env vars missing from Preview — NOW FIXED, needs redeploy)
- Captions: ❌ failed on 16/17 videos (Bug 1 — video-to-voiceover matching)
- Beat alignment: ❌ libasound.so.2 missing on Vercel (Bug 2)
- Graphiti episode: not tested yet (depends on graph-sync working)

## INCIDENTS THIS SESSION
1. **API Key Leak** — `scripts/graphiti-test.py` committed with hardcoded Gemini + Neo4j credentials. Google revoked key. Had to rotate ALL 4 Gemini key env vars (GEMINI_API_KEY, GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GRAPH_GEMINI_API_KEY) on BOTH Production and Preview.
2. **Production Deploy** — Empty commit to trigger redeploy accidentally deployed `infrastructure-improvs-+Editron` as Production. Had to promote `main` back manually. Rule 24N created.
3. **Preview Env Vars** — Neo4j env vars only set on Production, not Preview. All graph-sync calls returned 503. Fixed by adding to Preview scope.

## Rules Added This Session
- **Rule 24N:** NEVER trigger production deployments. No `vercel --prod`, no empty commits to trigger redeploys, no `vercel promote`. Tell user to redeploy from dashboard.
- **Feedback:** Vercel env vars are scoped per environment (Production vs Preview). Always check BOTH.
- **Feedback:** Vercel "Redeploy" reuses old env vars. Must redeploy with "Use existing Build Cache" UNCHECKED for new env vars.
