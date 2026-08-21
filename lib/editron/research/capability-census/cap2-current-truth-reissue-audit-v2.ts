import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import coreJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-core-timeline-v1.json';
import directorJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-director-generated-jobs-v1.json';
import mediaJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-media-audio-v1.json';
import renderJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-render-proof-delivery-v1.json';
import inventoryJson from '@/docs/editron/capability-census/editron-cap2-source-surface-inventory-v1.json';
import visualJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-visual-v1.json';
import {
  CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1,
  CAP2_FROZEN_CATALOG_HASH_V1,
  CAP2_FROZEN_RECONCILIATION_HASHES_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';
import {
  CAP2_RECONCILIATION_DOMAINS_V1,
  parseCap2OwnerReconciliationArtifactV1,
} from './cap2-owner-reconciliation-contract-v1';
import { parseCap2SourceSurfaceInventoryV1 } from './cap2-source-surface-contract-v1';

const nonEmptyString = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const stableId = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const CURRENT_COMMIT_V2 = 'f83506bcf7914e7ae7c4ffdf71b6fd08f6d41b0f';
const HASH_BOUND_UNCOMMITTED_EVIDENCE_PATHS_V2 = deepFreeze([
  'app/api/services/alyzitron/analyze/route.ts',
  'app/api/services/alyzitron/processor/route.ts',
  'lib/editron/agent/chat-visual-tools.ts',
] as const);
const BASE_FREEZE_MANIFEST_HASH_V1 =
  'c5c00ec71e060dc0920ee7fcbefbb6ca693488301e42448808ceec484353ce60';
const DETACHED_ROUTE_ID = 'POST /api/services/thinkforge/session';
const DETACHED_ROUTE_PATH = 'app/api/services/thinkforge/session/route.ts';
const NORMALIZED_SNAPSHOT_ALGORITHM =
  'sha256(sorted(path + NUL + sha256(utf8FileTextWithCrlfNormalizedToLf)).join(LF))';

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function hashNormalizedCap2FileV2(
  relativePath: string,
  repositoryRoot = process.cwd(),
): string {
  const normalizedText = readFileSync(path.resolve(repositoryRoot, relativePath), 'utf8')
    .replaceAll('\r\n', '\n');
  return createHash('sha256').update(normalizedText, 'utf8').digest('hex');
}

export function hashNormalizedCap2SourceSnapshotV2(
  relativePaths: readonly string[],
  repositoryRoot = process.cwd(),
): string {
  const rows = [...relativePaths].sort(compareCodeUnits).map((relativePath) => (
    `${relativePath}\0${hashNormalizedCap2FileV2(relativePath, repositoryRoot)}`
  ));
  return createHash('sha256').update(rows.join('\n'), 'utf8').digest('hex');
}

const inventory = parseCap2SourceSurfaceInventoryV1(inventoryJson);
const historicalApiObservation = inventory.observations.find(
  ({ sourceId }) => sourceId === 'api.editron-linked-route-exports',
);
if (!historicalApiObservation?.observedIds.includes(DETACHED_ROUTE_ID)
  || !historicalApiObservation.evidencePaths.includes(DETACHED_ROUTE_PATH)) {
  throw new Error('CAP-2 v2 cannot reconstruct the detached ThinkForge route from v1 evidence.');
}

export const CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V2 = deepFreeze(
  inventory.observations.map((observation) => {
    if (observation.sourceId !== historicalApiObservation.sourceId) return observation;
    const observedIds = observation.observedIds.filter((id) => id !== DETACHED_ROUTE_ID);
    return {
      ...observation,
      observedCount: observedIds.length,
      observedIds,
      evidencePaths: observation.evidencePaths.filter((entry) => entry !== DETACHED_ROUTE_PATH),
    };
  }),
);

export const CAP2_CURRENT_TRUTH_SOURCE_PATHS_V2 = deepFreeze(
  [...new Set(CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V2.flatMap(
    ({ evidencePaths }) => evidencePaths,
  ))].sort(compareCodeUnits),
);

const currentObservedIdentifierOccurrences = CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V2
  .reduce((total, observation) => total + observation.observedCount, 0);
if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V2.length !== 221
  || currentObservedIdentifierOccurrences !== 475) {
  throw new Error('CAP-2 v2 reconstructed source counts drifted from the audited checkout.');
}

