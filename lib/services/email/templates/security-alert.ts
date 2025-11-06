import type { TemplateDefinition } from '../types';
import { renderBaseTemplate } from './base';

export interface SecurityAlertTemplatePayload {
  name: string;
  alertType: string;
  details: string;
  remediationUrl?: string;
}

export const securityAlertTemplate: TemplateDefinition<'security-alert', SecurityAlertTemplatePayload> = {
  id: 'security-alert',
  render: ({ name, alertType, details, remediationUrl }) => {
    const safeName = name || 'there';
    const link = remediationUrl ?? 'https://insturix.com/dashboard/security';

    const body = `
      <div style="padding:12px 16px;margin-bottom:20px;border-left:4px solid #dc2626;background-color:#fef2f2;color:#991b1b;font-weight:600;">Security alert</div>
      <h1 style="color:#111827;margin-bottom:20px;">${alertType}</h1>
      <p>Hi ${safeName},</p>
      <p>${details}</p>
      <p>If this activity was not initiated by you, secure your account immediately.</p>
      <a class="button" href="${link}">Review Security Settings</a>
      <p>Recommended steps:</p>
      <ul style="padding-left:20px;">
        <li>Use a strong, unique password.</li>
        <li>Enable multi-factor authentication.</li>
        <li>Review recent account activity.</li>
      </ul>
      <p>Regards,<br/>The Insturix Team</p>
    `;

    const text = [
      'Security alert',
      '',
      `${alertType}`,
      '',
      `Hi ${safeName},`,
      details,
      '',
      'If this activity was not initiated by you, secure your account immediately.',
      '',
      `Review Security Settings: ${link}`,
      '',
      'Recommended steps:',
      '- Use a strong, unique password.',
      '- Enable multi-factor authentication.',
      '- Review recent account activity.',
      '',
      'Regards,',
      'The Insturix Team',
    ].join('\n');

    return {
      subject: `Security alert: ${alertType}`,
      html: renderBaseTemplate({ body, preheader: `Security alert for your Insturix account.` }),
      text,
      preheader: 'Security alert for your Insturix account.',
    };
  },
};
