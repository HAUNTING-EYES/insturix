import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import { parseExactRationalRateV1 }
  from '../contracts/canonical-media-time-v1';
import type { MediaSourceAudioPrivateArtifactReaderV1 }
  from './media-source-audio-private-artifact-port-v1';
import type { MediaSourceAudioPrivateArtifactStoreV1 }
  from './media-source-audio-r2-private-artifact-v1';
import type { MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3 }
  from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  assertMediaSourceVersionEvidenceRecordV1,
  mediaSourceVersionEvidenceAssetViewV1,
  type MediaSourceVersionEvidenceScopeV1,
} from './media-source-version-evidence-owner-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import {
  analysisNonNegativeIntegerText,
  analysisProjectRevision,
  analysisSha256,
  analysisText,
} from './native-media-timestamp-analysis-validation-v1';
import {
  resolveNativeMediaExactAudioEvidenceV1,
  type NativeMediaExactAudioEvidenceResultV1,
  type NativeMediaExactAudioEvidenceV1,
} from './native-media-exact-audio-evidence-v1';
import {
  verifyNativeMediaTimestampAudioPcmWindowV1,
  type NativeMediaTimestampAudioPcmWindowProofResultV1,
  type NativeMediaTimestampAudioPcmWindowProofV1,
} from './native-media-timestamp-preview-audio-materializer-v1';
import {
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1,
} from './native-media-timestamp-preview-materializer-v1';
import {
  PROJECT_SELECTED_VIDEO_SOURCE_TIME_BINDING_KIND_V1,
  type ProjectSelectedVideoSourceTimeBindingResultV1,
} from './project-selected-video-source-time-binding-v1';
import type { ProjectRevisionV1 } from './project-service';
import {
  createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3,
  type VideoSourceTimestampConformV3,
} from './video-source-time-transform-v1';

const PROJECT_SELECTED_SOURCE_AUDIO_EVIDENCE_KIND_V1 =
  'EDITRON_PROJECT_SELECTED_SOURCE_AUDIO_EVIDENCE_V1' as const;

type SelectedSourceV1 = Pick<
  Extract<
    ProjectSelectedVideoSourceTimeBindingResultV1,
    Readonly<{ disposition: 'RESOLVED' }>
  >,
  | 'disposition'
  | 'kind'
  | 'sourceRole'
  | 'sourcePinSha256'
  | 'activeMappingStateSha256'
  | 'sourceVersionEvidenceSha256'
> & Readonly<{
  binding: Pick<
    Extract<
      ProjectSelectedVideoSourceTimeBindingResultV1,
      Readonly<{ disposition: 'RESOLVED' }>
    >['binding'],
    | 'assetId'
    | 'sourceVersionSha256'
    | 'storageVersionSha256'
    | 'sourcePtsCadenceMapStateSha256V3'
    | 'bindingSha256'
  >;
}>;

type NativeAudioBlockReasonV1 = Extract<
  NativeMediaExactAudioEvidenceResultV1,
  Readonly<{ disposition: 'UNVERIFIABLE' }>
>['reason'];

type NativePcmWindowBlockReasonV1 = Extract<
  NativeMediaTimestampAudioPcmWindowProofResultV1,
  Readonly<{ disposition: 'UNVERIFIABLE' }>
>['reason'];

type ProjectSelectedSourceAudioPcmWindowInputV1 = Readonly<{
  userId: string;
  projectRate: VideoSourceTimestampConformV3['projectRate'];
  overlayFromFrame: number;
  overlayDurationInFrames: number;
  windowLocalStartFrame: number;
  windowDurationInFrames: number;
  sourceStartFrame: string;
  sourceEndExclusiveFrame: string;
  timelineFrameQueries: readonly string[];
  expectedVisualTransformSha256: string;
}>;

