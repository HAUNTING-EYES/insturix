# New Service Integration Guide

Quick reference for integrating new services into the Insturix platform.

## Reference Implementation

### Alyzitron as Complete Example
- **Use Alyzitron as your primary reference** - fully implemented service
- Follow its patterns for API routes, components, and database integration
- Copy and adapt its middleware, hooks, and UI components
- Established patterns for limit checking, status updates, and user flow

## Documentation Setup

### README Files
- Create README.md files in key directories for reusable components
- Focus on technical middleware, hooks, utilities, and complex components
- Avoid obvious documentation (basic UI components, simple schemas)
- Document purpose, usage patterns, and integration guidelines

## Notification System

### Firebase RTDB Integration
- **No separate notification service needed** - Firebase RTDB handles all real-time notifications
- Service/worker updates task status in RTDB at `/users/{userId}/{serviceName}/{taskId}`
- Frontend automatically receives real-time updates via existing notification system
- Status flow: `listed` → `queued` → `processing` → `completed/failed`

## User Initialization

### Dashboard Entry
- Users auto-initialize on `/dashboard` access if not existing in database
- `UserInitializationProvider` handles automatic setup and plan assignment
- Default plan limits applied immediately
- No manual user creation required

## Limit Management

### Usage Limits
- **Fetching limits lazily resets them** when usage period expires
- Use existing limit middleware: `lib/middleware/services/your-service.ts`
- Frontend hooks: `useServiceLimits()` for real-time limit checking
- Backend validation: `checkServiceLimits()` before processing

### Upgrade Prompts
- **Create service-specific limit popup** when limits exceeded
- Reference Alyzitron's `UsageLimitPopup` component as implementation example
- Integrates with existing upgrade flow components
- Shows remaining usage and upgrade options
- Follow Alyzitron patterns for consistency

## Database Updates

### Task Status Management
- **Service/worker directly updates both databases simultaneously**
- MongoDB for persistent storage, RTDB for real-time notifications
- Update both in same operation using `Promise.all()`
- No separate sync process required

## Essential Integration Steps

### 1. Service Configuration
- Add service to `lib/config/services.ts`
- Define limits in `lib/config/serviceLimits.ts`
- Create middleware config: `lib/middleware/services/your-service.ts`

### 2. Database Schema
- Create MongoDB schema: `schemas/YourService.ts`
- Create connection utility: `lib/your-service-mongo.ts`
- Follow existing patterns from `editron-mongo.ts`

### 3. Frontend Integration
- Create service hooks: `lib/frontend/services/your-service.ts`
- Use existing components: sidebar, upgrade flow, notifications
- Integrate with dashboard layout and navigation

### 4. API Routes
- Implement limit checking in API routes
- Update task status in both MongoDB and RTDB
- Use existing error handling utilities

### 5. UI Components
- Extend existing dashboard components
- Add service to sidebar navigation
- Use existing limit display components
- Integrate with notification system

## Key Reusable Systems

### Already Built
- **Limit enforcement** - Backend middleware + Frontend hooks
- **Payment processing** - Complete upgrade flow
- **Real-time notifications** - Firebase RTDB system
- **User management** - Authentication + initialization
- **Dashboard framework** - Sidebar, layout, navigation
- **Error handling** - Centralized error management

### Service-Specific Needs
- Business logic implementation
- Service-specific UI components
- External API integrations
- Task processing workflows

## Common Patterns

### API Route Structure
```
/api/your-service/
├── upload          # Initial task creation
├── status          # Task status checking
├── download        # Result retrieval
└── history         # Task history
```

### Database Updates
- Service worker updates both MongoDB and RTDB
- Use `Promise.all()` for simultaneous updates
- Handle errors to ensure consistency
- Include progress updates for long-running tasks

### Frontend Flow
1. Check limits before allowing action
2. Show upgrade popup if limit exceeded
3. Create task and show progress
4. Receive real-time status updates
5. Display results when completed

## Critical Don'ts

- Don't create separate notification systems
- Don't implement custom limit checking
- Don't build separate upgrade flows
- Don't handle user initialization manually
- Don't create custom error handling
- Don't sync databases with separate processes

## Quick Start Checklist

- [ ] Add service configuration and limits
- [ ] Create database schemas and connections
- [ ] Implement middleware for limit checking
- [ ] Create frontend service hooks
- [ ] Build API routes with limit validation
- [ ] Add service to sidebar navigation
- [ ] Test limit enforcement and upgrade flow
- [ ] Verify real-time notifications work
- [ ] Document service-specific components