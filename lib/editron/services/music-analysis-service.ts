/**
 * Music Analysis Service — Essentia.js via Modal for beat/section/BPM detection.
 *
 * Follows the same architecture as wav2vec-service.ts:
 *   - Modal serverless GPU endpoint running Essentia
 *   - Fire-and-forget warmup
 *   - Returns null on failure (pipeline continues without music data)
 *
 * Essentia algorithms used (server-side):
 *   - RhythmExtractor2013 → BPM, beat positions
 *   - BeatTrackerMultiFeature → beat timestamps + strength
 *   - Music segmentation → section boundaries (verse/chorus/bridge/drop)
 *   - Energy/loudness → per-frame energy curve
 *   - Key detection → musical key
 *
 * CRG alignment:
 *   - signal:audio.music_beat — "Spectral flux onset detection"
 *   - signal:audio.music_section — "chorus, verse, bridge, drop, build, breakdown"
 *   - signal:composite.montage_mode — "music_energy > 0.6"
 *
 * Consumer: director-agent.ts Path E → VideoContext.musicFeatures + musicPresence signal
 */

import {
  isModalProxyEndpointV1,
  modalProxyAuthHeadersV1,
  readModalProxyAuthV1,
  type ModalProxyAuthEnvironmentV1,
} from './modal-proxy-auth-v1';
import type { PipelineWarningCollector } from './pipeline-warnings';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MusicBeat {
  timestampMs: number;
  strength: number;
}

export interface MusicSection {
  startMs: number;
  endMs: number;
  label: string;
}

export interface MusicAnalysisResult {
  bpm: number;
  beats: MusicBeat[];
  sections: MusicSection[];
  musicPresence: number;
  key?: string;
  energyCurve: number[];
  durationMs: number;
  processingTimeMs: number;
}

// ─── Modal Response Shape (snake_case from endpoint) ────────────────────────

interface ModalMusicBeat {
  timestamp_ms: number;
  strength: number;
}

interface ModalMusicSection {
  start_ms: number;
  end_ms: number;
  label: string;
}

