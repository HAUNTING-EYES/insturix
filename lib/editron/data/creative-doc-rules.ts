/**
 * Creative Production Knowledge v2 — Extracted Rules
 *
 * Source: docs/creative-production-knowledge-v2.pdf (37 pages, 12 sections)
 * This file extracts the RULES (not prose) as typed constants for:
 *   (a) Deterministic code paths (pacing calculations, transition selection)
 *   (b) Gemini prompt injection via getCreativeRulesPromptText() (~10K tokens)
 *
 * Philosophy from the doc: "No rules — only menus of techniques with honest
 * descriptions of their emotional effects. The LLM selects based on script
 * intent, not by following rules."
 */

// ─── §3: Pacing by Content Type ──────────────────────────────────

export const PACING_BY_CONTENT_TYPE: Record<string, {
  cutsPerMin: [number, number];
  avgShotDurationSec: [number, number];
  description: string;
}> = {
  'brand-nostalgia':   { cutsPerMin: [6, 10],  avgShotDurationSec: [3, 6],   description: 'Slow, emotional. Let moments breathe.' },
  'brand-energy':      { cutsPerMin: [12, 20], avgShotDurationSec: [1.5, 3], description: 'Forward momentum, energetic.' },
  'product-demo':      { cutsPerMin: [4, 8],   avgShotDurationSec: [4, 10],  description: 'Viewer needs to see and process.' },
  'tutorial':          { cutsPerMin: [4, 8],   avgShotDurationSec: [5, 10],  description: 'Measured, clear.' },
  'ugc-social':        { cutsPerMin: [15, 30], avgShotDurationSec: [0.5, 2], description: 'Attention-grabbing, every shot delivers instantly.' },
  'documentary':       { cutsPerMin: [5, 8],   avgShotDurationSec: [3, 8],   description: 'B-roll can be faster (2-3s).' },
  'talking-head':      { cutsPerMin: [5, 8],   avgShotDurationSec: [3, 8],   description: 'Jump cuts OK for vlog style.' },
  'music-video':       { cutsPerMin: [20, 40], avgShotDurationSec: [0.5, 2], description: 'Varies with BPM.' },
  'horror-thriller':   { cutsPerMin: [4, 10],  avgShotDurationSec: [4, 10],  description: '4-10s tension, 0.25-1s scares. Contrast creates effect.' },
  'comedy':            { cutsPerMin: [8, 15],  avgShotDurationSec: [2, 5],   description: 'Hold for setup, cut sharp for punchline.' },
  'asmr-relaxation':   { cutsPerMin: [2, 4],   avgShotDurationSec: [5, 15],  description: 'The point is NOT to cut.' },
  'bollywood-song':    { cutsPerMin: [16, 24], avgShotDurationSec: [1, 3],   description: 'Metric montage synced to beats.' },
  'k-drama-emotional': { cutsPerMin: [4, 6],   avgShotDurationSec: [3, 10],  description: '30-100% longer holds than Western. Reaction holds 3-5s.' },
  'corporate':         { cutsPerMin: [6, 10],  avgShotDurationSec: [3, 6],   description: 'Professional, measured.' },
  'interview':         { cutsPerMin: [5, 8],   avgShotDurationSec: [3, 8],   description: 'B-roll intercut.' },
  'ad':                { cutsPerMin: [12, 20], avgShotDurationSec: [1.5, 3], description: 'Fast, dynamic.' },
  'vlog':              { cutsPerMin: [10, 18], avgShotDurationSec: [2, 4],   description: 'Jump cuts standard.' },
};

// ─── §4: Transitions by Emotional Intent ─────────────────────────

