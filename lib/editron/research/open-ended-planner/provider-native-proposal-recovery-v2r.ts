import {
  canonicalizeJsonV1,
  deepFreezeV1,
  hashCanonicalJsonV1,
} from './contracts-v1';
import { PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R }
  from './provider-native-result-references-v2r';
import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from './provider-native-episode-resume-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_PROPOSAL_RECOVERY_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_PROPOSAL_RECOVERY_V2R_1' as const;

export interface ProviderNativeProposalRecoveryOperationV2R {
  turn: number;
  operatorId: string;
  callSha256: string;
  recordedExecutionSha256: string;
  beforeStateSha256: string;
  afterStateSha256: string;
  writerProjectRevision: string;
}

export interface ProviderNativeProposalRecoveryStateV2R {
  version: typeof PROVIDER_NATIVE_PROPOSAL_RECOVERY_VERSION_V2R;
  authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_RECOVERY_NO_PROJECT_MUTATION';
  episodeId: string;
  projectId: string;
  canonicalBaseProjectRevision: string;
  canonicalBaseStateSha256: string;
  isolatedWorkingProjectRevision: string;
  isolatedWorkingStateSha256: string;
  completedTurnsSha256: string;
  nextTurn: number;
  operations: readonly Readonly<ProviderNativeProposalRecoveryOperationV2R>[];
  recoveryStateSha256: string;
}

export interface ProviderNativeProposalRecoveryWriterTurnV2R {
  turn: number;
  operatorId: string;
  arguments: Readonly<JsonRecord>;
  recordedExecution: Readonly<JsonRecord>;
  callSha256: string;
  recordedExecutionSha256: string;
  writerProjectRevision: string;
}

export function createProviderNativeProposalRecoveryStateV2R(input: Readonly<{
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  projectId: string;
  canonicalBaseProjectRevision: string;
  canonicalBaseStateSha256: string;
  operations: readonly Readonly<{
    turn: number;
    beforeStateSha256: string;
    afterStateSha256: string;
  }>[];
}>): Readonly<ProviderNativeProposalRecoveryStateV2R> {
  requireIdentity(input.projectId, 'PROJECT');
  requireIdentity(input.canonicalBaseProjectRevision, 'CANONICAL_BASE_REVISION');
  requireSha256(input.canonicalBaseStateSha256, 'CANONICAL_BASE_STATE');
  const writerTurns = proposalRecoveryWriterTurnsV2R(input.checkpoint);
  if (!writerTurns.length || writerTurns.length !== input.operations.length) {
    throw new Error('PROVIDER_NATIVE_PROPOSAL_RECOVERY_OPERATION_COUNT_MISMATCH');
  }
  const operations = writerTurns.map((writer, index) => {
    const supplied = input.operations[index];
    if (supplied.turn !== writer.turn) {
      throw new Error('PROVIDER_NATIVE_PROPOSAL_RECOVERY_OPERATION_TURN_MISMATCH');
    }
    requireSha256(supplied.beforeStateSha256, 'BEFORE_STATE');
    requireSha256(supplied.afterStateSha256, 'AFTER_STATE');
    return {
      turn: writer.turn,
      operatorId: writer.operatorId,
      callSha256: writer.callSha256,
      recordedExecutionSha256: writer.recordedExecutionSha256,
      beforeStateSha256: supplied.beforeStateSha256,
      afterStateSha256: supplied.afterStateSha256,
      writerProjectRevision: writer.writerProjectRevision,
    };
  });
  assertStateChain(input.canonicalBaseStateSha256, operations);
  const finalOperation = operations.at(-1)!;
  const material = {
    version: PROVIDER_NATIVE_PROPOSAL_RECOVERY_VERSION_V2R,
    authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_RECOVERY_NO_PROJECT_MUTATION' as const,
    episodeId: input.checkpoint.episodeId,
    projectId: input.projectId,
    canonicalBaseProjectRevision: input.canonicalBaseProjectRevision,
    canonicalBaseStateSha256: input.canonicalBaseStateSha256,
    isolatedWorkingProjectRevision: finalOperation.writerProjectRevision,
    isolatedWorkingStateSha256: finalOperation.afterStateSha256,
    completedTurnsSha256: input.checkpoint.completedTurnsSha256,
    nextTurn: input.checkpoint.nextTurn,
    operations,
  };
  const state = deepFreezeV1({
    ...material,
    recoveryStateSha256: hashCanonicalJsonV1(material),
  }) as Readonly<ProviderNativeProposalRecoveryStateV2R>;
  verifyProviderNativeProposalRecoveryStateV2R({
    checkpoint: input.checkpoint,
    projectId: input.projectId,
    state,
  });
  return state;
}

