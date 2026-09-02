import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13,
} from './cap2-current-truth-reissue-audit-v13';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16,
} from './cap2-current-truth-reissue-audit-v16';
import { hashNormalizedCap2SourceSnapshotV11 }
  from './cap2-current-truth-reissue-audit-v11';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const CURRENT_COMMIT_V17 = '3fc0cd4d06d11954bba97ab632b309c82b2f1516';
const PRIOR_MANIFEST_SHA256 =
  '0f38ac5574486fbc153dae08410434846d7cbbf90c8ac09822b996cd13ece433';
const PRIOR_SOURCE_SNAPSHOT_SHA256 =
  '6a29ab8986e27f97f123bf945cfbf615abcfd8d9cde09220156d0d639d848ce4';
const CURRENT_SOURCE_SNAPSHOT_SHA256 =
  '14fbd283f631d96822b7084a7c5a42a6691214b5948309f5b76c3fb3b0674521';
const QUEUE5_INVALIDATION_SOURCE_SNAPSHOT_SHA256 =
  'f33482feec7195611afd8af143f8202a3694a6a43b9dcc38caed895f08af796f';

export const CAP2_QUEUE5_INVALIDATION_SOURCE_PATHS_V17 = [
  'lib/editron/services/project-render-snapshot-invalidation-v1.ts',
  'lib/editron/services/render-job-service.ts',
  'lib/editron/schemas/render-job.ts',
  'lib/editron/services/project-service.ts',
  'tests/editron/project-render-snapshot-invalidation-v1.test.ts',
  'tests/editron/project-render-snapshot-invalidation-render-jobs-v1.test.ts',
  'tests/editron/project-save-payload.test.ts',
  'tests/editron/project-generated-composition-checkpoint-v1.test.ts',
  'tests/editron/chat-ai-edit-transaction-runtime.test.ts',
] as const;

const semanticDelta = {
  deltaId: 'current-source.queue5-project-snapshot-invalidation-v17',
  disposition:
    'QUEUE5_WHOLE_STATE_RENDER_INVALIDATION_DURABLE_SPECIALIZED_WRITER_ENFORCEMENT_OPEN' as const,
  statement:
    'V17 binds the landed whole-project render invalidation slice. Whole-state saves, autosaves and checkpoint restores durably pre-enqueue an inert invalidation outbox, commit its exact link with the project revision, and fail before mutation when enqueue is unavailable. The render-job materializer fences only exact pre-change project-snapshot bindings and treats active legacy, malformed and single-overlay rows conservatively. This is bounded Queue 5 progress, not convergence with the separate single-overlay chain, universal mutation enforcement, CAP-2 certification, Stage 2.5 GO, or Stage 3 authorization.',
  sourceBinding: {
    commit: CURRENT_COMMIT_V17,
    sourcePaths: CAP2_QUEUE5_INVALIDATION_SOURCE_PATHS_V17,
    normalizedSourceSnapshotHash: QUEUE5_INVALIDATION_SOURCE_SNAPSHOT_SHA256,
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
        'Remaining specialized writers still require operation-specific source, rights, range, lock, predecessor and invalidation enforcement plus aggregate verification.',
    },
  },
  resolvedGaps: [
    'Whole-state save and autosave pre-enqueue one inert project-snapshot invalidation outbox before their project compare-and-set.',
    'Checkpoint restore uses the same pre-commit invalidation owner and exact revision link.',
    'A failed invalidation enqueue aborts before any project mutation.',
    'The committed timeline receipt carries the exact before/after revision invalidation identity.',
    'Exact pre-change project-snapshot render jobs are fenced stale or history-only without mutating another revision.',
    'Active legacy, malformed, single-overlay and lost-CAS rows prevent false derivative completion.',
  ] as const,
  remainingGaps: [
    'Direct and remaining specialized timeline mutation receipts still lack a durable project-snapshot invalidation link.',
    'Source, rights, range, lock and predecessor prerequisites remain incomplete across remaining specialized writers.',
    'The outbox activation worker, cleanup retention and live Atlas/R2 recovery proof remain open.',
    'CAP-1/CAP-2 vertical certification remains open with zero production-certified catalog rows.',
    'Stage 2.5 remains MODIFY and Stage 3 model-driven production mutation remains unauthorized.',
  ] as const,
  catalogPromotion: false as const,
} as const;

