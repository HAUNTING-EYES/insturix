import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildV2RStage6TaskAdapterRegistry,
  findV2RStage6TaskAdapter,
} from './v2r-stage6-task-adapter-registry';
import type { HashedStagePacketV2 } from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

export const V2R_RESEARCH_EXECUTION_CONTRACT_VERSION =
  'EDITRON_OE_V2R_RESEARCH_EXECUTION_CONTRACT_V1' as const;

export type V2RResearchOperatorExecutionDisposition =
  | 'EXECUTABLE_VIA_REGISTERED_RESEARCH_PROXY'
  | 'NOT_EXECUTABLE_NO_REGISTERED_TASK_PROXY'
  | 'NOT_EXECUTABLE_TASK_PROXY_OPERATOR_GAP'
  | 'NOT_EXECUTABLE_COMPILER_INELIGIBLE';

export interface V2RResearchExecutionOperatorRow {
  operatorId: string;
  compilerEligibility: string;
  executionDisposition: V2RResearchOperatorExecutionDisposition;
  reasonCode: string;
}

export interface V2RResearchExecutionContract {
  version: typeof V2R_RESEARCH_EXECUTION_CONTRACT_VERSION;
  authority: 'RESEARCH_BENCHMARK_EXECUTION_TRUTH_NOT_PRODUCTION_CERTIFICATION';
  taskId: string;
  adapterRegistryVersion: string;
  adapterRegistrySha256: string;
  taskAdapter: null | {
    adapterId: string;
    ownerRef: string;
    executionAuthority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION';
    proofRequirement: 'REAL_RENDERED_VISUAL_AND_AUDIO_PROOF';
    supportedOperatorIds: readonly string[];
  };
  semantics: {
    structuralSelection: 'CATALOG_OPERATOR_MAY_DESCRIBE_INTENDED_PLAN';
    executionReadiness: 'EVERY_SELECTED_OPERATOR_MUST_BE_EXECUTABLE_FOR_READY_DISPOSITION';
    unavailableOperator: 'SELECT_ONLY_WITH_EXPLICIT_CAPABILITY_GAP_NEVER_CLAIM_READY';
    productionCertificationImpact: 'NONE';
  };
  operators: readonly Readonly<V2RResearchExecutionOperatorRow>[];
  contractSha256: string;
}

export function buildV2RResearchExecutionContract(input: {
  taskId: string;
  operatorCatalog: unknown;
}): Readonly<V2RResearchExecutionContract> {
  if (!input.taskId) throw new Error('V2R_RESEARCH_EXECUTION_TASK_ID_MISSING');
  const catalog = record(input.operatorCatalog);
  const operators = records(catalog.operators);
  const operatorIds = operators.map(({ operatorId }) => text(operatorId));
  if (!operatorIds.length || operatorIds.some((operatorId) => !operatorId)) {
    throw new Error('V2R_RESEARCH_EXECUTION_OPERATOR_SET_INVALID');
  }
  if (new Set(operatorIds).size !== operatorIds.length) {
    throw new Error('V2R_RESEARCH_EXECUTION_OPERATOR_SET_DUPLICATE');
  }

  const registry = buildV2RStage6TaskAdapterRegistry();
  const adapter = findV2RStage6TaskAdapter(input.taskId);
  const supported = new Set(adapter?.supportedOperatorIds ?? []);
  const rows = operators.map((operator): V2RResearchExecutionOperatorRow => {
    const operatorId = text(operator.operatorId);
    const compilerEligibility = text(operator.compilerEligibility);
    if (!['RESEARCH_READ_ONLY', 'ISOLATED_PROXY_ONLY'].includes(compilerEligibility)) {
      return {
        operatorId, compilerEligibility,
        executionDisposition: 'NOT_EXECUTABLE_COMPILER_INELIGIBLE',
        reasonCode: 'COMPILER_ELIGIBILITY_BLOCKS_RESEARCH_EXECUTION',
      };
    }
    if (!adapter) {
      return {
        operatorId, compilerEligibility,
        executionDisposition: 'NOT_EXECUTABLE_NO_REGISTERED_TASK_PROXY',
        reasonCode: 'TASK_HAS_NO_REGISTERED_STAGE6_RESEARCH_PROXY',
      };
    }
    if (!supported.has(operatorId)) {
      return {
        operatorId, compilerEligibility,
        executionDisposition: 'NOT_EXECUTABLE_TASK_PROXY_OPERATOR_GAP',
        reasonCode: 'REGISTERED_TASK_PROXY_DOES_NOT_SUPPORT_OPERATOR',
      };
    }
    return {
      operatorId, compilerEligibility,
      executionDisposition: 'EXECUTABLE_VIA_REGISTERED_RESEARCH_PROXY',
      reasonCode: 'OPERATOR_AND_TASK_PROXY_REGISTERED_FOR_BOUNDED_RESEARCH_EXECUTION',
    };
  });

  const material = {
    version: V2R_RESEARCH_EXECUTION_CONTRACT_VERSION,
    authority: 'RESEARCH_BENCHMARK_EXECUTION_TRUTH_NOT_PRODUCTION_CERTIFICATION' as const,
    taskId: input.taskId,
    adapterRegistryVersion: registry.version,
    adapterRegistrySha256: registry.registrySha256,
    taskAdapter: adapter ? {
      adapterId: adapter.adapterId,
      ownerRef: adapter.ownerRef,
      executionAuthority: adapter.executionAuthority,
      proofRequirement: adapter.proofRequirement,
      supportedOperatorIds: [...adapter.supportedOperatorIds],
    } : null,
    semantics: {
      structuralSelection: 'CATALOG_OPERATOR_MAY_DESCRIBE_INTENDED_PLAN' as const,
      executionReadiness: 'EVERY_SELECTED_OPERATOR_MUST_BE_EXECUTABLE_FOR_READY_DISPOSITION' as const,
      unavailableOperator: 'SELECT_ONLY_WITH_EXPLICIT_CAPABILITY_GAP_NEVER_CLAIM_READY' as const,
      productionCertificationImpact: 'NONE' as const,
    },
    operators: rows,
  };
  return deepFreezeV1({ ...material, contractSha256: hashCanonicalJsonV1(material) });
}

export function bindV2RResearchExecutionContractToPacket(input: {
  source: HashedStagePacketV2;
}): HashedStagePacketV2 {
  if (input.source.packet.stage !== 2 && input.source.packet.stage !== 3) {
    throw new Error(`V2R_RESEARCH_EXECUTION_PACKET_STAGE_UNSUPPORTED:${input.source.packet.stage}`);
  }
  const contract = buildV2RResearchExecutionContract({
    taskId: input.source.packet.taskId,
    operatorCatalog: input.source.packet.modelInput.operatorCatalog,
  });
  const packet = deepFreezeV1({
    ...input.source.packet,
    modelInput: {
      ...input.source.packet.modelInput,
      researchExecutionContract: contract,
    },
  });
  const transportAttachments = deepFreezeV1([...input.source.transportAttachments]);
  return deepFreezeV1({
    packet,
    packetHash: hashCanonicalJsonV1(packet),
    transportAttachments,
    transportHash: hashCanonicalJsonV1(transportAttachments),
  });
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
