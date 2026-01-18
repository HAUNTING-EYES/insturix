# Task: Remove Firebase RTDB from Musitron (Phase 2)

## Prerequisites
*   **Dependency**: Complete `MUSITRON_MIGRATION_TASK.md` first. The backend must be fully migrated to Next.js + QStash before starting this.

## Objective
Remove all Firebase Realtime Database (RTDB) dependencies from Musitron. Status updates will rely solely on MongoDB, and the frontend will poll for updates.

## Backend Changes
**File**: `app/api/services/musitron/processor/route.ts`
*   Remove all calls to `MusitronRTDBManager` (e.g., `updateTaskStatus`).
*   Status updates should only go to MongoDB.

## Frontend Changes
**File**: `components/dashboard/Musitron/MusitronTaskHistory.tsx`
*   Check how status updates are currently consumed (likely via `useTaskUpdater` or similar RTDB hook).
*   Replace with **polling** using React Query's `refetchInterval`.
    *   Poll every 3-5 seconds when there are tasks in `processing` or `queued` state.
    *   Disable polling when all visible tasks are `completed` or `failed`.
*   The data is already fetched from `/api/services/musitron/history`, so no new API is needed.

## Cleanup
*   Delete `lib/services/rtdb/musitron-rtdb.ts`.
*   Remove any unused Firebase imports from the processor.

## Testing
1.  Generate music via UI.
2.  Verify frontend shows "Generating Music..." status (via polling, not RTDB).
3.  Verify status updates to "Completed" with audio player when done.
4.  Test the full flow multiple times to ensure stability.
