/**
 * DIRECTOR MODE — C1 live-matrix fixture provisioner (Lane F).
 *
 * The C1 chat matrix (the flag-flip gate) drives Director Mode chat scenarios at
 * the real /chat/stream endpoint. It needs an assist project sitting at
 * `ready_for_chat` with REAL scan evidence (transcription / segments / music) to
 * act on — none exists in editron_prev (0 assist projects). This provisions one by
 * cloning a real analyzed project into a disposable `dm_c1_` assist project.
 *
 * `buildC1FixtureDoc` is PURE (unit-tested below with no DB — it is the correctness
 * proof that the clone is a valid Director Mode chat surface). The LIVE block
 * (LIVE_MONGO=1) seeds it into editron_prev, asserts read-back, and cleans up —
 * UNLESS KEEP_FIXTURE=1, which leaves a durable fixture and prints its id.
 *
 * The founder provisions a durable fixture (the auth-gated half of Lane F is theirs):
 *   set -a; . <(grep -E '^(MONGODB_URI|EDITRON_MONGODB_DB_NAME|MONGODB_DB_NAME)=' .env.local.vercel); set +a
 *   LIVE_MONGO=1 KEEP_FIXTURE=1 C1_OWNER_USER_ID=<your clerk userId> C1_OWNER_ORG_ID=<your orgId> \
 *     npx vitest run tests/editron/assist-c1-fixture.test.ts
 *   # → prints dm_c1_fixture; point scripts/run-chat-edit-battle.ts --project=dm_c1_fixture at it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import { buildAssistBriefing } from '@/lib/editron/services/assist-briefing';
import { buildScanReport } from '@/lib/editron/services/scan-report';
import { ASSIST_STATUS_READY } from '@/lib/editron/services/assist-lane-predicates';

const SOURCE_ID = process.env.C1_SOURCE_ID || 'proj_chatbattle_500c55dbd0';
const FIXTURE_ID = 'dm_c1_fixture';
const FIXTURE_PREFIX = 'dm_c1_';

// Fields that describe a COMPLETED AUTO edit — never present on a project the user
// still has to direct. The ANALYSIS fields (rawFootageAnalysis, segmentAnalysis,
// vjepa/wav2vec/music/momentWeightMap, multiAssetDirectorContext) are KEPT: a real
// hydrated assist project carries exactly those, and chat grounds in them.
const DIRECTOR_EDIT_STATE = [
  '_id', 'directorQueuedAt', 'directorMessageId', 'directorDurationMs', 'directorProfileUsed',
  'autoEditStageDesc', 'autoEditStagePercent', 'autoEditCompletedAt', 'autoEditDurationMs',
  'autoEditMode', 'autoEditRecoveryStartedAt', 'autoEditError', 'autoEditFailedAt',
  'qualityReview', 'storylinePlan', 'statusHistory', 'expiresAt',
];
const VISUAL_OVERLAY = new Set(['video', 'image']);

interface C1Opts { projectId: string; userId?: string; orgId?: string; now: Date }

/** Clone a completed analyzed project into a fresh Director Mode chat surface. */
export function buildC1FixtureDoc(source: Record<string, unknown>, opts: C1Opts): Record<string, unknown> {
  const doc: Record<string, unknown> = { ...source };
  for (const k of DIRECTOR_EDIT_STATE) delete doc[k];
  // Zero-edit surface: keep only the footage timeline, drop the director's added
  // captions/text/effects so a fresh "add captions" starts clean.
  const overlays = Array.isArray(source.overlays)
    ? (source.overlays as Array<Record<string, unknown>>).filter((o) => o && VISUAL_OVERLAY.has(o.type as string))
    : [];
  return {
    ...doc,
    projectId: opts.projectId,
    editMode: 'assist',
    autoEditStatus: ASSIST_STATUS_READY,
    userId: opts.userId ?? source.userId,
    orgId: opts.orgId ?? source.orgId,
    overlays,
    assistDegradedAssetIds: [],
    c1Fixture: true, // provenance marker (cleanup targets ^dm_c1_ / c1Fixture)
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}

describe('buildC1FixtureDoc (pure — the Director Mode chat surface the matrix runs against)', () => {
  const source: Record<string, unknown> = {
    _id: 'oid', projectId: SOURCE_ID, userId: 'src_user', orgId: 'src_org', fps: 30, durationInFrames: 855,
    aspectRatio: '9:16', name: 'source',
    overlays: [
      { type: 'video', assetId: 'a1', from: 0, durationInFrames: 57, sourceStartFrame: 0 },
      { type: 'caption', from: 0, durationInFrames: 30 },
      { type: 'text', from: 10 },
      { type: 'image', assetId: 'a2', from: 57, durationInFrames: 40, sourceStartFrame: 0 },
    ],
    rawFootageAnalysis: { transcription: { words: [{ word: 'hi' }, { word: 'there' }] }, silenceGaps: [], timelineCoordinateSpace: 'canonical-edited-v1' },
    segmentAnalysis: { segments: [{ startMs: 0 }, { startMs: 100 }] },
    musicAnalysis: { bpm: 120 }, multiAssetDirectorContext: { keep: true },
    directorQueuedAt: 'D', directorMessageId: 'M', qualityReview: { x: 1 }, storylinePlan: { y: 1 },
    autoEditStageDesc: 'z', autoEditCompletedAt: 'c', statusHistory: [1], autoEditStatus: 'complete',
  };
  const now = new Date('2026-07-23T00:00:00Z');
  const fx = buildC1FixtureDoc(source, { projectId: 'dm_c1_unit', userId: 'founder', orgId: 'org1', now });

  it('is a Director Mode project at ready_for_chat, owned by the runner', () => {
    expect(fx.editMode).toBe('assist');
    expect(fx.autoEditStatus).toBe('ready_for_chat');
    expect(fx.userId).toBe('founder');
    expect(fx.orgId).toBe('org1');
    expect(fx.projectId).toBe('dm_c1_unit');
    expect(fx.c1Fixture).toBe(true);
  });
  it('preserves the real scan evidence chat grounds in (analysis kept)', () => {
    expect((fx.rawFootageAnalysis as { transcription: { words: unknown[] } }).transcription.words).toHaveLength(2);
    expect((fx.segmentAnalysis as { segments: unknown[] }).segments).toHaveLength(2);
    expect(fx.musicAnalysis).toBeTruthy();
    expect(fx.multiAssetDirectorContext).toBeTruthy();
  });
  it('keeps only the footage timeline (strips director captions/text)', () => {
    expect((fx.overlays as Array<{ type: string }>).map((o) => o.type)).toEqual(['video', 'image']);
    expect(fx.assistDegradedAssetIds).toEqual([]);
  });
  it('strips completed-auto edit-state metadata', () => {
    for (const k of ['directorQueuedAt', 'directorMessageId', 'qualityReview', 'storylinePlan', 'autoEditStageDesc', 'autoEditCompletedAt', 'statusHistory', '_id']) {
      expect(fx[k]).toBeUndefined();
    }
  });
  it('renders a real briefing + scan report — the chat entry surfaces the matrix needs', () => {
    const briefing = buildAssistBriefing(fx);
    expect(briefing).not.toBeNull();
    expect(briefing!.chips.some((c) => c.id === 'captions')).toBe(true); // 2 words → captions chip
    const report = buildScanReport(fx);
    expect(report).not.toBeNull();
    expect(report!.overview.clipCount).toBe(2);
  });
});

// ── LIVE provisioning against real preview Mongo (editron_prev) ───────────────
const LIVE = process.env.LIVE_MONGO === '1' && Boolean(process.env.MONGODB_URI);
const KEEP = process.env.KEEP_FIXTURE === '1';
const suite = LIVE ? describe : describe.skip;

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  if (!LIVE) return;
  client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  db = client.db(process.env.EDITRON_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME);
});

