# Email Customization Guide

## 🎨 How to Customize Email Templates

### Method 1: Modify Existing Templates (Recommended for consistent look)

The email templates are in `lib/services/email/templates.ts`. Each template returns both HTML and plain text versions.

#### Example: Customize Welcome Email

**File**: `lib/services/email/templates.ts`

Find the `welcomeEmail` function and modify the content:

```typescript
export function welcomeEmail(userName: string): { html: string; text: string } {
  const html = emailWrapper(
    `
      <h1 style="color: #1a1a1a; margin-bottom: 20px;">Welcome to Insturix! 🎉</h1>
      <p>Hi ${userName},</p>
      
      <!-- CUSTOMIZE THIS SECTION -->
      <p>We're thrilled to have you join our community! Here's what you can do next:</p>
      <ul style="line-height: 1.8;">
        <li>Complete your profile</li>
        <li>Explore our features</li>
        <li>Join our community forum</li>
      </ul>
      
      <p style="background-color: #f0f9ff; padding: 15px; border-left: 4px solid #0066cc; margin: 20px 0;">
        <strong>Pro Tip:</strong> Check out our getting started guide to make the most of Insturix!
      </p>
      <!-- END CUSTOMIZATION -->
      
      <a href="https://insturix.com/dashboard" class="button">Go to Dashboard</a>
      <p>If you have any questions, feel free to reach out to our support team.</p>
      <p>Best regards,<br>The Insturix Team</p>
    `,
    'Welcome to Insturix - Get started today!'
  );

  const text = `
Welcome to Insturix! 🎉

Hi ${userName},

We're thrilled to have you join our community! Here's what you can do next:

- Complete your profile
- Explore our features
- Join our community forum

Pro Tip: Check out our getting started guide to make the most of Insturix!

Visit your dashboard: https://insturix.com/dashboard

Best regards,
The Insturix Team
  `.trim();

  return { html, text };
}
```

#### Styling Tips for HTML Emails

```html
<!-- Add colored boxes -->
<div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <p>Your highlighted content here</p>
</div>

<!-- Add images -->
<img src="https://insturix.com/images/feature.png" 
     alt="Feature" 
     style="max-width: 100%; height: auto; margin: 20px 0;" />

<!-- Add multiple buttons -->
<a href="https://insturix.com/action1" class="button">Primary Action</a>
<a href="https://insturix.com/action2" 
   style="display: inline-block; padding: 14px 28px; background-color: #6c757d; color: #ffffff; text-decoration: none; border-radius: 6px; margin: 20px 10px 20px 0;">
  Secondary Action
</a>

<!-- Add tables for structured data -->
<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <tr>
    <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;"><strong>Item</strong></td>
    <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;"><strong>Value</strong></td>
  </tr>
  <tr>
    <td style="padding: 10px;">Plan Name</td>
    <td style="padding: 10px;">Premium</td>
  </tr>
</table>
```

---

### Method 2: Create New Custom Templates

Add a new template function to `templates.ts`:

```typescript
/**
 * Custom feature announcement template
 */
export function featureAnnouncementEmail(
  userName: string,
  featureName: string,
  featureDescription: string,
  featureImage?: string
): { html: string; text: string } {
  const html = emailWrapper(
    `
      <h1 style="color: #1a1a1a; margin-bottom: 20px;">🚀 New Feature: ${featureName}</h1>
      <p>Hi ${userName},</p>
      
      ${featureImage ? `<img src="${featureImage}" alt="${featureName}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0;" />` : ''}
      
      <p>${featureDescription}</p>
      
      <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Why you'll love it:</h3>
        <ul style="line-height: 1.8;">
          <li>Faster performance</li>
          <li>Better user experience</li>
          <li>More control and flexibility</li>
        </ul>
      </div>
      
      <a href="https://insturix.com/features/${featureName.toLowerCase()}" class="button">Try It Now</a>
      
      <p>As always, we'd love to hear your feedback!</p>
      <p>Best regards,<br>The Insturix Team</p>
    `,
    `New Feature: ${featureName}`
  );

  const text = `
🚀 New Feature: ${featureName}

Hi ${userName},

${featureDescription}

Why you'll love it:
- Faster performance
- Better user experience
- More control and flexibility

