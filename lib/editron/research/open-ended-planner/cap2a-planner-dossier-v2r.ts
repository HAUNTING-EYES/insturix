import { CAP2_ATOMIC_OPERATION_CATALOG_V1 } from '../capability-census/cap2-atomic-operation-catalog-v1';
import { deepFreezeV1 } from './contracts-v1';
import {
  CAP2A_PLANNER_BRIDGE_V2R,
  cap2aBridgeConfidenceV2R,
  cap2aOperatorIdForSpecOperatorV2R,
} from './cap2a-planner-bridge-v2r';

type JsonRecord = Record<string, unknown>;

// Builds the rich planner tool sheet: the executable spec catalog (the IDs the
// lowerer compiles) enriched, per operator, with the CAP-2A atomic-operation
// dossier (the code-grounded 16-dimension census record) via the declared bridge.
// Operators with no bridged CAP-2A record keep their spec entry and are marked
// cap2a: null so the model can see the coverage gap honestly.

export interface Cap2aEnrichedOperatorV2R {
  operatorId: string;
  kind: string;
  supportStatus: string;
  compilerEligibility: string;
  input: JsonRecord;
  output: JsonRecord;
  stateEffects: readonly string[];
  proof: readonly string[];
  cap2a: {
    cap2aOperatorId: string;
    bridgeConfidence: string;
    family: string;
    plannerEligibility: string;
    certificationStatus: string;
    surfaces: JsonRecord;
    owners: JsonRecord;
    contract: JsonRecord;
    effects: JsonRecord;
    execution: JsonRecord;
    verification: JsonRecord;
    recovery: JsonRecord;
    policy: JsonRecord;
    resources: JsonRecord;
  } | null;
}

const cap2aOperationsById = new Map<string, JsonRecord>(
  ((CAP2_ATOMIC_OPERATION_CATALOG_V1 as JsonRecord).operations as JsonRecord[])
    .map((operation) => [String(operation.operatorId), operation]),
);

export function buildCap2aEnrichedCatalogV2R(
  specOperators: readonly JsonRecord[],
): readonly Readonly<Cap2aEnrichedOperatorV2R>[] {
  const enriched = specOperators.map((operator) => {
    const specOperatorId = String(operator.operatorId);
    const cap2aOperatorId = cap2aOperatorIdForSpecOperatorV2R(specOperatorId);
    const cap2aRecord = cap2aOperatorId ? cap2aOperationsById.get(cap2aOperatorId) : undefined;
    const cap2a = cap2aRecord && cap2aOperatorId
      ? {
          cap2aOperatorId,
          bridgeConfidence: String(cap2aBridgeConfidenceV2R(specOperatorId)),
          family: String(cap2aRecord.family ?? ''),
          plannerEligibility: String((cap2aRecord.support as JsonRecord)?.plannerEligibility ?? ''),
          certificationStatus: String((cap2aRecord.support as JsonRecord)?.certificationStatus ?? ''),
          surfaces: (cap2aRecord.surfaces ?? {}) as JsonRecord,
          owners: (cap2aRecord.owners ?? {}) as JsonRecord,
          contract: (cap2aRecord.contract ?? {}) as JsonRecord,
          effects: (cap2aRecord.effects ?? {}) as JsonRecord,
          execution: (cap2aRecord.execution ?? {}) as JsonRecord,
          verification: (cap2aRecord.verification ?? {}) as JsonRecord,
          recovery: (cap2aRecord.recovery ?? {}) as JsonRecord,
          policy: (cap2aRecord.policy ?? {}) as JsonRecord,
          resources: (cap2aRecord.resources ?? {}) as JsonRecord,
        }
      : null;
    return deepFreezeV1({
      operatorId: specOperatorId,
      kind: String(operator.kind ?? ''),
      supportStatus: String(operator.supportStatus ?? ''),
      compilerEligibility: String(operator.compilerEligibility ?? ''),
      input: (operator.input ?? {}) as JsonRecord,
      output: (operator.output ?? {}) as JsonRecord,
      stateEffects: (operator.stateEffects ?? []) as readonly string[],
      proof: (operator.proof ?? []) as readonly string[],
      cap2a,
    });
  });
  return deepFreezeV1(enriched);
}

export function cap2aEnrichmentCoverageV2R(
  specOperators: readonly JsonRecord[],
): Readonly<{ total: number; enriched: number; unmapped: string[]; bridgeRows: number }> {
  const unmapped = specOperators
    .map((operator) => String(operator.operatorId))
    .filter((specOperatorId) => !cap2aOperatorIdForSpecOperatorV2R(specOperatorId));
  return deepFreezeV1({
    total: specOperators.length,
    enriched: specOperators.length - unmapped.length,
    unmapped,
    bridgeRows: CAP2A_PLANNER_BRIDGE_V2R.rows.length,
  });
}
