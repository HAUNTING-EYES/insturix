# Task: Remove Firebase RTDB from Alyzitron (Phase 2)

## Prerequisites
*   **Dependency**: Complete `ALYZITRON_MIGRATION_TASK.md` first. The backend must be fully migrated to Next.js + QStash before starting this.

## Objective
Remove all Firebase Realtime Database (RTDB) dependencies from Alyzitron. Status updates will rely solely on MongoDB, and the frontend will poll for updates.

## Backend Changes
**File**: `app/api/services/alyzitron/processor/route.ts`
*   Remove all calls to `AlyzitronRTDBManager` (e.g., `updateTaskStatus`, `createTask`).
*   Status updates should only go to MongoDB.

## Frontend Changes
**File**: `components/dashboard/Alyzitron/AlyzitronTaskHistory.tsx`
*   Remove the `useTaskUpdater` hook (relies on RTDB listeners).
*   Implement **polling** using React Query's `refetchInterval`.
    *   Poll every 3-5 seconds when there are tasks in `processing` or `queued` state.
    *   Disable polling when all visible tasks are `completed` or `failed`.
*   The data is already fetched from `/api/services/alyzitron/analyses`, so no new API is needed.

## Cleanup
*   Delete `lib/services/rtdb/alyzitron-rtdb.ts`.
*   Remove any unused Firebase imports from the processor.

## Testing
1.  Start an analysis.
2.  Verify frontend shows "Processing" status (via polling, not RTDB).
3.  Verify status updates to "Completed" when done.
4.  Test the full flow multiple times to ensure stability.
