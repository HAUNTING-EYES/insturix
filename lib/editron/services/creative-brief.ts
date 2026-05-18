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
import {
  DECISION_REGISTRY, VALID_DECISION_TYPES, VALID_DECISION_REASONS,
  BUDGET_CATEGORIES, TYPE_TO_BUDGET, REQUIRED_PARAMS_MAP, DEFAULT_PARAMS_MAP,
  MAX_PER_VIDEO_MAP, type DecisionRegistryEntry,
} from '../data/decision-registry';
import type { GenreParameters } from './graph-query';

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
  genreParams?: GenreParameters,
): Promise<CreativeBrief | null> {
  const startTime = Date.now();

  try {
    console.log(`[CreativeBrief] Starting generation (${videoContext.transcription.length} words, ${videoContext.segmentCount} segments, geminiFileUri=${!!geminiFileUri}, genreParams=${!!genreParams})`);

    const model = await getCreativeDocCachedModel();
    console.log('[CreativeBrief] Model obtained from context cache');

    const budget = genreParams ? computeDecisionBudget(genreParams, videoContext.totalDurationSec) : null;
    const prompt = buildPrompt(videoContext, preferences, genreParams, budget);
    console.log(`[CreativeBrief] Prompt built (${prompt.length} chars, budget=${budget ? Object.keys(budget).length + ' categories' : 'none'})`);

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
      console.log(`[CreativeBrief] Video file attached: ${geminiFileUri.substring(0, 80)}...`);
    }

    console.log('[CreativeBrief] Calling Gemini...');
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig,
    });

    const responseText = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      console.error('[CreativeBrief] Empty response from Gemini. Full response:', JSON.stringify(result.response?.candidates?.[0] || 'no candidates'));
      return null;
    }

    console.log(`[CreativeBrief] Gemini responded (${responseText.length} chars). Parsing JSON...`);

    const parsed = JSON.parse(responseText);
    const brief = validateAndGate(parsed, startTime, budget);

    if (brief) {
      console.log(`[CreativeBrief] SUCCESS: ${brief.decisions.length} decisions, pacing=${brief.overallPacing}, ${brief.narrativeArc.length} sections`);
    } else {
      console.error('[CreativeBrief] validateAndGate returned null — parsed response was invalid');
    }

    return brief;
  } catch (err: any) {
    console.error(`[CreativeBrief] Generation FAILED: ${err.message}`);
    console.error(`[CreativeBrief] Stack: ${err.stack?.split('\n').slice(0, 3).join(' | ')}`);
    return null;
  }
}

// ─── Prompt Construction (Rule 35: XML structure, data LAST) ────────────────

type BudgetMap = Record<string, { min: number; max: number }>;

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
    .map((w, i) => `[${i}] ${w.word} (${w.startMs}-${w.endMs}ms)`)
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

<valid_types>
Use ONLY these exact type strings. Any other type will be silently dropped.
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
- NEVER place all your decisions after the midpoint. The opening third needs just as much creative attention.
</anti_patterns>

<rules>
- Word indices MUST be between 0 and ${ctx.transcription.length - 1}. There are exactly ${ctx.transcription.length} words.
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
  "decisions": [{ "type": "<valid_type>", "target_word_idx": number, "confidence": 0.55-0.95, "reason": "<valid_reason>", "params": { ...required_params_for_type } }],
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
    .map(([cat, { min, max }]) => `  ${cat}: ${min}-${max}`)
    .join('\n');
  const totalMin = Object.values(budget).reduce((s, b) => s + b.min, 0);
  const totalMax = Object.values(budget).reduce((s, b) => s + b.max, 0);
  return `
<decision_budget>
Per-category limits for this video (computed from its parameters):
${lines}
  TOTAL: ${totalMin}-${totalMax} decisions
Exceeding any category maximum makes your output invalid.
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
These signals were DETECTED in this video. Use these as your primary editing toolkit:

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

  const hasNames = words.some(w => w.length > 1 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase());
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

function computeDecisionBudget(
  gp: GenreParameters,
  durationSec: number,
): BudgetMap {
  const durationMin = Math.max(durationSec / 60, 0.5);

  // Creative transitions are NON-hard-cut transitions (dissolves, fades, wipes)
  // placed at narrative boundaries. Hard cuts are the default and don't need a
  // decision from Gemini. A 10-min talking head might have 1-3 dissolves and
  // 1-2 fade-to-blacks. Cap at 2/min — generous for any content type.
  const transMax = Math.max(2, Math.ceil(Math.min(gp.transition_density, 2) * durationMin));
  // SFX: 0.3-0.5 per transition. Not every transition gets sound.
  const sfxMax = Math.max(1, Math.ceil(Math.min(gp.sfx_density, 0.5) * transMax));

  return {
    zoom: { min: 2, max: Math.max(2, gp.zoom_budget) },
    transition: { min: 2, max: Math.max(2, transMax) },
    sfx: { min: 0, max: sfxMax },
    graphic: { min: 0, max: Math.max(1, Math.ceil(gp.graphic_density * durationMin)) },
    caption: { min: 2, max: Math.max(3, Math.ceil(durationMin * 2)) },
    speed: { min: 0, max: 3 },
    shake: { min: 0, max: 3 },
    audio: { min: 0, max: 4 },
    pacing: { min: 0, max: Math.max(1, Math.ceil(durationMin)) },
  };
}

// ─── Validation + Confidence Gating + Budget Enforcement ────────────────────

function validateAndGate(raw: any, startTime: number, budget?: BudgetMap | null): CreativeBrief | null {
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

  const rawDecisions = raw.decisions || [];
  let validCount = 0;
  let droppedType = 0;
  let droppedReason = 0;
  let droppedConfidence = 0;

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

    parsed.push({
      type: type as BriefDecisionType,
      targetWordIdx: d.target_word_idx ?? 0,
      confidence,
      reason: reason as DecisionReason,
      params,
    });
    validCount++;
  }

  if (droppedType > 0) console.warn(`[CreativeBrief] Dropped ${droppedType} decisions with invalid types`);
  if (droppedReason > 0) console.warn(`[CreativeBrief] Dropped ${droppedReason} decisions with invalid reasons`);
  if (droppedConfidence > 0) console.log(`[CreativeBrief] Gated ${droppedConfidence} low-confidence decisions (< ${CONFIDENCE_THRESHOLD})`);

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
  if (budget) {
    for (const [category, { max }] of Object.entries(budget)) {
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
    const maxIdx = Math.max(...allDecisions.map(d => d.targetWordIdx), 1);
    const quartiles = [0, 0, 0, 0];
    for (const d of allDecisions) {
      const q = Math.min(3, Math.floor((d.targetWordIdx / maxIdx) * 4));
      quartiles[q]++;
    }
    const maxQ = Math.max(...quartiles);
    if (maxQ > allDecisions.length * 0.4) {
      console.warn(`[CreativeBrief] Distribution warning: quartiles [${quartiles.join(', ')}] — ${maxQ}/${allDecisions.length} clustered in one quarter`);
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
