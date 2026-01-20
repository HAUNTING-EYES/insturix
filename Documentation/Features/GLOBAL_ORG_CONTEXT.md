# Global Organization Context - Implementation Plan

**Status:** ✅ Implemented  
**Last Updated:** January 20, 2026

---

## Overview

This document outlines the implementation plan for **global organization context** across all Insturix services. When a user switches to an organization context, ALL work done in any service (Editron, Alyzitron, Clickatron, Musitron, ThinkForge, Socialize) will be associated with that organization and shared with team members.

### Pattern: Global Context (Slack/Vercel Style)

- User switches org context **once** using the OrgSwitcher in the sidebar
- **All** subsequent actions happen in that context until switched back
- Tasks, projects, and outputs are automatically tagged with `orgId`
- Team members can view and access shared work

---

## Current State (Implemented ✅)

| Component | Status |
|-----------|--------|
| `Organization` schema | ✅ Done |
| `OrgMember` schema | ✅ Done |
| `organizationService.ts` | ✅ Done |
| `orgMemberService.ts` | ✅ Done |
| Clerk webhook handlers | ✅ Done |
| `/api/org/*` API routes | ✅ Done |
| `OrgSwitcher` component | ✅ Done |
| Org dashboard pages | ✅ Done |
| `contexts/OrgContext.tsx` | ✅ Done |
| Clickatron `orgId` integration | ✅ Done |
| Musitron `orgId` integration | ✅ Done |
| ThinkForge `orgId` integration | ✅ Done |
| Alyzitron `orgId` integration | ✅ Done |

---

## Implementation Plan

### Phase 1: Global Context Provider

Create a React context that tracks the active organization globally.

#### New Files

##### `contexts/OrgContext.tsx`

```tsx
'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useOrganization } from '@clerk/nextjs';

interface OrgContextValue {
  activeOrgId: string | null;
  activeOrgName: string | null;
  isOrgContext: boolean;
  // Clerk's setActive is used for switching
}

const OrgContext = createContext<OrgContextValue>({
  activeOrgId: null,
  activeOrgName: null,
  isOrgContext: false,
});

export function OrgContextProvider({ children }: { children: ReactNode }) {
  const { organization } = useOrganization();
  
  return (
    <OrgContext.Provider value={{
      activeOrgId: organization?.id || null,
      activeOrgName: organization?.name || null,
      isOrgContext: !!organization,
    }}>
      {children}
    </OrgContext.Provider>
  );
}

export const useOrgContext = () => useContext(OrgContext);
```

##### Wrap in Layout

```tsx
// app/dashboard/layout.tsx
import { OrgContextProvider } from '@/contexts/OrgContext';

export default function DashboardLayout({ children }) {
  return (
    <OrgContextProvider>
      {/* existing layout */}
    </OrgContextProvider>
  );
}
```

---

### Phase 2: Update Service Schemas

Add optional `orgId` field to all service schemas/interfaces.

#### Alyzitron

```typescript
// schemas/ClickatronTask.ts (or wherever tasks are defined)
interface IAlyzitronTask {
  // ... existing fields
  orgId?: string;  // null = personal, set = org-owned
}
```

#### Clickatron

```typescript
interface IClickatronTask {
  // ... existing fields
  orgId?: string;
}
```

#### Musitron

```typescript
interface IMusitronGeneration {
  // ... existing fields
  orgId?: string;
}
```

#### ThinkForge

```typescript
interface IThinkForgeSession {
  // ... existing fields
  orgId?: string;
}
```

#### Socialize

```typescript
interface ISocializePost {
  // ... existing fields
  orgId?: string;
}
```

---

### Phase 3: Update API Routes

Modify each service's API routes to:
1. Read `orgId` from request body/query OR Clerk session
2. Store `orgId` when creating tasks/items
3. Filter by `orgId` when listing items

#### Example Pattern

