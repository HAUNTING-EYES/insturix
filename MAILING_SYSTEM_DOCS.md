# Promotional Mailing System - Complete Implementation

## Overview
This document describes the complete promotional mailing system for sending ICS'25 (Insturix Creator's Summit 2025) promotional emails to registered users.

## Features
1. **Admin Dashboard** - Send promotional emails to all users with a single click
2. **Cooldown Mechanism** - 3-day cooldown period between bulk email sends to prevent spam
3. **New User Welcome Emails** - Automatic promotional emails to new signups (until Nov 22, 2025)
4. **Batch Email Processing** - Efficient batch sending respecting AWS SES rate limits
5. **Email Templates** - Professional HTML email templates for promotional and ticket confirmations

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

**GET /api/admin/mailing/promotional**
- Check cooldown status
- Returns: `canSend`, `lastSent`, `nextAvailable`, `totalUsers`

**POST /api/admin/mailing/promotional**
- Send promotional emails to all registered users
- Enforces cooldown period (3 days)
- Sends emails in batches of 50 (respects AWS SES rate limits)
- Records send statistics

**POST /api/admin/mailing/test**
- Send test emails to admin for preview/testing
- Supports: promotional, ticket-confirmation
- Subject prefixed with [TEST]
- No cooldown enforcement

### 4. Admin Dashboard UI
**Location:** `app/admin/mailing/page.tsx`

Features:
- **Test Email Section:**
  - Select email type (promotional or ticket confirmation)
  - Enter recipient email (auto-filled with admin's email)
  - Send test emails with [TEST] prefix
  - Preview email templates before bulk send
- Real-time cooldown status display
- Total user count
- Last sent date/time
- Next available send date
- Send button (disabled during cooldown)
- Success/failure statistics after send
- Automatic refresh after send

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

### For Admins - Bulk Email Send

1. Navigate to `/admin/mailing`
2. Check the cooldown status
3. If "Ready to Send" is shown, click "Send Promotional Emails to All Users"
4. Confirm the action
5. Wait for completion (status will show in toast notification)
6. Button will be disabled for 3 days

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
- Confirmation banner
- Event details
- QR code (if applicable)
- Event date/time/location
- CTA: "View Ticket" or "Visit Website"

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
- `schemas/EmailCooldown.ts`
- `app/api/admin/mailing/promotional/route.ts`
- `app/admin/mailing/page.tsx`
- `lib/services/email/templates/promotional.ts` (already existed, verified)
- `lib/services/email/templates/ticket-confirmation.ts` (already existed, verified)

### Modified Files
- `app/api/webhooks/clerk/route.ts` - Added promotional email on signup
- `lib/services/email/helpers.ts` - Added helper functions
- `lib/services/email/index.ts` - Exported new helpers

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

**Last Updated:** November 7, 2025
**Version:** 1.0.0
**Status:** ✅ Production Ready
