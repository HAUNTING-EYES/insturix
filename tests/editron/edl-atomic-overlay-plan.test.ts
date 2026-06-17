import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pipeline/sfx-library-service', () => ({
  audioDescriptionToSearchQuery: vi.fn((description: string) => description),
  isSFXLibraryAvailable: vi.fn(() => false),
  searchAndDownloadSFX: vi.fn(async () => null),
}));

vi.mock('@/lib/editron/services/motion-graphics-service', () => ({
  findBestTemplate: vi.fn(async () => null),
}));

vi.mock('@/lib/editron/data/transition-templates', () => ({
  DEFAULT_TRANSITION_FRAMES: {
    dissolve: 36,
    'soft-cut': 15,
  },
  createTrueDissolve: vi.fn((outgoing: any, incoming: any) => ({
    outgoing,
    incoming,
  })),
}));

import { executeEDL } from '../../lib/editron/services/edl-executor';
import { DEFAULT_CONFIG } from '../../lib/editron/config/editron-config';
import {
  applyAtomicMotionTracks,
  applyAtomicRenderDecision,
  applyAtomicStyleAtoms,
  findAtomicElement,
} from '../../lib/editron/motion-graphics/engine/composition-renderer';
import type { EditDecisionList } from '../../lib/editron/services/reactive-edit-engine';
import { OverlayType, type Overlay } from '../../components/editron/editor/version-7.0.0/types';
import type { AnimationState } from '../../lib/editron/motion-graphics/engine/primitive-renderers';
import type { ComputedChoreography, ResolvedElement } from '../../lib/editron/motion-graphics/engine/recipe-types';

const originalUseCompositionEngine = DEFAULT_CONFIG.features?.useCompositionEngine;

afterEach(() => {
  if (DEFAULT_CONFIG.features) {
    DEFAULT_CONFIG.features.useCompositionEngine = originalUseCompositionEngine;
  }
  vi.restoreAllMocks();
});

