# Task: Migrate Alyzitron to Next.js (Phase 1)

## Overview
Migrate the **Alyzitron** (Video Analysis) service from the legacy Python monolith to the **Next.js** backend in this monorepo. 

**Important**: For this phase, we will **maintain** the dependency on Firebase Realtime Database (RTDB) to ensure seamless frontend compatibility.

## Architecture Change
*   **Old**: Next.js (Producer) -> Monolith (Worker) -> Firebase RTDB + MongoDB.
*   **New**: Next.js (Producer) -> QStash -> Next.js (Processor) -> Firebase RTDB + MongoDB.

## Requirements

### 1. The Trigger (Producer)
**File**: `app/api/services/alyzitron/generate/route.ts` (Update existing)
*   **Action**: 
    *   Remove calls to the Monolith.
    *   Create the initial Task in MongoDB with status `listed`.
    *   **Publish to QStash**: Send the task payload to the new processor endpoint.
    *   **Keep RTDB**: Continue to create the initial entry in RTDB (if the current producer does so) or leave it to the processor/existing logic.

### 2. The Worker (Processor)
**File**: `app/api/services/alyzitron/processor/route.ts` (New File)
*   **Trigger**: Recieves POST from QStash.
*   **Auth**: Verify `Upstash-Signature`.
*   **Logic**:
    1.  **Fetch Task**: Get task by ID from MongoDB.
    2.  **Status Update**: Set status to `processing` in **MongoDB AND Firebase RTDB**.
        *   *Note*: Use the existing `AlyzitronRTDBManager` (in `lib/services/rtdb/alyzitron-rtdb.ts`) to handle these updates.
    3.  **Video Analysis**:
        *   **Model**: Use **Google Vertex AI** (`gemini-3.0-flash`).
        *   **Process**:
            *   Extract/Download video (Support generic URLs & GCS).
            *   **Step 1**: Generate Analysis (Unstructured text).
            *   **Step 2**: Structure Output (JSON schema).
        *   *Tip*: Ensure no sensitive info (PII) leaks into the output.
    4.  **Completion**:
        *   Save `results` to MongoDB.
        *   Set status to `completed` in **MongoDB AND Firebase RTDB**.
    5.  **Error Handling & Refund**:
        *   Wrap the core logic in a `try/catch`.
        *   On Error:
            *   Log error details to MongoDB (`error` field).
            *   Set status to `failed` in MongoDB AND RTDB.
            *   **Refund Credits**:
                *   **Standard Pattern (see Clickatron)**: Call `processRefund()` directly inside the processor's catch block. This is the preferred approach when the worker is in the same codebase.
                *   **Reference**: `app/api/internal/workers/clickatron/variation/route.ts` (lines 468-473, 516-521).
                *   **How to call**:
                    ```typescript
                    import { processRefund } from '@/lib/services/tasks/simple-refund';
                    // ...
                    // In catch block:
                    await processRefund('alyzitron', 'analysis', userId, minutes);
                    ```
                *   The `minutes` value should be the video duration in minutes that was deducted during task creation.
                *   The `REFUND_MAPPING` config is in `lib/services/refund-config.ts`. Alyzitron's mapping is already defined: `alyzitron: { analysis: ['AnalysisMinutes'] }`.

### 3. Frontend Updates
*   **None Required**: The frontend (`AlyzitronTaskHistory.tsx`) should continue to work as-is because we are maintaining the RTDB status updates.

### 4. Utilities
*   **Environment**: (already done) Setup `GOOGLE_CLOUD_CREDENTIALS` for Vertex AI access.
*   **Legacy Code**: Do NOT delete `lib/services/rtdb/alyzitron-rtdb.ts`; it is still needed.
*   **Cleanup**: Delete the webhook route `/api/webhooks/services/alyzitron/refundUsage` (and `/cleanup` if present). It was only used by the Python monolith.

## Technical Details
*   **Model**: `gemini-3.0-flash`.
*   **Retry Policy**: Configure QStash with `retries: 1`.
*   **Credentials**: Check `.env.example`. `GOOGLE_CLOUD_CREDENTIALS` is expected to be a **Base64 encoded JSON string**. Ensure your parsed credentials logic handles this decoding (see existing GCS/Vertex AI logic in the codebase).

## Verification
1.  Start an analysis -> Verify MongoDB document is created.
2.  Verify Frontend updates status via RTDB.
3.  Verify success result contains the expected JSON structure.
4.  **Simulate a failure** (e.g., invalid video URL) -> Verify status is `failed` AND credits are refunded (check user's `currentPlan.serviceLimits.alyzitron`).
