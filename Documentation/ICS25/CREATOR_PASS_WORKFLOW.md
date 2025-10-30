# Creator Pass Approval Workflow

## Overview
The Creator Pass requires a multi-stage approval process where applicants must fill out complete registration details along with social media links, then wait for admin approval before payment.

## Workflow Stages

### Stage 1: Complete Registration + Social Links
**Location**: `/checkout?tier=creators`
**Component**: `CheckoutForm.tsx`

- User selects Creator Pass tier from ICS'25 page
- Same checkout page as other tiers
- User fills ALL required fields:
  - Name, email, phone
  - Instagram handle (required)
  - LinkedIn profile (required)
  - YouTube channel (optional - shown only for Creator tier)
  - Organization (optional)
  - Profession, age group
  - City, state
- Button shows **"Submit for Review"** instead of "Pay Now"
- System validates: At least one social link (YouTube/Instagram/LinkedIn)
- On submit: Creates attendee record with `creatorApproval.status = 'pending'`

**API Endpoint**: `POST /api/ics25/creator-approval`

### Stage 2: Under Review
**Location**: `/checkout/creator/review`
**Page**: `app/checkout/creator/review/page.tsx`

- User automatically redirected here after submission
- Shows "Under Review" status
- Displays timeline: 24-48 hours
- Shows eligibility requirements reminder
- User cannot proceed until admin reviews

**Status**: `creatorApproval.status = 'pending'`

### Stage 3: Admin Review
**Location**: `/admin/creator-approvals`
**Component**: `CreatorApprovalsAdmin.tsx`

Admin can:
- View all pending applications
- See user details + submitted social media links (clickable)
- Approve applications (if 10k+ followers verified)
- Reject applications with reason

**API Endpoints**:
- `GET /api/ics25/admin/creator-approvals?status=pending` - List applications
- `POST /api/ics25/admin/creator-approvals` - Approve/reject

**Admin Access**:
- Requires `publicMetadata.role = 'admin'` OR `privateMetadata.role = 'admin'`
- Set via Clerk dashboard

### Stage 4A: Approved → Payment
**Status**: `creatorApproval.status = 'approved'`

- User returns to `/checkout?tier=creators`
- System detects approved status
- Button now shows **"Pay Now"** (₹3,000)
- User proceeds to Razorpay payment
- After successful payment → Success page

### Stage 4B: Rejected → Alternative Options
**Location**: `/checkout/creator/rejected`
**Page**: `app/checkout/creator/rejected/page.tsx`

- Shows rejection reason from admin
- Displays alternative pass options:
  - Bronze Pass (Free)
  - Silver Pass (₹2,500)
  - Gold Pass (₹5,000)
- User can select alternative tier
- Contact support option available

### Stage 5: Success
**Location**: `/checkout/success`

- Same as other pass tiers
- Confirmation of registration
- Access to event details

## Database Schema

### Attendee Schema Updates
```typescript
creatorApproval: {
  status: 'pending' | 'approved' | 'rejected',
  socialLinks: {
    youtube: string,
    instagram: string,
    linkedin: string,
  },
  submittedAt: Date,
  reviewedAt: Date,
  reviewedBy: string,  // Admin Clerk userId
  rejectionReason: string,
}
```

## API Endpoints

### Creator Approval API (`/api/ics25/creator-approval`)
- **POST**: Submit social links for review
- **GET**: Check approval status

### Admin Approvals API (`/api/ics25/admin/creator-approvals`)
- **POST**: Approve or reject application
- **GET**: List pending/approved/rejected applications

### Attendees API (`/api/ics25/attendees`)
- Updated to validate Creator approval status
- Blocks Creator Pass registration without approval

## Components

### Core Components
- `CreatorSocialLinksForm.tsx` - Social links submission form
- `CreatorPassManager.tsx` - Manages Creator workflow routing
- `CheckoutFormWrapper.tsx` - Wraps checkout with Creator logic
- `CreatorApprovalsAdmin.tsx` - Admin dashboard for approvals

### Pages
- `/checkout?tier=creators` - Social links submission
- `/checkout/creator/review` - Under review status
- `/checkout/creator/rejected` - Rejection with alternatives
- `/admin/creator-approvals` - Admin approval dashboard

## Key Features

1. **Automatic Routing**: System automatically routes users based on approval status
2. **Status Persistence**: Approval status stored in database
3. **Admin Controls**: Full admin interface for managing applications
4. **User Notifications**: Clear messaging at each stage
5. **Fallback Options**: Rejected users can choose alternative passes
6. **Security**: Admin-only access with Clerk role validation

## User Experience Flow

```
User selects Creator Pass from ICS'25 page
    ↓
Same checkout page (all tiers)
    ↓
Fills ALL details + social links
    ↓
Clicks "Submit for Review" (instead of Pay Now)
    ↓
"Under Review" page (24-48 hours)
    ↓
Admin reviews social profiles
    ↓
    ├─→ APPROVED → User returns → Clicks "Pay Now" → Payment → Success
    └─→ REJECTED → Rejection page → Alternative passes
```

## Testing Checklist

- [ ] Select Creator Pass from ICS'25 page
- [ ] Verify same checkout form appears
- [ ] Fill all registration fields
- [ ] Add YouTube/Instagram/LinkedIn links
- [ ] Verify button says "Submit for Review"
- [ ] Submit and verify redirect to review page
- [ ] Admin: View pending applications
- [ ] Admin: Approve application
- [ ] User: Return to checkout, verify "Pay Now" button
- [ ] User: Complete payment
- [ ] Admin: Reject application
- [ ] User: View rejection page
- [ ] User: Select alternative tier

## Admin Setup

To grant admin access to a user:
1. Go to Clerk Dashboard
2. Select user
3. Under "Public metadata" or "Private metadata", add:
   ```json
   {
     "role": "admin"
   }
   ```
4. Save changes

## Notes

- Minimum 10,000+ followers required on any platform
- Review typically takes 24-48 hours
- Approval is manual to ensure quality control
- Rejected users retain access to other pass tiers
- Creator Pass includes all Gold Pass benefits + priority access, brand shoutout, banner featuring
