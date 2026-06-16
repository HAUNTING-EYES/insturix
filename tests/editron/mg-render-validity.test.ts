import { describe, expect, it } from 'vitest';

import {
  classifyRenderValidity,
  isBlankImage,
} from '@/lib/editron/motion-graphics/engine/eval/render-validity';

describe('MG render validity', () => {
  it('keeps clean renders valid', () => {
    const report = classifyRenderValidity({
      logs: [{ type: 'log', text: 'rendered ok' }],
      image: { lumaStdDev: 12, alphaMean: 1 },
    });

    expect(report.status).toEqual({ ok: true });
    expect(report.matchedLogs).toEqual([]);
  });

  it('classifies MG render errors as thrown renders', () => {
    const report = classifyRenderValidity({
      logs: [{ type: 'log', text: '[MG-Render] sparkline render failed' }],
      image: { lumaStdDev: 12 },
    });

    expect(report.status).toMatchObject({ ok: false, reason: 'throw' });
    expect(report.matchedLogs).toHaveLength(1);
  });

  it('classifies MG fit/cannot-fit logs as overflow', () => {
    const report = classifyRenderValidity({
      logs: [{ type: 'warn', text: '[MG-Fit] title cannot fit inside safe area' }],
      image: { lumaStdDev: 12 },
    });

    expect(report.status).toMatchObject({ ok: false, reason: 'overflow' });
    expect(report.matchedLogs).toHaveLength(1);
  });

  it('prioritizes thrown render errors over overflow logs', () => {
    const report = classifyRenderValidity({
      renderError: new Error('Remotion crashed'),
      logs: [{ type: 'warn', text: '[MG-Fit] cannot fit' }],
      image: { lumaStdDev: 12 },
    });

    expect(report.status).toMatchObject({ ok: false, reason: 'throw' });
    expect(report.matchedLogs).toEqual([]);
  });

  it('detects blank-ish images from pixel stats', () => {
    expect(isBlankImage({ lumaStdDev: 0.3 })).toBe(true);
    expect(isBlankImage({ alphaMean: 0 })).toBe(true);
    expect(isBlankImage({ visiblePixelRatio: 0.001 })).toBe(true);

    const report = classifyRenderValidity({
      image: { lumaStdDev: 0.2, alphaMean: 1 },
    });

    expect(report.status).toMatchObject({ ok: false, reason: 'blank' });
  });

  it('allows explicitly justified blank source-dependent transition samples', () => {
    const report = classifyRenderValidity({
      image: { lumaStdDev: 0.2, alphaMean: 1 },
      blankImageJustification: 'overlay-only transition sample omitted linked source video clips',
    });

    expect(report.status).toEqual({ ok: true });
    expect(report.matchedLogs).toEqual([{
      type: 'info',
      text: 'overlay-only transition sample omitted linked source video clips',
    }]);
  });
});
