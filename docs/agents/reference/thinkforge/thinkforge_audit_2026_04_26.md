---
name: ThinkForge Full Audit (2026-04-26)
description: Complete surface scan of ThinkForge — 93 lib files, 33 API routes, ~25 UI components, 5 hooks, 1 export bridge to Editron. All findings with file:line citations, dead code, credit gaps, validation gaps, and architecture issues. Use as reference for V2 work on branch thinkforge-enhancementsV2.
type: project
originSessionId: 45c272f8-170c-4dbd-9bd6-ff62dd01241f
---
# ThinkForge Surface Scan — 2026-04-26

**Branch for V2 work:** `thinkforge-enhancementsV2`
**Scope:** Front-End-main/lib/thinkforge/, app/api/services/thinkforge/, components/dashboard/ThinkForge/, app/dashboard/thinkforge/
**Note:** Front-End-thinkforge-enhancement was already merged via commit `b27e0bf2` — do not treat as separate.

## Surface Inventory
- 93 lib files (~19k LOC) under lib/thinkforge/
- 33 API routes under app/api/services/thinkforge/
- ~25 UI components under components/dashboard/ThinkForge/
- 5 hooks under app/dashboard/thinkforge/hooks/
- 1 marketing-only set under components/products/thinkforge/
- 1 export bridge: app/api/services/thinkforge/script/export-for-editron/route.ts

## Agent Architecture (27 agents, all Gemini 2.5/3.1 Flash)
**Pipeline:** supervisor → outline → contract → author → refinement → coherence
**Key files:**
- `lib/thinkforge/agents/script-draft-agent.ts:210` — main pipeline orchestrator
- `lib/thinkforge/agents/model-factory.ts:128` — model creation/routing
- `lib/thinkforge/agents/document-authoring-contract.ts:60` — MANDATORY rules injected into all agent prompts
- `lib/thinkforge/agents/null-agent.ts:156` — on-demand specialist (Supervisor-spawned)

## CRITICAL Issues

### C1. Profile detection runs AFTER finalize (informational only)
**File:** `app/api/services/pipeline/storyboard/[id]/finalize/route.ts:1005-1035`
**Impact:** 54 profiles + 16x pacing range — currently wasted. Profile doesn't influence duration/transitions/graphics density/color grading.
**NOTE: This is in editron pipeline, not in scope for V2.**

### C2. /sidecar — no credit check on multi-agent orchestration
**File:** `app/api/services/thinkforge/sidecar/route.ts:26-60`
**Impact:** Free unlimited Ingestor+Architect+Stylist+Discovery (3-5 credits/call). Revenue leak.

### C3. /refinery — no credit check
**File:** `app/api/services/thinkforge/refinery/route.ts:24`
**Impact:** Free unlimited URL ingestion to DataBank (1-2 credits/URL).

### C4. SceneDescriptor missing subjects[] per scene
**File:** `lib/pipeline/llm-scene-parser.ts`
**Impact:** Blocks Phase C asset reuse. Editron's 5-Track Layer 5 has no reverse flow to ThinkForge.
**V2 implication:** ThinkForge V2 should emit per-scene subjects natively in script blocks.

### C5. No onScreenText fallback if EDL graphic emission fails
**File:** `app/api/services/pipeline/storyboard/[id]/finalize/route.ts:378-454`
**Impact:** Silent data loss. Captions removed 2026-04-19; relies entirely on EDL path.
**NOTE: Editron pipeline; out of V2 scope but inform Editron team.**

## HIGH Issues

### H1. /script/edit — no credit check on generateScriptDraft
**File:** `app/api/services/thinkforge/script/edit/route.ts:18`

### H2. 0 of 33 routes use Zod
**Worst offenders:** /brand-dna PATCH, /script/save POST, /script/blocks POST, /sidecar
- `app/api/services/thinkforge/brand-dna/route.ts:34` — accepts arbitrary nested objects
- `app/api/services/thinkforge/script/save/route.ts:31` — `blocks: any[]`
- `app/api/services/thinkforge/script/blocks/route.ts:87-88` — imports safeParseTiptapJSON but never calls it
- `app/api/services/thinkforge/sidecar/route.ts:42-48` — action enum not validated

