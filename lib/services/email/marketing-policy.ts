import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from 'node:process';

import EmailContact, {
  type IEmailContact,
} from '@/schemas/EmailContactSchema';
import EmailSuppression, {
  type IEmailSuppression,
} from '@/schemas/EmailSuppressionSchema';
import {
  EMAIL_TOPICS,
  isValidEmailAddress,
  normalizeEmailAddress,
  type EmailTopic,
} from './contact-policy';
import type { MailMessage, Recipient, SendResult } from './types';

const TOKEN_VERSION = 1;
const MIN_SECRET_BYTES = 32;
const MAX_TOKEN_LENGTH = 1024;
const CONTACT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const TOKEN_BODY_PATTERN = /^[A-Za-z0-9_-]+$/;
const TOKEN_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const UNSUBSCRIBE_ALL_SCOPE = 'all' as const;
export const ONE_CLICK_UNSUBSCRIBE_SOURCE = 'one_click_unsubscribe';
export const ONE_CLICK_NOTICE_VERSION = 'rfc8058-v1';

export type UnsubscribeScope =
  | EmailTopic
  | typeof UNSUBSCRIBE_ALL_SCOPE;

interface UnsubscribeTokenPayload {
  v: typeof TOKEN_VERSION;
  contactId: string;
  scope: UnsubscribeScope;
}

export type PreparedMailDelivery =
  | { message: MailMessage }
  | { result: SendResult };

const TOPIC_LABELS: Record<EmailTopic, string> = {
  product_updates: 'product updates',
  creator_tips: 'creator tips',
  offers: 'offers',
  research: 'research',
  lifecycle: 'lifecycle',
};

function isEmailTopic(value: unknown): value is EmailTopic {
  return (
    typeof value === 'string' &&
    EMAIL_TOPICS.includes(value as EmailTopic)
  );
}

function signingSecret(override?: string): string {
  const secret = override ?? env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) {
    throw new Error('EMAIL_UNSUBSCRIBE_SECRET is not configured.');
  }
  if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(
      `EMAIL_UNSUBSCRIBE_SECRET must be at least ${MIN_SECRET_BYTES} bytes.`
    );
  }
  return secret;
}

function signBody(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function signUnsubscribeToken(
  input: Omit<UnsubscribeTokenPayload, 'v'>,
  secret?: string
): string {
  if (!CONTACT_ID_PATTERN.test(input.contactId)) {
    throw new Error('Cannot sign an invalid email contact id.');
  }
  if (
    input.scope !== UNSUBSCRIBE_ALL_SCOPE &&
    !isEmailTopic(input.scope)
  ) {
    throw new Error('Cannot sign an unsupported unsubscribe scope.');
  }

  const payload: UnsubscribeTokenPayload = {
    v: TOKEN_VERSION,
    contactId: input.contactId.toLowerCase(),
    scope: input.scope,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const signature = signBody(body, signingSecret(secret)).toString('base64url');
  return `${body}.${signature}`;
}

export function verifyUnsubscribeToken(
  token: string | null | undefined,
  secret?: string
): UnsubscribeTokenPayload | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;

  const parts = token.split('.');
  if (
    parts.length !== 2 ||
    !TOKEN_BODY_PATTERN.test(parts[0]) ||
    !TOKEN_SIGNATURE_PATTERN.test(parts[1])
  ) {
    return null;
  }

  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(parts[1], 'base64url');
  } catch {
    return null;
  }

  const candidateSecrets = [signingSecret(secret)];
  const previousSecret =
    secret === undefined
      ? env.EMAIL_UNSUBSCRIBE_SECRET_PREVIOUS?.trim()
      : undefined;
  if (previousSecret) {
    candidateSecrets.push(signingSecret(previousSecret));
  }
  const hasValidSignature = candidateSecrets.some(candidateSecret => {
    const expectedSignature = signBody(parts[0], candidateSecret);
    return (
      actualSignature.length === expectedSignature.length &&
      timingSafeEqual(actualSignature, expectedSignature)
    );
  });
  if (!hasValidSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[0], 'base64url').toString('utf8')
    ) as Partial<UnsubscribeTokenPayload>;
    if (
      payload.v !== TOKEN_VERSION ||
      typeof payload.contactId !== 'string' ||
      !CONTACT_ID_PATTERN.test(payload.contactId) ||
      (payload.scope !== UNSUBSCRIBE_ALL_SCOPE &&
        !isEmailTopic(payload.scope))
    ) {
      return null;
    }

    return {
      v: TOKEN_VERSION,
      contactId: payload.contactId.toLowerCase(),
      scope: payload.scope,
    };
  } catch {
    return null;
  }
}

