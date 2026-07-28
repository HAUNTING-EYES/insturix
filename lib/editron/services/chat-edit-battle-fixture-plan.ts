import type {
  ChatBattleProjectMode,
  ChatBattleScenario,
} from './chat-edit-battle-harness';

export type ChatBattleFixtureProfile =
  | 'mixed'
  | 'speech'
  | 'dubbing'
  | 'visual-multi-asset'
  | 'audio'
  | 'sfx'
  | 'generated-scene';

export type ChatBattleFixtureCapability =
  | 'multi-asset'
  | 'semantic-visual'
  | 'semantic-visual-all-video-assets'
  | 'spatial-visual-all-video-assets';

export type ChatBattleFixtureSoundOverlayPolicy =
  | 'remove'
  | 'preserve-all'
  | 'preserve-sfx-only';

export type ChatBattleFixtureNativeAudioPolicy =
  | 'preserve'
  | 'mute-embedded-when-explicit-tracks'
  | 'mute-embedded-for-seeded-transcript';

export type ChatBattleFixtureAssetAlias =
  | 'explicit-image'
  | 'portrait-image'
  | 'embroidery-video';

export interface ChatBattleFixtureSources {
  mixed: string;
  speech: string;
  dubbing: string;
  'visual-multi-asset': string;
  audio: string;
  sfx: string;
  'generated-scene': string;
}

export interface ChatBattleFixturePlan {
  scenarioId: string;
  projectMode: ChatBattleProjectMode;
  profile: ChatBattleFixtureProfile;
  sourceProjectId: string;
  selectedOverlayType?: string;
  selectedOverlayRole?: 'sfx';
  seedTranscript: boolean;
  removeCaptionTrack: boolean;
  soundOverlayPolicy: ChatBattleFixtureSoundOverlayPolicy;
  nativeAudioPolicy: ChatBattleFixtureNativeAudioPolicy;
  requestedAssetAlias?: ChatBattleFixtureAssetAlias;
  requiresUploadBatchClone: boolean;
  seedTimelineGapFrames?: number;
  alignSelectedWithOverlayType?: string;
  requiredSourceCapabilities: ChatBattleFixtureCapability[];
}

export const DEFAULT_CHAT_BATTLE_FIXTURE_SOURCES: ChatBattleFixtureSources = {
  mixed: 'proj_chatbattle_500c55dbd0',
  speech: 'proj_FYZeVGomJuSh',
  dubbing: 'proj_FYZeVGomJuSh',
  'visual-multi-asset': 'proj_chatbattle_500c55dbd0',
  audio: 'proj_4N_6crLWX89A',
  sfx: 'proj_Z1OyTFkBoCNo',
  'generated-scene': 'proj_Fp_gxpn-Lonh',
};

const SPEECH_SCENARIOS = new Set([
  'spoken-phrase-english', 'spoken-phrase-devanagari', 'untimed-transcript-cache',
  'semantic-transcript-topic', 'roman-hinglish-phrase', 'transcript-overview',
  'transcript-moment-search', 'speech-anchored-sticker', 'content-analysis',
  'clean-captions', 'refresh-plain-captions', 'refresh-fancy-captions', 'batch-caption-edit',
]);

const VISUAL_SCENARIOS = new Set([
  'visual-object-exact', 'visual-object-paraphrase', 'inspect-rendered-frame',
  'multiasset-script-intake', 'multiasset-script-chat', 'visual-moment-search',
  'visual-speed-ramp', 'list-uploaded-assets', 'search-uploaded-assets',
  'inspect-uploaded-asset', 'place-uploaded-asset', 'replace-with-uploaded-footage',
  'vertical-subject-reframe',
]);

const SEMANTIC_VISUAL_SCENARIOS = new Set([
  'visual-object-exact',
  'visual-object-paraphrase',
  'visual-moment-search',
  'visual-speed-ramp',
]);

const MULTI_ASSET_SEMANTIC_VISUAL_SCENARIOS = new Set([
  'multiasset-script-intake',
  'multiasset-script-chat',
]);

const AUDIO_SCENARIOS = new Set([
  'bgm-explicit', 'bgm-vague', 'bgm-provider-failure', 'audio-moment-search',
  'audio-anchored-camera-shake', 'manual-impact-sfx', 'dialogue-ducking',
  'analyze-selected-audio', 'beat-sync-cuts', 'mixed-multi-step',
]);

const GENERATED_SCENE_SCENARIOS = new Set(['edit-html-scene', 'regenerate-existing-scene']);
const ADD_CAPTION_SCENARIOS = new Set(['plain-caption-track', 'fancy-caption-track']);

