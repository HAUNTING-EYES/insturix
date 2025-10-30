# Admin API Reference

This document provides a comprehensive guide for administrators to manage the unified service limits configuration, plans, and perform data migrations. 

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints) 
  - [Migrate Service Limits](#migrate-service-limits)
  - [Plan Management](#plan-management)
    - [Seed Plans](#seed-plans)
    - [Get All Plans](#get-all-plans)
    - [Get a Specific Plan](#get-a-specific-plan)
    - [Update a Plan](#update-a-plan)
    - [Delete a Plan](#delete-a-plan)
- [System Overview](#system-overview)
  - [Key Components](#key-components)
  - [Utility Functions](#utility-functions)
  - [Usage in Services](#usage-in-services)
- [Benefits](#benefits)

## Quick Start

This system provides a single source of truth for all service limits and plan configurations.All limits are defined once in `lib/config/serviceLimits.ts` and automatically applied throughout the application.

### Key Files and Endpoints

- **Configuration**: [`lib/config/serviceLimits.ts`](lib/config/serviceLimits.ts:1) - The single source of truth for all limits, plans, and pricing.
- **Migration Endpoint**: [`/api/admin/migrations/service-limits`](app/api/admin/migrations/service-limits/route.ts:1) - Migrates existing data to the unified system.
- **Plan Seeder**: [`/api/admin/plans/seed`](app/api/admin/plans/seed/route.ts:1) - Creates or updates plans in the database.

### Common Tasks

- **Migrate Data**: Run the migration endpoint to update all users and plans to the unified structure.
- **Update Plans**: Re-run the plan seeder after modifying `serviceLimits.ts` to apply changes.
- **Add New Service**: Simply add to `UNIFIED_SERVICE_LIMITS` and run migration.
- **Add New Plan**: Add plan type to interfaces and run migration.

See the [API Endpoints](#api-endpoints) section for detailed curl commands.

## Configuration

The unified configuration is located in `lib/config/serviceLimits.ts`. This file is the single source of truth for all service limits, plan configurations, and pricing.

### Key Components


#### 1. Unified Service Limits (`UNIFIED_SERVICE_LIMITS`)

This is the single source of truth that combines service limit definitions with plan configurations. It's organized by service name, then by limit type.

- **Structure**: `Record<serviceName, Record<limitType, ServiceLimitConfig>>`

```typescript
export interface ServiceLimitConfig {
  name: string;
  description: string;
  icon?: string;
  defaultResetPeriod: "weekly" | "monthly" | "daily" | "none";
  category?: "count" | "duration" | "storage" | "time";
  unit?: string;
  planLimits: {
    free: number;
    plus: number;
    pro: number;
    premium: number;
  };
  resetPeriods?: {
    free?: "weekly" | "monthly" | "daily" | "none";
    plus?: "weekly" | "monthly" | "daily" | "none";
    pro?: "weekly" | "monthly" | "daily" | "none";
    premium?: "weekly" | "monthly" | "daily" | "none";
  };
}
```

#### 2. Service Pricing Configurations (`SERVICE_PRICING_CONFIGS`)

This object defines the pricing for all plans and currencies in a clean, organized structure.

- **Structure**: `Record<planType, Record<currencyCode, CurrencyPricing>>`

```typescript
export interface CurrencyPricing {
  monthly: PricingDetail;
  yearly: PricingDetail;
}

export interface PricingDetail {
  amount: number;
  currency: string;
  symbol: string;
  providerPlanIds?: Map<string, string>;
}
```

#### 3. Clean Architecture

- **No Backward Compatibility**: Removed legacy exports to maintain clean codebase
- **Single Source of Truth**: All configurations come from one place
- **Type Safety**: Full TypeScript support with proper interfaces

### Utility Functions

The configuration file provides several utility functions for working with service limits:

- `getPlanLimits(serviceName, planType, forUser?)`: Returns the service limits for a specific plan. Set `forUser=true` to include `currentUsage` and `lastReset` fields.
- `getLimitDisplayName(limitType, serviceName?)`: Returns the human-readable name for a limit type.
- `getLimitDescription(limitType, serviceName?)`: Returns the description for a limit type.
- `getAllLimitTypesForService(serviceName)`: Returns all limit types for a specific service.
- `getAllServiceLimitMappings()`: Returns a mapping of limit types to display names.
- `getLimitByCategory(category)`: Returns all limits of a specific category (count, duration, storage, time).

### Usage in Services

#### Service Usage Service

The `lib/services/serviceUsageService.ts` has been updated to use the unified configuration for checking and incrementing service usage.

#### Middleware

Service-specific middleware (e.g., `lib/middleware/services/alyzitron.ts`) uses the `createLimitMiddleware` function from `lib/middleware/limitMiddleware.ts` to create limit-checking middleware instances.

#### API Endpoints

API endpoints that enforce service limits (e.g., `app/api/services/alyzitron/analyze/route.ts`) use the middleware to check limits and increment usage.

## API Endpoints

### Migrate Service Limits

Use this endpoint to migrate existing users and plans to the new unified configuration. It's recommended to run a dry run first.

#### Dry Run (Recommended)

This will show you what changes will be made without actually applying them.

```bash
curl -X POST "http://localhost:3000/api/admin/migrations/service-limits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY" \
  -d '{
    "dryRun": true
  }'
```

#### Real Migration

This will apply the changes to the database.

```bash
curl -X POST "http://localhost:3000/api/admin/migrations/service-limits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY" \
  -d '{
    "dryRun": false
  }'
```

**Response:**
```json
{
  "message": "Migration completed successfully.",
  "migratedUsers": 150,
  "migratedPlans": 4,
  "errors": []
}
```

### Plan Management

#### Seed Plans

Use this endpoint to create or update plans in the database. This will generate service limits for all plans and create Razorpay plans for supported currencies.

```bash
curl -X POST "http://localhost:3000/api/admin/plans/seed" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY"
```

**Response:**
```json
{
  "message": "Plan seeding completed.",
  "created": 0,
  "updated": 4,
  "skipped": 0
}
```

#### Get All Plans

Use this endpoint to retrieve all plans from the database.

```bash
curl "http://localhost:3000/api/admin/plans" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY"
```

**Response:**
```json
{
  "plans": [
    {
      "_id": "64f8d0e8b54764421b7156a3",
      "name": "Free Plan",
      "type": "free",
      "description": "Basic features for getting started",
      "serviceLimits": {
        "alyzitron": [
          {
            "limitType": "AnalysisMinutes",
            "maxUsage": 60,
            "currentUsage": 0,
            "resetPeriod": "monthly"
          }
        ]
      },
      "pricing": {
        "INR": {
          "monthly": {
            "amount": 0,
            "currency": "INR",
            "symbol": "₹",
            "providerPlanIds": {
              "razorpay": "pln_test_123"
            }
          }
        }
      },
      "isActive": true,
      "sortOrder": 1
    }
  ]
}
```

#### Get a Specific Plan

Use this endpoint to retrieve a specific plan by its ID.

```bash
curl "http://localhost:3000/api/admin/plans?id=64f8d0e8b54764421b7156a3" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY"
```

#### Update a Plan

Use this endpoint to update an existing plan. You can modify the service limits, pricing, or other properties.

```bash
curl -X PUT "http://localhost:3000/api/admin/plans/64f8d0e8b54764421b7156a3" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY" \
  -d '{
    "name": "Updated Free Plan",
    "description": "Updated description",
    "isActive": true
  }'
```

#### Delete a Plan

Use this endpoint to delete a plan by its ID.

```bash
curl -X DELETE "http://localhost:3000/api/admin/plans/64f8d0e8b54764421b7156a3" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY"
```

**Response:**
```json
{
  "message": "Plan deleted successfully."
}
```

## System Overview

### Adding New Services or Limits

To add a new service or limit, follow these simple steps:

#### Adding a New Service

1. **Add to `UNIFIED_SERVICE_LIMITS`**:
```typescript
export const UNIFIED_SERVICE_LIMITS = {
  // ... existing services
  newservice: {
    maxNewFeature: {
      name: 'New Feature Usage',
      description: 'Description of the new feature limit',
      icon: 'IconName',
      defaultResetPeriod: 'monthly',
      category: 'count',
      unit: 'uses',
      planLimits: {
        free: 5,
        plus: 50,
        pro: 200,
        premium: -1
      }
    }
  }
};
```

2. **Update `IServiceLimits` interface** in `types/userTypes.ts`:
```typescript
export interface IServiceLimits {
  // ... existing services
  newservice: IServiceLimit[];
}
```

3. **Run migration** to apply changes:
```bash
curl -X POST "http://localhost:3000/api/admin/migrations/service-limits" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY" \
  -d '{"dryRun": false}'
```

#### Adding a New Plan Type

1. **Update interfaces** to include new plan type in all relevant places
2. **Add pricing** to `SERVICE_PRICING_CONFIGS`
3. **Run migration** to apply changes

### Benefits

- **Single Source of Truth**: All service limits, plans, and pricing are centralized in one file.
- **Zero Redundancy**: No duplicate definitions anywhere in the codebase.
- **Easy Maintenance**: Adding services, limits, or plans requires minimal changes.
- **Type Safety**: Full TypeScript support with proper interfaces and validation.
- **Clean Architecture**: No backward compatibility exports or legacy code.
- **Automatic Migration**: Changes are automatically applied via migration system.

## API Examples

This section provides curl examples for interacting with the new unified service limits system.

### 1. Migrate Service Limits

Use this endpoint to migrate existing users and plans to the new unified configuration. It's recommended to run a dry run first.

#### Dry Run (Recommended)

This will show you what changes will be made without actually applying them.

```bash
curl -X POST "http://localhost:3000/api/admin/migrations/service-limits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY" \
  -d '{
    "dryRun": true
  }'
```

#### Real Migration

This will apply the changes to the database.

```bash
curl -X POST "http://localhost:3000/api/admin/migrations/service-limits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY" \
  -d '{
    "dryRun": false
  }'
```

**Response:**
```json
{
  "message": "Migration completed successfully.",
  "migratedUsers": 150,
  "migratedPlans": 4,
  "errors": []
}
```

### 2. Seed Plans

Use this endpoint to create or update plans in the database. This will generate service limits for all plans and create Razorpay plans for supported currencies.

```bash
curl -X POST "http://localhost:3000/api/admin/plans/seed" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY"
```

**Response:**
```json
{
  "message": "Plan seeding completed.",
  "created": 0,
  "updated": 4,
  "skipped": 0
}
```

### 3. Get All Plans

Use this endpoint to retrieve all plans from the database.

```bash
curl "http://localhost:3000/api/admin/plans" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY"
```

**Response:**
```json
{
  "plans": [
    {
      "_id": "64f8d0e8b54764421b7156a3",
      "name": "Free Plan",
      "type": "free",
      "description": "Basic features for getting started",
      "serviceLimits": {
        "alyzitron": [
          {
            "limitType": "AnalysisMinutes",
            "maxUsage": 60,
            "currentUsage": 0,
            "resetPeriod": "monthly"
          }
        ]
      },
      "pricing": {
        "INR": {
          "monthly": {
            "amount": 0,
            "currency": "INR",
            "symbol": "₹",
            "providerPlanIds": {
              "razorpay": "pln_test_123"
            }
          }
        }
      },
      "isActive": true,
      "sortOrder": 1
    }
  ]
}
```

### 4. Get a Specific Plan

Use this endpoint to retrieve a specific plan by its ID.

```bash
curl "http://localhost:3000/api/admin/plans?id=64f8d0e8b54764421b7156a3" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY"
```

### 5. Update a Plan

Use this endpoint to update an existing plan. You can modify the service limits, pricing, or other properties.

```bash
curl -X PUT "http://localhost:3000/api/admin/plans/64f8d0e8b54764421b7156a3" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY" \
  -d '{
    "name": "Updated Free Plan",
    "description": "Updated description",
    "isActive": true
  }'
```
