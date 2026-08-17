import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { executeDev01Stage6NativeProxyV2 } from './dev01-stage6-native-proxy-executor-v2';
import { evaluateDev01Stage6NativeProxyV2 } from './dev01-stage6-native-proxy-evaluator-v2';
import { compileCanonicalDev02HybridStage4GraphV2 } from './dev02-hybrid-stage4-compiler-v2';
import { evaluateDev02HybridStage4GraphV2 } from './dev02-hybrid-stage4-evaluator-v2';
import {
  executeConnectedDev02HybridMechanicsV2,
  type Dev02ConnectedHybridMechanicsResultV2,
} from './dev02-connected-hybrid-mechanics-v2';
import {
  type DevelopmentMechanicsMapV2,
} from './development-cohort-cases-v2';
import type { DevelopmentMechanicsReceiptV2 } from './development-cohort-runner-v2';
import type { Dev03MeasuredEvidenceReceiptV2 } from './dev03-measured-evidence-v2';
import { buildCanonicalDev03BeatWithheldEvidenceV2 } from './dev03-measured-evidence-v2';
import { getCanonicalDev03Stage123V2 } from './dev03-stage123-canonical-v2';
import { executeDev03Stage6NativeProxyV2 } from './dev03-stage6-native-proxy-executor-v2';
import { evaluateDev03Stage6NativeProxyV2 } from './dev03-stage6-native-proxy-evaluator-v2';
import {
  compileCanonicalDev04CapabilityGapV2,
  evaluateDev04Stage4CapabilityGapV2,
} from './dev04-capability-gap-chain-v2';
import { compileCanonicalDev01Stage4NativeV2 } from './stage4-deterministic-compiler-v2';
import { evaluateDev01Stage4CompiledGraphV2 } from './stage4-dev01-native-evaluator-v2';
import { compileDev03Stage4NativeV2 } from './stage4-dev03-native-compiler-v2';
import { evaluateDev03Stage4CompiledGraphV2 } from './stage4-dev03-native-evaluator-v2';
import { decideStage5ProceedOrStopV2 } from './stage5-proceed-stop-gate-v2';

export function buildDevelopmentMechanicsMapV2(input: {
  measuredDev03: Readonly<Dev03MeasuredEvidenceReceiptV2>;
  evidenceRoot: string;
  runId: string;
  createdAt: string;
  dev02MechanicsRunner?: (input: {
    outputRoot: string; runId: string; createdAt: string;
  }) => Promise<Readonly<Dev02ConnectedHybridMechanicsResultV2>>;
}): DevelopmentMechanicsMapV2 {
  validateIdentity(input);
  return deepFreezeV1({
    'DEV-01': () => runDev01(input),
    'DEV-02': () => runDev02(input),
    'DEV-03': () => runDev03(input),
    'DEV-04': () => Promise.resolve(runDev04()),
  });
}

async function runDev01(input: {
  evidenceRoot: string; runId: string; createdAt: string;
}): Promise<Readonly<DevelopmentMechanicsReceiptV2>> {
  const graph = compileCanonicalDev01Stage4NativeV2();
  const stage4 = evaluateDev01Stage4CompiledGraphV2(graph);
  const stage5 = decideStage5ProceedOrStopV2(graph);
  if (stage4.assessment !== 'PASS' || stage5.disposition !== 'PROCEED') {
    return receipt('DEV-01', 'UNVERIFIABLE', 'UNVERIFIABLE', 'UNVERIFIABLE', [
      `stage4:${stage4.diagnostics.join('|') || stage4.assessment}`,
      `stage5:${stage5.reasonCode}`,
    ]);
  }
  const evidence = await executeDev01Stage6NativeProxyV2({
    graph,
    executionId: `${input.runId}-dev01`,
    createdAt: input.createdAt,
    outputDir: taskOutput(input.evidenceRoot, input.runId, 'dev01'),
  });
  const stage6 = await evaluateDev01Stage6NativeProxyV2({ graph, evidence });
  return receipt('DEV-01', 'PASS', 'PROCEED', stage6.assessment === 'PASS' ? 'PASS' : 'UNVERIFIABLE', [
    `stage4:${hashCanonicalJsonV1(graph)}`,
    `stage5:${hashCanonicalJsonV1(stage5)}`,
    `stage6:${evidence.receipt.receiptHash}`,
    `receiptPath:${evidence.receiptPath}`,
    ...stage6.diagnostics.map((diagnostic) => `stage6Diagnostic:${diagnostic}`),
  ]);
}

async function runDev02(input: {
  evidenceRoot: string; runId: string; createdAt: string;
  dev02MechanicsRunner?: (input: {
    outputRoot: string; runId: string; createdAt: string;
  }) => Promise<Readonly<Dev02ConnectedHybridMechanicsResultV2>>;
}): Promise<Readonly<DevelopmentMechanicsReceiptV2>> {
  const graph = compileCanonicalDev02HybridStage4GraphV2();
  const stage4 = evaluateDev02HybridStage4GraphV2(graph);
  const stage5 = decideStage5ProceedOrStopV2(graph);
  if (stage4.assessment !== 'PASS' || stage5.disposition !== 'PROCEED') {
    return receipt('DEV-02', 'UNVERIFIABLE', 'UNVERIFIABLE', 'UNVERIFIABLE', [
      `stage4:${stage4.diagnostics.join('|') || stage4.assessment}`,
      `stage5:${stage5.reasonCode}`,
    ]);
  }
  try {
    const result = await (input.dev02MechanicsRunner ?? executeConnectedDev02HybridMechanicsV2)({
      outputRoot: taskOutput(input.evidenceRoot, input.runId, 'dev02'),
      runId: input.runId,
      createdAt: input.createdAt,
    });
    return receipt('DEV-02', 'PASS', 'PROCEED', 'PASS', [
      `stage4:${hashCanonicalJsonV1(graph)}`,
      `stage5:${hashCanonicalJsonV1(stage5)}`,
      `sourceStage6:${result.sourceStage6ReceiptHash}`,
      `sourceStage6ReceiptPath:${result.sourceStage6ReceiptPath}`,
      `hybridStage6:${result.hybridStage6ReceiptHash}`,
      `hybridStage6ReceiptPath:${result.hybridStage6ReceiptPath}`,
      `hybridVideoPath:${result.hybridVideoPath}`,
      ...result.diagnostics.map((diagnostic) => `stage6Diagnostic:${diagnostic}`),
    ]);
  } catch (error) {
    return receipt('DEV-02', 'PASS', 'PROCEED', 'UNVERIFIABLE', [
      `stage4:${hashCanonicalJsonV1(graph)}`,
      `stage5:${hashCanonicalJsonV1(stage5)}`,
      `blocker:${safeErrorCode(error)}`,
    ]);
  }
}

