---
name: Session Handover — Brand Intelligence (2026-05-14)
description: Complete handover for the Brand Intelligence system build across Phases 1-3 + audit + remediation. 20+ hour session. Read this FIRST before any Brand Intelligence work.
type: project
originSessionId: e8eef18a-cd92-4425-804c-05efa0b4f139
---
# Session Handover: Brand Intelligence — 2026-05-14

## Branch: `brand-intelligence` (based on `origin/main`, merged with `infrastructure-improvs-+Editron`)

## What Was Built

**Goal:** Make Insturix the first video production platform with persistent brand memory across the entire creative pipeline. Every project makes the system smarter about YOUR brand.

**System health after remediation: ~8/10**

---

## Phase Summary

| Phase | Commits | What it delivers |
|-------|---------|------------------|
| Phase 1A | `f0e62e97` | Second Brain — Observer fact extraction, Post-Mortem session compression, 3-tier context retrieval, embedding service |
| Phase 1B | `f0e62e97` | Event Bus — brand_events collection, project status state machine (11 states), brand-learning QStash worker, admin status-board |
| Phase 2A | `0ef4d581` | Brand Registry (unified ThinkForge + Editron view), Shadow Logger (rate-limited behavioral events), Shadow-log API route, Bandit per-brand learning |
| Phase 2B | `27996004` | Brand CRUD events, Director graph writer dispatch, Admin brand-intelligence endpoint, Quality confirmation dialog (score < 40) |
| Phase 3 | `afdf1db1` | Brand-aware quality checks (color + typography), Alyzitron analysis_complete events, Cross-service post-mortem, Admin service usage endpoint |
| Audit fixes | `7508c640` | Unsafe catch→unknown, missing Graphiti episode on DELETE, $size guard on consumedBy |
| Remediation | `6094801c` | Auth bypass fix, idempotent worker, consumed-on-failure fix, CAS on status transitions, indexes at startup, 90-day TTL, stuck project recovery cron |

---

## All New Files Created (12)

| File | Purpose |
|------|---------|
| `lib/shared/brand-events.ts` | Cross-service event bus — 13 event types, 7 services, MongoDB + QStash dispatch |
| `lib/shared/project-status.ts` | 11-state lifecycle machine with CAS transitions, error tracking, queries |
| `lib/shared/brand-registry.ts` | Unified brand view (ThinkForge BrandDNA + Editron Brand), 5-min cache |
| `lib/shared/shadow-logger.ts` | Rate-limited behavioral event logger (30 events/60s/user) |
| `app/api/internal/workers/brand-learning/route.ts` | QStash worker — idempotent, auth-verified, feeds bandit + post-mortem |
| `app/api/admin/projects/status-board/route.ts` | Projects grouped by status with filters |
| `app/api/admin/brand-intelligence/status/route.ts` | Brand health, event bus stats, project pipeline distribution |
| `app/api/admin/services/usage/route.ts` | Per-service event counts, active users, daily activity |
| `app/api/services/shared/shadow-log/route.ts` | Client-side shadow event logging endpoint (batch + single) |
| `app/api/cron/recover-stuck-projects/route.ts` | Cron (every 15 min) recovers projects stuck >30 min |
| `tests/brand-intelligence/project-status.test.ts` | 39 tests — state machine transition validation |
| `tests/brand-intelligence/brand-events.test.ts` | 14 tests — event type/service coverage contracts |

## All Modified Files (23)

| File | Change |
|------|--------|
| `lib/editron/services/project-service.ts` | Added status, statusHistory, brandId, lastError to Project interface |
| `lib/editron/db/mongodb.ts` | Added status_updatedAt and brandId_status indexes |
| `lib/editron/agent/director-agent.ts` | Brand event emission, status transition (editing), failure path, graph writer dispatch |
| `lib/editron/services/quality-review-service.ts` | Brand color compliance + typography checks, brandConfig param |
| `lib/editron/services/genre-parameter-bandit.ts` | brandId in BanditContext + buildContextKey |
| `app/api/services/editron/quality-review/route.ts` | Hotfix (arg order) + quality_reviewed brand event |
| `app/api/services/editron/cloudrun/progress/route.ts` | video_rendered event, rendered/failed status transitions |
| `app/api/services/editron/cloudrun/render/route.ts` | rendering status transition on render start |
| `app/api/services/pipeline/storyboard/[id]/finalize/route.ts` | project_created event, generating status transition |
| `app/api/services/thinkforge/events/observe/route.ts` | OBSERVER_ENABLED env gate, processPendingEmbeddings call |
| `app/api/services/thinkforge/events/post-mortem/route.ts` | POSTMORTEM_ENABLED env gate |
| `components/dashboard/ThinkForge/ScriptEditor.tsx` | Removed `false &&` client gate on Observer |
| `components/dashboard/ThinkForge/ChatPanel.tsx` | Removed `false &&` client gate on Observer |
| `lib/thinkforge/context/fetchContextSources.ts` | Activated 3-tier retrieval with 3s timeouts |
| `lib/thinkforge/services/embedding-service.ts` | Added queryRelevantFacts() for vector search |
| `lib/thinkforge/agents/post-mortem-agent.ts` | Reads brand_events (last 7d) for cross-service learning |
| `app/api/services/alyzitron/processor/route.ts` | analysis_complete brand event emission |
| `app/api/services/editron/brands/route.ts` | brand_updated event on create + cache invalidation |
| `app/api/services/editron/brands/[brandId]/route.ts` | brand_updated events on update/delete + Graphiti episode on delete |
| `components/editron/editor/version-7.0.0/components/rendering/render-controls.tsx` | Quality confirmation dialog (score < 40) |
| `instrumentation.ts` | ensureBrandEventsIndexes() called at startup |
| `vercel.json` | Stuck project recovery cron schedule |
| `middleware.ts` | VERCEL_BRANCH_URL + VERCEL_PROJECT_PRODUCTION_URL for Clerk auth |

