export function promotionalEmailTemplate(
  name?: string,
  registrationLink?: string
): { html: string; text: string } {
  const _safeName = name || 'Valued User';
  const registerUrl = registrationLink ?? 'https://www.insturix.com/ics25';

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Insturix Creator’s Summit 2025</title>
  </head>
  <body style="margin:0; padding:0; background:#f4f4f4; font-family:Arial, Helvetica, sans-serif;">

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f4;">
      <tr>
        <td align="center" style="padding:20px 0;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">
            
            <!-- Header Image -->
            <tr>
              <td align="center">
                <img src="https://insturix-email-assets.s3.ap-south-1.amazonaws.com/promotional_images/fa66b731e665681dd7bc759411d184c0.png"
                     alt="Insturix Creator's Summit"
                     style="width:100%; max-width:600px; display:block;">
              </td>
            </tr>

            <!-- Title Section -->
            <tr>
              <td align="center" style="padding:20px;">
                <h2 style="margin:0; font-size:24px; color:#000;">Insturix Creator’s Summit ’25</h2>
                <p style="font-size:16px; color:#555; margin:10px 0 0;">
                  India’s largest student-led Creator-Tech Summit, uniting 800+ creators, brands, and innovators.
                </p>
              </td>
            </tr>

            <!-- Logo -->
            <tr>
              <td align="center" style="padding:10px 0;">
                <img src="https://insturix-email-assets.s3.ap-south-1.amazonaws.com/promotional_images/309a20274f057a8c9056e415a5ea8196.png"
                     alt="Insturix Logo"
                     width="100" style="display:block; margin:0 auto;">
              </td>
            </tr>

            <!-- Invitation -->
            <tr>
              <td align="center" style="padding:10px 30px;">
                <p style="font-size:18px; line-height:1.4; color:#000;">
                  As a valued Insturix user, you’re invited to the <b>Insturix Creators Summit 2025 (ICS'25)</b> ,  
                  India’s largest Creator-Tech Summit, absolutely <b>FREE!</b><br>
                  Don’t miss out ,  spots are limited!
                </p>
              </td>
            </tr>

            <!-- Why You Can't Miss It -->
            <tr>
              <td align="left" style="padding:0 40px;">
                <h3 style="font-size:18px; color:#000;">Why You Can't Miss It:</h3>
                <ul style="font-size:16px; color:#333; line-height:1.5; padding-left:20px;">
                  <li>Meet stars like <b>Martin Noronha (Aevy TV)</b>, <b>Rajkumar</b> & more (40M+ reach)</li>
                  <li>Master AI tools like <b>Editron</b> & <b>Alyzitron</b></li>
                  <li>Network with 800+ creators</li>
                  <li>Join exciting competitions & brand showcases</li>
                </ul>
              </td>
            </tr>

            <!-- CTA Button -->
            <tr>
              <td align="center" style="padding:20px;">
                <a href="${registerUrl}"
                   target="_blank"
                   style="background:#000; color:#fff; text-decoration:none; 
                          font-size:16px; padding:12px 28px; border-radius:25px; display:inline-block;">
                  REGISTER FOR FREE NOW
                </a>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td align="center" style="padding:30px 0; background:#fafafa; border-top:1px solid #eee;">
                <a href="https://www.insturix.com" style="color:#888; text-decoration:underline;">
                  <img src="https://insturix-email-assets.s3.ap-south-1.amazonaws.com/promotional_images/7e317333aea8b5e6740a4f09c3fb646a.png"
                        alt="Event Info"
                        style="width:100%; max-width:200px; display:block; margin:15px auto;">
                  </a>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>

  </body>
  </html>
  `;

  const text = `
Insturix Creator’s Summit '25
India’s largest student-led Creator-Tech Summit.

Why You Can’t Miss It:
- Meet creators like Martin Noronha (Aevy TV) & Rajkumar
- Master AI tools like Editron, Alyzitron
- Network with 800+ creators
- Exciting competitions & brand showcases

Register free now: ${registerUrl}
  `;

  return { html, text };
}

