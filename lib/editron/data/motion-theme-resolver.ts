/**
 * Motion Theme Resolver
 *
 * Pure, deterministic function: 8 content signals → 35 visual design tokens.
 * Rule-based, no AI. Each signal maps to specific visual properties via
 * linear interpolation and threshold rules. Conflict resolution follows
 * priority ordering: formality > enthusiasm > warmth > emotional_arousal.
 *
 * Called at pipeline time (Director phase). Results serialized into overlay
 * props. Never called at render time (Lambda).
 *
 * Signal sources: same 47-signal taxonomy as ThinkForge creative writing
 * (creative_content_doc_research.md). This resolver uses 8 launch signals.
 *
 * CRG constraints honored:
 *   constant:typography.stat_counter_min_font = 64px
 *   constant:typography.lower_third_name_min_font = 48px
 *   constant:typography.keyword_highlight_min_font = 48px
 */

// ─── Types ──────────────────────────────────────────────

export interface ContentSignals {
  // ── Original 8 signals (launch) ──
  formality: number;          // -1 (irreverent) to +1 (luxury)
  enthusiasm: number;         // 0-1
  warmth: number;             // 0-1
  emotional_arousal: number;  // 0-1
  pacing_velocity: number;    // 0-1
  humor: number;              // 0-1
  visceral_impact: number;    // 0-1
  visual_dependency: number;  // 0-1
  // ── Phase B expansion (9 signals) ──
  // Speech (Wav2Vec)
  emotion_intensity?: number;     // 0-1 ← signal:speech.emotional_valence → emphasisEasing
  pitch_variability?: number;     // 0-1 ← signal:speech.pitch_contour → staggerMs
  speaking_rate_wpm?: number;     // 80-220 ← signal:speech.speaking_rate_wpm → holdDurationMs
  silence_duration_ms?: number;   // 0+ ← signal:speech.silence_duration_ms → entrance delay
  // Visual (V-JEPA)
  face_present?: boolean;         // ← signal:visual.face_present → captionZoneAware
  // Audio
  music_energy?: number;          // 0-1 ← signal:audio.music_energy → surface.backdropBlur
  music_section?: string;         // 'verse'|'chorus'|'bridge'|'drop' ← signal:audio.music_section → staggerMs
  // Structural
  position_in_video?: number;     // 0-1 ← signal:structural.position_in_video → density
  // Composite
  narrative_pressure?: number;    // 0-1 ← signal:composite.narrative_pressure → overshoot
  // ── CEO Plan D1: 7 new signals wired to MG planner (2026-05-22) ──
  // Perceptual (biggest gap — zero perceptual signals reached MG before this)
  motion_intensity?: number;      // 0-1 ← signal:visual.motion_intensity → simpler MG on high motion
  shot_scale?: number;            // 0-1 ← signal:visual.shot_scale → MG size adapts to shot type
  face_emotion?: string;          // categorical ← signal:visual.face_emotion → MG color temperature
  // Emotional expansion
  speech_energy?: number;         // 0-1 ← signal:speech.energy → bolder animation on high energy
  stress_detected?: boolean;      // ← signal:speech.stress_detected → emphasis weighting
  // Structural expansion
  time_since_last_cut?: number;   // frames ← signal:structural.time_since_last_cut → MG opportunity
  // Composite expansion
  cinematic_moment?: number;      // 0-1 ← signal:composite.cinematic_moment → rich composition
}

export interface BrandInputs {
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  headingFont?: string;
  bodyFont?: string;
  monoFont?: string;
}

