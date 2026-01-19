# Credits-Based Billing System

**Status:** ✅ Core Implementation Complete  
**Last Updated:** January 18, 2026

---

## Overview

Unified credits system replacing per-service usage limits. Credits are deducted on service use and refunded on failures.

### Credit Allocations

| Plan | Monthly Credits |
|------|----------------|
| Free | 50 |
| Plus | 500 |
| Pro | 2000 |
| Enterprise | Custom |

---

## Implementation Status

### ✅ Core Infrastructure
- `schemas/user.ts` - Credits schema added to User model
- `lib/config/creditCosts.ts` - Credit cost configuration per service
- `lib/services/creditsService.ts` - Balance, deduction, refund operations
- `lib/services/creditsMigrationService.ts` - Lazy migration for existing users

### ✅ API Routes
| Route | Purpose |
|-------|---------|
| `GET /api/user/credits` | Get balance + recent transactions |
| `POST /api/user/credits/topup` | Create Razorpay order for topup |
| `GET /api/user/credits/topup` | List topup packages |

### ✅ Webhook Integration
- `app/api/webhooks/razorpay/route.ts`
  - `subscription.activated` → Grant subscription credits
  - `subscription.charged` → Grant renewal credits
  - `payment.captured` → Process topup credits

### ✅ Service Integration

| Service | Status | Credit Cost |
|---------|--------|-------------|
| Alyzitron | ✅ | 2 per minute of video |
| ThinkForge | ✅ | 1 per chat message |
| Musitron | ✅ | 3, 8, or 20 (Model Dependent) |
| Clickatron | ✅ | 3 per variation |
| **Editron** | ⏳ Pending | Token-based (TBD) |

### ✅ Frontend Components
- `hooks/useCredits.ts` - React Query hook with auto-refresh
- `components/shared/CreditsCard.tsx` - Balance display + transactions
- `components/shared/CreditsBadge.tsx` - Compact navbar badge
- `components/shared/CreditsTopupModal.tsx` - Topup purchase flow
- `components/shared/CreditsErrorPopup.tsx` - Insufficient credits popup

### ✅ Failure Handling
- `lib/services/tasks/handle-failure.ts` - Refunds credits on task timeout
- `app/api/cron/check-task-timeouts/route.ts` - 15-min timeout cron (existing)

---

## Key Files Reference

```
lib/
├── config/creditCosts.ts          # Cost per service/action
├── services/
│   ├── creditsService.ts          # Core credits operations
│   ├── creditsMigrationService.ts # Lazy migration for existing users
│   └── creditsMiddleware.ts       # withCredits() wrapper
├── middleware/
│   ├── limitMiddleware.ts         # Updated: useCredits mode
│   └── services/
│       ├── alyzitron.ts           # useCredits: true
│       ├── clickatron.ts          # useCredits: true
│       └── musitron.ts            # useCredits: true

hooks/
└── useCredits.ts                  # React Query hook (shared query key)

components/shared/
├── CreditsCard.tsx                # Balance display
├── CreditsBadge.tsx               # Navbar badge
├── CreditsTopupModal.tsx          # Topup flow
└── CreditsErrorPopup.tsx          # Insufficient credits
```

---

## Credit Flow

### Deduction (Alyzitron Example)
```
1. User submits video → checkAlyzitronLimits()
2. Limits check passes → incrementAlyzitronUsage()
3. Credits deducted → CreditsService.deductCredits()
4. Task created in MongoDB → Sent to QStash
```

### Refund on Failure
```
1. Task fails (timeout/error)
2. handleTaskFailure() called
3. Calculate credits: getCreditCost('alyzitron', 'video_analysis', {durationMinutes})
4. CreditsService.refundCredits() → Credits restored
5. Task marked: refunded: true
```

---

## Remaining Work

### ✅ Completed
- [x] **Billing Page Overhaul** - Credits-based billing page with balance display, transaction history, and top-up flow.
- [x] **Data Migration & Cleanup** - `ServiceUsageService` deprecated, `creditsMigrationService` handles lazy migration.
- [x] **Clickatron Credits Integration** - Fully migrated to credits system.
- [x] **Legacy Code Deprecation** - `serviceLimits.ts` and `serviceUsageService.ts` marked deprecated.

### ⏳ Pending
- [ ] **Editron Token Integration** - Use `TokenCreditTracker` for token-based billing (High effort).

### Low Priority (Future)
- [ ] Add credits usage analytics dashboard.
- [ ] Implement credits expiry warning emails.


---

## Testing Checklist

### New User Flow
- [ ] Sign up → Gets 50 free credits
- [ ] CreditsCard shows 50 credits
- [ ] Use Alyzitron → Credits deducted

### Existing User Migration
- [ ] Login with existing account → ensureMigrated() runs
- [ ] Credits granted based on plan (free=50, plus=500, pro=2000)
- [ ] `/api/user/credits` returns correct balance

### Failure Refund
- [ ] Start analysis → Simulate task timeout (15 min)
- [ ] Cron runs → detectsstuck task
- [ ] Credits refunded → Task marked refunded

### Top-up Purchase
- [ ] Open top-up modal → Select package
- [ ] Complete Razorpay payment
- [ ] Webhook processes → Credits added as topup

---

## Environment Variables

```bash
# Already configured in app
CRON_SECRET=xxx          # For cron job auth
RAZORPAY_KEY_ID=xxx      # Payment gateway
RAZORPAY_KEY_SECRET=xxx
```

---

## For New Developers

### To add credits to a new service:

1. Add cost config in `lib/config/creditCosts.ts`:
   ```typescript
   newservice: [{
     service: 'newservice',
     action: 'main_action',
     billingType: 'per_request',
     baseCost: 5,
     description: 'Per request',
   }]
   ```

2. Update service middleware in `lib/middleware/services/`:
   ```typescript
   export const CONFIG: LimitConfig = {
     serviceName: 'newservice',
     useCredits: true,
     creditAction: 'main_action',
     // ...
   };
   ```

3. Use `withCredits()` wrapper or call `CreditsService` directly.

### To invalidate credits display (trigger refresh):
```typescript
import { useCredits } from '@/hooks/useCredits';

const { invalidateCredits } = useCredits();
// After any credits-changing action:
invalidateCredits();
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                  │
├─────────────────────────────────────────────────────────────────┤
│  CreditsCard ←──→ useCredits() ←──→ React Query Cache           │
│  CreditsBadge      (shared)          CREDITS_QUERY_KEY          │
│  VideoUpload                                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ /api/user/credits
┌─────────────────────────────────────────────────────────────────┐
│                        Backend                                   │
├─────────────────────────────────────────────────────────────────┤
│  CreditsService                                                  │
│  ├── getBalance()                                                │
│  ├── deductCredits()   ←── Service Middlewares                   │
│  ├── refundCredits()   ←── handleTaskFailure()                   │
│  ├── grantSubscriptionCredits() ←── Razorpay Webhook             │
│  └── grantTopupCredits()       ←── Razorpay Webhook              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      MongoDB (User doc)                          │
├─────────────────────────────────────────────────────────────────┤
│  creditsBalance: {                                               │
│    subscriptionCredits: 50,                                      │
│    topupCredits: 0,                                              │
│    subscriptionCreditsExpiry: Date,                              │
│    lastSubscriptionGrant: Date,                                  │
│  }                                                               │
│  creditsTransactionHistory: [...]                                │
└─────────────────────────────────────────────────────────────────┘
```
