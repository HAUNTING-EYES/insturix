import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import type { ProviderNativeLiveTransportReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-live-transport-v2r';
import type { SerializedProviderNativeTurnV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutCohortManifestV3R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r';
import {
  buildSealedHoldoutCohortManifestV3R2,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r2';
import {
  buildSealedHoldoutGeneralisationManifestV4R,
  SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r';
import {
  issueSealedHoldoutGeneralisationPaidAuthorizationV4R,
  SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-paid-authorization-v4r';
import {
  runSealedHoldoutPaidCohortV4R,
  SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V4R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-paid-cohort-runner-v2r';
import { preflightSealedHoldoutGeneralisationV4R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-preflight-v4r';

const roots: string[] = [];
const environment = {
  OPENAI_API_KEY: 'test-openai-secret-never-persist',
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-secret-never-persist',
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('sealed Stage 2.5 generalisation paid cohort runner V4R', () => {
  it('runs the exact 45 rows once, resumes, and rejects capture and row forgeries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'editron-sealed-v4r-runner-'));
    roots.push(root);
    const { baseManifest, generalisationManifest } = await manifests();
    const mediaManifest = await materializeHoldoutMediaV2R(join(root, 'media'));
    const preflight = await preflightSealedHoldoutGeneralisationV4R({
      generalisationManifest,
      baseManifest,
      authorization: {
        operatorId: 'test-operator',
        generalisationManifestSha256: generalisationManifest.manifestSha256,
        permittedNetworkActions: ['MODEL_METADATA_GET', 'GOOGLE_COUNT_TOKENS'],
        inferenceCalls: 0,
      },
      environment,
      fetchImpl: preflightFetch,
    });
    const approvedAt = '2026-08-22T13:00:00.000Z';
    const authorization = issueSealedHoldoutGeneralisationPaidAuthorizationV4R({
      generalisationManifest,
      baseManifest,
      preflight: preflight.receipt,
      approval: {
        operatorId: 'test-operator',
        approvedAt,
        expiresAt: '2026-08-23T12:59:59.000Z',
        confirmedGeneralisationManifestSha256: generalisationManifest.manifestSha256,
        confirmedPreflightReceiptSha256: preflight.receipt.receiptSha256,
        confirmedRequestCaptureSetSha256: preflight.receipt.requestCaptureSetSha256,
        zeroInferenceGate: SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R,
        maxSpendMicroUsdPerRow: 10_000_000,
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
            attempt: 1,
            requestHash: request.requestHash,
            provider: request.provider,
            endpoint: request.endpoint,
            responseStatus: 200,
            responseSha256: hashCanonicalJsonV1({ providerCalls }),
            returnedModelIdentity: String(request.body.model),
            usage: usage(request.provider),
          });
          return finishResponse(request, providerCalls);
        },
        snapshot: () => {
          const material = {
            authority: 'RESEARCH_PROVIDER_TRANSPORT_NO_PROJECT_MUTATION' as const,
            calls,
            secretsPersisted: false as const,
          };
          return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
        },
      };
    };
    const runRoot = join(root, 'run');
    const common = {
      generalisationManifest,
      baseManifest,
      credentialPreflight: preflight.receipt,
      requestCaptures: preflight.requestCaptures,
      paidAuthorization: authorization,
      mediaManifest,
      outputRoot: runRoot,
      implementationCommitSha: 'b'.repeat(40),
      runnerSourceSha256: 'a'.repeat(64),
      environment,
      dependencies: {
        fetchImpl: runtimeFetch,
        transportFactory,
        proofExecutor: async () => {
          proofCalls += 1;
          const material = { assessment: 'PASS_RESEARCH_TEST_PROOF', stateEffects: [] as const };
          return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
        },
        now: () => '2026-08-22T14:00:00.000Z',
        uniqueId: () => `proof-${proofCalls}`,
      },
    } as const;

    const first = await runSealedHoldoutPaidCohortV4R(common);
    expect(first).toMatchObject({
      version: SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V4R,
      rowCount: 45,
      providerInferenceCalls: 45,
      googleCountTokensCalls: 15,
      projectReads: 0,
      projectMutations: 0,
      stateEffects: [],
    });
    expect(providerCalls).toBe(45);
    expect(first.rowSummaries).toHaveLength(45);
    expect(new Set(first.rowSummaries.map(({ orderId }) => orderId)))
      .toEqual(new Set(['ORDER_1', 'ORDER_2', 'ORDER_3']));
    expect(first.spentNanoUsd).toBeLessThanOrEqual(75_000_000_000);

    const resumed = await runSealedHoldoutPaidCohortV4R(common);
    expect(resumed.receiptSha256).toBe(first.receiptSha256);
    expect(providerCalls).toBe(45);

    const forgedCaptures = [...preflight.requestCaptures];
    forgedCaptures[0] = {
      ...forgedCaptures[0],
      rowPlanSha256: '0'.repeat(64),
    };
    await expect(runSealedHoldoutPaidCohortV4R({
      ...common,
      requestCaptures: forgedCaptures,
    })).rejects.toThrow('SEALED_PAID_V4R_REQUEST_CAPTURE_SET_DRIFT');

    const firstRowPath = join(runRoot, 'rows', `${String(first.rowSummaries[0].rowId)}.json`);
    const row = JSON.parse(await readFile(firstRowPath, 'utf8')) as Record<string, unknown>;
    row.version = 'FORGED_RUNNER_VERSION';
    const { receiptSha256: _old, ...material } = row;
    row.receiptSha256 = hashCanonicalJsonV1(material);
    await writeFile(firstRowPath, `${JSON.stringify(row, null, 2)}\n`, 'utf8');
    await expect(runSealedHoldoutPaidCohortV4R(common))
      .rejects.toThrow('SEALED_PAID_ROW_RECEIPT_DRIFT');
  }, 300_000);
});

async function manifests() {
  const v2 = buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const v3 = buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: v2,
  });
  const baseManifest = buildSealedHoldoutCohortManifestV3R2({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2),
    baseManifest: v3,
  });
  const implementationBindings = await Promise.all(
    SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R.map(async (path) => ({
      path,
      sha256: await fileSha(path),
    })),
  );
  const generalisationManifest = buildSealedHoldoutGeneralisationManifestV4R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R),
    baseManifest,
    implementationBindings,
  });
  return { baseManifest, generalisationManifest };
}