export interface MotionTokens {
  animation: {
    entranceEasing: string;
    exitEasing: string;
    emphasisEasing: string;
    entranceDurationMs: number;
    exitDurationMs: number;
    staggerMs: number;
    overshoot: boolean;
    entrancePattern: 'fade' | 'slide-up' | 'slide-left' | 'scale-up' | 'pop' | 'blur-in';
    exitPattern: 'fade' | 'slide-down' | 'scale-down' | 'blur-out';
  };
  typography: {
    headingFamily: string;
    bodyFamily: string;
    monoFamily: string;
    headingWeight: number;
    bodyWeight: number;
    headingTracking: string;
    headingTransform: 'none' | 'uppercase' | 'small-caps';
    sizeScale: number;        // multiplier: 0.85 (compact) to 1.2 (generous)
  };
  color: {
    primary: string;
    accent: string;
    textPrimary: string;
    textSecondary: string;
    surfaceBase: string;
    surfaceOpacity: number;
    temperature: 'cool' | 'neutral' | 'warm';
  };
  surface: {
    style: 'glass' | 'solid' | 'minimal' | 'gradient';
    backdropBlur: number;     // px
    cornerRadius: number;     // px
    borderWeight: number;     // px
    borderOpacity: number;    // 0-1
    shadow: string;           // CSS box-shadow
  };
  layout: {
    density: 'minimal' | 'standard' | 'rich';
    maxSimultaneous: number;
    holdDurationMs: number;
    alignment: 'left' | 'center';
    paddingScale: number;     // multiplier
  };
}

// ─── Constants ──────────────────────────────────────────

const DEFAULT_SIGNALS: ContentSignals = {
  formality: 0.0,
  enthusiasm: 0.5,
  warmth: 0.5,
  emotional_arousal: 0.4,
  pacing_velocity: 0.5,
  humor: 0.1,
  visceral_impact: 0.3,
  visual_dependency: 0.5,
};

// Insturix Design Bible v1.0 tokens ← thinkforge.css:1-48
const DEFAULT_BRAND: BrandInputs = {
  primaryColor: '#ECE9E1',       // --text-primary (warm off-white, not indigo — indigo is UI accent, not MG text)
  accentColor: '#D4A652',        // --accent-gold (decision moments)
  backgroundColor: '#0B0B0A',   // --canvas
  headingFont: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif", // --font-body ← thinkforge.css:46
  bodyFont: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
  monoFont: "'JetBrains Mono', monospace",  // --font-mono ← thinkforge.css:47
};

// ─── Utility ────────────────────────────────────────────

function lerp(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
  return outMin + t * (outMax - outMin);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Easing Presets ─────────────────────────────────────
// Organized by animation personality. Each maps to a GSAP ease string
// (consumed by useGSAPTimeline hook) or CSS cubic-bezier (consumed by
// current Shadow DOM templates).

const EASING_PRESETS = {
  gentle: 'power1.inOut',       // slow, contemplative: wedding, art, meditation
  smooth: 'power2.out',         // professional default: corporate, tutorial, tech
  snappy: 'power3.out',         // energetic: product launch, moderate enthusiasm
  sharp: 'power4.out',          // aggressive: fitness, sports, high energy
  elastic: 'elastic.out(1,0.5)',// playful bounce: comedy, entertainment, youth
  pop: 'back.out(1.7)',         // overshoot settle: keyword highlights, stat reveals
} as const;

// ─── Main Resolver ──────────────────────────────────────

/**
 * Resolve visual language tokens from content signals + brand DNA + optional hierarchy overrides.
 *
 * Resolution priority (highest wins):
 *   1. hierarchyOverrides (locked values from BRAND/CAMPAIGN/FORMAT/PROJECT/ACT scope)
 *   2. Signal-driven computation (content signals → token values)
 *   3. Brand DNA (colors, fonts — applied during signal resolution)
 *   4. System defaults (when no signal or override exists)
 *
 * hierarchyOverrides is a deep partial of MotionTokens. Any token set here
 * overrides the signal-computed value. Use for:
 *   - Brand-locked colors/fonts (from brand extraction or user input)
 *   - Campaign-level easing overrides (from ThinkForge hierarchy)
 *   - Thompson Sampling adjustments (from learned user preferences)
 *   - User manual overrides (from editor UI)
 */
export function resolveMotionTokens(
  signals: Partial<ContentSignals> = {},
  brand: Partial<BrandInputs> = {},
  hierarchyOverrides?: DeepPartial<MotionTokens>,
): MotionTokens {
  const s = { ...DEFAULT_SIGNALS, ...signals };
  const b = { ...DEFAULT_BRAND, ...brand };

  const computed: MotionTokens = {
    animation: resolveAnimation(s),
    typography: resolveTypography(s, b),
    color: resolveColor(s, b),
    surface: resolveSurface(s),
    layout: resolveLayout(s),
  };

  if (!hierarchyOverrides) return computed;

  return deepMerge(computed, hierarchyOverrides);
}

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function deepMerge<T extends Record<string, unknown>>(base: T, overrides: DeepPartial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(overrides) as Array<keyof T>) {
    const overrideValue = overrides[key];
    if (overrideValue === undefined) continue;
    const baseValue = base[key];
    if (
      baseValue !== null && typeof baseValue === 'object' && !Array.isArray(baseValue) &&
      overrideValue !== null && typeof overrideValue === 'object' && !Array.isArray(overrideValue)
    ) {
      result[key] = deepMerge(baseValue as Record<string, unknown>, overrideValue as DeepPartial<Record<string, unknown>>) as T[keyof T];
    } else {
      result[key] = overrideValue as T[keyof T];
    }
  }
  return result;
}

