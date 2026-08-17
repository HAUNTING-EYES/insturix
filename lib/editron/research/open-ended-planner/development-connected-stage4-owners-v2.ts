import {
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

import { cloneCanonicalJsonV1, deepFreezeV1 } from './contracts-v1';
import {
  compileDev02HybridStage4GraphV2,
  type Dev02HybridStage4SourceV2,
} from './dev02-hybrid-stage4-compiler-v2';
import { evaluateDev02HybridStage4GraphV2 } from './dev02-hybrid-stage4-evaluator-v2';
import { readDev02Stage4RoleSymbolsFromBlockedGraphV2 } from './dev02-stage4-role-resolver-v2';
import {
  DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1,
} from './generated-composition-research-proxy-capability-v1';
import type { GeneratedCompositionProgramV1 } from './generated-composition-program-v1';
import {
  compileDev01Stage4NativeV2,
  compileStage4DeterministicBaselineV2,
} from './stage4-deterministic-compiler-v2';
import { evaluateDev01Stage4CompiledGraphV2 } from './stage4-dev01-native-evaluator-v2';
import { compileStage4ResearchProxyPreviewV2 } from './stage4-research-proxy-compiler-v2';
import {
  compileDev04CapabilityGapV2,
  evaluateDev04Stage4CapabilityGapV2,
} from './dev04-capability-gap-chain-v2';
import type { Dev03MeasuredEvidenceReceiptV2 } from './dev03-measured-evidence-v2';
import type {
  DevelopmentCohortTaskIdV2,
} from './development-cohort-runner-v2';
import type {
  ConnectedDevelopmentStage4CompilerInputV2,
  ConnectedDevelopmentStage4EvaluationV2,
  ConnectedDevelopmentStage4OwnerV2,
} from './development-connected-stage4-delegator-v2';
import { compileDev03Stage4NativeV2 } from './stage4-dev03-native-compiler-v2';
import { evaluateDev03Stage4CompiledGraphV2 } from './stage4-dev03-native-evaluator-v2';

export function buildConnectedDevelopmentStage4OwnerForTaskV2(input: {
  taskId: DevelopmentCohortTaskIdV2;
  measuredDev03: Readonly<Dev03MeasuredEvidenceReceiptV2>;
}): ConnectedDevelopmentStage4OwnerV2 {
  if (input.taskId === 'DEV-01') return buildConnectedDev01Stage4OwnerV2();
  if (input.taskId === 'DEV-02') return buildConnectedDev02Stage4OwnerV2();
  if (input.taskId === 'DEV-03') return buildConnectedDev03Stage4OwnerV2(input.measuredDev03);
  return buildConnectedDev04Stage4OwnerV2();
}

export function buildConnectedDev01Stage4OwnerV2(): ConnectedDevelopmentStage4OwnerV2 {
  return deepFreezeV1({
    ownerRef: 'lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2.ts#compileDev01Stage4NativeV2',
    compiledArtifactType: 'CompiledOperationGraphV2',
    compile: (source: Readonly<ConnectedDevelopmentStage4CompilerInputV2>) => {
      requireTask(source, 'DEV-01');
      return compileDev01Stage4NativeV2({
        referenceBlueprint: source.referenceBlueprint,
        editorialIntent: source.editorialIntent,
        evidencePack: source.evidencePack,
        evidenceBoundIntent: source.evidenceBoundIntent,
      });
    },
    evaluate: (
      artifact: Readonly<Record<string, unknown>>,
      source: Readonly<ConnectedDevelopmentStage4CompilerInputV2>,
    ) => {
      const evaluation = evaluateDev01Stage4CompiledGraphV2(artifact, source);
      return deepFreezeV1({
        disposition: evaluation.assessment,
        diagnostics: [...evaluation.diagnostics],
        dimensions: evaluation,
      }) as Readonly<ConnectedDevelopmentStage4EvaluationV2>;
    },
  });
}

export function buildConnectedDev02Stage4OwnerV2(): ConnectedDevelopmentStage4OwnerV2 {
  return deepFreezeV1({
    ownerRef: 'lib/editron/research/open-ended-planner/dev02-hybrid-stage4-compiler-v2.ts#compileDev02HybridStage4GraphV2',
    compiledArtifactType: 'CompiledDev02HybridResearchGraphV2',
    compile: (source: Readonly<ConnectedDevelopmentStage4CompilerInputV2>) => {
      requireTask(source, 'DEV-02');
      return compileDev02HybridStage4GraphV2(buildConnectedDev02HybridSourceV2(source));
    },
    evaluate: (
      artifact: Readonly<Record<string, unknown>>,
      source: Readonly<ConnectedDevelopmentStage4CompilerInputV2>,
    ) => {
      const evaluation = evaluateDev02HybridStage4GraphV2(
        artifact,
        buildConnectedDev02HybridSourceV2(source),
      );
      return deepFreezeV1({
        disposition: evaluation.assessment,
        diagnostics: [...evaluation.diagnostics],
        dimensions: evaluation,
      }) as Readonly<ConnectedDevelopmentStage4EvaluationV2>;
    },
  });
}

export function buildConnectedDev03Stage4OwnerV2(
  measuredEvidence: Readonly<Dev03MeasuredEvidenceReceiptV2>,
): ConnectedDevelopmentStage4OwnerV2 {
  return deepFreezeV1({
    ownerRef: 'lib/editron/research/open-ended-planner/stage4-dev03-native-compiler-v2.ts#compileDev03Stage4NativeV2',
    compiledArtifactType: 'CompiledOperationGraphV2',
    compile: (source: Readonly<ConnectedDevelopmentStage4CompilerInputV2>) => {
      requireTask(source, 'DEV-03');
      return compileDev03Stage4NativeV2({
        measuredEvidence,
        editorialIntent: source.editorialIntent,
        evidencePack: source.evidencePack,
        evidenceBoundIntent: source.evidenceBoundIntent,
      });
    },
    evaluate: (artifact: Readonly<Record<string, unknown>>) => {
      const evaluation = evaluateDev03Stage4CompiledGraphV2(artifact);
      return deepFreezeV1({
        disposition: evaluation.assessment,
        diagnostics: [...evaluation.diagnostics],
        dimensions: evaluation,
      }) as Readonly<ConnectedDevelopmentStage4EvaluationV2>;
    },
  });
}

export function buildConnectedDev04Stage4OwnerV2(): ConnectedDevelopmentStage4OwnerV2 {
  return deepFreezeV1({
    ownerRef: 'lib/editron/research/open-ended-planner/dev04-capability-gap-chain-v2.ts#compileDev04CapabilityGapV2',
    compiledArtifactType: 'CompiledOperationGraphV2',
    compile: (source: Readonly<ConnectedDevelopmentStage4CompilerInputV2>) => {
      requireTask(source, 'DEV-04');
      return compileDev04CapabilityGapV2(source);
    },
    evaluate: (
      artifact: Readonly<Record<string, unknown>>,
      source: Readonly<ConnectedDevelopmentStage4CompilerInputV2>,
    ) => {
      const evaluation = evaluateDev04Stage4CapabilityGapV2(artifact, source);
      return deepFreezeV1({
        disposition: evaluation.disposition === 'CAPABILITY_BLOCKED'
          ? 'EXPECTED_CAPABILITY_GAP'
          : evaluation.disposition,
        diagnostics: [...evaluation.diagnostics],
        dimensions: evaluation,
      }) as Readonly<ConnectedDevelopmentStage4EvaluationV2>;
    },
  });
}

function buildConnectedDev02HybridSourceV2(
  source: Readonly<ConnectedDevelopmentStage4CompilerInputV2>,
): Readonly<Dev02HybridStage4SourceV2> {
  const sourceCompilationSource = {
    referenceBlueprint: source.referenceBlueprint,
    editorialIntent: source.editorialIntent,
    evidenceBoundIntent: source.evidenceBoundIntent,
    evidencePack: source.evidencePack,
  };
  const sourceBlockedGraph = compileStage4DeterministicBaselineV2(sourceCompilationSource);
  const roles = readDev02Stage4RoleSymbolsFromBlockedGraphV2(sourceBlockedGraph);
  const generatedIntent = records(source.editorialIntent.nodes)
    .find((node) => node.intentNodeId === roles.generatedIslandIntentNodeId);
  if (!generatedIntent) throw new Error('CONNECTED_DEV02_GENERATED_INTENT_MISSING');
  const program = cloneCanonicalJsonV1(
    DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  ) as GeneratedCompositionProgramV1;
  program.projectBinding = {
    ...program.projectBinding,
    evidencePackHash: source.evidencePackHash,
  };
  program.referenceBinding = {
    ...program.referenceBinding,
    blueprintHash: source.sourceReferenceBlueprintHash,
  };
  program.expectedMeasurementRefs = strings(generatedIntent.targetClaimIds);
  const islandEvaluationSource = { sourceBlockedGraph, sourceCompilationSource };
  const islandGraph = compileStage4ResearchProxyPreviewV2({
    program,
    sourceBundle: DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
    evidencePack: source.evidencePack,
    referenceBlueprint: source.referenceBlueprint,
    supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
    capabilityPromotion: DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1,
    sourceBlockedGraph,
    sourceCompilationSource,
  });
  return deepFreezeV1({ islandGraph, islandEvaluationSource });
}

function requireTask(source: Readonly<ConnectedDevelopmentStage4CompilerInputV2>, taskId: string): void {
  if (source.taskId !== taskId) {
    throw new Error(`CONNECTED_STAGE4_OWNER_TASK_MISMATCH:${taskId}/${source.taskId}`);
  }
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> =>
        entry != null && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}
