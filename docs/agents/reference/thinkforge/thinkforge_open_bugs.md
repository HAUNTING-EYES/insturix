---
name: ThinkForge Open Bugs (active, unfixed)
description: Active ThinkForge bugs the user has reported or that audits have surfaced. Top issue — opening a previous project always triggers new script generation instead of loading the existing one.
type: project
originSessionId: 45c272f8-170c-4dbd-9bd6-ff62dd01241f
---
# ThinkForge Open Bugs — VERIFIED ON VERCEL 2026-04-27

## B1. ✅ VERIFIED FIXED 2026-04-26 (commit 365a4621 on infrastructure-improvs-+Editron) — Opening previous project always starts new script generation
**Reported by user:** 2026-04-26
**Fix commit:** `71193b42` on branch `thinkforge-enhancementsV2` (4 files: useThinkForgeScript.ts, page.tsx, StoryboardingMode.tsx, ChatPanel.tsx)
**Fix approach (Option 1 from prior plan):**
- Added `isLoading` state to `useThinkForgeScript` — true while the script is being hydrated for a (sessionId, scriptId) pair
- Wired `isScriptLoading` prop through `page.tsx → StoryboardingMode → ChatPanel`
- Modified ChatPanel auto-start effect (lines 227-281):
  - Added `if (isScriptLoading) return;` guard
  - Added 3 live refs (`liveScriptHasContentRef`, `liveChatHasMessagesRef`, `liveChatIsStreamingRef`) updated by tiny effects
  - Moved `autoStartFired.current = true` INSIDE the timer callback so re-evaluations supersede stale schedules
  - Re-checks the live refs inside the timer; aborts if script load resolved during the 800ms window
  - Added `isScriptLoading` to effect dependencies
**Did NOT do (deferred to Phase 2):** Option 2 — using the script payload already returned by `/session` hydrate to skip the redundant `/script/blocks` GET. This is the compounding fix that closes the race window further AND saves a network round trip.


**Symptom:** User opens an existing project from the project list / sessions list. Instead of loading the saved script, ThinkForge initiates a NEW script draft.
**Expected:** Loading a previous project should hydrate the saved script (blocks, content, title) with NO agent generation triggered.

### Root Cause (CONFIRMED via investigation 2026-04-26)
**Race condition between async script load and synchronous auto-start effect.**

**Buggy line:** `components/dashboard/ThinkForge/ChatPanel.tsx:223-256` — the `autoStartFired` useEffect.
The effect fires `chat.sendMessage(autoPrompt)` (an auto-draft kickoff) when:
1. `sessionId` exists
2. `!script?.content` (script content is falsy)
3. `chat.messages.length === 0`

**Trace of the race:**
1. User clicks "Open Project" → `app/dashboard/thinkforge/page.tsx:652` calls `onOpenSession(id)`
2. Session hydrate completes → `setPendingSessionId(sid)` (`page.tsx:666`)
3. `useThinkForgeScript` receives new sessionId → clears local script to null (`useThinkForgeScript.ts:62`)
4. Async fetch to `/api/services/thinkforge/script/blocks` starts (`useThinkForgeScript.ts:90`)
5. **ChatPanel effect runs synchronously BEFORE that fetch resolves** (`ChatPanel.tsx:225`): checks `!script?.content` → true (still null)
6. **AUTO-DRAFT FIRES** (`ChatPanel.tsx:239`): `chat.sendMessage(autoPrompt)` triggers a fresh script generation
7. ~500ms later, the script fetch resolves and the saved script loads — but by then the user has already triggered (and is being charged for) a new draft

### Compounding bug
**File:** `app/dashboard/thinkforge/hooks/useThinkForgeSession.ts:49`
The hydrate response from `/session` includes the saved `script`, but `useThinkForgeScript` ignores it and refetches from `/script/blocks`. The double-fetch widens the race window.

### Fix Options (ranked low to high risk; do NOT implement until user approves)

**Option 1 — LOWEST RISK. Gate the auto-start effect on a load-completed flag.**
- Add `isLoading` to `useThinkForgeScript` return
- In `ChatPanel.tsx` autoStartFired effect, early-return when `isLoading || (!script && sessionId)`
- Effect: auto-draft only fires after the script fetch settles, so saved scripts load first.

**Option 2 — MEDIUM RISK. Use the script payload already in the session hydrate.**
- Make `useThinkForgeScript` accept the initial script from `useThinkForgeSession` hydrate response
- Skip the redundant /script/blocks GET on first load
- Closes the race entirely + cuts a network round trip

**Option 3 — HIGH RISK. Move auto-start logic out of ChatPanel into page.tsx.**
- Page.tsx owns hydration + knows when a NEW vs EXISTING session is being opened
- Pass an explicit `shouldAutoStart` boolean down to ChatPanel
- Larger refactor, but cleanest separation of concerns

**Recommendation:** Option 1 first (1-2 file change, minimal blast radius). If it's solid, follow with Option 2 to also fix the double-fetch waste.

**Why this matters:** Top user-facing bug. Erodes trust. Also burns credits on every project open. Wastes a chat message slot.

## B2. ✅ FIXED 2026-04-26 (commit 84be94a3 / synced e2d08abf) — Export dialog no cancel button
**Fix:** Added "Cancel Export" button visible during all processing steps. Calls reset() to return to configure step.

## B3. UI — No "saving..." indicator during script autosave
**File:** `app/dashboard/thinkforge/hooks/useThinkForgeScript.ts` (debounced 800ms)
**Symptom:** User has no signal whether their work is persisted. Causes anxiety / save-spam clicks.
**Severity:** Medium UX

## B4. ✅ FIXED 2026-04-26 (commit e2834b7f on thinkforge-enhancementsV2) — selectedIdea vs projectMeta state sync
**Root cause:** handleUpdateIdea updated selectedIdea + API + localStorage, but never updated useThinkForgeSession's projectMeta state. Patch effect (page.tsx:73-96) read stale projectMeta and could revert edits.
**Fix:** Exposed setProjectMeta from useThinkForgeSession, called after successful API persist in handleUpdateIdea.

## B5. LOW SEVERITY — Chat thread metadata is localStorage-only (messages ARE persisted)
**Investigation (2026-04-26):** Chat messages are already saved server-side: user messages via chat-service.ts:316, assistant messages via finalResponse accumulation (lines 424, 479, 535, 763, 901, 925, 994). Hook hydrates from /chat/list on mount (useThinkForgeChat.ts:123). Default thread works across sessions.
**Actual gap:** Thread metadata (thread list, thread names, active thread ID) is localStorage-only. Clearing localStorage loses the thread navigation list — but NOT the messages. New threads created with crypto.randomUUID() have their messages persisted but become unreachable without the localStorage thread list.
**Proper fix (deferred):** Add POST /chat/threads to persist thread metadata to backend. Wire ChatPanel.tsx upsertThread to call it. Not urgent — default thread (vast majority of usage) works fine.

## B6. ✅ FIXED 2026-04-26 (commit 84be94a3 / synced e2d08abf) — Chat suggestions re-randomize every render
**Fix:** Replaced Math.random() with deterministic hash seeded by idea text. Same idea always gets same suggestions.

## B7. Profile dropdown in export dialog has no search/filter (54 entries)
**File:** `components/dashboard/ThinkForge/ExportToEditronDialog.tsx:146`
**Severity:** Low UX