async function preflightFetch(input: RequestInfo | URL): Promise<Response> {
  const endpoint = String(input);
  if (endpoint.endsWith(':countTokens')) return json({ totalTokens: 1_000 });
  const model = endpoint.split('/').at(-1) ?? '';
  return json(endpoint.includes('googleapis.com') ? { name: `models/${model}` } : { id: model });
}
async function runtimeFetch(input: RequestInfo | URL): Promise<Response> {
  if (!String(input).endsWith(':countTokens')) throw new Error('TEST_RUNTIME_NETWORK_FORBIDDEN');
  return json({ totalTokens: 1_000 });
}
function finishResponse(request: Readonly<SerializedProviderNativeTurnV2R>, ordinal: number) {
  const args = {
    disposition: 'UNVERIFIABLE',
    reasonCodes: ['TEST_UNVERIFIABLE'],
    evidenceIds: [],
    summary: 'Bounded fake-provider terminal.',
  };
  return request.provider === 'openai' ? {
    status: 200,
    body: {
      id: `openai-${ordinal}`, model: request.body.model, status: 'completed',
      output: [{ type: 'function_call', call_id: `call-${ordinal}`,
        name: 'finish_editron_research_episode', arguments: JSON.stringify(args) }],
      usage: usage('openai'),
    },
  } : {
    status: 200,
    body: {
      id: `google-${ordinal}`, model: request.body.model, status: 'completed',
      steps: [{ type: 'function_call', id: `call-${ordinal}`,
        name: 'finish_editron_research_episode', arguments: args }],
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
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}
