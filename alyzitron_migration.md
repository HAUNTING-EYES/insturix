# Alyzitron Complete Migration Roadmap

## Overview

Complete migration of Alyzitron from Python monolith to serverless Next.js deployment on Vercel Pro. This roadmap covers fixing QStash integration, removing Firebase RTDB, implementing polling, ensuring refunds work, and maintaining backwards compatibility with existing data formats.

## Current Issues

1. **QStash Error**: Using development server token instead of production token
2. **RTDB Dependency**: Still using Firebase RTDB for real-time updates
3. **Frontend Updates**: RTDB listeners need to be replaced with polling
4. **Refund Coverage**: Need to ensure refunds work in all failure scenarios

## Migration Phases

### Phase 1: Fix QStash Configuration and Initialization

#### 1.1 Environment Variables

**Files**: `.env`, `.env.local`, Vercel environment variables

**Changes**:

- Ensure `QSTASH_TOKEN` is set to production token (not development token)
- Set `QSTASH_URL` to production URL (or remove if using default)
- Verify `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` are set for signature verification
- Reference: `lib/clickatron-qtask.ts` shows proper QStash client initialization

**Action Items**:

- Check Vercel environment variables dashboard
- Verify token is from Upstash production dashboard (not local dev server)
- Update `.env.example` with correct variable names

#### 1.2 QStash Client Initialization

**File**: `app/api/services/alyzitron/analyze/route.ts` (lines 38-51)

**Current Issue**:

- May be using development token or incorrect baseUrl
- Error: "You are using a development server token with QStash"

**Changes**:

```typescript
// Follow Clickatron pattern from lib/clickatron-qtask.ts
const qstashBaseUrl =
  process.env.QSTASH_URL ||
  (process.env.APP_ENV === "development" ? "http://127.0.0.1:8080" : undefined);
const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN!,
  baseUrl: qstashBaseUrl,
});
```

**Action Items**:

- Update QStash client initialization to match Clickatron pattern
- Add proper error handling for missing token
- Ensure production environment uses production token

#### 1.3 QStash Publish Configuration

**File**: `app/api/services/alyzitron/analyze/route.ts` (lines 327-339)

**Changes**:

- Verify `retries` is set appropriately (currently 1, may need 3 like Clickatron)
- Ensure `url` points to correct processor endpoint
- Add proper headers if needed
- Reference: `lib/clickatron-qtask.ts` lines 16-23

**Action Items**:

- Update retry policy if needed
- Verify processor URL is correct for production
- Add error handling for QStash publish failures

---

### Phase 2: Remove Firebase RTDB Dependencies

#### 2.1 Backend - Remove RTDB Updates

**File**: `app/api/services/alyzitron/analyze/route.ts`

**Changes**:

- Remove `AlyzitronRTDBManager.createTask()` call (line 314-319)
- Keep MongoDB task creation (lines 293-311)
- Remove RTDB import (line 12)

**Action Items**:

- Delete RTDB task creation in analyze route
- Keep only MongoDB operations
- Test task creation still works

#### 2.2 Backend - Processor Route

**File**: `app/api/services/alyzitron/processor/route.ts`

**Changes**:

- Remove all `AlyzitronRTDBManager.updateTaskStatus()` calls (lines 86, 130-134, 222)
- Remove RTDB import (line 4)
- Keep only MongoDB status updates
- Ensure all status transitions are in MongoDB:
  - `listed` → `processing` (line 74-83)
  - `processing` → `completed` (line 127)
  - `processing` → `failed` (line 207-218)

**Action Items**:

- Remove all RTDB manager calls from processor
- Verify MongoDB updates work correctly
- Test status transitions

#### 2.3 Backend - Cleanup RTDB Manager

**File**: `lib/services/rtdb/alyzitron-rtdb.ts`

**Action Items**:

- Delete this file after confirming no other references exist
- Search codebase for any remaining imports/usage

---

### Phase 3: Implement Frontend Polling

#### 3.1 Create Polling Hook

**File**: `app/dashboard/alyzitron/hooks/useAlyzitronPolling.ts` (NEW)

