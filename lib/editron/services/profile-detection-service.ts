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
import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';

// ─── Semantic Embedding Cache ────────────────────────────────────
// Pre-computed embeddings for all 54 profiles. Built once per process,
// reused across all detection calls. Profile text = name + description
// + category + all signal keyword terms (the full semantic identity).
// Uses Gemini text-embedding-004 (same model as asset-search-service).

let profileEmbeddingCache: Map<string, number[]> | null = null;
let embeddingInitPromise: Promise<void> | null = null;

// Scoring constants pulled from editron-config.ts (Rule A6 — one source of truth).
// Full rationale + tuning guidance in ProfileDetectionConfig interface definition.
const DETECTION = DEFAULT_CONFIG.profileDetection;

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
  /** LLM-suggested profile category from parser (added 2026-04-17).
   *  When present, detection ONLY scores profiles within this category, eliminating
   *  cross-category false positives. The LLM understands "Nike Athletes in Motion"
   *  is industry-vertical (sports), not production-mode (screen recording) — keyword
   *  scoring alone can't make this semantic distinction. */
  suggestedProfileCategory?: string;
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

  for (const keyword of profile.signalKeywords) {
    const fieldText = signals[keyword.field as keyof ExtractedSignals];
    if (typeof fieldText !== 'string') continue;

    if (fieldText.includes(keyword.term.toLowerCase())) {
      score += keyword.weight;
    }
  }

  // Normalize by fixed target score (Rule A6, editron-config.ts ProfileDetectionConfig).
  //
  // OLD APPROACH (2026-04-17 bugfix): `score / maxPossible` — penalized rich-keyword
  // profiles. A profile with 4 keywords totaling 1.1 max weight could beat a profile
  // with 16 keywords totaling 5.2 max weight even with fewer actual matches, because
  // percentage-based normalization favors sparse profiles.
  //
  // NEW APPROACH: absolute match strength divided by fixed target. Profile can't game
  // by having fewer keywords. 5 medium-weight matches (≈2.5 raw) hits confidence 1.0.
  // See pipeline_investigations.md for full analysis + Nike test validation.
  let normalized = Math.min(1, score / DETECTION.scoreNormalizationTarget);

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

  // ─── LLM category as BOOST, not filter (revised 2026-04-22) ──
  // OLD (b0e142f2): LLM category FILTERED profiles — only scored within
  // suggested category. Broke for brand ads mentioning "Instagram" (LLM
  // picked platform-native, excluded narrative-mode E-04).
  //
  // NEW: score ALL 54 profiles always. LLM category adds a BONUS (+0.25)
  // to matching profiles. This way a good match in the "wrong" category
  // still wins, but the LLM's semantic read gives a tiebreaker edge.
  // Vision §1: rule-driven scoring (deterministic) + LLM as boost (not gate).
  const suggestedCategory = metadata.suggestedProfileCategory?.toLowerCase().trim();
  const allProfiles = Object.values(EDIT_PROFILES);
  const CATEGORY_BOOST = 0.25;

  if (suggestedCategory) {
    console.log(
      `[ProfileDetection] LLM suggested category: "${suggestedCategory}" → ` +
      `applied as +${CATEGORY_BOOST} boost (scoring all ${allProfiles.length} profiles)`
    );
  }

  const results: DetectionResult[] = [];

  for (const profile of allProfiles) {
    let confidence = scoreProfile(profile, signals);

    // Category boost: if LLM agrees with the profile's category, bump score
    if (suggestedCategory && profile.category === suggestedCategory) {
      confidence = Math.min(1, confidence + CATEGORY_BOOST);
    }

    if (confidence < DETECTION.minConfidenceThreshold) continue;

    const reasoning: string[] = [];
    if (suggestedCategory && profile.category === suggestedCategory) {
      reasoning.push(`LLM category match "${suggestedCategory}" (+${CATEGORY_BOOST})`);
    }
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

  // No fallback block needed — we now score ALL profiles always (category is
  // a boost, not a filter). The old filter+fallback approach was removed because
  // it broke for scripts mentioning target platforms (McDonald's + "Instagram"
  // → LLM picked platform-native → E-04 Brand Narrative excluded).

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

  if (!top || top.confidence < DETECTION.minConfidenceThreshold) {
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
    autoSelected: top.confidence >= DETECTION.autoSelectConfidence,
    suggestionsNeeded: top.confidence < DETECTION.autoSelectConfidence,
  };
}

