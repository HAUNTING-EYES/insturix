# Clickatron: Technical Implementation Guide

## Overview

This document provides comprehensive technical details about Clickatron's implementation, including architecture, API endpoints, data structures, and setup instructions.

## Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   External      │
│   (Next.js)     │◄──►│   (API Routes)  │◄──►│   Services      │
│                 │    │                 │    │                 │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • React UI      │    │ • Session Mgmt  │    │ • Upstash QStash│
│ • Zustand Store │    │ • Job Processing│    │ • Upstash Redis │
│ • TanStack Query│    │ • MongoDB       │    │ • AI Services   │
│ • IndexedDB     │    │ • Clerk Auth    │    │ • Image Storage │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Data Flow

1. **User Interaction** → Frontend components update Zustand store
2. **State Changes** → Debounced auto-save triggers API calls
3. **Job Creation** → QStash enqueues async processing jobs
4. **Worker Execution** → Background processing with Redis state tracking
5. **Real-time Updates** → SSE streams provide live status to frontend
6. **Result Delivery** → Completed jobs update MongoDB and notify frontend

## API Endpoints

### Session Management

#### `POST /api/services/clickatron/session`
Create new creative session with workflow initialization.

**Request:**
```json
{
  "videoIdea": "How to cook perfect eggs",
  "preset": {
    "id": "youtube",
    "name": "YouTube Thumbnail",
    "aspectRatio": "16:9",
    "dimensions": "1920x1080"
  },
  "referenceImage": {
    "name": "inspiration.jpg",
    "size": 2048000,
    "type": "image/jpeg",
    "imageId": "ref_123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "507f1f77bcf86cd799439011",
  "taskData": {
    "videoIdea": "How to cook perfect eggs",
    "stage": "ideation",
    "selectedPreset": { ... },
    "referenceImage": { ... }
  }
}
```

#### `GET /api/services/clickatron/session/:id`
Fetch session with automatic legacy migration.

#### `PATCH /api/services/clickatron/session/:id`
Update workflow or canvas data.

**Request:**
```json
{
  "workflow": {
    "stage": "canvas",
    "selectedDirection": "Creative morning light concept"
  },
  "canvas": {
    "variations": [
      {
        "id": "var_123",
        "prompt": "Golden morning light streaming through kitchen window",
        "status": "generating",
        "fineTuning": { "brightness": 110, "contrast": 105, "saturation": 100 }
      }
    ]
  }
}
```

### Generation Endpoints

#### `POST /api/services/clickatron/idea`
Generate creative ideas from video concept.

#### `POST /api/services/clickatron/session/:id/directions`
Generate creative directions for session.

#### `POST /api/services/clickatron/session/:id/ideas`
Store all generated ideas with user's selection for comprehensive audit trail.

#### `POST /api/services/clickatron/session/:id/directions`
Store all generated creative directions with user's selection for comprehensive audit trail.

#### `POST /api/services/clickatron/session/:id/variation`
Create new variation (async job processing).

**Request:**
```json
{
  "prompt": "Golden morning light streaming through kitchen window with fresh eggs",
  "referenceImages": ["ref_123"],
  "fineTuning": {
    "brightness": 110,
    "contrast": 105,
    "saturation": 100
  },
  "metadata": {
    "aspectRatio": "16:9",
    "style": "professional"
  }
}
```

**Response:**
```json
{
  "success": true,
  "variationId": "var_1698765432123_abc123",
  "jobId": "job_01HXXXXXXXXXXXXXXXXXXXX",
  "status": "queued",
  "estimatedTime": 30
}
```

### Job Management

#### `GET /api/services/clickatron/jobs/:jobId`
Get current job status.

