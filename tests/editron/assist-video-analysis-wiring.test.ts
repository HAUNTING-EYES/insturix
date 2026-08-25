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
    expect(source).toContain('const settlement = await settleAssistScanFailure(db, trackedProjectId, msg)');
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
});
