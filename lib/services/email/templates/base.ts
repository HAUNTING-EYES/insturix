export interface BaseTemplateOptions {
  body: string;
  preheader?: string;
  title?: string;
}

export function renderBaseTemplate({ body, preheader, title = 'Insturix' }: BaseTemplateOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #222222; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background-color: #111827; color: #ffffff; padding: 32px 24px; text-align: center; font-size: 24px; font-weight: 600; letter-spacing: 0.5px; }
    .content { padding: 40px 24px; }
    .footer { padding: 24px; font-size: 12px; color: #6b7280; text-align: center; background-color: #f9fafb; }
    .button { display: inline-block; padding: 14px 28px; background-color: #2563eb; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .button:hover { background-color: #1d4ed8; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 12px; }
    th { background-color: #f3f4f6; font-weight: 600; }
    @media (max-width: 600px) {
      .content { padding: 32px 16px; }
    }
  </style>
</head>
<body>
  ${preheader ? `<span style="display:none;font-size:1px;color:#f5f5f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${preheader}</span>` : ''}
  <div class="container">
    <div class="header">Insturix</div>
    <div class="content">${body}</div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Insturix. All rights reserved.</p>
      <p>This email was sent automatically. Replies are not monitored.</p>
      <p>
        <a href="https://insturix.com" style="color: #2563eb; text-decoration: none;">Website</a> |
        <a href="https://insturix.com/legal/privacy" style="color: #2563eb; text-decoration: none;">Privacy</a> |
        <a href="https://insturix.com/contactus" style="color: #2563eb; text-decoration: none;">Support</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
