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
    inspectEncodedSfxAudio: vi.fn(),
    projectDocs,
    updateOne,
    uploadMedia: vi.fn(),
  };
});

vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadMedia: mocks.uploadMedia,
}));

vi.mock('@/lib/pipeline/audio-conditioning', () => ({
  inspectEncodedSfxAudio: mocks.inspectEncodedSfxAudio,
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

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectDocs.clear();
    delete process.env.FREESOUND_API_KEY;
    mocks.inspectEncodedSfxAudio.mockResolvedValue({
      durationMs: 800,
      sampleRate: 48_000,
      channels: 2,
      loudness: { metric: 'integrated-lufs', valueDb: -18 },
      truePeakDbtp: -3,
      clippingRisk: false,
    });
    mocks.uploadMedia.mockResolvedValue({
      assetId: 'sfx_lib_freesound',
      signedUrl: 'https://cdn.example.com/sfx_lib_freesound.mp3',
      gcsPath: null,
      r2Key: 'sfx/freesound/whoosh.mp3',
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('places SFX from provider search without a curated local pack', async () => {
    process.env.FREESOUND_API_KEY = 'test-freesound-key';
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.startsWith('https://freesound.org/apiv2/search/')) {
        expect(href).toContain('query=whoosh');
        expect(href).toContain('fields=id%2Cname%2Cduration%2Cpreviews%2Clicense%2Ctags%2Cavg_rating');
        return new Response(JSON.stringify({
          results: [{
            id: 42,
            name: 'Cinematic whoosh sweep transition',
            duration: 0.8,
            previews: { 'preview-hq-mp3': 'https://cdn.freesound.example/whoosh.mp3' },
            license: 'Creative Commons 0',
            tags: ['whoosh', 'cinematic', 'transition', 'smooth'],
            avg_rating: 4.8,
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      expect(href).toBe('https://cdn.freesound.example/whoosh.mp3');
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
        reason: 'Beat-synced whoosh should materialize from provider search',
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
      'p6-provider-sfx-test',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
    );

    const sound = overlays.find((overlay) => overlay.type === 'sound') as any;
    expect(result.overlaysCreated).toBe(1);
    expect(sound).toEqual(expect.objectContaining({
      type: 'sound',
      assetId: 'sfx_lib_freesound',
    }));
    expect(sound.metadata.sfxAssetQuality).toEqual(expect.objectContaining({
      accepted: true,
      candidateSource: 'library',
      candidateTitle: 'Cinematic whoosh sweep transition',
    }));
    expect(sound.metadata.sfxAssetQuality.reasons).not.toContain('curated-source');
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { assetId: 'sfx_lib_freesound' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          source: 'sfx-provider-freesound',
          sfxLibrarySource: 'freesound',
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
