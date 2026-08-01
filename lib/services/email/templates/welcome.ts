import type { TemplateDefinition } from '../types';
import { renderBaseTemplate } from './base';

export interface WelcomeTemplatePayload {
  name: string;
  dashboardUrl?: string;
}

const DEFAULT_DASHBOARD_URL = 'https://www.insturix.com/dashboard';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function safeDashboardUrl(value?: string): string {
  try {
    const url = new URL(value ?? DEFAULT_DASHBOARD_URL);
    if (url.protocol !== 'https:' || url.username || url.password) {
      return DEFAULT_DASHBOARD_URL;
    }
    return url.toString();
  } catch {
    return DEFAULT_DASHBOARD_URL;
  }
}

export const welcomeTemplate: TemplateDefinition<'welcome', WelcomeTemplatePayload> = {
  id: 'welcome',
  render: ({ name, dashboardUrl }) => {
    const displayName = name.trim().replace(/\s+/g, ' ') || 'there';
    const safeName = escapeHtml(displayName);
    const actionUrl = safeDashboardUrl(dashboardUrl);
    const safeActionUrl = escapeHtml(actionUrl);

    const body = `
      <h1 style="color:#111827;margin-bottom:20px;">Welcome to Insturix</h1>
      <p>Hi ${safeName},</p>
      <p>Your Insturix account is ready. Sign in to explore your dashboard and start using our tools.</p>
      <a class="button" href="${safeActionUrl}">Open Dashboard</a>
      <p>If you need help getting started, our support team is ready to assist.</p>
      <p>Regards,<br/>The Insturix Team</p>
    `;

    const text = [
      'Welcome to Insturix',
      '',
      `Hi ${displayName},`,
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
