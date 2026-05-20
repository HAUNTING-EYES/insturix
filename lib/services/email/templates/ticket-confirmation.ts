/**
 * Ticket Confirmation Email Template
 * 
 * Template for sending ticket confirmation emails to registered users.
 * Uses modern design with S3-hosted images.
 */

export interface TicketConfirmationTemplatePayload {
  name?: string;
  ticketId?: string;
  eventDetails?: string;
  timeUntilEvent?: string; // e.g., "7 days", "1 day", "30 minutes"
}

export function ticketConfirmationEmailTemplate(
  name?: string,
  ticketId?: string,
  eventDetails?: string,
  timeUntilEvent?: string
): { html: string; text: string; subject: string } {
  const _safeName = name || 'Valued User';
  const ticketNumber = ticketId ?? 'N/A';
  const details = eventDetails ?? 'Insturix Creator\'s Summit 2025';
  const confirmationLink = 'https://www.insturix.com/checkout/ics25/confirmation';
  const websiteLink = 'https://www.insturix.com';
  
  // Build subject line with optional time until event
  const subject = timeUntilEvent
    ? `Your Ticket is Confirmed! - Event starts in ${timeUntilEvent} 🎉`
    : "Your Ticket is Confirmed! - Insturix Creator's Summit 2025 🎉";
  
  // Build time text for email body
  const timeText = timeUntilEvent ? `\n\nEvent starts in: ${timeUntilEvent}` : '';

  // HTML version matching email.html structure exactly
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="preload" as="image" href="https://insturix-email-assets.s3.ap-south-1.amazonaws.com/tickets_confirmed_images/99c379308c1a37e7e35b52c6f8a46ca3.png"><link rel="preload" as="image" href="https://insturix-email-assets.s3.ap-south-1.amazonaws.com/tickets_confirmed_images/309a20274f057a8c9056e415a5ea8196.png"><link rel="preload" as="image" href="https://insturix-email-assets.s3.ap-south-1.amazonaws.com/tickets_confirmed_images/7e317333aea8b5e6740a4f09c3fb646a.png"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="format-detection" content="telephone=no, date=no, address=no, email=no"><meta name="x-apple-disable-message-reformatting"><meta name="keywords" content="ticket,confirmation,insturix"><!--[if mso]><div>
                <noscript>
                  <xml>
                    <o:OfficeDocumentSettings>
                      <o:AllowPNG/>
                      <o:PixelsPerInch>96</o:PixelsPerInch>
                    </o:OfficeDocumentSettings>
                  </xml>
                </noscript></div><![endif]--><!--[if !mso]><!--><style>@media (max-width: 1px) {
        .layout-0 {
          display: none !important;
        }
      }
@media (max-width: 1px) and (min-width: 0px) {
        .layout-0-under-1 {
          display: table !important;
        }
      }</style><!--<![endif]--></head><body style="width:100%;-webkit-text-size-adjust:100%;text-size-adjust:100%;background-color:#f0f1f5;margin:0;padding:0"><table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f0f1f5" style="background-color:#f0f1f5"><tbody><tr><td style="background-color:#f0f1f5"><!--[if mso]><center>
                    <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
                      <tbody>
                        <tr>
                          <td><![endif]--><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;margin:0 auto;background-color:#ffffff"><tbody><tr><td style="padding:10px
           0px
           10px
           0px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"><tbody><tr><td style="padding:10px 0 10px 0"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td style="padding:0px 20px"><a href="${confirmationLink}" target="_blank" rel="noopener nofollow" ses:no-track="" style="display:block;text-decoration:none;border:none;outline:none" aria-label="${confirmationLink}"><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:585px"><tbody><tr><td style="width:100%;padding:0"><img src="https://insturix-email-assets.s3.ap-south-1.amazonaws.com/tickets_confirmed_images/99c379308c1a37e7e35b52c6f8a46ca3.png" width="585" height="827" style="display:block;width:100%;height:auto;max-width:100%"></td></tr></tbody></table></td></tr></tbody></table></a></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td dir="ltr" style="font-size:16px;white-space:pre-wrap;text-align:left;padding:0px 20px"><br></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td style="padding:0px 20px"><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:109px"><tbody><tr><td style="width:100%;padding:20 0"><img src="https://insturix-email-assets.s3.ap-south-1.amazonaws.com/tickets_confirmed_images/309a20274f057a8c9056e415a5ea8196.png" width="109" height="110" style="display:block;width:100%;height:auto;max-width:100%"></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td style="padding:0px 20px"><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:216px"><tbody><tr><td style="width:100%;padding:20 0"><img src="https://insturix-email-assets.s3.ap-south-1.amazonaws.com/tickets_confirmed_images/7e317333aea8b5e6740a4f09c3fb646a.png" width="216" height="53" style="display:block;width:100%;height:auto;max-width:100%"></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td dir="ltr" style="font-size:16px;white-space:pre-wrap;text-align:center;padding:0px 20px">CLICK ANYWHERE ON THE PICTURE TO OPEN YOUR TICKET<br></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td dir="ltr" style="font-size:16px;letter-spacing:-0.02em;white-space:pre-wrap;line-height:1.1;text-align:center;padding:0px 20px"><br></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td style="padding:0px 20px"><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:334px"><tbody><tr><td style="width:100%;padding:20 0"><a href="${websiteLink}" ses:no-track="" target="_blank" rel="noopener" style="display:table;width:100%;height:39.00091225936236px;text-decoration:none;border-collapse:separate;box-sizing:border-box;border-spacing:0;padding:8px;background-color:#000000;border-top-left-radius:25.025750211371196px;border-top-right-radius:25.025750211371196px;border-bottom-left-radius:25.025750211371196px;border-bottom-right-radius:25.025750211371196px"><span style="color:#ffffff;font-size:16.0001px;font-weight:normal;font-family:Arial, Helvetica, sans-serif;font-style:normal;text-decoration:none;direction:ltr;text-align:center;line-height:1.4em;letter-spacing:0em;display:table-cell;width:100%;height:100%;vertical-align:middle;box-sizing:border-box">Insturix Website
</span></a></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td dir="ltr" style="font-size:16px;white-space:pre-wrap;text-align:left;padding:0px 20px"><br></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table><!--[if mso]></td>
                </tr>
              </tbody>
            </table>
          </center><![endif]--></td></tr></tbody></table></body></html>`;

  // Plain text version
  const text = `Your Ticket is Confirmed!${timeUntilEvent ? ` - Event starts in ${timeUntilEvent}` : ''}

Event: ${details}
Ticket ID: ${ticketNumber}${timeText}

Thank you for your registration!

Click here to view your ticket: ${confirmationLink}`;

  return { html, text, subject };
}
