# Service Production Guide

## Overview

This guide outlines the standard practices for taking any service to production in our multi-service architecture. It ensures consistency across different services while maintaining proper separation of concerns.

## Architecture Principles

### 1. Service Separation
- Core functionality should be handled by dedicated backend servers
- User data and service-specific metadata should be managed by Next.js backend
- Authentication is universally handled by Clerk
- Each service should be independently scalable

### 2. Environment Configuration

#### File Organization
- Keep all .env* files in project root directory
- Never add service-specific .env files in subdirectories
- Use .env.example as the template for all required variables
- Use .env.local for local development
- Use .env.test for testing environment

#### Environment Variable Naming Convention
To prevent naming clashes in the monorepo's shared .env file, follow these conventions:

1. Service-Specific Variables:
```bash
# Format: [SERVICE_NAME]_[VARIABLE_NAME]
ALYZITRON_BACKEND_URL=https://api.alyzitron.com
ALYZITRON_API_KEY=xxx

SHIELD_BACKEND_URL=https://api.shield.com
SHIELD_API_KEY=xxx
```

2. Shared Variables:
```bash
# MongoDB (shared across services)
MONGODB_URI=mongodb://...
MONGODB_DB_NAME=main_db

# Clerk Authentication (shared)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# Cloud Storage (shared)
GCS_BUCKET_NAME=shared-bucket
GCS_PROJECT_ID=project-id
GCS_CLIENT_EMAIL=client@email.com
GCS_PRIVATE_KEY=private-key
```

3. Service-Specific MongoDB Collections:
- Use service name as prefix for collection names
- Example: alyzitron_user_data, shield_user_data

### 3. Standard Database Schema

#### UserServiceData Collection
```typescript
interface UserServiceData {
  _id: ObjectId;
  clerkUserId: string;
  serviceId: string;  // e.g., 'alyzitron', 'shield'
  serviceMetadata: {
    // Service-specific user data
    preferences: object;
    usage: object;
    limits: object;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

#### ServiceTransaction Collection
```typescript
interface ServiceTransaction {
  _id: ObjectId;
  clerkUserId: string;
  serviceId: string;
  transactionType: string;
  status: string;
  metadata: object;
  createdAt: Date;
  updatedAt: Date;
}
```

## Implementation Guidelines

### 1. API Route Structure
```
/app/api/services/[service-name]/
├── route.ts           # Main API routes
├── webhook.ts         # Webhook handler
├── utils/            # Service-specific utilities
└── types/            # Type definitions
```

### 2. Authentication Integration

- Use Clerk middleware for all API routes
- Implement role-based access control if needed
- Store service-specific permissions in UserServiceData
- Use Clerk user sessions for frontend protection

### 3. Data Management

1. External Server Data:
   - Core functionality data
   - Processing results
   - Heavy computations
   - Service-specific algorithms

2. MongoDB Data (Next.js Backend):
   - User preferences
   - Usage history
   - Transaction logs
   - Service metadata
   - Queue status
   - Results cache (if needed)

### 4. Error Handling

1. Standard Error Format:
```typescript
interface ServiceError {
  code: string;        // Machine-readable error code
  message: string;     // User-friendly message
  action?: string;     // Suggested resolution
  technical?: string;  // Technical details (logs only)
}
```

2. Error Categories:
   - AUTH: Authentication/Authorization errors
   - INPUT: Invalid input data
   - PROCESS: Processing errors
   - SYSTEM: System/Infrastructure errors
   - LIMIT: Rate/Usage limit errors

### 5. Monitoring & Logging

1. Key Metrics:
   - Request volume
   - Error rates
   - Processing times
   - Queue lengths
   - User engagement

2. Log Categories:
   - User actions
   - System events
   - Error events
   - Performance metrics

## Security Considerations

1. API Security:
   - Use HTTPS only
   - Implement rate limiting
   - Validate all inputs
   - Sanitize outputs

2. Data Security:
   - Encrypt sensitive data
   - Regular security audits
   - Access logging
   - GDPR compliance

## Development Workflow

1. Local Development:
   - Use environment variables
   - Mock external services
   - Test with real Clerk auth
   - Local MongoDB instance

2. Testing:
   - Unit tests for utilities
   - Integration tests for API routes
   - E2E tests for critical flows
   - Load testing for scalability

3. Deployment:
   - Stage changes in development
   - Test in staging environment
   - Gradual production rollout
   - Monitor for issues

## Common Patterns

1. Queue Management:
   - Use MongoDB for queue status
   - Implement cancellation where possible
   - Show progress indicators
   - Handle timeouts gracefully

2. User Preferences:
   - Store in UserServiceData
   - Cache frequently accessed data
   - Implement defaults
   - Allow user customization

3. Error Recovery:
   - Implement retry logic
   - Preserve user input
   - Clear error messages
   - Recovery instructions

## Performance Optimization

1. Database:
    - Index frequently queried fields
    - Implement caching where appropriate
    - Use aggregation pipelines
    - Monitor query performance

2. API Routes:
    - Implement response caching
    - Optimize payload size
    - Use streaming for large data
    - Handle concurrent requests

## Service Implementation Patterns

### Task Cancellation Pattern

When implementing cancellable tasks:
1. Only allow cancellation in specific states (e.g., 'queued')
2. Update database records immediately on cancel request
3. Handle race conditions between cancel and task start
4. Provide clear user feedback about cancellation status

Example:
```typescript
// Cancel endpoint
if (task.status !== 'queued') {
  throw new Error('Task cannot be cancelled in current state');
}

