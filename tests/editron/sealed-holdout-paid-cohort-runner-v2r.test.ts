import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import {
  runSealedHoldoutPaidCohortV2R,
  sealedHoldoutPaidRowArtifactNameV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-paid-cohort-runner-v2r';
import {
  SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R,
  issueSealedHoldoutPaidDispatchAuthorizationV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-paid-dispatch-authorization-v2r';
import {
  preflightSealedHoldoutCredentialsV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-credential-preflight-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import { preflightSealedHoldoutCohortV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-preflight-v2r';
import type { SerializedProviderNativeTurnV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import type { ProviderNativeLiveTransportReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-live-transport-v2r';

const roots: string[] = [];
const environment = {
  OPENAI_API_KEY: 'test-openai-secret-never-persist',
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-secret-never-persist',
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('sealed holdout paid cohort runner V2R', () => {
  it('runs 96 bounded rows, resumes without calls, and rejects a tampered row', async () => {
    const root = await mkdtemp(join(tmpdir(), 'editron-sealed-paid-runner-'));
    roots.push(root);
    const mediaManifest = await materializeHoldoutMediaV2R(join(root, 'media'));
    const source = await readFile(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R);
    const manifest = buildSealedHoldoutCohortManifestV2R(
      createHash('sha256').update(source).digest('hex'),
    );
    const localPreflight = preflightSealedHoldoutCohortV2R({ manifest, mediaManifest });
    const credential = await preflightSealedHoldoutCredentialsV2R({
      manifest, localPreflight,
      authorization: {
        operatorId: 'test-operator', manifestSha256: manifest.manifestSha256,
        permittedNetworkActions: ['MODEL_METADATA_GET', 'GOOGLE_COUNT_TOKENS'],
        inferenceCalls: 0,
      },
      environment,
      fetchImpl: preflightFetch,
    });
    const approvedAt = '2026-08-22T00:00:00.000Z';
    const authorization = issueSealedHoldoutPaidDispatchAuthorizationV2R({
      manifest, credentialPreflight: credential.receipt,
      approval: {
        operatorId: 'test-operator', approvedAt,
        expiresAt: '2026-08-22T12:00:00.000Z',
        confirmedCredentialPreflightReceiptSha256: credential.receipt.receiptSha256,
        confirmedRequestCaptureSetSha256: credential.receipt.requestCaptureSetSha256,
        zeroInferenceGate: SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R,
        maxSpendMicroUsdPerRow: 6_000_000,
        absoluteMaxCohortSpendMicroUsd: 75_000_000,
      },
    });
    let providerCalls = 0;
    let proofCalls = 0;
    const transportFactory = () => {
      const calls: ProviderNativeLiveTransportReceiptV2R['calls'][number][] = [];
      return {
        invoke: async (request: Readonly<SerializedProviderNativeTurnV2R>) => {
          providerCalls += 1;
          calls.push({
            attempt: 1, requestHash: request.requestHash, provider: request.provider,
            endpoint: request.endpoint, responseStatus: 200,
            responseSha256: hashCanonicalJsonV1({ providerCalls }),
            returnedModelIdentity: typeof request.body.model === 'string'
              ? request.body.model : null,
            usage: usage(request.provider),
          });
          return finishResponse(request, providerCalls);
        },
        snapshot: () => {
          const material = {
            authority: 'RESEARCH_PROVIDER_TRANSPORT_NO_PROJECT_MUTATION' as const,
            calls, secretsPersisted: false as const,
          };
          return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
        },
      };
    };
    const runRoot = join(root, 'run');
    const common = {
      manifest, credentialPreflight: credential.receipt,
      paidAuthorization: authorization, mediaManifest, outputRoot: runRoot,
      implementationCommitSha: 'b'.repeat(40), runnerSourceSha256: 'a'.repeat(64),
      environment,
      dependencies: {
        fetchImpl: runtimeFetch,
        transportFactory,
        proofExecutor: async () => {
          proofCalls += 1;
          const material = { assessment: 'PASS_RESEARCH_TEST_PROOF', stateEffects: [] as const };
          return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
        },
        now: () => '2026-08-22T01:00:00.000Z',
        uniqueId: () => `proof-${proofCalls}`,
      },
    } as const;
    const first = await runSealedHoldoutPaidCohortV2R(common);
    expect(first.rowCount).toBe(96);
    expect(providerCalls).toBe(96);
    expect(first.providerInferenceCalls).toBe(96);
    expect(first.googleCountTokensCalls).toBe(32);
    expect(first.projectMutations).toBe(0);
    expect(first.spentNanoUsd).toBeLessThanOrEqual(75_000_000_000);

    const resumed = await runSealedHoldoutPaidCohortV2R(common);
    expect(resumed.receiptSha256).toBe(first.receiptSha256);
    expect(providerCalls).toBe(96);

    const cohortPath = join(runRoot, 'cohort-receipt.json');
    const forgedCohort = JSON.parse(await readFile(cohortPath, 'utf8')) as
      Record<string, unknown>;
    forgedCohort.spentNanoUsd = 0;
    const { receiptSha256: _oldReceiptSha256, ...forgedMaterial } = forgedCohort;
    forgedCohort.receiptSha256 = hashCanonicalJsonV1(forgedMaterial);
    await writeFile(cohortPath, `${JSON.stringify(forgedCohort, null, 2)}\n`, 'utf8');
    await expect(runSealedHoldoutPaidCohortV2R(common))
      .rejects.toThrow('SEALED_PAID_COHORT_RECEIPT_DRIFT');
    await writeFile(cohortPath, `${JSON.stringify(first, null, 2)}\n`, 'utf8');

    const firstRowPath = join(runRoot, 'rows', sealedHoldoutPaidRowArtifactNameV2R(
      String(first.rowSummaries[0].rowId),
    ));
    const tampered = JSON.parse(await readFile(firstRowPath, 'utf8')) as Record<string, unknown>;
    tampered.receiptSha256 = '0'.repeat(64);
    await writeFile(firstRowPath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
    await expect(runSealedHoldoutPaidCohortV2R(common))
      .rejects.toThrow('SEALED_PAID_ROW_RECEIPT_DRIFT');
  }, 300_000);
});

async function preflightFetch(input: RequestInfo | URL): Promise<Response> {
  const endpoint = String(input);
  if (endpoint.endsWith(':countTokens')) {
    return json({ totalTokens: 1_000 });
  }
  const model = endpoint.split('/').at(-1) ?? '';
  return json(endpoint.includes('googleapis.com') ? { name: `models/${model}` } : { id: model });
}

async function runtimeFetch(input: RequestInfo | URL): Promise<Response> {
  if (!String(input).endsWith(':countTokens')) throw new Error('TEST_RUNTIME_NETWORK_FORBIDDEN');
  return json({ totalTokens: 1_000 });
}

function finishResponse(request: Readonly<SerializedProviderNativeTurnV2R>, ordinal: number) {
  const args = {
    disposition: 'UNVERIFIABLE', reasonCodes: ['TEST_UNVERIFIABLE'],
    evidenceIds: [], summary: 'Bounded fake-provider terminal.',
  };
  if (request.provider === 'openai') {
    return {
      status: 200,
      body: {
        id: `openai-${ordinal}`, model: request.body.model, status: 'completed',
        output: [{
          type: 'function_call', call_id: `call-${ordinal}`,
          name: 'finish_editron_research_episode', arguments: JSON.stringify(args),
        }],
        usage: usage('openai'),
      },
    };
  }
  return {
    status: 200,
    body: {
      id: `google-${ordinal}`, model: request.body.model, status: 'completed',
      steps: [{
        type: 'function_call', id: `call-${ordinal}`,
        name: 'finish_editron_research_episode', arguments: args,
      }],
      usage: usage('google'),
    },
  };
}

function usage(provider: 'openai' | 'google'): Record<string, unknown> {
  return provider === 'openai' ? {
    input_tokens: 1_000, output_tokens: 20, total_tokens: 1_020,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  } : {
    total_input_tokens: 1_000, total_cached_tokens: 0,
    total_output_tokens: 20, total_thought_tokens: 0, total_tokens: 1_020,
  };
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}