// ─── Semantic Embedding Functions ────────────────────────────────

/** Build a semantic text string for a profile (used as embedding input). */
function profileToText(profile: EditProfile): string {
  const keywords = profile.signalKeywords.map(k => k.term).join(', ');
  return `${profile.name}. ${profile.description}. Category: ${profile.category}. Keywords: ${keywords}`;
}

/** Build a semantic text string from script metadata (used as embedding input). */
function metadataToText(metadata: ThinkForgeMetadata): string {
  const scenes = metadata.scenes || [];
  const narration = scenes.map(s => s.narration || '').filter(Boolean).join(' ').substring(0, 500);
  const visuals = scenes.map(s => s.visualDescription || '').filter(Boolean).join(' ').substring(0, 500);
  const mood = scenes.map(s => s.mood || '').filter(Boolean).join(', ');
  const title = metadata.title || '';
  const music = metadata.overallMusicPrompt || metadata.globalEditDirections?.musicMood || '';
  return `${title}. ${narration}. Visuals: ${visuals}. Mood: ${mood}. Music: ${music}`.trim();
}

/** Embed a single text string using Gemini text-embedding-004. Returns null on failure. */
async function embedText(text: string): Promise<number[] | null> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
    if (!apiKey) return null;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding?.values || null;
  } catch {
    return null;
  }
}

/** Cosine similarity between two vectors. */
function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Initialize profile embeddings cache. Called once, deduped via promise.
 * Embeds all 54 profiles in parallel (batches of 8 to avoid rate limits).
 */
async function initProfileEmbeddings(): Promise<void> {
  if (profileEmbeddingCache) return;
  profileEmbeddingCache = new Map();

  const profiles = Object.values(EDIT_PROFILES);
  const BATCH = 8;

  for (let i = 0; i < profiles.length; i += BATCH) {
    const batch = profiles.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (p) => {
        const text = profileToText(p);
        const emb = await embedText(text);
        return { id: p.profileId, emb };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.emb) {
        profileEmbeddingCache.set(r.value.id, r.value.emb);
      }
    }
  }

  console.log(`[ProfileDetection] Embedded ${profileEmbeddingCache.size}/${profiles.length} profiles`);
}

/**
 * Score profiles using semantic embedding similarity.
 * Returns a Map of profileId → similarity score (0-1).
 * Falls back to empty map if embeddings unavailable.
 */
/**
 * Async variant of detectProfile that blends keyword scores with
 * semantic embedding similarity. Use server-side only (requires Gemini API).
 *
 * Blending: keyword * 0.6 + semantic * 0.4
 * If embeddings unavailable, falls back to keyword-only (same as detectProfile).
 */
export async function detectProfileWithEmbeddings(metadata: ThinkForgeMetadata): Promise<DetectionResult[]> {
  // Start with keyword-based detection (always available, zero-cost)
  const keywordResults = detectProfile(metadata);

  // Try semantic scoring (may fail gracefully)
  const semanticScores = await scoreProfilesBySemantic(metadata);
  if (semanticScores.size === 0) return keywordResults;

  // Blend keyword and semantic scores
  const KEYWORD_WEIGHT = 0.6;
  const SEMANTIC_WEIGHT = 0.4;

  for (const result of keywordResults) {
    const semScore = semanticScores.get(result.profileId) || 0;
    // Normalize semantic score: cosine similarity for text embeddings is typically
    // 0.5-1.0 range (rarely negative). Scale 0.5-1.0 → 0-1 for fair blending.
    const normalizedSem = Math.max(0, Math.min(1, (semScore - 0.5) * 2));
    const blended = result.confidence * KEYWORD_WEIGHT + normalizedSem * SEMANTIC_WEIGHT;
    result.confidence = Math.min(1, blended);
    if (normalizedSem > 0.3) {
      result.reasoning.push(`Semantic similarity: ${(normalizedSem * 100).toFixed(0)}%`);
    }
  }

  // Also check profiles that keyword scoring missed but semantic scoring found
  const keywordProfileIds = new Set(keywordResults.map(r => r.profileId));
  for (const [profileId, semScore] of semanticScores) {
    if (keywordProfileIds.has(profileId as ProfileId)) continue;
    const normalizedSem = Math.max(0, Math.min(1, (semScore - 0.5) * 2));
    if (normalizedSem < 0.3) continue; // Too weak to surface

    const profile = EDIT_PROFILES[profileId as ProfileId];
    if (!profile) continue;

    keywordResults.push({
      profileId: profileId as ProfileId,
      confidence: normalizedSem * SEMANTIC_WEIGHT, // No keyword score, only semantic
      reasoning: [`Semantic-only match: ${(normalizedSem * 100).toFixed(0)}%`],
      suggestedModifiers: detectModifiers(extractSignals(metadata)),
    });
  }

  keywordResults.sort((a, b) => b.confidence - a.confidence);
  return keywordResults;
}

