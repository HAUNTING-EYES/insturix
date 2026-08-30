import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1,
  persistMediaSourceAudioArtifactAssetStateV1,
  readMediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
  type MediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetStorePortsV1,
} from './media-source-audio-artifact-asset-owner-v1';
import type { MediaSourceAudioPrivateArtifactStreamWriterV1 }
  from './media-source-audio-private-artifact-port-v1';
import {
  assertMediaSourceAudioSampleEpochResourcePolicyV1,
  assertMediaSourceAudioStreamBindingV1,
  createMediaSourceAudioStreamBindingV1,
  type MediaSourceAudioSampleEpochResourcePolicyV1,
  type MediaSourceAudioStreamBindingV1,
} from './media-source-audio-sample-epoch-map-v1';
import { materializeMediaSourceAudioPrivateArtifactFfmpegV1 }
  from './media-source-audio-sample-epoch-ffmpeg-v1';
import {
  createMediaSourceAudioVersionEvidenceStorePortsV1,
  MediaSourceAudioVersionEvidenceErrorV1,
} from './media-source-audio-version-evidence-store-v1';
import { readNativeMediaExactAudioStreamIndexesV1 }
  from './native-media-exact-audio-evidence-v1';
import type { MediaSourceQualificationRecordV1 }
  from './media-source-qualification-v1';
import {
  assertMediaSourceVersionEvidenceRecordV1,
  captureMediaSourceVersionEvidenceV1,
  mediaSourceVersionEvidenceScopeV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from './media-source-version-evidence-owner-v1';
import { assertMediaSourceVersionV1 }
  from './media-source-version-v1';
import type { VerifiedMediaSourceLeasePortV1 }
  from './verified-media-source-local-file-v1';

export const MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_V1' as const;

export type MediaSourceAudioProductMaterializationReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_KIND_V1;
  disposition: 'COMPLETED' | 'ALREADY_COMPLETE';
  assetId: string;
  userId: string;
  sourceVersionSha256: string;
  audioStreamBindingsSha256: string;
  observedAudioStreamIndexes: readonly number[];
  materializedAudioStreamIndexes: readonly number[];
  audioArtifactStateSha256: string;
  sourceVersionEvidenceSha256: string;
  completedAt: string;
  receiptSha256: string;
}>;

export type MediaSourceAudioProductMaterializationFailureReasonV1 =
  | 'INPUT_INVALID'
  | 'PORTS_INVALID'
  | 'ASSET_LOAD_FAILED'
  | 'ASSET_NOT_FOUND'
  | 'SOURCE_BINDING_INVALID'
  | 'EXPECTED_SOURCE_MISMATCH'
  | 'MATERIALIZATION_ABORTED'
  | 'AUDIO_STREAM_OBSERVATION_INVALID'
  | 'AUDIO_STREAM_COUNT_EXCEEDED'
  | 'NO_AUDIO_PROOF_REQUIRED'
  | 'CURRENT_STATE_INVALID'
  | 'CURRENT_STREAM_SET_INVALID'
  | 'SOURCE_LEASE_INVALID'
  | 'STREAM_MATERIALIZATION_FAILED'
  | 'ACTIVE_STATE_STORE_FAILED'
  | 'ACTIVE_STATE_RACE'
  | 'ACTIVE_STATE_REJECTED'
  | 'SOURCE_VERSION_EVIDENCE_REJECTED'
  | 'SOURCE_VERSION_EVIDENCE_READ_FAILED'
  | 'SOURCE_VERSION_EVIDENCE_READBACK_MISSING'
  | 'HISTORICAL_EVIDENCE_REQUIRED'
  | 'SOURCE_VERSION_EVIDENCE_INVALID'
  | 'SOURCE_VERSION_EVIDENCE_CONFLICT';

type MaterializeAudioStreamV1 =
  typeof materializeMediaSourceAudioPrivateArtifactFfmpegV1;

