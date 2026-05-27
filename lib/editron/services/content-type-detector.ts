/**
 * Content Type Detector — Rule-Based (No LLM)
 *
 * Classifies raw footage by transcript features:
 *   speech coverage, filler rate, vocabulary complexity, speaker patterns
 *
 * Vision doc mandate: "LLMs for understanding. Rules for decisions."
 * This is a decision — deterministic, same input = same output.
 *
 * Output drives:
 *   - Silence removal thresholds (aggressive for talking-head, conservative for documentary)
 *   - Profile selection (C-08 for vlog, C-02 for tutorial, etc.)
 *   - Pacing rules from creative doc v2 §3
 */

import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';
import type { TranscriptionWord } from '@/lib/editron/services/media/types';

// ─── Types ───────────────────────────────────────────────────────

export interface ContentTypeDetection {
  /** Detected content type */
  contentType: string;
  /** How confident the detection is (0-1) */
  confidence: number;
  /** Signals that contributed to the detection */
  signals: string[];
  /** Mapped edit profile ID */
  profileId: string;
  /** Silence removal thresholds for this content type */
  silenceThreshold: {
    removeAboveMs: number;
    shortenRangeMs: [number, number];
    shortenTargetMs: number;
  };
}

interface TranscriptFeatures {
  /** Fraction of video duration covered by speech (0-1) */
  speechCoverage: number;
  /** Fraction of words that are fillers (0-1) */
  fillerRate: number;
  /** Average words per minute */
  wpm: number;
  /** Number of distinct silence gaps > 2s (potential speaker changes) */
  longPauseCount: number;
  /** Total video duration in seconds */
  durationSec: number;
  /** Total word count */
  wordCount: number;
  /** Average word gap in ms */
  avgWordGapMs: number;
}

// ─── Profile Mapping ─────────────────────────────────────────────

const CONTENT_TYPE_TO_PROFILE: Record<string, Record<string, string>> = {
  'talking-head': {
    default: 'C-08',    // Vlog Modern
    youtube: 'A-01',    // YouTube Long
    linkedin: 'C-01',   // Corporate Overview
    tiktok: 'A-04',     // TikTok
    instagram: 'A-03',  // Instagram Reel
  },
  'tutorial': {
    default: 'C-02',    // Tutorial/How-To
    youtube: 'C-02',
    linkedin: 'C-02',
  },
  'interview': {
    default: 'C-05',    // Testimonial/Interview
    youtube: 'C-05',
    linkedin: 'C-05',
  },
  'vlog': {
    default: 'C-08',    // Vlog Modern
    youtube: 'C-08',
    tiktok: 'A-04',
    instagram: 'A-03',
  },
  'corporate': {
    default: 'C-01',    // Corporate Overview
    linkedin: 'C-01',
    youtube: 'C-01',
  },
  'podcast': {
    default: 'C-09',    // Podcast
    youtube: 'C-09',
  },
  'ad': {
    default: 'E-01',    // Product Showcase
    instagram: 'A-03',
    tiktok: 'A-04',
    facebook: 'A-05',
  },
  'product-demo': {
    default: 'E-01',
    youtube: 'E-01',
    linkedin: 'E-01',
  },
  'documentary': {
    default: 'C-03',    // Documentary
    youtube: 'C-03',
  },
  'comedy': {
    default: 'C-08',    // Vlog Modern (closest)
    youtube: 'C-08',
    tiktok: 'A-04',
  },
  'unknown': {
    default: 'G-01',    // Universal Clean (fallback)
  },
};

// ─── Feature Extraction ──────────────────────────────────────────