// ─── Animation Resolution ───────────────────────────────

function resolveAnimation(s: ContentSignals): MotionTokens['animation'] {
  // speech_energy (Wav2Vec/5-Track): high speech energy → bolder, faster animation
  // ← signal:speech.energy → animation speed. ⚠️ weight 0.3 INVENTED, needs calibration
  const speechEnergyBoost = typeof s.speech_energy === 'number' && isFinite(s.speech_energy) ? s.speech_energy * 0.3 : 0;
  // stress_detected (Wav2Vec): vocal stress → more overshoot, emphasis
  const hasStress = s.stress_detected === true;

  const energy = (s.enthusiasm + s.emotional_arousal + s.pacing_velocity) / 3 + speechEnergyBoost;
  const formalityNorm = (s.formality + 1) / 2; // normalize -1..+1 to 0..1

  // Entrance easing: energy + formality together determine the curve personality
  let entranceEasing: string;
  if (energy > 0.7 && formalityNorm < 0.3) {
    entranceEasing = EASING_PRESETS.elastic;
  } else if (energy > 0.6) {
    entranceEasing = EASING_PRESETS.sharp;
  } else if (formalityNorm > 0.7) {
    entranceEasing = EASING_PRESETS.gentle;
  } else if (energy > 0.4) {
    entranceEasing = EASING_PRESETS.snappy;
  } else if (formalityNorm > 0.5) {
    entranceEasing = EASING_PRESETS.smooth;
  } else {
    entranceEasing = EASING_PRESETS.smooth;
  }

  // Exit easing: always simpler than entrance (professional convention)
  const exitEasing = formalityNorm > 0.6 ? 'power1.in' : 'power2.in';

  // Emphasis easing: humor, visceral_impact, and emotion_intensity drive playfulness
  // emotion_intensity (Wav2Vec) upgrades emphasis when emotional arousal is high
  // ← signal:speech.emotional_valence → emphasisEasing
  const emotionBoost = typeof s.emotion_intensity === 'number' && isFinite(s.emotion_intensity) ? s.emotion_intensity : 0;
  let emphasisEasing: string;
  if (s.humor > 0.5 || (s.visceral_impact > 0.6 && formalityNorm < 0.4)) {
    emphasisEasing = EASING_PRESETS.pop;
  } else if (s.enthusiasm > 0.7 || emotionBoost > 0.7) {
    emphasisEasing = EASING_PRESETS.snappy;
  } else if (emotionBoost > 0.5) {
    emphasisEasing = EASING_PRESETS.snappy; // emotion_intensity 0.5+ → snappier emphasis
  } else {
    emphasisEasing = EASING_PRESETS.smooth;
  }

  // Duration: high energy = fast, high formality = slow
  // Range: 120ms (explosive) to 700ms (cinematic) ← value ranges from Director research
  const entranceDurationMs = Math.round(lerp(energy, 0, 1, 600, 150) * lerp(formalityNorm, 0, 1, 0.85, 1.3));
  const exitDurationMs = Math.round(entranceDurationMs * 0.8); // exits 20% faster ← creative_production_knowledge_v3:5702

  // Stagger: time between sequential elements in multi-part graphics
  // Range: 30ms (rapid-fire) to 150ms (dramatic reveal) ← from industry research
  // pitch_variability (Wav2Vec): high variation = shorter stagger (energetic speech)
  // ← signal:speech.pitch_contour → staggerMs. ⚠️ multiplier INVENTED, needs calibration
  const pitchMod = typeof s.pitch_variability === 'number' && isFinite(s.pitch_variability)
    ? lerp(s.pitch_variability, 0, 1, 1.2, 0.8)  // high pitch variation = faster stagger
    : 1.0;
  // music_section: chorus = faster stagger, bridge = slower, verse = baseline
  // ← signal:audio.music_section → staggerMs. ⚠️ multipliers INVENTED, needs calibration
  const sectionMultipliers: Record<string, number> = { verse: 1.0, chorus: 0.7, bridge: 1.3, drop: 0.5, intro: 1.1, outro: 1.2 };
  const sectionMod = typeof s.music_section === 'string' ? (sectionMultipliers[s.music_section] ?? 1.0) : 1.0;
  const staggerMs = Math.round(
    lerp(energy, 0, 1, 130, 40) * lerp(formalityNorm, 0, 1, 0.8, 1.2) * pitchMod * sectionMod,
  );

  // Overshoot: bounce past target. Casual + energetic, OR high narrative pressure.
  // ← signal:composite.narrative_pressure → overshoot. Threshold 0.6 ← creative_production_knowledge_v3:1820
  const narrativePressure = typeof s.narrative_pressure === 'number' && isFinite(s.narrative_pressure) ? s.narrative_pressure : 0;
  // stress_detected: vocal stress also triggers overshoot (speaker emphasis = visual emphasis)
  const overshoot = (formalityNorm < 0.4 && energy > 0.5) || narrativePressure > 0.6 || hasStress;

  // Entrance pattern: formality drives conservatism
  let entrancePattern: MotionTokens['animation']['entrancePattern'];
  if (formalityNorm > 0.7) {
    entrancePattern = 'fade';
  } else if (energy > 0.6 && s.humor > 0.3) {
    entrancePattern = 'pop';
  } else if (energy > 0.5) {
    entrancePattern = 'slide-up';
  } else if (formalityNorm > 0.5) {
    entrancePattern = 'blur-in';
  } else {
    entrancePattern = 'slide-left';
  }

  const exitPattern: MotionTokens['animation']['exitPattern'] =
    formalityNorm > 0.6 ? 'fade' : 'slide-down';

  return {
    entranceEasing,
    exitEasing,
    emphasisEasing,
    entranceDurationMs: clamp(entranceDurationMs, 120, 700),
    exitDurationMs: clamp(exitDurationMs, 80, 500),
    staggerMs: clamp(staggerMs, 30, 150),
    overshoot,
    entrancePattern,
    exitPattern,
  };
}

