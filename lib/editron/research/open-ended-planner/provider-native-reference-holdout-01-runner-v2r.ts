import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { createProviderNativeLiveTransportV2R } from './provider-native-live-transport-v2r';
import {
  assertReferenceHoldout01NativeManifestV2R,
  buildReferenceHoldout01NativeManifestV2R,
} from './provider-native-reference-holdout-01-v2r';
import {
  assertReferenceHoldout01NativeAuthorizationV2R,
  materializeReferenceHoldout01NativeVideoInputV2R,
  runReferenceHoldout01NativeVideoNoSpendPreflightV2R,
  type ReferenceHoldout01NativeAuthorizationV2R,
} from './provider-native-reference-holdout-01-preflight-v2r';
import {
  runProviderNativeReferenceObserverEpisodeV2R,
  type ReferenceObserverEpisodeDispositionV2R,
} from './provider-native-reference-observer-episode-v2r';
import type {
  ProviderNativeGoogleFlashModelV2R,
  ProviderNativeRouteV2R,
} from './provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;

export const REFERENCE_HOLDOUT_01_NATIVE_RUNNER_VERSION_V2R =
  'EDITRON_REFERENCE_HOLDOUT_01_NATIVE_RUNNER_V2R_2' as const;

export type ReferenceHoldout01NativeRunAssessmentV2R =
  | 'VALIDATED_OBSERVATION_READY_FOR_BLIND_HUMAN_REVIEW'
  | 'VALIDATED_HONEST_NONREADY_FOR_BLIND_HUMAN_REVIEW'
  | 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE'
  | 'OBSERVER_PROTOCOL_FAILURE';

export interface ReferenceHoldout01NativeRunReceiptV2R {
  version: typeof REFERENCE_HOLDOUT_01_NATIVE_RUNNER_VERSION_V2R;
  authority: 'RESEARCH_NATIVE_REFERENCE_OBSERVATION_NO_PROJECT_MUTATION';
  executionId: string;
  executedAt: string;
  operatorId: string;
  authorizationSha256: string;
  taskManifestSha256: string;
  evaluatorSha256: string;
  sourceSha256: string;
  referenceInputManifestSha256: string;
  preflightReceiptSha256: string;
  route: Readonly<ProviderNativeRouteV2R>;
  inferenceCalls: number;
  terminalDisposition: ReferenceObserverEpisodeDispositionV2R;
  assessment: ReferenceHoldout01NativeRunAssessmentV2R;
  observationArtifactVersion: string | null;
  artifacts: Readonly<{
    manifest: string;
    authorization: string;
    preflight: string;
    episodeReceipt: string;
    transportReceipt: string;
    runReceipt: string;
  }>;
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function runReferenceHoldout01NativeObservationV2R(input: {
  sourcePath: string;
  outputRoot: string;
  executionId: string;
  authorization: Readonly<ReferenceHoldout01NativeAuthorizationV2R>;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
}): Promise<Readonly<ReferenceHoldout01NativeRunReceiptV2R>> {
  assertRunIdentity(input.outputRoot, input.executionId);
  const authorization = assertReferenceHoldout01NativeAuthorizationV2R(input.authorization);
  const manifest = assertReferenceHoldout01NativeManifestV2R(
    buildReferenceHoldout01NativeManifestV2R(),
  );
  const preflight = await runReferenceHoldout01NativeVideoNoSpendPreflightV2R({
    sourcePath: input.sourcePath,
    authorization,
  });
  if (preflight.dispatchAssessment !== 'READY_FOR_ONE_GEMINI_NATIVE_OBSERVATION'
    || preflight.operatorAuthorization?.authorizationSha256 !== authorization.authorizationSha256
    || preflight.requestCheck.model !== authorization.providerModel
    || preflight.taskManifestSha256 !== manifest.manifestSha256
    || preflight.evaluatorSha256 !== manifest.evaluatorOnly.evaluatorSha256) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_RUN_DISPATCH_BLOCKED');
  }

  await mkdir(path.dirname(input.outputRoot), { recursive: true });
  await mkdir(input.outputRoot, { recursive: false });
  const artifacts = artifactPaths(input.outputRoot);
  await writeJson(artifacts.manifest, manifest);
  await writeJson(artifacts.authorization, authorization);
  await writeJson(artifacts.preflight, preflight);

