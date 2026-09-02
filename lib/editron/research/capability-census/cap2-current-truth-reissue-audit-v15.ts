import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13,
} from './cap2-current-truth-reissue-audit-v13';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V14,
} from './cap2-current-truth-reissue-audit-v14';
import {
  hashNormalizedCap2SourceSnapshotV11,
} from './cap2-current-truth-reissue-audit-v11';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const CURRENT_COMMIT_V15 = 'e3e37eb27280f800ba166823ebb5389a9fcd7b52';
const PRIOR_MANIFEST_SHA256 =
  '95da5790776c9032291689549a6e65d788499a71716ff8427beab657fbf6d987';
const PRIOR_SOURCE_SNAPSHOT_SHA256 =
  '0f71cbaacb28d72f42246d3db615eb117b0a2e58750ffca36c3bedbf8c24be45';
const CURRENT_SOURCE_SNAPSHOT_SHA256 =
  'ecf0b5b0af0ad9cfd2aaecb20a3cb829466f033da51a6639a5318dd4becb98b9';
const QUEUE5_CHECKPOINT_DURATION_SOURCE_SNAPSHOT_SHA256 =
  '40c46cca602a011b1a9d59439a4bf14cbec8f81e302efb84c468e83b8dd51790';

export const CAP2_QUEUE5_CHECKPOINT_DURATION_SOURCE_PATHS_V15 = [
  'lib/editron/agent/chat-ai-edit-transaction-runtime.ts',
  'lib/editron/agent/tools.ts',
  'lib/editron/services/checkpoint-service.ts',
  'lib/editron/services/project-service.ts',
  'tests/editron/chat-ai-edit-transaction-runtime.test.ts',
  'tests/editron/chat-dubbing-job.test.ts',
  'tests/editron/chat-editorial-intent-job.test.ts',
  'tests/editron/chat-reference-style-job.test.ts',
  'tests/editron/chat-tool-mechanical-contracts.test.ts',
  'tests/editron/project-duration-reconciliation-v1.test.ts',
] as const;

const semanticDelta = {
  deltaId: 'current-source.queue5-checkpoint-duration-owner-fences-v15',
  disposition:
    'QUEUE5_CHECKPOINT_DURATION_SLICE_REVISION_BOUND_CURRENT_TRUTH_UNIVERSAL_ENFORCEMENT_OPEN' as const,
  statement:
    'V15 binds the landed checkpoint and duration-owner slice: checkpoint capture uses state-paired revisions or writer receipts, restore carries explicit actor and expected revision, rollback receipt replays reject conflicting revisions, and chat duration reconciliation uses the explicit ProjectService owner instead of a generic writer. This is a bounded Queue 5 advance, not universal mutation enforcement, CAP-2 certification, Stage 2.5 GO, or Stage 3 authorization.',
  sourceBinding: {
    commit: CURRENT_COMMIT_V15,
    sourcePaths: CAP2_QUEUE5_CHECKPOINT_DURATION_SOURCE_PATHS_V15,
    normalizedSourceSnapshotHash: QUEUE5_CHECKPOINT_DURATION_SOURCE_SNAPSHOT_SHA256,
  },
  queueStatus: {
    queue3: {
      status: 'ACTIVE_PARTIAL' as const,
      remaining:
        'Real downstream timestamp-addressed preview, analysis, final-render and delivery coverage remains incomplete.',
    },
    queue4: {
      status: 'ACTIVE_PARTIAL' as const,
      remaining:
        'Private PTS storage, complete proxy/master invalidation, recovery and legacy migration proof remain incomplete.',
    },
    queue5: {
      status: 'ACTIVE_PARTIAL' as const,
      remaining:
        'Media-bearing whole-state/checkpoint prerequisites and remaining specialized writers still require source, rights, range, lock, predecessor and durable invalidation enforcement.',
    },
  },
  resolvedGaps: [
    'Checkpoint capture rejects unpaired or misclassified revision provenance before storage access.',
    'Post-mutation checkpoints require the ProjectService writer receipt that produced their state.',
    'Checkpoint restore requires an exact project revision and explicit user, agent or system actor.',
    'Rollback receipt replay rejects a different project or revision under the same receipt identity.',
    'Generic project duration writes have no mutation authority.',
    'Chat duration reconciliation invokes the canonical owner with explicit AGENT provenance.',
  ] as const,
  remainingGaps: [
    'Checkpoint and whole-state media changes do not yet enforce every applicable source, rights, range, lock and predecessor prerequisite.',
    'Direct timeline receipts still report no materialized durable downstream artifact invalidation chain.',
    'Not every specialized ProjectService writer has completed operation-specific prerequisite classification.',
    'CAP-1/CAP-2 vertical certification remains open with zero production-certified catalog rows.',
    'Stage 2.5 remains MODIFY and Stage 3 model-driven production mutation remains unauthorized.',
  ] as const,
  catalogPromotion: false as const,
} as const;