// ─── Typography Resolution ──────────────────────────────

function resolveTypography(s: ContentSignals, b: BrandInputs): MotionTokens['typography'] {
  const formalityNorm = (s.formality + 1) / 2;

  // Heading weight: casual = bold (700-800), formal = medium (400-500)
  // With warmth influence: warmer = slightly lighter
  const headingWeight = Math.round(
    lerp(formalityNorm, 0, 1, 800, 400) - (s.warmth > 0.7 ? 50 : 0)
  );

  // Tracking: casual = tight (-0.02em), formal = wide (0.08em)
  const trackingValue = lerp(formalityNorm, 0, 1, -0.02, 0.08);
  const headingTracking = `${trackingValue.toFixed(3)}em`;

  // Transform: very casual = uppercase, very formal = none, mid = none
  let headingTransform: MotionTokens['typography']['headingTransform'] = 'none';
  if (formalityNorm < 0.2 && s.enthusiasm > 0.6) {
    headingTransform = 'uppercase';
  } else if (formalityNorm > 0.8) {
    headingTransform = 'small-caps';
  }

  // Size scale: visual_dependency drives how much screen space text occupies
  const sizeScale = lerp(s.visual_dependency, 0, 1, 0.9, 1.15);

  return {
    headingFamily: b.headingFont || DEFAULT_BRAND.headingFont!,
    bodyFamily: b.bodyFont || DEFAULT_BRAND.bodyFont!,
    monoFamily: b.monoFont || DEFAULT_BRAND.monoFont!,
    headingWeight: clamp(headingWeight, 300, 900),
    bodyWeight: clamp(headingWeight - 200, 300, 600),
    headingTracking,
    headingTransform,
    sizeScale: clamp(sizeScale, 0.85, 1.2),
  };
}

