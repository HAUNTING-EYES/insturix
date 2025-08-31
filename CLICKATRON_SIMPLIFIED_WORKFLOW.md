# Clickatron: The Refactored & Simplified Workflow

This document details the current, simplified architecture and data flow of the Clickatron application. The core philosophy is to maintain a simple, synchronous, and maintainable codebase with MongoDB as the single source of truth.

## Core Architecture Principles

-   **Simplicity**: All unnecessary complexity has been removed. The data flow is linear and easy to trace.
-   **Single Source of Truth**: **MongoDB** is the definitive store for all user and session data. There is no reliance on client-side databases like IndexedDB or caches like Redis for state.
-   **Synchronous Operations**: The asynchronous job queue system (QStash, Redis) has been eliminated. All backend operations are now simple, synchronous API calls that the frontend awaits.
-   **Stateless Frontend Components**: Frontend components are designed to be as stateless as possible. They fetch their state from a central Zustand store, which in turn is hydrated from the backend.

## The User Workflow

### 1. The Dashboard: History View

-   **Action**: A user navigates to `/dashboard/clickatron`.
-   **Flow**:
    1.  The `ClickatronHistory` component mounts.
    2.  It triggers a single `GET` request to `/api/services/clickatron/history`.
    3.  The backend fetches all tasks associated with the authenticated user from the `clickatron_tasks` collection in MongoDB, sorted by the most recently updated.
    4.  A simplified list of sessions (containing `sessionId`, `title`, `updatedAt`) is returned and rendered.

### 2. Starting a New Task

-   **Action**: The user types a video idea, selects an aspect ratio, and clicks "Get Ideas".
-   **Flow**:
    1.  The `VideoIdeaInput` component triggers the `createSession` action in the Zustand store.
    2.  This action sends a `POST` request to `/api/services/clickatron/session` with the `videoIdea` and `aspectRatio`.
    3.  The backend:
        -   Creates a new document in the `clickatron_tasks` collection.
        -   Generates a set of mock ideas based on the user's input.
        -   Saves the `videoIdea`, `aspectRatio`, and the generated `ideas` into the new document.
        -   Returns the new `sessionId` and the `ideas` to the frontend.
    4.  The frontend receives the `sessionId` and immediately navigates the user to the lab environment at `/dashboard/clickatron/lab/[sessionId]`.

### 3. The Lab: Ideation Stage

-   **Action**: The user is presented with the generated ideas.
-   **Flow**:
    1.  The `ClickatronLabClient` component mounts and uses the `sessionId` from the URL to call the `loadSession` action in the store.
    2.  `loadSession` fetches the complete task object from the backend.
    3.  The `IdeationStage` component receives the list of `ideas` from the store and renders them.
    4.  When the user clicks on an idea, the `onSelectIdea` callback is triggered.
    5.  This calls the `selectIdea` action in the store, which sends a `POST` request to `/api/services/clickatron/session/[id]/ideas/select` with the chosen idea object.
    6.  The backend:
        -   Finds the corresponding task document.
        -   Saves the `selectedIdea`.
        -   **Initializes the canvas**: It creates a `canvas` object within the same document, containing a `variations` array with one default, "completed" variation. This variation includes a randomly selected mock image URL.
        -   Returns a `200 OK` success response.
    7.  Upon receiving the success response, the `selectIdea` action automatically calls `loadSession` again to refresh the task data. The presence of the `canvas` object in the task data signals the UI to transition to the Canvas Stage.

### 4. The Canvas: Local State and Auto-Sync

This is the most critical part of the new local data handling strategy.

-   **State Management**:
    -   The `CanvasStage` component is the primary interface for editing.
    -   All canvas data (variations, edits, etc.) is held within the central **Zustand store**'s `task` object. This is the local, in-memory "source of truth" for the UI.
    -   There is **no** persistent local storage (like IndexedDB or localStorage). If the user refreshes the page, the state is re-fetched from MongoDB.

-   **Auto-Sync Nuance**:
    1.  When a user performs any action that modifies the canvas (e.g., adds a variation, changes a color), the change is immediately applied to the local Zustand store via the `updateCanvas` action. This makes the UI feel instantaneous.
    2.  The `CanvasStage` component uses a `useDebounce` hook to watch for changes to the `canvas` object in the store.
    3.  After a period of inactivity (e.g., 1 second), the debounced hook triggers.
    4.  It calls the `syncCanvas` action from the store, sending a `PATCH` request to `/api/services/clickatron/session/[id]` with the entire updated `canvas` object.
    5.  The backend receives this payload and overwrites the `canvas` field in the corresponding MongoDB document.

-   **Simplicity and Resilience**:
    -   This "auto-save" is simple and robust. It doesn't require complex offline queueing or manual save buttons.
    -   The flow is one-way for edits: **UI -> Local Store -> (Debounced) -> Backend**.
    -   It ensures that the latest user work is regularly persisted to the database without overwhelming the backend with requests on every minor change.