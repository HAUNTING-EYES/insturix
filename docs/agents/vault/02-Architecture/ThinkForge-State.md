# ThinkForge State
#architecture #thinkforge

> ThinkForge is the content planning and script authoring engine. V2 vision: every script written in ThinkForge is natively structured to feed [[Mode-2-Architecture|Editron]] with maximum signal -- not reverse-engineered at export time.

---

## V2 Vision -- Editron-Ready Structured Output

**Branch:** `thinkforge-enhancementsV2`

### Core Insight
ThinkForge today produces scripts that the export-for-editron route post-processes (LLM parser -> quality gate -> fallback) to extract structure. That is backwards. Structure should exist NATIVELY in the script as authored.

### Two Modes

**Mode 1: Script-to-Editron Direct (AI video pipeline)**
User intends to make video via Editron's AI pipeline. Their script must already contain:
- Scene boundaries (explicit, not inferred from regex)
- Per-scene narration vs visualDescription vs editorial metadata (separated by block type)
- Per-scene subjects/entities (named, tagged)
- Per-scene duration intent (with durationWasExplicit flag)
- Editorial directives (mood, transitions, on-screen text, motion graphics) as first-class blocks
- Brand DNA injected during authoring, not lost at export

**Mode 2: Script-as-Reference (live shoot or hybrid)**
User writes script but shoots video themselves or uses partial AI fill. Structured output makes their script:
- Ready for storyboard sketch feature (rough shoot guide)
- Ready for calendar trend updates (niche-aware revisions)
- Ready to send to Editron later if they decide to mix in AI clips

### Today vs V2 Target

| Today | V2 Target |
|---|---|
| Script is rich text (Tiptap blocks: header/paragraph/action/why/example) | Rich text + STRUCTURED scene blocks with typed slots: narration, visualDescription, subjects[], duration, editorial metadata |
| Editorial headers detected via regex AT EXPORT and rerouted to rawProductionNotes | Editorial headers are a FIRST-CLASS block type at authoring time. No regex. |
| LLM parser extracts subjects globally (characterDescriptions) | Authoring agents tag subjects per scene as script is generated |
| Brand DNA stored in /brand-dna route, never reaches export | Brand DNA is context source for ALL agents and travels with export payload |
| Quality gate at export rejects garbage | Quality gate at AUTHORING -- block-level Zod schemas reject malformed input before save |
| suggestedProfileCategory inferred at export by LLM | Profile category SUGGESTED during authoring (script-coherence-agent) and revisable in UI |
| onScreenText extracted at export | onScreenText is a typed block authored by user |

### V2 Sprint Direction

1. Block-type formalization -- SceneBlock and EditorialBlock as first-class Tiptap node types
2. Subjects-per-scene tagging -- script-author-agent emits subjects[] inline
3. Brand DNA flow -- fetch brand DNA in script-author-agent context assembly, persist into export payload
4. Authoring-time validation -- Zod schemas on save (/script/save, /script/blocks)
5. Open-bug squash
6. Calendar + storyboard wiring audit

---

## Audit Findings (2026-04-26)

### Surface Inventory

- 93 lib files (~19k LOC) under `lib/thinkforge/`
- 33 API routes under `app/api/services/thinkforge/`
- ~25 UI components under `components/dashboard/ThinkForge/`
- 5 hooks under `app/dashboard/thinkforge/hooks/`
- 1 export bridge: `app/api/services/thinkforge/script/export-for-editron/route.ts`
- 27 agents (all Gemini 2.5/3.1 Flash)

### Agent Architecture

Pipeline: supervisor -> outline -> contract -> author -> refinement -> coherence

Key files:
- `lib/thinkforge/agents/script-draft-agent.ts:210` -- main pipeline orchestrator
- `lib/thinkforge/agents/model-factory.ts:128` -- model creation/routing
- `lib/thinkforge/agents/document-authoring-contract.ts:60` -- mandatory rules injected into all agent prompts
- `lib/thinkforge/agents/null-agent.ts:156` -- on-demand specialist (Supervisor-spawned)

### Critical Issues

| ID | Issue | File | Impact |
|---|---|---|---|
| C1 | Profile detection runs AFTER finalize (informational only) | `finalize/route.ts:1005-1035` | 54 profiles + 16x pacing range wasted. Editron pipeline, not V2 scope. |
| C2 | /sidecar -- no credit check on multi-agent orchestration | `sidecar/route.ts:26-60` | Free unlimited Ingestor+Architect+Stylist+Discovery (3-5 credits/call). Revenue leak. |
| C3 | /refinery -- no credit check | `refinery/route.ts:24` | Free unlimited URL ingestion to DataBank (1-2 credits/URL). |
| C4 | SceneDescriptor missing subjects[] per scene | `llm-scene-parser.ts` | Blocks Phase C asset reuse. V2 should emit per-scene subjects natively. |
| C5 | No onScreenText fallback if EDL graphic emission fails | `finalize/route.ts:378-454` | Silent data loss. Editron pipeline, out of V2 scope. |

