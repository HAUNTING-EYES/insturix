import { describe, expect, it } from 'vitest';

import {
  buildStage2RoutingSmokePreflightV2,
  runStage2RoutingSmokeV2,
} from '@/lib/editron/research/open-ended-planner/stage2-routing-smoke-v2';
import { buildDevelopmentSmokePreflightV2 } from '@/lib/editron/research/open-ended-planner/smoke-preflight-v2';

const hardClaimIds = ['claim-user-stacked-layout', 'claim-user-centred-title', 'claim-user-varied-crops', 'claim-user-exit-continuity'];
const generatedHardClaimIds = hardClaimIds.slice(0, 3);
const nativeHardClaimIds = hardClaimIds.slice(3);

describe('open-ended planner V2 isolated Stage-2 routing smoke', () => {
  it('freezes four fair routes against one canonical blueprint and packet', async () => {
    const plan = await buildStage2RoutingSmokePreflightV2() as Plan;
    const currentDevelopmentPlan = await buildDevelopmentSmokePreflightV2() as CurrentDevelopmentPlan;
    expect(plan.planHash).toBe('808b4d51e047fa76b07ddc9e904cba3742a0fce6178eff27d38f4185dbce579b');
    expect(plan.routeSourcePlanHash).toBe('eff3c660dc98618a4eea6d8f63ebdd426fe3fee2b527d9bc23211aa1807d1c8e');
    expect(plan.routes.find(({ routeId }) => routeId === 'GOOGLE_FLASH')?.requestModel).toBe('gemini-3.6-flash');
    expect(currentDevelopmentPlan.routes.find(({ routeId }) => routeId === 'GOOGLE_FLASH')?.requestModel).toBe('gemini-3.7-flash');
    expect(currentDevelopmentPlan.planHash).not.toBe(plan.routeSourcePlanHash);
    expect(plan.rows).toHaveLength(4);
    expect(plan.spend).toMatchObject({ plannedProviderCalls: 4, absoluteMaxSpendUsd: 1.2 });
    expect(new Set(plan.rows.map(({ packetHash }) => packetHash)).size).toBe(1);
    expect(new Set(plan.rows.map(({ priorArtifactHash }) => priorArtifactHash))).toEqual(new Set([plan.canonicalBlueprintHash]));
    expect(plan.rows.filter(({ localInputTokenUpperBound }) => localInputTokenUpperBound !== null)
      .every(({ localInputTokenUpperBound, maxInputTokens }) => Number(localInputTokenUpperBound) <= maxInputTokens)).toBe(true);
    expect(plan.exclusions).toEqual(expect.arrayContaining([
      { routeId: 'QWEN_3_8_MAX', reason: 'NO_ENVIRONMENT_BACKED_PROVIDER_CODEC_ROUTE_IN_CURRENT_HARNESS' },
    ]));
  });

  it('counts exact Google requests and scores the hybrid plan separately from schema acceptance', async () => {
    const plan = await buildStage2RoutingSmokePreflightV2() as Plan;
    let countCalls = 0;
    let generationCalls = 0;
    const receipt = await runStage2RoutingSmokeV2({
      expectedPlanHash: plan.planHash,
      maxAuthorizedSpendUsd: 1.2,
      operatorId: 'admin',
      confirmedAt: '2026-08-14T00:00:00.000Z',
      environment: { OPENAI_API_KEY: 'openai-secret-sentinel', GEMINI_API_KEY: 'google-secret-sentinel' },
      fetchImpl: async (url, init) => {
        const endpoint = String(url);
        if (endpoint.endsWith(':countTokens')) { countCalls += 1; return response({ totalTokens: 8_000 }); }
        generationCalls += 1;
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const model = typeof request.model === 'string' ? request.model : decodeURIComponent(endpoint.match(/models\/([^:]+):generateContent/)?.[1] ?? 'google-test');
        return endpoint.includes('api.openai.com') ? response(openAI(model, routingArtifact())) : response(google(model, routingArtifact()));
      },
    }) as Receipt;
    expect(countCalls).toBe(2);
    expect(generationCalls).toBe(4);
    expect(receipt.rows.every(({ run }) => run.disposition === 'ARTIFACT_ACCEPTED')).toBe(true);
    expect(receipt.rows.every(({ routingEvaluation }) => routingEvaluation.disposition === 'CAPABILITY_BLOCKED')).toBe(true);
    expect(receipt.rows.every(({ routingEvaluation }) => routingEvaluation.routeClassification === 'PASS')).toBe(true);
    expect(receipt.rows.every(({ routingEvaluation }) => routingEvaluation.candidateCoverage === 'PASS' && routingEvaluation.graphCoverage === 'PASS')).toBe(true);
    expect(receipt.rows.every(({ routingEvaluation }) => routingEvaluation.capabilityHonesty === 'PASS')).toBe(true);
    expect(receipt.actualProviderCostUsd).toBeGreaterThan(0);
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain('openai-secret-sentinel');
    expect(serialized).not.toContain('google-secret-sentinel');
    expect(serialized).not.toContain('data:image/');
  });

  it('does not mislabel a schema-valid native answer as a routing pass', async () => {
    const plan = await buildStage2RoutingSmokePreflightV2() as Plan;
    const receipt = await runStage2RoutingSmokeV2({
      expectedPlanHash: plan.planHash,
      maxAuthorizedSpendUsd: 1.2,
      operatorId: 'admin',
      confirmedAt: '2026-08-14T00:00:00.000Z',
      environment: { OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'google-test' },
      fetchImpl: async (url, init) => {
        const endpoint = String(url);
        if (endpoint.endsWith(':countTokens')) return response({ totalTokens: 8_000 });
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const model = typeof request.model === 'string' ? request.model : 'google-test';
        const artifact = routingArtifact('NATIVE');
        return endpoint.includes('api.openai.com') ? response(openAI(model, artifact)) : response(google(model, artifact));
      },
    }) as Receipt;
    expect(receipt.rows.every(({ run }) => run.disposition === 'ARTIFACT_ACCEPTED')).toBe(true);
    expect(receipt.rows.every(({ routingEvaluation }) => routingEvaluation.disposition === 'FAIL')).toBe(true);
    expect(receipt.rows.every(({ routingEvaluation }) => routingEvaluation.diagnostics.includes('WRONG_EXECUTION_FORM'))).toBe(true);
  });

  it('fails a hybrid graph that falsely claims the unimplemented generated owner is eligible', async () => {
    const plan = await buildStage2RoutingSmokePreflightV2() as Plan;
    const receipt = await runStage2RoutingSmokeV2({
      expectedPlanHash: plan.planHash, maxAuthorizedSpendUsd: 1.2, operatorId: 'admin', confirmedAt: '2026-08-14T00:00:00.000Z',
      environment: { OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'google-test' },
      fetchImpl: async (url, init) => {
        const endpoint = String(url);
        if (endpoint.endsWith(':countTokens')) return response({ totalTokens: 8_000 });
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const model = typeof request.model === 'string' ? request.model : 'google-test';
        const artifact = routingArtifact('HYBRID', true);
        return endpoint.includes('api.openai.com') ? response(openAI(model, artifact)) : response(google(model, artifact));
      },
    }) as Receipt;
    expect(receipt.rows.every(({ routingEvaluation }) => routingEvaluation.disposition === 'FAIL')).toBe(true);
    expect(receipt.rows.every(({ routingEvaluation }) => routingEvaluation.capabilityHonesty === 'FAIL')).toBe(true);
  });

  it('fails a hybrid graph that omits a native continuity node', async () => {
    const plan = await buildStage2RoutingSmokePreflightV2() as Plan;
    const receipt = await runStage2RoutingSmokeV2({
      expectedPlanHash: plan.planHash, maxAuthorizedSpendUsd: 1.2, operatorId: 'admin', confirmedAt: '2026-08-14T00:00:00.000Z',
      environment: { OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'google-test' },
      fetchImpl: async (url, init) => {
        const endpoint = String(url);
        if (endpoint.endsWith(':countTokens')) return response({ totalTokens: 8_000 });
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const model = typeof request.model === 'string' ? request.model : 'google-test';
        const artifact = routingArtifact('HYBRID', false, true);
        return endpoint.includes('api.openai.com') ? response(openAI(model, artifact)) : response(google(model, artifact));
      },
    }) as Receipt;
    expect(receipt.rows.every(({ routingEvaluation }) => routingEvaluation.disposition === 'FAIL')).toBe(true);
    expect(receipt.rows.every(({ routingEvaluation }) => routingEvaluation.diagnostics.includes('NATIVE_CONTINUITY_NODE_MISSING'))).toBe(true);
  });
});

