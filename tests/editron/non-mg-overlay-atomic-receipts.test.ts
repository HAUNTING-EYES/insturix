import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pipeline/sfx-library-service', () => ({
  isSFXLibraryAvailable: vi.fn(() => true),
  searchAndDownloadSFX: vi.fn(async (
    query: string,
    _userId: string,
    maxDurationSec: number,
    atomicForm: unknown,
    reportSearch?: (report: any) => void,
  ) => {
    reportSearch?.({
      version: 'sfx-library-search-report-v1',
      query,
      maxDurationSec,
      atomicGate: Boolean(atomicForm),
      providerCandidateCount: 1,
      acceptedCandidateCount: 1,
      rejectedCandidateCount: 0,
      selectedCandidate: {
        title: 'Mock provider whoosh',
        durationSec: 0.42,
        score: 0.91,
        accepted: true,
        decision: 'accept',
      },
      candidates: [{
        title: 'Mock provider whoosh',
        durationSec: 0.42,
        score: 0.91,
        accepted: true,
        decision: 'accept',
      }],
    });
    return {
      audioUrl: 'https://cdn.example.com/whoosh.mp3',
      gcsPath: null,
      audioAssetId: 'sfx-whoosh-1',
      durationMs: 420,
      source: 'catalog',
      originalTitle: `Mock catalog ${query}`,
      audioRights: {
        mediaRole: 'sfx',
        source: 'library',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'library-license',
          sourceAssetId: 'sfx-whoosh-1',
          licenseId: 'test-license-1',
        },
      },
    };
  }),
}));

import { scenesToOverlays } from '../../lib/pipeline/scene-to-editron';
import { placeTransitionSFX } from '../../lib/editron/services/transition-sfx-placer';
import { buildOverlayAtomicReceipt } from '../../lib/editron/engine/atomic-overlay-core';
import type { SceneDescriptor } from '../../lib/pipeline/schemas/storyboard';
import { searchAndDownloadSFX } from '@/lib/pipeline/sfx-library-service';
import { resolveMotionTokens } from '../../lib/editron/data/motion-theme-resolver';
import { deriveCodegenKineticSfxEvents } from '../../lib/editron/services/kinetic-sfx-service';

