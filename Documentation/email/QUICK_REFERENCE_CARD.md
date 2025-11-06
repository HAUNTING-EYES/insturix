# Email Service: Quick Reference Card

## 🚀 Quick Start

### Send Single Email
```typescript
import { sendEmail } from '@/lib/services/email';

await sendEmail({
  to: 'user@example.com',
  subject: 'Hello',
  htmlBody: '<h1>Hi!</h1>',
  textBody: 'Hi!',
});
```

### Send Using Templates
```typescript
import { 
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendNotificationEmail,
  sendSecurityAlertEmail,
} from '@/lib/services/email';

await sendWelcomeEmail('user@example.com', 'John Doe');
await sendVerificationEmail('user@example.com', 'John', 'https://verify-link');
await sendPasswordResetEmail('user@example.com', 'John', 'https://reset-link');
```

### Send Batch (Simple)
```typescript
import { sendBatchEmails } from '@/lib/services/email';

const emails = [
  { to: 'user1@example.com', subject: 'Hi', htmlBody: '<p>Hello</p>' },
  { to: 'user2@example.com', subject: 'Hi', htmlBody: '<p>Hello</p>' },
];

const results = await sendBatchEmails(emails);
```

### Send Batch (Professional)
```typescript
import { sendBatchEmailsManaged } from '@/lib/services/email';

const result = await sendBatchEmailsManaged(emails, {
  batchSize: 100,
  maxConcurrent: 5,
  delayBetweenBatches: 1000,
});

console.log(`✅ ${result.summary.successful}/${result.summary.total}`);
```

## 📋 Available Templates

| Template | Function | Parameters |
|----------|----------|------------|
| Welcome | `sendWelcomeEmail()` | `email, name, [dashboardUrl]` |
| Verification | `sendVerificationEmail()` | `email, name, verificationLink, [hours]` |
| Password Reset | `sendPasswordResetEmail()` | `email, name, resetLink, [minutes]` |
| Order Confirmation | `sendOrderConfirmationEmail()` | `email, name, orderNumber, items, [url]` |
| Notification | `sendNotificationEmail()` | `email, name, title, message, [url], [text]` |
| Security Alert | `sendSecurityAlertEmail()` | `email, name, alertType, details, [url]` |

## ⚙️ Configuration

### Environment Variables
```bash
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_SES_REGION=ap-south-1
AWS_SES_FROM_EMAIL=no-reply@insturix.com
```

### Batch Options
```typescript
interface BatchOptions {
  batchSize?: number;              // 10 (default)
  maxConcurrent?: number;          // 3 (default)
  delayBetweenBatches?: number;    // 0ms (default)
  rateLimit?: number;              // 14/sec (default)
}
```

## 📊 Limits & Quotas

| Limit | Value |
|-------|-------|
| Daily Quota | 50,000 emails/day |
| Rate Limit | 14 emails/second |
| Safe Rate | ~12-13 emails/second (10% buffer) |
| Daily Reset | UTC midnight (5:30 AM IST) |

### Quick Math
- **100 emails**: ~8 seconds
- **1,000 emails**: ~1.5 minutes (with batching)
- **10,000 emails**: ~15 minutes (with delays)
- **50,000 emails**: ~60 minutes (max daily, conservative)

## 🔍 Error Handling

### Check Configuration
```typescript
import { verifySESConfiguration } from '@/lib/services/email';

const isValid = await verifySESConfiguration();
if (!isValid) console.error('AWS SES not configured');
```

### Handle Individual Failure
```typescript
const result = await sendEmail({ to: 'user@example.com', ... });
if (!result.success) {
  console.error('Failed:', result.error);
  // Retry or log for manual review
}
```

### Handle Batch Failures
```typescript
const result = await sendBatchEmailsManaged(emails);

const failures = result.results.filter(r => !r.success);
console.log(`Failed: ${failures.length}/${result.summary.total}`);
```

## 🧪 Testing

### Run Tests
```bash
pnpm test:email
```

