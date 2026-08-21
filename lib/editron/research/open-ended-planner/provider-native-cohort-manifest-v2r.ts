import {
  buildCap2aPlannerToolSheetV2R,
  cap2aPlannerDossierIdentityV2R,
} from './cap2a-planner-dossier-v2r';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { DEV01_PROVIDER_NATIVE_AUDIO_PROOF_REQUIREMENTS_V2R } from './dev01-stage6-render-proof-validator-v2';
import { estimateOpenAiGpt56InputTokensV2 } from './openai-input-token-counter-v2';
import { PROVIDER_NATIVE_DEV01_CONNECTED_EPISODE_VERSION_V2R } from './provider-native-dev01-connected-episode-v2r';
import { PROVIDER_NATIVE_DEV02_CONNECTED_EPISODE_VERSION_V2R } from './provider-native-dev02-connected-episode-v2r';
import { PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R } from './provider-native-dev03-connected-episode-v2r';
import { PROVIDER_NATIVE_DEV04_CONNECTED_EPISODE_VERSION_V2R } from './provider-native-dev04-connected-episode-v2r';
import {
  PROVIDER_NATIVE_EPISODE_VERSION_V2R,
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
} from './provider-native-tool-episode-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import {
  buildProviderNativeToolSetV2R,
  PROVIDER_NATIVE_TOOL_SET_VERSION_V2R,
} from './provider-native-tool-catalog-v2r';
import {
  V2R_OPERATOR_CATALOG,
  v2rOperatorCatalogIdentity,
} from './operator-catalog-v2r';
import type { SerializedProviderRequestV2 } from './provider-codecs-v2';
import {
  assertV2RBenchmarkTaskRegistryV2,
  type V2RBenchmarkTaskCaseV2,
  type V2RBenchmarkTaskRegistryV2,
} from './v2r-benchmark-task-registry';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_REFERENCE_BINDING_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';
import { AUDIO_LEVELS, DEFAULT_DUCKING_CONFIG } from '@/lib/editron/constants/audio-standards';

type JsonRecord = Record<string, unknown>;
type FetchV2R = typeof fetch;

export const PROVIDER_NATIVE_COHORT_MANIFEST_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_COHORT_MANIFEST_V2R_8' as const;
export const PROVIDER_NATIVE_NO_SPEND_PREFLIGHT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_NO_SPEND_PREFLIGHT_V2R_8' as const;

