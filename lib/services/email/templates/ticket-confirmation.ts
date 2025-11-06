/**
 * Ticket Confirmation Email Template
 * 
 * Template for sending ticket confirmation emails to registered users.
 */

export interface TicketConfirmationTemplatePayload {
  name?: string;
  ticketId?: string;
  eventDetails?: string;
}

export function ticketConfirmationEmailTemplate(
  name?: string,
  ticketId?: string,
  eventDetails?: string
): { html: string; text: string } {
  const safeName = name || 'Valued User';
  const ticketNumber = ticketId ?? 'N/A';
  const details = eventDetails ?? 'Insturix Creator\'s Summit 2025';
  const ticketLink = 'https://www.insturix.com';

  // HTML version with absolute image URLs
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="format-detection" content="telephone=no, date=no, address=no, email=no"><meta name="x-apple-disable-message-reformatting"><meta name="keywords" content="DAG33mBNYKA, BAE03ZgoML8"><!--[if mso]><div>
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
           0px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"><tbody><tr><td style="padding:10px 0 10px 0"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:16px;white-space:pre-wrap;text-align:left;padding:0px 20px"><br></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px"><tbody><tr><td style="width:100%;padding:0"><img src="https://insturix-email-assets.s3.ap-south-1.amazonaws.com/tickets_confirmed_images/61773b74e73c562daa5b1bea4f1047c4.png" width="600" height="848" style="display:block;width:100%;height:auto;max-width:100%"></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td style="padding:0px 20px"><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:109px"><tbody><tr><td style="width:100%;padding:20 0"><img src="https://insturix-email-assets.s3.ap-south-1.amazonaws.com/tickets_confirmed_images/309a20274f057a8c9056e415a5ea8196.png" width="109" height="110" style="display:block;width:100%;height:auto;max-width:100%"></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td style="padding:0px 20px"><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:216px"><tbody><tr><td style="width:100%;padding:20 0"><img src="https://insturix-email-assets.s3.ap-south-1.amazonaws.com/tickets_confirmed_images/7e317333aea8b5e6740a4f09c3fb646a.png" width="216" height="53" style="display:block;width:100%;height:auto;max-width:100%"></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td dir="ltr" style="font-size:16px;letter-spacing:-0.02em;white-space:pre-wrap;line-height:1.1;text-align:center;padding:0px 20px"><br></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td style="padding:0px 20px"><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:334px"><tbody><tr><td style="width:100%;padding:20 0"><a href="https://www.insturix.com" ses:no-track="" target="_blank" rel="noopener" style="display:table;width:100%;height:39.00091225936236px;text-decoration:none;border-collapse:separate;box-sizing:border-box;border-spacing:0;padding:8px;background-color:#000000;border-top-left-radius:25.025750211371196px;border-top-right-radius:25.025750211371196px;border-bottom-left-radius:25.025750211371196px;border-bottom-right-radius:25.025750211371196px"><span style="color:#ffffff;font-size:16.0001px;font-weight:normal;font-family:Arial, Helvetica, sans-serif;font-style:normal;text-decoration:none;direction:ltr;text-align:center;line-height:1.4em;letter-spacing:0em;display:table-cell;width:100%;height:100%;vertical-align:middle;box-sizing:border-box">Insturix Website
</span></a></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td dir="ltr" style="font-size:16px;white-space:pre-wrap;text-align:left;padding:0px 20px"><br></td></tr><tr><td style="font-size:0;height:16px" height="16">&nbsp;</td></tr><tr><td style="padding:0px 20px"><table border="0" cellpadding="0" cellspacing="0" class="layout-0" align="center" style="display:table;border-spacing:0px;border-collapse:separate;width:100%;max-width:100%;table-layout:fixed;margin:0 auto"><tbody><tr><td style="text-align:center"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;max-width:560px;table-layout:fixed;margin:0 auto"><tbody><tr><td width="100.00%" style="width:100.00%;box-sizing:border-box;vertical-align:middle"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:13.3334px;letter-spacing:-0.025em;text-align:center"><span style="text-decoration:underline;white-space:pre-wrap">View email in browser</span><span style="white-space:pre-wrap"><br></span><span style="text-decoration:underline;white-space:pre-wrap">U</span><span style="text-decoration:underline;white-space:pre-wrap">pdate your preferences</span><span style="white-space:pre-wrap"> or </span><span style="text-decoration:underline;white-space:pre-wrap">unsubscribe</span><span style="white-space:pre-wrap">.</span><span style="text-decoration:underline;white-space:pre-wrap"><br><br></span><span style="text-decoration:underline;white-space:pre-wrap"><br></span></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table><!--[if !mso]><!--><table border="0" cellpadding="0" cellspacing="0" class="layout-0-under-1" align="center" style="display:none;border-spacing:0px;border-collapse:separate;width:100%;max-width:100%;table-layout:fixed;margin:0 auto"><tbody><tr><td style="text-align:center"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;max-width:1px;table-layout:fixed;margin:0 auto"><tbody><tr><td width="100.00%" style="width:100.00%;box-sizing:border-box;vertical-align:middle"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:13.3334px;letter-spacing:-0.025em;text-align:center"><span style="text-decoration:underline;white-space:pre-wrap">View email in browser</span><span style="white-space:pre-wrap"><br></span><span style="text-decoration:underline;white-space:pre-wrap">U</span><span style="text-decoration:underline;white-space:pre-wrap">pdate your preferences</span><span style="white-space:pre-wrap"> or </span><span style="text-decoration:underline;white-space:pre-wrap">unsubscribe</span><span style="white-space:pre-wrap">.</span><span style="text-decoration:underline;white-space:pre-wrap"><br><br></span><span style="text-decoration:underline;white-space:pre-wrap"><br></span></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table><!--<![endif]--></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table><!--[if mso]></td>
                </tr>
              </tbody>
            </table>
          </center><![endif]--></td></tr></tbody></table></body></html>`;

  // Plain text version
  const text = `Insturix Website


View email in browserUpdate your preferences or unsubscribe.`;

  return { html, text };
}
