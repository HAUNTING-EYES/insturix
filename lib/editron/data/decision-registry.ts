/**
 * Decision Registry — Single source of truth for all editing decisions.
 *
 * Adding a new editing feature = adding one entry to DECISION_REGISTRY.
 * The system automatically:
 *   1. Includes it in the Gemini creative brief prompt
 *   2. Validates it in output (rejects unknown types)
 *   3. Counts it against the right budget category
 *   4. Enforces per-type caps and min gaps
 *   5. Maps it to the correct EDL action type for execution
 *
 * No code changes needed for new features. Just add an entry and ship.
 *
 * Sources: creative-knowledge-graph.json (95 mappings), creative-doc-rules.ts,
 * DIRECTOR_KNOWLEDGE_BASE.md Part 9 (SFX rules A-001 to A-021).
 */

import type { BriefDecisionType, DecisionReason } from '../services/creative-brief';
import type { EditDecision } from '../types/edit-decision';

// ─── Registry Entry Type ────────────────────────────────────────────────────

export interface DecisionRegistryEntry {
  id: string;
  type: BriefDecisionType;
  edlType: EditDecision['type'];
  budgetCategory: 'zoom' | 'transition' | 'sfx' | 'graphic' | 'caption' | 'speed' | 'shake' | 'audio' | 'pacing';
  signal: DecisionReason;
  description: string;
  defaultParams: Record<string, number | string>;
  requiredParams: string[];
  maxPerVideo?: number;
  minGapSec?: number;
  promptHint: string;
}

// ─── The Registry ───────────────────────────────────────────────────────────