export const TRANSITIONS_BY_INTENT: Record<string, {
  types: string[];
  sound: string;
  notes: string;
}> = {
  'continuation':      { types: ['hard-cut'],                      sound: 'ambient crossfade 0.1-0.3s',       notes: 'Default. Most cuts in any video.' },
  'connection':        { types: ['match-cut'],                     sound: 'sustained tone or silence',          notes: 'Shape/movement/color match between shots.' },
  'anticipation':      { types: ['l-cut'],                         sound: 'hear next scene before seeing it',   notes: 'Audio leads video.' },
  'lingering':         { types: ['j-cut'],                         sound: 'hear previous scene into next',      notes: 'Audio trails video.' },
  'time-passing':      { types: ['dissolve'],                      sound: 'ambient crossfade + optional shimmer', notes: '0.3-0.5s subtle, 1-2s dreamy. Color temps must match.' },
  'chapter-ending':    { types: ['fade-to-black'],                 sound: 'audio fade matching picture',        notes: 'Use <2-3 per video.' },
  'new-beginning':     { types: ['fade-from-black'],               sound: 'ambient fade in',                    notes: 'Awakening, fresh start.' },
  'energy-shift':      { types: ['wipe'],                          sound: 'whoosh matching direction',           notes: 'Playful, retro.' },
  'impact':            { types: ['zoom-punch'],                    sound: 'impact hit REQUIRED',                notes: '2-3 per video max outside high-energy.' },
  'snapshot-memory':   { types: ['flash'],                         sound: 'shutter click or burst',             notes: '2-6 frames. Never >3 flashes/sec (accessibility).' },
  'urgency':           { types: ['whip-pan'],                      sound: 'always whoosh',                      notes: 'Comedy, urgency.' },
  'seamless':          { types: ['invisible-cut'],                 sound: 'continuous ambient across cut',       notes: 'One-take illusion.' },
  'transformation':    { types: ['morph'],                         sound: 'morphing/stretching',                notes: 'Requires alignment between shots.' },
};

// ─── §5: Color by Content Type ───────────────────────────────────

export const COLOR_BY_CONTENT_TYPE: Record<string, {
  temperature: string;
  saturation: string;
  notes: string;
}> = {
  'nostalgia':    { temperature: 'warm (2700-4000K)',  saturation: 'moderate',  notes: 'Golden/amber. Food, family, memory.' },
  'professional': { temperature: 'cool (6500K+)',      saturation: 'moderate',  notes: 'Blue/teal. Tech, corporate.' },
  'cinematic':    { temperature: 'teal-orange',        saturation: 'high',      notes: 'Complementary contrast. Can feel generic if overused.' },
  'documentary':  { temperature: 'neutral-desaturated', saturation: 'low',      notes: 'Serious, honest.' },
  'energetic':    { temperature: 'high-saturation',    saturation: 'very high', notes: 'Youth, pop. Bollywood, Latin American.' },
  'luxury':       { temperature: 'monochromatic/B&W',  saturation: 'minimal',  notes: 'Timelessness, art. Hides AI color inconsistencies.' },
  'gentle':       { temperature: 'pastel/soft',        saturation: 'low-moderate', notes: 'Beauty, skincare, wellness.' },
  'organic':      { temperature: 'earth tones',        saturation: 'moderate',  notes: 'Eco, outdoor, artisanal.' },
  'futuristic':   { temperature: 'neon/cyberpunk',     saturation: 'very high', notes: 'Tech, EDM, Gen Z.' },
};

// ─── §6: Sound Design Rules ─────────────────────────────────────

export const SOUND_LAYERS = {
  ambient:  { levelDb: [-30, -20], description: 'Creates place. Room tone, outdoor air. Continuous, felt not heard.' },
  spotSfx:  { levelDb: [-18, -12], description: 'On-screen actions. Door close, cup clink. Missing spot SFX breaks reality.' },
  featureSfx: { levelDb: [-12, -6], description: 'Story/transition moments. Impact hits, whooshes. Editorial, not real-world.' },
} as const;

