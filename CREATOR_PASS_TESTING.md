# ICS'25 Creator Pass System - Testing Guide

## What Changed

### Before
- Creator approval data stored in `ics25attendees` collection as a nested `creatorApproval` field
- Mixed attendee and approval logic
- Admin dashboard at `/admin/creator-approvals`

### After
- Creator applications stored in separate `ics25creators` collection
- Clean separation between attendees and creator applications
- Unified admin dashboard at `/admin/dashboard` with email-based access control
- Attendee schema restored to original structure (no creatorApproval field)

## Testing Checklist

### 1. Creator Pass Application Submission

**Steps**:
1. Go to `/ics25` or `/checkout?tier=creators`
2. Fill out all form fields:
   - Personal info (name, email, phone)
   - Instagram handle (required)
   - LinkedIn profile (required)
   - YouTube channel (optional but recommended)
   - Organization, profession, age group
   - Location (city, state)
3. Click "Submit for Review"

**Expected Result**:
- ✅ Success toast: "Application Submitted!"
- ✅ Redirect to `/checkout/creator/review`
- ✅ Document created in `ics25creators` collection with:
  - All form data
  - `status: 'pending'`
  - `socialLinks: { youtube, instagram, linkedin }`
  - `submittedAt: <timestamp>`
  - `hasCompletedPayment: false`

**MongoDB Check**:
```javascript
// In MongoDB Compass or shell
db.ics25creators.findOne({ email: "test@example.com" })
```

Should show complete document with all fields.

### 2. Under Review Page

**Steps**:
1. After submission, verify you're on `/checkout/creator/review`
2. Check page content

**Expected Result**:
- ✅ Shows "Application Under Review" title
- ✅ Timeline showing submitted and under review steps
- ✅ "Expected Timeline: 24-48 hours" message
- ✅ FAQ section with common questions
- ✅ If user navigates away and comes back, still shows review page

### 3. Admin Dashboard Access

**Steps**:
1. Sign in with an admin email (defined in `ADMIN_EMAILS`)
2. Navigate to `/admin/dashboard`

**Expected Result**:
- ✅ Dashboard loads successfully
- ✅ Shows three tabs: Pending, Approved, Rejected
- ✅ Pending tab shows submitted applications
- ✅ Each application card displays:
  - Name, email, phone
  - Profession, organization, age group, location
  - Social media links (clickable)
  - Status badge
  - Approve/Reject buttons

**For Non-Admin Users**:
- ✅ Redirected to home page (/)
- ✅ No error shown, silent redirect

### 4. Admin Approval

**Steps**:
1. In admin dashboard, find pending application
2. Click "Approve" button

**Expected Result**:
- ✅ Success toast: "Approved! Creator Pass application for [name] has been approved"
- ✅ Application moves from Pending to Approved tab
- ✅ Document in `ics25creators` updated:
  - `status: 'approved'`
  - `reviewedAt: <timestamp>`
  - `reviewedBy: <admin email>`

### 5. Admin Rejection

**Steps**:
1. In admin dashboard, find pending application
2. Click "Reject" button
3. Enter rejection reason in dialog
4. Click "Reject Application"

**Expected Result**:
- ✅ Success toast: "Application for [name] has been rejected"
- ✅ Application moves from Pending to Rejected tab
- ✅ Document in `ics25creators` updated:
  - `status: 'rejected'`
  - `reviewedAt: <timestamp>`
  - `reviewedBy: <admin email>`
  - `rejectionReason: <entered reason>`

### 6. Approved Creator Checkout

**Steps**:
1. After admin approval, sign in as approved creator
2. Go to `/checkout?tier=creators`

**Expected Result**:
- ✅ Form loads with pre-filled data from creator application
- ✅ Button shows "Pay Now" (not "Submit for Review")
- ✅ Form is editable
- ✅ Clicking "Pay Now" creates Razorpay order
- ✅ After successful payment:
  - Attendee record created in `ics25attendees` with `attendeePassTier: 'creators'`
  - `hasCompletedPayment: true` in `ics25creators`
  - Redirect to `/checkout/success`

### 7. Rejected Creator Experience

**Steps**:
1. After admin rejection, sign in as rejected creator
2. Go to `/checkout?tier=creators`

