import { describe, expect, it } from 'vitest';

import {
  buildJudgeResultV2,
  categorizeIssues,
  deriveRevisionRouting,
  judgeResultV2Schema,
} from '@/lib/editron/motion-graphics/codegen/judge-verdict';

describe('deriveRevisionRouting (brief §12 — WHO fixes it)', () => {
  it('subject/caption collision routes to PLACEMENT', () => {
    const r = deriveRevisionRouting(['the graphic overlaps the subject and crowds the caption region']);
    expect(r.owner).toBe('placement');
    expect(r.instruction).toMatch(/Placement/);
  });

  it('a wrong concept (does not encode the licensed meaning) routes to DESIGNER — beats execution signals', () => {
    const r = deriveRevisionRouting(['the visual does not encode the licensed claim; also the gold accent is off']);
    expect(r.owner).toBe('designer');
  });

  it('typography/clipping is a CODER execution problem', () => {
    const r = deriveRevisionRouting(['every word clips at the right frame edge; typography weight could pop']);
    expect(r.owner).toBe('coder');
  });

  it('motion development is a CODER execution problem', () => {
    const r = deriveRevisionRouting(['no motion development across the intro, build, and settled phases']);
    expect(r.owner).toBe('coder');
  });

  it('a bare judge score with no actionable issue routes to NONE', () => {
    const r = deriveRevisionRouting(['judge 3 < 7.5']);
    expect(r.owner).toBe('none');
  });
});

describe('buildJudgeResultV2 (brief §6.7)', () => {
  it('wraps score + routing into a schema-valid V2 verdict with the legacy score preserved', () => {
    const v2 = buildJudgeResultV2(3.2, ['the visual does not encode the licensed meaning']);
    expect(judgeResultV2Schema.parse(v2)).toEqual(v2);
    expect(v2.schemaVersion).toBe('judge-result-v2');
    expect(v2.revisionOwner).toBe('designer');
    expect(v2.legacyOverallScore).toBe(3.2);
  });

  it('with a taste contract, fidelity violations are categorized separately', () => {
    const { contractFidelityDeviations, semanticEffectivenessIssues, otherIssues } = categorizeIssues(
      ['deviates from contract direction (prohibited motif used)', 'the design does not encode the licensed fact', 'text is tiny'],
      { hasContract: true },
    );
    expect(contractFidelityDeviations).toHaveLength(1);
    expect(semanticEffectivenessIssues).toHaveLength(1);
    expect(otherIssues).toHaveLength(1);
  });
});
