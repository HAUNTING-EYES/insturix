import { CAP2_ATOMIC_OPERATION_CATALOG_V1 } from '../capability-census/cap2-atomic-operation-catalog-v1';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  CAP2A_PLANNER_BRIDGE_V2R,
  cap2aBridgeConfidenceV2R,
  cap2aOperatorIdForSpecOperatorV2R,
} from './cap2a-planner-bridge-v2r';
import {
  CAP2A_PLANNER_SUPPLEMENT_VERSION_V2R,
  CAP2A_PLANNER_SUPPLEMENT_V2R,
  cap2aPlannerSupplementForOperatorV2R,
} from './cap2a-planner-supplement-v2r';

type JsonRecord = Record<string, unknown>;

export const CAP2A_PLANNER_DOSSIER_VERSION_V2R =
  'EDITRON_CAP2A_PLANNER_DOSSIER_V2R_3' as const;

export interface Cap2aPlannerDossierIdentityV2R {
  version: typeof CAP2A_PLANNER_DOSSIER_VERSION_V2R;
  selectableIdField: 'selectableOperatorId';
  selectedNodeField: 'selectedOperatorId';
  recordIdField: 'cap2a.recordId';
  recordIdRole: 'REFERENCE_ONLY_NOT_SELECTABLE';
  bridgeSha256: string;
  censusSha256: string;
  supplementVersion: typeof CAP2A_PLANNER_SUPPLEMENT_VERSION_V2R;
  supplementSha256: string;
  identitySha256: string;
}

// Builds the rich planner tool sheet: the executable spec catalog (the IDs the
// lowerer compiles) enriched, per operator, with the CAP-2A atomic-operation
// dossier via either the frozen census bridge or the explicitly non-census V2R
// supplement. Reference IDs never become selectable operator IDs.

export interface Cap2aEnrichedOperatorV2R {
  selectableOperatorId: string;
  selectionRule: 'COPY_SELECTABLE_OPERATOR_ID_TO_NODE_SELECTED_OPERATOR_ID';
  selectableContractAuthority: 'V2R_RESEARCH_NORMALIZED_COMPILER_CONTRACT_NOT_LIVE_CALLABLE';
  kind: string;
  supportStatus: string;
  compilerEligibility: string;
  input: JsonRecord;
  output: JsonRecord;
  stateEffects: readonly string[];
  proof: readonly string[];
  cap2a: {
    recordId: string;
    recordAuthority: 'FROZEN_CAP2A_CENSUS' | 'V2R_CODE_GROUNDED_SUPPLEMENT';
    identifierRole: 'REFERENCE_ONLY_NOT_SELECTABLE';
    mappingConfidence: string;
    family: string;
    plannerEligibility: string;
    certificationStatus: string;
    support: JsonRecord;
    surfaces: JsonRecord;
    owners: JsonRecord;
    contract: JsonRecord;
    effects: JsonRecord;
    execution: JsonRecord;
    verification: JsonRecord;
    recovery: JsonRecord;
    policy: JsonRecord;
    resources: JsonRecord;
    evidenceRefs: readonly JsonRecord[];
  } | null;
}

const cap2aOperationsById = new Map<string, JsonRecord>(
  ((CAP2_ATOMIC_OPERATION_CATALOG_V1 as JsonRecord).operations as JsonRecord[])
    .map((operation) => [String(operation.operatorId), operation]),
);

interface GroundedRecordV2R {
  recordId: string;
  recordAuthority: 'FROZEN_CAP2A_CENSUS' | 'V2R_CODE_GROUNDED_SUPPLEMENT';
  mappingConfidence: string;
  record: JsonRecord;
}

function groundedRecordForOperatorV2R(selectableOperatorId: string): GroundedRecordV2R | null {
  const censusRecordId = cap2aOperatorIdForSpecOperatorV2R(selectableOperatorId);
  const censusRecord = censusRecordId ? cap2aOperationsById.get(censusRecordId) : undefined;
  if (censusRecordId && censusRecord) {
    return {
      recordId: censusRecordId,
      recordAuthority: 'FROZEN_CAP2A_CENSUS',
      mappingConfidence: String(cap2aBridgeConfidenceV2R(selectableOperatorId)),
      record: censusRecord,
    };
  }
  const supplement = cap2aPlannerSupplementForOperatorV2R(selectableOperatorId);
  return supplement
    ? {
        recordId: supplement.supplementRecordId,
        recordAuthority: 'V2R_CODE_GROUNDED_SUPPLEMENT',
        mappingConfidence: 'SELECTABLE_ID_EXACT_CODE_AUDIT',
        record: supplement.dossier as unknown as JsonRecord,
      }
    : null;
}

