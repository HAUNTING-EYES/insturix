import type { TemplateDefinition } from '../types';
import { renderBaseTemplate } from './base';

export interface NotificationTemplatePayload {
  name: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}

export const notificationTemplate: TemplateDefinition<'notification', NotificationTemplatePayload> = {
  id: 'notification',
  render: ({ name, title, message, actionUrl, actionText }) => {
    const safeName = name || 'there';
    const button = actionUrl && actionText ? `<a class="button" href="${actionUrl}">${actionText}</a>` : '';

    const body = `
      <h1 style="color:#111827;margin-bottom:20px;">${title}</h1>
      <p>Hi ${safeName},</p>
      <p>${message}</p>
      ${button}
      <p>Regards,<br/>The Insturix Team</p>
    `;

    const textParts = [
      title,
      '',
      `Hi ${safeName},`,
      message,
    ];

    if (actionUrl && actionText) {
      textParts.push('', `${actionText}: ${actionUrl}`);
    }

    textParts.push('', 'Regards,', 'The Insturix Team');

    return {
      subject: title,
      html: renderBaseTemplate({ body, preheader: title }),
      text: textParts.join('\n'),
      preheader: title,
    };
  },
};
