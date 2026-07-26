import type { EditorialFamily } from '../production-brief/editorial-preferences';

export const CHAT_REQUEST_CAPABILITIES = [
  'caption-track',
  'caption-refresh',
  'audio-ducking',
  'beat-sync',
  'scene-regeneration',
  'html-scene-edit',
  'asset-placement',
  'asset-replacement',
  'localized-sfx',
  'localized-camera-motion',
  'localized-speed-change',
  'project-reframe',
  'reference-style',
  'selected-dialogue-dubbing',
  'project-edit',
] as const;

export type ChatRequestCapability = (typeof CHAT_REQUEST_CAPABILITIES)[number];
export type ChatOperationalAuthority =
  | 'family-owner'
  | 'localized-workflow'
  | 'durable-workflow'
  | 'project-transform'
  | 'unified-planner';
export type ChatRequiredToolStep = string | readonly string[];

export interface ChatCapabilityAuthorityContract {
  authority: ChatOperationalAuthority;
  callableTools: ReadonlySet<string>;
  evidenceTools: ReadonlySet<string>;
  mutationTools: ReadonlySet<string>;
  requiredToolSequence: readonly ChatRequiredToolStep[];
}

const TIMELINE_READ_STEP = ['read_project_file', 'get_timeline_view'] as const;

export const CHAT_MINIMAL_READ_TOOLS: ReadonlySet<string> = new Set([
  ...TIMELINE_READ_STEP,
  'get_dubbing_job_result',
]);

export const CHAT_DUBBING_WORKFLOW_TOOLS: ReadonlySet<string> = new Set([
  ...TIMELINE_READ_STEP,
  'dub_selected_dialogue',
]);

export const CHAT_REFERENCE_STYLE_WORKFLOW_TOOLS: ReadonlySet<string> = new Set([
  ...TIMELINE_READ_STEP,
  'list_user_assets',
  'search_user_assets',
  'inspect_user_asset',
  'apply_reference_style',
]);

function capabilityContract(input: {
  authority: ChatOperationalAuthority;
  evidenceTools?: readonly string[];
  mutationTools: readonly string[];
  requiredToolSequence: readonly ChatRequiredToolStep[];
}): ChatCapabilityAuthorityContract {
  const evidenceTools = new Set(input.evidenceTools ?? []);
  return {
    authority: input.authority,
    callableTools: new Set([
      ...CHAT_MINIMAL_READ_TOOLS,
      ...evidenceTools,
      ...input.mutationTools,
    ]),
    evidenceTools,
    mutationTools: new Set(input.mutationTools),
    requiredToolSequence: input.requiredToolSequence,
  };
}

