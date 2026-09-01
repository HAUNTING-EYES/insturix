import { validateWebhookSignature } from '@remotion/lambda/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  beginProjectRenderFinalizationV1,
  beginRenderFinalization,
} from '@/lib/editron/services/render-finalization-dispatch';
import {
  getCurrentProjectRenderJobV1,
  getProjectRenderJobAuthorizationByAdmissionV1,
  reconcileProviderTerminalEvent,
} from '@/lib/editron/services/render-job-service';
import {
  projectService,
  ProjectNotFoundOrForbiddenError,
} from '@/lib/editron/services/project-service';

export const runtime = 'nodejs';

const StaticPayloadSchema = z.object({
  renderId: z.string().min(1),
  bucketName: z.string().min(1),
  customData: z.object({
    editronRenderAdmissionId: z.string().regex(/^rnd_[A-Za-z0-9_-]+$/),
    projectRenderBindingHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).passthrough(),
});

const WebhookPayloadSchema = z.discriminatedUnion('type', [
  StaticPayloadSchema.extend({
    type: z.literal('success'),
    outputUrl: z.string().url().optional(),
    outputFile: z.string().url().optional(),
    outputSizeInBytes: z.number().int().nonnegative().optional(),
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
    const lookup = await getProjectRenderJobAuthorizationByAdmissionV1({
      jobId,
      expectedBindingHash: payload.customData.projectRenderBindingHash,
    });
    if (lookup.status === 'NOT_PROJECT_RENDER_JOB') {
      if (payload.type === 'success') {
        const outputUrl = payload.outputFile ?? payload.outputUrl;
        if (!outputUrl) throw new Error('Successful Remotion webhook has no output URL');
        await beginRenderFinalization({
          renderId: jobId,
          providerRenderId: payload.renderId,
          bucketName: payload.bucketName,
          sourceOutputUrl: outputUrl,
          sourceOutputSize: payload.outputSizeInBytes ?? 0,
        });
      } else {
        await reconcileProviderTerminalEvent({
          jobId,
          providerRenderId: payload.renderId,
          bucketName: payload.bucketName,
          event: terminalError(payload),
        });
      }
      return NextResponse.json({ type: 'success' });
    }
    if (!lookup.ok) return projectRenderNotCurrent();
    if (!payload.customData.projectRenderBindingHash) {
      return NextResponse.json(
        { type: 'error', message: 'Project render binding hash is required' },
        { status: 400 },
      );
    }

    let currentProjectRevision;
    try {
      currentProjectRevision = await projectService.getProjectRevision(
        lookup.authorization.ownerId,
        lookup.authorization.projectId,
      );
    } catch (error) {
      if (error instanceof ProjectNotFoundOrForbiddenError) {
        return projectRenderNotCurrent();
      }
      throw error;
    }
    const current = await getCurrentProjectRenderJobV1({
      authorization: lookup.authorization,
      currentProjectRevision,
    });
    if (!current.ok) return projectRenderNotCurrent();
    const hasStoredProviderIdentity = current.job.providerRenderId !== undefined
      || current.job.bucketName !== undefined;
    const exactProviderIdentity = current.job.providerRenderId === payload.renderId
      && current.job.bucketName === payload.bucketName;
    if (hasStoredProviderIdentity && !exactProviderIdentity) {
      return projectRenderNotCurrent();
    }
    const successfulOutputUrl = payload.type === 'success'
      ? payload.outputFile ?? payload.outputUrl
      : null;
    if (payload.type === 'success' && !successfulOutputUrl) {
      throw new Error('Successful Remotion webhook has no output URL');
    }
    const sourceOutputSize = payload.type === 'success'
      ? payload.outputSizeInBytes ?? 0
      : null;
    if (
      payload.type === 'success'
      && exactProviderIdentity
      && (current.job.status === 'finalizing' || current.job.status === 'done')
    ) {
      const storedFinalization = current.job.finalization;
      const exactStoredSource = storedFinalization?.sourceOutputUrl === successfulOutputUrl
        && storedFinalization?.sourceOutputSize === sourceOutputSize;
      const validStoredState = current.job.status === 'finalizing'
        ? storedFinalization?.state === 'running'
        : storedFinalization?.state === 'done' && storedFinalization.receipt !== undefined;
      return exactStoredSource && validStoredState
        ? NextResponse.json({ type: 'success', state: 'already_reconciled' })
        : projectRenderNotCurrent();
    }
    const providerError = payload.type === 'success'
      ? null
      : terminalError(payload).error.trim().slice(0, 1000);
    if (payload.type !== 'success' && exactProviderIdentity && current.job.status === 'error') {
      return current.job.finalization === undefined && current.job.error === providerError
        ? NextResponse.json({ type: 'success', state: 'already_reconciled' })
        : projectRenderNotCurrent();
    }

    if (payload.type === 'success') {
      const result = await beginProjectRenderFinalizationV1({
        authorization: lookup.authorization,
        providerRenderId: payload.renderId,
        bucketName: payload.bucketName,
        sourceOutputUrl: successfulOutputUrl!,
        sourceOutputSize: sourceOutputSize!,
      });
      if (!('state' in result)) return projectRenderNotCurrent();
    } else {
      const result = await projectService.failProjectRenderJobFromProviderTransactionV1({
        authorization: lookup.authorization,
        providerRenderId: payload.renderId,
        bucketName: payload.bucketName,
        error: providerError!,
      });
      if (!result.ok) return projectRenderNotCurrent();
    }
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

function terminalError(payload: Exclude<z.infer<typeof WebhookPayloadSchema>, { type: 'success' }>) {
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

function projectRenderNotCurrent() {
  return NextResponse.json(
    {
      type: 'error',
      code: 'PROJECT_ARTIFACT_NOT_CURRENT',
      message: 'Project render admission is no longer current.',
    },
    { status: 409 },
  );
}
