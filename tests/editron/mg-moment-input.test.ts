import { describe, expect, it } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import { buildMgMomentInput, type BuildMgMomentInputArgs, type MgPlacementSource, type MgExpressionSource } from '@/lib/editron/motion-graphics/codegen/moment-input';
import type { SemanticMgCandidate } from '@/lib/editron/motion-graphics/engine/semantic-mg-candidates';
import type { AtomicPlacementResolution } from '@/lib/editron/services/atomic-placement';
import type { MgExpressionAuthority } from '@/lib/editron/services/mg-expression-authority';

function candidate(): SemanticMgCandidate {
  return {
    id: 'smg_1', factKind: 'bounded-stat',
    sourceSpan: { text: 'we grew 40%', startMs: 0, endMs: 900 },
    content: { value: 40, label: 'YoY growth', unit: '%' },
    evidenceKeys: ['part:v:primary-value'], licenses: ['bounded-proportion'],
    salience: 0.6, rhetoricalRole: 'claim',
    hardGate: { passed: true, reasons: ['ok'], blockedBy: [] },
    scoreInputs: { structuralStrength: 0.6, salience: 0.6, evidenceStrength: 0.5, renderRisk: 0.2 },
  };
}

function args(over: Partial<BuildMgMomentInputArgs> = {}): BuildMgMomentInputArgs {
  return {
    momentId: 'm1',
    candidate: candidate(),
    brand: INSTURIX,
    window: { startFrame: 30, endFrame: 120, fps: 30 },
    expression: { qualityTier: 'hero', relevanceScore: 0.82, typography: { emphasisScale: 1.4 } },
    placement: {
      candidateRegion: 'bottom-center',
      requestedRegion: 'bottom-center',
      placementHints: {
        avoid: [{ x: 0.3, y: 0.1, width: 0.4, height: 0.6, reason: 'main-subject' }],
        prefer: [{ x: 0, y: 0.72, width: 1, height: 0.28, reason: 'negative-space' }],
      },
    },
    ...over,
  };
}

describe('buildMgMomentInput - fuses the seam context into one validated input', () => {
  it('★ maps tier / intensity / emphasis + region + boxes, and passes the candidate through untouched', () => {
    const a = args();
    const mi = buildMgMomentInput(a);
    expect(mi.candidate).toBe(a.candidate); // the licensed fact flows through by reference, unmodified
    expect(mi.candidate.factKind).toBe('bounded-stat');
    expect(mi.expressiveness.tier).toBe('hero');
    expect(mi.expressiveness.intensity).toBeCloseTo(0.82);
    expect(mi.expressiveness.emphasisScale).toBe(1.4);
    expect(mi.placement.region).toBe('bottom-center');
    expect(mi.placement.avoid).toEqual([{ x: 0.3, y: 0.1, width: 0.4, height: 0.6, reason: 'main-subject' }]);
    expect(mi.placement.prefer[0].reason).toBe('negative-space');
    expect(mi.window).toEqual({ startFrame: 30, endFrame: 120, fps: 30 });
  });

  it('★ derives screen.subject from the main-subject avoid box + negativeSpace from the strongest prefer box', () => {
    const mi = buildMgMomentInput(args());
    expect(mi.screen?.subject).toEqual({ x: 0.3, y: 0.1, width: 0.4, height: 0.6 });
    expect(mi.screen?.negativeSpace).toEqual({ region: 'bottom-center', strength: 1 });
  });

  it('★ resolves the video STYLE IDENTITY from the brand font (always), intent overrides, footageSignals pass through', () => {
    // INSTURIX.fontSans = Plus Jakarta Sans → grotesque-sans → clean-modern identity
    const base = buildMgMomentInput(args());
    expect(base.videoStyle?.styleName).toBe('clean-modern');

    const hype = buildMgMomentInput(args({ intent: 'hype reel' }));
    expect(hype.videoStyle?.styleName).toBe('kinetic-bold'); // intent overrides the identity
    expect(hype.videoStyle?.weight).toBe('heavy');

    const withFootage = buildMgMomentInput(args({ footageSignals: { motionEnergy: 0.9, motionType: 'subject_moving' } }));
    expect(withFootage.footageSignals).toEqual({ motionEnergy: 0.9, motionType: 'subject_moving' });
    expect(buildMgMomentInput(args()).footageSignals).toBeUndefined(); // absent by default (degrades to identity)
  });

  it('no subject box + no prefer box → screen is undefined (not a fabricated zero-box)', () => {
    const mi = buildMgMomentInput(args({
      placement: { placementHints: { avoid: [], prefer: [] } },
    }));
    expect(mi.screen).toBeUndefined();
    expect(mi.placement.region).toBe('full-frame'); // honest "no preference" default (R2N)
  });

  it("★ 'suppressed' tier is defused to 'subtle' (should be gated upstream, never crash)", () => {
    const mi = buildMgMomentInput(args({ expression: { qualityTier: 'suppressed', relevanceScore: 0.1, typography: { emphasisScale: 1 } } }));
    expect(mi.expressiveness.tier).toBe('subtle');
  });

  it('★ clamps out-of-range fractions to [0,1] and non-finite emphasis/intensity to safe values', () => {
    const mi = buildMgMomentInput(args({
      expression: { qualityTier: 'standard', relevanceScore: NaN, typography: { emphasisScale: 0 } },
      placement: { candidateRegion: 'top', placementHints: { avoid: [{ x: -0.2, y: 1.5, width: 2, height: -1, reason: 'main-subject' }], prefer: [] } },
    }));
    expect(mi.expressiveness.intensity).toBe(0.5); // NaN → neutral midpoint
    expect(mi.expressiveness.emphasisScale).toBe(1); // 0 → guarded to 1
    expect(mi.placement.avoid[0]).toEqual({ x: 0, y: 1, width: 1, height: 0, reason: 'main-subject' });
  });

  it('★ FAILS LOUD on a degenerate window (R18N) — never silently ships a zero-length clip', () => {
    expect(() => buildMgMomentInput(args({ window: { startFrame: 100, endFrame: 100, fps: 30 } }))).toThrow(/endFrame > startFrame/);
    expect(() => buildMgMomentInput(args({ window: { startFrame: 0, endFrame: 90, fps: 0 } }))).toThrow(/fps must be positive/);
  });

  it('passes anchors through and caps notes length', () => {
    const mi = buildMgMomentInput(args({ anchors: { wordFrames: [5, 20] }, notes: 'x'.repeat(600) }));
    expect(mi.anchors?.wordFrames).toEqual([5, 20]);
    expect(mi.notes?.length).toBe(400);
  });
});

// Compile-time proof that Codex's REAL rich types structurally satisfy the assembler's source interfaces —
// so `buildMgMomentInput({ placement: resolution, expression: authority })` type-checks at the seam.
describe('structural fit — the real services types satisfy the source contracts', () => {
  it('AtomicPlacementResolution → MgPlacementSource and MgExpressionAuthority → MgExpressionSource', () => {
    // These assignments compile ONLY if the real rich types structurally satisfy the source interfaces (NO
    // casts). If Codex renames a field the assembler reads, tsc fails here — which is the point. At the seam
    // `buildMgMomentInput({ placement: resolution, expression: authority })` then type-checks directly.
    const asPlacement = (r: AtomicPlacementResolution): MgPlacementSource => r;
    const asExpression = (a: MgExpressionAuthority): MgExpressionSource => a;
    expect(typeof asPlacement).toBe('function');
    expect(typeof asExpression).toBe('function');
  });
});
