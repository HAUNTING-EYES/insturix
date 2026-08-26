import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const STAGE25_FINAL_GENERALISATION_PAID_AUDIT_VERSION_V1 =
  'EDITRON_OE_STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1_1' as const;

const VALID_STRUCTURAL_ROWS = [
  'HOLD-DEP-01:OPENAI_TERRA',
  'HOLD-DEP-02:GOOGLE_FLASH',
  'HOLD-DEP-02:OPENAI_TERRA',
  'HOLD-DEP-04:GOOGLE_FLASH',
  'RHC-01:GOOGLE_FLASH',
  'RHC-01:OPENAI_LUNA',
  'RHC-01:OPENAI_TERRA',
] as const;

const VALID_SAFE_STOP_ROWS = [
  'RHC-02:GOOGLE_FLASH',
  'RHC-02:OPENAI_LUNA',
  'RHC-02:OPENAI_TERRA',
  'RHC-03:GOOGLE_FLASH',
  'RHC-03:OPENAI_LUNA',
  'RHC-03:OPENAI_TERRA',
  'RHC-04:GOOGLE_FLASH',
  'RHC-04:OPENAI_LUNA',
  'RHC-04:OPENAI_TERRA',
] as const;

const GENUINE_MODEL_OR_TASK_FAILURE_ROWS = [
  'HOLD-DEP-01:GOOGLE_FLASH',
  'HOLD-DEP-04:OPENAI_TERRA',
] as const;

const CONFOUNDED_ROWS = [
  'HOLD-DEP-01:OPENAI_LUNA',
  'HOLD-DEP-02:OPENAI_LUNA',
  'HOLD-DEP-03:OPENAI_LUNA',
  'HOLD-DEP-03:OPENAI_TERRA',
  'HOLD-DEP-04:OPENAI_LUNA',
] as const;

const PROVIDER_RESOURCE_NON_EVALUATIONS = [
  'HOLD-DEP-03:GOOGLE_FLASH',
] as const;

const MATERIAL = {
  version: STAGE25_FINAL_GENERALISATION_PAID_AUDIT_VERSION_V1,
  artifactType: 'Stage25FinalGeneralisationPaidAuditV1' as const,
  authority: 'POST_RUN_RESEARCH_AUDIT_NO_PROJECT_OR_SCORING_AUTHORITY' as const,
  immutableRunBinding: {
    executionId: 'stage25-final-paid-4438d1a41-v1',
    sourceCommitSha: '4438d1a41d7555f760f894da815721ac3515c267',
    authorizationSha256:
      'f9f20c74c19f6ef306bcf884028cdc36428313b1f5b2d7b99250fb6e6044f5b2',
    cohortReceiptSha256:
      'd773ba2ec608fa74f2dce017a46eef895fff5e97d86099f36ec502624185c331',
    authorizationFileSha256:
      'b649a1dc77391642581b41e81dfec473aca29c73bb40b647286265d10158f4af',
    cohortResultFileSha256:
      '9d0d0a355f3ed1a843910ec9d11ba13d53a560f2be07b09845229ee3567438b9',
    runContractFileSha256:
      'cbdb849d24bcc7c8c9b7ad5f7b0d45be4d0ee79b982a8286bcc50e5cd1fbc6fd',
  },
  rawAccounting: {
    contemplatedRows: 24,
    providerDispatches: 32,
    providerResponses: 32,
    spentNanoUsd: 1_022_770_625,
    automaticTransportRetries: 0,
    projectReads: 0,
    projectMutations: 0,
  },
  rawScorecard: {
    structuralPasses: 7,
    safeStopPasses: 9,
    modelOrTaskFailures: 8,
  },
  auditedClassification: {
    validStructuralRows: VALID_STRUCTURAL_ROWS,
    validOwnerSupportedSafeStopRows: VALID_SAFE_STOP_ROWS,
    genuineModelOrTaskFailureRows: GENUINE_MODEL_OR_TASK_FAILURE_ROWS,
    confoundedRows: CONFOUNDED_ROWS,
    providerResourceNonEvaluationRows: PROVIDER_RESOURCE_NON_EVALUATIONS,
  },
  findings: {
    precedenceContract: {
      disposition: 'CONFOUNDED',
      affectedRowCount: 5,
      reason:
        'The public policy emitted generic before/after keys without defining edge direction; canonical key sorting rendered after before before, and five responses consistently inverted the intended dependency edges.',
    },
    providerResourceAccounting: {
      disposition: 'NOT_MODEL_FAILURE',
      affectedRowCount: 1,
      reason:
        'The final Gemini response was observed, but the original guard rejected its separately reported thinking tokens under an internal generated-token policy. The raw scorecard then incorrectly promoted that resource terminal to an evaluated model failure.',
      counterfactualSubmissionSha256:
        'bab488090d6f995e01b21ab7050c89e7c14dd98ec469c9ca1164550e47bea518',
      counterfactualEvaluationReceiptSha256:
        '4f1b4e7bccbea47ffb7aa30a0c7cb8e5907378506695895af194726655a49701',
      counterfactualDisposition:
        'STRUCTURAL_PASS_IF_REPLAYED_UNDER_CORRECTED_RESOURCE_SEMANTICS_NO_COHORT_CREDIT',
    },
    genuineFailures: [{
      rowId: 'HOLD-DEP-01:GOOGLE_FLASH',
      diagnostic: 'EVIDENCE_BARRIER_INVALID:EV-D01-PRESERVE',
      submissionSha256:
        'a644f4105d06c1bcee1f9307dca789e79a2a8d4857846183a5cd5fec21e6a99c',
    }, {
      rowId: 'HOLD-DEP-04:OPENAI_TERRA',
      diagnostic: 'EVIDENCE_BARRIER_INVALID:EV-D04-AUDIO',
      submissionSha256:
        '336a65162b240f37ba85e53f458a3f2fc8e8ec91c851cc97b7f9c6d0463ca8d5',
    }],
    routeProofCeiling:
      'RHC-01 establishes three structurally legal route proposals only. RHC-02 through RHC-04 establish owner-supported safe stops only. Rendered fidelity and editor quality remain untested.',
  },
  aggregateUsePolicy: {
    modelRankingAuthorized: false,
    productExecutionClaimAuthorized: false,
    renderedQualityClaimAuthorized: false,
    paidRerunAuthorized: false,
    nextDisposition: 'MODIFY_BEFORE_ANY_NEW_PAID_COHORT' as const,
  },
  stateEffects: [] as const,
};

export const STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1 = deepFreezeV1({
  ...MATERIAL,
  auditSha256: hashCanonicalJsonV1(MATERIAL),
});

