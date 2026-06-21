export const CHAT_EDIT_PHASE0_BASELINE_VERSION = 'chat-edit-phase0-baseline-v1' as const;

export type ChatEditBaselineStatus = 'supported-now' | 'partial-now' | 'expected-failure';

export type ChatEditBaselineCategory =
  | 'overlay-crud'
  | 'cut'
  | 'captions'
  | 'transition'
  | 'sfx'
  | 'asset-retrieval'
  | 'keyframes'
  | 'undo'
  | 'transcript-reference'
  | 'visual-reference'
  | 'sound-reference'
  | 'operation-gap';

export interface ChatEditBaselineCase {
  id: string;
  category: ChatEditBaselineCategory;
  prompt: string;
  currentStatus: ChatEditBaselineStatus;
  currentEvidence: string;
  successCriteria: string[];
  targetPhases: number[];
  requiredContext: string[];
  requiredTools: string[];
}

export interface ChatEditBaselineSummary {
  version: typeof CHAT_EDIT_PHASE0_BASELINE_VERSION;
  total: number;
  byStatus: Record<ChatEditBaselineStatus, number>;
  expectedFailureIds: string[];
  coveredCategories: ChatEditBaselineCategory[];
  targetPhases: number[];
}

export const CHAT_EDIT_PHASE0_BASELINE_CASES: readonly ChatEditBaselineCase[] = [
  {
    id: 'overlay-text-explicit',
    category: 'overlay-crud',
    prompt: 'Add a bold white title that says "Launch day" at the top for the first 3 seconds.',
    currentStatus: 'supported-now',
    currentEvidence: 'add_overlay supports text with explicit start, duration, position, and text styles.',
    successCriteria: ['adds one text overlay', 'uses the requested text', 'starts at frame 0', 'duration is about 90 frames'],
    targetPhases: [0, 2, 10],
    requiredContext: ['project canvas', 'fps'],
    requiredTools: ['add_overlay'],
  },
  {
    id: 'overlay-image-asset-id',
    category: 'overlay-crud',
    prompt: 'Add image asset a_logo123 in the bottom right from 2s to 6s.',
    currentStatus: 'supported-now',
    currentEvidence: 'add_overlay supports image overlays when the user supplies an assetId and explicit timing.',
    successCriteria: ['adds one image overlay', 'uses assetId a_logo123', 'places near bottom right', 'uses frames for 2s-6s'],
    targetPhases: [0, 2, 10],
    requiredContext: ['project canvas', 'fps'],
    requiredTools: ['add_overlay'],
  },
  {
    id: 'overlay-video-asset-id',
    category: 'overlay-crud',
    prompt: 'Place video asset a_broll456 over the main video from 10s to 14s.',
    currentStatus: 'supported-now',
    currentEvidence: 'add_overlay supports video overlays when assetId and timing are explicit.',
    successCriteria: ['adds one video overlay', 'uses assetId a_broll456', 'sets correct start and duration'],
    targetPhases: [0, 2, 10],
    requiredContext: ['project canvas', 'fps'],
    requiredTools: ['add_overlay'],
  },
  {
    id: 'overlay-sound-asset-id',
    category: 'overlay-crud',
    prompt: 'Add sound asset a_hit789 at 5 seconds and keep it subtle.',
    currentStatus: 'supported-now',
    currentEvidence: 'add_overlay supports sound overlays when assetId and timing are explicit.',
    successCriteria: ['adds one sound overlay', 'uses assetId a_hit789', 'sets low volume', 'starts near frame 150'],
    targetPhases: [0, 2, 10],
    requiredContext: ['fps'],
    requiredTools: ['add_overlay'],
  },
  {
    id: 'overlay-sticker-generated',
    category: 'overlay-crud',
    prompt: 'Add a small animated sparkle sticker near the word "win" for two seconds.',
    currentStatus: 'partial-now',
    currentEvidence: 'generate_html_sticker exists, but the word reference needs transcript timing to place it reliably.',
    successCriteria: ['creates one sticker', 'does not cover the speaker face', 'syncs to the referenced word when retrieval exists'],
    targetPhases: [1, 2, 4, 8, 10],
    requiredContext: ['project canvas', 'transcript word range'],
    requiredTools: ['generate_html_sticker', 'find_transcript_moment'],
  },
  {
    id: 'cut-explicit-timecode',
    category: 'cut',
    prompt: 'Cut out 5s to 8s and close the gap.',
    currentStatus: 'supported-now',
    currentEvidence: 'cut_section supports explicit frame ranges; prompt can convert seconds to frames using fps.',
    successCriteria: ['calls cut_section once', 'removes frames 150-240 at 30fps', 'shifts later overlays left'],
    targetPhases: [0, 2, 10],
    requiredContext: ['fps', 'project duration'],
    requiredTools: ['cut_section'],
  },
  {
    id: 'cut-transcript-phrase',
    category: 'transcript-reference',
    prompt: 'Cut the awkward pause right after I say "pricing is simple".',
    currentStatus: 'supported-now',
    currentEvidence: 'resolve_transcript_edit bridges exact transcript phrases into cut_section-ready ranges, supports cut_after_phrase, blocks ambiguous matches, and refuses too-short or missing-boundary gaps.',
    successCriteria: ['finds the phrase', 'returns a confident frame range', 'cuts only after the phrase', 'asks once if multiple matches exist'],
    targetPhases: [1, 4, 8, 10],
    requiredContext: ['word timestamps', 'phrase match candidates', 'fps'],
    requiredTools: ['find_transcript_moment', 'resolve_transcript_edit', 'cut_section'],
  },
  {
    id: 'captions-full-video',
    category: 'captions',
    prompt: 'Add clean subtitles to the whole video.',
    currentStatus: 'supported-now',
    currentEvidence: 'add_captions exists, but multi-clip selection quality depends on project context.',
    successCriteria: ['adds caption overlays for spoken video clips', 'does not duplicate existing captions unless overwrite is needed'],
    targetPhases: [0, 1, 2, 10],
    requiredContext: ['video overlay inventory', 'caption presence'],
    requiredTools: ['add_captions', 'get_timeline_view'],
  },
  {
    id: 'transition-all-clips',
    category: 'transition',
    prompt: 'Add smooth transitions between all clips.',
    currentStatus: 'supported-now',
    currentEvidence: 'add_transition supports applyToAll for adjacent video clips.',
    successCriteria: ['applies transitions to adjacent clip boundaries', 'does not overwrite unrelated overlays'],
    targetPhases: [0, 2, 10],
    requiredContext: ['video overlay order'],
    requiredTools: ['add_transition'],
  },
  {
    id: 'sfx-explicit-frame',
    category: 'sfx',
    prompt: 'Add a soft whoosh at 7 seconds.',
    currentStatus: 'supported-now',
    currentEvidence: 'add_sfx supports explicit query and placement when timing is supplied.',
    successCriteria: ['places one SFX overlay near frame 210', 'uses a whoosh query', 'keeps volume below dialogue dominance'],
    targetPhases: [0, 2, 10],
    requiredContext: ['fps', 'sound overlay map'],
    requiredTools: ['add_sfx'],
  },
  {
    id: 'asset-logo-by-description',
    category: 'asset-retrieval',
    prompt: 'Use my logo in the corner during the intro.',
    currentStatus: 'partial-now',
    currentEvidence: 'list_user_assets/search_user_assets/inspect_user_asset now exist in chat; still needs real-project proof for asset choice quality.',
    successCriteria: ['finds logo-like image candidates', 'returns confidence', 'places the selected or highest-confidence asset'],
    targetPhases: [1, 3, 8, 10],
    requiredContext: ['media library inventory', 'asset search results', 'intro frame range'],
    requiredTools: ['search_user_assets', 'add_overlay'],
  },
  {
    id: 'keyframes-zoom-selected',
    category: 'keyframes',
    prompt: 'Slowly zoom in on the selected clip.',
    currentStatus: 'supported-now',
    currentEvidence: 'resolve_keyframe_edit resolves selectedOverlayId or an explicit target overlay into local-frame set_keyframes scale params, clamps scale delta, and refuses captions/sound/too-short clips or existing scale motion unless replacement is explicit.',
    successCriteria: ['targets the selected overlay', 'adds scale keyframes', 'does not retime the clip'],
    targetPhases: [1, 2, 10],
    requiredContext: ['selected overlay', 'overlay duration'],
    requiredTools: ['resolve_keyframe_edit', 'set_keyframes'],
  },
  {
    id: 'visual-reference-logo-appears',
    category: 'visual-reference',
    prompt: 'When the logo appears on screen, add a small highlight around it.',
    currentStatus: 'supported-now',
    currentEvidence: 'resolve_visual_edit now bridges high-confidence visual facts into add_overlay-ready highlight geometry when a bounding box exists, and refuses placement with visual_inspect_frame when coordinates are missing.',
    successCriteria: ['finds logo appearance candidates', 'returns frame range and evidence', 'places highlight only if confidence is high'],
    targetPhases: [1, 5, 8, 10],
    requiredContext: ['visual segment facts', 'object/OCR labels', 'frame candidates', 'subject bounding boxes'],
    requiredTools: ['find_visual_moment', 'resolve_visual_edit', 'visual_inspect_frame', 'add_overlay'],
  },
  {
    id: 'sound-reference-beat-drop',
    category: 'sound-reference',
    prompt: 'Add an impact exactly on the first beat drop.',
    currentStatus: 'supported-now',
    currentEvidence: 'resolve_audio_edit bridges high-confidence beat/drop/silence candidates into add_sfx/cut_section/sync_cuts_to_beats-ready timing, supports ordinal first/last references, and refuses ambiguous or unsupported audio edits.',
    successCriteria: ['finds beat-drop candidate', 'returns sync frame', 'places impact SFX at that frame'],
    targetPhases: [1, 6, 8, 10],
    requiredContext: ['beat map', 'sound overlays', 'sync frame candidates'],
    requiredTools: ['find_audio_moment', 'resolve_audio_edit', 'add_sfx'],
  },
  {
    id: 'undo-ai-edit',
    category: 'undo',
    prompt: 'Undo that AI edit.',
    currentStatus: 'partial-now',
    currentEvidence: 'restore_ai_edit_checkpoint is now exposed to chat; still needs full transaction UX proof around before/after checkpoint selection.',
    successCriteria: ['restores the pre-edit checkpoint', 'shows which edit was reverted', 'does not manually guess inverse edits'],
    targetPhases: [7, 8, 10],
    requiredContext: ['AI edit transaction id', 'before checkpoint id'],
    requiredTools: ['restore_ai_edit_checkpoint'],
  },
  {
    id: 'operation-audio-ducking',
    category: 'operation-gap',
    prompt: 'Lower the music whenever I speak.',
    currentStatus: 'supported-now',
    currentEvidence: 'apply_audio_ducking is exposed to chat, uses existing duckingConfig/audio standards, skips SFX and voice tracks, and has focused BGM-only tests.',
    successCriteria: ['detects voiceover/dialogue ranges', 'applies ducking to BGM only', 'leaves SFX transients intact'],
    targetPhases: [1, 6, 9, 10],
    requiredContext: ['voice ranges', 'BGM overlays', 'audio policy'],
    requiredTools: ['apply_audio_ducking'],
  },
  {
    id: 'operation-camera-shake',
    category: 'operation-gap',
    prompt: 'Add a subtle shake right on the impact beat.',
    currentStatus: 'supported-now',
    currentEvidence: 'apply_camera_shake is exposed to chat, writes bounded x/y shake keyframes on the active video overlay, and refuses unresolved or conflicting targets.',
    successCriteria: ['finds target beat/frame', 'applies shake to the intended visual overlay', 'keeps intensity within profile budget'],
    targetPhases: [2, 6, 9, 10],
    requiredContext: ['target frame or audio/visual moment', 'video overlay inventory', 'shake budget'],
    requiredTools: ['apply_camera_shake'],
  },
  {
    id: 'operation-speed-ramp',
    category: 'operation-gap',
    prompt: 'Slow this moment down for emphasis and then return to normal speed.',
    currentStatus: 'supported-now',
    currentEvidence: 'apply_speed_ramp is exposed to chat, resolves target ranges, writes bounded speedCurve/keyframe tracks, and refuses caption/dialogue overlap or existing speed curves unless explicitly allowed.',
    successCriteria: ['resolves the target clip/range', 'writes a bounded speed curve', 'does not desync captions or audio unexpectedly'],
    targetPhases: [2, 6, 9, 10],
    requiredContext: ['selected or inferred clip', 'target frame range', 'caption/audio sync constraints'],
    requiredTools: ['apply_speed_ramp'],
  },
  {
    id: 'operation-fade',
    category: 'operation-gap',
    prompt: 'Fade this overlay out smoothly at the end.',
    currentStatus: 'supported-now',
    currentEvidence: 'apply_fade is exposed to chat, resolves overlay/range semantics, writes bounded opacity keyframes, and refuses captions, brand elements, sound overlays, or existing opacity motion unless explicitly allowed.',
    successCriteria: ['targets the intended overlay', 'writes opacity keyframes with sane easing', 'does not hide captions or required brand elements accidentally'],
    targetPhases: [2, 6, 9, 10],
    requiredContext: ['selected or inferred overlay', 'fade direction', 'duration/easing policy'],
    requiredTools: ['apply_fade'],
  },
  {
    id: 'operation-filter-owner',
    category: 'operation-gap',
    prompt: 'Make this clip warmer.',
    currentStatus: 'supported-now',
    currentEvidence: 'apply_filter is exposed to chat as a manual selected-overlay override that writes overlay.styles.filter only, refuses unsafe/protected targets, and does not revive disabled EDL filter-change or broad profile grading.',
    successCriteria: ['routes through the approved color owner or manual override path', 'does not revive disabled filter-change plumbing', 'records the override clearly'],
    targetPhases: [2, 6, 9, 10],
    requiredContext: ['selected or inferred visual overlay', 'manual filter intent or safe CSS filter', 'color ownership policy'],
    requiredTools: ['apply_filter'],
  },
  {
    id: 'operation-layer-reorder',
    category: 'operation-gap',
    prompt: 'Move the logo behind the title but keep both visible.',
    currentStatus: 'supported-now',
    currentEvidence: 'reorder_layer is exposed to chat, resolves target/reference overlays, writes only row changes, and refuses sound, caption, transition, video, non-overlap, or row-collision cases unless safe/explicit.',
    successCriteria: ['identifies both overlays', 'changes stacking without breaking timing', 'preserves visibility and avoids accidental track moves'],
    targetPhases: [2, 6, 9, 10],
    requiredContext: ['overlay inventory', 'stacking/row model', 'visibility constraints'],
    requiredTools: ['reorder_layer'],
  },
  {
    id: 'operation-move-retime',
    category: 'operation-gap',
    prompt: 'Move this sticker two seconds later and make it last one second longer.',
    currentStatus: 'supported-now',
    currentEvidence: 'move_retime_overlay is exposed to chat, resolves target overlays, writes only existing timing fields, and refuses captions, transitions, source-start trims, project overflow, or same-row collisions unless safe/explicit.',
    successCriteria: ['targets the intended overlay', 'changes timing without changing renderer form', 'does not desync captions or media source offsets silently'],
    targetPhases: [2, 6, 9, 10],
    requiredContext: ['selected or inferred overlay', 'timeline range', 'collision and sync constraints'],
    requiredTools: ['move_retime_overlay'],
  },
] as const;

