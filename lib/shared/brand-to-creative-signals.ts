import {
  getBrandSignalEffectWeight,
  isBrandSignalActionable,
  type BrandSignal,
  type BrandSignalProfile,
} from './brand-signal-profile';
import type {
  CreativeSignals,
  InferenceMetadata,
  NumericCreativeSignal,
} from './signals';
import { SIGNAL_RANGES } from './signals';

export interface BrandCreativeSignalDefaults {
  signals: Partial<CreativeSignals>;
  _inference_metadata: Record<string, InferenceMetadata>;
}

type NumericBrandSignal = BrandSignal<number> | undefined;
type BrandCreativeSignalKey = Exclude<NumericCreativeSignal, undefined>;

export function brandSignalProfileToCreativeSignalDefaults(
  profile: BrandSignalProfile,
): BrandCreativeSignalDefaults {
  const signals: Partial<CreativeSignals> = {};
  const metadata: Record<string, InferenceMetadata> = {};

  mapNumber(signals, metadata, 'formality', profile.voice.defaultFormality, (value) => (value * 2) - 1);
  mapNumber(signals, metadata, 'humor', profile.voice.humor);
  mapNumber(signals, metadata, 'warmth', profile.voice.warmth);
  mapNumber(signals, metadata, 'certainty', profile.voice.assertiveness);
  mapNumber(signals, metadata, 'in_group_signal', profile.voice.jargonDensity);
  mapNumber(signals, metadata, 'autonomy_grant', profile.voice.ctaDirectness, (value) => 1 - value);

  mapNumber(signals, metadata, 'enthusiasm', profile.motion.motionEnergy);
  mapNumber(signals, metadata, 'pacing_velocity', profile.motion.motionEnergy);
  mapNumber(signals, metadata, 'emotional_arousal', profile.motion.motionEnergy);
  mapNumber(signals, metadata, 'rhythmic_variation', profile.motion.rhythmRegularity);
  mapNumber(signals, metadata, 'pivot_intensity', profile.motion.transitionSharpness);

  mapNumber(signals, metadata, 'negative_space', profile.visual.minimalism);
  mapNumber(signals, metadata, 'visual_dependency', profile.visual.dataVizAffinity);
  mapNumber(signals, metadata, 'show_tell_ratio', profile.visual.dataVizAffinity);
  mapNumber(signals, metadata, 'visceral_impact', profile.visual.expressiveness);

  mapProofStyle(signals, metadata, profile.identity.proofStyle);

  return {
    signals,
    _inference_metadata: metadata,
  };
}

function mapNumber(
  signals: Partial<CreativeSignals>,
  metadata: Record<string, InferenceMetadata>,
  key: BrandCreativeSignalKey,
  brandSignal: NumericBrandSignal,
  transform: (value: number) => number = (value) => value,
): void {
  if (!brandSignal || !isBrandSignalActionable(brandSignal)) return;
  const range = SIGNAL_RANGES[key];
  const value = clamp(transform(brandSignal.value), range.min, range.max);
  signals[key] = value;
  metadata[key] = brandMetadata(brandSignal, key);
}

function mapProofStyle(
  signals: Partial<CreativeSignals>,
  metadata: Record<string, InferenceMetadata>,
  proofStyle: BrandSignalProfile['identity']['proofStyle'],
): void {
  if (!isBrandSignalActionable(proofStyle)) return;

  if (proofStyle.value === 'metrics' || proofStyle.value === 'demo') {
    mapSynthetic(signals, metadata, 'logos_load', proofStyle, 0.78);
    mapSynthetic(signals, metadata, 'specificity_grain', proofStyle, 0.72);
  }
  if (proofStyle.value === 'testimonial' || proofStyle.value === 'community') {
    mapSynthetic(signals, metadata, 'social_proof_reliance', proofStyle, 0.78);
    mapSynthetic(signals, metadata, 'ethos_load', proofStyle, 0.68);
  }
  if (proofStyle.value === 'authority' || proofStyle.value === 'editorial') {
    mapSynthetic(signals, metadata, 'ethos_load', proofStyle, 0.76);
    mapSynthetic(signals, metadata, 'certainty', proofStyle, 0.72);
  }
}

function mapSynthetic(
  signals: Partial<CreativeSignals>,
  metadata: Record<string, InferenceMetadata>,
  key: BrandCreativeSignalKey,
  brandSignal: BrandSignal<unknown>,
  value: number,
): void {
  const range = SIGNAL_RANGES[key];
  signals[key] = clamp(value, range.min, range.max);
  metadata[key] = brandMetadata(brandSignal, key);
}

function brandMetadata(
  signal: BrandSignal<unknown>,
  key: string,
): InferenceMetadata {
  const sourceField = sourceFieldForSignal(signal, key);
  return {
    source: 'brand_dna',
    confidence: signal.confidence,
    resolvedFrom: sourceField,
  };
}

function sourceFieldForSignal(signal: BrandSignal<unknown>, fallback: string): string {
  const evidenceId = signal.evidenceIds[0];
  return evidenceId ? `brand_vault:${evidenceId}` : `brand_vault:${fallback}`;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function getCreativeSignalBrandEffectWeight(signal: BrandSignal<unknown>): number {
  return getBrandSignalEffectWeight(signal);
}
