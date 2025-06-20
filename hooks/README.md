# Custom React Hooks

This directory contains reusable React hooks that provide common functionality across all services in the Insturix platform.

## Available Hooks

### Core Hooks
- **useFeatureUsage.ts** - Tracks and manages feature usage limits for services
- **useVideoAnalysis.ts** - Handles video analysis operations and state management
- **useRtdbListener.ts** - Manages real-time database connections and updates

### UI/UX Hooks
- **useMobile.tsx** - Responsive design hook for mobile/desktop detection
- **useMediaQuery.ts** - Custom media query hook for responsive components
- **use-outside-click.tsx** - Detects clicks outside specified elements
- **use-toast.ts** - Toast notification management and display

## Usage Pattern

Each hook follows React conventions and can be imported directly:

```typescript
import { useFeatureUsage } from '@/hooks/useFeatureUsage';
import { useMobile } from '@/hooks/useMobile';
```

## Integration Guidelines

When creating new services:
1. Check existing hooks before creating service-specific ones
2. Consider if your hook logic could benefit other services
3. Follow the established naming convention (use[FeatureName])
4. Include proper TypeScript types and error handling

## Dependencies

These hooks integrate with:
- Firebase RTDB (via useRtdbListener)
- Service limit middleware
- Toast notification system
- Theme and responsive design systems