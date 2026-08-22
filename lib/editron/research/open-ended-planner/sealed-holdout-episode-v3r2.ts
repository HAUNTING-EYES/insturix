import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  isProviderNativeProofGateEligibleV2R,
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeReceiptV2R,
  type ProviderNativeInvokeResponseV2R,
} from './provider-native-tool-episode-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import type { ProviderNativeArgumentHandoffModeV2R }
  from './provider-native-result-references-v2r';
import { buildProviderNativeToolSetFromCatalogV2R }
  from './provider-native-tool-catalog-v2r';
import {
  SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
  SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R,
  sealedHoldoutOperatorCatalogIdentityV3R,
} from './sealed-holdout-catalog-v3r';
import {
  assertSealedHoldoutCohortManifestV3R2,
  type SealedHoldoutCohortManifestV3R2,
} from './sealed-holdout-cohort-v3r2';
import {
  buildSealedHoldoutEpisodeContextFromManifestV2R,
  SEALED_HOLDOUT_FINISH_SCHEMA_V2R,
} from './sealed-holdout-episode-v2r';
import {
  executeSealedH03ModelSourceV3R2,
  type SealedH03AcceptedSourceV3R2,
  type SealedH03SourceGeneratorV3R2,
} from './sealed-holdout-h03-source-executor-v3r2';
import { SealedHoldoutOwnerSessionV2R }
  from './sealed-holdout-owner-session-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_EPISODE_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_EPISODE_V3R_2' as const;

export interface SealedH03ConnectedEpisodeReceiptV3R2 {
  version: typeof SEALED_HOLDOUT_EPISODE_VERSION_V3R2;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  ownerSnapshot: Readonly<JsonRecord>;
  generatedCandidate: Readonly<SealedH03AcceptedSourceV3R2> | null;
  disposition: 'SOURCE_CONTRACT_READY_FOR_RENDERED_PROOF' | 'NOT_READY';
  stateEffects: readonly [];
  receiptSha256: string;
}

/**
 * The existing owner authorizes evidence, assets and range first. This connector
 * can then synthesize a source bundle, but it never gains project/timeline authority.
 */