---

## New Env Vars Required

| Var | Where | Purpose |
|-----|-------|---------|
| `OBSERVER_ENABLED=true` | Vercel | Gates ThinkForge fact extraction Observer |
| `POSTMORTEM_ENABLED=true` | Vercel | Gates Post-Mortem session compression |
| `QSTASH_TOKEN` | Already set | QStash dispatch for brand events |
| `QSTASH_CURRENT_SIGNING_KEY` | Already set | QStash signature verification |
| `CRON_SECRET` | Already set | Cron endpoint auth |

No new env vars were introduced by Phase 2 or 3 — they use existing infrastructure.

---

## Architecture: How Data Flows

```
USER ACTION
  │
  ├─ ThinkForge: writes script (500+ chars)
  │   └─ Observer extracts facts → DataBank → Upstash Vector embedding
  │       └─ Next session: fetchContextSources retrieves facts via vector similarity
  │
  ├─ Pipeline: finalizes storyboard
  │   └─ emitBrandEvent('project_created') + transitionProjectStatus('generating')
  │
  ├─ Director: completes 13-step execution
  │   └─ emitBrandEvent('director_completed', {qualityScore}) + transitionProjectStatus('editing')
  │   └─ dispatchProjectGraphRecord() → Graphiti knowledge graph
  │
  ├─ Render: user clicks render
  │   ├─ Start: transitionProjectStatus('rendering')
  │   ├─ Complete: emitBrandEvent('video_rendered') + transitionProjectStatus('rendered')
  │   └─ Error: transitionProjectStatus('failed', {lastError})
  │
  ├─ Quality Review: user clicks review
  │   └─ emitBrandEvent('quality_reviewed', {score, issueCount})
  │   └─ Brand checks: caption colors vs palette, font vs typography
  │
  ├─ Alyzitron: YouTube analysis completes
  │   └─ emitBrandEvent('analysis_complete')
  │
  └─ Brand CRUD: user creates/updates/deletes brand
      └─ emitBrandEvent('brand_updated') + invalidateCache + Graphiti episode

BRAND EVENT BUS (MongoDB brand_events collection)
  │
  ├─ QStash dispatch → Brand Learning Worker
  │   ├─ director_completed → recordProjectOutcome (bandit learning)
  │   ├─ video_rendered → recordProjectOutcome + Post-Mortem
  │   ├─ quality_reviewed → recordProjectOutcome
  │   ├─ video_published → recordProjectOutcome
  │   └─ brand_updated → invalidateCache
  │
  └─ Post-Mortem Agent reads brand_events (last 7d)
      └─ Compresses into global lessons → DataBank → Upstash Vector

BANDIT (Thompson Sampling)
  │
  └─ Context key: contentType:speechCoverage:duration:platform[:brandId]
      └─ 9 genre parameter dials adjusted per context
      └─ Requires 5+ projects before activating

ADMIN ENDPOINTS
  ├─ GET /api/admin/projects/status-board — projects by status
  ├─ GET /api/admin/brand-intelligence/status — brand health, event stats
  └─ GET /api/admin/services/usage — per-service usage over 7d/30d
```

---

## MongoDB State (verified 2026-05-14 on editron_prev)

| Collection | State |
|-----------|-------|
| brand_events | 4 docs (2 status_changed, 1 project_created, 1 director_completed). 2/4 consumed by worker. |
| projects | 1 project with status tracking (proj_k47Q1fibVdsB: draft→generating→failed) |
| bandit_states | 1 doc (36 arms, 32 projects — pre-existing Mode 2, not from our work) |
| brands | 0 docs (no brands created yet on preview) |
| brand_events indexes | Created at startup via instrumentation.ts. Includes 90-day TTL. |

