# Service Layer Documentation

This document outlines the best practices for fetching service usage and limit data within the application.

## Data Fetching Strategies

There are two primary methods for fetching user service data:

1.  **Server-Side Fetching (Preferred for Initial Load)**
2.  **Client-Side Fetching (For Dynamic Updates)**

---

### 1. Server-Side Fetching with `ServiceUsageService`

This is the **preferred** method for fetching data required for the initial rendering of a page or component.

-   **Service:** `lib/services/serviceUsageService.ts`
-   **Key Method:** `ServiceUsageService.getServiceUsageForAllServices(userId)`

**When to use it:**

-   Use this in **Server Components** to fetch all necessary data before the page is sent to the client.
-   Ideal for parent components or layout files that need to provide initial data to their children.
-   This approach eliminates loading spinners for initial content, improves performance, and is better for SEO.

**Example:** The `FeatureUsageOverviewWrapper` component uses this service to fetch all usage data on the server and pass it as a prop to the client-side `FeatureUsageOverview` component.

---

### 2. Client-Side Fetching with API Route

This method should be used when data needs to be fetched or re-fetched dynamically on the client-side *after* the initial page load.

-   **API Route:** `app/api/user/feature-usage/route.ts`

**When to use it:**

-   Use this inside **Client Components** (marked with `"use client"`) that need to update data in response to user actions (e.g., clicking a "Refresh" button).
-   Suitable for components that display real-time or frequently changing data.
-   Use this when you need to check a specific limit without a full page reload.

**Example:** A "Refresh" button inside the `FeatureUsageOverview` component calls this API route to get the latest usage data without reloading the entire page.