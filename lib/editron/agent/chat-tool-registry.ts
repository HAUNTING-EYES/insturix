export type ChatToolExecutionType = 'quick' | 'generative';
export type ChatToolRiskLevel = 'read' | 'low' | 'medium' | 'high';
export type ChatToolExposure = 'live-chat' | 'shadow-authority-filtered';
export type ChatToolMutationCompletion = 'immediate' | 'durable';
export type ChatToolStatePostconditionKind =
  | 'project-state-changed'
  | 'project-state-changed-or-durable-operation-queued'
  | 'overlay-created'
  | 'overlay-updated'
  | 'overlay-deleted'
  | 'overlay-set-changed';
export type ChatToolRenderEvidenceModality = 'visual' | 'audio';
export type ChatToolRenderEvidenceExpectation =
  | 'mutation-delta'
  | 'continuity-preserved';
export type ChatToolEvidenceClass =
  | 'project-state'
  | 'timeline-state'
  | 'render-frame'
  | 'transcript-target'
  | 'visual-target'
  | 'audio-target'
  | 'asset-target';
export type ChatToolOwnerClass =
  | 'mechanical-editor'
  | 'semantic-editorial-planner'
  | 'checkpoint-restorer';
export type ChatToolCardinality = 'repeatable' | 'once-per-turn' | 'once-per-target';
export type ChatToolReplayBehavior = 'never' | 'same-project-revision';
export type ChatToolBatchSafety = 'parallel-read' | 'sequential' | 'isolated' | 'explicit-batch';
export type ChatToolEffect =
  | 'cut-gap-closed'
  | 'timeline-gaps-closed';
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

export interface ChatToolExecutionPolicy {
  cardinality: ChatToolCardinality;
  replayBehavior: ChatToolReplayBehavior;
  batchSafety: ChatToolBatchSafety;
  targetKeys: string[];
  maxValidationCorrectionsPerTurn: number;
  blockedWhenTurnRequests: string[];
}

function executionPolicy(input: {
  cardinality: ChatToolCardinality;
  replayBehavior?: ChatToolReplayBehavior;
  batchSafety: ChatToolBatchSafety;
  targetKeys?: string[];
  blockedWhenTurnRequests?: string[];
}): ChatToolExecutionPolicy {
  return {
    cardinality: input.cardinality,
    replayBehavior: input.replayBehavior ?? 'never',
    batchSafety: input.batchSafety,
    targetKeys: input.targetKeys ?? [],
    maxValidationCorrectionsPerTurn: 1,
    blockedWhenTurnRequests: input.blockedWhenTurnRequests ?? [],
  };
}

const repeatableRead = (
  targetKeys: string[] = [],
  batchSafety: ChatToolBatchSafety = 'parallel-read',
) => executionPolicy({ cardinality: 'repeatable', batchSafety, targetKeys });
const targetedRead = (
  targetKeys: string[],
  batchSafety: ChatToolBatchSafety = 'parallel-read',
) => executionPolicy({ cardinality: 'once-per-target', batchSafety, targetKeys });
const oncePerTurnRead = (
  batchSafety: ChatToolBatchSafety = 'sequential',
  blockedWhenTurnRequests: string[] = [],
) => executionPolicy({ cardinality: 'once-per-turn', batchSafety, blockedWhenTurnRequests });
const repeatableMutation = () => executionPolicy({
  cardinality: 'repeatable',
  replayBehavior: 'same-project-revision',
  batchSafety: 'sequential',
});
const targetedMutation = (targetKeys: string[]) => executionPolicy({
  cardinality: 'once-per-target',
  replayBehavior: 'same-project-revision',
  batchSafety: 'sequential',
  targetKeys,
});
const oncePerTurnMutation = (
  batchSafety: ChatToolBatchSafety = 'sequential',
  blockedWhenTurnRequests: string[] = [],
) => executionPolicy({
  cardinality: 'once-per-turn',
  replayBehavior: 'same-project-revision',
  batchSafety,
  blockedWhenTurnRequests,
});
const explicitBatchMutation = () => executionPolicy({
  cardinality: 'once-per-turn',
  replayBehavior: 'same-project-revision',
  batchSafety: 'explicit-batch',
});

