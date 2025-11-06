/**
 * Email Service - Main Export
 * 
 * Central export point for all email-related functionality
 */

export {
  sendEmail,
  sendBatchEmails,
  verifySESConfiguration,
  EMAIL_CONFIG,
  getEmailConfig,
  type EmailParams,
  type EmailResult,
} from './ses-client';

export { TransactionalMailer, createMailer, getDefaultMailer } from './mailer';
export { loadMailerConfig } from './config';
export type { MailerConfig } from './config';

export {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendNotificationEmail,
  sendSecurityAlertEmail,
  sendTemplateEmail,
  sendBatchEmailsManaged,
  sendPromotionalEmail,
  sendTicketConfirmationEmail,
} from './helpers';

export * from './templates';
export * from './types';
