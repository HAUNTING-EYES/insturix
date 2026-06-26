import {
  isBrandSignalActionable,
  type BrandSignal,
  type BrandSignalProfile,
} from '@/lib/shared/brand-signal-profile';
import { brandSignalProfileToUnifiedBrand } from '@/lib/shared/brand-signal-profile-adapter';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';
import type { BrandInputs, DeepPartial, MotionTokens } from '@/lib/editron/data/motion-theme-resolver';
import { brandInputsFromUnifiedBrandAtomic } from './brand-composition-rules';

type HeadingTransform = MotionTokens['typography']['headingTransform'];

export function brandInputsFromBrandSignalProfile(
  profile: BrandSignalProfile | null | undefined,
  legacy: UnifiedBrand | null = null,
): Partial<BrandInputs> {
  if (!profile) return {};
  const unified = brandSignalProfileToUnifiedBrand(profile, legacy);
  const palette = uniqueStrings([
    actionableValue(profile.palette.primary),
    actionableValue(profile.palette.accent),
    ...(actionableValue(profile.palette.supporting) ?? []),
    ...(actionableValue(profile.palette.neutrals) ?? []),
  ]);

  return compact({
    ...brandInputsFromUnifiedBrandAtomic(unified),
    primaryColor: actionableValue(profile.palette.primary),
    accentColor: actionableValue(profile.palette.accent),
    palette: palette.length > 0 ? palette : undefined,
    minimalism: actionableNumber(profile.visual?.minimalism),
    densityTolerance: actionableNumber(profile.visual?.densityTolerance),
    expressiveness: actionableNumber(profile.visual?.expressiveness),
    cornerRadiusBias: actionableNumber(profile.visual?.cornerRadiusBias),
    layoutSymmetry: actionableNumber(profile.visual?.layoutSymmetry),
    contrastPreference: actionableNumber(profile.visual?.contrastPreference),
    motionEnergy: actionableNumber(profile.motion?.motionEnergy),
    overshootTolerance: actionableNumber(profile.motion?.overshootTolerance),
    transitionSharpness: actionableNumber(profile.motion?.transitionSharpness),
    rhythmRegularity: actionableNumber(profile.motion?.rhythmRegularity),
    emotionalArc: actionableNumber(profile.narrative?.emotionalArc),
    pacePreference: actionableNumber(profile.narrative?.pacePreference),
    anticipationStyle: actionableNumber(profile.motion?.anticipationStyle),
    easingTaste: actionableNumber(profile.motion?.easingTaste),
    safeZones: actionableNumber(profile.composition?.safeZones),
    figureGroundRatio: actionableNumber(profile.composition?.figureGroundRatio),
  });
}

export function brandVaultToMotionOverrides(
  profile: BrandSignalProfile | null | undefined,
): DeepPartial<MotionTokens> | undefined {
  if (!profile) return undefined;
  const color = compact({
    primary: actionableValue(profile.palette.primary),
    accent: actionableValue(profile.palette.accent),
  });
  const typography = compact({
    headingTransform: casingToHeadingTransform(actionableValue(profile.typography.casingBias)),
  });
  const overrides = compact({
    color: Object.keys(color).length > 0 ? color : undefined,
    typography: Object.keys(typography).length > 0 ? typography : undefined,
  });
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function actionableValue<T>(signal: BrandSignal<T> | undefined): T | undefined {
  return signal && isBrandSignalActionable(signal) ? signal.value : undefined;
}

function actionableNumber(signal: BrandSignal<number> | undefined): number | undefined {
  const value = actionableValue(signal);
  return typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : undefined;
}

function casingToHeadingTransform(value: BrandSignalProfile['typography']['casingBias']['value'] | undefined): HeadingTransform | undefined {
  if (value === 'uppercase') return 'uppercase';
  if (value === 'title') return 'small-caps';
  if (value === 'sentence' || value === 'lowercase' || value === 'mixed') return 'none';
  return undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function compact<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined && entry !== '') output[key] = entry;
  }
  return output as T;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
