/**
 * DIRECTOR MODE — LIVE journey against the REAL preview Mongo (editron_prev).
 *
 * Runs the REAL service logic against a REAL database — the founder's "test it
 * from code, live, not a website." Only credits are mocked, so ZERO money moves;
 * everything else is real reads/writes on throwaway `dm_battle_` fixtures that are
 * deleted in afterAll.
 *
 * Gated on LIVE_MONGO=1 + a real MONGODB_URI in the env, so normal CI skips it.
 * Run:
 *   set -a; . <(grep -E '^(MONGODB_URI|EDITRON_MONGODB_DB_NAME|MONGODB_DB_NAME)=' .env.local.vercel); set +a
 *   LIVE_MONGO=1 npx vitest run tests/editron/assist-live-journey.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoClient, type Db } from 'mongodb';

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: { resolveAssetUrl: vi.fn(async (id: string) => `https://cdn.test/${id}`) },
}));
vi.mock('@/lib/editron/services/r2-service', () => ({ isR2Available: () => false, getR2PublicUrl: (id: string) => `https://r2/${id}` }));
const refundForWallet = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/services/creditsService', () => ({ CreditsService: { refundForWallet } }));
// The canonical builder's shape validity is unit-tested elsewhere; here we prove
// real-DB state transitions, so hydration is deterministic.
vi.mock('@/lib/editron/services/multi-asset-director-context', () => ({
  buildMultiAssetDirectorContext: vi.fn(() => ({
    rawFootageAnalysis: { timelineCoordinateSpace: 'canonical-edited-v1' },
    segmentAnalysis: { version: 1, segments: [] },
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
  partitionAssistAssets,
  settleAssistScanFailure,
} from '@/lib/editron/services/assist-lane';
import { materializeChronologicalFallback } from '@/lib/editron/services/timeline-materializer';

const LIVE = process.env.LIVE_MONGO === '1' && Boolean(process.env.MONGODB_URI);
const PREFIX = 'dm_battle_';

const suite = LIVE ? describe : describe.skip;

let client: MongoClient;
let db: Db;

const analyses = [
  { assetId: 'v1', rawFootageAnalysis: { transcription: { words: [{ word: 'hi' }] } }, segmentAnalysis: { segments: [{ startMs: 0 }] } },
];
const asset = (id: string, over: Record<string, unknown> = {}) => ({ assetId: id, type: 'video', duration: 8, uploadedAt: `2026-07-01T00:00:0${id.slice(-1)}Z`, publicUrl: `https://pub/${id}`, ...over });

async function layDown(projectId: string, assets: ReturnType<typeof asset>[]) {
  const { usableAssets } = partitionAssistAssets(assets as never);
  const timeline = await materializeChronologicalFallback(usableAssets as never, 'dm_user', 'dm_batch', { width: 1920, height: 1080 });
  const hydration = buildAssistHydration({ analyses: analyses as never, overlays: timeline.overlays as never, fps: 30, durationInFrames: timeline.durationInFrames });
  return db.collection('projects').updateOne(
    { projectId, autoEditStatus: { $ne: ASSIST_STATUS_SCAN_FAILED } },
    { $set: { ...hydration.set, autoEditStatus: ASSIST_STATUS_READY, overlays: timeline.overlays, durationInFrames: timeline.durationInFrames } },
  );
}

beforeAll(async () => {
  if (!LIVE) return;
  client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  db = client.db(process.env.EDITRON_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME);
});

afterAll(async () => {
  if (!LIVE) return;
  await db.collection('projects').deleteMany({ projectId: { $regex: `^${PREFIX}` } });
  await client.close();
});

suite('DIRECTOR MODE live journey (real preview Mongo, zero money)', () => {
  it('HAPPY: lays a real project down untrimmed, hydrates evidence, reaches ready_for_chat', async () => {
    const id = `${PREFIX}happy`;
    await db.collection('projects').insertOne({ projectId: id, editMode: 'assist', autoEditStatus: 'analyzing' });
    await layDown(id, [asset('v2'), asset('v1')]);
    const doc = await db.collection('projects').findOne({ projectId: id });
    expect(doc?.autoEditStatus).toBe('ready_for_chat');
    expect((doc?.overlays as { assetId: string }[]).map((o) => o.assetId)).toEqual(['v1', 'v2']);
    expect((doc?.overlays as { sourceStartFrame: number }[]).every((o) => o.sourceStartFrame === 0)).toBe(true);
    expect(doc?.rawFootageAnalysis).toBeTruthy();
  });

  it('CANCEL-WINS: a real scan_failed project is never resurrected by a late lay-down', async () => {
    const id = `${PREFIX}cancel`;
    await db.collection('projects').insertOne({ projectId: id, editMode: 'assist', autoEditStatus: 'scan_failed' });
    const res = await layDown(id, [asset('v1')]);
    expect(res.matchedCount).toBe(0);
    const doc = await db.collection('projects').findOne({ projectId: id });
    expect(doc?.autoEditStatus).toBe('scan_failed');
  });

  it('FAIL + REDELIVERY: settle transitions once; a re-delivered failure moves no money', async () => {
    const id = `${PREFIX}fail`;
    await db.collection('projects').insertOne({ projectId: id, editMode: 'assist', autoEditStatus: 'analyzing_deep', assistCreditTransactionId: 'dm_tx', assistChargedCredits: 10, userId: 'dm_user' });
    refundForWallet.mockClear();
    const run = { projectId: id, userId: 'dm_user', creditTransactionId: 'dm_tx' };
    expect(await settleAssistScanFailure(db as never, { ...run, reason: 'live fail' })).toBe('refunded');
    expect(await settleAssistScanFailure(db as never, { ...run, reason: 'live redelivery' })).toBe('unverifiable-run');
    expect(refundForWallet).toHaveBeenCalledOnce();
    const doc = await db.collection('projects').findOne({ projectId: id });
    expect(doc?.autoEditStatus).toBe('scan_failed');
    expect(doc?.assistCreditTransactionId).toBeUndefined();
  });
});
