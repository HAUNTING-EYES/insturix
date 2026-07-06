/**
 * Creative Brief Service — Director's Cut Architecture Core
 *
 * Generates a structured Creative Brief from Gemini using context-cached creative
 * knowledge + video analysis + user preferences. The Brief contains semantic
 * facts, story beats, and compatibility hints for the native planner.
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

import { SchemaType, type ResponseSchema } from '@google/generative-ai';
import { getCreativeDocCachedModel } from './gemini-context-cache';
import type { PipelineWarningCollector } from './pipeline-warnings';
import {
  DECISION_REGISTRY, VALID_DECISION_TYPES, VALID_DECISION_REASONS,
  BUDGET_CATEGORIES, TYPE_TO_BUDGET, REQUIRED_PARAMS_MAP, DEFAULT_PARAMS_MAP,
  MAX_PER_VIDEO_MAP, type DecisionRegistryEntry,
} from '../data/decision-registry';
import type { GenreParameters } from './graph-query';

export const CREATIVE_BRIEF_FACT_AUTHORITY_CONTRACT = `<authority_contract>
You are the narrative/fact interpreter, not the final overlay planner or renderer.
Your job is to identify moments, semantic facts, evidence phrases, story beats, and useful family hints.
The native Editron planner decides exact overlay family, timing, placement, motion, SFX assets, density, and render form.

Rules:
- Treat decision.type as a compatibility family tag only. It is NOT permission to force a visual form.
- Put the real meaning in params.semanticAtoms. Every non-trivial decision must include evidencePhrase or another transcript/video-supported atom.
- Do not output exact render form, placement, animation, duration, keyframes, SFX asset names, or graphic component names.
- Do not output placeholder copy. Text must be grounded in transcript words, verified visual text, or explicitly provided context.
- If a moment is important but the exact overlay form is unclear, still emit the semantic fact; the native planner will decide whether it becomes caption, MG, zoom, transition, SFX, or evidence only.
</authority_contract>`;

const STRING_SCHEMA = { type: SchemaType.STRING } as const;
const NUMBER_SCHEMA = { type: SchemaType.NUMBER } as const;
const BOOLEAN_SCHEMA = { type: SchemaType.BOOLEAN } as const;
const STRING_ARRAY_SCHEMA = { type: SchemaType.ARRAY, items: STRING_SCHEMA } as const;
const NUMBER_ARRAY_SCHEMA = { type: SchemaType.ARRAY, items: NUMBER_SCHEMA } as const;

const SEMANTIC_ATOMS_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    concept: STRING_SCHEMA,
    claim: STRING_SCHEMA,
    evidencePhrase: STRING_SCHEMA,
    keyword: STRING_SCHEMA,
    text: {
      type: SchemaType.OBJECT,
      properties: {
        primary: STRING_SCHEMA,
        secondary: STRING_SCHEMA,
        keyword: STRING_SCHEMA,
        phrase: STRING_SCHEMA,
      },
    },
    quantity: {
      type: SchemaType.OBJECT,
      properties: {
        displayText: STRING_SCHEMA,
        label: STRING_SCHEMA,
        kind: STRING_SCHEMA,
        unit: STRING_SCHEMA,
        denominator: NUMBER_SCHEMA,
        bounded: BOOLEAN_SCHEMA,
      },
    },
    series: {
      type: SchemaType.OBJECT,
      properties: {
        values: NUMBER_ARRAY_SCHEMA,
        labels: STRING_ARRAY_SCHEMA,
      },
    },
    identity: {
      type: SchemaType.OBJECT,
      properties: {
        name: STRING_SCHEMA,
        role: STRING_SCHEMA,
        avatar: STRING_SCHEMA,
      },
    },
    media: {
      type: SchemaType.OBJECT,
      properties: {
        role: STRING_SCHEMA,
        url: STRING_SCHEMA,
      },
    },
    quote: {
      type: SchemaType.OBJECT,
      properties: {
        text: STRING_SCHEMA,
        author: STRING_SCHEMA,
      },
    },
    truth: {
      type: SchemaType.OBJECT,
      properties: {
        polarity: STRING_SCHEMA,
        negated: BOOLEAN_SCHEMA,
        refuted: BOOLEAN_SCHEMA,
        warranted: BOOLEAN_SCHEMA,
      },
    },
    relation: {
      type: SchemaType.OBJECT,
      properties: {
        from: STRING_SCHEMA,
        to: STRING_SCHEMA,
        relation: STRING_SCHEMA,
        kind: STRING_SCHEMA,
      },
    },
    items: STRING_ARRAY_SCHEMA,
    annotation: STRING_SCHEMA,
    badge: STRING_SCHEMA,
    kicker: STRING_SCHEMA,
  },
};

export const CREATIVE_BRIEF_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    video_understanding: {
      type: SchemaType.OBJECT,
      properties: {
        primary_content: STRING_SCHEMA,
        shot_scale: STRING_SCHEMA,
        lighting: STRING_SCHEMA,
        production_quality: NUMBER_SCHEMA,
        environment: STRING_SCHEMA,
        speaker_count: NUMBER_SCHEMA,
        has_b_roll: BOOLEAN_SCHEMA,
      },
      required: ['primary_content', 'shot_scale', 'lighting', 'production_quality', 'environment', 'speaker_count', 'has_b_roll'],
    },
    narrative_arc: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          section_id: NUMBER_SCHEMA,
          start_word_idx: NUMBER_SCHEMA,
          end_word_idx: NUMBER_SCHEMA,
          start_timestamp_ms: NUMBER_SCHEMA,
          end_timestamp_ms: NUMBER_SCHEMA,
          label: STRING_SCHEMA,
          energy_level: STRING_SCHEMA,
          mood: STRING_SCHEMA,
          pacing_feel: STRING_SCHEMA,
        },
        required: ['section_id', 'label', 'energy_level', 'mood', 'pacing_feel'],
      },
    },
    decisions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: STRING_SCHEMA,
          target_word_idx: NUMBER_SCHEMA,
          target_source_asset_id: STRING_SCHEMA,
          target_source_word_idx: NUMBER_SCHEMA,
          target_timestamp_ms: NUMBER_SCHEMA,
          target_beat_idx: NUMBER_SCHEMA,
          confidence: NUMBER_SCHEMA,
          reason: STRING_SCHEMA,
          params: {
            type: SchemaType.OBJECT,
            properties: {
              text: STRING_SCHEMA,
              title: STRING_SCHEMA,
              body: STRING_SCHEMA,
              value: STRING_SCHEMA,
              label: STRING_SCHEMA,
              name: STRING_SCHEMA,
              author: STRING_SCHEMA,
              quote: STRING_SCHEMA,
              from: STRING_SCHEMA,
              to: STRING_SCHEMA,
              relation: STRING_SCHEMA,
              items: STRING_ARRAY_SCHEMA,
              intent: STRING_SCHEMA,
              semanticAtoms: SEMANTIC_ATOMS_RESPONSE_SCHEMA,
            },
          },
        },
        required: ['type', 'confidence', 'reason', 'params'],
      },
    },
    audio_design: {
      type: SchemaType.OBJECT,
      properties: {
        ambient_bed: STRING_SCHEMA,
        ducking_profile: STRING_SCHEMA,
      },
      required: ['ambient_bed', 'ducking_profile'],
    },
    caption_style: STRING_SCHEMA,
    overall_pacing: STRING_SCHEMA,
  },
  required: ['video_understanding', 'narrative_arc', 'decisions', 'audio_design', 'caption_style', 'overall_pacing'],
};
// ─── Types ──────────────────────────────────────────────────────────────────

export type ContentMode = 'speech' | 'music' | 'visual' | 'hybrid';

export type BriefDecisionType =
  | 'zoom_push' | 'zoom_punch' | 'zoom_pull_back' | 'zoom_drift'
  | 'transition_dissolve' | 'transition_hard_cut' | 'transition_whip_pan'
  | 'transition_fade_to_black' | 'transition_flash' | 'transition_j_cut'
  | 'transition_l_cut' | 'transition_soft_cut' | 'transition_wipe'
  | 'caption_emphasis'
  | 'sfx_whoosh' | 'sfx_impact' | 'sfx_shimmer' | 'sfx_ambient'
  | 'speed_slow_motion' | 'speed_ramp'
  | 'graphic_stat_counter' | 'graphic_lower_third' | 'graphic_callout'
  | 'graphic_keyword_highlight' | 'graphic_quote_card' | 'graphic_logo_reveal'
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
  | 'opening_hook' | 'closing_zone'
  | 'motion_peak' | 'visual_peak' | 'beat_accent';

export interface BriefDecision {
  type: BriefDecisionType;
  targetWordIdx: number;
  targetSourceAssetId?: string;
  targetSourceWordIdx?: number;
  targetTimestampMs?: number;
  targetBeatIdx?: number;
  confidence: number;
  reason: DecisionReason;
  params: Record<string, unknown>;
}

export type NarrativeSectionLabel =
  | 'setup' | 'build' | 'peak' | 'resolve' | 'transition' | 'hook' | 'closing'
  | 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' | 'drop';

export interface NarrativeSection {
  sectionId: number;
  startWordIdx: number;
  endWordIdx: number;
  startTimestampMs?: number;
  endTimestampMs?: number;
  label: NarrativeSectionLabel;
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
  contentMode: ContentMode;
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
  transcription: { word: string; startMs: number; endMs: number; assetId?: string; originalWordIndex?: number }[];
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
  musicFeatures?: {
    beats: { timestampMs: number; strength: number }[];
    sections: { startMs: number; endMs: number; label: string }[];
    bpm?: number;
  };
}

// ─── Main Function ──────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.5;

// ─── Content Mode Routing (D-004) ──────────────────────────────────────────

// Thresholds — Phase 7 calibration scope (D-011)
const SPEECH_COVERAGE_THRESHOLD = 0.6;  // ⚠️ INVENTED — D-004
const MUSIC_PRESENCE_THRESHOLD = 0.6;   // ← CRG constraint: music_energy > 0.6 for music-dominant (graph node signal:audio.music_beat)
const VISUAL_CHANGE_THRESHOLD = 0.3;    // ⚠️ INVENTED — D-004
const MIN_BEAT_DENSITY_BPM = 20;        // ⚠️ INVENTED — ambient/drone < 20 BPM. Slowest rhythmic music (ballads ~60) well above. Needs calibration.
const NON_SPEECH_CEILING = 0.3;         // ← CRG constraint: speech_energy < 0.3 for music/visual mode

export interface RoutingThresholds {
  speechCoverage: number;
  musicPresence: number;
  visualChange: number;
  nonSpeechCeiling: number;
  minBeatDensityBpm: number;
}

export const DEFAULT_ROUTING_THRESHOLDS: RoutingThresholds = {
  speechCoverage: SPEECH_COVERAGE_THRESHOLD,
  musicPresence: MUSIC_PRESENCE_THRESHOLD,
  visualChange: VISUAL_CHANGE_THRESHOLD,
  nonSpeechCeiling: NON_SPEECH_CEILING,
  minBeatDensityBpm: MIN_BEAT_DENSITY_BPM,
};

export function routeContentType(signals: {
  speechCoverage: number;
  musicPresence: number;
  visualChangeRate: number;
  beatDensityBpm?: number;
}, thresholds?: RoutingThresholds): ContentMode {
  const t = thresholds ?? DEFAULT_ROUTING_THRESHOLDS;
  if (signals.speechCoverage > t.speechCoverage) return 'speech';

  const hasRhythm = signals.beatDensityBpm === undefined || signals.beatDensityBpm >= t.minBeatDensityBpm;
  if (signals.musicPresence > t.musicPresence && signals.speechCoverage < t.nonSpeechCeiling && hasRhythm) return 'music';
  if (signals.visualChangeRate > t.visualChange && signals.speechCoverage < t.nonSpeechCeiling) return 'visual';
  return 'hybrid';
}

export async function generateCreativeBrief(
  videoContext: VideoContext,
  preferences: UserEditPreferences,
  geminiFileUri?: string,
  genreParams?: GenreParameters,
  contentMode?: ContentMode,
  pipelineWarnings?: PipelineWarningCollector,
): Promise<CreativeBrief | null> {
  const startTime = Date.now();
  const mode = contentMode ?? 'speech';

  try {
    console.log(`[CreativeBrief] Starting generation (mode=${mode}, ${videoContext.transcription.length} words, ${videoContext.segmentCount} segments, geminiFileUri=${!!geminiFileUri}, genreParams=${!!genreParams})`);

    const model = await getCreativeDocCachedModel();
    console.log('[CreativeBrief] Model obtained from context cache');

    const budget = genreParams ? computeDecisionBudget(genreParams, videoContext.totalDurationSec) : null;
    let prompt: string;
    if (mode === 'speech' || mode === 'hybrid') {
      prompt = buildPrompt(videoContext, preferences, genreParams, budget);
    } else if (mode === 'music') {
      prompt = buildMusicPrompt(videoContext, preferences, genreParams, budget);
    } else {
      prompt = buildVisualPrompt(videoContext, preferences, genreParams, budget);
    }
    console.log(`[CreativeBrief] Prompt built (mode=${mode}, ${prompt.length} chars, budget=${budget ? Object.keys(budget).length + ' categories' : 'none'})`);

    const generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: CREATIVE_BRIEF_RESPONSE_SCHEMA,
      temperature: 0.3,
      seed: 42,
      maxOutputTokens: 65536,
    };

    const parts: any[] = [{ text: prompt }];

    // If video file URI available, include it for Gemini to watch
    if (geminiFileUri) {
      parts.unshift({
        fileData: { mimeType: 'video/mp4', fileUri: geminiFileUri },
      });
      console.log(`[CreativeBrief] Video file attached: ${geminiFileUri.substring(0, 80)}...`);
    }

    // Retry with different seeds on JSON parse failure.
    // Batch testing showed ~20% JSON parse failure rate on seed 42.
    // Different seeds produce different completion paths, often fixing truncation.
    const seeds = [generationConfig.seed, 7, 99];
    for (const seed of seeds) {
      try {
        console.log(`[CreativeBrief] Calling Gemini (seed=${seed})...`);
        const result = await model.generateContent({
          contents: [{ role: 'user', parts }],
          generationConfig: { ...generationConfig, seed },
        });

        const responseText = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) {
          console.warn(`[CreativeBrief] Empty response (seed=${seed}), retrying...`);
          continue;
        }

        console.log(`[CreativeBrief] Gemini responded (${responseText.length} chars, seed=${seed}). Parsing JSON...`);

        const parsed = JSON.parse(responseText);
        const brief = validateAndGate(parsed, startTime, budget, mode);

        if (brief) {
          console.log(`[CreativeBrief] SUCCESS: ${brief.decisions.length} decisions, pacing=${brief.overallPacing}, ${brief.narrativeArc.length} sections`);
          return brief;
        }
        console.warn(`[CreativeBrief] validateAndGate returned null (seed=${seed}), retrying...`);
      } catch (parseErr: any) {
        console.warn(`[CreativeBrief] Parse/validation failed (seed=${seed}): ${parseErr.message.substring(0, 80)}`);
      }
    }

    console.error('[CreativeBrief] All seeds failed — returning null');
    return null;
  } catch (err: any) {
    console.error(`[CreativeBrief] Generation FAILED: ${err.message}`);
    console.error(`[CreativeBrief] Stack: ${err.stack?.split('\n').slice(0, 3).join(' | ')}`);
    pipelineWarnings?.errorSwallowed('director', err instanceof Error ? err : new Error(String(err)), 'creative brief generation');
    return null;
  }
}

// ─── Prompt Construction (Rule 35: XML structure, data LAST) ────────────────

export type BudgetMap = Record<string, { min: number; max: number }>;

function buildPrompt(
  ctx: VideoContext,
  prefs: UserEditPreferences,
  genreParams?: GenreParameters | null,
  budget?: BudgetMap | null,
): string {
  const prefsBlock = Object.entries(prefs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');

  const transcriptBlock = ctx.transcription
    .map((w, i) => {
      const sourceAddress = w.assetId && typeof w.originalWordIndex === 'number'
        ? ` source=${w.assetId}:${w.originalWordIndex}`
        : '';
      return `[${i}${sourceAddress}] ${w.word} (${w.startMs}-${w.endMs}ms)`;
    })
    .join('\n');

  const featuresBlock = buildFeaturesBlock(ctx);

  const genreBlock = genreParams ? buildGenreBlock(genreParams) : '';
  const budgetBlock = budget ? buildBudgetBlock(budget) : '';
  const signalMapBlock = buildSignalDecisionMap(ctx, genreParams);
  const validTypesBlock = buildValidTypesBlock();
  const validReasonsBlock = [...VALID_DECISION_REASONS].join(', ');

  return `<role>
You are a professional video editor watching THIS specific video and making creative decisions based on what you see and hear. You have craft knowledge in your context. Do not apply templates or category-based rules — respond to THIS content.
</role>

<your_scope>
The transcript below has ALREADY been cleaned by a separate system. Silence, retakes, filler words, and false starts are removed. The word indices point to CLEAN content only.

You handle CREATIVE ENHANCEMENT:
- WHERE to zoom for emotional emphasis (what moment deserves visual weight?)
- WHERE transitions mark narrative shifts (topic change, energy shift, new chapter)
- WHAT SFX punctuate genuine beats (not every cut — only moments that EARN sound)
- WHAT graphics surface key information (a number worth visualizing, a name worth displaying)
- WHERE caption emphasis draws focus to power words
- WHERE pacing adjustments serve the story (hold moments, compress dead spots)

You do NOT handle: silence removal, filler cuts, retake selection, segment ordering, jump cuts. These are already done. Do NOT output cut or jump_cut decisions.
</your_scope>
${genreBlock}
${budgetBlock}
${signalMapBlock}
${CREATIVE_BRIEF_FACT_AUTHORITY_CONTRACT}

<valid_types>
Use ONLY these exact type strings. Any other type will be silently dropped.
These are compatibility family tags for validation only, not final visual/audio form instructions.
${validTypesBlock}
</valid_types>

<valid_reasons>
Use ONLY these exact reason strings: ${validReasonsBlock}
</valid_reasons>

<anti_patterns>
- NEVER produce cut, jump_cut, or hard_cut type decisions — the transcript editor handles all cuts.
- NEVER assign the same confidence to every decision. Vary 0.55-0.95 based on certainty. Your BEST decisions get 0.90-0.95. Decent ones 0.70-0.85. Uncertain ones 0.55-0.65.
- NEVER place SFX on every transition. SFX marks MOMENTS, not cuts.
- NEVER cluster decisions in one section. Each third of the video should have roughly equal decision count.
- NEVER use more than 3 consecutive decisions of the same type category.
- NEVER exceed the budget maximums above. Fewer confident decisions beat many uncertain ones.
- NEVER use caption_emphasis as the dominant type. Zooms, transitions, and SFX should collectively outnumber caption_emphasis decisions. Captions are SUPPORTING, not the main edit.
- NEVER use "cta" reason unless the speaker is literally asking the viewer to DO something (subscribe, click, buy, visit). "cta" is NOT a synonym for "important word".
- NEVER place all your decisions in the first half. EVERY narrative_arc section MUST have at least one decision. If your last decision is before word ${Math.floor(ctx.transcription.length * 0.7)}, you are truncating the video.
- GENERATE DECISIONS FOR THE FULL VIDEO. Spread them evenly: ~${Math.max(1, Math.floor(52 / Math.max(ctx.transcription.length / 500, 1)))} decisions per 500 words. Cover words 0 through ${ctx.transcription.length - 1}.
</anti_patterns>

<graphic_rules>
The type is only a timing/budget category, not a visual preset. For every graphic decision, put the real meaning in params.semanticAtoms so the atomic MG resolver can choose form from structure + signals.

semanticAtoms schema (include only facts supported by transcript/video evidence):
{
  "concept": "core idea or term",
  "claim": "short factual claim in speaker words",
  "evidencePhrase": "nearby transcript phrase proving this graphic",
  "keyword": "exact term to emphasize when useful",
  "text": { "primary": "headline/title", "secondary": "supporting phrase", "keyword": "specific term", "phrase": "source phrase" },
  "quantity": { "displayText": "73%", "label": "user satisfaction", "kind": "percentage|currency|count|duration|fraction", "unit": "%|$|seconds|etc", "denominator": number, "bounded": boolean },
  "series": { "values": [numbers only], "labels": ["labels for values"] },
  "identity": { "name": "person/company/product name", "role": "speaker role/title when stated", "avatar": "known image URL only if provided by context" },
  "media": { "role": "avatar|image|logo", "url": "provided media URL only" },
  "quote": { "text": "verbatim quote", "author": "speaker/entity when stated" },
  "truth": { "polarity": "true|false|mixed|uncertain", "negated": boolean, "refuted": boolean, "warranted": boolean },
  "relation": { "from": "before/source/group A", "to": "after/result/group B", "relation": "vs|arrow", "kind": "contrast|cause|part_of_whole|rank|sequence" },
  "items": ["list/ranked steps when explicitly present"],
  "badge": "rank/status label",
  "annotation": "small explanatory note",
  "kicker": "short category label"
}

Never invent atom facts. If the transcript only supports a simple fact, emit simple atoms. If it supports comparison, list, rank, identity, quote, truth/negation, proportion, or multiple numbers, emit those atoms instead of flattening the idea into only title/body/text. These atoms are semantic facts, NOT visual presets. Do not say "box", "lower left", "counter", "bar chart", "circle", or animation names inside semanticAtoms.

Graphics are NOT decoration — they surface KEY INFORMATION. Use the MOST SPECIFIC type for each moment:

graphic_stat_counter — ONLY when a specific, impactful number is spoken. params: { value: "73%", label: "user satisfaction" }. Use the EXACT number from the transcript. Never invent numbers. "seventy-three percent" → value="73%". Skip vague quantities ("a few", "some", "2 or 3").

graphic_lower_third — FIRST mention of a named person, company, or product. params: { name: "Hank Green", title: "YouTuber" }. Title is optional but preferred. Do NOT repeat for the same entity. One lower-third per entity per video. The name MUST appear in the transcript — NEVER invent names. If you cannot find the person's actual name in the transcript, do NOT create a lower-third.

graphic_callout — Key CONCEPTS that benefit from visual explanation. params: { title: "Selection Bias", body: "When your sample isn't random" }. Heavier than keyword-highlight. Use for ideas that deserve 2+ words of context, not single words.

graphic_quote_card — Direct QUOTES or standout assertions worth displaying verbatim. params: { quote: "The data doesn't lie", author: "Speaker Name" }. Use the speaker's EXACT words from transcript. Max 2-3 per video. Author is optional.

graphic_keyword_highlight — Quick pop for a DOMAIN-SPECIFIC term worth remembering. params: { text: "selection bias" }. The LIGHTEST graphic. ONLY highlight: A) branded/product terms from the speaker's domain, B) technical terms introduced for the FIRST TIME in the video, C) thesis-defining phrases the speaker repeats 2+ times. NEVER highlight: common verbs (download, leave, click, want), everyday nouns (people, thing, internet, problem), filler, slang, profanity. Test: would this word appear in the video's glossary or index? If not, don't highlight it.

graphic_logo_reveal — Brand/logo moment at opening or closing only. Max 2 per video.

PRIORITY ORDER when multiple graphics could apply to one moment: stat-counter > lower-third > quote-card > callout > keyword-highlight.
Do NOT default to keyword-highlight for everything. If a number is spoken, use stat-counter. If a name is introduced, use lower-third. If an assertion is powerful, use quote-card.
</graphic_rules>

<rules>
- Word indices MUST be between 0 and ${ctx.transcription.length - 1}. There are exactly ${ctx.transcription.length} words.
- If a transcript word includes a source=assetId:wordIndex address, copy it into target_source_asset_id and target_source_word_idx for that exact word. This is provenance for the native planner, not a visual instruction.
- Confidence score 0.0-1.0 per decision. Below 0.5 = executor skips it.
- narrative_arc sections must cover the ENTIRE transcription (no gaps).
- Distribute decisions across the FULL video length, not clustered at start or end.
- Respect constraints from the creative knowledge doc in your context.
- Match user preferences below if specified.
</rules>

<output_format>
{
  "video_understanding": { "primary_content": string, "shot_scale": string, "lighting": string, "production_quality": 0-1, "environment": string, "speaker_count": number, "has_b_roll": boolean },
  "narrative_arc": [{ "section_id": number, "start_word_idx": number, "end_word_idx": number, "label": "setup"|"build"|"peak"|"resolve"|"transition"|"hook"|"closing", "energy_level": "low"|"building"|"high"|"declining"|"neutral", "mood": string, "pacing_feel": "calm"|"measured"|"balanced"|"energetic"|"fast" }],
  "decisions": [{ "type": "<valid_type>", "target_word_idx": number, "target_source_asset_id": string, "target_source_word_idx": number, "confidence": 0.55-0.95, "reason": "<valid_reason>", "params": { "...required_params_for_type": "...", "semanticAtoms": { "concept": string, "claim": string, "evidencePhrase": string, "text": { "primary": string, "secondary": string, "keyword": string, "phrase": string }, "quantity": { "displayText": string, "label": string, "kind": string, "unit": string, "denominator": number, "bounded": boolean }, "series": { "values": number[], "labels": string[] }, "identity": { "name": string, "role": string, "avatar": string }, "media": { "role": "avatar|image|logo", "url": string }, "quote": { "text": string, "author": string }, "truth": { "polarity": string, "negated": boolean, "refuted": boolean, "warranted": boolean }, "relation": { "from": string, "to": string, "relation": "vs|arrow", "kind": string }, "items": string[], "annotation": string, "badge": string, "kicker": string } } }],
  "audio_design": { "ambient_bed": string, "ducking_profile": "standard_speech"|"music_dominant"|"balanced" },
  "caption_style": "word_by_word"|"sentence"|"key_phrases"|"none",
  "overall_pacing": "calm"|"measured"|"balanced"|"energetic"|"fast"
}
</output_format>

<user_preferences>
${prefsBlock || '  (none specified — use your best creative judgment within the guardrails above)'}
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

// ─── Music Prompt (beat/timestamp coordinates) ────────────────────────────

function buildMusicPrompt(
  ctx: VideoContext,
  prefs: UserEditPreferences,
  genreParams?: GenreParameters | null,
  budget?: BudgetMap | null,
): string {
  const prefsBlock = Object.entries(prefs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');

  const featuresBlock = buildFeaturesBlock(ctx);
  const genreBlock = genreParams ? buildGenreBlock(genreParams) : '';
  const budgetBlock = budget ? buildBudgetBlock(budget) : '';
  const signalMapBlock = buildSignalDecisionMap(ctx, genreParams);
  const validTypesBlock = buildValidTypesBlock();
  const validReasonsBlock = [...VALID_DECISION_REASONS].join(', ');

  const beatsBlock = ctx.musicFeatures?.beats?.length
    ? ctx.musicFeatures.beats.map((b, i) => `[${i}] ${b.timestampMs}ms (strength=${b.strength.toFixed(2)})`).join('\n')
    : '(no beat data available — use audio energy curve timestamps)';

  const sectionsBlock = ctx.musicFeatures?.sections?.length
    ? ctx.musicFeatures.sections.map((s, i) => `[${i}] ${s.startMs}-${s.endMs}ms: ${s.label}`).join('\n')
    : '(no section data — treat as one continuous section)';

  const bpmInfo = ctx.musicFeatures?.bpm ? `BPM: ${ctx.musicFeatures.bpm}` : '';

  // ⚠️ INVENTED threshold — 60 BPM. Below this, beat-driven editing less effective. Needs calibration.
  const beatCount = ctx.musicFeatures?.beats?.length ?? 0;
  const beatsPerMin = ctx.totalDurationSec > 0 ? beatCount / (ctx.totalDurationSec / 60) : 0;
  const isSparseRhythm = beatsPerMin < 60;
  const isAmbient = beatsPerMin < MIN_BEAT_DENSITY_BPM;

  const rhythmAdaptation = isAmbient
    ? `\n<rhythm_adaptation>
AMBIENT / TONAL CONTENT — no clear rhythmic pattern detected (${beatCount} beats in ${ctx.totalDurationSec.toFixed(0)}s).
- Do NOT use target_beat_idx. Use target_timestamp_ms ONLY.
- Edit to ENERGY DYNAMICS: volume swells, texture changes, tonal shifts, frequency sweeps.
- Place decisions at moments where the sonic landscape CHANGES — not on arbitrary timestamps.
- Pacing should be measured or calm. This content breathes. Do not over-edit.
- Favor dissolves and slow zooms over hard cuts and punches.
</rhythm_adaptation>\n`
    : isSparseRhythm
      ? `\n<rhythm_adaptation>
SLOW / NON-METRONOMIC RHYTHM (${beatsPerMin.toFixed(0)} BPM). Beat indices may be unreliable.
- Prefer target_timestamp_ms over target_beat_idx.
- Focus on PHRASE BOUNDARIES and dynamic contours rather than individual beats.
- Musical sections matter more than individual beats — edit at section changes.
- Energy rises and falls are your primary guide, not metronomic beat positions.
</rhythm_adaptation>\n`
      : '';

  return `<role>
You are a professional music video editor making creative decisions based on rhythm, energy, and musical structure. You edit to the BEAT, not to words. Your decisions align with musical moments — drops, section changes, energy peaks.
</role>

<your_scope>
This is music-dominant content with minimal or no speech. Your coordinate system is TIMESTAMPS (milliseconds), not word indices.

You handle CREATIVE ENHANCEMENT:
- WHERE to zoom for rhythmic emphasis (drops, builds, beat accents)
- WHERE transitions mark musical section changes (verse→chorus, chorus→bridge)
- WHAT SFX punctuate genuine musical moments (drops, builds, breakdowns)
- WHERE speed changes create dramatic effect (slow-mo on drops, ramps on builds)
- WHERE pacing adjustments serve the musical structure

Output decisions use target_timestamp_ms (milliseconds from video start) and optionally target_beat_idx (index into the beat array below).
Do NOT use target_word_idx — this content has no speech transcript.
</your_scope>
${rhythmAdaptation}${genreBlock}
${budgetBlock}
${signalMapBlock}
${CREATIVE_BRIEF_FACT_AUTHORITY_CONTRACT}

<valid_types>
Use ONLY these exact type strings. Any other type will be silently dropped.
These are compatibility family tags for validation only, not final visual/audio form instructions.
${validTypesBlock}
</valid_types>

<valid_reasons>
Use ONLY these exact reason strings: ${validReasonsBlock}
</valid_reasons>

<anti_patterns>
- NEVER place a decision on every beat. Pick the beats that MATTER — downbeats of new sections, drops, energy peaks.
- NEVER lock 6+ consecutive decisions to exact beat positions — this is the strongest "AI edited this" tell. Vary timing ±2-3 frames. Syncopation is life, metronomic precision is death. (CRG: constraint:temporal.metronomic_beat_sync, deduction -5)
- NEVER assign the same confidence to every decision. Vary 0.55-0.95.
- NEVER cluster decisions in one section. Each section should have proportional decisions.
- NEVER use caption_emphasis or graphic_keyword_highlight — no speech to highlight.
- NEVER exceed the budget maximums. Fewer confident decisions beat many uncertain ones.
- GENERATE DECISIONS FOR THE FULL TRACK. Cover 0ms through ${Math.round(ctx.totalDurationSec * 1000)}ms.
</anti_patterns>

<rules>
- target_timestamp_ms MUST be between 0 and ${Math.round(ctx.totalDurationSec * 1000)}. Duration is ${ctx.totalDurationSec}s.
- target_beat_idx (optional) MUST be between 0 and ${(ctx.musicFeatures?.beats?.length ?? 1) - 1} if used.
- Confidence score 0.0-1.0 per decision. Below 0.5 = executor skips it.
- narrative_arc sections use start_timestamp_ms / end_timestamp_ms (NOT word indices). Must cover full duration.
- Distribute decisions across the FULL track, not clustered at start or end.
- Match user preferences below if specified.
</rules>

<output_format>
{
  "video_understanding": { "primary_content": string, "shot_scale": string, "lighting": string, "production_quality": 0-1, "environment": string, "speaker_count": 0, "has_b_roll": boolean },
  "narrative_arc": [{ "section_id": number, "start_timestamp_ms": number, "end_timestamp_ms": number, "start_word_idx": -1, "end_word_idx": -1, "label": "intro"|"verse"|"chorus"|"bridge"|"outro"|"drop"|"build"|"peak"|"transition", "energy_level": "low"|"building"|"high"|"declining"|"neutral", "mood": string, "pacing_feel": "calm"|"measured"|"balanced"|"energetic"|"fast" }],
  "decisions": [{ "type": "<valid_type>", "target_timestamp_ms": number, "target_beat_idx": number, "target_word_idx": -1, "confidence": 0.55-0.95, "reason": "<valid_reason>", "params": { ...required_params_for_type } }],
  "audio_design": { "ambient_bed": string, "ducking_profile": "music_dominant" },
  "caption_style": "none",
  "overall_pacing": "calm"|"measured"|"balanced"|"energetic"|"fast"
}
</output_format>

<user_preferences>
${prefsBlock || '  (none specified — use your best creative judgment)'}
</user_preferences>

<video_features>
Duration: ${ctx.totalDurationSec}s
Segments: ${ctx.segmentCount}
${bpmInfo}
${featuresBlock}
</video_features>

<music_structure>
<beats>
${beatsBlock}
</beats>
<sections>
${sectionsBlock}
</sections>
</music_structure>`;
}

// ─── Visual Prompt (timestamp coordinates, scene-driven) ──────────────────

function buildVisualPrompt(
  ctx: VideoContext,
  prefs: UserEditPreferences,
  genreParams?: GenreParameters | null,
  budget?: BudgetMap | null,
): string {
  const prefsBlock = Object.entries(prefs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');

  const featuresBlock = buildFeaturesBlock(ctx);
  const genreBlock = genreParams ? buildGenreBlock(genreParams) : '';
  const budgetBlock = budget ? buildBudgetBlock(budget) : '';
  const signalMapBlock = buildSignalDecisionMap(ctx, genreParams);
  const validTypesBlock = buildValidTypesBlock();
  const validReasonsBlock = [...VALID_DECISION_REASONS].join(', ');

  const hasVjepa = !!ctx.vjepaFeatures?.segments?.length;
  const segmentsBlock = hasVjepa
    ? ctx.vjepaFeatures!.segments!.map((s, i) =>
        `[${i}] ${s.startMs}-${s.endMs}ms (significance=${s.visualSignificance.toFixed(2)}, motion=${s.motionIntensity.toFixed(2)})`
      ).join('\n')
    : '(no visual segment data — use video features timestamps)';

  // ⚠️ INVENTED threshold — 0.3. CRG: motion_intensity > 0.7 high, < 0.2 static. 0.3 = static-to-moderate boundary. Needs calibration.
  const avgMotion = hasVjepa
    ? ctx.vjepaFeatures!.segments!.reduce((sum, s) => sum + s.motionIntensity, 0) / ctx.vjepaFeatures!.segments!.length
    : null;

  const visualAdaptation = !hasVjepa
    ? `\n<data_adaptation>
No visual analysis data available. Use these editing strategies:
- Place transitions at natural shot/scene boundaries visible in video features (lighting or shot scale changes).
- Divide the video into temporal segments — place decisions at natural thirds and two-thirds points within each segment.
- Use zoom_push on static shots longer than 4 seconds to add visual movement.
- Use zoom_drift to add subtle lateral movement to otherwise static compositions.
- Use motion_peak reason for decisions near action moments, visual_peak for composition-significant moments.
- Pacing: use balanced or measured unless content clearly warrants energetic editing.
</data_adaptation>\n`
    : avgMotion !== null && avgMotion < 0.3
      ? `\n<pacing_adaptation>
LOW-MOTION content detected (average motion intensity: ${avgMotion.toFixed(2)}). Adapt your editing:
- Use MEASURED or CALM pacing — do not over-edit scenic or contemplative content.
- Favor transition_dissolve over transition_hard_cut between scenes.
- Hold shots longer — beauty and atmosphere need breathing room.
- Use zoom_push sparingly for Ken Burns effect on landscape/scenic shots.
- zoom_drift adds subtle movement to static compositions — use it.
- Do NOT use camera_shake — it conflicts with contemplative content.
- Fewer, higher-confidence decisions. Quality over quantity.
</pacing_adaptation>\n`
      : '';

  return `<role>
You are a professional video editor working with visual-dominant content (no speech). You edit based on VISUAL RHYTHM — shot changes, motion peaks, visual significance, and scene composition. Your decisions enhance the visual storytelling.
</role>

<your_scope>
This is visual-dominant content with minimal or no speech. Your coordinate system is TIMESTAMPS (milliseconds from video start).

You handle CREATIVE ENHANCEMENT:
- WHERE to zoom for visual emphasis (subject reveal, motion peaks, significant moments)
- WHERE transitions mark scene changes (shot boundaries, location changes)
- WHAT SFX punctuate visual moments (impacts on motion peaks, shimmers on reveals)
- WHERE speed changes create dramatic effect (slow-mo on action, ramps on reveals)
- WHERE to break visual monotony (drift on static shots)

Output decisions use target_timestamp_ms (milliseconds from video start).
Do NOT use target_word_idx — this content has no speech transcript.
</your_scope>
${visualAdaptation}${genreBlock}
${budgetBlock}
${signalMapBlock}
${CREATIVE_BRIEF_FACT_AUTHORITY_CONTRACT}

<valid_types>
Use ONLY these exact type strings. Any other type will be silently dropped.
These are compatibility family tags for validation only, not final visual/audio form instructions.
${validTypesBlock}
</valid_types>

<valid_reasons>
Use ONLY these exact reason strings: ${validReasonsBlock}
</valid_reasons>

<anti_patterns>
- NEVER place a transition at every shot change. Most shot changes are natural hard cuts — add transitions only at MEANINGFUL boundaries.
- NEVER assign the same confidence to every decision. Vary 0.55-0.95.
- NEVER cluster decisions in one section. Distribute across the full duration.
- NEVER use caption_emphasis or graphic_keyword_highlight — no speech to highlight.
- NEVER exceed the budget maximums. Fewer confident decisions beat many uncertain ones.
- GENERATE DECISIONS FOR THE FULL VIDEO. Cover 0ms through ${Math.round(ctx.totalDurationSec * 1000)}ms.
</anti_patterns>

<rules>
- target_timestamp_ms MUST be between 0 and ${Math.round(ctx.totalDurationSec * 1000)}. Duration is ${ctx.totalDurationSec}s.
- Confidence score 0.0-1.0 per decision. Below 0.5 = executor skips it.
- narrative_arc sections use start_timestamp_ms / end_timestamp_ms (NOT word indices). Must cover full duration.
- Distribute decisions across the FULL video, not clustered at start or end.
- Match user preferences below if specified.
</rules>

<output_format>
{
  "video_understanding": { "primary_content": string, "shot_scale": string, "lighting": string, "production_quality": 0-1, "environment": string, "speaker_count": 0, "has_b_roll": boolean },
  "narrative_arc": [{ "section_id": number, "start_timestamp_ms": number, "end_timestamp_ms": number, "start_word_idx": -1, "end_word_idx": -1, "label": "setup"|"build"|"peak"|"resolve"|"transition"|"hook"|"closing", "energy_level": "low"|"building"|"high"|"declining"|"neutral", "mood": string, "pacing_feel": "calm"|"measured"|"balanced"|"energetic"|"fast" }],
  "decisions": [{ "type": "<valid_type>", "target_timestamp_ms": number, "target_word_idx": -1, "confidence": 0.55-0.95, "reason": "<valid_reason>", "params": { ...required_params_for_type } }],
  "audio_design": { "ambient_bed": string, "ducking_profile": "balanced" },
  "caption_style": "none",
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

<visual_segments>
${segmentsBlock}
</visual_segments>`;
}

// ─── Genre Parameters Block ─────────────────────────────────────────────────

function buildGenreBlock(gp: GenreParameters): string {
  return `
<this_video>
These parameters describe THIS specific video, computed from its actual audio and speech signals. Use them as guardrails.

pacing_tolerance: ${gp.pacing_tolerance} — seconds between edit points (range 2-15)
transition_density: ${gp.transition_density} — suggested transitions per minute (range 2-25)
zoom_budget: ${gp.zoom_budget} — total zooms for entire video (range 1-15)
sfx_density: ${gp.sfx_density} — SFX-to-transition ratio (range 0-1)
graphic_density: ${gp.graphic_density} — graphics per minute (range 0-8)
formality: ${gp.formality} — 0=casual 1=corporate (range 0-1)
energy_baseline: ${gp.energy_baseline} — speaker average energy (range 0.2-0.8)
silence_tolerance: ${gp.silence_tolerance} — acceptable pause length in seconds (range 0.3-5)
</this_video>`;
}

// ─── Decision Budget Block ──────────────────────────────────────────────────

function buildBudgetBlock(budget: BudgetMap): string {
  const lines = Object.entries(budget)
    .map(([cat, { min, max }]) => cat === 'graphic'
      ? '  graphic: warranted semantic facts only; native planner guards clutter/runaway density'
      : `  ${cat}: ${min}-${max}`)
    .join('\n');
  const countedBudgets = Object.entries(budget).filter(([cat]) => cat !== 'graphic');
  const totalMin = countedBudgets.reduce((s, [, b]) => s + b.min, 0);
  const totalMax = countedBudgets.reduce((s, [, b]) => s + b.max, 0);
  return `
<decision_budget>
Per-category limits for this video (computed from its parameters):
${lines}
  TOTAL_NON_GRAPHIC: ${totalMin}-${totalMax} decisions
Graphics are not source-capped here; emit every grounded semantic graphic fact and let the native planner/license/budget guardrail decide final density.
Exceeding any non-graphic category maximum makes your output invalid.
</decision_budget>`;
}

// ─── Signal → Decision Map (two-tier, filtered) ─────────────────────────────
function buildSignalDecisionMap(ctx: VideoContext, genreParams?: GenreParameters | null): string {
  const detected = detectSignalsFromContext(ctx, genreParams);
  const { active, available } = partitionRegistry(detected);

  const activeLines: string[] = [];
  const grouped = groupBySignal(active);
  for (const [signal, entries] of grouped) {
    activeLines.push(`SIGNAL: ${signal}`);
    for (const e of entries) {
      const paramsStr = e.requiredParams.length > 0
        ? ` (${e.requiredParams.map(p => `${p}: ${typeof e.defaultParams[p] === 'string' ? `"${e.defaultParams[p]}"` : e.defaultParams[p]}`).join(', ')})`
        : '';
      activeLines.push(`  → ${e.type}${paramsStr} — ${e.promptHint}`);
    }
  }

  const availableStr = available.length > 0
    ? `\nAlso available if you see moments the signal pipeline missed:\n  ${available.map(e => `${e.signal} → ${e.type}`).join(' | ')}`
    : '';

  return `
<signal_decision_map>
These signals were DETECTED in this video. Use them as evidence for semantic candidates. Do not treat the mapped type names as final overlay commands:

${activeLines.join('\n')}
${availableStr}
</signal_decision_map>`;
}

function detectSignalsFromContext(ctx: VideoContext, gp?: GenreParameters | null): Set<string> {
  const signals = new Set<string>();

  signals.add('opening_hook');
  signals.add('closing_zone');

  if (ctx.transcription.length > 0) {
    signals.add('emphasis_word');
    signals.add('topic_shift');
    signals.add('rhetorical_pause');
    signals.add('vocal_peak');
    signals.add('vocal_build');
    signals.add('vocal_wind_down');
    signals.add('narrative_resolve');
  }

  const words = ctx.transcription.map(w => w.word.toLowerCase());
  const hasNumbers = words.some(w => /\d/.test(w));
  if (hasNumbers) signals.add('number_mentioned');

  const COMMON_CAPS = new Set([
    'i', "i'm", "i've", "i'd", "i'll", 'the', 'a', 'an',
    'oh', 'yeah', 'yes', 'no', 'hey', 'well', 'okay', 'ok',
    'so', 'but', 'and', 'or', 'if', 'it', 'its', "it's",
    'he', "he's", 'she', "she's", 'we', "we're", "we've",
    'they', "they're", "they've", 'you', "you're", "you've",
    'my', 'your', 'his', 'her', 'our', 'their',
    'this', 'that', 'these', 'those', 'what', 'who', 'how', 'why',
  ]);
  const originalWords = ctx.transcription.map(w => w.word);
  const hasNames = originalWords.some((w, i) => {
    const clean = w.replace(/[.,!?;:'"]/g, '');
    if (clean.length <= 1) return false;
    if (clean[0] !== clean[0].toUpperCase() || clean[0] === clean[0].toLowerCase()) return false;
    if (COMMON_CAPS.has(clean.toLowerCase())) return false;
    if (i === 0) return false;
    const prev = originalWords[i - 1];
    if (/[.?!]$/.test(prev)) return false;
    return true;
  });
  if (hasNames) signals.add('name_mentioned');

  const ctaWords = ['subscribe', 'click', 'link', 'check', 'download', 'sign', 'join', 'buy', 'order', 'visit'];
  if (words.some(w => ctaWords.includes(w))) signals.add('cta');

  if (ctx.audioFeatures?.rmsEnergyCurve?.length) {
    const curve = ctx.audioFeatures.rmsEnergyCurve;
    const avg = curve.reduce((s, v) => s + v, 0) / curve.length;
    const hasPeaks = curve.some(v => v > avg * 1.5);
    if (hasPeaks) { signals.add('energy_peak'); signals.add('energy_build'); signals.add('energy_drop'); }
  }

  if (ctx.wav2vecFeatures?.segments?.length) {
    const hasEmotional = ctx.wav2vecFeatures.segments.some(s => s.emotionIntensity > 0.6);
    if (hasEmotional) signals.add('emotional_shift');
  }

  if (ctx.segmentCount > 3) signals.add('scene_boundary');
  if (ctx.totalDurationSec > 30) signals.add('visual_monotony');

  // Music signals — detected from musicFeatures or audio energy patterns
  if (ctx.musicFeatures?.beats?.length) {
    signals.add('music_beat');
    signals.add('beat_accent');
    const strongBeats = ctx.musicFeatures.beats.filter(b => b.strength > 0.7);
    if (strongBeats.length > 0) signals.add('music_drop');
    if (ctx.musicFeatures.sections?.length > 1) signals.add('music_section_change');
  }

  // Visual signals — detected from V-JEPA features
  if (ctx.vjepaFeatures?.segments?.length) {
    const highMotion = ctx.vjepaFeatures.segments.some(s => s.motionIntensity > 0.7);
    if (highMotion) signals.add('motion_peak');
    const highSignificance = ctx.vjepaFeatures.segments.some(s => s.visualSignificance > 0.7);
    if (highSignificance) signals.add('visual_peak');
  }

  return signals;
}

function partitionRegistry(detected: Set<string>): { active: DecisionRegistryEntry[]; available: DecisionRegistryEntry[] } {
  const active: DecisionRegistryEntry[] = [];
  const available: DecisionRegistryEntry[] = [];
  for (const entry of DECISION_REGISTRY) {
    if (detected.has(entry.signal)) active.push(entry);
    else available.push(entry);
  }
  return { active, available };
}

function groupBySignal(entries: DecisionRegistryEntry[]): Map<string, DecisionRegistryEntry[]> {
  const map = new Map<string, DecisionRegistryEntry[]>();
  for (const e of entries) {
    const list = map.get(e.signal) || [];
    list.push(e);
    map.set(e.signal, list);
  }
  return map;
}

// ─── Valid Types Block ──────────────────────────────────────────────────────

function buildValidTypesBlock(): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const entry of DECISION_REGISTRY) {
    if (seen.has(entry.type)) continue;
    seen.add(entry.type);
    const paramsDesc = entry.requiredParams.length > 0
      ? `requires: ${entry.requiredParams.join(', ')}`
      : 'no params required';
    lines.push(`  ${entry.type} (${paramsDesc})`);
  }
  return lines.join('\n');
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

// ─── Decision Budget Computation ────────────────────────────────────────────

export function computeDecisionBudget(
  gp: GenreParameters,
  durationSec: number,
): BudgetMap {
  const durationMin = Math.max(durationSec / 60, 0.5);

  // Creative transitions are NON-hard-cut transitions (dissolves, fades, wipes)
  // placed at narrative boundaries. Hard cuts are the default and don't need a
  // decision from Gemini. A 10-min talking head might have 1-3 dissolves and
  // 1-2 fade-to-blacks. Cap at 2/min — generous for any content type.
  // The executable budget below supersedes the old fixed-cap wording above.
  const transitionDensity = clamp(gp.transition_density, 2, 25);
  const visibleTransitionShare = clamp(
    0.12
      + gp.energy_baseline * 0.35
      + gp.sfx_density * 0.22
      + (1 - gp.formality) * 0.12,
    0.12,
    0.55,
  );
  const visibleTransitionsPerMin = clamp(transitionDensity * visibleTransitionShare, 0.4, 8);
  const transMax = Math.max(1, Math.ceil(visibleTransitionsPerMin * durationMin));
  const transMin = Math.min(transMax, Math.max(0, Math.floor(transMax * 0.25)));
  const sfxMax = Math.max(1, Math.ceil(clamp(gp.sfx_density, 0, 1) * transMax));

  return {
    zoom: { min: 2, max: Math.max(2, gp.zoom_budget) },
    transition: { min: transMin, max: transMax },
    sfx: { min: 0, max: sfxMax },
    // Graphics are supplied by warranted semantic facts. Keep this as a runaway guardrail
    // using the CRG max range (0-8 graphics/min), not the current graphic_density target.
    graphic: { min: 0, max: Math.max(8, Math.ceil(8 * durationMin)) },
    caption: { min: 2, max: Math.max(3, Math.ceil(durationMin * 2)) },
    speed: { min: 0, max: 3 },
    shake: { min: 0, max: 3 },
    audio: { min: 0, max: 4 },
    pacing: { min: 0, max: Math.max(1, Math.ceil(durationMin)) },
  };
}

// ─── Validation + Confidence Gating + Budget Enforcement ────────────────────

const CREATIVE_BRIEF_FACT_CONTRACT_VERSION = 'creative-brief-fact-contract-v1';

export function validateAndGate(raw: any, startTime: number, budget?: BudgetMap | null, mode: ContentMode = 'speech'): CreativeBrief | null {
  if (!raw || typeof raw !== 'object') return null;

  const VALID_SECTION_LABELS: NarrativeSectionLabel[] = [
    'setup', 'build', 'peak', 'resolve', 'transition', 'hook', 'closing',
    'intro', 'verse', 'chorus', 'bridge', 'outro', 'drop',
  ];

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
    startWordIdx: s.start_word_idx ?? -1,
    endWordIdx: s.end_word_idx ?? -1,
    startTimestampMs: typeof s.start_timestamp_ms === 'number' ? s.start_timestamp_ms : undefined,
    endTimestampMs: typeof s.end_timestamp_ms === 'number' ? s.end_timestamp_ms : undefined,
    label: validateEnum(s.label, VALID_SECTION_LABELS, 'build'),
    energyLevel: validateEnum(s.energy_level, ['low', 'building', 'high', 'declining', 'neutral'], 'neutral'),
    mood: s.mood || 'neutral',
    pacingFeel: validateEnum(s.pacing_feel, ['calm', 'measured', 'balanced', 'energetic', 'fast'], 'balanced'),
  }));

  const rawDecisions = raw.decisions || [];
  let validCount = 0;
  let droppedType = 0;
  let droppedReason = 0;
  let droppedConfidence = 0;
  let missingSemanticAtoms = 0;

  // Pass 1: Parse, validate types/reasons, confidence gate
  const parsed: BriefDecision[] = [];
  for (const d of rawDecisions) {
    const type = d.type as string;
    const reason = d.reason as string;
    const confidence = clamp(d.confidence ?? 0, 0, 1);

    if (!VALID_DECISION_TYPES.has(type as BriefDecisionType)) {
      droppedType++;
      continue;
    }
    if (!VALID_DECISION_REASONS.has(reason as DecisionReason)) {
      droppedReason++;
      continue;
    }
    if (confidence < CONFIDENCE_THRESHOLD) {
      droppedConfidence++;
      continue;
    }

    // Fill missing required params from registry defaults
    const params = { ...(d.params || {}) };
    const required = REQUIRED_PARAMS_MAP[type];
    const defaults = DEFAULT_PARAMS_MAP[type];
    if (required && defaults) {
      for (const key of required) {
        if (params[key] === undefined && defaults[key] !== undefined) {
          params[key] = defaults[key];
        }
      }
    }

    const semanticAtomsPresent = hasUsefulSemanticAtoms(params.semanticAtoms);
    if (!semanticAtomsPresent && (type.startsWith('graphic_') || type === 'caption_emphasis')) {
      missingSemanticAtoms++;
    }
    params.creativeBriefFactContract = {
      version: CREATIVE_BRIEF_FACT_CONTRACT_VERSION,
      role: 'semantic-context',
      executableAuthority: false,
      finalAuthority: 'native-planner',
      semanticAtomsPresent,
      groundingRequired: true,
    };
    parsed.push({
      type: type as BriefDecisionType,
      targetWordIdx: d.target_word_idx ?? -1,
      targetSourceAssetId: typeof d.target_source_asset_id === 'string' && d.target_source_asset_id.trim().length > 0
        ? d.target_source_asset_id.trim()
        : undefined,
      targetSourceWordIdx: typeof d.target_source_word_idx === 'number' && Number.isFinite(d.target_source_word_idx)
        ? d.target_source_word_idx
        : undefined,
      targetTimestampMs: typeof d.target_timestamp_ms === 'number' ? d.target_timestamp_ms : undefined,
      targetBeatIdx: typeof d.target_beat_idx === 'number' ? d.target_beat_idx : undefined,
      confidence,
      reason: reason as DecisionReason,
      params,
    });
    validCount++;
  }

  if (droppedType > 0) console.warn(`[CreativeBrief] Dropped ${droppedType} decisions with invalid types`);
  if (droppedReason > 0) console.warn(`[CreativeBrief] Dropped ${droppedReason} decisions with invalid reasons`);
  if (droppedConfidence > 0) console.log(`[CreativeBrief] Gated ${droppedConfidence} low-confidence decisions (< ${CONFIDENCE_THRESHOLD})`);
  if (missingSemanticAtoms > 0) console.warn(`[CreativeBrief] ${missingSemanticAtoms} semantic-context decisions missing useful semanticAtoms; native planner must treat them as weak evidence`);

  // Pass 2: Per-type cap enforcement (maxPerVideo from registry)
  let allDecisions = [...parsed];
  for (const [type, maxCount] of Object.entries(MAX_PER_VIDEO_MAP)) {
    const ofType = allDecisions.filter(d => d.type === type);
    if (ofType.length > maxCount) {
      ofType.sort((a, b) => a.confidence - b.confidence);
      const toDrop = ofType.slice(0, ofType.length - maxCount);
      const dropSet = new Set(toDrop);
      const before = allDecisions.length;
      allDecisions = allDecisions.filter(d => !dropSet.has(d));
      console.warn(`[CreativeBrief] Per-type cap: ${type} had ${ofType.length}, max ${maxCount} — dropped ${before - allDecisions.length} lowest-confidence`);
    }
  }

  // Pass 3: Budget enforcement (per-category limits from genre params)
  // Graphics are semantic facts, not source-side creative supply. Do not cull them here by
  // graphic_density or LLM confidence; the native planner/license/budget guardrail owns final density.
  if (budget) {
    for (const [category, { max }] of Object.entries(budget)) {
      if (category === 'graphic') continue;
      const inCategory = allDecisions.filter(d => TYPE_TO_BUDGET[d.type] === category);
      if (inCategory.length > max) {
        inCategory.sort((a, b) => a.confidence - b.confidence);
        const toDrop = inCategory.slice(0, inCategory.length - max);
        const dropSet = new Set(toDrop);
        const before = allDecisions.length;
        allDecisions = allDecisions.filter(d => !dropSet.has(d));
        console.warn(`[CreativeBrief] Budget cap: ${category} had ${inCategory.length}, max ${max} — dropped ${before - allDecisions.length}`);
      }
    }
  }
  // Pass 4: Distribution check (warn if clustered)
  if (allDecisions.length > 5) {
    const positions = allDecisions.map(d =>
      d.targetTimestampMs !== undefined && d.targetTimestampMs >= 0
        ? d.targetTimestampMs
        : d.targetWordIdx >= 0 ? d.targetWordIdx : -1
    ).filter(p => p >= 0);

    if (positions.length > 3) {
      const maxPos = Math.max(...positions, 1);
      const quartiles = [0, 0, 0, 0];
      for (const p of positions) {
        const q = Math.min(3, Math.floor((p / maxPos) * 4));
        quartiles[q]++;
      }
      const maxQ = Math.max(...quartiles);
      if (maxQ > positions.length * 0.4) {
        console.warn(`[CreativeBrief] Distribution warning: quartiles [${quartiles.join(', ')}] — ${maxQ}/${positions.length} clustered in one quarter`);
      }
    }
  }

  // Pass 5: Confidence uniformity check
  if (allDecisions.length > 5) {
    const confCounts = new Map<number, number>();
    for (const d of allDecisions) {
      const rounded = Math.round(d.confidence * 100);
      confCounts.set(rounded, (confCounts.get(rounded) || 0) + 1);
    }
    const mostCommon = Math.max(...confCounts.values());
    if (mostCommon > allDecisions.length * 0.5) {
      console.warn(`[CreativeBrief] Confidence uniformity: ${mostCommon}/${allDecisions.length} have identical confidence — applying decay`);
      allDecisions.sort((a, b) => b.confidence - a.confidence);
      for (let i = 0; i < allDecisions.length; i++) {
        allDecisions[i].confidence = Math.max(CONFIDENCE_THRESHOLD, 0.95 - (i * 0.4 / allDecisions.length));
      }
    }
  }

  console.log(`[CreativeBrief] Validation: ${rawDecisions.length} raw → ${allDecisions.length} valid (${rawDecisions.length - allDecisions.length} filtered)`);

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
    contentMode: mode,
    modelVersion: 'gemini-2.5-flash-cached',
    processingTimeMs: Date.now() - startTime,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function validateEnum<T extends string>(value: any, valid: T[], fallback: T): T {
  if (valid.includes(value)) return value;
  return fallback;
}

function hasUsefulSemanticAtoms(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some(hasMeaningfulAtomValue);
}

function hasMeaningfulAtomValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulAtomValue);
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasMeaningfulAtomValue);
  }
  return false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildCompactTranscript(words: { word: string; startMs: number; endMs: number }[]): string {
  const WORDS_PER_LINE = 10;
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
    const chunk = words.slice(i, i + WORDS_PER_LINE);
    const startMs = chunk[0].startMs;
    const text = chunk.map(w => w.word).join(' ');
    lines.push(`[${i}] @${Math.round(startMs / 1000)}s: ${text}`);
  }
  return lines.join('\n');
}

function sampleArray(arr: number[], targetSize: number): number[] {
  if (arr.length <= targetSize) return arr;
  const step = arr.length / targetSize;
  return Array.from({ length: targetSize }, (_, i) => arr[Math.floor(i * step)]);
}