export async function runSealedHoldoutH03ConnectedEpisodeV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: 'HOLD-03:C1' | 'HOLD-03:C2';
  route: Readonly<ProviderNativeRouteV2R>;
  apiImplementationHash: string;
  argumentHandoffMode?: ProviderNativeArgumentHandoffModeV2R;
  operatorPresentationOrder?: readonly string[];
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>)
    => Promise<ProviderNativeInvokeResponseV2R>;
  generateSource: SealedH03SourceGeneratorV3R2;
}): Promise<Readonly<SealedH03ConnectedEpisodeReceiptV3R2>> {
  const manifest = assertSealedHoldoutCohortManifestV3R2(input.manifest);
  const expected = strings(record(manifest.sharedModelContext).callableOperatorIds);
  const operatorOrder = input.operatorPresentationOrder ?? expected;
  if (!sameSet(operatorOrder, expected)) {
    throw new Error('SEALED_HOLDOUT_V3R2_EPISODE_OPERATOR_SET_DRIFT');
  }
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  const publicCase = record(taskCase?.publicCase);
  if (publicCase.taskId !== 'HOLD-03') throw new Error('SEALED_H03_CONNECTED_CASE_INVALID');
  const project = record(publicCase.project);
  const expectedRevision = String(project.expectedProjectRevision ?? '');
  const mediaHashes = sourceHashes(publicCase);
  const owner = new SealedHoldoutOwnerSessionV2R({
    manifest,
    caseId: input.caseId,
    semanticPolicy: SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R,
    manifestValidator: assertSealedHoldoutCohortManifestV3R2,
  });
  let generatedCandidate: Readonly<SealedH03AcceptedSourceV3R2> | null = null;
  let generatedOperationSeen = false;
  const catalogIdentity = sealedHoldoutOperatorCatalogIdentityV3R();
  const providerEpisode = await runProviderNativeToolEpisodeV2R({
    route: input.route,
    context: buildSealedHoldoutEpisodeContextFromManifestV2R({
      manifest,
      caseId: input.caseId,
      episodeVersion: SEALED_HOLDOUT_EPISODE_VERSION_V3R2,
    }),
    eligibleOperatorIds: operatorOrder,
    argumentHandoffMode: input.argumentHandoffMode,
    finishInputSchema: SEALED_HOLDOUT_FINISH_SCHEMA_V2R,
    toolSetFactory: ({ eligibleOperatorIds, finishInputSchema }) => (
      buildProviderNativeToolSetFromCatalogV2R({
        eligibleOperatorIds,
        finishInputSchema,
        catalog: SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
        catalogIdentity: {
          version: String(catalogIdentity.version),
          catalogSha256: String(catalogIdentity.catalogSha256),
        },
      })
    ),
    additionalInstructions: [
      'All forty planning records are represented: callable operations are tools; unavailable records are context-only and must never be fabricated as calls.',
      'Use only evidence returned by owner tools; do not infer hidden ranges, handles, fields, or evaluator expectations.',
      'The opaque C1/C2 label carries no semantic meaning. Base every choice on the request and returned tool evidence.',
      'Generated source compilation is system-owned. Select generated_composition_program only when justified; never emit or claim source code yourself.',
    ],
    invoke: input.invoke,
    executeIsolated: async (call) => {
      const ownerExecution = await owner.execute(call);
      if (call.operatorId !== 'generated_composition_program'
        || ownerExecution.disposition !== 'OK') return ownerExecution;
      if (generatedOperationSeen) return duplicateGenerationFailure();
      generatedOperationSeen = true;
      const generated = await executeSealedH03ModelSourceV3R2({
        route: input.route,
        apiImplementationHash: input.apiImplementationHash,
        arguments: call.arguments,
        ...mediaHashes,
        ownerAuthorizationOutputSha256: hashCanonicalJsonV1(ownerExecution.output),
        generateSource: input.generateSource,
      });
      generatedCandidate = generated.accepted;
      return generated.execution;
    },
  });
  const ownerSnapshot = owner.snapshot();
  const ready = Boolean(generatedCandidate)
    && isProviderNativeProofGateEligibleV2R(providerEpisode.terminal.disposition)
    && record(ownerSnapshot).currentProjectRevision === expectedRevision
    && Array.isArray(record(ownerSnapshot).stateEffects)
    && (record(ownerSnapshot).stateEffects as unknown[]).length === 0;
  const material = {
    version: SEALED_HOLDOUT_EPISODE_VERSION_V3R2,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    providerEpisode,
    ownerSnapshot,
    generatedCandidate,
    disposition: ready
      ? 'SOURCE_CONTRACT_READY_FOR_RENDERED_PROOF' as const
      : 'NOT_READY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function sourceHashes(publicCase: Readonly<JsonRecord>): Readonly<{
  sourceAArtifactSha256: string;
  sourceBArtifactSha256: string;
}> {
  const media = records(publicCase.media);
  const sourceAArtifactSha256 = String(
    media.find(({ assetId }) => assetId === 'h03-a')?.artifactSha256 ?? '',
  );
  const sourceBArtifactSha256 = String(
    media.find(({ assetId }) => assetId === 'h03-b')?.artifactSha256 ?? '',
  );
  if (!isArtifactSha(sourceAArtifactSha256) || !isArtifactSha(sourceBArtifactSha256)) {
    throw new Error('SEALED_H03_SOURCE_MEDIA_IDENTITY_INVALID');
  }
  return { sourceAArtifactSha256, sourceBArtifactSha256 };
}

function duplicateGenerationFailure() {
  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'FAIL' as const,
    output: {
      code: 'SEALED_H03_GENERATED_OPERATION_ALREADY_EXECUTED',
      message: 'SEALED_H03_GENERATED_OPERATION_ALREADY_EXECUTED',
      details: {},
    },
    evidenceIds: [] as const,
  });
}
function isArtifactSha(value: string): boolean { return /^sha256:[a-f0-9]{64}$/.test(value); }
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Object.keys(record(entry)).length > 0)
    : [];
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