// Update DB first
await db.tasks.updateOne(
  { taskId, status: 'queued' }, // Only update if still queued
  { $set: { status: 'failed', error: { code: 'CANCELLED' } } }
);

// Then notify external service
await externalService.cancelTask(taskId);
```

### File Organization

1. Group Related Routes:
```
/api/services/[service-name]/
├── analyze/     # Main functionality
│   └── route.ts
├── cancel/      # Task management
│   └── route.ts
└── utils/       # Shared utilities
    ├── mongodb.ts
    └── progress.ts
```

2. Clean Up Unused Files:
- Remove experimental or deprecated approaches
- Document file removals in a cleanup file
- Update imports across the codebase
- Remove unused environment variables

### Progress Tracking

For long-running tasks:
1. Use estimated completion time from backend
2. Show non-linear progress based on typical processing patterns
3. Add micro-fluctuations for realistic feel
4. Cap progress at 90% until completion
5. Show clear status transitions

## Maintenance Tasks

1. Regular Checks:
   - Monitor error rates
   - Check system performance
   - Update dependencies
   - Backup user data

2. Cleanup Tasks:
   - Archive old records
   - Clear temporary data
   - Update cached data
   - Remove inactive users

## Collection Naming Strategy

To maintain clear separation between services while using a shared MongoDB:

1. Service-Specific Collections:
```
[service_name]_[collection_type]
```
Examples:
- alyzitron_analyses
- alyzitron_user_data
- shield_scans
- shield_user_data

2. Shared Collections:
```
shared_[collection_type]
```
Examples:
- shared_user_preferences
- shared_audit_logs

3. Collection Name Constants:
```typescript
// Define collection names as constants
export const COLLECTION_NAMES = {
  ALYZITRON: {
    USER_DATA: 'alyzitron_user_data',
    ANALYSES: 'alyzitron_analyses',
  },
  SHIELD: {
    USER_DATA: 'shield_user_data',
    SCANS: 'shield_scans',
  },
  SHARED: {
    USER_PREFERENCES: 'shared_user_preferences',
    AUDIT_LOGS: 'shared_audit_logs',
  },
};
```

## Common Issues and Solutions

### Clerk Authentication in Next.js 13+

1. Server Components:
```typescript
// Do use:
import { auth } from '@clerk/nextjs/server';
const session = await auth();
if (session?.userId) {
  // Use session.userId
}

// Don't use:
import { auth } from '@clerk/nextjs';  // Wrong import
const { userId } = auth();  // Wrong usage - auth() returns a Promise
```

2. Client Components:
```typescript
import { useAuth } from '@clerk/nextjs';
const { userId } = useAuth();
```

3. API Routes:
```typescript
import { auth } from '@clerk/nextjs/server';
const session = await auth();
if (!session?.userId) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```

## Related Documentation

- Clerk Authentication Guide
- MongoDB Best Practices
- Service-Specific API Docs
- Frontend Integration Guide