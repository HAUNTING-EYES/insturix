import { canonicalizeJsonV1, deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  appendProviderNativeTurnV2R,
  isFinishResearchEpisodeCallV2R,
  normalizeProviderNativeTurnV2R,
  serializeProviderNativeTurnV2R,
  type ProviderNativeRouteV2R,
} from './provider-native-tool-codecs-v2r';
import type { ProviderNativeOperatorToolV2R, ProviderNativeToolSetV2R } from './provider-native-tool-catalog-v2r';
import {
  appendResultReferencesForModelV2R,
  ProviderNativeResultReferenceRegistryV2R,
  type ProviderNativeIssuedResultReferenceV2R,
} from './provider-native-result-references-v2r';
import { validateJsonSchemaV2 } from './stage4-compilation-evaluator-v2';
import type {
  ProviderNativeEpisodeContextV2R,
  ProviderNativeEpisodeReceiptV2R,
  ProviderNativeToolExecutionV2R,
} from './provider-native-tool-episode-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_EPISODE_RESUME_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_EPISODE_RESUME_V2R_1' as const;
export const PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_BOUND_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_EPISODE_RESUME_V2R_2' as const;
export const PROVIDER_NATIVE_EPISODE_RESUME_RUNTIME_BOUND_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_EPISODE_RESUME_V2R_3' as const;
export const PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_RUNTIME_BOUND_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_EPISODE_RESUME_V2R_4' as const;
export const PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_V2R_1' as const;
export const PROVIDER_NATIVE_RESUMED_RECEIPT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_RESUMED_RECEIPT_V2R_1' as const;

const UNCHECKED_AFTER_TURN_COMMIT_V2R = [
  'RENDERED_VISUAL_PROOF',
  'RENDERED_AUDIO_PROOF',
  'PROJECTSERVICE_RELOAD_PROOF',
  'PRODUCT_ACCEPTANCE',
] as const;

interface ProviderNativeEpisodeResumeCheckpointBaseV2R {
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  route: Readonly<ProviderNativeRouteV2R>;
  episodeId: string;
  contextSha256: string;
  toolSetSha256: string;
  argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES';
  completedTurns: readonly Readonly<JsonRecord>[];
  completedTurnsSha256: string;
  nextTurn: number;
  whatHasNotBeenChecked: readonly string[];
  stateEffects: readonly [];
  checkpointSha256: string;
}

export interface ProviderNativeRuntimeGuardResumeStateV2R {
  version: typeof PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R;
  authority: 'RESEARCH_RUNTIME_GUARD_RESUME_NO_PROJECT_MUTATION';
  guardKind: string;
  guardIdentitySha256: string;
  completedTurnsSha256: string;
  nextTurn: number;
  state: Readonly<JsonRecord>;
  resumeStateSha256: string;
}

export type ProviderNativeEpisodeResumeCheckpointV2R =
  | (ProviderNativeEpisodeResumeCheckpointBaseV2R & Readonly<{
      checkpointVersion: typeof PROVIDER_NATIVE_EPISODE_RESUME_VERSION_V2R;
    }>)
  | (ProviderNativeEpisodeResumeCheckpointBaseV2R & Readonly<{
      checkpointVersion:
        typeof PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_BOUND_VERSION_V2R;
      referenceInputManifestSha256: string;
    }>)
  | (ProviderNativeEpisodeResumeCheckpointBaseV2R & Readonly<{
      checkpointVersion:
        typeof PROVIDER_NATIVE_EPISODE_RESUME_RUNTIME_BOUND_VERSION_V2R;
      runtimeGuardResumeState: Readonly<ProviderNativeRuntimeGuardResumeStateV2R>;
    }>)
  | (ProviderNativeEpisodeResumeCheckpointBaseV2R & Readonly<{
      checkpointVersion:
        typeof PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_RUNTIME_BOUND_VERSION_V2R;
      referenceInputManifestSha256: string;
      runtimeGuardResumeState: Readonly<ProviderNativeRuntimeGuardResumeStateV2R>;
    }>);

