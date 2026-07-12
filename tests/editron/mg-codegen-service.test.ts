import { describe, expect, it } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import { scanCode } from '@/lib/editron/motion-graphics/codegen/scan';
import {
  applyImportPreamble,
  buildCodegenPrompt,
  generateMoment,
  promptHash,
  type CodegenDeps,
} from '@/lib/editron/motion-graphics/codegen/codegen-service';
import type { MgMomentInput } from '@/lib/editron/motion-graphics/codegen/types';
import type { SemanticMgCandidate } from '@/lib/editron/motion-graphics/engine/semantic-mg-candidates';

// A minimal scan-passing component that declares its own Data type and reads data.value as a prop.
const VALID_CODE = `
import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Brand} from './kit/brand';
import {Stage, Region} from './kit/stage';
import {FitHeadline} from './kit/fit-text';
import {phases, countUp} from './kit/choreo';
type Data = { value?: number };
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => {
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
// The model is told NOT to write imports — a realistic import-less body (VALID_CODE minus imports).
const NO_IMPORT_CODE = `
type Data = { value?: number };
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => {
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

function candidate(over: Partial<SemanticMgCandidate> = {}): SemanticMgCandidate {
  return {
    id: 'smg_1',
    factKind: 'bounded-stat',
    sourceSpan: { text: 'we grew 40%', startMs: 0, endMs: 900 },
    content: { value: 40, label: 'YoY growth', unit: '%' },
    evidenceKeys: ['part:v:primary-value'],
    licenses: ['bounded-proportion', 'source-span'],
    salience: 0.6,
    rhetoricalRole: 'claim',
    hardGate: { passed: true, reasons: ['licensed-by-content-facts'], blockedBy: [] },
    scoreInputs: { structuralStrength: 0.6, salience: 0.6, evidenceStrength: 0.5, renderRisk: 0.2 },
    ...over,
  };
}

function input(over: Partial<MgMomentInput> = {}): MgMomentInput {
  return {
    momentId: 'm1',
    candidate: candidate(),
    brand: INSTURIX,
    window: { startFrame: 0, endFrame: 90, fps: 30 },
    anchors: { wordFrames: [10, 40] },
    expressiveness: { tier: 'standard', intensity: 0.6, emphasisScale: 1 },
    placement: {
      region: 'bottom-center',
      avoid: [{ x: 0.3, y: 0.15, width: 0.4, height: 0.55, reason: 'main-subject' }],
      prefer: [{ x: 0, y: 0.72, width: 1, height: 0.28, reason: 'negative-space' }],
    },
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

describe('generateMoment - the pipeline (decline / scan→repair→compile→judge→fallback)', () => {
  it('valid code + passing judge → generated', async () => {
    const r = await generateMoment(input(), deps());
    expect(r.status).toBe('generated');
    expect(r.code).toContain('export const MgScene');
    expect(r.code).toMatch(/^import React from 'react';/); // canonical imports prepended
    expect(scanCode(r.code!).ok).toBe(true);
    expect(r.receipt.outcome).toBe('generated');
    expect(r.receipt.attempts).toBe(1);
    expect(r.receipt.judgeScore).toBe(8);
  });

  it('★ model DECLINES → status declined, no MG, no fallback card', async () => {
    const r = await generateMoment(input(), deps({ writeComponent: async () => 'DECLINE: no faithful visual for a vague claim' }));
    expect(r.status).toBe('declined');
    expect(r.reason).toMatch(/vague claim/);
    expect(r.code).toBeUndefined();
    expect(r.receipt.outcome).toBe('declined');
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
    expect(r.reason).toMatch(/scan/);
  });

  it('compile fails → fallback (compiled=false, no fabricated success)', async () => {
    const r = await generateMoment(input(), deps({ compile: async () => ({ ok: false, error: 'TS2322 type error' }) }));
    expect(r.status).toBe('fallback');
    expect(r.receipt.compiled).toBe(false);
    expect(r.reason).toMatch(/compile/);
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
    expect(r.reason).toMatch(/judge 5/);
  });

  it('★ killing the judge threshold forces fallback', async () => {
    const r = await generateMoment(input(), deps({ judgeThreshold: 11, evaluate: async () => ({ score: 9, issues: [] }) }));
    expect(r.status).toBe('fallback');
    expect(r.reason).toMatch(/judge 9 < 11/);
  });

  it('model throws → fallback, never throws, receipt present', async () => {
    let r: Awaited<ReturnType<typeof generateMoment>> | undefined;
    await expect((async () => { r = await generateMoment(input(), deps({ writeComponent: async () => { throw new Error('boom'); } })); })()).resolves.toBeUndefined();
    expect(r!.status).toBe('fallback');
    expect(r!.receipt.momentId).toBe('m1');
  });
});

describe('import normalization - the eval-caught fix (model omits imports ~half the time)', () => {
  it('★ model returns an import-LESS body → the artifact ships with the full canonical import block', async () => {
    const r = await generateMoment(input(), deps({ writeComponent: async () => NO_IMPORT_CODE }));
    expect(r.status).toBe('generated');
    expect(r.code).toMatch(/^import React from 'react';/);
    expect(r.code).toContain("} from './kit/choreo';");
    expect(r.code).toContain('export const MgScene');
    expect(scanCode(r.code!).ok).toBe(true);
  });

  it('applyImportPreamble prepends the kit block to an import-less body (scan still passes)', () => {
    const out = applyImportPreamble(NO_IMPORT_CODE);
    expect(out.startsWith("import React from 'react';")).toBe(true);
    expect(out).toContain('export const MgScene');
    expect(scanCode(out).ok).toBe(true);
  });

  it('strips the model\'s own imports (no duplicates) and is idempotent', () => {
    const out = applyImportPreamble(VALID_CODE);
    expect((out.match(/^import React from 'react';/gm) ?? []).length).toBe(1);
    expect(applyImportPreamble(out)).toBe(out);
  });
});

describe('buildCodegenPrompt - structure (no types, fact-driven, data-last)', () => {
  it('the moment is LAST (Rule 35), describes the fact SHAPE, and leaks no literal values', () => {
    const prompt = buildCodegenPrompt(input());
    expect(prompt.indexOf('<moment>')).toBeGreaterThan(prompt.indexOf('<hard_rules>'));
    expect(prompt).toMatch(/data props/);
    expect(prompt).toMatch(/bounded-stat/); // the fact KIND is named
    expect(prompt).not.toMatch(/YoY growth/); // no literal fact value/label baked into the prompt
    expect(prompt).not.toMatch(/\b40\b/); // no literal figure in the prompt (values flow as data props)
    expect(prompt).toMatch(/DECLINE/); // decline path is offered
  });
});

describe('promptHash - Law 5 caching (keys on the fact SHAPE + register, not values)', () => {
  it('same input → same hash; a VALUE edit → SAME hash (re-render, not re-generate)', () => {
    const a = promptHash(input());
    expect(promptHash(input())).toBe(a);
    // same content KEYS, different values → same code
    expect(promptHash(input({ candidate: candidate({ content: { value: 99, label: 'other', unit: '%' } }) }))).toBe(a);
    // anchor edit reuses code
    expect(promptHash(input({ anchors: { wordFrames: [5, 9, 20] } }))).toBe(a);
  });

  it('a SHAPE change (drop a prop), a tier change, or a brand change → different hash', () => {
    const a = promptHash(input());
    expect(promptHash(input({ candidate: candidate({ content: { value: 40, unit: '%' } }) }))).not.toBe(a); // dropped label
    expect(promptHash(input({ expressiveness: { tier: 'hero', intensity: 0.9, emphasisScale: 1.4 } }))).not.toBe(a);
    const b = { ...INSTURIX, colors: { ...INSTURIX.colors, accent: '#123456' } };
    expect(promptHash(input({ brand: b }))).not.toBe(a);
  });
});

describe('sanity: the test VALID_CODE actually passes the real scan', () => {
  it('VALID_CODE passes scanCode; INVALID_CODE fails', () => {
    expect(scanCode(VALID_CODE).ok).toBe(true);
    expect(scanCode(INVALID_CODE).ok).toBe(false);
  });
});
