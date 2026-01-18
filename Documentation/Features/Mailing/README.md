# Transactional Mailer

Modular emailing system for Insturix. The system builds on AWS Simple Email Service (SES) and provides a reusable `TransactionalMailer` component plus a typed template registry.

## Architecture

```
lib/services/email/
├── config.ts                # Environment driven configuration loader
├── mailer.ts                # TransactionalMailer abstraction
├── providers/
│   ├── rate-limiter.ts      # Throttling helper used by SES provider
│   └── ses-provider.ts      # AWS SES implementation of MailProvider
├── templates/
│   ├── base.ts              # Shared HTML wrapper
│   ├── *.ts                 # Template renderers
│   └── index.ts             # Template registry helpers
├── helpers.ts               # Thin convenience wrappers for app code
├── ses-client.ts            # Backwards-compatible façade for legacy imports
├── types.ts                 # Shared types across providers/templates
├── __tests__/               # Node test coverage for core behaviours
└── README.md                # You are here
```

## Configuration

Set the following environment variables in `.env.local` (and deployment targets):

```bash
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_SES_REGION=ap-south-1
AWS_SES_FROM_EMAIL=no-reply@insturix.com
```

If `AWS_SES_FROM_EMAIL` is missing the mailer throws during configuration to avoid silent misconfigurations.

## Usage

### Import the mailer

```typescript
import {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendNotificationEmail,
  sendSecurityAlertEmail,
} from '@/lib/services/email';

await sendWelcomeEmail('user@example.com', 'Test User');
```

### Using templates directly

```typescript
import { sendTemplateEmail } from '@/lib/services/email';

await sendTemplateEmail('notification', {
  to: 'ops@example.com',
  payload: {
    name: 'Ops Team',
    title: 'Deployment complete',
    message: 'Version 1.2.3 is live.',
  },
});
```

### Creating a custom mailer instance

```typescript
import { createMailer, TransactionalMailer } from '@/lib/services/email';

const mailer: TransactionalMailer = createMailer();
await mailer.send({
  to: 'user@example.com',
  subject: 'Custom email',
  htmlBody: '<p>Hello</p>',
});
```

## Templates

Templates live in `lib/services/email/templates/` and expose typed payloads via `templates/index.ts`. Add a new file, register it in `templates/index.ts`, and the template becomes available through `sendTemplateEmail`.

Current template identifiers:

- `welcome`
- `verification`
- `password-reset`
- `order-confirmation`
- `notification`
- `security-alert`

Each renderer returns HTML, text, and a subject line so all emails ship with a plain text fallback.

## Testing

Key behaviours are covered with Node test files inside `lib/services/email/__tests__/`.

```bash
pnpm test:email
```

The script relies on the `tsx` runner and uses an in-memory provider to validate template rendering, batch sending, and configuration delegation without touching AWS.

## API Route

The existing API route `app/api/email/send/route.ts` now uses the new helper functions. Single or batch sends continue to work without code changes.

## Migration Notes

- `ses-client.ts` now wraps the transactional mailer but keeps `sendEmail`, `sendBatchEmails`, `verifySESConfiguration`, `EMAIL_CONFIG`, `EmailParams`, and `EmailResult` exports for backward compatibility.
- Helpers return strongly typed `SendResult` objects and accept `Recipient | Recipient[]` values to support named recipients.
- The new template directory makes it simple to add future transactional emails without touching the core mailer logic.

```typescript
import { sendEmail } from '@/lib/services/email';

// Send a simple email
const result = await sendEmail({
  to: 'user@example.com',
  subject: 'Welcome to Insturix!',
  htmlBody: '<h1>Welcome!</h1><p>Thanks for joining.</p>',
  textBody: 'Welcome! Thanks for joining.',
});

if (result.success) {
  console.log('Email sent!', result.messageId);
}
```

### 2. Using Pre-built Templates

```typescript
import { sendWelcomeEmail } from '@/lib/services/email';

// Send welcome email with template
await sendWelcomeEmail('user@example.com', 'John Doe');
```

### 3. API Route Usage

**Send Single Email:**
```bash
POST /api/email/send
Content-Type: application/json

{
  "to": "user@example.com",
  "subject": "Test Email",
  "htmlBody": "<h1>Hello World</h1>",
  "textBody": "Hello World"
}
```

**Send Batch Emails:**
```bash
POST /api/email/send
Content-Type: application/json

{
  "batch": true,
  "emails": [
    {
      "to": "user1@example.com",
      "subject": "Newsletter",
      "htmlBody": "<h1>Newsletter Content</h1>"
    },
    {
      "to": "user2@example.com",
      "subject": "Newsletter",
      "htmlBody": "<h1>Newsletter Content</h1>"
    }
  ]
}
```

## Available Templates

### Welcome Email
```typescript
import { sendWelcomeEmail } from '@/lib/services/email';

await sendWelcomeEmail('user@example.com', 'John Doe');
```

### Email Verification
```typescript
import { sendVerificationEmail } from '@/lib/services/email';

await sendVerificationEmail(
  'user@example.com',
  'John Doe',
  'https://insturix.com/verify?token=abc123'
);
```

### Password Reset
```typescript
import { sendPasswordResetEmail } from '@/lib/services/email';

await sendPasswordResetEmail(
  'user@example.com',
  'John Doe',
  'https://insturix.com/reset?token=xyz789'
);
```

### Order Confirmation
```typescript
import { sendOrderConfirmationEmail } from '@/lib/services/email';

await sendOrderConfirmationEmail(
  'user@example.com',
  'John Doe',
  'ORD-12345',
  [
    { item: 'Premium Plan', price: '₹999' },
    { item: 'Add-on Feature', price: '₹299' }
  ]
);
```

