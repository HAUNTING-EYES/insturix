import { NextRequest, NextResponse } from 'next/server';

import {
  processSesFeedbackEvent,
} from '@/lib/services/email/ses-event-consumer';
import {
  hasUsableEmailEventSecret,
  isValidEmailEventSecret,
  SesEventConfigurationError,
  SesEventValidationError,
} from '@/lib/services/email/ses-event';

export const runtime = 'nodejs';

const MAX_EVENT_BYTES = 64 * 1024;
const EVENT_SECRET_HEADER = 'x-insturix-email-event-secret';

function json(
  body: Record<string, unknown>,
  status: number
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expectedSecret = process.env.EMAIL_EVENT_INGEST_SECRET;
  if (!hasUsableEmailEventSecret(expectedSecret)) {
    return json(
      {
        ok: false,
        error: 'SES event ingestion is not configured.',
      },
      503
    );
  }

  if (
    !isValidEmailEventSecret(
      request.headers.get(EVENT_SECRET_HEADER),
      expectedSecret
    )
  ) {
    return json({ ok: false, error: 'Unauthorized.' }, 401);
  }

  const contentType = request.headers.get('content-type')?.toLowerCase();
  if (!contentType?.includes('application/json')) {
    return json(
      { ok: false, error: 'Content-Type must be application/json.' },
      415
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ ok: false, error: 'Unable to read request body.' }, 400);
  }
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_EVENT_BYTES) {
    return json({ ok: false, error: 'Event payload is too large.' }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return json({ ok: false, error: 'Event payload must be valid JSON.' }, 400);
  }

  try {
    const result = await processSesFeedbackEvent(payload);
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    if (error instanceof SesEventValidationError) {
      return json({ ok: false, error: error.message }, 422);
    }
    if (error instanceof SesEventConfigurationError) {
      return json(
        { ok: false, error: 'SES event ingestion is not configured.' },
        503
      );
    }

    console.error('[SesEventConsumer] Processing failed.', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return json(
      { ok: false, error: 'SES event processing failed.' },
      503
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return json(
    {
      ok: false,
      service: 'Insturix SES event consumer',
      publicIngestion: false,
    },
    405
  );
}