export const CHAT_TOOL_EXECUTION_CONTRACTS = {
  read_project_file: repeatableRead(),
  get_timeline_view: repeatableRead(),
  apply_editorial_intent: oncePerTurnMutation('isolated', ['extract_style', 'apply_style', 'apply_reference_style']),
  apply_reference_style: oncePerTurnRead('isolated', ['apply_editorial_intent']),
  add_overlay: repeatableMutation(),
  update_overlay: targetedMutation(['id']),
  batch_update_overlays: explicitBatchMutation(),
  split_overlay: targetedMutation(['id']),
  trim_overlay: targetedMutation(['id']),
  delete_overlay: targetedMutation(['id']),
  sync_style: explicitBatchMutation(),
  visual_inspect_frame: targetedRead(['frame', 'targetFrame', 'overlayId'], 'isolated'),
  close_gaps: oncePerTurnMutation(),
  restore_ai_edit_checkpoint: oncePerTurnMutation('isolated'),
  cut_section: targetedMutation(['startFrame', 'endFrame']),
  add_motion_graphic: repeatableMutation(),
  generate_html_scene: repeatableMutation(),
  edit_html_scene: targetedMutation(['overlayId', 'id']),
  generate_html_sticker: repeatableMutation(),
  get_video_transcription: targetedRead(['videoOverlayId', 'overlayId', 'assetId'], 'sequential'),
  find_transcript_moment: targetedRead(['query', 'videoOverlayId'], 'sequential'),
  resolve_transcript_edit: targetedRead(['query', 'action', 'videoOverlayId'], 'sequential'),
  resolve_sticker_overlay: targetedRead(['query', 'targetFrame', 'videoOverlayId'], 'sequential'),
  find_visual_moment: targetedRead(['query', 'videoOverlayId'], 'sequential'),
  resolve_visual_edit: targetedRead(['query', 'action', 'videoOverlayId'], 'sequential'),
  resolve_keyframe_edit: targetedRead(['query', 'overlayId', 'property'], 'sequential'),
  find_audio_moment: targetedRead(['query', 'audioOverlayId'], 'sequential'),
  resolve_audio_edit: targetedRead(['query', 'action', 'audioOverlayId'], 'sequential'),
  apply_audio_ducking: oncePerTurnMutation(),
  apply_camera_shake: targetedMutation(['videoOverlayId', 'targetFrame']),
  apply_speed_ramp: targetedMutation(['videoOverlayId', 'startFrame', 'endFrame', 'targetFrame']),
  apply_fade: targetedMutation(['overlayId', 'startFrame', 'endFrame', 'targetFrame']),
  reorder_layer: targetedMutation(['overlayId']),
  move_retime_overlay: targetedMutation(['overlayId']),
  analyze_video_content: targetedRead(['videoOverlayId', 'overlayId', 'assetId'], 'sequential'),
  add_captions: targetedMutation(['videoOverlayId']),
  add_fancy_captions: targetedMutation(['videoOverlayId', 'startFrame', 'endFrame']),
  refresh_fancy_captions: targetedMutation(['fancyCaptionOverlayId']),
  refresh_captions: targetedMutation(['captionOverlayId']),
  resolve_clip_analysis: targetedRead(
    ['modality', 'targetMode', 'overlayId', 'assetId', 'target', 'startSeconds', 'endSeconds'],
    'sequential',
  ),
  queue_resolved_clip_analysis: oncePerTurnRead('explicit-batch'),
  get_clip_analysis_result: targetedRead(['jobIds'], 'sequential'),
  dub_selected_dialogue: targetedRead(['overlayId'], 'isolated'),
  get_dubbing_job_result: targetedRead(['jobId'], 'sequential'),
  analyze_clip_audio: targetedRead(['target', 'videoOverlayId', 'overlayId', 'assetId'], 'sequential'),
  analyze_clip_video: targetedRead(['target', 'videoOverlayId', 'overlayId', 'assetId'], 'sequential'),
  auto_edit_from_script: oncePerTurnMutation('isolated'),
  regenerate_scene: targetedMutation(['sceneIndex', 'target']),
  add_transition: targetedMutation(['afterOverlayId']),
  auto_motion_graphics: oncePerTurnMutation('isolated'),
  extract_style: oncePerTurnRead(),
  apply_style: oncePerTurnMutation('isolated'),
  sync_cuts_to_beats: oncePerTurnMutation(),
  set_keyframes: targetedMutation(['overlayId', 'property']),
  regenerate_bgm: oncePerTurnMutation('isolated'),
  replace_sfx: targetedMutation(['overlayId']),
  add_sfx: targetedMutation(['sceneIndex', 'startFrame']),
  batch_edit_captions: explicitBatchMutation(),
  list_user_assets: repeatableRead(),
  search_user_assets: targetedRead(['query', 'type'], 'sequential'),
  inspect_user_asset: targetedRead(['assetId'], 'sequential'),
  resolve_user_asset_overlay: targetedRead(['assetId', 'query', 'overlayId'], 'sequential'),
  search_stock_footage: targetedRead(['query'], 'sequential'),
  use_matching_footage: targetedMutation(['overlayId', 'sceneIndex']),
  apply_filter: targetedMutation(['overlayId', 'targetFrame']),
  reframe_project: oncePerTurnMutation('isolated'),
} satisfies Record<string, ChatToolExecutionPolicy>;

