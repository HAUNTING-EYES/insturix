# Email Marketing System - Complete Implementation

## Overview
This document describes the complete email marketing system for sending promotional and transactional emails. The system supports:
- ICS'25 (Insturix Creator's Summit 2025) promotional emails
- Ticket confirmation emails
- Efficient batch processing with cooldown tracking

## Features
1. **Admin Dashboard** - Send promotional or ticket confirmation emails to all users with a single click
2. **Cooldown Mechanism** - Configurable cooldown periods between bulk email sends to prevent spam (3 days for promotional, 1 day for ticket confirmation)
3. **New User Welcome Emails** - Automatic promotional emails to new signups (until Nov 22, 2025)
4. **Batch Email Processing** - Efficient batch sending respecting AWS SES rate limits
5. **Email Templates** - Professional HTML email templates with modern design and S3-hosted images
6. **Dynamic Email Content** - Support for event details and custom ticket information

## Architecture

### 1. Email Templates
**Location:** `lib/services/email/templates/`
- `promotional.ts` - ICS'25 promotional email template
- `ticket-confirmation.ts` - Ticket confirmation email template

Both templates use the HTML designs from `new_templates/` directory.

### 2. Email Cooldown Tracking
**Schema:** `schemas/EmailCooldown.ts`

Tracks when bulk promotional emails were sent to enforce cooldown periods:
```typescript
{
  emailType: 'promotional' | 'newsletter' | 'announcement',
  lastSentAt: Date,
  cooldownPeriodDays: 3,
  sentBy: string, // Admin user ID
  recipientCount: number,
  status: 'success' | 'failed' | 'partial',
  metadata: {
    successCount: number,
    failedCount: number,
    errorMessage: string
  }
}
```

**Methods:**
- `canSendEmail(emailType, cooldownDays)` - Check if cooldown has passed
- `recordEmailSent(...)` - Record a new email send

### 3. Admin API Routes
**Location:** `app/api/admin/mailing/`

**Promotional Emails:**
- **GET /api/admin/mailing/promotional**
  - Check cooldown status
  - Returns: `canSend`, `lastSent`, `nextAvailable`, `totalUsers`, `cooldownDays: 3`
- **POST /api/admin/mailing/promotional**
  - Send promotional emails to all registered users
  - Enforces 3-day cooldown period
  - Sends emails in batches of 50 (respects AWS SES rate limits)
  - Records send statistics

**Ticket Confirmation Emails:**
- **GET /api/admin/mailing/ticket-confirmation**
  - Check cooldown status
  - Returns: `canSend`, `lastSent`, `nextAvailable`, `totalUsers`, `cooldownDays: 1`
- **POST /api/admin/mailing/ticket-confirmation**
  - Send ticket confirmation emails to all registered users
  - Requires `eventDetails` in request body
  - Enforces 1-day cooldown period
  - Generates unique ticket IDs for each user (format: TICKET-{userId})
  - Sends emails in batches of 50 (respects AWS SES rate limits)
  - Records send statistics
  - Request body:
    ```json
    {
      "eventDetails": "Insturix Creator's Summit 2025",
      "cooldownDays": 1
    }
    ```

**Test Emails:**
- **POST /api/admin/mailing/test**
  - Send test emails to admin for preview/testing
  - Supports: promotional, ticket-confirmation
  - Subject prefixed with [TEST]
  - No cooldown enforcement
  - Request body:
    ```json
    {
      "emailType": "promotional|ticket-confirmation",
      "recipientEmail": "admin@insturix.com",
      "testData": {
        "name": "Test User",
        "ticketId": "TEST-12345",
        "eventDetails": "Event Name"
      }
    }
    ```

### 4. Admin Dashboard UI
**Location:** `app/admin/mailing/page.tsx`

Features:
- **Email Type Selection:**
  - Dropdown to choose between "Promotional Email (ICS'25 Invitation)" and "Ticket Confirmation Email"
  - Dynamically updates UI based on selection
  
