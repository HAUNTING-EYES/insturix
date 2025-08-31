# Clickatron Simplified Workflow Requirements

This document outlines the refactored and simplified workflow for the Clickatron application. The primary goal is to create a more streamlined, maintainable, and easy-to-understand architecture by removing unnecessary complexity.

## Core Principles

- **Single Source of Truth**: MongoDB is the only persistent data store. No client-side databases (IndexedDB) or local storage should be used for storing session state.
- **Stateless Frontend**: The frontend should be as stateless as possible, fetching data from the backend on demand.
- **Simplified Backend**: Remove all asynchronous job queuing and management systems like QStash and Redis. All API calls will be synchronous.
- **Simplified Data Flow**: Data flows from the frontend to the backend via API calls, is processed, stored in MongoDB, and then returned to the frontend.

## Detailed Workflow

### 1. Dashboard (`/dashboard/clickatron`)

- When a user navigates to the dashboard, the frontend will make a single API call to fetch the user's entire Clickatron task history from MongoDB.
- The history will be displayed in a simple list on the frontend.

### 2. Starting a New Task (Ideation)

- The user types an idea and selects an aspect ratio on the dashboard.
- On clicking "Get Ideas", the frontend makes a `POST` API call to the backend (e.g., `/api/services/clickatron/session`).
- The request payload will contain the `idea` and `aspectRatio`.
- The backend creates a new task document in the MongoDB `clickatron_tasks` collection with a unique `sessionId` (or `taskId`). This initial document will contain the user's idea and aspect ratio.
- The backend returns the `sessionId` to the frontend.

### 3. Idea Generation

- The frontend navigates to a new route using the received `sessionId` (e.g., `/dashboard/clickatron/lab/[sessionId]`).
- On this page, the frontend will show a loading state like "Generating ideas...".
- The backend, in the same request from the previous step (or a new one if needed), will generate a list of ideas.
- Once the ideas are generated, they are stored in the corresponding task document in MongoDB.
- The backend returns the generated ideas to the frontend.
- The frontend displays the ideas to the user.

### 4. Idea Selection and Canvas Initialization

- When the user clicks on an idea, the frontend makes a `POST` API call to the backend (e.g., `/api/services/clickatron/session/[sessionId]/select-idea`).
- The request payload will contain the `selectedIdea`.
- The backend updates the task document in MongoDB, storing the `selectedIdea` details.
- The backend will then create a default `canvas` object within the same task document.
- This `canvas` object will include one default variation with a `status` of "completed" and a randomly selected mock image URL. The aspect ratio will match the one chosen by the user.
- The backend returns a `200 OK` response to the frontend.
- The frontend, upon receiving the successful response, will load the canvas interface. It should show a loading state until the 200 response is received.

### 5. Canvas Interaction and Data Sync

- The canvas view will have a local JSON object in its state (e.g., using React state or Zustand) that is a copy of the task data from MongoDB. This state will be initialized by fetching the latest task data from the backend when the canvas loads.
- Any modification made by the user on the canvas (e.g., changing text, moving elements) will immediately update this local JSON state.
- A mechanism will be implemented (e.g., a `useEffect` hook with a debounce function, or a periodic check every few seconds) to detect changes in the local JSON state.
- If changes are detected, the frontend will "sync" the data with the backend by sending the updated canvas data in a `PATCH` request to an endpoint like `/api/services/clickatron/session/[sessionId]`.
- The backend will update the corresponding task document in MongoDB with the new data.

## Technology Stack (Changes)

- **Removed**:
  - `QStash`
  - `Redis`
  - `IndexedDB` (for session data)
  - `react-query` for local state management (can still be used for server state caching if desired, but not for complex offline logic).
- **Kept**:
  - `Next.js` (with App Router)
  - `MongoDB` (with Mongoose)
  - `Zustand` (for managing the local copy of the canvas JSON state)
  - `Tailwind CSS`
  - `Framer Motion`

## Data Schema

The MongoDB schema should be adapted to this new simplified flow. It will no longer need fields related to jobs, job IDs, or complex status tracking for async tasks.

A single `clickatron_tasks` document should represent the entire state of a task, from idea to the final canvas state.