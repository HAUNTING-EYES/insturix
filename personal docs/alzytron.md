# Alzytron: In-Depth Technical Documentation

Alzytron (internal name: **Alyzitron**) is an AI-powered video analysis engine designed to extract meaningful insights, context-aware suggestions, and safety assessments from video content. It supports both local file uploads and YouTube URLs.

## 1. High-Level Workflow

The analysis process follows a structured path from the client to a background worker:

1.  **Source Input**: User selects a video file or pastes a YouTube link.
2.  **Context Selection**: User specifies the platform (Social Media, OTT, etc.), location, and other relevant details.
3.  **Upload & Ingestion**:
    *   **Files**: Uploaded directly to Google Cloud Storage (GCS) via signed URLs.
    *   **YouTube**: Validated via API to ensure accessibility and duration limits.
4.  **Task Queuing**: A task is created in MongoDB, credits are deducted, and a message is sent to **Upstash QStash**.
5.  **Processing**: A background processor receives the QStash message, calls **Vertex AI (Gemini)** for analysis, and stores results back in MongoDB.
6.  **Polling & Results**: The frontend polls the status and displays results once completed.

---

## 2. Frontend Components (`components/dashboard/Alyzitron`)

### `VideoUpload.tsx`
The primary entry point. It handles:
-   **File Drag-and-Drop**: Validates file type and duration (max 55 mins).
-   **YouTube Link Parsing**: Extracts video IDs and validates links via backend utility.
-   **Immersive Flow Transition**: Triggers the `ImmersiveModal`一旦 a valid source is provided.

### `ContextSelector.tsx`
A specialized form for capturing user intent:
-   **Platform**: Social Media, Documentary, TV/News, OTT/YouTube, or Custom.
-   **Location**: Global or specific country.
-   **Safety**: Toggle for "Family-Friendly" handling.
-   **Additional Details**: Open text for specific goals or context.

### `ImmersiveModal.tsx`
Manages the "State Machine" of the analysis:
-   Displays video previews (local or YouTube).
-   Wraps the `ContextSelector`.
-   Initiates the backend analysis call via `useVideoAnalysis`.
-   Handles auto-cleanup of GCS files if the modal is closed before analysis starts.

### `useVideoAnalysis.ts` (Hook)
Handles the heavy lifting of communication:
-   **GCS Signing**: Requests a signed URL from `/api/services/alyzitron/gcs/sign`.
-   **Direct Upload**: Uses `XMLHttpRequest` to upload files directly to GCS with progress tracking.
-   **Analysis Trigger**: Calls `/api/services/alyzitron/analyze` to start the backend workflow.

---

## 3. Backend Services (`app/api/services/alyzitron`)

### `analyze/route.ts`
The gateway for analysis tasks:
-   **Validation**: Ensures the video is accessible and within duration limits.
-   **Billing**: Integrates with `CreditsService` to calculate and deduct credits (duration-based).
-   **Persistence**: Creates a document in the `analyses` MongoDB collection with status `listed`.
-   **Messaging**: Publishes the task details to **Upstash QStash** for asynchronous processing.

### `processor/route.ts`
The worker endpoint (called by QStash):
-   **Execution**: Picks up the task and updates status to `processing`.
-   **Vertex AI Integration**: Calls `analyzeVideoWithGemini` (in `lib/services/vertexAiService`), passing the video URL and user context.
-   **Completion**: Saves the AI's JSON output to MongoDB and marks the task as `completed`.
-   **Robustness**: If analysis fails, it attempts to refund credits to the user automatically.

---

## 4. Key Configurations & Limits

-   **Duration Limit**: Max 55 minutes per video.
-   **File Size Limit**: Max 1GB.
-   **Storage**: Google Cloud Storage (dedicated bucket).
-   **Queueing**: Upstash QStash for reliable asynchronous execution and retries.
-   **AI Engine**: Google Vertex AI (Gemini 1.5 Pro/Flash).

---

## 5. Directory Structure Reference

```text
components/dashboard/Alyzitron/
├── VideoUpload.tsx       # Entry point
├── ImmersiveModal.tsx    # Flow manager
├── ContextSelector.tsx   # Context inputs
└── ...

app/api/services/alyzitron/
├── analyze/              # Task initiation API
├── processor/            # Background worker API
├── gcs/                  # Storage management (sign, delete)
├── utils/                # Loggers, MongoDB, YouTube helpers
└── types/                # Global type definitions
```
