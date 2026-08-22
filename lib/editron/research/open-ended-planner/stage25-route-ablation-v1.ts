import canonicalBlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { DEV02_LOWERING_POLICY_V2R } from './dev02-lowering-policy-v2r';
import { buildPlannerOwnershipStageTwoPacketV2R } from './planner-ownership-stage2-packet-v2r';
import {
  assertNoEvaluatorLeakV2,
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
  type HashedStagePacketV2,
} from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

export const STAGE25_ROUTE_ABLATION_VERSION_V1 =
  'EDITRON_OE_STAGE25_ROUTE_ABLATION_V1_1' as const;

export const STAGE25_ROUTE_ABLATION_ARMS_V1 = [
  'FREE_CHOICE',
  'FORCED_NATIVE',
  'FORCED_GENERATED_COMPOSITION',
  'FORCED_HYBRID',
] as const;

export type Stage25RouteAblationArmV1 =
  typeof STAGE25_ROUTE_ABLATION_ARMS_V1[number];
export type Stage25RouteAblationScopeIdV1 =
  | 'DEV02_BOUNDED_FILMSTRIP_ISLAND'
  | 'DEV02_FULL_REQUESTED_SECTION';

export interface Stage25RouteAblationFairnessBindingV1 {
  sourceStageOnePacketHash: string;
  canonicalBlueprintHash: string;
  targetMaterialHash: string;
  operatorCatalogHash: string;
  capabilityDossierHash: string;
  plannerOwnershipHash: string;
}

export interface Stage25RouteAblationPacketV1 {
  scopeId: Stage25RouteAblationScopeIdV1;
  arm: Stage25RouteAblationArmV1;
  artifact: HashedStagePacketV2;
  fairnessBinding: Readonly<Stage25RouteAblationFairnessBindingV1>;
}

const blueprint = canonicalBlueprintJson as unknown as JsonRecord;
const ALL_TARGET_CLAIM_IDS = records(blueprint.targetClaims).map((claim) => text(claim.claimId));
const ISLAND_TARGET_CLAIM_IDS = ALL_TARGET_CLAIM_IDS.filter(
  (claimId) => claimId !== 'claim-user-exit-continuity',
);

const SCOPE_TARGETS: Readonly<Record<Stage25RouteAblationScopeIdV1, readonly string[]>> =
  deepFreezeV1({
    DEV02_BOUNDED_FILMSTRIP_ISLAND: ISLAND_TARGET_CLAIM_IDS,
    DEV02_FULL_REQUESTED_SECTION: ALL_TARGET_CLAIM_IDS,
  });

const ROUTE_ABLATION_INSTRUCTIONS = [
  'modelInput.routeAblationScope is normative: cover exactly its target claims and do not silently widen or weaken that scope.',
  'A forced arm is a research comparison constraint, not production certification. Preserve every catalog support, compiler, owner, policy and proof limitation truthfully.',
  'Do not route by operation count, node count, or a more-than-N-steps shortcut. Route from target coverage, representability, owners, editability, evidence, proof and current eligibility.',
  'The free-choice preferred route and hidden evaluator policy are intentionally absent. Infer a route from the supplied target and complete capability records only.',
] as const;

