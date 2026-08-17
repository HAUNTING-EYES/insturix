import { deepFreezeV1 } from './contracts-v1';
import { evaluateDev02HybridStage4GraphV2 } from './dev02-hybrid-stage4-evaluator-v2';
import { evaluateDev04Stage4CapabilityGapV2 } from './dev04-capability-gap-chain-v2';
import { evaluateStage4CompiledGraphArtifactV2 } from './stage4-compilation-evaluator-v2';
import {
  evaluateDev01Stage4CompiledGraphV2,
  type Dev01Stage4SourceV2,
} from './stage4-dev01-native-evaluator-v2';
import { evaluateDev03Stage4CompiledGraphV2 } from './stage4-dev03-native-evaluator-v2';
import { evaluateStage4ResearchProxyPreviewV2 } from './stage4-research-proxy-evaluator-v2';

type JsonRecord = Record<string, unknown>;

export type Stage5DispositionV2 =
  | 'PROCEED'
  | 'CLARIFICATION_REQUIRED'
  | 'CAPABILITY_GAP'
  | 'POLICY_BLOCKED'
  | 'CONFLICT'
  | 'FAIL'
  | 'UNVERIFIABLE';

export interface ProceedOrStopDecisionV2 {
  artifactType: 'ProceedOrStopDecisionV2';
  taskId: string;
  disposition: Stage5DispositionV2;
  reasonCode: string;
  missingEvidenceIds: readonly string[];
  missingCapabilityIds: readonly string[];
  userMessage: string;
  executionAuthorization?: {
    scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY';
    projectMutation: 'DENY';
    fullProjectExecution: 'DENY';
  };
}

export interface Stage5EvaluationContextV2 {
  dev01Source?: Dev01Stage4SourceV2;
}

