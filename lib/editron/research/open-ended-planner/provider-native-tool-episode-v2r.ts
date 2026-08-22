import { canonicalizeJsonV1, deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  appendProviderNativeTurnV2R,
  buildProviderNativeInitialHistoryV2R,
  isFinishResearchEpisodeCallV2R,
  normalizeProviderNativeTurnV2R,
  serializeProviderNativeTurnV2R,
  type ProviderNativeRouteV2R,
  type SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import {
  buildProviderNativeToolSetV2R,
  type ProviderNativeOperatorToolV2R,
  type ProviderNativeToolSetV2R,
} from './provider-native-tool-catalog-v2r';
import {
  appendResultReferencesForModelV2R,
  buildOpaqueResultReferenceToolSetV2R,
  buildProviderNativeResultReferenceProjectionPolicyV2R,
  ProviderNativeResultReferenceRegistryV2R,
  type ProviderNativeArgumentHandoffModeV2R,
} from './provider-native-result-references-v2r';
import type { ProviderNativeReferenceInputV2R } from './provider-native-reference-input-v2r';
import { validateJsonSchemaV2 } from './stage4-compilation-evaluator-v2';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_EPISODE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_EPISODE_V2R_8' as const;
export const MAX_OPERATOR_ARGUMENT_REPAIRS_PER_EPISODE_V2R = 2 as const;

export type ProviderNativeTerminalDispositionV2R =
  | 'READY_FOR_PROOF' | 'PASS' | 'FAIL' | 'UNVERIFIABLE' | 'CAPABILITY_GAP'
  | 'CLARIFICATION_REQUIRED' | 'POLICY_BLOCKED' | 'CONFLICT'
  | 'PROVIDER_RATE_LIMIT' | 'PROVIDER_TIMEOUT' | 'PROVIDER_REFUSAL'
  | 'PROVIDER_ERROR' | 'TOOL_PROTOCOL_FAILURE' | 'TOOL_EXECUTION_FAILURE'
  | 'STEP_BUDGET_EXHAUSTED' | 'RESOURCE_BUDGET_EXHAUSTED'
  | 'RESOURCE_ACCOUNTING_UNVERIFIABLE';

export type ProviderNativeRuntimeGuardDecisionV2R = Readonly<
  | {
      status: 'ALLOW';
      audit: Readonly<JsonRecord>;
      maxOutputTokens?: number;
    }
  | {
      status: 'DENY';
      disposition: 'RESOURCE_BUDGET_EXHAUSTED' | 'RESOURCE_ACCOUNTING_UNVERIFIABLE';
      reasonCode: string;
      summary: string;
      audit: Readonly<JsonRecord>;
    }
>;

export interface ProviderNativeRuntimeGuardV2R {
  beforeTurn(input: Readonly<{
    turn: number;
    configuredMaxOutputTokens: number;
  }>): ProviderNativeRuntimeGuardDecisionV2R | Promise<ProviderNativeRuntimeGuardDecisionV2R>;
  beforeInvoke(input: Readonly<{
    turn: number;
    request: Readonly<SerializedProviderNativeTurnV2R>;
    maxOutputTokens: number;
  }>): ProviderNativeRuntimeGuardDecisionV2R | Promise<ProviderNativeRuntimeGuardDecisionV2R>;
  afterInvoke(input: Readonly<{
    turn: number;
    request: Readonly<SerializedProviderNativeTurnV2R>;
    response: Readonly<ProviderNativeInvokeResponseV2R>;
    maxOutputTokens: number;
  }>): ProviderNativeRuntimeGuardDecisionV2R | Promise<ProviderNativeRuntimeGuardDecisionV2R>;
  beforeExecute(input: Readonly<{
    turn: number;
    operatorId: string;
    arguments: Readonly<JsonRecord>;
  }>): ProviderNativeRuntimeGuardDecisionV2R | Promise<ProviderNativeRuntimeGuardDecisionV2R>;
  afterExecute(input: Readonly<{
    turn: number;
    operatorId: string;
    arguments: Readonly<JsonRecord>;
    execution: Readonly<ProviderNativeToolExecutionV2R>;
  }>): ProviderNativeRuntimeGuardDecisionV2R | Promise<ProviderNativeRuntimeGuardDecisionV2R>;
}

export interface ProviderNativeEpisodeContextV2R {
  episodeId: string;
  objective: string;
  activeTarget: Readonly<JsonRecord>;
  revisionBinding: Readonly<JsonRecord>;
  projectState: Readonly<JsonRecord>;
  evidence: readonly Readonly<JsonRecord>[];
  preservationRules: readonly string[];
  authorityAndPolicy: Readonly<JsonRecord>;
  budget: Readonly<{
    maxTurns: number;
    maxOutputTokensPerTurn: number;
    maxIdenticalCalls: number;
  }>;
}

export interface ProviderNativeToolExecutionV2R {
  authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION';
  disposition: 'OK' | 'FAIL' | 'UNVERIFIABLE' | 'CONFLICT';
  output: Readonly<JsonRecord>;
  evidenceIds: readonly string[];
}

export interface ProviderNativeInvokeResponseV2R {
  status: number;
  body: unknown;
}

export class ProviderNativeTransportErrorV2R extends Error {
  constructor(public readonly code: 'PROVIDER_TIMEOUT' | 'PROVIDER_ERROR', message: string) {
    super(message);
    this.name = 'ProviderNativeTransportErrorV2R';
  }
}

export interface ProviderNativeEpisodeReceiptV2R {
  receiptVersion: typeof PROVIDER_NATIVE_EPISODE_VERSION_V2R;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  route: Readonly<ProviderNativeRouteV2R>;
  episodeId: string;
  contextSha256: string;
  toolSetSha256: string;
  argumentHandoffMode: ProviderNativeArgumentHandoffModeV2R;
  selectedOperatorIds: readonly string[];
  turns: readonly Readonly<JsonRecord>[];
  terminal: Readonly<{
    disposition: ProviderNativeTerminalDispositionV2R;
    reasonCodes: readonly string[];
    evidenceIds: readonly string[];
    summary: string;
  }>;
  productOutcome: 'NOT_EVALUATED_ADAPTER_ONLY';
  stateEffects: readonly [];
  transcriptSha256: string;
  receiptSha256: string;
}

export async function runProviderNativeToolEpisodeV2R(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  context: Readonly<ProviderNativeEpisodeContextV2R>;
  eligibleOperatorIds: readonly string[];
  argumentHandoffMode?: ProviderNativeArgumentHandoffModeV2R;
  referenceInput?: Readonly<ProviderNativeReferenceInputV2R>;
  finishInputSchema?: Readonly<JsonRecord>;
  toolSetFactory?: (input: Readonly<{
    eligibleOperatorIds: readonly string[];
    finishInputSchema?: Readonly<JsonRecord>;
  }>) => Readonly<ProviderNativeToolSetV2R>;
  additionalInstructions?: readonly string[];
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>) => Promise<ProviderNativeInvokeResponseV2R>;
  runtimeGuard?: Readonly<ProviderNativeRuntimeGuardV2R>;
  executeIsolated: (
    call: Readonly<{ operatorId: string; arguments: Readonly<JsonRecord>; turn: number }>,
  ) => Promise<Readonly<ProviderNativeToolExecutionV2R>>;
}): Promise<Readonly<ProviderNativeEpisodeReceiptV2R>> {
  validateContext(input.context);
  const additionalInstructions = validateAdditionalInstructions(input.additionalInstructions);
  const argumentHandoffMode = input.argumentHandoffMode ?? 'DIRECT_ARGUMENTS';
  const exactToolSet = input.toolSetFactory
    ? input.toolSetFactory({
      eligibleOperatorIds: input.eligibleOperatorIds,
      finishInputSchema: input.finishInputSchema,
    })
    : buildProviderNativeToolSetV2R(
      input.eligibleOperatorIds,
      input.finishInputSchema,
    );
  assertEpisodeToolSetAuthority(input, exactToolSet);
  const toolSet = argumentHandoffMode === 'OPAQUE_RESULT_REFERENCES'
    ? buildOpaqueResultReferenceToolSetV2R(exactToolSet)
    : exactToolSet;
  const resultReferenceProjectionPolicy =
    buildProviderNativeResultReferenceProjectionPolicyV2R(
      input.context as unknown as JsonRecord,
    );
  const resultReferences = new ProviderNativeResultReferenceRegistryV2R(
    input.context.episodeId,
    resultReferenceProjectionPolicy,
  );
  const contextSha256 = hashCanonicalJsonV1(input.context);
  const prompt = canonicalizeJsonV1({
    version: PROVIDER_NATIVE_EPISODE_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
    instructions: [
      'Choose exactly one next declared Editron operation per turn, or call finish_editron_research_episode.',
      'Use only the supplied revision-bound state, evidence, preservation rules and eligible operation records.',
      'Every listed operation is callable against an isolated research clone. A mutating operation may change only that clone; it cannot mutate a real user project.',
      'When an OK resolver result contains a proposedOperation, treat it as a causal handoff and invoke that declared target with the returned arguments unless later evidence makes it unsafe.',
      'A non-OK tool result is a diagnostic, not automatic proof of a capability gap. Correct valid inputs when possible; stop only when required evidence, capability or revision is truly unavailable.',
      'If a call is rejected before execution for schema-invalid arguments, use the returned diagnostics to correct that same intended operation. The fixed protocol-repair budget does not authorize a different creative operation.',
      'Use UNVERIFIABLE when required evidence or proof is absent, withheld, or insufficient. Use CAPABILITY_GAP only when no eligible operation can express the requested target even if sufficient evidence existed.',
      'Do not invent operations, internal ports, receipt plumbing, rendered proof or real-project mutation success.',
      'Treat every tool result as new causal state. When all requested isolated-clone edits are complete but system-owned render or acceptance proof has not run, finish READY_FOR_PROOF without claiming that proof.',
      'Finish PASS only when the supplied tool results already contain every required proof.',
      ...additionalInstructions,
      ...(argumentHandoffMode === 'OPAQUE_RESULT_REFERENCES' ? [
        'Declared prior tool-output projections expose opaque resultReferences while their raw values are withheld. To pass an exact prior value into a later operation, omit that direct argument and bind it with argumentReferences [{targetField,resultReferenceId}].',
        'Reference IDs are episode-local causal handles, not values. Do not copy, edit, predict or forge the referenced value. All direct and resolved arguments still undergo the operation exact-input validator before execution.',
      ] : []),
    ],
    context: input.context,
    toolAuthority: {
      toolSetSha256: toolSet.toolSetSha256,
      catalogIdentity: toolSet.catalogIdentity,
      dossierSha256: toolSet.dossierSha256,
      operators: toolSet.operators.map((tool) => ({
        operatorId: tool.operatorId,
        exactInputSchema: tool.exactInputSchema,
        providerCallInputSchema: tool.providerInputSchema,
        exactOutputSchema: tool.exactOutputSchema,
        plannerRecord: tool.plannerRecord,
      })),
    },
    protocolRepairPolicy: {
      operatorArgumentSchemaRepairAttempts:
        MAX_OPERATOR_ARGUMENT_REPAIRS_PER_EPISODE_V2R,
      invalidCallsAreNeverExecuted: true,
    },
    argumentHandoffPolicy: {
      mode: argumentHandoffMode,
      compilerMayAddCreativeOperations: false,
      referenceResolutionOccursBeforeExactInputValidation: true,
      declaredResultReferenceProjections: resultReferenceProjectionPolicy,
    },
  });
  let history = buildProviderNativeInitialHistoryV2R(
    input.route.provider,
    prompt,
    input.referenceInput,
  );
  const turns: JsonRecord[] = [];
  const selectedOperatorIds: string[] = [];
  const callCounts = new Map<string, number>();
  let mutationEpoch = 0;
  let operatorArgumentRepairCount = 0;

  for (let turn = 1; turn <= input.context.budget.maxTurns; turn += 1) {
    const runtimeGuardAudit: JsonRecord[] = [];
    const turnAuthorization = await runRuntimeGuardHook(
      input.runtimeGuard ? () => input.runtimeGuard!.beforeTurn({
        turn,
        configuredMaxOutputTokens: input.context.budget.maxOutputTokensPerTurn,
      }) : undefined,
      'BEFORE_TURN',
    );
    if (input.runtimeGuard) runtimeGuardAudit.push(turnAuthorization.audit);
    if (turnAuthorization.status === 'DENY') {
      turns.push({ turn, runtimeGuardAudit });
      return runtimeGuardFailure(
        input, toolSet.toolSetSha256, contextSha256, turns,
        selectedOperatorIds, turnAuthorization,
      );
    }
    const maxOutputTokens = turnAuthorization.maxOutputTokens
      ?? input.context.budget.maxOutputTokensPerTurn;
    if (!Number.isSafeInteger(maxOutputTokens)
      || maxOutputTokens < 64
      || maxOutputTokens > input.context.budget.maxOutputTokensPerTurn) {
      const denial = runtimeGuardAccountingFailure(
        'BEFORE_TURN_OUTPUT_LIMIT_INVALID',
        { turn, maxOutputTokens },
      );
      runtimeGuardAudit.push(denial.audit);
      turns.push({ turn, runtimeGuardAudit });
      return runtimeGuardFailure(
        input, toolSet.toolSetSha256, contextSha256, turns,
        selectedOperatorIds, denial,
      );
    }
    const request = serializeProviderNativeTurnV2R({
      route: input.route,
      toolSet,
      history,
      maxOutputTokens,
    });
    const requestAuthorization = await runRuntimeGuardHook(
      input.runtimeGuard
        ? () => input.runtimeGuard!.beforeInvoke({ turn, request, maxOutputTokens })
        : undefined,
      'BEFORE_INVOKE',
    );
    if (input.runtimeGuard) runtimeGuardAudit.push(requestAuthorization.audit);
    if (requestAuthorization.status === 'DENY') {
      turns.push({ turn, requestHash: request.requestHash, runtimeGuardAudit });
      return runtimeGuardFailure(
        input, toolSet.toolSetSha256, contextSha256, turns,
        selectedOperatorIds, requestAuthorization,
      );
    }
    let response: ProviderNativeInvokeResponseV2R;
    try {
      response = await input.invoke(request);
    } catch (error) {
      if (input.runtimeGuard) {
        const denial = runtimeGuardAccountingFailure(
          'PROVIDER_INVOKE_RESULT_UNAVAILABLE',
          { turn, requestHash: request.requestHash, error: errorMessage(error) },
        );
        runtimeGuardAudit.push(denial.audit);
        turns.push({ turn, requestHash: request.requestHash, runtimeGuardAudit });
        return runtimeGuardFailure(
          input, toolSet.toolSetSha256, contextSha256, turns,
          selectedOperatorIds, denial,
        );
      }
      const disposition = error instanceof ProviderNativeTransportErrorV2R
        ? error.code
        : 'PROVIDER_ERROR';
      return finalize(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, {
        disposition, reasonCodes: [disposition], evidenceIds: [], summary: errorMessage(error),
      });
    }
    const rawResponseSha256 = hashCanonicalJsonV1(response.body);
    const responseAccounting = await runRuntimeGuardHook(
      input.runtimeGuard
        ? () => input.runtimeGuard!.afterInvoke({ turn, request, response, maxOutputTokens })
        : undefined,
      'AFTER_INVOKE',
    );
    if (input.runtimeGuard) runtimeGuardAudit.push(responseAccounting.audit);
    if (responseAccounting.status === 'DENY') {
      turns.push({
        turn, requestHash: request.requestHash, responseStatus: response.status,
        rawResponseSha256, rawResponse: response.body, runtimeGuardAudit,
      });
      return runtimeGuardFailure(
        input, toolSet.toolSetSha256, contextSha256, turns,
        selectedOperatorIds, responseAccounting,
      );
    }
    if (response.status < 200 || response.status >= 300) {
      const disposition = mapHttpFailure(response.status);
      turns.push({
        turn, requestHash: request.requestHash, responseStatus: response.status,
        rawResponseSha256, rawResponse: response.body,
        ...(input.runtimeGuard ? { runtimeGuardAudit } : {}),
      });
      return finalize(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, {
        disposition, reasonCodes: [`HTTP_${response.status}`], evidenceIds: [], summary: disposition,
      });
    }
    const normalized = normalizeProviderNativeTurnV2R(input.route.provider, response.body);
    const turnBase: JsonRecord = {
      turn, requestHash: request.requestHash, responseStatus: response.status,
      rawResponseSha256, rawResponse: response.body,
      providerRequestId: normalized.providerRequestId,
      returnedModelIdentity: normalized.providerModel,
      finishReason: normalized.finishReason,
      ...(input.runtimeGuard ? { runtimeGuardAudit } : {}),
    };
    if (normalized.refusal) {
      turns.push({ ...turnBase, refusal: normalized.refusal });
      return finalize(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, {
        disposition: 'PROVIDER_REFUSAL', reasonCodes: ['PROVIDER_REFUSAL'], evidenceIds: [], summary: normalized.refusal,
      });
    }
    if (normalized.toolCalls.length !== 1) {
      turns.push({ ...turnBase, toolCallCount: normalized.toolCalls.length, text: normalized.text });
      return protocolFailure(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds,
        normalized.toolCalls.length > 1 ? 'PARALLEL_TOOL_CALLS_NOT_AUTHORIZED' : 'TYPED_TOOL_OR_FINISH_REQUIRED');
    }
    const call = normalized.toolCalls[0];
    if (!call.callId || !call.name || !call.arguments || call.argumentError) {
      turns.push({ ...turnBase, modelCall: call });
      return protocolFailure(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, 'TOOL_CALL_ARGUMENTS_INVALID');
    }
    if (isFinishResearchEpisodeCallV2R(call)) {
      const diagnostics = validateJsonSchemaV2(call.arguments, toolSet.finishControl.inputSchema, '$.finish');
      turns.push({ ...turnBase, modelCall: call, diagnostics });
      if (diagnostics.length) return protocolFailure(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, 'FINISH_SCHEMA_INVALID');
      return finalize(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, finishTerminal(call.arguments));
    }
    const tool = toolSet.operators.find((candidate) => candidate.operatorId === call.name);
    if (!tool) {
      turns.push({ ...turnBase, modelCall: call });
      return protocolFailure(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, 'OPERATOR_NOT_ELIGIBLE');
    }
    const exactTool = exactToolSet.operators.find((candidate) => candidate.operatorId === call.name);
    if (!exactTool) {
      turns.push({ ...turnBase, modelCall: call });
      return protocolFailure(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, 'EXACT_OPERATOR_AUTHORITY_MISSING');
    }
    const referenceResolution = argumentHandoffMode === 'OPAQUE_RESULT_REFERENCES'
      ? resultReferences.resolveArguments({
        arguments: call.arguments,
        operator: exactTool,
        currentTurn: turn,
      })
      : { arguments: call.arguments, bindings: [], diagnostics: [] };
    const args = normalizeStrictOptionalNulls(referenceResolution.arguments, exactTool);
    const inputDiagnostics = [
      ...referenceResolution.diagnostics,
      ...validateJsonSchemaV2(args, exactTool.exactInputSchema, '$.arguments'),
    ];
    if (inputDiagnostics.length) {
      operatorArgumentRepairCount += 1;
      const repair = operatorArgumentRepairDiagnostic(
        tool.operatorId,
        inputDiagnostics,
        operatorArgumentRepairCount,
      );
      turns.push({
        ...turnBase,
        modelCall: call,
        normalizedArguments: args,
        argumentReferenceBindings: referenceResolution.bindings,
        diagnostics: inputDiagnostics,
        argumentRepair: repair,
      });
      if (operatorArgumentRepairCount > MAX_OPERATOR_ARGUMENT_REPAIRS_PER_EPISODE_V2R) {
        return protocolFailure(
          input,
          toolSet.toolSetSha256,
          contextSha256,
          turns,
          selectedOperatorIds,
          'OPERATOR_ARGUMENT_SCHEMA_REPAIR_BUDGET_EXHAUSTED',
        );
      }
      history = appendProviderNativeTurnV2R({
        provider: input.route.provider,
        history,
        response: normalized,
        call,
        result: repair,
      });
      continue;
    }
    const fingerprint = hashCanonicalJsonV1({
      operatorId: tool.operatorId,
      arguments: args,
      mutationEpoch,
    });
    const repeatCount = (callCounts.get(fingerprint) ?? 0) + 1;
    callCounts.set(fingerprint, repeatCount);
    if (repeatCount > input.context.budget.maxIdenticalCalls) {
      turns.push({ ...turnBase, modelCall: call, callFingerprint: fingerprint, repeatCount });
      return protocolFailure(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, 'IDENTICAL_CALL_BUDGET_EXHAUSTED');
    }
    const operationAuthorization = await runRuntimeGuardHook(
      input.runtimeGuard ? () => input.runtimeGuard!.beforeExecute({
        turn, operatorId: exactTool.operatorId, arguments: args,
      }) : undefined,
      'BEFORE_EXECUTE',
    );
    if (input.runtimeGuard) runtimeGuardAudit.push(operationAuthorization.audit);
    if (operationAuthorization.status === 'DENY') {
      turns.push({
        ...turnBase, modelCall: call, normalizedArguments: args,
        runtimeGuardAudit,
      });
      return runtimeGuardFailure(
        input, toolSet.toolSetSha256, contextSha256, turns,
        selectedOperatorIds, operationAuthorization,
      );
    }
    let execution: Readonly<ProviderNativeToolExecutionV2R>;
    try {
      execution = await input.executeIsolated({ operatorId: exactTool.operatorId, arguments: args, turn });
    } catch (error) {
      turns.push({ ...turnBase, modelCall: call, normalizedArguments: args, executionError: errorMessage(error) });
      return finalize(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, {
        disposition: 'TOOL_EXECUTION_FAILURE', reasonCodes: ['ISOLATED_EXECUTOR_THROWN'],
        evidenceIds: [], summary: errorMessage(error),
      });
    }
    const executionAccounting = await runRuntimeGuardHook(
      input.runtimeGuard ? () => input.runtimeGuard!.afterExecute({
        turn, operatorId: exactTool.operatorId, arguments: args, execution,
      }) : undefined,
      'AFTER_EXECUTE',
    );
    if (input.runtimeGuard) runtimeGuardAudit.push(executionAccounting.audit);
    if (executionAccounting.status === 'DENY') {
      turns.push({
        ...turnBase, modelCall: call, normalizedArguments: args, execution,
        runtimeGuardAudit,
      });
      return runtimeGuardFailure(
        input, toolSet.toolSetSha256, contextSha256, turns,
        selectedOperatorIds, executionAccounting,
      );
    }
    if (!validExecutionEnvelope(execution)) {
      turns.push({ ...turnBase, modelCall: call, normalizedArguments: args, execution });
      return protocolFailure(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, 'ISOLATED_EXECUTION_ENVELOPE_INVALID');
    }
    const outputDiagnostics = execution.disposition === 'OK'
      ? validateJsonSchemaV2(execution.output, exactTool.exactOutputSchema, '$.output')
      : validateNonOkExecutionOutput(execution.output);
    if (outputDiagnostics.length) {
      turns.push({
        ...turnBase,
        modelCall: call,
        normalizedArguments: args,
        argumentReferenceBindings: referenceResolution.bindings,
        execution,
        outputDiagnostics,
      });
      return protocolFailure(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, 'OPERATOR_RESULT_SCHEMA_INVALID');
    }
    const issuedResultReferences = execution.disposition === 'OK'
      && argumentHandoffMode === 'OPAQUE_RESULT_REFERENCES'
      ? resultReferences.issueFromOutput({
        originTurn: turn,
        sourceOperatorId: exactTool.operatorId,
        output: execution.output,
      })
      : [];
    turns.push({
      ...turnBase,
      modelCall: call,
      normalizedArguments: args,
      argumentReferenceBindings: referenceResolution.bindings,
      execution,
      issuedResultReferences,
      outputDiagnostics,
    });
    selectedOperatorIds.push(exactTool.operatorId);
    if (execution.disposition === 'OK' && advancesEpisodeState(exactTool.kind)) mutationEpoch += 1;
    history = appendProviderNativeTurnV2R({
      provider: input.route.provider, history, response: normalized, call,
      result: appendResultReferencesForModelV2R(
        execution as unknown as JsonRecord,
        issuedResultReferences,
      ),
    });
  }
  return finalize(input, toolSet.toolSetSha256, contextSha256, turns, selectedOperatorIds, {
    disposition: 'STEP_BUDGET_EXHAUSTED', reasonCodes: ['STEP_BUDGET_EXHAUSTED'], evidenceIds: [],
    summary: 'The model did not issue a typed finish disposition within the frozen turn budget.',
  });
}

