/**
 * Email Templates for Transactional Emails
 * 
 * Reusable HTML email templates for common Insturix transactional emails
 * Templates follow email best practices:
 * - Mobile-responsive design
 * - Plain text fallback support
 * - Accessible HTML structure
 * - Professional branding
 */

/**
 * Base email wrapper with Insturix branding
 */
export function emailWrapper(content: string, preheader?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Insturix</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f5f5f5;
      color: #333333;
      line-height: 1.6;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .email-header {
      background-color: #1a1a1a;
      padding: 30px 20px;
      text-align: center;
    }
    .email-logo {
      color: #ffffff;
      font-size: 28px;
      font-weight: bold;
      text-decoration: none;
    }
    .email-body {
      padding: 40px 20px;
    }
    .email-footer {
      background-color: #f5f5f5;
      padding: 30px 20px;
      text-align: center;
      font-size: 12px;
      color: #666666;
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background-color: #0066cc;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
    }
    .button:hover {
      background-color: #0052a3;
    }
    @media only screen and (max-width: 600px) {
      .email-body {
        padding: 30px 15px;
      }
    }
  </style>
</head>
<body>
  ${preheader ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>` : ''}
  <div class="email-container">
    <div class="email-header">
      <a href="https://insturix.com" class="email-logo">Insturix</a>
    </div>
    <div class="email-body">
      ${content}
    </div>
    <div class="email-footer">
      <p>© ${new Date().getFullYear()} Insturix. All rights reserved.</p>
      <p>This is an automated message, please do not reply to this email.</p>
      <p>
        <a href="https://insturix.com" style="color: #0066cc; text-decoration: none;">Visit Website</a> | 
        <a href="https://insturix.com/legal/privacy" style="color: #0066cc; text-decoration: none;">Privacy Policy</a> | 
        <a href="https://insturix.com/contactus" style="color: #0066cc; text-decoration: none;">Contact Us</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Welcome email template
 */
export function welcomeEmail(userName: string): { html: string; text: string } {
  const html = emailWrapper(
    `
      <h1 style="color: #1a1a1a; margin-bottom: 20px;">Welcome to Insturix!</h1>
      <p>Hi ${userName},</p>
      <p>Thank you for joining Insturix! We're excited to have you on board.</p>
      <p>Your account has been successfully created. You can now access all our features and start your journey with us.</p>
      <a href="https://insturix.com/dashboard" class="button">Go to Dashboard</a>
      <p>If you have any questions or need assistance, feel free to reach out to our support team.</p>
      <p>Best regards,<br>The Insturix Team</p>
    `,
    'Welcome to Insturix - Get started today!'
  );

  const text = `
Welcome to Insturix!

Hi ${userName},

Thank you for joining Insturix! We're excited to have you on board.

Your account has been successfully created. You can now access all our features and start your journey with us.

Visit your dashboard: https://insturix.com/dashboard

If you have any questions or need assistance, feel free to reach out to our support team.

Best regards,
The Insturix Team

---
© ${new Date().getFullYear()} Insturix. All rights reserved.
This is an automated message, please do not reply to this email.
  `.trim();

  return { html, text };
}

/**
 * Email verification template
 */
export function verificationEmail(userName: string, verificationLink: string): { html: string; text: string } {
  const html = emailWrapper(
    `
      <h1 style="color: #1a1a1a; margin-bottom: 20px;">Verify Your Email Address</h1>
      <p>Hi ${userName},</p>
      <p>Thank you for signing up with Insturix! To complete your registration, please verify your email address by clicking the button below.</p>
      <a href="${verificationLink}" class="button">Verify Email Address</a>
      <p>This verification link will expire in 24 hours.</p>
      <p>If you didn't create an account with Insturix, you can safely ignore this email.</p>
      <p>Best regards,<br>The Insturix Team</p>
    `,
    'Verify your email address to get started'
  );

  const text = `
Verify Your Email Address

Hi ${userName},

Thank you for signing up with Insturix! To complete your registration, please verify your email address by visiting the link below.

Verification link: ${verificationLink}

This verification link will expire in 24 hours.

If you didn't create an account with Insturix, you can safely ignore this email.

Best regards,
The Insturix Team

---
© ${new Date().getFullYear()} Insturix. All rights reserved.
This is an automated message, please do not reply to this email.
  `.trim();

  return { html, text };
}

/**
 * Password reset template
 */
export function passwordResetEmail(userName: string, resetLink: string): { html: string; text: string } {
  const html = emailWrapper(
    `
      <h1 style="color: #1a1a1a; margin-bottom: 20px;">Reset Your Password</h1>
      <p>Hi ${userName},</p>
      <p>We received a request to reset your password for your Insturix account. Click the button below to create a new password.</p>
      <a href="${resetLink}" class="button">Reset Password</a>
      <p>This password reset link will expire in 1 hour for security reasons.</p>
      <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
      <p>Best regards,<br>The Insturix Team</p>
    `,
    'Reset your Insturix password'
  );

  const text = `
Reset Your Password

Hi ${userName},

We received a request to reset your password for your Insturix account. Visit the link below to create a new password.

Reset link: ${resetLink}

This password reset link will expire in 1 hour for security reasons.

If you didn't request a password reset, please ignore this email. Your password will remain unchanged.

Best regards,
The Insturix Team

---
© ${new Date().getFullYear()} Insturix. All rights reserved.
This is an automated message, please do not reply to this email.
  `.trim();

  return { html, text };
}

/**
 * Order confirmation template
 */
export function orderConfirmationEmail(
  userName: string,
  orderNumber: string,
  orderDetails: { item: string; price: string }[]
): { html: string; text: string } {
  const itemsHtml = orderDetails
    .map(
      item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eeeeee;">${item.item}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eeeeee; text-align: right;">${item.price}</td>
      </tr>
    `
    )
    .join('');

  const itemsText = orderDetails
    .map(item => `${item.item} - ${item.price}`)
    .join('\n');

  const html = emailWrapper(
    `
      <h1 style="color: #1a1a1a; margin-bottom: 20px;">Order Confirmation</h1>
      <p>Hi ${userName},</p>
      <p>Thank you for your purchase! Your order has been confirmed.</p>
      <p><strong>Order Number:</strong> ${orderNumber}</p>
      <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th style="padding: 10px; text-align: left;">Item</th>
            <th style="padding: 10px; text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      <a href="https://insturix.com/dashboard" class="button">View Order Details</a>
      <p>We'll send you another email when your order is ready.</p>
      <p>Best regards,<br>The Insturix Team</p>
    `,
    `Order #${orderNumber} confirmed - Thank you for your purchase!`
  );

  const text = `
Order Confirmation

Hi ${userName},

Thank you for your purchase! Your order has been confirmed.

Order Number: ${orderNumber}

Order Details:
${itemsText}

View your order: https://insturix.com/dashboard

We'll send you another email when your order is ready.

Best regards,
The Insturix Team

---
© ${new Date().getFullYear()} Insturix. All rights reserved.
This is an automated message, please do not reply to this email.
  `.trim();

  return { html, text };
}

