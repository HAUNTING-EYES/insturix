# Batch Email Management Guide

Send multiple emails efficiently while respecting AWS SES rate limits (14 emails/second).

## Quick Start

### Simple Batch Send

```typescript
import { sendBatchEmails } from '@/lib/services/email';

const emails = [
  { to: 'user1@example.com', subject: 'Hello 1', htmlBody: '<p>Hi User 1</p>' },
  { to: 'user2@example.com', subject: 'Hello 2', htmlBody: '<p>Hi User 2</p>' },
  { to: 'user3@example.com', subject: 'Hello 3', htmlBody: '<p>Hi User 3</p>' },
];

const results = await sendBatchEmails(emails);

console.log(`Sent ${results.filter(r => r.success).length}/${results.length} emails`);
```

### Advanced Batch with Management

For better control and monitoring of large batches:

```typescript
import { sendBatchEmailsManaged } from '@/lib/services/email';

const emails = [
  // ... 1000+ emails
];

const result = await sendBatchEmailsManaged(emails, {
  batchSize: 50,                    // Split into groups of 50
  maxConcurrent: 5,                 // Send up to 5 concurrently
  delayBetweenBatches: 2000,       // Wait 2 seconds between batch groups
});

console.log(`
✅ Sent: ${result.summary.successful}
❌ Failed: ${result.summary.failed}
⏱️  Duration: ${result.summary.duration}ms
`);
```

## Configuration Options

### BatchOptions

```typescript
interface BatchOptions {
  batchSize?: number;              // Default: 10 (emails per batch)
  delayBetweenBatches?: number;    // Default: 0 (milliseconds)
  rateLimit?: number;              // Default: 14 (emails/second, from config)
  maxConcurrent?: number;          // Default: 3 (concurrent sends within batch)
}
```

## Use Cases

### 1. Newsletter to All Users

```typescript
import { sendNotificationEmail, sendBatchEmailsManaged } from '@/lib/services/email';
import User from '@/schemas/UserSchema';

async function sendNewsletterToAll() {
  const users = await User.find({ emailVerified: true });
  
  const emails = users.map(user => ({
    to: user.email,
    subject: 'Monthly Newsletter - November 2025',
    htmlBody: '<h1>Newsletter Content Here</h1>',
    textBody: 'Newsletter Content Here',
  }));

  // For 1000+ emails, use managed batch
  const result = await sendBatchEmailsManaged(emails, {
    batchSize: 100,          // Process 100 at a time
    maxConcurrent: 5,        // Send 5 simultaneously
    delayBetweenBatches: 1000, // 1 second delay between groups
  });

  console.log(`Newsletter sent to ${result.summary.successful} users`);
  
  if (result.summary.failed > 0) {
    // Handle failures
    const failures = result.results.filter(r => !r.success);
    console.error('Failed emails:', failures);
  }
}

sendNewsletterToAll().catch(console.error);
```

### 2. Bulk User Onboarding

```typescript
import { sendWelcomeEmail, sendBatchEmails } from '@/lib/services/email';
import { sendTemplateEmail } from '@/lib/services/email';

async function onboardNewUsers(userIds: string[]) {
  const users = await User.find({ _id: { $in: userIds } });
  
  const emails = users.map(user => {
    // Use templateEmail for direct control
    return {
      to: user.email,
      subject: 'Welcome to Insturix',
      htmlBody: getWelcomeEmailHTML(user.name),
      textBody: getWelcomeEmailText(user.name),
    };
  });

  const results = await sendBatchEmails(emails, { batchSize: 20 });
  return results;
}
```

### 3. Verification Emails (Time-Sensitive)

```typescript
import { sendBatchEmailsManaged } from '@/lib/services/email';

async function sendVerificationCampaign(userEmails: string[]) {
  const emails = userEmails.map(email => ({
    to: email,
    subject: 'Verify Your Email',
    htmlBody: `<a href="https://insturix.com/verify?email=${email}">Verify Now</a>`,
  }));

  // Send faster for time-sensitive emails
  return sendBatchEmailsManaged(emails, {
    batchSize: 50,
    maxConcurrent: 10,  // More concurrent sends
    delayBetweenBatches: 500, // Shorter delays
  });
}
```

### 4. Failed Retry Queue

```typescript
import { sendBatchEmails } from '@/lib/services/email';

async function retryFailedEmails(previousResults: SendResult[]) {
  const failedEmails = previousResults
    .filter(r => !r.success)
    .map(r => ({
      to: r.recipient, // Assume you stored this
      subject: r.subject,
      htmlBody: r.htmlBody,
    }));

  if (failedEmails.length === 0) {
    console.log('No emails to retry');
    return;
  }

  console.log(`Retrying ${failedEmails.length} failed emails...`);
  
  const retryResults = await sendBatchEmails(failedEmails, {
    batchSize: 5, // Send slowly for retries
  });

  return retryResults;
}
```

## Rate Limiting & Performance

### How It Works

