# AWS SES Limits & Quotas

## Current Configuration for Insturix

| Limit | Value | Notes |
|-------|-------|-------|
| **Daily Email Quota** | 50,000 emails/day | Hard limit, resets daily at UTC midnight |
| **Send Rate** | 14 emails/second | Maximum concurrent sending rate |
| **Safety Buffer** | 10% | Auto-applied by rate limiter (actual: ~12-13/sec) |
| **Max Recipients Per Email** | 50 | Total across To, CC, BCC |
| **Email Size** | 10 MB | Including attachments |
| **Sending Domain** | no-reply@insturix.com | Verified sender |
| **Region** | ap-south-1 (Mumbai) | AWS SES region |

## Rate Limiting Explained

### How It Works

**AWS SES allows 14 emails/second maximum.** The system automatically enforces this:

```
1 second = 1000 milliseconds
14 emails/second = 1 email every ~71 milliseconds

Safety buffer (10%) = 1 email every ~78 milliseconds
Actual rate: ~12-13 emails/second
```

### Rate Limiter in Action

```typescript
// Example: Sending 28 emails
// Time estimate: 28 ÷ 12.8 emails/sec ≈ 2.2 seconds

const results = await sendBatchEmails([
  { to: 'user1@example.com', ... },
  { to: 'user2@example.com', ... },
  // ... 26 more emails
]);
// Completes in ~2-3 seconds automatically
```

## Daily Quota Management

### Track Daily Usage

```typescript
import EmailLog from '@/schemas/EmailLogSchema';

async function getDailyUsage() {
  const today = new Date().toISOString().split('T')[0];
  const sent = await EmailLog.countDocuments({ date: today });
  const remaining = 50000 - sent;
  
  return {
    sent,
    remaining,
    percentUsed: ((sent / 50000) * 100).toFixed(1),
    canSendNow: remaining > 0,
  };
}

const usage = await getDailyUsage();
console.log(`📊 Daily Usage: ${usage.sent}/50000 (${usage.percentUsed}% used)`);
console.log(`📬 Remaining: ${usage.remaining} emails today`);
```

### Prevent Quota Overflow

```typescript
import EmailLog from '@/schemas/EmailLogSchema';

async function canSendBatch(emails) {
  const today = new Date().toISOString().split('T')[0];
  const sent = await EmailLog.countDocuments({ date: today });
  const remaining = 50000 - sent;
  
  if (emails.length > remaining) {
    console.error(
      `❌ Cannot send ${emails.length} emails. Only ${remaining} available today.`
    );
    return false;
  }
  
  if (remaining < 100) {
    console.warn(`⚠️  Only ${remaining} emails left for today!`);
  }
  
  return true;
}

// Usage
if (await canSendBatch(emails)) {
  await sendBatchEmailsManaged(emails);
}
```

### Log All Sends

```typescript
import EmailLog from '@/schemas/EmailLogSchema';

async function sendWithLogging(emails) {
  const result = await sendBatchEmailsManaged(emails);
  
  // Log to database for auditing
  await EmailLog.create({
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date(),
    type: 'batch',
    requested: emails.length,
    successful: result.summary.successful,
    failed: result.summary.failed,
    duration: result.summary.duration,
  });
  
  return result;
}
```

## Scaling Strategies

### Strategy 1: Newsletter to 50,000 Users (Entire Quota)

```typescript
async function sendDailyNewsletter() {
  const users = await User.find({ emailVerified: true });
  
  const emails = users.map(user => ({
    to: user.email,
    subject: 'Daily Newsletter',
    htmlBody: getNewsletterHTML(),
  }));

  // Configuration for full-day send
  const result = await sendBatchEmailsManaged(emails, {
    batchSize: 200,          // Process in 250 groups
    maxConcurrent: 2,        // Conservative
    delayBetweenBatches: 2000, // 2 seconds between batches
  });

  // Total time: ~500 seconds (8-9 minutes)
  console.log(`Newsletter sent to ${result.summary.successful} users in ${result.summary.duration}ms`);
}
```

### Strategy 2: Multiple Campaigns (10% of Quota per Campaign)