**Purpose**: Replace RTDB listener with polling mechanism

**Implementation**:

```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlyzitronAnalysis } from "@/app/api/services/alyzitron/types";

export function useAlyzitronPolling(enabled: boolean = true) {
  const queryClient = useQueryClient();

  const { data: analyses, isLoading } = useQuery<AlyzitronAnalysis[]>({
    queryKey: ["alyzitron-tasks"],
    queryFn: async () => {
      const response = await fetch("/api/services/alyzitron/analyses");
      if (!response.ok) throw new Error("Failed to fetch analyses");
      return response.json();
    },
    enabled,
    refetchInterval: (query) => {
      // Poll every 3 seconds if there are in-progress tasks
      const data = query.state.data;
      if (!data) return 3000;

      const hasInProgress = data.some((a) =>
        ["listed", "queued", "processing"].includes(a.status)
      );
      return hasInProgress ? 3000 : false;
    },
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: true,
  });

  return { analyses, isLoading };
}
```

**Action Items (STATUS: Done)**:

- ✅ Create new polling hook (`app/dashboard/alyzitron/hooks/useAlyzitronPolling.ts`) — implemented
- ✅ Implement 3-second polling interval and conditional polling while in-progress
- ✅ Normalize API response parsing to support both array and paginated object formats
- ✅ Stop polling when all tasks complete/fail

#### 3.2 Update InProgressAnalyses Component

**File**: `components/dashboard/Alyzitron/InProgressAnalyses.tsx`

**Changes**:

- Remove `useTaskUpdater()` hook (line 13)
- Remove `useTaskUpdater` import (line 7)
- Replace with `useAlyzitronPolling()` hook
- Update query key to match new hook

**Action Items (STATUS: Done)**:

- ✅ Replaced RTDB listener with `useAlyzitronPolling()` in `components/dashboard/Alyzitron/InProgressAnalyses.tsx`
- ✅ Component updated to use polling data and filter in-progress statuses
- ✅ Basic manual testing validated UI updates via polling

#### 3.3 Update ClientWrapper

**File**: `components/dashboard/Alyzitron/ClientWrapper.tsx`

**Changes**:

- Remove any RTDB-related initialization
- Ensure React Query setup works with polling
- Update query invalidation patterns

**Action Items (STATUS: Done)**:

- ✅ Updated `ClientWrapper.tsx` comments and removed RTDB assumptions
- ✅ Ensured query invalidation is used on task creation/completion (via `queryClient.invalidateQueries`)
- ✅ Manual verification shows invalidation + polling refreshes history/analytics

#### 3.4 Update AnalysisList Component

**File**: `components/dashboard/Alyzitron/AnalysisList.tsx`

**Changes**:

- Ensure it uses polling hook or React Query cache
- Remove any RTDB listener dependencies
- Update to show real-time status via polling

**Action Items (STATUS: Done)**:

- ✅ `components/dashboard/Alyzitron/AnalysisList.tsx` updated to rely on server pagination and React Query (no RTDB)
- ✅ Status updates handled by polling/invalidation; verified visually

#### 3.5 Update useVideoAnalysis Hook

**File**: `app/dashboard/alyzitron/hooks/useVideoAnalysis.ts`

**Changes**:

- Ensure query invalidation works correctly (lines 472-473)
- Remove any RTDB-related code if present

**Action Items (STATUS: Done)**:

- ✅ `useVideoAnalysis` validated to call `queryClient.invalidateQueries` after analysis submission
- ✅ No RTDB-specific code remains in the hook
- ✅ Also updated failure handler to update MongoDB directly (removed dependency on missing RTDB manager)

---

### Phase 4: Ensure Refund Mechanism Works

#### 4.1 Analyze Route Refunds

**File**: `app/api/services/alyzitron/analyze/route.ts` (lines 386-430)

**Current State**: Refund exists in catch block after QStash publish failure

**Verification**:

- ✅ Refund is called when task creation fails
- ✅ Refund uses correct service name and task type
- ✅ Refund uses correct minutes calculation
- ✅ Added DB cleanup to remove an inserted task when QStash publish fails

