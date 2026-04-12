/**
 * Profile Auto-Detection Engine
 *
 * Scores all 54 edit profiles against ThinkForge metadata to auto-select
 * the best matching profile. Uses weighted keyword matching across
 * multiple signal sources.
 *
 * Detection Pipeline:
 * 1. Extract raw signals from ThinkForge metadata
 * 2. Score each profile's signal keywords against extracted signals
 * 3. Apply structural bonuses (scene count, duration, platform)
 * 4. Normalize to 0-1 confidence
 * 5. If top ≥ 0.60 → auto-select
 *    If 0.40-0.59 → suggest top 3
 *    If < 0.40 → manual selection (G-01 Universal Clean)
 */

import { EDIT_PROFILES } from '@/lib/editron/data/edit-profiles';
import type { EditProfile, ProfileId, DetectionResult, ModifierId } from '@/lib/editron/data/edit-profile-types';

// ─── Signal Extraction ───────────────────────────────────────────

interface ExtractedSignals {
  narration: string;
  visual: string;
  music: string;
  notes: string;
  environment: string;
  character: string;
  mood: string;
  platform: string;
  contentType: string;
  /** Bundle 3 (2026-04-08): project title + script purpose. Critical for commercial /
   *  zero-narration scripts where `narration` is empty and profile detection was starving. */
  title: string;
  sceneCount: number;
  totalDurationSec: number;
}

interface ThinkForgeMetadata {
  scenes?: Array<{
    narration?: string;
    visualDescription?: string;
    mood?: string;
    audioDescription?: string;
    rawProductionNotes?: string;
    /** Scene-level editDirections, including on-screen text that may hint at brand/emotional beats */
    editDirections?: {
      onScreenText?: string[];
      motionGraphicCue?: string;
    };
  }>;
  overallMusicPrompt?: string;
  characterDescriptions?: Record<string, string>;
  colorPalette?: string[];
  environmentNotes?: string;
  globalEditDirections?: {
    colorGrade?: string;
    pacing?: string;
    graphicsDensity?: string;
    musicMood?: string;
    narrativeArc?: string;
  };
  /** Explicit platform if set by user */
  platform?: string;
  /** Explicit content type if set by user */
  contentType?: string;
  /** Bundle 3: project / script title — often the most signal-rich field in commercial scripts.
   *  Example: "Golden Arches of Memory: A Taste of Childhood" tells you everything you need
   *  to know about content type without any other field. */
  title?: string;
}

function extractSignals(metadata: ThinkForgeMetadata): ExtractedSignals {
  const scenes = metadata.scenes || [];

  // Bundle 3: on-screen text is a first-class signal source — on commercial scripts it's
  // often where the real brand copy lives, not in narration (which is empty).
  const onScreenText = scenes
    .flatMap(s => s.editDirections?.onScreenText || [])
    .concat(scenes.map(s => s.editDirections?.motionGraphicCue || '').filter(Boolean))
    .join(' ')
    .toLowerCase();

  return {
    narration: scenes.map(s => s.narration || '').join(' ').toLowerCase(),
    visual: scenes.map(s => s.visualDescription || '').join(' ').toLowerCase(),
    music: (metadata.overallMusicPrompt || '').toLowerCase() +
      ' ' + (metadata.globalEditDirections?.musicMood || '').toLowerCase(),
    // Bundle 3: notes now ALSO includes title, on-screen text, and environment notes.
    // This is a "free text" bucket for broad keyword matching. The title field is separate
    // (see below) so profiles can target it specifically if needed.
    notes: (scenes[0]?.rawProductionNotes || '').toLowerCase() +
      ' ' + (metadata.globalEditDirections?.colorGrade || '').toLowerCase() +
      ' ' + (metadata.globalEditDirections?.pacing || '').toLowerCase() +
      ' ' + (metadata.title || '').toLowerCase() +
      ' ' + (metadata.environmentNotes || '').toLowerCase() +
      ' ' + onScreenText,
    environment: (metadata.environmentNotes || '').toLowerCase(),
    character: Object.entries(metadata.characterDescriptions || {})
      .map(([name, desc]) => `${name} ${desc}`).join(' ').toLowerCase(),
    mood: scenes.map(s => s.mood || '').join(' ').toLowerCase(),
    platform: (metadata.platform || '').toLowerCase(),
    contentType: (metadata.contentType || '').toLowerCase(),
    // Bundle 3: title as its own field, also flowed into notes for legacy keyword matching.
    title: (metadata.title || '').toLowerCase(),
    sceneCount: scenes.length,
    totalDurationSec: scenes.reduce((sum, s: any) => sum + (s.durationSeconds || 5), 0),
  };
}

// ─── Scoring ─────────────────────────────────────────────────────

