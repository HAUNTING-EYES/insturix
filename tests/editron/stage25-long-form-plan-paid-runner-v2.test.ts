import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildStage25LongFormProviderCohortManifestV2,
  stage25LongFormProviderMaxSpendUsdV2,
  STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2 }
  from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-cohort-v2';
import { issueStage25LongFormProviderPaidAuthorizationV2 }
  from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-paid-authorization-v2';
import type { Stage25LongFormProviderPaidDurablePortV2,
  Stage25LongFormProviderPaidRowResultV2 }
  from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-paid-runner-contract-v2';
import { runStage25LongFormProviderPaidCohortV2 }
  from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-paid-runner-v2';
import { preflightStage25LongFormProvidersV2 }
  from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-preflight-v2';
import { buildStage25ValidLongFormProposalMaterialV1 }
  from './helpers/stage25-long-form-plan-fixture-v1';

type JsonRecord = Record<string, unknown>;
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
const now = '2026-08-24T12:00:00.000Z';

describe('Stage 2.5 long-form paid provider runner V2', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('runs and structurally evaluates all nine rows exactly once', async () => {
    const setup = await gate();
    const port = memoryPort();
    const fetchImpl = vi.fn(inferenceFetch);
    const result = await runStage25LongFormProviderPaidCohortV2({
      ...setup, durablePort: port, environment, fetchImpl, now,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(9);
    expect(result.rows).toHaveLength(9);
    expect(result.rows.every((row) => (
      row.evaluation.structuralDisposition === 'PASS_STRUCTURAL_ONLY'
    ))).toBe(true);
    expect(result.receipt).toMatchObject({
      rows: 9, providerDispatchesAccounted: 9,
      providerInferenceCallsObserved: 9, projectReads: 0, projectMutations: 0,
    });
    expect(JSON.stringify(result)).not.toContain(environment.OPENAI_API_KEY);
    expect(JSON.stringify(result)).not.toContain(environment.GOOGLE_GENERATIVE_AI_API_KEY);
  });

  it('never repeats an unknown paid dispatch after a row-commit crash', async () => {
    const setup = await gate();
    const firstRow = setup.manifest.rows[0].rowId;
    const port = memoryPort(firstRow);
    const fetchImpl = vi.fn(inferenceFetch);
    await expect(runStage25LongFormProviderPaidCohortV2({
      ...setup, durablePort: port, environment, fetchImpl, now,
    })).rejects.toThrow('UNIT_ROW_COMMIT_CRASH');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const resumed = await runStage25LongFormProviderPaidCohortV2({
      ...setup, durablePort: port, environment, fetchImpl, now,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(9);
    expect(resumed.rows[0]).toMatchObject({
      accounting: {
        providerInferenceCallsObserved: 0,
        observation: 'RECOVERED_UNKNOWN_DISPATCH_NO_RETRY',
      },
    });
  });

  it('rejects a forged completed evaluation before any provider call', async () => {
    const setup = await gate();
    const port = memoryPort();
    const first = await runStage25LongFormProviderPaidCohortV2({
      ...setup, durablePort: port, environment, fetchImpl: inferenceFetch, now,
    });
    const forgedBase = structuredClone(first.rows[0]);
    const forgedMaterial = {
      ...forgedBase,
      evaluation: { ...forgedBase.evaluation, structuralDisposition: 'PASS_FORGED' },
    };
    const { resultSha256: _old, ...material } = forgedMaterial;
    port.replace(first.rows[0].rowId, {
      ...material, resultSha256: hashCanonicalJsonV1(material),
    } as Stage25LongFormProviderPaidRowResultV2);
    const fetchImpl = vi.fn(inferenceFetch);
    await expect(runStage25LongFormProviderPaidCohortV2({
      ...setup, durablePort: port, environment, fetchImpl, now,
    })).rejects.toThrow('STAGE25_LONG_FORM_PROVIDER_PAID_ROW_INVALID');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

async function gate() {
  const manifest = buildStage25LongFormProviderCohortManifestV2(sourceBinding);
  const bundle = await preflightStage25LongFormProvidersV2({
    manifest, confirmedManifestSha256: manifest.manifestSha256,
    operatorId: 'admin', environment, fetchImpl: preflightFetch,
  });
  const authorization = issueStage25LongFormProviderPaidAuthorizationV2({
    manifest, preflight: bundle.receipt, captures: bundle.requestCaptures,
    approval: {
      operatorId: 'admin', approvedAt: '2026-08-24T10:00:00.000Z',
      expiresAt: '2026-08-25T10:00:00.000Z',
      confirmedManifestSha256: manifest.manifestSha256,
      confirmedPreflightReceiptSha256: bundle.receipt.receiptSha256,
      confirmedRequestCaptureSetSha256: bundle.receipt.requestCaptureSetSha256,
      executeConfirmation: STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2,
      confirmedMaxSpendUsd: stage25LongFormProviderMaxSpendUsdV2(manifest),
    },
  });
  return { manifest, preflight: bundle.receipt,
    captures: bundle.requestCaptures, authorization };
}

function memoryPort(failRowOnce?: string) {
  const state = new Map<string, JsonRecord>();
  let failed = false;
  const port: Stage25LongFormProviderPaidDurablePortV2 & {
    replace: (rowId: string, row: Stage25LongFormProviderPaidRowResultV2) => void;
  } = {
    load: async (rowId) => state.get(rowId) ?? {},
    commitDispatch: async ({ rowId, checkpoint }) => { state.set(rowId, { resumeCheckpoint: checkpoint }); },
    commitAttempt: async ({ rowId, checkpoint }) => { state.set(rowId, { resumeCheckpoint: checkpoint }); },
    commitRow: async ({ rowId, row }) => {
      if (rowId === failRowOnce && !failed) { failed = true; throw new Error('UNIT_ROW_COMMIT_CRASH'); }
      state.set(rowId, { completedRow: row });
    },
    replace: (rowId, row) => { state.set(rowId, { completedRow: row }); },
  };
  return port;
}

async function preflightFetch(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (init?.method === 'POST' && url.endsWith(':countTokens')) return json({ totalTokens: 12_345 });
  if (url.includes('/v1/models/gpt-5.6-')) return json({ id: url.split('/').at(-1) });
  if (url.includes('/v1beta/models/gemini-3.7-flash')) return json({ name: 'models/gemini-3.7-flash' });
  throw new Error(`UNEXPECTED_PREFLIGHT_CALL:${url}`);
}

async function inferenceFetch(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const body = JSON.parse(String(init?.body)) as JsonRecord;
  const args = {
    disposition: 'READY_FOR_PROOF', reasonCodes: ['PLAN_SUBMITTED'],
    evidenceIds: ['ev-source-identities'], summary: 'Ready.',
    proposal: buildStage25ValidLongFormProposalMaterialV1(),
  };
  if (url.endsWith('/responses')) return json({
    id: 'openai-response', model: body.model, status: 'completed',
    output: [{ type: 'function_call', call_id: 'finish-openai',
      name: 'finish_editron_research_episode', arguments: JSON.stringify(args) }],
    usage: { input_tokens: 1_000, output_tokens: 500, total_tokens: 1_500,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 } },
  });
  return json({
    id: 'google-response', model: body.model, status: 'completed',
    steps: [{ type: 'function_call', id: 'finish-google',
      name: 'finish_editron_research_episode', arguments: args }],
    usage: { total_input_tokens: 1_000, total_cached_tokens: 0,
      total_output_tokens: 500, total_thought_tokens: 0, total_tokens: 1_500 },
  });
}
function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}
