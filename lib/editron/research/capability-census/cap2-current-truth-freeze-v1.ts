import { createHash } from 'node:crypto';
import { z } from 'zod';

import coreJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-core-timeline-v1.json';
import directorJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-director-generated-jobs-v1.json';
import mediaJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-media-audio-v1.json';
import renderJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-render-proof-delivery-v1.json';
import inventoryJson from '@/docs/editron/capability-census/editron-cap2-source-surface-inventory-v1.json';
import visualJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-visual-v1.json';
import { CAP2_ATOMIC_OPERATION_CATALOG_V1 } from './cap2-atomic-operation-catalog-v1';
import {
  CAP2_RECONCILIATION_DOMAINS_V1,
  parseCap2OwnerReconciliationArtifactV1,
} from './cap2-owner-reconciliation-contract-v1';
import { parseCap2SourceSurfaceInventoryV1 } from './cap2-source-surface-contract-v1';

const nonEmptyString = z.string().trim().min(1);
const stableId = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

const CATALOG_DISPOSITIONS_V1 = [
  'ATOMIC_CANDIDATE',
  'WRAPPER_ONLY',
  'EXCLUDED_UNSAFE',
  'EXCLUDED_NON_CAPABILITY',
  'MISSING',
] as const;

export const CAP2_FROZEN_CATALOG_HASH_V1 =
  '243f079e74bf26ca226699419fd54e45f5fdcacd323e1ba0f095f6f52996e680';

export const CAP2_FROZEN_RECONCILIATION_HASHES_V1 = {
  CORE_PROJECT_TIMELINE_CHECKPOINT: '50d040811e42010dec80b71e6a9514a267da846a0e2387e1a99270ac087fe868',
  VISUAL_KEYFRAME_TRANSITION_CAPTION_RENDER: '2db0316702e7a319ee35351c586954d8c3574f545a8bac3d38d33658aeab49d0',
  MEDIA_AUDIO_MUSIC_SFX: '936875d6366f3f63619347fd6722dd81b424f8fa1a1d5d9bc7f8f277885f5d2f',
  DIRECTOR_GENERATED_ANALYSIS_JOBS: 'f5b56f4ca24fd88fc3dc59a5436094ffd7f024e39f992d3a7b9d04adeb240c88',
  RENDER_PROOF_DELIVERY_API_WORKERS: 'b653580cd3f8027521e08c9dee3ddef0a40f95f4afe1dde2cb8d40c8ea22d9ca',
} as const;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('CAP-2 canonical JSON rejects non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => compareCodeUnits(left, right));
    return `{${entries.map(([key, entryValue]) => (
      `${JSON.stringify(key)}:${canonicalizeJson(entryValue)}`
    )).join(',')}}`;
  }
  throw new Error(`CAP-2 canonical JSON rejects ${typeof value}.`);
}

export function hashCanonicalCap2ArtifactV1(value: unknown): string {
  return createHash('sha256').update(canonicalizeJson(value), 'utf8').digest('hex');
}

const inventory = parseCap2SourceSurfaceInventoryV1(inventoryJson);
const reconciliationInputs = [
  {
    artifactPath: 'docs/editron/capability-census/editron-cap2-owner-reconciliation-core-timeline-v1.json',
    json: coreJson,
  },
  {
    artifactPath: 'docs/editron/capability-census/editron-cap2-owner-reconciliation-visual-v1.json',
    json: visualJson,
  },
  {
    artifactPath: 'docs/editron/capability-census/editron-cap2-owner-reconciliation-media-audio-v1.json',
    json: mediaJson,
  },
  {
    artifactPath: 'docs/editron/capability-census/editron-cap2-owner-reconciliation-director-generated-jobs-v1.json',
    json: directorJson,
  },
  {
    artifactPath: 'docs/editron/capability-census/editron-cap2-owner-reconciliation-render-proof-delivery-v1.json',
    json: renderJson,
  },
].map((input) => ({ ...input, artifact: parseCap2OwnerReconciliationArtifactV1(input.json) }));

for (const input of reconciliationInputs) {
  const actual = hashCanonicalCap2ArtifactV1(input.json);
  const expected = CAP2_FROZEN_RECONCILIATION_HASHES_V1[input.artifact.domain];
  if (actual !== expected) {
    throw new Error(`CAP-2 reconciliation drift: ${input.artifact.domain}; expected ${expected}, received ${actual}.`);
  }
}

const actualCatalogHash = hashCanonicalCap2ArtifactV1(CAP2_ATOMIC_OPERATION_CATALOG_V1);
if (actualCatalogHash !== CAP2_FROZEN_CATALOG_HASH_V1) {
  throw new Error(`CAP-2 catalog drift: expected ${CAP2_FROZEN_CATALOG_HASH_V1}, received ${actualCatalogHash}.`);
}

