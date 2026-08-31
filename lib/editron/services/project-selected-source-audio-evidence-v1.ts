import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type { MediaSourceAudioPrivateArtifactReaderV1 }
  from './media-source-audio-private-artifact-port-v1';
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
  PROJECT_SELECTED_VIDEO_SOURCE_TIME_BINDING_KIND_V1,
  type ProjectSelectedVideoSourceTimeBindingResultV1,
} from './project-selected-video-source-time-binding-v1';
import type { ProjectRevisionV1 } from './project-service';

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

type ProjectSelectedSourceAudioEvidencePortsV1 = Readonly<{
  loadSourceVersionEvidence(
    scope: MediaSourceVersionEvidenceScopeV1,
  ): Promise<unknown | null>;
  audioArtifactReader: MediaSourceAudioPrivateArtifactReaderV1;
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
      evidenceSha256: string;
      audioEvidence: NativeMediaExactAudioEvidenceV1;
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
        | `AUDIO_${NativeAudioBlockReasonV1}`;
      diagnostic: string | null;
    }
>;

/**
 * Binds immutable exact-audio metadata to one already-resolved project source.
 * It proves the private manifest and sample map, not audible device playback.
 */
export async function resolveProjectSelectedSourceAudioEvidenceV1(input: Readonly<{
  projectId: string;
  sequenceId: string;
  overlayId: string | number;
  projectRevision: ProjectRevisionV1;
  assetId: string;
  selectedSource: SelectedSourceV1;
  sourceVersionCandidates: readonly unknown[];
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

  let audio: Awaited<ReturnType<typeof resolveNativeMediaExactAudioEvidenceV1>>;
  try {
    audio = await resolveNativeMediaExactAudioEvidenceV1({
      asset: mediaSourceVersionEvidenceAssetViewV1(evidence),
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
  };
  return deepFreezeEditronJsonV1({
    ...material,
    evidenceSha256: hashEditronCanonicalJsonV1(material),
    audioEvidence: selected,
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
  };
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
