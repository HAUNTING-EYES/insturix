import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildDevelopmentSmokePreflightV2 } from '@/lib/editron/research/open-ended-planner/smoke-preflight-v2';
import frozenJson from '@/tests/fixtures/editron/open-ended-planner-v2/development-smoke-preflight-v2.json';

describe('open-ended planner V2 paid-smoke preflight', () => {
  it('matches the frozen deterministic no-network plan', async () => {
    const first = await buildDevelopmentSmokePreflightV2();
    const second = await buildDevelopmentSmokePreflightV2();
    expect(first).toEqual(frozenJson);
    expect(second).toEqual(first);
    const { planHash, ...material } = first;
    expect(planHash).toBe(hashCanonicalJsonV1(material));
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('uses the same difficult-reference packet and condition for every comparison row', async () => {
    const plan = await buildDevelopmentSmokePreflightV2() as Plan;
    expect(plan.smokeRows).toHaveLength(6);
    expect(new Set(plan.smokeRows.map(({ taskId }) => taskId))).toEqual(new Set(['DEV-02']));
    expect(new Set(plan.smokeRows.map(({ conditionId }) => conditionId))).toEqual(new Set(['BASELINE']));
    const comparisonRows = plan.smokeRows.filter(({ comparisonPurpose }) => comparisonPurpose === 'FAIR_STATIC_REFERENCE_COMPARISON');
    expect(comparisonRows.map(({ routeId }) => routeId).sort())
      .toEqual(['GOOGLE_FLASH', 'GOOGLE_FLASH_LITE', 'OPENAI_LUNA', 'OPENAI_TERRA']);
    expect(new Set(comparisonRows.map(({ packetHash }) => packetHash)).size).toBe(1);
    expect(new Set(comparisonRows.map(({ transportHash }) => transportHash)).size).toBe(1);
    expect(new Set(comparisonRows.map(({ inputArm }) => inputArm))).toEqual(new Set(['REFERENCE_IMAGE_EVIDENCE']));
    expect(plan.smokeRows.filter(({ comparisonPurpose }) => comparisonPurpose === 'NATIVE_MEDIA_TRANSPORT_PLUMBING_ONLY').map(({ routeId }) => routeId).sort())
      .toEqual(['GOOGLE_FLASH', 'GOOGLE_FLASH_LITE']);
  });

  it('records applicability for every provider, development task, and modality arm', async () => {
    const plan = await buildDevelopmentSmokePreflightV2() as Plan;
    expect(plan.routeApplicability).toHaveLength(45);
    expect(new Set(plan.routeApplicability.map(({ routeId }) => routeId)).size).toBe(5);
    expect(new Set(plan.routeApplicability.map(({ taskId }) => taskId))).toEqual(new Set(['DEV-01', 'DEV-02', 'DEV-03', 'DEV-04']));
    expect(new Set(plan.routeApplicability.map(({ inputArm }) => inputArm))).toEqual(new Set(['MULTIMODAL', 'REFERENCE_IMAGE_EVIDENCE', 'TEXT_EVIDENCE_ONLY']));
    const multimodal = plan.routeApplicability.filter(({ inputArm, routeId }) => inputArm === 'MULTIMODAL' && routeId.startsWith('GOOGLE_'));
    expect(multimodal).toHaveLength(8);
    expect(multimodal.every(({ modalityStatus }) => modalityStatus === 'APPLICABLE')).toBe(true);
    expect(plan.routeApplicability.filter(({ inputArm, routeId }) => inputArm === 'MULTIMODAL' && !routeId.startsWith('GOOGLE_'))
      .every(({ modalityStatus }) => modalityStatus === 'NOT_APPLICABLE')).toBe(true);
  });

  it('freezes current prices without inventing dated provider snapshots', async () => {
    const plan = await buildDevelopmentSmokePreflightV2() as Plan;
    const routes = Object.fromEntries(plan.routes.map((route) => [route.routeId, route]));
    expect(routes.OPENAI_LUNA.pricing).toEqual({ inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.1, cacheWriteUsdPerMillion: 1.25, outputUsdPerMillion: 6 });
    expect(routes.OPENAI_TERRA.pricing).toEqual({ inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25, cacheWriteUsdPerMillion: 3.125, outputUsdPerMillion: 15 });
    expect(routes.GOOGLE_FLASH_LITE.pricing).toEqual({ inputUsdPerMillion: 0.3, cachedInputUsdPerMillion: null, cacheWriteUsdPerMillion: null, outputUsdPerMillion: 2.5 });
    expect(routes.GOOGLE_FLASH.pricing).toEqual({ inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075, cacheWriteUsdPerMillion: null, outputUsdPerMillion: 3.75 });
    expect(routes.DEEPSEEK_FLASH.pricing).toEqual({ inputUsdPerMillion: 0.14, cachedInputUsdPerMillion: 0.0028, cacheWriteUsdPerMillion: null, outputUsdPerMillion: 0.28 });
    expect(routes.OPENAI_LUNA.identityStatus).toBe('PROVIDER_ROUTE_NO_DATED_SNAPSHOT');
    expect(routes.GOOGLE_FLASH.identityStatus).toBe('PROVIDER_STABLE_ROUTE');
  });

  it('blocks the unsupported 0731 identity instead of relabelling the provider alias', async () => {
    const plan = await buildDevelopmentSmokePreflightV2() as Plan;
    expect(plan.excludedRows).toHaveLength(1);
    expect(plan.excludedRows[0]).toMatchObject({ routeId: 'DEEPSEEK_FLASH', dispatchStatus: 'BLOCKED_MODEL_IDENTITY' });
    expect(plan.excludedRows[0].blockers).toEqual(['CLAIMED_0731_SNAPSHOT_NOT_REQUESTABLE']);
    expect(plan.smokeRows.some(({ routeId }) => routeId === 'DEEPSEEK_FLASH')).toBe(false);
  });

  it('caps the six-call smoke at two dollars ten including repairs', async () => {
    const plan = await buildDevelopmentSmokePreflightV2() as Plan;
    expect(plan.spend).toMatchObject({ plannedProviderCallsAfterAllGates: 6, maxCostPerStageOneRunUsd: 0.35, absoluteMaxSpendUsd: 2.1 });
    expect(plan.smokeRows.every(({ maxProviderCostUsd }) => maxProviderCostUsd === 0.35)).toBe(true);
    expect(plan.smokeRows.filter(({ localInputTokenUpperBound }) => localInputTokenUpperBound !== null)
      .every(({ localInputTokenUpperBound, maxInputTokens }) => Number(localInputTokenUpperBound) <= maxInputTokens)).toBe(true);
  });

  it('requires official Google counting and an explicit operator echo before egress', async () => {
    const plan = await buildDevelopmentSmokePreflightV2() as Plan;
    expect(plan.globalBlockers).toEqual([
      'GOOGLE_COUNT_TOKENS_NOT_YET_EXECUTED',
      'OPERATOR_CONFIRMATION_NOT_RECORDED',
    ]);
    const googleRows = plan.smokeRows.filter(({ routeId }) => routeId.startsWith('GOOGLE_'));
    expect(googleRows).toHaveLength(4);
    expect(googleRows.every((row) => row.providerCountTokensEndpoint?.endsWith(':countTokens'))).toBe(true);
    expect(googleRows.every((row) => /^[a-f0-9]{64}$/.test(row.providerCountTokensRequestHash ?? ''))).toBe(true);
    expect(googleRows.every((row) => row.dispatchStatus === 'BLOCKED_COUNT_TOKENS_AND_OPERATOR_CONFIRMATION')).toBe(true);
    const openAiRows = plan.smokeRows.filter(({ routeId }) => routeId.startsWith('OPENAI_'));
    expect(openAiRows.every((row) => row.blockers.join(',') === 'OPERATOR_CONFIRMATION_MISSING')).toBe(true);
    expect(plan.operatorConfirmationGate).toMatchObject({
      status: 'NOT_CONFIRMED', appliesBefore: 'ANY_PROVIDER_NETWORK_CALL_INCLUDING_COUNT_TOKENS',
    });
    expect(plan.operatorConfirmationGate.requiredEchoFields).toEqual(['planHash', 'absoluteMaxSpendUsd', 'operatorId', 'confirmedAt']);
  });

  it('persists audit evidence but never secrets, raw media, or raw responses', async () => {
    const plan = await buildDevelopmentSmokePreflightV2() as Plan;
    expect(plan.persistencePolicy.forbidden).toEqual(expect.arrayContaining([
      'apiKeyValue', 'authorizationHeader', 'rawMediaBytes', 'base64Media', 'rawProviderResponse', 'userProjectState',
    ]));
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain('Bearer ');
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
    expect(serialized).not.toContain('data:video/');
  });
});

type Plan = Awaited<ReturnType<typeof buildDevelopmentSmokePreflightV2>> & {
  routes: Array<{ routeId: string; identityStatus: string; pricing: Record<string, number | null> }>;
  routeApplicability: Array<{ routeId: string; taskId: string; inputArm: string; modalityStatus: string }>;
  smokeRows: Array<{
    routeId: string;
    taskId: string;
    conditionId: string;
    inputArm: string;
    comparisonPurpose: string;
    packetHash: string;
    transportHash: string;
    maxProviderCostUsd: number;
    maxInputTokens: number;
    localInputTokenUpperBound: number | null;
    providerCountTokensEndpoint: string | null;
    providerCountTokensRequestHash: string | null;
    dispatchStatus: string;
    blockers: string[];
  }>;
  excludedRows: Array<{ routeId: string; dispatchStatus: string; blockers: string[] }>;
  spend: { plannedProviderCallsAfterAllGates: number; maxCostPerStageOneRunUsd: number; absoluteMaxSpendUsd: number };
  globalBlockers: string[];
  operatorConfirmationGate: { status: string; appliesBefore: string; requiredEchoFields: string[] };
  persistencePolicy: { forbidden: string[] };
};