function assertEpisodeToolSetAuthority(
  input: Parameters<typeof runProviderNativeToolEpisodeV2R>[0],
  toolSet: Readonly<ProviderNativeToolSetV2R>,
): void {
  const material = {
    version: toolSet.version,
    authority: toolSet.authority,
    catalogIdentity: toolSet.catalogIdentity,
    dossierSha256: toolSet.dossierSha256,
    operatorIds: toolSet.operatorIds,
    operators: toolSet.operators,
    finishControl: toolSet.finishControl,
  };
  if (hashCanonicalJsonV1(material) !== toolSet.toolSetSha256) {
    throw new Error('PROVIDER_NATIVE_TOOL_SET_HASH_MISMATCH');
  }
  if (canonicalizeJsonV1(toolSet.operatorIds)
    !== canonicalizeJsonV1(input.eligibleOperatorIds)) {
    throw new Error('PROVIDER_NATIVE_TOOL_SET_OPERATOR_IDS_MISMATCH');
  }
  if (toolSet.operators.length !== toolSet.operatorIds.length
    || toolSet.operators.some((operator, index) => (
      operator.operatorId !== toolSet.operatorIds[index]
    ))) {
    throw new Error('PROVIDER_NATIVE_TOOL_SET_OPERATOR_RECORDS_MISMATCH');
  }
  if (input.finishInputSchema
    && canonicalizeJsonV1(toolSet.finishControl.inputSchema)
      !== canonicalizeJsonV1(input.finishInputSchema)) {
    throw new Error('PROVIDER_NATIVE_TOOL_SET_FINISH_SCHEMA_MISMATCH');
  }
}

