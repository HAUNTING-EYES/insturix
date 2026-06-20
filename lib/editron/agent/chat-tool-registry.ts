export type ChatToolExecutionType = 'quick' | 'generative';
export type ChatToolRiskLevel = 'read' | 'low' | 'medium' | 'high';
export type ChatToolIconCategory =
  | 'timeline'
  | 'add'
  | 'update'
  | 'delete'
  | 'trim'
  | 'style'
  | 'caption'
  | 'motion'
  | 'transition'
  | 'audio'
  | 'visual'
  | 'search'
  | 'file'
  | 'keyframe'
  | 'stock'
  | 'script'
  | 'sparkles';

export interface ChatToolMetadata {
  name: string;
  label: string;
  shortLabel: string;
  iconCategory: ChatToolIconCategory;
  executionType: ChatToolExecutionType;
  mutatesProject: boolean;
  requiresProjectReload: boolean;
  riskLevel: ChatToolRiskLevel;
  receiptLabel: string;
  loadingMessages?: string[];
}

type ChatToolMetadataInput = Omit<ChatToolMetadata, 'executionType' | 'mutatesProject' | 'requiresProjectReload' | 'riskLevel'> & {
  executionType?: ChatToolExecutionType;
  mutatesProject?: boolean;
  requiresProjectReload?: boolean;
  riskLevel?: ChatToolRiskLevel;
};

const DEFAULT_LOADING_MESSAGES = ['Working'];

function defineTool(input: ChatToolMetadataInput): ChatToolMetadata {
  const mutatesProject = input.mutatesProject ?? false;
  return {
    ...input,
    executionType: input.executionType ?? 'quick',
    mutatesProject,
    requiresProjectReload: input.requiresProjectReload ?? mutatesProject,
    riskLevel: input.riskLevel ?? (mutatesProject ? 'medium' : 'read'),
  };
}

