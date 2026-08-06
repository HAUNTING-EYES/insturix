import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import {
  measureJudgeFrameGeometry,
  mgJudgeSubjectVeto,
  parseJudgeResponse,
} from '@/lib/editron/motion-graphics/codegen/production-runtime';

const CH = 4;

async function makeFrame(
  width: number,
  height: number,
  rects: { x: number; y: number; width: number; height: number; alpha: number }[],
): Promise<Buffer> {
  const data = Buffer.alloc(width * height * CH);
  for (const r of rects) {
    for (let y = r.y; y < Math.min(height, r.y + r.height); y += 1) {
      for (let x = r.x; x < Math.min(width, r.x + r.width); x += 1) {
        data[(y * width + x) * CH + 3] = r.alpha;
      }
    }
  }
  return sharp(data, { raw: { width, height, channels: CH } }).png().toBuffer();
}

const W = 200;
const H = 100;

describe('measureJudgeFrameGeometry (Fix-2 geometry source of truth)', () => {
  it('blank frame -> no bbox, zero coverage, subject box computed in px', async () => {
    const frame = await makeFrame(W, H, []);
    const g = await measureJudgeFrameGeometry([frame], W, H, { x: 0.5, y: 0.4, width: 0.4, height: 0.4 });
    expect(g.bboxPx).toBeNull();
    expect(g.coveredPct).toBe(0);
    expect(g.subjectPx).toEqual({ x: 100, y: 40, width: 80, height: 40 });
  });

  it('opaque plate covering the subject box -> coveredPct ~1 and bbox covers the plate', async () => {
    const frame = await makeFrame(W, H, [{ x: 100, y: 40, width: 80, height: 40, alpha: 255 }]);
    const g = await measureJudgeFrameGeometry([frame], W, H, { x: 0.5, y: 0.4, width: 0.4, height: 0.4 });
    expect(g.coveredPct).toBeGreaterThan(0.99);
    expect(g.coverageByPhase.length).toBe(1);
    expect(g.coverageByPhase[0]).toBeGreaterThan(0.99);
    expect(g.alphaWeightedCoverage).toBeGreaterThan(0.99);
    expect(g.bboxPx).toEqual({ x: 100, y: 40, width: 80, height: 40 });
  });

  it('graphic clear of the subject -> zero coverage but bbox present', async () => {
    const frame = await makeFrame(W, H, [{ x: 10, y: 10, width: 30, height: 20, alpha: 255 }]);
    const g = await measureJudgeFrameGeometry([frame], W, H, { x: 0.7, y: 0.7, width: 0.2, height: 0.2 });
    expect(g.coveredPct).toBe(0);
    expect(g.coverageByPhase).toEqual([0]);
    expect(g.alphaWeightedCoverage).toBe(0);
    expect(g.bboxPx).toEqual({ x: 10, y: 10, width: 30, height: 20 });
  });

  it('mid-alpha type outside the subject box: visible bbox but zero subject coverage metrics', async () => {
    const frame = await makeFrame(W, H, [{ x: 0, y: 0, width: 40, height: 12, alpha: 120 }]);
    const g = await measureJudgeFrameGeometry([frame], W, H, { x: 0.5, y: 0.5, width: 0.3, height: 0.3 });
    expect(g.bboxPx).toEqual({ x: 0, y: 0, width: 40, height: 12 });
    expect(g.coveredPct).toBe(0);
    expect(g.alphaWeightedCoverage).toBe(0);
  });

  it('mid-alpha type INSIDE the subject box: alpha-weighted > 0 but opaque coverage stays 0', async () => {
    const frame = await makeFrame(W, H, [{ x: 120, y: 45, width: 30, height: 20, alpha: 120 }]);
    const g = await measureJudgeFrameGeometry([frame], W, H, { x: 0.55, y: 0.45, width: 0.3, height: 0.3 });
    expect(g.coveredPct).toBe(0);
    expect(g.alphaWeightedCoverage).toBeGreaterThan(0);
  });
});

