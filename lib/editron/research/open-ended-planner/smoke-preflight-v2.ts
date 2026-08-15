import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  estimateOfflineInputTokensUpperBoundV2,
  serializeGoogleCountTokensRequestV2,
  serializeProviderRequestV2,
  type ProviderKindV2,
} from './provider-codecs-v2';
import {
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
  buildDevelopmentReferenceNativeVideoStageOnePacketV2,
  buildDevelopmentStageOnePacketsV2,
  type HashedStagePacketV2,
  type InputArmV2,
} from './staged-packet-v2';
type RouteIdV2 = 'OPENAI_LUNA' | 'OPENAI_TERRA' | 'GOOGLE_FLASH_LITE' | 'GOOGLE_FLASH' | 'DEEPSEEK_FLASH';

interface RouteFactV2 {
  routeId: RouteIdV2;
  provider: ProviderKindV2;
  requestModel: string;
  claimedBenchmarkIdentity: string;
  identityStatus: 'PROVIDER_ROUTE_NO_DATED_SNAPSHOT' | 'PROVIDER_STABLE_ROUTE' | 'CLAIMED_SNAPSHOT_NOT_REQUESTABLE';
  reasoningMode: string;
  supportedArms: readonly InputArmV2[];
  pricing: { inputUsdPerMillion: number; cachedInputUsdPerMillion: number | null; cacheWriteUsdPerMillion: number | null; outputUsdPerMillion: number };
  pricingSource: string;
  modelSource: string;
  counter: {
    method: 'OFFLINE_TEXT_UTF8_BOUND_PLUS_IMAGE_ALLOWANCE' | 'PROVIDER_COUNT_TOKENS';
    networkRequired: boolean;
    endpoint: string | null;
    evidenceStatus: 'CONSERVATIVE_LOCAL_BOUND' | 'OFFICIAL_PROVIDER_ENDPOINT';
  };
  nativeIdentityFields: readonly string[];
}

const EVIDENCE_DATE = '2026-08-15';
const SMOKE_TASK = 'DEV-02';
const SMOKE_CONDITION = 'BASELINE';