**Expected Result**:
- ✅ Redirect to `/checkout/creator/rejected`
- ✅ Shows rejection reason
- ✅ Shows alternative pass options (Bronze, Silver, Gold)
- ✅ Links to other pass tiers work

### 8. Regular Attendee Flow (Unaffected)

**Steps**:
1. Go to `/checkout?tier=bronze` (or silver, gold)
2. Fill form and submit

**Expected Result**:
- ✅ Bronze: Registers immediately, no payment
- ✅ Silver/Gold: Razorpay payment flow
- ✅ Data saved in `ics25attendees` collection
- ✅ No interaction with `ics25creators` collection

## Common Issues & Solutions

### Issue: Creator data not saving in ics25creators
**Check**:
- MongoDB connection string correct?
- Database name is `ics25`?
- Collection name is `ics25creators` (not `Ics25Creator`)?

**Solution**: Check `schemas/ics25/Creator.ts` - collection name is specified in model export:
```typescript
model('Ics25Creator', Ics25CreatorSchema, 'ics25creators')
```

### Issue: Admin can't access dashboard
**Check**:
- User email is in `ADMIN_EMAILS` array?
- Environment variable `ADMIN_EMAILS` set if using that method?

**Solution**: Add email to array or set env variable:
```env
ADMIN_EMAILS=admin@insturix.com,your-email@example.com
```

### Issue: Approved creator still sees "Submit for Review"
**Check**:
- Creator document status is 'approved'?
- CheckoutForm is fetching creator data correctly?

**Solution**: Check browser console for API errors, verify `/api/ics25/creator-approval` GET returns correct status.

### Issue: Redirect loops
**Check**:
- Multiple status checks causing redirects?
- Creator has both pending and attendee record?

**Solution**: Clear test data and resubmit with fresh account.

## Database Queries for Verification

### Check Creator Application
```javascript
db.ics25creators.findOne({ email: "test@example.com" })
```

### List All Pending Applications
```javascript
db.ics25creators.find({ status: 'pending' })
```

### List All Approved Creators
```javascript
db.ics25creators.find({ status: 'approved' })
```

### Check Attendee Record
```javascript
db.ics25attendees.findOne({ email: "test@example.com" })
```

### Clear Test Data
```javascript
// Remove creator application
db.ics25creators.deleteOne({ email: "test@example.com" })

// Remove attendee record
db.ics25attendees.deleteOne({ email: "test@example.com" })
```

## Admin Email Setup

### Development (.env.local)
```env
ADMIN_EMAILS=admin@insturix.com,lakshya@insturix.com,test@example.com
```

### Production (Vercel/Environment)
Add `ADMIN_EMAILS` environment variable with comma-separated list of emails.

### Hardcoded (Quick Testing)
Edit `app/admin/dashboard/page.tsx`:
```typescript
const ADMIN_EMAILS = [
  "admin@insturix.com",
  "your-test-email@gmail.com", // Add your email here
];
```

## Quick Test Script

```bash
# 1. Start dev server
cd Front-End
npm run dev

# 2. Open browser
# - Go to http://localhost:3000/ics25
# - Sign in with test account
# - Select Creators pass
# - Fill form and submit

# 3. Check MongoDB
# - Open MongoDB Compass
# - Connect to your database
# - Navigate to ics25.ics25creators
# - Verify document exists with status: 'pending'

# 4. Test admin dashboard
# - Sign in with admin email
# - Go to http://localhost:3000/admin/dashboard
# - Verify you can see and approve/reject applications

# 5. Test approved flow
# - Approve application in admin dashboard
# - Sign in as that creator
# - Go to checkout, verify "Pay Now" shows
# - Complete payment and verify success
```

## Success Criteria

✅ Creator submissions save to `ics25creators` collection with all fields
✅ Admin dashboard accessible only to approved emails
✅ Pending applications visible and actionable in admin dashboard
✅ Approval/rejection updates status correctly
✅ Approved creators can proceed to payment
✅ Rejected creators see rejection page with reason
✅ Regular attendee flow (Bronze/Silver/Gold) unaffected
✅ No legacy `creatorApproval` field in new attendee documents
✅ Social links clickable and verifiable in admin dashboard
✅ Payment completion updates both collections correctly