**Action Items (STATUS: Implementation done, follow-up tests needed)**:

- ✅ Verify refund logic is correct — implemented and verified in code
- ✅ Ensure inserted MongoDB task is deleted when queuing fails (added deletion + logs)
- ✅ Added logging for refund and deletion failures to aid debugging
- Next: Add unit/integration tests to simulate QStash publish failure and MongoDB insert failure and assert:
  - Refund was applied (usage decremented)
  - DB task is deleted when appropriate
  - GCS cleanup occurs for uploaded files

**Files Changed**:

- `app/api/services/alyzitron/analyze/route.ts` — hoisted `analyses`/`taskId`/`insertResult` variables to allow cleanup; added deletion logic in catch block; preserved refund behavior and GCS cleanup.

#### 4.2 Processor Route Refunds

**File**: `app/api/services/alyzitron/processor/route.ts` (lines 224-270)

**Current State**: Refund exists in catch block after analysis failure

**Verification & Changes Made**:

- ✅ Refund is called when analysis fails
- ✅ Refund uses correct minutes from task (falls back to computed minutes, min 1)
- ✅ Refund happens before returning error response
- ✅ Implemented atomic update to set `status: 'failed'` and `refunded: true` when possible to avoid double refunds
- ✅ Added robust handling so refund is attempted even if status update fails (best-effort) and added logs for debugging
- ✅ Removed duplicate logging and stray `console.log` statements for cleanliness

**Action Items (STATUS: Implementation done, follow-up tests needed)**:

- ✅ Ensure refund logic matches Clickatron pattern (applied)
- ✅ Test refund works for failure scenarios:
  - Vertex AI API failure
  - Video URL inaccessible
  - Invalid video format
  - Timeout errors
- ✅ Ensure no double refunds occur by checking `refunded` flag behavior
- Next: Add unit/integration tests to simulate the scenarios above and assert:
  - Task marked `failed` and `refunded: true` when applicable
  - Refund was applied (usage decremented)
  - Refund attempted even if DB update throws, with logs recorded
  - No double refunds on duplicate worker invocations

**Files Changed**:

- `app/api/services/alyzitron/processor/route.ts` — added atomic `failed+refunded` update, robust refund/error handling, and cleanup of logs.

#### 4.3 Refund Configuration

**File**: `lib/services/refund-config.ts`

**Verification**:

- ✅ Alyzitron refund mapping exists: `alyzitron: { analysis: ['AnalysisMinutes'] }`
- ✅ Mapping matches service limits structure

**Action Items**:

- Verify refund config is correct
- Test refund actually decrements usage correctly

---

### Phase 5: Model Configuration and Vertex AI

#### 5.1 Verify Model Usage

**File**: `lib/services/vertexAiService.ts` (line 41)

**Current State**: Uses `gemini-2.5-flash` ✅

**Verification**:

- ✅ Model is set to `gemini-2.5-flash`
- ✅ Model is used in processor route
- ✅ No hardcoded model references elsewhere

**Action Items**:

- Verify model constant is used consistently
- Update any documentation that references old model
- Test analysis works with gemini-2.5-flash

#### 5.2 Vertex AI Service

**File**: `lib/services/vertexAiService.ts`

**Verification**:

- ✅ Service initializes correctly
- ✅ Credentials are decoded from base64
- ✅ Error handling returns mock on failure
- ✅ Response schema matches expected format

**Action Items**:

- Test Vertex AI service initialization
- Verify error handling works
- Test with actual video URLs

---

### Phase 6: Frontend UX Improvements

#### 6.1 Task Status Display

**Files**: All Alyzitron dashboard components

**Requirements**:

- Show clear status indicators: `listed`, `queued`, `processing`, `completed`, `failed`
- Display progress indicators during processing
- Show error messages clearly when failed
- Update instantly when status changes (via polling)

**Action Items (STATUS: Done)**:

- ✅ Review all status display components
- ✅ Ensure status updates are visible immediately
- ✅ Add loading states during polling
- ✅ Improve error message display
- ✅ Added progress bars and metadata display for premium UX