const candidates = reconciliationInputs.flatMap(({ artifact }) => artifact.candidates);
const candidateIds = candidates.map(({ candidateId }) => candidateId);
if (new Set(candidateIds).size !== candidateIds.length) {
  throw new Error('CAP-2 reconciliation artifacts contain duplicate candidate IDs.');
}

const sourceObservationBindings = inventory.observations.map((observation) => {
  const matches = candidates.filter(({ sourceObservationIds }) => (
    sourceObservationIds.includes(observation.sourceId)
  ));
  if (matches.length === 0) throw new Error(`Unreconciled CAP-2 source observation ${observation.sourceId}.`);
  return {
    sourceId: observation.sourceId,
    observedCount: observation.observedCount,
    candidateIds: matches.map(({ candidateId }) => candidateId).sort(compareCodeUnits),
    dispositions: [...new Set(matches.map(({ catalogDisposition }) => catalogDisposition))]
      .sort(compareCodeUnits),
  };
});

const mutators = CAP2_ATOMIC_OPERATION_CATALOG_V1.operations.filter(({ kind }) => kind === 'MUTATE');
const mutatorsMissingContract = mutators.filter((operation) => (
  !operation.owners.mutationOwner
  || !operation.owners.persistenceOwner
  || operation.execution.mutationPath.length === 0
  || operation.execution.revisionSemantics === 'NONE'
  || operation.effects.writes.length === 0
));
const mutatorsWithoutFinalConsumer = mutators.filter(({ owners }) => owners.finalConsumers.length === 0);
const mutatorsWithoutProofObligation = mutators.filter(
  ({ verification }) => verification.proofObligations.length === 0,
);
const mutatorsWithoutLiveProofOwnerIds = mutators
  .filter(({ owners }) => !owners.proofOwner)
  .map(({ operatorId }) => operatorId)
  .sort(compareCodeUnits);
const duplicatedOwnerOperatorIds = CAP2_ATOMIC_OPERATION_CATALOG_V1.operations
  .filter(({ owners }) => owners.ownerDisposition === 'DUPLICATED_UNRESOLVED')
  .map(({ operatorId }) => operatorId)
  .sort(compareCodeUnits);
const productionEligibleOperations = CAP2_ATOMIC_OPERATION_CATALOG_V1.operations
  .filter(({ support }) => support.plannerEligibility === 'PRODUCTION_ELIGIBLE');

const sourceObservationBindingSchema = z.object({
  sourceId: stableId,
  observedCount: z.number().int().nonnegative(),
  candidateIds: z.array(stableId).min(1),
  dispositions: z.array(z.enum(CATALOG_DISPOSITIONS_V1)).min(1),
}).strict();

const reconciliationBindingSchema = z.object({
  domain: z.enum(CAP2_RECONCILIATION_DOMAINS_V1),
  artifactPath: nonEmptyString,
  artifactHash: sha256,
  evidenceSnapshotHash: sha256,
  candidateCount: z.number().int().positive(),
  atomicCandidateCount: z.number().int().nonnegative(),
}).strict();

export const cap2CurrentTruthFreezeManifestSchemaV1 = z.object({
  artifactType: z.literal('EditronCapabilityCatalogFreezeManifestV1'),
  schemaVersion: z.literal(1),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('FROZEN_CURRENT_TRUTH_RESEARCH_ONLY'),
  sourceBinding: z.object({
    branch: nonEmptyString,
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    sourceSnapshotHash: sha256,
  }).strict(),
  catalogBinding: z.object({
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
    declaredOperationCount: z.literal(37),
    certifiedOperationCount: z.literal(0),
    productionEligibleOperationCount: z.literal(0),
  }).strict(),
  reconciliationBindings: z.array(reconciliationBindingSchema).length(5),
  sourceObservationBindings: z.array(sourceObservationBindingSchema).length(11),
  gateSummary: z.object({
    sourceObservationCoverage: z.literal('PASS'),
    atomicCatalogCoverage: z.literal('PASS'),
    mutatorContractDeclarations: z.literal('PASS'),
    finalConsumerAndProofObligationDeclarations: z.literal('PASS'),
    parityExclusion: z.literal('PASS'),
    driftBinding: z.literal('PASS'),
    liveProofOwnership: z.literal('GAP_RECORDED'),
    observedIdentifierOccurrences: z.number().int().nonnegative(),
    reconciledCandidateCount: z.number().int().positive(),
    atomicCandidateCount: z.literal(37),
    mutatorCount: z.literal(18),
    mutatorsWithoutLiveProofOwnerIds: z.array(stableId),
    duplicatedOwnerOperatorIds: z.array(stableId),
  }).strict(),
  runtimeAuthority: z.object({
    plannerRegistryWired: z.literal(false),
    projectMutationAuthorized: z.literal(false),
    productionCertificationGranted: z.literal(false),
  }).strict(),
}).strict().superRefine((manifest, context) => {
  const domains = manifest.reconciliationBindings.map(({ domain }) => domain);
  if (JSON.stringify(domains) !== JSON.stringify(CAP2_RECONCILIATION_DOMAINS_V1)) {
    context.addIssue({ code: 'custom', path: ['reconciliationBindings'], message: 'all domains must appear in canonical order' });
  }
  for (const binding of manifest.reconciliationBindings) {
    if (binding.artifactHash !== CAP2_FROZEN_RECONCILIATION_HASHES_V1[binding.domain]) {
      context.addIssue({ code: 'custom', path: ['reconciliationBindings'], message: `artifact hash drift for ${binding.domain}` });
    }
  }
  const sourceIds = manifest.sourceObservationBindings.map(({ sourceId }) => sourceId);
  const expectedSourceIds = inventory.observations.map(({ sourceId }) => sourceId);
  if (JSON.stringify(sourceIds) !== JSON.stringify(expectedSourceIds)) {
    context.addIssue({ code: 'custom', path: ['sourceObservationBindings'], message: 'source observation coverage drift' });
  }
  if (manifest.gateSummary.reconciledCandidateCount !== candidates.length
    || manifest.gateSummary.observedIdentifierOccurrences !== inventory.observations
      .reduce((total, observation) => total + observation.observedCount, 0)) {
    context.addIssue({ code: 'custom', path: ['gateSummary'], message: 'derived census counts do not match frozen evidence' });
  }
  if (JSON.stringify(manifest.gateSummary.mutatorsWithoutLiveProofOwnerIds)
      !== JSON.stringify(mutatorsWithoutLiveProofOwnerIds)
    || JSON.stringify(manifest.gateSummary.duplicatedOwnerOperatorIds)
      !== JSON.stringify(duplicatedOwnerOperatorIds)) {
    context.addIssue({ code: 'custom', path: ['gateSummary'], message: 'recorded runtime gaps do not match catalog truth' });
  }
});

