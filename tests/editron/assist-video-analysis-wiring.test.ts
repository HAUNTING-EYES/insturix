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

  it('commits the inline Assist ready state through the ProjectService claim owner', () => {
    expect(source).toContain('const assistCompletion = await projectService.claimDirectorRunV1(userId, projectId)');
    expect(source).toContain("assistCompletion.disposition !== 'ASSIST_PROJECT'");
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
    expect(source).toContain('projectService.failProjectAnalysisRunV1');
    expect(source).toContain('projectId, userId, orgId, assetId, analysisRunId, videoUrl');
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
    expect(source).toContain('if (trackedScan && !directorDispatched && !ownershipLost)');
    expect(source).toContain('{ status: ownershipLost ? 409 : 500 }');
  });

  it('binds TRIBE claim, Phase-2 evidence and Director publication to the admitted run', () => {
    expect(tribeSource).toContain('analysisRunId: string');
    expect(tribeSource).toContain('claimProjectAnalysisDeepRunV1');
    expect(tribeSource).toContain('commitProjectAnalysisPhase2V1');
    expect(tribeSource).toContain('recordProjectAnalysisDirectorDispatchPublishedV1');
    expect(tribeSource).toContain("'Upstash-Deduplication-Id': input.dispatch.deduplicationId");
    expect(tribeSource).toContain('if (trackedScan && !directorDispatched && !ownershipLost)');
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