export interface ProviderNativeEpisodeResumeStateV2R {
  turns: readonly Readonly<JsonRecord>[];
  selectedOperatorIds: readonly string[];
  callCounts: readonly Readonly<{ fingerprint: string; count: number }>[];
  mutationEpoch: number;
  operatorArgumentRepairCount: number;
  nextTurn: number;
  publicResumeContext: Readonly<JsonRecord>;
}

export interface ProviderNativeResumedEpisodeReceiptV2R {
  receiptVersion: typeof PROVIDER_NATIVE_RESUMED_RECEIPT_VERSION_V2R;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  resumeCheckpointSha256: string;
  episodeReceiptSha256: string;
  completedPrefixSha256: string;
  resumedSuffixSha256: string;
  stateEffects: readonly [];
  receiptSha256: string;
}

/**
 * This checkpoint is an integrity boundary, not a second plan or project owner.
 * Hydration independently rebuilds calls, arguments, opaque results, mutation
 * epochs and the latest writer revision from the exact committed turn prefix.
 */
export function createProviderNativeEpisodeResumeCheckpointV2R(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  episodeId: string;
  contextSha256: string;
  toolSetSha256: string;
  completedTurns: readonly Readonly<JsonRecord>[];
  referenceInputManifestSha256?: string;
  runtimeGuardResumeState?: Readonly<ProviderNativeRuntimeGuardResumeStateV2R>;
}): Readonly<ProviderNativeEpisodeResumeCheckpointV2R> {
  requireIdentity(input.episodeId, 'EPISODE');
  requireSha256(input.contextSha256, 'CONTEXT');
  requireSha256(input.toolSetSha256, 'TOOL_SET');
  if (input.referenceInputManifestSha256 !== undefined) {
    requireSha256(input.referenceInputManifestSha256, 'REFERENCE_INPUT_MANIFEST');
  }
  requireContiguousTurns(input.completedTurns);
  const completedTurns = input.completedTurns.map((turn) => ({ ...turn }));
  const completedTurnsSha256 = hashCanonicalJsonV1(completedTurns);
  const nextTurn = completedTurns.length + 1;
  const referenceBound = input.referenceInputManifestSha256 !== undefined;
  const runtimeBound = input.runtimeGuardResumeState !== undefined;
  if (input.runtimeGuardResumeState) {
    verifyRuntimeGuardResumeState(
      input.runtimeGuardResumeState,
      completedTurnsSha256,
      nextTurn,
    );
  }
  const material = {
    checkpointVersion: checkpointVersion(referenceBound, runtimeBound),
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    route: input.route,
    episodeId: input.episodeId,
    contextSha256: input.contextSha256,
    toolSetSha256: input.toolSetSha256,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES' as const,
    completedTurns,
    completedTurnsSha256,
    nextTurn,
    whatHasNotBeenChecked: [...UNCHECKED_AFTER_TURN_COMMIT_V2R],
    ...(referenceBound ? {
      referenceInputManifestSha256: input.referenceInputManifestSha256,
    } : {}),
    ...(runtimeBound ? {
      runtimeGuardResumeState: structuredClone(input.runtimeGuardResumeState),
    } : {}),
    stateEffects: [] as const,
  };
  return deepFreezeV1({
    ...material,
    checkpointSha256: hashCanonicalJsonV1(material),
  }) as Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
}

