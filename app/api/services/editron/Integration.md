# Editron v1 Python Backend Integration Guide

This document provides instructions for integrating a Next.js application (with its own backend) with the Editron v1 Python FastAPI server and its associated MongoDB database.

**Architecture Overview:**

*   **Python Backend (Editron v1):** Handles task submission (`POST /api/v1/autoshorts/`) and background processing. Updates task status in MongoDB. Does **not** provide endpoints for status checking or history.
*   **MongoDB:** Stores task details (`_id`, `user_id`, `youtube_url`, `status`, timestamps, `result`, `error`). Accessed directly by both the Python backend (write) and the Next.js backend (read/write).
*   **Next.js Backend:**
    *   Provides API endpoints for the Next.js frontend (e.g., `/api/tasks/submit`, `/api/tasks/status/:id`, `/api/tasks/history`).
    *   Handles user authentication and `user_id` management.
    *   Implements rate limiting logic before calling the Python backend.
    *   Calls the Python backend's `POST /api/v1/autoshorts/` to submit tasks.
    *   Directly queries MongoDB to fetch task status and history for its own API endpoints.
    *   Implements timeout logic when querying MongoDB.
*   **Next.js Frontend:** Interacts only with the Next.js backend's API endpoints.

## 1. Python Backend API Endpoint

### Submit Autoshorts Task

*   **URL:** `/api/v1/autoshorts/`
*   **Method:** `POST`
*   **Description:** Submits a YouTube video URL for processing. Called by the **Next.js backend**.
*   **Requires:** The Next.js backend must already have implemented rate limiting checks before calling this endpoint.

## 2. Python Backend Request Body

*   **Content-Type:** `application/json`

```json
{
  "youtube_url": "string", // Required: URL of the YouTube video (10-120 mins, non-Shorts)
  "user_id": "string"      // Required: Identifier for the user (provided by Next.js backend)
}
```

## 3. Python Backend Responses

### Success (Status Code: 201 Created)

Indicates the task was successfully queued by the Python backend.

```json
{
  "success": true,
  "message": "Task successfully submitted",
  "task_id": "string" // UUID of the created task in MongoDB
}
```
*(The Next.js backend receives this and should store/manage the `task_id`)*

### Client Error (Status Code: 400 Bad Request)

Indicates an issue with the request data sent by the Next.js backend.

```json
{
  "detail": "Specific error message (e.g., YouTube Shorts are not supported.)"
}
```

### Server Error (Status Code: 500 Internal Server Error)

Indicates an unexpected error within the Python backend during submission.

## 4. MongoDB Task Data Schema

Tasks are stored in the MongoDB collection specified by `MONGO_TASKS_COLLECTION` (default: `podcast_tasks`). The Next.js backend needs **read access** (and potentially write access for timeout updates) to this collection.

```typescript
// Interface for data queried from MongoDB by the Next.js backend
interface Task {
  _id: string; // Task UUID (Primary Key)
  user_id: string; // User identifier
  youtube_url: string; // Original YouTube URL submitted
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED"; // Current status
  created_at: Date; // Timestamp when the task was created
  updated_at: Date; // Timestamp when the task was last updated by Python backend
  result: {
    gcsUrl: string[]; // Array of GCS URLs (populated on COMPLETED)
  };
  error?: { // Details about the error (populated on FAILED by Python backend or inferred by Next.js backend for timeout)
    code?: string; // e.g., "TIMEOUT", "PROCESSING_ERROR"
    message?: string;
    details?: any;
  };
}
```

## 5. Task Status Flow (as observed by Next.js Backend)

1.  **`QUEUED`**: Task document created by Python backend.
2.  **`PROCESSING`**: Python backend updates status. `updated_at` changes.
3.  **`COMPLETED`**: Python backend updates status. `result.gcsUrl` populated. `updated_at` changes.
4.  **`FAILED`**: Python backend updates status and `error` field OR Next.js backend determines a timeout occurred (see Section 7).

## 6. Next.js Backend Responsibilities

The Next.js backend acts as the intermediary and needs to implement the following:

1.  **API for Frontend:** Create endpoints like:
    *   `POST /api/tasks/submit`: Receives request from frontend, performs rate check, calls Python backend, returns `task_id`.
    *   `GET /api/tasks/status/:id`: Receives `task_id` from frontend, queries MongoDB, checks for timeout, returns current status/result/error.
    *   `GET /api/tasks/history`: Receives user info from frontend, queries MongoDB for user's tasks, returns list.
2.  **MongoDB Connection:** Establish a connection to the MongoDB database (`MONGO_URI`, `MONGO_DB_NAME`, `MONGO_TASKS_COLLECTION`).
3.  **Rate Limiting:**
    *   **Rule:** Each `user_id` should only be allowed to submit **one** task within a 24-hour period.
    *   **Implementation:** Before calling the Python backend's `/api/v1/autoshorts/`, query MongoDB for the user's most recent task. Check its `created_at` timestamp. If less than 24 hours ago, return an error (e.g., 429) to the frontend. Do **not** call the Python backend.
4.  **Timeout Handling:**
    *   **Rule:** Tasks stuck in `QUEUED` or `PROCESSING` for 20+ minutes are considered timed out.
    *   **Implementation:** When handling `GET /api/tasks/status/:id`:
        *   Query MongoDB for the task.
        *   If the status is `QUEUED` or `PROCESSING` and the `updated_at` timestamp (or `created_at` if `updated_at` is the same) is older than 20 minutes:
            *   Return a `FAILED` status with a timeout error message to the frontend.
            *   *(Optional but recommended):* Update the task document in MongoDB to `status: FAILED` with the timeout error details, if the Next.js backend has write permissions. This prevents repeated timeout checks.

## 7. Frontend Implementation

The Next.js frontend interacts *only* with the Next.js backend APIs:

*   Calls `POST /api/tasks/submit` to start a task.
*   Stores the returned `task_id`.
*   Polls `GET /api/tasks/status/:id` to show progress.
*   Calls `GET /api/tasks/history` to display past tasks.