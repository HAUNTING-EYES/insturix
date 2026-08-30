import {
  readMediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
  type MediaSourceAudioArtifactAssetStorePortsV1,
} from './media-source-audio-artifact-asset-owner-v1';
import { readNativeMediaExactAudioStreamIndexesV1 }
  from './native-media-exact-audio-evidence-v1';
import {
  captureMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from './media-source-version-evidence-owner-v1';
import {
  retainMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceRetentionResultV1,
} from './media-source-version-evidence-retention-v1';

export type MediaSourceAudioVersionEvidenceFailureReasonV1 =
  | 'SOURCE_VERSION_AUDIO_TERMINAL_SET_INVALID'
  | 'SOURCE_VERSION_AUDIO_ACTIVE_ASSET_LOAD_FAILED'
  | 'SOURCE_VERSION_EVIDENCE_CANDIDATE_INVALID'
  | 'SOURCE_VERSION_EVIDENCE_CURRENT_STATE_INVALID'
  | 'SOURCE_VERSION_EVIDENCE_CONFLICT'
  | 'SOURCE_VERSION_EVIDENCE_RACE_EXHAUSTED'
  | 'SOURCE_VERSION_EVIDENCE_STORE_LOAD_FAILED'
  | 'SOURCE_VERSION_EVIDENCE_STORE_CAS_FAILED';

/**
 * Retains an immutable audio root only on the write that completes the exact
 * observed stream set. Partial append-only sets remain active but nonterminal.
 */
export function createMediaSourceAudioVersionEvidenceStorePortsV1(
  input: Readonly<{
    assetStorePorts: MediaSourceAudioArtifactAssetStorePortsV1;
    evidenceStorePorts: MediaSourceVersionEvidenceStorePortsV1;
  }>,
): MediaSourceAudioArtifactAssetStorePortsV1 {
  if (!input.assetStorePorts
    || typeof input.assetStorePorts.load !== 'function'
    || typeof input.assetStorePorts.replace !== 'function'
    || !input.evidenceStorePorts
    || typeof input.evidenceStorePorts.load !== 'function'
    || typeof input.evidenceStorePorts.compareAndSet !== 'function') {
    throw failure('SOURCE_VERSION_AUDIO_TERMINAL_SET_INVALID', false);
  }
  return Object.freeze({
    load: input.assetStorePorts.load,
    replace: async (replaceInput) => {
      let asset: MediaSourceAudioArtifactAssetStateInputV1 | null;
      try {
        asset = await input.assetStorePorts.load(
          replaceInput.assetId,
          replaceInput.userId,
        );
      } catch {
        throw failure('SOURCE_VERSION_AUDIO_ACTIVE_ASSET_LOAD_FAILED', true);
      }
      if (asset === null) return false;
      const terminal = terminalAudioEvidenceCandidate({
        asset,
        assetId: replaceInput.assetId,
        nextState: replaceInput.nextState,
      });
      if (terminal !== null) {
        const retained = await retainMediaSourceVersionEvidenceV1(
          terminal,
          input.evidenceStorePorts,
        );
        if (retained.disposition === 'REJECTED') {
          throw failure(retentionFailureReason(retained.reason), retained.retryable);
        }
      }
      return input.assetStorePorts.replace(replaceInput);
    },
  });
}

function terminalAudioEvidenceCandidate(input: Readonly<{
  asset: MediaSourceAudioArtifactAssetStateInputV1;
  assetId: string;
  nextState: Parameters<MediaSourceAudioArtifactAssetStorePortsV1['replace']>[0]['nextState'];
}>) {
  try {
    if (input.asset.assetId !== input.assetId) {
      throw new Error('SOURCE_VERSION_AUDIO_ASSET_SCOPE_MISMATCH');
    }
    const view: MediaSourceAudioArtifactAssetStateInputV1 = {
      ...input.asset,
      ...input.nextState,
    };
    const state = readMediaSourceAudioArtifactAssetStateV1(view);
    const observed = readNativeMediaExactAudioStreamIndexesV1(view);
    if (state === null || observed === null || observed.length === 0) {
      throw new Error('SOURCE_VERSION_AUDIO_STREAM_SET_INVALID');
    }
    const recorded = state.sourceAudioArtifactsV1.records.map(
      ({ audioStreamIndex }) => audioStreamIndex,
    );
    if (recorded.some((streamIndex) => !observed.includes(streamIndex))) {
      throw new Error('SOURCE_VERSION_AUDIO_STREAM_SET_INVALID');
    }
    if (recorded.length !== observed.length
      || recorded.some((streamIndex, index) => streamIndex !== observed[index])) {
      return null;
    }
    return captureMediaSourceVersionEvidenceV1(view);
  } catch {
    throw failure('SOURCE_VERSION_AUDIO_TERMINAL_SET_INVALID', false);
  }
}

function retentionFailureReason(
  reason: Extract<
    MediaSourceVersionEvidenceRetentionResultV1,
    { disposition: 'REJECTED' }
  >['reason'],
): MediaSourceAudioVersionEvidenceFailureReasonV1 {
  switch (reason) {
    case 'CANDIDATE_INVALID':
      return 'SOURCE_VERSION_EVIDENCE_CANDIDATE_INVALID';
    case 'CURRENT_STATE_INVALID':
      return 'SOURCE_VERSION_EVIDENCE_CURRENT_STATE_INVALID';
    case 'CONFLICTING_EVIDENCE':
      return 'SOURCE_VERSION_EVIDENCE_CONFLICT';
    case 'RACE_EXHAUSTED':
      return 'SOURCE_VERSION_EVIDENCE_RACE_EXHAUSTED';
    case 'STORE_LOAD_FAILED':
      return 'SOURCE_VERSION_EVIDENCE_STORE_LOAD_FAILED';
    case 'STORE_CAS_FAILED':
      return 'SOURCE_VERSION_EVIDENCE_STORE_CAS_FAILED';
  }
}

function failure(
  reason: MediaSourceAudioVersionEvidenceFailureReasonV1,
  retryable: boolean,
): MediaSourceAudioVersionEvidenceErrorV1 {
  return new MediaSourceAudioVersionEvidenceErrorV1(reason, retryable);
}

export class MediaSourceAudioVersionEvidenceErrorV1 extends Error {
  constructor(
    public readonly reason: MediaSourceAudioVersionEvidenceFailureReasonV1,
    public readonly retryable: boolean,
  ) {
    super(reason);
    this.name = 'MediaSourceAudioVersionEvidenceErrorV1';
  }
}
