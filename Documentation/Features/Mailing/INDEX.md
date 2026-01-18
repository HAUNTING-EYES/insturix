# Email Service: Complete Documentation Index

## 📖 Documentation Overview

Your complete guide to the Insturix transactional email system with batch management and rate limiting.

---

## 🚀 Getting Started

### New to the Email Service?

**Start here:** [`QUICK_REFERENCE_CARD.md`](./QUICK_REFERENCE_CARD.md)
- Copy-paste code examples
- Common templates
- Quick troubleshooting
- **5 minute read**

### Setup & Configuration

**Read:** [`overview.md`](./overview.md)
- Architecture overview
- Environment setup
- Core components
- How it works

---

## 📧 Using the Service

### Simple Email Sending

```typescript
import { sendEmail } from '@/lib/services/email';

await sendEmail({
  to: 'user@example.com',
  subject: 'Hello',
  htmlBody: '<h1>Hi!</h1>',
});
```

### Pre-built Templates

```typescript
import { sendWelcomeEmail, sendVerificationEmail } from '@/lib/services/email';

await sendWelcomeEmail('user@example.com', 'John Doe');
await sendVerificationEmail('user@example.com', 'John', 'https://verify-link');
```

**Available Templates:**
- Welcome
- Verification
- Password Reset
- Order Confirmation
- Notification
- Security Alert

---

## 📊 Batch Email Management

### Simple Batch (10-100 emails)

```typescript
import { sendBatchEmails } from '@/lib/services/email';

const results = await sendBatchEmails(emails);
```

### Professional Batch (100-10,000 emails)

```typescript
import { sendBatchEmailsManaged } from '@/lib/services/email';

const result = await sendBatchEmailsManaged(emails, {
  batchSize: 100,
  maxConcurrent: 5,
  delayBetweenBatches: 1000,
});

console.log(`✅ ${result.summary.successful}/${result.summary.total}`);
```

**Full Guide:** [`BATCH_EMAIL_GUIDE.md`](./BATCH_EMAIL_GUIDE.md)
- Configuration options
- Real-world examples
- Performance benchmarks
- Error handling
- Best practices

---

## ⚡ Rate Limits & Quotas

### Current Limits

| Limit | Value |
|-------|-------|
| Daily Quota | 50,000 emails/day |
| Rate Limit | 14 emails/second |
| Safe Rate | ~12-13 emails/second (10% buffer) |
| Daily Reset | UTC Midnight (5:30 AM IST) |

### Quick Estimation

| Scale | Time | Config |
|-------|------|--------|
| 100 emails | ~8 sec | batchSize: 20 |
| 1,000 emails | ~90 sec | batchSize: 100, delay: 1000ms |
| 10,000 emails | ~10 min | batchSize: 200, delay: 2000ms |
| 50,000 emails | ~60 min | Conservative settings |

**Full Reference:** [`LIMITS_AND_QUOTAS.md`](./LIMITS_AND_QUOTAS.md)
- Rate limiting explained
- Quota tracking
- Emergency procedures
- Monitoring & alerts
- Scaling strategies

---

## 🧪 Testing

### Run Tests
```bash
pnpm test:email
```

### All 6 Tests Pass
✔ TransactionalMailer integrates templates with provider  
✔ TransactionalMailer sendTemplate renders specific template  
✔ TransactionalMailer handles batch send through provider  
✔ TransactionalMailer verifyConfiguration delegates to provider  
✔ renderTemplate returns HTML and text variants  
✔ listTemplates exposes expected template ids  

**Testing Guide:** [`testing.md`](./testing.md)
- Running tests
- Test structure
- Manual verification
- AWS credential setup

---

## 📚 Implementation Details

### Architecture