**Response:**
```json
{
  "job": {
    "id": "job_01HXXXXXXXXXXXXXXXXXXXX",
    "userId": "user_2abc123",
    "sessionId": "507f1f77bcf86cd799439011",
    "variationId": "var_1698765432123_abc123",
    "prompt": "Golden morning light...",
    "status": "completed",
    "progress": 100,
    "stage": "finalizing",
    "attempt": 1,
    "startedAt": 1698765432000,
    "updatedAt": 1698765465000,
    "resultRef": "generated_var_1698765432123_abc123.png",
    "fineTuning": { "brightness": 110, "contrast": 105, "saturation": 100 },
    "metadata": { "aspectRatio": "16:9", "style": "professional" },
    "trace": [
      { "timestamp": 1698765432000, "stage": "queued", "progress": 0 },
      { "timestamp": 1698765432500, "stage": "running", "progress": 5 },
      { "timestamp": 1698765438000, "stage": "prompting", "progress": 20 },
      { "timestamp": 1698765450000, "stage": "generating", "progress": 80 },
      { "timestamp": 1698765460000, "stage": "refining", "progress": 90 },
      { "timestamp": 1698765465000, "stage": "finalizing", "progress": 100 }
    ]
  },
  "isTerminal": true
}
```

#### `DELETE /api/services/clickatron/jobs/:jobId`
Cancel running job.

#### `GET /api/services/clickatron/jobs/:jobId/stream`
Server-sent events for real-time job status updates.

**SSE Events:**
```
event: status
data: {"type":"status","data":{...},"timestamp":1698765432000}

event: progress
data: {"type":"progress","data":{"progress":80,"stage":"generating"},"timestamp":1698765450000}

event: completed
data: {"type":"completed","data":{"status":"completed"},"timestamp":1698765465000}
```

## Data Structures

### Core Types

#### ClickatronJob
```typescript
interface ClickatronJob {
  id: string;
  userId: string;
  sessionId: string;
  variationId: string;
  prompt: string;
  status: JobStatus; // 'queued' | 'running' | 'completed' | 'failed' | 'canceled'
  progress: number; // 0-100
  stage: JobStage; // 'queued' | 'prompting' | 'generating' | 'refining' | 'finalizing'
  attempt: number;
  startedAt: number;
  updatedAt: number;
  resultRef?: string;
  error?: JobError;
  trace: JobTraceEntry[];
  fineTuning?: FineTuningControls;
  metadata?: Record<string, any>;
}
```

#### ClickatronSession
```typescript
interface ClickatronSession extends IClickatronTask {
  'details.workflow'?: WorkflowData;
  'details.canvas'?: CanvasData;
}

interface WorkflowData {
  videoIdea: string;
  stage: 'ideation' | 'canvas';
  selectedPreset?: CanvasPreset;
  selectedDirection?: string;
  referenceImageMeta?: ReferenceImageMeta;
  workflowVersion?: number;
}

interface CanvasData {
  variations: Variation[];
}
```

### Database Schema

#### MongoDB Collection: ClickatronTask (Comprehensive Audit Trail)
```javascript
{
  _id: ObjectId,
  clerkUserId: String,
  title: String,
  details: {
    workflow: {
      videoIdea: String,
      stage: "spark" | "ideation" | "canvas",
      selectedPreset: Object,
      selectedDirection: String,
      referenceImageMeta: Object,
      workflowVersion: Number,

      // Comprehensive audit trail
      generatedIdeas: [
        {
          id: String,
          title: String,
          description: String,
          prompt: String,
          tags: [String],
          styleHints: [String],
          generatedAt: Date
        }
      ],
      selectedIdea: Object, // User's chosen idea
      generatedDirections: [
        {
          id: String,
          title: String,
          description: String,
          prompt: String,
          tags: [String],
          styleHints: [String],
          generatedAt: Date
        }
      ],
      selectedDirectionData: Object, // User's chosen direction
      committedVariation: Object // Final committed variation
    },
    canvas: {
      variations: [
        {
          id: String,
          prompt: String,
          timestamp: Number,
          status: String,
          fineTuning: Object,
          imageRef: String, // GCS URL
          referenceImages: [String], // GCS URLs
          metadata: {
            gcsPath: String,
            fileSize: Number,
            contentType: String,
            aspectRatio: String,
            dimensions: String
          },
          jobId: String,
          createdAt: Date,
          updatedAt: Date
        }
      ],
      committedVariationId: String
    }
  },
  status: String,
  results: {
    thumbnail: {
      prompt: String,
      gcs_url: String
    },
    details: String // JSON string with comprehensive metadata
  },
  createdAt: Date,
  updatedAt: Date
}
```

