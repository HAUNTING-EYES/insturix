import { validateWebhookSignature } from '@remotion/lambda/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { reconcileProviderTerminalEvent } from '@/lib/editron/services/render-job-service';

export const runtime = 'nodejs';

const StaticPayloadSchema = z.object({
  renderId: z.string().min(1),
  bucketName: z.string().min(1),
  customData: z.object({
    editronRenderAdmissionId: z.string().regex(/^rnd_[A-Za-z0-9_-]+$/),
  }).passthrough(),
});

const WebhookPayloadSchema = z.discriminatedUnion('type', [
  StaticPayloadSchema.extend({
    type: z.literal('success'),
    outputUrl: z.string().url().optional(),
    outputFile: z.string().url().optional(),
  }),
  StaticPayloadSchema.extend({
    type: z.literal('error'),
    errors: z.array(z.object({
      message: z.string().min(1),
    }).passthrough()).default([]),
  }),
  StaticPayloadSchema.extend({
    type: z.literal('timeout'),
  }),
]);

export async function POST(request: Request) {
  const secret = process.env.REMOTION_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('[RenderWebhook] REMOTION_WEBHOOK_SECRET is missing');
    return NextResponse.json(
      { type: 'error', message: 'Webhook unavailable' },
      { status: 503 },
    );
  }
  if (request.headers.get('x-remotion-mode') !== 'production') {
    return NextResponse.json(
      { type: 'error', message: 'Production webhook required' },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { type: 'error', message: 'Invalid webhook payload' },
      { status: 400 },
    );
  }

  try {
    validateWebhookSignature({
      secret,
      body,
      signatureHeader: request.headers.get('x-remotion-signature') ?? '',
    });
  } catch {
    return NextResponse.json(
      { type: 'error', message: 'Invalid webhook signature' },
      { status: 401 },
    );
  }

  const parsed = WebhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { type: 'error', message: 'Invalid webhook payload' },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const jobId = payload.customData.editronRenderAdmissionId;
  try {
    await reconcileProviderTerminalEvent({
      jobId,
      providerRenderId: payload.renderId,
      bucketName: payload.bucketName,
      event: terminalEvent(payload),
    });
  } catch (error) {
    console.error('[RenderWebhook] terminal reconciliation failed:', {
      jobId,
      providerRenderId: payload.renderId,
      error,
    });
    return NextResponse.json(
      { type: 'error', message: 'Webhook reconciliation failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({ type: 'success' });
}

function terminalEvent(payload: z.infer<typeof WebhookPayloadSchema>) {
  if (payload.type === 'success') {
    const outputUrl = payload.outputFile ?? payload.outputUrl;
    if (!outputUrl) {
      throw new Error('Successful Remotion webhook has no output URL');
    }
    return { type: 'success' as const, outputUrl };
  }
  if (payload.type === 'timeout') {
    return {
      type: 'timeout' as const,
      error: 'Remotion render timed out',
    };
  }
  return {
    type: 'error' as const,
    error: payload.errors[0]?.message ?? 'Remotion render failed',
  };
}
