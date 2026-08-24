import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  createSealedHoldoutPilotLiveExecutionPortV4R3,
  type SealedHoldoutPilotAttemptIntentV4R3,
  type SealedHoldoutPilotLiveAuditReceiptV4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-pilot-live-adapter-v4r3';
import type { SealedHoldoutPilotAuthorizedRowV4R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-pilot-authorization-v4r3';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutGeneralisationManifestV4R2,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r2';
import {
  buildSealedHoldoutGeneralisationManifestV4R3,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r3';

const NOW = '2026-08-24T12:01:00.000Z';

describe('sealed holdout V4R3 live pilot adapter', () => {
  it('runs one non-scored provider response per route with full audit receipts', async () => {
    const context = fixture();
    const intents: SealedHoldoutPilotAttemptIntentV4R3[] = [];
    const audits: SealedHoldoutPilotLiveAuditReceiptV4R3[] = [];
    const network: string[] = [];
    const port = createSealedHoldoutPilotLiveExecutionPortV4R3({
      ...context,
      environment: {
        OPENAI_API_KEY: 'openai-test-secret',
        GOOGLE_GENERATIVE_AI_API_KEY: 'google-test-secret',
      },
      now: () => NOW,
      fetchImpl: providerFetch(network),
      auditOwner: {
        commitAttemptIntent: (intent) => { intents.push(intent); },
        commitCompletedAttempt: (receipt) => { audits.push(receipt); },
      },
    });
    const results = [];
    for (const row of authorizedRows(context.manifest)) {
      results.push(await port.execute({
        row, manifestSha256: context.manifest.manifestSha256,
        authorizationSha256: 'a'.repeat(64),
        maximumProviderAttempts: 1, automaticRetry: false,
      }));
    }
    expect(network).toHaveLength(3);
    expect(intents).toHaveLength(3);
    expect(audits).toHaveLength(3);
    expect(results.map(({ terminalDisposition }) => terminalDisposition))
      .toEqual(['CAPABILITY_GAP', 'CAPABILITY_GAP', 'CAPABILITY_GAP']);
    expect(results.every(({ providerAttemptCount, networkCalls, stateEffects }) =>
      providerAttemptCount === 1 && networkCalls === 1 && stateEffects.length === 0))
      .toBe(true);
    expect(JSON.stringify(audits)).not.toContain('openai-test-secret');
    expect(JSON.stringify(audits)).not.toContain('google-test-secret');
  });

  it('does not require an unrelated provider credential', async () => {
    const context = fixture();
    const row = authorizedRows(context.manifest)[0];
    const port = createSealedHoldoutPilotLiveExecutionPortV4R3({
      ...context,
      environment: { OPENAI_API_KEY: 'openai-only-secret' },
      now: () => NOW,
      fetchImpl: providerFetch([]),
      auditOwner: { commitAttemptIntent: () => undefined,
        commitCompletedAttempt: () => undefined },
    });
    await expect(port.execute({
      row, manifestSha256: context.manifest.manifestSha256,
      authorizationSha256: 'b'.repeat(64),
      maximumProviderAttempts: 1, automaticRetry: false,
    })).resolves.toMatchObject({ routeId: 'OPENAI_LUNA', providerAttemptCount: 1 });
  });

  it('rejects row drift before provider access', async () => {
    const context = fixture();
    let calls = 0;
    const port = createSealedHoldoutPilotLiveExecutionPortV4R3({
      ...context,
      environment: { OPENAI_API_KEY: 'openai-only-secret' },
      fetchImpl: (async () => { calls += 1; return new Response('{}'); }) as typeof fetch,
      auditOwner: { commitAttemptIntent: () => undefined,
        commitCompletedAttempt: () => undefined },
    });
    const row = { ...authorizedRows(context.manifest)[0], rowPlanSha256: 'f'.repeat(64) };
    await expect(port.execute({
      row, manifestSha256: context.manifest.manifestSha256,
      authorizationSha256: 'c'.repeat(64),
      maximumProviderAttempts: 1, automaticRetry: false,
    })).rejects.toThrow('ROW_PLAN_DRIFT');
    expect(calls).toBe(0);
  });

  it('records one intent and never retries a transient provider response', async () => {
    const context = fixture();
    let calls = 0;
    const intents: SealedHoldoutPilotAttemptIntentV4R3[] = [];
    const port = createSealedHoldoutPilotLiveExecutionPortV4R3({
      ...context,
      environment: { OPENAI_API_KEY: 'openai-only-secret' },
      fetchImpl: vi.fn(async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: { message: 'retry in 0s' } }), {
          status: 429, headers: { 'retry-after': '0' },
        });
      }) as unknown as typeof fetch,
      auditOwner: { commitAttemptIntent: (intent) => { intents.push(intent); },
        commitCompletedAttempt: () => undefined },
    });
    await expect(port.execute({
      row: authorizedRows(context.manifest)[0],
      manifestSha256: context.manifest.manifestSha256,
      authorizationSha256: 'd'.repeat(64),
      maximumProviderAttempts: 1, automaticRetry: false,
    })).rejects.toThrow('TRANSPORT_RECEIPT_INVALID');
    expect(calls).toBe(1);
    expect(intents).toHaveLength(1);
  });
});

