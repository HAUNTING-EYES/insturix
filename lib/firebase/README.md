# Firebase Configuration and Integration

This directory contains Firebase configuration and utilities for real-time database operations, authentication, and service integration across the Insturix platform.

## Configuration Files

### Core Setup
- **config.ts** - Firebase initialization, database configuration, and service integration

## Firebase Services Used

### Real-Time Database (RTDB)
- Cross-service task notifications
- Real-time status updates
- User activity tracking
- Service communication

### Authentication Integration
- User session management
- Service access control
- Security rule enforcement
- Token validation

## Real-Time Database Structure

### Data Organization
```
/users/{userId}/
  ├── alyzitron/
  │   └── {taskId}/
  │       ├── status: 'queued' | 'processing' | 'completed' | 'failed'
  │       ├── progress: number
  │       ├── createdAt: timestamp
  │       └── updatedAt: timestamp
  ├── musitron/
  ├── thinkforge/
  └── [other-services]/
```

### Task Status Flow
1. **listed** - Task created and visible to user
2. **queued** - Task waiting for processing
3. **processing** - Task actively being processed
4. **completed** - Task finished successfully
5. **failed** - Task encountered an error

## Integration Guidelines

### Service Integration
```typescript
import { rtdb } from '@/lib/firebase/config';
import { ref, set, onValue } from 'firebase/database';

// Write task update
const taskRef = ref(rtdb, `users/${userId}/${serviceName}/${taskId}`);
await set(taskRef, {
  status: 'processing',
  progress: 50,
  updatedAt: new Date().toISOString()
});

// Listen for updates
onValue(taskRef, (snapshot) => {
  const data = snapshot.val();
  // Handle real-time updates
});
```

## Task Schema Design for New Services

### Creating Service-Specific Schemas
When adding a new service, you need to define the task schema structure for both Firebase RTDB and MongoDB:

#### RTDB Task Schema (Real-time Updates)
```typescript
// Define your service's RTDB task structure
interface YourServiceRTDBTask {
  taskId: string;
  status: 'listed' | 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number; // 0-100 for progress tracking
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  
  // Service-specific fields
  title?: string;
  description?: string;
  metadata?: {
    // Service-specific metadata
    inputType?: string;
    outputFormat?: string;
    [key: string]: any;
  };
}
```

#### MongoDB Task Schema (Persistent Storage)
```typescript
// Create comprehensive schema in /schemas/YourService.ts
export interface YourServiceTask {
  _id: string;
  user_id: string;
  
  // Input parameters
  input_url?: string;
  input_data?: any;
  
  // Task management
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  created_at: Date;
  updated_at: Date;
  
  // Results and outputs
  result?: {
    output_url?: string | string[];
    processed_data?: any;
    metadata?: Record<string, any>;
    [key: string]: unknown;
  };
  
  // Error handling
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  
  // Service-specific fields
  service_config?: {
    // Your service's configuration options
    quality?: string;
    format?: string;
    [key: string]: any;
  };
}
```

### Schema Implementation Steps

#### 1. Define TypeScript Interfaces
Create your service schema in `/schemas/YourService.ts`:
```typescript
import { Document } from 'mongoose';

export interface IYourServiceTask extends Document {
  // Your interface definition
}

export const YourServiceTaskSchema = new Schema({
  // MongoDB schema definition
  user_id: { type: String, required: true, index: true },
  status: { type: String, enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'QUEUED' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  // ... other fields
});
```

#### 2. Create MongoDB Connection Utility
Follow the pattern from `editron-mongo.ts`:
```typescript
// lib/your-service-mongo.ts
import { MongoClient, Db, Collection } from "mongodb";
import { YourServiceTask } from "@/schemas/YourService";

const collectionName = process.env.YOUR_SERVICE_MONGO_COLLECTION!;

export async function getYourServiceCollection(): Promise<Collection<YourServiceTask>> {
  const database = await getYourServiceDb();
  return database.collection<YourServiceTask>(collectionName);
}
```

