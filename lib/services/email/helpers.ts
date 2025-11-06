import type { BatchOptions, MailMessage, Recipient, SendResult, SendTemplateOptions } from './types';
import type { TemplateId, TemplatePayloads } from './templates';
import { getDefaultMailer } from './mailer';
import { promotionalEmailTemplate } from './templates/promotional';
import { ticketConfirmationEmailTemplate } from './templates/ticket-confirmation';

const mailer = () => getDefaultMailer();

export async function sendEmail(message: MailMessage): Promise<SendResult> {
  return mailer().send(message);
}

export async function sendWelcomeEmail(to: Recipient | Recipient[], name: string, dashboardUrl?: string) {
  return mailer().sendWelcomeEmail({ to, name, dashboardUrl });
}

export async function sendVerificationEmail(to: Recipient | Recipient[], name: string, verificationLink: string, expiresInHours?: number) {
  return mailer().sendVerificationEmail({ to, name, verificationLink, expiresInHours });
}

export async function sendPasswordResetEmail(to: Recipient | Recipient[], name: string, resetLink: string, expiresInMinutes?: number) {
  return mailer().sendPasswordResetEmail({ to, name, resetLink, expiresInMinutes });
}

export async function sendOrderConfirmationEmail(to: Recipient | Recipient[], name: string, orderNumber: string, items: { item: string; price: string; }[], detailsUrl?: string) {
  return mailer().sendOrderConfirmationEmail({ to, name, orderNumber, items, detailsUrl });
}

export async function sendNotificationEmail(to: Recipient | Recipient[], name: string, title: string, message: string, actionUrl?: string, actionText?: string) {
  return mailer().sendNotificationEmail({ to, name, title, message, actionUrl, actionText });
}

export async function sendSecurityAlertEmail(to: Recipient | Recipient[], name: string, alertType: string, details: string, remediationUrl?: string) {
  return mailer().sendSecurityAlertEmail({ to, name, alertType, details, remediationUrl });
}

export async function sendBatchEmails(messages: MailMessage[], options?: BatchOptions) {
  return mailer().sendBatch(messages, options);
}

export async function sendBatchEmailsManaged(
  messages: MailMessage[],
  options?: BatchOptions & { onProgress?: (progress: any) => void }
) {
  return mailer().sendBatchManaged(messages, options);
}

export async function verifySESConfiguration() {
  return mailer().verifyConfiguration();
}

export async function sendTemplateEmail<K extends TemplateId>(templateId: K, options: SendTemplateOptions<TemplatePayloads[K]>) {
  return mailer().sendTemplate(templateId, options);
}

/**
 * Send promotional email (ICS'25 invitation)
 */
export async function sendPromotionalEmail(to: Recipient | Recipient[], name?: string, registrationLink?: string): Promise<SendResult> {
  const { html, text } = promotionalEmailTemplate(name, registrationLink);
  return mailer().send({
    to,
    subject: "You're Invited to ICS'25 - India's Largest Creator-Tech Summit! 🚀",
    htmlBody: html,
    textBody: text,
  });
}

/**
 * Send ticket confirmation email
 */
export async function sendTicketConfirmationEmail(to: Recipient | Recipient[], name?: string, ticketId?: string, eventDetails?: string): Promise<SendResult> {
  const { html, text } = ticketConfirmationEmailTemplate(name, ticketId, eventDetails);
  return mailer().send({
    to,
    subject: "Your Ticket is Confirmed! - Insturix Creator's Summit 2025 🎉",
    htmlBody: html,
    textBody: text,
  });
}

