import type { TemplateDefinition, TemplateRenderResult } from '../types';

import { welcomeTemplate, type WelcomeTemplatePayload } from './welcome';
import { verificationTemplate, type VerificationTemplatePayload } from './verification';
import { passwordResetTemplate, type PasswordResetTemplatePayload } from './password-reset';
import { orderConfirmationTemplate, type OrderConfirmationTemplatePayload } from './order-confirmation';
import { notificationTemplate, type NotificationTemplatePayload } from './notification';
import { securityAlertTemplate, type SecurityAlertTemplatePayload } from './security-alert';

const templateRegistry = {
  welcome: welcomeTemplate,
  verification: verificationTemplate,
  'password-reset': passwordResetTemplate,
  'order-confirmation': orderConfirmationTemplate,
  notification: notificationTemplate,
  'security-alert': securityAlertTemplate,
} as const;

export const templates = templateRegistry;

export type TemplateId = keyof typeof templateRegistry;

type TemplateEntry<K extends TemplateId> = (typeof templateRegistry)[K];

export type TemplatePayloads = {
  [K in TemplateId]: TemplateEntry<K> extends TemplateDefinition<K, infer P> ? P : never;
};

function getTemplate<K extends TemplateId>(templateId: K): TemplateDefinition<K, TemplatePayloads[K]> {
  const template = templates[templateId];
  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }
  return template as unknown as TemplateDefinition<K, TemplatePayloads[K]>;
}

export function renderTemplate<K extends TemplateId>(templateId: K, payload: TemplatePayloads[K]): TemplateRenderResult {
  const template = getTemplate(templateId);
  return template.render(payload);
}

export function listTemplates(): TemplateId[] {
  return Object.keys(templates) as TemplateId[];
}

export type {
  WelcomeTemplatePayload,
  VerificationTemplatePayload,
  PasswordResetTemplatePayload,
  OrderConfirmationTemplatePayload,
  NotificationTemplatePayload,
  SecurityAlertTemplatePayload,
};
