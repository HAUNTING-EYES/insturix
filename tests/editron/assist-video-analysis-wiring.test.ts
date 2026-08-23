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
});
