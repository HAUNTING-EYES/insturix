import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: vi.fn(async () => null),
    })),
  })),
}));

vi.mock('@/lib/pipeline/sfx-library-service', () => ({
  isSFXLibraryAvailable: vi.fn(() => true),
  searchAndDownloadSFX: vi.fn(async () => ({
    audioUrl: 'https://cdn.example.com/param-contract-whoosh.mp3',
    gcsPath: 'gs://insturix-test/sfx/param-contract-whoosh.mp3',
    audioAssetId: 'sfx-param-contract-whoosh-1',
    durationMs: 760,
    source: 'freesound',
    originalTitle: 'Clean whoosh sweep',
  })),
}));

import { OverlayType, type Overlay } from '../../components/editron/editor/version-7.0.0/types';
import { executeEDL } from '../../lib/editron/services/edl-executor';
import { normalizeEdlDecisionParams } from '../../lib/editron/services/edl-param-contract';
import { searchAndDownloadSFX } from '../../lib/pipeline/sfx-library-service';
import type { EditDecisionList } from '../../lib/editron/services/reactive-edit-engine';

describe('EDL param contract normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps speedMultiplier into the speed curve handler contract', async () => {
    const overlays = [videoOverlay()];
    const edl = decisionList([{
      type: 'speed-change',
      frame: 45,
      durationFrames: 30,
      confidence: 0.95,
      params: { speedMultiplier: 1.8 },
    }]);

    const result = await executeEDL(edl, 'edl-param-speed-test', 'user-1', overlays, { width: 1920, height: 1080 });
    const speedCurve = (overlays[0] as any).speedCurve;

    expect(result.decisionsExecuted).toBe(1);
    expect(speedCurve.map((point: any) => point.value)).toContain(1.8);
    expect(speedCurve.map((point: any) => point.value)).not.toContain(0.5);
  });

  it('maps pixel shake intensity into the camera-shake handler contract', async () => {
    const overlays = [videoOverlay({ width: 1200 })];
    const edl = decisionList([{
      type: 'camera-shake',
      frame: 45,
      durationFrames: 8,
      confidence: 0.95,
      params: { intensity_px: 12 },
    }]);

    const result = await executeEDL(edl, 'edl-param-shake-test', 'user-1', overlays, { width: 1200, height: 675 });
    const receipt = ((overlays[0] as any).metadata?.atomicOverlayReceipts ?? [])
      .find((item: any) => item.family === 'camera-shake');

    expect(result.decisionsExecuted).toBe(1);
    expect(receipt?.payload.intensity).toBeCloseTo(1, 5);
    expect(receipt?.payload.maxOffset).toBeCloseTo(12, 5);
  });

  it('keeps caption-emphasis in the caption layer using targetWord aliases', async () => {
    const overlays = [
      videoOverlay(),
      captionOverlay(),
    ];
    const edl = decisionList([{
      type: 'caption-emphasis',
      frame: 30,
      durationFrames: 20,
      confidence: 0.95,
      params: { targetWord: 'process', scale: 1.4 },
    }]);

    const result = await executeEDL(edl, 'edl-param-caption-test', 'user-1', overlays, { width: 1920, height: 1080 });
    const caption = overlays.find((overlay) => overlay.type === OverlayType.CAPTION) as any;
    const processWord = caption.captions[0].words.find((word: any) => word.word === 'process');

    expect(result.decisionsExecuted).toBe(1);
    expect(result.overlaysCreated).toBe(0);
    expect(result.overlaysModified).toBe(1);
    expect(processWord.emphasis).toEqual({ type: 'keyword', source: 'signal-executor:test' });
    expect(caption.metadata.captionEmphasisDecisions[0]).toEqual(expect.objectContaining({
      word: 'process',
      frame: 30,
    }));
  });

  it('maps sfx_whoosh type aliases into the SFX resolver cue contract', async () => {
    const overlays = [videoOverlay()];
    const edl = decisionList([{
      type: 'sfx-trigger',
      frame: 90,
      durationFrames: 24,
      confidence: 0.95,
      technique: 'technique:sound.sfx_whoosh',
      params: {
        type: 'sfx_whoosh',
        signals: {
          motion_intensity: 0.86,
          visual_significance: 0.62,
          speech_energy: 0.24,
          beat_strength: 0.44,
          text_on_screen: 0.1,
          restraint: 0.15,
        },
      },
    }]);

    const result = await executeEDL(edl, 'edl-param-sfx-test', 'user-1', overlays, { width: 1920, height: 1080 });
    const sound = overlays.find((overlay) => overlay.type === OverlayType.SOUND) as any;

    expect(result.overlaysCreated).toBe(1);
    expect(sound.metadata.sfxType).toBe('whoosh');
    expect(sound.metadata.atomicSfxForm.compatibilityToken).toBe('whoosh');
    expect(searchAndDownloadSFX).toHaveBeenCalledWith(
      expect.stringContaining('whoosh'),
      'user-1',
      expect.any(Number),
      expect.objectContaining({ compatibilityToken: 'whoosh' }),
    );
  });

  it('executes explicit filter-change decisions with live dispatch', async () => {
    const overlays = [videoOverlay()];
    const edl = decisionList([{
      type: 'filter-change',
      frame: 45,
      durationFrames: 30,
      confidence: 0.95,
      params: { filterCss: 'brightness(1.08) contrast(1.04)' },
    }]);

    const result = await executeEDL(edl, 'edl-param-filter-test', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(result.decisionsExecuted).toBe(1);
    expect(result.overlaysModified).toBe(1);
    expect((overlays[0] as any).styles.filter).toBe('brightness(1.08) contrast(1.04)');
  });

  it('skips filter-change decisions without explicit filter params', async () => {
    const overlays = [videoOverlay()];
    const edl = decisionList([{
      type: 'filter-change',
      frame: 45,
      durationFrames: 30,
      confidence: 0.95,
      reason: 'make this warmer from prose only',
      params: {},
    }]);

    const result = await executeEDL(edl, 'edl-param-filter-prose-test', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(result.decisionsExecuted).toBe(0);
    expect(result.decisionsSkipped).toBe(1);
    expect((overlays[0] as any).styles.filter).toBeUndefined();
  });

  it('accepts pacing as an informational no-op rather than dead dispatch', async () => {
    const overlays = [videoOverlay()];
    const edl = decisionList([{
      type: 'pacing',
      frame: 45,
      durationFrames: 30,
      confidence: 0.95,
      params: { pacingMultiplier: 0.85 },
    }]);

    const result = await executeEDL(edl, 'edl-param-pacing-test', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(result.decisionsExecuted).toBe(1);
    expect(result.overlaysCreated).toBe(0);
    expect(result.overlaysModified).toBe(0);
    expect(result.rejectedDecisions).toEqual([]);
  });

  it('executes fade decisions with opacity keyframes and atomic receipt', async () => {
    const overlays = [videoOverlay()];
    const edl = decisionList([{
      type: 'fade',
      frame: 45,
      durationFrames: 20,
      confidence: 0.95,
      params: { fromOpacity: 1, toOpacity: 0.25 },
    }]);

    const result = await executeEDL(edl, 'edl-param-fade-test', 'user-1', overlays, { width: 1920, height: 1080 });
    const opacityTrack = ((overlays[0] as any).keyframeTracks ?? [])
      .find((track: any) => track.property === 'opacity');
    const receipt = ((overlays[0] as any).metadata?.atomicOverlayReceipts ?? [])
      .find((item: any) => item.family === 'fade');

    expect(result.decisionsExecuted).toBe(1);
    expect(result.overlaysModified).toBe(1);
    expect(opacityTrack?.keyframes).toEqual([
      { frame: 45, value: 1, easing: 'ease-in-out' },
      { frame: 65, value: 0.25, easing: 'linear' },
    ]);
    expect(receipt?.payload).toEqual(expect.objectContaining({
      fromOpacity: 1,
      toOpacity: 0.25,
    }));
  });
  it('applies audio-duck when a BGM overlay exists', async () => {
    const overlays = [
      videoOverlay(),
      soundOverlay(),
    ];
    const edl = decisionList([{
      type: 'audio-duck',
      frame: 45,
      durationFrames: 30,
      confidence: 0.95,
      params: { duckLevel: 0.18, rampDownMs: 120, rampUpMs: 240 },
    }]);

    const result = await executeEDL(edl, 'edl-param-audio-duck-test', 'user-1', overlays, { width: 1920, height: 1080 });
    const bgm = overlays.find((overlay) => overlay.type === OverlayType.SOUND) as any;

    expect(result.decisionsExecuted).toBe(1);
    expect(result.overlaysModified).toBe(1);
    expect(bgm.styles.duckingConfig).toEqual(expect.objectContaining({
      enabled: true,
      duckLevel: 0.18,
      rampDownMs: 120,
      rampUpMs: 240,
    }));
  });
  it('normalizes producer aliases without inventing unsupported values', () => {
    expect(normalizeEdlDecisionParams('speed-change', { speed: '180%' })).toEqual(expect.objectContaining({
      speedFrom: 1,
      speedTo: 1.8,
      speedBack: 1,
    }));
    expect(normalizeEdlDecisionParams('sfx-trigger', { type: 'sfx_whoosh' })).toEqual(expect.objectContaining({
      sfxType: 'whoosh',
      sfxCue: 'whoosh',
    }));
    expect(normalizeEdlDecisionParams('sfx-trigger', { type: 'unknown_library_slug' })).toEqual({
      type: 'unknown_library_slug',
    });
  });
});

function decisionList(decisions: Array<Record<string, any>>): EditDecisionList {
  return {
    projectId: 'edl-param-contract-test',
    generatedAt: new Date('2026-06-21T00:00:00.000Z'),
    totalDecisions: decisions.length,
    decisions: decisions.map((decision, index) => ({
      priority: 3,
      source: 'signal-executor:test',
      signal: 'test',
      reason: 'param contract test',
      ...decision,
      id: decision.id ?? `decision-${index}`,
    })) as any,
    stats: {
      cutsPerMinute: 0,
      transitionCount: 0,
      graphicCount: 0,
      zoomCount: 0,
      speedChangeCount: decisions.filter((decision) => decision.type === 'speed-change').length,
      averageConfidence: 0.95,
    },
  };
}

function videoOverlay(overrides: Partial<Overlay> = {}): Overlay {
  return {
    id: 501,
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
    ...overrides,
  } as Overlay;
}

function soundOverlay(): Overlay {
  return {
    id: 601,
    type: OverlayType.SOUND,
    from: 0,
    durationInFrames: 180,
    row: 1,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    isDragging: false,
    rotation: 0,
    assetId: 'bgm_param_contract_test',
    content: 'https://example.com/bgm.mp3',
    src: 'https://example.com/bgm.mp3',
    styles: { opacity: 1 },
  } as any;
}
function captionOverlay(): Overlay {
  const words = [
    { word: 'trust', startMs: 0, endMs: 350, confidence: 1 },
    { word: 'the', startMs: 360, endMs: 520, confidence: 1 },
    { word: 'process', startMs: 700, endMs: 1220, confidence: 1 },
  ];
  return {
    id: 701,
    type: OverlayType.CAPTION,
    from: 0,
    durationInFrames: 180,
    row: 6,
    left: 360,
    top: 760,
    width: 1200,
    height: 180,
    isDragging: false,
    rotation: 0,
    captions: [{
      text: 'trust the process',
      startMs: 0,
      endMs: 1600,
      timestampMs: 0,
      confidence: 1,
      words: words.map((word) => ({ ...word })),
    }],
    words: words.map((word) => ({ ...word })),
    displayConfig: {
      mode: 'karaoke',
      wordsPerGroup: 3,
      maxWordsPerLine: 3,
      showPreviousWords: true,
      fadeOutPreviousWords: true,
    },
    styles: {
      opacity: 1,
      color: '#ffffff',
      fontSize: '48px',
      fontWeight: 600,
      highlight: {
        color: '#facc15',
        backgroundColor: 'rgba(0,0,0,0.72)',
        scale: 1.2,
        effect: 'box',
        animation: 'scale',
      },
    },
    metadata: { source: 'canonical-caption-track' },
  } as any;
}
