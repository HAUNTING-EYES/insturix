/**
 * Background Music Generation Service
 *
 * Uses fal.ai MiniMax Music v2 to generate instrumental background music.
 * MiniMax is fast ($0.03/req) and doesn't queue forever like beatoven.
 */

import { fal } from '@fal-ai/client';
import { uploadMedia } from '@/lib/editron/services/upload-service';
import { nanoid } from 'nanoid';
import { recordProviderCostEvent, type ProviderCostEventStatus } from '@/lib/financials/provider-cost-events';

// Configure fal.ai on every call — env vars may change between deployments
function ensureFalConfig() {
  const key = process.env.FAL_AI_API_KEY;
  if (!key) throw new Error('FAL_AI_API_KEY is not set');
  fal.config({ credentials: key });
}

interface BGMResult {
  audioUrl: string;
  /**
   * GCS path — null when R2 is the primary storage backend (the default in every
   * deployed env; upload-service only sets gcsPath on the GCS fallback or when a
   * Gemini-analysis mirror is requested). Metadata only — playback uses audioUrl.
   */
  gcsPath: string | null;
  audioAssetId: string;
  durationMs: number;
  buffer?: Buffer;
}

async function recordPipelineBGMProviderCost(input: {
  status: ProviderCostEventStatus;
  userId: string;
  model: string;
  durationSec: number;
  bytesOut?: number;
  functionMs?: number;
  error?: unknown;
}): Promise<void> {
  await recordProviderCostEvent({
    eventId: `pce_pipeline_bgm_${input.userId}_${nanoid(10)}_${input.status}`,
    status: input.status,
    userId: input.userId,
    service: 'pipeline',
    action: 'bgm_generation',
    provider: 'fal-ai',
    model: input.model,
    operation: 'music_generation',
    units: {
      mediaSeconds: input.durationSec,
      bytesOut: input.bytesOut,
      requestCount: 1,
      functionMs: input.functionMs,
    },
    metadata: {
      requestedDurationSeconds: input.durationSec,
      errorClass: input.error instanceof Error ? input.error.name : undefined,
    },
  });
}
/**
 * Generate background music for the entire video.
 *
 * Uses MiniMax Music v2 (fal-ai/minimax-music/v2) — fast, cheap ($0.03/req),
 * and doesn't sit in queue forever like beatoven.
 *
 * MiniMax generates complete songs with vocals. We prompt for instrumental only.
 * For videos longer than the generated clip, the timeline loops the audio.
 */