export const cap2CurrentTruthReissueAuditSchemaV17 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV17'),
  schemaVersion: z.literal(17),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV16'),
    manifestHash: z.literal(PRIOR_MANIFEST_SHA256),
    normalizedSourceSnapshotHash: z.literal(PRIOR_SOURCE_SNAPSHOT_SHA256),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V17),
    normalizedSourceSnapshotHash: z.literal(CURRENT_SOURCE_SNAPSHOT_SHA256),
    sourceSnapshotPathCount: z.literal(351),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(636),
    queue5InvalidationSourceSnapshotHash:
      z.literal(QUEUE5_INVALIDATION_SOURCE_SNAPSHOT_SHA256),
    queue5InvalidationSourcePathCount: z.literal(9),
    reconciliationStatus:
      z.literal('RECONCILED_CURRENT_SOURCE_V17_QUEUE5_PROJECT_SNAPSHOT_INVALIDATION_DELTA'),
  }).strict(),
  catalogBinding: z.object({
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
    declaredOperationCount: z.literal(37),
    certifiedOperationCount: z.literal(0),
    productionEligibleOperationCount: z.literal(0),
  }).strict(),
  semanticDelta: z.object({
    deltaId: z.literal('current-source.queue5-project-snapshot-invalidation-v17'),
    disposition: z.literal(
      'QUEUE5_WHOLE_STATE_RENDER_INVALIDATION_DURABLE_SPECIALIZED_WRITER_ENFORCEMENT_OPEN',
    ),
    statement: z.string().min(1),
    sourceBinding: z.object({
      commit: z.literal(CURRENT_COMMIT_V17),
      sourcePaths: z.array(z.string().min(1)).length(9),
      normalizedSourceSnapshotHash:
        z.literal(QUEUE5_INVALIDATION_SOURCE_SNAPSHOT_SHA256),
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
    historicalV5ThroughV16Preserved: z.literal(true),
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

export type Cap2CurrentTruthReissueAuditV17 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV17
>;

export function parseCap2CurrentTruthReissueAuditV17(
  value: unknown,
): Cap2CurrentTruthReissueAuditV17 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV17.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v17 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDelta)
    !== hashCanonicalCap2ArtifactV1(semanticDelta)) {
    throw new Error('CAP-2 v17 semantic delta drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV17(): void {
  const observedIdentifiers = CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13.reduce(
    (total, observation) => total + observation.observedCount,
    0,
  );
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13.length !== 351
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13.length !== 11
    || observedIdentifiers !== 636
    || CAP2_QUEUE5_INVALIDATION_SOURCE_PATHS_V17.length !== 9) {
    throw new Error('CAP-2 v17 current source coverage drift.');
  }
  if (hashNormalizedSourceSnapshotAtCommitV17(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13)
    !== CURRENT_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v17 issuance census snapshot drift.');
  }
  if (hashNormalizedSourceSnapshotAtCommitV17(
    CAP2_QUEUE5_INVALIDATION_SOURCE_PATHS_V17,
  ) !== QUEUE5_INVALIDATION_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v17 issuance Queue 5 snapshot drift.');
  }
  if (hashNormalizedCap2SourceSnapshotV11(
    CAP2_QUEUE5_INVALIDATION_SOURCE_PATHS_V17,
  ) !== QUEUE5_INVALIDATION_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v17 live Queue 5 source snapshot drift.');
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16.manifestHash !== PRIOR_MANIFEST_SHA256
  || CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16.sourceBinding.normalizedSourceSnapshotHash
    !== PRIOR_SOURCE_SNAPSHOT_SHA256) {
  throw new Error('CAP-2 v16 changed beneath the v17 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV17' as const,
  schemaVersion: 17 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16.artifactType,
    manifestHash: PRIOR_MANIFEST_SHA256,
    normalizedSourceSnapshotHash: PRIOR_SOURCE_SNAPSHOT_SHA256,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V17,
    normalizedSourceSnapshotHash: CURRENT_SOURCE_SNAPSHOT_SHA256,
    sourceSnapshotPathCount: 351 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 636 as const,
    queue5InvalidationSourceSnapshotHash: QUEUE5_INVALIDATION_SOURCE_SNAPSHOT_SHA256,
    queue5InvalidationSourcePathCount: 9 as const,
    reconciliationStatus:
      'RECONCILED_CURRENT_SOURCE_V17_QUEUE5_PROJECT_SNAPSHOT_INVALIDATION_DELTA' as const,
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
    historicalV5ThroughV16Preserved: true as const,
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

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V17 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV17({
    ...auditMaterial,
    manifestHash: hashCanonicalCap2ArtifactV1(auditMaterial),
  }),
);

function hashNormalizedSourceSnapshotAtCommitV17(
  relativePaths: readonly string[],
): string {
  const rows = [...relativePaths].sort(compareCodeUnits).map((relativePath) => {
    const committedText = execFileSync(
      'git',
      ['show', `${CURRENT_COMMIT_V17}:${relativePath}`],
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