- **Test Email Section:**
  - Select email type (promotional or ticket confirmation)
  - Enter recipient email (auto-filled with admin's email)
  - Event details input (only shown for ticket confirmation)
  - Send test emails with [TEST] prefix
  - Preview email templates before bulk send
  
- **Cooldown Status Display:**
  - Real-time cooldown status with color coding
  - Total user count
  - Last sent date/time
  - Next available send date (with countdown timer)
  - Cooldown period (1 or 3 days depending on email type)
  
- **Bulk Campaign Section:**
  - Email type-specific CTA
  - Event details input (for ticket confirmation emails)
  - Important notice about email send
  - Send button (disabled during cooldown or when required fields empty)
  - Automatic refresh after send
  
- **Confirmation Dialogs:**
  - Initial confirmation with recipient count
  - Final confirmation with risk acknowledgment
  - Detailed statistics after completion

**URL:** `https://insturix.com/admin/mailing`

### 5. New User Signup Integration
**Location:** `app/api/webhooks/clerk/route.ts`

When a new user signs up via Clerk:
1. User is created in database
2. System checks if current date ≤ November 22, 2025
3. If yes, sends promotional email automatically
4. If no, logs that cutoff date passed

**Time-bound Feature:**
- Promotional emails to new users ONLY until **November 22, 2025, 11:59 PM UTC**
- After this date, new users will NOT receive promotional emails
- This prevents sending outdated event invitations

## Usage

### For Admins - Test Email Preview

1. Navigate to `/admin/mailing`
2. In the "Test Email Templates" section:
   - Select email type from dropdown (Promotional or Ticket Confirmation)
   - Enter your email address (pre-filled with admin email)
   - Click "Send Test Email"
3. Check your inbox for the test email (subject prefixed with [TEST])
4. Review the email content and design

### For Admins - Bulk Email Send (Promotional)

1. Navigate to `/admin/mailing`
2. Ensure "Promotional Email (ICS'25 Invitation)" is selected
3. Check the cooldown status
4. If "Ready to Send" is shown, click "Send Promotional Emails to All Users"
5. Confirm the action (twice - initial and final)
6. Wait for completion (status will show in toast notification)
7. Button will be disabled for 3 days

### For Admins - Bulk Email Send (Ticket Confirmation)

1. Navigate to `/admin/mailing`
2. Select "Ticket Confirmation Email" from the dropdown
3. Enter the event details (e.g., "Insturix Creator's Summit 2025")
4. Event details field appears in both test and bulk sections
5. Check the cooldown status
6. If "Ready to Send" is shown, click "Send Ticket Confirmation Emails to All Users"
7. Confirm the action (twice - initial and final)
8. Wait for completion (status will show in toast notification)
9. Each user receives a unique ticket ID (format: TICKET-{userId})
10. Button will be disabled for 1 day

### For Developers - Manual Email Send

```typescript
import { sendPromotionalEmail } from '@/lib/services/email';

// Send to single user
await sendPromotionalEmail('user@example.com', 'John Doe');

// Send to multiple users
await sendPromotionalEmail(['user1@example.com', 'user2@example.com'], 'User');
```

### For Developers - Ticket Confirmation

```typescript
import { sendTicketConfirmationEmail } from '@/lib/services/email';

await sendTicketConfirmationEmail(
  'user@example.com',
  'John Doe',
  'TICKET-12345',
  'ICS\'25 - November 22, 2025'
);
```

## Email Service Configuration

The system uses AWS SES (Simple Email Service) for sending emails.

**Environment Variables Required:**
```env
AWS_SES_FROM_EMAIL=no-reply@insturix.com
AWS_SES_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

**Rate Limits:**
- Max 14 emails per second
- Emails are sent in batches of 50 with 1-second delays
- Daily quota: 50,000 emails

## Security

1. **Admin Authentication:**
   - Admin routes use `verifyAdminForApi()` from `lib/auth/adminAuth.ts`
   - Only users with emails in `ADMIN_EMAILS` env variable can access

2. **Cooldown Enforcement:**
   - 3-day minimum between bulk sends
   - Enforced at API level (cannot be bypassed from UI)
   - Records timestamp and admin who triggered send

3. **Webhook Security:**
   - Clerk webhooks verified using Svix signatures
   - Requires `CLERK_WEBHOOK_SECRET` environment variable

## Database Collections

### EmailCooldown Collection
```javascript
{
  _id: ObjectId,
  emailType: "promotional",
  lastSentAt: ISODate("2025-11-07T10:30:00Z"),
  cooldownPeriodDays: 3,
  sentBy: "clerk_user_12345",
  recipientCount: 1523,
  status: "success",
  metadata: {
    successCount: 1520,
    failedCount: 3,
    errorMessage: "3 emails failed to send"
  },
  createdAt: ISODate("2025-11-07T10:30:00Z"),
  updatedAt: ISODate("2025-11-07T10:35:00Z")
}
```

### User Collection
Uses existing `User` schema from `schemas/user.ts`:
- `email` - User's email address
- `username` - User's display name
- `clerkUserId` - Clerk authentication ID
- `signUpDate` - When user registered

## Email Templates

### Promotional Email
**Subject:** "You're Invited to ICS'25 - India's Largest Creator-Tech Summit! 🚀"

**Content:**
- Event banner image
- Insturix logo
- Event description (ICS'25)
- Why attend (creator benefits)
- CTA button: "REGISTER FOR FREE NOW"
- Social media links
- Footer with unsubscribe link

### Ticket Confirmation Email
**Subject:** "Your Ticket is Confirmed! - Insturix Creator's Summit 2025 🎉"

**Content:**
- Professional confirmation banner (main hero image)
- Insturix logo
- Ticket status and event details
- Unique ticket ID per user (TICKET-{userId})
- Event information section
- CTA button: "Insturix Website"
- Footer with unsubscribe link

**Design:**
- S3-hosted images for consistent display:
  - Main banner: `99c379308c1a37e7e35b52c6f8a46ca3.png` (585x827px)
  - Logo: `309a20274f057a8c9056e415a5ea8196.png` (109x110px)
  - Event info: `7e317333aea8b5e6740a4f09c3fb646a.png` (216x53px)
- Responsive design (mobile-friendly)
- Professional color scheme with black CTA button

## Testing

### Test Email Sending
```bash
# Via API (requires admin auth)
curl -X POST http://localhost:3000/api/admin/mailing/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "emailType": "promotional",
    "recipientEmail": "admin@insturix.com",
    "testData": {
      "name": "Admin User",
      "ticketId": "TEST-12345"
    }
  }'