```typescript
// Campaign 1: Verification emails - 5,000 emails
await sendBatchEmailsManaged(verificationEmails, {
  batchSize: 50,
  maxConcurrent: 5,
  delayBetweenBatches: 500,
});

// Wait before next campaign
await new Promise(r => setTimeout(r, 30000)); // 30 second buffer

// Campaign 2: Order confirmations - 3,000 emails
await sendBatchEmailsManaged(orderEmails, {
  batchSize: 100,
  maxConcurrent: 3,
  delayBetweenBatches: 1000,
});

// Usage: 8,000 / 50,000 = 16% (safe, 84% remaining)
```

### Strategy 3: Time-Based Throttling

```typescript
async function smartSend(emails, priority = 'normal') {
  const config = {
    urgent: {
      batchSize: 50,
      maxConcurrent: 10,
      delayBetweenBatches: 200,
    },
    normal: {
      batchSize: 100,
      maxConcurrent: 5,
      delayBetweenBatches: 1000,
    },
    bulk: {
      batchSize: 200,
      maxConcurrent: 3,
      delayBetweenBatches: 2000,
    },
  };

  return sendBatchEmailsManaged(emails, config[priority]);
}

// Urgent: 30 seconds for 500 emails
await smartSend(urgentEmails, 'urgent');

// Normal: 1-2 minutes for 500 emails  
await smartSend(normalEmails, 'normal');

// Bulk: 2-3 minutes for 500 emails
await smartSend(bulkEmails, 'bulk');
```

## Rate Limit Recovery

### What Happens at the Limit?

```
Scenario: Trying to send 20 emails/second (exceeds 14/second limit)

Result: AWS SES returns 429 (Too Many Requests) error
The rate limiter automatically:
1. Backs off exponentially (1s → 2s → 4s)
2. Retries failed request
3. Resumes at safe rate
```

### Automatic Retry Logic

```typescript
// The system handles this automatically

async function send(email) {
  let attempt = 0;
  const maxRetries = 3;
  
  for (;;) {
    try {
      return await sesClient.send(email);
    } catch (error) {
      if (isThrottleError(error) && attempt < maxRetries) {
        const backoff = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        await delay(backoff);
        attempt++;
        continue;
      }
      throw error;
    }
  }
}
```

## Monitoring & Alerts

### Alert Thresholds

```typescript
async function checkQuotaAlerts() {
  const today = new Date().toISOString().split('T')[0];
  const sent = await EmailLog.countDocuments({ date: today });
  const remaining = 50000 - sent;
  
  // Red: Less than 1,000 remaining
  if (remaining < 1000) {
    console.error(`🚨 CRITICAL: Only ${remaining} emails remaining!`);
    // Send alert to admin
  }
  
  // Yellow: Less than 5,000 remaining
  if (remaining < 5000) {
    console.warn(`⚠️  WARNING: Only ${remaining} emails remaining`);
    // Log warning
  }
  
  // Green: Normal
  if (remaining > 20000) {
    console.log(`✅ SAFE: ${remaining} emails remaining`);
  }
}

// Run hourly check
setInterval(checkQuotaAlerts, 3600000);
```

### Dashboard Metrics

```typescript
async function getEmailMetrics() {
  const today = new Date().toISOString().split('T')[0];
  
  const [sent, failed, hourlyAvg] = await Promise.all([
    EmailLog.countDocuments({ date: today, status: 'success' }),
    EmailLog.countDocuments({ date: today, status: 'failed' }),
    EmailLog.aggregate([
      { $match: { date: today } },
      { $group: { 
        _id: { $hour: '$timestamp' }, 
        count: { $sum: 1 } 
      }},
      { $sort: { _id: -1 }},
      { $limit: 1 }
    ]),
  ]);
  
  return {
    sentToday: sent,
    failedToday: failed,
    percentSuccess: ((sent / (sent + failed)) * 100).toFixed(1),
    lastHourRate: hourlyAvg[0]?.count || 0,
    hoursUntilReset: 24 - new Date().getUTCHours(),
    remaining: 50000 - sent,
  };
}
```

## Common Scenarios

### Scenario 1: Peak Hours (9 AM - 5 PM)

