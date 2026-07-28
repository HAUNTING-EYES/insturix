import type { EditorialFamily } from '../production-brief/editorial-preferences';

export const CHAT_REQUEST_CAPABILITIES = [
  'caption-track',
  'caption-refresh',
  'caption-batch-style',
  'audio-ducking',
  'background-music',
  'beat-sync',
  'scene-regeneration',
  'html-scene-edit',
  'overlay-create',
  'overlay-update',
  'overlay-batch-update',
  'clip-split',
  'clip-trim',
  'timeline-cut',
  'overlay-delete',
  'overlay-style-sync',
  'timeline-gap-close',
  'sticker-overlay',
  'selected-keyframes',
  'overlay-fade',
  'overlay-layer-order',
  'overlay-retime',
  'clip-filter',
  'asset-placement',
  'asset-replacement',
  'localized-cut',
  'localized-overlay',
  'localized-sfx',
  'sfx-replacement',
  'localized-camera-motion',
  'localized-speed-change',
  'project-reframe',
  'reference-style',
  'selected-dialogue-dubbing',
  'project-edit',
] as const;

export type ChatRequestCapability = (typeof CHAT_REQUEST_CAPABILITIES)[number];

export const CHAT_LOCALIZED_MODALITIES = [
  'transcript',
  'visual',
  'audio',
  'asset',
] as const;
export type ChatLocalizedModality = (typeof CHAT_LOCALIZED_MODALITIES)[number];

export const CHAT_LOCALIZED_OPERATIONS = [
  'remove',
  'highlight',
  'camera-motion',
  'speed-change',
  'sound-effect',
  'beat-sync',
  'place-asset',
  'replace-asset',
] as const;
export type ChatLocalizedOperation = (typeof CHAT_LOCALIZED_OPERATIONS)[number];

export const CHAT_LOCALIZED_READ_GOALS = [
  'locate',
  'inspect',
] as const;
export type ChatLocalizedReadGoal = (typeof CHAT_LOCALIZED_READ_GOALS)[number];

export interface ChatLocalizedReadRequest {
  modality: ChatLocalizedModality;
  goal: ChatLocalizedReadGoal;
  query: string;
}

export interface ChatLocalizedEditRequest {
  modality: ChatLocalizedModality;
  operation: ChatLocalizedOperation;
  query: string;
  sourceQuery?: string;
  targetQuery?: string;
  targetKind?: 'none' | 'selected-overlay' | 'described-overlay';
  targetOverlayId?: string | number;
  sourceSpan?: string;
}

