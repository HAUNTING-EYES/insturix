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

This system provides a single source of truth for all service limits and plan configurations. Instead of hardcoding limits in multiple places, you can now define them once in `lib/config/serviceLimits.ts` and use them throughout your application.

### Key Files and Endpoints

- **Configuration**: [`lib/config/serviceLimits.ts`](lib/config/serviceLimits.ts:1) - The single source of truth for all limits and plans.
- **Migration Endpoint**: [`/api/admin/migrations/service-limits`](app/api/admin/migrations/service-limits/route.ts:1) - Use this to migrate existing data to the new system.
- **Plan Seeder**: [`/api/admin/plans/seed`](app/api/admin/plans/seed/route.ts:1) - Use this to create or update plans in the database.

### Common Tasks

- **Migrate Data**: Run the migration endpoint to update all users and plans.
- **Update Plans**: Re-run the plan seeder to apply new configurations or add new currencies.
- **Check Limits**: Use the utility functions from `serviceLimits.ts` to get limits for any service or plan.

See the [API Endpoints](#api-endpoints) section for detailed curl commands.

## Configuration

The unified configuration is located in `lib/config/serviceLimits.ts`. This file replaces the redundant limit definitions that were previously scattered across user schemas, plan setup scripts, and configuration files.

### Key Components

#### 1. Service Limit Definitions (`SERVICE_LIMIT_DEFINITIONS`)

This object defines all available service limits, including their names, descriptions, reset periods, and categories.

- **Key**: `limitType` (e.g., `AnalysisMinutes`, `maxVideoEdits`)
- **Value**: `ServiceLimitConfig` object

```typescript
export interface ServiceLimitConfig {
  name: string;
  description: string;
  icon?: string;
  defaultResetPeriod: "weekly" | "monthly" | "daily" | "none";
  category?: "count" | "duration" | "storage" | "time";
  unit?: string;
}
```

#### 2. Service Plan Configurations (`SERVICE_PLAN_CONFIGS`)

This array defines the service limits for each plan type (free, plus, pro, premium) across all services.

- **Structure**: `ServicePlanConfig` array

```typescript
export interface ServicePlanConfig {
  serviceName: string;
  planType: "free" | "plus" | "pro" | "premium";
  limits: Record<string, number>; // limitType -> maxUsage
  resetPeriods?: Record<string, "weekly" | "monthly" | "daily" | "none">;
}
```

#### 3. Service Pricing Configurations (`SERVICE_PRICING_CONFIGS`)

This object defines the pricing for all plans and currencies.

- **Key**: `currencyCode` (e.g., `USD`, `INR`)
- **Value**: `CurrencyPricing` object

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

### Utility Functions

The configuration file provides several utility functions for working with service limits:

- `getPlanLimits(serviceName, planType)`: Returns the service limits for a specific plan.
- `getLimitDisplayName(limitType)`: Returns the human-readable name for a limit type.
- `getLimitDescription(limitType)`: Returns the description for a limit type.
- `getAllLimitTypesForService(serviceName)`: Returns all limit types for a specific service.
- `getAllServiceLimitMappings()`: Returns a mapping of limit types to display names.

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

### Benefits

- **Single Source of Truth**: All service limit definitions are centralized in one file.
- **Reduced Redundancy**: Eliminates duplicate limit definitions across the codebase.
- **Easy Maintenance**: Adding or modifying service limits is now a simple process.
- **Consistency**: Ensures that all services use the same limit definitions and logic.
- **Scalability**: The system is designed to easily accommodate new services and limit types.

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