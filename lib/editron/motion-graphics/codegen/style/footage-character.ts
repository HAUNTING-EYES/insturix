/**
 * MG Codegen — STYLE RESOLVER, classifier 2: FOOTAGE CHARACTER → treatment narrowing.
 *
 * The font sets the brand's style identity; the FOOTAGE narrows it to THIS video (your "footage is an
 * environment inside the brand's environment"). It consumes analysis we ALREADY compute — V-JEPA
 * (motionIntensity, faceEmotion) + content signals (warmth, emotional_arousal, pacing_velocity) — plus optional
 * frame-derived brightness/saturation. Mappings are harvested from the old resolveColor (warm/cool emotion sets)
 * + resolveAnimation (motion + arousal → energy). Same classify→map shape as the font classifier.
 *
 * It NARROWS, never fabricates: it returns a PARTIAL treatment delta over the font base, and 'neutral' (no strong
 * signal) is a no-op — a valid font style is never made worse.
 */

import type { FontStylePriors } from './font-family';

export type FootageCharacter =
  | 'energetic-vivid' // fast motion / high arousal → punchy, dense, glow
  | 'calm-warm' // low energy + warm tone → gentle, soft, airy
  | 'cinematic-moody' // dark / high-contrast, low warmth → smooth drift, depth, grain
  | 'clean-neutral' // bright + low saturation (digital/clean) → smooth, flat, grid ok
  | 'neutral'; // no strong signal → do not narrow

/** The footage analysis the resolver consumes — mapped by the seam from V-JEPA + content signals (all optional
 *  so any subset works). motionEnergy = V-JEPA motionIntensity or pacing_velocity; warmth/arousal = content
 *  signals; faceEmotion = V-JEPA; brightness/saturation = optional frame-derived look. */
export interface FootageSignals {
  motionEnergy?: number; // 0-1
  warmth?: number; // 0-1
  arousal?: number; // 0-1
  faceEmotion?: string | null;
  brightness?: number; // 0-1 (optional)
  saturation?: number; // 0-1 (optional)
}

// Harvested from resolveColor: face emotion biases perceived warmth. (Standard MG practice: match mood to colour.)
const WARM_EMOTION = new Set(['happy', 'excited', 'surprised', 'content', 'joy', 'amused']);
const COOL_EMOTION = new Set(['sad', 'angry', 'fearful', 'disgusted', 'contempt']);

const num = (v: number | undefined): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined);

/** Classify the footage into a character from whatever analysis is present. Energy + warmth are the primary
 *  axes (V-JEPA + content signals, always-ish available); brightness/saturation refine when frame-derived. */
export function classifyFootage(s: FootageSignals | undefined | null): FootageCharacter {
  if (!s) return 'neutral';
  const motion = num(s.motionEnergy);
  const arousal = num(s.arousal);
  // energy composite (harvested: motion + arousal). Undefined if neither signal present.
  const energy = motion === undefined && arousal === undefined ? undefined
    : Math.min(1, 0.6 * (motion ?? arousal ?? 0) + 0.4 * (arousal ?? motion ?? 0));

  let warm = num(s.warmth);
  if (typeof s.faceEmotion === 'string') {
    const e = s.faceEmotion.toLowerCase();
    if (WARM_EMOTION.has(e)) warm = Math.min(1, (warm ?? 0.5) + 0.15);
    else if (COOL_EMOTION.has(e)) warm = Math.max(0, (warm ?? 0.5) - 0.15);
  }
  const brightness = num(s.brightness);
  const saturation = num(s.saturation);

  if (energy !== undefined && energy > 0.6) return 'energetic-vivid';
  if (brightness !== undefined && brightness < 0.35) return 'cinematic-moody';
  if (warm !== undefined && warm > 0.62) return 'calm-warm';
  if (brightness !== undefined && brightness > 0.62 && saturation !== undefined && saturation < 0.35) return 'clean-neutral';
  return 'neutral';
}

/** A PARTIAL treatment delta the footage character applies over the font base (only the axes it has an opinion
 *  on). Empty for 'neutral'. Values are in the atom vocabulary (same as FontStylePriors). */
export type FootageStyleDelta = Partial<Pick<FontStylePriors, 'surface' | 'texture' | 'motion' | 'density'>>;

export const FOOTAGE_STYLE: Record<FootageCharacter, FootageStyleDelta> = {
  'energetic-vivid': { motion: 'pop', surface: 'glow', density: 'dense' },
  'calm-warm': { motion: 'gentle', surface: 'frosted', density: 'airy', texture: 'none' },
  'cinematic-moody': { motion: 'smooth', surface: 'raised', texture: 'grain' },
  'clean-neutral': { motion: 'smooth', surface: 'flat', texture: 'grid' },
  neutral: {},
};

/** Classify + return the narrowing delta in one call — the resolver's footage classifier. */
export function footageStyleDelta(s: FootageSignals | undefined | null): { character: FootageCharacter; delta: FootageStyleDelta } {
  const character = classifyFootage(s);
  return { character, delta: FOOTAGE_STYLE[character] };
}
