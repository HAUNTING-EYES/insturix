import { describe, expect, it } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import { scanCode } from '@/lib/editron/motion-graphics/codegen/scan';
import {
  applyImportPreamble,
  buildCodegenPrompt,
  generateMoment,
  MgProviderFailureError,
  mgProviderHttpError,
  promptHash,
  type CodegenDeps,
} from '@/lib/editron/motion-graphics/codegen/codegen-service';
import type { MgMomentInput } from '@/lib/editron/motion-graphics/codegen/types';
import type { MgMomentDesignPlan, MgVideoDesignBrief } from '@/lib/editron/motion-graphics/codegen/design/design-plan';
import {
  MG_RENDER_WORKER_CONTRACT_VERSION,
  mgRenderWorkerResultSchema,
} from '@/lib/editron/motion-graphics/codegen/worker-contract';
import type { SemanticMgCandidate } from '@/lib/editron/motion-graphics/engine/semantic-mg-candidates';

// A minimal scan-passing component that declares its own Data type and reads data.value as a prop.
const VALID_CODE = `
import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Brand} from './kit/brand';
import {Stage, Region} from './kit/stage';
import {FitHeadline} from './kit/fit-text';
import {phases, countUp, ambient} from './kit/choreo';
type Data = { value?: number; motionIntensity: number };
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  const n = countUp(frame, ph.intro, 30, data.value ?? 0);
  return (
    <Stage brand={brand}>
      <div style={ambient(frame, ph.build, 'float', data.motionIntensity)}>
        <Region brand={brand} x={0.08} y={0.2} w={0.84} h={0.6} align="center" justify="center">
          <FitHeadline brand={brand} text={String(n)} size="display" />
        </Region>
      </div>
    </Stage>
  );
};`;
const INVALID_CODE = 'export const MgScene = () => <div>no stage root</div>;'; // fails the scan
// The model is told NOT to write imports — a realistic import-less body (VALID_CODE minus imports).
const NO_IMPORT_CODE = `
type Data = { value?: number; motionIntensity: number };
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ph = phases(durationInFrames, brand);
  const n = countUp(frame, ph.intro, 30, data.value ?? 0);
  return (
    <Stage brand={brand}>
      <div style={ambient(frame, ph.build, 'float', data.motionIntensity)}>
        <Region brand={brand} x={0.08} y={0.2} w={0.84} h={0.6} align="center" justify="center">
          <FitHeadline brand={brand} text={String(n)} size="display" />
        </Region>
      </div>
    </Stage>
  );
};`;
const PANEL_CODE = NO_IMPORT_CODE.replace(
  '<FitHeadline brand={brand} text={String(n)} size="display" />',
  '<Plate brand={brand}><FitHeadline brand={brand} text={String(n)} size="display" /></Plate>',
);

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

  it('scanner-valid malformed JSX gets one compiler-guided repair before rendering', async () => {
    const prompts: string[] = [];
    let compileCalls = 0;
    const r = await generateMoment(input(), deps({
      writeComponent: async (prompt) => {
        prompts.push(prompt);
        return NO_IMPORT_CODE;
      },
      compile: async () => (++compileCalls === 1
        ? { ok: false, error: 'MgScene.tsx:37:12 ERROR: Expected ">" but found end of file' }
        : { ok: true }),
    }));

    expect(r.status).toBe('generated');
    expect(r.receipt.attempts).toBe(2);
    expect(r.receipt.compiled).toBe(true);
    expect(r.receipt.compileError).toBeUndefined();
    expect(compileCalls).toBe(2);
    expect(prompts[1]).toContain('Expected ">" but found end of file');
  });

  it('falls back after the single compiler repair also fails', async () => {
    const r = await generateMoment(input(), deps({
      writeComponent: async () => NO_IMPORT_CODE,
      compile: async () => ({ ok: false, error: 'still malformed' }),
    }));
    expect(r.status).toBe('fallback');
    expect(r.receipt.attempts).toBe(3);
    expect(r.receipt.compiled).toBe(false);
    expect(r.reason).toMatch(/compile repair failed/);
  });

  it('uses the remaining bounded attempt when a compiler repair fails the safety scan', async () => {
    let compileCalls = 0;
    const r = await generateMoment(input(), deps({
      writeComponent: queue([NO_IMPORT_CODE, INVALID_CODE, NO_IMPORT_CODE]),
      compile: async () => (++compileCalls === 1
        ? { ok: false, error: 'MgScene.tsx:37:12 ERROR: baseStanger is not defined' }
        : { ok: true }),
    }));

    expect(r.status).toBe('generated');
    expect(r.receipt.attempts).toBe(3);
    expect(r.receipt.scans.map((entry) => entry.passed)).toEqual([true, false, true]);
    expect(r.receipt.compiled).toBe(true);
    expect(compileCalls).toBe(2);
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

  it('uses the remaining bounded attempt when a visual revision fails the safety scan', async () => {
    let judgeCalls = 0;
    const r = await generateMoment(input(), deps({
      writeComponent: queue([VALID_CODE, INVALID_CODE, VALID_CODE]),
      evaluate: async () => (++judgeCalls === 1
        ? { score: 7, issues: ['form lacks designed structure'] }
        : { score: 8.4, issues: [] }),
    }));

    expect(r.status).toBe('generated');
    expect(r.receipt.attempts).toBe(3);
    expect(r.receipt.scans.map((entry) => entry.passed)).toEqual([true, false, true]);
    expect(r.receipt.judgeScore).toBe(8.4);
    expect(judgeCalls).toBe(2);
  });

  it('repairs a compiler-invalid visual revision with the remaining bounded attempt', async () => {
    let compileCalls = 0;
    let judgeCalls = 0;
    const r = await generateMoment(input(), deps({
      writeComponent: queue([VALID_CODE, NO_IMPORT_CODE, NO_IMPORT_CODE]),
      compile: async () => {
        compileCalls += 1;
        return compileCalls === 2
          ? { ok: false, error: 'MgScene.tsx:50:22 ERROR: Syntax error "p"' }
          : { ok: true };
      },
      evaluate: async () => {
        judgeCalls += 1;
        return judgeCalls === 1
          ? { score: 0, issues: ['comparison value unreadable'] }
          : { score: 8.6, issues: [] };
      },
    }));

    expect(r.status).toBe('generated');
    expect(r.receipt.attempts).toBe(3);
    expect(r.receipt.compiled).toBe(true);
    expect(r.receipt.compileError).toBeUndefined();
    expect(compileCalls).toBe(3);
    expect(judgeCalls).toBe(2);
  });

  it('fails closed when the bounded visual-revision compiler repair is still invalid', async () => {
    let compileCalls = 0;
    const r = await generateMoment(input(), deps({
      writeComponent: queue([VALID_CODE, NO_IMPORT_CODE, NO_IMPORT_CODE]),
      compile: async () => {
        compileCalls += 1;
        return compileCalls === 1 ? { ok: true } : { ok: false, error: 'still malformed' };
      },
      evaluate: async () => ({ score: 0, issues: ['unreadable'] }),
    }));

    expect(r.status).toBe('fallback');
    expect(r.receipt.attempts).toBe(3);
    expect(r.receipt.compiled).toBe(false);
    expect(r.reason).toMatch(/revision compile repair failed: still malformed/);
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
    expect(r!.reason).toMatch(/model call failed: boom/);
    expect(r!.receipt.momentId).toBe('m1');
  });

  it('persists typed retry semantics through the strict worker result contract', async () => {
    const providerError = mgProviderHttpError({
      provider: 'zai',
      operation: 'component-generation',
      statusCode: 429,
      message: 'quota exhausted',
    });
    const r = await generateMoment(input(), deps({ writeComponent: async () => { throw providerError; } }));

    expect(r.status).toBe('fallback');
    expect(r.receipt.attempts).toBe(2);
    expect(r.receipt.failure).toEqual({
      domain: 'provider',
      provider: 'zai',
      operation: 'component-generation',
      code: 'rate-limited',
      disposition: 'retryable',
      statusCode: 429,
    });
    expect(mgRenderWorkerResultSchema.parse({
      version: MG_RENDER_WORKER_CONTRACT_VERSION,
      jobId: `mgr_${'a'.repeat(32)}`,
      status: 'fallback',
      completedAt: '2026-07-14T00:00:00.000Z',
      receipt: r.receipt,
      reason: r.reason,
    }).receipt.failure).toEqual(r.receipt.failure);

    expect(mgProviderHttpError({
      provider: 'zai',
      operation: 'component-generation',
      statusCode: 401,
      message: 'bad credentials',
    }).failure).toMatchObject({ code: 'authentication', disposition: 'terminal' });
  });

  it('does not leave a provider failure on a later successful generation attempt', async () => {
    let calls = 0;
    const r = await generateMoment(input(), deps({
      writeComponent: async () => {
        calls += 1;
        if (calls === 1) throw new MgProviderFailureError('temporary network failure', {
          domain: 'provider',
          provider: 'zai',
          operation: 'component-generation',
          code: 'network',
          disposition: 'retryable',
        });
        return VALID_CODE;
      },
    }));

    expect(r.status).toBe('generated');
    expect(r.receipt.failure).toBeUndefined();
  });

  it('compile or judge throws -> fallback, never escapes the codegen boundary', async () => {
    const compile = await generateMoment(input(), deps({ compile: async () => { throw new Error('bundler crashed'); } }));
    expect(compile.status).toBe('fallback');
    expect(compile.reason).toMatch(/compile threw: bundler crashed/);

    const judge = await generateMoment(input(), deps({ evaluate: async () => { throw new Error('invalid judge JSON'); } }));
    expect(judge.status).toBe('fallback');
    expect(judge.reason).toMatch(/judge threw: invalid judge JSON/);
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
    // The <moment> tag is also REFERENCED in prose (foundational knowledge + hard rules point the model at it),
    // so a first-indexOf collides with those references. The DATA block is the LAST <moment> occurrence, it must
    // start AFTER the hard-rules section, and it must CLOSE the prompt (Rule 35: the licensed data goes last).
    expect(prompt.lastIndexOf('<moment>')).toBeGreaterThan(prompt.indexOf('</hard_rules>'));
    expect(prompt.trimEnd().endsWith('</moment>')).toBe(true);
    expect(prompt).toMatch(/data props/);
    expect(prompt).toMatch(/bounded-stat/); // the fact KIND is named
    expect(prompt).not.toMatch(/YoY growth/); // no literal fact value/label baked into the prompt
    expect(prompt).not.toMatch(/\b40\b/); // no literal figure in the prompt (values flow as data props)
    expect(prompt).toMatch(/DECLINE/); // decline path is offered
    expect(prompt).toContain('FOOTAGE CONTRAST');
    expect(prompt).toContain('intrusive LOCAL brand-token protection');
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

  it('changes when real visual evidence changes, but stays stable for identical evidence', () => {
    const visualEvidence: NonNullable<MgMomentInput['visualEvidence']> = {
      space: 'edited-canvas',
      canvas: { width: 1920, height: 1080 },
      frames: [
        { role: 'context-before', coordinate: { kind: 'edited-timeline', timelineFrame: 10 }, imageDataUrl: 'data:image/jpeg;base64,before' },
        { role: 'anchor', coordinate: { kind: 'edited-timeline', timelineFrame: 20 }, imageDataUrl: 'data:image/jpeg;base64,anchor' },
        { role: 'context-after', coordinate: { kind: 'edited-timeline', timelineFrame: 30 }, imageDataUrl: 'data:image/jpeg;base64,after' },
      ],
    };
    const a = promptHash(input({ visualEvidence }));
    expect(promptHash(input({ visualEvidence }))).toBe(a);
    expect(promptHash(input({
      visualEvidence: {
        ...visualEvidence,
        frames: [
          visualEvidence.frames[0],
          { ...visualEvidence.frames[1], imageDataUrl: 'data:image/jpeg;base64,different' },
          visualEvidence.frames[2],
        ],
      },
    }))).not.toBe(a);
  });
});

describe('generateMoment - design-then-code prompt switch (P5-1 Phase C)', () => {
  const brief: MgVideoDesignBrief = {
    styleName: 'clean', motifLanguage: 'thin gold rule under key terms', paletteMoves: 'charcoal + gold',
    motionPersonality: 'snappy', formVariety: 'type then structure',
  };
  const overlayPlan: MgMomentDesignPlan = {
    momentId: 'm1', lane: 'overlay-kit', concept: 'kinetic figure, growth dominates', targetBar: 'energy',
    structure: { placement: 'center-right', grouping: 'figure + underline', readingOrder: 'figure then rule' },
    elements: [
      { kind: 'headline', role: 'the growth figure', dataProps: ['value'] },
      { kind: 'rule', role: 'motif underline', dataProps: [] },
    ],
    motion: { enterOrder: [0, 1], build: 'figure enters, rule draws', hold: 'gentle float', syncTo: 'phases-only' },
    look: 'integrated',
  };
  // capture the prompt, then DECLINE to short-circuit the pipeline right after the prompt is built.
  const capturing = () => {
    const ref = { prompt: '' };
    return { ref, deps: deps({ writeComponent: async (p) => { ref.prompt = p; return 'DECLINE: capture'; } }) };
  };

  it('★ with an approved design → the CODER prompt (implementation), carrying the plan', async () => {
    const { ref, deps: d } = capturing();
    const r = await generateMoment(input({ design: { plan: overlayPlan, brief } }), d);
    expect(r.status).toBe('declined'); // the capture decline, proving the prompt was built and sent
    expect(ref.prompt).toContain('IMPLEMENTATION engineer'); // the coder role, not the free-form designer role
    expect(ref.prompt).toContain('<design>'); // the approved plan crossed into the prompt
    expect(ref.prompt).toContain('growth dominates'); // ...the plan's own concept text
    expect(ref.prompt).toMatch(/motionIntensity as a REQUIRED number/i);
    expect(ref.prompt).toMatch(/every ambient\(\) call must pass the exact expression\s+data\.motionIntensity/i);
  });

  it('licenses a surfaced panel only when the approved design explicitly states its reason', async () => {
    const unlicensed = await generateMoment(input(), deps({ writeComponent: async () => PANEL_CODE }));
    expect(unlicensed.status).toBe('fallback');
    expect(unlicensed.reason).toMatch(/Plate.*not licensed/i);

    const panelPlan: MgMomentDesignPlan = {
      ...overlayPlan,
      look: 'panel',
      panelReason: 'Dense comparison needs a bounded local contrast surface over visually busy footage.',
    };
    const licensed = await generateMoment(
      input({ design: { plan: panelPlan, brief } }),
      deps({ writeComponent: async () => PANEL_CODE }),
    );
    expect(licensed.status).toBe('generated');
  });

  it('without a design → the free-form codegen prompt (today\'s path, unchanged)', async () => {
    const { ref, deps: d } = capturing();
    await generateMoment(input(), d);
    expect(ref.prompt).toContain('designer-engineer'); // the free-form role
    expect(ref.prompt).not.toContain('IMPLEMENTATION engineer');
    expect(ref.prompt).not.toContain('<design>');
  });

  it('★ a cutaway-scene design has no component → falls back to free-form, never throws', async () => {
    const cutaway: MgMomentDesignPlan = {
      ...overlayPlan, lane: 'cutaway-scene', elements: [{ kind: 'texture', role: 'ambient grain', dataProps: [] }],
    };
    const { ref, deps: d } = capturing();
    const r = await generateMoment(input({ design: { plan: cutaway, brief } }), d);
    expect(r.status).toBe('declined'); // did NOT throw on the component-less lane
    expect(ref.prompt).toContain('designer-engineer'); // fell back to free-form
    expect(ref.prompt).not.toContain('<design>');
  });

  it('★ an illustrated-overlay design takes the CODER path (P5-3: render-moment produces the backdrop)', async () => {
    const illustrated: MgMomentDesignPlan = {
      ...overlayPlan, lane: 'illustrated-overlay',
      imagery: { scenePrompt: 'abstract charcoal field, soft gold light', mode: 'still', paletteDirection: 'charcoal + gold' },
    };
    const { ref, deps: d } = capturing();
    const r = await generateMoment(input({ design: { plan: illustrated, brief } }), d);
    expect(r.status).toBe('declined'); // capture decline; the coder prompt was built + sent
    expect(ref.prompt).toContain('IMPLEMENTATION engineer'); // the coder, not free-form
    expect(ref.prompt).toContain('<design>'); // the illustrated design crossed into the prompt
  });

  it('promptHash keys on the design: present → different, identical designs → equal, design-less → unchanged', () => {
    const base = promptHash(input());
    const withDesign = promptHash(input({ design: { plan: overlayPlan, brief } }));
    expect(withDesign).not.toBe(base);
    expect(promptHash(input({ design: { plan: overlayPlan, brief } }))).toBe(withDesign); // deterministic
    expect(promptHash(input())).toBe(base); // the new field leaves the free-form hash byte-identical
  });
});

describe('sanity: the test VALID_CODE actually passes the real scan', () => {
  it('VALID_CODE passes scanCode; INVALID_CODE fails', () => {
    expect(scanCode(VALID_CODE).ok).toBe(true);
    expect(scanCode(INVALID_CODE).ok).toBe(false);
  });
});
