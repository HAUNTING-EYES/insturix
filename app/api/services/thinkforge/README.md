# ThinkForge Pub/Sub Implementation

This document describes the Pub/Sub architecture implemented for ThinkForge, similar to Alyzitron's production-ready design.

## Architecture Overview

ThinkForge now uses a sophisticated multi-layered architecture:

- **Frontend (Next.js)**: Handles user requests, creates tasks, and manages real-time status
- **Pub/Sub**: Asynchronous task processing and worker communication
- **Firebase RTDB**: Real-time task status tracking and concurrent task management
- **Backend (Python FastAPI)**: Processes AI tasks and sends results back via webhooks

## Components

### Frontend Components

1. **Pub/Sub Manager** (`utils/pubsub.ts`)
   - Publishes tasks to Google Cloud Pub/Sub
   - Handles task cancellation
   - Manages topic configuration

2. **RTDB Manager** (`utils/rtdb.ts`)
   - Creates and updates task status in Firebase RTDB
   - Tracks concurrent tasks for limit enforcement
   - Provides real-time status updates

3. **API Routes**
   - `/api/services/thinkforge/chat/message` - Chat message processing
   - `/api/services/thinkforge/ideas/generate` - Idea generation
   - `/api/services/thinkforge/scripts/generate` - Script generation
   - `/api/services/thinkforge/suggestions` - Dynamic suggestions
   - `/api/services/thinkforge/webhook` - Receives task results
   - `/api/services/thinkforge/tasks/[taskId]` - Task status and cancellation

### Backend Components

1. **Pub/Sub Service** (`services/pubsub_service.py`)
   - Subscribes to Pub/Sub topic
   - Processes incoming tasks
   - Sends results back to frontend via webhooks

2. **Task Handlers**
   - `handle_chat_task` - Processes chat messages
   - `handle_ideas_task` - Generates creative ideas
   - `handle_scripts_task` - Creates scripts from ideas
   - `handle_suggestions_task` - Provides dynamic suggestions

## Task Flow

1. **User Request**: User sends request to frontend API
2. **Task Creation**: Frontend creates task in RTDB and publishes to Pub/Sub
3. **Processing**: Backend receives task and processes with AI
4. **Status Updates**: Backend sends status updates via webhooks
5. **Result Delivery**: Final results sent to frontend via webhook

## Environment Variables

```bash
# Frontend (.env)
GOOGLE_CLOUD_CREDENTIALS=base64_encoded_credentials
THINKFORGE_PUBSUB_TOPIC=thinkforge-tasks

# Backend (.env)
GOOGLE_CLOUD_PROJECT_ID=your-project-id
THINKFORGE_PUBSUB_SUBSCRIPTION=thinkforge-tasks-sub
THINKFORGE_WEBHOOK_URL=http://localhost:3000/api/services/thinkforge/webhook
ENABLE_PUBSUB=true
```

## Benefits

1. **Scalability**: Process multiple AI tasks concurrently
2. **Reliability**: Automatic retry and error handling
3. **Real-time Updates**: Live status tracking via RTDB
4. **Resource Management**: Better control over AI processing load
5. **Monitoring**: Track task processing metrics
6. **Consistency**: Align with Alyzitron's architecture patterns

## Usage

### Creating a Task

```typescript
// Frontend API route
const taskId = new ObjectId().toString();

// Create task in RTDB
await ThinkForgeRTDBManager.createTask(
  session.userId,
  taskId,
  'chat',
  sessionId,
  'Chat message'
);

// Publish to Pub/Sub
await ThinkForgePubSubManager.publishTask({
  taskId,
  userId: session.userId,
  sessionId,
  type: 'chat',
  data: { message, context }
});
```

### Checking Task Status

```typescript
// Get task status
const task = await ThinkForgeRTDBManager.getTask(userId, taskId);

if (task.status === 'completed') {
  const result = task.result;
  // Handle result
}
```

### Cancelling a Task

