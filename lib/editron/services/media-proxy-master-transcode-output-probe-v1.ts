import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_V1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_ADAPTER_V1 =
  'editron-media-proxy-master-local-ffprobe-v1' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,127}$/;
const SIGNED_INTEGER = /^-?(0|[1-9][0-9]{0,127})$/;
const FORMAT_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MAX_AUDIO_STREAMS = 64;

export type MediaProxyMasterTranscodeOutputProbeRationalV1 = Readonly<{
  numerator: string;
  denominator: string;
}>;

export type MediaProxyMasterTranscodeOutputProbeVideoV1 = Readonly<{
  streamIndex: 0;
  codec: 'h264';
  pixelFormat: 'yuv420p';
  codedWidth: number;
  codedHeight: number;
  sourceTimebase: MediaProxyMasterTranscodeOutputProbeRationalV1;
  sourceStartPts: string;
  sourceDurationTicks: string;
  frameCount: string;
}>;

export type MediaProxyMasterTranscodeOutputProbeAudioV1 = Readonly<{
  streamIndex: number;
  codec: 'aac';
  sampleRate: string;
  channelCount: number;
  channelLayout: string;
  sourceTimebase: MediaProxyMasterTranscodeOutputProbeRationalV1;
  sourceStartPts: string;
  sourceDurationTicks: string;
}>;

export type MediaProxyMasterTranscodeOutputProbeV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_KIND_V1;
  adapterVersion: typeof MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_ADAPTER_V1;
  commandSha256: string;
  ffprobeVersion: string;
  proxyContentSha256: string;
  proxyByteLength: number;
  container: 'mp4';
  formatNames: readonly string[];
  video: MediaProxyMasterTranscodeOutputProbeVideoV1;
  audio: readonly MediaProxyMasterTranscodeOutputProbeAudioV1[];
  probedAt: string;
  probeSha256: string;
}>;

type CreateInputV1 = Omit<
  MediaProxyMasterTranscodeOutputProbeV1,
  'schemaVersion' | 'kind' | 'adapterVersion' | 'probeSha256'
>;

export function createMediaProxyMasterTranscodeOutputProbeV1(
  input: CreateInputV1,
): MediaProxyMasterTranscodeOutputProbeV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_KIND_V1,
    adapterVersion: MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_ADAPTER_V1,
    commandSha256: sha256(
      input.commandSha256,
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_COMMAND_INVALID',
    ),
    ffprobeVersion: boundedText(
      input.ffprobeVersion,
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VERSION_INVALID',
    ),
    proxyContentSha256: sha256(
      input.proxyContentSha256,
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_CONTENT_INVALID',
    ),
    proxyByteLength: positiveSafeInteger(
      input.proxyByteLength,
      Number.MAX_SAFE_INTEGER,
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_BYTES_INVALID',
    ),
    container: exact(
      input.container,
      'mp4',
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_CONTAINER_INVALID',
    ),
    formatNames: normalizeFormatNames(input.formatNames),
    video: normalizeVideo(input.video),
    audio: normalizeAudio(input.audio),
    probedAt: isoInstant(
      input.probedAt,
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_TIME_INVALID',
    ),
  };
  return frozen({ ...material, probeSha256: hashEditronCanonicalJsonV1(material) });
}

export function assertMediaProxyMasterTranscodeOutputProbeV1(
  value: unknown,
): MediaProxyMasterTranscodeOutputProbeV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'adapterVersion', 'commandSha256', 'ffprobeVersion',
    'proxyContentSha256', 'proxyByteLength', 'container', 'formatNames', 'video',
    'audio', 'probedAt', 'probeSha256',
  ], 'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_KIND_V1
    || record.adapterVersion !== MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_ADAPTER_V1) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_IDENTITY_INVALID');
  }
  const rebuilt = createMediaProxyMasterTranscodeOutputProbeV1(
    record as unknown as CreateInputV1,
  );
  if (canonicalizeEditronJsonV1(record) !== canonicalizeEditronJsonV1(rebuilt)
    || sha256(
      record.probeSha256,
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_HASH_INVALID',
    ) !== rebuilt.probeSha256) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_HASH_MISMATCH');
  }
  return rebuilt;
}

function normalizeFormatNames(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_FORMATS_INVALID');
  }
  const names = value.map((entry) => {
    if (typeof entry !== 'string' || !FORMAT_NAME.test(entry)) {
      fail('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_FORMAT_INVALID');
    }
    return entry;
  });
  if (new Set(names).size !== names.length || !names.includes('mp4')) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_FORMATS_INVALID');
  }
  return frozen([...names].sort());
}

