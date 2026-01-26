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
const qstashBaseUrl = process.env.QSTASH_URL || 
  (process.env.APP_ENV === 'development' ? 'http://127.0.0.1:8080' : undefined);
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';

export function useAlyzitronPolling(enabled: boolean = true) {
  const queryClient = useQueryClient();
  
  const { data: analyses, isLoading } = useQuery<AlyzitronAnalysis[]>({
    queryKey: ['alyzitron-tasks'],
    queryFn: async () => {
      const response = await fetch('/api/services/alyzitron/analyses');
      if (!response.ok) throw new Error('Failed to fetch analyses');
      return response.json();
    },
    enabled,
    refetchInterval: (query) => {
      // Poll every 3 seconds if there are in-progress tasks
      const data = query.state.data;
      if (!data) return 3000;
      
      const hasInProgress = data.some(a => 
        ['listed', 'queued', 'processing'].includes(a.status)
      );
      return hasInProgress ? 3000 : false;
    },
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: true,
  });
  
  return { analyses, isLoading };
}
```

**Action Items**:
- Create new polling hook
- Implement 3-second polling interval
- Only poll when tasks are in-progress
- Stop polling when all tasks complete/fail

#### 3.2 Update InProgressAnalyses Component
**File**: `components/dashboard/Alyzitron/InProgressAnalyses.tsx`

**Changes**:
- Remove `useTaskUpdater()` hook (line 13)
- Remove `useTaskUpdater` import (line 7)
- Replace with `useAlyzitronPolling()` hook
- Update query key to match new hook

**Action Items**:
- Replace RTDB listener with polling hook
- Update component to use polling data
- Test real-time updates work via polling

#### 3.3 Update ClientWrapper
**File**: `components/dashboard/Alyzitron/ClientWrapper.tsx`

**Changes**:
- Remove any RTDB-related initialization
- Ensure React Query setup works with polling
- Update query invalidation patterns

**Action Items**:
- Review and update ClientWrapper
- Remove RTDB dependencies
- Test query invalidation on task creation

#### 3.4 Update AnalysisList Component
**File**: `components/dashboard/Alyzitron/AnalysisList.tsx`

**Changes**:
- Ensure it uses polling hook or React Query cache
- Remove any RTDB listener dependencies
- Update to show real-time status via polling

**Action Items**:
- Review component for RTDB usage
- Update to use polling mechanism
- Test status updates

#### 3.5 Update useVideoAnalysis Hook
**File**: `app/dashboard/alyzitron/hooks/useVideoAnalysis.ts`

**Changes**:
- Ensure query invalidation works correctly (lines 472-473)
- Verify cache updates trigger UI refresh
- Remove any RTDB-related code if present

**Action Items**:
- Review hook for RTDB dependencies
- Ensure proper query invalidation
- Test cache updates

---

### Phase 4: Ensure Refund Mechanism Works

#### 4.1 Analyze Route Refunds
**File**: `app/api/services/alyzitron/analyze/route.ts` (lines 386-406)

**Current State**: Refund exists in catch block after QStash publish failure

**Verification**:
- ✅ Refund is called when task creation fails
- ✅ Refund uses correct service name and task type
- ✅ Refund uses correct minutes calculation

**Action Items**:
- Verify refund logic is correct
- Test refund works when QStash publish fails
- Test refund works when MongoDB insert fails

#### 4.2 Processor Route Refunds
**File**: `app/api/services/alyzitron/processor/route.ts` (lines 224-245)

**Current State**: Refund exists in catch block after analysis failure

**Verification**:
- ✅ Refund is called when analysis fails
- ✅ Refund uses correct minutes from task
- ✅ Refund happens before returning error response

**Action Items**:
- Verify refund logic matches Clickatron pattern
- Test refund works for various failure scenarios:
  - Vertex AI API failure
  - Video URL inaccessible
  - Invalid video format
  - Timeout errors
- Ensure refund happens even if status update fails

#### 4.3 Refund Configuration
**File**: `lib/services/refund-config.ts`

**Verification**:
- ✅ Alyzitron refund mapping exists: `alyzitron: { analysis: ['AnalysisMinutes'] }`
- ✅ Mapping matches service limits structure

**Action Items**:
- Verify refund config is correct
- Test refund actually decrements usage correctly

#### 4.4 Error Handling Coverage
**Action Items**:
- Create test cases for all failure scenarios:
  - QStash publish failure
  - MongoDB connection failure
  - Vertex AI API failure
  - Video processing failure
  - Timeout scenarios
- Ensure refund is called in all cases
- Verify no double refunds occur

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

**Action Items**:
- Review all status display components
- Ensure status updates are visible immediately
- Add loading states during polling
- Improve error message display

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

#### 7.1 MongoDB Schema
**File**: `app/api/services/alyzitron/utils/mongodb.ts`

**Verification**:
- ✅ Task schema matches existing format
- ✅ Status values are compatible
- ✅ Results structure is unchanged
- ✅ Metadata format is preserved

**Action Items**:
- Review MongoDB schema
- Ensure no breaking changes
- Test with existing data

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

---

### Phase 8: Testing and Validation

#### 8.1 Unit Tests
**Action Items**:
- Test QStash client initialization
- Test refund mechanism
- Test status transitions
- Test polling hook

#### 8.2 Integration Tests
**Action Items**:
- Test full analysis flow:
  1. Create task
  2. Queue in QStash
  3. Process in worker
  4. Complete analysis
  5. Update frontend via polling
- Test failure scenarios:
  1. QStash failure → refund
  2. Analysis failure → refund
  3. Network failure → refund
- Test polling:
  1. Status updates appear within 3 seconds
  2. Polling stops when tasks complete
  3. No excessive API calls

#### 8.3 End-to-End Tests
**Action Items**:
- Test user flow from upload to completion
- Test error handling from user perspective
- Test refund verification (check user limits)
- Test with multiple concurrent analyses

#### 8.4 Performance Tests
**Action Items**:
- Verify polling doesn't cause performance issues
- Test with multiple in-progress tasks
- Verify API rate limits aren't exceeded
- Test QStash queue performance

---

### Phase 9: Cleanup and Documentation

#### 9.1 Code Cleanup
**Action Items**:
- Delete `lib/services/rtdb/alyzitron-rtdb.ts`
- Remove unused RTDB imports
- Remove unused Firebase dependencies (if only used for Alyzitron RTDB)
- Clean up commented code
- Remove migration task files after completion

#### 9.2 Documentation Updates
**Action Items**:
- Update API documentation
- Update service README
- Document polling mechanism
- Document refund process
- Update environment variable documentation

#### 9.3 Migration Verification Checklist
- [ ] QStash uses production token
- [ ] No RTDB dependencies remain
- [ ] Polling works at 3-second intervals
- [ ] Refunds work in all failure scenarios
- [ ] Model is gemini-2.5-flash
- [ ] MongoDB format unchanged
- [ ] GCS format unchanged
- [ ] Frontend updates instantly
- [ ] All tests pass
- [ ] Documentation updated

---

## Implementation Sequence

### Recommended Order:
1. **Phase 1** - Fix QStash (blocks everything else)
2. **Phase 2** - Remove RTDB from backend (clean separation)
3. **Phase 3** - Implement frontend polling (depends on Phase 2)
4. **Phase 4** - Verify refunds (can be done in parallel)
5. **Phase 5** - Verify model (quick check)
6. **Phase 6** - UX improvements (polish)
7. **Phase 7** - Compatibility verification (testing)
8. **Phase 8** - Comprehensive testing
9. **Phase 9** - Cleanup and docs

### Critical Path:
**Phase 1 → Phase 2 → Phase 3** must be done sequentially. Other phases can be done in parallel or in any order.

---

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

## Environment Variables Required

```bash
# QStash (Production)
QSTASH_TOKEN=<production-token>
QSTASH_URL=<production-url-or-empty>
QSTASH_CURRENT_SIGNING_KEY=<signing-key>
QSTASH_NEXT_SIGNING_KEY=<next-signing-key>

# Vertex AI
GOOGLE_CLOUD_CREDENTIALS=<base64-encoded-json>

# App
NEXT_PUBLIC_APP_URL=<vercel-url>
VERCEL_URL=<vercel-url>
```

---

## Success Criteria

1. ✅ QStash error resolved - no development token errors
2. ✅ RTDB completely removed - no Firebase dependencies for Alyzitron
3. ✅ Polling works - frontend updates every 3 seconds
4. ✅ Refunds work - all failure scenarios refund credits
5. ✅ Model correct - gemini-2.5-flash used
6. ✅ Backwards compatible - existing data formats preserved
7. ✅ UX clear - status updates visible instantly
8. ✅ No regressions - existing functionality works

---

## Notes

- All changes should be rolled out at once (no phased rollout needed)
- Maintain backwards compatibility with existing MongoDB and GCS data
- Use Clickatron implementation as reference for QStash and refunds
- Polling interval is 3 seconds as specified
- Refund mechanism should follow Clickatron pattern exactly

