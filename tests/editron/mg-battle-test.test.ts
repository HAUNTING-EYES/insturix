/**
 * MG SYSTEM — COMPREHENSIVE ADVERSARIAL BATTLE TEST (2026-07-17).
 *
 * Founder mandate: "battle test everything built — I WANT NO POSSIBILITY OF ANY FAILURES." This is the one harness
 * that exercises the WHOLE signal-driven MG style system at once (Rule 29: destructive testing — try to BREAK it,
 * not confirm it): the 3 classifiers (font / footage / intent), the two-granularity resolver (video identity +
 * per-moment treatment), the kit colour axis, the moment-input assembler, the prompt assembly, the worker
 * contract, and the taste-gate deterministic floor.
 *
 * It is DETERMINISTIC (no Math.random / Date — pure inputs) so "no failures" is an assertable, CI-permanent fact.
 * It specifically locks in the two contract⟷type-parity corpses this battle test surfaced:
 *   ① brand.fontDisplay rejected by the worker contract (INSTURIX itself sets it);
 *   ② videoStyle / footageSignals rejected by the worker contract (buildMgMomentInput ALWAYS sets videoStyle, so
 *      every real seam-built moment threw at enqueue). Both are guarded below by round-tripping the REAL assembler
 *      output through the REAL contract for BOTH brands across the adversarial matrix.
 */

import { describe, expect, it, vi } from 'vitest';

// buildMgRenderWorkerRequest lives in mg-render-job-service, which imports db/mongodb (throws at module-load
// without MONGODB_URI). buildMgRenderWorkerRequest itself is PURE (builds + strict-parses the request; never
// touches the DB), so this mock just neutralizes the import-time env throw — identical to mg-render-job-service.test.
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MG_RENDER_JOBS: 'editron_mg_render_jobs' },
  getDatabase: vi.fn(),
}));

import {
  resolveVideoStyle,
  resolveMomentStyle,
  renderStyleDirection,
  type VideoStyle,
  type MomentSignals,
} from '@/lib/editron/motion-graphics/codegen/style/style-resolver';
import { classifyFontFamily, fontStylePriors } from '@/lib/editron/motion-graphics/codegen/style/font-family';
import { classifyFootage, footageStyleDelta, type FootageSignals } from '@/lib/editron/motion-graphics/codegen/style/footage-character';
import { classifyIntent, intentStyleDelta } from '@/lib/editron/motion-graphics/codegen/style/intent-genre';
import { buildMgMomentInput, type BuildMgMomentInputArgs } from '@/lib/editron/motion-graphics/codegen/moment-input';
import { buildCodegenPrompt, CODEGEN_STABLE_PREFIX } from '@/lib/editron/motion-graphics/codegen/codegen-service';
import { INSTURIX, NORTHWIND, tint, shade, mix, withAlpha, type Brand } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import { mgMomentInputSchema } from '@/lib/editron/motion-graphics/codegen/worker-contract';
import { buildMgRenderWorkerRequest } from '@/lib/editron/motion-graphics/codegen/mg-render-job-service';
import { evaluateMgRenderSanity, evaluateMgMotionPresence, MIN_MG_MOTION_PRESENCE } from '@/lib/editron/motion-graphics/codegen/mg-placement-gate';
import type { SemanticMgCandidate } from '@/lib/editron/motion-graphics/engine/semantic-mg-candidates';

