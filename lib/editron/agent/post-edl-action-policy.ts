export type PostEdlUtilityScoringReason =
  | 'eligible'
  | 'utility-engine-disabled'
  | 'missing-speech-coverage'
  | 'unified-bundle-already-executed';

export interface PostEdlUtilityScoringInput {
  utilityEngineEnabled: boolean;
  hasSpeechCoverage: boolean;
  unifiedDecisionBundleExecuted: boolean;
}

export interface PostEdlUtilityScoringDecision {
  run: boolean;
  reason: PostEdlUtilityScoringReason;
}

export function shouldRunPostEdlUtilityScoring(
  input: PostEdlUtilityScoringInput,
): PostEdlUtilityScoringDecision {
  if (!input.utilityEngineEnabled) {
    return { run: false, reason: 'utility-engine-disabled' };
  }

  if (!input.hasSpeechCoverage) {
    return { run: false, reason: 'missing-speech-coverage' };
  }

  if (input.unifiedDecisionBundleExecuted) {
    return { run: false, reason: 'unified-bundle-already-executed' };
  }

  return { run: true, reason: 'eligible' };
}