const domainArtifacts = deepFreeze([
  coreJson,
  visualJson,
  mediaJson,
  directorJson,
  renderJson,
].map(parseCap2OwnerReconciliationArtifactV1));

export type Cap2CurrentTruthDomainV2 = (typeof CAP2_RECONCILIATION_DOMAINS_V1)[number];

export function getCap2CurrentTruthDomainEvidencePathsV2(
  domain: Cap2CurrentTruthDomainV2,
): readonly string[] {
  const artifact = domainArtifacts.find((candidate) => candidate.domain === domain);
  if (!artifact) throw new Error(`Missing CAP-2 domain evidence for ${domain}.`);
  return artifact.sourceBinding.evidencePaths;
}

const expectedDomainBindings = deepFreeze([
  {
    domain: 'CORE_PROJECT_TIMELINE_CHECKPOINT',
    evidencePathCount: 16,
    normalizedEvidenceHash: 'e2642bd3bb65cce5180c78fe889126926135a31316a1a1c665b7b7ae0b14a925',
    reissueStatus: 'RECONCILED_CURRENT_TRUTH_V2',
  },
  {
    domain: 'VISUAL_KEYFRAME_TRANSITION_CAPTION_RENDER',
    evidencePathCount: 27,
    normalizedEvidenceHash: 'c625e128abfa56210461f4f98cdaa98f15b93bacbcfc7167b3750a99a5889a3e',
    reissueStatus: 'RECONCILED_CURRENT_TRUTH_V2',
  },
  {
    domain: 'MEDIA_AUDIO_MUSIC_SFX',
    evidencePathCount: 23,
    normalizedEvidenceHash: '5b2620647b0e015bfa1b002050e19a1a47e12cf619abf3b94cbe33a3c2b7a770',
    reissueStatus: 'HISTORICAL_V1_GATE_STILL_PASSES',
  },
  {
    domain: 'DIRECTOR_GENERATED_ANALYSIS_JOBS',
    evidencePathCount: 38,
    normalizedEvidenceHash: 'd78ef938916f428473f1eff2dad74ea7dc5f91c9b170a600c17df70d06e0f4ec',
    reissueStatus: 'HISTORICAL_V1_GATE_STILL_PASSES',
  },
  {
    domain: 'RENDER_PROOF_DELIVERY_API_WORKERS',
    evidencePathCount: 34,
    normalizedEvidenceHash: '28d132f7870f874ae9cdfa2399c6dfe5da86a4e4f1fd7f15388ac648af503508',
    reissueStatus: 'RECONCILED_CURRENT_TRUTH_V2',
  },
] as const);