afterAll(async () => {
  if (!LIVE) return;
  if (!KEEP) await db.collection('projects').deleteMany({ projectId: { $regex: `^${FIXTURE_PREFIX}` } });
  await client.close();
});

suite('C1 fixture — clone a real editron_prev project into an assist ready_for_chat fixture', () => {
  it('seeds a valid Director Mode chat surface from the real source (zero money, no model)', async () => {
    const source = await db.collection('projects').findOne({ projectId: SOURCE_ID });
    expect(source, `source ${SOURCE_ID} must exist in editron_prev`).toBeTruthy();

    const fixture = buildC1FixtureDoc(source as Record<string, unknown>, {
      projectId: FIXTURE_ID,
      userId: process.env.C1_OWNER_USER_ID || (source as { userId?: string }).userId,
      orgId: process.env.C1_OWNER_ORG_ID || (source as { orgId?: string }).orgId,
      now: new Date(),
    });
    await db.collection('projects').replaceOne({ projectId: FIXTURE_ID }, fixture, { upsert: true });

    const read = await db.collection('projects').findOne({ projectId: FIXTURE_ID });
    expect(read?.editMode).toBe('assist');
    expect(read?.autoEditStatus).toBe(ASSIST_STATUS_READY);
    expect(read?.rawFootageAnalysis).toBeTruthy();
    expect(read?.segmentAnalysis).toBeTruthy();
    expect((read?.overlays as Array<{ type: string }>).every((o) => o.type === 'video' || o.type === 'image')).toBe(true);
    expect(buildAssistBriefing(read)).not.toBeNull();
    expect(buildScanReport(read)).not.toBeNull();

    if (KEEP) {
      // eslint-disable-next-line no-console
      console.log(`[C1] durable fixture ready: projectId=${FIXTURE_ID} owner=${read?.userId} org=${read?.orgId} — run the chat matrix with --project=${FIXTURE_ID}`);
    }
  });
});
