/**
 * Creative Brief Service — Director's Cut Architecture Core
 *
 * Generates a structured Creative Brief from Gemini using context-cached creative
 * knowledge + video analysis + user preferences. The Brief contains ALL editing
 * decisions for the video (transitions, zooms, captions, audio, graphics).
 *
 * Architecture:
 *   1. Get cached Gemini model (creative doc as context)
 *   2. Build prompt: XML structure, video data LAST (Rule 35)
 *   3. Gemini outputs structured JSON (CreativeBrief schema)
 *   4. Validate schema + confidence gate low-confidence decisions
 *   5. Return typed CreativeBrief for Brief Executor to map to frames
 *
 * Consumer: director-agent.ts (Step 3: wire into new path)
 * Depends: gemini-context-cache.ts, asset-briefing.ts
 */

import { getCreativeDocCachedModel } from './gemini-context-cache';

// ─── Types ──────────────────────────────────────────────────────────────────

export type BriefDecisionType =
  | 'zoom_push' | 'zoom_punch' | 'zoom_pull_back' | 'zoom_drift'
  | 'transition_dissolve' | 'transition_hard_cut' | 'transition_whip_pan'
  | 'transition_fade_to_black' | 'transition_flash' | 'transition_j_cut'
  | 'transition_l_cut' | 'transition_soft_cut' | 'transition_wipe'
  | 'caption_emphasis'
  | 'sfx_whoosh' | 'sfx_impact' | 'sfx_shimmer' | 'sfx_ambient'
  | 'speed_slow_motion' | 'speed_ramp'
  | 'graphic_stat_counter' | 'graphic_lower_third' | 'graphic_callout'
  | 'graphic_keyword_highlight' | 'graphic_logo_reveal'
  | 'camera_shake'
  | 'audio_duck' | 'audio_bed_select'
  | 'hold_longer' | 'cut_shorter';

export type DecisionReason =
  | 'vocal_peak' | 'vocal_build' | 'vocal_wind_down'
  | 'topic_shift' | 'emphasis_word' | 'rhetorical_pause'
  | 'number_mentioned' | 'name_mentioned' | 'cta'
  | 'energy_peak' | 'energy_build' | 'energy_drop'
  | 'scene_boundary' | 'visual_monotony'
  | 'music_beat' | 'music_drop' | 'music_section_change'
  | 'emotional_shift' | 'narrative_resolve'
  | 'opening_hook' | 'closing_zone';

export interface BriefDecision {
  type: BriefDecisionType;
  targetWordIdx: number;
  confidence: number;
  reason: DecisionReason;
  params: Record<string, number | string>;
}

export interface NarrativeSection {
  sectionId: number;
  startWordIdx: number;
  endWordIdx: number;
  label: 'setup' | 'build' | 'peak' | 'resolve' | 'transition' | 'hook' | 'closing';
  energyLevel: 'low' | 'building' | 'high' | 'declining' | 'neutral';
  mood: string;
  pacingFeel: 'calm' | 'measured' | 'balanced' | 'energetic' | 'fast';
}

export interface VideoUnderstanding {
  primaryContent: string;
  shotScale: string;
  lighting: string;
  productionQuality: number;
  environment: string;
  speakerCount: number;
  hasBRoll: boolean;
}

export interface CreativeBrief {
  videoUnderstanding: VideoUnderstanding;
  narrativeArc: NarrativeSection[];
  decisions: BriefDecision[];
  audioDesign: {
    ambientBed: string;
    duckingProfile: 'standard_speech' | 'music_dominant' | 'balanced';
  };
  captionStyle: 'word_by_word' | 'sentence' | 'key_phrases' | 'none';
  overallPacing: 'calm' | 'measured' | 'balanced' | 'energetic' | 'fast';
  modelVersion: string;
  processingTimeMs: number;
}

// ─── Preferences Input ──────────────────────────────────────────────────────

export interface UserEditPreferences {
  captionStyle?: 'word_by_word' | 'sentence' | 'key_phrases' | 'none';
  transitionPreference?: 'minimal' | 'subtle' | 'dynamic' | 'energetic';
  zoomBehavior?: 'none' | 'subtle' | 'moderate' | 'aggressive';
  motionGraphics?: 'none' | 'stats_only' | 'full';
  pacingFeel?: 'calm' | 'balanced' | 'energetic' | 'fast';
  musicPreference?: 'none' | 'subtle_bed' | 'energetic' | 'match_video';
}

// ─── Video Context Input ────────────────────────────────────────────────────

