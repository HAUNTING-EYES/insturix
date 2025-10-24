# Email Service - Quick Reference Card

## 🚀 Setup (One-time)

Add to `.env.local`:
```bash
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
```

## 📧 Common Usage

### Import
```typescript
import { 
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendEmail,
} from '@/lib/services/email';
```

### Send Welcome Email
```typescript
await sendWelcomeEmail('user@example.com', 'John Doe');
```

### Send Verification Email
```typescript
await sendVerificationEmail(
  'user@example.com',
  'John Doe',
  'https://insturix.com/verify?token=abc123'
);
```

### Send Password Reset
```typescript
await sendPasswordResetEmail(
  'user@example.com',
  'John Doe',
  'https://insturix.com/reset?token=xyz789'
);
```

### Send Order Confirmation
```typescript
await sendOrderConfirmationEmail(
  'user@example.com',
  'John Doe',
  'ORD-12345',
  [
    { item: 'Premium Plan', price: '₹999' },
    { item: 'Add-on', price: '₹299' }
  ]
);
```

### Send Custom Email
```typescript
await sendEmail({
  to: 'user@example.com',
  subject: 'Your Subject',
  htmlBody: '<h1>HTML Content</h1>',
  textBody: 'Plain text fallback',
  replyTo: 'support@insturix.com', // optional
});
```

### Send to Multiple Recipients
```typescript
await sendEmail({
  to: ['user1@example.com', 'user2@example.com'],
  subject: 'Team Update',
  htmlBody: '<h1>Update</h1>',
});
```

### Send Batch Emails
```typescript
import { sendBatchEmails } from '@/lib/services/email';

await sendBatchEmails([
  { to: 'user1@example.com', subject: 'Hello', htmlBody: '<h1>Hi</h1>' },
  { to: 'user2@example.com', subject: 'Hello', htmlBody: '<h1>Hi</h1>' },
], 10); // batch size
```

## 🔌 API Usage

### Health Check
```bash
GET http://localhost:3000/api/email/send
```

### Send Single Email
```bash
POST http://localhost:3000/api/email/send
Content-Type: application/json

{
  "to": "user@example.com",
  "subject": "Test",
  "htmlBody": "<h1>Test</h1>",
  "textBody": "Test"
}
```

### Send Batch
```bash
POST http://localhost:3000/api/email/send
Content-Type: application/json

{
  "batch": true,
  "emails": [
    { "to": "user1@example.com", "subject": "...", "htmlBody": "..." },
    { "to": "user2@example.com", "subject": "...", "htmlBody": "..." }
  ]
}
```

## ⚡ Integration Examples

### With User Registration
```typescript
// In app/api/user/register/route.ts
import { sendWelcomeEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  const { email, name } = await request.json();
  
  // Create user
  const user = await createUser(email, name);
  
  // Send welcome email (async, non-blocking)
  sendWelcomeEmail(email, name).catch(console.error);
  
  return NextResponse.json({ success: true });
}
```

### With Clerk Webhook
```typescript
// In app/api/webhooks/clerk/route.ts
import { sendWelcomeEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  const evt = await request.json();
  
  if (evt.type === 'user.created') {
    const email = evt.data.email_addresses[0].email_address;
    const name = `${evt.data.first_name} ${evt.data.last_name}`;
    
    await sendWelcomeEmail(email, name);
  }
  
  return NextResponse.json({ success: true });
}
```

### With Razorpay Payment
```typescript
// After successful payment
import { sendOrderConfirmationEmail } from '@/lib/services/email';

await sendOrderConfirmationEmail(
  order.email,
  order.customerName,
  order.id,
  order.items.map(item => ({
    item: item.name,
    price: `₹${item.price}`
  }))
);
```

## 📊 Error Handling

```typescript
const result = await sendEmail({ /* params */ });

if (result.success) {
  console.log('✅ Email sent:', result.messageId);
} else {
  console.error('❌ Email failed:', result.error);
  // Optional: Save to database for retry
}
```

## 🎨 Custom Template

```typescript
import { emailWrapper } from '@/lib/services/email';

const content = `
  <h1>Custom Heading</h1>
  <p>Your message here...</p>
  <a href="https://insturix.com/action" class="button">Click Here</a>
`;

const htmlBody = emailWrapper(content);

await sendEmail({
  to: 'user@example.com',
  subject: 'Custom Email',
  htmlBody,
});
```

## 📝 Available Templates

- `sendWelcomeEmail(email, name)`
- `sendVerificationEmail(email, name, link)`
- `sendPasswordResetEmail(email, name, link)`
- `sendOrderConfirmationEmail(email, name, orderId, items)`
- `sendNotificationEmail(email, name, title, message, actionUrl?, actionText?)`
- `sendSecurityAlertEmail(email, name, alertType, details)`

## ⚙️ Configuration

- **Region**: ap-south-1 (Mumbai)
- **From**: no-reply@insturix.com
- **Rate Limit**: 14 emails/second (auto-handled)
- **Daily Limit**: 50,000 emails/day

## 🧪 Testing

```bash
# In your code
import { testSimpleEmail } from '@/lib/services/email/test';
await testSimpleEmail('your-email@example.com');
```

## 📚 Full Documentation

- **Quick Start**: `IMPLEMENTATION.md`
- **Complete Docs**: `README.md`
- **Examples**: `examples.ts`
- **Tests**: `test.ts`

---

**💡 Tip**: Always include both `htmlBody` and `textBody` for best deliverability!