```
Expected traffic: High
Recommendation: Use 'normal' or 'bulk' batch config
Action: Spread sends throughout day, batch larger campaigns
```

### Scenario 2: Weekend Sends

```
Expected traffic: Low
Recommendation: Can use 'urgent' config
Action: Batch process saved-up emails over weekend
```

### Scenario 3: Emergency Notification

```
Situation: Need to send 1,000 urgent emails NOW
Rate: 14/sec × 60 = 840 emails/minute
Time: ~2 minutes to send 1,000

// Code
await sendBatchEmailsManaged(urgentEmails, {
  batchSize: 50,
  maxConcurrent: 10,
  delayBetweenBatches: 0, // No delays
});
```

## Best Practices

### ✅ Do

- Track daily sends in database
- Check remaining quota before large batches
- Use batch management for 100+ emails
- Space out multiple campaigns throughout the day
- Monitor failure rates
- Implement retry logic for transient failures
- Keep safety margin (use <45,000 daily, leave 5,000 buffer)

### ❌ Don't

- Fire all 50,000 emails at once
- Ignore rate limit errors
- Send without logging
- Increase `maxConcurrent` above 10
- Process same emails multiple times
- Test with production list (use small test group first)

## Rate Limit Calculation Guide

```typescript
function estimateSendTime(emailCount: number, config: BatchOptions) {
  const { batchSize = 10, maxConcurrent = 3, delayBetweenBatches = 0 } = config;
  
  const emailsPerSecond = 12.8; // After safety buffer
  const timePerBatch = (batchSize / emailsPerSecond) * 1000;
  const batchCount = Math.ceil(emailCount / batchSize);
  const delayTime = (batchCount - 1) * delayBetweenBatches;
  
  const totalMs = (timePerBatch * batchCount) + delayTime;
  
  return {
    batches: batchCount,
    timePerBatch: `${(timePerBatch / 1000).toFixed(1)}s`,
    totalTime: `${(totalMs / 1000).toFixed(1)}s`,
    quotaUsage: `${((emailCount / 50000) * 100).toFixed(1)}%`,
  };
}

// Example: 1,000 emails
console.log(estimateSendTime(1000, {
  batchSize: 100,
  maxConcurrent: 5,
  delayBetweenBatches: 1000,
}));
// Output:
// {
//   batches: 10,
//   timePerBatch: '7.8s',
//   totalTime: '85.6s',
//   quotaUsage: '2%'
// }
```

## Reset Schedule

- **Daily Reset**: UTC Midnight (12:00 AM UTC)
- **Your Timezone**: IST is UTC +5:30, so **5:30 AM IST**
- **Quota Check**: Query database for emails sent since last reset

```typescript
function isNewDay() {
  const lastReset = new Date();
  lastReset.setUTCHours(0, 0, 0, 0); // Today at UTC 00:00
  return new Date() > lastReset;
}

async function getTodayEmailCount() {
  const resetTime = new Date();
  resetTime.setUTCHours(0, 0, 0, 0);
  
  return EmailLog.countDocuments({
    timestamp: { $gte: resetTime }
  });
}
```

## Emergency Procedures

### If Daily Quota Exceeded

```typescript
// 1. Check current usage
const usage = await getDailyUsage();
if (usage.sent >= 50000) {
  console.error('Daily quota reached. Emails queued until tomorrow.');
  
  // 2. Queue emails for tomorrow
  await EmailQueue.insertMany(failedEmails);
  
  // 3. Alert admin
  await alertAdmin('Daily email quota reached');
  
  // 4. Stop accepting new sends until reset
  return { queued: failedEmails.length, retryTime: tomorrowAt530am };
}
```

### If Consistently Hitting Limits

1. **Request AWS SES limit increase** (takes 24-48 hours)
2. **Implement smarter scheduling** (spread sends throughout day)
3. **Use queue system** (Bull Queue, AWS SQS) for overflow
4. **Segment campaigns** (send to different user groups on different days)

---

**Last Updated**: November 6, 2025  
**Region**: ap-south-1 (AWS SES - Mumbai)  
**Documentation**: `/Documentation/email/LIMITS_AND_QUOTAS.md`
