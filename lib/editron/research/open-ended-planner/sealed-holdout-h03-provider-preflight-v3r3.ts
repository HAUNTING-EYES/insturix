import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  estimateOfflineInputTokensUpperBoundV2,
  serializeGoogleCountTokensRequestV2,
  serializeProviderRequestV2,
  type ProviderRouteV2,
} from './provider-codecs-v2';
import {
  buildProviderNativeGeneratedSourceRouteV2R,
} from './provider-native-generated-source-adapter-v2r';
import {
  assertProviderNativeCohortManifestV2R,
  type ProviderNativeCohortManifestV2R,
  type ProviderNativeNoSpendPreflightReceiptV2R,
} from './provider-native-cohort-manifest-v2r';
import {
  assertSealedH03ProviderCohortManifestV3R3,
  SEALED_H03_PROVIDER_SOURCE_REQUEST_IDENTITY_V3R3,
  type SealedH03ProviderCohortManifestV3R3,
} from './sealed-holdout-h03-provider-cohort-v3r3';
import {
  buildSealedH03GeneratedCompositionModelPacketV3R,
} from './sealed-holdout-h03-model-candidate-v3r';
import type { HashedStagePacketV2 } from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;
type FetchV3R3 = typeof fetch;

export const SEALED_H03_PROVIDER_PREFLIGHT_VERSION_V3R3 =
  'EDITRON_OE_SEALED_H03_PROVIDER_PREFLIGHT_V3R3_1' as const;

export interface SealedH03ProviderSourceRequestV3R3 {
  apiImplementationHash: string;
  sourceAArtifactSha256: string;
  sourceBArtifactSha256: string;
  arguments: Readonly<JsonRecord>;
  orchestratorSpecSha256: string;
  ownerAuthorizationOutputSha256: string;
  packet: Readonly<HashedStagePacketV2>;
}