function fixture() {
  const baseManifest = buildSealedHoldoutCohortManifestV2R(
    fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const predecessorManifest = buildSealedHoldoutGeneralisationManifestV4R2({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R2),
    baseManifest,
  });
  const manifest = buildSealedHoldoutGeneralisationManifestV4R3({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R3),
    baseManifest, predecessorManifest,
  });
  return { manifest, baseManifest, predecessorManifest };
}

function authorizedRows(manifest: ReturnType<typeof fixture>['manifest']):
Readonly<SealedHoldoutPilotAuthorizedRowV4R3>[] {
  return manifest.pilotRows.map((plan, index) => {
    const route = plan.route as Record<string, string>;
    const material = {
      rowId: String(plan.rowId), routeId: route.routeId, provider: route.provider,
      requestedModel: route.model,
      confirmedReturnedModelIdentity: route.claimedModelIdentity,
      rowPlanSha256: String(plan.rowPlanSha256),
      absoluteMaxRowSpendMicroUsd: 1_000_000 + (index === 2 ? 0 : 0),
    };
    return { ...material, rowAuthorizationSha256: hashCanonicalJsonV1(material) };
  });
}

function providerFetch(network: string[]): typeof fetch {
  return vi.fn(async (request, init) => {
    const endpoint = String(request);
    network.push(endpoint);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const model = String(body.model);
    const args = { disposition: 'CAPABILITY_GAP',
      reasonCodes: ['TRACKED_FINE_CONTOUR_MATTE_MISSING'], evidenceIds: [],
      summary: 'The requested selective grade is unsupported without a tracked matte.' };
    const usage = endpoint.includes('openai.com')
      ? { input_tokens: 1_000, output_tokens: 20, total_tokens: 1_020,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 } }
      : { total_input_tokens: 1_000, total_cached_tokens: 0,
          total_output_tokens: 20, total_thought_tokens: 0, total_tokens: 1_020 };
    const response = endpoint.includes('openai.com')
      ? { id: `response-${network.length}`, model, status: 'completed',
          output: [{ type: 'function_call', call_id: `call-${network.length}`,
            name: 'finish_editron_research_episode', arguments: JSON.stringify(args) }],
          usage }
      : { id: `interaction-${network.length}`, model, status: 'completed',
          steps: [{ type: 'function_call', id: `call-${network.length}`,
            name: 'finish_editron_research_episode', arguments: args }], usage };
    return new Response(JSON.stringify(response), { status: 200 });
  }) as unknown as typeof fetch;
}

function fileSha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
