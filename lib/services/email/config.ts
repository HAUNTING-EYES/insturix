import { env } from 'node:process';

export interface MailerConfig {
  fromAddress: string;
  marketingFromAddress?: string;
  transactionalConfigurationSet?: string;
  marketingConfigurationSet?: string;
  marketingContactListName?: string;
  region: string;
  maxRatePerSecond: number;
  maxRetries: number;
  retryDelayMs: number;
}

const DEFAULT_REGION = 'ap-south-1';
const DEFAULT_RATE_LIMIT = 14;
const DEFAULT_RETRY_DELAY = 1000;
const DEFAULT_MAX_RETRIES = 3;

function readOptionalString(name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

function readPositiveNumber(name: string, fallback: number): number {
  const rawValue = readOptionalString(name);
  if (!rawValue) return fallback;

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function readNonNegativeInteger(name: string, fallback: number): number {
  const rawValue = readOptionalString(name);
  if (!rawValue) return fallback;

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

export function loadMailerConfig(): MailerConfig {
  const fromAddress =
    readOptionalString('AWS_SES_TRANSACTIONAL_FROM_EMAIL') ??
    readOptionalString('AWS_SES_FROM_EMAIL') ??
    'no-reply@insturix.com';

  return {
    fromAddress,
    marketingFromAddress: readOptionalString('AWS_SES_MARKETING_FROM_EMAIL'),
    transactionalConfigurationSet: readOptionalString(
      'AWS_SES_TRANSACTIONAL_CONFIGURATION_SET'
    ),
    marketingConfigurationSet: readOptionalString(
      'AWS_SES_MARKETING_CONFIGURATION_SET'
    ),
    marketingContactListName: readOptionalString(
      'AWS_SES_MARKETING_CONTACT_LIST'
    ),
    region: readOptionalString('AWS_SES_REGION') ?? DEFAULT_REGION,
    maxRatePerSecond: readPositiveNumber(
      'AWS_SES_MAX_RATE_PER_SECOND',
      DEFAULT_RATE_LIMIT
    ),
    maxRetries: readNonNegativeInteger(
      'AWS_SES_MAX_RETRIES',
      DEFAULT_MAX_RETRIES
    ),
    retryDelayMs: readPositiveNumber(
      'AWS_SES_RETRY_DELAY_MS',
      DEFAULT_RETRY_DELAY
    ),
  };
}