interface RoutePricingV2R {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  cacheWriteUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface ProviderNativeCohortRouteV2R {
  route: Readonly<ProviderNativeRouteV2R>;
  transport: 'OPENAI_RESPONSES' | 'GOOGLE_INTERACTIONS';
  pricing: Readonly<RoutePricingV2R>;
  priceSnapshotDate: '2026-08-20';
  pricingSource: string;
}

export interface ProviderNativeCohortCaseV2R {
  caseId: string;
  taskId: string;
  conditionId: string;
  stageOnePacketSha256: string;
  evidencePackSha256: string;
  expectedPolicySha256: string;
  context: Readonly<ProviderNativeEpisodeContextV2R>;
  contextSha256: string;
  callableOperatorIds: readonly string[];
  toolSetSha256: string;
  maxInputTokensPerTurn: number;
  connectorDisposition:
    | 'ARGUMENT_BOUND_ISOLATED_EXECUTOR_READY'
    | 'OWNER_AND_RENDER_PROOF_EXIST_SESSION_BINDING_PENDING'
    | 'MODEL_ARGUMENT_TO_GENERATED_PROGRAM_BINDING_MISSING'
    | 'EXPECTED_CAPABILITY_GAP_NO_EXECUTION';
  connectorVersion: string;
  connectorOwnerRefs: readonly string[];
}

export interface ProviderNativeCohortManifestV2R {
  version: typeof PROVIDER_NATIVE_COHORT_MANIFEST_VERSION_V2R;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  experimentId: 'EDITRON_OE_V2R_PROVIDER_NATIVE_V27_CANDIDATE';
  arm: 'PROVIDER_NATIVE_SEQUENTIAL_TOOL_CALLING';
  historicalStructuredArmDisposition: 'PRESERVE_SEPARATELY_NEVER_OVERWRITE';
  episodeVersion: typeof PROVIDER_NATIVE_EPISODE_VERSION_V2R;
  toolSetVersion: typeof PROVIDER_NATIVE_TOOL_SET_VERSION_V2R;
  taskRegistrySha256: string;
  operatorCatalog: ReturnType<typeof v2rOperatorCatalogIdentity>;
  completeCapabilityDossier: Readonly<{
    identity: ReturnType<typeof cap2aPlannerDossierIdentityV2R>;
    operatorCount: number;
    sheetSha256: string;
  }>;
  routes: readonly Readonly<ProviderNativeCohortRouteV2R>[];
  cases: readonly Readonly<ProviderNativeCohortCaseV2R>[];
  repetitionsPerRouteCase: 3;
  dispatchGate: 'BLOCKED_UNTIL_EVERY_NON_GAP_CASE_HAS_ARGUMENT_BOUND_ISOLATED_EXECUTOR';
  blockerCodes: readonly string[];
  absoluteMaxSpendUsd: number;
  stateEffects: readonly [];
  manifestSha256: string;
}

export interface ProviderNativeNoSpendPreflightReceiptV2R {
  version: typeof PROVIDER_NATIVE_NO_SPEND_PREFLIGHT_VERSION_V2R;
  authority: 'RESEARCH_PREFLIGHT_NO_MODEL_INFERENCE_NO_PROJECT_MUTATION';
  manifestSha256: string;
  checks: readonly Readonly<{
    routeId: ProviderNativeRouteV2R['routeId'];
    caseId: string;
    requestSha256: string;
    tokenCountMethod: 'OPENAI_LOCAL_O200K_115_PERCENT_MARGIN'
      | 'GOOGLE_OFFICIAL_SERIALIZED_INTERACTIONS_REQUEST_115_PERCENT_MARGIN';
    boundedInputTokens: number;
    maxInputTokensPerTurn: number;
    maxOutputTokensPerTurn: number;
    absoluteMaxTurnSpendUsd: number;
  }>[];
  infrastructureAssessment: 'PASS';
  dispatchAssessment: 'BLOCKED_CONNECTOR_GAP' | 'PASS_READY';
  networkCalls: Readonly<{ modelMetadataGets: number; googleCountTokensPosts: number; inferenceCalls: 0 }>;
  sandboxCredential: Readonly<{
    kind: 'VERCEL_OIDC';
    assessment: 'PASS_FRESHNESS_ONLY';
    expiresAtUnixSeconds: number;
    minimumRemainingSeconds: 300;
  }>;
  secretsPersisted: false;
  stateEffects: readonly [];
  receiptSha256: string;
}

const ROUTES: readonly ProviderNativeCohortRouteV2R[] = [
  route('OPENAI_LUNA', 'openai', 'gpt-5.6-luna', 'OPENAI_RESPONSES', {
    inputUsdPerMillion: 0.20, cachedInputUsdPerMillion: 0.02,
    cacheWriteUsdPerMillion: 0.25, outputUsdPerMillion: 1.20,
  }, 'https://developers.openai.com/api/docs/models/gpt-5.6-luna'),
  route('OPENAI_TERRA', 'openai', 'gpt-5.6-terra', 'OPENAI_RESPONSES', {
    inputUsdPerMillion: 2.00, cachedInputUsdPerMillion: 0.20,
    cacheWriteUsdPerMillion: 2.50, outputUsdPerMillion: 12.00,
  }, 'https://developers.openai.com/api/docs/models/gpt-5.6-terra'),
  route('GOOGLE_FLASH', 'google', 'gemini-3.7-flash', 'GOOGLE_INTERACTIONS', {
    inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075,
    cacheWriteUsdPerMillion: 0.75, outputUsdPerMillion: 3.75,
  }, 'https://ai.google.dev/gemini-api/docs/pricing'),
] as const;

const CASE_POLICY: Readonly<Record<string, Readonly<{
  maxTurns: number;
  callableOperatorIds: readonly string[];
  connectorDisposition: ProviderNativeCohortCaseV2R['connectorDisposition'];
  connectorVersion: string;
  connectorOwnerRefs: readonly string[];
}>>> = {
  'DEV-01:BASELINE': nativeCase(20, [
    'read_project_file', 'get_timeline_view', 'get_video_transcription',
    'find_transcript_moment', 'resolve_transcript_edit', 'cut_section',
    'find_visual_moment', 'resolve_keyframe_edit', 'set_keyframes',
    'find_audio_moment', 'apply_audio_ducking',
  ], 'provider-native-dev01-connected-episode-v2r.ts#runProviderNativeDev01ConnectedEpisodeV2R',
  PROVIDER_NATIVE_DEV01_CONNECTED_EPISODE_VERSION_V2R),
  'DEV-01:VISUAL_EVIDENCE_WITHHELD': nativeCase(12, [
    'read_project_file', 'get_timeline_view', 'get_video_transcription',
    'find_transcript_moment', 'resolve_transcript_edit', 'cut_section',
    'find_visual_moment', 'resolve_keyframe_edit', 'set_keyframes',
    'find_audio_moment', 'apply_audio_ducking',
  ], 'provider-native-dev01-connected-episode-v2r.ts#runProviderNativeDev01ConnectedEpisodeV2R',
  PROVIDER_NATIVE_DEV01_CONNECTED_EPISODE_VERSION_V2R),
  'DEV-02:BASELINE': {
    maxTurns: 16,
    callableOperatorIds: [
      'read_project_file', 'get_timeline_view', 'list_user_assets', 'search_user_assets',
      'inspect_user_asset', 'resolve_user_asset_overlay', 'add_overlay', 'update_overlay',
      'set_keyframes', 'reorder_layer', 'move_retime_overlay', 'generated_composition_program',
    ],
    connectorDisposition: 'ARGUMENT_BOUND_ISOLATED_EXECUTOR_READY',
    connectorVersion: PROVIDER_NATIVE_DEV02_CONNECTED_EPISODE_VERSION_V2R,
    connectorOwnerRefs: [
      'provider-native-dev02-connected-episode-v2r.ts#runProviderNativeDev02ConnectedEpisodeV2R',
      'generated-composition-model-candidate-v1.ts#buildDev02GeneratedCompositionModelPacketV1',
      'dev02-connected-hybrid-mechanics-v2.ts#executeConnectedDev02HybridMechanicsV2',
    ],
  },
  'DEV-03:BASELINE': nativeCase(12, [
    'read_project_file', 'get_timeline_view', 'find_audio_moment',
    'sync_cuts_to_beats', 'apply_camera_shake', 'resolve_audio_edit',
    'apply_speed_ramp', 'apply_fade',
  ], 'provider-native-dev03-connected-episode-v2r.ts#runProviderNativeDev03ConnectedEpisodeV2R',
  PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R),
  'DEV-03:BEAT_EVIDENCE_WITHHELD': nativeCase(8, [
    'read_project_file', 'get_timeline_view', 'find_audio_moment',
    'sync_cuts_to_beats', 'apply_camera_shake', 'resolve_audio_edit',
    'apply_speed_ramp', 'apply_fade',
  ], 'provider-native-dev03-connected-episode-v2r.ts#runProviderNativeDev03ConnectedEpisodeV2R',
  PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R),
  'DEV-04:BASELINE': {
    maxTurns: 6,
    callableOperatorIds: [
      'read_project_file', 'get_timeline_view', 'find_visual_moment',
      'resolve_visual_edit', 'set_keyframes', 'reorder_layer',
      'generated_composition_program',
    ],
    connectorDisposition: 'EXPECTED_CAPABILITY_GAP_NO_EXECUTION',
    connectorVersion: PROVIDER_NATIVE_DEV04_CONNECTED_EPISODE_VERSION_V2R,
    connectorOwnerRefs: [
      'provider-native-dev04-connected-episode-v2r.ts#runProviderNativeDev04ConnectedEpisodeV2R',
    ],
  },
};

export function buildProviderNativeCohortManifestV2R(
  registryInput: Readonly<V2RBenchmarkTaskRegistryV2>,
): Readonly<ProviderNativeCohortManifestV2R> {
  const registry = assertV2RBenchmarkTaskRegistryV2(registryInput);
  const allOperators = records(V2R_OPERATOR_CATALOG.operators);
  const dossier = buildCap2aPlannerToolSheetV2R(allOperators);
  const cases = registry.cases.map((taskCase) => buildCase(taskCase, registry.registrySha256, dossier));
  const blockerCodes = cases
    .filter(({ connectorDisposition }) => ![
      'ARGUMENT_BOUND_ISOLATED_EXECUTOR_READY',
      'EXPECTED_CAPABILITY_GAP_NO_EXECUTION',
    ].includes(connectorDisposition))
    .map(({ caseId, connectorDisposition }) => `${caseId}:${connectorDisposition}`);
  const absoluteMaxSpendUsd = roundUsd(ROUTES.reduce((routeTotal, routeEntry) => (
    routeTotal + cases.reduce((caseTotal, caseEntry) => (
      caseTotal + maxCaseSpend(routeEntry.pricing, caseEntry) * 3
    ), 0)
  ), 0));
  const material = {
    version: PROVIDER_NATIVE_COHORT_MANIFEST_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    experimentId: 'EDITRON_OE_V2R_PROVIDER_NATIVE_V27_CANDIDATE' as const,
    arm: 'PROVIDER_NATIVE_SEQUENTIAL_TOOL_CALLING' as const,
    historicalStructuredArmDisposition: 'PRESERVE_SEPARATELY_NEVER_OVERWRITE' as const,
    episodeVersion: PROVIDER_NATIVE_EPISODE_VERSION_V2R,
    toolSetVersion: PROVIDER_NATIVE_TOOL_SET_VERSION_V2R,
    taskRegistrySha256: registry.registrySha256,
    operatorCatalog: v2rOperatorCatalogIdentity(),
    completeCapabilityDossier: {
      identity: cap2aPlannerDossierIdentityV2R(),
      operatorCount: dossier.operators.length,
      sheetSha256: dossier.sheetSha256,
    },
    routes: ROUTES,
    cases,
    repetitionsPerRouteCase: 3 as const,
    dispatchGate: 'BLOCKED_UNTIL_EVERY_NON_GAP_CASE_HAS_ARGUMENT_BOUND_ISOLATED_EXECUTOR' as const,
    blockerCodes,
    absoluteMaxSpendUsd,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertProviderNativeCohortManifestV2R(
  value: unknown,
): Readonly<ProviderNativeCohortManifestV2R> {
  if (!isRecord(value)) throw new Error('PROVIDER_NATIVE_COHORT_MANIFEST_MISSING');
  const candidate = value as unknown as ProviderNativeCohortManifestV2R;
  if (candidate.version !== PROVIDER_NATIVE_COHORT_MANIFEST_VERSION_V2R) {
    throw new Error('PROVIDER_NATIVE_COHORT_MANIFEST_VERSION_DRIFT');
  }
  if (candidate.routes.length !== 3
    || candidate.routes.some(({ route: routeEntry }) => routeEntry.routeId === ('QWEN_3_8_MAX' as string))
    || candidate.cases.length !== 6) {
    throw new Error('PROVIDER_NATIVE_COHORT_MANIFEST_ROSTER_DRIFT');
  }
  const { manifestSha256, ...material } = candidate;
  if (manifestSha256 !== hashCanonicalJsonV1(material)) {
    throw new Error('PROVIDER_NATIVE_COHORT_MANIFEST_HASH_DRIFT');
  }
  for (const caseEntry of candidate.cases) {
    const toolSet = buildProviderNativeToolSetV2R(caseEntry.callableOperatorIds);
    if (toolSet.toolSetSha256 !== caseEntry.toolSetSha256
      || hashCanonicalJsonV1(caseEntry.context) !== caseEntry.contextSha256) {
      throw new Error(`PROVIDER_NATIVE_COHORT_CASE_HASH_DRIFT:${caseEntry.caseId}`);
    }
  }
  return candidate;
}

export async function runProviderNativeNoSpendPreflightV2R(input: {
  manifest: Readonly<ProviderNativeCohortManifestV2R>;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: FetchV2R;
}): Promise<Readonly<ProviderNativeNoSpendPreflightReceiptV2R>> {
  const manifest = assertProviderNativeCohortManifestV2R(input.manifest);
  const openAiKey = requiredSecret(input.environment.OPENAI_API_KEY, 'OPENAI_API_KEY');
  const googleKey = requiredSecret(
    input.environment.GEMINI_API_KEY ?? input.environment.GOOGLE_API_KEY,
    'GEMINI_API_KEY_OR_GOOGLE_API_KEY',
  );
  const sandboxCredential = requireFreshVercelOidc(input.environment.VERCEL_OIDC_TOKEN);
  const fetchImpl = input.fetchImpl ?? fetch;
  await Promise.all(manifest.routes.map((routeEntry) => verifyModelAccess(
    routeEntry, routeEntry.route.provider === 'openai' ? openAiKey : googleKey, fetchImpl,
  )));
  const checks: ProviderNativeNoSpendPreflightReceiptV2R['checks'][number][] = [];
  let googleCountTokensPosts = 0;
  for (const routeEntry of manifest.routes) {
    for (const caseEntry of manifest.cases) {
      const request = await captureInitialRequest(routeEntry.route, caseEntry);
      const boundedInputTokens = routeEntry.route.provider === 'openai'
        ? estimateOpenAiRequest(request)
        : await countGoogleRequest(request, routeEntry.route.model, googleKey, fetchImpl);
      if (routeEntry.route.provider === 'google') googleCountTokensPosts += 1;
      if (boundedInputTokens > caseEntry.maxInputTokensPerTurn) {
        throw new Error(`PROVIDER_NATIVE_PREFLIGHT_INPUT_BUDGET_EXCEEDED:${routeEntry.route.routeId}:${caseEntry.caseId}`);
      }
      checks.push({
        routeId: routeEntry.route.routeId,
        caseId: caseEntry.caseId,
        requestSha256: request.requestHash,
        tokenCountMethod: routeEntry.route.provider === 'openai'
          ? 'OPENAI_LOCAL_O200K_115_PERCENT_MARGIN'
          : 'GOOGLE_OFFICIAL_SERIALIZED_INTERACTIONS_REQUEST_115_PERCENT_MARGIN',
        boundedInputTokens,
        maxInputTokensPerTurn: caseEntry.maxInputTokensPerTurn,
        maxOutputTokensPerTurn: caseEntry.context.budget.maxOutputTokensPerTurn,
        absoluteMaxTurnSpendUsd: roundUsd(maxTurnSpend(routeEntry.pricing, caseEntry)),
      });
    }
  }
  const unsigned = {
    version: PROVIDER_NATIVE_NO_SPEND_PREFLIGHT_VERSION_V2R,
    authority: 'RESEARCH_PREFLIGHT_NO_MODEL_INFERENCE_NO_PROJECT_MUTATION' as const,
    manifestSha256: manifest.manifestSha256,
    checks,
    infrastructureAssessment: 'PASS' as const,
    dispatchAssessment: manifest.blockerCodes.length ? 'BLOCKED_CONNECTOR_GAP' as const : 'PASS_READY' as const,
    networkCalls: {
      modelMetadataGets: manifest.routes.length,
      googleCountTokensPosts,
      inferenceCalls: 0 as const,
    },
    sandboxCredential,
    secretsPersisted: false as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...unsigned, receiptSha256: hashCanonicalJsonV1(unsigned) });
}

function buildCase(
  taskCase: Readonly<V2RBenchmarkTaskCaseV2>,
  registrySha256: string,
  dossier: ReturnType<typeof buildCap2aPlannerToolSheetV2R>,
): ProviderNativeCohortCaseV2R {
  const policy = CASE_POLICY[taskCase.caseId];
  if (!policy) throw new Error(`PROVIDER_NATIVE_COHORT_CASE_POLICY_MISSING:${taskCase.caseId}`);
  const modelInput = record(taskCase.task.stageOnePacket.packet.modelInput);
  const projectFacts = record(modelInput.projectFacts);
  const evidencePack = taskCase.task.evidencePack;
  const preservationRules = array(evidencePack.preservationRequirements).map((entry) => (
    typeof entry === 'string' ? entry : requiredText(record(entry).preservationId, 'PRESERVATION_ID')
  ));
  const context: ProviderNativeEpisodeContextV2R = {
    episodeId: `V27:${taskCase.caseId}`,
    objective: requiredText(modelInput.originalRequest ?? modelInput.request, 'OBJECTIVE'),
    activeTarget: {
      taskId: taskCase.task.taskId,
      conditionId: taskCase.task.conditionId,
      executionFormArm: taskCase.task.executionFormArm,
      stageOnePacketSha256: taskCase.task.stageOnePacket.packetHash,
      modelInput,
      ...(taskCase.task.taskId === 'DEV-01'
        ? {
          audioProofRequirements: DEV01_PROVIDER_NATIVE_AUDIO_PROOF_REQUIREMENTS_V2R,
          audioFormOwnerContract: {
            operatorId: 'apply_audio_ducking',
            ownerRef: 'lib/editron/agent/chat-audio-tools.ts#applyAudioDuckingToProject',
            duckLevelSemantics: 'ABSOLUTE_LINEAR_BGM_OUTPUT_GAIN_DURING_MEASURED_SPEECH',
            currentBaseVolume: AUDIO_LEVELS.BGM_WITHOUT_VO,
            currentBaseVolumeSource: 'OWNER_DEFAULT_BECAUSE_FIXTURE_BGM_HAS_NO_EXPLICIT_VOLUME',
            optionalOwnerDefaults: DEFAULT_DUCKING_CONFIG,
            constraints: [
              'An explicit duckLevel must be lower than currentBaseVolume.',
              'Omit optional audioPlan form values when the user supplied no justified numeric target; the owner applies optionalOwnerDefaults.',
              'duckLevel is not a percentage, intensity, or reduction amount.',
            ],
          },
        }
        : {}),
      ...(taskCase.task.taskId === 'DEV-02'
        ? {
          referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
          referenceBlueprintIdentity: DEV02_GENERATED_COMPOSITION_REFERENCE_BINDING_V1,
          researchExecutionAvailability: {
            operatorId: 'generated_composition_program',
            disposition: 'ARGUMENT_BOUND_ISOLATED_EXECUTOR_READY',
            productSupportStatus: 'RESEARCH_ONLY_NOT_IMPLEMENTED',
            authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
            stateEffects: [],
          },
        }
        : {}),
    },
    revisionBinding: {
      projectId: projectFacts.projectId,
      expectedProjectRevision: projectFacts.projectRevision,
      evidencePackSha256: hashCanonicalJsonV1(evidencePack),
    },
    projectState: projectFacts,
    evidence: records(evidencePack.facts),
    preservationRules,
    authorityAndPolicy: {
      authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
      taskRegistrySha256: registrySha256,
      completeCapabilityDossier: {
        identity: cap2aPlannerDossierIdentityV2R(),
        operatorCount: dossier.operators.length,
        sheetSha256: dossier.sheetSha256,
        episodeExposure: 'RELEVANT_COMPLETE_RECORDS_ARE_IN_TOOL_AUTHORITY',
      },
      proofRequirements: array(evidencePack.proofRequirements),
      mediaPolicy: modelInput.mediaPolicy,
      connectorDisposition: policy.connectorDisposition,
    },
    budget: {
      maxTurns: policy.maxTurns,
      maxOutputTokensPerTurn: 4096,
      maxIdenticalCalls: 2,
    },
  };
  const toolSet = buildProviderNativeToolSetV2R(policy.callableOperatorIds);
  return {
    caseId: taskCase.caseId,
    taskId: taskCase.task.taskId,
    conditionId: taskCase.task.conditionId,
    stageOnePacketSha256: taskCase.task.stageOnePacket.packetHash,
    evidencePackSha256: hashCanonicalJsonV1(evidencePack),
    expectedPolicySha256: hashCanonicalJsonV1(taskCase.expected),
    context,
    contextSha256: hashCanonicalJsonV1(context),
    callableOperatorIds: [...policy.callableOperatorIds],
    toolSetSha256: toolSet.toolSetSha256,
    maxInputTokensPerTurn: 64_000,
    connectorDisposition: policy.connectorDisposition,
    connectorVersion: policy.connectorVersion,
    connectorOwnerRefs: [...policy.connectorOwnerRefs],
  };
}

async function captureInitialRequest(
  routeEntry: Readonly<ProviderNativeRouteV2R>,
  caseEntry: Readonly<ProviderNativeCohortCaseV2R>,
): Promise<Readonly<SerializedProviderNativeTurnV2R>> {
  let captured: Readonly<SerializedProviderNativeTurnV2R> | undefined;
  await runProviderNativeToolEpisodeV2R({
    route: routeEntry,
    context: caseEntry.context,
    eligibleOperatorIds: caseEntry.callableOperatorIds,
    invoke: async (request) => {
      captured = request;
      return { status: 418, body: { error: 'NO_SPEND_PREFLIGHT_CAPTURE_ONLY' } };
    },
    executeIsolated: async () => {
      throw new Error('PROVIDER_NATIVE_PREFLIGHT_EXECUTOR_MUST_NOT_RUN');
    },
  });
  if (!captured) throw new Error('PROVIDER_NATIVE_PREFLIGHT_REQUEST_CAPTURE_FAILED');
  return captured;
}

async function verifyModelAccess(
  routeEntry: Readonly<ProviderNativeCohortRouteV2R>,
  apiKey: string,
  fetchImpl: FetchV2R,
): Promise<void> {
  const isOpenAi = routeEntry.route.provider === 'openai';
  const endpoint = isOpenAi
    ? `https://api.openai.com/v1/models/${routeEntry.route.model}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${routeEntry.route.model}`;
  const response = await fetchImpl(endpoint, {
    method: 'GET',
    headers: isOpenAi
      ? { Authorization: `Bearer ${apiKey}` }
      : { 'x-goog-api-key': apiKey },
  });
  const body = await safeJson(response);
  if (!response.ok) throw new Error(`PROVIDER_NATIVE_PREFLIGHT_MODEL_ACCESS_FAILED:${routeEntry.route.routeId}:${response.status}`);
  const returned = isOpenAi ? record(body).id : record(body).name;
  const expected = isOpenAi ? routeEntry.route.model : `models/${routeEntry.route.model}`;
  if (returned !== expected) throw new Error(`PROVIDER_NATIVE_PREFLIGHT_MODEL_IDENTITY_DRIFT:${routeEntry.route.routeId}`);
}

async function countGoogleRequest(
  request: Readonly<SerializedProviderNativeTurnV2R>,
  model: ProviderNativeRouteV2R['model'],
  apiKey: string,
  fetchImpl: FetchV2R,
): Promise<number> {
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        // Interactions has no preflight-count endpoint. Tokenize the complete
        // serialized request with Google's official tokenizer rather than
        // pretending its JSON schemas are GenerateContent Tool schemas.
        contents: [{
          role: 'user',
          parts: [{ text: JSON.stringify(request.body) }],
        }],
      }),
    },
  );
  const responseBody = await safeJson(response);
  const totalTokens = record(responseBody).totalTokens;
  if (!response.ok || !Number.isSafeInteger(totalTokens) || Number(totalTokens) < 1) {
    throw new Error(`PROVIDER_NATIVE_PREFLIGHT_GOOGLE_TOKEN_COUNT_FAILED:${response.status}`);
  }
  return Math.ceil(Number(totalTokens) * 1.15) + 512;
}

