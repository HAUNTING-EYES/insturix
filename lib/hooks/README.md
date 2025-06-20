# Advanced Service Hooks

This directory contains specialized React hooks that handle complex business logic for user plans, concurrent task management, and database operations. These hooks are critical for service integration and user management.

## Available Hooks

### Plan Management
- **usePlans.ts** - Client-side plan management with caching and real-time updates
- **usePlansFromDB.ts** - Direct database plan fetching with MongoDB integration

### Task Management
- **useConcurrentTasks.ts** - Handles multiple simultaneous operations across services

## Core Functionality

### Plan Management System
The plan hooks provide centralized access to user subscription data:

#### Features
- Real-time plan status updates
- Usage limit calculations
- Plan expiration handling
- Upgrade/downgrade workflow integration
- Cache management for performance

#### Integration Pattern
```typescript
const { currentPlan, limits, canUseFeature } = usePlans();
const { planData, loading, error } = usePlansFromDB(userId);
```

### Concurrent Task Management
Handles multiple operations running simultaneously:

#### Capabilities
- Task queue management
- Resource allocation
- Progress tracking across services
- Error handling and recovery
- Performance optimization

#### Use Cases
- Multiple video analyses running
- Batch processing operations
- Background data synchronization
- Service limit enforcement

## Database Integration

### MongoDB Operations
- Direct database queries with proper error handling
- Connection pooling and optimization
- Transaction support for critical operations
- Data consistency across service boundaries

### Caching Strategy
- React Query integration for optimal performance
- Intelligent cache invalidation
- Background refresh for real-time data
- Offline capability with cache fallbacks

## Service Integration Guidelines

### For New Services
1. Use existing plan hooks for user limit checking
2. Integrate with concurrent task management for resource-heavy operations
3. Follow established error handling patterns
4. Implement proper loading states

### Performance Optimization
- Hooks include built-in memoization
- Selective re-renders based on consumed data
- Background prefetching for common operations
- Resource cleanup on component unmount

## Error Handling and Recovery

### Resilient Operations
- Automatic retry logic for transient failures
- Graceful degradation when services are unavailable
- User-friendly error messages
- Detailed logging for debugging

### Data Consistency
- Optimistic updates with rollback capability
- Real-time synchronization across browser tabs
- Conflict resolution for concurrent operations
- Audit trails for critical changes

## Security Considerations

### User Authorization
- Plan-based access control
- Feature flag integration
- Resource usage validation
- Secure data transmission

### Data Protection
- Sensitive plan information handling
- Payment data security compliance
- User privacy protection
- GDPR compliance measures

## Usage Patterns

### Plan Validation
```typescript
// Check if user can access a feature
const canAnalyze = useMemo(() => {
  return canUseFeature('video_analysis') && 
         limits.videoAnalysis.remaining > 0;
}, [canUseFeature, limits]);
```

### Task Coordination
```typescript
// Manage multiple operations
const { startTask, tasks, totalProgress } = useConcurrentTasks();

const handleMultipleUploads = async (files) => {
  const taskPromises = files.map(file => startTask('upload', file));
  await Promise.allSettled(taskPromises);
};
```

## Integration Points

These hooks integrate with:
- Backend service APIs
- MongoDB database layer
- Real-time notification system
- Payment processing services
- Usage tracking middleware
- Error monitoring systems