export const MUSIC_TEMPO_BY_MOOD: Record<string, { bpmRange: [number, number]; genres: string }> = {
  'meditative':      { bpmRange: [40, 60],   genres: 'Ambient, drone' },
  'calm-nostalgic':  { bpmRange: [60, 80],   genres: 'Ballads, lo-fi' },
  'conversational':  { bpmRange: [80, 100],  genres: 'Pop ballad, jazz' },
  'upbeat':          { bpmRange: [100, 120], genres: 'Pop, indie' },
  'energetic':       { bpmRange: [120, 140], genres: 'EDM, house' },
  'intense':         { bpmRange: [140, 160], genres: 'D&B, dubstep' },
  'extreme':         { bpmRange: [160, 200], genres: 'Hardcore' },
};

// ─── §7: Voice Pacing ────────────────────────────────────────────

export const VOICE_WPM_BY_TONE: Record<string, { wpm: [number, number] }> = {
  'dramatic':       { wpm: [100, 120] },
  'narration':      { wpm: [130, 150] },
  'conversational': { wpm: [140, 160] },
  'energetic':      { wpm: [160, 180] },
  'rapid-social':   { wpm: [180, 200] },
};

// ─── §8: Caption Timing [TECHNICAL SPEC] ─────────────────────────

export const CAPTION_TIMING = {
  maxLinesPerSubtitle: 2,
  maxCharsPerLine: 42,
  readingSpeedWPM: 180,  // max
  minDisplaySec: 1.0,
  maxDisplaySec: 7.0,
  appearBeforeSpeechSec: 0.25,
  disappearAfterSpeechSec: 0.25,
  minGapBetweenCaptionsSec: 0.08,
  neverSpanHardCut: true,
} as const;

// ─── §10: Platform Specs [TECHNICAL SPEC] ────────────────────────

export const PLATFORM_SPECS: Record<string, {
  aspect: string;
  resolution: string;
  maxDurationSec: number;
  optimalDurationSec: [number, number];
  loudnessLUFS: number;
}> = {
  'youtube':    { aspect: '16:9', resolution: '1920x1080', maxDurationSec: 43200, optimalDurationSec: [480, 900], loudnessLUFS: -14 },
  'youtube-shorts': { aspect: '9:16', resolution: '1080x1920', maxDurationSec: 180, optimalDurationSec: [30, 60], loudnessLUFS: -14 },
  'instagram-reels': { aspect: '9:16', resolution: '1080x1920', maxDurationSec: 90, optimalDurationSec: [15, 30], loudnessLUFS: -14 },
  'tiktok':     { aspect: '9:16', resolution: '1080x1920', maxDurationSec: 600, optimalDurationSec: [15, 60], loudnessLUFS: -14 },
  'linkedin':   { aspect: '16:9', resolution: '1920x1080', maxDurationSec: 600, optimalDurationSec: [30, 180], loudnessLUFS: -14 },
  'twitter':    { aspect: '16:9', resolution: '1920x1080', maxDurationSec: 140, optimalDurationSec: [15, 45], loudnessLUFS: -14 },
  'facebook':   { aspect: '1:1',  resolution: '1080x1080', maxDurationSec: 14400, optimalDurationSec: [60, 180], loudnessLUFS: -14 },
};

// ─── §4+6: Transition→Sound Pairing ─────────────────────────────

export const TRANSITION_SOUND_PAIRING: Record<string, string> = {
  'hard-cut': 'ambient crossfade (0.1-0.3s)',
  'dissolve': 'ambient crossfade + optional shimmer',
  'fade-to-black': 'audio fade matching picture',
  'wipe': 'whoosh matching direction/speed',
  'zoom-punch': 'impact hit or bass drop (required)',
  'flash': 'shutter click or burst',
  'whip-pan': 'fast whoosh (always)',
  'match-cut': 'sustained tone or silence',
};

// ─── Sequencing / Ordering Moves (narrative-ordering lane) ──────