export const DECISION_REGISTRY: DecisionRegistryEntry[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // ZOOMS — visual emphasis on content moments
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'zoom-push-vocal-build',
    type: 'zoom_push',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    signal: 'vocal_build',
    description: 'Speaker building energy toward a point',
    defaultParams: { scaleFrom: 1.0, scaleTo: 1.06 },
    requiredParams: ['scaleFrom', 'scaleTo'],
    minGapSec: 5,
    promptHint: 'Slow push as speaker builds toward a key point. Subtle — viewer feels it, not sees it.',
  },
  {
    id: 'zoom-push-energy-build',
    type: 'zoom_push',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    signal: 'energy_build',
    description: 'Audio energy rising steadily',
    defaultParams: { scaleFrom: 1.0, scaleTo: 1.08 },
    requiredParams: ['scaleFrom', 'scaleTo'],
    minGapSec: 8,
    promptHint: 'Push in as energy builds. Pairs with rising vocal intensity.',
  },
  {
    id: 'zoom-punch-vocal-peak',
    type: 'zoom_punch',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    signal: 'vocal_peak',
    description: 'Speaker hits emotional peak — key statement or climax',
    defaultParams: { scaleFrom: 1.0, scaleTo: 1.15 },
    requiredParams: ['scaleFrom', 'scaleTo'],
    minGapSec: 8,
    promptHint: 'Quick punch at genuine emotional peaks. Not every raised voice — the MOMENT that matters.',
  },
  {
    id: 'zoom-punch-energy-peak',
    type: 'zoom_punch',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    signal: 'energy_peak',
    description: 'Sudden energy surge in audio',
    defaultParams: { scaleFrom: 1.0, scaleTo: 1.12 },
    requiredParams: ['scaleFrom', 'scaleTo'],
    minGapSec: 10,
    promptHint: 'Punch on genuine energy spikes. Surprise, revelation, exclamation.',
  },
  {
    id: 'zoom-punch-emphasis',
    type: 'zoom_punch',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    signal: 'emphasis_word',
    description: 'Speaker emphasizes a specific word or phrase',
    defaultParams: { scaleFrom: 1.0, scaleTo: 1.1 },
    requiredParams: ['scaleFrom', 'scaleTo'],
    minGapSec: 6,
    promptHint: 'Punch on words the speaker stresses vocally. The word they WANT you to hear.',
  },
  {
    id: 'zoom-pull-back-resolve',
    type: 'zoom_pull_back',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    signal: 'narrative_resolve',
    description: 'Speaker wraps up a point or section',
    defaultParams: { scaleFrom: 1.08, scaleTo: 1.0 },
    requiredParams: ['scaleFrom', 'scaleTo'],
    minGapSec: 15,
    promptHint: 'Pull back as speaker resolves a point. Release the visual tension built by pushes/punches.',
  },
  {
    id: 'zoom-pull-back-wind-down',
    type: 'zoom_pull_back',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    signal: 'vocal_wind_down',
    description: 'Speaker energy decreasing, winding down',
    defaultParams: { scaleFrom: 1.06, scaleTo: 1.0 },
    requiredParams: ['scaleFrom', 'scaleTo'],
    minGapSec: 10,
    promptHint: 'Gentle pull back as energy fades. Breathing room before next section.',
  },
  {
    id: 'zoom-drift-visual-monotony',
    type: 'zoom_drift',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    signal: 'visual_monotony',
    description: 'Static frame needs subtle movement to stay alive',
    defaultParams: { direction: 'right' },
    requiredParams: ['direction'],
    minGapSec: 15,
    promptHint: 'Slow lateral drift to break visual monotony. Use when nothing else is happening.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSITIONS — narrative flow between sections
  // Creative doc: "Every transition needs sound. Silent transitions feel broken."
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'transition-hard-cut-topic',
    type: 'transition_hard_cut',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'topic_shift',
    description: 'Clean topic boundary — new subject, same energy',
    defaultParams: {},
    requiredParams: [],
    minGapSec: 3,
    promptHint: 'Default transition. Most cuts should be hard cuts. Use at clear topic boundaries.',
  },
  {
    id: 'transition-dissolve-topic',
    type: 'transition_dissolve',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'topic_shift',
    description: 'Gentle topic shift — related subjects, time passage',
    defaultParams: { durationMs: 600 },
    requiredParams: ['durationMs'],
    minGapSec: 10,
    promptHint: 'Dissolve between related topics when energy stays similar. 0.3-0.5s subtle, never > 1s.',
  },
  {
    id: 'transition-dissolve-emotional',
    type: 'transition_dissolve',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'emotional_shift',
    description: 'Mood changes — needs visual softening',
    defaultParams: { durationMs: 800 },
    requiredParams: ['durationMs'],
    minGapSec: 15,
    promptHint: 'Soften the emotional gear shift. Longer dissolve (0.5-1s) for bigger mood changes.',
  },
  {
    id: 'transition-fade-to-black',
    type: 'transition_fade_to_black',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'energy_drop',
    description: 'Chapter ending — major section boundary',
    defaultParams: { durationMs: 1000 },
    requiredParams: ['durationMs'],
    maxPerVideo: 3,
    minGapSec: 30,
    promptHint: 'Chapter endings ONLY. Max 2-3 per video. Major energy drop, not every pause.',
  },
  {
    id: 'transition-whip-pan',
    type: 'transition_whip_pan',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'energy_peak',
    description: 'High-energy moment needs visual urgency',
    defaultParams: { durationMs: 300 },
    requiredParams: ['durationMs'],
    maxPerVideo: 4,
    minGapSec: 20,
    promptHint: 'Urgency, comedy, surprise. Always with whoosh SFX. Max 3-4 per video.',
  },
  {
    id: 'transition-flash',
    type: 'transition_flash',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'energy_peak',
    description: 'Snapshot/memory effect — brief white flash',
    defaultParams: { durationMs: 150 },
    requiredParams: ['durationMs'],
    maxPerVideo: 3,
    minGapSec: 20,
    promptHint: 'Photo-flash effect. 2-6 frames. Never >3 flashes per second (accessibility).',
  },
  {
    id: 'transition-j-cut',
    type: 'transition_j_cut',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'vocal_build',
    description: 'Audio from next section starts before visual cut',
    defaultParams: { offsetMs: 500 },
    requiredParams: ['offsetMs'],
    minGapSec: 15,
    promptHint: 'Hear the next section before seeing it. Builds anticipation.',
  },
  {
    id: 'transition-l-cut',
    type: 'transition_l_cut',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'vocal_wind_down',
    description: 'Audio from current section lingers into next visual',
    defaultParams: { offsetMs: 500 },
    requiredParams: ['offsetMs'],
    minGapSec: 15,
    promptHint: 'Current audio trails into next visual. Lingering, reflective.',
  },
  {
    id: 'transition-soft-cut',
    type: 'transition_soft_cut',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'topic_shift',
    description: 'Subtle boundary — slight opacity dip',
    defaultParams: { durationMs: 400 },
    requiredParams: ['durationMs'],
    minGapSec: 8,
    promptHint: 'Gentler than hard cut, quicker than dissolve. For minor topic shifts.',
  },
  {
    id: 'transition-wipe',
    type: 'transition_wipe',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'scene_boundary',
    description: 'Playful scene change with directional wipe',
    defaultParams: { direction: 'left' },
    requiredParams: ['direction'],
    maxPerVideo: 3,
    minGapSec: 30,
    promptHint: 'Playful, retro. Use sparingly. Always with whoosh SFX matching direction.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CAPTION EMPHASIS — draw eye to key words
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'caption-emphasis-word',
    type: 'caption_emphasis',
    edlType: 'caption-emphasis',
    budgetCategory: 'caption',
    signal: 'emphasis_word',
    description: 'Speaker stresses a key word vocally',
    defaultParams: { emphasisWord: '' },
    requiredParams: ['emphasisWord'],
    minGapSec: 4,
    promptHint: 'Highlight the word the speaker emphasizes. Power words, key terms, names.',
  },
  {
    id: 'caption-emphasis-number',
    type: 'caption_emphasis',
    edlType: 'caption-emphasis',
    budgetCategory: 'caption',
    signal: 'number_mentioned',
    description: 'A number or statistic worth highlighting',
    defaultParams: { emphasisWord: '' },
    requiredParams: ['emphasisWord'],
    minGapSec: 5,
    promptHint: 'Numbers and stats that matter to the argument. Not every "two things".',
  },
  {
    id: 'caption-emphasis-cta',
    type: 'caption_emphasis',
    edlType: 'caption-emphasis',
    budgetCategory: 'caption',
    signal: 'cta',
    description: 'Call to action — subscribe, buy, click, etc.',
    defaultParams: { emphasisWord: '' },
    requiredParams: ['emphasisWord'],
    minGapSec: 10,
    promptHint: 'CTAs deserve emphasis. "Subscribe", "check out", "link below".',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SFX — audio punctuation at key moments
  // Creative doc: "Sound transforms image. Three layers: ambient, spot, feature."
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'sfx-whoosh-transition',
    type: 'sfx_whoosh',
    edlType: 'sfx',
    budgetCategory: 'sfx',
    signal: 'scene_boundary',
    description: 'Transition SFX — whoosh on dissolve/wipe/whip-pan',
    defaultParams: { volume: 0.3 },
    requiredParams: ['volume'],
    minGapSec: 5,
    promptHint: 'Pair with dissolve, wipe, or whip-pan transitions. Never on hard cuts.',
  },
  {
    id: 'sfx-impact-peak',
    type: 'sfx_impact',
    edlType: 'sfx',
    budgetCategory: 'sfx',
    signal: 'energy_peak',
    description: 'Impact hit at high-energy moment',
    defaultParams: { volume: 0.4 },
    requiredParams: ['volume'],
    maxPerVideo: 5,
    minGapSec: 10,
    promptHint: 'Punctuate genuine energy spikes. Pair with zoom_punch. Max 5 per video.',
  },
  {
    id: 'sfx-impact-emphasis',
    type: 'sfx_impact',
    edlType: 'sfx',
    budgetCategory: 'sfx',
    signal: 'emphasis_word',
    description: 'Subtle impact on emphasized word',
    defaultParams: { volume: 0.25 },
    requiredParams: ['volume'],
    minGapSec: 8,
    promptHint: 'Light impact on power words. Quieter than peak impacts.',
  },
  {
    id: 'sfx-shimmer-resolve',
    type: 'sfx_shimmer',
    edlType: 'sfx',
    budgetCategory: 'sfx',
    signal: 'narrative_resolve',
    description: 'Shimmer/sparkle at resolution moments',
    defaultParams: { volume: 0.2 },
    requiredParams: ['volume'],
    maxPerVideo: 4,
    minGapSec: 20,
    promptHint: 'Gentle shimmer as a point resolves. Achievement, revelation, conclusion.',
  },
  {
    id: 'sfx-ambient-opening',
    type: 'sfx_ambient',
    edlType: 'sfx',
    budgetCategory: 'sfx',
    signal: 'opening_hook',
    description: 'Ambient bed for opening sequence',
    defaultParams: { ambientType: 'soft_room_tone' },
    requiredParams: ['ambientType'],
    maxPerVideo: 2,
    minGapSec: 60,
    promptHint: 'Set the sonic environment. Opening and closing only.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPHICS — information visualization
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'graphic-stat-counter',
    type: 'graphic_stat_counter',
    edlType: 'graphic',
    budgetCategory: 'graphic',
    signal: 'number_mentioned',
    description: 'Animate a statistic or number on screen',
    defaultParams: { text: '', value: '', label: '' },
    requiredParams: ['value', 'label'],
    minGapSec: 15,
    promptHint: 'Only for IMPACTFUL numbers. params: value="73%" or "$4.2B", label="user satisfaction". Use EXACT number from transcript (never invent). "73% of users" yes, "2 or 3 things" no.',
  },
  {
    id: 'graphic-lower-third',
    type: 'graphic_lower_third',
    edlType: 'graphic',
    budgetCategory: 'graphic',
    signal: 'name_mentioned',
    description: 'Display a person/entity name with optional title',
    defaultParams: { name: '', title: '' },
    requiredParams: ['name'],
    minGapSec: 20,
    promptHint: 'FIRST mention of a person, company, or product. params: name="Hank Green", title="YouTuber" (title optional). Do NOT repeat for same entity.',
  },
  {
    id: 'graphic-callout',
    type: 'graphic_callout',
    edlType: 'graphic',
    budgetCategory: 'graphic',
    signal: 'emphasis_word',
    description: 'Callout box highlighting a key concept with heading and explanation',
    defaultParams: { title: '', body: '' },
    requiredParams: ['title', 'body'],
    minGapSec: 20,
    promptHint: 'Key CONCEPTS that need visual explanation. params: title="Selection Bias", body="When your sample isn\'t random". Heavier than keyword-highlight — use for ideas, not single words.',
  },
  {
    id: 'graphic-keyword-highlight',
    type: 'graphic_keyword_highlight',
    edlType: 'graphic',
    budgetCategory: 'graphic',
    signal: 'emphasis_word',
    description: 'Highlight a keyword in the visual field',
    defaultParams: { text: '' },
    requiredParams: ['text'],
    minGapSec: 10,
    promptHint: 'Quick keyword pop for CONCEPTUAL terms worth remembering. params: text="anonymity". Prefer multi-word concepts over single generic words. Never use filler, slang, or vague words.',
  },
  {
    id: 'graphic-quote-card',
    type: 'graphic_quote_card',
    edlType: 'graphic',
    budgetCategory: 'graphic',
    signal: 'emphasis_word',
    description: 'Display a direct quote or standout assertion',
    defaultParams: { quote: '', author: '' },
    requiredParams: ['quote'],
    maxPerVideo: 3,
    minGapSec: 30,
    promptHint: 'DIRECT QUOTES or standout assertions worth displaying verbatim. params: quote="The data doesn\'t lie", author="Speaker Name" (optional). Max 2-3 per video. Use transcript words VERBATIM.',
  },
  {
    id: 'graphic-logo-reveal',
    type: 'graphic_logo_reveal',
    edlType: 'graphic',
    budgetCategory: 'graphic',
    signal: 'opening_hook',
    description: 'Logo/brand reveal at opening or closing',
    defaultParams: { text: '' },
    requiredParams: ['text'],
    maxPerVideo: 2,
    minGapSec: 60,
    promptHint: 'Brand moment. Opening and/or closing only.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SPEED — temporal manipulation
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'speed-slow-motion',
    type: 'speed_slow_motion',
    edlType: 'speed-change',
    budgetCategory: 'speed',
    signal: 'vocal_peak',
    description: 'Slow down a key moment for weight and emphasis',
    defaultParams: { multiplier: 0.5 },
    requiredParams: ['multiplier'],
    maxPerVideo: 3,
    minGapSec: 30,
    promptHint: 'Weight, importance, beauty. The moment the viewer should FEEL. Rare.',
  },
  {
    id: 'speed-ramp',
    type: 'speed_ramp',
    edlType: 'speed-change',
    budgetCategory: 'speed',
    signal: 'energy_build',
    description: 'Speed ramp: normal → slow → normal',
    defaultParams: { fromMultiplier: 1.0, toMultiplier: 0.5 },
    requiredParams: ['fromMultiplier', 'toMultiplier'],
    maxPerVideo: 2,
    minGapSec: 45,
    promptHint: 'Build → peak → release. Pair with zoom push and beat drop. Very rare.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMERA SHAKE — physical emphasis
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'camera-shake-peak',
    type: 'camera_shake',
    edlType: 'camera-shake',
    budgetCategory: 'shake',
    signal: 'energy_peak',
    description: 'Physical shake at explosive energy moment',
    defaultParams: { intensity: 0.3 },
    requiredParams: ['intensity'],
    maxPerVideo: 3,
    minGapSec: 20,
    promptHint: 'Explosion of energy. Table slam, shouting, dramatic reveal. Max 3 per video.',
  },
  {
    id: 'camera-shake-emphasis',
    type: 'camera_shake',
    edlType: 'camera-shake',
    budgetCategory: 'shake',
    signal: 'emphasis_word',
    description: 'Subtle shake on heavily stressed word',
    defaultParams: { intensity: 0.15 },
    requiredParams: ['intensity'],
    maxPerVideo: 4,
    minGapSec: 15,
    promptHint: 'Subtle tremor on power words. Lower intensity than peak shake.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIO — ducking and bed selection
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'audio-duck-speech',
    type: 'audio_duck',
    edlType: 'audio-duck',
    budgetCategory: 'audio',
    signal: 'vocal_peak',
    description: 'Duck BGM under important speech',
    defaultParams: { level: 0.15 },
    requiredParams: ['level'],
    minGapSec: 10,
    promptHint: 'Duck music under key speech moments. -6 to -12 dB, attack 200-400ms.',
  },
  {
    id: 'audio-bed-select',
    type: 'audio_bed_select',
    edlType: 'sfx',
    budgetCategory: 'audio',
    signal: 'opening_hook',
    description: 'Select ambient bed mood for the video',
    defaultParams: { mood: 'neutral' },
    requiredParams: ['mood'],
    maxPerVideo: 2,
    minGapSec: 60,
    promptHint: 'Set the ambient tone. Opening establishes, closing resolves.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PACING — temporal adjustments
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'hold-longer-pause',
    type: 'hold_longer',
    edlType: 'pacing',
    budgetCategory: 'pacing',
    signal: 'rhetorical_pause',
    description: 'Let a pause breathe — speaker paused for effect',
    defaultParams: { extraMs: 400 },
    requiredParams: ['extraMs'],
    minGapSec: 15,
    promptHint: 'Rhetorical pauses are intentional. Let them land. 200-500ms extra.',
  },
  {
    id: 'hold-longer-resolve',
    type: 'hold_longer',
    edlType: 'pacing',
    budgetCategory: 'pacing',
    signal: 'narrative_resolve',
    description: 'Hold on the resolution moment',
    defaultParams: { extraMs: 300 },
    requiredParams: ['extraMs'],
    minGapSec: 20,
    promptHint: 'Let the resolution land before moving on. Brief hold.',
  },
  {
    id: 'cut-shorter-monotony',
    type: 'cut_shorter',
    edlType: 'pacing',
    budgetCategory: 'pacing',
    signal: 'visual_monotony',
    description: 'Tighten a section that drags',
    defaultParams: { removeMs: 500 },
    requiredParams: ['removeMs'],
    minGapSec: 15,
    promptHint: 'Compress dead spots where nothing happens. Tighten, dont destroy.',
  },
  {
    id: 'cut-shorter-closing',
    type: 'cut_shorter',
    edlType: 'pacing',
    budgetCategory: 'pacing',
    signal: 'closing_zone',
    description: 'Tighten the closing to keep it punchy',
    defaultParams: { removeMs: 300 },
    requiredParams: ['removeMs'],
    maxPerVideo: 2,
    minGapSec: 10,
    promptHint: 'Endings should be tight. Remove dead air after the last point.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MUSIC-DRIVEN — for content with dominant music and minimal speech.
  // Coordinates use target_timestamp_ms / target_beat_idx, not word indices.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'zoom-push-music-beat',
    type: 'zoom_push',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    signal: 'music_beat',
    description: 'Push on strong downbeat for rhythmic emphasis',
    defaultParams: { scaleFrom: 1.0, scaleTo: 1.06 },
    requiredParams: ['scaleFrom', 'scaleTo'],
    minGapSec: 4,
    promptHint: 'Push on strong downbeats, not every beat. Pick beats that start a new phrase.',
  },
  {
    id: 'zoom-punch-music-drop',
    type: 'zoom_punch',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    signal: 'music_drop',
    description: 'Punch on bass drop or energy drop',
    defaultParams: { scaleFrom: 1.0, scaleTo: 1.15 },
    requiredParams: ['scaleFrom', 'scaleTo'],
    maxPerVideo: 4,
    minGapSec: 15,
    promptHint: 'The DROP. The moment everything hits. Pair with impact SFX and camera shake.',
  },
  {
    id: 'zoom-drift-beat-accent',
    type: 'zoom_drift',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    // ⚠️ INVENTED signal — derived from CRG signal:audio.music_beat (downbeat accents). Needs calibration.
    signal: 'beat_accent',
    description: 'Drift during sustained rhythmic section',
    defaultParams: { direction: 'right' },
    requiredParams: ['direction'],
    minGapSec: 15,
    promptHint: 'Slow drift during verses or bridges where energy is sustained but static visually.',
  },
  {
    id: 'transition-hard-cut-section',
    type: 'transition_hard_cut',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'music_section_change',
    description: 'Hard cut at musical section boundary',
    defaultParams: {},
    requiredParams: [],
    minGapSec: 5,
    promptHint: 'Clean cut at verse→chorus, chorus→bridge. Most section changes should be hard cuts.',
  },
  {
    id: 'transition-dissolve-section',
    type: 'transition_dissolve',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'music_section_change',
    description: 'Dissolve at gentle musical section transition',
    defaultParams: { durationMs: 600 },
    requiredParams: ['durationMs'],
    minGapSec: 15,
    promptHint: 'Dissolve for gentle shifts: bridge→outro, verse→bridge. Not verse→chorus (too high-energy).',
  },
  {
    id: 'transition-flash-drop',
    type: 'transition_flash',
    edlType: 'transition',
    budgetCategory: 'transition',
    signal: 'music_drop',
    description: 'Flash on musical drop for visual impact',
    defaultParams: { durationMs: 150 },
    requiredParams: ['durationMs'],
    maxPerVideo: 3,
    minGapSec: 20,
    promptHint: 'Flash on THE drop. 2-6 frames. Never >3 flashes per second.',
  },
  {
    id: 'sfx-impact-drop',
    type: 'sfx_impact',
    edlType: 'sfx',
    budgetCategory: 'sfx',
    signal: 'music_drop',
    description: 'Impact hit at musical drop or energy peak',
    defaultParams: { volume: 0.4 },
    requiredParams: ['volume'],
    maxPerVideo: 4,
    minGapSec: 15,
    promptHint: 'Punctuate drops and energy peaks. Pair with zoom_punch. Complementary to the music, not competing.',
  },
  {
    id: 'camera-shake-drop',
    type: 'camera_shake',
    edlType: 'camera-shake',
    budgetCategory: 'shake',
    signal: 'music_drop',
    description: 'Physical shake on bass drop',
    defaultParams: { intensity: 0.3 },
    requiredParams: ['intensity'],
    maxPerVideo: 3,
    minGapSec: 20,
    promptHint: 'Bass drop = physical impact. Pair with zoom_punch and sfx_impact for the full hit.',
  },
  {
    id: 'speed-slow-motion-drop',
    type: 'speed_slow_motion',
    edlType: 'speed-change',
    budgetCategory: 'speed',
    signal: 'music_drop',
    description: 'Slow-mo at the drop for dramatic weight',
    defaultParams: { multiplier: 0.5 },
    requiredParams: ['multiplier'],
    maxPerVideo: 2,
    minGapSec: 30,
    promptHint: 'Slow the world down at THE moment. Very rare — 1-2 per video max.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VISUAL-DRIVEN — for content with dominant visual action and minimal speech.
  // Coordinates use target_timestamp_ms, not word indices.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'zoom-push-visual-peak',
    type: 'zoom_push',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    // ⚠️ INVENTED signal — derived from V-JEPA visualSignificance peaks. Not yet in CRG. Needs calibration.
    signal: 'visual_peak',
    description: 'Push on visually significant moment',
    defaultParams: { scaleFrom: 1.0, scaleTo: 1.06 },
    requiredParams: ['scaleFrom', 'scaleTo'],
    minGapSec: 6,
    promptHint: 'Push when visual significance peaks — subject reveal, key detail, compelling composition.',
  },
  {
    id: 'zoom-punch-motion-peak',
    type: 'zoom_punch',
    edlType: 'zoom',
    budgetCategory: 'zoom',
    // ⚠️ INVENTED signal — derived from CRG signal:visual.motion_intensity (local max > 0.6). Needs calibration.
    signal: 'motion_peak',
    description: 'Punch at high-motion action moment',
    defaultParams: { scaleFrom: 1.0, scaleTo: 1.12 },
    requiredParams: ['scaleFrom', 'scaleTo'],
    minGapSec: 8,
    promptHint: 'Punch on sudden motion spikes — action, impact, rapid movement. Not gradual pans.',
  },
  {
    id: 'transition-dissolve-visual',
    type: 'transition_dissolve',
    edlType: 'transition',
    budgetCategory: 'transition',
    // ⚠️ INVENTED signal — derived from V-JEPA visualSignificance peaks. Not yet in CRG. Needs calibration.
    signal: 'visual_peak',
    description: 'Dissolve at visual significance transition',
    defaultParams: { durationMs: 600 },
    requiredParams: ['durationMs'],
    minGapSec: 12,
    promptHint: 'Dissolve between visually significant moments. For gentle scene transitions, not action cuts.',
  },
  {
    id: 'sfx-impact-motion',
    type: 'sfx_impact',
    edlType: 'sfx',
    budgetCategory: 'sfx',
    // ⚠️ INVENTED signal — derived from CRG signal:visual.motion_intensity (local max > 0.6). Needs calibration.
    signal: 'motion_peak',
    description: 'Impact hit at high-motion visual moment',
    defaultParams: { volume: 0.35 },
    requiredParams: ['volume'],
    maxPerVideo: 5,
    minGapSec: 10,
    promptHint: 'Sound the visual impact. Collision, landing, sudden motion change.',
  },
  {
    id: 'speed-slow-motion-motion',
    type: 'speed_slow_motion',
    edlType: 'speed-change',
    budgetCategory: 'speed',
    // ⚠️ INVENTED signal — derived from CRG signal:visual.motion_intensity (local max > 0.6). Needs calibration.
    signal: 'motion_peak',
    description: 'Slow-mo at action peak for dramatic weight',
    defaultParams: { multiplier: 0.5 },
    requiredParams: ['multiplier'],
    maxPerVideo: 3,
    minGapSec: 25,
    promptHint: 'Slow the action at its peak. The catch, the jump, the collision. Rare and deliberate.',
  },
  {
    id: 'camera-shake-motion',
    type: 'camera_shake',
    edlType: 'camera-shake',
    budgetCategory: 'shake',
    // ⚠️ INVENTED signal — derived from CRG signal:visual.motion_intensity (local max > 0.6). Needs calibration.
    signal: 'motion_peak',
    description: 'Physical shake on visual impact',
    defaultParams: { intensity: 0.25 },
    requiredParams: ['intensity'],
    maxPerVideo: 4,
    minGapSec: 15,
    promptHint: 'Physical reaction to visual action. Lighter intensity than music drops.',
  },
];

