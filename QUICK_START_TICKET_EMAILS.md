# Quick Start: Ticket Confirmation Emails

## 30-Second Overview

The new ticket confirmation email system allows admins to send professional ticket confirmation emails to all registered users with a single click, just like the promotional email system.

**Key differences from promotional emails:**
- ✅ Users get unique ticket IDs (TICKET-12345)
- ✅ Event details are customizable
- ✅ 1-day cooldown (vs 3-day for promotional)
- ✅ Same modern S3-hosted image design

---

## Admin Quick Start

### Step 1: Open Admin Dashboard
```
Go to: https://insturix.com/admin/mailing
```

### Step 2: Select Ticket Confirmation Email
```
1. Locate the "Email Template" dropdown
2. Select "Ticket Confirmation Email"
3. Notice the UI updates
```

### Step 3: Enter Event Details
```
Enter your event details, e.g.:
- "Insturix Creator's Summit 2025"
- "ICS'25 - November 22, 2025"
- "Creator Summit 2025 - Online Event"
```

### Step 4: Test Email (Optional)
```
1. Click the "Test Email Templates" section
2. Your email should be pre-filled
3. Click "Send Test Email"
4. Check your inbox for the [TEST] email
5. Verify it looks good
```

### Step 5: Send to All Users
```
1. Review the "Bulk Email Campaign" section
2. Ensure event details are correct
3. Click "Send Ticket Confirmation Emails to All Users"
4. Confirm in the dialog boxes
5. Wait for completion
6. See success statistics
7. Button will be disabled for 1 day
```

---

## API Usage (Developers)

### Send Test Ticket Email
```typescript
import { sendTicketConfirmationEmail } from '@/lib/services/email';

await sendTicketConfirmationEmail(
  'user@example.com',
  'John Doe',
  'TICKET-ABC12345',
  'Insturix Creator\'s Summit 2025'
);
```

### Send Bulk Ticket Confirmation Emails
```bash
curl -X POST http://localhost:3000/api/admin/mailing/ticket-confirmation \
  -H "Content-Type: application/json" \
  -d '{
    "eventDetails": "Insturix Creator'\''s Summit 2025"
  }'
```

### Check Cooldown Status
```bash
curl http://localhost:3000/api/admin/mailing/ticket-confirmation
```

---

## Email Details

### Subject Line
```
Your Ticket is Confirmed! - Insturix Creator's Summit 2025 🎉
```

### What's in the Email
- Professional banner image (585x827px)
- Insturix logo
- Event details (customizable)
- Unique ticket ID (auto-generated)
- "Insturix Website" button
- Unsubscribe link

### Images Used
All images are hosted on AWS S3:
- Main banner: `99c379308c1a37e7e35b52c6f8a46ca3.png`
- Logo: `309a20274f057a8c9056e415a5ea8196.png`
- Event info: `7e317333aea8b5e6740a4f09c3fb646a.png`

---

## Ticket ID Generation

Each user automatically gets a unique ticket ID:

```
Format: TICKET-{8-digit-hash}
Example: TICKET-99439011
Generated from: Last 8 chars of user's ID
```

---

## Cooldown Info

- **Cooldown Period:** 1 day (24 hours)
- **Tracks:** When last ticket email was sent
- **Independent:** Separate from promotional email cooldown
- **Enforced:** At API level (cannot bypass)

---

## Troubleshooting

### Button is disabled
Check the "Cooldown Active" alert for the exact time remaining.

### Event details field missing
Make sure "Ticket Confirmation Email" is selected, not "Promotional Email".

### Emails not received
1. Check server logs for errors
2. Verify AWS SES credentials
3. Check spam/junk folder
4. Verify user email addresses in database

### Need to send again immediately
Wait for the 1-day cooldown to expire. The dashboard shows a countdown timer.

---

## Database Structure

When you send ticket confirmation emails, a record is created:

```javascript
{
  emailType: "ticket-confirmation",
  lastSentAt: ISODate("2025-11-08T10:30:00Z"),
  cooldownPeriodDays: 1,
  sentBy: "clerk_user_12345",
  recipientCount: 1500,
  status: "success",
  metadata: {
    successCount: 1498,
    failedCount: 2,
    errorMessage: "2 emails failed to send"
  }
}
```

---

## Comparison: Promotional vs Ticket Confirmation

| Feature | Promotional | Ticket Confirmation |
|---------|------------|-------------------|
| **Email Type** | ICS'25 Invitation | Event Confirmation |
| **Cooldown** | 3 days | 1 day |
| **Event Details Input** | ❌ No | ✅ Yes |
| **Ticket IDs** | ❌ No | ✅ Yes |
| **Customization** | ❌ Limited | ✅ High |
| **Subject** | "You're Invited to ICS'25..." | "Your Ticket is Confirmed!..." |
| **Button Text** | "REGISTER FOR FREE NOW" | "Insturix Website" |
| **Use Case** | Event promotion | Event confirmation |

---

## Tips & Best Practices

✅ **Test first:** Always send a test email before bulk sending
✅ **Check details:** Review event details are correct before sending
✅ **Plan ahead:** Schedule around the 1-day cooldown
✅ **Monitor:** Check server logs for send status
✅ **Backup:** Keep records of event details used
✅ **Time it:** Send during user activity hours for better engagement

---

## FAQ

**Q: Can I customize the ticket ID format?**
A: Currently auto-generated as TICKET-{userId}. Contact dev team for custom format.

**Q: Can I send to specific users only?**
A: Currently sends to all users. Filtering feature planned for future.

**Q: What if a user's email bounces?**
A: It's logged in the failed emails list and in server logs.

**Q: Can I schedule sends?**
A: Currently manual only. Scheduling feature planned for future.

**Q: What's the max daily send limit?**
A: AWS SES quota is 50,000 emails/day (configurable).

---

## Support

For issues:
1. Check the MAILING_SYSTEM_DOCS.md for detailed documentation
2. Review server logs with grep: `grep "ticket-confirmation" logs`
3. Contact the development team

---

**Version:** 1.0
**Last Updated:** November 8, 2025
**Status:** ✅ Production Ready