export type MediaSourceAudioProductMaterializationInputV1 = Readonly<{
  assetId: string;
  userId: string;
  expectedAudioStreamBindings: readonly MediaSourceAudioStreamBindingV1[];
  resourcePolicy: MediaSourceAudioSampleEpochResourcePolicyV1;
  publishedAt: Date;
  abortSignal?: AbortSignal;
  beforeActiveStateMutation?: () => Promise<void>;
}>;

export type MediaSourceAudioProductMaterializationPortsV1 = Readonly<{
  assetStorePorts: MediaSourceAudioArtifactAssetStorePortsV1;
  evidenceStorePorts: MediaSourceVersionEvidenceStorePortsV1;
  artifactWriter: MediaSourceAudioPrivateArtifactStreamWriterV1;
  createSourceLease(
    asset: MediaSourceAudioArtifactAssetStateInputV1,
  ): VerifiedMediaSourceLeasePortV1;
  materializeStream?: MaterializeAudioStreamV1;
}>;

/**
 * Composes existing source, FFmpeg, private-artifact, asset-CAS and immutable
 * evidence owners. It is resumable per observed stream but owns no dispatch,
 * retry budget, user-facing selection or no-audio policy.
 */
export async function materializeMediaSourceAudioProductV1(
  input: MediaSourceAudioProductMaterializationInputV1,
  ports: MediaSourceAudioProductMaterializationPortsV1,
): Promise<MediaSourceAudioProductMaterializationReceiptV1> {
  const normalized = normalizeInput(input);
  assertPorts(ports);
  assertNotAborted(normalized.abortSignal);

  let asset: MediaSourceAudioArtifactAssetStateInputV1 | null;
  try {
    asset = await ports.assetStorePorts.load(normalized.assetId, normalized.userId);
  } catch (error) {
    throw failure('ASSET_LOAD_FAILED', true, diagnostic(error));
  }
  assertNotAborted(normalized.abortSignal);
  if (asset === null) throw failure('ASSET_NOT_FOUND', false);

  let sourceVersion: ReturnType<typeof assertMediaSourceVersionV1>;
  let qualification: MediaSourceQualificationRecordV1;
  let observed: readonly number[];
  let bindings: readonly MediaSourceAudioStreamBindingV1[];
  let bindingsSha256: string;
  try {
    sourceVersion = assertMediaSourceVersionV1(asset.sourceVersionV1);
    if (asset.assetId !== normalized.assetId
      || asset.assetId !== sourceVersion.assetId
      || asset.type !== sourceVersion.mediaKind) {
      throw new Error('MEDIA_SOURCE_AUDIO_PRODUCT_ASSET_SCOPE_MISMATCH');
    }
    qualification = asset.sourceQualificationV1 as MediaSourceQualificationRecordV1;
    const indexes = readNativeMediaExactAudioStreamIndexesV1(asset);
    if (indexes === null) {
      throw failure('AUDIO_STREAM_OBSERVATION_INVALID', false);
    }
    if (indexes.length === 0) throw failure('NO_AUDIO_PROOF_REQUIRED', false);
    if (indexes.length > MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1) {
      throw failure('AUDIO_STREAM_COUNT_EXCEEDED', false);
    }
    bindings = indexes.map((audioStreamIndex) => (
      createMediaSourceAudioStreamBindingV1({
        sourceVersion,
        qualification,
        audioStreamIndex,
      })
    ));
    bindingsSha256 = hashEditronCanonicalJsonV1(bindings);
    if (bindingsSha256
      !== hashEditronCanonicalJsonV1(normalized.expectedAudioStreamBindings)) {
      throw failure('EXPECTED_SOURCE_MISMATCH', false);
    }
    observed = indexes;
  } catch (error) {
    if (error instanceof MediaSourceAudioProductMaterializationErrorV1) throw error;
    throw failure('SOURCE_BINDING_INVALID', false, diagnostic(error));
  }

  let state: MediaSourceAudioArtifactAssetStateV1 | null;
  try {
    state = readMediaSourceAudioArtifactAssetStateV1(asset);
  } catch (error) {
    throw failure('CURRENT_STATE_INVALID', false, diagnostic(error));
  }
  const recorded = state?.sourceAudioArtifactsV1.records.map(
    ({ audioStreamIndex }) => audioStreamIndex,
  ) ?? [];
  if (recorded.some((audioStreamIndex) => !observed.includes(audioStreamIndex))) {
    throw failure('CURRENT_STREAM_SET_INVALID', false);
  }
  const missing = observed.filter((audioStreamIndex) => !recorded.includes(audioStreamIndex));
  const materialized: number[] = [];
  const evidenceBoundStore = createMediaSourceAudioVersionEvidenceStorePortsV1({
    assetStorePorts: ports.assetStorePorts,
    evidenceStorePorts: ports.evidenceStorePorts,
  });
  let sourceLease: VerifiedMediaSourceLeasePortV1 | null = null;
  if (missing.length > 0) {
    assertNotAborted(normalized.abortSignal);
    try {
      sourceLease = ports.createSourceLease(asset);
      if (!sourceLease || typeof sourceLease.open !== 'function') {
        throw new Error('MEDIA_SOURCE_AUDIO_PRODUCT_SOURCE_LEASE_INVALID');
      }
    } catch (error) {
      throw failure('SOURCE_LEASE_INVALID', false, diagnostic(error));
    }
    assertNotAborted(normalized.abortSignal);
  }

  const materializeStream = ports.materializeStream
    ?? materializeMediaSourceAudioPrivateArtifactFfmpegV1;
  for (const audioStreamIndex of missing) {
    assertNotAborted(normalized.abortSignal);
    let artifact: Awaited<ReturnType<MaterializeAudioStreamV1>>;
    try {
      artifact = await materializeStream({
        sourceVersion,
        qualification,
        audioStreamIndex,
        sourceLease: sourceLease!,
        resourcePolicy: normalized.resourcePolicy,
        artifactWriter: ports.artifactWriter,
        abortSignal: normalized.abortSignal,
      });
    } catch (error) {
      assertNotAborted(normalized.abortSignal);
      const code = diagnostic(error);
      throw failure(
        'STREAM_MATERIALIZATION_FAILED',
        code !== null && RETRYABLE_MATERIALIZATION_CODES.has(code),
        code,
      );
    }
    assertNotAborted(normalized.abortSignal);
    if (normalized.beforeActiveStateMutation) {
      await normalized.beforeActiveStateMutation();
    }
    assertNotAborted(normalized.abortSignal);

    let persisted: Awaited<ReturnType<typeof persistMediaSourceAudioArtifactAssetStateV1>>;
    try {
      persisted = await persistMediaSourceAudioArtifactAssetStateV1({
        assetId: normalized.assetId,
        userId: normalized.userId,
        expectedStateSha256:
          state?.sourceAudioArtifactsStateSha256V1 ?? null,
        mapSerialization: artifact.mapSerialization,
        manifestSerialization: artifact.manifestSerialization,
        publishedAt: normalized.publishedAt,
      }, evidenceBoundStore);
    } catch (error) {
      if (error instanceof MediaSourceAudioVersionEvidenceErrorV1) {
        throw failure(
          'SOURCE_VERSION_EVIDENCE_REJECTED',
          error.retryable,
          error.reason,
        );
      }
      throw failure('ACTIVE_STATE_STORE_FAILED', true, diagnostic(error));
    }
    if (persisted.disposition === 'RACE_LOST') {
      throw failure('ACTIVE_STATE_RACE', true);
    }
    if (persisted.disposition === 'SKIPPED') {
      throw failure('ASSET_NOT_FOUND', false, persisted.reason);
    }
    if (persisted.disposition === 'REJECTED') {
      throw failure(
        persisted.reason === 'EXPECTED_STATE_MISMATCH'
          ? 'ACTIVE_STATE_RACE'
          : 'ACTIVE_STATE_REJECTED',
        persisted.reason === 'EXPECTED_STATE_MISMATCH',
        persisted.reason,
      );
    }
    state = persisted.state;
    materialized.push(audioStreamIndex);
  }

  if (state === null) throw failure('CURRENT_STATE_INVALID', false);
  if (materialized.length === 0) assertNotAborted(normalized.abortSignal);
  const evidenceSha256 = await readBackTerminalEvidence({
    asset,
    state,
    materializedCount: materialized.length,
    ports: ports.evidenceStorePorts,
  });
  return receipt({
    disposition: materialized.length === 0 ? 'ALREADY_COMPLETE' : 'COMPLETED',
    assetId: normalized.assetId,
    userId: normalized.userId,
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    audioStreamBindingsSha256: bindingsSha256,
    observedAudioStreamIndexes: observed,
    materializedAudioStreamIndexes: materialized,
    audioArtifactStateSha256: state.sourceAudioArtifactsStateSha256V1,
    sourceVersionEvidenceSha256: evidenceSha256,
    completedAt: normalized.publishedAt.toISOString(),
  });
}