const semanticDeltas = deepFreeze([
  {
    deltaId: 'source.thinkforge-session-editron-detach',
    domain: 'SOURCE_SURFACE',
    disposition: 'ROUTE_MEMBERSHIP_REMOVED',
    statement: 'ThinkForge session creation no longer creates or links an Editron project, so its POST route is not Editron-linked.',
    evidence: [{
      path: DETACHED_ROUTE_PATH,
      normalizedSha256: '764d9e87bd278a4704a0b2f79657daa3ad60d4655497fbb7afdbd8fa8f2de302',
    }],
    resolution: {
      status: 'CURRENT_TRUTH_RECONCILED',
      supersededV1Claims: [
        'The Editron-linked API observation includes POST /api/services/thinkforge/session.',
      ],
      currentClaims: [
        'The route remains a ThinkForge session owner and has no current Editron import, project or project-link dependency.',
        'The current Editron-linked route observation excludes this route and its evidence path.',
      ],
      remainingGaps: [],
    },
    catalogPromotion: false,
  },
  {
    deltaId: 'core.script-import-writer-receipt',
    domain: 'CORE_PROJECT_TIMELINE_CHECKPOINT',
    disposition: 'COMPOUND_WORKFLOW_IMPROVED_NO_ATOMIC_PROMOTION',
    statement: 'Script import now validates its production manifest and uses a writer receipt, but remains a compound credit/project/link workflow.',
    evidence: [
      {
        path: 'app/api/services/editron/projects/import-from-script/route.ts',
        normalizedSha256: '617acfd0b7f46d54663914fbcde55fc9209b96e9f54c805448ca864b27f48769',
      },
      {
        path: 'lib/editron/services/project-service.ts',
        normalizedSha256: '52eabbc9fb511f18e3fe6c915fdd3804da3e9a92bd9515ab150f77730b546b9c',
      },
      {
        path: 'lib/thinkforge/export/editron-production-manifest-contract.ts',
        normalizedSha256: '69349cf96e370d499bf952e464cfc8979a8e977c0dbb328ae2b8528fe082d680',
      },
    ],
    resolution: {
      status: 'CURRENT_TRUTH_RECONCILED',
      supersededV1Claims: [],
      currentClaims: [
        'The workflow validates the ThinkForge production manifest before project persistence.',
        'The manifest uses the shared ThinkForge production-output duration capability instead of a private one-day limit.',
        'Project state and import metadata are committed through one ProjectService writer receipt.',
        'The route remains a compound credit, project and project-link workflow rather than an atomic planner operation.',
      ],
      remainingGaps: [
        'Credit reservation, project mutation and project-link persistence do not share one compensation receipt.',
      ],
    },
    catalogPromotion: false,
  },
  {
    deltaId: 'core.timeline-cut-coordinate-output',
    domain: 'CORE_PROJECT_TIMELINE_CHECKPOINT',
    disposition: 'COORDINATE_OUTPUT_ADDED_LIVE_WRAPPER_STILL_UNSAFE',
    statement: 'The pure range cut now returns a coordinate transform and split-child identities, while the live whole-state writer remains excluded.',
    evidence: [
      {
        path: 'lib/editron/services/timeline-range-cut.ts',
        normalizedSha256: 'c88cb11f2f37e2ac227bdf44c94321d3e5074b6019aa34b7c5f98d0a53b82aa1',
      },
      {
        path: 'tests/editron/timeline-range-cut-coordinate-mapping.test.ts',
        normalizedSha256: '576656f51c8e2fc4524c02ca108dde031ecaeef3fab2a60c1e7b76aa6ee4ae53',
      },
    ],
    resolution: {
      status: 'CURRENT_TRUTH_RECONCILED',
      supersededV1Claims: [
        'The cut result does not expose its internal original-to-split-child mapping.',
        'A split-child identity map remains an unresolved dependency.',
      ],
      currentClaims: [
        'The pure cut returns a half-open timeline coordinate transform and explicit split-child identities.',
        'The live chat wrapper still persists a loaded whole-project snapshot without the caller read revision.',
      ],
      remainingGaps: [
        'Carry the caller-pinned expected revision through one canonical project mutation.',
        'Return changed paths plus reload and rendered proof from the live operation.',
      ],
    },
    catalogPromotion: false,
  },
  {
    deltaId: 'visual.camera-shake-position-anchor',
    domain: 'VISUAL_KEYFRAME_TRANSITION_CAPTION_RENDER',
    disposition: 'FORM_OWNER_CALIBRATED_NO_CERTIFICATION',
    statement: 'Camera shake now preserves the evaluated position baseline and resolves semantic form intents, but caller revision, rendered proof and policy satisfaction remain unresolved.',
    evidence: [
      {
        path: 'lib/editron/agent/chat-visual-tools.ts',
        normalizedSha256: '0f41688967f90d4db509a19fac913c835ac78479ca0f68078a1f8fec19caa05a',
      },
      {
        path: 'tests/editron/chat-edit-context.test.ts',
        normalizedSha256: 'ed071b731c38b379fde84a54e317a52753243ac35834cb98eaaafc4ef74ec150',
      },
      {
        path: 'lib/editron/data/creative-knowledge-graph.json',
        normalizedSha256: '76bab3e8eab0060b5378130874af68703005f105f7b20d3bea3593029582e6dc',
      },
    ],
    resolution: {
      status: 'CURRENT_TRUTH_RECONCILED',
      supersededV1Claims: [],
      currentClaims: [
        'Explicit position-track replacement evaluates the non-shake x/y baseline and returns to that baseline.',
        'The existing visual form owner maps subtle, restrained and pronounced impact intents to bounded concrete intensity and duration values.',
        'Explicit intensity and duration remain available outside the provider-native semantic-intent arm.',
        'The operation remains an uncertified atomic candidate with no proof owner.',
      ],
      remainingGaps: [
        'Bind planning to a caller-supplied expected revision and canonical receipt.',
        'Add rendered motion proof and reconcile the equivalent manual control.',
        'Enforce the camera-shake speech, formality, density and impact-sound policy before eligibility.',
      ],
    },
    catalogPromotion: false,
  },
] as const);