/**
 * SEQUENCING_MOVES — how to ORDER clips into a narrative. This is the layer the
 * PACING / TRANSITIONS / COLOR / SOUND menus above do NOT cover: those say how to
 * CUT and DECORATE a timeline; this says which clip opens, what builds, and how one
 * clip should follow another.
 *
 * Same philosophy as the rest of the doc (see file header): "No rules — only menus
 * of techniques with honest descriptions of their emotional effects. The LLM selects
 * based on script intent, not by following rules." These are PRIORS the ordering LLM
 * leans on, not a fixed template and NOT a named-arc menu the user picks.
 *
 * `signalsFor` names the EDITING signals (creative-knowledge-graph.json:
 * signal:entity.* / signal:composite.* / signal:structural.* / signal:speech.*) that
 * make each move appropriate — all verified to exist. Consumed by the narrative-ordering
 * pass in lib/editron/storyline (ordering-plan.ts), which validates its output against
 * hard contracts (source-order coherence, budget, hook-first). Nothing here is forced.
 *
 * NOTE on narrative phase: signal:entity.narrative_phase is position-computed today
 * (first 15% = opening … final 15% = closing). The ordering LLM derives a clip's phase
 * from its CONTENT, not its position, so these moves reason about phase semantically.
 */
export const SEQUENCING_MOVES = {
  'hook-first': {
    effect: 'Open on the strongest moment (a claim, a question, a peak), not the chronological start. Buys attention before context.',
    signalsFor: [
      'entity_narrative_phase: opening or climax',
      'entity_rhetorical_question',
      'high composite_narrative_pressure',
      'high speech_energy',
    ],
    whenNotTo: 'Slow-burn / meditative content where a cold open breaks the mood (asmr-relaxation, k-drama-emotional).',
  },
  'therefore-but-join': {
    effect: 'Each clip should follow the last by consequence ("therefore") or reversal ("but"), never mere sequence ("and then"). Consequence/reversal is what makes an order feel like a story instead of a list.',
    signalsFor: [
      'entity_topic_boundary (a shift wants a but/therefore, not a smash)',
      'entity_claim_strength change',
    ],
    whenNotTo: 'Deliberate montage (composite_montage_mode) where rhythm, not logic, drives the sequence.',
  },
  'setup-before-payoff': {
    effect: 'A payoff clip must come AFTER its setup; a raised question must be answered later; never show a conclusion whose premise the viewer has not seen.',
    signalsFor: [
      'entity_rhetorical_question -> its later answer',
      'entity_topic_boundary recurrence (a topic reintroduced pays off its earlier setup)',
    ],
    whenNotTo: 'In-medias-res openings that intentionally withhold, then backfill — allowed, but the backfill must still arrive.',
  },
  'group-by-topic': {
    effect: 'Keep clips about one idea adjacent so the argument builds, instead of scattering a topic across the timeline.',
    signalsFor: [
      'entity_topic_boundary',
      'composite_narrative_pressure clusters toward the peak',
    ],
    whenNotTo: 'Contrast/parallel edits where interleaving two topics IS the point.',
  },
  'pacing-variation': {
    effect: 'Vary intensity across the sequence — build toward a peak, then release. Do not stack all high-energy or all low-energy clips.',
    signalsFor: [
      'speech_energy_delta',
      'composite_movement_phrase_phase',
      'entity_narrative_phase: build -> climax -> resolve',
    ],
    whenNotTo: 'Sustained-tone formats (asmr, meditative) where flatness is intended.',
  },
  'end-on-resolution': {
    effect: 'Close on the payoff / resolution the sequence built toward (and the CTA if present) — not a limp filler shot.',
    signalsFor: [
      'entity_cta + structural_position_in_video > 0.8',
      'entity_narrative_phase: resolve | cta | closing',
    ],
    whenNotTo: 'Loop-optimized short-form where the end feeds back to the start.',
  },
} as const;

/** Stable ids of the ordering moves — lets the composer key/validate against the menu type-safely. */
export type SequencingMove = keyof typeof SEQUENCING_MOVES;

// ─── Prompt Text Export ──────────────────────────────────────────

/**
 * Returns ~10K tokens of creative doc rules formatted for Gemini injection.
 * Used by gemini-context-cache.ts to create cached content.
 */
