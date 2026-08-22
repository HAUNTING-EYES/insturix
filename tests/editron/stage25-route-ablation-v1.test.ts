import { describe, expect, it } from 'vitest';

import { getCanonicalDev02V2RV2 } from '@/lib/editron/research/open-ended-planner/dev02-canonical-v2r-v2';
import {
  buildStage25RouteAblationEvaluatorFreezeV1,
  evaluateStage25RouteAblationArtifactV1,
} from '@/lib/editron/research/open-ended-planner/stage25-route-ablation-evaluator-v1';
import {
  buildStage25RouteAblationPacketV1,
  buildStage25RouteAblationProviderManifestV1,
  stage25RouteAblationTargetClaimIdsV1,
  type Stage25RouteAblationScopeIdV1,
} from '@/lib/editron/research/open-ended-planner/stage25-route-ablation-v1';

type JsonRecord = Record<string, unknown>;

describe('Stage 2.5 native/generated/hybrid route ablation V1', () => {
  it('freezes eight no-provider rows with identical evidence and tool truth within each scope', () => {
    const manifest = buildStage25RouteAblationProviderManifestV1();
    expect(manifest.rows).toHaveLength(8);
    expect(manifest.authority).toBe('RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION');
    for (const scopeId of ['DEV02_BOUNDED_FILMSTRIP_ISLAND', 'DEV02_FULL_REQUESTED_SECTION'] as const) {
      const rows = manifest.rows.filter((row) => row.scopeId === scopeId);
      expect(rows).toHaveLength(4);
      expect(new Set(rows.map((row) => JSON.stringify(row.fairnessBinding))).size).toBe(1);
      expect(rows.map((row) => row.arm).sort()).toEqual([
        'FORCED_GENERATED_COMPOSITION', 'FORCED_HYBRID', 'FORCED_NATIVE', 'FREE_CHOICE',
      ]);
      for (const row of rows) {
        const catalog = row.artifact.packet.modelInput.operatorCatalog as { operators: unknown[] };
        expect(catalog.operators).toHaveLength(40);
        expect(row.artifact.packet.modelInput.routeAblationFairnessBinding).toEqual(row.fairnessBinding);
      }
    }
  });

  it('keeps the hidden free-choice gold out of every provider packet', () => {
    const manifest = buildStage25RouteAblationProviderManifestV1();
    const evaluator = buildStage25RouteAblationEvaluatorFreezeV1();
    expect(evaluator.freeChoiceGold).toEqual({
      DEV02_BOUNDED_FILMSTRIP_ISLAND: 'GENERATED_COMPOSITION',
      DEV02_FULL_REQUESTED_SECTION: 'HYBRID',
    });
    for (const row of manifest.rows) {
      const serialized = JSON.stringify(row.artifact.packet);
      expect(serialized).not.toContain(evaluator.policySha256);
      expect(serialized).not.toMatch(/freeChoiceGold|preferredRoute|expectedExecutionForm|baselineDisposition/);
      expect(serialized).toContain('operationCountRoutingForbidden');
    }
  });

  it('accepts the canonical full-section hybrid as blocked-but-honest research planning', () => {
    const row = buildStage25RouteAblationPacketV1({
      scopeId: 'DEV02_FULL_REQUESTED_SECTION', arm: 'FREE_CHOICE',
    });
    const artifact = structuredClone(getCanonicalDev02V2RV2().editorialIntent);
    const result = evaluateStage25RouteAblationArtifactV1({ row, artifact });
    expect(result).toMatchObject({
      disposition: 'PASS', routeClassification: 'PASS', claimCoverage: 'PASS',
      operatorSelection: 'PASS', capabilityHonesty: 'PASS',
    });
  });

  it('accepts a bounded generated-island plan without misclassifying native read/resolver plumbing as hybrid', () => {
    const scopeId = 'DEV02_BOUNDED_FILMSTRIP_ISLAND' as const;
    const row = buildStage25RouteAblationPacketV1({
      scopeId, arm: 'FORCED_GENERATED_COMPOSITION',
    });
    const artifact = generatedIslandArtifact(scopeId);
    const result = evaluateStage25RouteAblationArtifactV1({ row, artifact });
    expect(result).toMatchObject({ disposition: 'PASS', routeClassification: 'PASS', claimCoverage: 'PASS' });
  });

  it('accepts an honest forced-native capability gap instead of rewarding a fabricated native owner', () => {
    const scopeId = 'DEV02_FULL_REQUESTED_SECTION' as const;
    const row = buildStage25RouteAblationPacketV1({ scopeId, arm: 'FORCED_NATIVE' });
    const result = evaluateStage25RouteAblationArtifactV1({ row, artifact: gapArtifact(scopeId, 'NATIVE') });
    expect(result).toMatchObject({
      disposition: 'HONEST_CAPABILITY_GAP', routeClassification: 'PASS', capabilityHonesty: 'PASS',
    });
  });

  it('rejects arm drift, unknown operators, missing hard claims, false eligibility and step-count shortcuts', () => {
    const scopeId = 'DEV02_BOUNDED_FILMSTRIP_ISLAND' as const;
    const row = buildStage25RouteAblationPacketV1({ scopeId, arm: 'FORCED_GENERATED_COMPOSITION' });
    const armDrift = generatedIslandArtifact(scopeId);
    armDrift.executionForm = 'NATIVE';
    expect(evaluateStage25RouteAblationArtifactV1({ row, artifact: armDrift }).diagnostics)
      .toContain('SCHEMA:$.executionForm:ENUM');

    const unknown = generatedIslandArtifact(scopeId);
    (unknown.nodes as JsonRecord[])[0].selectedOperatorId = 'invented_panel_owner';
    expect(evaluateStage25RouteAblationArtifactV1({ row, artifact: unknown }).diagnostics)
      .toContain('SELECTED_OPERATOR_UNKNOWN:node-inspect-source:invented_panel_owner');

    const missingClaim = generatedIslandArtifact(scopeId);
    const candidate = ((missingClaim.routeDecision as JsonRecord).candidateForms as JsonRecord[])[0];
    candidate.claimCoverage = (candidate.claimCoverage as JsonRecord[])
      .filter((entry) => entry.claimId !== 'claim-user-centred-title');
    expect(evaluateStage25RouteAblationArtifactV1({ row, artifact: missingClaim }).diagnostics)
      .toContain('CLAIM_COVERAGE_MISSING:claim-user-centred-title');

    const falseEligibility = generatedIslandArtifact(scopeId);
    (((falseEligibility.routeDecision as JsonRecord).candidateForms as JsonRecord[])[0]).hardGateStatus = 'ELIGIBLE';
    expect(evaluateStage25RouteAblationArtifactV1({ row, artifact: falseEligibility }).diagnostics)
      .toContain('UNCERTIFIED_ROUTE_FALSELY_MARKED_ELIGIBLE');

    const shortcut = generatedIslandArtifact(scopeId);
    (shortcut.routeDecision as JsonRecord).selectedReasonCodes = ['MORE_THAN_FOUR_STEPS'];
    expect(evaluateStage25RouteAblationArtifactV1({ row, artifact: shortcut }).diagnostics)
      .toContain('OPERATION_COUNT_ROUTING_SHORTCUT');
  });

  it('rejects a naked capability-gap label without a gap node and unresolved requirement', () => {
    const scopeId = 'DEV02_FULL_REQUESTED_SECTION' as const;
    const row = buildStage25RouteAblationPacketV1({ scopeId, arm: 'FORCED_NATIVE' });
    const artifact = gapArtifact(scopeId, 'NATIVE');
    artifact.unresolvedRequirements = [];
    expect(evaluateStage25RouteAblationArtifactV1({ row, artifact }).diagnostics)
      .toContain('CAPABILITY_GAP_NOT_STRUCTURED');
  });
});

