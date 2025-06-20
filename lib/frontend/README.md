# Frontend Service Utilities

This directory contains client-side utilities and services that handle frontend-specific operations for all Insturix services. These utilities provide consistent patterns for service integration on the client side.

## Core Utilities

### Limit Management
- **limitUtils.ts** - Client-side limit checking and usage display utilities
- **index.ts** - Main export file for frontend utilities

### Service-Specific Utilities
- **services/alyzitron.ts** - Alyzitron-specific frontend hooks and utilities

## Architecture Pattern

### Frontend-Backend Integration
- Frontend utilities communicate with backend middleware
- Consistent API patterns across all services
- Type-safe interfaces for all service interactions

### Reusable Patterns
```typescript
// Pattern for creating service-specific frontend utilities
const serviceUtils = createFrontendLimitUtils({
  serviceName: 'your-service',
  limitMappings: { /* service-specific mappings */ }
});
```

## Key Features

### Limit Checking
- Real-time usage tracking
- Progress visualization
- Limit enforcement on the client
- Upgrade prompts when limits are reached

### React Integration
- Custom hooks for service limits
- React Query integration for caching
- Optimistic UI updates
- Error boundary handling

### User Experience
- Consistent loading states
- Progress indicators
- Error messages
- Upgrade flow integration

## Usage Guidelines

### For New Services
1. Create service-specific utility file in `/services` directory
2. Use the established pattern from existing services
3. Implement proper error handling and loading states
4. Follow TypeScript conventions

### Integration Pattern
```typescript
import { useServiceLimits } from '@/lib/frontend/services/your-service';

function ServiceComponent() {
  const { getUsage, canStart, getTypeName } = useServiceLimits();
  // Component logic
}
```

## Client-Side Security

### Validation
- Frontend validation is supplemented by backend enforcement
- User experience improvements without security reliance
- Graceful handling of limit changes

### Data Protection
- No sensitive configuration exposed to client
- Proper error message sanitization
- Secure API communication patterns

## Performance Considerations

### Caching Strategy
- React Query for API response caching
- Optimistic updates for better UX
- Background refetching for real-time updates

### Bundle Optimization
- Tree-shakable exports
- Lazy loading for service-specific code
- Minimal client-side dependencies

## Testing and Development

### Development Tools
- Type safety for all service interactions
- Development-mode debugging helpers
- Error boundary integration

### Testing Patterns
- Mock service responses
- Component testing utilities
- Integration test helpers

## Integration Points

These utilities work with:
- Backend limit middleware
- React Query provider
- Theme system
- Notification system
- Upgrade flow components