function estimateOpenAiRequest(request: Readonly<SerializedProviderNativeTurnV2R>): number {
  return estimateOpenAiGpt56InputTokensV2(request as unknown as SerializedProviderRequestV2);
}

function route(
  routeId: ProviderNativeRouteV2R['routeId'],
  provider: ProviderNativeRouteV2R['provider'],
  model: ProviderNativeRouteV2R['model'],
  transport: ProviderNativeCohortRouteV2R['transport'],
  pricing: RoutePricingV2R,
  pricingSource: string,
): ProviderNativeCohortRouteV2R {
  return {
    route: { routeId, provider, model, claimedModelIdentity: model, reasoningMode: 'medium' },
    transport, pricing, priceSnapshotDate: '2026-08-20', pricingSource,
  };
}

function nativeCase(
  maxTurns: number,
  callableOperatorIds: readonly string[],
  ownerRef: string,
  connectorVersion: string,
): Readonly<(typeof CASE_POLICY)[string]> {
  return {
    maxTurns, callableOperatorIds,
    connectorDisposition: 'ARGUMENT_BOUND_ISOLATED_EXECUTOR_READY',
    connectorVersion,
    connectorOwnerRefs: [ownerRef],
  };
}

function maxCaseSpend(pricing: Readonly<RoutePricingV2R>, caseEntry: Readonly<ProviderNativeCohortCaseV2R>): number {
  return maxTurnSpend(pricing, caseEntry) * caseEntry.context.budget.maxTurns;
}