export function hydrateProviderNativeEpisodeResumeCheckpointV2R(input: {
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  route: Readonly<ProviderNativeRouteV2R>;
  episodeId: string;
  contextSha256: string;
  toolSet: Readonly<ProviderNativeToolSetV2R>;
  exactToolSet: Readonly<ProviderNativeToolSetV2R>;
  initialHistory: readonly unknown[];
  maxOutputTokensPerTurn: number;
  maxOperatorArgumentRepairs: number;
  currentProjectRevision: string;
  referenceInputManifestSha256?: string;
  resultReferences: ProviderNativeResultReferenceRegistryV2R;
}): Readonly<ProviderNativeEpisodeResumeStateV2R> {
  verifyCheckpointEnvelope(input.checkpoint);
  if (canonicalizeJsonV1(input.checkpoint.route) !== canonicalizeJsonV1(input.route)) {
    throw new Error('PROVIDER_NATIVE_RESUME_ROUTE_MISMATCH');
  }
  if (input.checkpoint.episodeId !== input.episodeId) {
    throw new Error('PROVIDER_NATIVE_RESUME_EPISODE_MISMATCH');
  }
  if (input.checkpoint.contextSha256 !== input.contextSha256) {
    throw new Error('PROVIDER_NATIVE_RESUME_CONTEXT_MISMATCH');
  }
  if (input.checkpoint.toolSetSha256 !== input.toolSet.toolSetSha256) {
    throw new Error('PROVIDER_NATIVE_RESUME_TOOL_SET_MISMATCH');
  }
  verifyReferenceInputBinding(
    input.checkpoint,
    input.referenceInputManifestSha256,
  );
  if (!input.currentProjectRevision.trim()) {
    throw new Error('PROVIDER_NATIVE_RESUME_CURRENT_REVISION_INVALID');
  }

  let history = [...input.initialHistory];
  const selectedOperatorIds: string[] = [];
  const callCounts = new Map<string, number>();
  let mutationEpoch = 0;
  let operatorArgumentRepairCount = 0;
  let latestWriterRevision: Readonly<{ resultReferenceId: string; valueSha256: string }> | null = null;

  for (const storedTurn of input.checkpoint.completedTurns) {
    const turn = positiveInteger(storedTurn.turn, 'TURN');
    const maxOutputTokens = 'runtimeGuardResumeState' in input.checkpoint
      ? positiveInteger(storedTurn.maxOutputTokens, 'TURN_MAX_OUTPUT_TOKENS')
      : input.maxOutputTokensPerTurn;
    if (maxOutputTokens < 64 || maxOutputTokens > input.maxOutputTokensPerTurn) {
      throw new Error('PROVIDER_NATIVE_RESUME_TURN_MAX_OUTPUT_TOKENS_INVALID');
    }
    const request = serializeProviderNativeTurnV2R({
      route: input.route,
      toolSet: input.toolSet,
      history,
      maxOutputTokens,
    });
    if (storedTurn.requestHash !== request.requestHash) {
      throw new Error('PROVIDER_NATIVE_RESUME_REQUEST_HASH_MISMATCH');
    }
    if (hashCanonicalJsonV1(storedTurn.rawResponse) !== storedTurn.rawResponseSha256) {
      throw new Error('PROVIDER_NATIVE_RESUME_RESPONSE_HASH_MISMATCH');
    }
    const responseStatus = positiveInteger(storedTurn.responseStatus, 'RESPONSE_STATUS');
    if (responseStatus < 200 || responseStatus >= 300) {
      throw new Error('PROVIDER_NATIVE_RESUME_NON_SUCCESS_PREFIX');
    }
    const normalized = normalizeProviderNativeTurnV2R(input.route.provider, storedTurn.rawResponse);
    if (normalized.refusal || normalized.toolCalls.length !== 1) {
      throw new Error('PROVIDER_NATIVE_RESUME_PREFIX_PROTOCOL_INVALID');
    }
    const call = normalized.toolCalls[0];
    if (!call.callId || !call.name || !call.arguments || call.argumentError
      || isFinishResearchEpisodeCallV2R(call)) {
      throw new Error('PROVIDER_NATIVE_RESUME_PREFIX_CALL_INVALID');
    }
    if (canonicalizeJsonV1(storedTurn.modelCall) !== canonicalizeJsonV1(call)) {
      throw new Error('PROVIDER_NATIVE_RESUME_MODEL_CALL_MISMATCH');
    }
    const exactTool = input.exactToolSet.operators.find(
      (candidate) => candidate.operatorId === call.name,
    );
    if (!exactTool || !input.toolSet.operatorIds.includes(call.name)) {
      throw new Error('PROVIDER_NATIVE_RESUME_OPERATOR_NOT_ELIGIBLE');
    }
    const resolution = input.resultReferences.resolveArguments({
      arguments: call.arguments,
      operator: exactTool,
      currentTurn: turn,
    });
    const args = normalizeProviderNativeExactArgumentsV2R(resolution.arguments, exactTool);
    const inputDiagnostics = [
      ...resolution.diagnostics,
      ...validateJsonSchemaV2(args, exactTool.exactInputSchema, '$.arguments'),
    ];
    if (canonicalizeJsonV1(storedTurn.normalizedArguments) !== canonicalizeJsonV1(args)
      || canonicalizeJsonV1(storedTurn.argumentReferenceBindings ?? [])
        !== canonicalizeJsonV1(resolution.bindings)) {
      throw new Error('PROVIDER_NATIVE_RESUME_ARGUMENT_BINDING_MISMATCH');
    }

    if (storedTurn.argumentRepair !== undefined) {
      operatorArgumentRepairCount += 1;
      if (!inputDiagnostics.length
        || operatorArgumentRepairCount > input.maxOperatorArgumentRepairs) {
        throw new Error('PROVIDER_NATIVE_RESUME_REPAIR_STATE_INVALID');
      }
      const expectedRepair = repairDiagnostic(
        exactTool.operatorId,
        inputDiagnostics,
        operatorArgumentRepairCount,
        input.maxOperatorArgumentRepairs,
      );
      if (canonicalizeJsonV1(storedTurn.argumentRepair)
        !== canonicalizeJsonV1(expectedRepair)) {
        throw new Error('PROVIDER_NATIVE_RESUME_REPAIR_RECEIPT_MISMATCH');
      }
      history = [...appendProviderNativeTurnV2R({
        provider: input.route.provider, history, response: normalized, call, result: expectedRepair,
      })];
      continue;
    }
    if (inputDiagnostics.length) {
      throw new Error('PROVIDER_NATIVE_RESUME_UNRECORDED_ARGUMENT_FAILURE');
    }

    const execution = asExecution(storedTurn.execution);
    validateExecution(execution);
    const outputDiagnostics = execution.disposition === 'OK'
      ? validateJsonSchemaV2(execution.output, exactTool.exactOutputSchema, '$.output')
      : validateNonOkOutput(execution.output);
    if (outputDiagnostics.length
      || canonicalizeJsonV1(storedTurn.outputDiagnostics ?? [])
        !== canonicalizeJsonV1(outputDiagnostics)) {
      throw new Error('PROVIDER_NATIVE_RESUME_EXECUTION_OUTPUT_INVALID');
    }
    const issued = execution.disposition === 'OK'
      ? input.resultReferences.issueFromOutput({
          originTurn: turn,
          sourceOperatorId: exactTool.operatorId,
          output: execution.output,
        })
      : [];
    if (canonicalizeJsonV1(storedTurn.issuedResultReferences ?? [])
      !== canonicalizeJsonV1(issued)) {
      throw new Error('PROVIDER_NATIVE_RESUME_ISSUED_REFERENCE_MISMATCH');
    }

    const fingerprint = hashCanonicalJsonV1({
      operatorId: exactTool.operatorId, arguments: args, mutationEpoch,
    });
    callCounts.set(fingerprint, (callCounts.get(fingerprint) ?? 0) + 1);
    selectedOperatorIds.push(exactTool.operatorId);
    if (execution.disposition === 'OK' && advancesEpisodeState(exactTool.kind)) {
      latestWriterRevision = requireWriterRevision(execution.output, issued);
      mutationEpoch += 1;
    }
    history = [...appendProviderNativeTurnV2R({
      provider: input.route.provider,
      history,
      response: normalized,
      call,
      result: appendResultReferencesForModelV2R(execution as unknown as JsonRecord, issued),
    })];
  }

  if (!latestWriterRevision) {
    throw new Error('PROVIDER_NATIVE_RESUME_WRITER_REVISION_BINDING_MISSING');
  }
  if (hashCanonicalJsonV1(input.currentProjectRevision) !== latestWriterRevision.valueSha256) {
    throw new Error('PROVIDER_NATIVE_RESUME_STALE_PROJECT_REVISION');
  }
  const publicResumeContext = deepFreezeV1({
    version: input.checkpoint.checkpointVersion,
    checkpointSha256: input.checkpoint.checkpointSha256,
    completedOperatorIds: [...selectedOperatorIds],
    completedTurnCount: input.checkpoint.completedTurns.length,
    nextTurn: input.checkpoint.nextTurn,
    latestWriterRevisionReferenceId: latestWriterRevision.resultReferenceId,
    ...('referenceInputManifestSha256' in input.checkpoint
      ? { referenceInputManifestSha256: input.checkpoint.referenceInputManifestSha256 }
      : {}),
    ...('runtimeGuardResumeState' in input.checkpoint ? {
      runtimeGuardKind: input.checkpoint.runtimeGuardResumeState.guardKind,
      runtimeGuardResumeStateSha256:
        input.checkpoint.runtimeGuardResumeState.resumeStateSha256,
    } : {}),
    whatHasNotBeenChecked: [...input.checkpoint.whatHasNotBeenChecked],
    instruction: 'Continue from the completed operations. Use the opaque latest-writer reference for downstream expectedProjectRevision; never copy a revision literal or repeat completed mutations.',
  });
  return deepFreezeV1({
    turns: input.checkpoint.completedTurns.map((entry) => ({ ...entry })),
    selectedOperatorIds,
    callCounts: [...callCounts.entries()].map(([fingerprint, count]) => ({ fingerprint, count })),
    mutationEpoch,
    operatorArgumentRepairCount,
    nextTurn: input.checkpoint.nextTurn,
    publicResumeContext,
  });
}

