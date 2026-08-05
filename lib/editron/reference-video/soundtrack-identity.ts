/**
 * R3: Soundtrack Identity.
 *
 * Fingerprints the R1-A demuxed audio and resolves the CANONICAL recording
 * identity through an approved recognition provider (AudD/ACRCloud/similar).
 *
 * Contract (from docs/REFERENCE_VIDEO_ADAPTIVE_TEMPLATE_PLAN_2026-07-27.md R3):
 *   - preserve recording ID, title, artist(s), ISRC, confidence, cue offset, provider receipt
 *   - never obtain the song by scraping or downloading an unauthorized stream
 *
 * This module OWNS the identity record + resolution flow. It does NOT decide
 * export inclusion (Constraint #7: the user's audio usage mode decides that)
 * and does NOT fetch the audio. It records WHAT the fingerprint is, with a
 * provider receipt as provenance — nothing more.
 *
 * The recognizer is injected (a real AudD/ACRCloud client plugs in later).
 * When none is configured, resolution returns null and the caller must keep
 * soundClass 'unknown' — never a fabricated identity.
 */

export const SOUNDTRACK_IDENTITY_VERSION = 'editron-r3-soundtrack-identity-v1' as const;

export interface SoundtrackIdentity {
  version: typeof SOUNDTRACK_IDENTITY_VERSION;
  referenceAssetId: string;
  /** Canonical recording id from the provider (e.g. ISRC:xx or a provider rec id). */
  recordingId: string;
  title: string;
  artists: string[];
  /** ISRC code(s) when the provider supplies them. */
  isrcs: string[];
  /** Recording length as known by the catalog (ms), when provided. */
  catalogDurationMs: number | null;
  /** Provider confidence, normalized to [0,1]. */
  confidence: number;
  /** Cue offset (ms) — where the detected musical snippet starts within the recording
   *  (the fingerprint's `playOffsetMs`). Manages songs that start mid-track. */
  cueOffsetMs: number | null;
  /** Provider + its raw receipt. Provenance for the mandate "record provider receipt". */
  provider: {
    name: string;
    /** Opaque provider-assigned receipt/transaction id, verbatim. */
    receipt: string;
    /** Raw provider payload (bounded) for audit. */
    raw?: unknown;
  };
  recognizedAt: string;
}

/** Normalized recognizer output — the provider-agnostic shape the resolver maps to identity. */
export interface RecognizedTrack {
  recordingId: string;
  title: string;
  artists: string[];
  isrcs?: string[];
  durationMs?: number | null;
  /** Provider confidence in [0,1]; clamped. */
  confidence: number;
  /** Where the matched snippet starts inside the recording (ms). */
  cueOffsetMs?: number | null;
  providerName: string;
  providerReceipt: string;
  raw?: unknown;
}

export type AudioRecognizer = (audioBytes: Uint8Array) => Promise<RecognizedTrack | null>;

export interface ResolveSoundtrackIdentityOptions {
  /** Audio recognizer (AudD/ACRCloud client). Required when you expect an identity. */
  recognize?: AudioRecognizer;
  /** Stamp for recognizedAt (kept injectable for deterministic tests). */
  now?: () => Date;
  /** Max audio bytes accepted for recognition (bounds a 10-min m4a at ~48kbps). ⚠️ INVENTED. */
  maxRecognitionBytes?: number;
}

export class SoundtrackIdentityError extends Error {
  constructor(
    public readonly code: 'recognizer_failed' | 'audio_too_large' | 'no_audio',
    message: string,
    public readonly diagnostics: string[] = [message],
  ) {
    super(message);
    this.name = 'SoundtrackIdentityError';
  }
}

function defaultNow(): Date {
  return new Date();
}

/**
 * Resolve the canonical recording identity for demuxed audio bytes.
 *
 * Returns null when the recognizer finds no match (the caller keeps
 * soundClass 'unknown' — an honest "not recognized", not a claim it is
 * original). Throws SoundtrackIdentityError when audio is missing/oversized
 * or the recognizer itself fails (fail-loud, R18N).
 */
export async function resolveSoundtrackIdentity(
  referenceAssetId: string,
  audioBytes: Uint8Array | null,
  options: ResolveSoundtrackIdentityOptions = {},
): Promise<SoundtrackIdentity | null> {
  const { recognize, now = defaultNow, maxRecognitionBytes = 64 * 1024 * 1024 } = options;

  if (!audioBytes || audioBytes.byteLength === 0) {
    throw new SoundtrackIdentityError('no_audio', 'No demuxed audio bytes to fingerprint for identity.');
  }
  if (audioBytes.byteLength > maxRecognitionBytes) {
    throw new SoundtrackIdentityError(
      'audio_too_large',
      `Recognition audio (${audioBytes.byteLength} bytes) exceeds the ${maxRecognitionBytes}-byte bound.`,
    );
  }
  if (!recognize) {
    // No approved recognizer configured. Do NOT guess an identity.
    return null;
  }

  let track: RecognizedTrack | null;
  try {
    track = await recognize(audioBytes);
  } catch (error) {
    throw new SoundtrackIdentityError(
      'recognizer_failed',
      'Audio recognizer failed: ' + (error instanceof Error ? error.message : String(error)),
    );
  }
  if (!track) return null;

  const title = track.title.trim();
  const artists = [...new Set(track.artists.map((a) => a.trim()).filter(Boolean))];
  const recordingId = track.recordingId.trim();
  if (!recordingId) {
    throw new SoundtrackIdentityError(
      'recognizer_failed',
      'Recognizer returned a track with an empty recording id; refusing to fabricate identity.',
    );
  }
  if (!title) {
    throw new SoundtrackIdentityError(
      'recognizer_failed',
      'Recognizer returned a track with an empty title; refusing to fabricate identity.',
    );
  }
  if (artists.length === 0) {
    throw new SoundtrackIdentityError(
      'recognizer_failed',
      'Recognizer returned a track with no artist; refusing to fabricate identity.',
    );
  }

  const isrcs = [...new Set((track.isrcs ?? []).map(normalizeIsrc).filter((v): v is string => Boolean(v)))]
    .sort();
  return {
    version: SOUNDTRACK_IDENTITY_VERSION,
    referenceAssetId,
    recordingId,
    title,
    artists,
    isrcs,
    catalogDurationMs: track.durationMs ?? null,
    confidence: clamp01(Number(track.confidence)),
    cueOffsetMs: track.cueOffsetMs ?? null,
    provider: {
      name: track.providerName,
      receipt: track.providerReceipt,
      ...(track.raw !== undefined && { raw: track.raw }),
    },
    recognizedAt: now().toISOString(),
  };
}

/** Map a resolved identity into the fingerprint's `recognition` producer contract. */
export function identityToFingerprintRecognition(
  identity: SoundtrackIdentity,
): {
  trackIdentity: string;
  soundClass: 'catalog-track';
  playOffsetMs?: number;
} {
  return {
    trackIdentity: identity.recordingId,
    soundClass: 'catalog-track',
    ...(identity.cueOffsetMs !== null && { playOffsetMs: identity.cueOffsetMs }),
  };
}

function normalizeIsrc(value: string): string | null {
  const normalized = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return /^[A-Z0-9]{12}$/.test(normalized) ? normalized : null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
