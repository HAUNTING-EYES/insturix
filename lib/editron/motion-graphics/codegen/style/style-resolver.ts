/**
 * MG Codegen — STYLE RESOLVER (composer). Split into TWO granularities, on purpose:
 *
 *   resolveVideoStyle(brandFont, intent) → VideoStyle   — the IDENTITY, resolved ONCE per video. A video has one
 *                                                          coherent style (a video never switches Swiss→vaporwave).
 *   resolveMomentStyle(video, thisMoment) → MomentStyle — the TREATMENT, resolved PER MOMENT from that moment's
 *                                                          own signals (its footage, its beats, its salience).
 *
 * WHY the split: the whole codegen lane is per-moment (Fable §4 "input contract, per moment"; "Claude composes
 * fresh per moment"). Resolving ONE style for the whole video re-freezes the §9 monotony the old
 * motion-theme-resolver hit — its own code says so (resolveTypography: "sizeScale was a video global, so every MG
 * resolved to an identical size — the monotony root"; fixed with per-moment emphasis). So: identity is coherent
 * (video), treatment varies (moment) — same style, a different graphic every beat.
 */

import { classifyFontFamily, fontStylePriors, type FontFamily, type FontStylePriors } from './font-family';
import { footageStyleDelta, type FootageSignals } from './footage-character';
import { intentStyleDelta } from './intent-genre';

// ─── VIDEO STYLE — the identity (resolved ONCE per video: brand font + intent) ───

export interface VideoStyle {
  styleName: string; // legible named style — LLM-facing + taste-gate key. CONSISTENT across the video.
  personality: string;
  /** Base treatment leans the moment modulates. weight/corner/alignment are the stable IDENTITY. */
  motion: FontStylePriors['motion'];
  weight: FontStylePriors['weight'];
  corner: FontStylePriors['corner'];
  alignment: FontStylePriors['alignment'];
  baseSurface: FontStylePriors['surface'];
  baseTexture: FontStylePriors['texture'];
  baseDensity: FontStylePriors['density'];
  sources: string[];
}

export interface VideoStyleInputs {
  /** The brand's PRIMARY typeface (kit Brand.fontSans) — the strongest style signal. */
  brandFont?: string | null;
  /** The video's purpose (production-brief format / platform / editorial intent) — the strongest "why". */
  intent?: string | null;
  /** User preference: name a style directly (chat / picker) — overrides the auto-derived styleName. */
  styleOverride?: string | null;
}

const FAMILY_STYLE_NAME: Record<FontFamily, string> = {
  'geometric-sans': 'minimal-premium',
  'grotesque-sans': 'clean-modern',
  'humanist-sans': 'friendly',
  'oldstyle-serif': 'editorial',
  'modern-serif': 'editorial-luxury',
  'slab-serif': 'bold-industrial',
  monospace: 'technical',
  script: 'personal',
  display: 'kinetic-bold',
};

/** Concrete sans headline weights → a number the model passes to FitHeadline weight={}. */
const WEIGHT_PX: Record<FontStylePriors['weight'], number> = { light: 250, regular: 400, medium: 550, heavy: 750 };

/** Resolve the video IDENTITY once: font family (base) + intent lean. Intent gets first say on the name + weight
 *  (a hype-reel reads kinetic-bold even on a neutral font). NO footage here — footage is per-moment. */
export function resolveVideoStyle(inputs: VideoStyleInputs): VideoStyle {
  const priors = fontStylePriors(inputs.brandFont);
  const { genre, delta: iDelta } = intentStyleDelta(inputs.intent);
  const override = inputs.styleOverride?.trim();
  return {
    styleName: override || iDelta.styleName || FAMILY_STYLE_NAME[priors.family],
    personality: priors.personality,
    motion: iDelta.motion ?? priors.motion,
    weight: iDelta.weight ?? priors.weight,
    corner: priors.corner,
    alignment: priors.alignment,
    baseSurface: iDelta.surface ?? priors.surface,
    baseTexture: iDelta.texture ?? priors.texture,
    baseDensity: iDelta.density ?? priors.density,
    sources: [
      `font:${classifyFontFamily(inputs.brandFont)}`,
      ...(genre !== 'generic' ? [`intent:${genre}`] : []),
      ...(override ? ['user:override'] : []),
    ],
  };
}