export type ChatToolName = keyof typeof CHAT_TOOL_EXECUTION_CONTRACTS;

export interface ChatToolTurnContract {
  owner: ChatToolOwnerClass | null;
  evidenceStrategy: 'preflight' | 'owner-internal' | 'none';
  requiredEvidence: ChatToolEvidenceClass[];
  producesEvidence: ChatToolEvidenceClass[];
}

export interface ChatToolEffectContract {
  produces: ChatToolEffect[];
  redundantAfter: ChatToolEffect[];
}

export interface ChatToolMetadata {
  name: ChatToolName;
  label: string;
  shortLabel: string;
  iconCategory: ChatToolIconCategory;
  executionType: ChatToolExecutionType;
  exposure: ChatToolExposure;
  mutatesProject: boolean;
  mutationCompletion: ChatToolMutationCompletion;
  requiresProjectReload: boolean;
  riskLevel: ChatToolRiskLevel;
  receiptLabel: string;
  loadingMessages?: string[];
  postconditions: ChatToolPostconditionContract | null;
  executionPolicy: ChatToolExecutionPolicy;
  turnContract: ChatToolTurnContract;
  effectContract: ChatToolEffectContract;
}

export interface ChatToolPostconditionContract {
  state: {
    kind: ChatToolStatePostconditionKind;
    targetSource: 'tool-args-and-result';
  };
  render: {
    required: true;
    modalities: ChatToolRenderEvidenceModality[];
    expectation: ChatToolRenderEvidenceExpectation;
    expectationsByModality?: Partial<
      Record<ChatToolRenderEvidenceModality, ChatToolRenderEvidenceExpectation>
    >;
  };
}

type ChatToolMetadataInput = Omit<ChatToolMetadata, 'executionType' | 'exposure' | 'mutatesProject' | 'mutationCompletion' | 'requiresProjectReload' | 'riskLevel' | 'postconditions' | 'executionPolicy' | 'turnContract' | 'effectContract'> & {
  executionType?: ChatToolExecutionType;
  exposure?: ChatToolExposure;
  mutatesProject?: boolean;
  mutationCompletion?: ChatToolMutationCompletion;
  requiresProjectReload?: boolean;
  riskLevel?: ChatToolRiskLevel;
  postconditions?: ChatToolPostconditionContract;
  turnContract?: ChatToolTurnContract;
  effectContract?: ChatToolEffectContract;
};

const DEFAULT_LOADING_MESSAGES = ['Working'];

function defineTool(input: ChatToolMetadataInput): ChatToolMetadata {
  const mutatesProject = input.mutatesProject ?? false;
  const postconditionContract = mutatesProject
    ? input.postconditions ?? defaultPostconditions(input.iconCategory)
    : null;
  return {
    ...input,
    executionType: input.executionType ?? 'quick',
    exposure: input.exposure ?? 'live-chat',
    mutatesProject,
    mutationCompletion: input.mutationCompletion ?? 'immediate',
    requiresProjectReload: input.requiresProjectReload ?? mutatesProject,
    riskLevel: input.riskLevel ?? (mutatesProject ? 'medium' : 'read'),
    postconditions: postconditionContract,
    executionPolicy: CHAT_TOOL_EXECUTION_CONTRACTS[input.name],
    turnContract: input.turnContract ?? defaultTurnContract(
      input.name,
      mutatesProject,
      postconditionContract,
    ),
    effectContract: input.effectContract ?? { produces: [], redundantAfter: [] },
  };
}