#### Redis Keys
```
clickatron:job:{jobId}           # Job data (JSON)
clickatron:job:index:{sessionId}  # Set of job IDs for session
clickatron:idempotency:{key}      # Idempotency mapping
clickatron:active                # Sorted set of active jobs
```

## Setup Instructions

### 1. Environment Configuration

Create `.env.local` with required variables:

```bash
# Upstash QStash (for async job processing)
UPSTASH_QSTASH_TOKEN=qstash_token_here
UPSTASH_QSTASH_CURRENT_SIGNING_KEY=current_signing_key
UPSTASH_QSTASH_NEXT_SIGNING_KEY=next_signing_key

# Upstash Redis (for job state management)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=redis_token_here

# MongoDB
MONGODB_URI=mongodb+srv://...

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Dependencies Installation

```bash
yarn add @upstash/qstash @upstash/redis zustand @tanstack/react-query
```

### 3. Database Setup

Ensure MongoDB collection `ClickatronTask` exists with proper indexes:

```javascript
// Create indexes for performance
db.ClickatronTask.createIndex({ clerkUserId: 1, createdAt: -1 });
db.ClickatronTask.createIndex({ "details.workflow.stage": 1 });
db.ClickatronTask.createIndex({ status: 1 });
```

### 4. Upstash Configuration

1. **Create QStash Endpoint:**
   - URL: `https://yourdomain.com/api/internal/workers/clickatron/variation`
   - Method: POST
   - Enable retries: 3 attempts

2. **Configure Redis:**
   - Create Redis database in Upstash
   - Note REST URL and token
   - Set up proper access controls

## Implementation Details

### Job Processing Flow

1. **Job Creation** (`variation/route.ts`)
   - Validate session and user permissions
   - Create job record in Redis
   - Enqueue job with QStash
   - Return job ID to frontend

2. **Job Execution** (`workers/clickatron/variation/route.ts`)
   - Receive job payload from QStash
   - Update job status to 'running'
   - Process AI generation (mock or real)
   - Update MongoDB with results
   - Mark job as completed

3. **Status Monitoring** (`jobs/[jobId]/route.ts`)
   - Fetch job status from Redis
   - Return current state and progress
   - Handle job cancellation

4. **Real-time Updates** (`jobs/[jobId]/stream/route.ts`)
   - Establish SSE connection
   - Poll Redis for status changes
   - Send events to frontend
   - Handle connection cleanup

### Error Handling

#### Job-Level Errors
- **Retry Logic**: QStash handles automatic retries (up to 3 attempts)
- **Failure States**: Jobs marked as 'failed' with error details
- **Timeout Handling**: 95-second timeout for SSE connections
- **Idempotency**: Duplicate job creation prevented via idempotency keys

#### API-Level Errors
- **Validation Errors**: Zod schema validation with detailed error messages
- **Authentication**: Clerk middleware for user verification
- **Authorization**: Session ownership validation
- **Rate Limiting**: Built-in protection against abuse

### Performance Optimizations

#### Frontend
- **Debounced Updates**: 1-1.5s debounce for auto-save
- **Optimistic Updates**: Immediate UI feedback before server confirmation
- **Selective Subscriptions**: Zustand selectors prevent unnecessary re-renders
- **Lazy Loading**: Components load data on-demand

#### Backend
- **Connection Pooling**: MongoDB connection reuse
- **Redis Pipelining**: Batch Redis operations
- **Compression**: Response compression for large payloads
- **Caching**: Redis caching for frequently accessed data

### Security Considerations

#### Authentication & Authorization
- **Clerk Integration**: Secure user authentication
- **Session Validation**: User ownership verification for all operations
- **API Key Protection**: Environment variable protection for external services

#### Data Protection
- **Input Sanitization**: Zod validation for all inputs
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Content Security Policy headers
- **Rate Limiting**: Built-in protection against abuse

## Migration Strategy

