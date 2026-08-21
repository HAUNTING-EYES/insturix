import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { Dev03Stage6RendererV2 } from './dev03-stage6-native-proxy-contract-v2';
import { estimateOpenAiGpt56InputTokensV2 } from './openai-input-token-counter-v2';
import { runProviderNativeDev03ConnectedEpisodeV2R }
  from './provider-native-dev03-connected-episode-v2r';
import {
  assertProviderNativeHandoffOrderManifestV3R,
  evaluateProviderNativeHandoffOrderEpisodeV3R,
  type ProviderNativeHandoffOrderManifestV3R,
} from './provider-native-handoff-order-experiment-v3r';
import { resolveProviderNativeCredentialsV2R }
  from './provider-native-live-transport-v2r';
import type { ProviderNativeArgumentHandoffModeV2R }
  from './provider-native-result-references-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeInvokeResponseV2R,
} from './provider-native-tool-episode-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import type { SerializedProviderRequestV2 } from './provider-codecs-v2';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_HANDOFF_ORDER_PREFLIGHT_VERSION_V3R =
  'EDITRON_PROVIDER_NATIVE_HANDOFF_ORDER_PREFLIGHT_V3R_3' as const;

export interface ProviderNativeHandoffOrderTransportV3R {
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>)
    => Promise<ProviderNativeInvokeResponseV2R>;
  snapshot: () => unknown;
}

export type ProviderNativeHandoffOrderTransportFactoryV3R = (input: Readonly<{
  route: Readonly<ProviderNativeRouteV2R>;
  rowId: string;
  arm: ProviderNativeArgumentHandoffModeV2R;
  repetition: number;
  presentationPermutationOrdinal: number;
}>) => Readonly<ProviderNativeHandoffOrderTransportV3R>;

