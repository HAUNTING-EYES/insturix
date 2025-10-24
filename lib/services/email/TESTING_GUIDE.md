# Email Service Testing Guide

## 🧪 Complete Testing Guide

### Prerequisites

1. **Add AWS Credentials to `.env.local`**:
```bash
AWS_ACCESS_KEY_ID=your_actual_access_key
AWS_SECRET_ACCESS_KEY=your_actual_secret_key
AWS_SES_REGION=ap-south-1
AWS_SES_FROM_EMAIL=no-reply@insturix.com
```

2. **Verify AWS SES Configuration**:
   - Go to AWS Console → SES → Verified identities
   - Ensure `no-reply@insturix.com` is verified
   - If in sandbox mode, verify recipient emails too

---

## Method 1: Quick Test via API (Easiest)

### Step 1: Start Development Server

```bash
cd "d:\insturix\prod\Front-End"
pnpm dev
```

### Step 2: Test Health Check

Open browser or use curl:
```bash
# In PowerShell
Invoke-WebRequest -Uri http://localhost:3000/api/email/send

# Or visit in browser
http://localhost:3000/api/email/send
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "AWS SES Email Service",
  "region": "ap-south-1",
  "from": "no-reply@insturix.com"
}
```

### Step 3: Send Test Email via API

**Using PowerShell:**
```powershell
$body = @{
    to = "your-email@example.com"
    subject = "Test Email from Insturix"
    htmlBody = "<h1>Hello!</h1><p>This is a test email. If you receive this, the service is working! 🎉</p>"
    textBody = "Hello! This is a test email. If you receive this, the service is working!"
} | ConvertTo-Json

Invoke-WebRequest -Uri http://localhost:3000/api/email/send `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

**Using curl (if installed):**
```bash
curl -X POST http://localhost:3000/api/email/send \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"your-email@example.com\",\"subject\":\"Test Email\",\"htmlBody\":\"<h1>Test</h1>\",\"textBody\":\"Test\"}"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Email sent successfully",
  "messageId": "01000192dc75xxxx-xxxxx..."
}
```

### Step 4: Check Your Email

Look for the test email in your inbox. Check:
- ✅ Email received
- ✅ Subject line correct
- ✅ HTML renders properly
- ✅ Links work
- ✅ Not in spam folder

---

## Method 2: Test via Next.js API Route

### Create Test API Route

Create `app/api/test-email/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { sendWelcomeEmail, sendEmail } from '@/lib/services/email';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const email = searchParams.get('email') || 'your-email@example.com';
  const type = searchParams.get('type') || 'simple';

  try {
    let result;

    switch (type) {
      case 'welcome':
        result = await sendWelcomeEmail(email, 'Test User');
        break;
      
      case 'simple':
      default:
        result = await sendEmail({
          to: email,
          subject: 'Test Email',
          htmlBody: '<h1>Test Successful!</h1><p>Email service is working.</p>',
          textBody: 'Test Successful! Email service is working.',
        });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

### Test It

Visit in browser:
```
http://localhost:3000/api/test-email?email=your-email@example.com&type=welcome
```

---

## Method 3: Run Test Suite

### Option A: Use the Built-in Test File

**Step 1**: Update test email in `lib/services/email/test.ts`:

```typescript
// Line 27 - Change this to your email
const TEST_EMAIL = 'your-actual-email@example.com';
```

**Step 2**: Create a test runner file `test-email-service.mjs`:

```javascript
// test-email-service.mjs
import { config } from 'dotenv';
config({ path: '.env.local' });

// Import the test functions
const { runAllTests } = await import('./lib/services/email/test.ts');

// Run tests
await runAllTests();
```

**Step 3**: Run the tests:

```bash
node test-email-service.mjs
```

### Option B: Create Quick Test Script

Create `test-ses.ts` in the root:

```typescript
// test-ses.ts
import { 
  sendEmail,
  sendWelcomeEmail,
  sendVerificationEmail,
  verifySESConfiguration,
} from './lib/services/email';