```typescript
// Cancel task (only if status is 'queued')
if (task.status === 'queued') {
  await ThinkForgeRTDBManager.updateTaskStatus(
    userId,
    taskId,
    'failed',
    undefined,
    { code: 'CANCELLED', message: 'Task cancelled by user' }
  );
}
```

## Error Handling

- **Task Creation Errors**: Handled gracefully with user feedback
- **Processing Errors**: Sent back to frontend via webhooks
- **Network Errors**: Automatic retry via Pub/Sub nack
- **Timeout Handling**: Tasks marked as failed after timeout

## Monitoring

- **Task Status**: Tracked in Firebase RTDB
- **Processing Metrics**: Logged in backend
- **Error Rates**: Monitored via webhook responses
- **Concurrent Tasks**: Enforced via RTDB counting

This implementation makes ThinkForge's architecture more similar to Alyzitron's sophisticated production-ready design while maintaining its AI-focused functionality.

## 🚀 Recent Updates

### Fixed Communication Issues
- **Removed HTTP webhook dependency** - Backend no longer tries to send HTTP callbacks to frontend
- **Added session validation** - Frontend validates sessions before publishing tasks
- **Implemented RTDB listeners** - Real-time task status updates via Firebase RTDB
- **Enhanced error handling** - Prevents infinite retry loops for session-related errors

## 📋 New Utilities

### 1. Session Validator (`utils/sessionValidator.ts`)
Validates sessions before task submission to prevent failures.

```typescript
import { validateSession, ensureSession, validateOrCreateSession } from './utils/sessionValidator';

// Check if session exists
const validation = await validateSession(userId, sessionId);

// Create new session if needed
const newSession = await ensureSession(userId, clerkSessionId);

// Validate or create (recommended)
const result = await validateOrCreateSession(userId, sessionId, clerkSessionId);
```

### 2. RTDB Listeners (`utils/rtdbListener.ts`)
Real-time task status updates replacing HTTP webhooks.

```typescript
import { listenToTaskStatus, TaskManager, waitForTaskCompletion } from './utils/rtdbListener';

// Listen to task updates
const unsubscribe = listenToTaskStatus(userId, taskId, (taskStatus) => {
  console.log('Task status:', taskStatus.status);
  if (taskStatus.status === 'completed') {
    console.log('Result:', taskStatus.result);
  }
});

// Task manager for multiple tasks
const taskManager = new TaskManager();
taskManager.startListening(userId, taskId, callback);

// Wait for completion with timeout
const result = await waitForTaskCompletion(userId, taskId, 300000);
```

### 3. Task Publisher (`utils/taskPublisher.ts`)
Enhanced task publishing with session validation.

```typescript
import { publishTaskWithValidation, ThinkForgeTaskPublisher } from './utils/taskPublisher';

// Direct publishing
const result = await publishTaskWithValidation({
  userId,
  sessionId,
  clerkSessionId,
  taskType: 'ideas',
  taskData: { prompt: 'Generate ideas for...' }
});

// Simplified publisher class
const publisher = new ThinkForgeTaskPublisher(userId, clerkSessionId);
const ideasResult = await publisher.publishIdeasTask(sessionId, prompt);
```

## 🔧 Migration Guide

### Before (Problematic)
```typescript
// ❌ Old approach - could fail with session errors
fetch('/api/thinkforge/ideas/generate', {
  method: 'POST',
  body: JSON.stringify({
    session_id: someRandomSessionId, // ❌ Not validated
    prompt: 'Generate ideas...'
  })
});

// ❌ No real-time updates, relied on polling or webhooks
```

### After (Fixed)
```typescript
// ✅ New approach - validates session first
import { publishTaskWithValidation } from './utils/taskPublisher';
import { listenToTaskStatus } from './utils/rtdbListener';

// Validate session and publish task
const result = await publishTaskWithValidation({
  userId,
  sessionId,
  clerkSessionId,
  taskType: 'ideas',
  taskData: { prompt: 'Generate ideas...' }
});

if (result.success) {
  // ✅ Listen for real-time updates
  const unsubscribe = listenToTaskStatus(userId, result.taskId!, (status) => {
    if (status.status === 'completed') {
      console.log('Ideas generated:', status.result);
      unsubscribe();
    }
  });
}
```

