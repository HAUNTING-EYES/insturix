import { describe, expect, it, vi } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import { buildVideoTasteContract } from '@/lib/editron/motion-graphics/codegen/taste/contract-resolver';
import { houseTastePrior } from '@/lib/editron/motion-graphics/codegen/taste/house-prior';
import { tasteContractShadowEnabled } from '@/lib/editron/motion-graphics/codegen/taste/shadow';
import { brandTasteProfileFromKit } from '@/lib/editron/motion-graphics/codegen/taste/brand-profile';

const videoSignals = { energy: 0.6 };

describe('buildVideoTasteContract (brief §6.5/§5 precedence)', () => {
  it('house-only: valid + concrete, personal taste unknown, house_prior recorded', () => {
    const r = buildVideoTasteContract({ brand: INSTURIX, hasConfiguredBrand: false, intent: null, videoSignals, house: houseTastePrior() });
    expect(r.contract.id).toMatch(/^vtc-/);
    expect(r.contract.personalTasteConfidence).toBe('unknown');
    expect(r.contract.sourcePrecedenceApplied).toContain('house_prior');
    expect(r.contract.tasteSourceSummary).toContain('house_prior');
    // no vacuous adjectives — §6.5
    expect(/(premium|modern|cinematic)/i.test(r.contract.colorBehavior.accentLogic)).toBe(false);
    expect(r.hash).toBe(r.contract.contractHash);
  });

  it('configured brand: palette source + brand_guideline precedence; motion confidence stays low (§6.3)', () => {
    const r = buildVideoTasteContract({ brand: INSTURIX, hasConfiguredBrand: true, intent: null, videoSignals });
    expect(r.contract.colorBehavior.paletteSource).toContain('brand kit');
    expect(r.contract.sourcePrecedenceApplied).toContain('brand_guideline');
    const bp = brandTasteProfileFromKit(INSTURIX);
    expect(bp.motionTraits).toHaveLength(0); // never infer motion from a static kit
    expect(bp.confidenceByDomain.motion).toBe('low');
  });

  it('explicit reference is the highest precedence + high art-direction confidence', () => {
    const reference = { id: 'ref-1', kind: 'project_reference', sourceEntityId: 'ref-upload-1', summary: 'founder crude reference', confidence: 'high' } as const;
    const r = buildVideoTasteContract({
      brand: INSTURIX, hasConfiguredBrand: true, intent: null, videoSignals,
      references: [reference as never],
    });
    expect(r.sourcePrecedenceApplied[0]).toBe('project_reference');
    expect(r.contract.artDirectionConfidence).toBe('high');
    expect(r.contract.tasteSourceSummary).toContain('reference');
  });

  it('user evidence moves personal taste off unknown; absence keeps it unknown', () => {
    const userEv = { id: 'u-1', kind: 'user_pairwise_selection', summary: 'picked A over B twice', confidence: 'medium' } as const;
    const withUser = buildVideoTasteContract({ brand: INSTURIX, hasConfiguredBrand: false, intent: null, videoSignals, userEvidence: [userEv as never] });
    expect(withUser.contract.personalTasteConfidence).toBe('low');
    const without = buildVideoTasteContract({ brand: INSTURIX, hasConfiguredBrand: false, intent: null, videoSignals });
    expect(without.contract.personalTasteConfidence).toBe('unknown');
  });

  it('video energy shapes the rhythm axis (percussive vs calm)', () => {
    const hot = buildVideoTasteContract({ brand: INSTURIX, hasConfiguredBrand: false, intent: null, videoSignals: { energy: 0.9 } });
    const cold = buildVideoTasteContract({ brand: INSTURIX, hasConfiguredBrand: false, intent: null, videoSignals: { energy: 0.2 } });
    expect(hot.contract.styleAxes.rhythm).toBe('percussive');
    expect(cold.contract.styleAxes.rhythm).toBe('calm');
    expect(hot.hash).not.toBe(cold.hash);
  });
});

describe('tasteContractShadowEnabled (cycle-1 #3 shadow gate)', () => {
  it('default OFF; ON via MG_TASTE_CONTRACT_SHADOW', () => {
    vi.stubEnv('MG_TASTE_CONTRACT_SHADOW', '');
    expect(tasteContractShadowEnabled({ MG_TASTE_CONTRACT_SHADOW: '' })).toBe(false);
    expect(tasteContractShadowEnabled({ MG_TASTE_CONTRACT_SHADOW: '1' })).toBe(true);
    expect(tasteContractShadowEnabled({ MG_TASTE_CONTRACT_SHADOW: 'true' })).toBe(true);
    expect(tasteContractShadowEnabled({})).toBe(false);
    vi.unstubAllEnvs();
  });
});
