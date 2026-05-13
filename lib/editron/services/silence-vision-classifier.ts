/**
 * Silence Vision Classifier — Gemini Vision for intentional vs dead-air pauses
 *
 * For each long silence gap within kept content, sends the surrounding video
 * frames to Gemini Vision to determine if the speaker is:
 * - Intentionally pausing (dramatic beat, thinking, listening) → KEEP
 * - Not actively presenting (reading script, adjusting equipment, distracted) → CUT
 *
 * Uses the ALREADY-UPLOADED video file from video-understanding-service
 * (Gemini Files API). No re-upload needed. ~$0.01 per classification.
 */

import type { SilenceRemovalAction } from './raw-footage-processor';
import type { TranscriptEditKeepRange } from './transcript-editor';
import type { TranscriptionWord, SilenceGap } from '@/lib/editron/services/media/types';

export interface SilenceClassification {
  gap: SilenceGap;
  verdict: 'dead-air' | 'intentional';
  confidence: number;
  reason: string;
}

export interface SilenceVisionResult {
  classifications: SilenceClassification[];
  deadAirRemovals: SilenceRemovalAction[];
  totalDeadAirMs: number;
  totalIntentionalMs: number;
  processingTimeMs: number;
}

const MIN_GAP_FOR_VISION_CHECK_MS = 1500;
const MAX_GAPS_TO_CHECK = 20;

export async function classifySilenceWithVision(
  silenceGaps: SilenceGap[],
  keepRanges: TranscriptEditKeepRange[],
  words: TranscriptionWord[],
  geminiFileUri: string,
  videoDurationSec: number,
): Promise<SilenceVisionResult> {
  const start = Date.now();

  const keepMs = keepRanges.map(r => ({
    startMs: words[r.s]?.startMs ?? 0,
    endMs: words[r.e]?.endMs ?? 0,
  }));

  const gapsInKeepRanges = silenceGaps.filter(gap => {
    if (gap.durationMs < MIN_GAP_FOR_VISION_CHECK_MS) return false;
    return keepMs.some(k => gap.startMs >= k.startMs && gap.endMs <= k.endMs);
  });

  gapsInKeepRanges.sort((a, b) => b.durationMs - a.durationMs);
  const gapsToCheck = gapsInKeepRanges.slice(0, MAX_GAPS_TO_CHECK);

  if (gapsToCheck.length === 0) {
    return {
      classifications: [],
      deadAirRemovals: [],
      totalDeadAirMs: 0,
      totalIntentionalMs: 0,
      processingTimeMs: Date.now() - start,
    };
  }

  console.log(`[SilenceVision] Checking ${gapsToCheck.length} silence gaps (${gapsToCheck.reduce((s, g) => s + g.durationMs, 0) / 1000}s total) via Gemini Vision...`);

  try {
    const { getGeneralModel } = await import('@/lib/editron/utils/gemini-model-factory');
    const model = await getGeneralModel();

    const gapDescriptions = gapsToCheck.map((gap, i) => {
      const startSec = (gap.startMs / 1000).toFixed(1);
      const endSec = (gap.endMs / 1000).toFixed(1);
      const durSec = (gap.durationMs / 1000).toFixed(1);
      const before = gap.beforeWord || '';
      const after = gap.afterWord || '';
      return `Gap ${i + 1}: ${startSec}s-${endSec}s (${durSec}s) | after "${before}" before "${after}"`;
    }).join('\n');

    const prompt = `<role>You are analyzing a video to classify silence gaps — is the speaker intentionally pausing, or is this dead air?</role>

<task>
The video has ${gapsToCheck.length} silence gaps where no one is speaking. For each gap, look at the video at that timestamp and classify it.

DEAD-AIR (should be cut):
- Speaker looking down at script/notes/phone
- Speaker adjusting equipment, clothing, or surroundings
- Speaker visibly lost or blank-faced with no communicative intent
- Empty frame, no one present, or off-camera fumbling

INTENTIONAL (should be kept):
- Speaker pausing for dramatic effect while maintaining eye contact or expressive pose
- Speaker thinking visibly (hand on chin, looking up, expressive face)
- Speaker listening to another person or reacting to something
- Deliberate silence after a strong statement to let it land
- Any pause that serves the narrative or emotional flow

${gapDescriptions}
</task>

<output_format>
JSON array, one per gap:
[{"gap": 1, "verdict": "dead-air" | "intentional", "confidence": 0.0-1.0, "reason": "brief explanation"}]
</output_format>`;

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { fileData: { fileUri: geminiFileUri, mimeType: 'video/mp4' } },
          { text: prompt },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const text = result.response.text();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      throw new Error(`Expected JSON array, got ${typeof parsed}`);
    }

    const classifications: SilenceClassification[] = [];
    const deadAirRemovals: SilenceRemovalAction[] = [];
    let totalDeadAirMs = 0;
    let totalIntentionalMs = 0;

    for (const item of parsed) {
      const gapIdx = (item.gap ?? item.index ?? 0) - 1;
      const gap = gapsToCheck[gapIdx];
      if (!gap) continue;

      const verdict = item.verdict === 'dead-air' ? 'dead-air' : 'intentional';
      const confidence = typeof item.confidence === 'number' ? item.confidence : 0.5;

      classifications.push({
        gap,
        verdict,
        confidence,
        reason: item.reason || '',
      });

      if (verdict === 'dead-air' && confidence >= 0.6) {
        deadAirRemovals.push({
          startMs: gap.startMs,
          endMs: gap.endMs,
          action: 'remove',
          reason: 'silence' as SilenceRemovalAction['reason'],
        });
        totalDeadAirMs += gap.durationMs;
      } else {
        totalIntentionalMs += gap.durationMs;
      }
    }

    const elapsed = Date.now() - start;
    console.log(`[SilenceVision] ${classifications.length} gaps classified: ${deadAirRemovals.length} dead-air (${(totalDeadAirMs / 1000).toFixed(1)}s), ${classifications.length - deadAirRemovals.length} intentional (${(totalIntentionalMs / 1000).toFixed(1)}s) (${elapsed}ms)`);

    return {
      classifications,
      deadAirRemovals,
      totalDeadAirMs,
      totalIntentionalMs,
      processingTimeMs: elapsed,
    };
  } catch (err: any) {
    console.warn(`[SilenceVision] Failed: ${err.message}. Skipping vision-based silence classification.`);
    return {
      classifications: [],
      deadAirRemovals: [],
      totalDeadAirMs: 0,
      totalIntentionalMs: 0,
      processingTimeMs: Date.now() - start,
    };
  }
}
