import { describe, expect, it } from 'vitest';

import {
  CAP2A_PLANNER_BRIDGE_V2R,
  cap2aBridgeConfidenceV2R,
  cap2aOperatorIdForSpecOperatorV2R,
} from '@/lib/editron/research/open-ended-planner/cap2a-planner-bridge-v2r';
import {
  buildCap2aEnrichedCatalogV2R,
  buildCap2aPlannerToolSheetV2R,
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
  it('grounds all forty selectable operators without conflating record IDs with selectable IDs', () => {
    const enriched = buildCap2aEnrichedCatalogV2R(specOperators);
    expect(enriched.length).toBe(specOperators.length);
    expect(enriched).toHaveLength(40);
    expect(enriched.every(({ cap2a }) => cap2a !== null)).toBe(true);
    const bridged = enriched.find(({ selectableOperatorId }) => (
      selectableOperatorId === 'resolve_transcript_edit'
    ));
    expect(bridged?.cap2a).not.toBeNull();
    expect(bridged?.selectableOperatorId).toBe('resolve_transcript_edit');
    expect(bridged?.selectionRule).toBe('COPY_SELECTABLE_OPERATOR_ID_TO_NODE_SELECTED_OPERATOR_ID');
    expect(bridged?.cap2a?.recordId).toBe('transcript.resolve-edit');
    expect(bridged?.cap2a?.recordAuthority).toBe('FROZEN_CAP2A_CENSUS');
    expect(bridged?.cap2a?.identifierRole).toBe('REFERENCE_ONLY_NOT_SELECTABLE');
    expect(JSON.stringify(bridged)).not.toContain('cap2aOperatorId');
    expect(bridged?.cap2a?.family).toBeTruthy();
    expect(bridged?.cap2a?.policy).toBeTruthy();
    expect(bridged?.cap2a?.verification).toBeTruthy();
    expect(bridged?.cap2a?.owners).toBeTruthy();
    expect(bridged?.cap2a?.support).toBeTruthy();
    expect(bridged?.cap2a?.evidenceRefs.length).toBeGreaterThan(0);
    // Executable spec fields remain present alongside the dossier.
    expect(bridged?.kind).toBeTruthy();
    expect(bridged?.input).toBeTruthy();
    expect(bridged?.selectableContractAuthority)
      .toBe('V2R_RESEARCH_NORMALIZED_COMPILER_CONTRACT_NOT_LIVE_CALLABLE');

    const supplemented = enriched.find(({ selectableOperatorId }) => selectableOperatorId === 'cut_section');
    expect(supplemented?.cap2a?.recordAuthority).toBe('V2R_CODE_GROUNDED_SUPPLEMENT');
    expect(supplemented?.cap2a?.recordId).toBe('v2r-supplement.cut_section');
    expect((supplemented?.cap2a?.execution as { revisionSemantics?: string }).revisionSemantics)
      .toBe('UNSAFE_NONE');
  });

  it('reports honest coverage including unmapped operators', () => {
    const coverage = cap2aEnrichmentCoverageV2R(specOperators);
    expect(coverage.total).toBe(specOperators.length);
    expect(coverage.enriched).toBe(40);
    expect(coverage.unmapped).toEqual([]);
    expect(coverage.bridgeRows).toBe(CAP2A_PLANNER_BRIDGE_V2R.rows.length);
    expect(coverage.supplementRows).toBe(14);
    expect(coverage.frozenCensusRecords).toBe(26);
    expect(coverage.supplementalRecords).toBe(14);
  });

  it('is immutable', () => {
    const enriched = buildCap2aEnrichedCatalogV2R(specOperators);
    expect(Object.isFrozen(enriched)).toBe(true);
    const identity = cap2aPlannerDossierIdentityV2R();
    expect(Object.isFrozen(identity)).toBe(true);
    expect(identity.selectableIdField).toBe('selectableOperatorId');
    expect(identity.recordIdRole).toBe('REFERENCE_ONLY_NOT_SELECTABLE');
    expect(identity.supplementSha256).toHaveLength(64);
    expect(identity.identitySha256).toHaveLength(64);
  });

  it('projects all detailed records into a bounded hash-bound planner tool sheet', () => {
    const sheet = buildCap2aPlannerToolSheetV2R(specOperators);
    expect(sheet.operators).toHaveLength(40);
    expect(Object.isFrozen(sheet)).toBe(true);
    expect(sheet.sheetSha256).toHaveLength(64);
    expect(Object.keys(sheet.policyProfiles).length).toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(sheet), 'utf8')).toBeLessThan(130_000);
    const cut = sheet.operators.find(({ operatorId }) => operatorId === 'cut_section');
    expect(cut).toMatchObject({
      operatorId: 'cut_section',
      availability: {
        implementationStatus: 'PARTIAL',
        certificationStatus: 'UNCERTIFIED',
        plannerEligibility: 'ISOLATED_PROPOSAL_ONLY',
        compilerEligibility: 'ISOLATED_PROXY_ONLY',
      },
      execution: { revisionSemantics: 'UNSAFE_NONE', failClosed: false },
      recovery: { undo: 'UNAVAILABLE', replay: 'UNSAFE' },
    });
    expect((cut?.owners as { form?: string }).form).toContain('timeline-range-cut.ts#cutTimelineRange');
    expect((cut?.effects as { invalidates?: string[] }).invalidates).toContain(
      'PROOF|timeline-coordinate and affected-range proofs|PROJECT_TIMEBASE',
    );
    expect((cut?.sourceDossierSha256 as string)).toHaveLength(64);
  });
});
