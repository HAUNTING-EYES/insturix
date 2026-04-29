import { loadMailerConfig, type MailerConfig } from './config';
import { createMailer, getDefaultMailer } from './mailer';
import type { BatchOptions, MailMessage, SendResult } from './types';

export type EmailParams = MailMessage;
export type EmailResult = SendResult;

let memoizedConfig: MailerConfig | null = null;

function ensureConfig(): MailerConfig {
  if (!memoizedConfig) {
    memoizedConfig = loadMailerConfig();
  }
  return memoizedConfig;
}

function defaultMailer() {
  return getDefaultMailer();
}

export function getEmailConfig(): MailerConfig {
  return ensureConfig();
}

export const EMAIL_CONFIG = (() => {
  try {
    const config = ensureConfig();
    return {
      FROM_ADDRESS: config.fromAddress,
      REGION: config.region,
      MAX_RATE_PER_SECOND: config.maxRatePerSecond,
      MAX_DAILY_QUOTA: 50000,
      RETRY_DELAY_MS: config.retryDelayMs,
      MAX_RETRIES: config.maxRetries,
    } as const;
  } catch (_error) {
    return {
      FROM_ADDRESS: process.env.AWS_SES_FROM_EMAIL ?? '',
      REGION: process.env.AWS_SES_REGION ?? 'ap-south-1',
      MAX_RATE_PER_SECOND: 14,
      MAX_DAILY_QUOTA: 50000,
      RETRY_DELAY_MS: 1000,
      MAX_RETRIES: 3,
    } as const;
  }
})();

export async function sendEmail(message: MailMessage): Promise<SendResult> {
  return defaultMailer().send(message);
}

export async function sendBatchEmails(messages: MailMessage[], options?: BatchOptions) {
  return defaultMailer().sendBatch(messages, options);
}

export async function verifySESConfiguration(): Promise<boolean> {
  try {
    return await defaultMailer().verifyConfiguration();
  } catch (_error) {
    return false;
  }
}

export { createMailer, getDefaultMailer };
export * from './templates';
