import { ALL_FORMATS, Input, UrlSource } from 'mediabunny';

const DEFAULT_AUDIO_TRACK_INSPECTION_TIMEOUT_MS = 12_000;
const MAX_URL_SOURCE_RETRIES = 2;

export type MediaAudioTrackInspection =
  | {
      status: 'present';
      audioTrackCount: number;
      reason: null;
    }
  | {
      status: 'absent';
      audioTrackCount: 0;
      reason: null;
    }
  | {
      status: 'unknown';
      audioTrackCount: null;
      reason: string;
    };

export type InspectMediaAudioTrack = (
  url: string,
) => Promise<MediaAudioTrackInspection>;

export async function inspectMediaAudioTrack(
  url: string,
  options: {
    timeoutMs?: number;
    fetchFn?: typeof fetch;
  } = {},
): Promise<MediaAudioTrackInspection> {
  const normalizedUrl = normalizeRemoteMediaUrl(url);
  if (!normalizedUrl) {
    return {
      status: 'unknown',
      audioTrackCount: null,
      reason: 'invalid_or_unsupported_media_url',
    };
  }

  const timeoutMs = Math.max(
    1_000,
    Math.min(30_000, Math.round(options.timeoutMs ?? DEFAULT_AUDIO_TRACK_INSPECTION_TIMEOUT_MS)),
  );
  const source = new UrlSource(normalizedUrl, {
    fetchFn: options.fetchFn,
    maxCacheSize: 8 * 1024 * 1024,
    getRetryDelay: (previousAttempts) =>
      previousAttempts < MAX_URL_SOURCE_RETRIES
        ? 0.2 * (previousAttempts + 1)
        : null,
  });
  const input = new Input({
    formats: ALL_FORMATS,
    source,
  });

  try {
    const tracks = await withTimeout(
      input.getAudioTracks(),
      timeoutMs,
      'media_audio_track_inspection_timeout',
    );
    return tracks.length > 0
      ? {
          status: 'present',
          audioTrackCount: tracks.length,
          reason: null,
        }
      : {
          status: 'absent',
          audioTrackCount: 0,
          reason: null,
        };
  } catch (error: unknown) {
    return {
      status: 'unknown',
      audioTrackCount: null,
      reason: boundedReason(error),
    };
  } finally {
    input.dispose();
  }
}

function normalizeRemoteMediaUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutReason: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(timeoutReason)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function boundedReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || 'media_audio_track_inspection_failed').slice(0, 240);
}