const domainBindingSchema = z.object({
  domain: z.enum(CAP2_RECONCILIATION_DOMAINS_V1),
  historicalArtifactHash: sha256,
  evidencePathCount: z.number().int().positive(),
  normalizedEvidenceHash: sha256,
  reissueStatus: z.enum(['RECONCILED_CURRENT_TRUTH_V2', 'HISTORICAL_V1_GATE_STILL_PASSES']),
}).strict();

const semanticDeltaSchema = z.object({
  deltaId: stableId,
  domain: z.enum(['SOURCE_SURFACE', ...CAP2_RECONCILIATION_DOMAINS_V1]),
  disposition: z.enum([
    'ROUTE_MEMBERSHIP_REMOVED',
    'COMPOUND_WORKFLOW_IMPROVED_NO_ATOMIC_PROMOTION',
    'COORDINATE_OUTPUT_ADDED_LIVE_WRAPPER_STILL_UNSAFE',
    'FORM_OWNER_CALIBRATED_NO_CERTIFICATION',
  ]),
  statement: nonEmptyString,
  evidence: z.array(z.object({ path: nonEmptyString, normalizedSha256: sha256 }).strict()).min(1),
  resolution: z.object({
    status: z.literal('CURRENT_TRUTH_RECONCILED'),
    supersededV1Claims: z.array(nonEmptyString),
    currentClaims: z.array(nonEmptyString).min(1),
    remainingGaps: z.array(nonEmptyString),
  }).strict(),
  catalogPromotion: z.literal(false),
}).strict();

export const cap2CurrentTruthReissueAuditSchemaV2 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV2'),
  schemaVersion: z.literal(2),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  baseFreezeBinding: z.object({
    manifestHash: z.literal(BASE_FREEZE_MANIFEST_HASH_V1),
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
    historicalRawSourceSnapshotHash: sha256,
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V2),
    normalizedSnapshotAlgorithm: z.literal(NORMALIZED_SNAPSHOT_ALGORITHM),
    normalizedSourceSnapshotHash: z.literal('e9cb86da35e37cea3e90b1876fdb5367f31ac9bd652cdf35f050e3366bc746f5'),
    sourceSnapshotPathCount: z.literal(221),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(475),
    workingTreeEvidenceStatus: z.literal('HASH_BOUND_UNCOMMITTED_PATHS_INCLUDED'),
    workingTreeEvidencePaths: z.tuple([
      z.literal('app/api/services/alyzitron/analyze/route.ts'),
      z.literal('app/api/services/alyzitron/processor/route.ts'),
      z.literal('lib/editron/agent/chat-visual-tools.ts'),
    ]),
    reconciliationStatus: z.literal('RECONCILED_CURRENT_TRUTH_V2'),
  }).strict(),
  catalogBinding: z.object({
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
    declaredOperationCount: z.literal(37),
    certifiedOperationCount: z.literal(0),
    productionEligibleOperationCount: z.literal(0),
  }).strict(),
  domainBindings: z.array(domainBindingSchema).length(5),
  semanticDeltas: z.array(semanticDeltaSchema).length(4),
  blockerIds: z.array(stableId).length(0),
  reissueGate: z.object({
    sourceSurfaceReconciled: z.literal(true),
    semanticDeltasReconciled: z.literal(true),
    catalogAuthorityUnchanged: z.literal(true),
    runtimeAuthorityDenied: z.literal(true),
  }).strict(),
  runtimeAuthority: z.object({
    plannerRegistryWired: z.literal(false),
    projectMutationAuthorized: z.literal(false),
    productionCertificationGranted: z.literal(false),
  }).strict(),
  manifestHash: sha256,
}).strict();

