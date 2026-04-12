# Service Limits Integration Guide

## When to Use Usage Limits vs Rate Limits

### Usage Limits
Use usage limits when you need to:
- Track and limit the total number of operations a user can perform within a time period (daily, weekly, monthly)
- Charge or restrict access based on consumption
- Provide different tiers of service based on usage quotas
- Store usage data persistently for billing or analytics purposes

Examples:
- Number of image generations per week
- Hours of video analysis per month
- Number of music tracks generated per month

### Rate Limits
Use rate limits when you need to:
- Prevent abuse or spam without tracking total usage
- Protect backend services from being overwhelmed
- Limit the frequency of requests without storing persistent data
- Provide basic protection for free features

Examples:
- Number of prompt enhancements per minute
- API requests per second
- Login attempts per minute

## Choosing the Right Approach
- Use **usage limits** for premium features or when you need to track consumption for billing
- Use **rate limits** for free features or when you only need to prevent abuse
- You can use both for the same service (e.g., usage limits for premium features, rate limits for basic protection)

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

### 3. Implementing Rate Limits for New Services

For services that require rate limiting instead of (or in addition to) usage limits, follow these steps:

#### 1. Create a Rate Limiter Utility

For services with multiple rate-limited features, you have two options:

**Option 1: Separate Files (Recommended for complex services)**
Create a new file at `lib/utils/yourServiceRateLimiter.ts`:

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Create rate limiters for different features of your service
export const yourServiceFeature1RateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
  prefix: '@upstash/ratelimit/yourservice/feature1',
  ephemeralCache: new Map(),
});

export const yourServiceFeature2RateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'), // 5 requests per minute
  prefix: '@upstash/ratelimit/yourservice/feature2',
  ephemeralCache: new Map(),
});

export default {
  yourServiceFeature1RateLimiter,
  yourServiceFeature2RateLimiter,
};
```

**Option 2: Shared File (Recommended for simple services with few rate limits)**
Add your rate limiters to an existing utility file or create a shared rate limiter file at `lib/utils/rateLimiters.ts`:

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Shared rate limiters for multiple services/features
export const promptEnhancementRateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'), // 5 requests per minute
  prefix: '@upstash/ratelimit/prompt-enhancement',
  ephemeralCache: new Map(),
});

export const yourNewFeatureRateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
  prefix: '@upstash/ratelimit/yournewfeature',
  ephemeralCache: new Map(),
});
```

#### 2. Integrate Rate Limiting in API Endpoints

In your service API endpoints, add rate limiting:

```typescript
import { auth } from "@clerk/nextjs/server";
import { yourServiceRateLimiter } from '@/lib/utils/yourServiceRateLimiter';

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check rate limit
    const { success, limit, remaining, reset } = await yourServiceRateLimiter.limit(userId);
    
    // If rate limit exceeded, return error
    if (!success) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again later.",
          limitInfo: {
            limit,
            remaining,
            resetTime: reset
          }
        },
        { status: 429 }
      );
    }

    // Continue with your service logic
    // ...
  } catch (error) {
    // Handle errors appropriately
  }
}
```

#### 3. Rate Limiting Best Practices

- Choose appropriate limits based on your service's capacity and user needs
- Use descriptive error messages when rate limits are exceeded
- Consider different limits for different user plans if needed
- Monitor rate limit usage to adjust limits as needed
- Use Upstash Redis for serverless-friendly rate limiting

#### 4. Adding Multiple Rate Limits

The current implementation is designed to be flexible and easily extensible:

1. **For New Services**: Create a new rate limiter utility file as shown above
2. **For Additional Features in Existing Services**:
   - Add new rate limiters to the existing utility file (like `promptEnhancementRateLimiter.ts`)
   - Or create a new utility file if the service is becoming complex
3. **For Shared Rate Limits**: You can create a central rate limiter file for common limits used across multiple services

Example of adding a new rate limiter to an existing file:
```typescript
// In lib/utils/promptEnhancementRateLimiter.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Existing rate limiter
export const promptEnhancementRateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: '@upstash/ratelimit/prompt-enhancement',
  ephemeralCache: new Map(),
});

// NEW: Add a new rate limiter for another feature in the same service
export const anotherFeatureRateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: '@upstash/ratelimit/another-feature',
  ephemeralCache: new Map(),
});
```

This approach allows you to easily add as many rate limits as needed without creating unnecessary files, while still maintaining clean organization.

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
