/**
 * FitHeadline kinetic="words" (P2 — onset-timed kinetic captions). The load-bearing guarantees: each word enters
 * on ITS OWN wordsAt frame (the speech onset — synchresis, the Hormozi retention mechanic), the entrance is a
 * scale PUNCH (not the rise), words beyond the provided frames degrade to the brand stagger (deterministic),
 * non-finite frames never produce NaN transforms, and the existing 'rise' mode is byte-compatible.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

let mockFrame = 0;
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCurrentFrame: () => mockFrame,
  useVideoConfig: () => ({ durationInFrames: 90, fps: 30, width: 1280, height: 720 }),
}));
vi.mock('@/lib/editron/motion-graphics/codegen/kit/stage', () => ({
  useRegionSize: () => ({ wPx: 800, hPx: 450 }),
}));

import { FitHeadline } from '@/lib/editron/motion-graphics/codegen/kit/fit-text';
import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';

const at = (frame: number, el: React.ReactElement): string => {
  mockFrame = frame;
  return renderToStaticMarkup(el);
};

/** Count words still fully hidden (exact opacity:0) in the markup. */
const hiddenCount = (html: string): number => (html.match(/opacity:0[;"]/g) ?? []).length;

const caption = (over: Record<string, unknown> = {}) =>
  React.createElement(FitHeadline, {
    brand: INSTURIX,
    text: 'TEN TIMES FASTER',
    face: 'display',
    kinetic: 'words',
    wordsAt: [0, 20, 40],
    accentWords: ['faster'],
    ...over,
  } as never);

describe('FitHeadline kinetic="words" — onset-timed word landing', () => {
  it('each word enters on ITS OWN wordsAt frame: 1 visible at f10, 2 at f30, all at f70', () => {
    expect(hiddenCount(at(10, caption()))).toBe(2); // words 2+3 not yet spoken
    expect(hiddenCount(at(30, caption()))).toBe(1); // word 3 not yet spoken
    expect(hiddenCount(at(70, caption()))).toBe(0); // all landed
  });

  it('the entrance is a scale PUNCH (not the rise), and the accent word carries the brand accent', () => {
    const html = at(25, caption()); // word 2 mid-punch
    expect(html).toMatch(/transform:scale\(/);
    expect(html).not.toMatch(/translateY\(/); // words mode never rises
    expect(html.toLowerCase()).toContain(INSTURIX.colors.accent.toLowerCase()); // FASTER in gold
  });

  it('words beyond wordsAt.length degrade to the brand stagger — every word still lands (deterministic)', () => {
    const long = caption({ text: 'ONE TWO THREE FOUR FIVE', wordsAt: [0, 10] });
    expect(hiddenCount(at(80, long))).toBe(0); // all five landed despite only two onsets
  });

  it('non-finite onset frames NEVER produce NaN (degrade to the stagger)', () => {
    const broken = caption({ wordsAt: [0, Number.NaN, 40] });
    for (const f of [0, 15, 45, 80]) expect(at(f, broken)).not.toMatch(/NaN/);
  });

  it("regression: kinetic='rise' still rises (translateY), never scales", () => {
    const rise = at(6, caption({ kinetic: 'rise', wordsAt: undefined }));
    expect(rise).toMatch(/translateY\(/);
    expect(rise).not.toMatch(/transform:scale\(/);
  });
});