function publicEmailBaseUrl(override?: string): string {
  const rawUrl =
    override ??
    env.EMAIL_PUBLIC_BASE_URL ??
    env.SITE_URL ??
    env.NEXT_PUBLIC_APP_URL ??
    (env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000');

  if (!rawUrl) {
    throw new Error(
      'EMAIL_PUBLIC_BASE_URL, SITE_URL, or NEXT_PUBLIC_APP_URL is required.'
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('The configured email public base URL is invalid.');
  }

  const isLocal =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !isLocal) {
    throw new Error('The email public base URL must use HTTPS.');
  }
  if (url.username || url.password) {
    throw new Error('The email public base URL cannot contain credentials.');
  }

  return url.origin;
}

export function buildUnsubscribeUrl(
  input: Omit<UnsubscribeTokenPayload, 'v'>,
  options: { secret?: string; baseUrl?: string } = {}
): string {
  const token = signUnsubscribeToken(input, options.secret);
  const url = new URL('/api/email/unsubscribe', publicEmailBaseUrl(options.baseUrl));
  url.searchParams.set('token', token);
  return url.toString();
}

export function getEmailTopicLabel(scope: UnsubscribeScope): string {
  return scope === UNSUBSCRIBE_ALL_SCOPE
    ? 'all marketing'
    : TOPIC_LABELS[scope];
}

function recipientEmail(message: MailMessage): string {
  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  if (
    recipients.length !== 1 ||
    (message.cc?.length ?? 0) > 0 ||
    (message.bcc?.length ?? 0) > 0
  ) {
    throw new Error('Marketing email must have exactly one recipient.');
  }

  const recipient: Recipient = recipients[0];
  const normalizedEmail = normalizeEmailAddress(
    typeof recipient === 'string' ? recipient : recipient.email
  );
  if (!isValidEmailAddress(normalizedEmail)) {
    throw new Error('Marketing email has an invalid recipient address.');
  }
  return normalizedEmail;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function appendVisibleUnsubscribe(
  message: MailMessage,
  unsubscribeUrl: string,
  topic: EmailTopic
): Pick<MailMessage, 'htmlBody' | 'textBody'> {
  const label = getEmailTopicLabel(topic);
  let htmlBody = message.htmlBody;
  let textBody = message.textBody;

  if (htmlBody) {
    const footer =
      `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;` +
      `font-size:12px;line-height:1.5;color:#6b7280">` +
      `You are receiving ${label} from Insturix. ` +
      `<a href="${escapeHtmlAttribute(unsubscribeUrl)}" ` +
      `style="color:#4b5563;text-decoration:underline">Unsubscribe</a>.` +
      `</div>`;
    htmlBody = /<\/body>/i.test(htmlBody)
      ? htmlBody.replace(/<\/body>/i, `${footer}</body>`)
      : `${htmlBody}${footer}`;
  }

  if (textBody) {
    textBody = `${textBody.trimEnd()}\n\nUnsubscribe from ${label}: ${unsubscribeUrl}`;
  }

  return { htmlBody, textBody };
}

function skipped(
  skipReason: NonNullable<SendResult['skipReason']>
): PreparedMailDelivery {
  return {
    result: {
      success: false,
      skipped: true,
      skipReason,
    },
  };
}

function suppressionBlocksTopic(
  suppression: IEmailSuppression,
  topic: EmailTopic
): boolean {
  return suppression.scope === 'global' || suppression.topic === topic;
}

function contactAllowsTopic(
  contact: IEmailContact,
  topic: EmailTopic
): NonNullable<SendResult['skipReason']> | null {
  if (contact.status === 'suppressed') return 'suppressed';
  if (contact.status !== 'active' || contact.unsubscribeAll) {
    return 'unsubscribed';
  }

  const preference = contact.preferences?.get(topic);
  if (!preference) return 'not_subscribed';
  return preference.status === 'opted_in' ? null : 'unsubscribed';
}

export async function prepareMarketingMessages(
  messages: MailMessage[]
): Promise<PreparedMailDelivery[]> {
  const marketing = messages.flatMap((message, index) => {
    if (message.delivery?.stream !== 'marketing') return [];
    return [
      {
        index,
        message,
        topic: message.delivery.topicName,
        normalizedEmail: recipientEmail(message),
      },
    ];
  });

  if (marketing.length === 0) {
    return messages.map(message => ({ message }));
  }

  const secret = signingSecret();
  const baseUrl = publicEmailBaseUrl();
  const normalizedEmails = Array.from(
    new Set(marketing.map(entry => entry.normalizedEmail))
  );
  const topics = Array.from(new Set(marketing.map(entry => entry.topic)));
  const { default: connectToDatabase } = await import(
    '@/schemas/ConnectToDatabase'
  );

  await connectToDatabase();

  const [contacts, suppressions] = await Promise.all([
    EmailContact.find({ normalizedEmail: { $in: normalizedEmails } })
      .select('_id normalizedEmail status unsubscribeAll preferences')
      .exec(),
    EmailSuppression.find({
      normalizedEmail: { $in: normalizedEmails },
      active: true,
      $or: [
        { scope: 'global' },
        { scope: 'topic', topic: { $in: topics } },
      ],
    }).exec(),
  ]);

  const contactByEmail = new Map(
    contacts.map(contact => [contact.normalizedEmail, contact])
  );
  const suppressionsByEmail = new Map<string, IEmailSuppression[]>();
  for (const suppression of suppressions) {
    const existing = suppressionsByEmail.get(suppression.normalizedEmail) ?? [];
    existing.push(suppression);
    suppressionsByEmail.set(suppression.normalizedEmail, existing);
  }

  const result = messages.map<PreparedMailDelivery>(message => ({ message }));
  for (const entry of marketing) {
    const contact = contactByEmail.get(entry.normalizedEmail);
    if (!contact) {
      result[entry.index] = skipped('not_subscribed');
      continue;
    }

    const isSuppressed = (
      suppressionsByEmail.get(entry.normalizedEmail) ?? []
    ).some(suppression => suppressionBlocksTopic(suppression, entry.topic));
    if (isSuppressed) {
      result[entry.index] = skipped('suppressed');
      continue;
    }

    const skipReason = contactAllowsTopic(contact, entry.topic);
    if (skipReason) {
      result[entry.index] = skipped(skipReason);
      continue;
    }

    const unsubscribeUrl = buildUnsubscribeUrl(
      {
        contactId: String(contact._id),
        scope: entry.topic,
      },
      { secret, baseUrl }
    );
    const bodies = appendVisibleUnsubscribe(
      entry.message,
      unsubscribeUrl,
      entry.topic
    );
    result[entry.index] = {
      message: {
        ...entry.message,
        ...bodies,
        tags: {
          ...entry.message.tags,
          email_topic: entry.topic,
        },
        delivery: {
          stream: 'marketing',
          topicName: entry.topic,
          unsubscribeUrl,
        },
      },
    };
  }

  return result;
}
