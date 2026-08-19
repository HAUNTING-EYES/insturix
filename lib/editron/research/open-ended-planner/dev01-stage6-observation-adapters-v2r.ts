import { findAudioMomentCandidates } from '@/lib/editron/agent/chat-audio-tools';
import { findTranscriptMomentCandidates } from '@/lib/editron/agent/chat-transcript-tools';

import type { Dev01NativeProxyFixtureV2 } from './dev01-native-proxy-fixture-v2';
import {
  assertDev01Stage6CausalEvidenceBindingV2R,
  dev01Stage6CausalEvidenceV2R,
} from './dev01-stage6-causal-evidence-v2r';
import type { Dev01Stage6ProjectSnapshotV2 } from './dev01-stage6-native-proxy-contract-v2';
import type { Dev01Stage6OperatorResultV2R } from './dev01-stage6-operator-adapters-v2r';
import { hashCanonicalJsonV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

const OBSERVATION_OPERATOR_IDS = new Set([
  'read_project_file',
  'get_timeline_view',
  'get_video_transcription',
  'find_transcript_moment',
  'find_audio_moment',
]);

export function isDev01Stage6ObservationOperatorV2R(operatorId: string): boolean {
  return OBSERVATION_OPERATOR_IDS.has(operatorId);
}

// Research-only read/search adapter. It observes the isolated, revision-bound
// clone and delegates semantic search to the same pure owners used by live chat.
// It neither reaches the canonical project authority nor invents a successful result.
export function executeDev01Stage6ObservationOperatorV2R(input: {
  operatorId: string;
  inputs: Readonly<JsonRecord>;
  currentProject: Dev01Stage6ProjectSnapshotV2;
  fixture: Readonly<Dev01NativeProxyFixtureV2>;
}): Dev01Stage6OperatorResultV2R {
  assertBinding(input.inputs, input.currentProject, input.fixture);
  switch (input.operatorId) {
    case 'read_project_file': return readProject(input.inputs, input.currentProject);
    case 'get_timeline_view': return readTimeline(input.inputs, input.currentProject);
    case 'get_video_transcription': return readTranscript(input.inputs, input.fixture);
    case 'find_transcript_moment': return findTranscript(input.inputs, input.fixture);
    case 'find_audio_moment': return findAudio(input.inputs, input.currentProject);
    default: throw new Error(`DEV01_STAGE6_OBSERVATION_UNSUPPORTED:${input.operatorId}`);
  }
}

function readProject(
  inputs: Readonly<JsonRecord>,
  project: Dev01Stage6ProjectSnapshotV2,
): Dev01Stage6OperatorResultV2R {
  const result = clone(project);
  return observationResult(result, {
    kind: 'PROJECT_SNAPSHOT',
    projectId: project.projectId,
    projectRevision: project.projectRevision,
    selector: clone(record(inputs.selector)),
    stateHash: hashCanonicalJsonV1(result),
  });
}

function readTimeline(
  inputs: Readonly<JsonRecord>,
  project: Dev01Stage6ProjectSnapshotV2,
): Dev01Stage6OperatorResultV2R {
  const fullRange = {
    startFrame: 0,
    endFrame: requiredInteger(project.durationInFrames, 'TIMELINE_DURATION'),
  };
  const targetRange = inputs.targetRange === undefined
    ? fullRange
    : frameRange(inputs.targetRange, 'TIMELINE_RANGE');
  const overlays = records(project.overlays)
    .filter((overlay) => intersects(overlay, targetRange))
    .map((overlay) => ({
      id: overlay.id,
      type: overlay.type,
      assetId: overlay.assetId,
      row: overlay.row,
      from: overlay.from,
      durationInFrames: overlay.durationInFrames,
    }))
    .sort((left, right) => requiredInteger(left.from, 'OVERLAY_FROM')
      - requiredInteger(right.from, 'OVERLAY_FROM'));
  const result = {
    projectId: project.projectId,
    projectRevision: project.projectRevision,
    fps: project.fps,
    durationInFrames: project.durationInFrames,
    targetRange,
    overlays,
  };
  return observationResult(result, {
    kind: 'TIMELINE_PROJECTION',
    projectRevision: project.projectRevision,
    projectionHash: hashCanonicalJsonV1(result),
  });
}

function readTranscript(
  inputs: Readonly<JsonRecord>,
  fixture: Readonly<Dev01NativeProxyFixtureV2>,
): Dev01Stage6OperatorResultV2R {
  const assetId = requiredString(inputs.assetId, 'TRANSCRIPT_ASSET');
  if (assetId !== fixture.assets.dialogueAssetId) {
    throw new Error(`DEV01_STAGE6_TRANSCRIPT_ASSET_UNBOUND:${assetId}`);
  }
  const evidence = dev01Stage6CausalEvidenceV2R(fixture);
  const words = clone([...evidence.transcriptWords]);
  return observationResult({
    assetId,
    transcript: words.map(({ word }) => word).join(' '),
    words,
  }, {
    kind: 'TRANSCRIPT_EVIDENCE',
    evidenceId: fixture.evidence.transcript.evidenceId,
    assetId,
    evidenceHash: hashCanonicalJsonV1(words),
  });
}

function findTranscript(
  inputs: Readonly<JsonRecord>,
  fixture: Readonly<Dev01NativeProxyFixtureV2>,
): Dev01Stage6OperatorResultV2R {
  const query = requiredString(inputs.query, 'TRANSCRIPT_QUERY');
  const evidence = dev01Stage6CausalEvidenceV2R(fixture);
  const candidates = findTranscriptMomentCandidates([...evidence.transcriptWords], query);
  const bounded = filterRange(candidates, inputs.targetRange);
  const selected = bounded[0];
  if (!selected?.safeForAutoEdit) {
    throw new Error(`DEV01_STAGE6_TRANSCRIPT_SEARCH_UNRESOLVED:${selected ? 'AMBIGUOUS' : 'NO_MATCH'}`);
  }
  return observationResult({ query, candidates: bounded, selected }, selected);
}

function findAudio(
  inputs: Readonly<JsonRecord>,
  project: Dev01Stage6ProjectSnapshotV2,
): Dev01Stage6OperatorResultV2R {
  const query = requiredString(inputs.query, 'AUDIO_QUERY');
  const candidates = findAudioMomentCandidates(withSearchableAudioRoles(project), query);
  const allowedAssetIds = new Set(strings(inputs.assetIds));
  const assetBound = allowedAssetIds.size
    ? candidates.filter(({ source }) => source.assetId && allowedAssetIds.has(source.assetId))
    : candidates;
  const bounded = filterRange(assetBound, inputs.targetRange);
  const selected = bounded[0];
  if (!selected?.safeForAutoEdit) {
    throw new Error(`DEV01_STAGE6_AUDIO_SEARCH_UNRESOLVED:${selected ? 'AMBIGUOUS' : 'NO_MATCH'}`);
  }
  return observationResult({ query, candidates: bounded, selected }, selected);
}

function withSearchableAudioRoles(project: Dev01Stage6ProjectSnapshotV2): Dev01Stage6ProjectSnapshotV2 {
  const overlays = records(project.overlays).map((overlay) => {
    const metadata = record(overlay.metadata);
    const role = metadata.role;
    const derivedTitle = role === 'background-music'
      ? 'background music BGM'
      : role === 'dialogue'
        ? 'dialogue speech'
        : undefined;
    return derivedTitle
      ? { ...overlay, metadata: { ...metadata, title: metadata.title ?? derivedTitle } }
      : overlay;
  });
  return clone({ ...project, overlays });
}

function observationResult(result: unknown, evidence: unknown): Dev01Stage6OperatorResultV2R {
  return { outputs: { result: clone(result), evidence: clone(evidence) }, changedPaths: [] };
}

function assertBinding(
  inputs: Readonly<JsonRecord>,
  project: Dev01Stage6ProjectSnapshotV2,
  fixture: Readonly<Dev01NativeProxyFixtureV2>,
): void {
  assertDev01Stage6CausalEvidenceBindingV2R(fixture);
  if (project.projectId !== fixture.project.projectId
    || project.projectRevision !== fixture.project.projectRevision) {
    throw new Error('DEV01_STAGE6_OBSERVATION_PROJECT_SNAPSHOT_DRIFT');
  }
  if (inputs.projectId !== undefined && inputs.projectId !== fixture.project.projectId) {
    throw new Error('DEV01_STAGE6_PROJECT_ID_DRIFT');
  }
  if (inputs.expectedProjectRevision !== undefined
    && inputs.expectedProjectRevision !== fixture.project.projectRevision) {
    throw new Error('DEV01_STAGE6_PROJECT_REVISION_DRIFT');
  }
}

function filterRange<T extends { startFrame: number; endFrame: number }>(
  candidates: T[],
  rawRange: unknown,
): T[] {
  if (rawRange === undefined) return candidates;
  const range = frameRange(rawRange, 'SEARCH_RANGE');
  return candidates.filter((candidate) => candidate.startFrame < range.endFrame
    && candidate.endFrame > range.startFrame);
}

function intersects(overlay: JsonRecord, range: { startFrame: number; endFrame: number }): boolean {
  const startFrame = requiredInteger(overlay.from, 'OVERLAY_FROM');
  const endFrame = startFrame + requiredInteger(overlay.durationInFrames, 'OVERLAY_DURATION');
  return startFrame < range.endFrame && endFrame > range.startFrame;
}

function frameRange(value: unknown, code: string): { startFrame: number; endFrame: number } {
  const range = record(value);
  const startFrame = requiredInteger(range.startFrame, `${code}_START`);
  const endFrame = requiredInteger(range.endFrame, `${code}_END`);
  if (startFrame < 0 || endFrame <= startFrame) throw new Error(`DEV01_STAGE6_${code}_INVALID`);
  return { startFrame, endFrame };
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`DEV01_STAGE6_${code}_INVALID`);
  return value;
}
function requiredInteger(value: unknown, code: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`DEV01_STAGE6_${code}_INVALID`);
  return value;
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