async function runRuntimeGuardHook(
  invoke: (() => ProviderNativeRuntimeGuardDecisionV2R
    | Promise<ProviderNativeRuntimeGuardDecisionV2R>) | undefined,
  phase: string,
): Promise<ProviderNativeRuntimeGuardDecisionV2R> {
  if (!invoke) return { status: 'ALLOW', audit: { phase, guard: 'NOT_CONFIGURED' } };
  try {
    const decision = await invoke();
    if (!validRuntimeGuardDecision(decision)) {
      return runtimeGuardAccountingFailure(`${phase}_DECISION_INVALID`, { phase });
    }
    return decision;
  } catch (error) {
    return runtimeGuardAccountingFailure(`${phase}_THREW`, {
      phase, error: errorMessage(error),
    });
  }
}

function validRuntimeGuardDecision(
  value: ProviderNativeRuntimeGuardDecisionV2R,
): boolean {
  if (!value || typeof value !== 'object' || !value.audit
    || typeof value.audit !== 'object' || Array.isArray(value.audit)) return false;
  if (value.status === 'ALLOW') {
    return value.maxOutputTokens === undefined
      || Number.isSafeInteger(value.maxOutputTokens);
  }
  return value.status === 'DENY'
    && ['RESOURCE_BUDGET_EXHAUSTED', 'RESOURCE_ACCOUNTING_UNVERIFIABLE']
      .includes(value.disposition)
    && Boolean(value.reasonCode.trim()) && Boolean(value.summary.trim());
}

