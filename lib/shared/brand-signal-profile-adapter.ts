import {
  isBrandSignalActionable,
  type BrandSignal,
  type BrandSignalProfile,
} from './brand-signal-profile';
import type { UnifiedBrand } from './brand-registry';

function actionableValue<T>(signal: BrandSignal<T> | undefined): T | undefined {
  return signal && isBrandSignalActionable(signal) ? signal.value : undefined;
}

function actionableArray(signal: BrandSignal<string[]> | undefined): string[] | undefined {
  const value = actionableValue(signal);
  return value && value.length > 0 ? value : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export function brandSignalProfileToUnifiedBrand(
  profile: BrandSignalProfile,
  legacy: UnifiedBrand | null,
): UnifiedBrand {
  const primary = actionableValue(profile.palette.primary);
  const accent = actionableValue(profile.palette.accent);
  const colors = uniqueStrings([
    primary,
    accent,
    ...(actionableArray(profile.palette.supporting) ?? []),
    ...(actionableArray(profile.palette.neutrals) ?? []),
  ]);
  const audience = actionableArray(profile.identity.audience);
  const recurringPhrases = actionableArray(profile.voice.recurringPhrases);
  const killList = actionableArray(profile.voice.killList);
  const hookArchetypes = actionableArray(profile.voice.hookArchetypes);

  return {
    brandId: profile.brandId ?? legacy?.brandId ?? '',
    userId: profile.userId ?? legacy?.userId ?? '',
    name: actionableValue(profile.identity.brandName) ?? legacy?.name ?? 'Brand',
    voice: {
      voiceLock: legacy?.voice.voiceLock,
      nicheMap: audience?.join(', ') ?? legacy?.voice.nicheMap,
      killList: killList ?? legacy?.voice.killList ?? [],
      hookArchetypes: hookArchetypes ?? legacy?.voice.hookArchetypes ?? [],
      structuralHabits: recurringPhrases ?? legacy?.voice.structuralHabits ?? [],
    },
    visual: {
      industry: actionableValue(profile.identity.industry) ?? legacy?.visual.industry,
      colors: colors.length > 0 ? colors : legacy?.visual.colors ?? [],
      visualStyle: legacy?.visual.visualStyle,
      typography: actionableValue(profile.typography.raw) ?? legacy?.visual.typography,
    },
    learning: legacy?.learning ?? { banditProjectCount: 0 },
    createdAt: legacy?.createdAt,
    updatedAt: legacy?.updatedAt,
  };
}