type ProjectSelectedSourceAudioEvidencePortsV1 = Readonly<{
  loadSourceVersionEvidence(
    scope: MediaSourceVersionEvidenceScopeV1,
  ): Promise<unknown | null>;
  audioArtifactReader: MediaSourceAudioPrivateArtifactReaderV1;
  storedObjectReader?: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  pcmReader?: Pick<MediaSourceAudioPrivateArtifactStoreV1, 'readPcmSampleRange'>;
  createTimestampConform?:
    typeof createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3;
}>;

export type ProjectSelectedSourceAudioEvidenceResultV1 = Readonly<
  | {
      disposition: 'EXACT_AUDIO_EVIDENCE_BOUND';
      schemaVersion: 1;
      kind: typeof PROJECT_SELECTED_SOURCE_AUDIO_EVIDENCE_KIND_V1;
      projectId: string;
      sequenceId: string;
      overlayId: string;
      projectRevision: ProjectRevisionV1;
      sourceRole: 'PROXY' | 'MASTER';
      sourcePinSha256: string | null;
      activeMappingStateSha256: string | null;
      sourceVersionEvidenceSha256: string;
      sourceVersionSha256: string;
      storageVersionSha256: string;
      sourcePtsCadenceMapStateSha256V3: string;
      sourceTimeBindingSha256: string;
      sourceAudioArtifactStateSha256: string;
      sourceAudioArtifactRecordSha256: string;
      audioStreamBindingSha256: string;
      audioSampleEpochMapSha256: string;
      decodedPcmSha256: string;
      decodedSampleFrameCount: string;
      pcmWindowProofSha256: string | null;
      evidenceSha256: string;
      audioEvidence: NativeMediaExactAudioEvidenceV1;
      pcmWindowProof: NativeMediaTimestampAudioPcmWindowProofV1 | null;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'INPUT_INVALID'
        | 'SELECTED_SOURCE_CANDIDATE_REQUIRED'
        | 'SELECTED_SOURCE_CANDIDATE_AMBIGUOUS'
        | 'SOURCE_VERSION_EVIDENCE_UNAVAILABLE'
        | 'SOURCE_VERSION_EVIDENCE_REQUIRED'
        | 'SOURCE_VERSION_EVIDENCE_INVALID'
        | 'SELECTED_SOURCE_EVIDENCE_MISMATCH'
        | 'PCM_WINDOW_PORT_REQUIRED'
        | 'PCM_WINDOW_CONFORM_FAILED'
        | 'PCM_WINDOW_CONFORM_UNVERIFIABLE'
        | 'PCM_WINDOW_TRANSFORM_MISMATCH'
        | 'PCM_WINDOW_AUDIO_MAPPING_REQUIRED'
        | 'PCM_WINDOW_AUDIO_MAPPING_MISMATCH'
        | `PCM_WINDOW_${NativePcmWindowBlockReasonV1}`
        | `AUDIO_${NativeAudioBlockReasonV1}`;
      diagnostic: string | null;
    }
>;

/**
 * Binds immutable exact-audio metadata to one already-resolved project source.
 * An optional window additionally proves exact PCM bytes against the same
 * canonical transform as visual analysis. It never proves device playback.
 */
