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
  pickRenderedAestheticSampleFrames,
  planRenderedAestheticSamples,
  renderRenderedAestheticHtmlReport,
  renderedOverlayBoxAtFrame,
  sourceDependentTransitionBlankJustification,
  type RawImage,
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

  it('scores captions from the active frame words instead of the whole-video caption file', () => {
    const overlay = captionOverlay({
      id: 8,
      captions: [
        caption('alpha beta gamma delta epsilon zeta eta theta iota kappa', 0, 2000),
        caption('Hank', 3000, 4200),
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
        caption('visible intro', 0, 1000),
        caption('visible outro', 3000, 4200),
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
  clipAId?: number | string;
  clipBId?: number | string;
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

function caption(text: string, startMs: number, endMs: number) {
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