// ─── the atom vocabularies the whole system is allowed to emit (any value outside these = a leaked/typo'd atom) ───
const MOTIONS = ['gentle', 'smooth', 'snappy', 'sharp', 'elastic', 'pop'] as const;
const WEIGHTS = ['light', 'regular', 'medium', 'heavy'] as const;
const SURFACES = ['flat', 'frosted', 'raised', 'glow'] as const;
const TEXTURES = ['none', 'grain', 'scanline', 'grid', 'dots'] as const;
const DENSITIES = ['airy', 'standard', 'dense'] as const;
const CORNERS = ['sharp', 'medium', 'round'] as const;
const ALIGNMENTS = ['left', 'center'] as const;
const EMPHASES = ['quiet', 'balanced', 'prominent'] as const;
const FONT_FAMILIES = ['geometric-sans', 'grotesque-sans', 'humanist-sans', 'oldstyle-serif', 'modern-serif', 'slab-serif', 'monospace', 'script', 'display'] as const;
const FOOTAGE_CHARS = ['energetic-vivid', 'calm-warm', 'cinematic-moody', 'clean-neutral', 'neutral'] as const;
const INTENT_GENRES = ['saas-demo', 'hype-reel', 'vlog', 'tutorial', 'documentary', 'ad', 'generic'] as const;

// ─── adversarial input matrices — diverse, realistic, and edge-degenerate ───
// 8+ content-type intents (Rule 29) + garbage/keyword-collision cases.
const INTENTS: Array<string | null | undefined> = [
  null, undefined, '', '   ',
  'SaaS product demo', 'product explainer', 'onboarding walkthrough',
  'TikTok reel', 'Instagram short', 'hype promo teaser',
  'YouTube tutorial', 'how-to guide', 'training course',
  'mini-documentary', 'customer testimonial', 'case study',
  'daily vlog', 'behind the scenes', 'lifestyle',
  'commercial spot', 'brand film', 'ad campaign',
  'documentary-style product demo', // R4 collision: doc must beat saas
  'wearing shorts tutorial', // keyword collision: 'shorts' vs 'tutorial'
  '🔥🔥🔥', 'a'.repeat(600), 'unclassifiable gibberish zzzq',
];

// 10 diverse brand fonts spanning all 9 families + CSS stacks + degenerate.
const FONTS: Array<string | null | undefined> = [
  null, undefined, '', '   ', 'sans-serif', 'serif', 'monospace',
  'Poppins', 'Montserrat, sans-serif', 'Inter', '"Helvetica Neue", Arial, sans-serif',
  'Open Sans', 'Georgia', 'Times New Roman', 'Playfair Display', 'Roboto Slab',
  'JetBrains Mono', 'Pacifico', 'Anton', 'Bebas Neue',
  'Poppins SemiBold', 'DejaVu Sans Mono', 'News Gothic', 'FooBarSerif', 'Comic Sans MS',
];

// Aggregate video signals — undefined, boundaries, and pathological (NaN / out-of-range).
const VIDEO_SIGNALS: Array<{ energy?: number; formality?: number } | undefined> = [
  undefined, {}, { energy: 0, formality: 0 }, { energy: 1, formality: 1 },
  { energy: 0.9, formality: 0.2 }, { energy: 0.2, formality: 0.9 }, { energy: 0.55, formality: 0.5 },
  { energy: 0.62, formality: 0.4 }, { energy: 0.63, formality: 0.39 }, // boundary either side of kinetic-bold
  { energy: NaN, formality: NaN }, { energy: Infinity, formality: -5 }, { energy: -1, formality: 2 },
];

// Per-moment footage — spans every character + the R2/R3 corpse triggers + degenerate numbers.
const FOOTAGES: Array<FootageSignals | undefined> = [
  undefined, {},
  { motionEnergy: 0.9 }, { motionEnergy: 0.9, motionType: 'camera_moving' }, // R2: camera motion ≠ energy
  { arousal: 0.9 }, { warmth: 0.8, faceEmotion: 'happy' }, { warmth: 0.1, faceEmotion: 'sad' },
  { brightness: 0.2 }, { brightness: 0.2, faceEmotion: 'sad' }, // R3: dark alone ≠ moody; dark+face = moody
  { brightness: 0.9, saturation: 0.2 }, // clean-neutral
  { motionEnergy: NaN, arousal: Infinity, brightness: -3, saturation: 5 }, // pathological
  { faceEmotion: '' }, { faceEmotion: null }, { faceEmotion: 'CONFUSED' }, { faceEmotion: 'HAPPY' },
];

