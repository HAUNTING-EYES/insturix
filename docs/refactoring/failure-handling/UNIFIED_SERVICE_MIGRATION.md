# Unified Service Architecture Migration

## Overview
This migration unifies the failure handling across services to improve scalability and consistency.

## What Was Changed

### ✅ New Unified Structure Created
```
lib/services/
├── index.ts                           # Main exports
├── common/
│   ├── task-service.ts               # Common interfaces and factory
│   └── services/
│       ├── alyzitron-task-service.ts      # Alyzitron task operations
│       ├── clickatron-task-service.ts     # Clickatron task operations
│       ├── alyzitron-rtdb-service.ts      # Alyzitron RTDB operations
│       ├── clickatron-rtdb-service.ts     # Clickatron RTDB operations
│       └── alyzitron-additional-refund.ts # Alyzitron-specific refund logic
├── rtdb/
│   ├── alyzitron-rtdb.ts             # Consolidated Alyzitron RTDB manager
│   └── clickatron-rtdb.ts            # Consolidated Clickatron RTDB manager
└── tasks/
    └── handle-failure.ts             # Unified failure handler
```

### ✅ Updated Files
- `lib/services/tasks/handle-failure.ts` - Now uses unified service architecture
- `app/api/services/clickatron/generate/route.ts` - Updated import path
- `lib/middleware/services/alyzitron.ts` - Updated import path
- `components/dashboard/Clickatron/ClientWrapper.tsx` - Updated import path
- `app/api/services/alyzitron/analyze/route.ts` - Updated import path and usage

### Key Benefits
1. **Consistent API**: All services implement the same interfaces
2. **Centralized Logic**: Common patterns extracted to reusable services
3. **Easy Extensibility**: Adding new services just requires implementing interfaces
4. **Unified Logging**: All services use the same logger
5. **Location Consistency**: All service utilities under `lib/services/`

## Files That Can Be Removed (After Verification)

### Old RTDB Files
- `lib/services/clickatron-rtdb.ts` ❌ (replaced by `lib/services/rtdb/clickatron-rtdb.ts`)
- `app/api/services/alyzitron/utils/rtdb.ts` ❌ (replaced by `lib/services/rtdb/alyzitron-rtdb.ts`)

### Verification Steps Before Deletion
1. Search for any remaining imports of the old files:
   ```bash
   grep -r "lib/services/clickatron-rtdb" --include="*.ts" .
   grep -r "app/api/services/alyzitron/utils/rtdb" --include="*.ts" .
   ```
2. Update any found imports to use the new paths
3. Delete the old files

## Usage Examples

### Before (Inconsistent)
```typescript
// Different patterns for different services
if (serviceName === 'alyzitron') {
  const { analyses } = await getAlyzitronCollections();
  // ... complex logic
} else if (serviceName === 'clickatron') {
  await getClickatronDb();
  const task = await ClickatronTask.findOne(...);
  // ... different pattern
}
```

### After (Unified)
```typescript
import { handleTaskFailure } from '@/lib/services';

// Simple, unified interface for all services
await handleTaskFailure({
  taskId,
  serviceName: 'alyzitron', // or 'clickatron'
  userId,
  error
});
```

### Adding New Services
```typescript
// 1. Create service implementations
export class NewServiceTaskService implements TaskService { ... }
export class NewServiceRTDBService implements RTDBService { ... }

// 2. Add to factory function
export async function getServiceConfig(serviceName) {
  // ... existing cases
  if (serviceName === 'newservice') {
    return {
      name: 'newservice',
      taskService: new NewServiceTaskService(),
      rtdbService: new NewServiceRTDBService(),
      usageConfig: { ... }
    };
  }
}
```

## Migration Status
- ✅ Core unified architecture implemented
- ✅ Main failure handler refactored
- ✅ Import paths updated where found
- ✅ Old files removed
- ⏳ Comprehensive testing needed