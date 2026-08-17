import { deepFreezeV1 } from './contracts-v1';
import { evaluateConnectedDevelopmentStageArtifactV2 } from './development-connected-source-evaluator-v2';
import type {
  DevelopmentStageEvaluationV2,
  DevelopmentTaskCaseV2,
} from './development-cohort-runner-v2';
import type { ProviderStageRunV2 } from './provider-transport-v2';
import {
  validateProviderStageArtifactV2,
  type HashedStagePacketV2,
} from './staged-packet-v2';

const COMPILER_OWNED_STAGE2_DIAGNOSTICS = new Set([
  'DEV02_NATIVE_CONTINUATION_BEFORE_PROOF_MISSING',
]);

export function evaluateDevelopmentProviderResultV2(
  task: DevelopmentTaskCaseV2,
  packet: HashedStagePacketV2,
  providerRun: Readonly<ProviderStageRunV2>,
  options: Readonly<{ sourceRelativeConnected?: boolean }> = {},
): Readonly<DevelopmentStageEvaluationV2> {
  if (providerRun.runVersion !== 'EDITRON_OE_PROVIDER_STAGE_RUN_V2'
    || providerRun.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || providerRun.packetHash !== packet.packetHash) {
    return deepFreezeV1({
      disposition: 'UNVERIFIABLE',
      diagnostics: ['PROVIDER_RUN_BINDING_INVALID'],
    });
  }
  if (providerRun.disposition !== 'ARTIFACT_ACCEPTED' || !providerRun.artifact) {
    return deepFreezeV1({
      disposition: 'UNVERIFIABLE',
      diagnostics: [`TRANSPORT_NOT_ACCEPTED:${providerRun.disposition}`],
    });
  }
  const schemaDiagnostics = validateProviderStageArtifactV2(packet, providerRun.artifact);
  if (schemaDiagnostics.length) {
    return deepFreezeV1({
      disposition: 'UNVERIFIABLE',
      diagnostics: schemaDiagnostics.map((diagnostic) =>
        `PROVIDER_ARTIFACT_SCHEMA_INVALID:${diagnostic}`),
    });
  }
  if (options.sourceRelativeConnected) {
    const modelInput = packet.packet.modelInput;
    const evaluation = evaluateConnectedDevelopmentStageArtifactV2({
      taskId: task.taskId,
      stage: packet.packet.stage as 1 | 2 | 3,
      artifact: providerRun.artifact,
      priorArtifact: modelInput.priorArtifact,
      evidencePack: modelInput.evidencePack,
    });
    return appliesPlanningCompilerBoundary(packet)
      ? classifyStageTwoCompilerOwnedScaffold(task.taskId, evaluation)
      : evaluation;
  }
  return task.evaluateStage(packet.packet.stage as 1 | 2 | 3, providerRun.artifact);
}

function appliesPlanningCompilerBoundary(packet: HashedStagePacketV2): boolean {
  if (packet.packet.stage !== 2) return false;
  const boundary = packet.packet.modelInput.planningCompilerBoundary;
  return Boolean(boundary && typeof boundary === 'object' && !Array.isArray(boundary)
    && (boundary as Record<string, unknown>).boundaryVersion
      === 'EDITRON_OE_STAGE2_PLANNING_COMPILER_BOUNDARY_V2');
}

function classifyStageTwoCompilerOwnedScaffold(
  taskId: DevelopmentTaskCaseV2['taskId'],
  evaluation: Readonly<DevelopmentStageEvaluationV2>,
): Readonly<DevelopmentStageEvaluationV2> {
  const compilerOwnedDiagnostics = evaluation.diagnostics
    .filter((diagnostic) => COMPILER_OWNED_STAGE2_DIAGNOSTICS.has(diagnostic));
  if (!compilerOwnedDiagnostics.length) return evaluation;
  const editorialDiagnostics = evaluation.diagnostics
    .filter((diagnostic) => !COMPILER_OWNED_STAGE2_DIAGNOSTICS.has(diagnostic));
  if (editorialDiagnostics.length) {
    return deepFreezeV1({ ...evaluation, diagnostics: editorialDiagnostics });
  }
  return deepFreezeV1({
    ...evaluation,
    disposition: taskId === 'DEV-02' || taskId === 'DEV-04'
      ? 'EXPECTED_CAPABILITY_GAP'
      : 'PASS',
    diagnostics: [],
    dimensions: {
      ...evaluation.dimensions,
      compilerOwnedScaffold: 'DEFERRED_TO_STAGE4',
      compilerOwnedDiagnostics,
    },
  });
}
