# Refactoring Plan: Reference Images and Chat History Removal

This document outlines the architectural changes required to refactor the reference image handling and remove the chat history feature from the Clickatron application.

## 1. High-Level Objectives

-   **Eliminate Base64 Encoding**: Move away from sending base64-encoded images from the frontend to the backend.
-   **GCS for Reference Images**: Upload reference images directly to Google Cloud Storage (GCS) from the frontend.
-   **Store GCS Links**: Store an array of GCS URLs for reference images in the `variation` object in MongoDB, instead of base64 data.
-   **On-Demand Signed URLs**: Ensure all GCS image links are converted to fresh, signed URLs just before being sent to the Fal AI generation service.
-   **Remove Chat History**: Completely remove the chat history feature from both the frontend UI and the backend data models.

## 2. Detailed Architectural Changes

### 2.1. Frontend Changes

#### `AICommandConsole.tsx` & `NewVariationConsole.tsx`

1.  **Image Handling Logic**:
    -   When a user selects an image file (via file input or paste), instead of uploading it immediately, the raw `File` object will be stored in the component's local state.
    -   The UI will generate and display local object URLs (`URL.createObjectURL()`) for the image thumbnails. This avoids premature uploads and network requests.
    -   The `referenceImages` state will hold an array of `File` objects.

2.  **Submission Logic (`onGenerate`)**:
    -   The `onGenerate` prop will be called with the prompt and the array of `File` objects.

3.  **Chat History Removal**:
    -   Remove the `ChatHistory` component and all related state and props (`chatHistory`, `showChatHistory`).

#### `CanvasStage.tsx`

1.  **`handleAIGenerate` Function**:
    -   This function will receive the prompt and an array of `File` objects for reference images.
    -   It will construct a `FormData` object.
    -   The prompt and other metadata will be appended to the `FormData`.
    -   Each reference image `File` object will be appended to the `FormData`.
    -   A single `POST` request with this `multipart/form-data` payload will be sent to the variation creation API endpoint.

### 2.2. Backend Changes

#### Variation API Endpoint (`/api/services/clickatron/session/[id]/variation/route.ts`)

1.  **Request Handling**:
    -   The endpoint will be modified to accept `multipart/form-data` instead of `application/json`.
    -   It will parse both the text fields (prompt, metadata) and the image files from the request.

2.  **GCS Upload**:
    -   For each file received in the request, the handler will use the `ClickatronGCSManager` to upload it directly to GCS.
    -   The resulting GCS URIs will be collected into an array.

3.  **Data Storage**:
    -   When creating a new `variation` object, the `referenceImages` array of GCS URLs will be stored directly in the MongoDB document.
    -   The `chatHistory` array will be removed from the `canvas` schema and all related logic.
3.  **Job Enqueueing**: The `referenceImages` array of GCS URLs will be passed to the QStash job payload for the worker to use.

#### Variation Schema (`schemas/Clickatron.ts`)

1.  **Variation Schema**:
    -   The `imageRef` field (string) will be updated to store the GCS URL of the generated image. A new field, `referenceImageRefs: [String]`, will be added to store the GCS URIs of the uploaded reference images.
    2.  **Canvas Schema**:
        -   The `chatHistory` array will be removed from the schema.
    
    #### Worker (`/api/internal/workers/clickatron/variation/route.ts`)
    
    1.  **Job Payload**: The worker will receive the `referenceImageRefs` array (containing the raw GCS URIs of the reference images) in its job payload.
    2.  **Signed URL Generation**:
    -   Before calling the Fal AI service, iterate through the `referenceImageRefs` array.
    -   For each GCS URI, call `ClickatronGCSManager.getSignedUrl()` to generate a fresh, short-lived signed URL.
3.  **Payload Construction**:
    -   Construct the `generationParams` for the Fal AI API call.
    -   The `image_urls` parameter (or equivalent, based on the model's `parameterMapping`) will be populated with the array of newly generated signed URLs.
    -   If a `parentVariationId` is also present, its `imageRef` must also be converted to a signed URL and included in the `image_urls` array. The logic must correctly combine parent and reference images.

## 3. Data Flow Summary (New)

1.  **Select**: User selects local image files. Frontend stores `File` objects in state and displays thumbnails using local object URLs.
2.  **Submit**: User clicks "Generate". Frontend sends a single `multipart/form-data` request containing the prompt text and the `File` objects.
3.  **Upload & Store**: The backend API endpoint receives the request, uploads each file to GCS, and collects the resulting GCS URIs.
4.  **DB & Queue**: The backend creates a variation document in MongoDB, storing the GCS URIs in `referenceImageRefs`. It then enqueues a job for the worker, passing these URIs.
5.  **Process**: The worker receives the job, generates fresh signed URLs for the GCS URIs, and calls the Fal AI service with them.
6.  **Complete**: Worker saves the resulting generated image to GCS and updates the variation document.

This approach is more robust, scalable, and performant by offloading image storage to GCS and avoiding the overhead of base64 encoding.