export const CHAT_TOOL_REGISTRY = {
  read_project_file: defineTool({ name: 'read_project_file', label: 'Reading project data', shortLabel: 'Read', iconCategory: 'file', receiptLabel: 'Read project data' }),
  get_timeline_view: defineTool({ name: 'get_timeline_view', label: 'Reading timeline layout', shortLabel: 'Timeline', iconCategory: 'timeline', receiptLabel: 'Read timeline' }),
  add_overlay: defineTool({ name: 'add_overlay', label: 'Adding element', shortLabel: 'Add', iconCategory: 'add', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added element' }),
  update_overlay: defineTool({ name: 'update_overlay', label: 'Updating element', shortLabel: 'Update', iconCategory: 'update', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Updated element' }),
  batch_update_overlays: defineTool({ name: 'batch_update_overlays', label: 'Batch updating elements', shortLabel: 'Batch', iconCategory: 'update', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Batch updated elements' }),
  split_overlay: defineTool({ name: 'split_overlay', label: 'Splitting clip', shortLabel: 'Split', iconCategory: 'trim', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Split clip' }),
  trim_overlay: defineTool({ name: 'trim_overlay', label: 'Trimming clip', shortLabel: 'Trim', iconCategory: 'trim', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Trimmed clip' }),
  delete_overlay: defineTool({ name: 'delete_overlay', label: 'Removing element', shortLabel: 'Remove', iconCategory: 'delete', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Removed element' }),
  sync_style: defineTool({ name: 'sync_style', label: 'Syncing styles', shortLabel: 'Sync', iconCategory: 'style', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Synced styles' }),
  visual_inspect_frame: defineTool({ name: 'visual_inspect_frame', label: 'Inspecting video frame', shortLabel: 'Inspect', iconCategory: 'visual', receiptLabel: 'Inspected frame' }),
  close_gaps: defineTool({ name: 'close_gaps', label: 'Closing timeline gaps', shortLabel: 'Close gaps', iconCategory: 'timeline', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Closed gaps' }),
  restore_ai_edit_checkpoint: defineTool({ name: 'restore_ai_edit_checkpoint', label: 'Restoring AI edit checkpoint', shortLabel: 'Restore', iconCategory: 'timeline', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Restored checkpoint' }),
  cut_section: defineTool({ name: 'cut_section', label: 'Cutting section', shortLabel: 'Cut', iconCategory: 'trim', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Cut section' }),
  add_motion_graphic: defineTool({ name: 'add_motion_graphic', label: 'Adding motion graphic', shortLabel: 'MG', iconCategory: 'motion', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added motion graphic' }),
  generate_html_scene: defineTool({ name: 'generate_html_scene', label: 'Creating custom scene', shortLabel: 'Scene', iconCategory: 'sparkles', executionType: 'generative', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Created scene', loadingMessages: ['Crafting your scene', 'Painting with code', 'Almost ready'] }),
  generate_html_sticker: defineTool({ name: 'generate_html_sticker', label: 'Creating custom sticker', shortLabel: 'Sticker', iconCategory: 'sparkles', executionType: 'generative', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Created sticker', loadingMessages: ['Creating sticker', 'Adding motion', 'Finishing up'] }),
  get_video_transcription: defineTool({ name: 'get_video_transcription', label: 'Reading transcript', shortLabel: 'Transcript', iconCategory: 'file', receiptLabel: 'Read transcript' }),
  find_transcript_moment: defineTool({ name: 'find_transcript_moment', label: 'Finding transcript moment', shortLabel: 'Find speech', iconCategory: 'caption', receiptLabel: 'Found transcript moment' }),
  find_visual_moment: defineTool({ name: 'find_visual_moment', label: 'Finding visual moment', shortLabel: 'Find visual', iconCategory: 'visual', receiptLabel: 'Found visual moment' }),
  analyze_video_content: defineTool({ name: 'analyze_video_content', label: 'Analyzing video content', shortLabel: 'Analyze', iconCategory: 'visual', receiptLabel: 'Analyzed video' }),
  add_captions: defineTool({ name: 'add_captions', label: 'Adding captions', shortLabel: 'Captions', iconCategory: 'caption', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added captions' }),
  add_fancy_captions: defineTool({ name: 'add_fancy_captions', label: 'Adding animated captions', shortLabel: 'Fancy', iconCategory: 'caption', executionType: 'generative', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added animated captions', loadingMessages: ['Designing captions', 'Timing words', 'Finishing typography'] }),
  refresh_fancy_captions: defineTool({ name: 'refresh_fancy_captions', label: 'Refreshing animated captions', shortLabel: 'Refresh', iconCategory: 'caption', executionType: 'generative', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Refreshed animated captions', loadingMessages: ['Re-syncing captions', 'Refreshing typography', 'Finishing up'] }),
  refresh_captions: defineTool({ name: 'refresh_captions', label: 'Refreshing captions', shortLabel: 'Refresh', iconCategory: 'caption', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Refreshed captions' }),
  analyze_clip_audio: defineTool({ name: 'analyze_clip_audio', label: 'Analyzing audio', shortLabel: 'Audio', iconCategory: 'audio', executionType: 'generative', receiptLabel: 'Analyzed audio', loadingMessages: ['Listening to audio', 'Finding beats', 'Checking pauses'] }),
  analyze_clip_video: defineTool({ name: 'analyze_clip_video', label: 'Analyzing video', shortLabel: 'Video', iconCategory: 'visual', executionType: 'generative', receiptLabel: 'Analyzed video', loadingMessages: ['Inspecting video', 'Reading frames', 'Checking visuals'] }),
  auto_edit_from_script: defineTool({ name: 'auto_edit_from_script', label: 'Auto editing from script', shortLabel: 'Auto edit', iconCategory: 'script', executionType: 'generative', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Auto edited from script', loadingMessages: ['Planning edit', 'Building timeline', 'Applying cuts'] }),
  regenerate_scene: defineTool({ name: 'regenerate_scene', label: 'Regenerating scene', shortLabel: 'Regen', iconCategory: 'sparkles', executionType: 'generative', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Regenerated scene', loadingMessages: ['Regenerating scene', 'Starting render', 'Preparing update'] }),
  add_transition: defineTool({ name: 'add_transition', label: 'Adding transition', shortLabel: 'Transition', iconCategory: 'transition', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added transition' }),
  auto_motion_graphics: defineTool({ name: 'auto_motion_graphics', label: 'Adding motion graphics', shortLabel: 'Auto MG', iconCategory: 'motion', executionType: 'generative', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added motion graphics', loadingMessages: ['Finding moments', 'Planning graphics', 'Adding motion'] }),
  extract_style: defineTool({ name: 'extract_style', label: 'Extracting edit style', shortLabel: 'Extract', iconCategory: 'style', executionType: 'generative', receiptLabel: 'Extracted style', loadingMessages: ['Reading style', 'Finding patterns', 'Building profile'] }),
  apply_style: defineTool({ name: 'apply_style', label: 'Applying edit style', shortLabel: 'Style', iconCategory: 'style', executionType: 'generative', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Applied style', loadingMessages: ['Planning style', 'Applying changes', 'Checking timing'] }),
  sync_cuts_to_beats: defineTool({ name: 'sync_cuts_to_beats', label: 'Syncing cuts to beats', shortLabel: 'Beat sync', iconCategory: 'audio', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Synced cuts to beats' }),
  set_keyframes: defineTool({ name: 'set_keyframes', label: 'Setting keyframes', shortLabel: 'Keyframes', iconCategory: 'keyframe', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Set keyframes' }),
  regenerate_bgm: defineTool({ name: 'regenerate_bgm', label: 'Regenerating music', shortLabel: 'Music', iconCategory: 'audio', executionType: 'generative', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Regenerated music', loadingMessages: ['Composing music', 'Matching mood', 'Adding track'] }),
  replace_sfx: defineTool({ name: 'replace_sfx', label: 'Replacing sound effect', shortLabel: 'Replace SFX', iconCategory: 'audio', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Replaced sound effect' }),
  add_sfx: defineTool({ name: 'add_sfx', label: 'Adding sound effect', shortLabel: 'SFX', iconCategory: 'audio', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added sound effect' }),
  batch_edit_captions: defineTool({ name: 'batch_edit_captions', label: 'Editing all captions', shortLabel: 'Caption edit', iconCategory: 'caption', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Edited captions' }),
  list_user_assets: defineTool({ name: 'list_user_assets', label: 'Listing uploaded assets', shortLabel: 'Assets', iconCategory: 'file', receiptLabel: 'Listed uploaded assets' }),
  search_user_assets: defineTool({ name: 'search_user_assets', label: 'Searching uploaded assets', shortLabel: 'Asset search', iconCategory: 'search', executionType: 'generative', receiptLabel: 'Searched uploaded assets', loadingMessages: ['Searching your library', 'Checking asset matches', 'Ranking candidates'] }),
  inspect_user_asset: defineTool({ name: 'inspect_user_asset', label: 'Inspecting uploaded asset', shortLabel: 'Inspect asset', iconCategory: 'visual', receiptLabel: 'Inspected uploaded asset' }),
  search_stock_footage: defineTool({ name: 'search_stock_footage', label: 'Searching stock footage', shortLabel: 'Stock', iconCategory: 'stock', executionType: 'generative', receiptLabel: 'Searched stock footage', loadingMessages: ['Searching footage', 'Checking matches', 'Collecting results'] }),
  use_matching_footage: defineTool({ name: 'use_matching_footage', label: 'Using matching footage', shortLabel: 'Use footage', iconCategory: 'stock', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Used matching footage' }),

  list_project_files: defineTool({ name: 'list_project_files', label: 'Listing project files', shortLabel: 'List', iconCategory: 'file', receiptLabel: 'Listed project files' }),
  apply_project_patch: defineTool({ name: 'apply_project_patch', label: 'Applying project patch', shortLabel: 'Patch', iconCategory: 'update', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Applied patch' }),
  add_text_overlay: defineTool({ name: 'add_text_overlay', label: 'Adding text', shortLabel: 'Text', iconCategory: 'add', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added text' }),
  add_image_overlay: defineTool({ name: 'add_image_overlay', label: 'Adding image', shortLabel: 'Image', iconCategory: 'add', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added image' }),
  add_video_overlay: defineTool({ name: 'add_video_overlay', label: 'Adding video', shortLabel: 'Video', iconCategory: 'add', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added video' }),
  add_audio_overlay: defineTool({ name: 'add_audio_overlay', label: 'Adding audio', shortLabel: 'Audio', iconCategory: 'audio', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added audio' }),
  get_video_duration: defineTool({ name: 'get_video_duration', label: 'Checking video duration', shortLabel: 'Duration', iconCategory: 'visual', receiptLabel: 'Checked duration' }),
  search_web: defineTool({ name: 'search_web', label: 'Searching web', shortLabel: 'Search', iconCategory: 'search', executionType: 'generative', receiptLabel: 'Searched web' }),
  generate_image: defineTool({ name: 'generate_image', label: 'Generating image', shortLabel: 'Image', iconCategory: 'sparkles', executionType: 'generative', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Generated image', loadingMessages: ['Imagining visuals', 'Rendering image', 'Finishing up'] }),
  batchEditCaptions: defineTool({ name: 'batchEditCaptions', label: 'Editing all captions', shortLabel: 'Caption edit', iconCategory: 'caption', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Edited captions' }),
  addTransition: defineTool({ name: 'addTransition', label: 'Adding transition', shortLabel: 'Transition', iconCategory: 'transition', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added transition' }),
  addSFX: defineTool({ name: 'addSFX', label: 'Adding sound effect', shortLabel: 'SFX', iconCategory: 'audio', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added sound effect' }),
  replaceSFX: defineTool({ name: 'replaceSFX', label: 'Replacing sound effect', shortLabel: 'Replace SFX', iconCategory: 'audio', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Replaced sound effect' }),
  add_sticker: defineTool({ name: 'add_sticker', label: 'Adding sticker', shortLabel: 'Sticker', iconCategory: 'sparkles', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added sticker' }),
  addSticker: defineTool({ name: 'addSticker', label: 'Adding sticker', shortLabel: 'Sticker', iconCategory: 'sparkles', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added sticker' }),
  apply_filter: defineTool({ name: 'apply_filter', label: 'Applying filter', shortLabel: 'Filter', iconCategory: 'style', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Applied filter' }),
  applyFilter: defineTool({ name: 'applyFilter', label: 'Applying filter', shortLabel: 'Filter', iconCategory: 'style', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Applied filter' }),
  deleteOverlay: defineTool({ name: 'deleteOverlay', label: 'Removing element', shortLabel: 'Remove', iconCategory: 'delete', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Removed element' }),
  updateOverlay: defineTool({ name: 'updateOverlay', label: 'Updating element', shortLabel: 'Update', iconCategory: 'update', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Updated element' }),
} satisfies Record<string, ChatToolMetadata>;

export type ChatToolName = keyof typeof CHAT_TOOL_REGISTRY;

export function getChatToolMetadata(toolName: string): ChatToolMetadata | undefined {
  return CHAT_TOOL_REGISTRY[toolName as ChatToolName];
}

export function getChatToolLabel(toolName: string): string {
  return getChatToolMetadata(toolName)?.label ?? toolName.replace(/_/g, ' ');
}

export function getChatToolShortLabel(toolName: string): string {
  return getChatToolMetadata(toolName)?.shortLabel ?? toolName.replace(/_/g, ' ');
}

export function getChatToolLoadingMessages(toolName: string): string[] {
  return getChatToolMetadata(toolName)?.loadingMessages ?? DEFAULT_LOADING_MESSAGES;
}

export function shouldReloadProjectAfterTool(toolName: string): boolean {
  return getChatToolMetadata(toolName)?.requiresProjectReload ?? false;
}

export function formatChatToolReceipt(toolName: string): string {
  return getChatToolMetadata(toolName)?.receiptLabel ?? getChatToolLabel(toolName);
}