export function getCreativeRulesPromptText(): string {
  const sections: string[] = [];

  sections.push(`<role>You are a professional video editor with deep knowledge of cinematic theory, pacing, sound design, and cultural editing traditions.</role>

<task>Use these rules when making ANY creative decision about video editing.</task>

<rules>
# Creative Production Knowledge — Editing Rules Reference

## PACING RULES (from Walter Murch, Karen Pearlman, Ken Dancyger)
"The six criteria for every cut, in order: Emotion (51%), Story (23%), Rhythm (10%), Eye-trace (7%), Planarity (5%), Spatial continuity (4%). Sacrifice from the bottom up, never from the top down."

Pacing by content type (cuts/min | avg shot duration):
${Object.entries(PACING_BY_CONTENT_TYPE).map(([k, v]) => `- ${k}: ${v.cutsPerMin[0]}-${v.cutsPerMin[1]} cuts/min, ${v.avgShotDurationSec[0]}-${v.avgShotDurationSec[1]}s per shot. ${v.description}`).join('\n')}

Speed manipulation:
- Slow motion (25-75%): weight, importance, beauty
- Speed ramp: normal→slow→normal, paired with whoosh + beat drop
- Jump cut: energy, urgency, "cutting the fat" — YouTube/creator standard

## TRANSITION RULES (Michel Chion's synchresis: sound + visual MUST be simultaneous)
"Every transition needs sound. Silent transitions feel broken."

${Object.entries(TRANSITIONS_BY_INTENT).map(([k, v]) => `- ${k}: ${v.types.join('/')} — Sound: ${v.sound}. ${v.notes}`).join('\n')}

Common failures: dissolve between contrasting moods, dip-to-black in montage, missing transition sound, too many special transitions (pick 1-2 + hard cuts).

## COLOR RULES (Josef Albers: colors change meaning based on adjacency)
${Object.entries(COLOR_BY_CONTENT_TYPE).map(([k, v]) => `- ${k}: ${v.temperature}, ${v.saturation} saturation. ${v.notes}`).join('\n')}

Critical: Skin tones fall along vectorscope I-line (~123°). If skin deviates, grade is unnatural. Skin > creative grade in priority.

## SOUND DESIGN (Michel Chion's Audio-Vision)
"Sound transforms image. The same hallway becomes three different scenes based on audio."
Three layers (NEVER leave a scene silent):
- Ambient bed: ${SOUND_LAYERS.ambient.levelDb[0]} to ${SOUND_LAYERS.ambient.levelDb[1]} dB. ${SOUND_LAYERS.ambient.description}
- Spot SFX: ${SOUND_LAYERS.spotSfx.levelDb[0]} to ${SOUND_LAYERS.spotSfx.levelDb[1]} dB. ${SOUND_LAYERS.spotSfx.description}
- Feature SFX: ${SOUND_LAYERS.featureSfx.levelDb[0]} to ${SOUND_LAYERS.featureSfx.levelDb[1]} dB. ${SOUND_LAYERS.featureSfx.description}

Music ducking: -6 to -12 dB under speech, attack 200-400ms, release 400-800ms.

## CAPTION RULES
Max ${CAPTION_TIMING.maxLinesPerSubtitle} lines, ${CAPTION_TIMING.maxCharsPerLine} chars/line. Appear ${CAPTION_TIMING.appearBeforeSpeechSec}s before speech, disappear ${CAPTION_TIMING.disappearAfterSpeechSec}s after. Never span a hard cut.

## CROSS-DOMAIN INTERACTIONS
- Fast cuts need energetic music, quick SFX. Slow cuts need richer ambient.
- Warm grades pair with acoustic/analog. Cool with electronic/clean.
- Dissolves between different color temps = ugly middle frames. Match or use opaque.
- Camera push-in builds toward a cut. Pull-back resolves before cutting.
- VO pace sets edit pace. Cuts align with sentence boundaries.
</rules>`);

  return sections.join('\n\n');
}