export function verifyProviderNativeProposalRecoveryStateV2R(input: Readonly<{
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  projectId: string;
  state: Readonly<ProviderNativeProposalRecoveryStateV2R>;
}>): void {
  const { state } = input;
  if (state.version !== PROVIDER_NATIVE_PROPOSAL_RECOVERY_VERSION_V2R
    || state.authority !== 'PROJECTSERVICE_ISOLATED_PROPOSAL_RECOVERY_NO_PROJECT_MUTATION'
    || state.episodeId !== input.checkpoint.episodeId
    || state.projectId !== input.projectId
    || state.completedTurnsSha256 !== input.checkpoint.completedTurnsSha256
    || state.nextTurn !== input.checkpoint.nextTurn) {
    throw new Error('PROVIDER_NATIVE_PROPOSAL_RECOVERY_IDENTITY_MISMATCH');
  }
  requireIdentity(state.canonicalBaseProjectRevision, 'CANONICAL_BASE_REVISION');
  requireIdentity(state.isolatedWorkingProjectRevision, 'ISOLATED_WORKING_REVISION');
  requireSha256(state.canonicalBaseStateSha256, 'CANONICAL_BASE_STATE');
  requireSha256(state.isolatedWorkingStateSha256, 'ISOLATED_WORKING_STATE');
  requireSha256(state.completedTurnsSha256, 'COMPLETED_TURNS');
  requireSha256(state.recoveryStateSha256, 'RECOVERY_STATE');

  const writerTurns = proposalRecoveryWriterTurnsV2R(input.checkpoint);
  if (!writerTurns.length || writerTurns.length !== state.operations.length) {
    throw new Error('PROVIDER_NATIVE_PROPOSAL_RECOVERY_OPERATION_COUNT_MISMATCH');
  }
  state.operations.forEach((operation, index) => {
    const writer = writerTurns[index];
    if (operation.turn !== writer.turn
      || operation.operatorId !== writer.operatorId
      || operation.callSha256 !== writer.callSha256
      || operation.recordedExecutionSha256 !== writer.recordedExecutionSha256
      || operation.writerProjectRevision !== writer.writerProjectRevision) {
      throw new Error('PROVIDER_NATIVE_PROPOSAL_RECOVERY_OPERATION_BINDING_MISMATCH');
    }
    requireSha256(operation.beforeStateSha256, 'BEFORE_STATE');
    requireSha256(operation.afterStateSha256, 'AFTER_STATE');
  });
  assertStateChain(state.canonicalBaseStateSha256, state.operations);
  const finalOperation = state.operations.at(-1)!;
  if (state.isolatedWorkingProjectRevision !== finalOperation.writerProjectRevision
    || state.isolatedWorkingStateSha256 !== finalOperation.afterStateSha256) {
    throw new Error('PROVIDER_NATIVE_PROPOSAL_RECOVERY_WORKING_STATE_MISMATCH');
  }
  const material = recoveryMaterial(state);
  if (hashCanonicalJsonV1(material) !== state.recoveryStateSha256
    || canonicalizeJsonV1(state) !== canonicalizeJsonV1({
      ...material,
      recoveryStateSha256: state.recoveryStateSha256,
    })) {
    throw new Error('PROVIDER_NATIVE_PROPOSAL_RECOVERY_HASH_MISMATCH');
  }
}