```typescript
// app/api/services/[service]/route.ts

import { auth } from '@clerk/nextjs/server';

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  
  // orgId comes from Clerk's active organization
  const task = await createTask({
    userId,
    orgId: orgId || null,  // null = personal
    // ... other fields
  });
}

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth();
  
  // Filter tasks by org context
  const tasks = await listTasks({
    userId,
    orgId: orgId || null,
  });
}
```

#### Services to Update

| Service | API Route | Priority |
|---------|-----------|----------|
| Editron | `/api/services/editron/*` | ✅ Already done |
| Alyzitron | `/api/services/alyzitron/*` | High |
| Clickatron | `/api/services/clickatron/*` | High |
| Musitron | `/api/services/musitron/*` | Medium |
| ThinkForge | `/api/services/thinkforge/*` | Medium |
| Socialize | `/api/services/socialize/*` | Low |

---

### Phase 4: Update List Views

Each service's dashboard/list page should:
1. Show items filtered by current org context
2. Display org badge on items when in personal view but item belongs to org
3. Allow toggling "Show all" vs "Current context only"

#### UI Changes

- Add context indicator in service headers: "Personal" or "Org: [Name]"
- Filter list queries by `orgId`
- Optional: Add filter toggle to show personal + all orgs

---

### Phase 5: Access Control

Ensure team members can access org items but not edit unless they have permission.

#### Rules

| Action | Owner | Org Admin | Org Member | Non-member |
|--------|-------|-----------|------------|------------|
| View org items | ✅ | ✅ | ✅ | ❌ |
| Create in org context | ✅ | ✅ | ✅ | ❌ |
| Edit own org items | ✅ | ✅ | ✅ | ❌ |
| Edit others' org items | ✅ | ✅ | ❌ | ❌ |
| Delete org items | ✅ | ✅ | ❌ (own only) | ❌ |

---

## File Changes Summary

### New Files

| Path | Purpose |
|------|---------|
| `contexts/OrgContext.tsx` | Global org context provider |

### Modified Files

| Path | Change |
|------|--------|
| `app/dashboard/layout.tsx` | Wrap with OrgContextProvider |
| `schemas/ClickatronTask.ts` | Add `orgId` field |
| `schemas/AlyzitronTask.ts` | Add `orgId` field |
| `schemas/MusitronGeneration.ts` | Add `orgId` field |
| `schemas/ThinkForgeSession.ts` | Add `orgId` field |
| All service API routes | Read `orgId` from auth, filter/store |
| All service list pages | Filter by org context |

---

## Testing Checklist

### Context Switching
- [ ] Switch to org → all new items created in org context
- [ ] Switch to personal → all new items created personally
- [ ] Context persists across page navigation
- [ ] Context persists across browser refresh (Clerk handles this)

### Service Integration
- [ ] Editron: Projects filtered by context
- [ ] Alyzitron: Tasks filtered by context
- [ ] Clickatron: Sessions filtered by context
- [ ] Musitron: Generations filtered by context
- [ ] ThinkForge: Sessions filtered by context

### Access Control
- [ ] Org member can view team items
- [ ] Org member cannot edit others' items (unless admin)
- [ ] Non-member cannot access org items
- [ ] Removed member loses access immediately

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Context Provider | 0.5 day |
| Phase 2: Schema Updates | 0.5 day |
| Phase 3: API Routes | 2 days |
| Phase 4: List Views | 1 day |
| Phase 5: Access Control | 1 day |
| **Total** | **~5 days** |

---

## Notes for Developers

1. **Clerk handles the heavy lifting**: The `orgId` from `auth()` automatically reflects the user's active organization. No need to manage org state manually.

2. **Billing remains individual**: Credits are charged to the individual user, not the organization. No changes to billing logic needed.

3. **Backwards compatibility**: All queries should handle `orgId: null` as "personal" items. Existing items without `orgId` are treated as personal.

4. **OrgSwitcher already exists**: The UI for switching context is in `components/org/OrgSwitcher.tsx`. It uses Clerk's `setActive()` to change the active org.

5. **Don't create items from org page**: Projects/tasks should be created from within each service when in org context, not from the organization dashboard.
