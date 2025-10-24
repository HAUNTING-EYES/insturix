/**
 * Email Service Integration Examples
 * 
 * This file demonstrates common integration patterns for the email service
 * across different parts of the Insturix application.
 */

import { 
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendNotificationEmail,
  sendSecurityAlertEmail,
  sendEmail,
  sendBatchEmails,
} from '@/lib/services/email';

/**
 * Example 1: User Registration Flow
 * Send welcome email when user signs up
 */
export async function handleUserRegistration(userId: string, email: string, name: string) {
  try {
    // Send welcome email
    const result = await sendWelcomeEmail(email, name);
    
    if (result.success) {
      console.log(`Welcome email sent to ${email}`, result.messageId);
      
      // Optional: Save email log to database
      // await EmailLog.create({
      //   userId,
      //   type: 'welcome',
      //   recipient: email,
      //   messageId: result.messageId,
      //   sentAt: new Date(),
      // });
    } else {
      console.error(`Failed to send welcome email to ${email}:`, result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Error in handleUserRegistration:', error);
    throw error;
  }
}

/**
 * Example 2: Email Verification Flow
 * Send verification link after registration
 */
export async function handleEmailVerification(email: string, name: string, token: string) {
  const verificationLink = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`;
  
  const result = await sendVerificationEmail(email, name, verificationLink);
  
  if (!result.success) {
    console.error('Failed to send verification email:', result.error);
  }
  
  return result;
}

/**
 * Example 3: Password Reset Flow
 * Send password reset link
 */
export async function handlePasswordReset(email: string, name: string, resetToken: string) {
  const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}`;
  
  const result = await sendPasswordResetEmail(email, name, resetLink);
  
  return result;
}

/**
 * Example 4: Order/Payment Confirmation
 * Send order confirmation after successful payment
 */
export async function handleOrderConfirmation(
  email: string,
  name: string,
  orderId: string,
  orderItems: Array<{ name: string; price: number }>
) {
  // Format order details
  const orderDetails = orderItems.map(item => ({
    item: item.name,
    price: `₹${item.price.toLocaleString('en-IN')}`,
  }));
  
  const result = await sendOrderConfirmationEmail(
    email,
    name,
    orderId,
    orderDetails
  );
  
  return result;
}

/**
 * Example 5: Security Alert
 * Send alert when suspicious activity detected
 */
export async function handleSecurityAlert(
  email: string,
  name: string,
  eventType: 'new_login' | 'password_change' | 'email_change'
) {
  let alertType = '';
  let details = '';
  
  switch (eventType) {
    case 'new_login':
      alertType = 'New Login Detected';
      details = 'We detected a new login to your account. If this wasn\'t you, please secure your account immediately.';
      break;
    case 'password_change':
      alertType = 'Password Changed';
      details = 'Your password was recently changed. If you didn\'t make this change, please contact support immediately.';
      break;
    case 'email_change':
      alertType = 'Email Address Changed';
      details = 'Your email address was recently changed. If you didn\'t make this change, please contact support immediately.';
      break;
  }
  
  const result = await sendSecurityAlertEmail(email, name, alertType, details);
  
  return result;
}

/**
 * Example 6: Batch Notification to Multiple Users
 * Send announcement to all active users
 */
export async function sendAnnouncementToAllUsers(
  announcement: {
    title: string;
    message: string;
    actionUrl?: string;
    actionText?: string;
  }
) {
  try {
    // This example assumes you have User model with email field
    // Import your actual User model
    // import User from '@/schemas/UserSchema';
    // import connectToDatabase from '@/schemas/ConnectToDatabase';
    
    // await connectToDatabase();
    // const users = await User.find({ 
    //   emailVerified: true,
    //   unsubscribed: false 
    // }).select('email name');
    
    // For demonstration, using mock data
    const users = [
      { email: 'user1@example.com', name: 'User 1' },
      { email: 'user2@example.com', name: 'User 2' },
      // ... more users
    ];
    
    // Create email array
    const emails = users.map(user => ({
      to: user.email,
      subject: announcement.title,
      htmlBody: `
        <h1>${announcement.title}</h1>
        <p>Hi ${user.name},</p>
        <p>${announcement.message}</p>
        ${announcement.actionUrl ? `<a href="${announcement.actionUrl}">${announcement.actionText || 'Learn More'}</a>` : ''}
      `,
      textBody: `
        ${announcement.title}
        
        Hi ${user.name},
        
        ${announcement.message}
        
        ${announcement.actionUrl ? `${announcement.actionText || 'Learn More'}: ${announcement.actionUrl}` : ''}
      `,
    }));
    
    // Send in batches
    const results = await sendBatchEmails(emails, 10);
    
    const successCount = results.filter(r => r.success).length;
    console.log(`Announcement sent: ${successCount}/${users.length} successful`);
    
    return {
      total: users.length,
      successful: successCount,
      failed: users.length - successCount,
      results,
    };
  } catch (error) {
    console.error('Error sending batch announcement:', error);
    throw error;
  }
}

/**
 * Example 7: Custom Email with Rich Content
 * Send custom formatted email
 */
export async function sendCustomNotification(
  email: string,
  name: string,
  data: {
    subject: string;
    heading: string;
    content: string;
    callToAction?: {
      text: string;
      url: string;
    };
  }
) {
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background-color: #0066cc; 
          color: white; 
          text-decoration: none; 
          border-radius: 4px; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${data.heading}</h1>
        <p>Hi ${name},</p>
        <p>${data.content}</p>
        ${data.callToAction ? `<a href="${data.callToAction.url}" class="button">${data.callToAction.text}</a>` : ''}
      </div>
    </body>
    </html>
  `;
  
  const textBody = `
    ${data.heading}
    
    Hi ${name},
    
    ${data.content}
    
    ${data.callToAction ? `${data.callToAction.text}: ${data.callToAction.url}` : ''}
  `;
  
  const result = await sendEmail({
    to: email,
    subject: data.subject,
    htmlBody,
    textBody,
  });
  
  return result;
}

/**
 * Example 8: Scheduled Email Sending
 * Schedule email to be sent at specific time
 */
export async function scheduleEmail(
  emailParams: {
    to: string;
    subject: string;
    htmlBody: string;
    textBody?: string;
  },
  scheduledTime: Date
) {
  // This example shows integration with a job queue
  // You would need to implement actual job queue (Bull, AWS SQS, etc.)
  
  const delay = scheduledTime.getTime() - Date.now();
  
  if (delay <= 0) {
    // Send immediately if scheduled time is in the past
    return await sendEmail(emailParams);
  }
  
  // Example with setTimeout (not recommended for production)
  // Use proper job queue like Bull or AWS SQS
  setTimeout(async () => {
    await sendEmail(emailParams);
  }, delay);
  
  return { 
    success: true, 
    message: `Email scheduled for ${scheduledTime.toISOString()}` 
  };
}

/**
 * Example 9: Integration with API Route
 * How to call from an API endpoint
 */
/*
// In app/api/user/register/route.ts
import { handleUserRegistration } from '@/lib/services/email/examples';

export async function POST(request: NextRequest) {
  const { email, name } = await request.json();
  
  // Create user in database
  const user = await createUser(email, name);
  
  // Send welcome email (non-blocking)
  handleUserRegistration(user.id, email, name)
    .catch(error => console.error('Email send failed:', error));
  
  return NextResponse.json({ success: true });
}
*/

/**
 * Example 10: Email with Attachment Support
 * Note: Current implementation doesn't support attachments
 * For attachments, use SES SendRawEmail API
 */
// This would require extending the ses-client.ts to support SendRawEmail
// and building MIME messages with attachments

/**
 * Example 11: A/B Testing Email Content
 * Send different versions to test effectiveness
 */
export async function sendABTestEmail(
  recipients: Array<{ email: string; name: string }>,
  variantA: { subject: string; body: string },
  variantB: { subject: string; body: string }
) {
  const emails = recipients.map((recipient, index) => {
    // Alternate between variants
    const variant = index % 2 === 0 ? variantA : variantB;
    
    return {
      to: recipient.email,
      subject: variant.subject,
      htmlBody: variant.body,
    };
  });
  
  const results = await sendBatchEmails(emails);
  
  return results;
}