export async function generateBackgroundMusic(
  prompt: string,
  userId: string,
  durationSec: number,
): Promise<BGMResult> {
  const model = 'cassetteai/music-generator';
  const costStartMs = Date.now();
  ensureFalConfig();

  const assetId = `bgm_${nanoid(12)}`;

  // Prompt already built by buildMusicPrompt w/ structure+key+tempo tags.
  // 500 chars to accommodate song structure arc (was 300 -> truncated structure).
  const musicPrompt = prompt.substring(0, 500);

  console.log(`[BGM] Generating with CassetteAI: promptChars=${musicPrompt.length}, targetDuration=${durationSec}s`);

  let result: any;
  // Primary: CassetteAI - simple prompt+duration, no lyrics needed, $0.02/min
  try {
    result = await fal.subscribe(model, {
      input: {
        prompt: musicPrompt,
        duration: Math.round(Math.min(Math.max(durationSec, 10), 180)), // CassetteAI: integer 10-180s
      },
      logs: true,
      pollInterval: 3000,
      onQueueUpdate: (update: any) => {
        console.log(`[BGM] CassetteAI queue: ${update?.status || 'unknown'}`);
      },
    });
  } catch (err: any) {
    console.error(`[BGM] CassetteAI failed: ${err.message}`);
    await recordPipelineBGMProviderCost({
      status: 'failed',
      userId,
      model,
      durationSec,
      functionMs: Date.now() - costStartMs,
      error: err,
    });
    throw new Error(`BGM generation failed: ${err.message}`);
  }

  try {
    // Extract audio URL - handle multiple response formats
    const data = (result as any).data || result;
    console.log('[BGM] Response keys:', Object.keys(data || {}));

    const audioUrl =
      data?.audio?.url              // standard format
      || data?.audio_file?.url      // legacy
      || data?.audio?.[0]?.url      // array format
      || data?.output?.url          // generic
      || data?.url                  // direct
      || data?.audio_url;           // minimax format

    if (!audioUrl) {
      throw new Error('BGM generation returned no audio URL. Response: ' + JSON.stringify(data).substring(0, 500));
    }

    console.log('[BGM] Got audio URL, downloading...');

    // Download and upload to GCS
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error(`Failed to download generated music (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());

    const filename = `${assetId}.mp3`;
    const uploadResult = await uploadMedia(buffer, userId, filename, 'audio/mpeg', { customAssetId: assetId });

    console.log(`[BGM] Uploaded: ${uploadResult.assetId} (${buffer.length} bytes)`);
    await recordPipelineBGMProviderCost({
      status: 'success',
      userId,
      model,
      durationSec,
      bytesOut: buffer.length,
      functionMs: Date.now() - costStartMs,
    });

    return {
      audioUrl: uploadResult.signedUrl,
      // Honest null on the R2-primary path — the old `!` assertion masked it and a
      // downstream validator rejected every healthy R2-hosted track (C1 matrix P1).
      gcsPath: uploadResult.gcsPath ?? null,
      audioAssetId: uploadResult.assetId,
      durationMs: durationSec * 1000, // Approximate - actual may differ
      buffer,
    };
  } catch (err) {
    await recordPipelineBGMProviderCost({
      status: 'failed',
      userId,
      model,
      durationSec,
      functionMs: Date.now() - costStartMs,
      error: err,
    });
    throw err;
  }
}

/**
 * Build a music prompt from scene moods and audio descriptions.
 * If ThinkForge provided per-scene music direction, uses it as an energy arc.
 * Otherwise, infers from moods and pacing.
 */
export function buildMusicPrompt(
  scenes: Array<{
    mood?: string;
    musicDescription?: string;
    audioDescription?: string; // @deprecated — fallback for old projects
    editDirections?: { pacing?: string };
    narration?: string;
  }>,
  totalDurationSeconds?: number,
): string {
  // Prefer musicDescription (new, music-only), fall back to audioDescription (old, mixed)
  const musicDescriptions = scenes.map(s => s.musicDescription || s.audioDescription).filter(Boolean) as string[];
  const moods = [...new Set(scenes.map(s => s.mood).filter(Boolean))] as string[];
  const pacingValues = scenes.map(s => s.editDirections?.pacing).filter(Boolean);
  const isFast = pacingValues.some(p => p === 'fast' || p === 'beat-synced' || p === 'building');
  const isSlow = pacingValues.some(p => p === 'slow');

  // Determine BPM tier (0-6) based on pacing and mood
  const bpmTiers = [
    { range: '40-60 BPM', prompt: 'meditative, somber, ambient, drone, memorials, meditation' },
    { range: '60-80 BPM', prompt: 'calm, nostalgic, lo-fi, brand story, testimonial' },
    { range: '80-100 BPM', prompt: 'moderate, conversational, pop ballad, jazz, corporate, tutorial' },
    { range: '100-120 BPM', prompt: 'upbeat, motivational, pop, indie, product launch, SaaS' },
    { range: '120-140 BPM', prompt: 'energetic, driving, EDM, house, hype reel, fitness' },
    { range: '140-160 BPM', prompt: 'intense, aggressive, D&B, dubstep, action, gaming' },
    { range: '160+ BPM', prompt: 'extreme, chaotic, hardcore, extreme sports, comedy fast-forward' },
  ];

  let tierIndex = 2; // Default: 80-100 BPM
  if (isFast) {
    tierIndex = 4; // 120-140
    if (moods.includes('energetic')) tierIndex = 5; // 140-160
    if (moods.includes('energetic') && scenes.length > 5) tierIndex = 6; // 160+
  } else if (isSlow) {
    tierIndex = 1; // 60-80
    if (moods.includes('calm') || moods.includes('mysterious')) tierIndex = 0; // 40-60
  } else {
    // Medium pacing
    if (moods.includes('energetic')) tierIndex = 4;
    else if (moods.includes('inspirational') || moods.includes('playful')) tierIndex = 3;
    else if (moods.includes('calm')) tierIndex = 1;
  }

  const selectedBpm = bpmTiers[tierIndex];
  const hasVO = scenes.some(s => (s.narration?.length || 0) > 0);
  const duration = totalDurationSeconds || scenes.length * 5;

  // Map moods to specific musical Key & Mode
  const keyModeMap: Record<string, string> = {
    happy: 'Major (Happy, triumphant)',
    triumphant: 'Major (Happy, triumphant)',
    inspirational: 'Major (Happy, triumphant)',
    playful: 'Major (Happy, triumphant)',
    energetic: 'Major (Happy, triumphant)',
    sad: 'Minor (Sad, dramatic)',
    dramatic: 'Minor (Sad, dramatic)',
    somber: 'Minor (Sad, dramatic)',
    tense: 'Minor (Sad, dramatic)',
    sophisticated: 'Dorian (Sophisticated, jazzy)',
    jazzy: 'Dorian (Sophisticated, jazzy)',
    bluesy: 'Mixolydian (Bluesy, warm)',
    warm: 'Mixolydian (Bluesy, warm)',
    dreamy: 'Lydian (Dreamy, ethereal)',
    ethereal: 'Lydian (Dreamy, ethereal)',
    mysterious: 'Lydian (Dreamy, ethereal)',
    simple: 'Pentatonic Major (Simple, universal, folk)',
    universal: 'Pentatonic Major (Simple, universal, folk)',
    folk: 'Pentatonic Major (Simple, universal, folk)',
    calm: 'Pentatonic Major (Simple, universal, folk)',
    nostalgic: 'Pentatonic Major (Simple, universal, folk)',
    moody: 'Pentatonic Minor (Moody, powerful)',
    powerful: 'Pentatonic Minor (Moody, powerful)',
    intense: 'Pentatonic Minor (Moody, powerful)',
    // Fix 28: Non-Western music systems
    devotional: 'Raga Bhairavi (Indian devotional, morning raga, meditative)',
    spiritual: 'Raga Yaman (Indian evening raga, serene, ascending)',
    festive: 'Raga Bilawal (Indian festive, bright, celebratory)',
    arabic: 'Maqam Hijaz (Arabic/Middle Eastern, ornamental, evocative)',
    middleeastern: 'Maqam Bayati (Arabic warm, conversational)',
    african: 'Polyrhythmic pattern (African cross-rhythm, layered percussion)',
    latin: 'Clave-based rhythm (Latin, syncopated, danceable)',
    celtic: 'Mixolydian/Dorian (Celtic, modal folk, drone-based)',
  };
  const mappedMode = moods.map(m => keyModeMap[m.toLowerCase()]).find(Boolean);
  if (!mappedMode && moods.length > 0) {
    console.warn(`[BGM] No key/mode mapping for moods: ${moods.join(', ')}. Defaulting to Major.`);
  }
  const selectedKeyMode = mappedMode || 'Major';

  // Combined structure: percentage timing (adaptive to video length) + bar descriptions (musical intent).
  // Merged from our Fix 19 (percentages) + Prateek's commit 99572355 (bar descriptions).
  const structure = scenes.length > 4
    ? [
        'INTRO (0-10%, 2-4 bars): sparse, sets mood, matches opening',
        'BUILD (10-40%, 4-8 bars): layers add, tension increases',
        'PEAK (40-65%, 2-4 bars): full impact climax',
        'SUSTAIN (65-85%): energy holds',
        'RESOLVE (85-100%, 2-4 bars): settles, fadeout',
      ].join(' | ')
    : scenes.length > 2
      ? [
          'INTRO (0-15%): sparse, sets mood',
          'BUILD (15-50%): layers add',
          'PEAK (50-75%): climax',
          'RESOLVE (75-100%): settles, fadeout',
        ].join(' | ')
      : 'ambient bed, steady energy, gentle fadeout final 3s';

  // If ThinkForge provided per-scene music direction → use as energy arc
  if (musicDescriptions.length > 0) {
    return [
      `structure: ${structure}`,
      `Per-scene energy arc: ${musicDescriptions.join(' → ')}`,
      `${duration} seconds`,
      `key/mode: ${selectedKeyMode}`,
      'instrumental only, no vocals, background music for video',
      hasVO ? 'leave mid-range clear for speech' : 'full-range mix OK',
      'clean production, gentle fade-out in final 3 seconds',
    ].join(', ');
  }

  // Fallback: infer from moods + pacing
  return [
    moods.length > 0 ? `${moods.join(' and ')} mood` : 'cinematic ambient',
    `structure: ${structure}`,
    `${duration} seconds`,
    `key/mode: ${selectedKeyMode}`,
    `tempo ${selectedBpm.range}, ${selectedBpm.prompt}`,
    'instrumental only, no vocals, background music for video',
    hasVO ? 'leave mid-range clear for speech' : 'full-range mix OK',
    'clean production',
  ].join(', ');
}

/**
 * Check if BGM generation is available.
 */
export function isBGMAvailable(): boolean {
  return !!process.env.FAL_AI_API_KEY;
}
