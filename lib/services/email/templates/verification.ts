import type { TemplateDefinition } from '../types';
import { renderBaseTemplate } from './base';

export interface VerificationTemplatePayload {
  name: string;
  verificationLink: string;
  expiresInHours?: number;
}

export const verificationTemplate: TemplateDefinition<'verification', VerificationTemplatePayload> = {
  id: 'verification',
  render: ({ name, verificationLink, expiresInHours = 24 }) => {
    const safeName = name || 'there';
    const body = `
      <h1 style="color:#111827;margin-bottom:20px;">Verify your email</h1>
      <p>Hi ${safeName},</p>
      <p>Confirm your email address to finish setting up your Insturix account.</p>
      <a class="button" href="${verificationLink}">Verify Email</a>
      <p>This link expires in ${expiresInHours} hours. If the button does not work, copy and paste the URL below into your browser:</p>
      <p style="word-break:break-all;">${verificationLink}</p>
      <p>If you did not create this account, you can ignore this message.</p>
      <p>Regards,<br/>The Insturix Team</p>
    `;

    const text = [
      'Verify your email',
      '',
      `Hi ${safeName},`,
      'Confirm your email address to finish setting up your Insturix account.',
      '',
      `Verify Email: ${verificationLink}`,
      '',
      `This link expires in ${expiresInHours} hours. If you did not create this account, you can ignore this message.`,
      '',
      'Regards,',
      'The Insturix Team',
    ].join('\n');

    return {
      subject: 'Verify your Insturix email address',
      html: renderBaseTemplate({ body, preheader: 'Confirm your Insturix account access.' }),
      text,
      preheader: 'Confirm your Insturix account access.',
    };
  },
};
