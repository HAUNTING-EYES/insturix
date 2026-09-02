import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3,
  issueSealedHoldoutPilotAuthorizationV4R3,
  type SealedHoldoutPilotAuthorizedRowV4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-pilot-authorization-v4r3';
import {
  runSealedHoldoutPilotV4R3,
  type SealedHoldoutPilotExecutionPortV4R3,
  type SealedHoldoutPilotPortResultV4R3,
}
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-pilot-runner-v4r3';
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
import { issueSealedHoldoutNoSpendReadinessV4R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-no-spend-readiness-v4r3';
import { preflightSealedHoldoutRouteHealthV4R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-route-health-v4r3';

const NOW = '2026-08-24T12:01:00.000Z';

describe('sealed holdout V4R3 one-row-per-route pilot runner', () => {
  it('invokes exactly one authorized non-scored row per healthy route', async () => {
    const context = await fixture();
    const authorization = await authorize(context);
    const calls: string[] = [];
    const receipt = await runSealedHoldoutPilotV4R3({
      ...context, authorization, now: NOW,
      executionPort: port(calls),
    });
    expect(calls).toEqual(authorization.authorizedRows.map(({ rowId }) => rowId));
    expect(receipt).toMatchObject({
      providerInferenceCalls: 3, networkCalls: 3, maximumAttemptsPerRow: 1,
      automaticRetry: false, scoredRowsExecuted: 0,
      projectReads: 0, projectMutations: 0, mediaWrites: 0,
      secretsPersisted: false, stateEffects: [],
      assessment: 'PILOT_EXECUTED_NOT_SCORED_AUDIT_REQUIRED',
    });
    expect(receipt.results).toHaveLength(3);
    expect(receipt.results.every(({ providerAttemptCount }) => providerAttemptCount === 1))
      .toBe(true);
  });

  it('never calls an unhealthy route and rejects model or effect drift', async () => {
    const context = await fixture(429);
    const authorization = await authorize(context);
    const calls: string[] = [];
    await runSealedHoldoutPilotV4R3({
      ...context, authorization, now: NOW, executionPort: port(calls),
    });
    expect(calls).toHaveLength(2);
    expect(calls.some((rowId) => rowId.includes('GOOGLE_FLASH'))).toBe(false);

    const healthy = await fixture();
    const healthyAuthorization = await authorize(healthy);
    await expect(runSealedHoldoutPilotV4R3({
      ...healthy, authorization: healthyAuthorization, now: NOW,
      executionPort: port([], { wrongModel: true }),
    })).rejects.toThrow('SEALED_V4R3_PILOT_RUNNER_PORT_RESULT_INVALID');
    await expect(runSealedHoldoutPilotV4R3({
      ...healthy, authorization: healthyAuthorization, now: NOW,
      executionPort: port([], { projectMutation: true }),
    })).rejects.toThrow('SEALED_V4R3_PILOT_RUNNER_PORT_RESULT_INVALID');
  });

  it('does not retry when the transport port fails', async () => {
    const context = await fixture();
    const authorization = await authorize(context);
    let calls = 0;
    await expect(runSealedHoldoutPilotV4R3({
      ...context, authorization, now: NOW,
      executionPort: { authority: 'PROVIDER_NATIVE_LIVE_TRANSPORT_RECEIPT_REQUIRED',
        execute: async () => { calls += 1; throw new Error('PORT_FAILURE'); } },
    })).rejects.toThrow('PORT_FAILURE');
    expect(calls).toBe(1);
  });

  it('revalidates freshness before every provider dispatch', async () => {
    const context = await fixture();
    const authorization = await authorize(context);
    const calls: string[] = [];
    let clockReads = 0;
    await expect(runSealedHoldoutPilotV4R3({
      ...context, authorization, now: NOW, executionPort: port(calls),
      currentTime: () => {
        clockReads += 1;
        return clockReads === 1 ? NOW : '2026-08-24T12:04:00.000Z';
      },
    })).rejects.toThrow('SEALED_V4R3_PILOT_AUTH_AUTHORIZATION_EXPIRED');
    expect(calls).toHaveLength(1);
  });
});

async function fixture(googleStatus = 200) {
  const baseManifest = buildSealedHoldoutCohortManifestV2R(
    fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const predecessorManifest = buildSealedHoldoutGeneralisationManifestV4R2({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R2), baseManifest,
  });
  const manifest = buildSealedHoldoutGeneralisationManifestV4R3({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R3),
    baseManifest, predecessorManifest,
  });
  const readiness = await issueSealedHoldoutNoSpendReadinessV4R3({
    manifest, baseManifest, predecessorManifest,
  });
  const routeHealth = await preflightSealedHoldoutRouteHealthV4R3({
    manifest, baseManifest, predecessorManifest,
    environment: { OPENAI_API_KEY: 'openai-test', GOOGLE_GENERATIVE_AI_API_KEY: 'google-test' },
    now: () => new Date('2026-08-24T12:00:00.000Z'), fetchImpl: providerFetch(googleStatus),
  });
  return { manifest, baseManifest, predecessorManifest, readiness, routeHealth };
}
async function authorize(context: Awaited<ReturnType<typeof fixture>>) {
  return issueSealedHoldoutPilotAuthorizationV4R3({ ...context, now: NOW, approval: {
    operatorId: 'admin', approvedAt: NOW, expiresAt: '2026-08-24T12:04:00.000Z',
    confirmedManifestSha256: context.manifest.manifestSha256,
    confirmedReadinessReceiptSha256: context.readiness.receiptSha256,
    confirmedRouteHealthReceiptSha256: context.routeHealth.receiptSha256,
    confirmedPilotRowSetSha256: context.manifest.pilotRowSetSha256,
    executeConfirmation: SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3,
    confirmedMaxSpendUsd: '3.000000',
  } });
}
function port(calls: string[], drift: { wrongModel?: boolean; projectMutation?: boolean } = {}):
SealedHoldoutPilotExecutionPortV4R3 {
  return { authority: 'PROVIDER_NATIVE_LIVE_TRANSPORT_RECEIPT_REQUIRED' as const,
    execute: async ({ row }: { row: Readonly<SealedHoldoutPilotAuthorizedRowV4R3> }) => {
      calls.push(row.rowId);
      const result = { rowId: row.rowId, routeId: row.routeId, provider: row.provider,
        requestedModel: drift.wrongModel ? 'wrong-model' : row.requestedModel,
        returnedModelIdentity: row.confirmedReturnedModelIdentity,
        rowAuthorizationSha256: row.rowAuthorizationSha256,
        requestSha256: hashCanonicalJsonV1({ row: row.rowId, kind: 'request' }),
        responseSha256: hashCanonicalJsonV1({ row: row.rowId, kind: 'response' }),
        transportReceiptSha256: hashCanonicalJsonV1({ row: row.rowId, kind: 'transport' }),
        providerUsageSha256: hashCanonicalJsonV1({ inputTokens: 10, outputTokens: 2 }),
        accountedCostNanoUsd: 1_000,
        accountingBasis: 'PROVIDER_REPORTED_USAGE_X_FROZEN_ROUTE_PRICE' as const,
        episodeReceiptSha256: hashCanonicalJsonV1({ row: row.rowId, kind: 'episode' }),
        transcriptSha256: hashCanonicalJsonV1({ row: row.rowId, kind: 'transcript' }),
        terminalDisposition: 'UNVERIFIABLE', selectedOperatorIds: [] as const,
        providerAttemptCount: 1 as const, inferenceCalls: 1 as const, networkCalls: 1 as const,
        billedMicroUsd: 1,
        projectReads: 0 as const, projectMutations: drift.projectMutation ? 1 : 0,
        mediaWrites: 0 as const, secretsPersisted: false as const, stateEffects: [] as const };
      const accountingMaterial = {
        requestSha256: result.requestSha256, responseSha256: result.responseSha256,
        providerUsageSha256: result.providerUsageSha256,
        accountedCostNanoUsd: result.accountedCostNanoUsd,
        accountingBasis: result.accountingBasis,
      };
      Object.assign(result, {
        accountingReceiptSha256: hashCanonicalJsonV1(accountingMaterial),
      });
      return result as unknown as SealedHoldoutPilotPortResultV4R3;
    } };
}
function providerFetch(googleStatus: number): typeof fetch {
  return vi.fn(async (input) => {
    const model = decodeURIComponent(String(input).split('/').at(-1) ?? '');
    const google = model.startsWith('gemini-');
    return new Response(JSON.stringify(google
      ? { name: `models/${model}` } : { id: model }), { status: google ? googleStatus : 200 });
  }) as unknown as typeof fetch;
}
function fileSha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