async function runQuickTest() {
  console.log('🧪 Starting Email Service Quick Test\n');

  // Replace with your email
  const TEST_EMAIL = 'your-email@example.com';
  const TEST_NAME = 'Test User';

  // Test 1: Configuration
  console.log('1️⃣ Testing Configuration...');
  const isConfigured = await verifySESConfiguration();
  console.log(isConfigured ? '✅ Configuration OK\n' : '❌ Configuration Failed\n');

  if (!isConfigured) {
    console.error('Please check your AWS credentials in .env.local');
    return;
  }

  // Test 2: Simple Email
  console.log('2️⃣ Sending Simple Email...');
  const result1 = await sendEmail({
    to: TEST_EMAIL,
    subject: 'Test Email - Simple',
    htmlBody: '<h1>Test Email</h1><p>If you see this, it works! 🎉</p>',
    textBody: 'Test Email - If you see this, it works!',
  });
  console.log(result1.success ? `✅ Sent! MessageId: ${result1.messageId}\n` : `❌ Failed: ${result1.error}\n`);

  // Test 3: Welcome Email Template
  console.log('3️⃣ Sending Welcome Email...');
  const result2 = await sendWelcomeEmail(TEST_EMAIL, TEST_NAME);
  console.log(result2.success ? `✅ Sent! MessageId: ${result2.messageId}\n` : `❌ Failed: ${result2.error}\n`);

  // Test 4: Verification Email Template
  console.log('4️⃣ Sending Verification Email...');
  const result3 = await sendVerificationEmail(TEST_EMAIL, TEST_NAME, 'https://insturix.com/verify?token=test123');
  console.log(result3.success ? `✅ Sent! MessageId: ${result3.messageId}\n` : `❌ Failed: ${result3.error}\n`);

  console.log('✨ Test Complete! Check your inbox at', TEST_EMAIL);
}

runQuickTest().catch(console.error);
```

Run it:
```bash
npx tsx test-ses.ts
```

---

## Method 4: Test in Development Environment

### Create a Test Component

Create `app/test-email/page.tsx`:

```typescript
'use client';

import { useState } from 'react';

