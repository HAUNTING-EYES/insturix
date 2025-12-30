import type { TemplateDefinition } from '../types';
import { renderBaseTemplate } from './base';

export interface PasswordResetTemplatePayload {
  name: string;
  resetLink: string;
  expiresInMinutes?: number;
}

export const passwordResetTemplate: TemplateDefinition<'password-reset', PasswordResetTemplatePayload> = {
  id: 'password-reset',
  render: ({ name, resetLink, expiresInMinutes = 60 }) => {
    const safeName = name || 'there';
    const body = `
      <h1 style="color:#111827;margin-bottom:20px;">Reset your password</h1>
      <p>Hi ${safeName},</p>
      <p>We received a request to reset your Insturix password. Use the link below to set a new password.</p>
      <a class="button" href="${resetLink}">Reset Password</a>
      <p>The link expires in ${expiresInMinutes} minutes. If you did not request a reset, no additional action is required.</p>
      <p style="word-break:break-all;">${resetLink}</p>
      <p>Regards,<br/>The Insturix Team</p>
    `;

    const text = [
      'Reset your password',
      '',
      `Hi ${safeName},`,
      'We received a request to reset your Insturix password. Use the link below to set a new password.',
      '',
      `Reset Password: ${resetLink}`,
      '',
      `The link expires in ${expiresInMinutes} minutes. If you did not request a reset, no additional action is required.`,
      '',
      'Regards,',
      'The Insturix Team',
    ].join('\n');

    return {
      subject: 'Reset your Insturix password',
      html: renderBaseTemplate({ body, preheader: 'Reset your Insturix password securely.' }),
      text,
      preheader: 'Reset your Insturix password securely.',
    };
  },
};
