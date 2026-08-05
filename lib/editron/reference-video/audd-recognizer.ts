/**
 * R3: AudD audio-recognition client (approved recognition provider).
 *
 * Posts demuxed audio bytes to AudD's recognize endpoint and maps the response
 * to the provider-agnostic RecognizedTrack shape used by soundtrack-identity.
 *
 * Env-gated: activates only when AUDD_API_TOKEN is set. When absent, available()
 * is false and the recognizer function returns null — the caller keeps
 * soundClass 'unknown' (never a fabricated identity), matching the pattern used
 * by analyzeMusicContent for Modal credentials.
 *
 * Returns null on "no match" AND on config-missing. Throws only on a genuine
 * upstream/transport failure (the orchestrator turns that into a warning).
 * The provider receipt is preserved verbatim for the R3 provider-receipt mandate.
 * Never downloads the song — recognition response carries identity only.
 */

const AUDD_ENDPOINT = 'https://api.audd.io/';
const AUDD_TIMEOUT_MS = 30_000;

export interface AuddRecognizerOptions {
  apiToken?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function isAuddConfigured(): boolean {
  const token = process.env.AUDD_API_TOKEN?.trim();
  return Boolean(token);
}

export function createAuddRecognizer(options: AuddRecognizerOptions = {}) {
  const apiToken = options.apiToken ?? process.env.AUDD_API_TOKEN?.trim() ?? '';
  const endpoint = options.endpoint ?? AUDD_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? AUDD_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  return async function recognizeAudio(
    audioBytes: Uint8Array,
  ): Promise<{
    recordingId: string;
    title: string;
    artists: string[];
    isrcs?: string[];
    durationMs?: number | null;
    confidence: number;
    cueOffsetMs?: number | null;
    providerName: string;
    providerReceipt: string;
    raw?: unknown;
  } | null> {
    if (!apiToken) {
      // Not configured — do not guess an identity.
      return null;
    }

    const form = new FormData();
    form.append('audio', new Blob([audioBytes as BlobPart], { type: 'audio/mpeg' }), 'reference.m4a');
    form.append('api_token', apiToken);
    form.append('return', 'timecode,isrc,musicbrainz');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(endpoint, { method: 'POST', body: form, signal: controller.signal });
    } catch (error) {
      throw new Error(`AudD request failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`AudD returned HTTP ${response.status}`);
    }
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const result = payload?.result as Record<string, unknown> | null;
    if (!result) {
      // status not found / no match → no identity.
      return null;
    }

    const title = stringOf(result.title);
    const track = result.track as Record<string, unknown> | null;
    const artists = Array.isArray(result.artist)
      ? (result.artist as unknown[]).map((a) => stringOf((a as Record<string, unknown>)?.name ?? a))
      : track && Array.isArray((track as Record<string, unknown>).artists)
        ? ((track as Record<string, unknown>).artists as unknown[]).map((a) => stringOf((a as Record<string, unknown>)?.name ?? a))
        : track && stringOf((track as Record<string, unknown>).artist)
          ? [stringOf((track as Record<string, unknown>).artist)]
          : [];

    const rawIsrc = stringOf((track as Record<string, unknown>)?.isrc) || stringOf(result.isrc);
    const isrcs = rawIsrc ? [rawIsrc] : [];
    const durationMs = numberOrNull((track as Record<string, unknown>)?.duration);
    const songStartSec = numberOrNull(result.song_start ?? (result as Record<string, unknown>).timecode);

    return {
      recordingId: rawIsrc ? `isrc:${rawIsrc}` : `audd:${stringOf(result.song_id) || 'unknown'}`,
      title,
      artists,
      isrcs,
      durationMs,
      confidence: numberOrNull(result.score) ?? 0.5,
      cueOffsetMs: songStartSec !== null ? Math.round(songStartSec * 1000) : null,
      providerName: 'audd',
      providerReceipt: stringOf(result.song_id) || String(Date.now()),
      raw: payload,
    };
  };
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '');
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