describe('mgJudgeSubjectVeto (code-verified corpse-5 line)', () => {
  it('at/above the default threshold (0.5) -> veto', () => {
    expect(mgJudgeSubjectVeto(0.5)).toBe(true);
    expect(mgJudgeSubjectVeto(0.8)).toBe(true);
  });
  it('below the threshold -> no veto', () => {
    expect(mgJudgeSubjectVeto(0.05)).toBe(false);
    expect(mgJudgeSubjectVeto(0.49)).toBe(false);
  });
  it('env override MG_SUBJECT_COVER_HARD moves the line', () => {
    vi.stubEnv('MG_SUBJECT_COVER_HARD', '0.2');
    try {
      expect(mgJudgeSubjectVeto(0.3)).toBe(true);
      expect(mgJudgeSubjectVeto(0.1)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('parseJudgeResponse grounding (Fix-2 veto authority split)', () => {
  const dims = { hierarchy: 8, typography: 8, color: 8, composition: 8, motion: 8, form: 8 };
  const cleanHard = {
    fabrication: false,
    nonBrandColor: false,
    clippedOrOverflowing: false,
    subjectInterference: false,
    captionOrExistingTextInterference: false,
    unreadableContrast: false,
    opaqueFootageOcclusion: false,
    missingMotionDevelopment: false,
    templateLikeForm: false,
  };
  const verdict = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    faithful: true,
    ...dims,
    hardFailures: cleanHard,
    score: 8.6,
    issues: [],
    reasoning: 'ok',
    ...overrides,
  });

  it('legacy (no geo): judge subject + caption hard-fail still caps at 4', () => {
    const r = parseJudgeResponse(verdict({
      hardFailures: { ...cleanHard, subjectInterference: true, captionOrExistingTextInterference: true },
    }));
    expect(r.score).toBe(4);
  });

  it('geo hardVeto=true (calibrated veto ENABLED + opaque cover) enforces subjectInterference even when the judge did not flag it', () => {
    const r = parseJudgeResponse(verdict(), {
      subject: { x: 0.5, y: 0.4, width: 0.4, height: 0.4 },
      coveredPct: 0.8,
      hardVetoEligible: true,
      hardVeto: true,
      captionRects: [],
    } as never);
    expect(r.score).toBe(4);
    expect(r.issues.some((i) => /subject covered/.test(i))).toBe(true);
  });

  it('veto ENABLED but below threshold: judge proximity flag is DOWNGRADED and the score survives', () => {
    const r = parseJudgeResponse(
      verdict({ hardFailures: { ...cleanHard, subjectInterference: true } }),
      {
        subject: { x: 0.5, y: 0.4, width: 0.4, height: 0.4 },
        coveredPct: 0.04,
        hardVetoEligible: true,
        hardVeto: false,
        captionRects: [],
      } as never,
    );
    expect(r.score).toBe(8.6);
    expect(r.issues.some((i) => /downgraded to a composition note/.test(i))).toBe(true);
  });

  it('coarse subject box + veto DISABLED: even HIGH opaque coverage never hard-vetoes (brief §10.2/§24.1)', () => {
    const r = parseJudgeResponse(
      verdict({ hardFailures: { ...cleanHard, subjectInterference: true } }),
      {
        subject: { x: 0.5, y: 0.4, width: 0.4, height: 0.4 },
        coveredPct: 0.9,
        hardVetoEligible: false,
        hardVeto: false,
        captionRects: [],
      } as never,
    );
    expect(r.score).toBe(8.6);
    expect(r.issues.some((i) => /DISABLED/.test(i))).toBe(true);
  });

  it('geo captionRects empty downgrades a judge caption hard-fail to feedback', () => {
    const r = parseJudgeResponse(
      verdict({ hardFailures: { ...cleanHard, captionOrExistingTextInterference: true } }),
      { subject: null, coveredPct: 0, hardVetoEligible: false, hardVeto: false, captionRects: [] } as never,
    );
    expect(r.score).toBe(8.6);
    expect(r.issues.some((i) => /caption interference downgraded/.test(i))).toBe(true);
  });
});
