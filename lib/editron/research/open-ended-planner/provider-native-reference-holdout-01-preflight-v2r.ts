import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';

import { canonicalizeJsonV1, deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { buildV2RNextBenchmarkRouteRosterV2 } from './development-cohort-routes-v2';
import {
  buildReferenceHoldout01EvaluatorV2R,
} from './provider-native-reference-holdout-01-evaluator-v2r';
import {
  REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256,
  REFERENCE_HOLDOUT_01_SOURCE_BYTE_LENGTH,
  REFERENCE_HOLDOUT_01_SOURCE_DURATION_US,
  REFERENCE_HOLDOUT_01_SOURCE_SHA256,
  assertReferenceHoldout01ManifestV2R,
  assertReferenceHoldout01NativeManifestV2R,
  buildReferenceHoldout01ManifestV2R,
  buildReferenceHoldout01NativeManifestV2R,
} from './provider-native-reference-holdout-01-v2r';
import {
  PROVIDER_NATIVE_REFERENCE_ARM_V2R,
  PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R,
  bindProviderNativeReferenceInputV2R,
  type ProviderNativeReferenceInputV2R,
} from './provider-native-reference-input-v2r';
import {
  runProviderNativeReferenceObserverEpisodeV2R,
} from './provider-native-reference-observer-episode-v2r';
import {
  PROVIDER_NATIVE_VIDEO_REFERENCE_ARM_V2R,
  PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R,
  bindProviderNativeVideoReferenceInputV2R,
  type ProviderNativeReferenceMediaInputV2R,
  type ProviderNativeVideoReferenceInputV2R,
} from './provider-native-video-reference-input-v2r';
import type {
  ProviderNativeGoogleFlashModelV2R,
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';

export const REFERENCE_HOLDOUT_01_PREFLIGHT_VERSION_V2R =
  'EDITRON_REFERENCE_HOLDOUT_01_PREFLIGHT_V2R_2' as const;
export const REFERENCE_HOLDOUT_01_NATIVE_PREFLIGHT_VERSION_V2R =
  'EDITRON_REFERENCE_HOLDOUT_01_NATIVE_PREFLIGHT_V2R_2' as const;
export const REFERENCE_HOLDOUT_01_NATIVE_AUTHORIZATION_VERSION_V2R =
  'EDITRON_REFERENCE_HOLDOUT_01_NATIVE_AUTHORIZATION_V2R_2' as const;
export const REFERENCE_HOLDOUT_01_NATIVE_MAX_OUTPUT_TOKENS_V2R = 8_192 as const;

export interface ReferenceHoldout01PreflightReceiptV2R {
  version: typeof REFERENCE_HOLDOUT_01_PREFLIGHT_VERSION_V2R;
  authority: 'RESEARCH_PREFLIGHT_NO_MODEL_INFERENCE_NO_PROJECT_MUTATION';
  taskManifestSha256: string;
  evaluatorSha256: string;
  sourceSha256: string;
  ffmpegBinarySha256: string;
  ffmpegVersionLine: string;
  referenceInputManifestSha256: string;
  frameCount: number;
  requestChecks: readonly Readonly<{
    routeId: ProviderNativeRouteV2R['routeId'];
    model: ProviderNativeRouteV2R['model'];
    requestSha256: string;
    requestBytes: number;
    initialContentItems: number;
    imageItems: number;
    editingOperatorCount: 0;
    controlToolCount: 1;
    evaluatorLeakageAssessment: 'PASS';
  }>[];
  manifestMarkerSha256: string;
  networkCalls: Readonly<{ metadata: 0; tokenCounts: 0; inference: 0 }>;
  dispatchAssessment: 'BLOCKED_PENDING_HUMAN_EVALUATOR_APPROVAL';
  stateEffects: readonly [];
  receiptSha256: string;
}

export interface ReferenceHoldout01MaterializationV2R {
  sourceSha256: string;
  ffmpegBinarySha256: string;
  ffmpegVersionLine: string;
  referenceInput: Readonly<ProviderNativeReferenceInputV2R>;
  referenceInputManifestSha256: string;
}

export interface ReferenceHoldout01NativeMaterializationV2R {
  sourceSha256: string;
  sourceByteLength: number;
  referenceInput: Readonly<ProviderNativeVideoReferenceInputV2R>;
  referenceInputManifestSha256: string;
}

export interface ReferenceHoldout01NativeAuthorizationV2R {
  version: typeof REFERENCE_HOLDOUT_01_NATIVE_AUTHORIZATION_VERSION_V2R;
  authority: 'OPERATOR_AUTHORIZATION_ONE_NATIVE_REFERENCE_OBSERVATION';
  operatorId: string;
  approvedAt: string;
  providerModel: ProviderNativeGoogleFlashModelV2R;
  taskManifestSha256: string;
  evaluatorSha256: string;
  sourceSha256: typeof REFERENCE_HOLDOUT_01_SOURCE_SHA256;
  sourceEgressApproved: true;
  evaluatorProtocolApproved: true;
  maxInferenceCalls: 1;
  maxOutputTokens: typeof REFERENCE_HOLDOUT_01_NATIVE_MAX_OUTPUT_TOKENS_V2R;
  stateMutationApproved: false;
  authorizationSha256: string;
}

export interface ReferenceHoldout01NativePreflightReceiptV2R {
  version: typeof REFERENCE_HOLDOUT_01_NATIVE_PREFLIGHT_VERSION_V2R;
  authority: 'RESEARCH_NATIVE_VIDEO_PREFLIGHT_NO_MODEL_INFERENCE_NO_PROJECT_MUTATION';
  taskManifestSha256: string;
  evaluatorSha256: string;
  sourceSha256: string;
  sourceByteLength: number;
  referenceInputManifestSha256: string;
  requestCheck: Readonly<{
    routeId: 'GOOGLE_FLASH';
    model: ProviderNativeGoogleFlashModelV2R;
    requestSha256: string;
    requestBytes: number;
    initialContentItems: 3;
    videoItems: 1;
    editingOperatorCount: 0;
    controlToolCount: 1;
    evaluatorLeakageAssessment: 'PASS';
  }>;
  manifestMarkerSha256: string;
  networkCalls: Readonly<{ metadata: 0; tokenCounts: 0; inference: 0 }>;
  operatorAuthorization: Readonly<{
    operatorId: string;
    approvedAt: string;
    providerModel: ProviderNativeGoogleFlashModelV2R;
    authorizationSha256: string;
    maxInferenceCalls: 1;
    maxOutputTokens: typeof REFERENCE_HOLDOUT_01_NATIVE_MAX_OUTPUT_TOKENS_V2R;
  }> | null;
  dispatchAssessment:
    | 'BLOCKED_PENDING_HASH_BOUND_OPERATOR_EGRESS_AUTHORIZATION'
    | 'READY_FOR_ONE_GEMINI_NATIVE_OBSERVATION';
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function runReferenceHoldout01NoSpendPreflightV2R(input: {
  sourcePath: string;
  ffmpegPath?: string;
}): Promise<Readonly<ReferenceHoldout01PreflightReceiptV2R>> {
  const manifest = assertReferenceHoldout01ManifestV2R(buildReferenceHoldout01ManifestV2R());
  const evaluator = buildReferenceHoldout01EvaluatorV2R();
  const materialization = await materializeReferenceHoldout01InputV2R(input);
  const {
    sourceSha256,
    ffmpegBinarySha256,
    ffmpegVersionLine,
    referenceInput,
    referenceInputManifestSha256,
  } = materialization;

  const requestChecks: ReferenceHoldout01PreflightReceiptV2R['requestChecks'][number][] = [];
  const markerHashes = new Set<string>();
  for (const route of providerRoutes()) {
    const request = await captureRequest(route, referenceInput);
    const requestText = canonicalizeJsonV1(request.body);
    for (const sentinel of evaluator.leakageSentinels) {
      if (requestText.includes(sentinel)) throw new Error(`REFERENCE_HOLDOUT_01_EVALUATOR_LEAK:${sentinel}`);
    }
    if (requestText.includes(String(manifest.sourceMaterialization.sourcePath))) {
      throw new Error('REFERENCE_HOLDOUT_01_SOURCE_PATH_LEAK');
    }
    const content = initialContent(request.body);
    const imageItems = content.filter((item) => item.type === 'input_image' || item.type === 'image').length;
    const marker = content[1]?.text;
    if (typeof marker !== 'string') throw new Error('REFERENCE_HOLDOUT_01_MANIFEST_MARKER_MISSING');
    markerHashes.add(hashCanonicalJsonV1(marker));
    const tools = Array.isArray(request.body.tools) ? request.body.tools : [];
    const controlTools = tools.filter((tool) => (
      isRecord(tool) && tool.name === 'finish_editron_research_episode'
    ));
    const requestBytes = Buffer.byteLength(JSON.stringify(request.body), 'utf8');
    if (content.length !== 30 || imageItems !== 14 || requestBytes > 2_000_000
      || tools.length !== 1 || controlTools.length !== 1) {
      throw new Error(`REFERENCE_HOLDOUT_01_REQUEST_SHAPE_INVALID:${route.routeId}`);
    }
    requestChecks.push({
      routeId: route.routeId,
      model: route.model,
      requestSha256: request.requestHash,
      requestBytes,
      initialContentItems: content.length,
      imageItems,
      editingOperatorCount: 0,
      controlToolCount: 1,
      evaluatorLeakageAssessment: 'PASS',
    });
  }
  if (markerHashes.size !== 1 || requestChecks.length !== 3) {
    throw new Error('REFERENCE_HOLDOUT_01_PROVIDER_PARITY_FAILED');
  }
  const unsigned = {
    version: REFERENCE_HOLDOUT_01_PREFLIGHT_VERSION_V2R,
    authority: 'RESEARCH_PREFLIGHT_NO_MODEL_INFERENCE_NO_PROJECT_MUTATION' as const,
    taskManifestSha256: manifest.manifestSha256,
    evaluatorSha256: evaluator.evaluatorSha256,
    sourceSha256,
    ffmpegBinarySha256,
    ffmpegVersionLine,
    referenceInputManifestSha256,
    frameCount: referenceInput.frames.length,
    requestChecks,
    manifestMarkerSha256: [...markerHashes][0] ?? '',
    networkCalls: { metadata: 0 as const, tokenCounts: 0 as const, inference: 0 as const },
    dispatchAssessment: 'BLOCKED_PENDING_HUMAN_EVALUATOR_APPROVAL' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...unsigned, receiptSha256: hashCanonicalJsonV1(unsigned) });
}

export async function materializeReferenceHoldout01InputV2R(input: {
  sourcePath: string;
  ffmpegPath?: string;
}): Promise<Readonly<ReferenceHoldout01MaterializationV2R>> {
  const manifest = assertReferenceHoldout01ManifestV2R(buildReferenceHoldout01ManifestV2R());
  const sourceSha256 = await sha256File(input.sourcePath);
  if (sourceSha256 !== manifest.sourceMaterialization.sourceSha256) {
    throw new Error('REFERENCE_HOLDOUT_01_SOURCE_SHA256_MISMATCH');
  }
  const ffmpegPath = input.ffmpegPath ?? getFFmpegPath();
  const ffmpegBinarySha256 = await sha256File(ffmpegPath);
  const extractor = manifest.sourceMaterialization.extractor as Record<string, unknown>;
  if (ffmpegBinarySha256 !== extractor.binarySha256) {
    throw new Error('REFERENCE_HOLDOUT_01_FFMPEG_SHA256_MISMATCH');
  }
  const versionOutput = await runBinary(ffmpegPath, ['-version'], 128 * 1024);
  const ffmpegVersionLine = versionOutput.stdout.toString('utf8').split(/\r?\n/, 1)[0] ?? '';
  if (ffmpegVersionLine !== extractor.versionLine) {
    throw new Error('REFERENCE_HOLDOUT_01_FFMPEG_VERSION_MISMATCH');
  }

  const frames = [];
  for (const sample of manifest.sourceMaterialization.samples) {
    const bytes = (await runBinary(
      ffmpegPath,
      extractionArgs(input.sourcePath, sample.timestampUs),
      2 * 1024 * 1024,
    )).stdout;
    const bytesSha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytesSha256 !== sample.bytesSha256 || bytes.length !== sample.byteLength) {
      throw new Error(`REFERENCE_HOLDOUT_01_FRAME_DRIFT:${sample.frameId}`);
    }
    frames.push({
      frameId: sample.frameId,
      timestampUs: sample.timestampUs,
      mimeType: 'image/jpeg' as const,
      bytesBase64: bytes.toString('base64'),
      bytesSha256,
    });
  }
  const referenceInput: ProviderNativeReferenceInputV2R = {
    version: PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R,
    arm: PROVIDER_NATIVE_REFERENCE_ARM_V2R,
    referenceId: 'ref_heldout_01',
    referenceAssetSha256: sourceSha256,
    resolution: 'high',
    frames,
  };
  const bound = bindProviderNativeReferenceInputV2R(referenceInput);
  if (bound.manifestSha256 !== manifest.sourceMaterialization.expectedReferenceInputManifestSha256) {
    throw new Error('REFERENCE_HOLDOUT_01_INPUT_MANIFEST_DRIFT');
  }
  return deepFreezeV1({
    sourceSha256,
    ffmpegBinarySha256,
    ffmpegVersionLine,
    referenceInput: bound.input,
    referenceInputManifestSha256: bound.manifestSha256,
  });
}

export async function runReferenceHoldout01NativeVideoNoSpendPreflightV2R(input: {
  sourcePath: string;
  providerModel?: ProviderNativeGoogleFlashModelV2R;
  authorization?: Readonly<ReferenceHoldout01NativeAuthorizationV2R>;
}): Promise<Readonly<ReferenceHoldout01NativePreflightReceiptV2R>> {
  const manifest = assertReferenceHoldout01NativeManifestV2R(
    buildReferenceHoldout01NativeManifestV2R(),
  );
  const materialization = await materializeReferenceHoldout01NativeVideoInputV2R(input);
  const authorization = input.authorization
    ? assertReferenceHoldout01NativeAuthorizationV2R(input.authorization)
    : null;
  const providerModel = assertNativeProviderModel(
    input.providerModel ?? authorization?.providerModel ?? 'gemini-3.7-flash',
  );
  if (authorization && authorization.providerModel !== providerModel) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_AUTHORIZATION_MODEL_MISMATCH');
  }
  const route = googleProviderRoute(providerModel);
  const request = await captureRequest(route, materialization.referenceInput);
  const content = initialContent(request.body);
  const tools = Array.isArray(request.body.tools) ? request.body.tools : [];
  const controlTools = tools.filter((tool) => (
    isRecord(tool) && tool.name === 'finish_editron_research_episode'
  ));
  const videoItems = content.filter((item) => item.type === 'video');
  const marker = content[1]?.text;
  if (typeof marker !== 'string') {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_MANIFEST_MARKER_MISSING');
  }
  const inspectableRequest = canonicalizeJsonV1({
    textItems: content.filter((item) => item.type === 'text'),
    tools,
  });
  for (const sentinel of manifest.evaluatorOnly.leakageSentinels) {
    if (inspectableRequest.includes(sentinel)) {
      throw new Error(`REFERENCE_HOLDOUT_01_NATIVE_EVALUATOR_LEAK:${sentinel}`);
    }
  }
  if (inspectableRequest.includes('public/product_demos/showcase/insturix-final-intro.mp4')) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_SOURCE_PATH_LEAK');
  }
  const requestBytes = Buffer.byteLength(JSON.stringify(request.body), 'utf8');
  if (content.length !== 3
    || videoItems.length !== 1
    || videoItems[0]?.data !== materialization.referenceInput.bytesBase64
    || requestBytes >= 30_000_000
    || tools.length !== 1
    || controlTools.length !== 1) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_REQUEST_SHAPE_INVALID:GOOGLE_FLASH');
  }
  const unsigned = {
    version: REFERENCE_HOLDOUT_01_NATIVE_PREFLIGHT_VERSION_V2R,
    authority: 'RESEARCH_NATIVE_VIDEO_PREFLIGHT_NO_MODEL_INFERENCE_NO_PROJECT_MUTATION' as const,
    taskManifestSha256: manifest.manifestSha256,
    evaluatorSha256: manifest.evaluatorOnly.evaluatorSha256,
    sourceSha256: materialization.sourceSha256,
    sourceByteLength: materialization.sourceByteLength,
    referenceInputManifestSha256: materialization.referenceInputManifestSha256,
    requestCheck: {
      routeId: 'GOOGLE_FLASH' as const,
      model: route.model,
      requestSha256: request.requestHash,
      requestBytes,
      initialContentItems: 3 as const,
      videoItems: 1 as const,
      editingOperatorCount: 0 as const,
      controlToolCount: 1 as const,
      evaluatorLeakageAssessment: 'PASS' as const,
    },
    manifestMarkerSha256: hashCanonicalJsonV1(marker),
    networkCalls: { metadata: 0 as const, tokenCounts: 0 as const, inference: 0 as const },
    operatorAuthorization: authorization ? {
      operatorId: authorization.operatorId,
      approvedAt: authorization.approvedAt,
      providerModel: authorization.providerModel,
      authorizationSha256: authorization.authorizationSha256,
      maxInferenceCalls: authorization.maxInferenceCalls,
      maxOutputTokens: authorization.maxOutputTokens,
    } : null,
    dispatchAssessment: authorization
      ? 'READY_FOR_ONE_GEMINI_NATIVE_OBSERVATION' as const
      : 'BLOCKED_PENDING_HASH_BOUND_OPERATOR_EGRESS_AUTHORIZATION' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...unsigned, receiptSha256: hashCanonicalJsonV1(unsigned) });
}