function routingArtifact(form: 'HYBRID' | 'NATIVE' = 'HYBRID', falseEligibility = false, omitNativeContinuityNode = false) {
  const hybrid = form === 'HYBRID';
  const owner = hybrid ? 'generated_composition_program' : 'set_keyframes';
  return {
    artifactType: 'EditorialIntentGraphV2', taskId: 'DEV-02', executionForm: form,
    routeDecision: {
      scopeClassification: hybrid ? 'HYBRID_FULL_PLAN' : 'NATIVE_ONLY_PLAN', coverageStatus: 'COMPLETE',
      candidateForms: [{ form, hardGateStatus: hybrid && !falseEligibility ? 'UNVERIFIABLE' : 'ELIGIBLE', claimCoverage: hardClaimIds.map((claimId) => ({ claimId, status: 'COVERED', ownerRefs: [claimId === 'claim-user-exit-continuity' ? 'use_matching_footage' : owner], reasonCodes: ['TARGET_COVERED'] })), representabilitySignals: hybrid ? ['CROSS_ELEMENT_DEPENDENCY'] : ['NONE'], blockers: hybrid && !falseEligibility ? ['GENERATED_OWNER_NOT_IMPLEMENTED'] : [], ownerRefs: hybrid ? [owner, 'use_matching_footage'] : [owner], evidenceIds: ['EV-DEV02-R1'] }],
      selectedReasonCodes: [hybrid ? 'GENERATED_ISLAND_WITH_NATIVE_HANDOFF' : 'NATIVE_SELECTED'], generatedIslandClaimIds: hybrid ? generatedHardClaimIds : [], nativeSurroundClaimIds: hybrid ? nativeHardClaimIds : hardClaimIds,
    },
    nodes: hybrid ? [
      { intentNodeId: 'intent-generated', operationFamily: 'generated-composition', targetClaimIds: generatedHardClaimIds, candidateCapabilityIds: [owner], executionForm: 'GENERATED_COMPOSITION', requiresNodeIds: [], invalidates: ['RENDER_PROOF'], evidenceIds: ['EV-DEV02-R1'], failureDisposition: 'NEEDS_REVIEW' },
      { intentNodeId: 'intent-handoff', operationFamily: 'continuity-handoff', targetClaimIds: omitNativeContinuityNode ? generatedHardClaimIds.slice(0, 1) : nativeHardClaimIds, candidateCapabilityIds: ['use_matching_footage'], executionForm: 'NATIVE', requiresNodeIds: ['intent-generated'], invalidates: ['RENDER_PROOF'], evidenceIds: ['EV-DEV02-C1'], failureDisposition: 'NEEDS_REVIEW' },
    ] : [{ intentNodeId: 'intent-1', operationFamily: 'keyframes', targetClaimIds: hardClaimIds, candidateCapabilityIds: [owner], executionForm: 'NATIVE', requiresNodeIds: [], invalidates: ['RENDER_PROOF'], evidenceIds: ['EV-DEV02-R1'], failureDisposition: 'NEEDS_REVIEW' }],
    edges: hybrid ? [{ edgeId: 'edge-handoff', fromNodeId: 'intent-generated', toNodeId: 'intent-handoff', edgeType: 'TIME_ANCHOR' }] : [], preservationIntents: [], unresolvedRequirements: [],
  };
}

