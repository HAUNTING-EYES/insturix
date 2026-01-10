# Task: Migrate Musitron to TypeScript (Remove Monolith)

## Update: 2025-12-21
**Pivot**: We are abandoning the external Python monolithic backend. The entire Musitron "Generate Music" service must be migrated to our Next.js TypeScript backend.

## Objective
Migrate the music generation logic from the legacy Python monolith to a serverless architecture within this repository using **Next.js API Routes** and **Upstash QStash**.

## Why Migrate?
1.  **Unified Codebase**: Remove the need to maintain a separate Python service. Everything should reside in this TypeScript monorepo.
2.  **Infrastructure Efficiency**: We are already running QStash and are deployed on Vercel Pro. We can leverage QStash for async processing without needing a constantly running container.
3.  **Reliability**: The monolith had flawed error handling and opaque logging. A Typed implementation will be more robust.

**Legacy Monolith Repo**: *(Placeholder/Not Needed - Logic is documented below)*

## Architecture Plan

### 1. The Trigger (Producer)
**File**: `app/api/services/musitron/generate/route.ts`
*   **Current State**: Validates input, checks limits, then POSTs to Monolith.
*   **New State**: 
    1.  Validate inputs (Zod).
    2.  Check & Deduct Credits (Keep existing logic).
    3.  Create MongoDB Task (Status: `listed`).
    4.  **Publish a message to QStash** targeting our own processor endpoint.
    5.  Return `taskId` to client immediately.

### 2. The Worker (Consumer)
**New File**: `app/api/services/musitron/processor/route.ts`
*   **Trigger**: Recieves POST request from QStash.
*   **Auth**: Verify `Upstash-Signature` to ensure security.
*   **Responsibility**: 
    1.  Update DB/RTDB status to `processing`.
    2.  Call **Fal AI** (`fal-ai/ace-step`) to generate music.
    3.  Upload result to **Google Cloud Storage (GCS)**.
    4.  Update DB/RTDB status to `completed` with public URL.
    5.  **ErrorHandler**: If any step fails, mark as `failed` and **Refund Credits**.

## Detailed Implementation Steps

### Step 1: Dependencies & Setup
*   **Install**: `firebase-admin` (Required for backend privileges), `@upstash/qstash`, `@google-cloud/storage`, `@fal-ai/client`.
    *   *Note*: The project currently uses the `firebase` client SDK. For this backend processor, `firebase-admin` is recommended to bypass security rules and ensure reliability.
*   *Note*: Logic for MongoDB connection (`lib/musitron-mongo.ts`) already exists.

### Step 2: Implement the Processor (`/api/services/musitron/processor`)
Create a new route handler that accepts a JSON body containing `{ taskId, userId, params }`.

**Logic Flow**:
1.  **Fetch Task**: Load the task from MongoDB using `taskId`.
    *   *Improvement*: If task is missing or already completed, exit early (Idempotency).
2.  **Status Update**: Set Mongo & Firebase RTDB status to `processing`.
3.  **Fal AI Generation**:
    *   Use `@fal-ai/client` or direct fetch.
    *   **Model**: `fal-ai/ace-step`
    *   **Params**:
        *   `steps`: 60, `scheduler`: "euler", `guidance_scale`: 15, `guidance_type`: "apg"
        *   `seconds`: (From input, validate 5-240s)
        *   `prompt`: (From `style` input)
        *   `lyrics`: (From input, or "[inst]" if instrumental)
4.  **Upload to GCS**:
    *   Download the audio from Fal AI (buffer/stream).
    *   Upload to GCS Bucket: `musitron-bucket` (or check env).
    *   Path: `{userId}/music/{taskId}.wav`.
    *   Make public or generate signed URL (match existing behavior: public URL).
6.  **Legacy Realtime Updates**:
    *   **Goal**: We are phasing out Firebase RTDB, but it is currently required for frontend compatibility (e.g., Task History components).
    *   **Action**: continue to update Firebase RTDB at `musitron-tasks/{userId}/{taskId}/status` as the monolith did.
    *   **Note**: Mark this code section as `// TODO: Legacy - Remove once polling/subscription is migrated to MongoDB`
7.  **Completion**:
    *   Update Mongo: `status: "completed"`, `gcs_url: "..."`.
    *   Update RTDB: `status: "completed"`, `gcs_url: "..."` (Legacy).

**Error Handling & Refund (Crucial)**:
*   Wrap the core logic in a `try/catch`.
*   On Error:
    *   Log error details to MongoDB (`error` field).
    *   Set status to `failed` in MongoDB AND RTDB.
    *   **Refund Credits**:
        *   **Standard Pattern (see Clickatron)**: Call `processRefund()` directly inside the processor's catch block. This is the preferred approach.
        *   **Reference**: `app/api/internal/workers/clickatron/variation/route.ts` (lines 468-473, 516-521).
        *   **How to call**:
            ```typescript
            import { processRefund } from '@/lib/services/tasks/simple-refund';
            // ...
            // In catch block:
            await processRefund('musitron', 'music_generation', userId, 1);
            ```
        *   The last argument (`1`) is the "minutes" or count to refund. For Musitron, each generation counts as 1.
        *   The `REFUND_MAPPING` config is in `lib/services/refund-config.ts`. Musitron's mapping is: `musitron: { music_generation: ['maxMusicGeneration'] }`.
*   **Cleanup**: Delete the webhook route `/api/webhooks/services/musitron/refundUsage`. It was only used by the Python monolith.

### Step 3: Update the Producer (`/api/services/musitron/generate`)
*   Remove strict dependency on `MONOLITHIC_BACKEND_URL`.
*   Connect to MongoDB directly to insert the initial Task document.
*   Use `QStashClient` to publish to the processor URL.
    *   *Tip*: The destination URL checks `process.env.UPSTASH_CALLBACK_URL` or constructs it from `process.env.VERCEL_URL`.
    *   *Config*: Set `retries: 1` (Good balance: recovers from a random network blip without risking multiple expensive re-generations).

### Step 4: Improvements over Monolith
*   **Type Safety**: Use shared TypeScript interfaces for Task Schema.
*   **Validation**: Add Zod validation for `duration` and `lyrics` length *before* queuing.
*   **Cost**: This removes the need for a persistent Python server, reducing idle costs.

## Environment Variables Checklist
Ensure these are present in `.env`:
*   `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`
*   `FAL_KEY`
*   `MONGODB_URI`
*   **Firebase / Google Cloud**:
    *   `GOOGLE_CLOUD_CREDENTIALS`: (JSON string) - **Crucial** for `firebase-admin` and `google-cloud/storage` authentication.
    *   *Existing Client Keys*: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, etc., are already present for the frontend but the backend should primarily rely on the service account credentials.

## Verification
1.  Trigger a generation via UI.
2.  Check Queue logs (Upstash Dashboard) to see message delivery.
3.  Check Vercel logs for the `processor` function execution.
4.  Verify file appears in GCS and document updates in MongoDB/Firebase.
5.  **Simulate a failure** (e.g., pass an invalid `style` that Fal AI rejects) -> Verify status is `failed` AND credits are refunded (check user's `currentPlan.serviceLimits.musitron`).