export async function runSealedH03ProviderNoInferencePreflightV3R3(input: {
  manifest: Readonly<SealedH03ProviderCohortManifestV3R3>;
  providerManifest: Readonly<ProviderNativeCohortManifestV2R>;
  providerInfrastructureReceipt: Readonly<ProviderNativeNoSpendPreflightReceiptV2R>;
  sourceRequest: Readonly<SealedH03ProviderSourceRequestV3R3>;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: FetchV3R3;
  nowUnixSeconds?: number;
}) {
  const manifest = assertSealedH03ProviderCohortManifestV3R3(input.manifest);
  const provider = assertProviderNativeCohortManifestV2R(input.providerManifest);
  assertProviderInfrastructure(
    provider,
    input.providerInfrastructureReceipt,
    input.nowUnixSeconds ?? Math.floor(Date.now() / 1000),
  );
  const routeManifest = record(manifest.providerRouteManifest);
  if (routeManifest.manifestSha256 !== provider.manifestSha256) {
    fail('SEALED_H03_PROVIDER_PREFLIGHT_ROUTE_MANIFEST_DRIFT');
  }
  const packet = assertSourceRequest(manifest, input.sourceRequest);
  const fetchImpl = input.fetchImpl ?? fetch;
  const checks: JsonRecord[] = [];
  let h03GoogleCountTokensPosts = 0;
  for (const routeEntry of provider.routes) {
    const direct = buildProviderNativeGeneratedSourceRouteV2R(routeEntry);
    if (direct.provider !== 'openai' && direct.provider !== 'google') {
      fail(`SEALED_H03_PROVIDER_PREFLIGHT_PROVIDER_UNSUPPORTED:${direct.provider}`);
    }
    const codecRoute: ProviderRouteV2 = {
      kind: direct.provider,
      apiKey: requiredKey(input.environment, direct.provider),
      model: direct.requestModel,
      modelSnapshot: direct.claimedBenchmarkIdentity,
      reasoningMode: direct.reasoningMode,
    };
    const request = await serializeProviderRequestV2({
      route: codecRoute,
      artifact: packet,
      attempt: 1,
      outputBudget: {
        visible: packet.packet.stageBudget.maxVisibleOutputTokens,
        reasoning: packet.packet.stageBudget.maxReasoningTokens,
      },
    });
    let boundedInputTokens: number;
    let countRequestHash: string | null = null;
    let tokenCountMethod: string;
    if (codecRoute.kind === 'google') {
      const countRequest = serializeGoogleCountTokensRequestV2({
        route: codecRoute,
        generationRequest: request,
      });
      const response = await fetchImpl(countRequest.endpoint, {
        method: 'POST',
        headers: countRequest.headers,
        body: JSON.stringify(countRequest.body),
      });
      if (!response.ok) fail(`SEALED_H03_PROVIDER_PREFLIGHT_COUNT_FAILED:${response.status}`);
      const body = await response.json() as { totalTokens?: unknown };
      if (!Number.isSafeInteger(body.totalTokens) || Number(body.totalTokens) < 0) {
        fail('SEALED_H03_PROVIDER_PREFLIGHT_COUNT_INVALID');
      }
      boundedInputTokens = Number(body.totalTokens);
      countRequestHash = countRequest.requestHash;
      tokenCountMethod = 'GOOGLE_OFFICIAL_COUNT_TOKENS';
      h03GoogleCountTokensPosts += 1;
    } else {
      boundedInputTokens = estimateOfflineInputTokensUpperBoundV2(request, 0);
      tokenCountMethod = 'OPENAI_OFFLINE_BYTE_UPPER_BOUND';
    }
    if (boundedInputTokens > packet.packet.stageBudget.maxInputTokens) {
      fail(`SEALED_H03_PROVIDER_PREFLIGHT_INPUT_BUDGET_EXCEEDED:${direct.routeId}`);
    }
    for (const arm of manifest.budgetArms) {
      const row = manifest.rows.find((candidate) => (
        candidate.routeId === direct.routeId && candidate.armId === arm.armId
      ));
      if (!row) fail(`SEALED_H03_PROVIDER_PREFLIGHT_ROW_MISSING:${direct.routeId}:${arm.armId}`);
      checks.push({
        routeId: direct.routeId,
        armId: arm.armId,
        sourcePacketSha256: packet.packetHash,
        generationRequestSha256: request.requestHash,
        promptSha256: request.promptHash,
        countRequestSha256: countRequestHash,
        tokenCountMethod,
        boundedInputTokens,
        maxInputTokens: packet.packet.stageBudget.maxInputTokens,
        maximumProviderHttpRequests: arm.maximumProviderHttpRequests,
        absoluteMaxRowSpendUsd: row.absoluteMaxRowSpendUsd,
      });
    }
  }
  if (checks.length !== 6 || h03GoogleCountTokensPosts !== 1) {
    fail('SEALED_H03_PROVIDER_PREFLIGHT_CHECK_SET_DRIFT');
  }
  const inheritedNetwork = input.providerInfrastructureReceipt.networkCalls;
  const material = {
    version: SEALED_H03_PROVIDER_PREFLIGHT_VERSION_V3R3,
    authority: 'RESEARCH_PREFLIGHT_NO_MODEL_INFERENCE_NO_PROJECT_MUTATION' as const,
    manifestSha256: manifest.manifestSha256,
    providerInfrastructureReceiptSha256:
      input.providerInfrastructureReceipt.receiptSha256,
    sourceRequest: {
      packetSha256: packet.packetHash,
      orchestratorArgumentsSha256: input.sourceRequest.orchestratorSpecSha256,
      ownerAuthorizationOutputSha256: input.sourceRequest.ownerAuthorizationOutputSha256,
      apiImplementationHash: input.sourceRequest.apiImplementationHash,
    },
    checks,
    plannedRowCount: manifest.rows.length,
    absoluteMaxSpendUsd: manifest.absoluteMaxSpendUsd,
    infrastructureAssessment: 'PASS' as const,
    dispatchAssessment: 'PASS_READY_FOR_EXPLICIT_SPEND_AUTHORIZATION' as const,
    networkCalls: {
      inheritedModelMetadataGets: inheritedNetwork.modelMetadataGets,
      inheritedGoogleCountTokensPosts: inheritedNetwork.googleCountTokensPosts,
      h03GoogleCountTokensPosts,
      inferenceCalls: 0 as const,
    },
    secretsPersisted: false as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function assertSourceRequest(
  manifest: Readonly<SealedH03ProviderCohortManifestV3R3>,
  request: Readonly<SealedH03ProviderSourceRequestV3R3>,
): Readonly<HashedStagePacketV2> {
  const identity = SEALED_H03_PROVIDER_SOURCE_REQUEST_IDENTITY_V3R3;
  const apiBinding = manifest.implementationBindings.find(({ path }) => (
    path.endsWith('/generated-composition-api-v1.tsx')
  ));
  if (request.apiImplementationHash !== apiBinding?.sha256
    || request.orchestratorSpecSha256 !== hashCanonicalJsonV1(request.arguments)
    || request.orchestratorSpecSha256 !== identity.orchestratorArgumentsSha256
    || request.ownerAuthorizationOutputSha256 !== identity.ownerAuthorizationOutputSha256
    || request.sourceAArtifactSha256 !== identity.sourceAArtifactSha256
    || request.sourceBArtifactSha256 !== identity.sourceBArtifactSha256) {
    fail('SEALED_H03_PROVIDER_PREFLIGHT_SOURCE_IDENTITY_DRIFT');
  }
  const rebuilt = buildSealedH03GeneratedCompositionModelPacketV3R({
    apiImplementationHash: request.apiImplementationHash,
    sourceAArtifactSha256: request.sourceAArtifactSha256,
    sourceBArtifactSha256: request.sourceBArtifactSha256,
    orchestratorArguments: request.arguments,
  });
  if (hashCanonicalJsonV1(rebuilt) !== hashCanonicalJsonV1(request.packet)) {
    fail('SEALED_H03_PROVIDER_PREFLIGHT_PACKET_DRIFT');
  }
  return rebuilt;
}

function assertProviderInfrastructure(
  provider: Readonly<ProviderNativeCohortManifestV2R>,
  receipt: Readonly<ProviderNativeNoSpendPreflightReceiptV2R>,
  nowUnixSeconds: number,
): void {
  const { receiptSha256, ...material } = receipt;
  if (receipt.manifestSha256 !== provider.manifestSha256
    || receipt.infrastructureAssessment !== 'PASS'
    || receipt.dispatchAssessment !== 'PASS_READY'
    || receipt.networkCalls.inferenceCalls !== 0
    || receipt.secretsPersisted !== false
    || receipt.stateEffects.length !== 0
    || receipt.sandboxCredential.expiresAtUnixSeconds
      < nowUnixSeconds + receipt.sandboxCredential.minimumRemainingSeconds
    || receiptSha256 !== hashCanonicalJsonV1(material)) {
    fail('SEALED_H03_PROVIDER_PREFLIGHT_INFRASTRUCTURE_RECEIPT_INVALID');
  }
}
function requiredKey(
  environment: Readonly<Record<string, string | undefined>>,
  provider: 'openai' | 'google',
): string {
  const value = provider === 'openai'
    ? environment.OPENAI_API_KEY
    : environment.GEMINI_API_KEY ?? environment.GOOGLE_API_KEY;
  if (!value?.trim()) fail(`SEALED_H03_PROVIDER_PREFLIGHT_KEY_MISSING:${provider}`);
  return value.trim();
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function fail(code: string): never { throw new Error(code); }
