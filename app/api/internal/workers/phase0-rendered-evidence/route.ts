/**
 * POST /api/internal/workers/phase0-rendered-evidence
 *
 * Async Phase 0 rendered evidence worker.
 * The Director only persists metadata and enqueues this worker; this route performs the
 * expensive Remotion Lambda still renders after the edit is already saved.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

import { COLLECTIONS, getDatabase } from '@/lib/editron/db/mongodb';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import { chatService } from '@/lib/editron/services/chat-service';
import { buildPhase0RenderedQualityGate } from '@/lib/editron/services/editron-learning-gate';
import {
  buildChatEditRenderedAudioEvidence,
  buildPhase0RenderedEvidenceClaimFilter,
  buildPhase0RenderedEvidenceClaimRelease,
  buildPhase0RenderedEvidenceClaimUpdate,
  buildPhase0RenderedStillEvidence,
  buildPhase0RenderedStillEvidenceFailure,
  buildPhase0RenderedStillEvidencePersistSet,
  type ChatEditRenderedAudioEvidence,
  type ChatEditRenderVerificationRequest,
  type Phase0RenderedStillEvidence,
} from '@/lib/editron/services/phase0-rendered-evidence-worker';
import type { Checkpoint, RestorableProjectState } from '@/lib/editron/services/checkpoint-service';

export const runtime = 'nodejs';
export const maxDuration = 800;

interface Phase0RenderedEvidencePayload {
  projectId?: string;
  userId?: string;
  requestedAt?: string;
  chatEditVerification?: ChatEditRenderVerificationRequest;
}

type EditronDatabase = Awaited<ReturnType<typeof getDatabase>>;
type ChatEditRenderVerificationStatus = 'pending' | 'running' | 'pass' | 'fail' | 'error';

interface ChatEditRenderVerificationRecord {
  version: 'editron-chat-render-verification-result-v1';
  operationId: string;
  sessionId: string;
  beforeCheckpointId: string;
  afterCheckpointId: string;
  status: ChatEditRenderVerificationStatus;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  modalities: ChatEditRenderVerificationRequest['modalities'];
  targets: ChatEditRenderVerificationRequest['targets'];
  sampleFrames: number[];
  visual: ReturnType<typeof summarizeVisualEvidence> | null;
  audio: ChatEditRenderedAudioEvidence | null;
  reasons: string[];
  dispatchMessageId?: string | null;
  notificationStatus?: 'pending' | 'sending' | 'sent';
  notificationSentAt?: string | null;
}

interface VerificationCheckpoint extends Checkpoint {
  chatEditRenderVerification?: ChatEditRenderVerificationRecord;
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

  if (body.chatEditVerification) {
    const verification = validateChatEditVerificationRequest(body.chatEditVerification);
    if (!verification) {
      return NextResponse.json(
        { success: false, error: 'Invalid chat edit render verification request' },
        { status: 400 },
      );
    }
    return handleChatEditRenderVerification({
      db,
      projectId,
      userId,
      verification,
      startedAt,
    });
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

async function handleChatEditRenderVerification(input: {
  db: EditronDatabase;
  projectId: string;
  userId: string;
  verification: ChatEditRenderVerificationRequest;
  startedAt: number;
}) {
  const checkpoints = input.db.collection<VerificationCheckpoint>(COLLECTIONS.CHECKPOINTS);
  const checkpointFilter = (checkpointId: string) => ({
    checkpointId,
    projectId: input.projectId,
    userId: input.userId,
    sessionId: input.verification.sessionId,
    operationId: input.verification.operationId,
  });
  const [beforeCheckpoint, afterCheckpoint] = await Promise.all([
    checkpoints.findOne(checkpointFilter(input.verification.beforeCheckpointId)),
    checkpoints.findOne(checkpointFilter(input.verification.afterCheckpointId)),
  ]);

  if (!beforeCheckpoint || !afterCheckpoint) {
    return NextResponse.json(
      { success: false, error: 'Exact before/after chat edit checkpoints were not found' },
      { status: 404 },
    );
  }
  if (
    beforeCheckpoint.type !== 'before-llm'
    || afterCheckpoint.type !== 'after-llm'
    || beforeCheckpoint.afterCheckpointId !== afterCheckpoint.checkpointId
  ) {
    return NextResponse.json(
      { success: false, error: 'Chat edit checkpoint chain is invalid' },
      { status: 409 },
    );
  }

  const now = new Date();
  const staleBefore = new Date(now.getTime() - 20 * 60_000).toISOString();
  const existing = beforeCheckpoint.chatEditRenderVerification;
  const runningRecord: ChatEditRenderVerificationRecord = {
    ...existing,
    version: 'editron-chat-render-verification-result-v1',
    operationId: input.verification.operationId,
    sessionId: input.verification.sessionId,
    beforeCheckpointId: input.verification.beforeCheckpointId,
    afterCheckpointId: input.verification.afterCheckpointId,
    status: 'running',
    requestedAt: input.verification.requestedAt,
    startedAt: now.toISOString(),
    completedAt: null,
    modalities: input.verification.modalities,
    targets: input.verification.targets,
    sampleFrames: input.verification.sampleFrames,
    visual: null,
    audio: null,
    reasons: [],
    notificationStatus: 'pending',
    notificationSentAt: null,
  };
  const claim = await checkpoints.updateOne(
    {
      ...checkpointFilter(input.verification.beforeCheckpointId),
      $or: [
        { chatEditRenderVerification: { $exists: false } },
        { 'chatEditRenderVerification.status': { $in: ['pending', 'error'] } },
        {
          'chatEditRenderVerification.status': 'running',
          'chatEditRenderVerification.startedAt': { $lt: staleBefore },
        },
      ],
    },
    { $set: { chatEditRenderVerification: runningRecord, updatedAt: now } },
  );

  if (claim.matchedCount === 0) {
    const current = await checkpoints.findOne(checkpointFilter(input.verification.beforeCheckpointId));
    const record = current?.chatEditRenderVerification;
    if (record && (record.status === 'pass' || record.status === 'fail')) {
      await ensureVerificationNotification({
        db: input.db,
        projectId: input.projectId,
        userId: input.userId,
        checkpointId: input.verification.beforeCheckpointId,
        record,
      });
    }
    return NextResponse.json({
      success: true,
      projectId: input.projectId,
      operationId: input.verification.operationId,
      skipped: 'duplicate-or-active-verification',
      status: record?.status ?? 'running',
    });
  }

  try {
    const [beforeProject, afterProject] = await Promise.all([
      resolveCheckpointProject(beforeCheckpoint),
      resolveCheckpointProject(afterCheckpoint),
    ]);
    const capturedAt = new Date().toISOString();
    const [visualResult, audioResult] = await Promise.allSettled([
      input.verification.modalities.includes('visual')
        ? buildPhase0RenderedStillEvidence(afterProject as any, {
            baselineProject: beforeProject as any,
            requestedSampleFrames: input.verification.sampleFrames,
            // Before/after scoring must audit this operation's overlays. Unchanged
            // active overlays have zero delta pixels and are not operation failures.
            auditedOverlayIds: input.verification.targets
              .filter((target) => target.state !== 'deleted')
              .map((target) => target.overlayId),
            capturedAt,
          })
        : Promise.resolve(null),
      input.verification.modalities.includes('audio')
        ? buildChatEditRenderedAudioEvidence(
            afterProject as any,
            beforeProject as any,
            input.verification,
            { capturedAt },
          )
        : Promise.resolve(null),
    ]);

    const visualEvidence = visualResult.status === 'fulfilled'
      ? visualResult.value
      : buildPhase0RenderedStillEvidenceFailure({
          projectId: input.projectId,
          capturedAt,
          error: visualResult.reason instanceof Error ? visualResult.reason.message : String(visualResult.reason),
        });
    const audioEvidence: ChatEditRenderedAudioEvidence | null = audioResult.status === 'fulfilled'
      ? audioResult.value
      : {
          version: 'editron-chat-rendered-audio-v1',
          status: 'missing',
          capturedAt,
          windows: [],
          reason: audioResult.reason instanceof Error ? audioResult.reason.message : String(audioResult.reason),
        };
    const visualSummary = visualEvidence ? summarizeVisualEvidence(visualEvidence) : null;
    const reasons = collectVerificationFailureReasons({
      requestedModalities: input.verification.modalities,
      visual: visualSummary,
      audio: audioEvidence,
    });
    const finalRecord: ChatEditRenderVerificationRecord = {
      ...runningRecord,
      status: reasons.length === 0 ? 'pass' : 'fail',
      completedAt: new Date().toISOString(),
      visual: visualSummary,
      audio: audioEvidence,
      reasons,
      notificationStatus: 'pending',
    };
    await persistChatEditVerificationResult({
      db: input.db,
      projectId: input.projectId,
      userId: input.userId,
      checkpointId: input.verification.beforeCheckpointId,
      record: finalRecord,
    });
    await ensureVerificationNotification({
      db: input.db,
      projectId: input.projectId,
      userId: input.userId,
      checkpointId: input.verification.beforeCheckpointId,
      record: finalRecord,
    });

    console.log(
      `[ChatEditRenderVerification] ${input.projectId}/${input.verification.operationId}: `
      + `status=${finalRecord.status}, modalities=${finalRecord.modalities.join(',')}, `
      + `reasons=${reasons.join('|') || 'none'}, ms=${Date.now() - input.startedAt}`,
    );
    return NextResponse.json({
      success: true,
      projectId: input.projectId,
      operationId: input.verification.operationId,
      status: finalRecord.status,
      reasons,
      visual: finalRecord.visual,
      audio: finalRecord.audio,
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    const failedRecord: ChatEditRenderVerificationRecord = {
      ...runningRecord,
      status: 'error',
      completedAt: new Date().toISOString(),
      reasons: [boundedText(reason, 500) || 'render_verification_worker_error'],
      notificationStatus: 'pending',
    };
    await persistChatEditVerificationResult({
      db: input.db,
      projectId: input.projectId,
      userId: input.userId,
      checkpointId: input.verification.beforeCheckpointId,
      record: failedRecord,
    });
    console.error(`[ChatEditRenderVerification] ${input.projectId}/${input.verification.operationId}: ${reason}`);
    return NextResponse.json(
      { success: false, projectId: input.projectId, operationId: input.verification.operationId, error: reason },
      { status: 500 },
    );
  }
}

function validateChatEditVerificationRequest(
  value: unknown,
): ChatEditRenderVerificationRequest | null {
  const request = asRecord(value);
  if (request.version !== 'editron-chat-render-verification-v1') return null;

  const operationId = boundedIdentifier(request.operationId, 8, 128);
  const sessionId = boundedIdentifier(request.sessionId, 1, 160);
  const beforeCheckpointId = boundedIdentifier(request.beforeCheckpointId, 1, 180);
  const afterCheckpointId = boundedIdentifier(request.afterCheckpointId, 1, 180);
  const requestedAt = typeof request.requestedAt === 'string' && Number.isFinite(Date.parse(request.requestedAt))
    ? request.requestedAt
    : null;
  if (!operationId || !sessionId || !beforeCheckpointId || !afterCheckpointId || !requestedAt) return null;

  const modalities = Array.from(new Set(
    Array.isArray(request.modalities)
      ? request.modalities.filter((entry): entry is 'visual' | 'audio' => entry === 'visual' || entry === 'audio')
      : [],
  ));
  if (modalities.length === 0 || modalities.length > 2) return null;

  const rawTargets = Array.isArray(request.targets) ? request.targets : [];
  if (rawTargets.length > 64) return null;
  const targets: ChatEditRenderVerificationRequest['targets'] = [];
  for (const rawTarget of rawTargets) {
    const target = asRecord(rawTarget);
    const overlayId = boundedText(target.overlayId, 180);
    const overlayType = boundedText(target.overlayType, 80);
    const state = target.state;
    const from = nullableFrame(target.from);
    const endFrame = nullableFrame(target.endFrame);
    if (!overlayId || !overlayType || !['created', 'updated', 'deleted'].includes(String(state))) return null;
    if (target.from !== null && target.from !== undefined && from === null) return null;
    if (target.endFrame !== null && target.endFrame !== undefined && endFrame === null) return null;
    if (from !== null && endFrame !== null && endFrame < from) return null;
    targets.push({
      overlayId,
      overlayType,
      state: state as 'created' | 'updated' | 'deleted',
      from,
      endFrame,
    });
  }

  const rawFrames = Array.isArray(request.sampleFrames) ? request.sampleFrames : [];
  if (rawFrames.length === 0 || rawFrames.length > 24) return null;
  const sampleFrames = Array.from(new Set(rawFrames.map((entry) => Number(entry))));
  if (sampleFrames.some((frame) => !Number.isSafeInteger(frame) || frame < 0 || frame > 100_000_000)) return null;

  return {
    version: 'editron-chat-render-verification-v1',
    operationId,
    sessionId,
    beforeCheckpointId,
    afterCheckpointId,
    requestedAt,
    modalities,
    targets,
    sampleFrames,
  };
}

async function resolveCheckpointProject(checkpoint: VerificationCheckpoint): Promise<Record<string, unknown>> {
  const projectState = checkpoint.projectState as RestorableProjectState | undefined;
  const fields = projectState?.fields ? structuredClone(projectState.fields) : {};
  const overlays = Array.isArray(fields.overlays)
    ? fields.overlays
    : Array.isArray(checkpoint.overlays)
      ? checkpoint.overlays
      : [];
  const resolvedOverlays = await assetResolver.resolveProjectAssets(overlays as any[]);
  return {
    ...fields,
    projectId: checkpoint.projectId,
    userId: checkpoint.userId,
    overlays: resolvedOverlays,
  };
}

function summarizeVisualEvidence(evidence: Phase0RenderedStillEvidence) {
  const qualityGate = buildPhase0RenderedQualityGate({
    qualityEvidence: evidence.renderedQualityEvidence ?? {},
    evaluatedAt: evidence.completedAt ?? evidence.capturedAt,
    hasQualityReview: evidence.renderedQualityEvidence?.qualityEvidenceSource === 'rendered-aesthetic',
  });
  return {
    status: evidence.status,
    statusReason: evidence.statusReason,
    gateStatus: qualityGate.status,
    qualityScore: qualityGate.qualityScore,
    requestedSampleFrames: evidence.requestedSampleFrames,
    renderedFrames: evidence.renderedFrames.slice(0, 24).map((frame) => ({
      frame: frame.frame,
      beforeUrl: frame.baselineUrl ?? null,
      afterUrl: frame.url,
    })),
    failedFrames: evidence.failedFrames.slice(0, 24),
    issues: qualityGate.renderedAestheticIssueSamples.slice(0, 50),
  };
}

function collectVerificationFailureReasons(input: {
  requestedModalities: ChatEditRenderVerificationRequest['modalities'];
  visual: ReturnType<typeof summarizeVisualEvidence> | null;
  audio: ChatEditRenderedAudioEvidence | null;
}): string[] {
  const reasons: string[] = [];
  if (input.requestedModalities.includes('visual')) {
    if (!input.visual) reasons.push('visual_evidence_missing');
    else if (input.visual.status !== 'completed') reasons.push(`visual_render_${input.visual.status}`);
    else if (input.visual.gateStatus !== 'pass') reasons.push(`visual_gate_${input.visual.gateStatus}`);
  }
  if (input.requestedModalities.includes('audio')) {
    if (!input.audio) reasons.push('audio_evidence_missing');
    else if (input.audio.status !== 'pass') reasons.push(`audio_render_${input.audio.status}:${input.audio.reason ?? 'unknown'}`);
  }
  return reasons.map((reason) => boundedText(reason, 500) || 'unknown_verification_failure');
}

async function persistChatEditVerificationResult(input: {
  db: EditronDatabase;
  projectId: string;
  userId: string;
  checkpointId: string;
  record: ChatEditRenderVerificationRecord;
}) {
  await Promise.all([
    input.db.collection<VerificationCheckpoint>(COLLECTIONS.CHECKPOINTS).updateOne(
      { checkpointId: input.checkpointId, projectId: input.projectId, userId: input.userId },
      { $set: { chatEditRenderVerification: input.record, updatedAt: new Date() } },
    ),
    input.db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId: input.projectId, userId: input.userId },
      {
        $set: {
          'intelligence.latestChatEditRenderVerification': input.record,
        },
        $push: {
          'intelligence.chatEditRenderVerificationHistory': {
            $each: [input.record],
            $slice: -20,
          },
        } as any,
      },
    ),
  ]);
}

async function ensureVerificationNotification(input: {
  db: EditronDatabase;
  projectId: string;
  userId: string;
  checkpointId: string;
  record: ChatEditRenderVerificationRecord;
}) {
  const checkpoints = input.db.collection<VerificationCheckpoint>(COLLECTIONS.CHECKPOINTS);
  const claim = await checkpoints.updateOne(
    {
      checkpointId: input.checkpointId,
      projectId: input.projectId,
      userId: input.userId,
      $or: [
        { 'chatEditRenderVerification.notificationStatus': 'pending' },
        { 'chatEditRenderVerification.notificationStatus': { $exists: false } },
      ],
    },
    { $set: { 'chatEditRenderVerification.notificationStatus': 'sending' } },
  );
  if (claim.matchedCount === 0) return;
  try {
    const content = input.record.status === 'pass'
      ? `Rendered verification passed for edit operation ${input.record.operationId}. The affected ${input.record.modalities.join(' and ')} output changed and passed the rendered quality checks.`
      : `The edit was saved, but rendered verification did not pass for operation ${input.record.operationId}: ${input.record.reasons.join('; ') || 'unknown verification failure'}. I am not marking this edit as successful; review the persisted before/after evidence for the affected frames or audio windows.`;
    await chatService.saveMessage(input.record.sessionId, input.userId, input.projectId, {
      role: 'assistant',
      content,
      checkpointIds: [input.record.beforeCheckpointId, input.record.afterCheckpointId],
    });
    const notificationSentAt = new Date().toISOString();
    await checkpoints.updateOne(
      { checkpointId: input.checkpointId, projectId: input.projectId, userId: input.userId },
      {
        $set: {
          'chatEditRenderVerification.notificationStatus': 'sent',
          'chatEditRenderVerification.notificationSentAt': notificationSentAt,
        },
      },
    );
  } catch (error) {
    await checkpoints.updateOne(
      { checkpointId: input.checkpointId, projectId: input.projectId, userId: input.userId },
      { $set: { 'chatEditRenderVerification.notificationStatus': 'pending' } },
    );
    throw error;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedIdentifier(value: unknown, min: number, max: number): string | null {
  const text = boundedText(value, max);
  return text && text.length >= min && /^[A-Za-z0-9:_-]+$/.test(text) ? text : null;
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max || /[\u0000-\u001F\u007F]/.test(text)) return null;
  return text;
}

function nullableFrame(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const frame = Number(value);
  return Number.isSafeInteger(frame) && frame >= 0 && frame <= 100_000_000 ? frame : null;
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
