import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { OverlayType, type KeyframeTrack, type Overlay } from '../../components/editron/editor/version-7.0.0/types';
import {
  buildOverlayAtomicReceipt,
  overlayAtom,
  type AtomicOverlayReceipt,
} from '../../lib/editron/engine/atomic-overlay-core';
import {
  buildBaselineOverlays,
  buildFrameAwareOverlayReceipt,
  buildOverlayOnlyRenderOverlays,
  changedPixelBounds,
  evaluateSaasMotionVarietyGate,
  hydratePhase0RenderArtifactPackForTaxonomy,
  imageMotionDelta,
  normalizeRenderedAestheticSamplePlan,
  overlayOnlyBlankImageJustification,
  pickRenderedAestheticSampleFrames,
  planRenderedAestheticSamples,
  renderRenderedAestheticHtmlReport,
  renderedOverlayBoxAtFrame,
  resolveRenderedAestheticSamplePlan,
  sourceDependentTransitionBlankJustification,
  type RawImage,
  type RenderedAestheticHarnessReport,
} from '../../scripts/render-editron-aesthetic';

describe('rendered aesthetic harness helpers', () => {
  it('samples starts and settled midpoints from audited visual and timing overlays', () => {
    const frames = pickRenderedAestheticSampleFrames([
      textOverlay({ id: 1, from: 10, durationInFrames: 40 }),
      shapeOverlay({ id: 2, from: 80, durationInFrames: 20 }),
      soundOverlay({ id: 3, from: 120, durationInFrames: 40 }),
    ], 180, 10);

    expect(frames).toEqual([10, 32, 80, 91, 120, 142]);
  });

  it('downsamples crowded candidates deterministically', () => {
    const overlays = Array.from({ length: 12 }, (_, index) => (
      textOverlay({ id: index + 1, from: index * 12, durationInFrames: 10 })
    ));

    const frames = pickRenderedAestheticSampleFrames(overlays, 180, 5);

    expect(frames).toHaveLength(5);
    expect(frames[0]).toBe(0);
    expect(frames.at(-1)).toBe(137);
    expect([...frames].sort((a, b) => a - b)).toEqual(frames);
  });

  it('plans animation-aware samples around entry, hold, exit, and interior keyframes', () => {
    const samples = planRenderedAestheticSamples([
      textOverlay({
        id: 1,
        from: 10,
        durationInFrames: 40,
        keyframeTracks: [
          { property: 'opacity', keyframes: [{ frame: 0, value: 0, easing: 'linear' }, { frame: 10, value: 1, easing: 'linear' }, { frame: 39, value: 0, easing: 'linear' }] },
        ],
      }),
    ], 120, 10);

    expect(samples.map((sample) => [sample.frame, sample.roles])).toEqual([
      [18, ['entry-settle']],
      [20, ['keyframe']],
      [32, ['hold']],
      [43, ['exit-prep']],
    ]);
  });

  it('keeps only likely full-frame backgrounds in baseline renders', () => {
    const baseline = buildBaselineOverlays([
      videoOverlay({ id: 1 }),
      imageOverlay({ id: 2, left: 0, top: 0, width: 1080, height: 1920 }),
      imageOverlay({ id: 3, left: 700, top: 1200, width: 180, height: 180 }),
      textOverlay({ id: 4 }),
    ], 1080, 1920);

    expect(baseline.map((overlay) => overlay.id)).toEqual([2]);
  });

  it('builds overlay-only render props without source video or audio', () => {
    const overlays = buildOverlayOnlyRenderOverlays([
      videoOverlay({ id: 1 }),
      soundOverlay({ id: 2 }),
      imageOverlay({ id: 3, left: 0, top: 0, width: 1080, height: 1920 }),
      textOverlay({ id: 4 }),
      shapeOverlay({ id: 5 }),
    ], 1080, 1920);

    expect(overlays.map((overlay) => overlay.id)).toEqual([3, 4, 5]);
  });

  it('samples generated scenes as auditable visual overlays', () => {
    const generatedScene = generatedSceneOverlay({ id: 21, from: 0, durationInFrames: 90 });
    const samples = planRenderedAestheticSamples([
      generatedScene,
      soundOverlay({ id: 22, from: 0, durationInFrames: 90 }),
    ], 120, 12);
    const renderOverlays = buildOverlayOnlyRenderOverlays([
      generatedScene,
      soundOverlay({ id: 22, from: 0, durationInFrames: 90 }),
    ], 1920, 1080);

    expect(samples.some((sample) => sample.sourceOverlayTypes.includes('generated-scene'))).toBe(true);
    expect(renderOverlays.map((overlay) => overlay.id)).toEqual([21]);
  });

  it('fails SaaS motion variety when SaaS generated scenes repeat or dominate the sequence', () => {
    const issues = evaluateSaasMotionVarietyGate([
      generatedSceneOverlay({ id: 31, from: 0, sceneFamily: 'hook' }),
      generatedSceneOverlay({ id: 32, from: 60, sceneFamily: 'feature_demo' }),
      generatedSceneOverlay({ id: 33, from: 120, sceneFamily: 'feature_demo' }),
    ]);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gateId: 'G8_motion_variety',
        dimension: 'motion',
        severity: 'fail',
        overlayId: 33,
        relatedOverlayId: 32,
        message: 'SaaS scene variety repeats feature_demo consecutively',
        evidence: 'sequence=hook > feature_demo > feature_demo',
      }),
      expect.objectContaining({
        gateId: 'G8_motion_variety',
        dimension: 'motion',
        severity: 'fail',
        message: 'SaaS scene variety overuses feature_demo',
        evidence: 'count=2/3; share=0.667; sequence=hook > feature_demo > feature_demo',
      }),
    ]));
  });

  it('passes SaaS motion variety for varied generated scene forms', () => {
    const issues = evaluateSaasMotionVarietyGate([
      generatedSceneOverlay({ id: 41, from: 0, visualArchetype: 'TYPE_ONLY', sceneFamily: 'hook' }),
      generatedSceneOverlay({ id: 42, from: 60, visualArchetype: 'UI_FRAMED', sceneFamily: 'feature_demo' }),
      generatedSceneOverlay({ id: 43, from: 120, visualArchetype: 'DATA_VIZ', sceneFamily: 'proof_metric' }),
    ]);

    expect(issues).toEqual([]);
  });
  it('merges manual benchmark frames with animation-state samples', () => {
    const samples = resolveRenderedAestheticSamplePlan({
      durationInFrames: 240,
      sampleFrames: [0, 90, 150],
    }, [generatedSceneOverlay({ id: 21, from: 0, durationInFrames: 180 })], { maxSamples: 5 });

    expect(samples.map((sample) => [sample.frame, sample.roles])).toEqual([
      [0, ['manual']],
      [8, ['entry-settle']],
      [90, ['manual']],
      [150, ['manual']],
      [172, ['exit-prep']],
    ]);
    expect(samples.filter((sample) => sample.roles.some((role) => role !== 'manual' && role !== 'hold'))).toHaveLength(2);
  });

  it('keeps zoom and SFX in the sample plan without adding them to overlay-only still renders', () => {
    const samples = planRenderedAestheticSamples([
      zoomOverlay({ id: 11, from: 20, durationInFrames: 30 }),
      soundOverlay({ id: 12, from: 60, durationInFrames: 18 }),
      textOverlay({ id: 13, from: 100, durationInFrames: 20 }),
    ], 150, 20);
    const renderOverlays = buildOverlayOnlyRenderOverlays([
      zoomOverlay({ id: 11, from: 20, durationInFrames: 30 }),
      soundOverlay({ id: 12, from: 60, durationInFrames: 18 }),
      textOverlay({ id: 13, from: 100, durationInFrames: 20 }),
    ], 1080, 1920);

    expect(samples.some((sample) => sample.sourceOverlayTypes.includes('zoom'))).toBe(true);
    expect(samples.some((sample) => sample.sourceOverlayTypes.includes('sound'))).toBe(true);
    expect(renderOverlays.map((overlay) => overlay.id)).toEqual([13]);
  });

  it('marks linked transition samples as source-dependent when overlay-only render removes source clips', () => {
    const sourceOverlays = [
      videoOverlay({ id: 1 }),
      videoOverlay({ id: 2 }),
      transitionOverlay({ id: 3, clipAId: 1, clipBId: 2 }),
    ];
    const renderOverlays = buildOverlayOnlyRenderOverlays(sourceOverlays, 1080, 1920);

    const justification = sourceDependentTransitionBlankJustification({
      overlayOnly: true,
      sample: {
        frame: 45,
        roles: ['hold'],
        sourceOverlayIds: [3],
        sourceOverlayTypes: ['transition'],
      },
      sourceOverlays,
      renderOverlays,
    });

    expect(justification).toContain('source-dependent');
    expect(sourceDependentTransitionBlankJustification({
      overlayOnly: true,
      sample: {
        frame: 45,
        roles: ['hold'],
        sourceOverlayIds: [4],
        sourceOverlayTypes: ['text'],
      },
      sourceOverlays: [...sourceOverlays, textOverlay({ id: 4 })],
      renderOverlays: [...renderOverlays, textOverlay({ id: 4 })],
    })).toBeUndefined();
  });

  it('justifies overlay-only blank frames for source and timing-only samples', () => {
    const sourceOverlays = [
      videoOverlay({ id: 1 }),
      zoomOverlay({ id: 2, from: 30, durationInFrames: 24 }),
      soundOverlay({ id: 3, from: 30, durationInFrames: 24 }),
    ];

    const justification = overlayOnlyBlankImageJustification({
      overlayOnly: true,
      sample: {
        frame: 36,
        roles: ['zoom-anchor', 'sfx-sync'],
        sourceOverlayIds: [1, 2, 3],
        sourceOverlayTypes: ['video', 'zoom', 'sound'],
      },
      sourceOverlays,
      renderOverlays: buildOverlayOnlyRenderOverlays(sourceOverlays, 1080, 1920),
      activeAuditedVisualTypes: [],
      activeVisualEvidenceCount: 0,
      activeTimelineEvidenceCount: 2,
    });

    expect(justification).toContain('source/timing-only');
  });

  it('justifies overlay-only caption gaps without hiding visual overlay blanks', () => {
    const caption = captionOverlay({
      id: 8,
      from: 0,
      durationInFrames: 180,
      captions: [
        captionText('visible intro', 0, 1000),
        captionText('visible outro', 3000, 4200),
      ],
      displayConfig: { mode: 'word-by-word', wordsPerGroup: 1, maxWordsPerLine: 1 },
    });

    expect(overlayOnlyBlankImageJustification({
      overlayOnly: true,
      sample: {
        frame: 60,
        roles: ['hold'],
        sourceOverlayIds: [8],
        sourceOverlayTypes: ['caption'],
      },
      sourceOverlays: [caption],
      renderOverlays: buildOverlayOnlyRenderOverlays([caption], 1080, 1920),
      activeAuditedVisualTypes: ['caption'],
      activeVisualEvidenceCount: 0,
      activeTimelineEvidenceCount: 0,
    })).toContain('no active caption words');

    expect(overlayOnlyBlankImageJustification({
      overlayOnly: true,
      sample: {
        frame: 60,
        roles: ['hold'],
        sourceOverlayIds: [9],
        sourceOverlayTypes: ['motion-graphic'],
      },
      sourceOverlays: [motionGraphicOverlay({ id: 9, from: 50, durationInFrames: 30 })],
      renderOverlays: [motionGraphicOverlay({ id: 9, from: 50, durationInFrames: 30 })],
      activeAuditedVisualTypes: ['motion-graphic'],
      activeVisualEvidenceCount: 0,
      activeTimelineEvidenceCount: 0,
    })).toBeUndefined();
  });

  it('uses persisted Phase 0 sample identity instead of regenerating active overlays', () => {
    const sourceOverlays = [
      videoOverlay({ id: 1 }),
      videoOverlay({ id: 2 }),
      transitionOverlay({ id: 3, clipAId: 1, clipBId: 2, from: 40, durationInFrames: 30 }),
      textOverlay({ id: 4, from: 0, durationInFrames: 120 }),
    ];
    const samples = resolveRenderedAestheticSamplePlan({
      durationInFrames: 120,
      sampleFrames: [55],
      samplePlan: [{
        frame: 55,
        roles: ['hold'],
        sourceOverlayIds: [3],
        sourceOverlayTypes: ['transition'],
      }],
    }, sourceOverlays, {});

    expect(samples).toEqual([{
      frame: 55,
      roles: ['hold'],
      sourceOverlayIds: [3],
      sourceOverlayTypes: ['transition'],
    }]);
    expect(sourceDependentTransitionBlankJustification({
      overlayOnly: true,
      sample: samples[0],
      sourceOverlays,
      renderOverlays: buildOverlayOnlyRenderOverlays(sourceOverlays, 1080, 1920),
    })).toContain('source-dependent');
  });

  it('preserves Phase 0 timing sample roles instead of downgrading them to manual', () => {
    const samples = resolveRenderedAestheticSamplePlan({
      durationInFrames: 120,
      samplePlan: [{
        frame: 30,
        roles: ['zoom-anchor', 'zoom-motion', 'transition-boundary', 'sfx-sync'],
        sourceOverlayIds: ['clip-zoom'],
        sourceOverlayTypes: ['video'],
      }],
    }, [videoOverlay({ id: 1 })], {});

    expect(samples).toEqual([{
      frame: 30,
      roles: ['zoom-anchor', 'zoom-motion', 'transition-boundary', 'sfx-sync'],
      sourceOverlayIds: ['clip-zoom'],
      sourceOverlayTypes: ['video'],
    }]);
  });

  it('preserves Phase 0 timing sample roles when parsing render-input JSON', () => {
    const samples = normalizeRenderedAestheticSamplePlan({
      samples: [{
        frame: 30,
        roles: ['zoom-anchor', 'zoom-motion', 'transition-boundary', 'sfx-sync', 'unknown-role'],
        sourceOverlayIds: ['clip-zoom'],
        sourceOverlayTypes: ['video'],
      }],
    }, 120);

    expect(samples).toEqual([{
      frame: 30,
      roles: ['zoom-anchor', 'zoom-motion', 'transition-boundary', 'sfx-sync'],
      sourceOverlayIds: ['clip-zoom'],
      sourceOverlayTypes: ['video'],
    }]);
  });

  it('resolves keyframed position, scale, opacity, and text pixel height for rendered evidence', () => {
    const overlay = textOverlay({
      id: 7,
      from: 20,
      left: 100,
      top: 200,
      width: 300,
      height: 100,
      styles: { fontSize: '64px', opacity: 0.9 },
      keyframeTracks: [
        { property: 'x', keyframes: [{ frame: 0, value: 100, easing: 'linear' }, { frame: 10, value: 160, easing: 'linear' }] },
        { property: 'y', keyframes: [{ frame: 0, value: 200, easing: 'linear' }, { frame: 10, value: 240, easing: 'linear' }] },
        { property: 'scale', keyframes: [{ frame: 0, value: 1, easing: 'linear' }, { frame: 10, value: 1.2, easing: 'linear' }] },
        { property: 'opacity', keyframes: [{ frame: 0, value: 0.4, easing: 'linear' }, { frame: 10, value: 1, easing: 'linear' }] },
      ],
    });

    const box = renderedOverlayBoxAtFrame(overlay, 30);

    expect(box).toEqual(expect.objectContaining({
      x: 130,
      y: 230,
      width: 360,
      height: 120,
      opacity: 1,
      textPixelHeight: 64,
    }));
  });

  it('measures painted pixel bounds instead of trusting full-frame wrappers', () => {
    const baseline = rawImage(10, 10);
    const full = rawImage(10, 10);
    paintPixel(full, 4, 3, [255, 255, 255, 255]);
    paintPixel(full, 5, 4, [255, 255, 255, 255]);

    expect(changedPixelBounds(full, baseline)).toEqual({
      x: 4,
      y: 3,
      width: 2,
      height: 2,
    });
  });

  it('measures frame-to-frame motion delta from actual pixels', () => {
    const first = rawImage(10, 10);
    const same = rawImage(10, 10);
    const moved = rawImage(10, 10);
    paintPixel(moved, 4, 3, [255, 255, 255, 255]);
    paintPixel(moved, 5, 4, [255, 255, 255, 255]);

    expect(imageMotionDelta(first, same, 8, 14)).toEqual({
      fromFrame: 8,
      toFrame: 14,
      changedPixelRatio: 0,
      meanAbsoluteLumaDelta: 0,
      sampledPixels: 100,
    });

    const delta = imageMotionDelta(first, moved, 8, 14);
    expect(delta.changedPixelRatio).toBeGreaterThan(0);
    expect(delta.meanAbsoluteLumaDelta).toBeGreaterThan(0);
    expect(delta.sampledPixels).toBe(100);
  });

  it('scores captions from the active frame words instead of the whole-video caption file', () => {
    const overlay = captionOverlay({
      id: 8,
      captions: [
        captionText('alpha beta gamma delta epsilon zeta eta theta iota kappa', 0, 2000),
        captionText('Hank', 3000, 4200),
      ],
      displayConfig: { mode: 'word-by-word', wordsPerGroup: 1, maxWordsPerLine: 1 },
    });
    const receipt = buildFrameAwareOverlayReceipt(captionReceipt('whole transcript should not be scored here'), overlay, 102, 30);
    const textForm = receipt?.form.text;

    expect(textForm?.rawText).toBe('Hank');
    expect(textForm?.glyphs).toHaveLength(1);
    expect(textForm?.composition.rowCapacity).toBe(1);
  });

  it('does not score a full-video caption track when no caption word is visible', () => {
    const overlay = captionOverlay({
      id: 8,
      from: 0,
      durationInFrames: 180,
      captions: [
        captionText('visible intro', 0, 1000),
        captionText('visible outro', 3000, 4200),
      ],
      displayConfig: { mode: 'word-by-word', wordsPerGroup: 1, maxWordsPerLine: 1 },
    });

    const receipt = buildFrameAwareOverlayReceipt(
      captionReceipt('whole transcript must not be scored during speech gaps'),
      overlay,
      60,
      30,
    );

    expect(receipt).toBeUndefined();
  });

  it('scores motion graphics from recipe-visible text instead of hidden semantic evidence', () => {
    const overlay = motionGraphicOverlay({ id: 9 });
    const receipt = buildFrameAwareOverlayReceipt(
      motionGraphicReceipt("Hank Speaker I'm Hank. Hank. Speaker"),
      overlay,
      102,
      30,
    );
    const textForm = receipt?.form.text;

    expect(textForm?.rawText).toBe('Hank Speaker');
    expect(textForm?.glyphs.map((glyph) => glyph.text)).toEqual(['Hank', 'Speaker']);
    expect(textForm?.lines.map((line) => line.text)).toEqual(['Hank', 'Speaker']);
    expect(textForm?.composition.targetRowCount).toBe(2);
  });

  it('renders an HTML contact sheet with project, sample, image, and issue context', () => {
    const html = renderRenderedAestheticHtmlReport(fakeHarnessReport());

    expect(html).toContain('proj_demo');
    expect(html).toContain('Frame 18');
    expect(html).toContain('entry-settle');
    expect(html).toContain('f00018/full.png');
    expect(html).toContain('rendered text contrast is below accessibility floor');
    expect(html).toContain('localFrame=4/18');
    expect(html).toContain('atomicForm=yes');
    expect(html).toContain('text:1');
  });

  it('hydrates stripped Phase 0 artifact packs from sibling render input for taxonomy updates', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'editron-phase0-pack-'));
    try {
      const renderInputPath = path.join(tempDir, 'render-input.json');
      writeFileSync(renderInputPath, JSON.stringify({
        projectId: 'proj_pack',
        tag: 'proj-pack-phase0',
        width: 1080,
        height: 1920,
        fps: 30,
        durationInFrames: 90,
        overlays: [textOverlay({ id: 44 })],
      }), 'utf8');

      const hydrated = hydratePhase0RenderArtifactPackForTaxonomy({
        version: 'editron-phase0-render-artifact-pack-v1',
        projectId: 'proj_pack',
        status: 'ready',
        issues: [],
        artifactDir: tempDir,
        paths: {
          renderInput: renderInputPath,
          renderedAestheticDir: path.join(tempDir, 'rendered-aesthetic'),
          renderedAestheticJson: path.join(tempDir, 'rendered-aesthetic', 'rendered-aesthetic.json'),
          renderedAestheticHtml: path.join(tempDir, 'rendered-aesthetic', 'report.html'),
        },
        renderCommand: '',
        familyCoverage: {
          auditedOverlayTypes: ['text'],
          auditedVisualTypes: ['text'],
          auditedMotionTypes: [],
          auditedAudioTypes: [],
          requiredFamilies: [],
          auditedVisualCount: 1,
          auditedMotionCount: 0,
          auditedAudioCount: 0,
          auditedOverlayCount: 1,
          counts: { text: 1 },
          countsByFamily: { text: 1 },
          presentAuditedFamilies: ['text'],
          missingAuditedFamilies: [],
          presentRequiredFamilies: [],
          missingRequiredFamilies: [],
          evidenceCompleteness: {},
          incompleteFamilies: [],
        },
      } as any, tempDir);

      expect(hydrated.renderInput.overlays).toHaveLength(1);
      expect(hydrated.renderInput.overlays[0]?.id).toBe(44);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('hydrates Phase 0 artifact packs whose render input path is cwd-relative', () => {
    const root = path.join(process.cwd(), '.calibration-temp', 'phase0-live-path-test');
    mkdirSync(root, { recursive: true });
    const tempDir = mkdtempSync(path.join(root, 'run-'));
    try {
      const renderInputPath = path.join(tempDir, 'render-input.json');
      writeFileSync(renderInputPath, JSON.stringify({
        projectId: 'proj_phase0_live',
        tag: 'proj-phase0-live',
        width: 1080,
        height: 1920,
        fps: 30,
        durationInFrames: 90,
        overlays: [textOverlay({ id: 45 })],
      }), 'utf8');

      const cwdRelativeRenderInputPath = path.relative(process.cwd(), renderInputPath);
      const hydrated = hydratePhase0RenderArtifactPackForTaxonomy({
        version: 'editron-phase0-render-artifact-pack-v1',
        projectId: 'proj_phase0_live',
        status: 'ready',
        issues: [],
        artifactDir: tempDir,
        paths: {
          renderInput: cwdRelativeRenderInputPath,
          renderedAestheticDir: path.join(tempDir, 'rendered-aesthetic'),
          renderedAestheticJson: path.join(tempDir, 'rendered-aesthetic', 'rendered-aesthetic.json'),
          renderedAestheticHtml: path.join(tempDir, 'rendered-aesthetic', 'report.html'),
        },
        renderCommand: '',
        familyCoverage: {
          auditedOverlayTypes: ['text'],
          auditedVisualTypes: ['text'],
          auditedMotionTypes: [],
          auditedAudioTypes: [],
          requiredFamilies: [],
          auditedVisualCount: 1,
          auditedMotionCount: 0,
          auditedAudioCount: 0,
          auditedOverlayCount: 1,
          counts: { text: 1 },
          countsByFamily: { text: 1 },
          presentAuditedFamilies: ['text'],
          missingAuditedFamilies: [],
          presentRequiredFamilies: [],
          missingRequiredFamilies: [],
          evidenceCompleteness: {},
          incompleteFamilies: [],
        },
      } as any, tempDir);

      expect(hydrated.renderInput.overlays).toHaveLength(1);
      expect(hydrated.renderInput.overlays[0]?.id).toBe(45);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

interface OverlayFixtureInput {
  id: number;
  type?: OverlayType;
  from?: number;
  durationInFrames?: number;
  row?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  styles?: Record<string, unknown>;
  keyframeTracks?: KeyframeTrack[];
  clipAId?: number | string;
  clipBId?: number | string;
  sceneFamily?: string;
  visualArchetype?: string;
}

function baseOverlay(input: OverlayFixtureInput & { type: OverlayType }): Overlay {
  return {
    id: input.id,
    type: input.type,
    from: input.from ?? 0,
    durationInFrames: input.durationInFrames ?? 60,
    row: input.row ?? 0,
    left: input.left ?? 100,
    top: input.top ?? 100,
    width: input.width ?? 400,
    height: input.height ?? 120,
    isDragging: false,
    rotation: 0,
    keyframeTracks: input.keyframeTracks,
  } as Overlay;
}

function textOverlay(input: OverlayFixtureInput & { id: number }): Overlay {
  return {
    ...baseOverlay({ ...input, type: OverlayType.TEXT }),
    content: 'Readable text',
    styles: {
      fontSize: '48px',
      fontWeight: '700',
      color: '#ffffff',
      backgroundColor: '#111111',
      fontFamily: 'Inter',
      fontStyle: 'normal',
      textDecoration: 'none',
      ...(input.styles ?? {}),
    },
  } as Overlay;
}

function shapeOverlay(input: OverlayFixtureInput & { id: number }): Overlay {
  return {
    ...baseOverlay({ ...input, type: OverlayType.SHAPE }),
    content: 'rectangle',
    styles: { fill: '#ffffff' },
  } as Overlay;
}

function imageOverlay(input: OverlayFixtureInput & { id: number }): Overlay {
  return {
    ...baseOverlay({ ...input, type: OverlayType.IMAGE }),
    src: 'https://example.com/image.jpg',
    styles: { objectFit: 'cover' },
  } as Overlay;
}

function videoOverlay(input: OverlayFixtureInput & { id: number }): Overlay {
  return {
    ...baseOverlay({ ...input, type: OverlayType.VIDEO }),
    content: 'https://example.com/video.mp4',
    src: 'https://example.com/video.mp4',
    styles: { objectFit: 'cover' },
  } as Overlay;
}

function soundOverlay(input: OverlayFixtureInput & { id: number }): Overlay {
  return {
    ...baseOverlay({ ...input, type: OverlayType.SOUND }),
    content: 'https://example.com/audio.mp3',
    assetId: 'sfx_asset_1',
    metadata: { atomicSfxForm: { role: 'impact' } },
    styles: { volume: 1 },
  } as unknown as Overlay;
}

function zoomOverlay(input: OverlayFixtureInput & { id: number }): Overlay {
  return {
    ...baseOverlay({ ...input, type: 'zoom' as OverlayType }),
    metadata: { atomicZoomForm: { intent: 'emphasis-push' } },
  } as unknown as Overlay;
}

function transitionOverlay(input: OverlayFixtureInput & { id: number; clipAId?: number | string; clipBId?: number | string }): Overlay {
  return {
    ...baseOverlay({ ...input, type: OverlayType.TRANSITION }),
    clipAId: input.clipAId,
    clipBId: input.clipBId,
    transitionStyle: 'cross-dissolve',
  } as unknown as Overlay;
}

function captionOverlay(input: OverlayFixtureInput & {
  id: number;
  captions: Array<{ text: string; startMs: number; endMs: number; words: Array<{ word: string; startMs: number; endMs: number; confidence: number }> }>;
  displayConfig: Record<string, unknown>;
}): Overlay {
  return {
    ...baseOverlay({ ...input, type: OverlayType.CAPTION }),
    captions: input.captions,
    displayConfig: input.displayConfig,
    styles: {
      fontSize: '42px',
      fontWeight: 800,
      color: '#ffffff',
      textAlign: 'center',
      lineHeight: 1,
      highlight: { color: '#ffffff', backgroundColor: '#000000', effect: 'none', animation: 'none' },
    },
  } as unknown as Overlay;
}

function motionGraphicOverlay(input: OverlayFixtureInput & { id: number }): Overlay {
  return {
    ...baseOverlay({ ...input, type: OverlayType.MOTION_GRAPHIC }),
    content: {
      name: 'Hank',
      title: 'Speaker',
      contextPhrase: "I'm Hank.",
      keyword: 'Speaker',
    },
    recipe: {
      id: 'composed-identity',
      elements: [
        { id: 'primary', primitive: 'text', bind: { text: 'content:name' } },
        { id: 'secondary', primitive: 'text', bind: { text: 'content:title' } },
        { id: 'accent', primitive: 'shape', bind: { color: 'token:color.accent' } },
      ],
    },
  } as unknown as Overlay;
}

function generatedSceneOverlay(input: OverlayFixtureInput & { id: number }): Overlay {
  return {
    ...baseOverlay({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      ...input,
      type: OverlayType.GENERATED_SCENE,
    }),
    content: 'Generated SaaS scene',
    sceneModel: {
      schemaVersion: 'saas-generated-scene/v1',
      familyPlan: {
        family: input.sceneFamily ?? 'hook',
        ...(input.visualArchetype ? { visualArchetype: input.visualArchetype } : {}),
      },
    },
    metadata: { sourceType: 'saas-explainer-generated-scene' },
  } as unknown as Overlay;
}

function captionText(text: string, startMs: number, endMs: number) {
  const parts = text.split(/\s+/).filter(Boolean);
  const step = Math.max(1, (endMs - startMs) / Math.max(1, parts.length));
  return {
    text,
    startMs,
    endMs,
    timestampMs: startMs,
    confidence: 1,
    words: parts.map((word, index) => ({
      word,
      startMs: startMs + index * step,
      endMs: startMs + (index + 1) * step,
      confidence: 1,
    })),
  };
}

function captionReceipt(rawText: string): AtomicOverlayReceipt {
  const words = rawText.split(/\s+/).filter(Boolean);
  return buildOverlayAtomicReceipt({
    family: 'caption',
    intent: 'keyword-caption',
    frame: 0,
    durationFrames: 300,
    source: 'test',
    target: { overlayId: 8, row: 4, x: 0, y: 800, width: 1080, height: 180 },
    atoms: [
      overlayAtom('text-content', 'content.text', rawText, 1, 'transcript'),
      overlayAtom('caption-mode', 'caption.mode', 'word-by-word', 1, 'decision-param'),
      overlayAtom('caption-words-per-group', 'caption.words_per_group', 1, 1, 'decision-param'),
      overlayAtom('caption-max-words-per-line', 'caption.max_words_per_line', 1, 1, 'decision-param'),
      overlayAtom('text-row-strategy', 'text.row_strategy', 'single-word', 1, 'decision-param'),
      overlayAtom('text-row-capacity', 'text.row_capacity', 1, 1, 'decision-param'),
      ...words.map((word, index) => overlayAtom('caption-word', `caption.word.${index}`, word, 1, 'transcript')),
    ],
  });
}

function motionGraphicReceipt(rawText: string): AtomicOverlayReceipt {
  return buildOverlayAtomicReceipt({
    family: 'motion-graphic',
    intent: 'composed-identity',
    frame: 102,
    durationFrames: 48,
    source: 'test',
    target: { overlayId: 9, row: 0, x: 0, y: 0, width: 1920, height: 1080 },
    atoms: [
      overlayAtom('text-content', 'content.text', rawText, 1, 'transcript'),
    ],
  });
}

function rawImage(width: number, height: number): RawImage {
  return {
    width,
    height,
    channels: 4,
    data: Buffer.alloc(width * height * 4, 0),
  };
}

function paintPixel(image: RawImage, x: number, y: number, rgba: [number, number, number, number]): void {
  const offset = (y * image.width + x) * image.channels;
  image.data[offset] = rgba[0];
  image.data[offset + 1] = rgba[1];
  image.data[offset + 2] = rgba[2];
  image.data[offset + 3] = rgba[3];
}

function fakeHarnessReport(): RenderedAestheticHarnessReport {
  return {
    tag: 'proj-demo',
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 90,
    outputDir: 'C:\\tmp\\rendered-aesthetic\\proj-demo',
    htmlReport: 'C:\\tmp\\rendered-aesthetic\\proj-demo\\report.html',
    jsonReport: 'C:\\tmp\\rendered-aesthetic\\proj-demo\\rendered-aesthetic.json',
    project: {
      projectId: 'proj_demo',
      inputFile: 'fixtures\\proj-demo.json',
      overlayCounts: { text: 1 },
      auditedOverlayCount: 1,
    },
    summary: {
      status: 'fail',
      score: 0.82,
      passFrames: 0,
      warnFrames: 0,
      failFrames: 1,
      sampledFrames: 1,
      animationSampleFrames: 1,
      projectIssueCount: 0,
    },
    projectIssues: [],
    frames: [{
      frame: 18,
      sample: {
        frame: 18,
        roles: ['entry-settle'],
        sourceOverlayIds: [1],
        sourceOverlayTypes: ['text'],
      },
      activeOverlayIds: [1],
      activeOverlayTypes: ['text'],
      timelineEvidence: [{
        id: 2,
        type: 'sound',
        family: 'sfx',
        frame: 18,
        localFrame: 4,
        durationFrames: 18,
        role: 'impact',
        assetId: 'sfx_asset_1',
        volume: 0.8,
        hasAtomicForm: true,
      }],
      fullStill: 'C:\\tmp\\rendered-aesthetic\\proj-demo\\f00018\\full.png',
      baselineStill: 'C:\\tmp\\rendered-aesthetic\\proj-demo\\f00018\\baseline.png',
      report: {
        score: 0.82,
        status: 'fail',
        issues: [{
          dimension: 'contrast',
          severity: 'fail',
          penalty: 0.18,
          message: 'rendered text contrast is below accessibility floor',
          overlayId: 1,
          evidence: 'contrast=2.2; required=3',
        }],
        overlayReports: [{
          id: 1,
          type: 'text',
          family: 'text',
          box: { x: 200, y: 800, width: 600, height: 160 },
          issues: [],
        }],
        subscores: {
          render: 1,
          'safe-area': 1,
          visibility: 1,
          occlusion: 1,
          overlap: 1,
          text: 1,
          contrast: 0.82,
          motion: 1,
          clutter: 1,
          'motion-graphic': 1,
        },
        render: {
          status: { ok: true },
          matchedLogs: [],
        },
      },
    }],
  };
}
