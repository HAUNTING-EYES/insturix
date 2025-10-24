# AWS SES Email Service - Implementation Guide

## 🚀 Quick Setup (5 minutes)

### Step 1: Add AWS Credentials

Add these to your `.env.local` file:

```bash
```bash
AWS_ACCESS_KEY_ID=your_actual_aws_access_key
AWS_SECRET_ACCESS_KEY=your_actual_aws_secret_key
AWS_SES_REGION=ap-south-1
AWS_SES_FROM_EMAIL=no-reply@insturix.com
```

**How to get credentials:**
1. Log into AWS Console
2. Go to IAM → Users → Your User
3. Security Credentials → Create Access Key
4. Choose "Application running outside AWS"
5. Copy Access Key ID and Secret Access Key

### Step 2: Verify Installation

The package is already installed. Verify in `package.json`:
```json
"@aws-sdk/client-ses": "^3.916.0"
```

### Step 3: Test the Service

Create a test file or use the API route:

**Option A: Use API Route (Recommended)**
```bash
# Health check
curl http://localhost:3000/api/email/send

# Send test email
curl -X POST http://localhost:3000/api/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "subject": "Test Email",
    "htmlBody": "<h1>It works!</h1>",
    "textBody": "It works!"
  }'
```

**Option B: Test in Code**
```typescript
import { sendEmail } from '@/lib/services/email';

const result = await sendEmail({
  to: 'your-email@example.com',
  subject: 'Test Email',
  htmlBody: '<h1>Hello from Insturix!</h1>',
  textBody: 'Hello from Insturix!',
});

console.log(result);
```

---

## 📧 Common Use Cases

### 1. User Registration

```typescript
// In your user registration API route
import { sendWelcomeEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  const { email, name } = await request.json();
  
  // Create user in database
  // ... your user creation logic
  
  // Send welcome email (async, non-blocking)
  sendWelcomeEmail(email, name)
    .then(result => console.log('Welcome email sent:', result.messageId))
    .catch(error => console.error('Email failed:', error));
  
  return NextResponse.json({ success: true });
}
```

### 2. Email Verification

```typescript
import { sendVerificationEmail } from '@/lib/services/email';

// Generate verification token
const token = generateToken(); // your token generation logic

// Send verification email
await sendVerificationEmail(
  userEmail,
  userName,
  `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`
);
```

### 3. Password Reset

```typescript
import { sendPasswordResetEmail } from '@/lib/services/email';

// Generate reset token
const resetToken = generateResetToken();

await sendPasswordResetEmail(
  userEmail,
  userName,
  `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}`
);
```

### 4. Order Confirmation

```typescript
import { sendOrderConfirmationEmail } from '@/lib/services/email';

await sendOrderConfirmationEmail(
  userEmail,
  userName,
  orderId,
  [
    { item: 'Premium Plan', price: '₹999' },
    { item: 'Tax', price: '₹180' }
  ]
);
```

### 5. Send to Multiple Users

```typescript
import { sendBatchEmails } from '@/lib/services/email';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import User from '@/schemas/UserSchema';

async function sendAnnouncement() {
  await connectToDatabase();
  const users = await User.find({ emailVerified: true });
  
  const emails = users.map(user => ({
    to: user.email,
    subject: 'Important Announcement',
    htmlBody: `<h1>Hi ${user.name}!</h1><p>We have exciting news...</p>`,
    textBody: `Hi ${user.name}! We have exciting news...`,
  }));
  
  const results = await sendBatchEmails(emails, 10);
  console.log(`Sent ${results.filter(r => r.success).length}/${emails.length} emails`);
}
```

---

## 🔧 Integration Points

### With Clerk (User Authentication)

```typescript
// In webhooks/clerk/route.ts
import { sendWelcomeEmail } from '@/lib/services/email';
import { WebhookEvent } from '@clerk/nextjs/server';

export async function POST(request: NextRequest) {
  const evt = await request.json() as WebhookEvent;
  
  if (evt.type === 'user.created') {
    const { email_addresses, first_name, last_name } = evt.data;
    const email = email_addresses[0].email_address;
    const name = `${first_name} ${last_name}`;
    
    // Send welcome email
    await sendWelcomeEmail(email, name);
  }
  
  return NextResponse.json({ success: true });
}
```

### With Razorpay (Payment Gateway)

```typescript
// In webhooks/razorpay/route.ts
import { sendOrderConfirmationEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  const payment = await request.json();
  
  if (payment.event === 'payment.captured') {
    // Get order details
    const order = await getOrderDetails(payment.payload.payment.entity.order_id);
    
    // Send confirmation email
    await sendOrderConfirmationEmail(
      order.email,
      order.customerName,
      order.id,
      order.items
    );
  }
  
  return NextResponse.json({ success: true });
}
```

### With MongoDB (Database Triggers)

```typescript
// Example: Send notification when user reaches milestone
import { sendNotificationEmail } from '@/lib/services/email';
import User from '@/schemas/UserSchema';