### Generic Notification
```typescript
import { sendNotificationEmail } from '@/lib/services/email';

await sendNotificationEmail(
  'user@example.com',
  'John Doe',
  'New Feature Available',
  'We just launched a new feature you might love!',
  'https://insturix.com/features',
  'Check It Out'
);
```

### Security Alert
```typescript
import { sendSecurityAlertEmail } from '@/lib/services/email';

await sendSecurityAlertEmail(
  'user@example.com',
  'John Doe',
  'New Login Detected',
  'We detected a new login to your account from a Windows device in Mumbai, India on October 24, 2025.'
);
```

## Advanced Usage

### Custom Email with Multiple Recipients

```typescript
import { sendEmail } from '@/lib/services/email';

await sendEmail({
  to: ['user1@example.com', 'user2@example.com'],
  subject: 'Team Update',
  htmlBody: '<h1>Important Update</h1>',
  textBody: 'Important Update',
  cc: ['manager@insturix.com'],
  replyTo: 'support@insturix.com',
});
```

### Batch Processing with Custom Templates

```typescript
import { sendBatchEmails } from '@/lib/services/email';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import User from '@/schemas/UserSchema';

// Example: Send announcement to all users
async function sendAnnouncementToAllUsers() {
  await connectToDatabase();
  const users = await User.find({ emailVerified: true });

  const emails = users.map(user => ({
    to: user.email,
    subject: 'Important Announcement',
    htmlBody: `<h1>Hi ${user.name}!</h1><p>We have an important update...</p>`,
    textBody: `Hi ${user.name}! We have an important update...`,
  }));

  // Send in batches of 10 (rate limiter handles sequencing)
  const results = await sendBatchEmails(emails, { batchSize: 10 });

  const successCount = results.filter(r => r.success).length;
  console.log(`Sent ${successCount}/${emails.length} emails`);
}
```

## Rate Limiting & Scaling

### Current Implementation
- **Built-in rate limiter** ensures compliance with 14 emails/second
- **Automatic queuing** handles burst sends
- **10% safety buffer** prevents hitting hard limits

### For High-Volume Sends

For sending to thousands of users (newsletters, major announcements):

1. **Use Job Queues**: Implement Bull Queue or AWS SQS
```typescript
// Example with Bull Queue (requires Redis)
import Queue from 'bull';

const emailQueue = new Queue('emails', process.env.UPSTASH_REDIS_REST_URL!);

emailQueue.process(async (job) => {
  return await sendEmail(job.data);
});

// Add emails to queue
users.forEach(user => {
  emailQueue.add({ 
    to: user.email,
    subject: 'Newsletter',
    htmlBody: template 
  });
});
```

2. **Monitor Daily Quota**: Track sends in database
```typescript
// Implement daily counter
const today = new Date().toISOString().split('T')[0];
const dailyCount = await EmailLog.countDocuments({ 
  sentDate: today 
});

if (dailyCount >= 50000) {
  console.error('Daily quota exceeded!');
  return;
}
```

3. **Consider SES SendBulkTemplatedEmail**: For identical content to multiple users

## Error Handling

The service automatically handles:

- **Throttling errors** - Retries with exponential backoff
- **Transient failures** - Auto-retry up to 3 times
- **Invalid recipients** - Returns detailed error
- **Network issues** - Retry logic handles temporary outages

### Monitoring Email Failures

```typescript
const result = await sendEmail({
  to: 'user@example.com',
  subject: 'Test',
  htmlBody: '<h1>Test</h1>',
});

if (!result.success) {
  // Log to monitoring service
  console.error('Email failed:', {
    error: result.error,
    retriesUsed: result.retriesUsed,
  });
  
  // Could save to database for manual review
  // await EmailFailureLog.create({ ... });
}
```

## Testing

### Health Check
```bash
GET /api/email/send

Response:
{
  "status": "ok",
  "service": "AWS SES Email Service",
  "region": "ap-south-1",
  "from": "no-reply@insturix.com"
}
```

### Verify Configuration
```typescript
import { verifySESConfiguration } from '@/lib/services/email';

const isValid = await verifySESConfiguration();
console.log('SES configured:', isValid);
```

### Test Email Send
```typescript
// In development, test with your own email
await sendEmail({
  to: 'your-email@example.com',
  subject: 'Test Email',
  htmlBody: '<h1>If you receive this, SES is working!</h1>',
  textBody: 'If you receive this, SES is working!',
});
```

## Production Deployment

### AWS Lambda
The service is Lambda-ready. SES client initializes once and reuses connections.

### EC2 / Node Server
Works out of the box. Ensure environment variables are set.

### Docker
Include environment variables in your docker-compose or Kubernetes config.

## Security Best Practices

1. **Never commit AWS credentials** - Use environment variables
2. **Use IAM roles** when deploying to AWS (Lambda, EC2)
3. **Restrict SES permissions** - Only allow SendEmail action
4. **Verify sender domains** - Prevents email spoofing
5. **Monitor bounce rates** - High bounce rates can affect reputation

## File Structure

```
lib/services/email/
├── index.ts              # Main export file
├── ses-client.ts         # AWS SES client & core logic
├── templates.ts          # Email HTML/text templates
└── helpers.ts            # High-level helper functions

app/api/email/
└── send/
    └── route.ts          # Email sending API endpoint
```

## Support

For issues or questions:
- Check AWS SES console for delivery metrics
- Review CloudWatch logs for detailed errors
- Contact DevOps for AWS credential issues

## Roadmap

Future enhancements:
- [ ] Email template builder UI
- [ ] Delivery tracking/analytics dashboard
- [ ] A/B testing for email content
- [ ] Unsubscribe management
- [ ] Bounce/complaint handling
- [ ] Email scheduling

---

**Last Updated**: October 24, 2025
**Maintained by**: Insturix Development Team