function generatedIslandArtifact(scopeId: Stage25RouteAblationScopeIdV1): JsonRecord {
  const canonical = structuredClone(getCanonicalDev02V2RV2().editorialIntent) as JsonRecord;
  const targetClaimIds = stage25RouteAblationTargetClaimIdsV1(scopeId);
  const canonicalDecision = canonical.routeDecision as JsonRecord;
  const canonicalCandidate = (canonicalDecision.candidateForms as JsonRecord[])[0];
  const allowedNodeIds = new Set(['node-inspect-source', 'node-resolve-source', 'node-generated-island']);
  const nodes = (canonical.nodes as JsonRecord[]).filter((node) => allowedNodeIds.has(String(node.intentNodeId)));
  return {
    ...canonical,
    executionForm: 'GENERATED_COMPOSITION',
    routeDecision: {
      scopeClassification: 'BOUNDED_GENERATED_ISLAND', coverageStatus: 'COMPLETE',
      candidateForms: [{
        ...canonicalCandidate, form: 'GENERATED_COMPOSITION', hardGateStatus: 'INELIGIBLE',
        claimCoverage: (canonicalCandidate.claimCoverage as JsonRecord[])
          .filter((entry) => targetClaimIds.includes(String(entry.claimId))),
      }],
      selectedReasonCodes: ['RELATIONAL_BOUNDED_COMPOSITION'],
      generatedIslandClaimIds: targetClaimIds,
      nativeSurroundClaimIds: [],
    },
    nodes,
    edges: (canonical.edges as JsonRecord[])
      .filter((edge) => allowedNodeIds.has(String(edge.fromNodeId)) && allowedNodeIds.has(String(edge.toNodeId))),
    unresolvedRequirements: canonical.unresolvedRequirements,
  };
}

