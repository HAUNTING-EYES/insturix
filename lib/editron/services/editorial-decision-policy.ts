import type {
  EditorialFamily,
  EditorialPreferences,
} from '@/lib/editron/production-brief/editorial-preferences';

export type EditorialDecisionFamily =
  | 'audio'
  | 'camera'
  | 'caption'
  | 'graphic'
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

const FAMILY_MAP: Partial<Record<EditorialDecisionFamily, EditorialFamily>> = {
  audio: 'sfx',
  camera: 'zoom',
  caption: 'captions',
  graphic: 'motionGraphics',
  transition: 'transitions',
};

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
    rankingPriority: preference.frequency ?? 0.5,
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