### H3. Intent classifier silent fallback to EDIT (Rule 13 violation)
**File:** `lib/thinkforge/protocol/intent-classifier.ts:41`
**Impact:** Classification fail → user unknowingly destructive rewrites.

### H4. Intent gate LLM fallback unguarded
**File:** `lib/thinkforge/intent/intent-gate.ts:378-399`
**Impact:** Uninitialized variable on Gemini timeout → runtime crash.

### H5. Brand DNA never reaches export
**File:** `app/api/services/thinkforge/brand-dna/route.ts` exists, but `app/api/services/thinkforge/script/export-for-editron/route.ts` doesn't fetch/inject brand DNA into LLM parser.
**V2 implication:** Brand DNA should flow into authoring AND export.

### H6. Context truncation char-based, not token-aware
**File:** `lib/thinkforge/context/assembleContext.ts:40,77-78`
**Impact:** DEFAULT_MAX_CHARS=12000. Different models tokenize differently — risk of silent truncation of critical context.

### H7. Refinement queue is in-process fire-and-forget
**File:** `lib/thinkforge/jobs/refinement-queue.ts:64-66`
**Impact:** Pending jobs lost on server crash. MongoDB schema exists but no real worker (QStash/Bull).

### H8. durationSource not tracked on overlays (editron-side; not V2 scope)

## DEAD CODE ASSESSMENT (CORRECTED 2026-04-26 after triple-verification)
**Original audit was WRONG about versioning and diff-engine.** Triple-grep verification found:
- `lib/thinkforge/versioning/` — **ALIVE.** Used by useVersionManager hook, BranchEditor.tsx, ScriptEditor.tsx. DO NOT DELETE.
- `lib/thinkforge/mappers/diff-engine.ts` — **ALIVE.** Used by edit-blocks route (`agentResponseToCommands`).
- `lib/thinkforge/services/event-log.ts` — **ALIVE.** Used by sidecar route, chat-service, events route.
**Actually dead (empty placeholders only):**
- `lib/thinkforge/{ideas,useSimpleIdeas,safeJson}.ts` — empty files, 0 bytes each
- `lib/thinkforge/mappers/__init__.ts` — placeholder, ~22 bytes
- `lib/thinkforge/mappers/__init__.ts` — empty

## VERIFIED FIXED (do not re-touch)
- Editorial-header routing → rawProductionNotes (`lib/pipeline/script-to-scenes.ts:97-123`)
- richTextToPlain link-node extraction (`lib/pipeline/script-to-scenes.ts:29-40`)
- Quality gate rejects regex-fallback garbage (`app/api/services/thinkforge/script/export-for-editron/route.ts:209-295`)
- Multi-subject visual truncation to hero moment (`lib/pipeline/llm-scene-parser.ts:606-642`)
- suggestedProfileCategory now boost (+0.25) not filter (`lib/editron/services/profile-detection-service.ts:260-279`)
- Montage sub-shots use targetDurationSeconds (`finalize/route.ts:149,477-484`)

## STATE / PERSISTENCE MAP
- Session state: MongoDB `thinkforge_db.thinkforge_sessions` (Mongoose with `$inc: { version }` for CAS)
- Scripts: MongoDB `thinkforge_scripts` (via db.ts + command-service.ts)
- Chat history: MongoDB `thinkforge_chat` (legacy) + localStorage (chat hook)
- Versions: in-memory only (DEAD)
- Embeddings: Upstash Vector (DataBank dedup, 0.95 threshold)
- Refinement jobs: MongoDB `thinkforge_refinement_jobs` but no real worker

## UI / HOOKS / STATE SYNC RISKS
- `useThinkForgeSession` + `useThinkForgeScript` cache to localStorage independently → stale-state risk if session updates without script save
- `selectedIdea` in page.tsx vs `projectMeta` in session hook — duplicate sources of truth for idea metadata
- Chat messages: localStorage only; `/chat/threads` endpoint exists but unwired
- ExportToEditronDialog has no timeout/cancel button (UI gap)
- Tiptap extensions used: StarterKit, Link, Placeholder, History