async function readBackTerminalEvidence(input: Readonly<{
  asset: MediaSourceAudioArtifactAssetStateInputV1;
  state: MediaSourceAudioArtifactAssetStateV1;
  materializedCount: number;
  ports: MediaSourceVersionEvidenceStorePortsV1;
}>): Promise<string> {
  let candidate;
  try {
    candidate = captureMediaSourceVersionEvidenceV1({
      assetId: input.asset.assetId,
      type: input.asset.type,
      sourceVersionV1: input.asset.sourceVersionV1,
      sourceQualificationV1: input.asset.sourceQualificationV1,
      ...input.state,
    });
  } catch (error) {
    throw failure('SOURCE_VERSION_EVIDENCE_INVALID', false, diagnostic(error));
  }
  let loaded: unknown | null;
  try {
    loaded = await input.ports.load(mediaSourceVersionEvidenceScopeV1(candidate));
  } catch (error) {
    throw failure('SOURCE_VERSION_EVIDENCE_READ_FAILED', true, diagnostic(error));
  }
  if (loaded === null) {
    throw failure(
      input.materializedCount === 0
        ? 'HISTORICAL_EVIDENCE_REQUIRED'
        : 'SOURCE_VERSION_EVIDENCE_READBACK_MISSING',
      input.materializedCount > 0,
    );
  }
  let evidence;
  try {
    evidence = assertMediaSourceVersionEvidenceRecordV1(loaded);
  } catch (error) {
    throw failure('SOURCE_VERSION_EVIDENCE_INVALID', false, diagnostic(error));
  }
  if (evidence.sourceVersionV1.sourceVersionSha256
      !== candidate.sourceVersionV1.sourceVersionSha256
    || evidence.sourceAudioArtifactsStateSha256V1
      !== input.state.sourceAudioArtifactsStateSha256V1) {
    throw failure('SOURCE_VERSION_EVIDENCE_CONFLICT', false);
  }
  return evidence.evidenceSha256;
}

