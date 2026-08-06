import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCurrentFrame: () => 45,
  useVideoConfig: () => ({ durationInFrames: 90, fps: 30, width: 1920, height: 1080 }),
}));
vi.mock('@/lib/editron/motion-graphics/codegen/kit/stage', () => ({
  useRegionSize: () => ({ wPx: 1200, hPx: 720 }),
}));

import { FitHeadline } from '@/lib/editron/motion-graphics/codegen/kit/fit-text';
import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import { Bar, Plot, Rule } from '@/lib/editron/motion-graphics/codegen/kit/marks';
import { scanCode } from '@/lib/editron/motion-graphics/codegen/scan';

describe('MG kit legibility and integrated-surface contract', () => {
  it('protects headline text locally without adding a surfaced card', () => {
    const html = renderToStaticMarkup(
      React.createElement(FitHeadline, { brand: INSTURIX, text: '12% TO 19%', face: 'display' }),
    );
    expect(html).toContain('text-shadow:');
    expect(html).not.toContain('background-color:');
  });

  it('renders 1080p bar values at a readable size with local contrast protection', () => {
    const html = renderToStaticMarkup(
      React.createElement(Bar, {
        brand: INSTURIX,
        value: 0.72,
        vertical: true,
        label: 'After',
        valueText: '19%',
      }),
    );
    const fontSizes = [...html.matchAll(/font-size:([\d.]+)px/g)].map((match) => Number(match[1]));
    expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(24);
    expect(Math.max(...fontSizes)).toBeGreaterThanOrEqual(34);
    expect(html).toContain('text-shadow:');
    expect(html).toContain('box-shadow:');
  });

  it('protects both DOM and SVG marks when they are composed without a surface', () => {
    const rule = renderToStaticMarkup(
      React.createElement(Rule, { brand: INSTURIX, tone: 'text' }),
    );
    const plot = renderToStaticMarkup(
      React.createElement(Plot, { brand: INSTURIX, tone: 'text', points: [4, 8, 5, 12] }),
    );
    expect(rule).toContain('box-shadow:');
    expect(plot).toContain('filter:drop-shadow(');
  });

  it('rejects an improvised raw surface for integrated designs but permits it when a panel is licensed', () => {
    const source = `
      export const MgScene = ({brand, data}) => {
        const frame = useCurrentFrame();
        const {durationInFrames} = useVideoConfig();
        const ph = phases(durationInFrames, brand);
        return <Stage brand={brand}><Region brand={brand} x={0.1} y={0.1} w={0.8} h={0.8}>
          <div style={{background: \`linear-gradient(\${brand.colors.bg}, transparent)\`, ...ambient(frame, ph.build, 'drift', data.motionIntensity)}}>
            <FitHeadline brand={brand} text={String(data.line)} />
          </div>
        </Region></Stage>;
      };
    `;
    expect(scanCode(source).reason).toMatch(/Raw background gradients/);
    expect(scanCode(source, { allowPlate: true }).ok).toBe(true);
  });
});
