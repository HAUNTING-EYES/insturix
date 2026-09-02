import { describe, expect, it } from 'vitest';

import {
  assertCap2CurrentTruthSourcesMatchV10,
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V10,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v10';
import {
  assertCap2CurrentTruthSourcesMatchV11,
  AGENCY_100GB_4H_V1_SUPPORT_CLASS_FREEZE,
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V11,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V11,
  hashNormalizedCap2FileV11,
  parseCap2CurrentTruthReissueAuditV11,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v11';
import { hashCanonicalCap2ArtifactV1 }
  from '@/lib/editron/research/capability-census/cap2-current-truth-freeze-v1';

describe('CAP-2A current-truth reissue V11', () => {
  it('chains immutable V10 while binding the committed current source surface', () => {
    const audit = parseCap2CurrentTruthReissueAuditV11(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11,
    );
    expect(audit.priorAuditBinding).toEqual({
      artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V10.artifactType,
      manifestHash: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V10.manifestHash,
      normalizedSourceSnapshotHash:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V10.sourceBinding.normalizedSourceSnapshotHash,
    });
    expect(audit.sourceBinding).toMatchObject({
      branch: 'infrastructure-improvs-+Editron',
      commit: '1ada3fa6108bf595a4d62861cbf57ff716ae8d8e',
      normalizedSourceSnapshotHash:
        '597f43a3c9faf7ccd33adfdf7de87fe13efdca99facded3737447c20439b2cdd',
      sourceSnapshotPathCount: 351,
      sourceObservationCount: 11,
      observedIdentifierOccurrences: 636,
      workingTreeEvidenceStatus: 'CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE',
      reconciliationStatus: 'RECONCILED_CURRENT_TRUTH_V11',
    });
    expect(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V11).toHaveLength(351);
    expect(CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V11).toHaveLength(11);
    expect(audit.semanticDelta.sourceSurfaceDelta).toEqual({
      priorPathCount: 231,
      currentPathCount: 351,
      addedPathCount: 120,
      priorIdentifierOccurrences: 486,
      currentIdentifierOccurrences: 636,
      addedIdentifierOccurrences: 150,
      changedSourceObservationCount: 4,
      changedSourceIds: [
        'api.editron-linked-route-exports',
        'persistence.project-service-public-methods',
        'proof.render-delivery-module-candidates',
        'worker.job-module-candidates',
      ],
    });
    expect(audit.catalogBinding).toMatchObject({
      declaredOperationCount: 37,
      certifiedOperationCount: 0,
      productionEligibleOperationCount: 0,
    });
    expect(audit.runtimeAuthority).toEqual({
      plannerRegistryWired: false,
      plannerProjectMutationAuthorized: false,
      productionCertificationGranted: false,
    });
    expect(audit.agencySupportClassFreeze).toEqual(
      AGENCY_100GB_4H_V1_SUPPORT_CLASS_FREEZE,
    );
    expect(audit.agencySupportClassFreeze.eligibility).toMatchObject({
      envelope: '100_GB_TOTAL_INGESTED_SOURCE_BYTES_FOUR_HOUR_AGGREGATE_RAW_SOURCE_DURATION',
      media: 'RIGHTS_CLEARED_MEDIA_ONLY',
      operationBoundary: 'DECLARED_RANGE_SCOPED_EDITABLE_OPERATIONS_ONLY',
      deliveryBoundary: 'DECLARED_OUTPUT_AND_IMF_SPEC_ONLY',
    });
    expect(audit.agencySupportClassFreeze.ceilings).toEqual([
      'TOTAL_INGESTED_SOURCE_BYTES_AT_OR_BELOW_100_GB',
      'AGGREGATE_RAW_SOURCE_DURATION_AT_OR_BELOW_FOUR_HOURS',
      'NO_UNDECLARED_CODEC_CAMERA_COLOUR_OR_DELIVERY_PROFILE',
      'NO_OPERATION_OUTSIDE_DECLARED_TIMELINE_RANGE',
    ]);
    expect(audit.agencySupportClassFreeze.admission).toBe(
      'STOP_AT_FIRST_OF_TOTAL_INGESTED_SOURCE_BYTES_100_GB_OR_AGGREGATE_RAW_SOURCE_DURATION_FOUR_HOURS',
    );
    expect(audit.agencySupportClassFreeze.stopAtFirst[0]).toBe(
      'RIGHTS_OR_EGRESS_GATE_FAILS',
    );
    expect(audit.agencySupportClassFreeze.requiredFamilyIds).toHaveLength(7);
    expect(audit.agencySupportClassFreeze.proofChainStages).toEqual([
      'CALLER',
      'DECISION_OWNER',
      'FORM_OWNER',
      'MUTATION_OWNER',
      'STORED_STATE_REVISION',
      'RENDERER',
      'PROOF',
    ]);
    expect(audit.agencySupportClassFreeze.currentStatus).toMatchObject({
      implementation: 'IMPLEMENTATION_OPEN',
      sourceOwnership: 'NO_OWNER_CERTIFIED',
      relighting: 'NO_PRODUCT_OWNER_OR_EXECUTABLE_CAPABILITY_FOUND',
      fullEnvelopeEvidence: 'NOT_RUN',
    });
    expect(audit.agencySupportClassFreeze.openGaps).toHaveLength(4);
    expect(audit.agencySupportClassFreeze.capabilitySourceDeliveryRows.map(
      ({ rowId }) => rowId,
    )).toEqual([
      'agency.vfx.masks-mattes-roto-keying-tracking',
      'agency.vfx.plates-exr-vfx-pulls',
      'agency.colour.temporally-consistent-relighting',
      'agency.finishing.conform-reconform-change-lists',
      'agency.delivery.mastering',
      'agency.delivery.declared-imf-class',
      'agency.recovery.archive-restore',
    ]);
    expect(audit.agencySupportClassFreeze.declaredAgencyImfClass).toMatchObject({
      classId: 'AGENCY_IMF_DECLARED_CLASS_V1',
      validator: 'INDEPENDENT_DECLARED_IMF_VALIDATOR_REQUIRED',
      status: 'DECLARATION_ONLY_NO_IMPLEMENTATION_OR_CERTIFICATION',
    });
    expect(audit.agencySupportClassFreeze.explicitExclusions).toHaveLength(7);
    expect(audit.agencySupportClassFreeze.authority).toEqual({
      declaration: 'SUPPORTED_SUBCLASS_DECLARATION_ONLY',
      implementationStatus: 'IMPLEMENTATION_OPEN',
      certified: false,
      productionEligible: false,
      runtimeMutationAuthorized: false,
      readinessReceipt: 'NOT_A_READINESS_RECEIPT',
      catalogPromotion: false,
    });
    for (const evidence of audit.semanticDelta.evidence) {
      expect(hashNormalizedCap2FileV11(evidence.path), evidence.path)
        .toBe(evidence.normalizedSha256);
    }
    expect(audit.agencySupportClassFreeze.sourceBasis.canonicalPlan).toEqual({
      path: 'docs/EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md',
      requirement: 'FREEZE_EXACT_AGENCY_SUBCLASSES_AND_PROOFS_WITHOUT_CLAIMING_ALL_FILM_POST_VARIANTS',
    });
    const agencyAdr = audit.agencySupportClassFreeze.sourceBasis.acceptedAgencyAdr;
    expect(hashNormalizedCap2FileV11(agencyAdr.path), agencyAdr.path)
      .toBe(agencyAdr.normalizedSha256);
    expect(() => assertCap2CurrentTruthSourcesMatchV11()).not.toThrow();
    expect(() => assertCap2CurrentTruthSourcesMatchV10()).toThrow(
      'CAP-2 v10 current source coverage drift.',
    );
  });

  it('rejects hash-recomputed semantic and authority tampering', () => {
    const changedDelta = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11);
    changedDelta.semanticDelta.evidence[0].normalizedSha256 = '0'.repeat(64);
    changedDelta.manifestHash = rehash(changedDelta);
    expect(() => parseCap2CurrentTruthReissueAuditV11(changedDelta)).toThrow(
      'CAP-2 v11 semantic delta drift.',
    );

    const changedSupportClass = structuredClone(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11,
    ) as any;
    changedSupportClass.agencySupportClassFreeze.freezeHash = '0'.repeat(64);
    changedSupportClass.manifestHash = rehash(changedSupportClass);
    expect(() => parseCap2CurrentTruthReissueAuditV11(changedSupportClass)).toThrow(
      'CAP-2 v11 agency support-class freeze drift.',
    );

    const falseAuthority = structuredClone(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11,
    ) as any;
    falseAuthority.runtimeAuthority.projectMutationAuthorized = true;
    falseAuthority.manifestHash = rehash(falseAuthority);
    expect(() => parseCap2CurrentTruthReissueAuditV11(falseAuthority)).toThrow();
  });
});

function rehash(value: typeof CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11): string {
  const { manifestHash: _oldHash, ...material } = value;
  return hashCanonicalCap2ArtifactV1(material);
}