```

### Test Email Sending
```bash
# Via API (requires admin auth)
curl -X POST http://localhost:3000/api/admin/mailing/promotional \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Check cooldown status
curl http://localhost:3000/api/admin/mailing/promotional \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Test New User Signup Email
1. Create a new user via Clerk
2. Check server logs for email send confirmation
3. Verify email received in inbox

### Manual Testing Checklist
- [ ] Admin can access `/admin/mailing` page
- [ ] Test email section displays correctly
- [ ] Can select email type from dropdown
- [ ] Email input pre-fills with admin email
- [ ] Test email sent successfully
- [ ] Test email received with [TEST] prefix
- [ ] Email content matches selected type
- [ ] Cooldown status displays correctly
- [ ] Send button disabled when cooldown active
- [ ] Send button enabled when cooldown expired
- [ ] Emails sent successfully to all users
- [ ] Success statistics displayed after send
- [ ] Cooldown recorded in database
- [ ] New user receives promotional email (before Nov 22, 2025)
- [ ] New user does NOT receive email (after Nov 22, 2025)

## Monitoring

### Email Send Logs
Check server logs for:
- `📧 Starting promotional email send to X users...`
- `✅ Sent to user@example.com`
- `❌ Failed to send to user@example.com`
- `📧 Promotional email send complete: X/Y successful`

### Database Queries

```javascript
// Check last promotional send
db.emailcooldowns.find({ emailType: 'promotional' }).sort({ lastSentAt: -1 }).limit(1)

// Check all promotional sends
db.emailcooldowns.find({ emailType: 'promotional' }).sort({ lastSentAt: -1 })

// Check failed sends
db.emailcooldowns.find({ status: { $in: ['failed', 'partial'] } })
```

## Troubleshooting

### Issue: Button stays disabled
**Solution:** Check `EmailCooldown` collection. Delete latest record to reset cooldown.

