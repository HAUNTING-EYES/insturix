import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';

/**
 * Remote, read-only technical probe for a stored source asset.
 *
 * This is deliberately an observation adapter. It does not issue a canonical
 * source identity, digest, PTS map, proxy mapping, ProjectService receipt, or
 * operation permission. Those require separate storage and project owners.
 */
export const MEDIA_SOURCE_PROBE_VERSION_V1 = 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const;

export type MediaSourceProbeDispositionV1 =
  | 'MEASURED'
  | 'UNVERIFIABLE';

export type MediaRationalV1 = {
  numerator: string;
  denominator: string;
};

export type MediaSourceVideoStreamObservationV1 = {
  streamIndex: number;
  codec: string | null;
  codedWidth: number | null;
  codedHeight: number | null;
  pixelFormat: string | null;
  sourceTimebase: MediaRationalV1 | null;
  averageFrameRate: MediaRationalV1 | null;
  realFrameRate: MediaRationalV1 | null;
  frameCount: string | null;
  colorSpace: string | null;
  colorTransfer: string | null;
  colorPrimaries: string | null;
  colorRange: string | null;
  timecode: string | null;
  reelId: string | null;
};

export type MediaSourceAudioStreamObservationV1 = {
  streamIndex: number;
  codec: string | null;
  sampleRate: string | null;
  channelCount: number | null;
  channelLayout: string | null;
  sourceTimebase: MediaRationalV1 | null;
};

export type MediaSourceTechnicalObservationV1 = {
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PROBE_VERSION_V1;
  probeVersion: string;
  formatName: string | null;
  durationMilliseconds: number | null;
  startTimeMilliseconds: number | null;
  videoStreams: readonly MediaSourceVideoStreamObservationV1[];
  audioStreams: readonly MediaSourceAudioStreamObservationV1[];
  observationSha256: string;
};

export type MediaSourceProbeDiagnosticV1 =
  | 'MEDIA_SOURCE_PROBE_NOT_CONFIGURED'
  | 'MEDIA_SOURCE_PROBE_HTTP_FAILURE'
  | 'MEDIA_SOURCE_PROBE_REQUEST_FAILED'
  | 'MEDIA_SOURCE_PROBE_RESPONSE_INVALID'
  | 'MEDIA_SOURCE_PROBE_NO_USABLE_STREAMS'
  | 'MEDIA_SOURCE_STORAGE_UNAVAILABLE'
  | 'MEDIA_SOURCE_SIGNED_URL_UNAVAILABLE';

export type MediaSourceProbeResultV1 =
  | {
      disposition: 'MEASURED';
      observation: MediaSourceTechnicalObservationV1;
      diagnostics: readonly [];
    }
  | {
      disposition: 'UNVERIFIABLE';
      observation: null;
      diagnostics: readonly [MediaSourceProbeDiagnosticV1];
    };

export type MediaSourceProbeEnvironmentV1 = Readonly<Record<string, string | undefined>>;

export type MediaSourceProbeDependenciesV1 = {
  fetchImpl?: typeof fetch;
  environment?: MediaSourceProbeEnvironmentV1;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 120_000;

/** The probe route is available only with both Modal credentials and its deployed endpoint. */
export function isMediaSourceProbeConfiguredV1(
  environment: MediaSourceProbeEnvironmentV1 = process.env,
): boolean {
  return Boolean(
    configured(environment.EDITRON_MEDIA_SOURCE_PROBE_ENDPOINT)
    && configured(environment.MODAL_TOKEN_ID)
    && configured(environment.MODAL_TOKEN_SECRET),
  );
}

/**
 * Calls the deployed probe with a short-lived, server-generated storage URL.
 * The URL is intentionally absent from every return value so callers cannot
 * accidentally persist a presigned credential as media identity.
 */
export async function probeMediaSourceV1(
  sourceUrl: string,
  dependencies: MediaSourceProbeDependenciesV1 = {},
): Promise<MediaSourceProbeResultV1> {
  const environment = dependencies.environment ?? process.env;
  const endpoint = configured(environment.EDITRON_MEDIA_SOURCE_PROBE_ENDPOINT);
  const tokenId = configured(environment.MODAL_TOKEN_ID);
  const tokenSecret = configured(environment.MODAL_TOKEN_SECRET);
  if (!endpoint || !tokenId || !tokenSecret) {
    return unverifiableMediaSourceProbeResultV1('MEDIA_SOURCE_PROBE_NOT_CONFIGURED');
  }

  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Token ${tokenId}:${tokenSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source_url: sourceUrl }),
      signal: AbortSignal.timeout(dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch {
    return unverifiableMediaSourceProbeResultV1('MEDIA_SOURCE_PROBE_REQUEST_FAILED');
  }

  if (!response.ok) return unverifiableMediaSourceProbeResultV1('MEDIA_SOURCE_PROBE_HTTP_FAILURE');

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return unverifiableMediaSourceProbeResultV1('MEDIA_SOURCE_PROBE_RESPONSE_INVALID');
  }

  const observation = parseMediaSourceProbeResponseV1(payload);
  if (!observation) return unverifiableMediaSourceProbeResultV1('MEDIA_SOURCE_PROBE_RESPONSE_INVALID');
  if (observation.videoStreams.length === 0 && observation.audioStreams.length === 0) {
    return unverifiableMediaSourceProbeResultV1('MEDIA_SOURCE_PROBE_NO_USABLE_STREAMS');
  }

  return { disposition: 'MEASURED', observation, diagnostics: [] };
}