function extractFeatures(
  words: TranscriptionWord[],
  videoDurationSec: number,
  fillerWords: Set<string>,
): TranscriptFeatures {
  if (words.length === 0) {
    return {
      speechCoverage: 0,
      fillerRate: 0,
      wpm: 0,
      longPauseCount: 0,
      durationSec: videoDurationSec,
      wordCount: 0,
      avgWordGapMs: 0,
    };
  }

  // Sum individual word durations (actual speech time, not span).
  // Span method (first→last word) reports ~100% for any video where someone speaks
  // near the start and near the end, ignoring all pauses/gaps between words.
  const speechSumMs = words.reduce((sum, w) => {
    const dur = (w.endMs ?? 0) - (w.startMs ?? 0);
    return sum + (dur > 0 ? dur : 0);
  }, 0);
  const speechSpanMs = (words[words.length - 1].endMs ?? 0) - (words[0].startMs ?? 0);
  const speechCoverage = Math.min(1.0, speechSumMs / (videoDurationSec * 1000));

  let fillerCount = 0;
  for (const w of words) {
    if (fillerWords.has(w.word.toLowerCase().replace(/[.,!?]/g, ''))) {
      fillerCount++;
    }
  }
  const fillerRate = words.length > 0 ? fillerCount / words.length : 0;

  const speechDurationMin = speechSpanMs / 60000;
  const wpm = speechDurationMin > 0 ? words.length / speechDurationMin : 0;

  let longPauseCount = 0;
  let totalGap = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].startMs - words[i - 1].endMs;
    totalGap += gap;
    if (gap > 2000) longPauseCount++;
  }
  const avgWordGapMs = words.length > 1 ? totalGap / (words.length - 1) : 0;

  return {
    speechCoverage,
    fillerRate,
    wpm,
    longPauseCount,
    durationSec: videoDurationSec,
    wordCount: words.length,
    avgWordGapMs,
  };
}

// ─── Classification Rules ────────────────────────────────────────

