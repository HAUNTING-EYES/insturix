/**
 * POST /api/internal/workers/phase0-rendered-evidence
 *
 * Async Phase 0 rendered evidence worker.
 * The Director only persists metadata and enqueues this worker; this route performs the
 * expensive Remotion Lambda still renders after the edit is already saved.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

import { getDatabase } from '@/lib/editron/db/mongodb';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import {
  buildPhase0RenderedEvidenceClaimFilter,
  buildPhase0RenderedEvidenceClaimRelease,
  buildPhase0RenderedEvidenceClaimUpdate,
  buildPhase0RenderedStillEvidence,
  buildPhase0RenderedStillEvidenceFailure,
  buildPhase0RenderedStillEvidencePersistSet,
  type Phase0RenderedStillEvidence,
} from '@/lib/editron/services/phase0-rendered-evidence-worker';

export const runtime = 'nodejs';
export const maxDuration = 800;

interface Phase0RenderedEvidencePayload {
  projectId?: string;
  userId?: string;
  requestedAt?: string;
}

async function handler(request: NextRequest) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({})) as Phase0RenderedEvidencePayload;
  const projectId = String(body.projectId ?? '').trim();
  const userId = String(body.userId ?? '').trim();

  if (!projectId || !userId) {
    return NextResponse.json(
      { success: false, error: 'Missing projectId or userId' },
      { status: 400 },
    );
  }

  const db = await getDatabase();
  const project = await db.collection('projects').findOne({ projectId });
  if (!project) {
    return NextResponse.json(
      { success: false, error: 'Project not found' },
      { status: 404 },
    );
  }
  if (project.userId && project.userId !== userId) {
    return NextResponse.json(
      { success: false, error: 'Project/user mismatch' },
      { status: 403 },
    );
  }

  const claimNow = new Date();
  const claim = await db.collection('projects').updateOne(
    buildPhase0RenderedEvidenceClaimFilter({ projectId, now: claimNow }),
    buildPhase0RenderedEvidenceClaimUpdate({ now: claimNow, requestedAt: body.requestedAt }),
  );
  if (claim.matchedCount === 0) {
    console.log(`[Phase0RenderedEvidence] ${projectId}: duplicate delivery skipped; rendered evidence already claimed`);
    return NextResponse.json({
      success: true,
      projectId,
      skipped: 'duplicate-delivery',
      stage: 'phase0-rendered-evidence',
    });
  }
  let evidence: Phase0RenderedStillEvidence;
  try {
    const overlays = Array.isArray(project.overlays) ? project.overlays : [];
    const resolvedOverlays = await assetResolver.resolveProjectAssets(overlays as any[]);
    evidence = await buildPhase0RenderedStillEvidence({
      ...project,
      overlays: resolvedOverlays,
    } as any, {
      capturedAt: body.requestedAt,
    });
  } catch (err: unknown) {
    evidence = buildPhase0RenderedStillEvidenceFailure({
      projectId,
      capturedAt: body.requestedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      await persistPhase0RenderedStillEvidence(db, projectId, evidence);
    } finally {
      await releasePhase0RenderedEvidenceClaim(db, projectId);
    }
    console.error(`[Phase0RenderedEvidence] ${projectId}: failed reason=${evidence.statusReason ?? 'unknown'}: ${evidence.failedFrames[0]?.error}`);
    return NextResponse.json(
      {
        success: false,
        projectId,
        status: evidence.status,
        statusReason: evidence.statusReason,
        error: evidence.failedFrames[0]?.error,
      },
      { status: 500 },
    );
  }

  try {
    await persistPhase0RenderedStillEvidence(db, projectId, evidence);
  } finally {
    await releasePhase0RenderedEvidenceClaim(db, projectId);
  }

  console.log(
    `[Phase0RenderedEvidence] ${projectId}: status=${evidence.status}, reason=${evidence.statusReason ?? 'none'}, ` +
    `rendered=${evidence.renderedFrames.length}/${evidence.requestedSampleFrames.length}, ` +
    `renderQuality=${evidence.renderedQualityEvidence?.renderedAestheticStatus ?? 'missing'}, ` +
    `ms=${Date.now() - startedAt}`,
  );

  return NextResponse.json({
    success: true,
    projectId,
    status: evidence.status,
    statusReason: evidence.statusReason,
    renderedFrames: evidence.renderedFrames.length,
    failedFrames: evidence.failedFrames.length,
    qualityEvidenceSource: evidence.renderedQualityEvidence?.qualityEvidenceSource ?? 'metadata-only',
    renderedQualityStatus: evidence.renderedQualityEvidence?.renderedQualityStatus ?? 'missing',
  });
}

async function persistPhase0RenderedStillEvidence(
  db: { collection(name: string): { updateOne(filter: unknown, update: unknown): Promise<unknown> } },
  projectId: string,
  evidence: Phase0RenderedStillEvidence,
) {
  await db.collection('projects').updateOne(
    { projectId },
    { $set: buildPhase0RenderedStillEvidencePersistSet(evidence) },
  );
}

async function releasePhase0RenderedEvidenceClaim(
  db: { collection(name: string): { updateOne(filter: unknown, update: unknown): Promise<unknown> } },
  projectId: string,
) {
  try {
    await db.collection('projects').updateOne(
      { projectId },
      buildPhase0RenderedEvidenceClaimRelease(),
    );
  } catch (err) {
    console.warn(
      `[Phase0RenderedEvidence] ${projectId}: failed to release rendered evidence claim`,
      err,
    );
  }
}
export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;