function normalizeVideo(value: unknown): MediaProxyMasterTranscodeOutputProbeVideoV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_INVALID');
  exactKeys(record, [
    'streamIndex', 'codec', 'pixelFormat', 'codedWidth', 'codedHeight',
    'sourceTimebase', 'sourceStartPts', 'sourceDurationTicks', 'frameCount',
  ], 'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_FIELDS_INVALID');
  const codedWidth = evenDimension(
    record.codedWidth,
    'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_WIDTH_INVALID',
  );
  const codedHeight = evenDimension(
    record.codedHeight,
    'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_HEIGHT_INVALID',
  );
  return frozen({
    streamIndex: exact(
      record.streamIndex,
      0,
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_STREAM_INVALID',
    ),
    codec: exact(
      record.codec,
      'h264',
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_CODEC_INVALID',
    ),
    pixelFormat: exact(
      record.pixelFormat,
      'yuv420p',
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_PIXEL_FORMAT_INVALID',
    ),
    codedWidth,
    codedHeight,
    sourceTimebase: rational(record.sourceTimebase),
    sourceStartPts: signedIntegerText(
      record.sourceStartPts,
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_START_INVALID',
    ),
    sourceDurationTicks: positiveIntegerText(
      record.sourceDurationTicks,
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_DURATION_INVALID',
    ),
    frameCount: positiveIntegerText(
      record.frameCount,
      'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_VIDEO_FRAMES_INVALID',
    ),
  });
}

function normalizeAudio(value: unknown): readonly MediaProxyMasterTranscodeOutputProbeAudioV1[] {
  if (!Array.isArray(value) || value.length > MAX_AUDIO_STREAMS) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_INVALID');
  }
  return frozen(value.map((entry, sequence) => {
    const record = object(entry, 'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_STREAM_INVALID');
    exactKeys(record, [
      'streamIndex', 'codec', 'sampleRate', 'channelCount', 'channelLayout',
      'sourceTimebase', 'sourceStartPts', 'sourceDurationTicks',
    ], 'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_FIELDS_INVALID');
    return frozen({
      streamIndex: exact(
        record.streamIndex,
        sequence + 1,
        'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_STREAM_INVALID',
      ),
      codec: exact(
        record.codec,
        'aac',
        'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_CODEC_INVALID',
      ),
      sampleRate: positiveIntegerText(
        record.sampleRate,
        'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_RATE_INVALID',
      ),
      channelCount: positiveSafeInteger(
        record.channelCount,
        64,
        'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_CHANNELS_INVALID',
      ),
      channelLayout: boundedText(
        record.channelLayout,
        'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_LAYOUT_INVALID',
      ),
      sourceTimebase: rational(record.sourceTimebase),
      sourceStartPts: signedIntegerText(
        record.sourceStartPts,
        'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_START_INVALID',
      ),
      sourceDurationTicks: positiveIntegerText(
        record.sourceDurationTicks,
        'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_AUDIO_DURATION_INVALID',
      ),
    });
  }));
}

function rational(value: unknown): MediaProxyMasterTranscodeOutputProbeRationalV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_TIMEBASE_INVALID');
  exactKeys(record, ['numerator', 'denominator'], 'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_TIMEBASE_FIELDS_INVALID');
  const numerator = BigInt(positiveIntegerText(
    record.numerator,
    'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_TIMEBASE_INVALID',
  ));
  const denominator = BigInt(positiveIntegerText(
    record.denominator,
    'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_PROBE_TIMEBASE_INVALID',
  ));
  const divisor = greatestCommonDivisor(numerator, denominator);
  return frozen({
    numerator: (numerator / divisor).toString(),
    denominator: (denominator / divisor).toString(),
  });
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a;
}

function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(error);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], error: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) fail(error);
}

function exact<const T>(value: unknown, expected: T, error: string): T {
  if (value !== expected) fail(error);
  return expected;
}

function positiveSafeInteger(value: unknown, maximum: number, error: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) fail(error);
  return Number(value);
}

function evenDimension(value: unknown, error: string): number {
  const dimension = positiveSafeInteger(value, 16_384, error);
  if (dimension % 2 !== 0) fail(error);
  return dimension;
}

function positiveIntegerText(value: unknown, error: string): string {
  if (typeof value !== 'string' || !POSITIVE_INTEGER.test(value)) fail(error);
  return value;
}

function signedIntegerText(value: unknown, error: string): string {
  if (typeof value !== 'string' || !SIGNED_INTEGER.test(value)) fail(error);
  return BigInt(value).toString();
}

function boundedText(value: unknown, error: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1
    || value.length > 256 || /[\u0000-\u001F\u007F]/.test(value)) fail(error);
  return value;
}

function sha256(value: unknown, error: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(error);
  return value;
}

function isoInstant(value: unknown, error: string): string {
  if (typeof value !== 'string' || value.length > 128 || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(error);
  return value;
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(message: string): never {
  throw new Error(message);
}