/**
 * Async variant of getAutoSelectedProfile that uses semantic embeddings.
 * Falls back to keyword-only if embeddings fail.
 */
export async function getAutoSelectedProfileWithEmbeddings(metadata: ThinkForgeMetadata & { userId?: string }): Promise<{
  profile: EditProfile;
  detection: DetectionResult;
  autoSelected: boolean;
  suggestionsNeeded: boolean;
}> {
  const results = await detectProfileWithEmbeddings(metadata);

  // Graphiti preference boost: if the user has historically overridden to a specific profile,
  // boost that profile's score so auto-detection learns from past behavior.
  if (metadata.userId) {
    try {
      const { searchGraphitiFacts } = await import('./graph-service');
      const facts = await searchGraphitiFacts(
        'What editing profile does this user prefer or override to?',
        metadata.userId,
        3,
      );
      if (facts.length > 0) {
        const profileIds = Object.keys(EDIT_PROFILES);
        for (const fact of facts) {
          const mentioned = profileIds.find(id => fact.includes(id));
          if (mentioned) {
            const match = results.find(r => r.profileId === mentioned);
            if (match) {
              match.confidence = Math.min(1.0, match.confidence + 0.15);
              match.reasoning.push(`Graphiti: user historically prefers ${mentioned}`);
            }
          }
        }
        results.sort((a, b) => b.confidence - a.confidence);
      }
    } catch { /* Graphiti unavailable — proceed with detection scores */ }
  }

  const top = results[0];

  if (!top || top.confidence < DETECTION.minConfidenceThreshold) {
    return {
      profile: EDIT_PROFILES['G-01'],
      detection: { profileId: 'G-01', confidence: 0, reasoning: ['No signal data available — defaulting to Universal Clean'], suggestedModifiers: [] },
      autoSelected: false,
      suggestionsNeeded: true,
    };
  }

  return {
    profile: EDIT_PROFILES[top.profileId],
    detection: top,
    autoSelected: top.confidence >= DETECTION.autoSelectConfidence,
    suggestionsNeeded: top.confidence < DETECTION.autoSelectConfidence,
  };
}

export async function scoreProfilesBySemantic(
  metadata: ThinkForgeMetadata,
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();

  try {
    // Initialize profile embeddings (deduped, only runs once)
    if (!embeddingInitPromise) {
      embeddingInitPromise = initProfileEmbeddings();
    }
    await embeddingInitPromise;

    if (!profileEmbeddingCache || profileEmbeddingCache.size === 0) return scores;

    const scriptText = metadataToText(metadata);
    if (!scriptText || scriptText.length < 10) return scores;

    const scriptEmb = await embedText(scriptText);
    if (!scriptEmb) return scores;

    for (const [profileId, profileEmb] of profileEmbeddingCache) {
      scores.set(profileId, cosineSim(scriptEmb, profileEmb));
    }

    console.log(`[ProfileDetection] Semantic scores computed for ${scores.size} profiles`);
  } catch (err: any) {
    console.warn(`[ProfileDetection] Semantic scoring failed (non-fatal): ${err.message}`);
  }

  return scores;
}