// ─── Color Resolution ───────────────────────────────────

function resolveColor(s: ContentSignals, b: BrandInputs): MotionTokens['color'] {
  const formalityNorm = (s.formality + 1) / 2;

  // Temperature: warmth signal is the primary driver
  // face_emotion (V-JEPA): happy/excited faces bias toward warm, sad/angry toward cool
  // ← signal:visual.face_emotion → color temperature. Standard MG practice: match mood to color.
  let warmthBias = s.warmth;
  if (typeof s.face_emotion === 'string') {
    const warmEmotions = new Set(['happy', 'excited', 'surprised', 'content']);
    const coolEmotions = new Set(['sad', 'angry', 'fearful', 'disgusted']);
    if (warmEmotions.has(s.face_emotion)) warmthBias = Math.min(1, warmthBias + 0.15);
    else if (coolEmotions.has(s.face_emotion)) warmthBias = Math.max(0, warmthBias - 0.15);
  }
  let temperature: MotionTokens['color']['temperature'];
  if (warmthBias > 0.65) temperature = 'warm';
  else if (warmthBias < 0.35) temperature = 'cool';
  else temperature = 'neutral';

  // Surface opacity: high formality = more transparent (let footage breathe)
  // High visual_dependency = more opaque (graphics carry information)
  const surfaceOpacity = clamp(
    lerp(formalityNorm, 0, 1, 0.9, 0.7) + lerp(s.visual_dependency, 0, 1, -0.05, 0.1),
    0.5, 0.95,
  );

  // Text secondary color: warm = warmer gray, cool = cooler gray
  const textSecondary = temperature === 'warm' ? '#A89A8C'
    : temperature === 'cool' ? '#8994A8'
    : '#94A3B8';

  return {
    primary: b.primaryColor || DEFAULT_BRAND.primaryColor!,
    accent: b.accentColor || DEFAULT_BRAND.accentColor!,
    textPrimary: '#FFFFFF',
    textSecondary,
    surfaceBase: b.backgroundColor || DEFAULT_BRAND.backgroundColor!,
    surfaceOpacity,
    temperature,
  };
}

// ─── Surface Resolution ─────────────────────────────────

function resolveSurface(s: ContentSignals): MotionTokens['surface'] {
  const formalityNorm = (s.formality + 1) / 2;
  const energy = (s.enthusiasm + s.emotional_arousal) / 2;

  // Style: formality + energy determine material
  let style: MotionTokens['surface']['style'];
  if (formalityNorm > 0.7) {
    style = s.warmth > 0.6 ? 'minimal' : 'glass';
  } else if (energy > 0.7 && formalityNorm < 0.3) {
    style = 'solid';
  } else if (s.visceral_impact > 0.6) {
    style = 'gradient';
  } else {
    style = 'glass';
  }

  // Backdrop blur: glass = 12-16px, minimal = 0, solid = 0, gradient = 8px
  // music_energy reduces blur for vibrant feel during high-energy sections
  // ← signal:audio.music_energy → backdropBlur. ⚠️ 0.8x multiplier INVENTED
  const musicEnergyMod = typeof s.music_energy === 'number' && isFinite(s.music_energy)
    ? lerp(s.music_energy, 0, 1, 1.0, 0.8)  // high music energy = 20% less blur
    : 1.0;
  const backdropBlur = style === 'glass' ? Math.round(lerp(formalityNorm, 0, 1, 12, 20) * musicEnergyMod)
    : style === 'gradient' ? Math.round(8 * musicEnergyMod)
    : 0;

  // Corner radius: warmth drives roundness
  // Range: 4px (cold/angular) to 16px (warm/rounded) ← from Director research
  const cornerRadius = Math.round(lerp(s.warmth, 0, 1, 4, 16));

  // Border: formal styles get subtle borders
  const borderWeight = formalityNorm > 0.4 && style !== 'solid' ? 1 : 0;
  const borderOpacity = formalityNorm > 0.4 ? lerp(formalityNorm, 0.4, 1, 0.06, 0.15) : 0;

  // Shadow: minimal and glass get subtle shadows, solid gets none
  let shadow = 'none';
  if (style === 'glass' || style === 'minimal') {
    const intensity = lerp(formalityNorm, 0, 1, 0.1, 0.2);
    shadow = `0 4px 16px rgba(0,0,0,${intensity.toFixed(2)})`;
  }

  return {
    style,
    backdropBlur,
    cornerRadius: clamp(cornerRadius, 4, 16),
    borderWeight,
    borderOpacity: clamp(borderOpacity, 0, 0.15),
    shadow,
  };
}