export async function resolveProjectSelectedSourceAudioEvidenceV1(input: Readonly<{
  projectId: string;
  sequenceId: string;
  overlayId: string | number;
  projectRevision: ProjectRevisionV1;
  assetId: string;
  selectedSource: SelectedSourceV1;
  sourceVersionCandidates: readonly unknown[];
  pcmWindow?: ProjectSelectedSourceAudioPcmWindowInputV1;
  ports: ProjectSelectedSourceAudioEvidencePortsV1;
}>): Promise<ProjectSelectedSourceAudioEvidenceResultV1> {
  let scope: ReturnType<typeof normalizeScope>;
  try {
    scope = normalizeScope(input);
    assertPorts(input.ports);
  } catch (error) {
    return unverifiable('INPUT_INVALID', diagnostic(error));
  }

  const candidates: Readonly<MediaSourceVersionV1>[] = [];
  for (const candidate of input.sourceVersionCandidates) {
    try {
      const source = assertMediaSourceVersionV1(candidate);
      if (source.assetId === scope.assetId
        && source.mediaKind === 'video'
        && source.sourceVersionSha256 === scope.sourceVersionSha256
        && source.storageVersion.storageVersionSha256
          === scope.storageVersionSha256) {
        candidates.push(source);
      }
    } catch {
      // Unrelated or malformed candidates cannot authorize the selected source.
    }
  }
  if (candidates.length === 0) {
    return unverifiable('SELECTED_SOURCE_CANDIDATE_REQUIRED', null);
  }
  if (candidates.length !== 1) {
    return unverifiable('SELECTED_SOURCE_CANDIDATE_AMBIGUOUS', null);
  }
  const source = candidates[0]!;

  let stored: unknown | null;
  try {
    stored = await input.ports.loadSourceVersionEvidence({
      owner: source.owner,
      assetId: source.assetId,
      sourceVersionSha256: source.sourceVersionSha256,
    });
  } catch {
    return unverifiable('SOURCE_VERSION_EVIDENCE_UNAVAILABLE', null);
  }
  if (stored === null) {
    return unverifiable('SOURCE_VERSION_EVIDENCE_REQUIRED', null);
  }

  let evidence: ReturnType<typeof assertMediaSourceVersionEvidenceRecordV1>;
  try {
    evidence = assertMediaSourceVersionEvidenceRecordV1(stored);
  } catch (error) {
    return unverifiable('SOURCE_VERSION_EVIDENCE_INVALID', diagnostic(error));
  }
  if (canonicalizeEditronJsonV1(evidence.sourceVersionV1)
      !== canonicalizeEditronJsonV1(source)
    || (scope.expectedSourceVersionEvidenceSha256 !== null
      && evidence.evidenceSha256
        !== scope.expectedSourceVersionEvidenceSha256)) {
    return unverifiable('SELECTED_SOURCE_EVIDENCE_MISMATCH', null);
  }

  const sourceAsset = mediaSourceVersionEvidenceAssetViewV1(evidence);
  let audio: Awaited<ReturnType<typeof resolveNativeMediaExactAudioEvidenceV1>>;
  try {
    audio = await resolveNativeMediaExactAudioEvidenceV1({
      asset: sourceAsset,
      required: true,
      reader: input.ports.audioArtifactReader,
    });
  } catch (error) {
    return unverifiable('SOURCE_VERSION_EVIDENCE_INVALID', diagnostic(error));
  }
  if (audio.disposition === 'UNVERIFIABLE') {
    return unverifiable(`AUDIO_${audio.reason}`, audio.diagnostic);
  }
  if (audio.disposition !== 'EXACT_AUDIO_EVIDENCE_READY') {
    return unverifiable(
      'AUDIO_AUDIO_STREAM_SELECTION_REQUIRED',
      'PROJECT_SELECTED_SOURCE_AUDIO_REQUIRED',
    );
  }
  const selected = audio.selected;
  if (selected.evidence.binding.assetId !== source.assetId
    || selected.evidence.binding.sourceVersionSha256
      !== source.sourceVersionSha256
    || selected.evidence.binding.storageVersionSha256
      !== source.storageVersion.storageVersionSha256) {
    return unverifiable('SELECTED_SOURCE_EVIDENCE_MISMATCH', null);
  }

  let pcmWindowProof: NativeMediaTimestampAudioPcmWindowProofV1 | null = null;
  if (scope.pcmWindow !== null) {
    if (typeof input.ports.storedObjectReader?.read !== 'function'
      || typeof input.ports.pcmReader?.readPcmSampleRange !== 'function') {
      return unverifiable('PCM_WINDOW_PORT_REQUIRED', null);
    }
    let conform: Awaited<ReturnType<
      typeof createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3
    >>;
    try {
      const createConform = input.ports.createTimestampConform
        ?? createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3;
      conform = await createConform({
        asset: sourceAsset,
        storedObjectReader: input.ports.storedObjectReader,
        firstFrameOrdinal: scope.pcmWindow.sourceStartFrame,
        endExclusiveFrameOrdinal: scope.pcmWindow.sourceEndExclusiveFrame,
        windowResourcePolicy:
          NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1
            .epochWindow,
        projectRate: scope.pcmWindow.projectRate,
        timelineStartFrame: String(scope.pcmWindow.overlayFromFrame),
        timelineFrameQueries: scope.pcmWindow.timelineFrameQueries,
        sourceAnchorFrameOrdinal: scope.pcmWindow.sourceStartFrame,
        resourcePolicy:
          NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1
            .conform,
        audio: {
          evidence: selected.evidence,
          endExclusiveTimelineFrame: String(
            scope.pcmWindow.overlayFromFrame
              + scope.pcmWindow.overlayDurationInFrames,
          ),
        },
      });
    } catch (error) {
      return unverifiable('PCM_WINDOW_CONFORM_FAILED', diagnostic(error));
    }
    if (conform.disposition === 'UNVERIFIABLE') {
      return unverifiable(
        'PCM_WINDOW_CONFORM_UNVERIFIABLE',
        diagnosticText(conform.reason),
      );
    }
    if (conform.transform.transformSha256
        !== scope.pcmWindow.expectedVisualTransformSha256
      || conform.transform.sourceBinding.bindingSha256
        !== scope.sourceTimeBindingSha256
      || conform.transform.sourceBinding.sourcePtsCadenceMapStateSha256V3
        !== scope.sourcePtsCadenceMapStateSha256V3) {
      return unverifiable('PCM_WINDOW_TRANSFORM_MISMATCH', null);
    }
    const mapping = conform.transform.audioMapping;
    if (mapping === null) {
      return unverifiable('PCM_WINDOW_AUDIO_MAPPING_REQUIRED', null);
    }
    if (!audioMappingMatchesSelected(mapping, selected)) {
      return unverifiable('PCM_WINDOW_AUDIO_MAPPING_MISMATCH', null);
    }
    const proof = await verifyNativeMediaTimestampAudioPcmWindowV1({
      leaseScope: {
        userId: scope.pcmWindow.userId,
        projectId: scope.projectId,
        sequenceId: scope.sequenceId,
        overlayId: scope.overlayId,
        projectRevision: scope.projectRevision,
      },
      mapping,
      projectRate: conform.transform.projectRate,
      overlayFromFrame: scope.pcmWindow.overlayFromFrame,
      windowLocalStartFrame: scope.pcmWindow.windowLocalStartFrame,
      windowDurationInFrames: scope.pcmWindow.windowDurationInFrames,
      expectedAssetId: scope.assetId,
      manifestSha256: selected.record.manifestSha256,
      manifestReference: selected.record.manifestReference,
    }, {
      pcmReader: input.ports.pcmReader,
    });
    if (proof.disposition === 'UNVERIFIABLE') {
      return unverifiable(`PCM_WINDOW_${proof.reason}`, proof.diagnostic);
    }
    pcmWindowProof = proof;
  }

  const material = {
    disposition: 'EXACT_AUDIO_EVIDENCE_BOUND' as const,
    schemaVersion: 1 as const,
    kind: PROJECT_SELECTED_SOURCE_AUDIO_EVIDENCE_KIND_V1,
    projectId: scope.projectId,
    sequenceId: scope.sequenceId,
    overlayId: scope.overlayId,
    projectRevision: scope.projectRevision,
    sourceRole: scope.sourceRole,
    sourcePinSha256: scope.sourcePinSha256,
    activeMappingStateSha256: scope.activeMappingStateSha256,
    sourceVersionEvidenceSha256: evidence.evidenceSha256,
    sourceVersionSha256: source.sourceVersionSha256,
    storageVersionSha256: source.storageVersion.storageVersionSha256,
    sourcePtsCadenceMapStateSha256V3:
      scope.sourcePtsCadenceMapStateSha256V3,
    sourceTimeBindingSha256: scope.sourceTimeBindingSha256,
    sourceAudioArtifactStateSha256: selected.assetStateSha256,
    sourceAudioArtifactRecordSha256: selected.record.recordSha256,
    audioStreamBindingSha256:
      selected.evidence.binding.audioStreamBindingSha256,
    audioSampleEpochMapSha256:
      selected.evidence.audioSampleEpochMapSha256,
    decodedPcmSha256: selected.evidence.pcm.decodedPcmSha256,
    decodedSampleFrameCount:
      selected.evidence.pcm.decodedSampleFrameCount,
    pcmWindowProofSha256: pcmWindowProof?.proofSha256 ?? null,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    evidenceSha256: hashEditronCanonicalJsonV1(material),
    audioEvidence: selected,
    pcmWindowProof,
  });
}

