/**
 * Director Mode — video-analysis worker ZERO-EDIT wiring (the P0 fix).
 *
 * The worker is a 1300-line pipeline; its assist END-STATE is proven by execution
 * elsewhere (director-worker guard, from-asset inline, live journey untrimmed).
 * This locks the one seam those can't reach: that the DESTRUCTIVE silence-removal
 * call is gated by the assist flag, read once up front — so a future edit can't
 * silently re-enable cutting on the scan-only lane. Matches the codebase's own
 * source-wiring pattern (chat-request-owner.test.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INTERNAL_WORKER_DISPATCH_NOT_CONFIGURED,
  isInternalQStashDispatchConfigured,
  isInternalWorkerInlineFallbackAllowed,
} from '../../lib/editron/security/internal-worker-auth';

const source = readFileSync(
  join(process.cwd(), 'app/api/internal/workers/video-analysis/route.ts'),
  'utf8',
).replaceAll('\r\n', '\n');
const tribeSource = readFileSync(
  join(process.cwd(), 'app/api/internal/workers/tribe-analysis/route.ts'),
  'utf8',
).replaceAll('\r\n', '\n');
const publicationSource = readFileSync(
  join(process.cwd(), 'lib/editron/services/project-analysis-director-publication.ts'),
  'utf8',
).replaceAll('\r\n', '\n');
const deepPublicationSource = readFileSync(
  join(process.cwd(), 'lib/editron/services/project-analysis-deep-publication.ts'),
  'utf8',
).replaceAll('\r\n', '\n');

describe('video-analysis worker zero-edit wiring', () => {
  it('reads the assist lane once, up front, from editMode', () => {
    expect(source).toContain("const { isAssistProject: isAssistScanLane } = await import('@/lib/editron/services/assist-lane')");
    expect(source).toContain('const isAssistScan = isAssistScanLane(scanLaneDoc)');
    // read BEFORE the destructive stage
    expect(source.indexOf('const isAssistScan =')).toBeLessThan(source.indexOf('executeSilenceRemoval'));
  });

  it('gates the destructive silence-removal execution behind !isAssistScan', () => {
    expect(source).toContain('if (!isAssistScan && rawFootageAnalysis?.silenceRemovalPlan?.length > 0)');
    // and the executor is only imported inside that guarded block
    const guardIdx = source.indexOf('if (!isAssistScan && rawFootageAnalysis?.silenceRemovalPlan');
    const importIdx = source.indexOf("const { executeSilenceRemoval } =");
    expect(guardIdx).toBeGreaterThan(0);
    expect(importIdx).toBeGreaterThan(guardIdx);
  });

  it('settles assist scan failures through the shared money-safe helper', () => {
    expect(source).toContain("const { settleAssistScanFailure } = await import('@/lib/editron/services/assist-lane')");
    expect(source).toContain('const settlement = await settleAssistScanFailure(db, {');
    expect(source).toContain('creditTransactionId: trackedScan.creditTransactionId');
    expect(tribeSource).toContain('creditTransactionId: trackedScan.creditTransactionId');
  });

  it('delegates inline Assist completion to the canonical Director owner', () => {
    expect(source).toContain("const { runCanonicalDirectorV1 } = await import('@/lib/editron/services/canonical-director-run')");
    expect(source).toContain('const directorResult = await runPreparedVideoDirectorInline({');
    expect(source).toContain('activateProjectAnalysisDirectorInlineV1({');
    expect(source).toContain('analysisDirectorDispatchId: input.dispatch.deduplicationId');
    expect(source).toContain("result.disposition === 'ASSIST_READY'");
    expect(source).not.toContain('projectService.claimDirectorRunV1(userId, projectId)');
    expect(source).not.toContain("{ projectId, autoEditStatus: { $ne: 'scan_failed' } }");
  });

  it('requires the shared dynamic QStash guard for both queued analysis stages', () => {
    expect(source).toContain("withInternalQStashWorkerAuth(handler, 'video-analysis')");
    expect(source).not.toContain('verifySignatureAppRouter(handler)');
    expect(tribeSource).toContain("withInternalQStashWorkerAuth(handler, 'tribe-analysis')");
    expect(tribeSource).not.toContain('verifySignatureAppRouter(handler)');
  });

  it('allows an inline downstream fallback only in explicit development', () => {
    expect(isInternalWorkerInlineFallbackAllowed({ APP_ENV: 'development' })).toBe(true);
    expect(isInternalWorkerInlineFallbackAllowed({ NODE_ENV: 'development' })).toBe(true);
    expect(isInternalWorkerInlineFallbackAllowed({ NODE_ENV: 'production' })).toBe(false);
    expect(isInternalQStashDispatchConfigured({
      QSTASH_TOKEN: 'publisher-token',
      QSTASH_CURRENT_SIGNING_KEY: 'current-key',
      QSTASH_NEXT_SIGNING_KEY: 'next-key',
    })).toBe(true);
    expect(isInternalQStashDispatchConfigured({
      QSTASH_TOKEN: 'publisher-token',
      QSTASH_CURRENT_SIGNING_KEY: 'current-key',
    })).toBe(false);
  });

  it('rejects missing production dispatch configuration before either worker opens Mongo', () => {
    const guard = 'if (!isInternalWorkerInlineFallbackAllowed() && !isInternalQStashDispatchConfigured())';
    for (const workerSource of [source, tribeSource]) {
      expect(workerSource).toContain('INTERNAL_WORKER_DISPATCH_NOT_CONFIGURED');
      expect(workerSource).toContain(guard);
      expect(workerSource.indexOf(guard)).toBeLessThan(workerSource.indexOf("const { getDatabase } = await import('@/lib/editron/db/mongodb')"));
    }
    expect(INTERNAL_WORKER_DISPATCH_NOT_CONFIGURED).toBe('INTERNAL_WORKER_DISPATCH_NOT_CONFIGURED');
  });

  it('routes duration correction through the fresh ProjectService snapshot, never a broad video-overlay write', () => {
    expect(source).toContain('selectVideoAnalysisDurationCorrectionTargetV1');
    expect(source).toContain('projectService.loadProjectForMutation(userId, projectId)');
    expect(source).toContain('projectService.commitVideoAnalysisDurationCorrectionV1(');
    expect(source).not.toContain('Math.round(actualDurationSec * 30)');
    expect(source).not.toContain("'overlays.$[vid].durationInFrames': actualFrames");
  });

  it('binds every analysis stage and Phase-1 evidence commit to the admitted run', () => {
    expect(source).toContain('analysisRunId: string');
    expect(source).toContain("await advanceAnalysis('analyzing')");
    expect(source).toContain("await advanceAnalysis('transcribing')");
    expect(source).toContain("await advanceAnalysis('analyzing_visual_cuts')");
    expect(source).toContain("await advanceAnalysis('cleaning')");
    expect(source).toContain("await advanceAnalysis('computing_params')");
    expect(source).toContain('commitProjectAnalysisPhase1V1');
    expect(source).toContain('commitProjectAnalysisPhase2V1');
    expect(source).toContain('prepareProjectAnalysisDeepDispatchV1');
    expect(source).toContain('publishProjectAnalysisDeepDispatchV1');
    expect(source).toContain('activateProjectAnalysisDeepInlineV1');
    expect(source).toContain('resumeRun?.deepAnalysisDispatch');
    expect(source).toContain("resumeRun?.state === 'analyzing_deep'");
    expect(source).toContain('const resumeEvidence = readDeepDispatchEvidence(resumeSnapshot.project, assetId)');
    expect(source).toContain('const assetKey = encodeProjectAnalysisAssetKey(sourceAssetId)');
    expect(source).toContain('runPreparedVideoDeepAnalysisInline({');
    expect(source.match(/runPreparedVideoDeepAnalysisInline\(\{/g)).toHaveLength(2);
    expect(source).toContain("deepClaim.disposition === 'DEEP_DISPATCH_PENDING' || deepClaim.disposition === 'DUPLICATE_ACTIVE'");
    expect(source).not.toContain('Prepared inline TRIBE work requires provider-free resume.');
    expect(source).toContain('prepareProjectAnalysisDirectorDispatchV1');
    expect(source).toContain('publishProjectAnalysisDirectorDispatchV1');
    expect(source).toContain("resumeRun?.state === 'directing_queued'");
    expect(source).toContain('resumeRun.runId === analysisRunId');
    expect(source).toContain('resumeRun.sourceAssetId === assetId');
    expect(source).toContain('projectService.failProjectAnalysisRunV1');
    expect(source).toContain('videoUrl: input.payload.videoUrl');
    expect(source).not.toContain('const qstashUrl = `${process.env.QSTASH_URL || \'https://qstash.upstash.io\'}/v2/publish/${tribeUrl}`');
    for (const rawStatus of [
      "autoEditStatus: 'analyzing'",
      "autoEditStatus: 'transcribing'",
      "autoEditStatus: 'analyzing_visual_cuts'",
      "autoEditStatus: 'cleaning'",
      "autoEditStatus: 'computing_params'",
      "autoEditStatus: 'analysis_complete'",
      "autoEditStatus: 'analyzing_deep'",
      "autoEditStatus: 'directing_queued'",
    ]) {
      expect(source).not.toContain(rawStatus);
    }
  });

  it('never terminalizes a later valid run when an old worker loses ownership', () => {
    expect(source).toContain("readonly code = 'ANALYSIS_RUN_OWNERSHIP_LOST'");
    expect(source).toContain('const ownershipLost = error instanceof AnalysisRunOwnershipLostError');
    expect(source).toContain('const retryable = error instanceof AnalysisRunRetryableError');
    expect(source).toContain('if (trackedScan && !directorDispatched && !ownershipLost && !retryable)');
    expect(source).toContain('{ status: retryable ? 503 : ownershipLost ? 409 : 500 }');
  });

  it('binds TRIBE claim, Phase-2 evidence and Director publication to the admitted run', () => {
    expect(tribeSource).toContain('analysisRunId: string');
    expect(tribeSource).toContain('claimProjectAnalysisDeepRunV1');
    expect(tribeSource).toContain('deepAnalysisDispatchId,');
    expect(tribeSource).toContain("claim.disposition === 'DEEP_DISPATCH_PENDING'");
    expect(tribeSource).toContain('commitProjectAnalysisPhase2V1');
    expect(tribeSource).toContain('publishProjectAnalysisDirectorDispatchV1');
    expect(tribeSource).toContain('analysisDirectorDispatchId: input.dispatch.deduplicationId');
    expect(publicationSource).toContain('recordProjectAnalysisDirectorDispatchPublishedV1');
    expect(publicationSource).toContain('recordProjectAnalysisDirectorDispatchInlineReadyV1');
    expect(publicationSource).toContain("'Upstash-Deduplication-Id': input.dispatch.deduplicationId");
    expect(publicationSource).toContain('analysisDirectorDispatchId: input.dispatch.deduplicationId');
    expect(deepPublicationSource).toContain('recordProjectAnalysisDeepDispatchPublishedV1');
    expect(deepPublicationSource).toContain('recordProjectAnalysisDeepDispatchInlineReadyV1');
    expect(deepPublicationSource).toContain("'Upstash-Deduplication-Id': input.dispatch.deduplicationId");
    expect(deepPublicationSource).toContain('deepAnalysisDispatchId: input.dispatch.deduplicationId');
    expect(tribeSource).toContain('if (trackedScan && !directorDispatched && !ownershipLost && !retryable)');
    expect(tribeSource).not.toContain('tribeLockAt');
    for (const rawStatus of [
      "autoEditStatus: 'analyzing_deep'",
      "autoEditStatus: 'analysis_complete'",
      "autoEditStatus: 'directing_queued'",
    ]) {
      expect(tribeSource).not.toContain(rawStatus);
    }
  });
});
