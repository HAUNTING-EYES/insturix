import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pipeline/sfx-library-service', () => ({
  isSFXLibraryAvailable: vi.fn(() => true),
  searchAndDownloadSFX: vi.fn(async () => ({
    audioUrl: 'https://cdn.example.com/atomic-whoosh.mp3',
    gcsPath: 'gs://insturix-test/sfx/atomic-whoosh.mp3',
    audioAssetId: 'sfx-atomic-whoosh-1',
    durationMs: 900,
    source: 'freesound',
    originalTitle: 'Cinematic whoosh sweep transition',
  })),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: vi.fn(async () => null),
    })),
  })),
}));

import { searchAndDownloadSFX } from '@/lib/pipeline/sfx-library-service';
import { executeEDL } from '../../lib/editron/services/edl-executor';
import type { EditDecisionList } from '../../lib/editron/services/reactive-edit-engine';
import { OverlayType, type Overlay } from '../../components/editron/editor/version-7.0.0/types';

describe('EDL atomic SFX form wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('places sfx-trigger overlays from atomic SFX timing, mix, query, and metadata', async () => {
    const overlays: Overlay[] = [{
      id: 501,
      type: OverlayType.VIDEO,
      from: 0,
      durationInFrames: 180,
      row: 2,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      isDragging: false,
      rotation: 0,
      content: 'https://example.com/source.mp4',
      src: 'https://example.com/source.mp4',
      styles: { opacity: 1 },
    } as Overlay];

    const edl: EditDecisionList = {
      projectId: 'edl-atomic-sfx-form-test',
      generatedAt: new Date('2026-06-07T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'sfx-trigger',
        frame: 90,
        durationFrames: 24,
        priority: 3,
        source: 'signal-executor:test',
        signal: 'motion_peak',
        reason: 'Motion accent should get a tasteful whoosh',
        confidence: 0.95,
        params: {
          sfxType: 'whoosh',
          signals: {
            motion_intensity: 0.86,
            visual_significance: 0.62,
            speech_energy: 0.24,
            beat_strength: 0.44,
            text_on_screen: 0.1,
            restraint: 0.15,
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 0,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.95,
      },
    };

    const result = await executeEDL(edl, 'edl-atomic-sfx-form-test', 'user-1', overlays, { width: 1920, height: 1080 });
    const sound = overlays.find((overlay) => overlay.type === 'sound') as any;
    const form = sound?.metadata?.atomicSfxForm;
    const receipt = sound?.metadata?.atomicOverlayReceipt;

    expect(result.overlaysCreated).toBe(1);
    expect(form).toEqual(expect.objectContaining({
      version: 'atomic-sfx-form-v1',
      intent: 'motion-accent',
      compatibilityToken: 'whoosh',
    }));
    expect(searchAndDownloadSFX).toHaveBeenCalledWith(
      expect.stringContaining('whoosh'),
      'user-1',
      form.asset.maxDurationSec,
      expect.objectContaining({
        version: 'atomic-sfx-form-v1',
        compatibilityToken: 'whoosh',
        asset: expect.objectContaining({ primarySearchToken: 'whoosh' }),
      }),
    );
    expect(sound.from).toBe(form.timing.startFrame);
    expect(sound.from).toBeLessThan(90);
    expect(sound.durationInFrames).toBe(form.timing.durationFrames);
    expect(sound.audioStartFrame).toBe(form.timing.startFrame);
    expect(sound.audioEndFrame).toBe(form.timing.endFrame);
    expect(sound.styles.volume).toBeCloseTo(form.mix.volume, 5);
    expect(sound.metadata.sfxQuery).toContain('whoosh');
    expect(sound.metadata.sfxAssetQuality).toEqual(expect.objectContaining({
      accepted: true,
      decision: 'accept',
      candidateSource: 'library',
      candidateTitle: 'Cinematic whoosh sweep transition',
    }));
    expect(receipt.payload).toEqual(expect.objectContaining({
      formVersion: 'atomic-sfx-form-v1',
      sfxType: 'whoosh',
      sfxIntent: 'motion-accent',
      primarySearchToken: 'whoosh',
      searchQuery: sound.metadata.sfxQuery,
      assetQualityDecision: 'accept',
      assetTitle: 'Cinematic whoosh sweep transition',
    }));
    expect(receipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'audio-hit', key: 'sfx.token', value: 'whoosh' }),
      expect.objectContaining({ kind: 'duration', key: 'sfx.duration_frames', value: form.timing.durationFrames }),
      expect.objectContaining({ kind: 'volume', key: 'audio.volume', value: form.mix.volume }),
      expect.objectContaining({ kind: 'audio-hit', key: 'audio.asset_quality' }),
    ]));
    expect(JSON.stringify(form)).not.toContain('presetId');
    expect(JSON.stringify(form)).not.toContain('templateId');
  });

  it('places transition SFX on the transition sync frame when boundary atoms are present', async () => {
    const overlays: Overlay[] = [
      {
        id: 601,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 120,
        row: 2,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source-a.mp4',
        src: 'https://example.com/source-a.mp4',
        styles: { opacity: 1 },
      } as Overlay,
      {
        id: 602,
        type: OverlayType.VIDEO,
        from: 120,
        durationInFrames: 90,
        row: 2,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source-b.mp4',
        src: 'https://example.com/source-b.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'edl-transition-sfx-sync-test',
      generatedAt: new Date('2026-06-07T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'sfx-trigger',
        frame: 90,
        durationFrames: 18,
        priority: 3,
        source: 'signal-executor:test',
        signal: 'transition_boundary',
        reason: 'Transition SFX should land on the actual boundary, not rough decision frame',
        confidence: 0.96,
        params: {
          sfxType: 'whoosh',
          sfxAnchor: 'transition',
          transitionFrame: 120,
          signals: {
            motion_intensity: 0.78,
            beat_strength: 0.5,
            speech_energy: 0.3,
            visual_significance: 0.64,
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 0,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.96,
      },
    };

    const result = await executeEDL(edl, 'edl-transition-sfx-sync-test', 'user-1', overlays, { width: 1920, height: 1080 });
    const sound = overlays.find((overlay) => overlay.type === 'sound') as any;

    expect(result.overlaysCreated).toBe(1);
    expect(sound.metadata.atomicSfxForm.timing.anchor).toBe('transition');
    expect(sound.metadata.sfxSyncFrame).toBe(120);
    expect(sound.metadata.sfxStartFrame).toBeLessThan(120);
    expect(searchAndDownloadSFX).toHaveBeenCalledWith(
      expect.stringContaining('whoosh'),
      'user-1',
      expect.any(Number),
      expect.objectContaining({
        timing: expect.objectContaining({ anchor: 'transition', syncFrame: 120 }),
      }),
    );
  });

  it('skips transition-anchored sfx triggers that are not synced to a real cut or transition', async () => {
    const overlays: Overlay[] = [{
      id: 501,
      type: OverlayType.VIDEO,
      from: 0,
      durationInFrames: 180,
      row: 2,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      isDragging: false,
      rotation: 0,
      content: 'https://example.com/source.mp4',
      src: 'https://example.com/source.mp4',
      styles: { opacity: 1 },
    } as Overlay];

    const edl: EditDecisionList = {
      projectId: 'edl-detached-transition-sfx-test',
      generatedAt: new Date('2026-06-07T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'sfx-trigger',
        frame: 90,
        durationFrames: 18,
        priority: 3,
        source: 'signal-executor:test',
        signal: 'topic_shift',
        reason: 'Detached topic shift should not create random transition SFX',
        confidence: 0.96,
        params: {
          sfxType: 'impact',
          signals: {
            topic_shift: 0.9,
            speech_energy: 0.72,
            visual_significance: 0.62,
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 0,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.96,
      },
    };

    const result = await executeEDL(edl, 'edl-detached-transition-sfx-test', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(result.overlaysCreated).toBe(0);
    expect(overlays.some((overlay) => overlay.type === 'sound')).toBe(false);
    expect(searchAndDownloadSFX).not.toHaveBeenCalled();
  });

  it('does not infer transition SFX ownership from a generic topic-shift sound at a cut boundary', async () => {
    const overlays: Overlay[] = [
      {
        id: 701,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 120,
        row: 2,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source-a.mp4',
        src: 'https://example.com/source-a.mp4',
        styles: { opacity: 1 },
      } as Overlay,
      {
        id: 702,
        type: OverlayType.VIDEO,
        from: 120,
        durationInFrames: 120,
        row: 2,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/source-b.mp4',
        src: 'https://example.com/source-b.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const edl: EditDecisionList = {
      projectId: 'edl-generic-sfx-at-cut-test',
      generatedAt: new Date('2026-06-07T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'sfx-trigger',
        frame: 120,
        durationFrames: 18,
        priority: 3,
        source: 'creative-brief:vocal_peak:word',
        signal: 'topic_shift',
        reason: 'Generic topic/vocal accent should not become transition-owned SFX by proximity',
        confidence: 0.96,
        params: {
          sfxType: 'impact',
          signals: {
            topic_shift: 0.92,
            speech_energy: 0.78,
            visual_significance: 0.62,
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 0,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.96,
      },
    };

    const result = await executeEDL(edl, 'edl-generic-sfx-at-cut-test', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(result.overlaysCreated).toBe(0);
    expect(overlays.some((overlay) => overlay.type === 'sound')).toBe(false);
    expect(searchAndDownloadSFX).not.toHaveBeenCalled();
  });
});