export const cap2CurrentTruthReissueAuditSchemaV15 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV15'),
  schemaVersion: z.literal(15),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV14'),
    manifestHash: z.literal(PRIOR_MANIFEST_SHA256),
    normalizedSourceSnapshotHash: z.literal(PRIOR_SOURCE_SNAPSHOT_SHA256),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V15),
    normalizedSourceSnapshotHash: z.literal(CURRENT_SOURCE_SNAPSHOT_SHA256),
    sourceSnapshotPathCount: z.literal(351),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(636),
    queue5CheckpointDurationSourceSnapshotHash:
      z.literal(QUEUE5_CHECKPOINT_DURATION_SOURCE_SNAPSHOT_SHA256),
    queue5CheckpointDurationSourcePathCount: z.literal(10),
    reconciliationStatus:
      z.literal('RECONCILED_CURRENT_SOURCE_V15_QUEUE5_CHECKPOINT_DURATION_DELTA'),
  }).strict(),
  catalogBinding: z.object({
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
    declaredOperationCount: z.literal(37),
    certifiedOperationCount: z.literal(0),
    productionEligibleOperationCount: z.literal(0),
  }).strict(),
  semanticDelta: z.object({
    deltaId: z.literal('current-source.queue5-checkpoint-duration-owner-fences-v15'),
    disposition: z.literal(
      'QUEUE5_CHECKPOINT_DURATION_SLICE_REVISION_BOUND_CURRENT_TRUTH_UNIVERSAL_ENFORCEMENT_OPEN',
    ),
    statement: z.string().min(1),
    sourceBinding: z.object({
      commit: z.literal(CURRENT_COMMIT_V15),
      sourcePaths: z.array(z.string().min(1)).length(10),
      normalizedSourceSnapshotHash:
        z.literal(QUEUE5_CHECKPOINT_DURATION_SOURCE_SNAPSHOT_SHA256),
    }).strict(),
    queueStatus: z.object({
      queue3: z.object({ status: z.literal('ACTIVE_PARTIAL'), remaining: z.string().min(1) }).strict(),
      queue4: z.object({ status: z.literal('ACTIVE_PARTIAL'), remaining: z.string().min(1) }).strict(),
      queue5: z.object({ status: z.literal('ACTIVE_PARTIAL'), remaining: z.string().min(1) }).strict(),
    }).strict(),
    resolvedGaps: z.array(z.string().min(1)).length(6),
    remainingGaps: z.array(z.string().min(1)).length(5),
    catalogPromotion: z.literal(false),
  }).strict(),
  reissueGate: z.object({
    priorAuditChained: z.literal(true),
    issuanceCommitSnapshotVerified: z.literal(true),
    liveQueue5SourceSnapshotVerified: z.literal(true),
    historicalV5ThroughV14Preserved: z.literal(true),
    catalogAuthorityUnchanged: z.literal(true),
    runtimeAuthorityDenied: z.literal(true),
  }).strict(),
  runtimeAuthority: z.object({
    plannerRegistryWired: z.literal(false),
    plannerProjectMutationAuthorized: z.literal(false),
    productionCertificationGranted: z.literal(false),
    stage25Go: z.literal(false),
    stage3Authorization: z.literal(false),
  }).strict(),
  manifestHash: SHA256,
}).strict();

export type Cap2CurrentTruthReissueAuditV15 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV15
>;