const ROUTES: readonly RouteFactV2[] = [
  {
    routeId: 'OPENAI_LUNA', provider: 'openai', requestModel: 'gpt-5.6-luna',
    claimedBenchmarkIdentity: 'gpt-5.6-luna', identityStatus: 'PROVIDER_ROUTE_NO_DATED_SNAPSHOT',
    reasoningMode: 'medium', supportedArms: ['REFERENCE_IMAGE_SEQUENCE_EVIDENCE'],
    pricing: { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.1, cacheWriteUsdPerMillion: 1.25, outputUsdPerMillion: 6 },
    pricingSource: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
    modelSource: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
    counter: { method: 'OFFLINE_TEXT_UTF8_BOUND_PLUS_IMAGE_ALLOWANCE', networkRequired: false, endpoint: null, evidenceStatus: 'CONSERVATIVE_LOCAL_BOUND' },
    nativeIdentityFields: ['response.id', 'response.model'],
  },
  {
    routeId: 'OPENAI_TERRA', provider: 'openai', requestModel: 'gpt-5.6-terra',
    claimedBenchmarkIdentity: 'gpt-5.6-terra', identityStatus: 'PROVIDER_ROUTE_NO_DATED_SNAPSHOT',
    reasoningMode: 'medium', supportedArms: ['REFERENCE_IMAGE_SEQUENCE_EVIDENCE'],
    pricing: { inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25, cacheWriteUsdPerMillion: 3.125, outputUsdPerMillion: 15 },
    pricingSource: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra',
    modelSource: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra',
    counter: { method: 'OFFLINE_TEXT_UTF8_BOUND_PLUS_IMAGE_ALLOWANCE', networkRequired: false, endpoint: null, evidenceStatus: 'CONSERVATIVE_LOCAL_BOUND' },
    nativeIdentityFields: ['response.id', 'response.model'],
  },
  {
    routeId: 'GOOGLE_FLASH_LITE', provider: 'google', requestModel: 'gemini-3.5-flash-lite',
    claimedBenchmarkIdentity: 'gemini-3.5-flash-lite', identityStatus: 'PROVIDER_STABLE_ROUTE',
    reasoningMode: 'minimal', supportedArms: ['REFERENCE_IMAGE_SEQUENCE_EVIDENCE', 'REFERENCE_NATIVE_VIDEO_EVIDENCE'],
    pricing: { inputUsdPerMillion: 0.3, cachedInputUsdPerMillion: null, cacheWriteUsdPerMillion: null, outputUsdPerMillion: 2.5 },
    pricingSource: 'https://ai.google.dev/gemini-api/docs/latest-model',
    modelSource: 'https://ai.google.dev/gemini-api/docs/latest-model',
    counter: { method: 'PROVIDER_COUNT_TOKENS', networkRequired: true, endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:countTokens', evidenceStatus: 'OFFICIAL_PROVIDER_ENDPOINT' },
    nativeIdentityFields: ['response.responseId', 'response.modelVersion'],
  },
  {
    routeId: 'GOOGLE_FLASH', provider: 'google', requestModel: 'gemini-3.7-flash',
    claimedBenchmarkIdentity: 'gemini-3.7-flash', identityStatus: 'PROVIDER_STABLE_ROUTE',
    reasoningMode: 'medium', supportedArms: ['REFERENCE_IMAGE_SEQUENCE_EVIDENCE', 'REFERENCE_NATIVE_VIDEO_EVIDENCE'],
    pricing: { inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075, cacheWriteUsdPerMillion: null, outputUsdPerMillion: 3.75 },
    pricingSource: 'https://ai.google.dev/gemini-api/docs/pricing',
    modelSource: 'https://ai.google.dev/api/models',
    counter: { method: 'PROVIDER_COUNT_TOKENS', networkRequired: true, endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:countTokens', evidenceStatus: 'OFFICIAL_PROVIDER_ENDPOINT' },
    nativeIdentityFields: ['response.responseId', 'response.modelVersion'],
  },
  {
    routeId: 'DEEPSEEK_FLASH', provider: 'deepseek', requestModel: 'deepseek-v4-flash',
    claimedBenchmarkIdentity: 'DeepSeek-V4-Flash-0731', identityStatus: 'CLAIMED_SNAPSHOT_NOT_REQUESTABLE',
    reasoningMode: 'high', supportedArms: ['TEXT_EVIDENCE_ONLY'],
    pricing: { inputUsdPerMillion: 0.14, cachedInputUsdPerMillion: 0.0028, cacheWriteUsdPerMillion: null, outputUsdPerMillion: 0.28 },
    pricingSource: 'https://api-docs.deepseek.com/quick_start/pricing/',
    modelSource: 'https://api-docs.deepseek.com/api/create-chat-completion',
    counter: { method: 'OFFLINE_TEXT_UTF8_BOUND_PLUS_IMAGE_ALLOWANCE', networkRequired: false, endpoint: null, evidenceStatus: 'CONSERVATIVE_LOCAL_BOUND' },
    nativeIdentityFields: ['response.id', 'response.model', 'response.system_fingerprint'],
  },
];

export async function buildDevelopmentSmokePreflightV2(): Promise<Readonly<Record<string, unknown>>> {
  const packets = [
    ...buildDevelopmentStageOnePacketsV2(),
    buildDevelopmentReferenceImageSequenceStageOnePacketV2(SMOKE_TASK, SMOKE_CONDITION),
    buildDevelopmentReferenceNativeVideoStageOnePacketV2(SMOKE_TASK, SMOKE_CONDITION),
  ];
  const taskArms = uniqueTaskArms(packets);
  const smokeRows = [];
  const excludedRows = [];
  for (const route of ROUTES) {
    for (const inputArm of route.supportedArms) {
      const artifact = selectPacket(packets, inputArm);
      const inputCount = await buildInputCountMaterial(route, artifact);
      const countTokensRequired = route.counter.method === 'PROVIDER_COUNT_TOKENS';
      const localInputBudgetExceeded = inputCount.localInputTokenUpperBound !== null
        && inputCount.localInputTokenUpperBound > artifact.packet.stageBudget.maxInputTokens;
      const row = {
        rowId: `${route.routeId}-${inputArm}`,
        routeId: route.routeId,
        taskId: SMOKE_TASK,
        conditionId: SMOKE_CONDITION,
        inputArm,
        comparisonPurpose: inputArm === 'REFERENCE_IMAGE_SEQUENCE_EVIDENCE'
          ? 'FAIR_ORDERED_IMAGE_SEQUENCE_COMPARISON'
          : inputArm === 'REFERENCE_NATIVE_VIDEO_EVIDENCE'
          ? 'NATIVE_REFERENCE_VIDEO_COMPARISON'
          : 'TEXT_ONLY_CAPABILITY_GAP_CONTROL',
        packetHash: artifact.packetHash,
        transportHash: artifact.transportHash,
        maxInputTokens: artifact.packet.stageBudget.maxInputTokens,
        localInputTokenUpperBound: inputCount.localInputTokenUpperBound,
        providerCountTokensEndpoint: inputCount.providerCountTokensEndpoint,
        providerCountTokensRequestHash: inputCount.providerCountTokensRequestHash,
        providerTokenCountStatus: countTokensRequired
          ? 'REQUIRED_BEFORE_GENERATION'
          : localInputBudgetExceeded ? 'LOCAL_UPPER_BOUND_EXCEEDS_STAGE_BUDGET' : 'LOCAL_UPPER_BOUND_PROVED_WITHIN_STAGE_BUDGET',
        maxProviderCostUsd: artifact.packet.stageBudget.maxProviderCostUsd,
        dispatchStatus: localInputBudgetExceeded
          ? 'BLOCKED_INPUT_TOKEN_BUDGET'
          : countTokensRequired
          ? 'BLOCKED_COUNT_TOKENS_AND_OPERATOR_CONFIRMATION'
          : 'BLOCKED_OPERATOR_CONFIRMATION',
        blockers: localInputBudgetExceeded
          ? ['LOCAL_INPUT_TOKEN_UPPER_BOUND_EXCEEDS_STAGE_BUDGET', 'OPERATOR_CONFIRMATION_MISSING']
          : countTokensRequired
          ? ['GOOGLE_COUNT_TOKENS_REQUIRED', 'OPERATOR_CONFIRMATION_MISSING']
          : ['OPERATOR_CONFIRMATION_MISSING'],
      };
      if (route.identityStatus === 'CLAIMED_SNAPSHOT_NOT_REQUESTABLE') {
        excludedRows.push({ ...row, dispatchStatus: 'BLOCKED_MODEL_IDENTITY', blockers: ['CLAIMED_0731_SNAPSHOT_NOT_REQUESTABLE'] });
      } else smokeRows.push(row);
    }
  }
  const absoluteMaxSpendUsd = Number(smokeRows.reduce((sum, row) => sum + row.maxProviderCostUsd, 0).toFixed(2));
  const maxCostPerStageOneRunUsd = Math.max(...smokeRows.map(({ maxProviderCostUsd }) => maxProviderCostUsd));
  const localInputBudgetExceeded = smokeRows.some(({ localInputTokenUpperBound, maxInputTokens }) =>
    localInputTokenUpperBound !== null && localInputTokenUpperBound > maxInputTokens);
  const routeApplicability = ROUTES.flatMap((route) => taskArms.map(({ taskId, inputArm }) => ({
    routeId: route.routeId,
    taskId,
    inputArm,
    modalityStatus: route.supportedArms.includes(inputArm) ? 'APPLICABLE' : 'NOT_APPLICABLE',
    reason: route.supportedArms.includes(inputArm) ? 'CODEC_ACCEPTS_FROZEN_ARM' : 'CODEC_REJECTS_FROZEN_ARM_MEDIA',
    dispatchStatus: route.identityStatus === 'CLAIMED_SNAPSHOT_NOT_REQUESTABLE'
      ? 'BLOCKED_MODEL_IDENTITY'
      : 'BLOCKED_PREFLIGHT_GATES',
  })));
  const material = {
    planVersion: 'EDITRON_OE_DEVELOPMENT_SMOKE_PREFLIGHT_V2',
    authority: 'RESEARCH_ONLY_NO_PROVIDER_NETWORK_NO_PROJECT_MUTATION',
    evidenceAsOf: EVIDENCE_DATE,
    selectionRule: 'Luna, Terra, Gemini Flash-Lite and Gemini 3.7 Flash receive the same six answer-leak-free, hash-bound DEV-02 reference images in ascending timestamp order. Gemini native-video rows are a separate within-model temporal-evidence condition and are not ranked as cross-model parity rows.',
    routes: ROUTES,
    routeApplicability,
    smokeRows,
    excludedRows,
    spend: {
      plannedProviderCallsAfterAllGates: smokeRows.length,
      maxCostPerStageOneRunUsd,
      absoluteMaxSpendUsd,
      rule: 'The ceiling includes the one permitted repair inside each stage budget; no retry may exceed the row ceiling.',
    },
    persistencePolicy: {
      outputRoot: '.calibration-temp/open-ended-planner-v2/provider-smoke/',
      allowed: ['planHash', 'packetHash', 'transportHash', 'requestHash', 'providerCountTokensRequestHash', 'providerInputTokenCount', 'providerRequestId', 'nativeModelIdentity', 'nativeSystemFingerprintWhenProvided', 'usage', 'cost', 'finishReason', 'schemaDiagnostics', 'rawResponseHash', 'parsedArtifact'],
      forbidden: ['apiKeyValue', 'authorizationHeader', 'rawMediaBytes', 'base64Media', 'rawProviderResponse', 'userProjectState'],
      secretEnvironmentVariables: ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY'],
    },
    operatorConfirmationGate: {
      status: 'NOT_CONFIRMED',
      appliesBefore: 'ANY_PROVIDER_NETWORK_CALL_INCLUDING_COUNT_TOKENS',
      requiredEchoFields: ['planHash', 'absoluteMaxSpendUsd', 'operatorId', 'confirmedAt'],
      confirmationDoesNotAuthorize: ['projectMutation', 'holdoutRead', 'proxyExecution', 'render', 'productionRegistration'],
    },
    globalBlockers: [
      'GOOGLE_COUNT_TOKENS_NOT_YET_EXECUTED',
      ...(localInputBudgetExceeded ? ['LOCAL_INPUT_TOKEN_BUDGET_EXCEEDED'] : []),
      'OPERATOR_CONFIRMATION_NOT_RECORDED',
    ],
  };
  return deepFreezeV1({ ...material, planHash: hashCanonicalJsonV1(material) });
}

function selectPacket(packets: HashedStagePacketV2[], inputArm: InputArmV2): HashedStagePacketV2 {
  const result = packets.find(({ packet }) => packet.taskId === SMOKE_TASK
    && packet.conditionId === SMOKE_CONDITION && packet.inputArm === inputArm);
  if (!result) throw new Error(`Missing smoke packet ${SMOKE_TASK}/${SMOKE_CONDITION}/${inputArm}`);
  return result;
}

function uniqueTaskArms(packets: HashedStagePacketV2[]): Array<{ taskId: string; inputArm: InputArmV2 }> {
  const rows = new Map<string, { taskId: string; inputArm: InputArmV2 }>();
  for (const { packet } of packets) rows.set(`${packet.taskId}/${packet.inputArm}`, { taskId: packet.taskId, inputArm: packet.inputArm });
  return [...rows.values()].sort((left, right) => `${left.taskId}/${left.inputArm}`.localeCompare(`${right.taskId}/${right.inputArm}`));
}

async function buildInputCountMaterial(route: RouteFactV2, artifact: HashedStagePacketV2): Promise<{
  localInputTokenUpperBound: number | null;
  providerCountTokensEndpoint: string | null;
  providerCountTokensRequestHash: string | null;
}> {
  const request = await serializeProviderRequestV2({
    route: { kind: route.provider, apiKey: 'NOT_A_REAL_KEY', model: route.requestModel, modelSnapshot: route.claimedBenchmarkIdentity, reasoningMode: route.reasoningMode },
    artifact, attempt: 1,
    outputBudget: { visible: artifact.packet.stageBudget.maxVisibleOutputTokens, reasoning: artifact.packet.stageBudget.maxReasoningTokens },
  });
  if (route.provider === 'google') {
    const countRequest = serializeGoogleCountTokensRequestV2({
      route: { kind: 'google', apiKey: 'NOT_A_REAL_KEY', model: route.requestModel, modelSnapshot: route.claimedBenchmarkIdentity, reasoningMode: route.reasoningMode },
      generationRequest: request,
    });
    return {
      localInputTokenUpperBound: null,
      providerCountTokensEndpoint: countRequest.endpoint,
      providerCountTokensRequestHash: countRequest.requestHash,
    };
  }
  return {
    localInputTokenUpperBound: estimateOfflineInputTokensUpperBoundV2(request, artifact.transportAttachments.length),
    providerCountTokensEndpoint: null,
    providerCountTokensRequestHash: null,
  };
}