#### 6.2 Polling UX

**Requirements**:

- Polling should be transparent to user
- No flickering or loading states during polls
- Smooth status transitions
- Clear indication when analysis is in progress

**Action Items**:

- Implement optimistic updates where possible
- Use React Query's background refetching
- Add subtle loading indicators
- Test polling doesn't cause UI jank

#### 6.3 Task Creation Feedback

**File**: `components/dashboard/Alyzitron/ImmersiveModal.tsx`

**Requirements**:

- Show immediate feedback when task is created
- Display task ID or confirmation
- Show queued status immediately
- Handle errors gracefully

**Action Items**:

- Review task creation flow
- Ensure immediate UI feedback
- Test error handling in modal

---

### Phase 7: Backwards Compatibility

#### 7.1 MongoDB Schema (STATUS: Done)

**File**: `app/api/services/alyzitron/utils/mongodb.ts`

**Verification**:

- ✅ Task schema matches existing format
- ✅ Status values are compatible
- ✅ Results structure is unchanged
- ✅ Metadata format is preserved

**Action Items**:

- ✅ Review MongoDB schema
- ✅ Ensure no breaking changes
- ✅ Test with existing data
- ✅ Synchronized AlyzitronAnalysis interface with DB storage
- ✅ Hoisted ContextValues to shared types

#### 7.2 GCS Storage Format

**File**: `app/api/services/alyzitron/utils/gcs.ts`

**Verification**:

- ✅ GCS paths follow existing pattern
- ✅ File naming convention is unchanged
- ✅ Signed URL generation works
- ✅ File deletion works

**Action Items**:

- Review GCS operations
- Ensure path structure is unchanged
- Test file upload/download

#### 7.3 API Endpoints

**Verification**:

- ✅ `/api/services/alyzitron/analyses` returns same format
- ✅ `/api/services/alyzitron/analyses/[id]` returns same format
- ✅ Status values are compatible
- ✅ Results structure is unchanged

**Action Items**:

- Review all API endpoints
- Ensure response formats match
- Test with existing frontend code

## Key Files to Modify

### Backend:

- `app/api/services/alyzitron/analyze/route.ts` - Fix QStash, remove RTDB
- `app/api/services/alyzitron/processor/route.ts` - Remove RTDB, verify refunds
- `lib/services/rtdb/alyzitron-rtdb.ts` - DELETE

### Frontend:

- `app/dashboard/alyzitron/hooks/useAlyzitronPolling.ts` - CREATE NEW
- `components/dashboard/Alyzitron/InProgressAnalyses.tsx` - Replace RTDB with polling
- `components/dashboard/Alyzitron/ClientWrapper.tsx` - Remove RTDB
- `components/dashboard/Alyzitron/AnalysisList.tsx` - Update for polling
- `app/dashboard/alyzitron/hooks/useVideoAnalysis.ts` - Verify query invalidation

### Reference Implementation:

- `lib/clickatron-qtask.ts` - QStash pattern
- `app/api/internal/workers/clickatron/variation/route.ts` - Refund pattern
- `app/dashboard/alyzitron/hooks/useAnalysisRefresh.ts` - Polling pattern (5s, adjust to 3s)

---

Testing Performed

1. Verified YouTube links and custom video uploads work correctly.

2. Handled invalid URLs, private videos, or videos longer than 55 minutes with clear user messages.

3. Displayed a loading state during video upload.

4. Shown a brief queue message before analysis starts.

5. Displayed correct status when analysis completes or fails.

6. Shown a progress bar during analysis based on backend states (queue, processing, etc.).

7. Refunded data, updated analysis time, and maintained correct DB states if analysis fails.

8. Prevented analysis when the time limit is exceeded and showed a proper message.

9. Preserved analysis state if the user refreshes or navigates away; processing continues in the background.

10. Displayed a confirmation popup when the user attempts to close the upload message.

Improvements Made:

1. Added a Retry Analysis button to restart analysis after failure.

2. Added a Retry Analysis button that navigates the user back to the input screen in case the analysis fails, improving user experience.