### Legacy Compatibility
- **Automatic Migration**: Legacy tasks upgraded on first access
- **Schema Extension**: New fields added without breaking changes
- **Zero Downtime**: Migration happens transparently during usage

### Data Transformation
```typescript
// Legacy task adaptation
function adaptLegacyTask(task: IClickatronTask): TaskData {
  const prompt = task.results?.thumbnail?.prompt || task.details?.prompt || '';

  return {
    videoIdea: task.title || task.details?.videoIdea || 'Legacy Task',
    timestamp: new Date(task.createdAt).getTime(),
    stage: task.status === 'completed' ? 'canvas' : 'ideation',
    selectedDirection: prompt || undefined,
    selectedPreset: {
      id: 'youtube',
      name: 'YouTube Thumbnail',
      aspectRatio: '16:9',
      dimensions: '1920x1080',
      promptText: "What's your video about?",
      placeholder: ''
    },
    referenceImage: null,
  };
}
```

## Monitoring & Debugging

### Logging
- **Job Lifecycle**: Detailed logging for job creation, execution, completion
- **Error Tracking**: Comprehensive error logging with context
- **Performance Metrics**: Response times and throughput monitoring

### Debugging Tools
- **Redis CLI**: Direct Redis inspection for job debugging
- **MongoDB Compass**: Database query and analysis
- **Browser DevTools**: Network and console debugging
- **SSE Inspector**: Real-time event stream monitoring

## Troubleshooting

### Common Issues

#### Job Stuck in Queue
```bash
# Check QStash dashboard for failed deliveries
# Verify worker endpoint is accessible
# Check Redis connectivity
```

#### SSE Connection Issues
```bash
# Verify CORS configuration
# Check network connectivity
# Validate authentication headers
```

#### Database Connection Errors
```bash
# Verify MongoDB URI format
# Check network connectivity
# Validate database permissions
```

### Performance Tuning

#### Redis Optimization
- **Connection Pooling**: Reuse Redis connections
- **Key Expiration**: Proper TTL settings for job data
- **Memory Management**: Monitor Redis memory usage

#### Database Optimization
- **Indexing**: Ensure proper indexes on frequently queried fields
- **Connection Limits**: Configure appropriate connection pool sizes
- **Query Optimization**: Use MongoDB profiler for slow queries

## Comprehensive Audit Trail

Clickatron implements a complete audit trail system that captures every aspect of the user's creative journey, enabling detailed analytics, debugging, and user experience insights.

### Data Captured

#### 1. **Ideation Stage**
- **All Generated Ideas**: Complete list of AI-generated creative concepts
- **User Selection**: Which idea the user chose to proceed with
- **Timestamps**: When each idea was generated and selected
- **Metadata**: Tags, style hints, and generation parameters

#### 2. **Direction Selection**
- **All Creative Directions**: Complete set of AI-generated creative approaches
- **User Choice**: Selected direction that influenced the final prompt
- **Prompt Enhancement**: How the direction was incorporated into generation

#### 3. **Canvas Variations**
- **All Generated Images**: Complete history of every variation created
- **GCS Storage Links**: Permanent storage URLs for all images
- **Fine-tuning Settings**: Brightness, contrast, saturation values for each variation
- **Job Metadata**: Async processing details and performance metrics
- **File Information**: Size, content type, dimensions for each image

#### 4. **Final Commitment**
- **Chosen Variation**: Which variation was selected as final
- **GCS Path**: Permanent storage location
- **Complete Metadata**: File size, content type, dimensions
- **Workflow Completion**: Timestamp and stage progression

### API Endpoints for Audit Trail

#### Store Ideas
```http
POST /api/services/clickatron/session/:id/ideas
```
```json
{
  "ideas": [
    {
      "id": "idea_123",
      "title": "Morning Light Concept",
      "description": "Golden sunlight streaming through kitchen",
      "prompt": "Golden morning light...",
      "tags": ["bright", "warm", "kitchen"],
      "styleHints": ["photorealistic", "warm tones"],
      "generatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "selectedIdeaId": "idea_123"
}
```