function gapArtifact(scopeId: Stage25RouteAblationScopeIdV1, form: 'NATIVE' | 'GENERATED_COMPOSITION'): JsonRecord {
  const claimIds = stage25RouteAblationTargetClaimIdsV1(scopeId);
  return {
    artifactType: 'EditorialIntentGraphV2', taskId: 'DEV-02', executionForm: 'CAPABILITY_GAP',
    routeDecision: {
      scopeClassification: form === 'NATIVE' ? 'NATIVE_ONLY_PLAN' : 'BOUNDED_GENERATED_ISLAND',
      coverageStatus: 'INCOMPLETE', candidateForms: [{
        form, hardGateStatus: 'INELIGIBLE',
        claimCoverage: claimIds.map((claimId) => ({
          claimId, status: 'UNCOVERED', ownerRefs: [], reasonCodes: ['CAPABILITY_NOT_AVAILABLE'],
        })),
        representabilitySignals: [], blockers: ['CAPABILITY_NOT_AVAILABLE'], ownerRefs: [], evidenceIds: [],
      }],
      selectedReasonCodes: ['HONEST_CAPABILITY_GAP'], generatedIslandClaimIds: [], nativeSurroundClaimIds: [],
    },
    nodes: [{
      intentNodeId: 'node-capability-gap', operationFamily: 'relational_panel_baseline',
      targetClaimIds: claimIds, selectedOperatorId: null,
      alternativeOperatorIds: form === 'NATIVE' ? ['set_keyframes', 'add_overlay'] : ['generated_composition_program'],
      executionForm: form, requiresNodeIds: [], invalidates: [], evidenceIds: ['EV-DEV02-R1'],
      failureDisposition: 'CAPABILITY_GAP',
    }],
    edges: [], preservationIntents: [],
    unresolvedRequirements: [{
      requirementId: 'route-baseline-owner-missing', kind: 'CAPABILITY',
      detail: 'No currently eligible owner covers the forced baseline.', targetClaimIds: claimIds,
      disposition: 'CAPABILITY_GAP',
    }],
  };
}