#### 3. Implement RTDB Integration
```typescript
// In your service API routes
import { rtdb } from '@/lib/firebase/config';
import { ref, set } from 'firebase/database';

// Write to RTDB for real-time updates
const updateRTDB = async (userId: string, taskId: string, update: Partial<YourServiceRTDBTask>) => {
  const taskRef = ref(rtdb, `users/${userId}/your-service/${taskId}`);
  await set(taskRef, {
    ...update,
    updatedAt: new Date().toISOString()
  });
};
```

#### 4. Update Both Databases Simultaneously
```typescript
// Update both MongoDB and RTDB in the same operation
const updateTaskStatus = async (userId: string, taskId: string, status: string, result?: any) => {
  try {
    // Update MongoDB (persistent storage)
    const collection = await getYourServiceCollection();
    const mongoUpdate = collection.updateOne(
      { _id: taskId },
      {
        $set: {
          status,
          result,
          updated_at: new Date()
        }
      }
    );
    
    // Update RTDB (real-time notifications) - simultaneously
    const rtdbUpdate = updateRTDB(userId, taskId, { status });
    
    // Wait for both operations to complete
    await Promise.all([mongoUpdate, rtdbUpdate]);
    
  } catch (error) {
    // Handle errors - both updates should succeed or fail together
    console.error('Failed to update task status:', error);
    throw error;
  }
};
```

### Schema Best Practices

#### Data Consistency
- Keep RTDB data minimal (only status and progress)
- Store complete data in MongoDB
- Update both databases simultaneously in the same operation
- Handle errors to ensure both updates succeed or fail together

#### Performance Optimization
- Index frequently queried fields in MongoDB
- Minimize RTDB payload size
- Use efficient update patterns
- Implement proper cleanup for completed tasks

#### Type Safety
- Define comprehensive TypeScript interfaces
- Use strict typing for all database operations
- Validate data before writing to databases
- Handle type mismatches gracefully

#### Error Handling
- Implement rollback mechanisms for failed operations
- Log all database operations for debugging
- Provide meaningful error messages
- Handle partial failures gracefully

### Security Rules
- User can only access their own data
- Service-based read/write permissions
- Admin access for system operations
- Rate limiting for API calls

## Performance Optimization

### Connection Management
- Automatic connection pooling
- Efficient listener management
- Memory leak prevention
- Connection retry logic

### Data Efficiency
- Minimal data structure
- Indexed queries where possible
- Efficient update patterns
- Proper cleanup on disconnect

## Error Handling

### Connection Errors
- Automatic reconnection logic
- Offline capability support
- Error boundary integration
- Graceful degradation

### Data Consistency
- Transaction support for critical updates
- Conflict resolution strategies
- Data validation rules
- Backup and recovery procedures

## Development vs Production

### Environment Configuration
- Separate Firebase projects for dev/staging/prod
- Environment-specific security rules
- Debug mode for development
- Production monitoring and alerts

### Security Considerations
- API key management
- CORS configuration
- Rate limiting implementation
- Data privacy compliance

## Monitoring and Analytics

### Real-Time Monitoring
- Connection status tracking
- Data transfer metrics
- Error rate monitoring
- Performance analytics

### Usage Analytics
- User activity patterns
- Service usage statistics
- Real-time data flow analysis
- Cost optimization insights

## Integration with Other Systems

### MongoDB Sync
- Real-time data synchronization
- Conflict resolution between databases
- Data consistency maintenance
- Backup strategies

### Notification Systems
- Push notification triggers
- Email notification integration
- In-app notification management
- User preference handling

## Best Practices

### Data Structure
- Keep data normalized and flat
- Use appropriate indexing
- Minimize nested data
- Implement proper cleanup

### Security
- Validate all incoming data
- Implement proper authentication
- Use security rules effectively
- Monitor for suspicious activity

### Performance
- Minimize real-time listeners
- Use efficient query patterns
- Implement proper caching
- Monitor bandwidth usage