const RETRYABLE_MATERIALIZATION_CODES = new Set([
  'MEDIA_SOURCE_AUDIO_PRODUCT_SOURCE_URL_UNAVAILABLE',
  'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_READ_FAILED',
  'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_WRITE_FAILED',
  'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FFPROBE_TIMEOUT',
  'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FFMPEG_TIMEOUT',
  'MEDIA_SOURCE_AUDIO_R2_WRITE_FAILED',
]);

function normalizeInput(input: MediaSourceAudioProductMaterializationInputV1) {
  try {
    const publishedAt = new Date(input.publishedAt.getTime());
    if (Number.isNaN(publishedAt.getTime())) throw new Error('DATE_INVALID');
    const abortSignal = normalizeAbortSignal(input.abortSignal);
    if (input.beforeActiveStateMutation !== undefined
      && typeof input.beforeActiveStateMutation !== 'function') {
      throw new Error('BEFORE_ACTIVE_STATE_MUTATION_INVALID');
    }
    if (!Array.isArray(input.expectedAudioStreamBindings)
      || input.expectedAudioStreamBindings.length
        > MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1) {
      throw new Error('EXPECTED_AUDIO_STREAM_BINDINGS_INVALID');
    }
    const expectedAudioStreamBindings = input.expectedAudioStreamBindings
      .map((binding) => assertMediaSourceAudioStreamBindingV1(binding))
      .sort((left, right) => left.audioStreamIndex - right.audioStreamIndex);
    const assetId = identifier(input.assetId);
    const streamIndexes = expectedAudioStreamBindings.map(
      ({ audioStreamIndex }) => audioStreamIndex,
    );
    if (new Set(streamIndexes).size !== streamIndexes.length
      || expectedAudioStreamBindings.some(({ assetId: boundAssetId }) => (
        boundAssetId !== assetId
      ))) {
      throw new Error('EXPECTED_AUDIO_STREAM_BINDINGS_INVALID');
    }
    return {
      assetId,
      userId: identifier(input.userId),
      expectedAudioStreamBindings,
      resourcePolicy: assertMediaSourceAudioSampleEpochResourcePolicyV1(
        input.resourcePolicy,
      ),
      publishedAt,
      abortSignal,
      beforeActiveStateMutation: input.beforeActiveStateMutation,
    };
  } catch (error) {
    throw failure('INPUT_INVALID', false, diagnostic(error));
  }
}