function defaultTurnContract(
  name: string,
  mutatesProject: boolean,
  postconditions: ChatToolPostconditionContract | null,
): ChatToolTurnContract {
  if (mutatesProject) {
    const requiresTimelineRead = postconditions?.render.modalities.includes('visual') ?? false;
    return {
      owner: 'mechanical-editor',
      evidenceStrategy: 'preflight',
      requiredEvidence: requiresTimelineRead
        ? ['project-state', 'timeline-state']
        : ['project-state'],
      producesEvidence: [],
    };
  }

  const producesEvidence = EVIDENCE_PRODUCERS[name] ?? [];
  return {
    owner: null,
    evidenceStrategy: 'none',
    requiredEvidence: [],
    producesEvidence,
  };
}

const EVIDENCE_PRODUCERS: Readonly<Record<string, ChatToolEvidenceClass[]>> = {
  read_project_file: ['project-state', 'timeline-state'],
  get_timeline_view: ['timeline-state'],
  visual_inspect_frame: ['render-frame'],
  resolve_transcript_edit: ['transcript-target'],
  resolve_sticker_overlay: ['transcript-target'],
  resolve_visual_edit: ['visual-target'],
  resolve_audio_edit: ['audio-target'],
  resolve_user_asset_overlay: ['asset-target'],
  resolve_keyframe_edit: ['visual-target'],
};

function postconditions(
  kind: ChatToolStatePostconditionKind,
  modalities: ChatToolRenderEvidenceModality[] = ['visual'],
  expectation: ChatToolRenderEvidenceExpectation = 'mutation-delta',
  expectationsByModality?: Partial<
    Record<ChatToolRenderEvidenceModality, ChatToolRenderEvidenceExpectation>
  >,
): ChatToolPostconditionContract {
  return {
    state: { kind, targetSource: 'tool-args-and-result' },
    render: {
      required: true,
      modalities,
      expectation,
      ...(expectationsByModality ? { expectationsByModality } : {}),
    },
  };
}

function defaultPostconditions(iconCategory: ChatToolIconCategory): ChatToolPostconditionContract {
  if (iconCategory === 'audio') return postconditions('project-state-changed', ['audio']);
  if (iconCategory === 'timeline' || iconCategory === 'trim' || iconCategory === 'script') {
    return postconditions('project-state-changed', ['visual', 'audio']);
  }
  return postconditions('project-state-changed', ['visual']);
}

