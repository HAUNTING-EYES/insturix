/**
 * Email Service Test Suite
 * 
 * Run these tests to verify AWS SES integration
 * 
 * Usage:
 * 1. Set AWS credentials in .env.local
 * 2. Update TEST_EMAIL to your email address
 * 3. Run: node --env-file=.env.local lib/services/email/test.ts
 *    OR use the Next.js dev environment
 */

import { 
  sendEmail, 
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendNotificationEmail,
  sendSecurityAlertEmail,
  verifySESConfiguration,
  sendBatchEmails,
} from './index';

// ⚠️ CHANGE THIS TO YOUR EMAIL FOR TESTING
const TEST_EMAIL = 'your-email@example.com';
const TEST_NAME = 'Test User';

/**
 * Test Results Interface
 */
interface TestResult {
  test: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

const results: TestResult[] = [];

/**
 * Run a test and log result
 */
async function runTest(
  testName: string, 
  testFunction: () => Promise<any>
): Promise<void> {
  console.log(`\n🧪 Running: ${testName}`);
  try {
    const result = await testFunction();
    
    if (result.success) {
      console.log(`✅ PASSED: ${testName}`);
      results.push({ 
        test: testName, 
        success: true, 
        messageId: result.messageId 
      });
    } else {
      console.log(`❌ FAILED: ${testName}`);
      console.error(`   Error: ${result.error}`);
      results.push({ 
        test: testName, 
        success: false, 
        error: result.error 
      });
    }
  } catch (error: any) {
    console.log(`❌ FAILED: ${testName}`);
    console.error(`   Error: ${error.message}`);
    results.push({ 
      test: testName, 
      success: false, 
      error: error.message 
    });
  }
}

/**
 * Print test summary
 */
function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed Tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.test}: ${r.error}`);
    });
  }
  
  console.log('='.repeat(60));
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('🚀 Starting Email Service Tests');
  console.log(`📧 Test emails will be sent to: ${TEST_EMAIL}`);
  console.log('⚠️  Make sure AWS credentials are set in environment variables\n');
  
  // Test 1: Configuration Verification
  await runTest('Configuration Verification', async () => {
    const isValid = await verifySESConfiguration();
    return { success: isValid };
  });
  
  // Test 2: Simple Email Send
  await runTest('Simple Email Send', async () => {
    return await sendEmail({
      to: TEST_EMAIL,
      subject: 'Test Email - Simple Send',
      htmlBody: '<h1>Test Email</h1><p>This is a test email from Insturix SES service.</p>',
      textBody: 'Test Email\n\nThis is a test email from Insturix SES service.',
    });
  });
  
  // Test 3: Welcome Email Template
  await runTest('Welcome Email Template', async () => {
    return await sendWelcomeEmail(TEST_EMAIL, TEST_NAME);
  });
  
  // Test 4: Verification Email Template
  await runTest('Verification Email Template', async () => {
    return await sendVerificationEmail(
      TEST_EMAIL, 
      TEST_NAME, 
      'https://insturix.com/verify?token=test123'
    );
  });
  
  // Test 5: Password Reset Template
  await runTest('Password Reset Template', async () => {
    return await sendPasswordResetEmail(
      TEST_EMAIL, 
      TEST_NAME, 
      'https://insturix.com/reset?token=test456'
    );
  });
  
  // Test 6: Order Confirmation Template
  await runTest('Order Confirmation Template', async () => {
    return await sendOrderConfirmationEmail(
      TEST_EMAIL,
      TEST_NAME,
      'ORD-TEST-001',
      [
        { item: 'Premium Plan', price: '₹999' },
        { item: 'Add-on Feature', price: '₹299' },
      ]
    );
  });
  
  // Test 7: Notification Email Template
  await runTest('Notification Email Template', async () => {
    return await sendNotificationEmail(
      TEST_EMAIL,
      TEST_NAME,
      'Test Notification',
      'This is a test notification from the email service.',
      'https://insturix.com/dashboard',
      'View Dashboard'
    );
  });
  
  // Test 8: Security Alert Template
  await runTest('Security Alert Template', async () => {
    return await sendSecurityAlertEmail(
      TEST_EMAIL,
      TEST_NAME,
      'Test Security Alert',
      'This is a test security alert. If this was you, you can safely ignore this email.'
    );
  });
  
  // Test 9: Email with CC and Reply-To
  await runTest('Email with CC and Reply-To', async () => {
    return await sendEmail({
      to: TEST_EMAIL,
      subject: 'Test Email - CC and Reply-To',
      htmlBody: '<h1>Test</h1><p>Testing CC and Reply-To functionality.</p>',
      textBody: 'Testing CC and Reply-To functionality.',
      replyTo: 'support@insturix.com',
      // Note: Be careful with CC in tests, comment out if you don't want copies
      // cc: ['another-email@example.com'],
    });
  });
  
  // Test 10: Batch Email Send (Small Batch)
  await runTest('Batch Email Send', async () => {
    const emails = [
      {
        to: TEST_EMAIL,
        subject: 'Batch Test Email 1',
        htmlBody: '<h1>Batch Email 1</h1><p>First email in batch.</p>',
        textBody: 'Batch Email 1 - First email in batch.',
      },
      {
        to: TEST_EMAIL,
        subject: 'Batch Test Email 2',
        htmlBody: '<h1>Batch Email 2</h1><p>Second email in batch.</p>',
        textBody: 'Batch Email 2 - Second email in batch.',
      },
    ];
    
    const results = await sendBatchEmails(emails, 2);
    const allSuccessful = results.every(r => r.success);
    
    return { 
      success: allSuccessful,
      messageId: results.map(r => r.messageId).join(', '),
    };
  });
  
  // Test 11: Rate Limiting (Multiple Rapid Sends)
  await runTest('Rate Limiting Test', async () => {
    console.log('   Sending 5 emails rapidly to test rate limiter...');
    
    const promises = Array.from({ length: 5 }, (_, i) => 
      sendEmail({
        to: TEST_EMAIL,
        subject: `Rate Limit Test ${i + 1}`,
        htmlBody: `<h1>Rate Limit Test ${i + 1}</h1>`,
        textBody: `Rate Limit Test ${i + 1}`,
      })
    );
    
    const results = await Promise.all(promises);
    const allSuccessful = results.every(r => r.success);
    
    console.log(`   All 5 emails sent: ${allSuccessful ? 'Yes' : 'No'}`);
    
    return { success: allSuccessful };
  });
  
  // Print summary
  printSummary();
}

/**
 * Individual test functions for manual testing
 */

export async function testConfiguration() {
  console.log('Testing SES Configuration...');
  const isValid = await verifySESConfiguration();
  console.log('Configuration valid:', isValid);
  return isValid;
}

export async function testSimpleEmail(to?: string) {
  console.log('Testing simple email send...');
  const result = await sendEmail({
    to: to || TEST_EMAIL,
    subject: 'Test Email from Insturix',
    htmlBody: '<h1>Hello!</h1><p>This is a test email.</p>',
    textBody: 'Hello! This is a test email.',
  });
  console.log('Result:', result);
  return result;
}

export async function testWelcomeEmail(to?: string) {
  console.log('Testing welcome email...');
  const result = await sendWelcomeEmail(to || TEST_EMAIL, 'Test User');
  console.log('Result:', result);
  return result;
}

// Export test runner
export { runAllTests };

// Auto-run if executed directly
if (require.main === module) {
  runAllTests()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}
