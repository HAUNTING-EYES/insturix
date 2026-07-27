import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  isOwnedRunningMgRenderJob,
  verifyMgStorageAuthorizationToken,
} from '@/lib/editron/motion-graphics/codegen/mg-render-job-runner';
import { getMgRenderJobForOwner } from '@/lib/editron/motion-graphics/codegen/mg-render-job-service';
import { reserveStorageForUpload } from '@/lib/services/storage-reserve-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

const requestSchema = z.object({
  jobId: z.string().regex(/^mgr_[a-f0-9]{32}$/),
  idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/),
  projectId: z.string().min(1).max(240),
  userId: z.string().min(1).max(240),
  orgId: z.string().min(1).max(240).nullable(),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024 * 1024),
}).strict();

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error('missing bearer token');
  return match[1].trim();
}

export async function POST(request: Request) {
  try {
    const claims = verifyMgStorageAuthorizationToken(bearerToken(request));
    const body = requestSchema.parse(await request.json());
    if (
      body.jobId !== claims.jobId
      || body.projectId !== claims.projectId
      || body.userId !== claims.userId
      || body.orgId !== claims.orgId
    ) {
      return NextResponse.json({ allowed: false, reason: 'owner_scope_mismatch' }, { status: 403 });
    }
    if (request.headers.get('idempotency-key') !== `${body.jobId}:${body.sizeBytes}`) {
      return NextResponse.json({ allowed: false, reason: 'invalid_idempotency_key' }, { status: 400 });
    }

    const job = await getMgRenderJobForOwner({
      jobId: body.jobId,
      userId: body.userId,
      projectId: body.projectId,
    });
    if (!isOwnedRunningMgRenderJob(job, claims) || job?.idempotencyKey !== body.idempotencyKey) {
      return NextResponse.json({ allowed: false, reason: 'stale_or_invalid_lease' }, { status: 409 });
    }

    const reservation = await reserveStorageForUpload(body.userId, body.orgId, body.sizeBytes);
    if (!reservation.allowed) {
      return NextResponse.json({ allowed: false, reason: reservation.reason ?? 'storage_full' }, { status: 507 });
    }
    return NextResponse.json({
      allowed: true,
      overage: reservation.overage,
      evictedAssetIds: reservation.evictedAssetIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /bearer|token|signature|expired/i.test(message) ? 401 : 400;
    console.error('[MG Storage Authorization] rejected:', message);
    return NextResponse.json({ allowed: false, reason: 'invalid_request' }, { status });
  }
}
