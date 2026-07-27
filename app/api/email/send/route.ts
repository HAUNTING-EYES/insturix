import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextRequest, NextResponse } from 'next/server';

import {
  EmailCampaignQueueError,
  processEmailCampaignChunk,
} from '@/lib/services/email/campaign-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface CampaignWorkerBody {
  campaignId?: unknown;
  sequence?: unknown;
}

async function campaignWorker(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | CampaignWorkerBody
      | null;
    if (
      typeof body?.campaignId !== 'string' ||
      typeof body.sequence !== 'number'
    ) {
      return NextResponse.json(
        { ok: false, error: 'Invalid campaign worker payload.' },
        { status: 400 }
      );
    }

    const result = await processEmailCampaignChunk(
      body.campaignId,
      body.sequence
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Email campaign worker failed.';
    const status =
      error instanceof EmailCampaignQueueError ? error.status : 500;
    console.error('[EmailCampaignWorker] Processing failed:', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}

function unavailableWorker() {
  return NextResponse.json(
    {
      ok: false,
      error: 'QStash signature verification is not configured.',
    },
    { status: 503 }
  );
}

const hasQStashSigningKeys = Boolean(
  process.env.QSTASH_CURRENT_SIGNING_KEY &&
    process.env.QSTASH_NEXT_SIGNING_KEY
);

/**
 * This route used to be an unauthenticated general-purpose email sender.
 * It is now exclusively a QStash campaign worker. Production fails closed
 * when either signing key is absent; local development can invoke the worker
 * directly while exercising the queue contract.
 */
export const POST =
  process.env.NODE_ENV === 'production'
    ? hasQStashSigningKeys
      ? verifySignatureAppRouter(campaignWorker)
      : unavailableWorker
    : campaignWorker;

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      service: 'Insturix email campaign worker',
      publicSendEndpoint: false,
    },
    {
      status: 405,
      headers: { Allow: 'POST' },
    }
  );
}