async function checkMilestone(userId: string) {
  const user = await User.findById(userId);
  
  if (user.points >= 1000 && !user.milestones.includes('1000_points')) {
    // Update milestone
    user.milestones.push('1000_points');
    await user.save();
    
    // Send congratulations email
    await sendNotificationEmail(
      user.email,
      user.name,
      'Congratulations! 🎉',
      'You\'ve reached 1,000 points! You\'re amazing!',
      'https://insturix.com/rewards',
      'Claim Your Reward'
    );
  }
}
```

---

## 🎨 Creating Custom Email Templates

### Basic Template

```typescript
import { sendEmail } from '@/lib/services/email';

const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { 
      background: #0066cc; 
      color: white; 
      padding: 12px 24px; 
      text-decoration: none; 
      border-radius: 4px; 
      display: inline-block;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Custom Email</h1>
    <p>Your custom content here...</p>
    <a href="https://insturix.com" class="button">Take Action</a>
  </div>
</body>
</html>
`;

await sendEmail({
  to: 'user@example.com',
  subject: 'Custom Email',
  htmlBody,
  textBody: 'Your plain text fallback...',
});
```

### Using the Email Wrapper

```typescript
import { emailWrapper } from '@/lib/services/email';

const content = `
  <h1>Your Custom Heading</h1>
  <p>Your content here...</p>
  <a href="https://insturix.com/action" class="button">Click Here</a>
`;

const htmlBody = emailWrapper(content, 'Preview text here');

await sendEmail({
  to: 'user@example.com',
  subject: 'Custom Email with Wrapper',
  htmlBody,
});
```

---

## ⚠️ Important Notes

### Rate Limits
- **Current limit**: 14 emails/second (automatically enforced)
- **Daily limit**: 50,000 emails/day (monitor manually)
- For bulk sends over 1,000 emails, consider using a job queue

### Error Handling
Always handle email failures gracefully:

```typescript
const result = await sendEmail({ /* params */ });

if (!result.success) {
  // Log error for monitoring
  console.error('Email failed:', result.error);
  
  // Optional: Save to database for retry later
  // await FailedEmail.create({ ... });
  
  // Don't fail the entire request
  // Just log and continue
}
```

### Security
- ✅ AWS credentials are in environment variables (never commit)
- ✅ no-reply@insturix.com is verified in SES
- ✅ Only transactional emails (no marketing without user consent)
- ✅ Rate limiting prevents abuse

### Monitoring
Check AWS SES Console regularly:
- Delivery rate (should be >98%)
- Bounce rate (should be <5%)
- Complaint rate (should be <0.1%)

---

## 🐛 Troubleshooting

### "Email not sent" Error
1. Check AWS credentials in `.env.local`
2. Verify email is verified in SES (for sandbox mode)
3. Check AWS SES sending limits
4. Review CloudWatch logs in AWS Console

### High Bounce Rate
- Verify email addresses before sending
- Remove invalid emails from lists
- Use double opt-in for new subscribers

### Rate Limit Exceeded
- The service automatically handles rate limiting
- If you see errors, you might be hitting daily quota
- Consider spreading sends across days

---

## 📚 File Reference

```
lib/services/email/
├── index.ts              → Import from here
├── ses-client.ts         → Core SES logic
├── templates.ts          → Email templates
├── helpers.ts            → Helper functions
├── examples.ts           → Integration examples
├── test.ts               → Test suite
├── README.md             → Full documentation
└── IMPLEMENTATION.md     → This file

app/api/email/send/
└── route.ts              → API endpoint
```

---

## ✅ Checklist

- [ ] AWS credentials added to `.env.local`
- [ ] Test email sent successfully
- [ ] Integrated with user registration
- [ ] Integrated with password reset
- [ ] Set up error logging/monitoring
- [ ] Configured daily quota monitoring
- [ ] Tested on staging environment
- [ ] Deployed to production

---

**Need help?** Check the full documentation in `README.md` or review `examples.ts` for more integration patterns.

**Last Updated**: October 24, 2025