export function buildReferenceHoldout01NativeAuthorizationV2R(input: {
  operatorId: string;
  approvedAt: string;
  providerModel?: ProviderNativeGoogleFlashModelV2R;
}): Readonly<ReferenceHoldout01NativeAuthorizationV2R> {
  if (!/^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(input.operatorId)) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_OPERATOR_ID_INVALID');
  }
  if (!isCanonicalIsoTimestamp(input.approvedAt)) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_APPROVED_AT_INVALID');
  }
  const providerModel = assertNativeProviderModel(
    input.providerModel ?? 'gemini-3.7-flash',
  );
  const manifest = assertReferenceHoldout01NativeManifestV2R(
    buildReferenceHoldout01NativeManifestV2R(),
  );
  if (manifest.evaluatorOnly.reviewProtocol.currentHumanReviewStatus
    !== 'PROTOCOL_APPROVED_OUTPUT_NOT_YET_REVIEWED'
    || manifest.evaluatorOnly.reviewProtocol.dispatchGate
    !== 'REQUIRES_HASH_BOUND_ONE_CALL_OPERATOR_AUTHORIZATION') {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_EVALUATOR_PROTOCOL_NOT_APPROVED');
  }
  const material = {
    version: REFERENCE_HOLDOUT_01_NATIVE_AUTHORIZATION_VERSION_V2R,
    authority: 'OPERATOR_AUTHORIZATION_ONE_NATIVE_REFERENCE_OBSERVATION' as const,
    operatorId: input.operatorId,
    approvedAt: input.approvedAt,
    providerModel,
    taskManifestSha256: manifest.manifestSha256,
    evaluatorSha256: manifest.evaluatorOnly.evaluatorSha256,
    sourceSha256: REFERENCE_HOLDOUT_01_SOURCE_SHA256,
    sourceEgressApproved: true as const,
    evaluatorProtocolApproved: true as const,
    maxInferenceCalls: 1 as const,
    maxOutputTokens: REFERENCE_HOLDOUT_01_NATIVE_MAX_OUTPUT_TOKENS_V2R,
    stateMutationApproved: false as const,
  };
  return deepFreezeV1({ ...material, authorizationSha256: hashCanonicalJsonV1(material) });
}