export function decideStage5ProceedOrStopV2(
  compiledGraph: unknown,
  context: Stage5EvaluationContextV2 = {},
): Readonly<ProceedOrStopDecisionV2> {
  const graph = record(compiledGraph);
  const taskId = text(graph.taskId) || 'UNBOUND_TASK';
  if (graph.artifactType === 'CompiledDev02HybridResearchGraphV2') {
    const evaluation = evaluateDev02HybridStage4GraphV2(compiledGraph);
    if (evaluation.assessment === 'PASS') {
      return decision(taskId, 'PROCEED', 'DEV02_FULL_HYBRID_RESEARCH_PROXY_VERIFIED', [], [],
        'The complete DEV-02 hybrid reel may be rendered as a bounded research proxy. Project mutation remains denied.',
        { scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY', projectMutation: 'DENY', fullProjectExecution: 'DENY' });
    }
    if (evaluation.assessment === 'UNVERIFIABLE') {
      return decision(taskId, 'UNVERIFIABLE', 'DEV02_FULL_HYBRID_RESEARCH_PROXY_UNVERIFIABLE', [], [],
        'The complete DEV-02 hybrid graph could not be verified. Nothing was executed.');
    }
    return decision(taskId, 'FAIL', 'DEV02_FULL_HYBRID_RESEARCH_PROXY_INVALID', [], [],
      'The complete DEV-02 hybrid graph failed independent validation. Nothing was executed.');
  }
  if (graph.artifactType === 'CompiledResearchProxyPreviewGraphV2') {
    const evaluation = evaluateStage4ResearchProxyPreviewV2(compiledGraph);
    if (evaluation.disposition === 'PASS') {
      return decision(taskId, 'PROCEED', 'RESEARCH_PROXY_PREVIEW_VERIFIED', [], [],
        'The bounded research preview may run in the deny-all sandbox. The project and full edit remain untouched and non-executable.',
        { scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY', projectMutation: 'DENY', fullProjectExecution: 'DENY' });
    }
    if (evaluation.disposition === 'UNVERIFIABLE') {
      return decision(taskId, 'UNVERIFIABLE', 'STAGE4_RESEARCH_PROXY_UNVERIFIABLE', [], [],
        'The research preview graph could not be verified. Nothing was executed.');
    }
    return decision(taskId, 'FAIL', 'STAGE4_RESEARCH_PROXY_INVALID', [], [],
      'The research preview graph failed independent validation. Nothing was executed.');
  }
  const evaluation = evaluateCompiledGraphForTask(taskId, compiledGraph, context);

  if (evaluation.disposition === 'FAIL') {
    return decision(taskId, 'FAIL', 'STAGE4_GRAPH_INVALID', [], [],
      'The compiled edit graph failed independent validation. Nothing was executed.');
  }
  if (evaluation.disposition === 'UNVERIFIABLE') {
    return decision(taskId, 'UNVERIFIABLE', 'STAGE4_GRAPH_UNVERIFIABLE', [], [],
      'The compiled edit graph could not be verified. Nothing was executed.');
  }
  if (evaluation.disposition === 'CAPABILITY_BLOCKED') {
    const missingCapabilityIds = collectMissingCapabilityIds(graph);
    return decision(taskId, 'CAPABILITY_GAP', 'REQUIRED_CAPABILITY_NOT_IMPLEMENTED', [], missingCapabilityIds,
      `The edit requires ${humanList(missingCapabilityIds) || 'an unavailable capability'}. Nothing was executed.`);
  }
  if (evaluation.disposition === 'PASS' && graph.executionEligibility === 'RESEARCH_PROXY_ONLY') {
    return decision(taskId, 'PROCEED', 'RESEARCH_PROXY_GRAPH_VERIFIED', [], [],
      'The research proxy graph passed independent validation and may proceed to bounded proxy execution. The project and full edit remain untouched.',
      { scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY', projectMutation: 'DENY', fullProjectExecution: 'DENY' });
  }
  return decision(taskId, 'FAIL', 'STAGE5_UNRECOGNIZED_COMPILATION_STATE', [], [],
    'The compilation state has no safe execution disposition. Nothing was executed.');
}

function evaluateCompiledGraphForTask(
  taskId: string,
  compiledGraph: unknown,
  context: Stage5EvaluationContextV2,
): {
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE' | 'CAPABILITY_BLOCKED';
  diagnostics: readonly string[];
} {
  if (taskId === 'DEV-01') {
    const evaluation = evaluateDev01Stage4CompiledGraphV2(compiledGraph, context.dev01Source);
    return { disposition: evaluation.assessment, diagnostics: evaluation.diagnostics };
  }
  if (taskId === 'DEV-03') {
    const evaluation = evaluateDev03Stage4CompiledGraphV2(compiledGraph);
    return { disposition: evaluation.assessment, diagnostics: evaluation.diagnostics };
  }
  if (taskId === 'DEV-04') return evaluateDev04Stage4CapabilityGapV2(compiledGraph);
  return evaluateStage4CompiledGraphArtifactV2(compiledGraph);
}

function collectMissingCapabilityIds(graph: JsonRecord): string[] {
  return unique(records(graph.diagnostics)
    .filter((entry) => entry.code === 'CAPABILITY_NOT_IMPLEMENTED' && entry.disposition === 'CAPABILITY_GAP')
    .flatMap((entry) => [...strings(entry.capabilityIds), ...strings(entry.operatorIds)]))
    .sort(compareUtf16);
}

function decision(
  taskId: string,
  disposition: Stage5DispositionV2,
  reasonCode: string,
  missingEvidenceIds: string[],
  missingCapabilityIds: string[],
  userMessage: string,
  executionAuthorization?: ProceedOrStopDecisionV2['executionAuthorization'],
): Readonly<ProceedOrStopDecisionV2> {
  return deepFreezeV1({
    artifactType: 'ProceedOrStopDecisionV2',
    taskId,
    disposition,
    reasonCode,
    missingEvidenceIds: unique(missingEvidenceIds).sort(compareUtf16),
    missingCapabilityIds: unique(missingCapabilityIds).sort(compareUtf16),
    userMessage,
    ...(executionAuthorization ? { executionAuthorization } : {}),
  });
}

function humanList(values: string[]): string { return values.join(', '); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
