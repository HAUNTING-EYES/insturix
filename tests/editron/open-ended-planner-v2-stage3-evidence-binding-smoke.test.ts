import { describe, expect, it } from 'vitest';

import canonicalEvidenceBoundIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';

import {
  buildStage3EvidenceBindingSmokePreflightV2,
  evaluateStage3EvidenceBindingArtifactV2,
  runStage3EvidenceBindingSmokeV2,
} from '@/lib/editron/research/open-ended-planner/stage3-evidence-binding-smoke-v2';

describe('open-ended planner V2 isolated Stage-3 evidence-binding smoke', () => {
  it('freezes Luna and Terra against one canonical intent and evidence pack', async () => {
    const plan = await buildStage3EvidenceBindingSmokePreflightV2() as Plan;
    expect(plan.planHash).toBe('7dd99573b5afdcebcc8f3e4616db54a62e4211e5e1ba2a1396180539f92c8b9c');
    expect(plan.packetHash).toBe('bc561a66bc15e0d914e47d905ad4629b01fdb92fac519a5fc1d3720d30a1762a');
    expect(plan.rows).toHaveLength(2);
    expect(plan.spend).toMatchObject({ plannedProviderCalls: 2, absoluteMaxSpendUsd: 0.4 });
    expect(new Set(plan.rows.map(({ packetHash }) => packetHash)).size).toBe(1);
    expect(new Set(plan.rows.map(({ priorArtifactHash }) => priorArtifactHash))).toEqual(new Set([plan.canonicalIntentHash]));
    expect(plan.rows.every(({ localInputTokenUpperBound, maxInputTokens }) => localInputTokenUpperBound <= maxInputTokens)).toBe(true);
    expect(plan.exclusions).toContainEqual({ routeId: 'QWEN_3_8_MAX', reason: 'STANDARD_APPLICATION_API_KEY_NOT_AVAILABLE_FOR_AUTOMATED_BENCHMARK' });
  });

  it('accepts exact bindings while keeping the generated owner capability-blocked', async () => {
    const plan = await buildStage3EvidenceBindingSmokePreflightV2() as Plan;
    const receipt = await runStage3EvidenceBindingSmokeV2({
      expectedPlanHash: plan.planHash, maxAuthorizedSpendUsd: 0.4, operatorId: 'admin', confirmedAt: '2026-08-14T00:00:00.000Z',
      environment: { OPENAI_API_KEY: 'openai-secret-sentinel' },
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(String(init?.body)) as { model?: string };
        return response(openAI(request.model ?? 'openai-test', boundArtifact()));
      },
    }) as Receipt;
    expect(receipt.rows).toHaveLength(2);
    expect(receipt.rows.every(({ run }) => run.disposition === 'ARTIFACT_ACCEPTED')).toBe(true);
    expect(receipt.rows.every(({ evidenceBindingEvaluation }) => evidenceBindingEvaluation.disposition === 'CAPABILITY_BLOCKED')).toBe(true);
    expect(receipt.rows.every(({ evidenceBindingEvaluation }) => evidenceBindingEvaluation.diagnostics.length === 0)).toBe(true);
    expect(receipt.actualProviderCostUsd).toBeGreaterThan(0);
    expect(JSON.stringify(receipt)).not.toContain('openai-secret-sentinel');
  });

  it('rejects invented facts, revision drift, and false readiness independently of schema validity', () => {
    const invented = boundArtifact();
    invented.evidenceBindings[0].factIds.push('fact-invented');
    expect(evaluateStage3EvidenceBindingArtifactV2(invented)).toMatchObject({ disposition: 'FAIL', factIntegrity: 'FAIL' });
    expect(evaluateStage3EvidenceBindingArtifactV2(invented).diagnostics).toContain('UNKNOWN_FACT_ID:fact-invented');

    const stale = boundArtifact();
    stale.revisionBinding.expectedProjectRevision = 'R2';
    expect(evaluateStage3EvidenceBindingArtifactV2(stale)).toMatchObject({ disposition: 'FAIL', revisionBinding: 'FAIL' });

    const partial = boundArtifact();
    partial.evidenceBindings[0].status = 'PARTIAL';
    expect(evaluateStage3EvidenceBindingArtifactV2(partial)).toMatchObject({ disposition: 'FAIL', factIntegrity: 'FAIL' });

    const falseReady = boundArtifact();
    falseReady.stageDisposition = 'READY_FOR_COMPILATION';
    falseReady.unresolvedRequirements = [];
    falseReady.nodes.forEach((node) => { node.unresolvedRequirementIds = []; });
    expect(evaluateStage3EvidenceBindingArtifactV2(falseReady)).toMatchObject({ disposition: 'FAIL', capabilityHonesty: 'FAIL' });
  });
});

function boundArtifact() {
  return structuredClone(canonicalEvidenceBoundIntentJson);
}

function openAI(model: string, artifact: unknown) { return { id: `resp-${model}`, model, status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(artifact) }] }], usage: { input_tokens: 7_200, output_tokens: 1_800, output_tokens_details: { reasoning_tokens: 400 }, total_tokens: 9_000 } }; }
function response(body: unknown): Response { return new Response(JSON.stringify(body), { status: 200 }); }

type Plan = Awaited<ReturnType<typeof buildStage3EvidenceBindingSmokePreflightV2>> & { planHash: string; packetHash: string; canonicalIntentHash: string; rows: Array<{ packetHash: string; priorArtifactHash: string; localInputTokenUpperBound: number; maxInputTokens: number }>; spend: { plannedProviderCalls: number; absoluteMaxSpendUsd: number }; exclusions: Array<{ routeId: string; reason: string }> };
type Receipt = { rows: Array<{ run: { disposition: string }; evidenceBindingEvaluation: { disposition: string; diagnostics: string[] } }>; actualProviderCostUsd: number };