export type Cap2CurrentTruthReissueAuditV2 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV2
>;

const expectedBlockerIds: string[] = [];
const expectedBoundDomainBindings = deepFreeze(expectedDomainBindings.map((binding) => ({
  ...binding,
  historicalArtifactHash: CAP2_FROZEN_RECONCILIATION_HASHES_V1[binding.domain],
})));

export function parseCap2CurrentTruthReissueAuditV2(
  value: unknown,
): Cap2CurrentTruthReissueAuditV2 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV2.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v2 manifest hash drift.');
  }
  if (JSON.stringify(parsed.domainBindings.map(({ domain }) => domain))
    !== JSON.stringify(CAP2_RECONCILIATION_DOMAINS_V1)) {
    throw new Error('CAP-2 v2 domain order or coverage drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.domainBindings)
    !== hashCanonicalCap2ArtifactV1(expectedBoundDomainBindings)) {
    throw new Error('CAP-2 v2 domain binding drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDeltas)
    !== hashCanonicalCap2ArtifactV1(semanticDeltas)) {
    throw new Error('CAP-2 v2 semantic delta coverage drift.');
  }
  if (JSON.stringify(parsed.blockerIds) !== JSON.stringify(expectedBlockerIds)) {
    throw new Error('CAP-2 v2 blocker coverage drift.');
  }
  return parsed;
}

const actualBaseManifestHash = hashCanonicalCap2ArtifactV1(CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1);
if (actualBaseManifestHash !== BASE_FREEZE_MANIFEST_HASH_V1) {
  throw new Error('CAP-2 v1 base freeze changed beneath the v2 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV2' as const,
  schemaVersion: 2 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  baseFreezeBinding: {
    manifestHash: BASE_FREEZE_MANIFEST_HASH_V1,
    catalogHash: CAP2_FROZEN_CATALOG_HASH_V1,
    historicalRawSourceSnapshotHash: inventory.sourceBinding.sourceSnapshotHash,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V2,
    normalizedSnapshotAlgorithm: NORMALIZED_SNAPSHOT_ALGORITHM,
    normalizedSourceSnapshotHash: 'e9cb86da35e37cea3e90b1876fdb5367f31ac9bd652cdf35f050e3366bc746f5' as const,
    sourceSnapshotPathCount: 221 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 475 as const,
    workingTreeEvidenceStatus: 'HASH_BOUND_UNCOMMITTED_PATHS_INCLUDED' as const,
    workingTreeEvidencePaths: HASH_BOUND_UNCOMMITTED_EVIDENCE_PATHS_V2,
    reconciliationStatus: 'RECONCILED_CURRENT_TRUTH_V2' as const,
  },
  catalogBinding: {
    catalogHash: CAP2_FROZEN_CATALOG_HASH_V1,
    declaredOperationCount: 37 as const,
    certifiedOperationCount: 0 as const,
    productionEligibleOperationCount: 0 as const,
  },
  domainBindings: expectedBoundDomainBindings,
  semanticDeltas,
  blockerIds: expectedBlockerIds,
  reissueGate: {
    sourceSurfaceReconciled: true as const,
    semanticDeltasReconciled: true as const,
    catalogAuthorityUnchanged: true as const,
    runtimeAuthorityDenied: true as const,
  },
  runtimeAuthority: {
    plannerRegistryWired: false as const,
    projectMutationAuthorized: false as const,
    productionCertificationGranted: false as const,
  },
};

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV2({
    ...auditMaterial,
    manifestHash: hashCanonicalCap2ArtifactV1(auditMaterial),
  }),
);
