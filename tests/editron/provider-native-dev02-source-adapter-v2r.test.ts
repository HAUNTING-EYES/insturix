import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { generateProviderNativeDev02SourceV2R } from '@/lib/editron/research/open-ended-planner/provider-native-dev02-source-adapter-v2r';

const args = { projectId: 'oe-dev-02', expectedProjectRevision: 'R3', layoutSpec: { columns: 3 } };

describe('provider-native DEV-02 source adapter V2R', () => {
  it('hash-binds orchestrator arguments into an accepted specialist source call', async () => {
    const runProviderCall = vi.fn(async ({ artifact }: { artifact: { packet: { modelInput: Record<string, unknown> } } }) => {
      expect(artifact.packet.modelInput.orchestratorOperationRequest).toMatchObject({
        arguments: args, argumentsSha256: hashCanonicalJsonV1(args),
      });
      return acceptedCall();
    });
    const result = await generateProviderNativeDev02SourceV2R({
      routeEntry: routeEntry(), environment: { OPENAI_API_KEY: 'test-key' },
      apiImplementationHash: 'a'.repeat(64),
      request: { arguments: args, orchestratorSpecSha256: hashCanonicalJsonV1(args), candidateOrdinal: 0 },
      runProviderCall: runProviderCall as never,
    });
    expect(result).toMatchObject({
      source: 'export const GeneratedComposition = () => null;',
      modelId: 'gpt-5.6-terra', promptHash: 'b'.repeat(64),
      orchestratorSpecSha256: hashCanonicalJsonV1(args),
    });
    expect(runProviderCall).toHaveBeenCalledTimes(1);
  });

  it('rejects orchestration hash drift before provider dispatch', async () => {
    const runProviderCall = vi.fn();
    await expect(generateProviderNativeDev02SourceV2R({
      routeEntry: routeEntry(), environment: { OPENAI_API_KEY: 'test-key' },
      apiImplementationHash: 'a'.repeat(64),
      request: { arguments: args, orchestratorSpecSha256: 'f'.repeat(64), candidateOrdinal: 0 },
      runProviderCall: runProviderCall as never,
    })).rejects.toThrow('PROVIDER_NATIVE_DEV02_ORCHESTRATOR_SPEC_HASH_DRIFT');
    expect(runProviderCall).not.toHaveBeenCalled();
  });
});

function routeEntry() {
  return {
    route: { routeId: 'OPENAI_TERRA' as const, provider: 'openai' as const, model: 'gpt-5.6-terra' as const, claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium' as const },
    transport: 'OPENAI_RESPONSES' as const,
    pricing: { inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.2, cacheWriteUsdPerMillion: 2.5, outputUsdPerMillion: 12 },
    priceSnapshotDate: '2026-08-20' as const, pricingSource: 'test',
  };
}

function acceptedCall() {
  return {
    run: {
      disposition: 'ARTIFACT_ACCEPTED',
      artifact: { source: 'export const GeneratedComposition = () => null;' },
      attempts: [{ disposition: 'ARTIFACT_ACCEPTED', promptHash: 'b'.repeat(64), providerModel: 'gpt-5.6-terra' }],
    },
    preflightCounts: [],
  };
}
