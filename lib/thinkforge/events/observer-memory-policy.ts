import {
  prepareProviderPromptForRoute,
  type ProviderPrivacyClass,
} from '@/lib/thinkforge/privacy/provider-privacy-gateway';

export const OBSERVER_FACT_TYPES = [
  'preference',
  'rule',
  'structural_habit',
  'technical_fact',
  'audience_insight',
  'personal_info',
] as const;

export const OBSERVER_FACT_SENSITIVITIES = [
  'non_personal',
  'personal',
  'child_data',
] as const;

export type ObserverFactType = typeof OBSERVER_FACT_TYPES[number];
export type ObserverFactSensitivity = typeof OBSERVER_FACT_SENSITIVITIES[number];

export interface ObserverFactCandidate {
  type: ObserverFactType;
  content: string;
  confidence: number;
  scope: 'project' | 'global';
  sensitivity: ObserverFactSensitivity;
}

export type ObserverFactRejectionReason =
  | 'personal_info_type'
  | 'model_classified_personal'
  | 'model_classified_child_data'
  | 'detected_personal_data'
  | 'detected_child_data';

export interface ObserverFactAdmission {
  accepted: ObserverFactCandidate[];
  rejectedCounts: Record<ObserverFactRejectionReason, number>;
}

const EMPTY_REJECTION_COUNTS: Record<ObserverFactRejectionReason, number> = {
  personal_info_type: 0,
  model_classified_personal: 0,
  model_classified_child_data: 0,
  detected_personal_data: 0,
  detected_child_data: 0,
};

const EXPLICIT_CHILD_CONTEXT_PATTERNS = [
  /\b(?:[0-9]|1[0-7])\s*(?:years?|yrs?)\s*old\b/i,
  /\b(?:under|younger\s+than)\s*(?:18|eighteen)\b/i,
  /\b(?:my|our)\s+(?:minor|underage)\s+(?:child|kid|son|daughter)\b/i,
];

/**
 * Reuse the central privacy detector without treating its provider decision as
 * storage authority. Observer storage remains server-owned and conservative.
 */
export function classifyObserverTextPrivacy(
  text: string,
  now?: Date | string,
): ProviderPrivacyClass {
  const centralClassification = prepareProviderPromptForRoute({
    provider: 'gemini',
    model: 'observer-memory-policy-v1',
    routePurpose: 'structural',
    prompt: text,
    declaredPrivacyClass: 'public',
    fieldsSent: ['observerText'],
    now,
  }).audit.privacyClass;
  if (centralClassification === 'child_data') return centralClassification;
  return EXPLICIT_CHILD_CONTEXT_PATTERNS.some((pattern) => pattern.test(text))
    ? 'child_data'
    : centralClassification;
}

export function admitObserverFacts(facts: readonly ObserverFactCandidate[]): ObserverFactAdmission {
  const accepted: ObserverFactCandidate[] = [];
  const rejectedCounts = { ...EMPTY_REJECTION_COUNTS };

  for (const fact of facts) {
    const reason = observerFactRejectionReason(fact);
    if (reason) {
      rejectedCounts[reason] += 1;
      continue;
    }
    accepted.push(fact);
  }

  return { accepted, rejectedCounts };
}

export function normalizeObserverFactContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ');
}

function observerFactRejectionReason(
  fact: ObserverFactCandidate,
): ObserverFactRejectionReason | undefined {
  if (fact.type === 'personal_info') return 'personal_info_type';
  if (fact.sensitivity === 'child_data') return 'model_classified_child_data';
  if (fact.sensitivity === 'personal') return 'model_classified_personal';

  const detectedPrivacy = classifyObserverTextPrivacy(fact.content);
  if (detectedPrivacy === 'child_data') return 'detected_child_data';
  if (detectedPrivacy === 'personal') return 'detected_personal_data';
  return undefined;
}