export function buildProviderNativeResumePromptContextV2R(
  context: Readonly<ProviderNativeEpisodeContextV2R>,
  publicResumeContext: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const projectState = record(context.projectState);
  const revisionBinding = record(context.revisionBinding);
  const projectId = text(projectState.projectId) || text(revisionBinding.projectId);
  return deepFreezeV1({
    episodeId: context.episodeId,
    objective: context.objective,
    activeTarget: context.activeTarget,
    projectIdentity: projectId ? { projectId } : { status: 'BOUND_BY_CONTEXT_HASH' },
    revisionBinding: {
      status: 'SUPERSEDED_BY_OPAQUE_WRITER_REFERENCE',
      resultReferenceId: publicResumeContext.latestWriterRevisionReferenceId,
    },
    evidence: context.evidence,
    preservationRules: context.preservationRules,
    authorityAndPolicy: context.authorityAndPolicy,
    budget: context.budget,
  });
}

export function buildProviderNativeResumedEpisodeReceiptV2R(input: {
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
}): Readonly<ProviderNativeResumedEpisodeReceiptV2R> {
  verifyCheckpointEnvelope(input.checkpoint);
  if (hashCanonicalJsonV1(input.episodeReceipt.turns)
      !== input.episodeReceipt.transcriptSha256
    || hashCanonicalJsonV1(episodeReceiptMaterial(input.episodeReceipt))
      !== input.episodeReceipt.receiptSha256) {
    throw new Error('PROVIDER_NATIVE_RESUMED_EPISODE_RECEIPT_HASH_MISMATCH');
  }
  if (input.episodeReceipt.episodeId !== input.checkpoint.episodeId
    || canonicalizeJsonV1(input.episodeReceipt.route)
      !== canonicalizeJsonV1(input.checkpoint.route)
    || input.episodeReceipt.contextSha256 !== input.checkpoint.contextSha256
    || input.episodeReceipt.toolSetSha256 !== input.checkpoint.toolSetSha256
    || input.episodeReceipt.argumentHandoffMode !== 'OPAQUE_RESULT_REFERENCES') {
    throw new Error('PROVIDER_NATIVE_RESUMED_RECEIPT_IDENTITY_MISMATCH');
  }
  const prefix = input.episodeReceipt.turns.slice(0, input.checkpoint.completedTurns.length);
  if (hashCanonicalJsonV1(prefix) !== input.checkpoint.completedTurnsSha256) {
    throw new Error('PROVIDER_NATIVE_RESUMED_RECEIPT_PREFIX_MISMATCH');
  }
  const suffix = input.episodeReceipt.turns.slice(input.checkpoint.completedTurns.length);
  if (!suffix.length) throw new Error('PROVIDER_NATIVE_RESUMED_RECEIPT_SUFFIX_EMPTY');
  const material = {
    receiptVersion: PROVIDER_NATIVE_RESUMED_RECEIPT_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    resumeCheckpointSha256: input.checkpoint.checkpointSha256,
    episodeReceiptSha256: input.episodeReceipt.receiptSha256,
    completedPrefixSha256: input.checkpoint.completedTurnsSha256,
    resumedSuffixSha256: hashCanonicalJsonV1(suffix),
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function episodeReceiptMaterial(receipt: Readonly<ProviderNativeEpisodeReceiptV2R>) {
  return {
    receiptVersion: receipt.receiptVersion,
    authority: receipt.authority,
    route: receipt.route,
    episodeId: receipt.episodeId,
    contextSha256: receipt.contextSha256,
    toolSetSha256: receipt.toolSetSha256,
    argumentHandoffMode: receipt.argumentHandoffMode,
    selectedOperatorIds: receipt.selectedOperatorIds,
    turns: receipt.turns,
    terminal: receipt.terminal,
    productOutcome: receipt.productOutcome,
    stateEffects: receipt.stateEffects,
    transcriptSha256: receipt.transcriptSha256,
  };
}

export function normalizeProviderNativeExactArgumentsV2R(
  args: Readonly<JsonRecord>,
  tool: Readonly<ProviderNativeOperatorToolV2R>,
): JsonRecord {
  if (!tool.openAiStrict) return { ...args };
  return normalizeOptionalNullsAgainstSchema(args, tool.exactInputSchema) as JsonRecord;
}

function verifyCheckpointEnvelope(checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>): void {
  if (![PROVIDER_NATIVE_EPISODE_RESUME_VERSION_V2R,
    PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_BOUND_VERSION_V2R,
    PROVIDER_NATIVE_EPISODE_RESUME_RUNTIME_BOUND_VERSION_V2R,
    PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_RUNTIME_BOUND_VERSION_V2R]
    .includes(checkpoint.checkpointVersion)
    || checkpoint.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || checkpoint.argumentHandoffMode !== 'OPAQUE_RESULT_REFERENCES'
    || checkpoint.stateEffects.length
    || canonicalizeJsonV1(checkpoint.whatHasNotBeenChecked)
      !== canonicalizeJsonV1(UNCHECKED_AFTER_TURN_COMMIT_V2R)) {
    throw new Error('PROVIDER_NATIVE_RESUME_CHECKPOINT_ENVELOPE_INVALID');
  }
  const referenceBound = checkpoint.checkpointVersion
      === PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_BOUND_VERSION_V2R
    || checkpoint.checkpointVersion
      === PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_RUNTIME_BOUND_VERSION_V2R;
  const runtimeBound = checkpoint.checkpointVersion
      === PROVIDER_NATIVE_EPISODE_RESUME_RUNTIME_BOUND_VERSION_V2R
    || checkpoint.checkpointVersion
      === PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_RUNTIME_BOUND_VERSION_V2R;
  if (referenceBound && 'referenceInputManifestSha256' in checkpoint) {
    requireSha256(
      checkpoint.referenceInputManifestSha256,
      'REFERENCE_INPUT_MANIFEST',
    );
  } else if (referenceBound || 'referenceInputManifestSha256' in checkpoint) {
    throw new Error('PROVIDER_NATIVE_RESUME_CHECKPOINT_ENVELOPE_INVALID');
  }
  requireContiguousTurns(checkpoint.completedTurns);
  if (runtimeBound && 'runtimeGuardResumeState' in checkpoint) {
    verifyRuntimeGuardResumeState(
      checkpoint.runtimeGuardResumeState,
      checkpoint.completedTurnsSha256,
      checkpoint.nextTurn,
    );
  } else if (runtimeBound || 'runtimeGuardResumeState' in checkpoint) {
    throw new Error('PROVIDER_NATIVE_RESUME_CHECKPOINT_ENVELOPE_INVALID');
  }
  if (checkpoint.nextTurn !== checkpoint.completedTurns.length + 1
    || hashCanonicalJsonV1(checkpoint.completedTurns) !== checkpoint.completedTurnsSha256
    || hashCanonicalJsonV1(checkpointMaterial(checkpoint)) !== checkpoint.checkpointSha256) {
    throw new Error('PROVIDER_NATIVE_RESUME_CHECKPOINT_HASH_MISMATCH');
  }
}

function checkpointMaterial(checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>) {
  return {
    checkpointVersion: checkpoint.checkpointVersion,
    authority: checkpoint.authority,
    route: checkpoint.route,
    episodeId: checkpoint.episodeId,
    contextSha256: checkpoint.contextSha256,
    toolSetSha256: checkpoint.toolSetSha256,
    argumentHandoffMode: checkpoint.argumentHandoffMode,
    completedTurns: checkpoint.completedTurns,
    completedTurnsSha256: checkpoint.completedTurnsSha256,
    nextTurn: checkpoint.nextTurn,
    whatHasNotBeenChecked: checkpoint.whatHasNotBeenChecked,
    ...('referenceInputManifestSha256' in checkpoint
      ? { referenceInputManifestSha256: checkpoint.referenceInputManifestSha256 }
      : {}),
    ...('runtimeGuardResumeState' in checkpoint
      ? { runtimeGuardResumeState: checkpoint.runtimeGuardResumeState }
      : {}),
    stateEffects: checkpoint.stateEffects,
  };
}

function verifyReferenceInputBinding(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  suppliedManifestSha256: string | undefined,
): void {
  if ('referenceInputManifestSha256' in checkpoint) {
    if (!suppliedManifestSha256) {
      throw new Error('PROVIDER_NATIVE_RESUME_REFERENCE_INPUT_REQUIRED');
    }
    requireSha256(suppliedManifestSha256, 'REFERENCE_INPUT_MANIFEST');
    if (suppliedManifestSha256 !== checkpoint.referenceInputManifestSha256) {
      throw new Error('PROVIDER_NATIVE_RESUME_REFERENCE_INPUT_MISMATCH');
    }
    return;
  }
  if (suppliedManifestSha256 !== undefined) {
    throw new Error('PROVIDER_NATIVE_RESUME_REFERENCE_INPUT_UNBOUND');
  }
}

function checkpointVersion(referenceBound: boolean, runtimeBound: boolean) {
  if (referenceBound && runtimeBound) {
    return PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_RUNTIME_BOUND_VERSION_V2R;
  }
  if (runtimeBound) return PROVIDER_NATIVE_EPISODE_RESUME_RUNTIME_BOUND_VERSION_V2R;
  return referenceBound
    ? PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_BOUND_VERSION_V2R
    : PROVIDER_NATIVE_EPISODE_RESUME_VERSION_V2R;
}

function verifyRuntimeGuardResumeState(
  resumeState: Readonly<ProviderNativeRuntimeGuardResumeStateV2R>,
  completedTurnsSha256: string,
  nextTurn: number,
): void {
  if (resumeState.version !== PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R
    || resumeState.authority !== 'RESEARCH_RUNTIME_GUARD_RESUME_NO_PROJECT_MUTATION'
    || !resumeState.guardKind.trim()
    || resumeState.completedTurnsSha256 !== completedTurnsSha256
    || resumeState.nextTurn !== nextTurn
    || !Object.keys(record(resumeState.state)).length) {
    throw new Error('PROVIDER_NATIVE_RESUME_RUNTIME_GUARD_STATE_INVALID');
  }
  requireSha256(resumeState.guardIdentitySha256, 'RUNTIME_GUARD_IDENTITY');
  requireSha256(resumeState.completedTurnsSha256, 'RUNTIME_GUARD_TURNS');
  requireSha256(resumeState.resumeStateSha256, 'RUNTIME_GUARD_STATE');
  const material = {
    version: resumeState.version,
    authority: resumeState.authority,
    guardKind: resumeState.guardKind,
    guardIdentitySha256: resumeState.guardIdentitySha256,
    completedTurnsSha256: resumeState.completedTurnsSha256,
    nextTurn: resumeState.nextTurn,
    state: resumeState.state,
  };
  if (hashCanonicalJsonV1(material) !== resumeState.resumeStateSha256
    || canonicalizeJsonV1(resumeState)
      !== canonicalizeJsonV1({ ...material, resumeStateSha256: resumeState.resumeStateSha256 })) {
    throw new Error('PROVIDER_NATIVE_RESUME_RUNTIME_GUARD_STATE_HASH_MISMATCH');
  }
}

function requireWriterRevision(
  output: Readonly<JsonRecord>,
  issued: readonly Readonly<ProviderNativeIssuedResultReferenceV2R>[],
) {
  const matches = issued.filter((entry) => entry.sourceOutputField === 'receipt.projectRevision');
  if (matches.length !== 1) {
    throw new Error('PROVIDER_NATIVE_RESUME_WRITER_REVISION_REFERENCE_INVALID');
  }
  const value = valueAtPath(output, matches[0].sourceOutputPath);
  if (typeof value !== 'string' || !value.trim()
    || hashCanonicalJsonV1(value) !== matches[0].valueSha256) {
    throw new Error('PROVIDER_NATIVE_RESUME_WRITER_REVISION_VALUE_INVALID');
  }
  return { resultReferenceId: matches[0].resultReferenceId, valueSha256: matches[0].valueSha256 };
}

function repairDiagnostic(
  operatorId: string,
  diagnostics: readonly string[],
  repairAttempt: number,
  maxRepairAttempts: number,
): Readonly<ProviderNativeToolExecutionV2R> {
  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'FAIL' as const,
    output: {
      code: 'OPERATOR_ARGUMENT_SCHEMA_INVALID',
      message: 'The call was rejected before execution. Correct the arguments against the exact declared schema and retry the same intended operation.',
      details: { operatorId, diagnostics: [...diagnostics], repairAttempt, maxRepairAttempts },
    },
    evidenceIds: [] as const,
  });
}