---

## Senior Engineer Audit Findings

Two parallel audit agents ran: (1) learning loop tracer, (2) adversarial failure finder.

### FIXED (in remediation commit 6094801c)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| F14 | CRITICAL | Worker auth bypass if QSTASH_CURRENT_SIGNING_KEY unset | Production always verifies |
| F6 | CRITICAL | Worker NOT idempotent — QStash duplicates corrupt bandit | consumedBy check before processing |
| F4 | CRITICAL | Worker marks events consumed even when handler fails | Only mark consumed on success |
| F11 | HIGH | Status transition read-then-write race condition | findOneAndUpdate with CAS filter |
| F19 | HIGH | ensureBrandEventsIndexes() never called | Called from instrumentation.ts at startup |
| F10 | HIGH | brand_events collection grows forever | 90-day TTL index on createdAt |
| F7 | HIGH | No stuck-project recovery | Cron every 15 min, 30-min threshold |
| F16 | MEDIUM | Shadow-log batch DoS | 100-event cap |
| F9 | MEDIUM | handleBrandUpdated was a no-op | Calls invalidateCache now |

### FIXED (in earlier audit fix commit 7508c640)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| — | HIGH | qualityScore: 0 hardcoded in Director brand event | Reads actual score from MongoDB |
| — | HIGH | qualityScore = 50 fabricated default in worker | Changed to null, skip bandit when no score |
| — | MEDIUM | Status-board draft filter had conflicting mutations | Clean $or query |
| — | MEDIUM | generating → reviewing transition invalid | Changed to generating → editing |
| — | MEDIUM | Unused COLLECTIONS import in brand-registry | Removed |
| — | HIGH | Batch payload crash in shadow-log | typeof payload === 'object' guard |
| — | LOW | Error message leaked to client | Generic error message |
| — | HIGH | Unsafe catch (brandErr: any) in Director | Changed to catch (brandErr: unknown) |
| — | MEDIUM | DELETE missing Graphiti episode | Added brand_deleted episode |
| — | MEDIUM | $size on potentially-missing consumedBy | $ifNull guard |

### NOT FIXED (deferred)

| # | Severity | Issue | Why deferred |
|---|----------|-------|-------------|
| F20 | HIGH | UnifiedBrand.learning hardcoded to 0 | Needs async refactor of mergeToUnified |
| — | CRITICAL | Editron UI has ZERO shadow logger callers | Needs UI component work — separate feature scope |
| — | HIGH | video_rendered event missing sessionId | Post-mortem never fires from render — needs render flow changes |
| — | HIGH | Two disconnected shadow loggers (ThinkForge vs shared) | Needs architecture decision on merging |
| F8 | LOW | In-memory cache useless in serverless | Needs Redis for cross-instance |
| F13 | LOW | Per-instance rate limiting weaker than intended | Needs Redis |
| F23 | LOW | VERCEL_URL instability for QStash dispatch | Use APP_URL env var instead |
| F24 | LOW | truncatePayload math slightly off | Marginal, not impactful |

---

## What's Still Left to Build

### Backend Work (not done)

| Item | Description | Priority |
|------|-------------|----------|
| **Dashboard fields lost in merge** | `brand`, `pipelineStage`, `qualityScore`, `projectStatus` fields + `updatePipelineMetadata()` method exist on `origin/main` but were lost during the brand-intelligence merge. Need to re-merge from main. | HIGH |
| **brandId on createProject()** | `createProject()` in project-service.ts doesn't accept brandId param. Need to add it so projects can be brand-linked at creation. | HIGH |
| **PATCH endpoint for brand update** | `updatePipelineMetadata()` exists on main but needs to be exposed as a public PATCH endpoint for updating brand after creation. | HIGH |
| **Wire brandId into 3 creation routes** | projects/create, import-from-script, storyboard/finalize need to pass brandId. | HIGH |
| **Editron UI shadow logging** | Zero callers from editor UI. Filter changes, transition overrides, audio adjustments are invisible to learning. | HIGH |
| **video_rendered missing sessionId** | Post-mortem never fires from render completion — no sessionId in payload. | MEDIUM |
| **ThinkForge + shared shadow logger merge** | Two separate systems that never cross-feed. | MEDIUM |

### Prompt Injection (deferred — waiting for infra-improvs)

| Item | File | What it does |
|------|------|-------------|
| Editron AI chat brand context | `llm-service-google.ts:29` | System prompt knows brand voice, colors, kill list |
| ThinkForge script brand visuals | `script-author-agent.ts:264` | Script generation uses brand visual guidelines |
| Pipeline parser brand context | `llm-scene-parser.ts:204` | Scene descriptions include brand colors, style |