export function parseCap2CurrentTruthReissueAuditV15(
  value: unknown,
): Cap2CurrentTruthReissueAuditV15 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV15.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v15 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDelta)
    !== hashCanonicalCap2ArtifactV1(semanticDelta)) {
    throw new Error('CAP-2 v15 semantic delta drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV15(): void {
  const observedIdentifiers = CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13.reduce(
    (total, observation) => total + observation.observedCount,
    0,
  );
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13.length !== 351
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13.length !== 11
    || observedIdentifiers !== 636
    || CAP2_QUEUE5_CHECKPOINT_DURATION_SOURCE_PATHS_V15.length !== 10) {
    throw new Error('CAP-2 v15 current source coverage drift.');
  }
  if (hashNormalizedSourceSnapshotAtCommitV15(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13)
    !== CURRENT_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v15 issuance census snapshot drift.');
  }
  if (hashNormalizedSourceSnapshotAtCommitV15(
    CAP2_QUEUE5_CHECKPOINT_DURATION_SOURCE_PATHS_V15,
  ) !== QUEUE5_CHECKPOINT_DURATION_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v15 issuance Queue 5 snapshot drift.');
  }
  if (hashNormalizedCap2SourceSnapshotV11(
    CAP2_QUEUE5_CHECKPOINT_DURATION_SOURCE_PATHS_V15,
  ) !== QUEUE5_CHECKPOINT_DURATION_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v15 live Queue 5 source snapshot drift.');
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V14.manifestHash !== PRIOR_MANIFEST_SHA256
  || CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V14.sourceBinding.normalizedSourceSnapshotHash
    !== PRIOR_SOURCE_SNAPSHOT_SHA256) {
  throw new Error('CAP-2 v14 changed beneath the v15 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV15' as const,
  schemaVersion: 15 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V14.artifactType,
    manifestHash: PRIOR_MANIFEST_SHA256,
    normalizedSourceSnapshotHash: PRIOR_SOURCE_SNAPSHOT_SHA256,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V15,
    normalizedSourceSnapshotHash: CURRENT_SOURCE_SNAPSHOT_SHA256,
    sourceSnapshotPathCount: 351 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 636 as const,
    queue5CheckpointDurationSourceSnapshotHash:
      QUEUE5_CHECKPOINT_DURATION_SOURCE_SNAPSHOT_SHA256,
    queue5CheckpointDurationSourcePathCount: 10 as const,
    reconciliationStatus:
      'RECONCILED_CURRENT_SOURCE_V15_QUEUE5_CHECKPOINT_DURATION_DELTA' as const,
  },
  catalogBinding: {
    catalogHash: CAP2_FROZEN_CATALOG_HASH_V1,
    declaredOperationCount: 37 as const,
    certifiedOperationCount: 0 as const,
    productionEligibleOperationCount: 0 as const,
  },
  semanticDelta,
  reissueGate: {
    priorAuditChained: true as const,
    issuanceCommitSnapshotVerified: true as const,
    liveQueue5SourceSnapshotVerified: true as const,
    historicalV5ThroughV14Preserved: true as const,
    catalogAuthorityUnchanged: true as const,
    runtimeAuthorityDenied: true as const,
  },
  runtimeAuthority: {
    plannerRegistryWired: false as const,
    plannerProjectMutationAuthorized: false as const,
    productionCertificationGranted: false as const,
    stage25Go: false as const,
    stage3Authorization: false as const,
  },
};

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V15 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV15({
    ...auditMaterial,
    manifestHash: hashCanonicalCap2ArtifactV1(auditMaterial),
  }),
);

function hashNormalizedSourceSnapshotAtCommitV15(
  relativePaths: readonly string[],
): string {
  const rows = [...relativePaths].sort(compareCodeUnits).map((relativePath) => {
    const committedText = execFileSync(
      'git',
      ['show', `${CURRENT_COMMIT_V15}:${relativePath}`],
      { encoding: 'utf8' },
    );
    const fileHash = createHash('sha256')
      .update(committedText.replaceAll('\r\n', '\n'), 'utf8')
      .digest('hex');
    return `${relativePath}\0${fileHash}`;
  });
  return createHash('sha256').update(rows.join('\n'), 'utf8').digest('hex');
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
