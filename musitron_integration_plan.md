# Musitron Integration Plan

This document outlines the architecture and integration plan for the `musitron` service, which will generate music based on user prompts. The design is heavily inspired by the `alyzitron` service, leveraging a decoupled microservice architecture.

## Integration Checklist

### Backend Development

1.  **Environment Setup**:
    *   Add all new environment variables (listed below) to the `.env` file.

2.  **Task Service Implementation**:
    *   Create `lib/services/common/services/musitron-task-service.ts` to implement the `TaskService` interface for `musitron`.
    *   Create `lib/services/common/services/musitron-rtdb-service.ts` to implement the `RTDBService` interface.
    *   Update `lib/services/common/task-service.ts` to include the `musitron` service configuration.

3.  **API Endpoint Creation**:
    *   Create a new API route at `app/api/services/musitron/generate/route.ts` to handle music generation requests.
    *   This endpoint will be responsible for:
        *   Validating user input.
        *   Creating a new task in the MongoDB `musitron-tasks` collection.
        *   Publishing a message to the Pub/Sub topic.
        *   Returning the `taskId` to the client.

4.  **Webhook Implementation**:
    *   Create webhook endpoints to handle status updates from the `musitron` microservice (e.g., `app/api/webhooks/services/musitron/[status]/route.ts`).
    *   These webhooks will update the task status in MongoDB and the RTDB.

### Frontend Development

1.  **API Integration**:
    *   Update the `MusicGenerator.tsx` component to call the new `/api/services/musitron/generate` endpoint.
    *   Ensure the `customMode` flag and all form data are correctly passed in the request.

2.  **Real-time Status Updates**:
    *   Use the `taskId` returned from the generation request to subscribe to real-time updates from the RTDB at `/musitron-tasks/{userId}/{taskId}/status`.
    *   Update the UI to reflect the current task status (e.g., "queued", "processing", "complete", "failed").

3.  **Displaying Results**:
    *   When the task is complete, fetch the generated music data from the backend and display it in the `MusicCard.tsx` component.

## New Environment Variables

```
# Musitron Service
MUSITRON_GCP_PROJECT_ID="your-gcp-project-id"
MUSITRON_PUBSUB_TOPIC_ID="musitron-tasks-topic"
MUSITRON_GCS_BUCKET_NAME="musitron-audio-bucket"
```

## Data Structures

### MongoDB Schema (`musitron-tasks` collection)

```json
{
  "_id": "ObjectId('...')", // Task ID
  "userId": "string",
  "status": "string", // e.g., "queued", "processing", "complete", "failed"
  "gcsAudioLink": "string", // Link to the generated audio file in GCS
  "createdAt": "ISODate",
  "options": {
    "customMode": "boolean",
    "title": "string",
    "instrumental": "boolean",
    // Simple Mode
    "songDescription": "string", // Optional
    // Custom Mode
    "style": "string", // Optional
    "lyrics": "string" // Optional
  },
  "error": { // Optional
    "code": "string",
    "message": "string"
  }
}
```

### RTDB Structure

The Real-time Database will be used to track the status of each task.

**Path**: `/musitron-tasks/{userId}/{taskId}/status`

**Value**: `"queued" | "processing" | "complete" | "failed"`

**Example**:
```
/musitron-tasks/user_123/60d5ecb8b48f4b3a8c8f8b7a/status: "processing"
```

### Pub/Sub Message Format

This is the JSON payload that will be sent to the `musitron` microservice.

```json
{
  "taskId": "string", // The _id from the MongoDB document
  "userId": "string",
  "options": {
    "customMode": "boolean",
    "title": "string",
    "instrumental": "boolean",
    // Simple Mode
    "songDescription": "string", // Optional
    // Custom Mode
    "style": "string", // Optional
    "lyrics": "string" // Optional
  }
}