function normalizeAbortSignal(value: unknown): AbortSignal | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object'
    || typeof (value as { aborted?: unknown }).aborted !== 'boolean'
    || typeof (value as { addEventListener?: unknown }).addEventListener
      !== 'function'
    || typeof (value as { removeEventListener?: unknown }).removeEventListener
      !== 'function') {
    throw new Error('ABORT_SIGNAL_INVALID');
  }
  return value as AbortSignal;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw failure('MATERIALIZATION_ABORTED', true);
}

function assertPorts(ports: MediaSourceAudioProductMaterializationPortsV1): void {
  if (!ports || !ports.assetStorePorts
    || typeof ports.assetStorePorts.load !== 'function'
    || typeof ports.assetStorePorts.replace !== 'function'
    || !ports.evidenceStorePorts
    || typeof ports.evidenceStorePorts.load !== 'function'
    || typeof ports.evidenceStorePorts.compareAndSet !== 'function'
    || !ports.artifactWriter
    || typeof ports.artifactWriter.writeArtifactSetFromPcmStream !== 'function'
    || typeof ports.createSourceLease !== 'function'
    || (ports.materializeStream !== undefined
      && typeof ports.materializeStream !== 'function')) {
    throw failure('PORTS_INVALID', false);
  }
}

function receipt(input: Omit<
  MediaSourceAudioProductMaterializationReceiptV1,
  'schemaVersion' | 'kind' | 'receiptSha256'
>): MediaSourceAudioProductMaterializationReceiptV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_KIND_V1,
    ...input,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

function identifier(value: unknown): string {
  if (typeof value !== 'string') throw new Error('IDENTIFIER_INVALID');
  const normalized = value.trim();
  if (!normalized || normalized.length > 256
    || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error('IDENTIFIER_INVALID');
  }
  return normalized;
}

function diagnostic(error: unknown): string | null {
  return error instanceof Error && /^[A-Z0-9_]{1,200}$/.test(error.message)
    ? error.message
    : null;
}

function failure(
  reason: MediaSourceAudioProductMaterializationFailureReasonV1,
  retryable: boolean,
  diagnosticCode: string | null = null,
): MediaSourceAudioProductMaterializationErrorV1 {
  return new MediaSourceAudioProductMaterializationErrorV1(
    reason,
    retryable,
    diagnosticCode,
  );
}

export class MediaSourceAudioProductMaterializationErrorV1 extends Error {
  constructor(
    public readonly reason: MediaSourceAudioProductMaterializationFailureReasonV1,
    public readonly retryable: boolean,
    public readonly diagnosticCode: string | null,
  ) {
    super(reason);
    this.name = 'MediaSourceAudioProductMaterializationErrorV1';
  }
}