/**
 * Generic notification template
 */
export function notificationEmail(
  userName: string,
  title: string,
  message: string,
  actionUrl?: string,
  actionText?: string
): { html: string; text: string } {
  const html = emailWrapper(
    `
      <h1 style="color: #1a1a1a; margin-bottom: 20px;">${title}</h1>
      <p>Hi ${userName},</p>
      <p>${message}</p>
      ${actionUrl && actionText ? `<a href="${actionUrl}" class="button">${actionText}</a>` : ''}
      <p>Best regards,<br>The Insturix Team</p>
    `,
    title
  );

  const text = `
${title}

Hi ${userName},

${message}

${actionUrl && actionText ? `${actionText}: ${actionUrl}` : ''}

Best regards,
The Insturix Team

---
© ${new Date().getFullYear()} Insturix. All rights reserved.
This is an automated message, please do not reply to this email.
  `.trim();

  return { html, text };
}

/**
 * Account security alert template
 */
export function securityAlertEmail(
  userName: string,
  alertType: string,
  details: string
): { html: string; text: string } {
  const html = emailWrapper(
    `
      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px;">
        <strong>⚠️ Security Alert</strong>
      </div>
      <h1 style="color: #1a1a1a; margin-bottom: 20px;">${alertType}</h1>
      <p>Hi ${userName},</p>
      <p>${details}</p>
      <p>If this was you, you can safely ignore this email. If you didn't perform this action, please secure your account immediately.</p>
      <a href="https://insturix.com/dashboard/security" class="button">Review Security Settings</a>
      <p>For your security, we recommend:</p>
      <ul>
        <li>Using a strong, unique password</li>
        <li>Enabling two-factor authentication</li>
        <li>Regularly reviewing your account activity</li>
      </ul>
      <p>Best regards,<br>The Insturix Team</p>
    `,
    `Security Alert: ${alertType}`
  );

  const text = `
⚠️ SECURITY ALERT

${alertType}

Hi ${userName},

${details}

If this was you, you can safely ignore this email. If you didn't perform this action, please secure your account immediately.

Review your security settings: https://insturix.com/dashboard/security

For your security, we recommend:
- Using a strong, unique password
- Enabling two-factor authentication
- Regularly reviewing your account activity

Best regards,
The Insturix Team

---
© ${new Date().getFullYear()} Insturix. All rights reserved.
This is an automated message, please do not reply to this email.
  `.trim();

  return { html, text };
}
