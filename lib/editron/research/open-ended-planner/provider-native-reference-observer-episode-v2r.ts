import { canonicalizeJsonV1, deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildProviderNativeInitialHistoryV2R,
  isFinishResearchEpisodeCallV2R,
  normalizeProviderNativeTurnV2R,
  serializeProviderNativeTurnV2R,
  type ProviderNativeRouteV2R,
  type SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import {
  buildProviderNativeControlOnlyToolSetV2R,
} from './provider-native-tool-catalog-v2r';
import {
  buildReferenceNativeObserverFinishSchemaV2R,
  buildReferenceObserverFinishSchemaV2R,
  validateReferenceNativeObserverSubmissionV2R,
  validateReferenceObserverSubmissionV2R,
  type ReferenceObserverObservationV2R,
  type ReferenceObserverSubmissionDispositionV2R,
  type ReferenceObserverSubmissionValidationV2R,
  type ReferenceObserverTerminalSubmissionV2R,
} from './provider-native-reference-observation-contract-v2r';
import {
  REFERENCE_HOLDOUT_01_EXPECTED_INPUT_SHA256,
  REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256,
  buildReferenceHoldout01NativeManifestV2R,
  buildReferenceHoldout01ManifestV2R,
} from './provider-native-reference-holdout-01-v2r';
import {
  bindProviderNativeReferenceInputV2R,
} from './provider-native-reference-input-v2r';
import {
  bindProviderNativeVideoReferenceInputV2R,
  isProviderNativeVideoReferenceInputV2R,
  type ProviderNativeReferenceMediaInputV2R,
} from './provider-native-video-reference-input-v2r';
import {
  ProviderNativeTransportErrorV2R,
  type ProviderNativeInvokeResponseV2R,
} from './provider-native-tool-episode-v2r';

type JsonRecord = Record<string, unknown>;

export const REFERENCE_OBSERVER_EPISODE_VERSION_V2R =
  'EDITRON_REFERENCE_OBSERVER_EPISODE_V2R_1' as const;

export type ReferenceObserverEpisodeDispositionV2R =
  | ReferenceObserverSubmissionDispositionV2R
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_REFUSAL'
  | 'PROVIDER_ERROR'
  | 'TOOL_PROTOCOL_FAILURE';

export interface ReferenceObserverEpisodeReceiptV2R {
  receiptVersion: typeof REFERENCE_OBSERVER_EPISODE_VERSION_V2R;
  authority: 'RESEARCH_REFERENCE_OBSERVATION_ONLY_NO_PROJECT_MUTATION';
  route: Readonly<ProviderNativeRouteV2R>;
  taskManifestSha256: string;
  referenceInputManifestSha256: string;
  toolSetSha256: string;
  exposedEditingOperatorIds: readonly [];
  selectedEditingOperatorIds: readonly [];
  providerTurn: Readonly<JsonRecord>;
  terminal: Readonly<{
    disposition: ReferenceObserverEpisodeDispositionV2R;
    reasonCodes: readonly string[];
    evidenceIds: readonly string[];
    summary: string;
  }>;
  observation: Readonly<ReferenceObserverObservationV2R> | null;
  validationDiagnostics: readonly string[];
  productOutcome: 'NOT_EVALUATED_OBSERVATION_ONLY';
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function runProviderNativeReferenceObserverEpisodeV2R(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  referenceInput: Readonly<ProviderNativeReferenceMediaInputV2R>;
  maxOutputTokens: number;
  invoke: (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ) => Promise<Readonly<ProviderNativeInvokeResponseV2R>>;
}): Promise<Readonly<ReferenceObserverEpisodeReceiptV2R>> {
  if (!Number.isSafeInteger(input.maxOutputTokens)
    || input.maxOutputTokens < 512
    || input.maxOutputTokens > 65_536) {
    throw new Error('REFERENCE_OBSERVER_OUTPUT_BUDGET_INVALID');
  }
  const protocol = buildObserverProtocol(input.route, input.referenceInput);
  const toolSet = buildProviderNativeControlOnlyToolSetV2R(protocol.finishSchema);
  if (toolSet.operators.length || toolSet.operatorIds.length) {
    throw new Error('REFERENCE_OBSERVER_EDITING_OPERATOR_EXPOSURE');
  }
  const prompt = canonicalizeJsonV1({
    version: REFERENCE_OBSERVER_EPISODE_VERSION_V2R,
    authority: 'RESEARCH_REFERENCE_OBSERVATION_ONLY_NO_PROJECT_MUTATION',
    role: 'REFERENCE_OBSERVER_NOT_EDITOR',
    instructions: protocol.instructions,
    taskManifestSha256: protocol.taskManifestSha256,
    referenceInputManifestSha256: protocol.referenceInputManifestSha256,
    task: protocol.providerVisibleTask,
    controlAuthority: {
      toolSetSha256: toolSet.toolSetSha256,
      exposedEditingOperatorIds: [],
      stateEffects: [],
    },
  });
  const history = buildProviderNativeInitialHistoryV2R(
    input.route.provider,
    prompt,
    protocol.referenceInput,
  );
  const request = serializeProviderNativeTurnV2R({
    route: input.route,
    toolSet,
    history,
    maxOutputTokens: input.maxOutputTokens,
  });

  let response: Readonly<ProviderNativeInvokeResponseV2R>;
  try {
    response = await input.invoke(request);
  } catch (error) {
    const disposition = error instanceof ProviderNativeTransportErrorV2R
      ? error.code
      : 'PROVIDER_ERROR';
    return finalize(input.route, protocol.taskManifestSha256, protocol.referenceInputManifestSha256,
      toolSet.toolSetSha256, {
        requestHash: request.requestHash,
        transportError: errorMessage(error),
      }, {
        disposition,
        reasonCodes: [disposition],
        evidenceIds: [],
        summary: errorMessage(error),
      }, null, []);
  }

  const rawResponseSha256 = hashCanonicalJsonV1(response.body);
  const turnBase: JsonRecord = {
    requestHash: request.requestHash,
    responseStatus: response.status,
    rawResponseSha256,
    rawResponse: response.body,
  };
  if (response.status < 200 || response.status >= 300) {
    const disposition = mapHttpFailure(response.status);
    return finalize(input.route, protocol.taskManifestSha256, protocol.referenceInputManifestSha256,
      toolSet.toolSetSha256, turnBase, {
        disposition,
        reasonCodes: [`HTTP_${response.status}`],
        evidenceIds: [],
        summary: disposition,
      }, null, []);
  }

  const normalized = normalizeProviderNativeTurnV2R(input.route.provider, response.body);
  Object.assign(turnBase, {
    providerRequestId: normalized.providerRequestId,
    returnedModelIdentity: normalized.providerModel,
    finishReason: normalized.finishReason,
  });
  if (normalized.refusal) {
    return finalize(input.route, protocol.taskManifestSha256, protocol.referenceInputManifestSha256,
      toolSet.toolSetSha256, { ...turnBase, refusal: normalized.refusal }, {
        disposition: 'PROVIDER_REFUSAL',
        reasonCodes: ['PROVIDER_REFUSAL'],
        evidenceIds: [],
        summary: normalized.refusal,
      }, null, []);
  }
  if (normalized.toolCalls.length !== 1) {
    return protocolFailure(input.route, protocol.taskManifestSha256, protocol.referenceInputManifestSha256,
      toolSet.toolSetSha256, {
        ...turnBase,
        toolCallCount: normalized.toolCalls.length,
        text: normalized.text,
      }, 'ONE_TYPED_OBSERVER_SUBMISSION_REQUIRED');
  }
  const call = normalized.toolCalls[0];
  if (!isFinishResearchEpisodeCallV2R(call)
    || !call.callId
    || !call.arguments
    || call.argumentError) {
    return protocolFailure(input.route, protocol.taskManifestSha256, protocol.referenceInputManifestSha256,
      toolSet.toolSetSha256, { ...turnBase, modelCall: call },
      'REFERENCE_OBSERVER_CONTROL_CALL_INVALID');
  }
  const validation = protocol.validate(call.arguments);
  const completedTurn = { ...turnBase, modelCall: call, validation };
  if (validation.disposition !== 'PASS') {
    return protocolFailure(input.route, protocol.taskManifestSha256, protocol.referenceInputManifestSha256,
      toolSet.toolSetSha256, completedTurn,
      'REFERENCE_OBSERVER_SUBMISSION_INVALID', validation.diagnostics);
  }
  const submission = call.arguments as ReferenceObserverTerminalSubmissionV2R;
  return finalize(input.route, protocol.taskManifestSha256, protocol.referenceInputManifestSha256,
    toolSet.toolSetSha256, completedTurn, {
      disposition: submission.disposition,
      reasonCodes: [...submission.reasonCodes],
      evidenceIds: [...submission.evidenceIds],
      summary: submission.summary,
    }, submission.observation, []);
}

interface ReferenceObserverProtocolV2R {
  taskManifestSha256: string;
  referenceInputManifestSha256: string;
  referenceInput: Readonly<ProviderNativeReferenceMediaInputV2R>;
  providerVisibleTask: Readonly<JsonRecord>;
  finishSchema: Readonly<JsonRecord>;
  instructions: readonly string[];
  validate: (value: unknown) => Readonly<ReferenceObserverSubmissionValidationV2R>;
}

function buildObserverProtocol(
  route: Readonly<ProviderNativeRouteV2R>,
  referenceInput: Readonly<ProviderNativeReferenceMediaInputV2R>,
): Readonly<ReferenceObserverProtocolV2R> {
  if (isProviderNativeVideoReferenceInputV2R(referenceInput)) {
    if (route.provider !== 'google') {
      throw new Error(`REFERENCE_NATIVE_OBSERVER_ROUTE_UNSUPPORTED:${route.provider}`);
    }
    const manifest = buildReferenceHoldout01NativeManifestV2R();
    const bound = bindProviderNativeVideoReferenceInputV2R(referenceInput);
    if (bound.manifestSha256 !== REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256
      || hashCanonicalJsonV1(bound.manifest) !== hashCanonicalJsonV1(manifest.sourceBinding)) {
      throw new Error('REFERENCE_NATIVE_OBSERVER_INPUT_BINDING_MISMATCH');
    }
    return deepFreezeV1({
      taskManifestSha256: manifest.manifestSha256,
      referenceInputManifestSha256: bound.manifestSha256,
      referenceInput: bound.input,
      providerVisibleTask: manifest.providerVisibleTask,
      finishSchema: buildReferenceNativeObserverFinishSchemaV2R(),
      instructions: [
        'Observe only the supplied native reference video and embedded audio under the provider-visible task rules.',
        'Do not choose an editing operator, native/generated/hybrid route, software technique, project change or future implementation.',
        'Call finish_editron_research_episode exactly once. No editing operation is exposed in this episode.',
        'Use READY_FOR_EVALUATION only with one complete ReferenceObservationMapV2R_2 and the exact union of all observation, uncertainty and requested-window IDs.',
        'Use UNVERIFIABLE or NEEDS_REVIEW with observation=null when the closed artifact cannot be supported honestly.',
        'Cite bounded microsecond ranges and observed modalities. Do not claim source-frame completeness, exact easing or microtiming from provider sampling; request a targeted dense pass instead.',
      ],
      validate: validateReferenceNativeObserverSubmissionV2R,
    });
  }

  const manifest = buildReferenceHoldout01ManifestV2R();
  const bound = bindProviderNativeReferenceInputV2R(referenceInput);
  if (bound.manifestSha256 !== REFERENCE_HOLDOUT_01_EXPECTED_INPUT_SHA256
    || bound.input.referenceId !== 'ref_heldout_01'
    || bound.input.referenceAssetSha256 !== manifest.sourceMaterialization.sourceSha256) {
    throw new Error('REFERENCE_OBSERVER_INPUT_BINDING_MISMATCH');
  }
  return deepFreezeV1({
    taskManifestSha256: manifest.manifestSha256,
    referenceInputManifestSha256: bound.manifestSha256,
    referenceInput: bound.input,
    providerVisibleTask: manifest.providerVisibleTask,
    finishSchema: buildReferenceObserverFinishSchemaV2R(),
    instructions: [
      'Observe only the supplied ordered, timestamped reference frames under the provider-visible task rules.',
      'Do not choose an editing operator, native/generated/hybrid route, software technique, project change or future implementation.',
      'Call finish_editron_research_episode exactly once. No editing operation is exposed in this episode.',
      'Use READY_FOR_EVALUATION only with one complete ReferenceObservationMapV2R and the exact union of all cited frame IDs.',
      'Use UNVERIFIABLE or NEEDS_REVIEW with observation=null when the closed artifact cannot be supported honestly.',
      'Sparse images do not establish audio, exact easing, continuous motion or unsampled intervals; record those limits explicitly.',
    ],
    validate: validateReferenceObserverSubmissionV2R,
  });
}

function protocolFailure(
  route: Readonly<ProviderNativeRouteV2R>,
  taskManifestSha256: string,
  referenceInputManifestSha256: string,
  toolSetSha256: string,
  providerTurn: Readonly<JsonRecord>,
  reason: string,
  diagnostics: readonly string[] = [],
): Readonly<ReferenceObserverEpisodeReceiptV2R> {
  return finalize(route, taskManifestSha256, referenceInputManifestSha256,
    toolSetSha256, providerTurn, {
      disposition: 'TOOL_PROTOCOL_FAILURE',
      reasonCodes: [reason],
      evidenceIds: [],
      summary: reason,
    }, null, diagnostics);
}

function finalize(
  route: Readonly<ProviderNativeRouteV2R>,
  taskManifestSha256: string,
  referenceInputManifestSha256: string,
  toolSetSha256: string,
  providerTurn: Readonly<JsonRecord>,
  terminal: ReferenceObserverEpisodeReceiptV2R['terminal'],
  observation: Readonly<ReferenceObserverObservationV2R> | null,
  validationDiagnostics: readonly string[],
): Readonly<ReferenceObserverEpisodeReceiptV2R> {
  const material = {
    receiptVersion: REFERENCE_OBSERVER_EPISODE_VERSION_V2R,
    authority: 'RESEARCH_REFERENCE_OBSERVATION_ONLY_NO_PROJECT_MUTATION' as const,
    route,
    taskManifestSha256,
    referenceInputManifestSha256,
    toolSetSha256,
    exposedEditingOperatorIds: [] as const,
    selectedEditingOperatorIds: [] as const,
    providerTurn,
    terminal,
    observation,
    validationDiagnostics: [...validationDiagnostics],
    productOutcome: 'NOT_EVALUATED_OBSERVATION_ONLY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function mapHttpFailure(status: number): ReferenceObserverEpisodeDispositionV2R {
  if (status === 429) return 'PROVIDER_RATE_LIMIT';
  if (status === 408 || status === 504) return 'PROVIDER_TIMEOUT';
  if (status === 401 || status === 403) return 'PROVIDER_REFUSAL';
  return 'PROVIDER_ERROR';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown provider transport error';
}
