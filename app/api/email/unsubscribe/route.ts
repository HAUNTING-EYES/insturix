import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

import {
  EMAIL_TOPICS,
  type EmailTopic,
} from '@/lib/services/email/contact-policy';
import {
  getEmailTopicLabel,
  ONE_CLICK_NOTICE_VERSION,
  ONE_CLICK_UNSUBSCRIBE_SOURCE,
  signUnsubscribeToken,
  UNSUBSCRIBE_ALL_SCOPE,
  verifyUnsubscribeToken,
  type UnsubscribeScope,
} from '@/lib/services/email/marketing-policy';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import EmailConsentEvent from '@/schemas/EmailConsentEventSchema';
import EmailContact from '@/schemas/EmailContactSchema';
import EmailSuppression from '@/schemas/EmailSuppressionSchema';

const ONE_CLICK_FIELD = 'List-Unsubscribe';
const ONE_CLICK_VALUE = 'One-Click';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function responseHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

function htmlPage(
  title: string,
  content: string,
  status = 200
): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} · Insturix</title>
</head>
<body style="margin:0;background:#0b0b0c;color:#f5f5f5;font-family:Arial,sans-serif">
  <main style="max-width:560px;margin:12vh auto;padding:32px">
    <p style="color:#d4a652;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Insturix</p>
    ${content}
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      ...responseHeaders(),
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

function invalidLinkResponse(): NextResponse {
  return htmlPage(
    'Invalid unsubscribe link',
    '<h1>This unsubscribe link is invalid.</h1><p>Please use the link from the original email.</p>',
    400
  );
}

function formAction(token: string): string {
  return `/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

function unsubscribeForm(token: string, label: string): string {
  return `<form method="post" action="${formAction(token)}" style="margin-top:24px">
    <input type="hidden" name="${ONE_CLICK_FIELD}" value="${ONE_CLICK_VALUE}">
    <button type="submit" style="border:0;border-radius:8px;background:#d4a652;color:#0b0b0c;padding:12px 18px;font-weight:700;cursor:pointer">
      Unsubscribe from ${label}
    </button>
  </form>`;
}

async function readOneClickBody(request: NextRequest): Promise<boolean> {
  try {
    const formData = await request.formData();
    return formData.get(ONE_CLICK_FIELD) === ONE_CLICK_VALUE;
  } catch {
    return false;
  }
}

async function upsertSuppression(
  normalizedEmail: string,
  scope: UnsubscribeScope
): Promise<void> {
  const filter =
    scope === UNSUBSCRIBE_ALL_SCOPE
      ? {
          normalizedEmail,
          scope: 'global' as const,
          active: true,
        }
      : {
          normalizedEmail,
          scope: 'topic' as const,
          topic: scope,
          active: true,
        };

  try {
    await EmailSuppression.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          ...filter,
          reason: 'unsubscribe',
          source: 'user',
        },
      },
      { upsert: true, runValidators: true }
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await EmailSuppression.exists(filter);
    if (!existing) throw error;
  }
}

async function recordConsentEvents(
  token: string,
  normalizedEmail: string,
  topics: readonly EmailTopic[],
  occurredAt: Date
): Promise<void> {
  const tokenDigest = createHash('sha256').update(token).digest('hex');

  for (const topic of topics) {
    try {
      await EmailConsentEvent.create({
        eventId: `unsubscribe:${tokenDigest}:${topic}`,
        normalizedEmail,
        topic,
        action: 'opt_out',
        actorType: 'visitor',
        source: ONE_CLICK_UNSUBSCRIBE_SOURCE,
        noticeVersion: ONE_CLICK_NOTICE_VERSION,
        occurredAt,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token');
  const payload = verifyUnsubscribeToken(token);
  if (!payload || !token) return invalidLinkResponse();

  const label = getEmailTopicLabel(payload.scope);
  const globalToken =
    payload.scope === UNSUBSCRIBE_ALL_SCOPE
      ? token
      : signUnsubscribeToken({
          contactId: payload.contactId,
          scope: UNSUBSCRIBE_ALL_SCOPE,
        });
  const globalForm =
    payload.scope === UNSUBSCRIBE_ALL_SCOPE
      ? ''
      : unsubscribeForm(globalToken, 'all marketing emails');

  return htmlPage(
    'Manage email preferences',
    `<h1>Manage your email preference</h1>
     <p>Confirm that you want to stop receiving ${label} emails. Your account and transactional messages are unaffected.</p>
     ${unsubscribeForm(token, `${label} emails`)}
     ${globalForm}`
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token');
  const payload = verifyUnsubscribeToken(token);
  if (!payload || !token) return invalidLinkResponse();

  if (!(await readOneClickBody(request))) {
    return htmlPage(
      'Invalid unsubscribe request',
      '<h1>Invalid unsubscribe request.</h1><p>Please use the link from the original email.</p>',
      400
    );
  }

  try {
    await connectToDatabase();
    const contact = await EmailContact.findById(payload.contactId)
      .select('_id normalizedEmail status')
      .exec();

    // A valid link for a contact that has since been removed is already safe.
    if (!contact) {
      return htmlPage(
        'Unsubscribed',
        '<h1>You are unsubscribed.</h1><p>No further action is needed.</p>'
      );
    }

    const occurredAt = new Date();
    const topics =
      payload.scope === UNSUBSCRIBE_ALL_SCOPE
        ? EMAIL_TOPICS
        : ([payload.scope] as const);

    // Suppression is written first so partial failure always fails closed.
    await upsertSuppression(contact.normalizedEmail, payload.scope);

    const preferenceUpdates: Record<string, unknown> = {};
    for (const topic of topics) {
      preferenceUpdates[`preferences.${topic}`] = {
        status: 'opted_out',
        source: ONE_CLICK_UNSUBSCRIBE_SOURCE,
        updatedAt: occurredAt,
      };
    }
    if (payload.scope === UNSUBSCRIBE_ALL_SCOPE) {
      preferenceUpdates.unsubscribeAll = true;
      preferenceUpdates.status =
        contact.status === 'suppressed' ? 'suppressed' : 'unsubscribed';
    }

    await EmailContact.findByIdAndUpdate(
      contact._id,
      { $set: preferenceUpdates },
      { runValidators: true }
    );
    await recordConsentEvents(
      token,
      contact.normalizedEmail,
      topics,
      occurredAt
    );

    return htmlPage(
      'Unsubscribed',
      `<h1>You are unsubscribed.</h1><p>You will no longer receive ${getEmailTopicLabel(payload.scope)} emails.</p>`
    );
  } catch (error) {
    const safeError = {
      name: error instanceof Error ? error.name : 'UnknownError',
      code:
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined,
    };
    console.error('Failed to process email unsubscribe:', safeError);
    return htmlPage(
      'Unable to unsubscribe',
      '<h1>We could not update your preference.</h1><p>Please try again in a moment.</p>',
      500
    );
  }
}
