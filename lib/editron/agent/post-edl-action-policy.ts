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

export type UtilityLiveProducerReason =
  | 'eligible'
  | 'utility-live-disabled'
  | 'creative-brief-raw-footage-active';

export interface UtilityLiveProducerInput {
  utilityLiveEnabled: boolean;
  creativeBriefEnabled: boolean;
  hasRawFootage: boolean;
}

export interface UtilityLiveProducerDecision {
  run: boolean;
  reason: UtilityLiveProducerReason;
}

export type GlobalCaptionActionReason =
  | 'eligible'
  | 'caption-style-disabled'
  | 'user-policy-off:captions'
  | 'canonical-upload-needs-caption-track-planner';

export interface GlobalCaptionActionInput {
  captionStyle?: string | null;
  hasRawFootage: boolean;
  hasCanonicalEditedTimeline: boolean;
  editorialExecutionAllowed?: boolean;
}

export interface GlobalCaptionActionDecision {
  run: boolean;
  reason: GlobalCaptionActionReason;
}

export type PostBundleProfileActionReason =
  | 'unified-bundle-not-executed'
  | 'technical-post-process'
  | 'legacy-creative-profile-action'
  | 'unknown-post-bundle-profile-action';

export interface PostBundleProfileActionInput {
  tool: string;
  unifiedDecisionBundleExecuted: boolean;
}

export interface PostBundleProfileActionDecision {
  run: boolean;
  reason: PostBundleProfileActionReason;
}

const POST_BUNDLE_ALLOWED_PROFILE_TOOLS = new Set([
  'audio_ducking',
  'quality_review',
]);

const POST_BUNDLE_LEGACY_CREATIVE_PROFILE_TOOLS = new Set([
  'add_captions',
  'add_fancy_captions',
  'add_motion_graphic',
  'add_transition',
  'batch_update_overlays',
  'generate_html_scene',
  'split_clips',
  'sync_cuts_to_beats',
]);

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

export function shouldRunPostBundleProfileAction(
  input: PostBundleProfileActionInput,
): PostBundleProfileActionDecision {
  if (!input.unifiedDecisionBundleExecuted) {
    return { run: true, reason: 'unified-bundle-not-executed' };
  }

  if (POST_BUNDLE_ALLOWED_PROFILE_TOOLS.has(input.tool)) {
    return { run: true, reason: 'technical-post-process' };
  }

  if (POST_BUNDLE_LEGACY_CREATIVE_PROFILE_TOOLS.has(input.tool)) {
    return { run: false, reason: 'legacy-creative-profile-action' };
  }

  return { run: false, reason: 'unknown-post-bundle-profile-action' };
}

export function shouldRunUtilityLiveProducer(
  input: UtilityLiveProducerInput,
): UtilityLiveProducerDecision {
  if (!input.utilityLiveEnabled) {
    return { run: false, reason: 'utility-live-disabled' };
  }

  if (input.creativeBriefEnabled && input.hasRawFootage) {
    return { run: false, reason: 'creative-brief-raw-footage-active' };
  }

  return { run: true, reason: 'eligible' };
}

export function shouldInjectGlobalCaptionAction(
  input: GlobalCaptionActionInput,
): GlobalCaptionActionDecision {
  if (input.editorialExecutionAllowed === false) {
    return { run: false, reason: 'user-policy-off:captions' };
  }

  if (!input.captionStyle || input.captionStyle === 'none') {
    return { run: false, reason: 'caption-style-disabled' };
  }

  if (input.hasRawFootage && input.hasCanonicalEditedTimeline) {
    return { run: false, reason: 'canonical-upload-needs-caption-track-planner' };
  }

  return { run: true, reason: 'eligible' };
}