export const CHAT_TOOL_REGISTRY = {
  read_project_file: defineTool({ name: 'read_project_file', label: 'Reading project data', shortLabel: 'Read', iconCategory: 'file', receiptLabel: 'Read project data' }),
  get_timeline_view: defineTool({ name: 'get_timeline_view', label: 'Reading timeline layout', shortLabel: 'Timeline', iconCategory: 'timeline', receiptLabel: 'Read timeline' }),
  apply_editorial_intent: defineTool({ name: 'apply_editorial_intent', label: 'Grounding editorial intent', shortLabel: 'Editorial plan', iconCategory: 'sparkles', executionType: 'generative', mutatesProject: true, mutationCompletion: 'durable', requiresProjectReload: false, riskLevel: 'high', receiptLabel: 'Queued grounded editorial intent', loadingMessages: ['Reading the edit', 'Grounding the request', 'Queueing warranted changes'], postconditions: postconditions('project-state-changed-or-durable-operation-queued', ['visual', 'audio']), turnContract: { owner: 'semantic-editorial-planner', evidenceStrategy: 'preflight', requiredEvidence: ['project-state', 'timeline-state'], producesEvidence: [] } }),
  apply_reference_style: defineTool({ name: 'apply_reference_style', label: 'Applying reference style', shortLabel: 'Reference style', iconCategory: 'style', executionType: 'generative', mutatesProject: true, mutationCompletion: 'durable', requiresProjectReload: false, riskLevel: 'high', receiptLabel: 'Queued reference style', loadingMessages: ['Inspecting the reference', 'Extracting edit language', 'Queueing faithful changes'], postconditions: postconditions('project-state-changed-or-durable-operation-queued', ['visual', 'audio']), turnContract: { owner: 'semantic-editorial-planner', evidenceStrategy: 'preflight', requiredEvidence: ['project-state', 'timeline-state'], producesEvidence: [] } }),
  add_overlay: defineTool({ name: 'add_overlay', label: 'Adding element', shortLabel: 'Add', iconCategory: 'add', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added element', postconditions: postconditions('overlay-created', ['visual', 'audio']) }),
  update_overlay: defineTool({ name: 'update_overlay', label: 'Updating element', shortLabel: 'Update', iconCategory: 'update', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Updated element', postconditions: postconditions('overlay-updated', ['visual', 'audio']) }),
  batch_update_overlays: defineTool({ name: 'batch_update_overlays', label: 'Batch updating elements', shortLabel: 'Batch', iconCategory: 'update', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Batch updated elements', postconditions: postconditions('overlay-updated', ['visual', 'audio']) }),
  split_overlay: defineTool({ name: 'split_overlay', label: 'Splitting clip', shortLabel: 'Split', iconCategory: 'trim', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Split clip', postconditions: postconditions('overlay-set-changed', ['visual', 'audio'], 'continuity-preserved') }),
  trim_overlay: defineTool({ name: 'trim_overlay', label: 'Trimming clip', shortLabel: 'Trim', iconCategory: 'trim', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Trimmed clip' }),
  delete_overlay: defineTool({ name: 'delete_overlay', label: 'Removing element', shortLabel: 'Remove', iconCategory: 'delete', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Removed element', postconditions: postconditions('overlay-deleted', ['visual', 'audio']) }),
  sync_style: defineTool({ name: 'sync_style', label: 'Syncing styles', shortLabel: 'Sync', iconCategory: 'style', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Synced styles' }),
  visual_inspect_frame: defineTool({ name: 'visual_inspect_frame', label: 'Inspecting video frame', shortLabel: 'Inspect', iconCategory: 'visual', receiptLabel: 'Inspected frame' }),
  close_gaps: defineTool({ name: 'close_gaps', label: 'Closing timeline gaps', shortLabel: 'Close gaps', iconCategory: 'timeline', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Closed gaps', postconditions: postconditions('overlay-set-changed', ['visual', 'audio'], 'mutation-delta', { visual: 'mutation-delta', audio: 'continuity-preserved' }), effectContract: { produces: ['timeline-gaps-closed'], redundantAfter: ['cut-gap-closed', 'timeline-gaps-closed'] } }),
  restore_ai_edit_checkpoint: defineTool({ name: 'restore_ai_edit_checkpoint', label: 'Restoring AI edit checkpoint', shortLabel: 'Restore', iconCategory: 'timeline', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Restored checkpoint', turnContract: { owner: 'checkpoint-restorer', evidenceStrategy: 'owner-internal', requiredEvidence: [], producesEvidence: [] } }),
  cut_section: defineTool({ name: 'cut_section', label: 'Cutting section', shortLabel: 'Cut', iconCategory: 'trim', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Cut section', postconditions: postconditions('overlay-set-changed', ['visual', 'audio']), effectContract: { produces: ['cut-gap-closed'], redundantAfter: [] } }),
  add_motion_graphic: defineTool({ name: 'add_motion_graphic', label: 'Adding motion graphic', shortLabel: 'MG', iconCategory: 'motion', executionType: 'quick', exposure: 'shadow-authority-filtered', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added motion graphic', postconditions: postconditions('overlay-created') }),
  generate_html_scene: defineTool({ name: 'generate_html_scene', label: 'Creating custom scene', shortLabel: 'Scene', iconCategory: 'sparkles', executionType: 'generative', exposure: 'shadow-authority-filtered', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Created scene', loadingMessages: ['Crafting your scene', 'Painting with code', 'Almost ready'], postconditions: postconditions('overlay-created') }),
  edit_html_scene: defineTool({ name: 'edit_html_scene', label: 'Revising custom scene', shortLabel: 'Revise scene', iconCategory: 'sparkles', executionType: 'generative', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Revised scene', loadingMessages: ['Reading the existing scene', 'Applying the revision', 'Checking the result'], postconditions: postconditions('overlay-updated') }),
  generate_html_sticker: defineTool({ name: 'generate_html_sticker', label: 'Creating custom sticker', shortLabel: 'Sticker', iconCategory: 'sparkles', executionType: 'generative', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Created sticker', loadingMessages: ['Creating sticker', 'Adding motion', 'Finishing up'], postconditions: postconditions('overlay-created') }),
  get_video_transcription: defineTool({ name: 'get_video_transcription', label: 'Reading transcript', shortLabel: 'Transcript', iconCategory: 'file', receiptLabel: 'Read transcript' }),
  find_transcript_moment: defineTool({ name: 'find_transcript_moment', label: 'Finding transcript moment', shortLabel: 'Find speech', iconCategory: 'caption', receiptLabel: 'Found transcript moment' }),
  resolve_transcript_edit: defineTool({ name: 'resolve_transcript_edit', label: 'Resolving transcript edit', shortLabel: 'Speech edit', iconCategory: 'caption', receiptLabel: 'Resolved transcript edit' }),
  resolve_sticker_overlay: defineTool({ name: 'resolve_sticker_overlay', label: 'Resolving sticker timing', shortLabel: 'Sticker timing', iconCategory: 'sparkles', receiptLabel: 'Resolved sticker timing' }),
  find_visual_moment: defineTool({ name: 'find_visual_moment', label: 'Finding visual moment', shortLabel: 'Find visual', iconCategory: 'visual', receiptLabel: 'Found visual moment' }),
  resolve_visual_edit: defineTool({ name: 'resolve_visual_edit', label: 'Resolving visual edit', shortLabel: 'Visual edit', iconCategory: 'visual', receiptLabel: 'Resolved visual edit' }),
  resolve_keyframe_edit: defineTool({ name: 'resolve_keyframe_edit', label: 'Resolving keyframes', shortLabel: 'Keyframes', iconCategory: 'keyframe', receiptLabel: 'Resolved keyframes' }),
  find_audio_moment: defineTool({ name: 'find_audio_moment', label: 'Finding audio moment', shortLabel: 'Find audio', iconCategory: 'audio', receiptLabel: 'Found audio moment' }),
  resolve_audio_edit: defineTool({ name: 'resolve_audio_edit', label: 'Resolving audio edit', shortLabel: 'Audio edit', iconCategory: 'audio', receiptLabel: 'Resolved audio edit' }),
  apply_audio_ducking: defineTool({ name: 'apply_audio_ducking', label: 'Applying audio ducking', shortLabel: 'Ducking', iconCategory: 'audio', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Applied audio ducking' }),
  apply_camera_shake: defineTool({ name: 'apply_camera_shake', label: 'Applying camera shake', shortLabel: 'Shake', iconCategory: 'motion', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Applied camera shake' }),
  apply_speed_ramp: defineTool({ name: 'apply_speed_ramp', label: 'Applying speed ramp', shortLabel: 'Speed', iconCategory: 'keyframe', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Applied speed ramp' }),
  apply_fade: defineTool({ name: 'apply_fade', label: 'Applying fade', shortLabel: 'Fade', iconCategory: 'keyframe', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Applied fade' }),
  reorder_layer: defineTool({ name: 'reorder_layer', label: 'Reordering layer', shortLabel: 'Layer', iconCategory: 'timeline', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Reordered layer' }),
  move_retime_overlay: defineTool({ name: 'move_retime_overlay', label: 'Moving/retiming element', shortLabel: 'Timing', iconCategory: 'timeline', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Moved/retimed element' }),
  analyze_video_content: defineTool({ name: 'analyze_video_content', label: 'Analyzing video content', shortLabel: 'Analyze', iconCategory: 'visual', receiptLabel: 'Analyzed video' }),
  add_captions: defineTool({ name: 'add_captions', label: 'Adding captions', shortLabel: 'Captions', iconCategory: 'caption', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added captions' }),
  add_fancy_captions: defineTool({ name: 'add_fancy_captions', label: 'Adding animated captions', shortLabel: 'Fancy', iconCategory: 'caption', executionType: 'generative', exposure: 'shadow-authority-filtered', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added animated captions', loadingMessages: ['Designing captions', 'Timing words', 'Finishing typography'] }),
  refresh_fancy_captions: defineTool({ name: 'refresh_fancy_captions', label: 'Refreshing animated captions', shortLabel: 'Refresh', iconCategory: 'caption', executionType: 'generative', exposure: 'shadow-authority-filtered', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Refreshed animated captions', loadingMessages: ['Re-syncing captions', 'Refreshing typography', 'Finishing up'] }),
  refresh_captions: defineTool({ name: 'refresh_captions', label: 'Refreshing captions', shortLabel: 'Refresh', iconCategory: 'caption', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Refreshed captions' }),
  resolve_clip_analysis: defineTool({ name: 'resolve_clip_analysis', label: 'Resolving analysis target', shortLabel: 'Resolve analysis', iconCategory: 'search', receiptLabel: 'Resolved analysis target' }),
  queue_resolved_clip_analysis: defineTool({ name: 'queue_resolved_clip_analysis', label: 'Queueing deep analysis', shortLabel: 'Queue analysis', iconCategory: 'sparkles', executionType: 'generative', receiptLabel: 'Queued deep analysis', loadingMessages: ['Locking the target', 'Queueing analysis', 'Preparing evidence'] }),
  get_clip_analysis_result: defineTool({ name: 'get_clip_analysis_result', label: 'Reading analysis result', shortLabel: 'Analysis result', iconCategory: 'file', receiptLabel: 'Read analysis result' }),
  dub_selected_dialogue: defineTool({ name: 'dub_selected_dialogue', label: 'Queueing translated dialogue', shortLabel: 'Dub dialogue', iconCategory: 'audio', executionType: 'generative', mutatesProject: true, mutationCompletion: 'durable', requiresProjectReload: false, riskLevel: 'medium', receiptLabel: 'Queued translated dialogue', loadingMessages: ['Locking the selected clip', 'Preparing dialogue timing', 'Queueing dubbing'], postconditions: postconditions('project-state-changed-or-durable-operation-queued', ['audio']), turnContract: { owner: 'mechanical-editor', evidenceStrategy: 'preflight', requiredEvidence: ['project-state', 'timeline-state'], producesEvidence: [] } }),
  get_dubbing_job_result: defineTool({ name: 'get_dubbing_job_result', label: 'Checking translated dialogue', shortLabel: 'Dubbing status', iconCategory: 'audio', requiresProjectReload: true, receiptLabel: 'Checked translated dialogue' }),
  analyze_clip_audio: defineTool({ name: 'analyze_clip_audio', label: 'Analyzing audio', shortLabel: 'Audio', iconCategory: 'audio', executionType: 'generative', exposure: 'shadow-authority-filtered', receiptLabel: 'Analyzed audio', loadingMessages: ['Listening to audio', 'Finding beats', 'Checking pauses'] }),
  analyze_clip_video: defineTool({ name: 'analyze_clip_video', label: 'Analyzing video', shortLabel: 'Video', iconCategory: 'visual', executionType: 'generative', exposure: 'shadow-authority-filtered', receiptLabel: 'Analyzed video', loadingMessages: ['Inspecting video', 'Reading frames', 'Checking visuals'] }),
  auto_edit_from_script: defineTool({ name: 'auto_edit_from_script', label: 'Auto editing from script', shortLabel: 'Auto edit', iconCategory: 'script', executionType: 'generative', exposure: 'shadow-authority-filtered', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Auto edited from script', loadingMessages: ['Planning edit', 'Building timeline', 'Applying cuts'], postconditions: postconditions('overlay-set-changed', ['visual', 'audio']) }),
  regenerate_scene: defineTool({ name: 'regenerate_scene', label: 'Regenerating scene', shortLabel: 'Regen', iconCategory: 'sparkles', executionType: 'generative', mutatesProject: true, mutationCompletion: 'durable', requiresProjectReload: false, riskLevel: 'high', receiptLabel: 'Regenerated scene', loadingMessages: ['Regenerating scene', 'Starting render', 'Preparing update'], postconditions: postconditions('project-state-changed-or-durable-operation-queued', ['visual']) }),
  add_transition: defineTool({ name: 'add_transition', label: 'Adding transition', shortLabel: 'Transition', iconCategory: 'transition', exposure: 'shadow-authority-filtered', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added transition' }),
  auto_motion_graphics: defineTool({ name: 'auto_motion_graphics', label: 'Adding motion graphics', shortLabel: 'Auto MG', iconCategory: 'motion', executionType: 'generative', exposure: 'shadow-authority-filtered', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added motion graphics', loadingMessages: ['Finding moments', 'Planning graphics', 'Adding motion'] }),
  extract_style: defineTool({ name: 'extract_style', label: 'Extracting edit style', shortLabel: 'Extract', iconCategory: 'style', executionType: 'generative', exposure: 'shadow-authority-filtered', receiptLabel: 'Extracted style', loadingMessages: ['Reading style', 'Finding patterns', 'Building profile'] }),
  apply_style: defineTool({ name: 'apply_style', label: 'Applying edit style', shortLabel: 'Style', iconCategory: 'style', executionType: 'generative', exposure: 'shadow-authority-filtered', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Applied style', loadingMessages: ['Planning style', 'Applying changes', 'Checking timing'], turnContract: { owner: 'semantic-editorial-planner', evidenceStrategy: 'preflight', requiredEvidence: ['project-state', 'timeline-state'], producesEvidence: [] } }),
  sync_cuts_to_beats: defineTool({ name: 'sync_cuts_to_beats', label: 'Syncing cuts to beats', shortLabel: 'Beat sync', iconCategory: 'audio', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Synced cuts to beats' }),
  set_keyframes: defineTool({ name: 'set_keyframes', label: 'Setting keyframes', shortLabel: 'Keyframes', iconCategory: 'keyframe', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Set keyframes' }),
  regenerate_bgm: defineTool({ name: 'regenerate_bgm', label: 'Regenerating music', shortLabel: 'Music', iconCategory: 'audio', executionType: 'generative', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Regenerated music', loadingMessages: ['Composing music', 'Matching mood', 'Adding track'] }),
  replace_sfx: defineTool({ name: 'replace_sfx', label: 'Replacing sound effect', shortLabel: 'Replace SFX', iconCategory: 'audio', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Replaced sound effect' }),
  add_sfx: defineTool({ name: 'add_sfx', label: 'Adding sound effect', shortLabel: 'SFX', iconCategory: 'audio', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Added sound effect' }),
  batch_edit_captions: defineTool({ name: 'batch_edit_captions', label: 'Editing all captions', shortLabel: 'Caption edit', iconCategory: 'caption', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Edited captions' }),
  list_user_assets: defineTool({ name: 'list_user_assets', label: 'Listing uploaded assets', shortLabel: 'Assets', iconCategory: 'file', receiptLabel: 'Listed uploaded assets' }),
  search_user_assets: defineTool({ name: 'search_user_assets', label: 'Searching uploaded assets', shortLabel: 'Asset search', iconCategory: 'search', executionType: 'generative', receiptLabel: 'Searched uploaded assets', loadingMessages: ['Searching your library', 'Checking asset matches', 'Ranking candidates'] }),
  inspect_user_asset: defineTool({ name: 'inspect_user_asset', label: 'Inspecting uploaded asset', shortLabel: 'Inspect asset', iconCategory: 'visual', receiptLabel: 'Inspected uploaded asset' }),
  resolve_user_asset_overlay: defineTool({ name: 'resolve_user_asset_overlay', label: 'Resolving uploaded asset', shortLabel: 'Asset edit', iconCategory: 'search', receiptLabel: 'Resolved uploaded asset' }),
  search_stock_footage: defineTool({ name: 'search_stock_footage', label: 'Searching stock footage', shortLabel: 'Stock', iconCategory: 'stock', executionType: 'generative', receiptLabel: 'Searched stock footage', loadingMessages: ['Searching footage', 'Checking matches', 'Collecting results'] }),
  use_matching_footage: defineTool({ name: 'use_matching_footage', label: 'Using matching footage', shortLabel: 'Use footage', iconCategory: 'stock', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Used matching footage' }),

  apply_filter: defineTool({ name: 'apply_filter', label: 'Applying filter', shortLabel: 'Filter', iconCategory: 'style', mutatesProject: true, riskLevel: 'medium', receiptLabel: 'Applied filter' }),
  reframe_project: defineTool({ name: 'reframe_project', label: 'Reframing project', shortLabel: 'Reframe', iconCategory: 'visual', mutatesProject: true, riskLevel: 'high', receiptLabel: 'Reframed project', loadingMessages: ['Reading subject positions', 'Reframing the timeline', 'Checking focal tracks'], postconditions: postconditions('project-state-changed', ['visual']), turnContract: { owner: 'mechanical-editor', evidenceStrategy: 'preflight', requiredEvidence: ['project-state', 'timeline-state'], producesEvidence: [] } }),
} satisfies Record<ChatToolName, ChatToolMetadata>;

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

export function getChatToolCompletionLabel(toolName: string): string {
  const metadata = getChatToolMetadata(toolName);
  if (metadata?.mutationCompletion === 'durable') return 'queued';
  return metadata?.mutatesProject ? 'done' : 'checked';
}

export function formatChatToolReceipt(toolName: string): string {
  return getChatToolMetadata(toolName)?.receiptLabel ?? getChatToolLabel(toolName);
}