const SALIENCES = [undefined, 0, 0.2, 0.4, 0.5, 0.7, 0.71, 0.9, 1, NaN];
const TIERS: Array<MomentSignals['tier']> = [undefined, 'subtle', 'standard', 'hero'];
const FACT_KINDS = ['comparison', 'magnitude-stat', 'series', 'bounded-stat', 'weak-stat', 'concept', 'quote', 'identity', 'refutation', 'list'];

// ─── helpers ───
const isOneOf = <T,>(v: T, set: readonly T[]): boolean => set.includes(v);

function assertValidVideoStyle(s: VideoStyle): void {
  expect(typeof s.styleName).toBe('string');
  expect(s.styleName.length).toBeGreaterThan(0);
  expect(typeof s.personality).toBe('string');
  expect(isOneOf(s.motion, MOTIONS)).toBe(true);
  expect(isOneOf(s.weight, WEIGHTS)).toBe(true);
  expect(isOneOf(s.corner, CORNERS)).toBe(true);
  expect(isOneOf(s.alignment, ALIGNMENTS)).toBe(true);
  expect(isOneOf(s.baseSurface, SURFACES)).toBe(true);
  expect(isOneOf(s.baseTexture, TEXTURES)).toBe(true);
  expect(isOneOf(s.baseDensity, DENSITIES)).toBe(true);
  expect(Array.isArray(s.sources)).toBe(true);
}

function candidate(factKind = 'bounded-stat'): SemanticMgCandidate {
  return {
    id: 'smg_battle',
    factKind: factKind as SemanticMgCandidate['factKind'],
    sourceSpan: { text: 'we grew forty percent', startMs: 0, endMs: 900, source: 'voiceover-transcript' },
    content: { value: 40, label: 'YoY growth', unit: '%' },
    evidenceKeys: ['part:v:primary-value'],
    licenses: ['bounded-proportion', 'source-span'],
    salience: 0.6,
    rhetoricalRole: 'claim',
    hardGate: { passed: true, reasons: ['licensed'], blockedBy: [] },
    scoreInputs: { structuralStrength: 0.6, salience: 0.6, evidenceStrength: 0.5, renderRisk: 0.2 },
  } as SemanticMgCandidate;
}

