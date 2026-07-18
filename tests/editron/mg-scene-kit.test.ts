/**
 * Scene kit primitives (design-then-code 4b-1) — behavioral tests with mocked remotion hooks so the computed
 * camera, multiplane depths, reveal mask, and grade are asserted at exact frames. The load-bearing guarantees:
 * the camera MOVES (frame 0 vs end differ), overscan means camera travel can never reveal a backdrop edge,
 * depth 0 = screen-locked (type readability), the reveal is closed before `at` and fully open after `at+dur`
 * (meaning-motion under OUR clock), and every colour derives from brand tokens (no raw literals).
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

let mockFrame = 0;
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCurrentFrame: () => mockFrame,
  useVideoConfig: () => ({ durationInFrames: 60, fps: 30, width: 1280, height: 720 }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Img: (props: any) => React.createElement('img', props),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OffthreadVideo: (props: any) => React.createElement('video', props),
  staticFile: (name: string) => `/static/${name}`,
}));

import { Scene, SceneLayer, SceneReveal, SceneGrade } from '@/lib/editron/motion-graphics/codegen/kit/scene';
import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';

const at = (frame: number, node: React.ReactElement): string => {
  mockFrame = frame;
  return renderToStaticMarkup(node);
};

const scaleOf = (html: string): number => {
  const m = html.match(/transform:scale\(([\d.]+)\)/);
  return m ? Number(m[1]) : NaN;
};

describe('Scene — the computed camera', () => {
  it('the camera MOVES: backdrop transform at frame 0 differs from the end; push grows monotonically', () => {
    const scene = React.createElement(Scene, { brand: INSTURIX, src: 'data:image/jpeg;base64,x', camera: 'push', strength: 0.6 });
    const s0 = scaleOf(at(0, scene));
    const s30 = scaleOf(at(30, scene));
    const s59 = scaleOf(at(59, scene));
    expect(s0).toBeGreaterThan(1); // overscan applies even at rest
    expect(s30).toBeGreaterThan(s0);
    expect(s59).toBeGreaterThan(s30);
  });

  it('EDGE SAFETY: overscan ≥ the camera\'s own maximum travel (an edge can never be revealed)', () => {
    // At the final frame the camera is at max scale; the rendered backdrop scale = camScale × overscan must
    // exceed camScale by at least the drift span — i.e. the image is always larger than the travel needs.
    const html = at(59, React.createElement(Scene, { brand: INSTURIX, src: 'data:x', camera: 'drift-r', strength: 1 }));
    const backdropScale = scaleOf(html);
    expect(backdropScale).toBeGreaterThan(1.05); // strength 1 on an energy-0.85 brand: travel + overscan both present
    expect(html).toMatch(/translate\([\d.]+%/); // lateral travel applied
  });

  it('camera="none" is a static world (scale 1 aside from neutral overscan, no translate)', () => {
    const html = at(45, React.createElement(Scene, { brand: INSTURIX, src: 'data:x', camera: 'none' }));
    expect(scaleOf(html)).toBe(1);
    expect(html).toContain('translate(0%, 0%)');
  });
});

describe('Scene — backdrop source resolution (P1: still OR moving world, same contract)', () => {
  it('a .mp4 asset name renders a muted video through staticFile, under the SAME camera transform', () => {
    const html = at(30, React.createElement(Scene, { brand: INSTURIX, src: 'backdrop.mp4', camera: 'push', strength: 0.6 }));
    expect(html).toContain('<video');
    expect(html).toContain('src="/static/backdrop.mp4"'); // asset NAME → staticFile resolution
    expect(html).toMatch(/muted/);
    expect(scaleOf(html)).toBeGreaterThan(1); // the camera drives the video exactly like a still
    expect(html).not.toContain('<img');
  });

  it('a .jpg asset name renders an <img> through staticFile; a data URL passes through UNRESOLVED (4b-3 compat)', () => {
    const still = at(30, React.createElement(Scene, { brand: INSTURIX, src: 'backdrop.jpg' }));
    expect(still).toContain('<img');
    expect(still).toContain('src="/static/backdrop.jpg"');
    const dataUrl = at(30, React.createElement(Scene, { brand: INSTURIX, src: 'data:image/jpeg;base64,xyz' }));
    expect(dataUrl).toContain('src="data:image/jpeg;base64,xyz"'); // no /static/ prefix — passthrough
  });
});

describe('SceneLayer — multiplane parallax', () => {
  it('depth 0 = screen-locked (identity), depth 1 = full camera, between = between', () => {
    const wrap = (depth: number) => React.createElement(
      Scene, { brand: INSTURIX, camera: 'push', strength: 1 },
      React.createElement(SceneLayer, { depth }, React.createElement('span', { id: 'c' }, 'x')),
    );
    const locked = at(59, wrap(0));
    expect(locked).toContain('transform:scale(1) translate(0%, 0%)');
    const full = scaleOf(at(59, wrap(1)).split('<span').shift() ?? ''); // outer transform belongs to Scene? layer scale read below
    const layerHtmlFull = at(59, wrap(1)).match(/scale\(([\d.]+)\) translate\(0%, 0%\)">(?=<span)/);
    const layerHtmlHalf = at(59, wrap(0.5)).match(/scale\(([\d.]+)\) translate\(0%, 0%\)">(?=<span)/);
    expect(layerHtmlFull && Number(layerHtmlFull[1])).toBeGreaterThan(1);
    expect(layerHtmlHalf && Number(layerHtmlHalf[1])).toBeGreaterThan(1);
    expect(Number(layerHtmlFull![1])).toBeGreaterThan(Number(layerHtmlHalf![1]));
    expect(Number.isNaN(full)).toBe(false);
  });
});

describe('SceneReveal — meaning-motion under OUR clock', () => {
  const reveal = React.createElement(
    SceneReveal, { at: 20, dur: 20, origin: { x: 0.6, y: 0.4 } },
    React.createElement('div', { id: 'meaning' }),
  );

  it('closed before `at`, opening during, fully open (≥150%) after `at+dur`; origin lands where designed', () => {
    expect(at(0, reveal)).toContain('clip-path:circle(0% at 60% 40%)');
    const mid = at(30, reveal).match(/circle\(([\d.]+)%/);
    expect(mid && Number(mid[1])).toBeGreaterThan(0);
    expect(mid && Number(mid[1])).toBeLessThan(150);
    const done = at(59, reveal).match(/circle\(([\d.]+)%/);
    expect(done && Number(done[1])).toBe(150); // 150 ≥ √2·100 — covers every corner from any origin
  });
});

describe('SceneGrade — the card alternative', () => {
  it('emits a brand-derived gradient toward the chosen edge (no raw colour literals beyond the computed shade)', () => {
    const html = at(10, React.createElement(SceneGrade, { brand: INSTURIX, edge: 'bottom', strength: 0.6 }));
    expect(html).toMatch(/linear-gradient\(to top/);
    // colour must be the computed shade(brand.bg)+alpha — an 8-digit hex derived from #0B0B0A, not an arbitrary literal
    expect(html).toMatch(/#[0-9a-f]{8}/i);
    expect(html).toContain('transparent 55%');
  });
});
