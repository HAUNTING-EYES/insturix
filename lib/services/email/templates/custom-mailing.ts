/**
 * Custom Mailing Templates
 * Simple text-based templates for admin-defined messages
 * Supports two types: regular users and ICS25 attendees
 */

interface CustomMailingContent {
  html: string;
  text: string;
  subject: string;
}

/**
 * Process simple formatting in text
 * Handles native HTML from contentEditable and converts browser-specific tags to clean HTML
 */
function formatTextToHtml(text: string): string {
  let formatted = text;
  
  // Normalize browser-specific tags
  formatted = formatted.replace(/<b>/gi, '<strong>').replace(/<\/b>/gi, '</strong>');
  formatted = formatted.replace(/<i>/gi, '<em>').replace(/<\/i>/gi, '</em>');
  
  // Clean up font tags from execCommand('fontSize')
  formatted = formatted.replace(/<font size="5">(.+?)<\/font>/gi, '<span style="font-size: 18px; font-weight: 500;">$1</span>');
  formatted = formatted.replace(/<font size="2">(.+?)<\/font>/gi, '<span style="font-size: 12px;">$1</span>');
  formatted = formatted.replace(/<font size="3">(.+?)<\/font>/gi, '$1');
  
  // Handle legacy markdown syntax (fallback for backwards compatibility)
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/__(.+?)__/g, '<u>$1</u>');
  formatted = formatted.replace(/\[LARGE\](.+?)\[\/LARGE\]/g, '<span style="font-size: 18px; font-weight: 500;">$1</span>');
  formatted = formatted.replace(/\[SMALL\](.+?)\[\/SMALL\]/g, '<span style="font-size: 12px;">$1</span>');
  
  // Add styling to ul/li if they don't have it
  formatted = formatted.replace(/<ul>/gi, '<ul style="margin: 10px 0; padding-left: 20px;">');
  formatted = formatted.replace(/<li>/gi, '<li style="margin: 5px 0;">');
  
  // Convert line breaks to <br> if not already HTML
  if (!formatted.includes('<')) {
    formatted = formatted.replace(/\n/g, '<br>');
  }
  
  return formatted;
}

/**
 * Custom mailing template for regular users
 * @param userName - User's name
 * @param customText - Admin-provided message text
 * @param subject - Email subject line
 * @returns Email content with HTML and plain text versions
 */
export function customUserMailingTemplate(
  userName: string,
  customText: string,
  subject: string
): CustomMailingContent {
  // Process formatting for HTML
  const formattedText = formatTextToHtml(customText);
  
  // Create simple HTML version with basic styling
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #000; margin-bottom: 20px;">Hi ${userName},</h1>
    
    <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #000; margin: 20px 0;">
      <div style="margin: 0; white-space: pre-wrap; word-wrap: break-word;">${formattedText}</div>
    </div>
    
    <p style="margin-top: 30px; color: #666; font-size: 12px;">
      Best regards,<br>
      <strong>Insturix Team</strong>
    </p>
  </div>
</body>
</html>
  `.trim();

  // Plain text version
  const text = `Hi ${userName},

${customText}

Best regards,
Insturix Team`;

  return {
    html,
    text,
    subject,
  };
}

/**
 * Custom mailing template for ICS25 attendees
 * @param userName - User's name
 * @param customText - Admin-provided message text
 * @param subject - Email subject line
 * @returns Email content with HTML and plain text versions
 */
export function customIcs25MailingTemplate(
  userName: string,
  customText: string,
  subject: string
): CustomMailingContent {
  // Process formatting for HTML
  const formattedText = formatTextToHtml(customText);
  
  // Create simple HTML version with ICS25 theme (slightly different styling)
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #000; border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
      ICS'25 - Insturix Creator's Summit
    </h2>
    
    <h3 style="color: #000; margin-top: 0;">Hi ${userName},</h3>
    
    <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #000; margin: 20px 0;">
      <div style="margin: 0; white-space: pre-wrap; word-wrap: break-word;">${formattedText}</div>
    </div>
    
    <p style="margin-top: 30px; color: #666; font-size: 12px;">
      See you at ICS'25!<br>
      <strong>Insturix Team</strong>
    </p>
  </div>
</body>
</html>
  `.trim();

  // Plain text version
  const text = `ICS'25 - Insturix Creator's Summit

Hi ${userName},

${customText}

See you at ICS'25!
Insturix Team`;

  return {
    html,
    text,
    subject,
  };
}
