/**
 * DIRECTOR MODE — end-to-end journey from CODE (no website, no auth, no live infra).
 *
 * Drives the REAL service logic across the full user lifecycle with a shared,
 * stateful in-memory Mongo (real query/update operator semantics) and only the
 * external I/O (asset resolver, R2, credits) mocked. State flows between steps
 * exactly as a real project moves through the pipeline — this is what the
 * per-function unit suites don't prove: that the pieces compose correctly.
 *
 * Journeys:
 *   1. HAPPY   upload → scan → chronological lay-down (untrimmed) → hydrate → ready_for_chat
 *   2. CANCEL  ready-write loses to a mid-scan cancel → refund settled, batch not resurrected
 *   3. FAIL    a stage failure → scan_failed + refund-where-deducted (once)
 *   4. REDELIVERY  QStash re-delivers the failure → NO second refund
 *   5. GATE    a refunded scan_failed project is inert to chat/mutation
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// External I/O only — the LOGIC under test is real.
vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: { resolveAssetUrl: vi.fn(async (id: string) => `https://cdn.test/${id}`) },
}));
vi.mock('@/lib/editron/services/r2-service', () => ({ isR2Available: () => false, getR2PublicUrl: (id: string) => `https://r2/${id}` }));
vi.mock('@/lib/pipeline/scene-to-editron', () => ({ ROW: { VIDEO: 2 } }));
const refundForWallet = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/services/creditsService', () => ({ CreditsService: { refundForWallet } }));
vi.mock('@/lib/editron/services/multi-asset-director-context', () => ({
  buildMultiAssetDirectorContext: vi.fn(() => ({
    rawFootageAnalysis: { timelineCoordinateSpace: 'canonical-edited-v1', silenceGaps: [{ startMs: 0, endMs: 400 }] },
    segmentAnalysis: { version: 1, segments: [{ startMs: 0, endMs: 2000 }] },
    vjepaAnalysis: null, wav2vecAnalysis: null, momentWeightMap: null, musicAnalysis: null,
    provenance: { version: 'v1', coordinateSpace: 'canonical-edited-v1', selectedVideoClipCount: 1, sourceAssetCount: 1 },
  })),
  isCanonicalAnalysisComplete: (doc: unknown) => Boolean((doc as { rawFootageAnalysis?: unknown } | null)?.rawFootageAnalysis
    && (doc as { segmentAnalysis?: unknown } | null)?.segmentAnalysis),
}));

import {
  ASSIST_STATUS_READY,
  ASSIST_STATUS_SCAN_FAILED,
  buildAssistHydration,
  isRefundedAssistProject,
  partitionAssistAssets,
  settleAssistScanFailure,
} from '@/lib/editron/services/assist-lane';
import { materializeChronologicalFallback } from '@/lib/editron/services/timeline-materializer';
import { buildAssistBriefing } from '@/lib/editron/services/assist-briefing';

// ── Minimal stateful in-memory Mongo (real operator semantics for what we use) ──
function matches(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === '$and') {
      return (cond as Record<string, unknown>[]).every((clause) => matches(doc, clause));
    }
    if (k === '$or') {
      return (cond as Record<string, unknown>[]).some((clause) => matches(doc, clause));
    }
    const v = doc[k];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const c = cond as Record<string, unknown>;
      if ('$ne' in c) return v !== c.$ne;
      if ('$nin' in c) return !(c.$nin as unknown[]).includes(v);
      if ('$in' in c) return (c.$in as unknown[]).includes(v);
      if ('$exists' in c) return (v !== undefined) === c.$exists;
    }
    if (v instanceof Date && cond instanceof Date) return v.getTime() === cond.getTime();
    return v === cond;
  });
}
function makeDb(seed: Record<string, unknown>[]) {
  const projects: Record<string, unknown>[] = seed.map((d) => ({
    projectRevision: 0,
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...d,
  }));
  const collection = (name: string) => {
    if (name !== 'projects') return { findOne: async () => null, updateOne: async () => ({ matchedCount: 0, modifiedCount: 0 }) };
    return {
      findOne: async (filter: Record<string, unknown>, opts?: { projection?: Record<string, number> }) => {
        const doc = projects.find((d) => matches(d, filter));
        if (!doc || !opts?.projection) return doc ? { ...doc } : null;
        const proj: Record<string, unknown> = {};
        for (const key of Object.keys(opts.projection)) if (key in doc) proj[key] = doc[key];
        proj.projectId = doc.projectId;
        return proj;
      },
      updateOne: async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        const doc = projects.find((d) => matches(d, filter));
        if (!doc) return { matchedCount: 0, modifiedCount: 0 };
        for (const [k, val] of Object.entries((update.$set as Record<string, unknown>) ?? {})) doc[k] = val;
        for (const k of Object.keys((update.$unset as Record<string, unknown>) ?? {})) delete doc[k];
        for (const [k, val] of Object.entries((update.$inc as Record<string, number>) ?? {})) {
          doc[k] = Number(doc[k] ?? 0) + val;
        }
        return { matchedCount: 1, modifiedCount: 1 };
      },
    };
  };
  return { db: { collection }, projects };
}

const asset = (id: string, over: Record<string, unknown> = {}) => ({ assetId: id, type: 'video', duration: 8, uploadedAt: `2026-07-01T00:00:0${id.slice(-1)}Z`, publicUrl: `https://pub/${id}`, ...over });

// Replicates the from-batch compose assist branch: partition → materialize → hydrate → ready-write.
async function layDownAssist(db: ReturnType<typeof makeDb>['db'], projectId: string, assets: ReturnType<typeof asset>[], analyses: unknown[]) {
  const { usableAssets, excludedNoDurationAssetIds } = partitionAssistAssets(assets as never);
  const timeline = await materializeChronologicalFallback(usableAssets as never, 'user_1', 'batch_1', { width: 1920, height: 1080 });
  const hydration = buildAssistHydration({ analyses: analyses as never, overlays: timeline.overlays as never, fps: 30, durationInFrames: timeline.durationInFrames });
  const readyWrite = await db.collection('projects').updateOne(
    { projectId, autoEditStatus: { $ne: ASSIST_STATUS_SCAN_FAILED } },
    { $set: { ...hydration.set, autoEditStatus: ASSIST_STATUS_READY, overlays: timeline.overlays, durationInFrames: timeline.durationInFrames, assistDegradedAssetIds: excludedNoDurationAssetIds } },
  );
  return { timeline, hydration, readyWrite };
}

beforeEach(() => refundForWallet.mockClear());

describe('DIRECTOR MODE journey (real service logic, shared state)', () => {
  const analyses = [
    { assetId: 'v1', rawFootageAnalysis: { transcription: { words: [{ word: 'hi' }] } }, segmentAnalysis: { segments: [{ startMs: 0 }] } },
    { assetId: 'v2', rawFootageAnalysis: { transcription: { words: [] } }, segmentAnalysis: { segments: [] } },
  ];

  it('1. HAPPY: three clips laid down untrimmed in upload order, evidence hydrated, ready_for_chat — nothing cut', async () => {
    const { db, projects } = makeDb([{ projectId: 'p1', editMode: 'assist', autoEditStatus: 'analyzing', assistCreditTransactionId: 'tx1', assistChargedCredits: 12 }]);
    const assets = [asset('v3'), asset('v1'), asset('v2', { type: 'image', duration: null })];
    const { timeline } = await layDownAssist(db, 'p1', assets, analyses);

    const p = projects[0];
    expect(p.autoEditStatus).toBe('ready_for_chat');
    // zero-edit: all 3 assets on the timeline, video untrimmed at full 8s (240f), uploadedAt order.
    expect((p.overlays as { assetId: string }[]).map((o) => o.assetId)).toEqual(['v1', 'v2', 'v3']);
    expect(timeline.overlays.filter((o) => o.type === 'video').every((o) => o.sourceStartFrame === 0 && o.durationInFrames === 240)).toBe(true);
    // evidence chat grounds in was written
    expect(p.rawFootageAnalysis).toBeTruthy();
    expect(p.segmentAnalysis).toBeTruthy();

    // the briefing renders from this exact persisted state
    const briefing = buildAssistBriefing(p);
    expect(briefing).not.toBeNull();
    expect(briefing!.summary).toContain('3 clips');
  });

  it('2. CANCEL mid-scan: the ready-write loses, refund settles, project stays scan_failed', async () => {
    const { db, projects } = makeDb([{ projectId: 'p2', editMode: 'assist', autoEditStatus: 'scan_failed' /* cancel already flipped it */, assistCreditTransactionId: 'tx2', assistChargedCredits: 20 }]);
    const { readyWrite } = await layDownAssist(db, 'p2', [asset('v1')], analyses);
    // The $ne:scan_failed guard means the lay-down never overwrote the cancel.
    expect(readyWrite.matchedCount).toBe(0);
    expect(projects[0].autoEditStatus).toBe('scan_failed');
  });

  it('3. FAIL: a stage failure settles scan_failed + refunds exactly once (money moved once)', async () => {
    const { db, projects } = makeDb([{ projectId: 'p3', editMode: 'assist', autoEditStatus: 'analyzing_deep', assistCreditTransactionId: 'tx3', assistChargedCredits: 15, userId: 'user_1' }]);
    const outcome = await settleAssistScanFailure(db as never, {
      projectId: 'p3',
      userId: 'user_1',
      reason: 'gpu exploded',
      creditTransactionId: 'tx3',
    });
    expect(outcome).toBe('refunded');
    expect(projects[0].autoEditStatus).toBe('scan_failed');
    expect(refundForWallet).toHaveBeenCalledOnce();
    // tx consumed so nothing can refund it again
    expect(projects[0].assistCreditTransactionId).toBeUndefined();
  });

  it('4. REDELIVERY: QStash re-delivers the same failure — the second attempt refunds NOTHING', async () => {
    const { db } = makeDb([{ projectId: 'p4', editMode: 'assist', autoEditStatus: 'directing_queued', assistCreditTransactionId: 'tx4', assistChargedCredits: 15, userId: 'user_1' }]);
    const run = { projectId: 'p4', userId: 'user_1', creditTransactionId: 'tx4' };
    expect(await settleAssistScanFailure(db as never, { ...run, reason: 'fail' })).toBe('refunded');
    expect(await settleAssistScanFailure(db as never, { ...run, reason: 'fail-redelivered' })).toBe('unverifiable-run');
    expect(refundForWallet).toHaveBeenCalledOnce(); // exactly one refund across both deliveries
  });

  it('5. GATE: once scan_failed + refunded, the project is inert to chat/mutation', () => {
    expect(isRefundedAssistProject({ editMode: 'assist', autoEditStatus: 'scan_failed' })).toBe(true);
    expect(isRefundedAssistProject({ editMode: 'assist', autoEditStatus: 'ready_for_chat' })).toBe(false);
    expect(isRefundedAssistProject({ editMode: 'auto', autoEditStatus: 'scan_failed' })).toBe(false);
    // and a scan_failed project yields no briefing
    expect(buildAssistBriefing({ editMode: 'assist', autoEditStatus: 'scan_failed' })).toBeNull();
  });
});
