import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13,
} from './cap2-current-truth-reissue-audit-v13';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V15,
} from './cap2-current-truth-reissue-audit-v15';
import {
  hashNormalizedCap2SourceSnapshotV11,
} from './cap2-current-truth-reissue-audit-v11';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const CURRENT_COMMIT_V16 = 'a0084baee93273a1e1a2b5b0f149870c7182ba03';
const PRIOR_MANIFEST_SHA256 =
  '6eee1e45915c84626c10eb454bdc18278c3cc2a165e7df564e02cd5b28350aff';
const PRIOR_SOURCE_SNAPSHOT_SHA256 =
  'ecf0b5b0af0ad9cfd2aaecb20a3cb829466f033da51a6639a5318dd4becb98b9';
const CURRENT_SOURCE_SNAPSHOT_SHA256 =
  '6a29ab8986e27f97f123bf945cfbf615abcfd8d9cde09220156d0d639d848ce4';
const QUEUE5_ACTOR_SOURCE_SNAPSHOT_SHA256 =
  '813f94b4384dffed7d21d14e3644fec2b4212c106e2738a3b3083ea8d2e6a4c1';

export const CAP2_QUEUE5_ACTOR_SOURCE_PATHS_V16 = [
  'lib/editron/services/checkpoint-service.ts',
  'lib/editron/services/project-service.ts',
  'tests/editron/project-mutation-owner-inventory-v1.test.ts',
] as const;