## 🎯 Key Benefits

1. **Reliability** - Sessions are validated before task submission
2. **Real-time Updates** - Immediate status updates via Firebase RTDB
3. **Better Error Handling** - No infinite retry loops for session errors
4. **Simplified API** - Helper classes and utilities reduce boilerplate
5. **No HTTP Dependencies** - Backend doesn't need to connect back to frontend

## 🔄 Communication Flow

```
Frontend → Session Validation → Task Publishing → RTDB Updates
   ↓              ↓                    ↓              ↑
   ↓         MongoDB Check         PubSub/API      Backend
   ↓              ↓                    ↓              ↑
   ↓         Auto-create         Task Processing      ↑
   ↓              ↓                    ↓              ↑
   ↓         Return ID            Update Status ------↑
   ↓              ↓                    ↓
   ↓         Publish Task         Real-time UI Updates
   ↑←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←↑
```

## 🛠️ Error Handling

### Session Errors (No Retry)
- Session not found
- Invalid session ID
- User not authorized

These errors are acknowledged immediately to prevent infinite retries.

### Processing Errors (Retry Allowed)
- Network timeouts
- Temporary service unavailability
- Rate limiting

These errors trigger message retry in PubSub.

## 📊 RTDB Structure

```
{userId}/thinkforge/
├── tasks/
│   └── {taskId}/
│       ├── taskId: string
│       ├── taskType: string
│       ├── status: 'listed' | 'processing' | 'completed' | 'failed'
│       ├── sessionId: string
│       ├── result?: any
│       ├── error?: { code, message, retryable }
│       ├── createdAt: string
│       └── updatedAt: string
└── sessions/
    └── {sessionId}/
        └── progress/
            ├── sessionId: string
            ├── workflowPhase: string
            ├── updatedAt: string
            └── [workflow-specific data]
```

## 🚀 Usage Examples

### Complete Workflow Example
```typescript
import { auth } from '@clerk/nextjs/server';
import { ThinkForgeTaskPublisher } from './utils/taskPublisher';
import { listenToTaskStatus } from './utils/rtdbListener';

export async function generateIdeas(prompt: string) {
  const session = await auth();
  if (!session?.userId) throw new Error('Not authenticated');
  
  const publisher = new ThinkForgeTaskPublisher(
    session.userId,
    session.sessionId || `clerk_${Date.now()}`
  );
  
  // This will validate/create session automatically
  const result = await publisher.publishIdeasTask(
    'existing_session_id_or_new',
    prompt
  );
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  // Listen for real-time updates
  return new Promise((resolve, reject) => {
    const unsubscribe = listenToTaskStatus(
      session.userId,
      result.taskId!,
      (taskStatus) => {
        if (taskStatus.status === 'completed') {
          unsubscribe();
          resolve(taskStatus.result);
        } else if (taskStatus.status === 'failed') {
          unsubscribe();
          reject(new Error(taskStatus.error?.message));
        }
      }
    );
  });
}
```

## 🔧 Environment Variables

```env
THINKFORGE_BACKEND_URL=http://localhost:8000
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
ENABLE_PUBSUB=true
ENABLE_FIREBASE_RTDB=true
```

## 🎉 Changelog

### v2.0.0 - Communication Fixes
- ✅ Removed HTTP webhook dependency
- ✅ Added session validation utilities
- ✅ Implemented RTDB real-time listeners
- ✅ Enhanced error handling for PubSub
- ✅ Created task publishing utilities
- ✅ Added comprehensive documentation

### Migration Required
- Update task publishing to use new utilities
- Replace webhook listeners with RTDB listeners
- Ensure session validation before task submission 