function normalizeScope(input: Parameters<
  typeof resolveProjectSelectedSourceAudioEvidenceV1
>[0]) {
  const selected = input.selectedSource;
  if (!selected || selected.disposition !== 'RESOLVED'
    || selected.kind !== PROJECT_SELECTED_VIDEO_SOURCE_TIME_BINDING_KIND_V1
    || (selected.sourceRole !== 'PROXY' && selected.sourceRole !== 'MASTER')
    || !selected.binding
    || !Array.isArray(input.sourceVersionCandidates)
    || input.sourceVersionCandidates.length > 4) {
    throw new Error('PROJECT_SELECTED_SOURCE_AUDIO_SELECTION_INVALID');
  }
  const assetId = analysisText(
    input.assetId, 256, 'PROJECT_SELECTED_SOURCE_AUDIO_SCOPE_INVALID',
  );
  if (selected.binding.assetId !== assetId) {
    throw new Error('PROJECT_SELECTED_SOURCE_AUDIO_ASSET_MISMATCH');
  }
  const activeMappingStateSha256 = nullableSha256(
    selected.activeMappingStateSha256,
    'PROJECT_SELECTED_SOURCE_AUDIO_ACTIVE_MAPPING_INVALID',
  );
  const expectedSourceVersionEvidenceSha256 = nullableSha256(
    selected.sourceVersionEvidenceSha256,
    'PROJECT_SELECTED_SOURCE_AUDIO_VERSION_EVIDENCE_INVALID',
  );
  if (activeMappingStateSha256 !== null
    && expectedSourceVersionEvidenceSha256 === null) {
    throw new Error('PROJECT_SELECTED_SOURCE_AUDIO_ACTIVE_EVIDENCE_REQUIRED');
  }
  const pcmWindow = normalizePcmWindow(
    input.pcmWindow,
    selected.binding,
  );
  return {
    projectId: analysisText(
      input.projectId, 256, 'PROJECT_SELECTED_SOURCE_AUDIO_SCOPE_INVALID',
    ),
    sequenceId: analysisText(
      input.sequenceId, 256, 'PROJECT_SELECTED_SOURCE_AUDIO_SCOPE_INVALID',
    ),
    overlayId: analysisText(
      String(input.overlayId), 256,
      'PROJECT_SELECTED_SOURCE_AUDIO_SCOPE_INVALID',
    ),
    projectRevision: analysisProjectRevision(input.projectRevision),
    assetId,
    sourceRole: selected.sourceRole,
    sourcePinSha256: nullableSha256(
      selected.sourcePinSha256,
      'PROJECT_SELECTED_SOURCE_AUDIO_PIN_INVALID',
    ),
    activeMappingStateSha256,
    expectedSourceVersionEvidenceSha256,
    sourceVersionSha256: analysisSha256(
      selected.binding.sourceVersionSha256,
      'PROJECT_SELECTED_SOURCE_AUDIO_SOURCE_INVALID',
    ),
    storageVersionSha256: analysisSha256(
      selected.binding.storageVersionSha256,
      'PROJECT_SELECTED_SOURCE_AUDIO_SOURCE_INVALID',
    ),
    sourcePtsCadenceMapStateSha256V3: analysisSha256(
      selected.binding.sourcePtsCadenceMapStateSha256V3,
      'PROJECT_SELECTED_SOURCE_AUDIO_SOURCE_INVALID',
    ),
    sourceTimeBindingSha256: analysisSha256(
      selected.binding.bindingSha256,
      'PROJECT_SELECTED_SOURCE_AUDIO_SOURCE_INVALID',
    ),
    pcmWindow,
  };
}