```
lib/services/email/
├── config.ts              # AWS SES configuration
├── mailer.ts              # TransactionalMailer class
├── types.ts               # Shared types
├── helpers.ts             # Convenient wrapper functions
├── ses-client.ts          # Legacy compatibility
├── providers/
│   ├── rate-limiter.ts    # Rate limiting (14/sec)
│   └── ses-provider.ts    # AWS SES implementation
├── templates/
│   ├── base.ts            # HTML email wrapper
│   ├── welcome.ts         # Welcome template
│   ├── verification.ts    # Verification template
│   ├── password-reset.ts  # Password reset template
│   ├── order-confirmation.ts
│   ├── notification.ts
│   ├── security-alert.ts
│   └── index.ts           # Template registry
└── __tests__/
    ├── mailer.test.ts
    └── templates.test.ts
```

**Detailed Docs:** [`IMPLEMENTATION.md`](./IMPLEMENTATION.md)

---

## 🎯 Common Scenarios

### Newsletter to 1000 Users

```typescript
const users = await User.find({ emailVerified: true }).limit(1000);

const emails = users.map(u => ({
  to: u.email,
  subject: 'Monthly Newsletter',
  htmlBody: getNewsletterHTML(),
}));

const result = await sendBatchEmailsManaged(emails, {
  batchSize: 100,        // 10 batches
  maxConcurrent: 5,
  delayBetweenBatches: 1000, // 1 sec between batches
});

// Time: ~100 seconds (1-2 minutes)
console.log(`Sent to ${result.summary.successful}/${result.summary.total}`);
```

### Verification Campaign (Urgent)

```typescript
const unverifiedUsers = await User.find({ emailVerified: false });

const result = await sendBatchEmailsManaged(emails, {
  batchSize: 50,
  maxConcurrent: 10,    // Faster for urgent
  delayBetweenBatches: 200, // Minimal delay
});
```

### Order Confirmation (Transactional)

```typescript
// Sent individually as orders arrive
async function onOrderCreated(orderId) {
  const order = await Order.findById(orderId);
  
  await sendOrderConfirmationEmail(
    order.userEmail,
    order.userName,
    order.number,
    order.items
  );
}
```

### Security Alert

```typescript
// Immediate alert on suspicious activity
await sendSecurityAlertEmail(
  user.email,
  user.name,
  'New Login Detected',
  `Login from ${location} at ${time}`
);
```

---

## 📋 Quick Checklist

### Before Production

- [ ] AWS SES account set up (region: ap-south-1)
- [ ] Credentials added to `.env.local`
- [ ] Sender domain verified in AWS SES
- [ ] `pnpm test:email` passes (6/6 tests)
- [ ] Test email sent successfully
- [ ] Database logging setup (optional but recommended)
- [ ] Rate limit understanding confirmed
- [ ] Batch strategy planned for your use case

### Deployment

- [ ] Environment variables set in all environments
- [ ] Logging database ready
- [ ] Admin alerts configured
- [ ] Daily quota monitoring active
- [ ] Backup provider considered for >10,000/day

---

## 🆘 Troubleshooting

### Missing Credentials
```
Error: 'AWS credentials not found'
Solution: Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to .env.local
```

### From Address Error
```
Error: 'From address is missing'
Solution: Add AWS_SES_FROM_EMAIL=no-reply@insturix.com to .env.local
```

### Throttling Error
```
Error: '429 Too Many Requests'
Solution: Reduce maxConcurrent to 2, increase delayBetweenBatches to 2000
```

### Emails Not Arriving
1. Check spam folder
2. Verify recipient in AWS SES console
3. Check CloudWatch logs
4. Verify sender domain is verified

