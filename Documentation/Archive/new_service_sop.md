# Standard Operating Procedure (SOP): Adding a New Service

This document outlines the steps required to add a new service to the Insturix platform, following the existing architecture and best practices.

## 1. Service Configuration

### 1.1. Define the Service

- **File:** [`lib/config/services.ts`](lib/config/services.ts:1)
- **Action:** Add your new service to the `SERVICE_CONFIG` object. This registers the service and its MongoDB collection.

**Example:**

```typescript
export const SERVICE_CONFIG = {
  // ... existing services
  yournewsrvice: {
    name: 'YourNewService',
    mongoCollection: process.env.YOURNEWSERVICE_MONGO_COLLECTION || 'yournewservice_tasks',
  },
};
```

### 1.2. Define Service Limits

- **File:** [`lib/config/serviceLimits.ts`](lib/config/serviceLimits.ts:1)
- **Action:** Add the limits for your new service to the `UNIFIED_SERVICE_LIMITS` object. This defines the usage constraints for different subscription plans.

**Example:**

```typescript
export const UNIFIED_SERVICE_LIMITS: Record<string, Record<string, ServiceLimitConfig>> = {
  // ... existing services
  yournewservice: {
    maxTasks: {
      name: 'Max Tasks',
      description: 'Number of tasks you can perform per week.',
      icon: 'Cpu', // Choose a relevant icon from lucide-react
      defaultResetPeriod: 'weekly',
      category: 'count',
      unit: 'tasks',
      planLimits: {
        free: 10,
        plus: 50,
        pro: 200,
        premium: -1 // -1 for unlimited
      }
    }
  }
};
```

## 2. Database and Schema

### 2.1. Update User Schema

- **File:** [`schemas/user.ts`](schemas/user.ts:1)
- **Action:** Add the new service to the `IServiceLimits` interface and the `serviceLimitsSchema`. This ensures that user-specific limits for the new service are stored correctly.

**`IServiceLimits` interface:**

```typescript
export interface IServiceLimits {
  // ... existing services
  yournewservice: IServiceLimit[];
}
```

**`serviceLimitsSchema`:**

```javascript
const serviceLimitsSchema = new Schema<IServiceLimits>({
  // ... existing services
  yournewservice: {
    type: [serviceLimitSchema],
    default: [],
  },
});
```

### 2.2. Create a Real-Time Database (RTDB) Manager

- **Action:** Create a new file `lib/services/rtdb/yournewservice-rtdb.ts`. Use [`lib/services/rtdb/alyzitron-rtdb.ts`](lib/services/rtdb/alyzitron-rtdb.ts:1) as a template.
- This class will handle creating, updating, and deleting tasks in Firebase RTDB, providing real-time updates to the frontend.

**Example (`lib/services/rtdb/yournewservice-rtdb.ts`):**

```typescript
import { database } from '@/lib/firebase/config';
import { ref, set, update, remove } from 'firebase/database';
import { TaskUpdate, TaskStatus } from '@/types/rtdb';

export class YourNewServiceRTDBManager {
  private static getUserTaskPath(userId: string, taskId: string): string {
    return `/${userId}/yournewservice/${taskId}`;
  }

  // Implement createTask, updateTaskStatus, and removeTask methods
  // ...
}
```

## 3. Backend (API Routes)

- Create API routes for your service under `app/api/services/yournewservice/`.
- **`stats/route.ts`**: This is crucial for analytics. It should query your database and return key statistics, such as monthly usage and service limits. See `alyzitron/stats/route.ts` for an example.
- **`generate/route.ts`**: To create a new task.
- **`history/route.ts`**: To get a list of tasks with pagination.

## 4. Frontend Integration

### 4.1. Dashboard Sidebar

- **File:** [`components/dashboard/sidebar/constants.ts`](components/dashboard/sidebar/constants.ts:1)
- **Action:** Add your new service to one of the tool lists (`coreCreationTools` or `growthLegalTools`). This makes it appear in the dashboard navigation.

**Example:**

```typescript
export const coreCreationTools: Product[] = [
  // ... existing tools
  {
    name: "YourNewService",
    path: "/dashboard/yournewservice",
    icon: Cpu, // Choose a relevant icon
    description: "Your new service description.",
    color: "#yourcolor",
    hoverColor: "#yourhovercolor",
    isPro: false,
  },
];
```

### 4.2. Product Page

- Create a new folder under `app/products/yournewservice/` for the product landing page.
- Add a link to this product page in [`components/Navbar.tsx`](components/Navbar.tsx:92).

### 4.3. Dashboard Page and Components

- Create the main dashboard page for your service at `app/dashboard/yournewservice/page.tsx`. This page should use a `ClientWrapper` component.
- Create a new directory `components/dashboard/YourNewService/`.

**Essential Components to Create:**

- **`ClientWrapper.tsx`**: This component is the main entry point for your service's dashboard UI. It should:
    - Use the `useTaskUpdater` hook to listen for real-time updates from Firebase.
    - Invalidate React Query caches on task completion (e.g., `['yournewservice-analytics']`).
    - Lazily load heavy components like the task generation form and history.
    - See [`components/dashboard/Alyzitron/ClientWrapper.tsx`](components/dashboard/Alyzitron/ClientWrapper.tsx:1) for a reference implementation.

- **`AnalyticsOverview.tsx`**: A detailed analytics component.
    - Fetches data from your `/api/services/yournewservice/stats` endpoint using `useQuery` with the key `['yournewservice-analytics']`.
    - Displays usage, limits, and other key metrics.
    - Model it after [`components/dashboard/Alyzitron/AnalyticsOverview.tsx`](components/dashboard/Alyzitron/AnalyticsOverview.tsx:1).

- **`CompactAnalytics.tsx`**: A smaller, header-like analytics component that shows key stats at a glance and can be expanded to show the `AnalyticsOverview`.
    - Also uses `useQuery` with the `['yournewservice-analytics']` key.
    - See [`components/dashboard/Alyzitron/CompactAnalytics.tsx`](components/dashboard/Alyzitron/CompactAnalytics.tsx:1) or [`components/dashboard/Musitron/CompactAnalytics.tsx`](components/dashboard/Musitron/CompactAnalytics.tsx:1).

- **`YourNewServiceTaskHistory.tsx`**: Displays a paginated list of the user's tasks, fetching from your `history` API endpoint.

- **Task Generation Component** (e.g., `VideoUpload.tsx` or `MusicGenerator.tsx`): The form or interface for creating new tasks.

## 5. Firebase and GCP Configuration

- **Firebase Realtime Database:** Ensure your security rules allow users to read/write to their own path (e.g., `/$uid/yournewservice/`).
- **Google Cloud Storage (GCS):** If your service needs to store files, create a new GCS bucket and configure environment variables for the bucket name and credentials.
- **Environment Variables:** Add necessary environment variables for your service to `.env.example` (and to your actual `.env` files). This includes database connection strings, backend URLs, and any API keys.

## 6. General Norms

- **Data Fetching:** Use React Query (`@tanstack/react-query`) for all server-state fetching and caching. Use consistent query keys (e.g., `['yournewservice-tasks']`, `['yournewservice-analytics']`).
- **Real-time Updates:** Use the `useTaskUpdater` hook and Firebase RTDB to reflect task status changes instantly without needing to poll or manually refetch.
- **Styling:** Use Tailwind CSS and the existing design system for a consistent look and feel.
- **Error Handling:** Implement robust error handling on both the client and server.