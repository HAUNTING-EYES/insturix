import { validateWebhookSignature } from '@remotion/lambda/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  reconcileChapterChildTerminalCallbackV1,
  type ChapterChildTerminalEventV1,
} from '@/lib/editron/services/chapter-render-dispatch-v1';

export const runtime = 'nodejs';

const HttpsUrlSchema = z.string().url().refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}, 'HTTPS output URL required');

const ChildCustomDataSchema = z.object({
  editronChapterParentAdmissionId: z.string().regex(/^chr_[A-Za-z0-9_-]{12}$/),
  editronChapterIndex: z.string().regex(/^(0|[1-9][0-9]{0,5})$/).transform(Number),
  editronChapterAttemptToken: z.string().regex(/^editron_chapter_child_attempt_v1_[a-f0-9]{64}$/),
  editronChapterBindingHash: z.string().regex(/^[a-f0-9]{64}$/),
  editronChapterRegion: z.string().min(1).max(100),
}).strict();

const ChildStaticPayloadSchema = z.object({
  renderId: z.string().min(1).max(200),
  expectedBucketOwner: z.string().min(1).max(64).optional(),
  bucketName: z.string().min(1).max(63),
  customData: ChildCustomDataSchema,
}).strict();

const ChildSuccessPayloadSchema = ChildStaticPayloadSchema.extend({
  type: z.literal('success'),
  outputUrl: HttpsUrlSchema.optional(),
  outputFile: HttpsUrlSchema.optional(),
  outputSizeInBytes: z.number().int().safe().positive().optional(),
  outputSize: z.number().int().safe().positive().optional(),
  lambdaErrors: z.array(z.unknown()).optional(),
  timeToFinish: z.number().finite().optional(),
  costs: z.unknown().optional(),
}).strict().superRefine((payload, context) => {
  if (!payload.outputUrl && !payload.outputFile) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['outputUrl'],
      message: 'A successful child callback requires an output URL',
    });
  }
  if (payload.outputUrl && payload.outputFile && payload.outputUrl !== payload.outputFile) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['outputFile'],
      message: 'Child output URLs must match',
    });
  }
});

const ChildErrorPayloadSchema = ChildStaticPayloadSchema.extend({
  type: z.literal('error'),
  errors: z.array(z.object({
    type: z.enum(['renderer', 'browser', 'stitcher', 'webhook', 'artifact']).optional(),
    message: z.string().min(1).max(10_000),
    name: z.string().max(300).optional(),
    stack: z.string().max(100_000).optional(),
    frame: z.number().int().nonnegative().nullable().optional(),
    chunk: z.number().int().nonnegative().nullable().optional(),
    isFatal: z.boolean().optional(),
    attempt: z.number().int().nonnegative().optional(),
    willRetry: z.boolean().optional(),
    totalAttempts: z.number().int().nonnegative().optional(),
    tmpDir: z.object({
      files: z.array(z.object({
        filename: z.string(),
        size: z.number().finite().nonnegative(),
      }).strict()),
      total: z.number().finite().nonnegative(),
    }).strict().nullable().optional(),
    s3Location: z.string().optional(),
    explanation: z.string().nullable().optional(),
  }).strict()).min(1),
}).strict();

const ChildTimeoutPayloadSchema = ChildStaticPayloadSchema.extend({
  type: z.literal('timeout'),
}).strict();

const ChildWebhookPayloadSchema = z.discriminatedUnion('type', [
  ChildSuccessPayloadSchema,
  ChildErrorPayloadSchema,
  ChildTimeoutPayloadSchema,
]);

type ChildWebhookPayloadV1 = z.infer<typeof ChildWebhookPayloadSchema>;

function invalidResponse(status: 400 | 409) {
  return NextResponse.json(
    { type: 'error', message: 'Chapter callback not accepted' },
    { status },
  );
}

function terminalEvent(payload: ChildWebhookPayloadV1): ChapterChildTerminalEventV1 {
  if (payload.type === 'success') {
    return {
      type: 'success',
      outputUrl: payload.outputFile ?? payload.outputUrl!,
      ...((payload.outputSizeInBytes ?? payload.outputSize) === undefined
        ? {}
        : { outputSize: payload.outputSizeInBytes ?? payload.outputSize }),
    };
  }
  if (payload.type === 'timeout') {
    return { type: 'timeout' };
  }
  return {
    type: 'error',
    error: payload.errors[0]?.message ?? 'Remotion chapter render failed',
  };
}

export async function POST(request: Request) {
  const secret = process.env.REMOTION_WEBHOOK_SECRET?.trim();
  if (!secret) return invalidResponse(409);
  if (request.headers.get('x-remotion-mode') !== 'production') {
    return invalidResponse(409);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidResponse(400);
  }

  try {
    validateWebhookSignature({
      secret,
      body,
      signatureHeader: request.headers.get('x-remotion-signature') ?? '',
    });
  } catch {
    return invalidResponse(409);
  }

  const parsed = ChildWebhookPayloadSchema.safeParse(body);
  if (!parsed.success) return invalidResponse(400);

  try {
    const payload = parsed.data;
    const result = await reconcileChapterChildTerminalCallbackV1({
      parentAdmissionId: payload.customData.editronChapterParentAdmissionId,
      childIndex: payload.customData.editronChapterIndex,
      bindingHash: payload.customData.editronChapterBindingHash,
      attemptToken: payload.customData.editronChapterAttemptToken,
      providerRenderId: payload.renderId,
      bucketName: payload.bucketName,
      region: payload.customData.editronChapterRegion,
      event: terminalEvent(payload),
    });
    if (!result.ok) return invalidResponse(409);
  } catch (error) {
    console.error('[ChapterWebhook] terminal reconciliation failed:', error);
    return invalidResponse(409);
  }

  return NextResponse.json({ type: 'success' });
}
