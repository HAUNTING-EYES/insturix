# Real-Time Database (RTDB) Notification System

This directory contains the centralized notification system for handling real-time updates from Firebase RTDB across all services.

## Components

### TaskNotificationManager
The main component that manages notification display, auto-dismissal, and animations.

### TaskNotificationPopup
Individual notification component that displays task updates with status-specific styling and optional click handlers.

## How It Works

1. **Data Flow**: Firebase RTDB updates → RtdbProvider → TaskNotificationManager → TaskNotificationPopup
2. **Notification Lifecycle**: 
   - Appears with animation
   - Auto-dismisses after 5 seconds
   - Can be manually closed
   - Marks as read when clicked (if clickable)

## Customization for New Services

### 1. Service Configuration
Add your service to the `ServiceName` type in `types/rtdb.ts`:

```typescript
export type ServiceName = 'alyzitron' | 'editron' | 'musitron' | 'shield' | 'thinkforge' | 'socialize' | 'your-new-service';
```

### 2. Click Behavior Configuration
To make notifications clickable for your service, modify the `isClickable` logic in `TaskNotificationPopup.tsx`:

```typescript
const isClickable = (serviceName === 'alyzitron' && 
  (taskUpdate.status === 'completed' || taskUpdate.status === 'failed')) ||
  (serviceName === 'your-service' && 
  (taskUpdate.status === 'your-condition'));
```

### 3. Custom Navigation
Update the navigation URL pattern in the `handleClick` function:

```typescript
// For services with different URL patterns
let url: string;
switch (serviceName) {
  case 'your-service':
    url = `/dashboard/${serviceName}/custom-path/${taskUpdate.taskId}`;
    break;
  default:
    url = `/dashboard/${serviceName}/tasks/${taskUpdate.taskId}`;
}
router.push(url);
```

### 4. Custom Status Configuration
Add custom status configurations in the `statusConfig` object:

```typescript
const statusConfig = {
  // Existing statuses...
  'your-custom-status': { 
    icon: YourIcon, 
    color: 'text-purple-500', 
    bg: 'bg-purple-100', 
    label: 'Your Status' 
  },
};
```

## Best Practices

### Keep It Centralized
- Avoid service-specific logic in these components
- Use configuration objects and conditional logic instead
- Consider creating a configuration file for complex customizations

### Service-Specific Customizations
Create service-specific configuration files:

```typescript
// config/notifications.ts
export const notificationConfig = {
  alyzitron: {
    clickableStatuses: ['completed', 'failed'],
    urlPattern: '/dashboard/alyzitron/tasks/{taskId}',
  },
  'your-service': {
    clickableStatuses: ['finished', 'error'],
    urlPattern: '/dashboard/your-service/results/{taskId}',
  },
};
```

### Testing New Services
1. Ensure your service writes to RTDB in the correct format
2. Test notification appearance and behavior
3. Verify click navigation works correctly
4. Test auto-dismissal and manual close functionality

## Data Format

Your service should write task updates to RTDB in this format:

```typescript
// Path: /users/{userId}/{serviceName}/{taskId}
{
  taskId: string;
  status: 'listed' | 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  title?: string;
  description?: string;
}
```

## Styling Guidelines

- Use the existing color scheme for consistency
- Follow the established animation patterns
- Maintain responsive design principles
- Keep text concise and informative

## Future Enhancements

Consider these patterns for future development:
- Configuration-driven click behavior
- Service-specific styling themes
- Custom notification types beyond task updates
- Notification grouping by service
- User preference settings for notification behavior