describe('EDL executor atomic overlay observe mode', () => {
  it('blocks a third repeated visible transition unless the boundary is montage-mode', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const overlays: Overlay[] = Array.from({ length: 4 }, (_, index) => ({
      id: 100 + index,
      type: OverlayType.VIDEO,
      from: index * 60,
      durationInFrames: 60,
      row: 0,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      isDragging: false,
      rotation: 0,
      content: `https://example.com/clip-${index}.mp4`,
      src: `https://example.com/clip-${index}.mp4`,
      styles: { opacity: 1 },
    })) as Overlay[];

    const repeatedMotionSignals = {
      motion_vector_y: -0.72,
      motion_intensity: 0.74,
      visual_significance: 0.7,
      text_on_screen: 0,
    };
    const edl: EditDecisionList = {
      projectId: 'transition-repetition-memory',
      generatedAt: new Date('2026-06-17T00:00:00.000Z'),
      totalDecisions: 3,
      decisions: [60, 120, 180].map((frame) => ({
        type: 'transition',
        frame,
        durationFrames: 15,
        priority: 2,
        source: 'signal-planner:test',
        signal: 'boundary_motion_transfer',
        reason: 'same repeated motion boundary job',
        confidence: 0.94,
        params: {
          transitionType: 'hard-cut',
          transitionJob: 'match-motion',
          signals: repeatedMotionSignals,
        },
      })),
      stats: {
        cutsPerMinute: 0,
        transitionCount: 3,
        graphicCount: 0,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.94,
      },
    };

    const result = await executeEDL(
      edl,
      'transition-repetition-memory',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
    );

    const transitions = overlays.filter((overlay) => overlay.type === 'transition') as any[];
    expect(result.overlaysCreated).toBe(2);
    expect(transitions).toHaveLength(2);
    expect(transitions.map((overlay) => overlay.transitionStyle)).toEqual(['slide-up', 'slide-up']);
  });

  it('allows repeated visible transitions for intentional montage-mode runs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const overlays: Overlay[] = Array.from({ length: 4 }, (_, index) => ({
      id: 200 + index,
      type: OverlayType.VIDEO,
      from: index * 60,
      durationInFrames: 60,
      row: 0,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      isDragging: false,
      rotation: 0,
      content: `https://example.com/montage-${index}.mp4`,
      src: `https://example.com/montage-${index}.mp4`,
      styles: { opacity: 1 },
    })) as Overlay[];

    const edl: EditDecisionList = {
      projectId: 'transition-montage-uniformity',
      generatedAt: new Date('2026-06-17T00:00:00.000Z'),
      totalDecisions: 3,
      decisions: [60, 120, 180].map((frame) => ({
        type: 'transition',
        frame,
        durationFrames: 15,
        priority: 2,
        source: 'signal-planner:test',
        signal: 'boundary_motion_transfer',
        reason: 'intentional montage transition rhythm',
        confidence: 0.94,
        params: {
          transitionType: 'hard-cut',
          transitionJob: 'match-motion',
          signals: {
            motion_vector_y: -0.72,
            motion_intensity: 0.74,
            visual_significance: 0.7,
            text_on_screen: 0,
            'composite.montage_mode': 1,
          },
        },
      })),
      stats: {
        cutsPerMinute: 0,
        transitionCount: 3,
        graphicCount: 0,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.94,
      },
    };

    const result = await executeEDL(
      edl,
      'transition-montage-uniformity',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
    );

    const transitions = overlays.filter((overlay) => overlay.type === 'transition') as any[];
    expect(result.overlaysCreated).toBe(3);
    expect(transitions).toHaveLength(3);
    expect(transitions.map((overlay) => overlay.transitionStyle)).toEqual(['slide-up', 'slide-up', 'slide-up']);
  });

  it('attaches shared atomic receipts to non-MG overlay families', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const overlays: Overlay[] = [
      {
        id: 101,
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 120,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/a.mp4',
        src: 'https://example.com/a.mp4',
        styles: { opacity: 1 },
      } as Overlay,
      {
        id: 102,
        type: OverlayType.VIDEO,
        from: 120,
        durationInFrames: 120,
        row: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isDragging: false,
        rotation: 0,
        content: 'https://example.com/b.mp4',
        src: 'https://example.com/b.mp4',
        styles: { opacity: 1 },
      } as Overlay,
    ];

    const sharedSignals = {
      visual_significance: 0.88,
      motion_intensity: 0.74,
      motion_vector_x: -0.64,
      motion_vector_y: 0.12,
      visual_motion_type: 'both',
      visual_action_type: 'gesturing',
      visual_face_emotion: 'surprised',
      visual_eye_contact: 1,
      shot_scale: 0.85,
      main_subject_x: 0.78,
      main_subject_y: 0.42,
      main_subject_width: 0.22,
      main_subject_height: 0.34,
      text_on_screen: 0,
    };

    const edl: EditDecisionList = {
      projectId: 'non-mg-atomic-project',
      generatedAt: new Date('2026-06-04T00:00:00.000Z'),
      totalDecisions: 4,
      decisions: [
        {
          type: 'zoom',
          frame: 45,
          durationFrames: 18,
          priority: 3,
          source: 'creative-brief:test',
          signal: 'emphasis_word',
          reason: 'speaker hits a point',
          confidence: 0.95,
          params: { signals: sharedSignals },
        },
        {
          type: 'fade',
          frame: 70,
          durationFrames: 12,
          priority: 2,
          source: 'creative-brief:test',
          signal: 'narrative_resolve',
          reason: 'soft release',
          confidence: 0.9,
          params: { fromOpacity: 1, toOpacity: 0.65, signals: sharedSignals },
        },
        {
          type: 'camera-shake',
          frame: 80,
          durationFrames: 8,
          priority: 2,
          source: 'creative-brief:test',
          signal: 'energy_peak',
          reason: 'impact beat',
          confidence: 0.92,
          params: { intensity: 0.35, signals: sharedSignals },
        },
        {
          type: 'transition',
          frame: 120,
          durationFrames: 15,
          priority: 2,
          source: 'creative-brief:test',
          signal: 'topic_shift',
          reason: 'topic boundary',
          confidence: 0.9,
          params: { transitionType: 'soft-cut', signals: sharedSignals },
        },
      ],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 1,
        graphicCount: 0,
        zoomCount: 1,
        speedChangeCount: 0,
        averageConfidence: 0.92,
      },
    };

    const result = await executeEDL(
      edl,
      'non-mg-atomic-project',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
      undefined,
      'moderate',
    );

    const videoReceipts = ((overlays[0] as any).metadata?.atomicOverlayReceipts ?? []) as any[];
    const transition = overlays.find((overlay) => overlay.type === OverlayType.TRANSITION) as any;
    const transitionReceipt = transition?.metadata?.atomicOverlayReceipt;

    expect(result.decisionsExecuted).toBe(4);
    expect(videoReceipts.map((receipt) => receipt.family)).toEqual(expect.arrayContaining([
      'zoom',
      'fade',
      'camera-shake',
    ]));
    expect(videoReceipts.find((receipt) => receipt.family === 'zoom').atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'scale-delta', key: 'zoom.scale_delta' }),
      expect.objectContaining({ kind: 'focal-x', key: 'zoom.focal_x', value: 0.78, source: 'derived-signal' }),
      expect.objectContaining({ kind: 'focal-y', key: 'zoom.focal_y', value: 0.42, source: 'derived-signal' }),
      expect.objectContaining({ kind: 'subject-action', key: 'visual.action_type', value: 'gesturing', source: 'vjepa' }),
    ]));
    const zoomReceipt = videoReceipts.find((receipt) => receipt.family === 'zoom');
    expect(zoomReceipt.payload.scaleDelta).toBeLessThanOrEqual(0.14);
    expect(zoomReceipt.payload.scaleTo).toBeLessThan(1.15);
    expect(Math.abs(zoomReceipt.payload.panX)).toBeGreaterThan(0);
    expect(typeof zoomReceipt.payload.panY).toBe('number');
    expect((overlays[0] as any).styles.transformOrigin).toBe('78% 42%');
    expect(videoReceipts.find((receipt) => receipt.family === 'camera-shake').visualContext.motionType).toBe('both');
    expect(transitionReceipt.family).toBe('transition');
    expect(transitionReceipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'transition-relation', key: 'transition.clip_pair', value: '101->102' }),
      expect.objectContaining({ kind: 'motion-vector-x', key: 'visual.motion_vector.x', value: -0.64, source: 'vjepa' }),
      expect.objectContaining({ kind: 'subject-gaze', key: 'visual.eye_contact', value: true, source: 'vjepa' }),
    ]));
    expect(transition.metadata.atomicTransitionForm.direction.label).toBe('left');
    expect(transition.metadata.atomicPlanObserveMode).toBe(true);
  });

  it('attaches an atomic overlay plan to composition-engine motion graphics', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const overlays: Overlay[] = [{
      id: 1,
      type: OverlayType.VIDEO,
      from: 0,
      durationInFrames: 300,
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
    } as Overlay];

    const edl: EditDecisionList = {
      projectId: 'atomic-plan-project',
      generatedAt: new Date('2026-06-04T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'graphic',
        frame: 30,
        durationFrames: 90,
        priority: 3,
        source: 'test',
        signal: 'statistic_detected',
        reason: 'conversion lift moment',
        confidence: 0.95,
        params: {
          graphicType: 'stat-counter',
          value: '47%',
          label: 'conversion lift',
          brand: {
            accentColor: '#00ff00',
            primaryColor: '#f8f8f8',
            headingFont: 'Inter',
            bodyFont: 'Inter',
            monoFont: 'JetBrains Mono',
          },
          signals: {
            formality: 0.2,
            enthusiasm: 0.95,
            warmth: 0.35,
            emotional_arousal: 0.85,
            pacing_velocity: 0.8,
            humor: 0.15,
            visceral_impact: 0.75,
            visual_dependency: 0.85,
            cinematic_moment: 0.8,
          },
          mgOverlayScores: {
            'mg.animation.entrance_slide': { score: 0.9, values: {} },
            'mg.animation.hold_pulse': { score: 0.9, values: {} },
            'mg.typography.font_size': { score: 0.8, values: { fontSize: 96 } },
            'mg.typography.line_height': { score: 0.6, values: { lineHeight: 1.08 } },
            'mg.emphasis.scale_contrast': { score: 0.7, values: { scaleContrast: 2.1 } },
          },
          placementAdjustment: {
            candidateRegion: 'top-right',
            multiplier: 1.1,
            penalty: 0,
            bonus: 0.18,
            avoidHits: [],
            preferHits: ['negative-space'],
            constraints: ['protect-human-attention'],
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.95,
      },
    };

    const result = await executeEDL(
      edl,
      'atomic-plan-project',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
      undefined,
      'moderate',
    );

    const motionGraphic = overlays.find((overlay) => overlay.type === OverlayType.MOTION_GRAPHIC) as any;
    const atomicPlan = motionGraphic?.metadata?.atomicOverlayPlan;
    const atomicDecision = motionGraphic?.metadata?.atomicOverlayDecision;

    expect(result.overlaysCreated).toBe(1);
    expect(motionGraphic).toBeDefined();
    expect(motionGraphic.metadata.placementRegion).toBe('top-right');
    expect(motionGraphic.metadata.placementAdjustment).toEqual(expect.objectContaining({
      candidateRegion: 'top-right',
      preferHits: ['negative-space'],
    }));
    expect(motionGraphic.metadata.atomicPlanObserveMode).toBe(true);
    expect(motionGraphic.metadata.mgExpressionAuthority).toEqual(expect.objectContaining({
      version: 'mg-expression-authority-v1',
      allowMotionGraphic: true,
      calibration: expect.objectContaining({ status: 'invented-needs-calibration' }),
    }));
    expect(motionGraphic.metadata.visualExplanationContract).toBe(motionGraphic.metadata.mgExpressionAuthority.visualExplanationContract);
    expect(motionGraphic.metadata.mgExpressionAuthority.typography.fontSizePx).toBeGreaterThanOrEqual(72);
    expect(motionGraphic.recipe.layout.position).toBe('top-right');
    expect(motionGraphic.recipe.layout.maxWidth).toMatch(/%$/);
    expect(motionGraphic.recipe.visualIntent).toEqual(expect.objectContaining({
      source: 'visual-explanation-contract-v1',
      obligationKinds: expect.arrayContaining(['show-magnitude']),
    }));
    expect(atomicPlan.recipeId).toBe('composed-numeric');
    expect(atomicPlan.visualIntent).toEqual(expect.objectContaining({
      source: 'visual-explanation-contract-v1',
      stageMode: motionGraphic.recipe.visualIntent.stageMode,
      obligationKinds: expect.arrayContaining(['show-magnitude']),
    }));
    expect(atomicPlan.elements.some((element: any) => element.role === 'counter')).toBe(true);
    expect(atomicPlan.elements.some((element: any) => element.motion.tracks.some((track: any) => track.property === 'z'))).toBe(true);
    expect(atomicPlan.intensity.signal).toBeGreaterThan(0.7);
    expect(atomicDecision.version).toBe('atomic-decision-v1');
    expect(atomicDecision.licenses.allowOverlay).toBe(true);
    expect(atomicDecision.licenses.allowKineticEntrance).toBe(true);
    expect(atomicDecision.multipliers.motionAmplitude).toBeGreaterThan(1);
  });

  it('applies placement-adjusted regions to legacy html graphic geometry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    if (DEFAULT_CONFIG.features) {
      DEFAULT_CONFIG.features.useCompositionEngine = false;
    }

    const overlays: Overlay[] = [{
      id: 21,
      type: OverlayType.VIDEO,
      from: 0,
      durationInFrames: 180,
      row: 0,
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
      isDragging: false,
      rotation: 0,
      content: 'https://example.com/source.mp4',
      src: 'https://example.com/source.mp4',
      styles: { opacity: 1 },
    } as Overlay];

    const edl: EditDecisionList = {
      projectId: 'placement-geometry-project',
      generatedAt: new Date('2026-06-04T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'graphic',
        frame: 30,
        durationFrames: 60,
        priority: 3,
        source: 'utility-bridge:test',
        signal: 'keyword_emphasis',
        reason: 'negative-space placement',
        confidence: 0.92,
        params: {
          graphicType: 'keyword-highlight',
          text: 'traction',
          placementAdjustment: {
            candidateRegion: 'bottom-right',
            multiplier: 1.15,
            penalty: 0,
            bonus: 0.2,
            avoidHits: [],
            preferHits: ['negative-space'],
            constraints: ['protect-existing-text'],
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.92,
      },
    };

    const result = await executeEDL(
      edl,
      'placement-geometry-project',
      'user-1',
      overlays,
      { width: 1000, height: 500 },
      undefined,
      'moderate',
    );

    const htmlGraphic = overlays.find((overlay) => overlay.type === OverlayType.HTML_SCENE) as any;

    expect(result.overlaysCreated).toBe(1);
    expect(htmlGraphic).toBeDefined();
    expect(htmlGraphic.left).toBe(750);
    expect(htmlGraphic.top).toBe(419);
    expect(htmlGraphic.metadata.placementRegion).toBe('bottom-right');
    expect(htmlGraphic.metadata.placementAdjustment).toEqual(expect.objectContaining({
      candidateRegion: 'bottom-right',
      constraints: ['protect-existing-text'],
    }));
  });

  it('enriches sparse graphic signals from source-timeline visual analysis', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const overlays: Overlay[] = [{
      id: 11,
      type: OverlayType.VIDEO,
      from: 20,
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
      assetId: 'asset-source-1',
      sourceStartFrame: 900,
      videoStartTime: 900,
      styles: { opacity: 1 },
    } as Overlay];

    const edl: EditDecisionList = {
      projectId: 'source-signal-project',
      generatedAt: new Date('2026-06-04T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'graphic',
        frame: 40,
        durationFrames: 90,
        priority: 3,
        source: 'creative-brief:test',
        signal: 'statistic_detected',
        reason: 'busy source-frame stat moment',
        confidence: 0.95,
        params: {
          graphicType: 'stat-counter',
          value: '82%',
          label: 'watch time lift',
          brand: {
            accentColor: '#00ff00',
            primaryColor: '#f8f8f8',
            headingFont: 'Inter',
            bodyFont: 'Inter',
            monoFont: 'JetBrains Mono',
          },
          signals: {
            formality: 0.2,
            enthusiasm: 0.9,
            warmth: 0.35,
            emotional_arousal: 0.8,
            pacing_velocity: 0.75,
            visceral_impact: 0.7,
            visual_dependency: 0.8,
            cinematic_moment: 0.8,
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.95,
      },
    };

    const analyses = new Map<string, any>([
      ['asset-source-1', {
        assetId: 'asset-source-1',
        vjepaAnalysis: {
          segments: [{
            startMs: 30000,
            endMs: 32000,
            visualSignificance: 0.94,
            motionIntensity: 0.91,
            actionType: 'talking',
            motionType: 'both',
            faceEmotion: 'surprised',
            eyeContact: true,
            mainSubjectX: 0.62,
            mainSubjectY: 0.44,
            mainSubjectWidth: 0.24,
            mainSubjectHeight: 0.5,
            textCoverage: 0.36,
            textBoxCount: 2,
            objectCount: 4,
            faceCount: 1,
            negativeSpaceRight: 0.71,
            negativeSpaceLeft: 0.22,
          }],
        },
        keyframeAnalyses: [{
          frame: 920,
          timestampMs: 30666,
          description: 'Speaker beside on-screen product text and charts',
          shotType: 'close-up',
          dominantColors: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888'],
          brightness: 0.92,
          energyLevel: 0.85,
          subjects: [
            { label: 'person', confidence: 0.95, isMainSubject: true },
            { label: 'text overlay', confidence: 0.9, isMainSubject: false },
            { label: 'product screen', confidence: 0.8, isMainSubject: false },
          ],
          naturalCutPoint: false,
        }],
        motionSegments: [{
          startFrame: 900,
          endFrame: 960,
          motionIntensity: 0.88,
          cameraMotion: 'handheld',
        }],
      }],
    ]);

    const result = await executeEDL(
      edl,
      'source-signal-project',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
      analyses,
      'moderate',
    );

    const motionGraphic = overlays.find((overlay) => overlay.type === OverlayType.MOTION_GRAPHIC) as any;
    const atomicPlan = motionGraphic?.metadata?.atomicOverlayPlan;
    const atomicDecision = motionGraphic?.metadata?.atomicOverlayDecision;

    expect(result.overlaysCreated).toBe(1);
    expect(motionGraphic.contentSignals.motion_intensity).toBe(0.91);
    expect(motionGraphic.contentSignals.visual_significance).toBe(0.94);
    expect(motionGraphic.contentSignals.visual_action_type).toBe('talking');
    expect(motionGraphic.contentSignals.visual_motion_type).toBe('both');
    expect(motionGraphic.contentSignals.visual_face_emotion).toBe('surprised');
    expect(motionGraphic.contentSignals.visual_eye_contact).toBe(1);
    expect(motionGraphic.contentSignals['visual.action_type']).toBe('talking');
    expect(motionGraphic.contentSignals['visual.main_subject.x']).toBe(0.62);
    expect(motionGraphic.contentSignals.main_subject_x).toBe(0.62);
    expect(motionGraphic.contentSignals['visual.negative_space.right']).toBe(0.71);
    expect(motionGraphic.contentSignals.negative_space_right).toBe(0.71);
    expect(motionGraphic.contentSignals['visual.object_count']).toBe(4);
    expect(motionGraphic.contentSignals.object_count).toBe(4);
    expect(motionGraphic.contentSignals['visual.face_count']).toBe(1);
    expect(motionGraphic.contentSignals.face_count).toBe(1);
    expect(motionGraphic.contentSignals.text_on_screen).toBe(1);
    expect(atomicPlan.visualContext.recommendedDensity).toBe('restrained');
    expect(atomicPlan.visualContext.facePresent).toBe(true);
    expect(atomicPlan.visualContext.actionType).toBe('talking');
    expect(atomicPlan.visualContext.motionType).toBe('both');
    expect(atomicPlan.visualContext.faceEmotion).toBe('surprised');
    expect(atomicPlan.visualContext.eyeContact).toBe(true);
    expect(atomicPlan.visualContext.mainSubjectX).toBe(0.62);
    expect(atomicPlan.visualContext.negativeSpaceRight).toBe(0.71);
    expect(atomicPlan.visualContext.objectCount).toBe(4);
    expect(atomicPlan.visualContext.faceCount).toBe(1);
    expect(atomicPlan.visualContext.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'subject-action', key: 'visual.action_type', value: 'talking', source: 'vjepa' }),
      expect.objectContaining({ kind: 'main-subject-x', key: 'visual.main_subject.x', value: 0.62, source: 'five-track' }),
      expect.objectContaining({ kind: 'negative-space-right', key: 'visual.negative_space.right', value: 0.71, source: 'layout-analysis' }),
      expect.objectContaining({ kind: 'object-count', key: 'visual.object_count', value: 4, source: 'five-track' }),
      expect.objectContaining({ kind: 'face-count', key: 'visual.face_count', value: 1, source: 'derived-signal' }),
      expect.objectContaining({ kind: 'motion-source', key: 'visual.motion_type', value: 'both', source: 'vjepa' }),
      expect.objectContaining({ kind: 'subject-emotion', key: 'visual.face_emotion', value: 'surprised', source: 'vjepa' }),
      expect.objectContaining({ kind: 'subject-gaze', key: 'visual.eye_contact', value: true, source: 'vjepa' }),
    ]));
    expect(atomicDecision.licenses.allowKineticEntrance).toBe(false);
    expect(atomicDecision.rationale).toContain('visual-density:restrained');
  });

  it('normalizes registry signal aliases and numeric strings before MG planning', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    if (DEFAULT_CONFIG.features) {
      DEFAULT_CONFIG.features.useCompositionEngine = true;
    }

    const overlays: Overlay[] = [{
      id: 21,
      type: OverlayType.VIDEO,
      from: 20,
      durationInFrames: 180,
      row: 0,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      isDragging: false,
      rotation: 0,
      content: 'https://example.com/path2.mp4',
      src: 'https://example.com/path2.mp4',
      assetId: 'asset-path-2',
      sourceStartFrame: 900,
      videoStartTime: 900,
      styles: { opacity: 1 },
    } as Overlay];

    const edl: EditDecisionList = {
      projectId: 'path-2-signal-aliases',
      generatedAt: new Date('2026-06-17T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'graphic',
        frame: 40,
        durationFrames: 90,
        priority: 3,
        source: 'creative-brief:test',
        signal: 'statistic_detected',
        reason: 'Path 2 signal aliases',
        confidence: 0.95,
        params: {
          graphicType: 'stat-counter',
          value: '42%',
          label: 'Completion',
          brand: {
            accentColor: '#00ff00',
            primaryColor: '#f8f8f8',
            headingFont: 'Inter',
            bodyFont: 'Inter',
            monoFont: 'JetBrains Mono',
          },
          signals: {
            'content.formality': '0.2',
            'personality.enthusiasm': '0.92',
            'personality.warmth': '0.61',
            'personality.emotional_arousal': '0.8',
            'personality.pacing_velocity': '0.73',
            'personality.visceral_impact': '0.7',
            'personality.visual_dependency': '0.8',
            'visual.scene_type': 'action',
            'visual.text_coverage': '0.74',
            'visual_text_coverage': '0.74',
            'speech.pitch_contour': '0.81',
            'audio.music_section': 'chorus',
            'composite.cinematic_moment': '0.8',
            'composite.montage_mode': '0.4',
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.95,
      },
    };

    const analyses = new Map<string, any>([
      ['asset-path-2', {
        assetId: 'asset-path-2',
        vjepaAnalysis: {
          segments: [{
            startMs: 30000,
            endMs: 32000,
            visualSignificance: 0.48,
            motionIntensity: 0.42,
            actionType: 'talking',
            motionType: 'camera',
            faceEmotion: 'focused',
            eyeContact: true,
            textCoverage: 0.12,
            textBoxCount: 1,
            objectCount: 2,
            faceCount: 1,
          }],
        },
      }],
    ]);

    const result = await executeEDL(
      edl,
      'path-2-signal-aliases',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
      analyses,
      'moderate',
    );

    const motionGraphic = overlays.find((overlay) => overlay.type === OverlayType.MOTION_GRAPHIC) as any;

    expect(result.overlaysCreated).toBe(1);
    expect(motionGraphic.contentSignals.formality).toBe(0.2);
    expect(motionGraphic.contentSignals['content.formality']).toBe(0.2);
    expect(motionGraphic.contentSignals.enthusiasm).toBe(0.92);
    expect(motionGraphic.contentSignals['personality.enthusiasm']).toBe(0.92);
    expect(motionGraphic.contentSignals.warmth).toBe(0.61);
    expect(motionGraphic.contentSignals.emotional_arousal).toBe(0.8);
    expect(motionGraphic.contentSignals.pacing_velocity).toBe(0.73);
    expect(motionGraphic.contentSignals.visceral_impact).toBe(0.7);
    expect(motionGraphic.contentSignals.visual_dependency).toBe(0.8);
    expect(motionGraphic.contentSignals.scene_type).toBe('action');
    expect(motionGraphic.contentSignals.text_coverage).toBe(0.74);
    expect(motionGraphic.contentSignals['visual.text_coverage']).toBe(0.74);
    expect(motionGraphic.contentSignals.pitch_variability).toBe(0.81);
    expect(motionGraphic.contentSignals['speech.pitch_contour']).toBe(0.81);
    expect(motionGraphic.contentSignals.music_section).toBe('chorus');
    expect(motionGraphic.contentSignals.cinematic_moment).toBe(0.8);
    expect(motionGraphic.contentSignals.montage_mode).toBe(0.4);
    expect(motionGraphic.recipe.id).not.toBe('suppressed');
  });

  it('feeds EDL-created atomic metadata into the renderer adapter without losing source-frame signals', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const overlays: Overlay[] = [{
      id: 21,
      type: OverlayType.VIDEO,
      from: 30,
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
      assetId: 'asset-source-2',
      sourceStartFrame: 1200,
      videoStartTime: 1200,
      styles: { opacity: 1 },
    } as Overlay];

    const edl: EditDecisionList = {
      projectId: 'upload-to-edit-atomic-bridge',
      generatedAt: new Date('2026-06-04T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'graphic',
        frame: 75,
        durationFrames: 90,
        priority: 3,
        source: 'creative-brief:test',
        signal: 'statistic_detected',
        reason: 'source-mapped conversion moment',
        confidence: 0.96,
        params: {
          graphicType: 'stat-counter',
          value: '64%',
          label: 'higher retention',
          brand: {
            accentColor: '#12d18e',
            primaryColor: '#f8f8f8',
            headingFont: 'Inter',
            bodyFont: 'Inter',
            monoFont: 'JetBrains Mono',
          },
          signals: {
            formality: 0.35,
            enthusiasm: 0.86,
            warmth: 0.48,
            emotional_arousal: 0.82,
            pacing_velocity: 0.78,
            visceral_impact: 0.76,
            visual_dependency: 0.8,
            cinematic_moment: 0.82,
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 1,
        zoomCount: 0,
        speedChangeCount: 0,
        averageConfidence: 0.96,
      },
    };

    const analyses = new Map<string, any>([
      ['asset-source-2', {
        assetId: 'asset-source-2',
        vjepaAnalysis: {
          segments: [{
            startMs: 41500,
            endMs: 43000,
            visualSignificance: 0.38,
            motionIntensity: 0.4,
            actionType: 'product-demo',
            motionType: 'camera',
            faceEmotion: 'neutral',
            eyeContact: false,
          }],
        },
        keyframeAnalyses: [{
          frame: 1246,
          timestampMs: 41533,
          description: 'Product dashboard with clear empty right side for an overlay',
          shotType: 'medium',
          dominantColors: ['#090909', '#202020', '#12d18e'],
          brightness: 0.28,
          energyLevel: 0.5,
          subjects: [
            { label: 'product dashboard', confidence: 0.94, isMainSubject: true },
          ],
          naturalCutPoint: true,
        }],
        motionSegments: [{
          startFrame: 1230,
          endFrame: 1290,
          motionIntensity: 0.4,
          cameraMotion: 'pan',
        }],
      }],
    ]);

    const result = await executeEDL(
      edl,
      'upload-to-edit-atomic-bridge',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
      analyses,
      'moderate',
    );

    const motionGraphic = overlays.find((overlay) => overlay.type === OverlayType.MOTION_GRAPHIC) as any;
    const atomicPlan = motionGraphic?.metadata?.atomicOverlayPlan;
    const atomicDecision = motionGraphic?.metadata?.atomicOverlayDecision;
    const counterRenderElement: ResolvedElement = {
      primitive: 'text',
      role: 'counter',
      enterOrder: 0,
      entrancePattern: 'fade',
      exitPattern: 'fade',
      resolvedProps: {},
    };
    const counterAtom = findAtomicElement(atomicPlan, counterRenderElement);
    const baseAnim: AnimationState = {
      opacity: 0.2,
      translateX: 0,
      translateY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      skewX: 0,
      clipProgress: 0,
      filterBlur: 0,
      filterBrightness: 1,
      filterContrast: 1,
      filterSaturate: 1,
      letterSpacing: 0,
      fontSize: 1,
      textShadowBlur: 0,
      strokeDashoffset: 0,
    };
    const timing: ComputedChoreography = {
      enterStartFrame: 0,
      enterEndFrame: 18,
      holdStartFrame: 18,
      holdEndFrame: 72,
      exitStartFrame: 72,
      exitEndFrame: 90,
      enterEasing: (t) => t,
      exitEasing: (t) => t,
    };

    expect(result.overlaysCreated).toBe(1);
    expect(motionGraphic.contentSignals.motion_intensity).toBe(0.4);
    expect(motionGraphic.contentSignals.visual_significance).toBe(0.38);
    expect(counterAtom).toBeDefined();
    expect(counterAtom?.motion.tracks.some((track: any) => track.phase === 'entrance')).toBe(true);

    const trackedAnim = applyAtomicMotionTracks(baseAnim, counterAtom, 9, timing, atomicDecision);
    const decidedAnim = applyAtomicRenderDecision(trackedAnim, atomicDecision);
    const styled = applyAtomicStyleAtoms(
      { color: '#ffffff', fontFamily: 'Inter', fontWeight: 400 },
      counterAtom,
      atomicDecision,
    );

    expect(trackedAnim).not.toBe(baseAnim);
    expect(decidedAnim.opacity).toBeGreaterThan(baseAnim.opacity);
    expect(styled.color).toBe(counterAtom?.color.text);
    expect(styled.fontFamily).toBe(counterAtom?.typography?.family);
  });
});
