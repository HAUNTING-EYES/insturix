import type { TemplateDefinition } from '../types';
import { renderBaseTemplate } from './base';

export interface WelcomeTemplatePayload {
  name: string;
  dashboardUrl?: string;
}

export const welcomeTemplate: TemplateDefinition<'welcome', WelcomeTemplatePayload> = {
  id: 'welcome',
  render: ({ name, dashboardUrl }) => {
    const safeName = name || 'there';
    const actionUrl = dashboardUrl ?? 'https://insturix.com/dashboard';

    const body = `
      <h1 style="color:#111827;margin-bottom:20px;">Welcome to Insturix</h1>
      <p>Hi ${safeName},</p>
      <p>Your Insturix account is ready. Sign in to explore your dashboard and start using our tools.</p>
      <a class="button" href="${actionUrl}">Open Dashboard</a>
      <p>If you need help getting started, our support team is ready to assist.</p>
      <p>Regards,<br/>The Insturix Team</p>
    `;

    const text = [
      'Welcome to Insturix',
      '',
      `Hi ${safeName},`,
      'Your Insturix account is ready. Sign in to explore your dashboard and start using our tools.',
      '',
      `Open Dashboard: ${actionUrl}`,
      '',
      'If you need help getting started, our support team is ready to assist.',
      '',
      'Regards,',
      'The Insturix Team',
    ].join('\n');

    return {
      subject: 'Welcome to Insturix',
      html: renderBaseTemplate({ body, preheader: 'Your Insturix account is ready to go.' }),
      text,
      preheader: 'Your Insturix account is ready to go.',
    };
  },
};
