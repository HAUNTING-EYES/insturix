# Service Limits Integration Guide

## Overview

This document provides a standardized procedure for integrating usage limits and rate limits into any new service in the platform, ensuring consistency and maintainability across all services.

## Prerequisites

Before integrating service limits, ensure you have:
1. Defined the service name and purpose
2. Identified the types of limits needed (count-based, time-based, etc.)
3. Determined plan-specific limit values
4. Understood the existing service limits infrastructure

## Integration Steps

### 1. Define Service Limits Configuration

Add your service configuration to `lib/config/serviceLimits.ts`:

```typescript
// In UNIFIED_SERVICE_LIMITS object
yourservice: {
  maxFeatureUsage: {
    name: 'Feature Usage',
    description: 'Description of what this limit controls',
    icon: 'IconName', // Optional, for UI display
    defaultResetPeriod: 'weekly' | 'monthly' | 'daily' | 'none',
    category: 'count' | 'duration' | 'storage' | 'time',
    unit: 'units', // e.g., 'requests', 'minutes', 'MB'
    planLimits: {
      free: number | -1, // -1 for unlimited
      plus: number | -1,
      pro: number | -1,
      premium: number | -1
    }
  }
}
```

### 2. Create Service Middleware

Create a new middleware file at `lib/middleware/services/yourservice.ts`:

```typescript
import { createLimitMiddleware, LimitConfig } from '../limitMiddleware';

export const YOURSERVICE_LIMIT_CONFIG: LimitConfig = {
  serviceName: 'yourservice',
  limitMappings: {
    'feature1': 'maxFeatureUsage',
    'feature2': 'maxOtherUsage',
  },
  defaultLimitType: 'maxFeatureUsage'
};

export const yourserviceLimitMiddleware = createLimitMiddleware(YOURSERVICE_LIMIT_CONFIG);

type YourServiceRequest = {
  type?: string;
  [key: string]: unknown;
};

export const checkYourServiceLimits = async (requestData: YourServiceRequest) => {
  const middleware = yourserviceLimitMiddleware;
  return await middleware.checkLimits({ ...requestData, limitType: requestData.type || 'feature1' });
};

export const incrementYourServiceUsage = async (requestData: YourServiceRequest, amount?: number) => {
  const middleware = yourserviceLimitMiddleware;
  return await middleware.incrementUsage({ ...requestData, limitType: requestData.type || 'feature1' }, amount);
};
```

### 3. Update Refund Configuration

Add refund mappings to `lib/services/refund-config.ts`:

```typescript
export const REFUND_MAPPING: RefundMapping = {
  yourservice: {
    feature_action: ['maxFeatureUsage'],
  },
  // ... other services
};
```

### 4. Implement Limit Checking in API Endpoints

In your service API endpoints, add limit checking:

```typescript
import { yourserviceLimitMiddleware } from '@/lib/middleware/services/yourservice';

// Before processing the request
const limitCheck = await yourserviceLimitMiddleware.checkLimits({
  limitType: 'feature1'
});

if (!limitCheck.hasAccess) {
  return yourserviceLimitMiddleware.createLimitExceededResponse(limitCheck);
}

// After successful processing
await yourserviceLimitMiddleware.incrementUsage({
  limitType: 'feature1'
});
```

### 5. Frontend Integration

Create frontend utilities in `lib/frontend/services/yourservice.ts`:

```typescript
import { createFrontendLimitUtils, ServiceLimitConfig } from '../limitUtils';

export const YOURSERVICE_LIMIT_CONFIG: ServiceLimitConfig = {
  serviceName: 'yourservice',
  limitMappings: {
    'feature1': 'maxFeatureUsage',
    'feature2': 'maxOtherUsage',
  },
  defaultLimitType: 'maxFeatureUsage'
};

const yourserviceLimitUtils = createFrontendLimitUtils(YOURSERVICE_LIMIT_CONFIG);

export const getCurrentUsage = async (requestData: Record<string, unknown>) => {
  return await yourserviceLimitUtils.getCurrentUsage(requestData);
};

export const canPerformAction = (usageInfo: any, amount: number = 1) => {
  return yourserviceLimitUtils.canPerformAction(usageInfo, amount);
};
```

### 6. Update User Schema (if needed)

The user schema in `schemas/user.ts` should automatically handle new services through the existing service limits structure. No manual changes are typically needed.

## Best Practices

### 1. Limit Design

- Use descriptive names for limit types
- Provide clear descriptions for user-facing messages
- Choose appropriate reset periods based on service usage patterns
- Set reasonable default values for each plan tier

### 2. Race Condition Prevention

- Always use the atomic increment operations provided by the service usage service
- Check limits before performing operations
- Increment usage after successful completion

### 3. Logical Flaw Prevention

- Validate all inputs before checking limits
- Handle error cases properly to avoid inconsistent states
- Use transactions when multiple operations must be atomic

### 4. Production Schema Updates

- The system automatically adds missing limits to user records when accessed
- Ensure new limits are added to the unified configuration
- Test migration scenarios with existing user data

### 5. Refund Handling

- Map service actions to appropriate limit types in the refund configuration
- Implement refund logic in the simple-refund service
- Test refund scenarios to ensure proper usage decrementing

## Testing Guidelines

### Unit Tests

1. Test limit checking with different plan types
2. Test usage incrementing with various amounts
3. Test limit reset functionality
4. Test refund processing

### Integration Tests

1. Test API endpoints with limit checking
2. Test frontend usage display components
3. Test limit exceeded scenarios
4. Test concurrent usage scenarios

### Edge Cases

1. Test with unlimited plans (-1 values)
2. Test with zero limits (0 values)
3. Test boundary conditions
4. Test error handling

## Monitoring and Analytics

### Metrics to Track

1. Limit check success/failure rates
2. Usage patterns across different plan types
3. Refund request frequency
4. System performance impact

### Alerting

1. Set up alerts for unusual usage patterns
2. Monitor for potential abuse
3. Track system performance impact

## Common Pitfalls to Avoid

### 1. Inconsistent Naming

- Use consistent naming conventions across configuration, middleware, and API endpoints
- Follow the existing patterns in the codebase

### 2. Improper Limit Checking Order

- Always check limits before performing expensive operations
- Increment usage after successful completion, not before

### 3. Missing Refund Configuration

- Ensure all service actions that consume limits have corresponding refund mappings
- Test refund scenarios thoroughly

### 4. Inadequate Error Handling

- Handle limit check failures gracefully
- Provide clear error messages to users
- Log errors appropriately for debugging

## Example Implementation

For a complete example, refer to the existing implementations:
- Musitron: `lib/middleware/services/musitron.ts`
- Alyzitron: `lib/middleware/services/alyzitron.ts`
- ThinkForge: `lib/middleware/services/thinkforge.ts`

## Maintenance Guidelines

### 1. Regular Review

- Periodically review limit values based on usage patterns
- Adjust limits as needed for business requirements
- Monitor system performance impact

### 2. Documentation Updates

- Keep this SOP document updated with any changes to the process
- Document service-specific implementation details
- Maintain clear comments in configuration files

### 3. Code Quality

- Follow existing code patterns and conventions
- Write comprehensive tests for new functionality
- Ensure proper error handling and logging

## Conclusion

By following this standardized procedure, you can ensure consistent and maintainable implementation of service limits across all services in the platform. Always refer to existing implementations for guidance and maintain consistency with the established patterns.