import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13,
} from './cap2-current-truth-reissue-audit-v13';
import {
  hashNormalizedCap2SourceSnapshotV11,
} from './cap2-current-truth-reissue-audit-v11';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const CURRENT_COMMIT_V14 = '5328255d51d4e1687821836bc73015e2e19428f5';
const PRIOR_MANIFEST_SHA256 =
  'ff5803ede99bb3b3770b79ce1f1f3151dfe3ee58a62611f06195194125beb61a';
const PRIOR_SOURCE_SNAPSHOT_SHA256 =
  '05ea0e563a6611463de7227f1af6c62c7866f092a5f3ac50c777861d7402d00a';
const CURRENT_SOURCE_SNAPSHOT_SHA256 =
  '0f71cbaacb28d72f42246d3db615eb117b0a2e58750ffca36c3bedbf8c24be45';
const QUEUE5_OVERLAY_WRITER_SOURCE_SNAPSHOT_SHA256 =
  '64859075041a6bc092e6e3d2a978667646ea20066f9a957132d7d7784463df8b';

export const CAP2_QUEUE5_OVERLAY_WRITER_SOURCE_PATHS_V14 = [
  'app/api/services/editron/html-scene/edit/route.ts',
  'lib/editron/agent/chat-audio-tools.ts',
  'lib/editron/agent/chat-visual-tools.ts',
  'lib/editron/agent/tools.ts',
  'lib/editron/research/open-ended-planner/stage25-project-service-conflict-product-proof-v1.ts',
  'lib/editron/services/auto-edit-service.ts',
  'lib/editron/services/project-service.ts',
  'tests/editron/auto-edit-service.test.ts',
  'tests/editron/chat-phase3g-operations.test.ts',
  'tests/editron/chat-tool-mechanical-contracts.test.ts',
  'tests/editron/chat-tool-provider-asset-contracts.test.ts',
  'tests/editron/chat-tool-speech-caption-contracts.test.ts',
  'tests/editron/html-scene-edit-route.test.ts',
  'tests/editron/project-save-payload.test.ts',
  'tests/editron/project-timeline-range-cut-v1.test.ts',
  'tests/editron/stage25-project-service-conflict-trial-v1.test.ts',
] as const;

const semanticDelta = {
  deltaId: 'current-source.queue5-direct-overlay-writer-fences-v14',
  disposition:
    'QUEUE5_DIRECT_OVERLAY_SLICE_REVISION_BOUND_CURRENT_TRUTH_UNIVERSAL_ENFORCEMENT_OPEN' as const,
  statement:
    'V14 binds the landed direct-overlay writer slice: agent visual/audio calls and the HTML scene route carry caller-observed revisions; auto-edit assembly commits under one ProjectService CAS; obsolete inferred-current update/delete APIs are removed. This is a bounded Queue 5 advance, not universal mutation enforcement, CAP-2 certification, Stage 2.5 GO, or Stage 3 authorization.',
  sourceBinding: {
    commit: CURRENT_COMMIT_V14,
    sourcePaths: CAP2_QUEUE5_OVERLAY_WRITER_SOURCE_PATHS_V14,
    normalizedSourceSnapshotHash: QUEUE5_OVERLAY_WRITER_SOURCE_SNAPSHOT_SHA256,
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
        'Private PTS storage, complete proxy/master relink invalidation, recovery and legacy migration proof remain incomplete.',
    },
    queue5: {
      status: 'ACTIVE_PARTIAL' as const,
      remaining:
        'Whole-state, family replacement and specialized mutation owners still require universal revision, evidence, rights, lock, predecessor and invalidation enforcement.',
    },
  },
  resolvedGaps: [
    'Direct agent overlay add, update and delete operations carry explicit revisions and actor provenance.',
    'Visual and audio chat tool mutations chain writer-issued revisions across sequential writes.',
    'Auto-edit source replacement and ripple execute as one ProjectService compare-and-swap assembly.',
    'HTML scene edits reject stale project or stale scene state before provider-backed mutation.',
    'The inferred-current ProjectService updateOverlay and deleteOverlay APIs no longer exist.',
  ] as const,
  remainingGaps: [
    'Direct overlay receipts still report no durable downstream artifact invalidation chain.',
    'Not every ProjectService writer enforces evidence, rights, locks, predecessors and invalidations.',
    'Manual editor local-state mutation and server command semantics remain only partially converged.',
    'CAP-1/CAP-2 vertical certification remains open with zero production-certified catalog rows.',
    'Stage 2.5 remains MODIFY and Stage 3 model-driven production mutation remains unauthorized.',
  ] as const,
  catalogPromotion: false as const,
} as const;