const semanticDelta = {
  deltaId: 'current-source.queue5-explicit-mutation-actors-v16',
  disposition:
    'QUEUE5_CURRENT_MUTATION_ACTORS_EXPLICIT_HISTORICAL_RECEIPTS_COMPATIBLE_UNIVERSAL_ENFORCEMENT_OPEN' as const,
  statement:
    'V16 binds the landed current-mutation actor-provenance slice. Current ProjectService commands, active range locks, checkpoint restore inputs and timeline receipt builders require explicit USER, AGENT or SYSTEM authority. UNKNOWN_LEGACY_CALLER remains readable only on historical timeline receipts and cannot authorize a current write. This is bounded Queue 5 progress, not universal mutation enforcement, CAP-2 certification, Stage 2.5 GO, or Stage 3 authorization.',
  sourceBinding: {
    commit: CURRENT_COMMIT_V16,
    sourcePaths: CAP2_QUEUE5_ACTOR_SOURCE_PATHS_V16,
    normalizedSourceSnapshotHash: QUEUE5_ACTOR_SOURCE_SNAPSHOT_SHA256,
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
    'Current ProjectService mutation command types exclude unknown legacy actor provenance.',
    'One runtime assertion rejects forged or missing current mutation authority before storage access.',
    'Active timeline range locks require explicit current mutation authority.',
    'Checkpoint restore and current timeline receipt builders require explicit mutation authority.',
    'Historical timeline receipts remain readable without granting their legacy actor value current write authority.',
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

export const cap2CurrentTruthReissueAuditSchemaV16 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV16'),
  schemaVersion: z.literal(16),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV15'),
    manifestHash: z.literal(PRIOR_MANIFEST_SHA256),
    normalizedSourceSnapshotHash: z.literal(PRIOR_SOURCE_SNAPSHOT_SHA256),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V16),
    normalizedSourceSnapshotHash: z.literal(CURRENT_SOURCE_SNAPSHOT_SHA256),
    sourceSnapshotPathCount: z.literal(351),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(636),
    queue5ActorSourceSnapshotHash:
      z.literal(QUEUE5_ACTOR_SOURCE_SNAPSHOT_SHA256),
    queue5ActorSourcePathCount: z.literal(3),
    reconciliationStatus:
      z.literal('RECONCILED_CURRENT_SOURCE_V16_QUEUE5_EXPLICIT_ACTOR_DELTA'),
  }).strict(),
  catalogBinding: z.object({
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
    declaredOperationCount: z.literal(37),
    certifiedOperationCount: z.literal(0),
    productionEligibleOperationCount: z.literal(0),
  }).strict(),
  semanticDelta: z.object({
    deltaId: z.literal('current-source.queue5-explicit-mutation-actors-v16'),
    disposition: z.literal(
      'QUEUE5_CURRENT_MUTATION_ACTORS_EXPLICIT_HISTORICAL_RECEIPTS_COMPATIBLE_UNIVERSAL_ENFORCEMENT_OPEN',
    ),
    statement: z.string().min(1),
    sourceBinding: z.object({
      commit: z.literal(CURRENT_COMMIT_V16),
      sourcePaths: z.array(z.string().min(1)).length(3),
      normalizedSourceSnapshotHash:
        z.literal(QUEUE5_ACTOR_SOURCE_SNAPSHOT_SHA256),
    }).strict(),
    queueStatus: z.object({
      queue3: z.object({ status: z.literal('ACTIVE_PARTIAL'), remaining: z.string().min(1) }).strict(),
      queue4: z.object({ status: z.literal('ACTIVE_PARTIAL'), remaining: z.string().min(1) }).strict(),
      queue5: z.object({ status: z.literal('ACTIVE_PARTIAL'), remaining: z.string().min(1) }).strict(),
    }).strict(),
    resolvedGaps: z.array(z.string().min(1)).length(5),
    remainingGaps: z.array(z.string().min(1)).length(5),
    catalogPromotion: z.literal(false),
  }).strict(),
  reissueGate: z.object({
    priorAuditChained: z.literal(true),
    issuanceCommitSnapshotVerified: z.literal(true),
    liveQueue5SourceSnapshotVerified: z.literal(true),
    historicalV5ThroughV15Preserved: z.literal(true),
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

export type Cap2CurrentTruthReissueAuditV16 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV16
>;

export function parseCap2CurrentTruthReissueAuditV16(
  value: unknown,
): Cap2CurrentTruthReissueAuditV16 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV16.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v16 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDelta)
    !== hashCanonicalCap2ArtifactV1(semanticDelta)) {
    throw new Error('CAP-2 v16 semantic delta drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV16(): void {
  const observedIdentifiers = CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13.reduce(
    (total, observation) => total + observation.observedCount,
    0,
  );
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13.length !== 351
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13.length !== 11
    || observedIdentifiers !== 636
    || CAP2_QUEUE5_ACTOR_SOURCE_PATHS_V16.length !== 3) {
    throw new Error('CAP-2 v16 current source coverage drift.');
  }
  if (hashNormalizedSourceSnapshotAtCommitV16(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13)
    !== CURRENT_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v16 issuance census snapshot drift.');
  }
  if (hashNormalizedSourceSnapshotAtCommitV16(
    CAP2_QUEUE5_ACTOR_SOURCE_PATHS_V16,
  ) !== QUEUE5_ACTOR_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v16 issuance Queue 5 snapshot drift.');
  }
  if (hashNormalizedCap2SourceSnapshotV11(
    CAP2_QUEUE5_ACTOR_SOURCE_PATHS_V16,
  ) !== QUEUE5_ACTOR_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v16 live Queue 5 source snapshot drift.');
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V15.manifestHash !== PRIOR_MANIFEST_SHA256
  || CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V15.sourceBinding.normalizedSourceSnapshotHash
    !== PRIOR_SOURCE_SNAPSHOT_SHA256) {
  throw new Error('CAP-2 v15 changed beneath the v16 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV16' as const,
  schemaVersion: 16 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V15.artifactType,
    manifestHash: PRIOR_MANIFEST_SHA256,
    normalizedSourceSnapshotHash: PRIOR_SOURCE_SNAPSHOT_SHA256,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V16,
    normalizedSourceSnapshotHash: CURRENT_SOURCE_SNAPSHOT_SHA256,
    sourceSnapshotPathCount: 351 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 636 as const,
    queue5ActorSourceSnapshotHash: QUEUE5_ACTOR_SOURCE_SNAPSHOT_SHA256,
    queue5ActorSourcePathCount: 3 as const,
    reconciliationStatus:
      'RECONCILED_CURRENT_SOURCE_V16_QUEUE5_EXPLICIT_ACTOR_DELTA' as const,
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
    historicalV5ThroughV15Preserved: true as const,
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

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV16({
    ...auditMaterial,
    manifestHash: hashCanonicalCap2ArtifactV1(auditMaterial),
  }),
);

function hashNormalizedSourceSnapshotAtCommitV16(
  relativePaths: readonly string[],
): string {
  const rows = [...relativePaths].sort(compareCodeUnits).map((relativePath) => {
    const committedText = execFileSync(
      'git',
      ['show', `${CURRENT_COMMIT_V16}:${relativePath}`],
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
