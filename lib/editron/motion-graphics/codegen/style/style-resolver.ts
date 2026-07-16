/**
 * MG Codegen — STYLE RESOLVER (the composer). Turns the classified input priors into ONE per-video StyleBundle,
 * and renders that bundle into a <style_direction> prompt block (VOLATILE — goes after the cached prefix).
 *
 * Architecture (the general pattern): classifiers each map a raw input → a small canonical taxonomy → treatment
 * priors; the composer BLENDS the priors (brand ⊇ footage ⊇ moment) into a coherent style. Today the FONT-family
 * classifier is the active prior (the strongest signal); footage-character + intent-genre classifiers (Phase 3)
 * are typed slots that will narrow within it. The bundle feeds BOTH the prompt (priors) and, later, the taste
 * gate (style-fidelity criterion). Priors, never locks: brand colours/fonts stay fixed, the model composes
 * toward the style.
 */

import { classifyFontFamily, fontStylePriors, type FontFamily, type FontStylePriors } from './font-family';
import { footageStyleDelta, type FootageSignals } from './footage-character';
import { intentStyleDelta } from './intent-genre';

/** The per-video resolved style — the priors composed + given a legible name. */
export interface StyleBundle {
  styleName: string; // legible named style (e.g. 'kinetic-bold', 'editorial') — LLM-facing + taste-gate key
  personality: string;
  motion: FontStylePriors['motion'];
  density: FontStylePriors['density'];
  corner: FontStylePriors['corner'];
  weight: FontStylePriors['weight'];
  surface: FontStylePriors['surface'];
  texture: FontStylePriors['texture'];
  alignment: FontStylePriors['alignment'];
  /** What drove the resolution (provenance for logs + debugging), e.g. ['font:display', 'user:override']. */
  sources: string[];
}

export interface StyleInputs {
  /** The brand's PRIMARY typeface (kit Brand.fontSans) — the strongest style signal. */
  brandFont?: string | null;
  /** User preference: name a style directly (chat / picker) — overrides the auto-derived styleName. */
  styleOverride?: string | null;
  /** This video's footage analysis (V-JEPA + content signals, mapped by the seam) — narrows the font style. */
  footage?: FootageSignals;
  /** The video's purpose (production-brief format / platform / editorial intent). Strongest "why" — gets first
   *  say on the style name + may push weight. A free-text string; classified to a genre internally. */
  intent?: string | null;
}

/** Family → a legible named style. The font family is a strong style identity on its own; footage + intent
 *  (Phase 3) will modulate this (e.g. grotesque-sans + hype intent + high-energy footage → 'kinetic-bold'). */
const FAMILY_STYLE_NAME: Record<FontFamily, string> = {
  'geometric-sans': 'minimal-premium',
  'grotesque-sans': 'clean-modern', // Swiss / neutral
  'humanist-sans': 'friendly',
  'oldstyle-serif': 'editorial',
  'modern-serif': 'editorial-luxury',
  'slab-serif': 'bold-industrial',
  monospace: 'technical',
  script: 'personal',
  display: 'kinetic-bold',
};

/** Concrete sans headline weights for the weight lean → a number the model passes to FitHeadline weight={}. */
const WEIGHT_PX: Record<FontStylePriors['weight'], number> = { light: 250, regular: 400, medium: 550, heavy: 750 };

/** Compose the classified priors into a per-video StyleBundle. Today: font-family prior (+ user override). */
export function resolveStyle(inputs: StyleInputs): StyleBundle {
  const priors = fontStylePriors(inputs.brandFont);
  const { character, delta: fDelta } = footageStyleDelta(inputs.footage);
  const { genre, delta: iDelta } = intentStyleDelta(inputs.intent);
  const override = inputs.styleOverride?.trim();
  // Compose: font BASE ← footage narrows ← intent narrows. Precedence per axis is intent > footage > font
  // (intent = the strongest "why"); intent may also push weight + set the style name. Name: user > intent > font.
  return {
    styleName: override || iDelta.styleName || FAMILY_STYLE_NAME[priors.family],
    personality: priors.personality,
    motion: iDelta.motion ?? fDelta.motion ?? priors.motion,
    density: iDelta.density ?? fDelta.density ?? priors.density,
    corner: priors.corner,
    weight: iDelta.weight ?? priors.weight,
    surface: iDelta.surface ?? fDelta.surface ?? priors.surface,
    texture: iDelta.texture ?? fDelta.texture ?? priors.texture,
    alignment: priors.alignment,
    sources: [
      `font:${classifyFontFamily(inputs.brandFont)}`,
      ...(character !== 'neutral' ? [`footage:${character}`] : []),
      ...(genre !== 'generic' ? [`intent:${genre}`] : []),
      ...(override ? ['user:override'] : []),
    ],
  };
}

/** Render the bundle as a <style_direction> prompt block — priors the model composes TOWARD, within brand lock.
 *  VOLATILE: append AFTER the cached prefix + moment (never interpolated into CODEGEN_STABLE_PREFIX). */
export function renderStyleDirection(b: StyleBundle): string {
  const weightPx = WEIGHT_PX[b.weight];
  const textureLine = b.texture !== 'none'
    ? `A subtle "${b.texture}" Texture behind content is on-brand here.`
    : 'Keep surfaces clean — no background texture.';
  return `<style_direction>
This video's style is "${b.styleName}" — ${b.personality}. Compose TOWARD it, staying inside the brand's colours and fonts (this is taste direction, not new content):
- Motion character: ${b.motion} (choose entrances/ambient that read as ${b.motion}).
- Headline weight: ~${weightPx} (${b.weight}); use FitHeadline face="display" for a hero/impact line.
- Density: ${b.density}. Corners: ${b.corner}. Text alignment: ${b.alignment}.
- Surface lean: prefer Plate surface="${b.surface}" when a surface is needed. ${textureLine}
</style_direction>`;
}
