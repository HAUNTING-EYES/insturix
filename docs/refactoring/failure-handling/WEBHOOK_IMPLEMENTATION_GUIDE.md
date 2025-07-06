# Guide: Implementing Failure Reporting Webhooks

## 1. Overview

To ensure that task failures are handled immediately and reliably, your microservice (`alyzitron`, `clickatron`, etc.) **must** call a designated webhook endpoint in the main application whenever a task fails definitively during processing.

This guide provides the necessary details to implement this callback.

## 2. Webhook Endpoint URL

The structure for the webhook URL is:

```
https://<YOUR_APP_DOMAIN>/api/webhooks/services/<SERVICE_NAME>
```

-   **`<YOUR_APP_DOMAIN>`**: The production domain of the main frontend application.
-   **`<SERVICE_NAME>`**: The name of your service in lowercase (e.g., `alyzitron`, `clickatron`).

**Examples:**
-   `https://yourapp.com/api/webhooks/services/alyzitron`
-   `https://yourapp.com/api/webhooks/services/clickatron`

## 3. HTTP Method

All webhook calls must use the `POST` method.

## 4. Authentication

Each request to the webhook endpoint **must** include a `Authorization` header containing a bearer token. This token must match the `SERVICE_SECRET` environment variable configured in the main application.

**Header Example:**
```
Authorization: Bearer <YOUR_SHARED_SECRET>
```

Requests without a valid secret will be rejected with a `401 Unauthorized` error.

## 5. Request Body

The body of the `POST` request must be a JSON object with the following structure:

```json
{
  "taskId": "...",
  "error": {
    "code": "...",
    "message": "..."
  }
}
```

### Field Descriptions:

-   **`taskId`** (string, required): The unique identifier for the task that was provided to your service when the job was dispatched.
-   **`error`** (object, required): An object containing details about the failure.
    -   **`code`** (string, required): A short, machine-readable error code (e.g., `VIDEO_DOWNLOAD_FAILED`, `INVALID_FORMAT`, `PROCESSING_ERROR`).
    -   **`message`** (string, required): A human-readable description of what went wrong. This will be stored in the database and may be shown to the user.

### Example Request Body:

```json
{
  "taskId": "64a6f8e7a4b3c2d1e8f0b1c2",
  "error": {
    "code": "INFERENCE_FAILED",
    "message": "The model could not process the provided image due to an unsupported resolution (128x128)."
  }
}
```

## 6. Expected Responses

-   **`200 OK`**: The failure was successfully received and processed by the main application. Your service can consider the transaction complete.
-   **`400 Bad Request`**: The request body was malformed or missing required fields. Check the response body for details.
-   **`401 Unauthorized`**: The `Authorization` header was missing or contained an invalid secret.
-   **`404 Not Found`**: The `taskId` sent does not correspond to any known task.
-   **`500 Internal Server Error`**: An unexpected error occurred on the main application's side. Your service should implement a retry mechanism with exponential backoff for this case.