### High Issues

| ID | Issue | File |
|---|---|---|
| H1 | /script/edit -- no credit check on generateScriptDraft | `script/edit/route.ts:18` |
| H2 | 0 of 33 routes use Zod validation | Multiple routes |
| H3 | Intent classifier silent fallback to EDIT | `intent-classifier.ts:41` |
| H4 | Intent gate LLM fallback unguarded (uninitialized variable on Gemini timeout) | `intent-gate.ts:378-399` |
| H5 | Brand DNA never reaches export | `brand-dna/route.ts` vs `export-for-editron/route.ts` |
| H6 | Context truncation char-based, not token-aware (DEFAULT_MAX_CHARS=12000) | `assembleContext.ts:40,77-78` |
| H7 | Refinement queue is in-process fire-and-forget (lost on crash) | `refinement-queue.ts:64-66` |

### State / Persistence Map

| Data | Storage | Notes |
|---|---|---|
| Session state | MongoDB `thinkforge_db.thinkforge_sessions` | Mongoose with $inc for CAS |
| Scripts | MongoDB `thinkforge_scripts` | via db.ts + command-service.ts |
| Chat history | MongoDB `thinkforge_chat` + localStorage | Legacy + chat hook |
| Versions | In-memory only | Needs persistence |
| Embeddings | Upstash Vector | DataBank dedup, 0.95 threshold |
| Refinement jobs | MongoDB `thinkforge_refinement_jobs` | No real worker (QStash/Bull) |

### State Sync Risks

- `useThinkForgeSession` + `useThinkForgeScript` cache to localStorage independently -- stale-state risk
- `selectedIdea` in page.tsx vs `projectMeta` in session hook -- duplicate sources of truth
- Chat messages: localStorage only; `/chat/threads` endpoint exists but unwired
- ExportToEditronDialog has no timeout/cancel button

---

## Open Bugs

### B1: FIXED -- Opening previous project always starts new script generation
**Status:** Fixed in commit `71193b42` on branch `thinkforge-enhancementsV2`

**Root cause:** Race condition in `ChatPanel.tsx:223-256`. The `autoStartFired` useEffect fires `chat.sendMessage(autoPrompt)` before the async script fetch resolves, so saved scripts trigger a new draft instead of loading.

**Fix (Option 1):** Added `isLoading` state to `useThinkForgeScript`, wired through to ChatPanel. Auto-start only fires after script fetch settles.

**Deferred (Option 2):** Use the script payload already returned by `/session` hydrate to skip the redundant `/script/blocks` GET. Closes the race further and saves a network round trip.

### B2: FIXED -- Export dialog no cancel button
Commit `84be94a3`. Added "Cancel Export" button visible during all processing steps.

### B3: OPEN -- No "saving..." indicator during script autosave
File: `useThinkForgeScript.ts` (debounced 800ms). User has no signal whether work is persisted. Medium UX severity.

### B4: FIXED -- selectedIdea vs projectMeta state sync
Commit `e2834b7f`. Exposed `setProjectMeta` from `useThinkForgeSession`, called after successful API persist.

### B5: LOW -- Chat thread metadata is localStorage-only
Messages ARE persisted server-side. Thread metadata (thread list, thread names, active thread ID) is localStorage-only. Clearing localStorage loses thread navigation list but not messages. Fix: add POST /chat/threads to persist thread metadata.

### B6: FIXED -- Chat suggestions re-randomize every render
Commit `84be94a3`. Replaced Math.random() with deterministic hash seeded by idea text.

### B7: OPEN -- Profile dropdown in export dialog has no search/filter (54 entries)
File: `ExportToEditronDialog.tsx:146`. Low UX severity.

---

## Existing Features

- **Calendar with trend updates** -- surfaces trending content for user's niche (`app/api/services/thinkforge/content-planning/`)
- **Storyboard sketch** -- rough sketch view for live shoot guidance (`StoryboardingMode.tsx`)
- **Brand DNA / DataBank** -- knowledge captured per project (`/brand-dna`, `/databank`)
- **Multi-document syncing** -- cross-doc-sync for screenplay to VFX brief (`lib/thinkforge/services/cross-doc-sync.ts`)

---

## Related

- [[Mode-2-Architecture]] -- ThinkForge scripts feed Editron via export bridge
- [[Product-Integration-Plan]] -- ThinkForge is the brain of the 5-product pipeline