**See:** [`LIMITS_AND_QUOTAS.md`](./LIMITS_AND_QUOTAS.md#emergency-procedures)

---

## 📞 API Reference

### POST `/api/email/send` - Send Single Email

```json
{
  "to": "user@example.com",
  "subject": "Subject",
  "htmlBody": "<h1>HTML</h1>",
  "textBody": "Text",
  "cc": ["cc@example.com"],
  "bcc": ["bcc@example.com"],
  "replyTo": "support@example.com",
  "tags": { "category": "newsletter" }
}
```

### POST `/api/email/send` - Send Batch

```json
{
  "batch": true,
  "emails": [
    { "to": "user1@example.com", "subject": "Hi", "htmlBody": "<p>Hi</p>" },
    { "to": "user2@example.com", "subject": "Hi", "htmlBody": "<p>Hi</p>" }
  ]
}
```

### GET `/api/email/send` - Health Check

Returns service status and configuration.

---

## 📈 Monitoring

### Track Daily Usage

```typescript
const today = new Date().toISOString().split('T')[0];
const sent = await EmailLog.countDocuments({ date: today });
const remaining = 50000 - sent;

console.log(`📊 ${sent}/50000 used (${remaining} remaining)`);
```

### Alert on Quota Issues

```typescript
if (remaining < 1000) {
  console.error('🚨 Critical: Less than 1000 emails remaining!');
  // Send admin notification
}
```

---

## 🔗 Related Files

### Core Service
- `lib/services/email/` - Main service directory
- `app/api/email/send/route.ts` - API endpoint

### Database Schema (Optional)
- `schemas/EmailLogSchema.ts` - Recommended for logging
- `schemas/EmailQueueSchema.ts` - For scheduled sends

### Config
- `.env.local` - Local development
- AWS SES Console - Cloud configuration

---

## 📚 Full Documentation Files

| File | Purpose | Read Time |
|------|---------|-----------|
| [`QUICK_REFERENCE_CARD.md`](./QUICK_REFERENCE_CARD.md) | Quick lookup for code snippets | 5 min |
| [`overview.md`](./overview.md) | Architecture & components | 10 min |
| [`BATCH_EMAIL_GUIDE.md`](./BATCH_EMAIL_GUIDE.md) | Complete batch management | 15 min |
| [`LIMITS_AND_QUOTAS.md`](./LIMITS_AND_QUOTAS.md) | Rate limits & quotas | 10 min |
| [`testing.md`](./testing.md) | Testing & verification | 8 min |
| [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) | Setup & integration | 12 min |
| [`README.md`](./README.md) | Full documentation | 20 min |
| [`CHANGELOG.md`](./CHANGELOG.md) | Version history | 5 min |

---

## 🎓 Learning Path

### Beginner (New to the system)
1. Read: [`QUICK_REFERENCE_CARD.md`](./QUICK_REFERENCE_CARD.md)
2. Try: Send a single email
3. Run: `pnpm test:email`

### Intermediate (Ready to batch send)
1. Read: [`BATCH_EMAIL_GUIDE.md`](./BATCH_EMAIL_GUIDE.md)
2. Read: [`LIMITS_AND_QUOTAS.md`](./LIMITS_AND_QUOTAS.md)
3. Build: Batch send for your use case

### Advanced (Production-ready)
1. Read: [`overview.md`](./overview.md)
2. Read: [`IMPLEMENTATION.md`](./IMPLEMENTATION.md)
3. Implement: Custom provider or templates
4. Monitor: Set up alerts and logging

---

## ✨ Key Features

✅ **Rate Limited**: Automatically stays under 14/sec limit  
✅ **Batch Ready**: Send 10,000+ emails efficiently  
✅ **Templated**: 6 pre-built templates + custom support  
✅ **Resilient**: Automatic retries with exponential backoff  
✅ **Typed**: Full TypeScript support  
✅ **Tested**: 6 automated tests, all passing  
✅ **Documented**: This comprehensive guide  
✅ **Monitored**: Logging & tracking built-in  

---

## 🚀 Next Steps

1. **Test It**: `pnpm test:email` ✅ (6/6 pass)
2. **Read It**: Start with [`QUICK_REFERENCE_CARD.md`](./QUICK_REFERENCE_CARD.md)
3. **Use It**: Send your first email
4. **Scale It**: Implement batching for multiple users
5. **Monitor It**: Set up logging and alerts

---

**Documentation Version**: 2.0  
**Last Updated**: November 6, 2025  
**Status**: ✅ Complete & Production-Ready

For questions or issues, refer to the troubleshooting section or the relevant documentation file.