describe('non-MG atomic overlay receipts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps scene-created image, voiceover, and text overlays with atomic receipts', () => {
    const scene: SceneDescriptor = {
      sceneIndex: 0,
      title: 'Hook',
      narration: 'This one change made the entire edit feel alive.',
      visualDescription: 'Founder in a studio pointing at a product screen',
      durationSeconds: 3,
      mood: 'energetic',
      cameraDirection: 'slow push in',
      editDirections: { pacing: 'fast' },
    };

    const overlays = scenesToOverlays(
      [scene],
      { fps: 30, width: 1920, height: 1080 },
      [{ sceneIndex: 0, imageUrl: 'https://cdn.example.com/hook.jpg', assetId: 'image-hook-1' }],
    );

    const image = overlays.find((overlay) => overlay.type === 'image');
    const voiceover = overlays.find((overlay) => overlay.type === 'sound');
    const text = overlays.find((overlay) => overlay.type === 'text');

    expect(image?.metadata.atomicOverlayReceipt.family).toBe('image');
    expect(voiceover?.metadata.atomicOverlayReceipt.family).toBe('sound');
    expect(text?.metadata.atomicOverlayReceipt.family).toBe('text');
    expect(text?.metadata.atomicPlanObserveMode).toBe(true);
    expect(image?.metadata.atomicOverlayReceipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'scene-index', key: 'scene.index', value: 0 }),
      expect.objectContaining({ kind: 'asset-id', key: 'media.asset_id', value: 'image-hook-1' }),
      expect.objectContaining({ kind: 'size-width', key: 'overlay.width', value: 1920 }),
    ]));
    expect(text?.metadata.atomicOverlayReceipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'text-content', key: 'content.text', value: scene.narration }),
      expect.objectContaining({ kind: 'speech-energy', key: 'audio.speech_energy', value: 0.56 }),
      expect.objectContaining({ kind: 'rhythm-density', key: 'rhythm.density', value: 0.82 }),
    ]));
    expect(image?.metadata.atomicOverlayReceipt.form).toEqual(expect.objectContaining({
      version: 'overlay-atomic-form-v1',
      family: 'image',
      role: 'scene-visual',
    }));
    expect(text?.metadata.atomicOverlayReceipt.form).toEqual(expect.objectContaining({
      version: 'overlay-atomic-form-v1',
      family: 'text',
      role: 'readable-message',
    }));
    expect(text?.metadata.atomicOverlayReceipt.form.content.text).toBe(scene.narration);
    expect(text?.metadata.atomicOverlayReceipt.form.timing.durationFrames).toBe(90);
  });

  it('stamps transition-placer SFX with timing, audio, transition, and inherited visual atoms', async () => {
    const transitionReceipt = buildOverlayAtomicReceipt({
      family: 'transition',
      intent: 'topic-shift',
      frame: 60,
      durationFrames: 15,
      signals: {
        visual_significance: 0.84,
        motion_intensity: 0.7,
        visual_motion_type: 'both',
        visual_eye_contact: 1,
        negative_space_right: 0.62,
      },
    });
    const overlays: any[] = [{
      id: 77,
      type: 'transition',
      transitionStyle: 'dissolve',
      from: 60,
      durationInFrames: 15,
      clipAId: 11,
      clipBId: 12,
      metadata: { atomicOverlayReceipt: transitionReceipt },
    }];

    const result = await placeTransitionSFX(overlays, 'user-1', null);
    const sound = overlays.find((overlay) => overlay.type === 'sound');
    const transition = overlays.find((overlay) => overlay.type === 'transition');
    const receipt = sound?.metadata.atomicOverlayReceipt;

    expect(result.placed).toBe(1);
    expect(searchAndDownloadSFX).toHaveBeenCalledWith(
      expect.stringContaining('whoosh'),
      'user-1',
      expect.any(Number),
      expect.objectContaining({
        version: 'atomic-sfx-form-v1',
        compatibilityToken: 'whoosh',
        asset: expect.objectContaining({ primarySearchToken: 'whoosh' }),
      }),
      expect.any(Function),
      undefined,
      undefined,
      expect.objectContaining({
        surface: 'transition',
        confidence: expect.any(Number),
        evidenceKeys: expect.arrayContaining(['transition-surface']),
      }),
    );
    expect(transition?.metadata.transitionSfxPlacement.providerSearchReport).toEqual(expect.objectContaining({
      version: 'sfx-library-search-report-v1',
      providerCandidateCount: 1,
      acceptedCandidateCount: 1,
      selectedCandidate: expect.objectContaining({ decision: 'accept' }),
    }));
    expect(sound.from).toBeLessThan(60);
    expect(sound.durationInFrames).toBe(sound.metadata.atomicSfxForm.timing.durationFrames);
    expect(sound.styles.volume).toBeCloseTo(sound.metadata.atomicSfxForm.mix.volume, 5);
    expect(sound.metadata.atomicSfxForm).toEqual(expect.objectContaining({
      version: 'atomic-sfx-form-v1',
      intent: 'motion-accent',
      compatibilityToken: 'whoosh',
    }));
    expect(sound.metadata.sfxQuery).toContain('whoosh');
    expect(receipt.family).toBe('sfx');
    expect(receipt.visualContext.motionType).toBe('both');
    expect(receipt.payload).toEqual(expect.objectContaining({
      formVersion: 'atomic-sfx-form-v1',
      token: 'whoosh',
      primarySearchToken: 'whoosh',
      sfxIntent: 'motion-accent',
      syncAnchor: 'transition',
    }));
    expect(sound.metadata.atomicSfxForm.timing.syncFrame).toBe(60);
    expect(receipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'audio-hit', key: 'sfx.token', value: 'whoosh' }),
      expect.objectContaining({ kind: 'transition-relation', key: 'transition.overlay_id', value: '77' }),
      expect.objectContaining({ kind: 'volume', key: 'audio.volume', value: sound.styles.volume }),
      expect.objectContaining({ kind: 'duration', key: 'sfx.duration_frames', value: sound.durationInFrames }),
      expect.objectContaining({ kind: 'subject-gaze', key: 'visual.eye_contact', value: true }),
      expect.objectContaining({ kind: 'negative-space-right', key: 'visual.negative_space.right', value: 0.62 }),
    ]));
    expect(receipt.form).toEqual(expect.objectContaining({
      version: 'overlay-atomic-form-v1',
      family: 'sfx',
      role: 'rhythm-punctuation',
    }));
    expect(receipt.form.timing.anchor).toEqual(expect.objectContaining({ kind: 'clip-boundary' }));
    expect(receipt.form.motion).toEqual(expect.objectContaining({ entry: 'audio-hit', curve: 'cut' }));
    expect(sound.metadata.atomicPlanObserveMode).toBe(true);
  });

  it('skips transition SFX when another SFX already owns the same beat', async () => {
    const transitionReceipt = buildOverlayAtomicReceipt({
      family: 'transition',
      intent: 'topic-shift',
      frame: 90,
      durationFrames: 12,
      signals: {
        visual_significance: 0.78,
        motion_intensity: 0.68,
      },
    });
    const overlays: any[] = [
      {
        id: 701,
        type: 'sound',
        from: 82,
        durationInFrames: 18,
        row: 6,
        metadata: {
          source: 'edl-sfx-trigger',
          atomicSfxForm: {
            timing: { syncFrame: 90 },
          },
        },
      },
      {
        id: 702,
        type: 'transition',
        transitionStyle: 'dissolve',
        from: 90,
        durationInFrames: 12,
        clipAId: 31,
        clipBId: 32,
        metadata: { atomicOverlayReceipt: transitionReceipt },
      },
    ];

    const result = await placeTransitionSFX(overlays, 'user-1', null);
    const transition = overlays.find((overlay) => overlay.id === 702);

    expect(result.placed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.skipReasons).toEqual(expect.objectContaining({ 'sfx-too-dense-0f': 1 }));
    expect(overlays.filter((overlay) => overlay.type === 'sound')).toHaveLength(1);
    expect(transition.metadata.transitionSfxPlacement).toEqual(expect.objectContaining({
      version: 'transition-sfx-placement-v1',
      status: 'skipped',
      reason: 'sfx-too-dense-0f',
      policy: 'full',
      style: 'dissolve',
      token: 'whoosh',
      syncFrame: 90,
    }));
    expect(searchAndDownloadSFX).not.toHaveBeenCalled();
  });

  it('records intentional transition SFX suppression when profile policy says silence wins', async () => {
    const transitionReceipt = buildOverlayAtomicReceipt({
      family: 'transition',
      intent: 'documentary-restraint',
      frame: 150,
      durationFrames: 12,
      signals: { visual_significance: 0.7, motion_intensity: 0.4 },
    });
    const overlays: any[] = [{
      id: 705,
      type: 'transition',
      transitionStyle: 'zoom-punch',
      from: 150,
      durationInFrames: 12,
      clipAId: 41,
      clipBId: 42,
      metadata: { atomicOverlayReceipt: transitionReceipt },
    }];

    const result = await placeTransitionSFX(overlays, 'user-1', {
      profileId: 'D-02',
      transitionSFXPolicy: 'off',
    } as any);

    expect(result.placed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.skipReasons).toEqual(expect.objectContaining({ 'profile-policy-off': 1 }));
    expect(overlays.some((overlay) => overlay.type === 'sound')).toBe(false);
    expect(overlays[0].metadata.transitionSfxPlacement).toEqual(expect.objectContaining({
      version: 'transition-sfx-placement-v1',
      status: 'suppressed',
      reason: 'profile-policy-off',
      policy: 'off',
      style: 'zoom-punch',
    }));
    expect(searchAndDownloadSFX).not.toHaveBeenCalled();
  });

  it('uses atomic transition SFX role before legacy transition style fallback', async () => {
    const transitionReceipt = buildOverlayAtomicReceipt({
      family: 'transition',
      intent: 'soft-visual-cut-with-impact',
      frame: 120,
      durationFrames: 12,
      signals: {
        visual_significance: 0.45,
        motion_intensity: 0.2,
      },
    });
    const overlays: any[] = [{
      id: 88,
      type: 'transition',
      transitionStyle: 'soft-cut',
      from: 120,
      durationInFrames: 12,
      clipAId: 21,
      clipBId: 22,
      metadata: {
        atomicOverlayReceipt: transitionReceipt,
        atomicTransitionForm: {
          version: 'atomic-transition-form-v1',
          job: 'emphasize-turn',
          intent: 'impact-transfer',
          evidence: {
            source: 'explicit-boundary-job',
            reasonKeys: ['job:emphasize-turn', 'beat', 'intensity'],
            boundary: { hasAnchor: true, hasReason: true },
          },
          sfxRole: 'impact',
        },
      },
    }];

    const result = await placeTransitionSFX(overlays, 'user-1', null);
    const sound = overlays.find((overlay) => overlay.type === 'sound');
    const transition = overlays.find((overlay) => overlay.id === 88);
    const receipt = sound?.metadata.atomicOverlayReceipt;

    expect(result.placed).toBe(1);
    expect(transition.metadata.transitionSfxPlacement).toEqual(expect.objectContaining({
      version: 'transition-sfx-placement-v1',
      status: 'placed',
      reason: 'placed',
      policy: 'full',
      style: 'soft-cut',
      token: 'impact',
      rule: 'AT-SFX-003',
      searchQuery: sound.metadata.sfxQuery,
      syncFrame: 120,
      soundOverlayId: sound.id,
      assetQualityDecision: 'accept',
    }));
    expect(sound.metadata.token).toBe('impact');
    expect(sound.styles.volume).toBeCloseTo(sound.metadata.atomicSfxForm.mix.volume, 5);
    expect(sound.metadata.atomicSfxForm).toEqual(expect.objectContaining({
      version: 'atomic-sfx-form-v1',
      intent: 'impact-accent',
      compatibilityToken: 'impact',
    }));
    expect(sound.metadata.sfxQuery).toContain('impact');
    expect(receipt.payload).toEqual(expect.objectContaining({
      token: 'impact',
      formVersion: 'atomic-sfx-form-v1',
      sfxRole: 'impact',
      kbRule: 'AT-SFX-003',
      transitionStyle: 'soft-cut',
      transitionJob: 'emphasize-turn',
      transitionIntent: 'impact-transfer',
      transitionEvidenceSource: 'explicit-boundary-job',
      transitionEvidenceReasons: 'job:emphasize-turn|beat|intensity',
    }));
    expect(receipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'audio-hit', key: 'sfx.token', value: 'impact' }),
      expect.objectContaining({ kind: 'transition-relation', key: 'transition.job', value: 'emphasize-turn' }),
      expect.objectContaining({ kind: 'transition-relation', key: 'transition.intent', value: 'impact-transfer' }),
      expect.objectContaining({ kind: 'transition-relation', key: 'transition.evidence_source', value: 'explicit-boundary-job' }),
    ]));
    expect(receipt.form.motion.entry).toBe('audio-hit');
    expect(receipt.form.compatibility.sfxRole).toBe('impact');
  });

  it('places sparse MG SFX on resolved choreography and preserves licensed provenance', async () => {
    const tokens = resolveMotionTokens({
      motion_intensity: 0.9,
      visual_significance: 0.9,
      speech_energy: 0.2,
    } as any, {});
    const makeStatOverlay = (id: number, from: number) => ({
      id,
      type: 'motion-graphic',
      from,
      durationInFrames: 120,
      row: 1,
      recipe: {
        id: `stat-${id}`,
        elements: [{
          primitive: 'text',
          role: 'value',
          animation: 'count-up',
          bind: {},
          enterOrder: 1,
        }],
        layout: { position: 'center' },
        exitStyle: 'reverse-stagger',
      },
      resolvedTokens: tokens,
      content: { value: '42%' },
      contentSignals: {
        motion_intensity: 0.9,
        visual_significance: 0.9,
        speech_energy: 0.2,
      },
      metadata: {
        graphicType: 'stat-counter',
        atomicOverlayPlan: { intensity: { overall: 0.9 } },
      },
    });
    const overlays: any[] = [
      makeStatOverlay(901, 300),
      makeStatOverlay(902, 390),
    ];

    const result = await placeTransitionSFX(overlays, 'user-1', null);
    const sounds = overlays.filter(overlay => overlay.type === 'sound');

    expect(result.placed).toBe(0);
    expect(result.motionGraphics.placed).toBe(1);
    expect(result.motionGraphics.skipped).toBe(1);
    expect(result.motionGraphics.eventKindsUsed).toEqual(['count-settle-tick']);
    expect(result.motionGraphics.skipReasons).toEqual(expect.objectContaining({
      'editorial-sfx-too-dense-90f': 1,
    }));
    expect(sounds).toHaveLength(1);
    expect(sounds[0].metadata.kineticSfxEvent).toEqual(expect.objectContaining({
      version: 'kinetic-sfx-event-v1',
      surface: 'motion-graphic',
      kind: 'count-settle-tick',
      ruleId: 'mapping:sound.sfx_for_editorial_moments',
    }));
    expect(sounds[0].metadata.atomicSfxForm.timing.anchor).toBe('mg-landing');
    expect(sounds[0].audioRights).toEqual(expect.objectContaining({
      mediaRole: 'sfx',
      source: 'library',
      licensed: true,
    }));
    expect(searchAndDownloadSFX).toHaveBeenCalledTimes(1);
  });

  it('materializes a generated MG event only when codegen supplied a landing anchor', async () => {
    const baseInput = {
      candidate: { id: 'fact-quote', factKind: 'quote' },
      window: { startFrame: 600, endFrame: 720, fps: 30 },
      expressiveness: { tier: 'hero', intensity: 0.9, emphasisScale: 1.2 },
    } as any;
    expect(deriveCodegenKineticSfxEvents(baseInput, 9901)).toEqual([]);

    const events = deriveCodegenKineticSfxEvents({
      ...baseInput,
      anchors: { landingFrame: 18 },
    }, 9901, {
      speechEnergy: 0.24,
      evidence: ['policy:subtle', 'profile:D-01', 'speech-source:moment-signals'],
    });
    expect(deriveCodegenKineticSfxEvents({
      ...baseInput,
      anchors: { landingFrame: 18 },
    }, 9901, {
      speechEnergy: 0.9,
      evidence: ['speech-source:moment-signals'],
    })).toEqual([]);
    const overlays: any[] = [{
      id: 9901,
      type: 'mg-sequence',
      from: 600,
      durationInFrames: 120,
      metadata: { kineticSfxEvents: events },
    }];

    const result = await placeTransitionSFX(overlays, 'user-1', null);
    const sound = overlays.find(overlay => overlay.type === 'sound');

    expect(events).toEqual([expect.objectContaining({
      kind: 'quote-card-rustle',
      anchorFrame: 618,
    })]);
    expect(result.motionGraphics.placed).toBe(1);
    expect(sound.metadata.kineticSfxEvent.kind).toBe('quote-card-rustle');
    expect(sound.metadata.atomicSfxForm.timing.syncFrame).toBe(618);
    expect(overlays[0].metadata.kineticSfxPlacement).toEqual(expect.objectContaining({
      version: 'kinetic-sfx-placement-v1',
      status: 'placed',
      soundOverlayId: sound.id,
    }));

    const suppressedOverlays: any[] = [{
      id: 9901,
      type: 'mg-sequence',
      from: 600,
      durationInFrames: 120,
      metadata: { kineticSfxEvents: events },
    }];
    const suppressed = await placeTransitionSFX(suppressedOverlays, 'user-1', {
      profileId: 'D-02',
      transitionSFXPolicy: 'off',
    } as any);
    expect(suppressed.motionGraphics.skipReasons).toEqual({ 'profile-policy-off': 1 });
    expect(suppressedOverlays.some(overlay => overlay.type === 'sound')).toBe(false);
  });
});
