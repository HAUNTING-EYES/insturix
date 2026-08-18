import { deepFreezeV1 } from './contracts-v1';
import type { GenericLoweringPolicyV2R } from './generic-lowerer-v2r';

// Frozen DEV-04 (honest moving-matte capability gap) field-binding policy.
//
// DEV-04 asks for a title behind a changing moving-person silhouette, which needs
// a moving matte / segmentation track that Editron does not have. The correct model
// behavior is to declare a capability gap, not to fake the edit. The only operators
// that may legitimately compile are the read-only inspection operators; the lowerer
// binds their revision fields and nothing else. Any mutation operator the model might
// select has no binding rules here, so it stays unresolved and the graph cannot be
// turned into an executable edit. The top-level graph-level CAPABILITY_GAP disposition
// (declared by the model) is honored by the lowerer as the compile disposition.
export const DEV04_LOWERING_POLICY_V2R: GenericLoweringPolicyV2R = deepFreezeV1({
  policyVersion: 'EDITRON_OE_GENERIC_LOWERING_POLICY_V2R_2',
  taskId: 'DEV-04',
  fieldBindings: {
    projectId: { source: 'REVISION_PROJECT_ID' },
    expectedProjectRevision: { source: 'REVISION_EXPECTED_REVISION' },
    evidenceIds: { source: 'EVIDENCE_IDS' },
    selector: { source: 'STATIC', staticValue: 'whole-project' },
  },
  operatorFieldBindings: {},
});