export const cap2CurrentTruthReissueAuditSchemaV14 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV14'),
  schemaVersion: z.literal(14),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV13'),
    manifestHash: z.literal(PRIOR_MANIFEST_SHA256),
    normalizedSourceSnapshotHash: z.literal(PRIOR_SOURCE_SNAPSHOT_SHA256),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V14),
    normalizedSourceSnapshotHash: z.literal(CURRENT_SOURCE_SNAPSHOT_SHA256),
    sourceSnapshotPathCount: z.literal(351),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(636),
    queue5OverlayWriterSourceSnapshotHash:
      z.literal(QUEUE5_OVERLAY_WRITER_SOURCE_SNAPSHOT_SHA256),
    queue5OverlayWriterSourcePathCount: z.literal(16),
    reconciliationStatus:
      z.literal('RECONCILED_CURRENT_SOURCE_V14_QUEUE5_DIRECT_OVERLAY_WRITER_DELTA'),
  }).strict(),
  catalogBinding: z.object({
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
    declaredOperationCount: z.literal(37),
    certifiedOperationCount: z.literal(0),
    productionEligibleOperationCount: z.literal(0),
  }).strict(),
  semanticDelta: z.object({
    deltaId: z.literal('current-source.queue5-direct-overlay-writer-fences-v14'),
    disposition: z.literal(
      'QUEUE5_DIRECT_OVERLAY_SLICE_REVISION_BOUND_CURRENT_TRUTH_UNIVERSAL_ENFORCEMENT_OPEN',
    ),
    statement: z.string().min(1),
    sourceBinding: z.object({
      commit: z.literal(CURRENT_COMMIT_V14),
      sourcePaths: z.array(z.string().min(1)).length(16),
      normalizedSourceSnapshotHash:
        z.literal(QUEUE5_OVERLAY_WRITER_SOURCE_SNAPSHOT_SHA256),
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
    historicalV5ThroughV13Preserved: z.literal(true),
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

export type Cap2CurrentTruthReissueAuditV14 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV14
>;

export function parseCap2CurrentTruthReissueAuditV14(
  value: unknown,
): Cap2CurrentTruthReissueAuditV14 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV14.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v14 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDelta)
    !== hashCanonicalCap2ArtifactV1(semanticDelta)) {
    throw new Error('CAP-2 v14 semantic delta drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV14(): void {
  const observedIdentifiers = CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13.reduce(
    (total, observation) => total + observation.observedCount,
    0,
  );
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13.length !== 351
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13.length !== 11
    || observedIdentifiers !== 636
    || CAP2_QUEUE5_OVERLAY_WRITER_SOURCE_PATHS_V14.length !== 16) {
    throw new Error('CAP-2 v14 current source coverage drift.');
  }
  if (hashNormalizedSourceSnapshotAtCommitV14(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13)
    !== CURRENT_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v14 issuance census snapshot drift.');
  }
  if (hashNormalizedSourceSnapshotAtCommitV14(
    CAP2_QUEUE5_OVERLAY_WRITER_SOURCE_PATHS_V14,
  ) !== QUEUE5_OVERLAY_WRITER_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v14 issuance Queue 5 snapshot drift.');
  }
  if (hashNormalizedCap2SourceSnapshotV11(CAP2_QUEUE5_OVERLAY_WRITER_SOURCE_PATHS_V14)
    !== QUEUE5_OVERLAY_WRITER_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v14 live Queue 5 source snapshot drift.');
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13.manifestHash !== PRIOR_MANIFEST_SHA256
  || CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13.sourceBinding.normalizedSourceSnapshotHash
    !== PRIOR_SOURCE_SNAPSHOT_SHA256) {
  throw new Error('CAP-2 v13 changed beneath the v14 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV14' as const,
  schemaVersion: 14 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13.artifactType,
    manifestHash: PRIOR_MANIFEST_SHA256,
    normalizedSourceSnapshotHash: PRIOR_SOURCE_SNAPSHOT_SHA256,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V14,
    normalizedSourceSnapshotHash: CURRENT_SOURCE_SNAPSHOT_SHA256,
    sourceSnapshotPathCount: 351 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 636 as const,
    queue5OverlayWriterSourceSnapshotHash:
      QUEUE5_OVERLAY_WRITER_SOURCE_SNAPSHOT_SHA256,
    queue5OverlayWriterSourcePathCount: 16 as const,
    reconciliationStatus:
      'RECONCILED_CURRENT_SOURCE_V14_QUEUE5_DIRECT_OVERLAY_WRITER_DELTA' as const,
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
    historicalV5ThroughV13Preserved: true as const,
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

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V14 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV14({
    ...auditMaterial,
    manifestHash: hashCanonicalCap2ArtifactV1(auditMaterial),
  }),
);

function hashNormalizedSourceSnapshotAtCommitV14(
  relativePaths: readonly string[],
): string {
  const rows = [...relativePaths].sort(compareCodeUnits).map((relativePath) => {
    const committedText = execFileSync(
      'git',
      ['show', `${CURRENT_COMMIT_V14}:${relativePath}`],
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