### Test Email Send
```bash
curl -X POST http://localhost:3000/api/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "subject": "Test",
    "htmlBody": "<h1>Test</h1>"
  }'
```

### Health Check
```bash
curl http://localhost:3000/api/email/send
```

## 📬 API Endpoint

### Send Single Email
```bash
POST /api/email/send
{
  "to": "user@example.com",
  "subject": "Subject",
  "htmlBody": "<h1>HTML</h1>",
  "textBody": "Text",
  "cc": ["cc@example.com"],
  "bcc": ["bcc@example.com"],
  "replyTo": "reply@example.com",
  "tags": { "category": "newsletter" }
}
```

### Send Batch
```bash
POST /api/email/send
{
  "batch": true,
  "emails": [
    { "to": "user1@example.com", "subject": "Hi", "htmlBody": "<p>Hi</p>" },
    { "to": "user2@example.com", "subject": "Hi", "htmlBody": "<p>Hi</p>" }
  ]
}
```

## 📈 Batch Recommendations

### 10-100 emails
```typescript
sendBatchEmails(emails, { batchSize: 20 });
```

### 100-500 emails
```typescript
sendBatchEmailsManaged(emails, {
  batchSize: 50,
  maxConcurrent: 5,
});
```

### 500-5,000 emails
```typescript
sendBatchEmailsManaged(emails, {
  batchSize: 100,
  maxConcurrent: 5,
  delayBetweenBatches: 1000,
});
```

### 5,000+ emails
```typescript
sendBatchEmailsManaged(emails, {
  batchSize: 200,
  maxConcurrent: 3,
  delayBetweenBatches: 2000,
});
```

## 🛡️ Best Practices

✅ **DO:**
- Batch emails (100+ in one request)
- Use `maxConcurrent: 3-5` for stability
- Log all sends to database
- Check quota before sending
- Implement retry logic
- Spread large sends throughout day

❌ **DON'T:**
- Send 10,000+ without batching
- Use `maxConcurrent > 10`
- Ignore failed emails
- Send without logging
- Hit 50,000 limit and stop sending

## 📚 Documentation

- **Overview**: `/Documentation/email/overview.md`
- **Batch Guide**: `/Documentation/email/BATCH_EMAIL_GUIDE.md`
- **Limits & Quotas**: `/Documentation/email/LIMITS_AND_QUOTAS.md`
- **Testing**: `/Documentation/email/testing.md`
- **Implementation**: `/Documentation/email/IMPLEMENTATION.md`

## 🆘 Troubleshooting

### "No credentials found"
```
✓ Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to .env.local
✓ Restart dev server
```

### "From address missing"
```
✓ Add AWS_SES_FROM_EMAIL=no-reply@insturix.com to .env.local
✓ Verify domain in AWS SES console
```

### "Throttling error"
```
✓ Reduce maxConcurrent to 2-3
✓ Increase delayBetweenBatches to 2000+
✓ Wait before retrying
```

### Emails not arriving
```
✓ Check spam folder
✓ Verify recipient email in SES console
✓ Check AWS SES sending limits
✓ Review CloudWatch logs
```

## 📞 Common Tasks

### Send Newsletter to All Users
```typescript
const users = await User.find({ emailVerified: true });
const emails = users.map(u => ({
  to: u.email,
  subject: 'Newsletter',
  htmlBody: template,
}));

await sendBatchEmailsManaged(emails, {
  batchSize: 100,
  maxConcurrent: 5,
  delayBetweenBatches: 1000,
});
```

### Track Failed Emails
```typescript
const results = await sendBatchEmails(emails);
const failed = results
  .map((r, i) => r.success ? null : { index: i, error: r.error })
  .filter(Boolean);

await FailedEmails.insertMany(failed);
```

### Retry Failed Emails Tomorrow
```typescript
const failed = await FailedEmails.find({});
const emails = failed.map(f => f.originalEmail);

// Schedule for tomorrow
await EmailQueue.insertMany(emails.map(e => ({
  ...e,
  scheduledFor: tomorrow(),
})));
```

---

**Keep this reference handy! 📌**  
Last Updated: November 6, 2025