export interface VideoContext {
  transcription: { word: string; startMs: number; endMs: number }[];
  totalDurationSec: number;
  segmentCount: number;
  audioFeatures?: {
    rmsEnergyCurve: number[];
    silenceGaps: { startMs: number; endMs: number }[];
  };
  vjepaFeatures?: {
    segments: { startMs: number; endMs: number; visualSignificance: number; motionIntensity: number }[];
  };
  wav2vecFeatures?: {
    segments: { startMs: number; endMs: number; emotionIntensity: number; energy: number }[];
  };
}

// ─── Main Function ──────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.5;

export async function generateCreativeBrief(
  videoContext: VideoContext,
  preferences: UserEditPreferences,
  geminiFileUri?: string,
): Promise<CreativeBrief | null> {
  const startTime = Date.now();

  try {
    const model = await getCreativeDocCachedModel();
    const prompt = buildPrompt(videoContext, preferences);

    const generationConfig = {
      responseMimeType: 'application/json',
      temperature: 0.3,
      seed: 42,
    };

    const parts: any[] = [{ text: prompt }];

    // If video file URI available, include it for Gemini to watch
    if (geminiFileUri) {
      parts.unshift({
        fileData: { mimeType: 'video/mp4', fileUri: geminiFileUri },
      });
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig,
    });

    const responseText = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      console.error('[CreativeBrief] Empty response from Gemini');
      return null;
    }

    const parsed = JSON.parse(responseText);
    const brief = validateAndGate(parsed, startTime);
    return brief;
  } catch (err: any) {
    console.error(`[CreativeBrief] Generation failed: ${err.message}`);
    return null;
  }
}

// ─── Prompt Construction (Rule 35: XML structure, data LAST) ────────────────

