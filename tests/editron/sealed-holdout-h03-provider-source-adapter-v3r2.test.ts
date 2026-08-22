import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildSealedH03GeneratedCompositionModelPacketV3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-model-candidate-v3r';
import { generateSealedH03ProviderSourceV3R2 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-source-adapter-v3r2';
import { SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-target-contract-v3r';

const SOURCE = 'export const GeneratedComposition = () => null;';

describe('sealed H03 metered provider-source adapter V3R2', () => {
  it('dispatches the exact owner-bound packet and returns provider lineage without mutation', async () => {
    const request = sourceRequest();
    const runProviderCall = vi.fn(async ({ artifact }: { artifact: typeof request.packet }) => {
      expect(artifact).toBe(request.packet);
      return acceptedCall();
    });
    const result = await generateSealedH03ProviderSourceV3R2({
      routeEntry: routeEntry(),
      environment: { OPENAI_API_KEY: 'test-key' },
      request,
      runProviderCall: runProviderCall as never,
    });
    expect(result).toMatchObject({
      source: SOURCE,
      modelId: 'gpt-5.6-terra-provider-snapshot',
      promptHash: 'b'.repeat(64),
      orchestratorSpecSha256: request.orchestratorSpecSha256,
      generationReceipt: {
        authority: 'RESEARCH_MODEL_GENERATED_SOURCE_NO_PROJECT_MUTATION',
        packetHash: request.packet.packetHash,
        stateEffects: [],
      },
    });
    expect(runProviderCall).toHaveBeenCalledTimes(1);
  });

  it('rejects route, orchestration and packet drift before provider dispatch', async () => {
    const runProviderCall = vi.fn();
    const baseRoute = sourceRequest();
    const wrongRoute = {
      ...baseRoute,
      route: { ...baseRoute.route, reasoningMode: 'high' as const },
    };
    await expect(call(wrongRoute, runProviderCall))
      .rejects.toThrow('SEALED_H03_PROVIDER_SOURCE_ROUTE_DRIFT');

    const wrongArguments = sourceRequest();
    wrongArguments.orchestratorSpecSha256 = 'f'.repeat(64);
    await expect(call(wrongArguments, runProviderCall))
      .rejects.toThrow('SEALED_H03_PROVIDER_SOURCE_ORCHESTRATOR_HASH_DRIFT');

    const wrongPacket = sourceRequest();
    wrongPacket.packet = { ...wrongPacket.packet, packetHash: 'e'.repeat(64) };
    await expect(call(wrongPacket, runProviderCall))
      .rejects.toThrow('SEALED_H03_PROVIDER_SOURCE_PACKET_DRIFT');
    expect(runProviderCall).not.toHaveBeenCalled();
  });

  it('requires repair presence to match candidate ordinal', async () => {
    const request = sourceRequest();
    request.candidateOrdinal = 1;
    const runProviderCall = vi.fn();
    await expect(call(request, runProviderCall))
      .rejects.toThrow('SEALED_H03_PROVIDER_SOURCE_PACKET_DRIFT');
    expect(runProviderCall).not.toHaveBeenCalled();
  });
});

function call(
  request: Parameters<typeof generateSealedH03ProviderSourceV3R2>[0]['request'],
  runProviderCall: ReturnType<typeof vi.fn>,
) {
  return generateSealedH03ProviderSourceV3R2({
    routeEntry: routeEntry(), environment: { OPENAI_API_KEY: 'test-key' },
    request, runProviderCall: runProviderCall as never,
  });
}

function sourceRequest() {
  const argumentsValue = generatedArguments();
  const packet = buildSealedH03GeneratedCompositionModelPacketV3R({
    apiImplementationHash: 'a'.repeat(64),
    sourceAArtifactSha256: `sha256:${'c'.repeat(64)}`,
    sourceBArtifactSha256: `sha256:${'d'.repeat(64)}`,
    orchestratorArguments: argumentsValue,
  });
  return {
    route: { ...routeEntry().route }, packet,
    arguments: argumentsValue,
    orchestratorSpecSha256: hashCanonicalJsonV1(argumentsValue),
    candidateOrdinal: 0 as 0 | 1,
  };
}

function routeEntry() {
  return {
    route: { routeId: 'OPENAI_TERRA' as const, provider: 'openai' as const, model: 'gpt-5.6-terra' as const, claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium' as const },
    transport: 'OPENAI_RESPONSES' as const,
    pricing: { inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.2, cacheWriteUsdPerMillion: 2.5, outputUsdPerMillion: 12 },
    priceSnapshotDate: '2026-08-20' as const,
    pricingSource: 'test',
  };
}

function acceptedCall() {
  return {
    run: {
      disposition: 'ARTIFACT_ACCEPTED',
      artifact: { source: SOURCE },
      attempts: [{ disposition: 'ARTIFACT_ACCEPTED', promptHash: 'b'.repeat(64), providerModel: 'gpt-5.6-terra-provider-snapshot' }],
    },
    preflightCounts: [],
  };
}

function generatedArguments() {
  return {
    projectId: 'oe-hold-03', expectedProjectRevision: 'R12',
    assetIds: ['h03-a', 'h03-b'],
    targetRange: { startFrame: 90, endFrame: 270 },
    referenceBlueprintId: SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R,
    layoutSpec: { panelCount: 6, geometry: 'ASYMMETRIC_NORMALIZED_BOUNDS', gutters: true, titleSafeBand: { left: 0.15, top: 0.43, width: 0.70, height: 0.14 } },
    motionSpec: { entryFrames: [0, 24], stableFrames: [24, 150], exitFrames: [150, 180], relationship: 'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE' },
    typographySpec: { text: 'EVENT\nMOMENT', alignment: 'CENTER', fontAssetId: 'font-noto-sans-v27-regular' },
    constraints: { referencePixelsForbidden: true, preserveOutsideRange: true, returnBinding: { overlayId: 'ov-full', assetId: 'h03-a', sourceFrame: 270 }, titleFaceOverlapMaximumPixels: 0 },
    evidenceIds: ['E1', 'E2', 'E3'],
  };
}
