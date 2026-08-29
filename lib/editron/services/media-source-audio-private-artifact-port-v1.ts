import type {
  MediaSourceAudioPrivateArtifactManifestSerializationV1,
} from './media-source-audio-private-artifact-v1';
import type {
  MediaSourceAudioSampleEpochMapSerializationV1,
} from './media-source-audio-sample-epoch-map-v1';

export type MediaSourceAudioPcmByteStreamV1 = Iterable<Uint8Array>
  | AsyncIterable<Uint8Array>;

export interface MediaSourceAudioPrivateArtifactStreamWriterV1 {
  writeArtifactSetFromPcmStream(input: Readonly<{
    mapSerialization: MediaSourceAudioSampleEpochMapSerializationV1;
    pcmBytes: MediaSourceAudioPcmByteStreamV1;
  }>): Promise<MediaSourceAudioPrivateArtifactManifestSerializationV1>;
}