export const CHAT_CAPABILITY_AUTHORITY_CONTRACTS = {
  'caption-track': capabilityContract({
    authority: 'family-owner',
    evidenceTools: ['get_video_transcription'],
    mutationTools: ['add_captions', 'add_fancy_captions'],
    requiredToolSequence: [TIMELINE_READ_STEP, ['add_captions', 'add_fancy_captions']],
  }),
  'caption-refresh': capabilityContract({
    authority: 'family-owner',
    evidenceTools: ['get_video_transcription'],
    mutationTools: ['refresh_captions', 'refresh_fancy_captions'],
    requiredToolSequence: [TIMELINE_READ_STEP, ['refresh_captions', 'refresh_fancy_captions']],
  }),
  'audio-ducking': capabilityContract({
    authority: 'family-owner',
    mutationTools: ['apply_audio_ducking'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'apply_audio_ducking'],
  }),
  'beat-sync': capabilityContract({
    authority: 'localized-workflow',
    evidenceTools: [
      'find_audio_moment',
      'resolve_audio_edit',
      'resolve_clip_analysis',
      'queue_resolved_clip_analysis',
      'get_clip_analysis_result',
    ],
    mutationTools: ['sync_cuts_to_beats'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'resolve_audio_edit', 'sync_cuts_to_beats'],
  }),
  'scene-regeneration': capabilityContract({
    authority: 'family-owner',
    mutationTools: ['regenerate_scene'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'regenerate_scene'],
  }),
  'html-scene-edit': capabilityContract({
    authority: 'family-owner',
    mutationTools: ['edit_html_scene'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'edit_html_scene'],
  }),
  'asset-placement': capabilityContract({
    authority: 'localized-workflow',
    evidenceTools: [
      'list_user_assets',
      'search_user_assets',
      'inspect_user_asset',
      'resolve_user_asset_overlay',
    ],
    mutationTools: ['add_overlay'],
    requiredToolSequence: [
      TIMELINE_READ_STEP,
      'search_user_assets',
      'resolve_user_asset_overlay',
      'add_overlay',
    ],
  }),
  'asset-replacement': capabilityContract({
    authority: 'localized-workflow',
    evidenceTools: [
      'list_user_assets',
      'search_user_assets',
      'inspect_user_asset',
      'resolve_user_asset_overlay',
    ],
    mutationTools: ['use_matching_footage'],
    requiredToolSequence: [
      TIMELINE_READ_STEP,
      'search_user_assets',
      'resolve_user_asset_overlay',
      'use_matching_footage',
    ],
  }),
  'localized-sfx': capabilityContract({
    authority: 'localized-workflow',
    evidenceTools: [
      'find_audio_moment',
      'resolve_audio_edit',
      'resolve_clip_analysis',
      'queue_resolved_clip_analysis',
      'get_clip_analysis_result',
    ],
    mutationTools: ['add_sfx'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'resolve_audio_edit', 'add_sfx'],
  }),
  'localized-camera-motion': capabilityContract({
    authority: 'localized-workflow',
    evidenceTools: [
      'find_transcript_moment',
      'find_visual_moment',
      'resolve_transcript_edit',
      'resolve_visual_edit',
      'resolve_keyframe_edit',
      'visual_inspect_frame',
      'resolve_clip_analysis',
      'queue_resolved_clip_analysis',
      'get_clip_analysis_result',
    ],
    mutationTools: ['apply_camera_shake', 'set_keyframes'],
    requiredToolSequence: [
      TIMELINE_READ_STEP,
      ['resolve_transcript_edit', 'resolve_visual_edit', 'resolve_keyframe_edit'],
      ['apply_camera_shake', 'set_keyframes'],
    ],
  }),
  'localized-speed-change': capabilityContract({
    authority: 'localized-workflow',
    evidenceTools: [
      'find_transcript_moment',
      'find_visual_moment',
      'resolve_transcript_edit',
      'resolve_visual_edit',
      'resolve_keyframe_edit',
      'visual_inspect_frame',
      'resolve_clip_analysis',
      'queue_resolved_clip_analysis',
      'get_clip_analysis_result',
    ],
    mutationTools: ['apply_speed_ramp'],
    requiredToolSequence: [
      TIMELINE_READ_STEP,
      ['resolve_transcript_edit', 'resolve_visual_edit', 'resolve_keyframe_edit'],
      'apply_speed_ramp',
    ],
  }),
  'project-reframe': capabilityContract({
    authority: 'project-transform',
    mutationTools: ['reframe_project'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'reframe_project'],
  }),
  'reference-style': capabilityContract({
    authority: 'durable-workflow',
    evidenceTools: ['list_user_assets', 'search_user_assets', 'inspect_user_asset'],
    mutationTools: ['apply_reference_style'],
    requiredToolSequence: ['apply_reference_style'],
  }),
  'selected-dialogue-dubbing': capabilityContract({
    authority: 'durable-workflow',
    mutationTools: ['dub_selected_dialogue'],
    requiredToolSequence: ['dub_selected_dialogue', 'get_dubbing_job_result'],
  }),
  'project-edit': capabilityContract({
    authority: 'unified-planner',
    mutationTools: ['apply_editorial_intent'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'apply_editorial_intent'],
  }),
} satisfies Record<ChatRequestCapability, ChatCapabilityAuthorityContract>;

export const CHAT_DIRECT_FAMILY_TOOLS: ReadonlySet<string> = new Set([
  'add_captions',
  'add_fancy_captions',
  'regenerate_bgm',
  'sync_cuts_to_beats',
]);

const EXCLUSIVE_FAMILY_OWNER_TOOLS: Partial<Record<EditorialFamily, ReadonlySet<string>>> = {
  captions: new Set(['add_captions', 'add_fancy_captions']),
  music: new Set(['regenerate_bgm']),
};

export function getChatCapabilityAuthorityContract(
  capability: ChatRequestCapability,
): ChatCapabilityAuthorityContract {
  return CHAT_CAPABILITY_AUTHORITY_CONTRACTS[capability];
}

export function resolveChatCapabilityTools(
  capabilities: readonly ChatRequestCapability[],
): ReadonlySet<string> | null {
  if (capabilities.length === 0) return null;

  const tools = new Set<string>();
  for (const capability of capabilities) {
    for (const toolName of getChatCapabilityAuthorityContract(capability).callableTools) {
      tools.add(toolName);
    }
  }
  return tools;
}

export function resolveExclusiveChatFamilyOwnerTools(
  families: readonly EditorialFamily[],
): ReadonlySet<string> | null {
  if (families.length === 0) return null;

  const tools = new Set<string>();
  for (const family of families) {
    const owners = EXCLUSIVE_FAMILY_OWNER_TOOLS[family];
    if (!owners) return null;
    for (const toolName of owners) tools.add(toolName);
  }
  return tools;
}

export function requiredToolSequenceForChatCapability(
  capability: ChatRequestCapability,
  mutationTool?: string,
): readonly ChatRequiredToolStep[] {
  const contract = getChatCapabilityAuthorityContract(capability);
  if (!mutationTool) return contract.requiredToolSequence;
  if (!contract.mutationTools.has(mutationTool)) {
    throw new Error(`Tool ${mutationTool} is not owned by chat capability ${capability}.`);
  }

  const sequence = [...contract.requiredToolSequence];
  sequence[sequence.length - 1] = mutationTool;
  return sequence;
}