/** Parses only the declared, bounded response format from the remote probe. */
export function parseMediaSourceProbeResponseV1(
  payload: unknown,
): MediaSourceTechnicalObservationV1 | null {
  const record = asRecord(payload);
  if (!record || record.ok !== true) return null;
  const probeVersion = stringValue(record.probe_version);
  const format = asRecord(record.format);
  const streams = Array.isArray(record.streams) ? record.streams : null;
  if (!probeVersion || !format || !streams) return null;

  const videoStreams = streams
    .map(asRecord)
    .filter((stream): stream is Record<string, unknown> => stream?.codec_type === 'video')
    .map(parseVideoStream)
    .filter((stream): stream is MediaSourceVideoStreamObservationV1 => stream !== null);
  const audioStreams = streams
    .map(asRecord)
    .filter((stream): stream is Record<string, unknown> => stream?.codec_type === 'audio')
    .map(parseAudioStream)
    .filter((stream): stream is MediaSourceAudioStreamObservationV1 => stream !== null);

  const unsigned = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PROBE_VERSION_V1,
    probeVersion,
    formatName: nullableString(format.format_name),
    durationMilliseconds: secondsToMilliseconds(format.duration),
    startTimeMilliseconds: secondsToMilliseconds(format.start_time),
    videoStreams,
    audioStreams,
  };

  return {
    ...unsigned,
    observationSha256: hashEditronCanonicalJsonV1(unsigned),
  };
}

function parseVideoStream(stream: Record<string, unknown>): MediaSourceVideoStreamObservationV1 | null {
  const streamIndex = safeNonNegativeInteger(stream.index);
  if (streamIndex === null) return null;
  const tags = asRecord(stream.tags);
  return {
    streamIndex,
    codec: nullableString(stream.codec_name),
    codedWidth: safePositiveInteger(stream.width),
    codedHeight: safePositiveInteger(stream.height),
    pixelFormat: nullableString(stream.pix_fmt),
    sourceTimebase: parseRational(stream.time_base),
    averageFrameRate: parseRational(stream.avg_frame_rate),
    realFrameRate: parseRational(stream.r_frame_rate),
    frameCount: nonNegativeIntegerText(stream.nb_frames),
    colorSpace: nullableString(stream.color_space),
    colorTransfer: nullableString(stream.color_transfer),
    colorPrimaries: nullableString(stream.color_primaries),
    colorRange: nullableString(stream.color_range),
    timecode: nullableString(tags?.timecode),
    reelId: nullableString(tags?.reel_name) ?? nullableString(tags?.reel),
  };
}

function parseAudioStream(stream: Record<string, unknown>): MediaSourceAudioStreamObservationV1 | null {
  const streamIndex = safeNonNegativeInteger(stream.index);
  if (streamIndex === null) return null;
  return {
    streamIndex,
    codec: nullableString(stream.codec_name),
    sampleRate: positiveIntegerText(stream.sample_rate),
    channelCount: safePositiveInteger(stream.channels),
    channelLayout: nullableString(stream.channel_layout),
    sourceTimebase: parseRational(stream.time_base),
  };
}

function parseRational(value: unknown): MediaRationalV1 | null {
  if (typeof value !== 'string') return null;
  const match = /^(0|[1-9]\d*)\/([1-9]\d*)$/.exec(value.trim());
  if (!match) return null;
  return { numerator: match[1], denominator: match[2] };
}

function secondsToMilliseconds(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 7 * 24 * 60 * 60) return null;
  return Math.round(numeric * 1000);
}

function safeNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function positiveIntegerText(value: unknown): string | null {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value.trim()) ? value.trim() : null;
}

function nonNegativeIntegerText(value: unknown): string | null {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value.trim()) ? value.trim() : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 256) : null;
}

function stringValue(value: unknown): string | null {
  return nullableString(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function configured(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function unverifiableMediaSourceProbeResultV1(
  diagnostic: MediaSourceProbeDiagnosticV1,
): MediaSourceProbeResultV1 {
  return { disposition: 'UNVERIFIABLE', observation: null, diagnostics: [diagnostic] };
}
