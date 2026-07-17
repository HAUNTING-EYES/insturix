import type { ChatBattleScenario } from './chat-edit-battle-harness';

export type ChatBattleFixtureProfile =
  | 'mixed'
  | 'speech'
  | 'visual-multi-asset'
  | 'audio'
  | 'generated-scene';

export interface ChatBattleFixtureSources {
  mixed: string;
  speech: string;
  'visual-multi-asset': string;
  audio: string;
  'generated-scene': string;
}

export interface ChatBattleFixturePlan {
  scenarioId: string;
  profile: ChatBattleFixtureProfile;
  sourceProjectId: string;
  selectedOverlayType?: string;
  seedTranscript: boolean;
  removeCaptionTrack: boolean;
  requiresImageAssetAlias: boolean;
}

export const DEFAULT_CHAT_BATTLE_FIXTURE_SOURCES: ChatBattleFixtureSources = {
  mixed: 'proj_chatbattle_500c55dbd0',
  speech: 'proj_chatbattle_500c55dbd0',
  'visual-multi-asset': 'proj_chatbattle_500c55dbd0',
  audio: 'proj_4N_6crLWX89A',
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
]);

const AUDIO_SCENARIOS = new Set([
  'bgm-explicit', 'bgm-vague', 'bgm-provider-failure', 'audio-moment-search',
  'audio-anchored-camera-shake', 'manual-impact-sfx', 'dialogue-ducking',
  'analyze-selected-audio', 'beat-sync-cuts', 'replace-selected-sfx', 'mixed-multi-step',
]);

const GENERATED_SCENE_SCENARIOS = new Set(['edit-html-scene', 'regenerate-existing-scene']);
const ADD_CAPTION_SCENARIOS = new Set(['plain-caption-track', 'fancy-caption-track']);

const VIDEO_SELECTED_SCENARIOS = new Set([
  'split-selected-overlay', 'trim-selected-overlay', 'manual-keyframe-zoom',
  'selected-clip-filter', 'analyze-selected-audio', 'analyze-selected-video',
]);

const TEXT_SELECTED_SCENARIOS = new Set([
  'selected-overlay-edit', 'delete-selected-overlay', 'sync-overlay-style',
  'selected-overlay-fade', 'reorder-overlay-layer', 'move-retime-overlay',
]);

export function planChatBattleFixture(
  scenario: ChatBattleScenario,
  sources: ChatBattleFixtureSources = DEFAULT_CHAT_BATTLE_FIXTURE_SOURCES,
): ChatBattleFixturePlan {
  const profile = resolveProfile(scenario.id);
  return {
    scenarioId: scenario.id,
    profile,
    sourceProjectId: sources[profile],
    selectedOverlayType: resolveSelectedOverlayType(scenario.id),
    seedTranscript: SPEECH_SCENARIOS.has(scenario.id) || scenario.id === 'manual-impact-sfx',
    removeCaptionTrack: ADD_CAPTION_SCENARIOS.has(scenario.id),
    requiresImageAssetAlias: scenario.id === 'explicit-asset',
  };
}

function resolveProfile(scenarioId: string): ChatBattleFixtureProfile {
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
