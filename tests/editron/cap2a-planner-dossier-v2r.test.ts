import { describe, expect, it } from 'vitest';

import {
  CAP2A_PLANNER_BRIDGE_V2R,
  cap2aBridgeConfidenceV2R,
  cap2aOperatorIdForSpecOperatorV2R,
} from '@/lib/editron/research/open-ended-planner/cap2a-planner-bridge-v2r';
import {
  buildCap2aEnrichedCatalogV2R,
  cap2aPlannerDossierIdentityV2R,
  cap2aEnrichmentCoverageV2R,
} from '@/lib/editron/research/open-ended-planner/cap2a-planner-dossier-v2r';
import specJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

const specOperators = (specJson as { operators: Array<Record<string, unknown>> }).operators;

describe('CAP-2A planner bridge', () => {
  it('is frozen, versioned, and declares only research authority', () => {
    expect(Object.isFrozen(CAP2A_PLANNER_BRIDGE_V2R)).toBe(true);
    expect(CAP2A_PLANNER_BRIDGE_V2R.authority).toBe('RESEARCH_ONLY_DECLARED_SEMANTIC_MAPPING');
    expect(CAP2A_PLANNER_BRIDGE_V2R.rows.length).toBeGreaterThan(0);
  });

  it('has unique spec operator ids and unique cap2a operator ids', () => {
    const specIds = CAP2A_PLANNER_BRIDGE_V2R.rows.map(({ specOperatorId }) => specOperatorId);
    const capIds = CAP2A_PLANNER_BRIDGE_V2R.rows.map(({ cap2aOperatorId }) => cap2aOperatorId);
    expect(new Set(specIds).size).toBe(specIds.length);
    expect(new Set(capIds).size).toBe(capIds.length);
  });

  it('every bridged spec operator exists in the executable spec catalog', () => {
    const specIds = new Set(specOperators.map(({ operatorId }) => String(operatorId)));
    for (const { specOperatorId } of CAP2A_PLANNER_BRIDGE_V2R.rows) {
      expect(specIds.has(specOperatorId), specOperatorId).toBe(true);
    }
  });

  it('resolves lookups and confidence', () => {
    expect(cap2aOperatorIdForSpecOperatorV2R('resolve_transcript_edit')).toBe('transcript.resolve-edit');
    expect(cap2aBridgeConfidenceV2R('resolve_transcript_edit')).toBe('ENTRYPOINT_EXACT');
    expect(cap2aOperatorIdForSpecOperatorV2R('not_a_real_operator')).toBeNull();
    expect(cap2aBridgeConfidenceV2R('not_a_real_operator')).toBeNull();
  });
});

describe('CAP-2A enriched planner dossier', () => {
  it('attaches a rich CAP-2A record to bridged operators and null to unmapped ones', () => {
    const enriched = buildCap2aEnrichedCatalogV2R(specOperators);
    expect(enriched.length).toBe(specOperators.length);
    const bridged = enriched.find(({ selectableOperatorId }) => (
      selectableOperatorId === 'resolve_transcript_edit'
    ));
    expect(bridged?.cap2a).not.toBeNull();
    expect(bridged?.selectableOperatorId).toBe('resolve_transcript_edit');
    expect(bridged?.selectionRule).toBe('COPY_SELECTABLE_OPERATOR_ID_TO_NODE_SELECTED_OPERATOR_ID');
    expect(bridged?.cap2a?.censusRecordId).toBe('transcript.resolve-edit');
    expect(bridged?.cap2a?.identifierRole).toBe('REFERENCE_ONLY_NOT_SELECTABLE');
    expect(JSON.stringify(bridged)).not.toContain('cap2aOperatorId');
    expect(bridged?.cap2a?.family).toBeTruthy();
    expect(bridged?.cap2a?.policy).toBeTruthy();
    expect(bridged?.cap2a?.verification).toBeTruthy();
    expect(bridged?.cap2a?.owners).toBeTruthy();
    // Executable spec fields remain present alongside the dossier.
    expect(bridged?.kind).toBeTruthy();
    expect(bridged?.input).toBeTruthy();
  });

  it('reports honest coverage including unmapped operators', () => {
    const coverage = cap2aEnrichmentCoverageV2R(specOperators);
    expect(coverage.total).toBe(specOperators.length);
    expect(coverage.enriched).toBeGreaterThan(0);
    expect(coverage.enriched).toBeLessThanOrEqual(coverage.total);
    expect(coverage.unmapped.length).toBe(coverage.total - coverage.enriched);
    expect(coverage.bridgeRows).toBe(CAP2A_PLANNER_BRIDGE_V2R.rows.length);
  });

  it('is immutable', () => {
    const enriched = buildCap2aEnrichedCatalogV2R(specOperators);
    expect(Object.isFrozen(enriched)).toBe(true);
    const identity = cap2aPlannerDossierIdentityV2R();
    expect(Object.isFrozen(identity)).toBe(true);
    expect(identity.selectableIdField).toBe('selectableOperatorId');
    expect(identity.censusIdRole).toBe('REFERENCE_ONLY_NOT_SELECTABLE');
    expect(identity.identitySha256).toHaveLength(64);
  });
});