export function getChatEditPhase0BaselineCases(): readonly ChatEditBaselineCase[] {
  return CHAT_EDIT_PHASE0_BASELINE_CASES;
}

export function findChatEditPhase0BaselineCase(id: string): ChatEditBaselineCase | undefined {
  return CHAT_EDIT_PHASE0_BASELINE_CASES.find((testCase) => testCase.id === id);
}

export function summarizeChatEditPhase0Baseline(
  cases: readonly ChatEditBaselineCase[] = CHAT_EDIT_PHASE0_BASELINE_CASES,
): ChatEditBaselineSummary {
  const byStatus: Record<ChatEditBaselineStatus, number> = {
    'supported-now': 0,
    'partial-now': 0,
    'expected-failure': 0,
  };
  const categorySet = new Set<ChatEditBaselineCategory>();
  const targetPhaseSet = new Set<number>();
  const expectedFailureIds: string[] = [];

  for (const testCase of cases) {
    byStatus[testCase.currentStatus] += 1;
    categorySet.add(testCase.category);
    testCase.targetPhases.forEach((phase) => targetPhaseSet.add(phase));
    if (testCase.currentStatus === 'expected-failure') {
      expectedFailureIds.push(testCase.id);
    }
  }

  return {
    version: CHAT_EDIT_PHASE0_BASELINE_VERSION,
    total: cases.length,
    byStatus,
    expectedFailureIds,
    coveredCategories: [...categorySet].sort(),
    targetPhases: [...targetPhaseSet].sort((a, b) => a - b),
  };
}
