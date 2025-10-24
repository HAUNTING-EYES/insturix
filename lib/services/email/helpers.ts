/**
 * Email Service Helper Utilities
 * 
 * High-level email sending functions for common use cases
 * Combines SES client with email templates for easy usage
 */

import { sendEmail, EmailParams } from './ses-client';
import {
  welcomeEmail,
  verificationEmail,
  passwordResetEmail,
  orderConfirmationEmail,
  notificationEmail,
  securityAlertEmail,
} from './templates';

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(to: string, userName: string) {
  const { html, text } = welcomeEmail(userName);
  
  return await sendEmail({
    to,
    subject: 'Welcome to Insturix!',
    htmlBody: html,
    textBody: text,
  });
}

/**
 * Send email verification link
 */
export async function sendVerificationEmail(
  to: string,
  userName: string,
  verificationLink: string
) {
  const { html, text } = verificationEmail(userName, verificationLink);
  
  return await sendEmail({
    to,
    subject: 'Verify Your Insturix Email Address',
    htmlBody: html,
    textBody: text,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  to: string,
  userName: string,
  resetLink: string
) {
  const { html, text } = passwordResetEmail(userName, resetLink);
  
  return await sendEmail({
    to,
    subject: 'Reset Your Insturix Password',
    htmlBody: html,
    textBody: text,
  });
}

/**
 * Send order confirmation email
 */
export async function sendOrderConfirmationEmail(
  to: string,
  userName: string,
  orderNumber: string,
  orderDetails: { item: string; price: string }[]
) {
  const { html, text } = orderConfirmationEmail(userName, orderNumber, orderDetails);
  
  return await sendEmail({
    to,
    subject: `Order Confirmation - #${orderNumber}`,
    htmlBody: html,
    textBody: text,
  });
}

/**
 * Send generic notification email
 */
export async function sendNotificationEmail(
  to: string,
  userName: string,
  title: string,
  message: string,
  actionUrl?: string,
  actionText?: string
) {
  const { html, text } = notificationEmail(userName, title, message, actionUrl, actionText);
  
  return await sendEmail({
    to,
    subject: title,
    htmlBody: html,
    textBody: text,
  });
}

/**
 * Send security alert email
 */
export async function sendSecurityAlertEmail(
  to: string,
  userName: string,
  alertType: string,
  details: string
) {
  const { html, text } = securityAlertEmail(userName, alertType, details);
  
  return await sendEmail({
    to,
    subject: `Security Alert: ${alertType}`,
    htmlBody: html,
    textBody: text,
  });
}

/**
 * Send custom email with template wrapper
 */
export async function sendCustomEmail(params: EmailParams) {
  return await sendEmail(params);
}
