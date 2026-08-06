import { describe, expect, it } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import { buildVideoTasteContract } from '@/lib/editron/motion-graphics/codegen/taste/contract-resolver';
import { tasteContractLiveEnabled } from '@/lib/editron/motion-graphics/codegen/taste/shadow';
import {
  buildDesignerParts,
  buildDesignerPrompt,
  type MgDesignerInput,
} from '@/lib/editron/motion-graphics/codegen/design/designer-prompt';
import { resolveVideoStyle } from '@/lib/editron/motion-graphics/codegen/style/style-resolver';

const input: MgDesignerInput = {
  intent: 'test',
  videoStyle: resolveVideoStyle({ brandFont: INSTURIX.fontSans, videoSignals: { energy: 0.5 } }),
  brand: INSTURIX,
  moments: [],
  budget: { maxMoments: 2, minSpacingSec: 3, rationale: 't' },
};

describe('Phase 4a - the taste contract DIRECTS the designer (art-director mode)', () => {
  const vtc = buildVideoTasteContract({ brand: INSTURIX, hasConfiguredBrand: false, intent: null, videoSignals: { energy: 0.5 } }).contract;

  it('prompt WITHOUT a contract has no ART DIRECTION block (behavior unchanged until flag on)', () => {
    expect(buildDesignerPrompt(input)).not.toContain('ART DIRECTION');
  });

  it('prompt WITH a contract embeds the established art direction + contract hash (§7.1)', () => {
    const p = buildDesignerPrompt(input, vtc);
    expect(p).toContain('ART DIRECTION');
    expect(p).toContain(vtc.contractHash.slice(0, 12));
    expect(p).toContain('not inventing your own');
    expect(p).toContain(vtc.typographyBehavior.scaleBehavior);
  });

  it('multimodal parts carry it too (video context stays LAST, Rule 35)', () => {
    const parts = buildDesignerParts(input, {}, vtc);
    const lastText = [...parts].reverse().find((p) => p.kind === 'text')?.text ?? '';
    expect(lastText).toContain('ART DIRECTION');
  });

  it('live gate defaults OFF; ON via MG_TASTE_CONTRACT_ENABLED', () => {
    expect(tasteContractLiveEnabled({})).toBe(false);
    expect(tasteContractLiveEnabled({ MG_TASTE_CONTRACT_ENABLED: '1' })).toBe(true);
    expect(tasteContractLiveEnabled({ MG_TASTE_CONTRACT_ENABLED: 'true' })).toBe(true);
  });
});