function runtimeGuardAccountingFailure(
  reasonCode: string,
  audit: Readonly<JsonRecord>,
): Extract<ProviderNativeRuntimeGuardDecisionV2R, { status: 'DENY' }> {
  return {
    status: 'DENY', disposition: 'RESOURCE_ACCOUNTING_UNVERIFIABLE',
    reasonCode, summary: reasonCode, audit: { ...audit, reasonCode },
  };
}

function runtimeGuardFailure(
  input: Parameters<typeof runProviderNativeToolEpisodeV2R>[0], toolSetSha256: string,
  contextSha256: string, turns: JsonRecord[], selected: string[],
  denial: Extract<ProviderNativeRuntimeGuardDecisionV2R, { status: 'DENY' }>,
): Readonly<ProviderNativeEpisodeReceiptV2R> {
  return finalize(input, toolSetSha256, contextSha256, turns, selected, {
    disposition: denial.disposition, reasonCodes: [denial.reasonCode],
    evidenceIds: [], summary: denial.summary,
  });
}

function advancesEpisodeState(kind: string): boolean {
  return ['MUTATION', 'MUTATION_LEGACY', 'GENERATED_COMPOSITION', 'GENERATED_CODE_LEGACY']
    .includes(kind);
}

export function isProviderNativeProofGateEligibleV2R(
  disposition: ProviderNativeTerminalDispositionV2R,
): boolean {
  return disposition === 'READY_FOR_PROOF' || disposition === 'PASS';
}

