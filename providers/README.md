# Global Providers

This directory contains React context providers that supply global state and functionality across the entire Insturix platform. These providers wrap the application to ensure consistent behavior and data access.

## Available Providers

### Data Management
- **ReactQuery.tsx** - React Query provider for server state management and caching
- **RtdbProvider.tsx** - Real-time database provider for Firebase RTDB connections

### UI/UX Providers
- **ThemeProvider.tsx** - Theme management provider for light/dark mode and styling

## Provider Architecture

### Hierarchical Structure
Providers are arranged in a specific order to ensure proper dependency resolution:
1. Theme Provider (foundational styling)
2. React Query Provider (data layer)
3. RTDB Provider (real-time updates)

### Global State Management
- Centralized state for cross-service functionality
- Consistent data access patterns
- Optimized re-rendering and performance

## Integration Guidelines

### Application Setup
```typescript
function App() {
  return (
    <ThemeProvider>
      <ReactQuery>
        <RtdbProvider>
          {/* Your app components */}
        </RtdbProvider>
      </ReactQuery>
    </ThemeProvider>
  );
}
```

### Service Integration
All services automatically inherit:
- Theme configuration and styling
- React Query caching and state management
- Real-time database connectivity
- Global error handling

## Provider Features

### React Query Provider
- Server state caching and synchronization
- Background refetching and updates
- Optimistic updates and error handling
- Request deduplication and performance optimization

### RTDB Provider
- Real-time Firebase database connections
- Cross-service notification system
- Task status updates and progress tracking
- Automatic connection management

### Theme Provider
- Light/dark mode switching
- Consistent color schemes and styling
- CSS variable management
- Responsive design integration

## Usage Patterns

### Consuming Providers
```typescript
// Theme usage
import { useTheme } from 'next-themes';

// React Query usage
import { useQuery } from '@tanstack/react-query';

// RTDB usage
import { useRtdbData } from '@/providers/RtdbProvider';
```

### Adding New Providers
1. Create provider component with proper context
2. Add to the provider hierarchy
3. Export necessary hooks and types
4. Update this documentation

## Performance Considerations

### Optimization Strategies
- Providers are memoized to prevent unnecessary re-renders
- Context values are stable references
- Selective re-rendering based on consumed values

### Resource Management
- Automatic cleanup of database connections
- Query cache management
- Memory leak prevention

## Error Handling

### Global Error Boundaries
- Providers include error boundaries for graceful failures
- Service-specific error handling
- User-friendly error messages
- Automatic retry mechanisms

### Development Support
- Development-mode debugging
- Error logging and monitoring
- Performance profiling hooks

## Security and Privacy

### Data Protection
- Secure real-time database connections
- Proper authentication context
- User data isolation
- Privacy-compliant data handling

### Connection Security
- Encrypted database connections
- Authentication token management
- Secure API communication
- Cross-service data protection