Try it now: https://insturix.com/features/${featureName.toLowerCase()}

As always, we'd love to hear your feedback!

Best regards,
The Insturix Team
  `.trim();

  return { html, text };
}
```

Then add a helper function in `helpers.ts`:

```typescript
export async function sendFeatureAnnouncementEmail(
  to: string,
  userName: string,
  featureName: string,
  featureDescription: string,
  featureImage?: string
) {
  const { html, text } = featureAnnouncementEmail(userName, featureName, featureDescription, featureImage);
  
  return await sendEmail({
    to,
    subject: `🚀 New Feature: ${featureName}`,
    htmlBody: html,
    textBody: text,
  });
}
```

And export it in `index.ts`:

```typescript
export { sendFeatureAnnouncementEmail } from './helpers';
export { featureAnnouncementEmail } from './templates';
```

---

### Method 3: Customize the Email Wrapper (Brand Styling)

The base wrapper is in `templates.ts` - customize colors, fonts, logo, footer:

```typescript
export function emailWrapper(content: string, preheader?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); /* CUSTOMIZE GRADIENT */
      padding: 30px 20px;
      text-align: center;
    }
    .email-logo {
      color: #ffffff;
      font-size: 32px; /* CUSTOMIZE SIZE */
      font-weight: bold;
      text-decoration: none;
      letter-spacing: 1px; /* ADD SPACING */
    }
    .email-body {
      padding: 40px 20px;
    }
    .email-footer {
      background-color: #1a1a1a; /* CUSTOMIZE FOOTER COLOR */
      padding: 30px 20px;
      text-align: center;
      font-size: 12px;
      color: #cccccc; /* CUSTOMIZE TEXT COLOR */
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background-color: #667eea; /* CUSTOMIZE BUTTON COLOR */
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
    }
    .button:hover {
      background-color: #5568d3; /* CUSTOMIZE HOVER COLOR */
    }
  </style>
</head>
<body>
  ${preheader ? `<div style="display:none;">${preheader}</div>` : ''}
  <div class="email-container">
    <div class="email-header">
      <!-- OPTION 1: Text Logo -->
      <a href="https://insturix.com" class="email-logo">INSTURIX</a>
      
      <!-- OPTION 2: Image Logo (uncomment to use) -->
      <!-- <a href="https://insturix.com">
        <img src="https://insturix.com/logo-white.png" alt="Insturix" style="height: 40px;" />
      </a> -->
    </div>
    <div class="email-body">
      ${content}
    </div>
    <div class="email-footer">
      <p style="margin-bottom: 15px;">
        <strong>Insturix</strong><br>
        Building the future of education
      </p>
      <p style="margin: 10px 0;">
        <a href="https://insturix.com" style="color: #667eea; text-decoration: none;">Website</a> | 
        <a href="https://insturix.com/blog" style="color: #667eea; text-decoration: none;">Blog</a> | 
        <a href="https://insturix.com/legal/privacy" style="color: #667eea; text-decoration: none;">Privacy</a> | 
        <a href="https://insturix.com/contactus" style="color: #667eea; text-decoration: none;">Contact</a>
      </p>
      <p style="margin-top: 15px; color: #999999;">
        © ${new Date().getFullYear()} Insturix. All rights reserved.<br>
        This is an automated message from no-reply@insturix.com
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
```

---

### Method 4: One-Off Custom Emails (No Template)

For unique emails, use `sendEmail` directly:

```typescript
import { sendEmail } from '@/lib/services/email';

await sendEmail({
  to: 'user@example.com',
  subject: 'Your Custom Subject',
  htmlBody: `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
      <h1>Your Custom Email</h1>
      <p>Complete custom HTML here...</p>
      <a href="https://insturix.com" style="color: #0066cc;">Click here</a>
    </body>
    </html>
  `,
  textBody: 'Your Custom Email\n\nComplete custom text here...',
});
```

---

### Method 5: Dynamic Content with Variables

Pass data to templates:

```typescript
// In your API route or function
import { notificationEmail } from '@/lib/services/email';

const userName = user.name;
const courseName = 'Web Development';
const progress = 75;

const { html, text } = notificationEmail(
  userName,
  'Course Progress Update',
  `You've completed ${progress}% of ${courseName}! Keep up the great work. Just ${100 - progress}% more to go!`,
  `https://insturix.com/courses/${courseId}`,
  'Continue Learning'
);