function classify(features: TranscriptFeatures, userIntent?: string): { type: string; confidence: number; signals: string[] } {
  const signals: string[] = [];

  // User intent override keywords
  if (userIntent) {
    const intent = userIntent.toLowerCase();
    if (intent.includes('comedy') || intent.includes('funny') || intent.includes('comedic')) {
      signals.push('userIntent: comedy');
      return { type: 'comedy', confidence: 0.95, signals };
    }
    if (intent.includes('documentary') || intent.includes('doc')) {
      signals.push('userIntent: documentary');
      return { type: 'documentary', confidence: 0.95, signals };
    }
    if (intent.includes('tutorial') || intent.includes('how to') || intent.includes('howto')) {
      signals.push('userIntent: tutorial');
      return { type: 'tutorial', confidence: 0.95, signals };
    }
    if (intent.includes('interview')) {
      signals.push('userIntent: interview');
      return { type: 'interview', confidence: 0.95, signals };
    }
    if (intent.includes('podcast')) {
      signals.push('userIntent: podcast');
      return { type: 'podcast', confidence: 0.95, signals };
    }
    if (intent.includes('ad') || intent.includes('promo') || intent.includes('product')) {
      signals.push('userIntent: ad');
      return { type: 'ad', confidence: 0.90, signals };
    }
    if (intent.includes('corporate') || intent.includes('business')) {
      signals.push('userIntent: corporate');
      return { type: 'corporate', confidence: 0.90, signals };
    }
    if (intent.includes('keep pauses') || intent.includes('dramatic') || intent.includes('cinematic')) {
      signals.push('userIntent: cinematic');
      return { type: 'cinematic', confidence: 0.90, signals };
    }
  }

  // No speech at all → non-speech content
  if (features.speechCoverage < 0.05) {
    signals.push(`speechCoverage=${(features.speechCoverage * 100).toFixed(1)}% (very low)`);
    if (features.durationSec < 90) {
      signals.push('short duration + no speech → ad/product-demo');
      return { type: 'ad', confidence: 0.65, signals };
    }
    signals.push('long duration + no speech → cinematic/b-roll');
    return { type: 'cinematic', confidence: 0.60, signals };
  }

  const config = DEFAULT_CONFIG.rawFootage;

  // Speech-heavy single speaker → talking-head/tutorial/vlog
  if (features.speechCoverage >= config.speechHeavyCoverageThreshold) {
    signals.push(`speechCoverage=${(features.speechCoverage * 100).toFixed(1)}% (high)`);

    // Multiple long pauses = possible interview (speaker changes)
    if (features.longPauseCount >= 3 && features.durationSec > 120) {
      signals.push(`longPauses=${features.longPauseCount} (multiple speakers likely)`);
      return { type: 'interview', confidence: 0.75, signals };
    }

    // High filler rate = casual = vlog
    if (features.fillerRate >= config.casualFillerRateThreshold) {
      signals.push(`fillerRate=${(features.fillerRate * 100).toFixed(1)}% (casual)`);
      return { type: 'vlog', confidence: 0.80, signals };
    }

    // Measured pace (120-160 WPM) + low fillers = tutorial or corporate
    if (features.wpm >= 120 && features.wpm <= 160 && features.fillerRate < 0.03) {
      signals.push(`wpm=${Math.round(features.wpm)} (measured), fillerRate=${(features.fillerRate * 100).toFixed(1)}% (low)`);
      if (features.durationSec > 180) {
        signals.push('long + measured → tutorial');
        return { type: 'tutorial', confidence: 0.80, signals };
      }
      signals.push('short + measured → corporate');
      return { type: 'corporate', confidence: 0.70, signals };
    }

    // Default high-speech = talking-head
    signals.push('high speech, moderate pace → talking-head');
    return { type: 'talking-head', confidence: 0.85, signals };
  }

  // Moderate speech (30-80%) → mixed content
  if (features.speechCoverage >= 0.30) {
    signals.push(`speechCoverage=${(features.speechCoverage * 100).toFixed(1)}% (moderate)`);

    if (features.durationSec > 300) {
      signals.push('long + moderate speech → documentary');
      return { type: 'documentary', confidence: 0.65, signals };
    }

    if (features.durationSec < 60) {
      signals.push('short + moderate speech → ad');
      return { type: 'ad', confidence: 0.70, signals };
    }

    signals.push('moderate speech, medium duration → talking-head (default)');
    return { type: 'talking-head', confidence: 0.60, signals };
  }

  // Low speech (5-30%) → b-roll heavy or product demo
  signals.push(`speechCoverage=${(features.speechCoverage * 100).toFixed(1)}% (low)`);
  if (features.durationSec < 120) {
    signals.push('short + low speech → product-demo');
    return { type: 'product-demo', confidence: 0.60, signals };
  }
  signals.push('long + low speech → documentary');
  return { type: 'documentary', confidence: 0.55, signals };
}

// ─── Public API ──────────────────────────────────────────────────

const FILLER_SET = new Set([
  'um', 'uh', 'uhm', 'umm', 'uhh', 'like', 'you know',
  'basically', 'actually', 'literally', 'right', 'so', 'well',
  'i mean', 'sort of', 'kind of',
]);

/**
 * Detect content type from transcript features. Deterministic, no LLM.
 */
export function detectContentType(
  words: TranscriptionWord[],
  videoDurationSec: number,
  platform?: string,
  userIntent?: string,
): ContentTypeDetection {
  const features = extractFeatures(words, videoDurationSec, FILLER_SET);
  const { type, confidence, signals } = classify(features, userIntent);

  // Map to profile
  const platformProfiles = CONTENT_TYPE_TO_PROFILE[type] || CONTENT_TYPE_TO_PROFILE['unknown'];
  const profileId = (platform && platformProfiles[platform]) || platformProfiles['default'] || 'G-01';

  // Get silence threshold for this content type
  const config = DEFAULT_CONFIG.rawFootage;
  const silenceThreshold = config.silenceThresholdByContentType[type]
    || config.silenceThresholdByContentType['talking-head']; // safe fallback

  console.log(`[ContentType] Detected: ${type} (confidence=${confidence.toFixed(2)}, profile=${profileId}) | ${signals.join(', ')}`);

  return {
    contentType: type,
    confidence,
    signals,
    profileId,
    silenceThreshold,
  };
}