const VIDEO_SELECTED_SCENARIOS = new Set([
  'split-selected-overlay', 'trim-selected-overlay', 'manual-keyframe-zoom',
  'selected-clip-filter', 'analyze-selected-audio', 'analyze-selected-video',
  'selected-dialogue-dubbing', 'replace-with-uploaded-footage',
]);

const TEXT_SELECTED_SCENARIOS = new Set([
  'selected-overlay-edit', 'delete-selected-overlay', 'sync-overlay-style',
  'selected-overlay-fade', 'reorder-overlay-layer', 'move-retime-overlay',
  'rollback-partial-failure',
]);

export function planChatBattleFixture(
  scenario: ChatBattleScenario,
  sources: ChatBattleFixtureSources = DEFAULT_CHAT_BATTLE_FIXTURE_SOURCES,
): ChatBattleFixturePlan {
  const profile = resolveProfile(scenario.id);
  return {
    scenarioId: scenario.id,
    projectMode: scenario.projectMode,
    profile,
    sourceProjectId: sources[profile],
    selectedOverlayType: resolveSelectedOverlayType(scenario.id),
    ...(scenario.id === 'replace-selected-sfx' ? { selectedOverlayRole: 'sfx' as const } : {}),
    seedTranscript: SPEECH_SCENARIOS.has(scenario.id)
      || ADD_CAPTION_SCENARIOS.has(scenario.id)
      || scenario.id === 'manual-impact-sfx',
    removeCaptionTrack: ADD_CAPTION_SCENARIOS.has(scenario.id),
    soundOverlayPolicy: profile === 'audio'
      ? 'preserve-all'
      : profile === 'sfx'
        ? 'preserve-sfx-only'
        : 'remove',
    nativeAudioPolicy: profile === 'audio'
      ? 'mute-embedded-when-explicit-tracks'
      : profile === 'speech'
        ? 'mute-embedded-for-seeded-transcript'
        : 'preserve',
    ...(resolveRequestedAssetAlias(scenario.id) ? {
      requestedAssetAlias: resolveRequestedAssetAlias(scenario.id),
    } : {}),
    requiresUploadBatchClone: scenario.id === 'multiasset-script-intake'
      || scenario.id === 'multiasset-script-chat',
    ...(scenario.id === 'close-timeline-gaps' ? { seedTimelineGapFrames: 30 } : {}),
    ...(scenario.id === 'reorder-overlay-layer'
      ? { alignSelectedWithOverlayType: 'image' }
      : {}),
    requiredSourceCapabilities: resolveRequiredSourceCapabilities(scenario.id),
  };
}

function resolveRequestedAssetAlias(scenarioId: string): ChatBattleFixtureAssetAlias | undefined {
  if (scenarioId === 'explicit-asset') return 'explicit-image';
  if (scenarioId === 'place-uploaded-asset') return 'portrait-image';
  if (scenarioId === 'replace-with-uploaded-footage') return 'embroidery-video';
  return undefined;
}

function resolveRequiredSourceCapabilities(scenarioId: string): ChatBattleFixtureCapability[] {
  if (MULTI_ASSET_SEMANTIC_VISUAL_SCENARIOS.has(scenarioId)) {
    return ['multi-asset', 'semantic-visual-all-video-assets'];
  }
  if (SEMANTIC_VISUAL_SCENARIOS.has(scenarioId)) {
    return ['semantic-visual'];
  }
  if (scenarioId === 'vertical-subject-reframe') {
    return ['spatial-visual-all-video-assets'];
  }
  return [];
}

function resolveProfile(scenarioId: string): ChatBattleFixtureProfile {
  if (scenarioId === 'selected-dialogue-dubbing') return 'dubbing';
  if (scenarioId === 'replace-selected-sfx') return 'sfx';
  if (GENERATED_SCENE_SCENARIOS.has(scenarioId)) return 'generated-scene';
  if (AUDIO_SCENARIOS.has(scenarioId)) return 'audio';
  if (VISUAL_SCENARIOS.has(scenarioId)) return 'visual-multi-asset';
  if (SPEECH_SCENARIOS.has(scenarioId) || ADD_CAPTION_SCENARIOS.has(scenarioId)) return 'speech';
  return 'mixed';
}

function resolveSelectedOverlayType(scenarioId: string): string | undefined {
  if (scenarioId === 'replace-selected-sfx') return 'sound';
  if (GENERATED_SCENE_SCENARIOS.has(scenarioId)) return 'html-scene';
  if (VIDEO_SELECTED_SCENARIOS.has(scenarioId)) return 'video';
  if (TEXT_SELECTED_SCENARIOS.has(scenarioId)) return 'text';
  return undefined;
}
