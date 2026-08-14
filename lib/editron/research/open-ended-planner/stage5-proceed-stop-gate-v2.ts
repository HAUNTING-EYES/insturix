import { deepFreezeV1 } from './contracts-v1';
import { evaluateStage4CompiledGraphArtifactV2 } from './stage4-compilation-evaluator-v2';

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
}

export function decideStage5ProceedOrStopV2(compiledGraph: unknown): Readonly<ProceedOrStopDecisionV2> {
  const graph = record(compiledGraph);
  const taskId = text(graph.taskId) || 'UNBOUND_TASK';
  const evaluation = evaluateStage4CompiledGraphArtifactV2(compiledGraph);

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
      'The research proxy graph passed independent validation and may proceed to bounded proxy execution.');
  }
  return decision(taskId, 'FAIL', 'STAGE5_UNRECOGNIZED_COMPILATION_STATE', [], [],
    'The compilation state has no safe execution disposition. Nothing was executed.');
}

function collectMissingCapabilityIds(graph: JsonRecord): string[] {
  return unique(records(graph.diagnostics)
    .filter((entry) => entry.code === 'CAPABILITY_NOT_IMPLEMENTED' && entry.disposition === 'CAPABILITY_GAP')
    .flatMap((entry) => strings(entry.operatorIds)))
    .sort(compareUtf16);
}

function decision(
  taskId: string,
  disposition: Stage5DispositionV2,
  reasonCode: string,
  missingEvidenceIds: string[],
  missingCapabilityIds: string[],
  userMessage: string,
): Readonly<ProceedOrStopDecisionV2> {
  return deepFreezeV1({
    artifactType: 'ProceedOrStopDecisionV2',
    taskId,
    disposition,
    reasonCode,
    missingEvidenceIds: unique(missingEvidenceIds).sort(compareUtf16),
    missingCapabilityIds: unique(missingCapabilityIds).sort(compareUtf16),
    userMessage,
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