function advancesEpisodeState(kind: string): boolean {
  return ['MUTATION', 'MUTATION_LEGACY', 'GENERATED_COMPOSITION', 'GENERATED_CODE_LEGACY']
    .includes(kind);
}

function asExecution(value: unknown): Readonly<ProviderNativeToolExecutionV2R> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('PROVIDER_NATIVE_RESUME_EXECUTION_ENVELOPE_INVALID');
  }
  return value as Readonly<ProviderNativeToolExecutionV2R>;
}

function validateExecution(value: Readonly<ProviderNativeToolExecutionV2R>): void {
  if (value.authority !== 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION'
    || !['OK', 'FAIL', 'UNVERIFIABLE', 'CONFLICT'].includes(value.disposition)
    || !value.output || typeof value.output !== 'object' || Array.isArray(value.output)
    || !Array.isArray(value.evidenceIds)
    || value.evidenceIds.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new Error('PROVIDER_NATIVE_RESUME_EXECUTION_ENVELOPE_INVALID');
  }
}

function validateNonOkOutput(output: Readonly<JsonRecord>): string[] {
  const diagnostics: string[] = [];
  if (typeof output.code !== 'string' || !output.code.trim()) diagnostics.push('code');
  if (typeof output.message !== 'string' || !output.message.trim()) diagnostics.push('message');
  if (output.details !== undefined
    && (!output.details || typeof output.details !== 'object' || Array.isArray(output.details))) {
    diagnostics.push('details');
  }
  return diagnostics;
}