function scoreProfile(profile: EditProfile, signals: ExtractedSignals): number {
  let score = 0;
  let maxPossible = 0;

  for (const keyword of profile.signalKeywords) {
    maxPossible += keyword.weight;

    const fieldText = signals[keyword.field as keyof ExtractedSignals];
    if (typeof fieldText !== 'string') continue;

    if (fieldText.includes(keyword.term.toLowerCase())) {
      score += keyword.weight;
    }
  }

  // Normalize to 0-1
  if (maxPossible === 0) return 0;
  let normalized = score / maxPossible;

  // ─── Structural bonuses ─────────────────────────────────
  // Short-form content bonus
  if (signals.sceneCount <= 8 && signals.totalDurationSec <= 90) {
    if (['A-02', 'A-03', 'A-06'].includes(profile.profileId)) {
      normalized = Math.min(1, normalized + 0.15);
    }
  }
  // Long-form content bonus
  if (signals.sceneCount >= 20) {
    if (['A-01', 'A-08', 'C-03'].includes(profile.profileId)) {
      normalized = Math.min(1, normalized + 0.10);
    }
  }

  // Platform absolute override (2x weight)
  if (signals.platform) {
    const platformMap: Record<string, ProfileId[]> = {
      'youtube': ['A-01', 'A-02'],
      'instagram': ['A-03'],
      'tiktok': ['A-03'],
      'linkedin': ['A-04'],
      'facebook': ['A-05'],
      'twitter': ['A-06'],
      'x': ['A-06'],
      'pinterest': ['A-07'],
    };
    for (const [platform, ids] of Object.entries(platformMap)) {
      if (signals.platform.includes(platform) && ids.includes(profile.profileId as any)) {
        normalized = Math.min(1, normalized * 2);
      }
    }
  }

  // ContentType absolute override
  if (signals.contentType) {
    const typeMap: Record<string, ProfileId[]> = {
      'tutorial': ['C-02'],
      'how-to': ['C-02'],
      'documentary': ['C-03'],
      'explainer': ['C-04'],
      'testimonial': ['C-05'],
      'podcast': ['C-09'],
      'music video': ['C-10'],
      'training': ['C-11'],
      'ad': ['A-05', 'E-01'],
      'recruitment': ['C-12'],
      'vlog': ['C-08'],
    };
    for (const [type, ids] of Object.entries(typeMap)) {
      if (signals.contentType.includes(type) && ids.includes(profile.profileId as any)) {
        normalized = Math.min(1, normalized * 1.8);
      }
    }
  }

  return Math.min(1, Math.max(0, normalized));
}

// ─── Modifier Detection ──────────────────────────────────────────

function detectModifiers(signals: ExtractedSignals): ModifierId[] {
  const mods: ModifierId[] = [];

  // Platform modifiers
  if (signals.platform.includes('youtube')) mods.push('PLATFORM-YT');
  if (signals.platform.includes('instagram')) mods.push('PLATFORM-IG-REEL');
  if (signals.platform.includes('tiktok')) mods.push('PLATFORM-TIKTOK');
  if (signals.platform.includes('linkedin')) mods.push('PLATFORM-LI');

  // Duration modifiers
  if (signals.totalDurationSec < 90) mods.push('DUR-SHORT');
  if (signals.totalDurationSec > 600) mods.push('DUR-LONG');

  // Tone modifiers (from notes/mood)
  if (signals.notes.includes('luxury') || signals.notes.includes('premium')) mods.push('TONE-PREMIUM');
  if (signals.notes.includes('urgent') || signals.mood.includes('energetic')) mods.push('TONE-URGENT');
  if (signals.mood.includes('emotional') || signals.music.includes('emotional')) mods.push('TONE-EMOTIONAL');
  if (signals.mood.includes('comedic') || signals.mood.includes('playful')) mods.push('TONE-COMEDIC');

  return mods;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Detect the best matching edit profile from ThinkForge metadata.
 *
 * @returns Sorted array of detection results (highest confidence first).
 *          Top result is the auto-selection if confidence ≥ 0.60.
 */
export function detectProfile(metadata: ThinkForgeMetadata): DetectionResult[] {
  const signals = extractSignals(metadata);
  const modifiers = detectModifiers(signals);

  const results: DetectionResult[] = [];

  for (const profile of Object.values(EDIT_PROFILES)) {
    const confidence = scoreProfile(profile, signals);
    if (confidence < 0.05) continue; // Skip zero-match profiles

    const reasoning: string[] = [];
    for (const kw of profile.signalKeywords) {
      const fieldText = signals[kw.field as keyof ExtractedSignals];
      if (typeof fieldText === 'string' && fieldText.includes(kw.term.toLowerCase())) {
        reasoning.push(`"${kw.term}" found in ${kw.field} (+${kw.weight.toFixed(2)})`);
      }
    }

    results.push({
      profileId: profile.profileId,
      confidence,
      reasoning,
      suggestedModifiers: modifiers,
    });
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Get the auto-selected profile or fallback.
 *
 * - confidence ≥ 0.60 → auto-select top result
 * - confidence 0.40-0.59 → return top result but flag as suggestion
 * - confidence < 0.40 → return G-01 Universal Clean
 */
export function getAutoSelectedProfile(metadata: ThinkForgeMetadata): {
  profile: EditProfile;
  detection: DetectionResult;
  autoSelected: boolean;
  suggestionsNeeded: boolean;
} {
  const results = detectProfile(metadata);
  const top = results[0];

  if (!top || top.confidence < 0.05) {
    // Complete signal starvation — all scenes empty, no narration/visual data.
    // Default to G-01 but flag for manual review so user knows to pick a profile.
    return {
      profile: EDIT_PROFILES['G-01'],
      detection: { profileId: 'G-01', confidence: 0, reasoning: ['No signal data available (empty scenes/narration) — defaulting to Universal Clean'], suggestedModifiers: [] },
      autoSelected: false,
      suggestionsNeeded: true,
    };
  }

  // OLD: confidence < 0.40 → always fell back to G-01, ignoring the best match.
  // A nostalgic McDonald's ad with keyword matches in "warm", "nostalgic", "brand"
  // might score 0.35 for E-02 (Narrative Nostalgic) but got G-01 instead.
  //
  // NEW: use the top-scoring profile regardless of confidence level. Low confidence
  // just means we flag for manual review (suggestionsNeeded: true) rather than
  // overriding with G-01 which is almost never the right choice for styled content.
  return {
    profile: EDIT_PROFILES[top.profileId],
    detection: top,
    autoSelected: top.confidence >= 0.60,
    suggestionsNeeded: top.confidence < 0.60,
  };
}
