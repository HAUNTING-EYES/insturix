import { describe, expect, it } from 'vitest';

import {
  buildStage3EvidenceBindingSmokePreflightV2,
  evaluateStage3EvidenceBindingArtifactV2,
  runStage3EvidenceBindingSmokeV2,
} from '@/lib/editron/research/open-ended-planner/stage3-evidence-binding-smoke-v2';

describe('open-ended planner V2 isolated Stage-3 evidence-binding smoke', () => {
  it('freezes Luna and Terra against one canonical intent and evidence pack', async () => {
    const plan = await buildStage3EvidenceBindingSmokePreflightV2() as Plan;
    expect(plan.planHash).toBe('9aa1eba2d48dd5e3a0cc2abb7769fc8f80b37a1047f88af220bd63e7c7303343');
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
  const allNodes = ['node-source-resolution', 'node-generated-island', 'node-native-continuation', 'node-proof'];
  return {
    artifactType: 'EvidenceBoundIntentGraphV2', taskId: 'DEV-02', stageDisposition: 'CAPABILITY_GAP',
    nodes: [
      { intentNodeId: 'node-source-resolution', candidateCapabilityIds: ['inspect_user_asset', 'resolve_user_asset_overlay'], evidenceBindingIds: ['binding-project', 'binding-sources', 'binding-policy'], preservationIds: ['preserve-reference-not-inserted'], proofObligationIds: ['proof-revision-freshness', 'proof-asset-rights', 'proof-source-ranges'], bindingStatus: 'BOUND', unresolvedRequirementIds: [] },
      { intentNodeId: 'node-generated-island', candidateCapabilityIds: ['generated_composition_program'], evidenceBindingIds: ['binding-project', 'binding-sources', 'binding-reference', 'binding-support', 'binding-policy'], preservationIds: ['preserve-reference-not-inserted', 'preserve-title-legibility'], proofObligationIds: ['proof-rendered-geometry', 'proof-rendered-legibility', 'proof-sandbox-compile'], bindingStatus: 'BOUND', unresolvedRequirementIds: ['req-generated-owner', 'req-exact-easing'] },
      { intentNodeId: 'node-native-continuation', candidateCapabilityIds: ['get_timeline_view', 'resolve_user_asset_overlay'], evidenceBindingIds: ['binding-project', 'binding-continuity', 'binding-policy'], preservationIds: ['preserve-following-timing', 'preserve-project-duration'], proofObligationIds: ['proof-boundary-continuity', 'proof-state-reload'], bindingStatus: 'BOUND', unresolvedRequirementIds: [] },
      { intentNodeId: 'node-proof', candidateCapabilityIds: ['read_project_file', 'get_timeline_view'], evidenceBindingIds: ['binding-project', 'binding-reference', 'binding-continuity', 'binding-policy'], preservationIds: ['preserve-following-timing', 'preserve-project-duration', 'preserve-title-legibility'], proofObligationIds: ['proof-revision-freshness', 'proof-rendered-geometry', 'proof-rendered-legibility', 'proof-boundary-continuity', 'proof-state-reload'], bindingStatus: 'BOUND', unresolvedRequirementIds: ['req-exact-easing'] },
    ],
    evidenceBindings: [
      { bindingId: 'binding-project', factIds: ['fact-project-revision', 'fact-project-timebase', 'fact-project-target-range', 'fact-project-canvas'], nodeIds: allNodes, status: 'BOUND' },
      { bindingId: 'binding-sources', factIds: ['fact-source-dev02-wide', 'fact-source-dev02-close', 'fact-source-windows'], nodeIds: ['node-source-resolution', 'node-generated-island'], status: 'BOUND' },
      { bindingId: 'binding-reference', factIds: ['fact-source-dev02-reference', 'fact-reference-observation'], nodeIds: ['node-generated-island', 'node-proof'], status: 'BOUND' },
      { bindingId: 'binding-continuity', factIds: ['fact-exit-continuity'], nodeIds: ['node-native-continuation', 'node-proof'], status: 'BOUND' },
      { bindingId: 'binding-support', factIds: ['fact-support-generated-composition'], nodeIds: ['node-generated-island'], status: 'BOUND' },
      { bindingId: 'binding-policy', factIds: ['fact-rights-policy', 'fact-privacy-egress-policy'], nodeIds: allNodes, status: 'BOUND' },
    ],
    rightsDecision: { decisionId: 'rights-dev02', status: 'ALLOWED', policyFactIds: ['fact-rights-policy'], allowedAssetIds: ['dev02-wide', 'dev02-close'], deniedActions: ['INSERT_REFERENCE_MEDIA', 'REMOTE_MEDIA_RETRIEVAL', 'UNDECLARED_ASSET_USE'], reasonCodes: ['INTERNAL_OWNED_FIXTURES_ONLY'] },
    privacyDecision: { decisionId: 'privacy-dev02', status: 'ALLOWED', policyFactIds: ['fact-privacy-egress-policy'], egressDisposition: 'DENIED', reasonCodes: ['SYNTHETIC_ONLY_NO_EGRESS'] },
    revisionBinding: { projectId: 'oe-dev-02', expectedProjectRevision: 'R3', timebaseFactId: 'fact-project-timebase', status: 'BOUND' },
    preservationBindings: [
      { preservationId: 'preserve-reference-not-inserted', factIds: ['fact-source-dev02-reference', 'fact-rights-policy'], status: 'BOUND' },
      { preservationId: 'preserve-following-timing', factIds: ['fact-project-revision', 'fact-exit-continuity'], status: 'BOUND' },
      { preservationId: 'preserve-project-duration', factIds: ['fact-project-revision', 'fact-project-timebase'], status: 'BOUND' },
      { preservationId: 'preserve-title-legibility', factIds: ['fact-project-canvas', 'fact-project-target-range', 'fact-reference-observation'], status: 'BOUND' },
    ],
    proofPlan: [
      proof('proof-revision-freshness', 'REVISION_FRESHNESS', ['node-source-resolution', 'node-proof'], ['claim-user-exit-continuity'], ['fact-project-revision']),
      proof('proof-asset-rights', 'ASSET_IDENTITY_RIGHTS', ['node-source-resolution'], ['claim-user-varied-crops'], ['fact-source-dev02-wide', 'fact-source-dev02-close', 'fact-rights-policy']),
      proof('proof-source-ranges', 'SOURCE_RANGE_HANDLES', ['node-source-resolution', 'node-native-continuation'], ['claim-user-varied-crops', 'claim-user-exit-continuity'], ['fact-source-windows', 'fact-exit-continuity']),
      proof('proof-rendered-geometry', 'RENDERED_GEOMETRY', ['node-generated-island', 'node-proof'], ['claim-user-stacked-layout'], ['fact-project-canvas', 'fact-project-target-range', 'fact-reference-observation']),
      proof('proof-rendered-legibility', 'RENDERED_LEGIBILITY', ['node-generated-island', 'node-proof'], ['claim-user-centred-title'], ['fact-project-canvas', 'fact-reference-observation']),
      proof('proof-boundary-continuity', 'BOUNDARY_CONTINUITY', ['node-native-continuation', 'node-proof'], ['claim-user-exit-continuity'], ['fact-exit-continuity', 'fact-project-timebase']),
      proof('proof-sandbox-compile', 'SANDBOX_COMPILE', ['node-generated-island'], ['claim-user-stacked-layout'], ['fact-support-generated-composition']),
      proof('proof-state-reload', 'STATE_RELOAD', ['node-native-continuation', 'node-proof'], ['claim-user-exit-continuity'], ['fact-project-revision', 'fact-exit-continuity']),
    ],
    unresolvedRequirements: [
      { requirementId: 'req-generated-owner', kind: 'CAPABILITY', factIds: ['fact-support-generated-composition'], disposition: 'CAPABILITY_GAP' },
      { requirementId: 'req-exact-easing', kind: 'AMBIGUITY', factIds: ['fact-reference-observation'], disposition: 'NEEDS_REVIEW' },
    ],
  };
}

function proof(proofObligationId: string, kind: string, nodeIds: string[], targetClaimIds: string[], requiredFactIds: string[]) { return { proofObligationId, kind, nodeIds, targetClaimIds, requiredFactIds, status: 'PLANNED' }; }
function openAI(model: string, artifact: unknown) { return { id: `resp-${model}`, model, status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(artifact) }] }], usage: { input_tokens: 7_200, output_tokens: 1_800, output_tokens_details: { reasoning_tokens: 400 }, total_tokens: 9_000 } }; }
function response(body: unknown): Response { return new Response(JSON.stringify(body), { status: 200 }); }

type Plan = Awaited<ReturnType<typeof buildStage3EvidenceBindingSmokePreflightV2>> & { planHash: string; canonicalIntentHash: string; rows: Array<{ packetHash: string; priorArtifactHash: string; localInputTokenUpperBound: number; maxInputTokens: number }>; spend: { plannedProviderCalls: number; absoluteMaxSpendUsd: number }; exclusions: Array<{ routeId: string; reason: string }> };
type Receipt = { rows: Array<{ run: { disposition: string }; evidenceBindingEvaluation: { disposition: string; diagnostics: string[] } }>; actualProviderCostUsd: number };
