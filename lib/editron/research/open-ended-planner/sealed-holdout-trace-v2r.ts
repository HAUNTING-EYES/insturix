import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { V2R_OPERATOR_CATALOG } from './operator-catalog-v2r';
import type { ProviderNativeEpisodeReceiptV2R } from './provider-native-tool-episode-v2r';
import { buildSealedHoldoutEpisodeContextV2R } from './sealed-holdout-episode-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_TRACE_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_SELECTED_OPERATION_TRACE_V2R_1' as const;

export interface SealedHoldoutTraceNodeV2R {
  nodeId: string;
  turn: number;
  selectedOperatorId: string;
  operatorKind: string;
  normalizedArguments: Readonly<JsonRecord>;
  argumentReferenceBindings: readonly Readonly<JsonRecord>[];
  executionDisposition: string;
  executionEvidenceRefs: readonly string[];
  writerIssuedProjectRevision: string | null;
  researchCloneMutation: boolean;
  argumentSha256: string;
  outputSha256: string;
  nodeSha256: string;
}

export interface SealedHoldoutSelectedOperationTraceV2R {
  version: typeof SEALED_HOLDOUT_TRACE_VERSION_V2R;
  authority: 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION';
  caseId: string;
  episodeId: string;
  contextSha256: string;
  providerEpisodeReceiptSha256: string;
  route: Readonly<JsonRecord>;
  terminalDisposition: string;
  nodes: readonly Readonly<SealedHoldoutTraceNodeV2R>[];
  researchCloneMutationCount: number;
  assessment: 'PASS' | 'FAIL';
  diagnostics: readonly string[];
  stateEffects: readonly [];
  traceSha256: string;
  artifactSha256: string;
}

export function buildSealedHoldoutSelectedOperationTraceV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
}): Readonly<SealedHoldoutSelectedOperationTraceV2R> {
  // Projection only: adding an operation here would create an undeclared planner
  // between the model episode and the hidden evaluator.
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const context = buildSealedHoldoutEpisodeContextV2R({ manifest, caseId: input.caseId });
  const diagnostics: string[] = [];
  if (input.providerEpisode.episodeId !== context.episodeId) diagnostics.push('TRACE_EPISODE_ID_DRIFT');
  if (input.providerEpisode.contextSha256 !== hashCanonicalJsonV1(context)) diagnostics.push('TRACE_CONTEXT_HASH_DRIFT');
  if (input.providerEpisode.stateEffects.length) diagnostics.push('TRACE_REAL_PROJECT_STATE_EFFECT_REPORTED');
  const operators = new Map(records(V2R_OPERATOR_CATALOG.operators)
    .map((operator) => [text(operator.operatorId), operator]));
  const nodes = input.providerEpisode.turns.flatMap((turn, index) => {
    const execution = record(turn.execution);
    if (!Object.keys(execution).length) return [];
    const modelCall = record(turn.modelCall);
    const selectedOperatorId = text(modelCall.name);
    const operator = operators.get(selectedOperatorId);
    if (!operator || operator.compilerEligibility === 'NOT_COMPILABLE') {
      diagnostics.push(`TRACE_OPERATOR_FORBIDDEN:${selectedOperatorId || 'missing'}`);
      return [];
    }
    const output = record(execution.output);
    const receipt = record(output.receipt);
    const executionDisposition = text(execution.disposition);
    const operatorKind = text(operator.kind);
    const researchCloneMutation = executionDisposition === 'OK'
      && ['MUTATION', 'MUTATION_LEGACY'].includes(operatorKind);
    const writerIssuedProjectRevision = text(receipt.projectRevision) || null;
    if (researchCloneMutation && !writerIssuedProjectRevision) {
      diagnostics.push(`TRACE_WRITER_REVISION_MISSING:${selectedOperatorId}`);
    }
    const nodeMaterial = {
      nodeId: `turn-${number(turn.turn) || index + 1}`,
      turn: number(turn.turn) || index + 1,
      selectedOperatorId,
      operatorKind,
      normalizedArguments: record(turn.normalizedArguments),
      argumentReferenceBindings: records(turn.argumentReferenceBindings),
      executionDisposition,
      executionEvidenceRefs: strings(execution.evidenceIds).sort(compareUtf16),
      writerIssuedProjectRevision,
      researchCloneMutation,
      argumentSha256: hashCanonicalJsonV1(record(turn.normalizedArguments)),
      outputSha256: hashCanonicalJsonV1(output),
    };
    return [{ ...nodeMaterial, nodeSha256: hashCanonicalJsonV1(nodeMaterial) }];
  });
  if (!sameArray(nodes.map(({ selectedOperatorId }) => selectedOperatorId),
    input.providerEpisode.selectedOperatorIds)) {
    diagnostics.push('TRACE_SELECTED_OPERATOR_SEQUENCE_DRIFT');
  }
  const sortedDiagnostics = [...new Set(diagnostics)].sort(compareUtf16);
  const traceSha256 = hashCanonicalJsonV1(nodes);
  const material = {
    version: SEALED_HOLDOUT_TRACE_VERSION_V2R,
    authority: 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    episodeId: input.providerEpisode.episodeId,
    contextSha256: input.providerEpisode.contextSha256,
    providerEpisodeReceiptSha256: input.providerEpisode.receiptSha256,
    route: input.providerEpisode.route as unknown as JsonRecord,
    terminalDisposition: input.providerEpisode.terminal.disposition,
    nodes,
    researchCloneMutationCount: nodes.filter(({ researchCloneMutation }) => researchCloneMutation).length,
    assessment: sortedDiagnostics.length ? 'FAIL' as const : 'PASS' as const,
    diagnostics: sortedDiagnostics,
    stateEffects: [] as const,
    traceSha256,
  };
  return deepFreezeV1({ ...material, artifactSha256: hashCanonicalJsonV1(material) });
}

export function assertSealedHoldoutSelectedOperationTraceV2R(
  value: unknown,
): Readonly<SealedHoldoutSelectedOperationTraceV2R> {
  if (!isRecord(value)) fail('SEALED_TRACE_MISSING');
  const candidate = value as unknown as SealedHoldoutSelectedOperationTraceV2R;
  const { artifactSha256, ...material } = candidate;
  if (candidate.version !== SEALED_HOLDOUT_TRACE_VERSION_V2R
    || candidate.authority !== 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION'
    || candidate.traceSha256 !== hashCanonicalJsonV1(candidate.nodes)
    || artifactSha256 !== hashCanonicalJsonV1(material)
    || candidate.stateEffects.length) fail('SEALED_TRACE_DRIFT');
  return deepFreezeV1(candidate);
}

function sameArray(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((entry, index) => entry === right[index]); }
function fail(code: string): never { throw new Error(code); }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
