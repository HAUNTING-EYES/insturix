import { describe, expect, it } from 'vitest';

import {
  buildStage25LongFormProviderCohortManifestV2,
  stage25LongFormProviderMaxSpendUsdV2,
  STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-cohort-v2';
import {
  issueStage25LongFormProviderPaidAuthorizationV2,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-paid-authorization-v2';
import {
  assertStage25LongFormProviderPreflightBundleV2,
  preflightStage25LongFormProvidersV2,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-preflight-v2';

const sourceBinding = {
  sourceCommit: 'a'.repeat(40),
  sourceSha256: {
    cohort: '1'.repeat(64), holdout: '2'.repeat(64), compiler: '3'.repeat(64),
    protocol: '4'.repeat(64), evaluator: '5'.repeat(64), preflight: '6'.repeat(64),
    authorization: '7'.repeat(64), runnerContract: '8'.repeat(64),
    runner: '9'.repeat(64), operator: 'a'.repeat(64),
  },
};
const environment = {
  OPENAI_API_KEY: 'unit-openai-secret',
  GOOGLE_GENERATIVE_AI_API_KEY: 'unit-google-secret',
};

describe('Stage 2.5 long-form provider V2 paid gate', () => {
  it('binds nine durable requests with zero inference and exact source identity', async () => {
    const manifest = buildStage25LongFormProviderCohortManifestV2(sourceBinding);
    const calls: string[] = [];
    const bundle = await preflightStage25LongFormProvidersV2({
      manifest, confirmedManifestSha256: manifest.manifestSha256,
      operatorId: 'admin', environment, fetchImpl: fakeFetch(calls, 12_345),
    });
    expect(bundle.requestCaptures).toHaveLength(9);
    expect(manifest.sourceBinding.sourceFiles).toHaveLength(10);
    expect(bundle.requestCaptures.every(({ request }) => (
      JSON.stringify(request.body).includes('OPAQUE_RESULT_REFERENCES')
    ))).toBe(true);
    expect(bundle.receipt).toMatchObject({
      manifestSha256: manifest.manifestSha256,
      networkCalls: { modelMetadataGets: 3, googleCountTokensPosts: 3, inferenceCalls: 0 },
      dispatchAuthorized: false, projectReads: 0, projectMutations: 0,
    });
    expect(calls).toHaveLength(6);
    expect(calls.every((call) => !call.endsWith('/responses')
      && !call.endsWith('/interactions'))).toBe(true);
    expect(JSON.stringify(bundle)).not.toContain('unit-openai-secret');
    expect(JSON.stringify(bundle)).not.toContain('unit-google-secret');
  });

  it('issues only an exact, expiring nine-row authorization', async () => {
    const manifest = buildStage25LongFormProviderCohortManifestV2(sourceBinding);
    const bundle = await preflightStage25LongFormProvidersV2({
      manifest, confirmedManifestSha256: manifest.manifestSha256,
      operatorId: 'admin', environment, fetchImpl: fakeFetch([], 12_345),
    });
    const approval = {
      operatorId: 'admin', approvedAt: '2026-08-24T00:00:00.000Z',
      expiresAt: '2026-08-25T00:00:00.000Z',
      confirmedManifestSha256: manifest.manifestSha256,
      confirmedPreflightReceiptSha256: bundle.receipt.receiptSha256,
      confirmedRequestCaptureSetSha256: bundle.receipt.requestCaptureSetSha256,
      executeConfirmation: STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2,
      confirmedMaxSpendUsd: stage25LongFormProviderMaxSpendUsdV2(manifest),
    };
    const authorization = issueStage25LongFormProviderPaidAuthorizationV2({
      manifest, preflight: bundle.receipt, captures: bundle.requestCaptures, approval,
    });
    expect(authorization.authorizedRows).toHaveLength(9);
    expect(authorization.limits).toMatchObject({
      maximumProviderInferenceCalls: 9, maximumAttemptsPerRow: 1,
      absoluteMaxCohortSpendNanoUsd: manifest.absoluteMaxSpendNanoUsd,
    });
    expect(() => issueStage25LongFormProviderPaidAuthorizationV2({
      manifest, preflight: bundle.receipt, captures: bundle.requestCaptures,
      approval: { ...approval, confirmedMaxSpendUsd: '0.000000001' },
    })).toThrow('STAGE25_LONG_FORM_PROVIDER_PAID_APPROVAL_INVALID');
  });

  it('rejects source, capture and token-bound drift before authorization', async () => {
    const manifest = buildStage25LongFormProviderCohortManifestV2(sourceBinding);
    expect(() => buildStage25LongFormProviderCohortManifestV2({
      ...sourceBinding,
      sourceSha256: { ...sourceBinding.sourceSha256, runner: 'not-a-sha' },
    })).toThrow('STAGE25_LONG_FORM_PROVIDER_SOURCE_RUNNER_INVALID');
    await expect(preflightStage25LongFormProvidersV2({
      manifest, confirmedManifestSha256: manifest.manifestSha256,
      operatorId: 'admin', environment, fetchImpl: fakeFetch([], 1_000_000),
    })).rejects.toThrow('STAGE25_LONG_FORM_PREFLIGHT_INPUT_BUDGET_EXCEEDED');

    const bundle = await preflightStage25LongFormProvidersV2({
      manifest, confirmedManifestSha256: manifest.manifestSha256,
      operatorId: 'admin', environment, fetchImpl: fakeFetch([], 12_345),
    });
    const forged = bundle.requestCaptures.map((capture, index) => (
      index === 0 ? { ...capture, boundedInputTokens: 1 } : capture
    ));
    expect(() => assertStage25LongFormProviderPreflightBundleV2({
      manifest, receipt: bundle.receipt, requestCaptures: forged,
    })).toThrow('STAGE25_LONG_FORM_PREFLIGHT_V2_BASE_RECEIPT_INVALID');
  });
});

function fakeFetch(calls: string[], googleTokens: number): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (init?.method === 'POST' && url.endsWith(':countTokens')) {
      return response({ totalTokens: googleTokens });
    }
    if (url.includes('/v1/models/gpt-5.6-')) {
      return response({ id: url.split('/').at(-1) });
    }
    if (url.includes('/v1beta/models/gemini-3.7-flash')) {
      return response({ name: 'models/gemini-3.7-flash' });
    }
    throw new Error(`UNEXPECTED_NETWORK_CALL:${url}`);
  };
}
function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}