function protocolFailure(
  input: Parameters<typeof runProviderNativeToolEpisodeV2R>[0], toolSetSha256: string,
  contextSha256: string, turns: JsonRecord[], selected: string[], reason: string,
): Readonly<ProviderNativeEpisodeReceiptV2R> {
  return finalize(input, toolSetSha256, contextSha256, turns, selected, {
    disposition: 'TOOL_PROTOCOL_FAILURE', reasonCodes: [reason], evidenceIds: [], summary: reason,
  });
}

function operatorArgumentRepairDiagnostic(
  operatorId: string,
  diagnostics: readonly string[],
  repairAttempt: number,
): Readonly<ProviderNativeToolExecutionV2R> {
  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'FAIL' as const,
    output: {
      code: 'OPERATOR_ARGUMENT_SCHEMA_INVALID',
      message: 'The call was rejected before execution. Correct the arguments against the exact declared schema and retry the same intended operation.',
      details: {
        operatorId,
        diagnostics: [...diagnostics],
        repairAttempt,
        maxRepairAttempts: MAX_OPERATOR_ARGUMENT_REPAIRS_PER_EPISODE_V2R,
      },
    },
    evidenceIds: [] as const,
  });
}

function finalize(
  input: Parameters<typeof runProviderNativeToolEpisodeV2R>[0], toolSetSha256: string,
  contextSha256: string, turns: JsonRecord[], selected: string[], terminal: ProviderNativeEpisodeReceiptV2R['terminal'],
): Readonly<ProviderNativeEpisodeReceiptV2R> {
  const transcriptSha256 = hashCanonicalJsonV1(turns);
  const material = {
    receiptVersion: PROVIDER_NATIVE_EPISODE_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    route: input.route, episodeId: input.context.episodeId, contextSha256, toolSetSha256,
    argumentHandoffMode: input.argumentHandoffMode ?? 'DIRECT_ARGUMENTS',
    selectedOperatorIds: [...selected], turns: [...turns], terminal,
    productOutcome: 'NOT_EVALUATED_ADAPTER_ONLY' as const, stateEffects: [] as const,
    transcriptSha256,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function finishTerminal(args: JsonRecord): ProviderNativeEpisodeReceiptV2R['terminal'] {
  return {
    disposition: args.disposition as ProviderNativeTerminalDispositionV2R,
    reasonCodes: args.reasonCodes as string[], evidenceIds: args.evidenceIds as string[],
    summary: String(args.summary),
  };
}

function normalizeStrictOptionalNulls(args: JsonRecord, tool: Readonly<ProviderNativeOperatorToolV2R>): JsonRecord {
  if (!tool.openAiStrict) return { ...args };
  return normalizeOptionalNullsAgainstSchema(args, tool.exactInputSchema) as JsonRecord;
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
    const childSchema = record(properties[field]);
    return [[field, normalizeOptionalNullsAgainstSchema(child, childSchema)]];
  }));
}

