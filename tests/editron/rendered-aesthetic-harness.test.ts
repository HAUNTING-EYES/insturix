import { describe, expect, it } from 'vitest';

import { OverlayType, type KeyframeTrack, type Overlay } from '../../components/editron/editor/version-7.0.0/types';
import {
  buildBaselineOverlays,
  buildOverlayOnlyRenderOverlays,
  pickRenderedAestheticSampleFrames,
  planRenderedAestheticSamples,
  renderRenderedAestheticHtmlReport,
  renderedOverlayBoxAtFrame,
  type RenderedAestheticHarnessReport,
} from '../../scripts/render-editron-aesthetic';

describe('rendered aesthetic harness helpers', () => {
  it('samples starts and settled midpoints from audited visual overlays', () => {
    const frames = pickRenderedAestheticSampleFrames([
      textOverlay({ id: 1, from: 10, durationInFrames: 40 }),
      shapeOverlay({ id: 2, from: 80, durationInFrames: 20 }),
      soundOverlay({ id: 3, from: 120, durationInFrames: 40 }),
    ], 180, 10);

    expect(frames).toEqual([10, 32, 80, 91]);
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

  it('renders an HTML contact sheet with project, sample, image, and issue context', () => {
    const html = renderRenderedAestheticHtmlReport(fakeHarnessReport());

    expect(html).toContain('proj_demo');
    expect(html).toContain('Frame 18');
    expect(html).toContain('entry-settle');
    expect(html).toContain('f00018/full.png');
    expect(html).toContain('rendered text contrast is below accessibility floor');
    expect(html).toContain('text:1');
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
    styles: { volume: 1 },
  } as Overlay;
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
    },
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
          clutter: 1,
        },
        render: {
          status: { ok: true },
          matchedLogs: [],
        },
      },
    }],
  };
}