async function runDev03(input: {
  measuredDev03: Readonly<Dev03MeasuredEvidenceReceiptV2>;
  evidenceRoot: string; runId: string; createdAt: string;
}): Promise<Readonly<DevelopmentMechanicsReceiptV2>> {
  const canonical = getCanonicalDev03Stage123V2({
    measuredEvidence: input.measuredDev03,
    withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
  });
  const graph = compileDev03Stage4NativeV2({
    measuredEvidence: input.measuredDev03,
    editorialIntent: canonical.editorialIntent,
    evidencePack: canonical.evidencePacks.BASELINE,
    evidenceBoundIntent: canonical.evidenceBoundIntents.BASELINE,
  });
  const stage4 = evaluateDev03Stage4CompiledGraphV2(graph);
  const stage5 = decideStage5ProceedOrStopV2(graph);
  if (stage4.assessment !== 'PASS' || stage5.disposition !== 'PROCEED') {
    return receipt('DEV-03', 'UNVERIFIABLE', 'UNVERIFIABLE', 'UNVERIFIABLE', [
      `stage4:${stage4.diagnostics.join('|') || stage4.assessment}`,
      `stage5:${stage5.reasonCode}`,
    ]);
  }
  const evidence = await executeDev03Stage6NativeProxyV2({
    graph,
    executionId: `${input.runId}-dev03`,
    createdAt: input.createdAt,
    outputDir: taskOutput(input.evidenceRoot, input.runId, 'dev03'),
  });
  const stage6 = await evaluateDev03Stage6NativeProxyV2({ graph, evidence });
  return receipt('DEV-03', 'PASS', 'PROCEED', stage6.assessment === 'PASS' ? 'PASS' : 'UNVERIFIABLE', [
    `stage4:${hashCanonicalJsonV1(graph)}`,
    `stage5:${hashCanonicalJsonV1(stage5)}`,
    `stage6:${evidence.receipt.receiptHash}`,
    `receiptPath:${evidence.receiptPath}`,
    ...stage6.diagnostics.map((diagnostic) => `stage6Diagnostic:${diagnostic}`),
  ]);
}

function runDev04(): Readonly<DevelopmentMechanicsReceiptV2> {
  const graph = compileCanonicalDev04CapabilityGapV2();
  const stage4 = evaluateDev04Stage4CapabilityGapV2(graph);
  const stage5 = decideStage5ProceedOrStopV2(graph);
  const honestGap = stage4.disposition === 'CAPABILITY_BLOCKED'
    && stage5.disposition === 'CAPABILITY_GAP';
  return receipt(
    'DEV-04',
    honestGap ? 'EXPECTED_CAPABILITY_GAP' : 'UNVERIFIABLE',
    honestGap ? 'CAPABILITY_GAP' : 'UNVERIFIABLE',
    honestGap ? 'CAPABILITY_GAP' : 'UNVERIFIABLE',
    [
      `stage4:${hashCanonicalJsonV1(graph)}`,
      `stage5:${hashCanonicalJsonV1(stage5)}`,
      ...stage4.diagnostics.map((diagnostic) => `stage4Diagnostic:${diagnostic}`),
    ],
  );
}

function receipt(
  taskId: DevelopmentMechanicsReceiptV2['taskId'],
  stage4Disposition: DevelopmentMechanicsReceiptV2['stage4Disposition'],
  stage5Disposition: DevelopmentMechanicsReceiptV2['stage5Disposition'],
  stage6Disposition: DevelopmentMechanicsReceiptV2['stage6Disposition'],
  evidenceRefs: string[],
): Readonly<DevelopmentMechanicsReceiptV2> {
  return deepFreezeV1({
    taskId,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    stage4Disposition,
    stage5Disposition,
    stage6Disposition,
    stateEffects: [] as const,
    evidenceRefs,
  });
}

function validateIdentity(input: { evidenceRoot: string; runId: string; createdAt: string }): void {
  if (!path.isAbsolute(input.evidenceRoot)) throw new Error('COHORT_MECHANICS_EVIDENCE_ROOT_NOT_ABSOLUTE');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,80}$/.test(input.runId)) throw new Error('COHORT_MECHANICS_RUN_ID_INVALID');
  if (new Date(input.createdAt).toISOString() !== input.createdAt) throw new Error('COHORT_MECHANICS_CREATED_AT_INVALID');
}

function taskOutput(root: string, runId: string, task: 'dev01' | 'dev02' | 'dev03'): string {
  return path.resolve(root, runId, task);
}

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[^A-Za-z0-9:_|.-]+/g, '_').slice(0, 500) || 'DEV02_CONNECTED_MECHANICS_UNKNOWN_FAILURE';
}