export function buildStage25RouteAblationPacketV1(input: {
  scopeId: Stage25RouteAblationScopeIdV1;
  arm: Stage25RouteAblationArmV1;
}): Readonly<Stage25RouteAblationPacketV1> {
  const targetClaimIds = SCOPE_TARGETS[input.scopeId];
  if (!targetClaimIds?.length) throw new Error(`STAGE25_ROUTE_SCOPE_UNKNOWN:${input.scopeId}`);
  const stageOne = buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE');
  const base = buildPlannerOwnershipStageTwoPacketV2R({
    previousPacket: stageOne,
    executionFormArm: input.arm,
    priorArtifact: blueprint as { artifactType: string; taskId: string; [key: string]: unknown },
    loweringPolicy: DEV02_LOWERING_POLICY_V2R,
  });
  const targetClaims = records(blueprint.targetClaims)
    .filter((claim) => targetClaimIds.includes(text(claim.claimId)));
  const modelInput = base.packet.modelInput;
  const fairnessBinding = deepFreezeV1({
    sourceStageOnePacketHash: stageOne.packetHash,
    canonicalBlueprintHash: hashCanonicalJsonV1(blueprint),
    targetMaterialHash: hashCanonicalJsonV1(targetClaims),
    operatorCatalogHash: hashCanonicalJsonV1(modelInput.operatorCatalog),
    capabilityDossierHash: hashCanonicalJsonV1(modelInput.capabilityDossier),
    plannerOwnershipHash: hashCanonicalJsonV1(modelInput.plannerInputOwnership),
  });
  const packet = deepFreezeV1({
    ...base.packet,
    instructions: [...base.packet.instructions, ...ROUTE_ABLATION_INSTRUCTIONS],
    modelInput: {
      ...modelInput,
      routeAblationScope: {
        contractVersion: STAGE25_ROUTE_ABLATION_VERSION_V1,
        authority: 'RESEARCH_ONLY_ROUTE_COMPARISON_NO_PROJECT_AUTHORITY',
        scopeId: input.scopeId,
        arm: input.arm,
        targetClaimIds,
        targetMaterialHash: fairnessBinding.targetMaterialHash,
        forcedArmIsNotProductionCertification: true,
        honestCapabilityGapAllowed: true,
        operationCountRoutingForbidden: true,
      },
      routeAblationFairnessBinding: fairnessBinding,
    },
  });
  assertNoEvaluatorLeakV2(packet);
  const transportAttachments = deepFreezeV1([...base.transportAttachments]);
  const artifact = deepFreezeV1({
    packet,
    packetHash: hashCanonicalJsonV1(packet),
    transportAttachments,
    transportHash: hashCanonicalJsonV1(transportAttachments),
  });
  return deepFreezeV1({ scopeId: input.scopeId, arm: input.arm, artifact, fairnessBinding });
}

export function buildStage25RouteAblationProviderManifestV1(): Readonly<{
  version: typeof STAGE25_ROUTE_ABLATION_VERSION_V1;
  authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION';
  rows: readonly Readonly<Stage25RouteAblationPacketV1>[];
  manifestSha256: string;
}> {
  const scopeIds: Stage25RouteAblationScopeIdV1[] = [
    'DEV02_BOUNDED_FILMSTRIP_ISLAND',
    'DEV02_FULL_REQUESTED_SECTION',
  ];
  const rows = scopeIds.flatMap((scopeId) => STAGE25_ROUTE_ABLATION_ARMS_V1
    .map((arm) => buildStage25RouteAblationPacketV1({ scopeId, arm })));
  assertFairnessWithinScopes(rows);
  const material = {
    version: STAGE25_ROUTE_ABLATION_VERSION_V1,
    authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION' as const,
    rows,
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function stage25RouteAblationTargetClaimIdsV1(
  scopeId: Stage25RouteAblationScopeIdV1,
): readonly string[] {
  return SCOPE_TARGETS[scopeId];
}

function assertFairnessWithinScopes(rows: readonly Readonly<Stage25RouteAblationPacketV1>[]): void {
  for (const scopeId of new Set(rows.map((row) => row.scopeId))) {
    const scopeRows = rows.filter((row) => row.scopeId === scopeId);
    if (scopeRows.length !== STAGE25_ROUTE_ABLATION_ARMS_V1.length) {
      throw new Error(`STAGE25_ROUTE_ARM_SET_INCOMPLETE:${scopeId}`);
    }
    const fairnessHashes = new Set(scopeRows.map((row) => hashCanonicalJsonV1(row.fairnessBinding)));
    if (fairnessHashes.size !== 1) throw new Error(`STAGE25_ROUTE_FAIRNESS_DRIFT:${scopeId}`);
  }
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