function normalizePcmWindow(
  value: ProjectSelectedSourceAudioPcmWindowInputV1 | undefined,
  binding: SelectedSourceV1['binding'],
): ProjectSelectedSourceAudioPcmWindowInputV1 | null {
  if (value === undefined) return null;
  const overlayFromFrame = safeFrame(
    value.overlayFromFrame,
    false,
    'PROJECT_SELECTED_SOURCE_AUDIO_PCM_WINDOW_INVALID',
  );
  const overlayDurationInFrames = safeFrame(
    value.overlayDurationInFrames,
    true,
    'PROJECT_SELECTED_SOURCE_AUDIO_PCM_WINDOW_INVALID',
  );
  const windowLocalStartFrame = safeFrame(
    value.windowLocalStartFrame,
    false,
    'PROJECT_SELECTED_SOURCE_AUDIO_PCM_WINDOW_INVALID',
  );
  const windowDurationInFrames = safeFrame(
    value.windowDurationInFrames,
    true,
    'PROJECT_SELECTED_SOURCE_AUDIO_PCM_WINDOW_INVALID',
  );
  if (windowLocalStartFrame + windowDurationInFrames
      > overlayDurationInFrames) {
    throw new Error('PROJECT_SELECTED_SOURCE_AUDIO_PCM_WINDOW_INVALID');
  }
  const sourceStartFrame = analysisNonNegativeIntegerText(
    value.sourceStartFrame,
    'PROJECT_SELECTED_SOURCE_AUDIO_PCM_SOURCE_RANGE_INVALID',
  );
  const sourceEndExclusiveFrame = analysisNonNegativeIntegerText(
    value.sourceEndExclusiveFrame,
    'PROJECT_SELECTED_SOURCE_AUDIO_PCM_SOURCE_RANGE_INVALID',
  );
  const totalSourceFrameCount = analysisNonNegativeIntegerText(
    (binding as { totalSourceFrameCount?: unknown }).totalSourceFrameCount,
    'PROJECT_SELECTED_SOURCE_AUDIO_PCM_SOURCE_RANGE_INVALID',
  );
  if (BigInt(sourceStartFrame) >= BigInt(sourceEndExclusiveFrame)
    || BigInt(sourceEndExclusiveFrame) > BigInt(totalSourceFrameCount)
    || BigInt(sourceEndExclusiveFrame) - BigInt(sourceStartFrame)
      > BigInt(
        NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1
          .epochWindow.maxFrameRecords,
      )) {
    throw new Error('PROJECT_SELECTED_SOURCE_AUDIO_PCM_SOURCE_RANGE_INVALID');
  }
  if (!Array.isArray(value.timelineFrameQueries)
    || value.timelineFrameQueries.length < 1
    || value.timelineFrameQueries.length
      > NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1
        .conform.maxFrameQueries) {
    throw new Error('PROJECT_SELECTED_SOURCE_AUDIO_PCM_QUERIES_INVALID');
  }
  const overlayEnd = overlayFromFrame + overlayDurationInFrames;
  if (!Number.isSafeInteger(overlayEnd)) {
    throw new Error('PROJECT_SELECTED_SOURCE_AUDIO_PCM_WINDOW_INVALID');
  }
  const timelineFrameQueries = value.timelineFrameQueries.map((query, index) => {
    const normalized = analysisNonNegativeIntegerText(
      query,
      'PROJECT_SELECTED_SOURCE_AUDIO_PCM_QUERIES_INVALID',
    );
    const frame = BigInt(normalized);
    if (frame < BigInt(overlayFromFrame) || frame >= BigInt(overlayEnd)
      || (index > 0
        && frame <= BigInt(value.timelineFrameQueries[index - 1]!))) {
      throw new Error('PROJECT_SELECTED_SOURCE_AUDIO_PCM_QUERIES_INVALID');
    }
    return normalized;
  });
  return Object.freeze({
    userId: analysisText(
      value.userId, 256, 'PROJECT_SELECTED_SOURCE_AUDIO_PCM_USER_INVALID',
    ),
    projectRate: parseExactRationalRateV1(value.projectRate),
    overlayFromFrame,
    overlayDurationInFrames,
    windowLocalStartFrame,
    windowDurationInFrames,
    sourceStartFrame,
    sourceEndExclusiveFrame,
    timelineFrameQueries: Object.freeze(timelineFrameQueries),
    expectedVisualTransformSha256: analysisSha256(
      value.expectedVisualTransformSha256,
      'PROJECT_SELECTED_SOURCE_AUDIO_PCM_TRANSFORM_INVALID',
    ),
  });
}

