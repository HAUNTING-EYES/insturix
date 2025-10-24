# ICS'25 Creator Pass System - Updated Architecture

## Overview
The Creator Pass system has been restructured to use a separate collection for better data management and clearer separation of concerns.

## Collections

### 1. ics25attendees
**Purpose**: Stores all regular attendee registrations (Bronze, Silver, Gold passes)

**Fields**:
- User details (name, email, phone, instagram, linkedin, etc.)
- attendeePassTier: 'bronze' | 'silver' | 'gold' | 'creators'
- payment: Payment status and details
- referral: Referral code and cashback info

**Note**: For Creator Pass, the attendeePassTier is set to 'creators' AFTER approval and payment completion.

### 2. ics25creators
**Purpose**: Stores all Creator Pass applications and approval workflow data

**Fields**:
- All form data (name, email, phone, social handles, etc.)
- socialLinks: { youtube, instagram, linkedin }
- status: 'pending' | 'approved' | 'rejected'
- submittedAt, reviewedAt, reviewedBy, rejectionReason
- hasCompletedPayment: Boolean flag for payment tracking

## Workflow

### Creator Pass Application Flow

1. **Submission** (`POST /api/ics25/creator-approval`)
   - User fills out form with all details + social media links
   - Data stored in `ics25creators` collection with status='pending'
   - User redirected to `/checkout/creator/review`

2. **Review Page** (`/checkout/creator/review`)
   - Shows pending status
   - Fetches data from `ics25creators` collection
   - User waits for admin review

3. **Admin Review** (`/admin/dashboard`)
   - Admin accesses dashboard (email-based access control)
   - Views all pending applications with social links
   - Can approve or reject with reason
   - Updates status in `ics25creators` collection

4. **Approval/Rejection**
   - **If Approved**: 
     - Status updated to 'approved' in `ics25creators`
     - User can access checkout form
     - Form shows "Pay Now" button
     - After payment, attendee record created in `ics25attendees` with tier='creators'
     - hasCompletedPayment flag updated in `ics25creators`
   
   - **If Rejected**:
     - Status updated to 'rejected' in `ics25creators`
     - Rejection reason stored
     - User redirected to `/checkout/creator/rejected`
     - Page shows reason and alternative pass options

## API Endpoints

### Creator Approval
- `POST /api/ics25/creator-approval` - Submit application
- `GET /api/ics25/creator-approval` - Check application status

### Admin
- `GET /api/ics25/admin/creator-approvals?status=pending` - List applications
- `POST /api/ics25/admin/creator-approvals` - Approve/reject application

### Attendees
- `POST /api/ics25/attendees` - Create/update attendee record
- `GET /api/ics25/attendees` - Get attendee details

## Admin Dashboard

### Access Control
- Located at `/admin/dashboard`
- Email-based access control
- Approved emails defined in `ADMIN_EMAILS` array or `ADMIN_EMAILS` env variable
- Unauthorized users redirected to home page

### Features
- Three tabs: Pending, Approved, Rejected
- View all creator applications with details
- Social media links clickable for verification
- Approve/reject actions with reason input
- Real-time updates after actions

### Adding Admin Emails
**Method 1 - Code** (for testing):
```typescript
// In app/admin/dashboard/page.tsx
const ADMIN_EMAILS = [
  "admin@insturix.com",
  "your-email@example.com", // Add here
];
```

**Method 2 - Environment Variable** (recommended for production):
```env
# In .env.local
ADMIN_EMAILS=admin@insturix.com,lakshya@insturix.com,another@example.com
```

## Key Files

### Schemas
- `schemas/ics25/Creator.ts` - Creator application schema
- `schemas/ics25/Attendee.ts` - Attendee schema (restored, no creatorApproval field)

### API Routes
- `app/api/ics25/creator-approval/route.ts` - Creator submission/status
- `app/api/ics25/admin/creator-approvals/route.ts` - Admin actions
- `app/api/ics25/attendees/route.ts` - Attendee management (simplified)

### Pages
- `app/admin/dashboard/page.tsx` - Admin dashboard page with access control
- `app/checkout/creator/review/page.tsx` - Under review status page
- `app/checkout/creator/rejected/page.tsx` - Rejection page with reason

### Components
- `components/admin/ICS25AdminDashboard.tsx` - Main admin dashboard component
- `components/ics25/CheckoutForm.tsx` - Updated to query both collections

## Benefits of New Architecture

1. **Clear Separation**: Creator applications and attendee registrations are separate
2. **Better Tracking**: Full application history maintained in `ics25creators`
3. **Simplified Attendees**: No approval logic mixed into attendee documents
4. **Admin Friendly**: Centralized dashboard with all creator management tools
5. **Security**: Email-based access control for admin functions
6. **Scalability**: Easy to add more admin features or approval workflows

## Migration Notes

- Old documents in `ics25attendees` with `creatorApproval` field are legacy
- New system creates fresh documents in `ics25creators` collection
- Both collections use same MongoDB database (ics25)
- No automatic migration needed - new submissions use new flow
