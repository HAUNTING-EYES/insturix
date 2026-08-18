import { deepFreezeV1 } from './contracts-v1';
import type { GenericLoweringPolicyV2R } from './generic-lowerer-v2r';

// Frozen DEV-02 (difficult-reference hybrid / generated island) field-binding policy.
//
// DEV-02 asks to recreate a stacked moving-panel reference as a bounded generated
// island with a native full-screen continuation. The generated island is expressed by
// generated_composition_program, which is RESEARCH_ONLY_NOT_IMPLEMENTED and therefore
// NOT_COMPILABLE: the lowerer marks that node unresolved and the graph compiles to an
// honest CAPABILITY_GAP with zero executable mutations. The native surround read and
// resolver operators are bound here so a correctly-planned surround is recognized; the
// island itself is the blocker. Semantic asset choice is MODEL_INPUT; structural
// revision/range/evidence values are bound by the lowerer from revision/facts.
export const DEV02_LOWERING_POLICY_V2R: GenericLoweringPolicyV2R = deepFreezeV1({
  policyVersion: 'EDITRON_OE_GENERIC_LOWERING_POLICY_V2R_3',
  taskId: 'DEV-02',
  fieldBindings: {
    projectId: { source: 'REVISION_PROJECT_ID' },
    expectedProjectRevision: { source: 'REVISION_EXPECTED_REVISION' },
    evidenceIds: { source: 'EVIDENCE_IDS' },
    targetRange: { source: 'FACT_FIELD', factKind: 'AUTHORIZED_TARGET_RANGE' },
  },
  operatorFieldBindings: {
    inspect_user_asset: {
      assetId: { source: 'MODEL_INPUT' },
    },
    resolve_user_asset_overlay: {
      assetId: { source: 'MODEL_INPUT' },
    },
    search_user_assets: {
      query: { source: 'MODEL_INPUT' },
    },
  },
});