function buildPrompt(ctx: VideoContext, prefs: UserEditPreferences): string {
  const prefsBlock = Object.entries(prefs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');

  const transcriptBlock = ctx.transcription
    .map((w, i) => `[${i}] ${w.word} (${w.startMs}-${w.endMs}ms)`)
    .join('\n');

  const featuresBlock = buildFeaturesBlock(ctx);

  return `<role>
You are a professional video editor making ALL creative editing decisions for a video.
You have the creative production knowledge document in your context — use it as your reference for techniques, constraints, and anti-patterns.
</role>

<task>
Produce a Creative Brief: a complete JSON of editing decisions for this video.
Every zoom, transition, caption emphasis, sound effect, and pacing decision — all in one structured output.
Your decisions will be executed deterministically by a frame-level executor. Be precise.
</task>

<rules>
- Reference word indices (from the transcription below) as your primary anchor for timing.
- Include a confidence score (0.0-1.0) for each decision. Below 0.5 = executor skips it.
- Respect all constraints from the creative doc in your context (anti-patterns, maximums, never-rules).
- Do NOT over-edit. Silence and stillness are valid creative choices. Fewer confident decisions > many uncertain ones.
- Match the user's preferences below. If they said "minimal transitions", use mostly hard cuts.
- Your narrative_arc sections should cover the ENTIRE transcription (no gaps).
</rules>

<output_format>
{
  "video_understanding": { "primary_content": string, "shot_scale": string, "lighting": string, "production_quality": 0-1, "environment": string, "speaker_count": number, "has_b_roll": boolean },
  "narrative_arc": [{ "section_id": number, "start_word_idx": number, "end_word_idx": number, "label": "setup"|"build"|"peak"|"resolve"|"transition"|"hook"|"closing", "energy_level": "low"|"building"|"high"|"declining"|"neutral", "mood": string, "pacing_feel": "calm"|"measured"|"balanced"|"energetic"|"fast" }],
  "decisions": [{ "type": string, "target_word_idx": number, "confidence": 0-1, "reason": string, "params": {} }],
  "audio_design": { "ambient_bed": string, "ducking_profile": "standard_speech"|"music_dominant"|"balanced" },
  "caption_style": "word_by_word"|"sentence"|"key_phrases"|"none",
  "overall_pacing": "calm"|"measured"|"balanced"|"energetic"|"fast"
}
</output_format>

<user_preferences>
${prefsBlock || '  (none specified — use your best creative judgment)'}
</user_preferences>

<video_features>
Duration: ${ctx.totalDurationSec}s
Segments: ${ctx.segmentCount}
${featuresBlock}
</video_features>

<transcription>
${transcriptBlock}
</transcription>`;
}

function buildFeaturesBlock(ctx: VideoContext): string {
  const parts: string[] = [];

  if (ctx.audioFeatures) {
    const energy = ctx.audioFeatures.rmsEnergyCurve;
    if (energy.length > 0) {
      const sampled = sampleArray(energy, 20);
      parts.push(`Audio energy (20 samples across video): [${sampled.map(v => v.toFixed(2)).join(', ')}]`);
    }
    if (ctx.audioFeatures.silenceGaps.length > 0) {
      parts.push(`Silence gaps: ${ctx.audioFeatures.silenceGaps.length} detected`);
    }
  }

  if (ctx.vjepaFeatures?.segments?.length) {
    const topSegments = ctx.vjepaFeatures.segments
      .filter(s => s.visualSignificance > 0.7)
      .slice(0, 5);
    if (topSegments.length > 0) {
      parts.push(`High visual significance moments: ${topSegments.map(s => `${s.startMs}ms (sig=${s.visualSignificance.toFixed(2)})`).join(', ')}`);
    }
  }

  if (ctx.wav2vecFeatures?.segments?.length) {
    const emotionalPeaks = ctx.wav2vecFeatures.segments
      .filter(s => s.emotionIntensity > 0.7)
      .slice(0, 5);
    if (emotionalPeaks.length > 0) {
      parts.push(`High emotion moments: ${emotionalPeaks.map(s => `${s.startMs}ms (intensity=${s.emotionIntensity.toFixed(2)})`).join(', ')}`);
    }
  }

  return parts.join('\n') || 'No additional features available.';
}

// ─── Validation + Confidence Gating ─────────────────────────────────────────

function validateAndGate(raw: any, startTime: number): CreativeBrief | null {
  if (!raw || typeof raw !== 'object') return null;

  const videoUnderstanding: VideoUnderstanding = {
    primaryContent: raw.video_understanding?.primary_content || 'unknown',
    shotScale: raw.video_understanding?.shot_scale || 'medium',
    lighting: raw.video_understanding?.lighting || 'neutral',
    productionQuality: clamp(raw.video_understanding?.production_quality ?? 0.5, 0, 1),
    environment: raw.video_understanding?.environment || 'unknown',
    speakerCount: raw.video_understanding?.speaker_count ?? 1,
    hasBRoll: raw.video_understanding?.has_b_roll ?? false,
  };

  const narrativeArc: NarrativeSection[] = (raw.narrative_arc || []).map((s: any, i: number) => ({
    sectionId: s.section_id ?? i,
    startWordIdx: s.start_word_idx ?? 0,
    endWordIdx: s.end_word_idx ?? 0,
    label: validateEnum(s.label, ['setup', 'build', 'peak', 'resolve', 'transition', 'hook', 'closing'], 'build'),
    energyLevel: validateEnum(s.energy_level, ['low', 'building', 'high', 'declining', 'neutral'], 'neutral'),
    mood: s.mood || 'neutral',
    pacingFeel: validateEnum(s.pacing_feel, ['calm', 'measured', 'balanced', 'energetic', 'fast'], 'balanced'),
  }));

  // Confidence gating: only keep decisions above threshold
  const allDecisions: BriefDecision[] = (raw.decisions || [])
    .map((d: any) => ({
      type: d.type as BriefDecisionType,
      targetWordIdx: d.target_word_idx ?? 0,
      confidence: clamp(d.confidence ?? 0, 0, 1),
      reason: d.reason as DecisionReason,
      params: d.params || {},
    }))
    .filter((d: BriefDecision) => d.confidence >= CONFIDENCE_THRESHOLD);

  const gatedCount = (raw.decisions?.length || 0) - allDecisions.length;
  if (gatedCount > 0) {
    console.log(`[CreativeBrief] Gated ${gatedCount} low-confidence decisions (< ${CONFIDENCE_THRESHOLD})`);
  }

  return {
    videoUnderstanding,
    narrativeArc,
    decisions: allDecisions,
    audioDesign: {
      ambientBed: raw.audio_design?.ambient_bed || 'soft_room_tone',
      duckingProfile: validateEnum(
        raw.audio_design?.ducking_profile,
        ['standard_speech', 'music_dominant', 'balanced'],
        'standard_speech',
      ),
    },
    captionStyle: validateEnum(
      raw.caption_style,
      ['word_by_word', 'sentence', 'key_phrases', 'none'],
      'word_by_word',
    ),
    overallPacing: validateEnum(
      raw.overall_pacing,
      ['calm', 'measured', 'balanced', 'energetic', 'fast'],
      'balanced',
    ),
    modelVersion: 'gemini-2.5-flash-cached',
    processingTimeMs: Date.now() - startTime,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function validateEnum<T extends string>(value: any, valid: T[], fallback: T): T {
  if (valid.includes(value)) return value;
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sampleArray(arr: number[], targetSize: number): number[] {
  if (arr.length <= targetSize) return arr;
  const step = arr.length / targetSize;
  return Array.from({ length: targetSize }, (_, i) => arr[Math.floor(i * step)]);
}
