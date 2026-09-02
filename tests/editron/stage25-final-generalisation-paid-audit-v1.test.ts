import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-audit-v1';

describe('Stage 2.5 final paid cohort audit V1', () => {
  it('classifies all 24 rows exactly once without promoting research proof', () => {
    const audit = STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1;
    const classifications = audit.auditedClassification;
    const rows = [
      ...classifications.validStructuralRows,
      ...classifications.validOwnerSupportedSafeStopRows,
      ...classifications.genuineModelOrTaskFailureRows,
      ...classifications.confoundedRows,
      ...classifications.providerResourceNonEvaluationRows,
    ];

    expect(rows).toHaveLength(24);
    expect(new Set(rows)).toHaveLength(24);
    expect(audit.rawAccounting).toMatchObject({
      contemplatedRows: 24,
      providerDispatches: 32,
      providerResponses: 32,
      spentNanoUsd: 1_022_770_625,
      automaticTransportRetries: 0,
      projectReads: 0,
      projectMutations: 0,
    });
    expect(audit.aggregateUsePolicy).toMatchObject({
      modelRankingAuthorized: false,
      productExecutionClaimAuthorized: false,
      renderedQualityClaimAuthorized: false,
      paidRerunAuthorized: false,
      nextDisposition: 'MODIFY_BEFORE_ANY_NEW_PAID_COHORT',
    });
  });

  it('binds the immutable run and its counterfactual replay without granting credit', () => {
    const audit = STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1;
    const { auditSha256, ...material } = audit;

    expect(auditSha256).toBe(hashCanonicalJsonV1(material));
    expect(audit.immutableRunBinding.cohortReceiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.findings.providerResourceAccounting.counterfactualDisposition)
      .toContain('NO_COHORT_CREDIT');
    expect(audit.stateEffects).toEqual([]);
  });
});

