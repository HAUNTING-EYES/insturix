import { describe, expect, it } from 'vitest';

import {
  contractHashOf,
  parseVideoTasteContract,
  videoTasteContractSchema,
  assertContractConcrete,
  findVacuousLanguage,
} from '@/lib/editron/motion-graphics/codegen/taste/taste-schemas';

const concrete = {
  tasteSourceSummary: 'house prior with a single brand approval and no user evidence',
  typographyBehavior: { hierarchyIntent: 'one dominant display word, support set small', scaleBehavior: '72-120px display at 1080p', weightBehavior: '800 for the anchor, 500 for support', casingBehavior: 'uppercase anchors only', densityBehavior: 'one idea per graphic', prohibitedTreatments: ['stencil'] },
  colorBehavior: { paletteSource: 'Insturix kit tokens', accentLogic: 'gold accent on the one licensed number', contrastIntent: 'text never under #8 on WCAG', prohibitedTreatments: ['muddy gradients'] },
  formVocabulary: { preferredForms: ['bar', 'rule', 'dot'], edgeTreatment: 'rounded 3px', depthTreatment: 'flat', textureTreatment: 'none on type', iconographyTreatment: 'vector-only', prohibitedForms: ['plate cards'] },
  motionGrammar: { entryCharacter: 'snap within 4 frames', holdCharacter: 'ambient float 1-2px', exitCharacter: 'ease-out 6 frames', easingCharacter: 'cubic-bezier(.2,.8,.2,1)', staggerCharacter: 'child-first', speechSyncPolicy: 'anchor words land on onset', persistencePolicy: 'fade at 4.7s', prohibitedMotion: ['sweep-blinks', 'freeze'] },
  densityAndRestraint: { principle: 'at most one accent per graphic', primaryIdeaPolicy: 'one claim per moment', decorativeMotionPolicy: 'decoration only when it encodes meaning' },
  noveltyBudget: { principle: 'reuse the accepted motif within a video', reusableAnchors: ['gold-rule'], permittedDeviation: 'one experimental form per video' },
};

const baseContract = {
  id: 'vtc-1',
  schemaVersion: 'v1',
  houseTasteVersion: 'house-v1',
  evidence: [{ id: 'ev-1', kind: 'house_prior', summary: 'house prior', confidence: 'high' }],
  sourcePrecedenceApplied: ['house_prior'],
  tasteSourceSummary: concrete.tasteSourceSummary,
  personalTasteConfidence: 'unknown',
  artDirectionConfidence: 'high',
  emotionalTarget: ['curiosity'],
  styleAxes: {
    restraint: 'restrained', editoriality: 'editorial', geometry: 'geometric',
    dimensionality: 'flat', texture: 'clean', abstraction: 'literal',
    rhythm: 'speech_synchronised', dominantMedium: 'typographic', composition: 'stable', novelty: 'familiar',
  },
  typographyBehavior: concrete.typographyBehavior,
  colorBehavior: concrete.colorBehavior,
  formVocabulary: concrete.formVocabulary,
  motionGrammar: concrete.motionGrammar,
  densityAndRestraint: concrete.densityAndRestraint,
  noveltyBudget: concrete.noveltyBudget,
  consistencyAnchors: ['gold-rule'],
  prohibitedMotifs: ['brown gradients'],
  internalExemplarIds: [],
  createdAt: '2026-08-05T00:00:00.000Z',
  contractHash: '',
};

// The fixture is a plain object literal (string-widened kinds/confidence); the hash fn expects the strict
// contract type. Casting here is safe — lines 51/69/81 already validate this exact fixture through the schema.
const asContractHashInput = (c: object) => c as unknown as Parameters<typeof contractHashOf>[0];

describe('taste schemas (brief §6, phase 1)', () => {
  it('parses a fully concrete contract and accepts it', () => {
    const parsed = parseVideoTasteContract(JSON.stringify({ ...baseContract, contractHash: 'x' }));
    expect(parsed.id).toBe('vtc-1');
    expect(assertContractConcrete(parsed).ok).toBe(true);
  });

  it('rejects a contract that leans on vacuous adjectives (premium/modern/cinematic) — §6.5', () => {
    const vacuous = {
      ...baseContract,
      tasteSourceSummary: 'make it premium',
      typographyBehavior: { ...concrete.typographyBehavior, hierarchyIntent: 'modern and cinematic hierarchy' },
    };
    const result = assertContractConcrete(videoTasteContractSchema.parse({ ...vacuous, contractHash: 'x' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.join(' ')).toContain('premium');
      expect(result.reasons.join(' ')).toContain('modern');
      expect(result.reasons.join(' ')).toContain('cinematic');
    }
    expect(() => parseVideoTasteContract(JSON.stringify({ ...vacuous, contractHash: 'x' }))).toThrow(/vacuous/);
  });

  it('contract hash is deterministic and changes with content', () => {
    const a = contractHashOf(asContractHashInput(baseContract));
    const b = contractHashOf(asContractHashInput(baseContract));
    expect(a).toBe(b);
    const changed = contractHashOf(asContractHashInput({ ...baseContract, consistencyAnchors: ['other'] }));
    expect(changed).not.toBe(a);
  });

  it('rejects malformed structure (strict, unknown keys / bad types)', () => {
    expect(() => videoTasteContractSchema.parse({ ...baseContract, contractHash: 'x', extra: 1 })).toThrow();
    expect(() => videoTasteContractSchema.parse({ ...baseContract, contractHash: 'x', styleAxes: 'flat' })).toThrow();
  });

  it('findVacuousLanguage only flags the empty-praise terms', () => {
    expect(findVacuousLanguage('restrained, editorial, gold-rule typography')).toEqual([]);
    expect(findVacuousLanguage('premium and cinematic')).toEqual(['premium', 'cinematic']);
  });
});