function assemblerArgs(over: Partial<BuildMgMomentInputArgs> = {}): BuildMgMomentInputArgs {
  return {
    momentId: 'm_battle',
    candidate: candidate(),
    brand: INSTURIX,
    window: { startFrame: 0, endFrame: 90, fps: 30 },
    expression: { qualityTier: 'standard', relevanceScore: 0.6, typography: { emphasisScale: 1 } },
    placement: {
      candidateRegion: 'bottom-center',
      placementHints: {
        avoid: [{ x: 0.3, y: 0.15, width: 0.4, height: 0.55, reason: 'main-subject' }],
        prefer: [{ x: 0, y: 0.72, width: 1, height: 0.28, reason: 'negative-space' }],
      },
    },
    ...over,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. CONTRACT ⟷ TYPE PARITY — the corpse class this battle test surfaced (fontDisplay + videoStyle).
//    The REAL assembler output MUST survive the REAL strict contract for BOTH brands across the matrix.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('BATTLE ① contract⟷type parity — the seam output always survives the strict worker contract', () => {
  const brands: Array<[string, Brand]> = [['INSTURIX(+fontDisplay)', INSTURIX], ['NORTHWIND(+fontDisplay)', NORTHWIND]];

  it('every buildMgMomentInput output (always carries videoStyle) passes mgMomentInputSchema — both brands', () => {
    for (const [name, brand] of brands) {
      for (const intent of ['SaaS demo', 'hype reel', 'documentary', null]) {
        for (const footage of FOOTAGES.slice(0, 8)) {
          const built = buildMgMomentInput(assemblerArgs({
            brand,
            intent,
            footageSignals: footage,
            videoSignals: { energy: 0.7, formality: 0.3 },
          }));
          // videoStyle is ALWAYS set by the assembler — this is the exact field the strict contract used to reject.
          expect(built.videoStyle, `${name}/${intent}`).toBeDefined();
          expect(() => mgMomentInputSchema.parse(built), `${name}/${intent}`).not.toThrow();
          const parsed = mgMomentInputSchema.parse(built);
          expect(parsed.videoStyle).toEqual(built.videoStyle);
          if (footage) expect(parsed.footageSignals).toEqual(built.footageSignals);
        }
      }
    }
  });

  it('the FULL render-worker request builds (strict-parses) for a real seam moment — both brands (guards fontDisplay + videoStyle at enqueue)', () => {
    for (const [name, brand] of brands) {
      const built = buildMgMomentInput(assemblerArgs({
        brand,
        intent: 'product demo',
        footageSignals: { motionEnergy: 0.8, faceEmotion: 'happy', motionType: 'subject_moving' },
        videoSignals: { energy: 0.8, formality: 0.25 },
      }));
      expect(() => buildMgRenderWorkerRequest({
        projectId: 'proj_battle',
        userId: 'user_battle',
        orgId: null,
        appCommit: '80c9200e',
        input: built,
        canvas: { width: 1920, height: 1080 },
        sequenceNamespace: 'user_battle:proj_battle',
      }, new Date('2026-07-17T00:00:00.000Z')), name).not.toThrow();
    }
  });

  it('the assembler NORMALISES emphasisScale into the contract band [0.25,4] — an out-of-band producer never crashes enqueue', () => {
    for (const raw of [0.01, 0.1, 0.24, 5, 100, 1e9, 0, -3, NaN, Infinity]) {
      const built = buildMgMomentInput(assemblerArgs({
        expression: { qualityTier: 'hero', relevanceScore: 0.9, typography: { emphasisScale: raw } },
      }));
      expect(built.expressiveness.emphasisScale).toBeGreaterThanOrEqual(0.25);
      expect(built.expressiveness.emphasisScale).toBeLessThanOrEqual(4);
      expect(() => mgMomentInputSchema.parse(built), `emphasisScale=${raw}`).not.toThrow();
    }
  });

  it('ENUM-DRIFT GUARD: the resolved videoStyle from every font family is accepted by the contract (no atom escapes the schema)', () => {
    const reps = ['Poppins', 'Inter', 'Open Sans', 'Georgia', 'Playfair Display', 'Roboto Slab', 'JetBrains Mono', 'Pacifico', 'Anton'];
    for (const font of reps) {
      for (const intent of INTENTS) {
        for (const sig of VIDEO_SIGNALS) {
          const style = resolveVideoStyle({ brandFont: font, intent, videoSignals: sig });
          const built = buildMgMomentInput(assemblerArgs({
            brand: { ...INSTURIX, fontSans: font },
            intent,
            videoSignals: sig,
          }));
          // If resolveVideoStyle ever emits a non-atom value, the strict videoStyleSchema throws here.
          expect(() => mgMomentInputSchema.parse(built), `${font}/${intent}`).not.toThrow();
          assertValidVideoStyle(style);
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. RESOLVER INVARIANTS — no crash, no NaN/undefined leak, only atom values, across the full matrix.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('BATTLE ② resolver invariants across the adversarial matrix', () => {
  it('resolveVideoStyle never throws and only ever emits atom values (fonts × intents × signals)', () => {
    let combos = 0;
    for (const font of FONTS) {
      for (const intent of INTENTS) {
        for (const sig of VIDEO_SIGNALS) {
          const style = resolveVideoStyle({ brandFont: font, intent, videoSignals: sig });
          assertValidVideoStyle(style);
          combos += 1;
        }
      }
    }
    expect(combos).toBe(FONTS.length * INTENTS.length * VIDEO_SIGNALS.length);
  });

  it('resolveMomentStyle never throws and only ever emits atom values (footage × salience × tier × factKind)', () => {
    const video = resolveVideoStyle({ brandFont: 'Inter', intent: 'documentary' });
    for (const footage of FOOTAGES) {
      for (const salience of SALIENCES) {
        for (const tier of TIERS) {
          for (const factKind of FACT_KINDS) {
            const m = resolveMomentStyle(video, { footage, salience, tier, factKind, beatFrames: [10, 20] });
            expect(isOneOf(m.motion, MOTIONS)).toBe(true);
            expect(isOneOf(m.surface, SURFACES)).toBe(true);
            expect(isOneOf(m.texture, TEXTURES)).toBe(true);
            expect(isOneOf(m.density, DENSITIES)).toBe(true);
            expect(isOneOf(m.emphasis, EMPHASES)).toBe(true);
            expect(typeof m.beatSync).toBe('boolean');
            expect(typeof m.footageCharacter).toBe('string');
          }
        }
      }
    }
  });

  it('styleOverride always wins the styleName (chat/picker sovereignty)', () => {
    for (const font of FONTS) {
      for (const intent of INTENTS) {
        const s = resolveVideoStyle({ brandFont: font, intent, styleOverride: 'neon', videoSignals: { energy: 0.9 } });
        expect(s.styleName).toBe('neon');
        expect(s.sources).toContain('user:override');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. ANTI-MONOTONY — the cardinal sin ("DO NOT MAKE IT PER VIDEO"): one identity, varied treatments.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('BATTLE ③ anti-monotony — one video identity, DIFFERENT graphic every moment', () => {
  it('a realistic beat sequence produces VARIED treatments while the identity stays coherent', () => {
    const video = resolveVideoStyle({ brandFont: 'Plus Jakarta Sans', intent: 'SaaS demo', videoSignals: { energy: 0.6, formality: 0.4 } });
    const beats: MomentSignals[] = [
      { tier: 'hero', salience: 0.95, footage: { motionEnergy: 0.9 }, beatFrames: [5], factKind: 'magnitude-stat' },
      { tier: 'standard', salience: 0.5, footage: { brightness: 0.2, faceEmotion: 'sad' }, factKind: 'quote' },
      { tier: 'subtle', salience: 0.2, footage: { warmth: 0.8, faceEmotion: 'happy' }, factKind: 'concept' },
      { tier: 'standard', salience: 0.6, footage: { brightness: 0.9, saturation: 0.2 }, factKind: 'comparison' },
      { tier: 'hero', salience: 0.8, footage: undefined, factKind: 'series' },
    ];
    const styles = beats.map((b) => resolveMomentStyle(video, b));
    // Coherence: the IDENTITY fields (from the video) never change moment to moment.
    for (const b of beats) {
      const rendered = renderStyleDirection(video, resolveMomentStyle(video, b));
      expect(rendered).toContain(video.styleName);
    }
    // Variety: the emphasis + surface + motion set is NOT a single flat value across the sequence.
    expect(new Set(styles.map((s) => s.emphasis)).size).toBeGreaterThan(1);
    expect(new Set(styles.map((s) => `${s.surface}|${s.motion}|${s.texture}`)).size).toBeGreaterThan(1);
  });

  it('R5: emphasis follows CONTINUOUS salience even when every beat is tier=hero (Director marks all peaks)', () => {
    const video = resolveVideoStyle({ brandFont: 'Anton' });
    const emphases = [0.95, 0.6, 0.3, 0.1, 0.75].map((salience) => resolveMomentStyle(video, { tier: 'hero', salience }).emphasis);
    expect(new Set(emphases).size).toBeGreaterThan(1); // NOT all 'prominent'
    expect(emphases[0]).toBe('prominent');
    expect(emphases[3]).toBe('quiet');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. CORPSE REGRESSION BATTERY — the named corpses (C1/R2/R3/R4/R6/R7/R8), under realistic combos.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('BATTLE ④ corpse regression battery', () => {
  it('SIGNALS-BEAT-FONT: high-energy/casual signals override a CALM serif brand font (not identity-driven)', () => {
    const s = resolveVideoStyle({ brandFont: 'Georgia', videoSignals: { energy: 0.9, formality: 0.15 } });
    expect(s.styleName).toBe('kinetic-bold');
    expect(s.sources).toContain('signals');
  });

  it('SIGNALS-BEAT-FONT: formal/calm signals tame a LOUD display brand font', () => {
    const s = resolveVideoStyle({ brandFont: 'Anton', videoSignals: { energy: 0.15, formality: 0.9 } });
    expect(s.styleName).toBe('editorial');
    expect(s.weight).toBe('regular');
  });

  it('R2: camera motion is NOT emotional energy (a slow pan on a somber beat stays calm, not energetic-vivid)', () => {
    expect(classifyFootage({ motionEnergy: 0.95, motionType: 'camera_moving' })).not.toBe('energetic-vivid');
    expect(classifyFootage({ motionEnergy: 0.95, motionType: 'subject_moving' })).toBe('energetic-vivid');
  });

  it('R3: dark ≠ moody (a dark UI screenshot with no face is neutral; dark WITH a face is cinematic-moody)', () => {
    expect(classifyFootage({ brightness: 0.15 })).not.toBe('cinematic-moody');
    expect(classifyFootage({ brightness: 0.15, faceEmotion: 'sad' })).toBe('cinematic-moody');
  });

  it('R4: a "documentary-style product demo" classifies documentary, not saas (specific beats the catch-all)', () => {
    expect(classifyIntent('documentary-style product demo')).toBe('documentary');
    expect(classifyIntent('product explainer')).toBe('saas-demo');
  });

  it('R6: intent weight wins over a display header font (a serious explainer is not heavy just because the font is)', () => {
    const s = resolveVideoStyle({ brandFont: 'Bebas Neue', intent: 'product explainer walkthrough' });
    expect(s.weight).toBe('medium'); // saas-demo's weight, not display's 'heavy'
  });

  it('R7: quantitative facts suppress background texture even on a documentary grain base', () => {
    const doc = resolveVideoStyle({ brandFont: 'Georgia', intent: 'documentary' });
    for (const dataKind of ['comparison', 'magnitude-stat', 'series', 'bounded-stat', 'weak-stat']) {
      expect(resolveMomentStyle(doc, { factKind: dataKind }).texture).toBe('none');
    }
    expect(resolveMomentStyle(doc, { factKind: 'concept' }).texture).not.toBe('none'); // non-data keeps the grain
  });

  it('R8: short-form platforms lean kinetic (tiktok / reel / shorts → hype-reel)', () => {
    for (const s of ['tiktok', 'a fun reel', 'shorts', 'promo teaser']) {
      expect(classifyIntent(s)).toBe('hype-reel');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. CLASSIFIER ROBUSTNESS — adversarial inputs never crash and always return a valid taxonomy value.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('BATTLE ⑤ classifier robustness under garbage / edge input', () => {
  it('classifyFontFamily always returns a valid family (null / stacks / quotes / weights / unknown)', () => {
    for (const f of FONTS) {
      expect(isOneOf(classifyFontFamily(f), FONT_FAMILIES)).toBe(true);
      const priors = fontStylePriors(f);
      expect(isOneOf(priors.motion, MOTIONS)).toBe(true);
      expect(isOneOf(priors.weight, WEIGHTS)).toBe(true);
      expect(isOneOf(priors.surface, SURFACES)).toBe(true);
      expect(isOneOf(priors.texture, TEXTURES)).toBe(true);
    }
    // known-name spot checks (the 80-90%)
    expect(classifyFontFamily('JetBrains Mono')).toBe('monospace');
    expect(classifyFontFamily('Playfair Display')).toBe('modern-serif');
    expect(classifyFontFamily('Poppins SemiBold')).toBe('geometric-sans'); // weight-suffix prefix match
    expect(classifyFontFamily('"Times New Roman", serif')).toBe('oldstyle-serif'); // stack + quotes
  });

  it('classifyFootage always returns a valid character (NaN / Infinity / out-of-range / empty / null face)', () => {
    for (const s of FOOTAGES) {
      expect(isOneOf(classifyFootage(s), FOOTAGE_CHARS)).toBe(true);
      const { delta } = footageStyleDelta(s);
      if (delta.motion !== undefined) expect(isOneOf(delta.motion, MOTIONS)).toBe(true);
      if (delta.surface !== undefined) expect(isOneOf(delta.surface, SURFACES)).toBe(true);
      if (delta.texture !== undefined) expect(isOneOf(delta.texture, TEXTURES)).toBe(true);
      if (delta.density !== undefined) expect(isOneOf(delta.density, DENSITIES)).toBe(true);
    }
    expect(classifyFootage(undefined)).toBe('neutral');
    expect(classifyFootage({})).toBe('neutral');
    expect(classifyFootage({ faceEmotion: '' })).toBe('neutral'); // empty face is not a signal
  });

  it('classifyIntent always returns a valid genre (null / gibberish / huge string / emoji)', () => {
    for (const i of INTENTS) {
      expect(isOneOf(classifyIntent(i), INTENT_GENRES)).toBe(true);
      const { delta } = intentStyleDelta(i);
      if (delta.weight !== undefined) expect(isOneOf(delta.weight, WEIGHTS)).toBe(true);
    }
    expect(classifyIntent(null)).toBe('generic');
    expect(classifyIntent('unclassifiable zzzq')).toBe('generic');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 6. KIT COLOUR AXIS — in-brand moves never crash, never emit garbage, non-hex passes through unchanged.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('BATTLE ⑥ kit colour axis fuzz (brand-locked, Law 4)', () => {
  const HEX6 = /^#[0-9a-f]{6}$/i;
  const inputs = ['#000000', '#ffffff', '#D4A652', '#2F6BFF', '#fff', '#abc', 'rgba(255,255,255,0.1)', 'transparent', '#12', 'notacolor', ''];
  const amounts = [-1, 0, 0.25, 0.5, 1, 2, NaN];

  it('tint / shade never crash; valid hex in → valid hex out; non-hex in → unchanged', () => {
    for (const c of inputs) {
      for (const a of amounts) {
        const t = tint(c, a);
        const s = shade(c, a);
        expect(typeof t).toBe('string');
        expect(typeof s).toBe('string');
        if (HEX6.test(c) || /^#[0-9a-f]{3}$/i.test(c)) {
          expect(HEX6.test(t)).toBe(true);
          expect(HEX6.test(s)).toBe(true);
        } else {
          expect(t).toBe(c); // rgba()/named/invalid pass through untouched
          expect(s).toBe(c);
        }
      }
    }
  });

  it('mix blends two brand hexes (or returns the first for a non-hex arg); withAlpha only touches 6-hex', () => {
    for (const a of inputs) {
      for (const b of inputs) {
        for (const t of amounts) {
          const m = mix(a, b, t);
          expect(typeof m).toBe('string');
          if ((HEX6.test(a) || /^#[0-9a-f]{3}$/i.test(a)) && (HEX6.test(b) || /^#[0-9a-f]{3}$/i.test(b))) {
            expect(HEX6.test(m)).toBe(true);
          }
        }
      }
    }
    expect(withAlpha('#D4A652', 0.5)).toBe('#D4A65280');
    expect(withAlpha('rgba(0,0,0,1)', 0.5)).toBe('rgba(0,0,0,1)'); // non-6-hex untouched
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('NaN / Infinity degrade to a VALID colour, never "#NaNNaNNaN" or "#..NaN" (a model-computed NaN amount)', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(HEX6.test(tint('#D4A652', bad))).toBe(true);
      expect(HEX6.test(shade('#D4A652', bad))).toBe(true);
      expect(HEX6.test(mix('#D4A652', '#2F6BFF', bad))).toBe(true);
      expect(/^#[0-9a-f]{8}$/i.test(withAlpha('#D4A652', bad))).toBe(true);
    }
    // amount NaN → identity (0): tint/shade return the base colour unblended; withAlpha → fully transparent.
    expect(tint('#D4A652', NaN)).toBe('#d4a652');
    expect(shade('#D4A652', NaN)).toBe('#d4a652');
    expect(withAlpha('#D4A652', NaN)).toBe('#D4A65200');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 7. PROMPT ASSEMBLY — cache-safe prefix, data-last moment, in-band style, no fact-value leak.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('BATTLE ⑦ prompt assembly integration across the matrix', () => {
  it('CODEGEN_STABLE_PREFIX always leads byte-identical; the <moment> DATA block always closes the prompt', () => {
    for (const intent of ['SaaS demo', 'hype reel', 'documentary', null]) {
      for (const footage of FOOTAGES.slice(0, 6)) {
        const built = buildMgMomentInput(assemblerArgs({ intent, footageSignals: footage, videoSignals: { energy: 0.7 } }));
        const prompt = buildCodegenPrompt(built);
        expect(prompt.slice(0, CODEGEN_STABLE_PREFIX.length)).toBe(CODEGEN_STABLE_PREFIX);
        expect(prompt.trimEnd().endsWith('</moment>')).toBe(true); // data LAST (Rule 35)
        // style_direction (present because videoStyle is set) sits AFTER the prefix and BEFORE the moment block.
        expect(prompt).toMatch(/<style_direction>/);
        expect(prompt.indexOf('<style_direction>')).toBeGreaterThanOrEqual(CODEGEN_STABLE_PREFIX.length);
        expect(prompt.lastIndexOf('<style_direction>')).toBeLessThan(prompt.lastIndexOf('<moment>'));
      }
    }
  });

  it('the literal fact value/label NEVER leaks into the prompt (Law 5: values flow as data props, not baked)', () => {
    const built = buildMgMomentInput(assemblerArgs());
    const prompt = buildCodegenPrompt(built);
    expect(prompt).not.toMatch(/YoY growth/); // the label
    expect(prompt).not.toMatch(/\b40\b/); // the figure
    expect(prompt).toMatch(/data props/); // the SHAPE is described instead
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 8. TASTE-GATE DETERMINISTIC FLOOR — the two universally-degenerate renders always fail; real ones pass.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('BATTLE ⑧ taste-gate deterministic floor boundaries', () => {
  it('render sanity: blank fails, near-opaque-full-frame fails, a legitimate transparent MG passes', () => {
    expect(evaluateMgRenderSanity({ coverageFrac: 0, nearOpaqueFrac: 0 }).pass).toBe(false); // blank
    expect(evaluateMgRenderSanity({ coverageFrac: 1, nearOpaqueFrac: 0.93 }).pass).toBe(false); // opaque field
    expect(evaluateMgRenderSanity({ coverageFrac: 0.35, nearOpaqueFrac: 0.2 }).pass).toBe(true); // real kinetic type
    expect(evaluateMgRenderSanity({ coverageFrac: 1, nearOpaqueFrac: 0.92 }).pass).toBe(true); // exactly at cap = ok
  });

  it('motion presence: a frozen render fails; a moving one passes; the boundary is inclusive', () => {
    expect(evaluateMgMotionPresence(0).pass).toBe(false); // frozen
    expect(evaluateMgMotionPresence(MIN_MG_MOTION_PRESENCE - 0.0001).pass).toBe(false);
    expect(evaluateMgMotionPresence(MIN_MG_MOTION_PRESENCE).pass).toBe(true); // inclusive floor
    expect(evaluateMgMotionPresence(0.05).pass).toBe(true);
  });
});