function audioMappingMatchesSelected(
  mapping: NonNullable<VideoSourceTimestampConformV3['audioMapping']>,
  selected: NativeMediaExactAudioEvidenceV1,
): boolean {
  return mapping.sourceVersionSha256
      === selected.evidence.binding.sourceVersionSha256
    && mapping.storageVersionSha256
      === selected.evidence.binding.storageVersionSha256
    && mapping.audioStreamBindingSha256
      === selected.evidence.binding.audioStreamBindingSha256
    && mapping.audioSampleEpochMapSha256
      === selected.evidence.audioSampleEpochMapSha256
    && mapping.decodedPcmSha256 === selected.evidence.pcm.decodedPcmSha256
    && mapping.decodedSampleFrameCount
      === selected.evidence.pcm.decodedSampleFrameCount
    && mapping.streamId === selected.evidence.binding.streamId
    && mapping.audioStreamIndex === selected.evidence.binding.audioStreamIndex
    && mapping.sampleRate === selected.evidence.binding.sampleRate
    && mapping.channelCount === selected.evidence.binding.channelCount;
}

function assertPorts(ports: ProjectSelectedSourceAudioEvidencePortsV1): void {
  if (!ports || typeof ports.loadSourceVersionEvidence !== 'function'
    || typeof ports.audioArtifactReader?.readArtifactSet !== 'function') {
    throw new Error('PROJECT_SELECTED_SOURCE_AUDIO_PORT_INVALID');
  }
}

function nullableSha256(value: unknown, code: string): string | null {
  return value === null ? null : analysisSha256(value, code);
}

function safeFrame(value: unknown, positive: boolean, code: string): number {
  if (!Number.isSafeInteger(value)
    || Number(value) < (positive ? 1 : 0)) {
    throw new Error(code);
  }
  return Number(value);
}

function diagnosticText(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z0-9_:.-]{1,240}$/.test(value)
    ? value
    : null;
}

function diagnostic(error: unknown): string | null {
  return error instanceof Error
    && /^[A-Z0-9_:.-]{1,240}$/.test(error.message)
    ? error.message
    : null;
}

function unverifiable(
  reason: Extract<
    ProjectSelectedSourceAudioEvidenceResultV1,
    Readonly<{ disposition: 'UNVERIFIABLE' }>
  >['reason'],
  diagnosticValue: string | null,
): ProjectSelectedSourceAudioEvidenceResultV1 {
  return Object.freeze({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    diagnostic: diagnosticValue,
  });
}