export function assertReferenceHoldout01NativeAuthorizationV2R(
  value: unknown,
): Readonly<ReferenceHoldout01NativeAuthorizationV2R> {
  if (!isRecord(value)) throw new Error('REFERENCE_HOLDOUT_01_NATIVE_AUTHORIZATION_MISSING');
  const operatorId = typeof value.operatorId === 'string' ? value.operatorId : '';
  const approvedAt = typeof value.approvedAt === 'string' ? value.approvedAt : '';
  const providerModel = assertNativeProviderModel(value.providerModel);
  const expected = buildReferenceHoldout01NativeAuthorizationV2R({
    operatorId,
    approvedAt,
    providerModel,
  });
  if (hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(expected)) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_AUTHORIZATION_DRIFT');
  }
  return expected;
}

export async function materializeReferenceHoldout01NativeVideoInputV2R(input: {
  sourcePath: string;
}): Promise<Readonly<ReferenceHoldout01NativeMaterializationV2R>> {
  const manifest = assertReferenceHoldout01NativeManifestV2R(
    buildReferenceHoldout01NativeManifestV2R(),
  );
  const bytes = await readFile(input.sourcePath);
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  if (sourceSha256 !== REFERENCE_HOLDOUT_01_SOURCE_SHA256
    || sourceSha256 !== manifest.sourceBinding.bytesSha256) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_SOURCE_SHA256_MISMATCH');
  }
  if (bytes.length !== REFERENCE_HOLDOUT_01_SOURCE_BYTE_LENGTH
    || bytes.length !== manifest.sourceBinding.byteLength) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_SOURCE_BYTE_LENGTH_MISMATCH');
  }
  const referenceInput: ProviderNativeVideoReferenceInputV2R = {
    version: PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R,
    arm: PROVIDER_NATIVE_VIDEO_REFERENCE_ARM_V2R,
    referenceId: 'ref_heldout_01',
    referenceAssetSha256: sourceSha256,
    mimeType: 'video/mp4',
    bytesBase64: bytes.toString('base64'),
    bytesSha256: sourceSha256,
    byteLength: bytes.length,
    durationUs: REFERENCE_HOLDOUT_01_SOURCE_DURATION_US,
    sourceRate: { numerator: '60', denominator: '1' },
    resolution: 'high',
  };
  const bound = bindProviderNativeVideoReferenceInputV2R(referenceInput);
  if (bound.manifestSha256 !== REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256
    || hashCanonicalJsonV1(bound.manifest) !== hashCanonicalJsonV1(manifest.sourceBinding)) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_INPUT_MANIFEST_DRIFT');
  }
  return deepFreezeV1({
    sourceSha256,
    sourceByteLength: bytes.length,
    referenceInput: bound.input,
    referenceInputManifestSha256: bound.manifestSha256,
  });
}