await sendEmail({
  to: user.email,
  subject: `Course Progress Update - ${courseName}`,
  htmlBody: html,
  textBody: text,
});
```

---

## 🔄 Common Customization Scenarios

### Add Your Logo
Replace text logo in `emailWrapper` with image:
```html
<img src="https://insturix.com/email-logo.png" alt="Insturix" style="height: 50px;" />
```

### Change Brand Colors
Update these in `emailWrapper`:
- Header background: `.email-header { background-color: #YOUR_COLOR; }`
- Button color: `.button { background-color: #YOUR_COLOR; }`
- Link colors: `color: #YOUR_COLOR;`

### Add Social Media Links
In the footer section:
```html
<p style="margin: 20px 0;">
  <a href="https://twitter.com/insturix" style="margin: 0 10px;">
    <img src="https://insturix.com/icons/twitter.png" alt="Twitter" style="height: 24px;" />
  </a>
  <a href="https://linkedin.com/company/insturix" style="margin: 0 10px;">
    <img src="https://insturix.com/icons/linkedin.png" alt="LinkedIn" style="height: 24px;" />
  </a>
</p>
```

### Add Unsubscribe Link (for bulk emails)
```html
<p style="font-size: 11px; color: #999999;">
  Don't want to receive these emails? 
  <a href="https://insturix.com/unsubscribe?email={{email}}" style="color: #999999;">Unsubscribe</a>
</p>
```

---

## 💡 Best Practices

1. **Always include plain text version** - Some email clients prefer text
2. **Test on multiple devices** - Mobile, desktop, different email clients
3. **Keep emails under 102KB** - Gmail clips larger emails
4. **Use inline CSS** - Better email client compatibility
5. **Alt text for images** - Accessibility and when images don't load
6. **Call-to-action buttons** - Make them obvious and clickable
7. **Preview text** - First line appears in email preview (use preheader)
8. **Responsive design** - Use media queries for mobile

---

## 📝 Template Checklist

When creating/modifying templates:
- [ ] HTML version created
- [ ] Plain text version created
- [ ] Tested on desktop email client
- [ ] Tested on mobile email client
- [ ] Links are working
- [ ] Images load correctly (or have alt text)
- [ ] Brand colors consistent
- [ ] Preheader text set
- [ ] Unsubscribe link (if needed)
- [ ] Grammar and spelling checked

---

## 🎯 Quick Template Modification Examples

### Example 1: Add Welcome Discount Code
```typescript
const html = emailWrapper(`
  <h1>Welcome to Insturix! 🎉</h1>
  <p>Hi ${userName},</p>
  <p>As a welcome gift, here's a special discount code:</p>
  <div style="background: #f0f9ff; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
    <h2 style="margin: 0; color: #0066cc; font-size: 32px; letter-spacing: 2px;">WELCOME20</h2>
    <p style="margin: 10px 0 0 0; color: #666;">20% off your first purchase</p>
  </div>
  <a href="https://insturix.com/shop" class="button">Start Shopping</a>
`);
```

### Example 2: Add Progress Bar
```typescript
const progressPercent = 65;
const html = emailWrapper(`
  <h1>Course Progress Update</h1>
  <p>Hi ${userName},</p>
  <p>You're ${progressPercent}% through the course!</p>
  <div style="background: #e0e0e0; height: 30px; border-radius: 15px; overflow: hidden; margin: 20px 0;">
    <div style="background: linear-gradient(90deg, #667eea, #764ba2); width: ${progressPercent}%; height: 100%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
      ${progressPercent}%
    </div>
  </div>
`);
```

### Example 3: Add Testimonial
```typescript
const html = emailWrapper(`
  <h1>Join Thousands of Happy Users!</h1>
  <div style="background: #f9f9f9; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; font-style: italic;">
    <p>"Insturix transformed how I learn. The platform is intuitive and the content is top-notch!"</p>
    <p style="margin-top: 10px; font-style: normal;"><strong>- Sarah J.</strong>, Premium Member</p>
  </div>
`);
```

---

After making changes, always test with the test suite to ensure everything works!