interface ModalMusicResponse {
  bpm: number;
  beats: ModalMusicBeat[];
  sections: ModalMusicSection[];
  music_presence: number;
  key?: string;
  energy_curve: number[];
  duration_ms: number;
  processing_time_ms?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const EDITRON_MODAL_MUSIC_ANALYSIS_ENDPOINT_ENV_V1 =
  'MODAL_MUSIC_ANALYSIS_ENDPOINT' as const;

const DEFAULT_MODAL_MUSIC_ENDPOINT =
  'https://jainnimit728--music-analysis-essentia-essentiaanalyzer-analyze.modal.run';

const COLD_TIMEOUT_MS = 90_000;

export type MusicAnalysisFetchV1 = typeof fetch;

export interface AnalyzeMusicContentOptionsV1 {
  /** Injected for focused tests; defaults to global fetch. */
  fetchImpl?: MusicAnalysisFetchV1;
}

/**
 * Resolves only a trusted HTTPS Modal endpoint. Custom domains require a
 * separately reviewed trust policy before proxy credentials may be sent.
 */
function musicAnalysisEndpointV1(
  environment: ModalProxyAuthEnvironmentV1 = process.env,
): string | null {
  const configured = environment[EDITRON_MODAL_MUSIC_ANALYSIS_ENDPOINT_ENV_V1]?.trim();
  const endpoint = configured || DEFAULT_MODAL_MUSIC_ENDPOINT;
  return isModalProxyEndpointV1(endpoint) ? endpoint : null;
}

export function isMusicAnalysisConfiguredV1(
  environment: ModalProxyAuthEnvironmentV1 = process.env,
): boolean {
  return Boolean(musicAnalysisEndpointV1(environment) && readModalProxyAuthV1(environment));
}

// ─── Warmup ─────────────────────────────────────────────────────────────────

export function warmupMusicAnalysis(): void {
  const endpoint = musicAnalysisEndpointV1();
  const proxyAuth = readModalProxyAuthV1();
  if (!endpoint || !proxyAuth) return;

  fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...modalProxyAuthHeadersV1(proxyAuth),
    },
    body: JSON.stringify({ audio_url: '' }),
    signal: AbortSignal.timeout(COLD_TIMEOUT_MS),
  }).then(() => {
    console.log('[MusicAnalysis] Warmup: container ready');
  }).catch(() => {
    // Non-fatal
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Analyze audio for music characteristics via Essentia on Modal.
 *
 * Returns null if the endpoint is unavailable or analysis fails.
 * Pipeline continues without music data — music mode stays inactive,
 * content routes to speech/visual/hybrid instead.
 */
export async function analyzeMusicContent(
  audioUrl: string,
  pipelineWarnings?: PipelineWarningCollector,
  options: AnalyzeMusicContentOptionsV1 = {},
): Promise<MusicAnalysisResult | null> {
  if (!audioUrl) return null;

  const endpoint = musicAnalysisEndpointV1();
  const proxyAuth = readModalProxyAuthV1();
  if (!endpoint || !proxyAuth) {
    console.warn('[MusicAnalysis] No trusted Modal endpoint or dedicated proxy credentials');
    return null;
  }

  const startTime = Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    console.log('[MusicAnalysis] Calling Modal Essentia endpoint');

    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...modalProxyAuthHeadersV1(proxyAuth),
      },
      body: JSON.stringify({ audio_url: audioUrl }),
      signal: AbortSignal.timeout(COLD_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`[MusicAnalysis] Modal returned ${response.status}`);
      return null;
    }

    const data = parseModalMusicResponseV1(await response.json());
    if (!data) {
      console.warn('[MusicAnalysis] Worker returned an invalid response');
      return null;
    }
    const processingTimeMs = Date.now() - startTime;

    const result: MusicAnalysisResult = {
      bpm: data.bpm || 0,
      beats: (data.beats || []).map(b => ({
        timestampMs: b.timestamp_ms,
        strength: b.strength,
      })),
      sections: (data.sections || []).map(s => ({
        startMs: s.start_ms,
        endMs: s.end_ms,
        label: normalizeSectionLabel(s.label),
      })),
      musicPresence: clamp(data.music_presence ?? 0, 0, 1),
      key: data.key || undefined,
      energyCurve: data.energy_curve || [],
      durationMs: data.duration_ms || 0,
      processingTimeMs,
    };

    console.log(
      `[MusicAnalysis] Done in ${processingTimeMs}ms: ` +
      `BPM=${result.bpm}, ${result.beats.length} beats, ` +
      `${result.sections.length} sections, ` +
      `musicPresence=${result.musicPresence.toFixed(2)}, ` +
      `key=${result.key || 'unknown'}`,
    );

    return result;
  } catch (err: unknown) {
    console.warn('[MusicAnalysis] Request failed');
    pipelineWarnings?.errorSwallowed('analysis', new Error('Music analysis request failed'), 'Essentia music analysis');
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_SECTION_LABELS = new Set([
  'intro', 'verse', 'chorus', 'bridge', 'outro',
  'drop', 'build', 'breakdown', 'hook', 'solo',
  'instrumental', 'interlude', 'pre-chorus',
]);

function normalizeSectionLabel(label: string): string {
  const lower = (label || '').toLowerCase().trim().replace(/[^a-z-]/g, '');
  if (VALID_SECTION_LABELS.has(lower)) return lower;
  if (lower.includes('chor')) return 'chorus';
  if (lower.includes('vers')) return 'verse';
  if (lower.includes('bridg')) return 'bridge';
  if (lower.includes('intro')) return 'intro';
  if (lower.includes('outro')) return 'outro';
  if (lower.includes('drop')) return 'drop';
  if (lower.includes('build')) return 'build';
  return 'instrumental';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseModalMusicResponseV1(value: unknown): ModalMusicResponse | null {
  if (!isRecord(value)
    || !isFiniteNumber(value.bpm)
    || !Array.isArray(value.beats)
    || !value.beats.every(isModalMusicBeat)
    || !Array.isArray(value.sections)
    || !value.sections.every(isModalMusicSection)
    || !isFiniteNumber(value.music_presence)
    || !Array.isArray(value.energy_curve)
    || !value.energy_curve.every(isFiniteNumber)
    || !isFiniteNumber(value.duration_ms)
    || (value.key !== undefined && value.key !== null && typeof value.key !== 'string')
    || (value.processing_time_ms !== undefined && !isFiniteNumber(value.processing_time_ms))) {
    return null;
  }

  return {
    bpm: value.bpm,
    beats: value.beats,
    sections: value.sections,
    music_presence: value.music_presence,
    key: typeof value.key === 'string' ? value.key : undefined,
    energy_curve: value.energy_curve,
    duration_ms: value.duration_ms,
    processing_time_ms: value.processing_time_ms,
  };
}

function isModalMusicBeat(value: unknown): value is ModalMusicBeat {
  return isRecord(value)
    && isFiniteNumber(value.timestamp_ms)
    && isFiniteNumber(value.strength);
}

function isModalMusicSection(value: unknown): value is ModalMusicSection {
  return isRecord(value)
    && isFiniteNumber(value.start_ms)
    && isFiniteNumber(value.end_ms)
    && typeof value.label === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
