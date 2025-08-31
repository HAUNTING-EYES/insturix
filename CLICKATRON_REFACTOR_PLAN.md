# Clickatron Refactor Plan

This document outlines the technical plan for refactoring the Clickatron application to align with the simplified architecture defined in `CLICKATRON_NEW_REQUIREMENTS.md`.

## 1. Backend Refactoring

### 1.1. Remove QStash and Redis Integration

The entire asynchronous job processing layer will be removed.

-   **Delete Files**:
    -   `app/api/internal/workers/clickatron/` (and all sub-routes)
    -   `app/api/services/clickatron/jobs/` (and all sub-routes)
    -   `lib/qstash.ts`
    -   `lib/redis.ts` (if it exists)
-   **Modify Files**:
    -   Remove any code related to `QStash`, `Redis`, `Job`, `bullmq` from all backend files.
    -   Update environment variables (`.env.local`, `preview.env`) to remove `QSTASH_*` and `UPSTASH_*` variables.

### 1.2. Simplify API Endpoints

The API endpoints will be simplified to perform synchronous operations directly against MongoDB.

-   **`POST /api/services/clickatron/session`**:
    -   This endpoint will now handle the entire ideation process.
    -   **Input**: `{ videoIdea: string, aspectRatio: string }`
    -   **Process**:
        1.  Create a new task in `clickatron_tasks` collection with a unique `sessionId`.
        2.  Generate ideas (mocked or from a simple function).
        3.  Store the generated ideas in the MongoDB document.
        4.  **Return**: `{ sessionId: string, ideas: [...] }`

-   **`POST /api/services/clickatron/session/[id]/ideas/select`**:
    -   **Input**: `{ selectedIdea: object }`
    -   **Process**:
        1.  Find the task by `sessionId`.
        2.  Update the document with the `selectedIdea`.
        3.  Generate a default `canvas` object with one variation.
        4.  The variation will have `status: 'completed'` and a random mock image URL.
        5.  **Return**: `200 OK` with the updated session data.

-   **`PATCH /api/services/clickatron/session/[id]`**:
    -   This will be the sync endpoint for the canvas.
    -   **Input**: `{ canvas: object }`
    -   **Process**:
        1.  Find the task by `sessionId`.
        2.  Update the `canvas` object in the MongoDB document.
        3.  **Return**: `200 OK`.

-   **`GET /api/services/clickatron/history`**:
    -   **Process**: Fetch all tasks for the current user from MongoDB.
    -   **Return**: `[{ sessionId, title, ... }]`

-   **Delete Endpoints**:
    -   `GET /api/services/clickatron/jobs/[jobId]/stream`
    -   `POST /api/services/clickatron/generate-directions`
    -   `POST /api/services/clickatron/idea` (functionality merged into session creation)

### 1.3. Update MongoDB Schema

-   **`schemas/Clickatron.ts`**:
    -   Remove fields related to `jobId`, `qstashMessageId`, etc.
    -   Simplify the status fields.
    -   Ensure the schema matches the simplified structure with `videoIdea`, `aspectRatio`, `ideas`, `selectedIdea`, and `canvas` fields.

## 2. Frontend Refactoring

### 2.1. Remove Client-Side Database (IndexedDB)

All logic related to IndexedDB for session storage will be removed.

-   **Delete Files**:
    -   `lib/idb.ts`
    -   `lib/idb-mappers.ts`
    -   `lib/sync-runner.ts`
-   **Modify Files**:
    -   Remove all calls to `idb-promise` or local DB functions from all components.
    -   Remove `useAutoSave.ts` hook if it's tied to IndexedDB.

### 2.2. Simplify State Management (Zustand)

-   **`stores/useCanvasStore.ts`**:
    -   This store will hold the local JSON copy of the *entire* task object, not just the canvas.
    -   It will be initialized by fetching the data from `/api/services/clickatron/session/[id]`.
    -   Actions will be simplified to just update the local state.

### 2.3. Update Components

-   **`components/dashboard/Clickatron/ClickatronLabClient.tsx`**:
    -   This will be the main component for the `/dashboard/clickatron` page.
    -   It will fetch history from the new `/api/services/clickatron/history` endpoint.
    -   The form to start a new task will call the new `POST /api/services/clickatron/session` endpoint.
    -   On success, it will redirect to `/dashboard/clickatron/lab/[sessionId]`.

-   **`components/dashboard/Clickatron/stages/IdeationStage.tsx`**:
    -   This component will now be much simpler.
    -   It will receive the `ideas` as a prop (or fetch them if the design requires it).
    -   It will no longer need to poll for job status.
    -   Clicking an idea will call the `POST /api/services/clickatron/session/[id]/ideas/select` endpoint.
    -   On success, it will transition to the `CanvasStage`.

-   **`components/dashboard/Clickatron/stages/CanvasStage.tsx`**:
    -   This component will be responsible for the canvas UI.
    -   On mount, it will fetch the full task data to initialize the `useCanvasStore`.
    -   It will implement the debounced sync mechanism:
        -   A `useEffect` hook will watch for changes in the Zustand store.
        -   When changes are detected, it will use a debounce function to call a `syncData` function.
        -   The `syncData` function will send a `PATCH` request to `/api/services/clickatron/session/[id]` with the updated canvas data.

-   **`hooks/useClickatronSessions.ts`**:
    -   This hook will be refactored to remove all logic related to `react-query`'s complex caching and polling if it's not needed. It will be a simple fetch hook.

## 3. Task Execution Order

1.  **Create a TODO list.**
2.  **Backend Cleanup**: Delete unused files and folders related to QStash, Redis, and old API endpoints.
3.  **Schema Update**: Modify `schemas/Clickatron.ts`.
4.  **API Endpoint Implementation**:
    -   Rewrite `POST /api/services/clickatron/session`.
    -   Rewrite `POST /api/services/clickatron/session/[id]/ideas/select`.
    -   Rewrite `PATCH /api/services/clickatron/session/[id]`.
    -   Create `GET /api/services/clickatron/history`.
5.  **Frontend Cleanup**: Delete unused files related to IndexedDB.
6.  **State Management**: Refactor `useCanvasStore.ts`.
7.  **Component Refactoring**:
    -   Update `ClickatronLabClient.tsx`.
    -   Update `IdeationStage.tsx`.
    -   Update `CanvasStage.tsx`.
8.  **Final Testing**: Manually test the entire new workflow.