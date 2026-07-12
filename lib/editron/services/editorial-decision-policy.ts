import type {
  EditorialFamily,
  EditorialPreferences,
} from '@/lib/editron/production-brief/editorial-preferences';

export type EditorialDecisionFamily =
  | 'audio'
  | 'camera'
  | 'caption'
  | 'graphic'
  | 'music'
  | 'pacing'
  | 'timing'
  | 'transition'
  | 'unknown';

export interface EditorialDecisionPolicy {
  version: 'editorial-decision-policy-v1';
  decisionFamily: EditorialDecisionFamily;
  editorialFamily: EditorialFamily | 'pacing' | null;
  mode: 'auto' | 'off' | 'prefer';
  executionAllowed: boolean;
  frequency: number | null;
  intensity: number | null;
  rankingPriority: number;
  reason: string;
  source: 'user-intake' | 'ai-brand';
}

export interface EditorialPreferenceIntensityResolution {
  version: 'editorial-preference-intensity-v1';
  editorialFamily: EditorialFamily;
  mode: 'signal-only' | 'prefer';
  signalIntensity: number;
  requestedIntensity: number | null;
  resolvedIntensity: number;
  method: 'identity' | 'geometric-mean';
}

const FAMILY_MAP: Partial<Record<EditorialDecisionFamily, EditorialFamily>> = {
  audio: 'sfx',
  camera: 'zoom',
  caption: 'captions',
  graphic: 'motionGraphics',
  music: 'music',
  transition: 'transitions',
};

export function resolveEditorialPreferenceIntensity(
  params: Record<string, unknown>,
  editorialFamily: EditorialFamily,
  signalIntensity: number,
): EditorialPreferenceIntensityResolution {
  const normalizedSignal = clampPolicy01(signalIntensity);
  const rawPolicy = params.editorialPreferencePolicy;
  const policy = rawPolicy && typeof rawPolicy === 'object' && !Array.isArray(rawPolicy)
    ? rawPolicy as Record<string, unknown>
    : null;
  const requestedIntensity = typeof policy?.intensity === 'number' && Number.isFinite(policy.intensity)
    ? clampPolicy01(policy.intensity)
    : null;
  const applies = policy?.mode === 'prefer'
    && policy.editorialFamily === editorialFamily
    && requestedIntensity !== null;

  return {
    version: 'editorial-preference-intensity-v1',
    editorialFamily,
    mode: applies ? 'prefer' : 'signal-only',
    signalIntensity: normalizedSignal,
    requestedIntensity: applies ? requestedIntensity : null,
    resolvedIntensity: applies
      ? Math.sqrt(normalizedSignal * requestedIntensity)
      : normalizedSignal,
    method: applies ? 'geometric-mean' : 'identity',
  };
}

export function resolveEditorialDecisionPolicy(
  preferences: EditorialPreferences | undefined,
  decisionFamily: EditorialDecisionFamily,
): EditorialDecisionPolicy {
  if (decisionFamily === 'pacing') {
    const pacing = preferences?.pacing;
    return pacing?.mode === 'prefer'
      ? {
          version: 'editorial-decision-policy-v1',
          decisionFamily,
          editorialFamily: 'pacing',
          mode: 'prefer',
          executionAllowed: true,
          frequency: null,
          intensity: pacing.intensity ?? null,
          rankingPriority: pacing.intensity ?? 0.5,
          reason: 'user-policy-prefer:pacing',
          source: 'user-intake',
        }
      : autoPolicy(decisionFamily);
  }

  const editorialFamily = FAMILY_MAP[decisionFamily];
  if (!editorialFamily) return autoPolicy(decisionFamily);
  const preference = preferences?.families?.[editorialFamily];
  if (!preference) return autoPolicy(decisionFamily, editorialFamily);
  if (preference.mode === 'off') {
    return {
      version: 'editorial-decision-policy-v1',
      decisionFamily,
      editorialFamily,
      mode: 'off',
      executionAllowed: false,
      frequency: null,
      intensity: null,
      rankingPriority: 0,
      reason: `user-policy-off:${editorialFamily}`,
      source: 'user-intake',
    };
  }

  return {
    version: 'editorial-decision-policy-v1',
    decisionFamily,
    editorialFamily,
    mode: 'prefer',
    executionAllowed: true,
    frequency: preference.frequency ?? null,
    intensity: preference.intensity ?? null,
    rankingPriority: 0.5,
    reason: `user-policy-prefer:${editorialFamily}`,
    source: 'user-intake',
  };
}

function autoPolicy(
  decisionFamily: EditorialDecisionFamily,
  editorialFamily: EditorialFamily | null = FAMILY_MAP[decisionFamily] ?? null,
): EditorialDecisionPolicy {
  return {
    version: 'editorial-decision-policy-v1',
    decisionFamily,
    editorialFamily,
    mode: 'auto',
    executionAllowed: true,
    frequency: null,
    intensity: null,
    rankingPriority: 0.5,
    reason: 'ai-brand-policy',
    source: 'ai-brand',
  };
}

function clampPolicy01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
