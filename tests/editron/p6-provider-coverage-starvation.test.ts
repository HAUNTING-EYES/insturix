import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const projectDocs = new Map<string, Record<string, unknown>>();
  const updateOne = vi.fn(async () => ({ acknowledged: true }));
  const collection = vi.fn(() => ({
    findOne: vi.fn(async (query: Record<string, unknown>) => (
      typeof query.projectId === 'string' ? projectDocs.get(query.projectId) ?? null : null
    )),
    updateOne,
  }));
  return {
    collection,
    projectDocs,
    updateOne,
    uploadMedia: vi.fn(),
  };
});

vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadMedia: mocks.uploadMedia,
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'mediaAssets' },
  getDatabase: vi.fn(async () => ({
    collection: mocks.collection,
  })),
}));

import { executeEDL } from '@/lib/editron/services/edl-executor';
import type { EditDecisionList } from '@/lib/editron/services/reactive-edit-engine';
import { OverlayType, type Overlay } from '@/components/editron/editor/version-7.0.0/types';

function videoOverlay(id = 1): Overlay {
  return {
    id,
    type: OverlayType.VIDEO,
    from: 0,
    durationInFrames: 180,
    row: 0,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    isDragging: false,
    rotation: 0,
    content: 'https://example.com/source.mp4',
    src: 'https://example.com/source.mp4',
    styles: { opacity: 1 },
  } as Overlay;
}

function edl(decisions: EditDecisionList['decisions']): EditDecisionList {
  return {
    projectId: 'p6-test',
    generatedAt: new Date('2026-06-21T00:00:00.000Z'),
    totalDecisions: decisions.length,
    decisions,
    stats: {
      cutsPerMinute: 0,
      transitionCount: 0,
      graphicCount: 0,
      zoomCount: 0,
      speedChangeCount: 0,
      averageConfidence: 0.9,
    },
  };
}

function degradedVjepaAudit() {
  return {
    status: 'warn',
    issues: ['warn:low-vjepa-duration-coverage:55%', 'warn:missing-vjepa-primitives'],
    fps: 30,
    overlayHitRate: 0.52,
    overlayHits: [],
    segmentCoverage: {
      segmentCount: 4,
      spanStartMs: 0,
      spanEndMs: 20_000,
      coveredMs: 12_000,
      gapCount: 2,
      gapTotalMs: 18_000,
      maxGapMs: 17_000,
      coverageRatio: 0.55,
      fieldCoverage: {
        visualSignificance: 0.6,
        motionIntensity: 0.6,
        actionType: 0.3,
        motionType: 0.3,
        faceEmotion: 0,
        eyeContact: 0,
        motionVector: 0.25,
        mainSubject: 0.25,
        textBoxes: 0.25,
        textCoverage: 0.25,
        negativeSpace: 0.25,
        objectCount: 0.25,
        faceCount: 0.25,
      },
    },
  };
}

describe('P6 provider and coverage starvation', () => {
  const originalFreesoundKey = process.env.FREESOUND_API_KEY;
  const originalCuratedPack = process.env.EDITRON_CURATED_SFX_PACK_JSON;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectDocs.clear();
    delete process.env.FREESOUND_API_KEY;
    delete process.env.EDITRON_CURATED_SFX_PACK_JSON;
    mocks.uploadMedia.mockResolvedValue({
      assetId: 'sfx_lib_local',
      signedUrl: 'https://cdn.example.com/sfx_lib_local.mp3',
      gcsPath: null,
      r2Key: 'sfx/local/whoosh.mp3',
      urlExpiresAt: null,
      size: 8,
      contentType: 'audio/mpeg',
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalFreesoundKey) process.env.FREESOUND_API_KEY = originalFreesoundKey;
    else delete process.env.FREESOUND_API_KEY;
    if (originalCuratedPack) process.env.EDITRON_CURATED_SFX_PACK_JSON = originalCuratedPack;
    else delete process.env.EDITRON_CURATED_SFX_PACK_JSON;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('places SFX from a configured curated local pack when Freesound is unavailable', async () => {
    process.env.EDITRON_CURATED_SFX_PACK_JSON = JSON.stringify([{
      id: 'curated-whoosh-1',
      url: 'https://r2.example.com/sfx/whoosh.mp3',
      title: 'Curated cinematic whoosh sweep',
      durationSec: 0.8,
      tags: ['whoosh', 'cinematic', 'transition', 'smooth'],
      rating: 5,
    }]);
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://r2.example.com/sfx/whoosh.mp3');
      return new Response(Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    }));

    const overlays = [videoOverlay()];
    const result = await executeEDL(
      edl([{
        type: 'sfx-trigger',
        frame: 90,
        durationFrames: 24,
        priority: 3,
        source: 'signal-executor:test',
        signal: 'audio.music_beat',
        reason: 'Beat-synced whoosh should materialize from curated pack',
        confidence: 0.95,
        params: {
          sfxType: 'whoosh',
          sfxCue: 'cinematic whoosh sweep',
          beatFrame: 90,
          signals: {
            beat_strength: 0.82,
            music_energy: 0.74,
          },
        },
      }]),
      'p6-curated-sfx-test',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
    );

    const sound = overlays.find((overlay) => overlay.type === 'sound') as any;
    expect(result.overlaysCreated).toBe(1);
    expect(sound).toEqual(expect.objectContaining({
      type: 'sound',
      assetId: 'sfx_lib_local',
    }));
    expect(sound.metadata.sfxAssetQuality).toEqual(expect.objectContaining({
      accepted: true,
      candidateSource: 'curated',
      candidateTitle: 'Curated cinematic whoosh sweep',
    }));
    expect(sound.metadata.sfxAssetQuality.reasons).toContain('curated-source');
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { assetId: 'sfx_lib_local' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          source: 'sfx-provider-local',
          sfxLibrarySource: 'local',
          providerCandidateAccepted: true,
        }),
      }),
      { upsert: true },
    );
  });

  it('rejects visual-only execution when V-JEPA screen context is degraded', async () => {
    mocks.projectDocs.set('p6-vjepa-degraded-test', {
      projectId: 'p6-vjepa-degraded-test',
      intelligence: { vjepaCoverageAudit: degradedVjepaAudit() },
    });

    const overlays = [videoOverlay(2)];
    const result = await executeEDL(
      edl([{
        type: 'zoom',
        frame: 60,
        durationFrames: 30,
        priority: 2,
        source: 'visual-motion-planner:test',
        signal: 'visual.motion_peak',
        reason: 'Pure visual motion signal should not fire when V-JEPA is degraded',
        confidence: 0.95,
        params: {
          signals: {
            visual_significance: 0.91,
            motion_intensity: 0.88,
            motion_vector_x: 0.64,
          },
        },
      }]),
      'p6-vjepa-degraded-test',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
    );

    expect(result.decisionsExecuted).toBe(0);
    expect(result.decisionsSkipped).toBe(1);
    expect(result.rejectedDecisions[0]).toEqual(expect.objectContaining({
      type: 'zoom',
      ruleId: 'VJ-001',
      reason: expect.stringContaining('VJEPA-COVERAGE'),
    }));
    expect(result.decisionExecutionTrace[0]).toEqual(expect.objectContaining({
      outcome: 'guard-rejected',
      ruleId: 'VJ-001',
    }));
    expect(overlays).toHaveLength(1);
  });
});