// ─── Derived Constants (auto-computed from registry) ────────────────────────

export const VALID_DECISION_TYPES = new Set(DECISION_REGISTRY.map(e => e.type));
export const VALID_DECISION_REASONS = new Set(DECISION_REGISTRY.map(e => e.signal));
export const BUDGET_CATEGORIES = [...new Set(DECISION_REGISTRY.map(e => e.budgetCategory))];

export const TYPE_TO_EDL: Record<string, EditDecision['type']> = {};
export const TYPE_TO_BUDGET: Record<string, string> = {};
export const REQUIRED_PARAMS_MAP: Record<string, string[]> = {};
export const DEFAULT_PARAMS_MAP: Record<string, Record<string, number | string>> = {};
export const MAX_PER_VIDEO_MAP: Record<string, number> = {};

for (const entry of DECISION_REGISTRY) {
  TYPE_TO_EDL[entry.type] = entry.edlType;
  TYPE_TO_BUDGET[entry.type] = entry.budgetCategory;
  if (!REQUIRED_PARAMS_MAP[entry.type]) {
    REQUIRED_PARAMS_MAP[entry.type] = entry.requiredParams;
  }
  if (!DEFAULT_PARAMS_MAP[entry.type]) {
    DEFAULT_PARAMS_MAP[entry.type] = entry.defaultParams;
  }
  if (entry.maxPerVideo !== undefined) {
    const existing = MAX_PER_VIDEO_MAP[entry.type];
    MAX_PER_VIDEO_MAP[entry.type] = existing !== undefined ? Math.min(existing, entry.maxPerVideo) : entry.maxPerVideo;
  }
}
