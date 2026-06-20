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
    currentStatus: 'expected-failure',
    currentEvidence: 'No transcript moment search tool exists; get_video_transcription returns broad transcript text, not ranked frame candidates.',
    successCriteria: ['finds the phrase', 'returns a confident frame range', 'cuts only after the phrase', 'asks once if multiple matches exist'],
    targetPhases: [1, 4, 8, 10],
    requiredContext: ['word timestamps', 'phrase match candidates', 'fps'],
    requiredTools: ['find_transcript_moment', 'cut_section'],
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
    currentStatus: 'expected-failure',
    currentEvidence: 'User media semantic search exists in services/UI, but chat has no list_user_assets/search_user_assets tool.',
    successCriteria: ['finds logo-like image candidates', 'returns confidence', 'places the selected or highest-confidence asset'],
    targetPhases: [1, 3, 8, 10],
    requiredContext: ['media library inventory', 'asset search results', 'intro frame range'],
    requiredTools: ['search_user_assets', 'add_overlay'],
  },
  {
    id: 'keyframes-zoom-selected',
    category: 'keyframes',
    prompt: 'Slowly zoom in on the selected clip.',
    currentStatus: 'partial-now',
    currentEvidence: 'set_keyframes supports scale, but current chat request only sends selectedOverlayId, not full playhead/range context.',
    successCriteria: ['targets the selected overlay', 'adds scale keyframes', 'does not retime the clip'],
    targetPhases: [1, 2, 10],
    requiredContext: ['selected overlay', 'overlay duration'],
    requiredTools: ['set_keyframes'],
  },
  {
    id: 'visual-reference-logo-appears',
    category: 'visual-reference',
    prompt: 'When the logo appears on screen, add a small highlight around it.',
    currentStatus: 'expected-failure',
    currentEvidence: 'No visual moment retrieval over object/OCR/frame segment facts is exposed to chat.',
    successCriteria: ['finds logo appearance candidates', 'returns frame range and evidence', 'places highlight only if confidence is high'],
    targetPhases: [1, 5, 8, 10],
    requiredContext: ['visual segment facts', 'object/OCR labels', 'frame candidates'],
    requiredTools: ['find_visual_moment', 'add_overlay'],
  },
  {
    id: 'sound-reference-beat-drop',
    category: 'sound-reference',
    prompt: 'Add an impact exactly on the first beat drop.',
    currentStatus: 'expected-failure',
    currentEvidence: 'Beat analysis exists elsewhere, but chat has no first-class sound/beat moment resolver.',
    successCriteria: ['finds beat-drop candidate', 'returns sync frame', 'places impact SFX at that frame'],
    targetPhases: [1, 6, 8, 10],
    requiredContext: ['beat map', 'sound overlays', 'sync frame candidates'],
    requiredTools: ['find_audio_moment', 'add_sfx'],
  },
  {
    id: 'undo-ai-edit',
    category: 'undo',
    prompt: 'Undo that AI edit.',
    currentStatus: 'expected-failure',
    currentEvidence: 'Editor undo/checkpoints exist, but chat prompt says undo is unsupported and no AI checkpoint restore tool is exposed.',
    successCriteria: ['restores the pre-edit checkpoint', 'shows which edit was reverted', 'does not manually guess inverse edits'],
    targetPhases: [7, 8, 10],
    requiredContext: ['AI edit transaction id', 'before checkpoint id'],
    requiredTools: ['restore_ai_edit_checkpoint'],
  },
  {
    id: 'operation-audio-ducking',
    category: 'operation-gap',
    prompt: 'Lower the music whenever I speak.',
    currentStatus: 'expected-failure',
    currentEvidence: 'Audio ducking is available in EDL/director paths, but no clean chat tool exposes it.',
    successCriteria: ['detects voiceover/dialogue ranges', 'applies ducking to BGM only', 'leaves SFX transients intact'],
    targetPhases: [1, 6, 9, 10],
    requiredContext: ['voice ranges', 'BGM overlays', 'audio policy'],
    requiredTools: ['apply_audio_ducking'],
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