function normalizeOptionalNullsAgainstSchema(value: unknown, schema: Readonly<JsonRecord>): unknown {
  if (Array.isArray(value)) {
    const itemSchema = record(schema.items);
    return value.map((entry) => normalizeOptionalNullsAgainstSchema(entry, itemSchema));
  }
  if (!value || typeof value !== 'object') return value;
  const properties = record(schema.properties);
  const required = new Set(strings(schema.required));
  return Object.fromEntries(Object.entries(value as JsonRecord).flatMap(([field, child]) => {
    if (child === null && !required.has(field)) return [];
    return [[field, normalizeOptionalNullsAgainstSchema(child, record(properties[field]))]];
  }));
}

function requireContiguousTurns(turns: readonly Readonly<JsonRecord>[]): void {
  if (!turns.length || turns.length > 31) {
    throw new Error('PROVIDER_NATIVE_RESUME_TURN_COUNT_INVALID');
  }
  turns.forEach((turn, index) => {
    if (turn.turn !== index + 1) throw new Error('PROVIDER_NATIVE_RESUME_TURNS_NOT_CONTIGUOUS');
  });
}

function valueAtPath(root: Readonly<JsonRecord>, path: readonly string[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)
      || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as JsonRecord)[segment];
  }
  return current;
}

function requireSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`PROVIDER_NATIVE_RESUME_${label}_HASH_INVALID`);
}

function requireIdentity(value: string, label: string): void {
  if (!value.trim()) throw new Error(`PROVIDER_NATIVE_RESUME_${label}_INVALID`);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`PROVIDER_NATIVE_RESUME_${label}_INVALID`);
  }
  return Number(value);
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