1. **Rate Limiter**: Ensures max 14 emails/second (AWS SES limit with 10% safety buffer)
2. **Concurrent Processing**: Multiple emails sent simultaneously, but rate-limited
3. **Batch Grouping**: Emails split into batches to prevent overwhelming AWS SES

### Recommendations by Scale

| Scale | batchSize | maxConcurrent | delayBetweenBatches |
|-------|-----------|---------------|-------------------|
| 10-50 emails | 10 | 3 | 0 |
| 100-500 emails | 50 | 5 | 500ms |
| 500-5000 emails | 100 | 5 | 1000ms |
| 5000+ emails | 200 | 3 | 2000ms |

### Example: 10,000 Emails

```typescript
const result = await sendBatchEmailsManaged(emails, {
  batchSize: 200,           // 50 batches total
  maxConcurrent: 3,         // Conservative concurrency
  delayBetweenBatches: 2000, // 2 second delay between batches
});

// Total time estimate:
// 50 batches × (200 emails ÷ 12-13 emails/sec + 2000ms) ≈ 40 minutes
```

## Monitoring & Progress

### Get Results Summary

```typescript
const result = await sendBatchEmailsManaged(emails);

console.log(result.summary);
// Output:
// {
//   total: 1000,
//   successful: 998,
//   failed: 2,
//   duration: 120000  // milliseconds
// }
```

### Track Individual Failures

```typescript
const result = await sendBatchEmailsManaged(emails);

const failures = result.results
  .map((r, i) => ({ index: i, ...r }))
  .filter(r => !r.success);

failures.forEach(failure => {
  console.error(`Email ${failure.index} failed: ${failure.error}`);
});
```

### Store Results for Audit

```typescript
import EmailLog from '@/schemas/EmailLogSchema';

const result = await sendBatchEmailsManaged(emails);

await EmailLog.create({
  timestamp: new Date(),
  batchId: generateId(),
  total: result.summary.total,
  successful: result.summary.successful,
  failed: result.summary.failed,
  duration: result.summary.duration,
  details: result.results,
});
```

## Error Handling

### Retry Failed Emails

```typescript
async function sendWithRetry(emails, maxRetries = 3) {
  let results = await sendBatchEmails(emails);
  
  for (let attempt = 1; attempt < maxRetries; attempt++) {
    const failed = results.filter(r => !r.success);
    if (failed.length === 0) break;
    
    console.log(`Retry attempt ${attempt}: ${failed.length} failed emails`);
    results = await sendBatchEmails(failed);
  }
  
  return results;
}
```

### Handle Rate Limiting

```typescript
async function sendWithBackoff(emails) {
  try {
    return await sendBatchEmailsManaged(emails, {
      batchSize: 50,
      maxConcurrent: 3,
      delayBetweenBatches: 3000, // Increase delay if throttled
    });
  } catch (error) {
    if (error.message.includes('Throttling')) {
      console.log('AWS throttled us, waiting 30 seconds...');
      await new Promise(r => setTimeout(r, 30000));
      return sendBatchEmailsManaged(emails); // Retry
    }
    throw error;
  }
}
```

## Best Practices

✅ **Do:**
- Split large batches (1000+) with delays between groups
- Use `maxConcurrent: 3-5` for stability
- Monitor the results and log failures
- Implement retry logic for transient failures
- Test with small batches first

❌ **Don't:**
- Send 10,000+ emails without batching
- Use `maxConcurrent > 10` (risks throttling)
- Ignore failed emails
- Send time-sensitive emails at the end of a large batch
- Rely on the rate limiter alone (it has limits too)

## Daily Quota

AWS SES production allows **50,000 emails/day**. Track this:

```typescript
async function canSendBatch(emails: MailMessage[]) {
  const today = new Date().toISOString().split('T')[0];
  const sent = await EmailLog.countDocuments({ date: today });
  const remaining = 50000 - sent;
  
  if (emails.length > remaining) {
    console.error(`Only ${remaining} emails available today`);
    return false;
  }
  
  return true;
}
```

## API Endpoint Usage

```bash
# Send batch via API
POST /api/email/send
Content-Type: application/json

{
  "batch": true,
  "emails": [
    {
      "to": "user1@example.com",
      "subject": "Hello",
      "htmlBody": "<p>Hi</p>"
    },
    {
      "to": "user2@example.com",
      "subject": "Hello",
      "htmlBody": "<p>Hi</p>"
    }
  ]
}
```

## Testing

```typescript
import { sendBatchEmailsManaged } from '@/lib/services/email';

async function testBatchEmails() {
  const testEmails = Array(100).fill(null).map((_, i) => ({
    to: `test${i}@example.com`,
    subject: `Test Email ${i}`,
    htmlBody: `<p>This is test email ${i}</p>`,
  }));

  const result = await sendBatchEmailsManaged(testEmails, {
    batchSize: 20,
    maxConcurrent: 3,
  });

  console.log(`Test batch results:`, result.summary);
}
```

---

**Last Updated**: November 6, 2025  
**Documentation**: `/Documentation/email/BATCH_EMAIL_GUIDE.md`