export function proposalRecoveryWriterTurnsV2R(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
): readonly Readonly<ProviderNativeProposalRecoveryWriterTurnV2R>[] {
  return checkpoint.completedTurns.flatMap((storedTurn) => {
    const issued = array(storedTurn.issuedResultReferences).map(record).filter(
      (entry) => entry.sourceOutputField === 'receipt.projectRevision',
    );
    if (!issued.length) return [];
    if (issued.length !== 1) {
      throw new Error('PROVIDER_NATIVE_PROPOSAL_RECOVERY_WRITER_REFERENCE_INVALID');
    }
    const turn = positiveInteger(storedTurn.turn, 'TURN');
    const modelCall = record(storedTurn.modelCall);
    const operatorId = identity(modelCall.name, 'OPERATOR');
    const argumentsValue = record(storedTurn.normalizedArguments);
    const execution = record(storedTurn.execution);
    const output = record(execution.output);
    const writerRevision = identity(record(output.receipt).projectRevision, 'WRITER_REVISION');
    const reference = issued[0];
    if (execution.authority !== 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION'
      || execution.disposition !== 'OK'
      || reference.version !== PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R
      || reference.originTurn !== turn
      || reference.sourceOperatorId !== operatorId
      || reference.valueKind !== 'STRING'
      || canonicalizeJsonV1(reference.sourceOutputPath)
        !== canonicalizeJsonV1(['receipt', 'projectRevision'])
      || hashCanonicalJsonV1(writerRevision) !== reference.valueSha256) {
      throw new Error('PROVIDER_NATIVE_PROPOSAL_RECOVERY_WRITER_REFERENCE_INVALID');
    }
    const callMaterial = { operatorId, arguments: argumentsValue, turn };
    return [{
      turn,
      operatorId,
      arguments: structuredClone(argumentsValue),
      recordedExecution: structuredClone(execution),
      callSha256: hashCanonicalJsonV1(callMaterial),
      recordedExecutionSha256: hashCanonicalJsonV1(execution),
      writerProjectRevision: writerRevision,
    }];
  });
}

function assertStateChain(
  baseStateSha256: string,
  operations: readonly Readonly<ProviderNativeProposalRecoveryOperationV2R>[],
): void {
  let expectedBefore = baseStateSha256;
  let priorTurn = 0;
  for (const operation of operations) {
    if (operation.turn <= priorTurn || operation.beforeStateSha256 !== expectedBefore) {
      throw new Error('PROVIDER_NATIVE_PROPOSAL_RECOVERY_STATE_CHAIN_INVALID');
    }
    expectedBefore = operation.afterStateSha256;
    priorTurn = operation.turn;
  }
}

function recoveryMaterial(state: Readonly<ProviderNativeProposalRecoveryStateV2R>) {
  return {
    version: state.version,
    authority: state.authority,
    episodeId: state.episodeId,
    projectId: state.projectId,
    canonicalBaseProjectRevision: state.canonicalBaseProjectRevision,
    canonicalBaseStateSha256: state.canonicalBaseStateSha256,
    isolatedWorkingProjectRevision: state.isolatedWorkingProjectRevision,
    isolatedWorkingStateSha256: state.isolatedWorkingStateSha256,
    completedTurnsSha256: state.completedTurnsSha256,
    nextTurn: state.nextTurn,
    operations: state.operations,
  };
}

function requireIdentity(value: string, label: string): void {
  if (!value.trim()) throw new Error(`PROVIDER_NATIVE_PROPOSAL_RECOVERY_${label}_INVALID`);
}

function requireSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`PROVIDER_NATIVE_PROPOSAL_RECOVERY_${label}_HASH_INVALID`);
  }
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`PROVIDER_NATIVE_PROPOSAL_RECOVERY_${label}_INVALID`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`PROVIDER_NATIVE_PROPOSAL_RECOVERY_${label}_INVALID`);
  }
  return Number(value);
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('PROVIDER_NATIVE_PROPOSAL_RECOVERY_RECORD_INVALID');
  }
  return value as JsonRecord;
}