### Issue: Emails not sending
**Possible causes:**
1. AWS SES credentials missing/invalid
2. Email rate limit exceeded
3. AWS SES in sandbox mode (verify recipient emails)
4. Invalid email addresses in User collection

**Check:**
- Environment variables (`AWS_*`)
- AWS SES console for bounces/complaints
- Server logs for detailed error messages

### Issue: New users not receiving emails
**Possible causes:**
1. Current date > November 22, 2025
2. Clerk webhook not configured
3. Email service error

**Check:**
- Current system date
- Clerk webhook logs
- Server logs for email send attempts

## Maintenance

### Updating Email Template
1. Edit `lib/services/email/templates/promotional.ts`
2. Update HTML/text content
3. Test locally before deploying
4. Deploy to production

### Changing Cooldown Period
1. Edit `schemas/EmailCooldown.ts`
2. Change `default: 3` to desired days
3. Update UI text in `app/admin/mailing/page.tsx`
4. Redeploy

### Extending Promotional Email Date
1. Edit `app/api/webhooks/clerk/route.ts`
2. Change `const cutoffDate = new Date('2025-11-22T23:59:59Z');`
3. Update to new date
4. Redeploy

## Files Modified/Created

### Created Files
- `schemas/EmailCooldown.ts` - Email cooldown tracking schema
- `app/api/admin/mailing/promotional/route.ts` - Promotional email API endpoint
- `app/api/admin/mailing/ticket-confirmation/route.ts` - Ticket confirmation API endpoint (NEW)
- `app/admin/mailing/page.tsx` - Admin dashboard UI
- `lib/services/email/templates/promotional.ts` - Promotional email template
- `lib/services/email/templates/ticket-confirmation.ts` - Ticket confirmation template (NEW)

### Modified Files
- `app/api/webhooks/clerk/route.ts` - Added promotional email on signup
- `lib/services/email/helpers.ts` - Added helper functions for both email types
- `lib/services/email/index.ts` - Exported new helpers
- `app/admin/mailing/page.tsx` - Enhanced with ticket confirmation support (UPDATED)
- `lib/services/email/templates/ticket-confirmation.ts` - Updated with new S3 image URLs (UPDATED)

## Future Enhancements

1. **Email Scheduling** - Schedule sends for specific date/time
2. **A/B Testing** - Test different email templates
3. **Segmentation** - Send to specific user groups
4. **Analytics** - Track open rates, click rates
5. **Email Builder** - Visual editor for creating emails
6. **Preview** - Preview emails before sending
7. **Test Mode** - Send test emails to admin only
8. **Retry Failed** - Automatic retry for failed sends

## Support

For issues or questions:
1. Check server logs
2. Check AWS SES console
3. Review this documentation
4. Contact dev team

---

## Summary of Changes (Latest Update)

### New Ticket Confirmation Email System
✅ **Updated ticket-confirmation.ts template**
- Replaced with new professional design using S3-hosted images
- Uses same design as provided in `email.html`
- Images hosted at: `https://insturix-email-assets.s3.ap-south-1.amazonaws.com/tickets_confirmed_images/`
- Dynamic event details support
- Unique ticket ID generation per user

✅ **Created /api/admin/mailing/ticket-confirmation endpoint**
- GET: Check cooldown status (1-day cooldown)
- POST: Send ticket confirmation emails to all users
- Requires eventDetails in request body
- Generates unique ticket IDs (TICKET-{userId})
- Batch processing with rate limiting

✅ **Enhanced admin dashboard**
- Email type selector (Promotional or Ticket Confirmation)
- Dynamic UI based on email type selection
- Event details input field (ticket confirmation only)
- Separate cooldown tracking per email type
- Updated confirmation dialogs
- Improved UX with dynamic button labels

### Reusable Pattern
Both promotional and ticket confirmation systems follow the same pattern:
1. Email template with S3-hosted images
2. Admin API endpoint with cooldown tracking
3. Test email functionality
4. Batch processing with rate limiting
5. Admin dashboard controls

---

**Last Updated:** November 8, 2025
**Version:** 2.0.0 - Ticket Confirmation System
**Status:** ✅ Production Ready