async function captureRequest(
  route: Readonly<ProviderNativeRouteV2R>,
  referenceInput: Readonly<ProviderNativeReferenceMediaInputV2R>,
): Promise<Readonly<SerializedProviderNativeTurnV2R>> {
  let captured: Readonly<SerializedProviderNativeTurnV2R> | undefined;
  await runProviderNativeReferenceObserverEpisodeV2R({
    route,
    referenceInput,
    maxOutputTokens: 4096,
    invoke: async (request) => {
      captured = request;
      return { status: 418, body: { error: 'NO_SPEND_CAPTURE_ONLY' } };
    },
  });
  if (!captured) throw new Error('REFERENCE_HOLDOUT_01_REQUEST_CAPTURE_FAILED');
  return captured;
}

function googleProviderRoute(
  providerModel: ProviderNativeGoogleFlashModelV2R,
): Readonly<ProviderNativeRouteV2R & {
  model: ProviderNativeGoogleFlashModelV2R;
}> {
  const route = providerRoutes().find((entry) => entry.routeId === 'GOOGLE_FLASH');
  if (!route) throw new Error('REFERENCE_HOLDOUT_01_GOOGLE_ROUTE_MISSING');
  return {
    ...route,
    model: providerModel,
    claimedModelIdentity: providerModel,
  };
}