function maxTurnSpend(pricing: Readonly<RoutePricingV2R>, caseEntry: Readonly<ProviderNativeCohortCaseV2R>): number {
  const inputRate = Math.max(pricing.inputUsdPerMillion, pricing.cacheWriteUsdPerMillion);
  return (caseEntry.maxInputTokensPerTurn * inputRate
    + caseEntry.context.budget.maxOutputTokensPerTurn * pricing.outputUsdPerMillion) / 1_000_000;
}

function requiredSecret(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`PROVIDER_NATIVE_PREFLIGHT_SECRET_MISSING:${label}`);
  return normalized;
}

function requireFreshVercelOidc(value: string | undefined): ProviderNativeNoSpendPreflightReceiptV2R['sandboxCredential'] {
  const token = requiredSecret(value, 'VERCEL_OIDC_TOKEN');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('PROVIDER_NATIVE_PREFLIGHT_VERCEL_OIDC_MALFORMED');
  let payload: JsonRecord;
  try {
    payload = record(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')));
  } catch {
    throw new Error('PROVIDER_NATIVE_PREFLIGHT_VERCEL_OIDC_MALFORMED');
  }
  const expiresAtUnixSeconds = Number(payload.exp);
  const minimumRemainingSeconds = 300 as const;
  const nowUnixSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiresAtUnixSeconds)
    || expiresAtUnixSeconds <= nowUnixSeconds + minimumRemainingSeconds) {
    throw new Error('PROVIDER_NATIVE_PREFLIGHT_VERCEL_OIDC_EXPIRED_OR_NEAR_EXPIRY');
  }
  return {
    kind: 'VERCEL_OIDC', assessment: 'PASS_FRESHNESS_ONLY',
    expiresAtUnixSeconds, minimumRemainingSeconds,
  };
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`PROVIDER_NATIVE_COHORT_${label}_INVALID`);
  return value;
}

async function safeJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return {}; }
}

function roundUsd(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
