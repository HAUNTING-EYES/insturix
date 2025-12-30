import { env } from 'node:process';

export interface MailerConfig {
  fromAddress: string;
  region: string;
  maxRatePerSecond: number;
  maxRetries: number;
  retryDelayMs: number;
}

const DEFAULT_REGION = 'ap-south-1';
const DEFAULT_RATE_LIMIT = 14;
const DEFAULT_RETRY_DELAY = 1000;
const DEFAULT_MAX_RETRIES = 3;

export function loadMailerConfig(): MailerConfig {
  const from = env.AWS_SES_FROM_EMAIL ?? 'no-reply@insturix.com';
  const region = env.AWS_SES_REGION ?? DEFAULT_REGION;

  return {
    fromAddress: from,
    region,
    maxRatePerSecond: DEFAULT_RATE_LIMIT,
    maxRetries: DEFAULT_MAX_RETRIES,
    retryDelayMs: DEFAULT_RETRY_DELAY,
  };
}