function providerRoutes(): readonly Readonly<ProviderNativeRouteV2R>[] {
  return buildV2RNextBenchmarkRouteRosterV2().map((entry): ProviderNativeRouteV2R => {
    if (entry.routeId === 'OPENAI_LUNA') return {
      routeId: entry.routeId, provider: 'openai', model: 'gpt-5.6-luna',
      claimedModelIdentity: entry.claimedModelIdentity, reasoningMode: 'medium',
    };
    if (entry.routeId === 'OPENAI_TERRA') return {
      routeId: entry.routeId, provider: 'openai', model: 'gpt-5.6-terra',
      claimedModelIdentity: entry.claimedModelIdentity, reasoningMode: 'medium',
    };
    if (entry.routeId === 'GOOGLE_FLASH') return {
      routeId: entry.routeId, provider: 'google', model: 'gemini-3.7-flash',
      claimedModelIdentity: entry.claimedModelIdentity, reasoningMode: 'medium',
    };
    throw new Error(`REFERENCE_HOLDOUT_01_ROUTE_UNSUPPORTED:${entry.routeId}`);
  });
}

function extractionArgs(sourcePath: string, timestampUs: string): string[] {
  const microsecondsPerSecond = BigInt(1_000_000);
  const timestamp = BigInt(timestampUs);
  const timestampSeconds = (timestamp / microsecondsPerSecond).toString()
    + `.${(timestamp % microsecondsPerSecond).toString().padStart(6, '0')}`;
  return [
    '-hide_banner', '-loglevel', 'error', '-fflags', '+bitexact', '-ss', timestampSeconds,
    '-i', sourcePath, '-map', '0:v:0', '-frames:v', '1', '-vf',
    'scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2:color=black',
    '-an', '-threads', '1', '-c:v', 'mjpeg', '-q:v', '2', '-pix_fmt', 'yuvj420p',
    '-flags', '+bitexact', '-f', 'image2pipe', 'pipe:1',
  ];
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function runBinary(
  binary: string,
  args: readonly string[],
  maxStdoutBytes: number,
): Promise<Readonly<{ stdout: Buffer; stderr: string }>> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxStdoutBytes) child.kill();
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      const errorText = Buffer.concat(stderr).toString('utf8');
      if (stdoutBytes > maxStdoutBytes) reject(new Error('REFERENCE_HOLDOUT_01_PROCESS_OUTPUT_LIMIT'));
      else if (code !== 0) reject(new Error(`REFERENCE_HOLDOUT_01_PROCESS_FAILED:${code}:${errorText.slice(-500)}`));
      else resolve({ stdout: Buffer.concat(stdout), stderr: errorText });
    });
  });
}

function initialContent(body: Readonly<Record<string, unknown>>): Array<Record<string, unknown>> {
  if (!Array.isArray(body.input)) throw new Error('REFERENCE_HOLDOUT_01_PROVIDER_INPUT_MISSING');
  const first = body.input[0] as Record<string, unknown>;
  if (!Array.isArray(first.content)) throw new Error('REFERENCE_HOLDOUT_01_PROVIDER_CONTENT_MISSING');
  return first.content as Array<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCanonicalIsoTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function assertNativeProviderModel(value: unknown): ProviderNativeGoogleFlashModelV2R {
  if (value !== 'gemini-3.6-flash' && value !== 'gemini-3.7-flash') {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_PROVIDER_MODEL_UNSUPPORTED');
  }
  return value;
}
