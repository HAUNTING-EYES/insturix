import { describe, expect, it } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import { scanCode } from '@/lib/editron/motion-graphics/codegen/scan';
import {
  buildCodegenPrompt,
  generateMoment,
  promptHash,
  type CodegenDeps,
} from '@/lib/editron/motion-graphics/codegen/codegen-service';
import type { MgMomentInput } from '@/lib/editron/motion-graphics/codegen/types';

// A minimal scan-passing parametric component (reads data.value as a prop).
const VALID_CODE = `
import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Brand} from './kit/brand';
import {Stage, Region} from './kit/stage';
import {FitHeadline} from './kit/fit-text';
import {phases, countUp} from './kit/choreo';
type MgData = { value?: number };
export const MgScene: React.FC<{brand: Brand; data: MgData}> = ({brand, data}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  const n = countUp(frame, ph.intro, 30, data.value ?? 0);
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.08} y={0.2} w={0.84} h={0.6} align="center" justify="center">
        <FitHeadline brand={brand} text={String(n)} size="display" />
      </Region>
    </Stage>
  );
};`;
const INVALID_CODE = 'export const MgScene = () => <div>no stage root</div>;'; // fails the scan

function input(over: Partial<MgMomentInput> = {}): MgMomentInput {
  return {
    momentId: 'm1', mode: 'M3',
    license: { kind: 'numeric', source: 'we grew 40%' },
    window: { startFrame: 0, endFrame: 90, fps: 30 },
    anchors: { wordFrames: [10, 40] },
    brand: INSTURIX,
    contentPayload: { value: 40, suffix: '%', label: 'YoY growth' },
    ...over,
  };
}
function deps(over: Partial<CodegenDeps> = {}): CodegenDeps {
  return {
    writeComponent: async () => VALID_CODE,
    compile: async () => ({ ok: true }),
    evaluate: async () => ({ score: 8, issues: [] }),
    ...over,
  };
}
const queue = (codes: string[]) => { let i = 0; return async () => codes[Math.min(i++, codes.length - 1)]; };

describe('generateMoment - the pipeline (scan→repair→compile→judge→fallback)', () => {
  it('valid code + passing judge → generated', async () => {
    const r = await generateMoment(input(), deps());
    expect(r.status).toBe('generated');
    expect(r.code).toBe(VALID_CODE);
    expect(r.receipt.outcome).toBe('generated');
    expect(r.receipt.attempts).toBe(1);
    expect(r.receipt.judgeScore).toBe(8);
  });

  it('scan fails once → 1 repair → generated', async () => {
    const r = await generateMoment(input(), deps({ writeComponent: queue([INVALID_CODE, VALID_CODE]) }));
    expect(r.status).toBe('generated');
    expect(r.receipt.attempts).toBe(2);
    expect(r.receipt.scans.map((s) => s.passed)).toEqual([false, true]);
  });

  it('scan fails twice → fallback', async () => {
    const r = await generateMoment(input(), deps({ writeComponent: queue([INVALID_CODE, INVALID_CODE]) }));
    expect(r.status).toBe('fallback');
    expect(r.fallbackReason).toMatch(/scan/);
  });

  it('compile fails → fallback (compiled=false, no fabricated success)', async () => {
    const r = await generateMoment(input(), deps({ compile: async () => ({ ok: false, error: 'TS2322 type error' }) }));
    expect(r.status).toBe('fallback');
    expect(r.receipt.compiled).toBe(false);
    expect(r.fallbackReason).toMatch(/compile/);
  });

  it('low judge score → 1 revision → generated', async () => {
    let c = 0;
    const r = await generateMoment(input(), deps({
      writeComponent: queue([VALID_CODE, VALID_CODE]),
      evaluate: async () => (c++ === 0 ? { score: 5, issues: ['type too small'] } : { score: 8, issues: [] }),
    }));
    expect(r.status).toBe('generated');
    expect(r.receipt.judgeScore).toBe(8);
    expect(r.receipt.attempts).toBe(2);
  });

  it('low judge score twice → fallback', async () => {
    const r = await generateMoment(input(), deps({ evaluate: async () => ({ score: 5, issues: ['x'] }) }));
    expect(r.status).toBe('fallback');
    expect(r.fallbackReason).toMatch(/judge 5/);
  });

  it('★ killing the judge threshold forces engine fallback (spec §10 acceptance)', async () => {
    const r = await generateMoment(input(), deps({ judgeThreshold: 11, evaluate: async () => ({ score: 9, issues: [] }) }));
    expect(r.status).toBe('fallback');
    expect(r.fallbackReason).toMatch(/judge 9 < 11/);
  });

  it('model throws → fallback, never throws, receipt present', async () => {
    let r: Awaited<ReturnType<typeof generateMoment>> | undefined;
    await expect((async () => { r = await generateMoment(input(), deps({ writeComponent: async () => { throw new Error('boom'); } })); })()).resolves.toBeUndefined();
    expect(r!.status).toBe('fallback');
    expect(r!.receipt.momentId).toBe('m1');
  });
});

describe('buildCodegenPrompt - structure', () => {
  it('data is LAST (Rule 35) and the export is parametric', () => {
    const prompt = buildCodegenPrompt(input());
    expect(prompt.indexOf('<moment_data>')).toBeGreaterThan(prompt.indexOf('<hard_rules>'));
    expect(prompt).toMatch(/MgData/);
    expect(prompt).toMatch(/data props/);
    expect(prompt).not.toMatch(/YoY growth/); // no literal label baked into the prompt
  });
});

describe('promptHash - Law 5 caching (keys on STRUCTURE, not values)', () => {
  it('same input → same hash; a VALUE edit → SAME hash (re-render, not re-generate)', () => {
    const a = promptHash(input());
    expect(promptHash(input())).toBe(a);
    expect(promptHash(input({ contentPayload: { value: 99, suffix: '%', label: 'other label' } }))).toBe(a);
    expect(promptHash(input({ anchors: { wordFrames: [5, 9, 20] } }))).toBe(a); // anchor edit reuses code
  });

  it('a SHAPE change (drop a field) or brand change → different hash', () => {
    const a = promptHash(input());
    expect(promptHash(input({ contentPayload: { value: 40, suffix: '%' } }))).not.toBe(a); // dropped label
    const b = { ...INSTURIX, colors: { ...INSTURIX.colors, accent: '#123456' } };
    expect(promptHash(input({ brand: b }))).not.toBe(a); // brand token change
  });
});

describe('sanity: the test VALID_CODE actually passes the real scan', () => {
  it('VALID_CODE passes scanCode; INVALID_CODE fails', () => {
    expect(scanCode(VALID_CODE).ok).toBe(true);
    expect(scanCode(INVALID_CODE).ok).toBe(false);
  });
});
