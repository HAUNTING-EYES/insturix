/**
 * Email Service - Main Export
 * 
 * Central export point for all email-related functionality
 */

// Core SES client and functions
export {
  sendEmail,
  sendBatchEmails,
  verifySESConfiguration,
  EMAIL_CONFIG,
  type EmailParams,
  type EmailResult,
} from './ses-client';

// Email templates
export {
  emailWrapper,
  welcomeEmail,
  verificationEmail,
  passwordResetEmail,
  orderConfirmationEmail,
  notificationEmail,
  securityAlertEmail,
} from './templates';

// Helper functions
export {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendNotificationEmail,
  sendSecurityAlertEmail,
  sendCustomEmail,
} from './helpers';