export type Cap2CurrentTruthFreezeManifestV1 = z.infer<
  typeof cap2CurrentTruthFreezeManifestSchemaV1
>;

export function parseCap2CurrentTruthFreezeManifestV1(
  value: unknown,
): Cap2CurrentTruthFreezeManifestV1 {
  return cap2CurrentTruthFreezeManifestSchemaV1.parse(value);
}

if (mutatorsMissingContract.length > 0
  || mutatorsWithoutFinalConsumer.length > 0
  || mutatorsWithoutProofObligation.length > 0
  || productionEligibleOperations.length > 0) {
  throw new Error('CAP-2 freeze gates failed: unsafe or falsely eligible mutation record.');
}

export const CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1 = parseCap2CurrentTruthFreezeManifestV1({
  artifactType: 'EditronCapabilityCatalogFreezeManifestV1',
  schemaVersion: 1,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION',
  status: 'FROZEN_CURRENT_TRUTH_RESEARCH_ONLY',
  sourceBinding: {
    branch: inventory.sourceBinding.branch,
    commit: inventory.sourceBinding.commit,
    sourceSnapshotHash: inventory.sourceBinding.sourceSnapshotHash,
  },
  catalogBinding: {
    catalogHash: CAP2_FROZEN_CATALOG_HASH_V1,
    declaredOperationCount: CAP2_ATOMIC_OPERATION_CATALOG_V1.declaredOperationCount,
    certifiedOperationCount: CAP2_ATOMIC_OPERATION_CATALOG_V1.operations
      .filter(({ support }) => support.certificationStatus === 'CERTIFIED').length,
    productionEligibleOperationCount: productionEligibleOperations.length,
  },
  reconciliationBindings: reconciliationInputs.map(({ artifactPath, json, artifact }) => ({
    domain: artifact.domain,
    artifactPath,
    artifactHash: hashCanonicalCap2ArtifactV1(json),
    evidenceSnapshotHash: artifact.sourceBinding.evidenceSnapshotHash,
    candidateCount: artifact.candidateCount,
    atomicCandidateCount: artifact.candidates
      .filter(({ catalogDisposition }) => catalogDisposition === 'ATOMIC_CANDIDATE').length,
  })),
  sourceObservationBindings,
  gateSummary: {
    sourceObservationCoverage: 'PASS',
    atomicCatalogCoverage: 'PASS',
    mutatorContractDeclarations: 'PASS',
    finalConsumerAndProofObligationDeclarations: 'PASS',
    parityExclusion: 'PASS',
    driftBinding: 'PASS',
    liveProofOwnership: 'GAP_RECORDED',
    observedIdentifierOccurrences: inventory.observations
      .reduce((total, observation) => total + observation.observedCount, 0),
    reconciledCandidateCount: candidates.length,
    atomicCandidateCount: CAP2_ATOMIC_OPERATION_CATALOG_V1.declaredOperationCount,
    mutatorCount: mutators.length,
    mutatorsWithoutLiveProofOwnerIds,
    duplicatedOwnerOperatorIds,
  },
  runtimeAuthority: {
    plannerRegistryWired: false,
    projectMutationAuthorized: false,
    productionCertificationGranted: false,
  },
});