**Why deferred:** The user said infra-improvs branch is "sorting out current prompts." Adding brand context to prompts that are being restructured would create merge conflicts. The user explicitly chose "pause prompts, build everything else first."

**Dependency check:** If the prompts on infra-improvs are actually stable and won't change further, there's no reason to wait. This is the user's call.

### Larger Scope (future phases)

| Item | Scope |
|------|-------|
| searchAssets in Director | Phase C (Asset-Centric Architecture) — Director needs execution loop changes to search before generate |
| Admin dashboard React component | New UI component consuming the 3 admin endpoints |
| Cross-instance cache invalidation | Needs Redis/Upstash KV for shared cache |

---

## Key Decisions Made During This Session

1. **Registry, not merge** — ThinkForge BrandDNA and Editron Brands stay in separate DBs. Brand Registry is a read-only view across both. Migration would break production data.

2. **Prompt injection deferred** — User chose to pause prompt changes until infra-improvs stabilizes. Build everything else first.

3. **searchAssets deferred** — This is Phase C scope (Asset-Centric Architecture), not a simple wiring. Requires Director execution loop changes.

4. **Threshold 40 for quality gate** — Plan decision. Below 40 shows confirmation dialog, above 40 renders immediately. User can always override.

5. **90-day TTL on brand_events** — Balances learning history (30-day post-mortem window) with storage cost. Currently 4 events total.

6. **30-minute stuck project threshold** — Generous vs Vercel maxDuration (30s) and Lambda timeout (10 min).

7. **Per-brand bandit via context key suffix** — `contentType:speech:duration:platform:brandId`. Old keys without brandId continue to work (backward compatible).

---

## Bugs Found and Fixed During Session

| Bug | Where found | Fix |
|-----|-------------|-----|
| Quality review arg order swapped (fps/duration) | Hotfix pre-Phase 1A | Swapped args 2 and 3 |
| qualityScore: 0 hardcoded in Director | Audit Phase 1B | Reads actual score from MongoDB |
| qualityScore = 50 fabricated in worker | Audit Phase 1B | Skip bandit when no score |
| generating → reviewing invalid transition | Live test on preview | Changed to generating → editing |
| Status-board draft filter conflicting mutations | Audit Phase 1B | Clean $or query |
| Batch payload crash (Object.entries(undefined)) | Audit Phase 2A | typeof guard |
| Clerk JWT azp mismatch on preview branches | Live test | Added VERCEL_BRANCH_URL to authorized parties |
| neo4j-driver missing on main | Build failure | Installed package + merged infra branch |
| catch (brandErr: any) unsafe access | Audit Phase 2B | Changed to catch (unknown) with instanceof |
| DELETE missing Graphiti episode | Audit Phase 2B | Added brand_deleted episode |
| $size on missing consumedBy field | Audit Phase 2B | $ifNull guard |
| Worker auth bypass | Adversarial audit | Production always verifies |
| Non-idempotent worker | Adversarial audit | consumedBy check before processing |
| Consumed on failure | Adversarial audit | Only mark consumed on success |
| Status transition race condition | Adversarial audit | findOneAndUpdate with CAS |

---

## Tests

| Suite | Count | Status |
|-------|-------|--------|
| project-status.test.ts | 39 tests | Passing |
| brand-events.test.ts | 14 tests | Passing |
| TypeScript compilation | 0 errors in our files | 153 pre-existing |
| ESLint | 0 warnings in our files | 1 pre-existing (quality-review-service.ts:618 unused fps param) |

---

## Verification Checklist for Next Session

Before any new Brand Intelligence work, verify:

1. `git branch --show-current` = `brand-intelligence`
2. `git log --oneline -1` = `6094801c fix: remediation...`
3. `npx vitest run tests/brand-intelligence/` = 53 passing
4. `npx tsc --noEmit --skipLibCheck 2>&1 | grep brand-` = 0 errors
5. Check MongoDB `editron_prev.brand_events` has 4+ events
6. Check Vercel preview deployment is running

---

## Git Topology

```
origin/main ─── ... ─── 0ad604d4 ─── (main HEAD)
                              │
                              └─── f0e62e97 (Phase 1) ─── ... ─── 6094801c (remediation)
                                   └── brand-intelligence branch
                                   └── Merged infrastructure-improvs-+Editron at cf32ebcc

infrastructure-improvs-+Editron ─── ... ─── 70129b0b (HEAD)
   (4 commits ahead of brand-intelligence, 15 commits behind)

origin/main has dashboard fields (brand, pipelineStage, qualityScore, projectStatus,
updatePipelineMetadata) that were LOST during the merge into brand-intelligence.
These need to be re-merged.
```