function openAI(model: string, artifact: unknown) { return { id: `resp-${model}`, model, status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(artifact) }] }], usage: { input_tokens: 8_000, output_tokens: 700, output_tokens_details: { reasoning_tokens: 200 }, total_tokens: 8_700 } }; }
function google(model: string, artifact: unknown) { return { responseId: `resp-${model}`, modelVersion: model, candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(artifact) }] } }], usageMetadata: { promptTokenCount: 8_000, candidatesTokenCount: 500, thoughtsTokenCount: 200, totalTokenCount: 8_700 } }; }
function response(body: unknown): Response { return new Response(JSON.stringify(body), { status: 200 }); }

type Plan = Awaited<ReturnType<typeof buildStage2RoutingSmokePreflightV2>> & { planHash: string; routeSourcePlanHash: string; canonicalBlueprintHash: string; routes: Array<{ routeId: string; requestModel: string }>; rows: Array<{ packetHash: string; priorArtifactHash: string; localInputTokenUpperBound: number | null; maxInputTokens: number }>; spend: { plannedProviderCalls: number; absoluteMaxSpendUsd: number }; exclusions: Array<{ routeId: string; reason: string }> };
type CurrentDevelopmentPlan = Awaited<ReturnType<typeof buildDevelopmentSmokePreflightV2>> & { planHash: string; routes: Array<{ routeId: string; requestModel: string }> };
type Receipt = { rows: Array<{ run: { disposition: string }; routingEvaluation: { disposition: string; routeClassification: string; candidateCoverage: string; graphCoverage: string; capabilityHonesty: string; diagnostics: string[] } }>; actualProviderCostUsd: number };