export function buildCap2aEnrichedCatalogV2R(
  specOperators: readonly JsonRecord[],
): readonly Readonly<Cap2aEnrichedOperatorV2R>[] {
  const enriched = specOperators.map((operator) => {
    const specOperatorId = String(operator.operatorId);
    const grounding = groundedRecordForOperatorV2R(specOperatorId);
    const cap2aRecord = grounding?.record;
    const cap2a = grounding && cap2aRecord
      ? {
          recordId: grounding.recordId,
          recordAuthority: grounding.recordAuthority,
          identifierRole: 'REFERENCE_ONLY_NOT_SELECTABLE' as const,
          mappingConfidence: grounding.mappingConfidence,
          family: String(cap2aRecord.family ?? ''),
          plannerEligibility: String((cap2aRecord.support as JsonRecord)?.plannerEligibility ?? ''),
          certificationStatus: String((cap2aRecord.support as JsonRecord)?.certificationStatus ?? ''),
          support: (cap2aRecord.support ?? {}) as JsonRecord,
          surfaces: (cap2aRecord.surfaces ?? {}) as JsonRecord,
          owners: (cap2aRecord.owners ?? {}) as JsonRecord,
          contract: (cap2aRecord.contract ?? {}) as JsonRecord,
          effects: (cap2aRecord.effects ?? {}) as JsonRecord,
          execution: (cap2aRecord.execution ?? {}) as JsonRecord,
          verification: (cap2aRecord.verification ?? {}) as JsonRecord,
          recovery: (cap2aRecord.recovery ?? {}) as JsonRecord,
          policy: (cap2aRecord.policy ?? {}) as JsonRecord,
          resources: (cap2aRecord.resources ?? {}) as JsonRecord,
          evidenceRefs: (cap2aRecord.evidenceRefs ?? []) as readonly JsonRecord[],
        }
      : null;
    return deepFreezeV1({
      selectableOperatorId: specOperatorId,
      selectionRule: 'COPY_SELECTABLE_OPERATOR_ID_TO_NODE_SELECTED_OPERATOR_ID' as const,
      selectableContractAuthority: 'V2R_RESEARCH_NORMALIZED_COMPILER_CONTRACT_NOT_LIVE_CALLABLE' as const,
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

export function cap2aPlannerDossierIdentityV2R(): Readonly<Cap2aPlannerDossierIdentityV2R> {
  const material = {
    version: CAP2A_PLANNER_DOSSIER_VERSION_V2R,
    selectableIdField: 'selectableOperatorId' as const,
    selectedNodeField: 'selectedOperatorId' as const,
    recordIdField: 'cap2a.recordId' as const,
    recordIdRole: 'REFERENCE_ONLY_NOT_SELECTABLE' as const,
    bridgeSha256: hashCanonicalJsonV1(CAP2A_PLANNER_BRIDGE_V2R),
    censusSha256: hashCanonicalJsonV1(CAP2_ATOMIC_OPERATION_CATALOG_V1),
    supplementVersion: CAP2A_PLANNER_SUPPLEMENT_VERSION_V2R,
    supplementSha256: CAP2A_PLANNER_SUPPLEMENT_V2R.supplementSha256,
  };
  return deepFreezeV1({ ...material, identitySha256: hashCanonicalJsonV1(material) });
}

export function cap2aEnrichmentCoverageV2R(
  specOperators: readonly JsonRecord[],
): Readonly<{
  total: number;
  enriched: number;
  unmapped: string[];
  bridgeRows: number;
  supplementRows: number;
  frozenCensusRecords: number;
  supplementalRecords: number;
}> {
  const grounded = specOperators.map((operator) => ({
    selectableOperatorId: String(operator.operatorId),
    grounding: groundedRecordForOperatorV2R(String(operator.operatorId)),
  }));
  const unmapped = grounded.filter(({ grounding }) => !grounding)
    .map(({ selectableOperatorId }) => selectableOperatorId);
  return deepFreezeV1({
    total: specOperators.length,
    enriched: specOperators.length - unmapped.length,
    unmapped,
    bridgeRows: CAP2A_PLANNER_BRIDGE_V2R.rows.length,
    supplementRows: CAP2A_PLANNER_SUPPLEMENT_V2R.rows.length,
    frozenCensusRecords: grounded.filter(({ grounding }) => grounding?.recordAuthority === 'FROZEN_CAP2A_CENSUS').length,
    supplementalRecords: grounded.filter(({ grounding }) => grounding?.recordAuthority === 'V2R_CODE_GROUNDED_SUPPLEMENT').length,
  });
}