// ─── Layout Resolution ──────────────────────────────────

function resolveLayout(s: ContentSignals): MotionTokens['layout'] {
  // Density: visual_dependency is the primary driver
  // position_in_video modulates: early in video = simpler (avoid overwhelming opener)
  // ← signal:structural.position_in_video → density. ⚠️ early-video reduction INVENTED
  let density: MotionTokens['layout']['density'];
  if (s.visual_dependency > 0.7) density = 'rich';
  else if (s.visual_dependency < 0.3) density = 'minimal';
  else density = 'standard';

  const posInVideo = typeof s.position_in_video === 'number' && isFinite(s.position_in_video) ? s.position_in_video : 0.5;
  if (posInVideo < 0.15 && density !== 'minimal') {
    density = density === 'rich' ? 'standard' : 'minimal'; // reduce 1 tier in first 15%
  }

  // motion_intensity: high motion frames → simpler MG (avoid visual clutter over moving content)
  // ← signal:visual.motion_intensity → density. ⚠️ threshold 0.7 INVENTED, needs calibration
  const motionIntensity = typeof s.motion_intensity === 'number' && isFinite(s.motion_intensity) ? s.motion_intensity : 0;
  if (motionIntensity > 0.7 && density !== 'minimal') {
    density = density === 'rich' ? 'standard' : 'minimal';
  }

  // time_since_last_cut: very recent cuts → simpler MG (let the cut breathe)
  // ← signal:structural.time_since_last_cut → density. ⚠️ threshold 30 frames INVENTED
  const timeSinceCut = typeof s.time_since_last_cut === 'number' && isFinite(s.time_since_last_cut) ? s.time_since_last_cut : 999;
  if (timeSinceCut < 30 && density !== 'minimal') {
    density = density === 'rich' ? 'standard' : 'minimal';
  }

  // Max simultaneous: limits how many graphics can overlap
  const maxSimultaneous = density === 'rich' ? 3 : density === 'standard' ? 2 : 1;

  // Hold duration: how long a graphic stays visible after entrance animation
  // Range: 2000ms (fast-paced) to 5000ms (contemplative) ← from Director research
  // speaking_rate_wpm refines: fast speakers = shorter hold, slow = longer
  // ← signal:speech.speaking_rate_wpm → holdDurationMs. ⚠️ blend factor INVENTED
  const energy = (s.enthusiasm + s.pacing_velocity) / 2;
  let holdDurationMs = Math.round(lerp(energy, 0, 1, 4500, 2000));
  if (typeof s.speaking_rate_wpm === 'number' && isFinite(s.speaking_rate_wpm) && s.speaking_rate_wpm > 0) {
    const wpmFactor = lerp(clamp(s.speaking_rate_wpm, 80, 220), 80, 220, 1.15, 0.75);
    holdDurationMs = Math.round(holdDurationMs * wpmFactor); // fast speech = shorter hold
  }

  // Alignment: formality drives center vs left
  const formalityNorm = (s.formality + 1) / 2;
  const alignment: MotionTokens['layout']['alignment'] = formalityNorm > 0.6 ? 'center' : 'left';

  // Padding scale: warmth + formality = generous spacing
  const paddingScale = lerp(formalityNorm, 0, 1, 0.85, 1.2) * lerp(s.warmth, 0, 1, 0.9, 1.1);

  return {
    density,
    maxSimultaneous: clamp(maxSimultaneous, 1, 4),
    holdDurationMs: clamp(holdDurationMs, 2000, 5000),
    alignment,
    paddingScale: clamp(paddingScale, 0.75, 1.4),
  };
}