export interface ChatLocalizedWorkflowAdapter {
  capability: ChatRequestCapability;
  resolverTool: string;
  resolverArgs: Record<string, unknown>;
  mutationTools: ReadonlySet<string>;
}
export type ChatOperationalAuthority =
  | 'family-owner'
  | 'mechanical-workflow'
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
  'caption-batch-style': capabilityContract({
    authority: 'family-owner',
    mutationTools: ['batch_edit_captions'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'batch_edit_captions'],
  }),
  'audio-ducking': capabilityContract({
    authority: 'family-owner',
    mutationTools: ['apply_audio_ducking'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'apply_audio_ducking'],
  }),
  'background-music': capabilityContract({
    authority: 'family-owner',
    mutationTools: ['regenerate_bgm'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'regenerate_bgm'],
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
  'overlay-create': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['add_overlay'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'add_overlay'],
  }),
  'overlay-update': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['update_overlay'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'update_overlay'],
  }),
  'overlay-batch-update': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['batch_update_overlays'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'batch_update_overlays'],
  }),
  'clip-split': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['split_overlay'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'split_overlay'],
  }),
  'clip-trim': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['trim_overlay'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'trim_overlay'],
  }),
  'timeline-cut': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['cut_section'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'cut_section'],
  }),
  'overlay-delete': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['delete_overlay'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'delete_overlay'],
  }),
  'overlay-style-sync': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['sync_style'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'sync_style'],
  }),
  'timeline-gap-close': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['close_gaps'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'close_gaps'],
  }),
  'sticker-overlay': capabilityContract({
    authority: 'mechanical-workflow',
    evidenceTools: ['resolve_sticker_overlay'],
    mutationTools: ['generate_html_sticker'],
    requiredToolSequence: [
      TIMELINE_READ_STEP,
      'resolve_sticker_overlay',
      'generate_html_sticker',
    ],
  }),
  'selected-keyframes': capabilityContract({
    authority: 'mechanical-workflow',
    evidenceTools: ['resolve_keyframe_edit'],
    mutationTools: ['set_keyframes'],
    requiredToolSequence: [
      TIMELINE_READ_STEP,
      'resolve_keyframe_edit',
      'set_keyframes',
    ],
  }),
  'overlay-fade': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['apply_fade'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'apply_fade'],
  }),
  'overlay-layer-order': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['reorder_layer'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'reorder_layer'],
  }),
  'overlay-retime': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['move_retime_overlay'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'move_retime_overlay'],
  }),
  'clip-filter': capabilityContract({
    authority: 'mechanical-workflow',
    mutationTools: ['apply_filter'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'apply_filter'],
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
      'resolve_user_asset_overlay',
      'use_matching_footage',
    ],
  }),
  'localized-cut': capabilityContract({
    authority: 'localized-workflow',
    evidenceTools: [
      'resolve_transcript_edit',
      'resolve_visual_edit',
      'resolve_audio_edit',
    ],
    mutationTools: ['cut_section'],
    requiredToolSequence: [
      TIMELINE_READ_STEP,
      ['resolve_transcript_edit', 'resolve_visual_edit', 'resolve_audio_edit'],
      'cut_section',
    ],
  }),
  'localized-overlay': capabilityContract({
    authority: 'localized-workflow',
    evidenceTools: ['resolve_visual_edit'],
    mutationTools: ['add_overlay'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'resolve_visual_edit', 'add_overlay'],
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
  'sfx-replacement': capabilityContract({
    authority: 'family-owner',
    mutationTools: ['replace_sfx'],
    requiredToolSequence: [TIMELINE_READ_STEP, 'replace_sfx'],
  }),
  'localized-camera-motion': capabilityContract({
    authority: 'localized-workflow',
    evidenceTools: [
      'find_transcript_moment',
      'find_visual_moment',
      'resolve_transcript_edit',
      'resolve_visual_edit',
      'resolve_audio_edit',
      'resolve_keyframe_edit',
      'visual_inspect_frame',
      'resolve_clip_analysis',
      'queue_resolved_clip_analysis',
      'get_clip_analysis_result',
    ],
    mutationTools: ['apply_camera_shake', 'set_keyframes'],
    requiredToolSequence: [
      TIMELINE_READ_STEP,
      ['resolve_transcript_edit', 'resolve_visual_edit', 'resolve_audio_edit', 'resolve_keyframe_edit'],
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
    requiredToolSequence: [TIMELINE_READ_STEP, 'dub_selected_dialogue'],
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

export function resolveChatLocalizedWorkflowAdapter(
  edit: ChatLocalizedEditRequest,
): ChatLocalizedWorkflowAdapter | null {
  const query = edit.query.trim();
  if (!query) return null;

  if (edit.modality === 'transcript' && edit.operation === 'remove') {
    return localizedAdapter('localized-cut', 'resolve_transcript_edit', {
      query,
      action: 'cut_phrase',
    });
  }
  if (edit.modality === 'visual' && edit.operation === 'remove') {
    return localizedAdapter('localized-cut', 'resolve_visual_edit', {
      query,
      action: 'cut_range',
    });
  }
  if (edit.modality === 'audio' && edit.operation === 'remove') {
    return localizedAdapter('localized-cut', 'resolve_audio_edit', {
      query,
      action: 'cut_section',
    });
  }
  if (edit.modality === 'visual' && edit.operation === 'highlight') {
    return localizedAdapter('localized-overlay', 'resolve_visual_edit', {
      query,
      action: 'highlight',
    });
  }
  if (edit.modality === 'visual' && edit.operation === 'camera-motion') {
    return localizedAdapter('localized-camera-motion', 'resolve_visual_edit', {
      query,
      action: 'keyframe_anchor',
    });
  }
  if (edit.modality === 'audio' && edit.operation === 'camera-motion') {
    return localizedAdapter('localized-camera-motion', 'resolve_audio_edit', {
      query,
      action: 'camera_shake',
    });
  }
  if (edit.modality === 'visual' && edit.operation === 'speed-change') {
    return localizedAdapter('localized-speed-change', 'resolve_visual_edit', {
      query,
      action: 'speed_ramp',
    });
  }
  if (edit.modality === 'audio' && edit.operation === 'sound-effect') {
    return localizedAdapter('localized-sfx', 'resolve_audio_edit', {
      query,
      action: 'add_sfx',
    });
  }
  if (edit.modality === 'audio' && edit.operation === 'beat-sync') {
    return localizedAdapter('beat-sync', 'resolve_audio_edit', {
      query,
      action: 'sync_cuts_to_beats',
    });
  }
  if (edit.modality === 'asset' && edit.operation === 'place-asset') {
    const sourceQuery = edit.sourceQuery?.trim() || query;
    return localizedAdapter('asset-placement', 'resolve_user_asset_overlay', {
      query: sourceQuery,
      operation: 'place',
    });
  }
  if (edit.modality === 'asset' && edit.operation === 'replace-asset') {
    const sourceQuery = edit.sourceQuery?.trim() || query;
    return localizedAdapter('asset-replacement', 'resolve_user_asset_overlay', {
      query: sourceQuery,
      operation: 'replace',
      ...(edit.targetOverlayId == null ? {} : { targetOverlayId: edit.targetOverlayId }),
    });
  }
  return null;
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

function localizedAdapter(
  capability: ChatRequestCapability,
  resolverTool: string,
  resolverArgs: Record<string, unknown>,
): ChatLocalizedWorkflowAdapter {
  return {
    capability,
    resolverTool,
    resolverArgs,
    mutationTools: getChatCapabilityAuthorityContract(capability).mutationTools,
  };
}
