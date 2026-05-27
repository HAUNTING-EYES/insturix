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

const MODAL_MUSIC_ENDPOINT = process.env.MODAL_MUSIC_ANALYSIS_ENDPOINT
  || 'https://jainnimit728--music-analysis-essentia-essentiaanalyzer-analyze.modal.run';

const COLD_TIMEOUT_MS = 90_000;
const WARM_TIMEOUT_MS = 45_000;

// ─── Warmup ─────────────────────────────────────────────────────────────────

export function warmupMusicAnalysis(): void {
  const tokenId = process.env.MODAL_TOKEN_ID;
  const tokenSecret = process.env.MODAL_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) return;

  fetch(MODAL_MUSIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${tokenId}:${tokenSecret}`,
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
): Promise<MusicAnalysisResult | null> {
  if (!audioUrl) return null;

  const tokenId = process.env.MODAL_TOKEN_ID;
  const tokenSecret = process.env.MODAL_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    console.warn('[MusicAnalysis] No Modal credentials — skipping music analysis');
    return null;
  }

  const startTime = Date.now();

  try {
    console.log(`[MusicAnalysis] Calling Modal Essentia endpoint for ${audioUrl.substring(0, 60)}...`);

    const response = await fetch(MODAL_MUSIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${tokenId}:${tokenSecret}`,
      },
      body: JSON.stringify({ audio_url: audioUrl }),
      signal: AbortSignal.timeout(COLD_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`[MusicAnalysis] Modal returned ${response.status}: ${response.statusText}`);
      return null;
    }

    const data: ModalMusicResponse = await response.json();
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
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[MusicAnalysis] Failed: ${msg}`);
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