export default function TestEmailPage() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const sendTestEmail = async (type: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: `Test ${type} Email`,
          htmlBody: `<h1>Test ${type} Email</h1><p>This is a test email sent at ${new Date().toLocaleString()}</p>`,
          textBody: `Test ${type} Email - Sent at ${new Date().toLocaleString()}`,
        }),
      });
      const data = await response.json();
      setResult(data);
    } catch (error: any) {
      setResult({ success: false, error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>📧 Email Service Tester</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <label>
          <strong>Your Email Address:</strong>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your-email@example.com"
            style={{ 
              width: '100%', 
              padding: '10px', 
              marginTop: '10px',
              fontSize: '16px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={() => sendTestEmail('Simple')}
          disabled={!email || loading}
          style={{
            padding: '10px 20px',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: email && !loading ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? 'Sending...' : 'Send Test Email'}
        </button>
      </div>

      {result && (
        <div style={{
          marginTop: '20px',
          padding: '20px',
          backgroundColor: result.success ? '#d4edda' : '#f8d7da',
          border: `1px solid ${result.success ? '#c3e6cb' : '#f5c6cb'}`,
          borderRadius: '4px',
        }}>
          <h3>{result.success ? '✅ Success!' : '❌ Failed'}</h3>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
```

Visit: `http://localhost:3000/test-email`

---

## Method 5: Test Individual Templates

### Test All Templates at Once

Create `test-all-templates.ts`:

```typescript
import {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendNotificationEmail,
  sendSecurityAlertEmail,
} from './lib/services/email';

const TEST_EMAIL = 'your-email@example.com'; // CHANGE THIS
const TEST_NAME = 'Test User';

async function testAllTemplates() {
  console.log('📧 Testing all email templates...\n');

  const tests = [
    {
      name: 'Welcome Email',
      fn: () => sendWelcomeEmail(TEST_EMAIL, TEST_NAME),
    },
    {
      name: 'Verification Email',
      fn: () => sendVerificationEmail(TEST_EMAIL, TEST_NAME, 'https://insturix.com/verify?token=test'),
    },
    {
      name: 'Password Reset',
      fn: () => sendPasswordResetEmail(TEST_EMAIL, TEST_NAME, 'https://insturix.com/reset?token=test'),
    },
    {
      name: 'Order Confirmation',
      fn: () => sendOrderConfirmationEmail(TEST_EMAIL, TEST_NAME, 'ORD-TEST-001', [
        { item: 'Premium Plan', price: '₹999' },
        { item: 'Tax', price: '₹180' },
      ]),
    },
    {
      name: 'Notification',
      fn: () => sendNotificationEmail(
        TEST_EMAIL,
        TEST_NAME,
        'Test Notification',
        'This is a test notification message.',
        'https://insturix.com',
        'View Dashboard'
      ),
    },
    {
      name: 'Security Alert',
      fn: () => sendSecurityAlertEmail(
        TEST_EMAIL,
        TEST_NAME,
        'Test Security Alert',
        'This is a test security alert message.'
      ),
    },
  ];

  for (const test of tests) {
    console.log(`Testing: ${test.name}...`);
    const result = await test.fn();
    console.log(result.success ? `✅ ${test.name} sent` : `❌ ${test.name} failed: ${result.error}`);
    
    // Wait 1 second between emails to avoid rate limiting during tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✨ All templates tested! Check your inbox.');
}

testAllTemplates().catch(console.error);
```

Run:
```bash
npx tsx test-all-templates.ts
```

---

## Troubleshooting

### Issue: "AccessDenied" Error

**Solution**: Check AWS credentials:
```bash
# Verify credentials are in .env.local
cat .env.local | grep AWS

# Make sure they match your AWS IAM user credentials
```

### Issue: "Email address not verified" (Sandbox Mode)

**Solution**: 
1. Go to AWS SES Console
2. Click "Verified identities"
3. Add and verify recipient email addresses
4. OR request production access (removes sandbox restrictions)

### Issue: "Rate limit exceeded"

**Solution**: The rate limiter should prevent this, but if it happens:
- Wait a few seconds between test sends
- Check you're not exceeding 14 emails/second
- Monitor your daily quota (50,000/day)

### Issue: Emails going to spam

**Solution**:
- Set up SPF, DKIM, and DMARC records in your domain DNS
- Use a verified domain (not just email)
- Ensure content isn't spammy (avoid ALL CAPS, excessive links)
- Add plain text version (already included in templates)

### Issue: TypeScript errors

**Solution**:
```bash
# Reinstall dependencies
pnpm install

# Check for errors
pnpm build
```

---

## Testing Checklist

Use this checklist when testing:

### Pre-Test
- [ ] AWS credentials added to `.env.local`
- [ ] Region and from email configured
- [ ] SES verified identities confirmed
- [ ] Development server running (`pnpm dev`)

### Basic Tests
- [ ] Health check endpoint works
- [ ] Simple email sends successfully
- [ ] Email received in inbox (not spam)
- [ ] HTML renders correctly
- [ ] Plain text version looks good
- [ ] Links are clickable

### Template Tests
- [ ] Welcome email
- [ ] Verification email
- [ ] Password reset email
- [ ] Order confirmation email
- [ ] Notification email
- [ ] Security alert email

### Advanced Tests
- [ ] Multiple recipients (CC, BCC)
- [ ] Batch sending (multiple emails)
- [ ] Rate limiting (send 20+ rapidly)
- [ ] Error handling (invalid email)
- [ ] Retry logic (simulate failure)

### Mobile Tests
- [ ] Check email on mobile device
- [ ] Buttons are tappable
- [ ] Text is readable
- [ ] Images scale properly

---

## Monitoring in Production

### AWS SES Console Metrics

Check regularly:
1. **Delivery Rate**: Should be >98%
2. **Bounce Rate**: Should be <5%
3. **Complaint Rate**: Should be <0.1%
4. **Daily Sending Quota**: Track usage

### Add Logging in Your App

```typescript
import { sendEmail } from '@/lib/services/email';

const result = await sendEmail({
  to: 'user@example.com',
  subject: 'Test',
  htmlBody: '<h1>Test</h1>',
});

if (result.success) {
  // Log success to your monitoring service
  console.log('Email sent:', {
    messageId: result.messageId,
    recipient: 'user@example.com',
    timestamp: new Date(),
  });
} else {
  // Log failure for investigation
  console.error('Email failed:', {
    error: result.error,
    retriesUsed: result.retriesUsed,
    recipient: 'user@example.com',
    timestamp: new Date(),
  });
}
```

---

## Quick Test Commands (Copy & Paste)

### PowerShell Quick Test
```powershell
# 1. Start dev server
cd "d:\insturix\prod\Front-End"
pnpm dev

# 2. In another terminal, send test email
$body = @{to="your-email@example.com";subject="Test";htmlBody="<h1>Test</h1>"} | ConvertTo-Json
Invoke-WebRequest -Uri http://localhost:3000/api/email/send -Method POST -ContentType "application/json" -Body $body
```

### Test with Postman/Thunder Client

**Method**: POST  
**URL**: `http://localhost:3000/api/email/send`  
**Headers**: `Content-Type: application/json`  
**Body**:
```json
{
  "to": "your-email@example.com",
  "subject": "Test Email from Postman",
  "htmlBody": "<h1>Hello!</h1><p>Testing from Postman</p>",
  "textBody": "Hello! Testing from Postman"
}
```

---

**🎉 You're Ready to Test!**

Start with Method 1 (API test) - it's the fastest way to verify everything works. Then explore other methods as needed.
