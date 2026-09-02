import { describe, expect, it } from 'vitest';

import {
  assertCap2CurrentTruthSourcesMatchV12,
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V12,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V12,
  parseCap2CurrentTruthReissueAuditV12,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v12';
import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11 } from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v11';
import { hashCanonicalCap2ArtifactV1 } from '@/lib/editron/research/capability-census/cap2-current-truth-freeze-v1';

describe('CAP-2A current-truth reissue V12', () => {
  it('chains immutable V11 and binds the current pipeline-video pilot', () => {
    const audit = parseCap2CurrentTruthReissueAuditV12(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12,
    );

    expect(audit.priorAuditBinding).toEqual({
      artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11.artifactType,
      manifestHash: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11.manifestHash,
      normalizedSourceSnapshotHash:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11.sourceBinding.normalizedSourceSnapshotHash,
    });
    expect(audit.sourceBinding).toMatchObject({
      branch: 'infrastructure-improvs-+Editron',
      commit: '8656a5688d09f4cb155d189743677c357bc44929',
      normalizedSourceSnapshotHash:
        'f0c5137c263b9f89d9d106a93af12835d6e13b6d6be54407a846090e732f4cf6',
      sourceSnapshotPathCount: 351,
      sourceObservationCount: 11,
      observedIdentifierOccurrences: 636,
      pilotSourceSnapshotHash:
        '338fb07d5775aae0ace22ae0a8077df4b0a2fce13960d39b5e49402cff80f8ff',
      pilotSourcePathCount: 5,
      reconciliationStatus: 'RECONCILED_CURRENT_SOURCE_V12_PILOT_DELTA',
    });
    expect(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V12).toHaveLength(351);
    expect(CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V12).toHaveLength(11);
    expect(audit.semanticDelta.sourceSurfaceDelta).toEqual({
      priorV11PathCount: 351,
      currentPathCount: 351,
      addedObservationPathCount: 0,
      priorV11IdentifierOccurrences: 636,
      currentIdentifierOccurrences: 636,
      addedIdentifierOccurrences: 0,
      v11ObservationShapePreserved: true,
      pilotPathsRehashed: 5,
      pilotPathsAlreadyInV11Surface: 4,
      pilotTestPathOutsideV11Surface: true,
    });

    expect(audit.semanticDelta.pilot).toMatchObject({
      disposition: 'WIRED_FAIL_CLOSED_PILOT_CURRENT_TRUTH',
      activeProjectClass: 'AGENCY_100GB_4H_V1',
      pathTrace: {
        producer: 'app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts',
        decisionOwner: 'lib/editron/services/project-service.ts',
        workerRelay: 'app/api/internal/workers/pipeline/video/route.ts',
        mutationOwner: 'lib/editron/services/project-service.ts',
      },
      admission: {
        projectLinkedRegeneration: 'FAIL_CLOSED_BEFORE_CREDITS_OR_PROVIDER_DISPATCH',
        failureDisposition: 'UNVERIFIABLE_WHEN_REQUIRED_INVALIDATION_IS_UNMATERIALIZED',
        nonProjectGeneration: 'UNAFFECTED_BY_PROJECT_PREREQUISITE_GATE',
        validSuccessPath: 'Only a future real current-target/current-revision MATERIALIZED invalidation admission from the durable ProjectService owner can open a project-linked success path; this source currently has no such owner and therefore admits no project-linked success.',
      },
      focusedProof: {
        baselinePassedTestCount: 24,
        repositoryTypecheck: 'PASS',
        repositoryEslintQuiet: 'PASS',
        diffCheck: 'PASS',
      },
      authority: {
        implementation: 'PILOT_WIRED',
        certification: false,
        productionEligible: false,
        runtimeMutationAuthorization: false,
        stage25Go: false,
        stage3Authorization: false,
      },
    });
    expect(audit.agencySupportClassBinding).toEqual({
      classId: 'AGENCY_100GB_4H_V1',
      freezeHash: 'b6ebe539aca225d2dd9ef9736c637d38ef8428d8a92d58cb81163567d3dc0ef5',
      declarationStatus: 'V11_DECLARED_SUPPORTED_SUBCLASSES_IMPLEMENTATION_OPEN',
      certificationGranted: false,
    });
    expect(() => assertCap2CurrentTruthSourcesMatchV12()).not.toThrow();
  });

  it('rejects a hash-recomputed pilot or authority tamper', () => {
    const changedPilot = structuredClone(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12,
    ) as any;
    changedPilot.semanticDelta.pilot.sourceEvidence[0].normalizedSha256 = '0'.repeat(64);
    changedPilot.manifestHash = rehash(changedPilot);
    expect(() => parseCap2CurrentTruthReissueAuditV12(changedPilot)).toThrow(
      'CAP-2 v12 semantic delta drift.',
    );

    const falseAuthority = structuredClone(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12,
    ) as any;
    falseAuthority.runtimeAuthority.stage3Authorization = true;
    falseAuthority.manifestHash = rehash(falseAuthority);
    expect(() => parseCap2CurrentTruthReissueAuditV12(falseAuthority)).toThrow();
  });
});

function rehash(value: typeof CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12): string {
  const { manifestHash: _oldHash, ...material } = value;
  return hashCanonicalCap2ArtifactV1(material);
}