export async function preflightProviderNativeHandoffOrderV3R(input: {
  manifest: Readonly<ProviderNativeHandoffOrderManifestV3R>;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
}): Promise<Readonly<JsonRecord>> {
  const manifest = assertProviderNativeHandoffOrderManifestV3R(input.manifest);
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  const fetchImpl = input.fetchImpl ?? fetch;
  await Promise.all(manifest.routes.map((routeEntry) => verifyModel(
    routeEntry.route,
    routeEntry.route.provider === 'openai' ? credentials.openAiKey : credentials.googleKey,
    fetchImpl,
  )));
  const checks: JsonRecord[] = [];
  let googleCountTokensPosts = 0;
  for (const routeEntry of manifest.routes) for (const arm of manifest.arms) {
    for (const [permutationOrdinal, operatorOrder] of (
      manifest.presentationPermutations.entries()
    )) {
      const request = await captureInitialRequest(routeEntry.route, manifest, arm, operatorOrder);
      assertResolvedOwnerEvidenceIsPrivate(request, manifest);
      const boundedInputTokens = routeEntry.route.provider === 'openai'
        ? estimateOpenAiGpt56InputTokensV2(
            request as unknown as SerializedProviderRequestV2,
          )
        : await countGoogleRequest(
            request, routeEntry.route.model, credentials.googleKey, fetchImpl,
          );
      if (routeEntry.route.provider === 'google') googleCountTokensPosts += 1;
      if (boundedInputTokens > manifest.sourceCaseEntry.maxInputTokensPerTurn) {
        throw new Error(
          `PROVIDER_NATIVE_HANDOFF_ORDER_V3_INPUT_BUDGET_EXCEEDED:${routeEntry.route.routeId}:${arm}:P${permutationOrdinal + 1}`,
        );
      }
      checks.push({
        routeId: routeEntry.route.routeId,
        model: routeEntry.route.model,
        arm,
        presentationPermutationOrdinal: permutationOrdinal,
        operatorOrderSha256: hashCanonicalJsonV1(operatorOrder),
        requestSha256: request.requestHash,
        boundedInputTokens,
        maxInputTokensPerTurn: manifest.sourceCaseEntry.maxInputTokensPerTurn,
      });
    }
  }
  const material = {
    version: PROVIDER_NATIVE_HANDOFF_ORDER_PREFLIGHT_VERSION_V3R,
    authority: 'RESEARCH_PREFLIGHT_NO_INFERENCE_NO_PROJECT_MUTATION' as const,
    manifestSha256: manifest.manifestSha256,
    cap2CurrentTruthManifestSha256: manifest.cap2CurrentTruthBinding.manifestSha256,
    cap2CurrentTruthSourceSnapshotSha256:
      manifest.cap2CurrentTruthBinding.normalizedSourceSnapshotSha256,
    visibilityReceiptSha256: manifest.visibilityReceipt.receiptSha256,
    checks,
    googleCredentialSource: credentials.googleCredentialSource,
    networkCalls: {
      modelMetadataGets: manifest.routes.length,
      googleCountTokensPosts,
      inferenceCalls: 0 as const,
    },
    secretsPersisted: false as const,
    assessment: 'PASS_READY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export async function runProviderNativeHandoffOrderExperimentV3R(input: {
  manifest: Readonly<ProviderNativeHandoffOrderManifestV3R>;
  outputRoot: string;
  createTransport: ProviderNativeHandoffOrderTransportFactoryV3R;
  repetitions?: number;
  repetitionOrdinals?: readonly number[];
  renderer?: Dev03Stage6RendererV2;
}): Promise<Readonly<JsonRecord>> {
  const manifest = assertProviderNativeHandoffOrderManifestV3R(input.manifest);
  const repetitionOrdinals = resolveRepetitionOrdinals(
    input.repetitions,
    input.repetitionOrdinals,
    manifest.repetitionsPerRouteArm,
  );
  await mkdir(input.outputRoot, { recursive: false });
  const rows: JsonRecord[] = [];
  for (const routeEntry of manifest.routes) for (const arm of manifest.arms) {
    for (const repetition of repetitionOrdinals) {
      const presentationPermutationOrdinal = repetition - 1;
      const operatorOrder = manifest.presentationPermutations[presentationPermutationOrdinal];
      const rowId = `${routeEntry.route.routeId.toLowerCase()}-${arm.toLowerCase()}-p${repetition}`;
      const rowRoot = path.join(input.outputRoot, 'rows', rowId);
      let transport: Readonly<ProviderNativeHandoffOrderTransportV3R> | undefined;
      await mkdir(rowRoot, { recursive: true });
      try {
        transport = input.createTransport({
          route: routeEntry.route, rowId, arm, repetition,
          presentationPermutationOrdinal,
        });
        const receipt = await runProviderNativeDev03ConnectedEpisodeV2R({
          route: routeEntry.route,
          context: manifest.modelContext,
          ownerEvidenceContext: manifest.sourceCaseEntry.context,
          invoke: transport.invoke,
          outputDir: path.join(rowRoot, 'render'),
          executionId: rowId,
          createdAt: new Date().toISOString(),
          argumentHandoffMode: arm,
          eligibleOperatorIds: operatorOrder,
          ...(input.renderer ? { renderer: input.renderer } : {}),
        });
        const evaluation = evaluateProviderNativeHandoffOrderEpisodeV3R(
          receipt as unknown as JsonRecord, arm, manifest.requiredCausalOrder,
        );
        const row = {
          rowId, routeId: routeEntry.route.routeId, model: routeEntry.route.model,
          arm, repetition, presentationPermutationOrdinal,
          operatorOrderPresented: operatorOrder, evaluation, receipt,
          transport: transport.snapshot(), stateEffects: [] as const,
        };
        rows.push(row);
        await writeJson(path.join(rowRoot, 'row.json'), row);
      } catch (error) {
        const row = {
          rowId, routeId: routeEntry.route.routeId, model: routeEntry.route.model,
          arm, repetition, presentationPermutationOrdinal,
          operatorOrderPresented: operatorOrder,
          evaluation: {
            assessment: 'HARNESS_ERROR', reasonCodes: ['UNCAUGHT_EXPERIMENT_EXCEPTION'],
          },
          error: errorMessage(error), transport: transport?.snapshot() ?? null,
          stateEffects: [] as const,
        };
        rows.push(row);
        await writeJson(path.join(rowRoot, 'row.json'), row);
      }
    }
  }
  const evaluations = rows.map((row) => record(row.evaluation));
  const material = {
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    manifestSha256: manifest.manifestSha256,
    evaluatorPolicySha256: manifest.evaluatorPolicySha256,
    evaluatorSourceSha256: manifest.evaluatorSourceSha256,
    repetitions: repetitionOrdinals.length,
    repetitionOrdinals,
    rows,
    firstChoiceCorrectCount: countTrue(evaluations, 'firstRelevantChoiceCorrect'),
    prematureDependentAttemptCount: countTrue(evaluations, 'prematureDependentAttempt'),
    safelyRejectedPrematureAttemptCount:
      countTrue(evaluations, 'prematureDependentAttemptSafelyRejected'),
    recoveredAfterPrematureAttemptCount:
      countTrue(evaluations, 'recoveredAfterPrematureAttempt'),
    eventualCausalExecutionCount: countTrue(evaluations, 'eventualCausalExecutionPass'),
    resultHandoffPassCount: countTrue(evaluations, 'resultHandoffPass'),
    writerRevisionHandoffPassCount: countTrue(evaluations, 'writerRevisionHandoffPass'),
    renderedProductPassCount: countTrue(evaluations, 'renderedProductPass'),
    noProjectMutationCount: countTrue(evaluations, 'noProjectMutation'),
    safeOutcomePassCount: countAssessment(evaluations, 'PASS'),
    failCount: countAssessment(evaluations, 'FAIL'),
    providerInfrastructureUnverifiableCount:
      countAssessment(evaluations, 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE'),
    renderInfrastructureUnverifiableCount:
      countAssessment(evaluations, 'RENDER_INFRASTRUCTURE_UNVERIFIABLE'),
    harnessErrorCount: countAssessment(evaluations, 'HARNESS_ERROR'),
    stateEffects: [] as const,
  };
  const receipt = deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
  await writeJson(path.join(input.outputRoot, 'experiment-receipt.json'), receipt);
  return receipt;
}

function resolveRepetitionOrdinals(
  repetitions: number | undefined,
  explicitOrdinals: readonly number[] | undefined,
  maximum: number,
): readonly number[] {
  if (repetitions !== undefined && explicitOrdinals !== undefined) {
    throw new Error(
      'PROVIDER_NATIVE_HANDOFF_ORDER_V3_REPETITION_SELECTION_AMBIGUOUS',
    );
  }
  if (explicitOrdinals !== undefined) {
    if (explicitOrdinals.length === 0
      || !explicitOrdinals.every((ordinal) => Number.isSafeInteger(ordinal)
        && ordinal >= 1 && ordinal <= maximum)
      || !explicitOrdinals.every((ordinal, index) => index === 0
        || explicitOrdinals[index - 1] < ordinal)) {
      throw new Error(
        'PROVIDER_NATIVE_HANDOFF_ORDER_V3_REPETITION_ORDINALS_INVALID',
      );
    }
    return [...explicitOrdinals];
  }
  const count = repetitions ?? maximum;
  if (!Number.isSafeInteger(count) || count < 1 || count > maximum) {
    throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_V3_REPETITIONS_INVALID');
  }
  return Array.from({ length: count }, (_, index) => index + 1);
}

async function captureInitialRequest(
  route: Readonly<ProviderNativeRouteV2R>,
  manifest: Readonly<ProviderNativeHandoffOrderManifestV3R>,
  arm: ProviderNativeArgumentHandoffModeV2R,
  operatorOrder: readonly string[],
): Promise<Readonly<SerializedProviderNativeTurnV2R>> {
  let captured: Readonly<SerializedProviderNativeTurnV2R> | undefined;
  await runProviderNativeToolEpisodeV2R({
    route, context: manifest.modelContext, eligibleOperatorIds: operatorOrder,
    argumentHandoffMode: arm,
    invoke: async (request) => {
      captured = request;
      return { status: 418, body: { preflight: true } };
    },
    executeIsolated: async () => { throw new Error('V3_PREFLIGHT_EXECUTOR_MUST_NOT_RUN'); },
  });
  if (!captured) throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_V3_REQUEST_CAPTURE_FAILED');
  return captured;
}

function assertResolvedOwnerEvidenceIsPrivate(
  request: Readonly<SerializedProviderNativeTurnV2R>,
  manifest: Readonly<ProviderNativeHandoffOrderManifestV3R>,
): void {
  const measured = manifest.sourceCaseEntry.context.evidence.find((fact) => (
    fact.kind === 'HASH_BOUND_MEASURED_AUDIO'
  ));
  const exactFrames = measured?.strongPeakFrames;
  if (!Array.isArray(exactFrames)
    || JSON.stringify(request.body).includes(JSON.stringify(exactFrames))) {
    throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_V3_RESOLVED_EVIDENCE_LEAK');
  }
}

async function verifyModel(
  route: Readonly<ProviderNativeRouteV2R>, key: string, fetchImpl: typeof fetch,
): Promise<void> {
  const openAi = route.provider === 'openai';
  const endpoint = openAi ? `https://api.openai.com/v1/models/${route.model}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${route.model}`;
  const response = await fetchImpl(endpoint, { headers: openAi
    ? { authorization: `Bearer ${key}` } : { 'x-goog-api-key': key } });
  const body = await safeJson(response);
  const identity = openAi ? record(body).id : record(body).name;
  if (!response.ok || identity !== (openAi ? route.model : `models/${route.model}`)) {
    throw new Error(
      `PROVIDER_NATIVE_HANDOFF_ORDER_V3_MODEL_ACCESS_FAILED:${route.routeId}:${response.status}`,
    );
  }
}

async function countGoogleRequest(
  request: Readonly<SerializedProviderNativeTurnV2R>, model: string,
  key: string, fetchImpl: typeof fetch,
): Promise<number> {
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens`,
    { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: JSON.stringify(request.body) }] }] }) },
  );
  const body = await safeJson(response);
  const total = Number(record(body).totalTokens);
  if (!response.ok || !Number.isSafeInteger(total) || total < 1) {
    throw new Error(`PROVIDER_NATIVE_HANDOFF_ORDER_V3_GOOGLE_COUNT_FAILED:${response.status}`);
  }
  return Math.ceil(total * 1.15) + 512;
}

function countTrue(evaluations: readonly JsonRecord[], field: string): number {
  return evaluations.filter((evaluation) => evaluation[field] === true).length;
}
function countAssessment(evaluations: readonly JsonRecord[], assessment: string): number {
  return evaluations.filter((evaluation) => evaluation.assessment === assessment).length;
}
async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx',
  });
}
async function safeJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return {}; }
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}