function validateContext(context: Readonly<ProviderNativeEpisodeContextV2R>): void {
  if (!context.episodeId.trim() || !context.objective.trim()) throw new Error('PROVIDER_NATIVE_CONTEXT_IDENTITY_INVALID');
  const { maxTurns, maxOutputTokensPerTurn, maxIdenticalCalls } = context.budget;
  if (!Number.isSafeInteger(maxTurns) || maxTurns < 1 || maxTurns > 32
    || !Number.isSafeInteger(maxOutputTokensPerTurn) || maxOutputTokensPerTurn < 64
    || !Number.isSafeInteger(maxIdenticalCalls) || maxIdenticalCalls < 1 || maxIdenticalCalls > 3) {
    throw new Error('PROVIDER_NATIVE_CONTEXT_BUDGET_INVALID');
  }
}

function validateAdditionalInstructions(value: readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  if (value.length > 8 || value.some((entry) => !entry.trim() || entry.length > 1_000)) {
    throw new Error('PROVIDER_NATIVE_ADDITIONAL_INSTRUCTIONS_INVALID');
  }
  return [...value];
}

function validExecutionEnvelope(value: Readonly<ProviderNativeToolExecutionV2R>): boolean {
  return value.authority === 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION'
    && ['OK', 'FAIL', 'UNVERIFIABLE', 'CONFLICT'].includes(value.disposition)
    && Boolean(value.output) && typeof value.output === 'object' && !Array.isArray(value.output)
    && Array.isArray(value.evidenceIds)
    && value.evidenceIds.every((entry) => typeof entry === 'string' && Boolean(entry));
}

function validateNonOkExecutionOutput(output: Readonly<JsonRecord>): string[] {
  const diagnostics: string[] = [];
  if (typeof output.code !== 'string' || !output.code.trim()) {
    diagnostics.push('$.output.code must be a non-empty string');
  }
  if (typeof output.message !== 'string' || !output.message.trim()) {
    diagnostics.push('$.output.message must be a non-empty string');
  }
  if (output.details !== undefined
    && (!output.details || typeof output.details !== 'object' || Array.isArray(output.details))) {
    diagnostics.push('$.output.details must be an object when present');
  }
  return diagnostics;
}

function mapHttpFailure(status: number): ProviderNativeTerminalDispositionV2R {
  if (status === 429) return 'PROVIDER_RATE_LIMIT';
  if (status === 408 || status === 504) return 'PROVIDER_TIMEOUT';
  if (status === 401 || status === 403) return 'PROVIDER_REFUSAL';
  return 'PROVIDER_ERROR';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown provider transport error';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
