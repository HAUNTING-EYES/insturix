import { createHash, timingSafeEqual } from 'node:crypto';

import {
  isValidEmailAddress,
  normalizeEmailAddress,
} from './contact-policy';

const MIN_EVENT_SECRET_BYTES = 32;
const DEFAULT_SES_REGION = 'ap-south-1';
const MAX_EVENT_ID_LENGTH = 512;
const MAX_RECIPIENTS_PER_EVENT = 100;

const EVENT_TYPES = {
  'Email Bounced': 'Bounce',
  'Email Complaint Received': 'Complaint',
} as const;

type SesDetailType = keyof typeof EVENT_TYPES;
export type SesSuppressionReason = 'hard_bounce' | 'complaint';
type JsonRecord = Record<string, unknown>;

export interface SesEventConsumerOptions {
  allowedConfigurationSets?: ReadonlySet<string>;
  region?: string;
}

export type ParsedSesFeedbackEvent =
  | {
      disposition: 'suppress';
      reason: SesSuppressionReason;
      providerEventId: string;
      recipients: string[];
    }
  | {
      disposition: 'ignore';
      reason: 'non_permanent_bounce';
    };

export class SesEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SesEventValidationError';
  }
}

export class SesEventConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SesEventConfigurationError';
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_EVENT_ID_LENGTH
  ) {
    throw new SesEventValidationError(
      `SES event field "${key}" is invalid.`
    );
  }
  return value;
}

function configuredOptions(
  options: SesEventConsumerOptions
): Required<SesEventConsumerOptions> {
  const configuredSets =
    options.allowedConfigurationSets ??
    new Set(
      [
        process.env.AWS_SES_TRANSACTIONAL_CONFIGURATION_SET?.trim(),
        process.env.AWS_SES_MARKETING_CONFIGURATION_SET?.trim(),
      ].filter((value): value is string => Boolean(value))
    );

  if (configuredSets.size === 0) {
    throw new SesEventConfigurationError(
      'SES event ingestion requires at least one configuration set.'
    );
  }

  return {
    allowedConfigurationSets: configuredSets,
    region:
      options.region?.trim() ||
      process.env.AWS_SES_REGION?.trim() ||
      DEFAULT_SES_REGION,
  };
}

function assertExpectedConfigurationSet(
  mail: JsonRecord,
  allowedConfigurationSets: ReadonlySet<string>
): void {
  const tags = mail.tags;
  if (!isRecord(tags)) {
    throw new SesEventValidationError('SES event mail tags are missing.');
  }

  const configurationSets = tags['ses:configuration-set'];
  if (
    !Array.isArray(configurationSets) ||
    !configurationSets.some(
      value =>
        typeof value === 'string' &&
        allowedConfigurationSets.has(value)
    )
  ) {
    throw new SesEventValidationError(
      'SES event configuration set is not allowed.'
    );
  }
}

function feedbackId(
  detail: JsonRecord,
  eventKey: 'bounce' | 'complaint',
  envelopeId: string
): string {
  const event = detail[eventKey];
  const value =
    isRecord(event) && typeof event.feedbackId === 'string'
      ? event.feedbackId.trim()
      : '';
  const id = value || envelopeId;
  if (id.length > MAX_EVENT_ID_LENGTH) {
    throw new SesEventValidationError('SES feedback id is too long.');
  }
  return `ses:${eventKey}:${id}`;
}

function normalizedRecipients(
  event: JsonRecord,
  field: 'bouncedRecipients' | 'complainedRecipients'
): string[] {
  const rawRecipients = event[field];
  if (
    !Array.isArray(rawRecipients) ||
    rawRecipients.length === 0 ||
    rawRecipients.length > MAX_RECIPIENTS_PER_EVENT
  ) {
    throw new SesEventValidationError(
      `SES event field "${field}" is invalid.`
    );
  }

  const recipients = new Set<string>();
  for (const rawRecipient of rawRecipients) {
    if (!isRecord(rawRecipient)) {
      throw new SesEventValidationError(
        `SES event field "${field}" contains an invalid recipient.`
      );
    }
    const emailAddress = rawRecipient.emailAddress;
    if (typeof emailAddress !== 'string') {
      throw new SesEventValidationError(
        `SES event field "${field}" contains an invalid address.`
      );
    }
    const normalizedEmail = normalizeEmailAddress(emailAddress);
    if (!isValidEmailAddress(normalizedEmail)) {
      throw new SesEventValidationError(
        `SES event field "${field}" contains an invalid address.`
      );
    }
    recipients.add(normalizedEmail);
  }

  return Array.from(recipients);
}

export function parseSesFeedbackEvent(
  payload: unknown,
  options: SesEventConsumerOptions = {}
): ParsedSesFeedbackEvent {
  if (!isRecord(payload)) {
    throw new SesEventValidationError('SES event payload must be an object.');
  }

  const config = configuredOptions(options);
  const source = requiredString(payload, 'source');
  const envelopeId = requiredString(payload, 'id');
  const region = requiredString(payload, 'region');
  const detailType = requiredString(payload, 'detail-type') as SesDetailType;

  if (source !== 'aws.ses' || region !== config.region) {
    throw new SesEventValidationError(
      'SES event source or region is not allowed.'
    );
  }
  if (!(detailType in EVENT_TYPES)) {
    throw new SesEventValidationError('SES event type is not supported.');
  }

  const detail = payload.detail;
  if (!isRecord(detail)) {
    throw new SesEventValidationError('SES event detail is missing.');
  }
  if (detail.eventType !== EVENT_TYPES[detailType]) {
    throw new SesEventValidationError(
      'SES envelope and detail event types do not match.'
    );
  }

  const mail = detail.mail;
  if (!isRecord(mail)) {
    throw new SesEventValidationError('SES event mail detail is missing.');
  }
  requiredString(mail, 'messageId');
  assertExpectedConfigurationSet(
    mail,
    config.allowedConfigurationSets
  );

  if (detailType === 'Email Bounced') {
    const bounce = detail.bounce;
    if (!isRecord(bounce)) {
      throw new SesEventValidationError('SES bounce detail is missing.');
    }
    if (bounce.bounceType !== 'Permanent') {
      return {
        disposition: 'ignore',
        reason: 'non_permanent_bounce',
      };
    }
    return {
      disposition: 'suppress',
      reason: 'hard_bounce',
      providerEventId: feedbackId(detail, 'bounce', envelopeId),
      recipients: normalizedRecipients(bounce, 'bouncedRecipients'),
    };
  }

  const complaint = detail.complaint;
  if (!isRecord(complaint)) {
    throw new SesEventValidationError('SES complaint detail is missing.');
  }
  return {
    disposition: 'suppress',
    reason: 'complaint',
    providerEventId: feedbackId(detail, 'complaint', envelopeId),
    recipients: normalizedRecipients(
      complaint,
      'complainedRecipients'
    ),
  };
}

export function isValidEmailEventSecret(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (
    !provided ||
    !expected ||
    Buffer.byteLength(expected, 'utf8') < MIN_EVENT_SECRET_BYTES
  ) {
    return false;
  }
  const actualDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function hasUsableEmailEventSecret(
  secret: string | null | undefined
): secret is string {
  return Boolean(
    secret && Buffer.byteLength(secret, 'utf8') >= MIN_EVENT_SECRET_BYTES
  );
}