#### Store Directions
```http
POST /api/services/clickatron/session/:id/directions
```
```json
{
  "directions": [
    {
      "id": "dir_456",
      "title": "Creative Morning Light",
      "description": "Warm, inviting atmosphere...",
      "prompt": "Creative morning light approach...",
      "tags": ["creative", "warm", "inviting"],
      "styleHints": ["artistic", "emotional"],
      "generatedAt": "2024-01-15T10:35:00Z"
    }
  ],
  "selectedDirectionId": "dir_456"
}
```

#### Commit Final Variation
```http
POST /api/services/clickatron/session/:id/commit
```
```json
{
  "variationId": "var_789",
  "gcsPath": "https://storage.googleapis.com/bucket/variations/var_789.png",
  "metadata": {
    "fileSize": 2048576,
    "contentType": "image/png",
    "aspectRatio": "16:9",
    "dimensions": "1920x1080"
  }
}
```

### Database Structure for Audit Trail

The audit trail is stored across multiple nested structures in MongoDB:

```javascript
{
  details: {
    workflow: {
      // Original user input
      videoIdea: "How to cook perfect eggs",
      selectedPreset: { /* preset data */ },

      // Complete ideation history
      generatedIdeas: [/* all ideas */],
      selectedIdea: {/* user's choice */},

      // Complete direction history
      generatedDirections: [/* all directions */],
      selectedDirectionData: {/* user's choice */},
      selectedDirection: "Creative morning light concept",

      // Final commitment
      committedVariation: {/* current committed variation data */},
      stage: "canvas" // Ongoing creative workspace
    },
    canvas: {
      // All variations with complete metadata
      variations: [
        {
          id: "var_789",
          prompt: "Golden morning light...",
          imageRef: "https://storage.googleapis.com/...",
          metadata: {
            gcsPath: "https://storage.googleapis.com/...",
            fileSize: 2048576,
            contentType: "image/png",
            aspectRatio: "16:9",
            dimensions: "1920x1080"
          },
          fineTuning: { brightness: 110, contrast: 105, saturation: 100 },
          jobId: "job_01HXXXXXXXXXXXXXXXXXXXX",
          createdAt: "2024-01-15T10:40:00Z",
          updatedAt: "2024-01-15T10:42:00Z"
        }
      ],
      committedVariationId: "var_789"
    }
  }
}
```

### Benefits of Comprehensive Audit Trail

#### For Users
- **Complete History**: Never lose track of creative decisions
- **Easy Reversion**: Return to any previous variation instantly
- **Learning Insights**: Understand what worked and what didn't
- **Portfolio Building**: Showcase complete creative process

#### For Analytics
- **Conversion Tracking**: Which ideas lead to completion
- **Performance Metrics**: Generation success rates, user engagement
- **A/B Testing**: Compare different creative approaches
- **Personalization**: Learn user preferences over time

#### For Debugging
- **Complete Context**: Full history for troubleshooting issues
- **Performance Analysis**: Track generation times and success rates
- **Quality Assurance**: Monitor output quality and consistency
- **User Support**: Provide detailed session information

### Storage Strategy

#### Google Cloud Storage Integration
- **Permanent URLs**: All images stored with public GCS URLs
- **Metadata Tracking**: File size, content type, dimensions stored in database
- **CDN Integration**: Fast global delivery through GCS CDN
- **Backup & Recovery**: Automatic replication and versioning

#### Database Optimization
- **Nested Structures**: Efficient storage of related data
- **Indexing Strategy**: Optimized queries for common access patterns
- **Data Archiving**: Automatic cleanup of old session data
- **Compression**: Efficient storage of large metadata objects

## Future Enhancements

### Planned Features
- **WebSocket Support**: Real-time collaboration features
- **Batch Processing**: Multiple variation generation
- **Advanced Caching**: CDN integration for generated images
- **Analytics**: Usage tracking and performance insights

### Scalability Improvements
- **Horizontal Scaling**: Multi-region deployment
- **Load Balancing**: Distribute load across multiple instances
- **Caching Layers**: Advanced caching strategies

---

This implementation provides a robust, scalable foundation for Clickatron's creative canvas suite with comprehensive error handling, real-time updates, and professional-grade architecture.