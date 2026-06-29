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
  buildPhase0RenderedStillEvidence,
  buildPhase0RenderedStillEvidenceFailure,
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
    await persistPhase0RenderedStillEvidence(db, projectId, evidence);
    console.error(`[Phase0RenderedEvidence] ${projectId}: failed: ${evidence.failedFrames[0]?.error}`);
    return NextResponse.json(
      { success: false, projectId, status: evidence.status, error: evidence.failedFrames[0]?.error },
      { status: 500 },
    );
  }

  await persistPhase0RenderedStillEvidence(db, projectId, evidence);

  console.log(
    `[Phase0RenderedEvidence] ${projectId}: status=${evidence.status}, ` +
    `rendered=${evidence.renderedFrames.length}/${evidence.requestedSampleFrames.length}, ` +
    `ms=${Date.now() - startedAt}`,
  );

  return NextResponse.json({
    success: true,
    projectId,
    status: evidence.status,
    renderedFrames: evidence.renderedFrames.length,
    failedFrames: evidence.failedFrames.length,
  });
}

async function persistPhase0RenderedStillEvidence(
  db: { collection(name: string): { updateOne(filter: unknown, update: unknown): Promise<unknown> } },
  projectId: string,
  evidence: Phase0RenderedStillEvidence,
) {
  await db.collection('projects').updateOne(
    { projectId },
    {
      $set: {
        'intelligence.phase0RenderedStillEvidence': evidence,
        'intelligence.phase0FixtureArtifact.materialization': evidence.renderedFrames.length > 0
          ? 'lambda-stills-rendered'
          : 'lambda-stills-missing',
        'intelligence.phase0FixtureArtifact.renderedStillEvidenceStatus': evidence.status,
        'intelligence.phase0FixtureArtifact.renderedStillFrameCount': evidence.renderedFrames.length,
        'intelligence.phase0FixtureArtifact.renderedStillFailedFrameCount': evidence.failedFrames.length,
        'intelligence.phase0FixtureArtifact.renderedStillCompletedAt': evidence.completedAt,
      },
    },
  );
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;