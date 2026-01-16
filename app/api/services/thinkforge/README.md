# ThinkForge API - Simplified Architecture

## Overview

ThinkForge uses a **simple, robust Node.js backend** with **4 core endpoints** for all operations. No Python backend dependencies, no complex routing, just clean and reliable functionality.

## Architecture

- **Frontend (Next.js)**: Handles user requests and manages UI state
- **API Routes**: 4 simple endpoints for all ThinkForge operations
- **Database**: MongoDB (via Mongoose) for persistence
- **AI**: Google Gemini API via `@ai-sdk/google`

## Core Endpoints

### 1. `POST /api/services/thinkforge/ideas`
Generate 4 content ideas from a prompt.

**Request:**
```json
{
  "prompt": "Create content about..."
}
```

**Response:**
```json
{
  "ideas": [
    {
      "id": "...",
      "idea": "...",
      "purpose": "...",
      "style": "...",
      "format": "...",
      "platform": "...",
      "tone": "..."
    }
  ]
}
```

### 2. `POST /api/services/thinkforge/chat`
Unified chat endpoint that handles both Q&A and script editing.

**Request:**
```json
{
  "sessionId": "session_123",
  "prompt": "Make the dialogue more dramatic",
  "selection": "optional selected text"
}
```

**Response:** Streaming text/plain with optional script updates

**Logic:**
- If script exists → generates script edit
- If no script → generates chat response
- Automatically persists chat messages

### 3. `POST /api/services/thinkforge/script`
Get, save, or update script for a session.

**Request:**
```json
{
  "sessionId": "session_123",
  "action": "get" | "save" | "update",
  "script": {
    "title": "...",
    "content": "...",
    "blocks": [...]
  }
}
```

**Response:**
```json
{
  "script": {
    "_id": "...",
    "sessionId": "...",
    "title": "...",
    "content": "...",
    "blocks": [...]
  }
}
```

### 4. `POST /api/services/thinkforge/session`
Get or create session with full state loading.

**Request:**
```json
{
  "sessionId": "session_123",  // Optional - creates new if not provided
  "projectMeta": {  // Required for new sessions
    "idea": "...",
    "purpose": "...",
    "style": "...",
    "format": "...",
    "platform": "...",
    "tone": "..."
  }
}
```

**Response:**
```json
{
  "sessionId": "...",
  "userId": "...",
  "projectMeta": {...},
  "preferences": {...},
  "script": {...} | null,
  "chat": [...]
}
```

## Data Model

### Collections

1. **`thinkforge_sessions`** - Session metadata and project info
2. **`thinkforge_scripts`** - Scripts (one per session, latest)
3. **`thinkforge_chat`** - Chat messages (many per session)
4. **`thinkforge_users`** - User preferences

### Relationships

- One session → One script (latest)
- One session → Many chat messages
- One user → Many sessions

## Service Layer

- **`lib/thinkforge/services/db.ts`** - Database operations
- **`lib/thinkforge/services/chat-service.ts`** - Chat logic
- **`lib/thinkforge/services/script-service.ts`** - Script operations

## AI Agents

- **`lib/thinkforge/agents/ideas-agent.ts`** - Idea generation
- **`lib/thinkforge/agents/chat-agent.ts`** - Chat responses
- **`lib/thinkforge/agents/script-draft-agent.ts`** - Script editing

## Rate Limiting

- Weekly session limits (enforced via `ServiceUsageService`)
- Per-session chat limits (enforced in `db.ts`)
- Plan-based limits (free/pro/premium)

## Removed Complexity

- ❌ No Python backend
- ❌ No script inspector/classification
- ❌ No separate thinking endpoint
- ❌ No branch editing
- ❌ No Hocuspocus/Y.js collaboration
- ❌ No complex routing logic

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200` - Success
- `400` - Bad request (missing/invalid data)
- `401` - Unauthorized
- `429` - Rate limit exceeded
- `500` - Server error
