# Central Limit Middleware System

This middleware system provides a centralized, reusable way to handle service limits across all Insturix services. It eliminates code duplication and ensures consistent limit checking behavior.

## Architecture

### Backend Components

1. **Core Middleware** (`limitMiddleware.ts`)
   - Generic limit checking logic
   - Service-agnostic implementation
   - Type-safe interfaces

2. **Service-Specific Configs** (`services/alyzitron.ts`)
   - Service-specific limit mappings
   - Pre-configured middleware instances
   - Convenience functions

### Frontend Components

1. **Frontend Utils** (`../frontend/limitUtils.ts`)
   - Client-side limit checking utilities
   - Usage display helpers
   - API communication logic

2. **Service-Specific Frontend** (`../frontend/services/alyzitron.ts`)
   - React hooks for service limits
   - Pre-configured frontend utilities

## Usage Examples

### Backend Usage (API Routes)

```typescript
import { checkAlyzitronLimits, incrementAlyzitronUsage, createAlyzitronLimitResponse } from '@/lib/middleware/services/alyzitron';

export async function POST(request: Request) {
  const { type, video_url } = await request.json();
  
  // Check limits before processing
  const limitCheck = await checkAlyzitronLimits({ type, video_url });
  
  if (!limitCheck.success || !limitCheck.hasAccess) {
    return createAlyzitronLimitResponse(limitCheck);
  }
  
  // ... process request ...
  
  // Increment usage after successful processing
  const usageResult = await incrementAlyzitronUsage({ type, video_url });
  
  if (!usageResult.success) {
    // Log error but don't fail request
    console.error('Failed to increment usage:', usageResult.error);
  }
  
  return NextResponse.json({ success: true });
}
```

### Frontend Usage (React Components)

```typescript
import { useAlyzitronLimits, FrontendLimitInfo } from '@/lib/frontend/services/alyzitron';

function AnalysisComponent() {
  const { getUsage, canStart, getTypeName } = useAlyzitronLimits();
  const [usage, setUsage] = useState<FrontendLimitInfo | null>(null);
  
  useEffect(() => {
    const fetchUsage = async () => {
      const usageInfo = await getUsage({ type: 'short' });
      setUsage(usageInfo);
    };
    fetchUsage();
  }, []);
  
  const handleStartAnalysis = () => {
    if (usage && canStart(usage)) {
      // Start analysis
    } else {
      // Show limit exceeded message
    }
  };
  
  return (
    <div>
      {usage && (
        <div>
          <p>{usage.displayText}</p>
          <progress value={usage.progressPercentage} max="100" />
          {!usage.hasAccess && <p>Limit exceeded</p>}
        </div>
      )}
      <button 
        onClick={handleStartAnalysis}
        disabled={!usage?.hasAccess}
      >
        Start {getTypeName({ type: 'short' })}
      </button>
    </div>
  );
}
```

## Key Benefits

1. **Centralized Logic**: All limit checking logic in one place
2. **Type Safety**: Strongly typed interfaces and configurations
3. **Reusability**: Easy to add new services with same pattern
4. **Consistency**: Uniform error messages and behavior
5. **Maintainability**: Changes only need to be made in one place
6. **Performance**: Optimized queries and caching
7. **Non-Hackable**: Backend validation ensures security

## Adding New Services

To add a new service (e.g., "editron"):

1. Create service config file:
```typescript
// lib/middleware/services/editron.ts
export const EDITRON_LIMIT_CONFIG: LimitConfig = {
  serviceName: 'editron',
  limitMappings: {
    'basic': 'maxBasicEdits',
    'advanced': 'maxAdvancedEdits'
  },
  defaultLimitType: 'maxBasicEdits'
};

export const editronLimitMiddleware = createLimitMiddleware(EDITRON_LIMIT_CONFIG);
export const checkEditronLimits = (requestData: any) => editronLimitMiddleware.checkLimits(requestData);
export const incrementEditronUsage = (requestData: any, amount?: number) => editronLimitMiddleware.incrementUsage(requestData, amount);
```

2. Create frontend utilities:
```typescript
// lib/frontend/services/editron.ts
export const editronLimitUtils = createFrontendLimitUtils({
  serviceName: 'editron',
  limitMappings: { /* same as backend */ }
});
```

3. Use in API routes and components with the same pattern as Alyzitron.

## Configuration

Each service needs a configuration object that maps request parameters to limit types:

```typescript
{
  serviceName: 'alyzitron', // Must match schema
  limitMappings: {
    'short': 'maxShortsAnalysis',     // If type contains 'short', use this limit
    'long': 'maxLongVidAnalysis',     // If type contains 'long', use this limit
    'reel': 'maxShortsAnalysis'       // Support multiple keywords for same limit
  },
  defaultLimitType: 'maxLongVidAnalysis' // Fallback if no matches
}
```

This system ensures that all services follow the same pattern while allowing for service-specific customization.