// ─── MOMENT STYLE — the treatment (resolved PER MOMENT from this moment's own signals) ───

export interface MomentSignals {
  /** THIS moment's footage character (V-JEPA + content signals for this moment's window, mapped by the seam). */
  footage?: FootageSignals;
  /** This moment's audio beats + word onsets (frames) — the rhythm to sync to. */
  beatFrames?: number[];
  wordFrames?: number[];
  /** This moment's claim strength / salience (0-1) — how much of a peak it is. */
  salience?: number;
  /** This moment's expressiveness (from MgExpressiveness). */
  intensity?: number;
  tier?: 'subtle' | 'standard' | 'hero';
}

export type MomentEmphasis = 'quiet' | 'balanced' | 'prominent';

export interface MomentStyle {
  motion: FontStylePriors['motion'];
  surface: FontStylePriors['surface'];
  texture: FontStylePriors['texture'];
  density: FontStylePriors['density'];
  /** Per-moment size — the anti-monotony piece (a peak reads large, a quiet beat small). */
  emphasis: MomentEmphasis;
  /** Whether beats/word-onsets exist to sync entrances + emphasis to. */
  beatSync: boolean;
  footageCharacter: string;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Resolve THIS moment's treatment within the video identity. Footage narrows surface/texture/motion/density;
 *  salience + tier set emphasis (harvested from the old resolveMomentEmphasis — the fix for the §9 monotony);
 *  beats enable sync. Two moments with different footage/salience get different graphics under the same identity. */
export function resolveMomentStyle(video: VideoStyle, m: MomentSignals): MomentStyle {
  const { character, delta: fDelta } = footageStyleDelta(m.footage);
  const beatSync = (m.beatFrames?.length ?? 0) > 0 || (m.wordFrames?.length ?? 0) > 0;
  const sal = typeof m.salience === 'number' ? clamp01(m.salience) : undefined;
  const emphasis: MomentEmphasis =
    m.tier === 'hero' || (sal !== undefined && sal > 0.7) ? 'prominent'
      : m.tier === 'subtle' || (sal !== undefined && sal < 0.4) ? 'quiet'
        : 'balanced';
  return {
    motion: fDelta.motion ?? video.motion,
    surface: fDelta.surface ?? video.baseSurface,
    texture: fDelta.texture ?? video.baseTexture,
    density: fDelta.density ?? video.baseDensity,
    emphasis,
    beatSync,
    footageCharacter: character,
  };
}

// ─── render the <style_direction> block — video identity (stable) + this moment's treatment (varies) ───

export function renderStyleDirection(video: VideoStyle, moment: MomentStyle): string {
  const weightPx = WEIGHT_PX[video.weight];
  const emphasisLine =
    moment.emphasis === 'prominent' ? 'This is a PEAK moment — give it hero scale + presence.'
      : moment.emphasis === 'quiet' ? 'This is a quiet moment — small, restrained, understated.'
        : 'Balanced prominence — right-sized, not oversized.';
  const beatLine = moment.beatSync ? ' Beats/word-onsets are provided in <moment> — sync entrances + emphasis to them.' : '';
  const textureLine = moment.texture !== 'none' ? `A subtle "${moment.texture}" Texture behind content fits here.` : 'Keep surfaces clean — no background texture.';
  return `<style_direction>
Video style is "${video.styleName}" — ${video.personality}. This identity is CONSISTENT across the whole video; compose toward it within the brand's colours + fonts.
- Identity (stable): headline weight ~${weightPx} (${video.weight}), face="display" for a hero line; alignment ${video.alignment}; corners ${video.corner}.
THIS MOMENT (varies per beat — do NOT stamp the same graphic every time):
- Motion: ${moment.motion}${moment.beatSync ? ' (beat-synced)' : ''}. Density: ${moment.density}. Surface lean: Plate surface="${moment.surface}". ${textureLine}
- ${emphasisLine}${beatLine}
</style_direction>`;
}