  const materialized = await materializeReferenceHoldout01NativeVideoInputV2R({
    sourcePath: input.sourcePath,
  });
  if (materialized.referenceInputManifestSha256 !== preflight.referenceInputManifestSha256) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_RUN_INPUT_REBIND_MISMATCH');
  }
  const route = googleRoute(authorization.providerModel);
  const transport = createProviderNativeLiveTransportV2R({
    environment: input.environment,
    fetchImpl: input.fetchImpl,
    timeoutMs: 240_000,
    maxTransientAttempts: 1,
  });
  const episode = await runProviderNativeReferenceObserverEpisodeV2R({
    route,
    referenceInput: materialized.referenceInput,
    maxOutputTokens: authorization.maxOutputTokens,
    invoke: transport.invoke,
  });
  const transportReceipt = transport.snapshot();
  if (transportReceipt.calls.length > authorization.maxInferenceCalls) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_RUN_CALL_LIMIT_EXCEEDED');
  }
  await writeJson(artifacts.episodeReceipt, episode);
  await writeJson(artifacts.transportReceipt, transportReceipt);

  const executedAt = new Date().toISOString();
  const material = {
    version: REFERENCE_HOLDOUT_01_NATIVE_RUNNER_VERSION_V2R,
    authority: 'RESEARCH_NATIVE_REFERENCE_OBSERVATION_NO_PROJECT_MUTATION' as const,
    executionId: input.executionId,
    executedAt,
    operatorId: authorization.operatorId,
    authorizationSha256: authorization.authorizationSha256,
    taskManifestSha256: manifest.manifestSha256,
    evaluatorSha256: manifest.evaluatorOnly.evaluatorSha256,
    sourceSha256: materialized.sourceSha256,
    referenceInputManifestSha256: materialized.referenceInputManifestSha256,
    preflightReceiptSha256: preflight.receiptSha256,
    route,
    inferenceCalls: transportReceipt.calls.length,
    terminalDisposition: episode.terminal.disposition,
    assessment: assessEpisode(episode.terminal.disposition),
    observationArtifactVersion: observationVersion(episode.observation),
    artifacts,
    stateEffects: [] as const,
  };
  const receipt = deepFreezeV1({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  });
  await writeJson(artifacts.runReceipt, receipt);
  return receipt;
}

function assessEpisode(
  disposition: ReferenceObserverEpisodeDispositionV2R,
): ReferenceHoldout01NativeRunAssessmentV2R {
  if (disposition === 'READY_FOR_EVALUATION') {
    return 'VALIDATED_OBSERVATION_READY_FOR_BLIND_HUMAN_REVIEW';
  }
  if (disposition === 'UNVERIFIABLE' || disposition === 'NEEDS_REVIEW') {
    return 'VALIDATED_HONEST_NONREADY_FOR_BLIND_HUMAN_REVIEW';
  }
  if (disposition === 'TOOL_PROTOCOL_FAILURE') return 'OBSERVER_PROTOCOL_FAILURE';
  return 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE';
}

function observationVersion(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const version = (value as JsonRecord).artifactVersion;
  return typeof version === 'string' ? version : null;
}

function artifactPaths(outputRoot: string): ReferenceHoldout01NativeRunReceiptV2R['artifacts'] {
  return {
    manifest: path.join(outputRoot, 'manifest.json'),
    authorization: path.join(outputRoot, 'authorization.json'),
    preflight: path.join(outputRoot, 'preflight.json'),
    episodeReceipt: path.join(outputRoot, 'episode-receipt.json'),
    transportReceipt: path.join(outputRoot, 'transport-receipt.json'),
    runReceipt: path.join(outputRoot, 'run-receipt.json'),
  };
}

function assertRunIdentity(outputRoot: string, executionId: string): void {
  const resolved = path.resolve(outputRoot);
  if (!path.isAbsolute(outputRoot) || resolved === path.parse(resolved).root) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_RUN_OUTPUT_ROOT_INVALID');
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]{2,95}$/.test(executionId)) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_RUN_EXECUTION_ID_INVALID');
  }
}

function googleRoute(
  providerModel: ProviderNativeGoogleFlashModelV2R,
): Readonly<ProviderNativeRouteV2R> {
  return {
    routeId: 'GOOGLE_FLASH',
    provider: 'google',
    model: providerModel,
    claimedModelIdentity: providerModel,
    reasoningMode: 'medium',
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}
