import { createHash } from 'node:crypto';

import { requiredToolSequenceForChatCapability } from '@/lib/editron/agent/chat-command-authority';
import {
  classifyChatToolExecutionOutcome,
} from '@/lib/editron/agent/chat-tool-execution-policy';
import { getChatToolMetadata } from '@/lib/editron/agent/chat-tool-registry';

export const CHAT_EDIT_BATTLE_HARNESS_VERSION = 'editron-chat-battle-v1' as const;

export type ChatBattleRuntimeMode = 'deterministic-fixture' | 'live-provider';
export type ChatBattleExecutionLane = 'live' | 'deterministic-contract';
export type ChatBattleMutationExpectation = 'required' | 'forbidden' | 'conditional';
export type ChatBattleMutationTerminalOutcome =
  | 'mutated'
  | 'no-op'
  | 'needs-input'
  | 'declined'
  | 'failed';
export type ChatBattleStatus = 'pass' | 'warn' | 'fail';
export type ChatBattleProjectMode = 'auto' | 'assist';
export type ChatBattleResolverOutcome =
  | 'ambiguous'
  | 'low-confidence'
  | 'no-match'
  | 'no-placement'
  | 'unsupported';
export type ChatBattleFixtureRequirement =
  | 'ai-edit-checkpoint'
  | 'prior-idempotency-record'
  | 'durable-reference-asset'
  | 'completed-clip-analysis-job'
  | 'timeline-gap'
  | 'selected-image-overlap';

export interface ChatBattleArgumentProhibition {
  tool: string;
  path: string;
  equals: unknown;
  reason: string;
}

export interface ChatBattleScenario {
  id: string;
  label: string;
  prompt: string;
  projectMode: ChatBattleProjectMode;
  executionLane: ChatBattleExecutionLane;
  expectOperationReplay: boolean;
  mutationExpectation: ChatBattleMutationExpectation;
  minimumSuccessfulMutations: number;
  allowPartialMutationFailure: boolean;
  requiredToolSequence: ReadonlyArray<string | readonly string[]>;
  forbiddenTools: readonly string[];
  forbiddenArguments: readonly ChatBattleArgumentProhibition[];
  requiredCreatedOverlayTypes: ReadonlyArray<string | readonly string[]>;
  requireEvidenceBeforeMutation: boolean;
  requireUiReload: boolean;
  requireRenderedEvidence: boolean;
  fixtureRequirements: readonly ChatBattleFixtureRequirement[];
  acceptedResolverOutcomes: readonly ChatBattleResolverOutcome[];
}

export interface ChatBattleToolEvent {
  id: string;
  name: string;
  args: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  output?: unknown;
}

export interface ChatBattleInvocationEvidence {
  agentRunId: string;
  mode: ChatBattleRuntimeMode;
  prompt: string;
  responseText: string;
  toolEvents: ChatBattleToolEvent[];
  replayProtection?: ChatBattleOperationReplayEvidence;
  durableOperations?: ChatBattleDurableOperationEvidence[];
  refusalReason?: string;
  error?: string;
}

export interface ChatBattleOperationReplayEvidence {
  code: 'CHAT_EDIT_OPERATION_REPLAY';
  operationId: string;
  operationStatus?: string;
  beforeCheckpointId?: string;
  afterCheckpointId?: string;
}

export interface ChatBattleDurableOperationEvidence {
  owner: 'editorial-intent' | 'reference-style' | 'dubbing' | 'scene-regeneration';
  jobId: string;
  status:
    | 'completed'
    | 'completed_unverified'
    | 'declined'
    | 'failed'
    | 'stale'
    | 'dispatch_failed'
    | 'rolled_back'
    | 'timeout'
    | 'missing';
  materialChange: boolean;
  polls: number;
  reason?: string;
  error?: string;
  lifecycle?: string;
  postconditionStatus?: string;
  pendingChildJobIds?: string[];
  generatedChildJobIds?: string[];
  childOperations?: ChatBattleDurableChildOperationEvidence[];
  evidenceError?: string;
}

export interface ChatBattleDurableChildOperationEvidence {
  owner: 'mg-render';
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'missing' | 'unknown';
  outcome: 'generated' | 'declined' | 'fallback' | 'failed' | 'unknown';
  momentId?: string;
  candidateId?: string;
  factKind?: string;
  sequenceId?: string;
  reason?: string;
  error?: string;
  providerFailure?: {
    provider?: string;
    operation?: string;
    code?: string;
    disposition?: string;
    statusCode?: number;
  };
}

export interface ChatBattleOverlaySnapshot {
  id: string;
  type: string;
  from: number;
  durationInFrames: number;
  row: number;
  assetId: string | null;
  digest: string;
}

export interface ChatBattleProjectSnapshot {
  source: 'mongo-before' | 'mongo-after' | 'ui-reload';
  projectId: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  overlayCount: number;
  overlays: ChatBattleOverlaySnapshot[];
  digest: string;
  capturedAt: string;
}

export interface ChatBattleRenderEvidence {
  status: 'pass' | 'warn' | 'fail' | 'missing';
  capturedAt?: string;
  artifactRefs: string[];
  issues: Array<Record<string, unknown>>;
  jobLifecycle?: Record<string, unknown>;
  reason?: string;
}

export interface ChatBattleFixturePreconditionResult {
  ok: boolean;
  missing: ChatBattleFixtureRequirement[];
  satisfied: ChatBattleFixtureRequirement[];
}

export interface ChatBattleCheck {
  id: string;
  status: ChatBattleStatus;
  blocking: boolean;
  summary: string;
  evidence: Record<string, unknown>;
}

export interface ChatBattleJourneyReport {
  version: typeof CHAT_EDIT_BATTLE_HARNESS_VERSION;
  journeyId: string;
  scenarioId: string;
  projectId: string;
  startedAt: string;
  completedAt: string;
  verdict: ChatBattleStatus;
  invocation: ChatBattleInvocationEvidence;
  mongoBefore: ChatBattleProjectSnapshot;
  mongoAfter: ChatBattleProjectSnapshot;
  uiReload: ChatBattleProjectSnapshot | null;
  uiReloadError?: string;
  renderEvidence: ChatBattleRenderEvidence;
  checks: ChatBattleCheck[];
}

export interface ChatBattleRuntime {
  loadMongoProject(projectId: string, phase: 'before' | 'after'): Promise<unknown>;
  invokeAgent(input: {
    scenario: ChatBattleScenario;
    projectId: string;
    userId?: string;
    selectedOverlayId?: string;
    clientContext?: Record<string, unknown>;
  }): Promise<ChatBattleInvocationEvidence>;
  reloadUiProject(projectId: string): Promise<unknown>;
  captureRenderEvidence(input: {
    projectId: string;
    startedAt: string;
    mongoAfter: unknown;
  }): Promise<ChatBattleRenderEvidence>;
}

export interface RunChatBattleJourneyInput {
  scenarioId: string;
  projectId: string;
  userId?: string;
  selectedOverlayId?: string;
  clientContext?: Record<string, unknown>;
  journeyId?: string;
  now?: () => Date;
}

export interface ChatBattleSuiteReport {
  version: typeof CHAT_EDIT_BATTLE_HARNESS_VERSION;
  verdict: ChatBattleStatus;
  requiredScenarioCount: number;
  executedScenarioCount: number;
  passedScenarioCount: number;
  missingScenarioIds: string[];
  failedScenarioIds: string[];
}

const SERVER_CANONICAL_PROJECT_STATE = 'server-canonical-project-state' as const;
const READ_PROJECT = ['read_project_file', 'get_timeline_view'] as const;

function scenario(
  id: string,
  label: string,
  prompt: string,
  options: Partial<Omit<ChatBattleScenario, 'id' | 'label' | 'prompt'>> = {},
): ChatBattleScenario {
  return {
    id,
    label,
    prompt,
    projectMode: options.projectMode ?? 'auto',
    executionLane: options.executionLane ?? 'live',
    expectOperationReplay: options.expectOperationReplay ?? false,
    mutationExpectation: options.mutationExpectation ?? 'required',
    minimumSuccessfulMutations: options.minimumSuccessfulMutations ?? 1,
    allowPartialMutationFailure: options.allowPartialMutationFailure ?? false,
    requiredToolSequence: options.requiredToolSequence ?? [],
    forbiddenTools: options.forbiddenTools ?? [],
    forbiddenArguments: options.forbiddenArguments ?? [],
    requiredCreatedOverlayTypes: options.requiredCreatedOverlayTypes ?? [],
    requireEvidenceBeforeMutation: options.requireEvidenceBeforeMutation ?? true,
    requireUiReload: options.requireUiReload ?? true,
    requireRenderedEvidence: options.requireRenderedEvidence ?? true,
    fixtureRequirements: options.fixtureRequirements ?? [],
    acceptedResolverOutcomes: options.acceptedResolverOutcomes ?? [],
  };
}

export const CHAT_EDIT_BATTLE_SCENARIOS: readonly ChatBattleScenario[] = [
  scenario('explicit-text', 'Explicit text at explicit time', 'Add a bold white title saying Launch day at the top for the first 3 seconds.', { requiredToolSequence: [READ_PROJECT, 'add_overlay'] }),
  scenario('explicit-asset', 'Explicit asset at explicit time', 'Add image asset a_logo123 in the bottom right from 2s to 6s.', { requiredToolSequence: [READ_PROJECT, 'add_overlay'] }),
  scenario('selected-overlay-edit', 'Edit selected overlay', 'Make the selected title larger and move it slightly upward.', { requiredToolSequence: [READ_PROJECT, 'update_overlay'] }),
  scenario('explicit-cut', 'Explicit cut range', 'Cut out 5s to 8s and close the gap.', { requiredToolSequence: [READ_PROJECT, 'cut_section'] }),
  scenario('spoken-phrase-english', 'English phrase without timestamp', 'Remove the words pricing is simple.', { requiredToolSequence: ['resolve_transcript_edit', 'cut_section'] }),
  scenario('spoken-phrase-devanagari', 'Devanagari phrase without timestamp', '\u091c\u0939\u093e\u0901 \u092e\u0948\u0902 \u0915\u0939\u0924\u093e \u0939\u0942\u0901 \u0915\u0940\u092e\u0924 \u0906\u0938\u093e\u0928 \u0939\u0948 \u0935\u0939 \u0939\u093f\u0938\u094d\u0938\u093e \u0939\u091f\u093e \u0926\u094b\u0964', { requiredToolSequence: ['resolve_transcript_edit', 'cut_section'] }),
  scenario('untimed-transcript-cache', 'Untimed transcript cache', 'Remove the phrase pricing is simple without asking me for a timestamp.', { requiredToolSequence: ['resolve_transcript_edit', 'cut_section'] }),
  scenario('semantic-transcript-topic', 'Semantic transcript topic', 'Remove the part where I explain why pricing matters.', {
    mutationExpectation: 'forbidden',
    minimumSuccessfulMutations: 0,
    requiredToolSequence: ['resolve_transcript_edit'],
    requireEvidenceBeforeMutation: false,
    requireUiReload: false,
    requireRenderedEvidence: false,
  }),
  scenario('roman-hinglish-phrase', 'Roman Hinglish phrase', 'Jahan main bolta hoon pricing simple hai woh part hata do.', { requiredToolSequence: ['resolve_transcript_edit', 'cut_section'] }),
  scenario('visual-object-exact', 'Exact visual object reference', 'When the embroidery frame appears, add a small highlight around it.', { requiredToolSequence: ['resolve_visual_edit', 'add_overlay'] }),
  scenario('visual-object-paraphrase', 'Visual paraphrase', 'Highlight the shot where the garment sketch is being measured.', {
    mutationExpectation: 'conditional',
    minimumSuccessfulMutations: 0,
    requiredToolSequence: ['resolve_visual_edit', 'add_overlay'],
    requireUiReload: false,
    requireRenderedEvidence: false,
    acceptedResolverOutcomes: ['ambiguous'],
  }),
  scenario('inspect-rendered-frame', 'Inspect actual rendered frame', 'Look at the frame under my playhead and tell me what blocks the subject.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['visual_inspect_frame'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('multiasset-script-intake', 'Multi-asset script with editorial constraints', 'Rebuild this edit from all relevant uploaded footage. Script: Open on the models wearing black and gold garments. Then show the garment-making process: fabric assembly, pattern sketching, and embroidery. End on the strongest finished-garment reveal. Preserve factual order, skip unrelated footage, keep natural audio understandable, and do not add decorative motion graphics.', { requiredToolSequence: [READ_PROJECT, 'apply_editorial_intent'], forbiddenTools: ['auto_edit_from_script'], requireRenderedEvidence: false }),
  scenario('multiasset-script-chat', 'Multi-asset script through chat', 'Use all relevant uploaded footage and reorder it around this script. Script: Begin with the black-and-gold fashion reveal. Move through hands assembling fabric, drawing the design, and embroidering the garment. Finish with the clearest model or finished-garment shot. Preserve factual order and skip footage that does not support the script.', { requiredToolSequence: [READ_PROJECT, 'apply_editorial_intent'], forbiddenTools: ['auto_edit_from_script'], requireRenderedEvidence: false }),
  scenario('vague-enhance', 'Vague enhancement request', 'Enhance this video so it feels professionally edited.', { requiredToolSequence: [READ_PROJECT, 'apply_editorial_intent'], minimumSuccessfulMutations: 1, forbiddenTools: ['add_transition', 'add_motion_graphic', 'auto_motion_graphics'] }),
  scenario('vague-transitions', 'Content-owned transitions', 'Add transitions where they genuinely help the edit.', { mutationExpectation: 'conditional', minimumSuccessfulMutations: 0, requiredToolSequence: [READ_PROJECT, 'apply_editorial_intent'], forbiddenTools: ['add_transition'] }),
  scenario('vague-motion-graphics', 'Signal-owned motion graphics', 'Add motion graphics only where the idea is visually explainable.', { mutationExpectation: 'conditional', minimumSuccessfulMutations: 0, requiredToolSequence: [READ_PROJECT, 'apply_editorial_intent'], forbiddenTools: ['auto_motion_graphics', 'add_motion_graphic'] }),
  scenario('motivated-zoom', 'Motivated zoom', 'Use a subtle zoom on the strongest spoken emphasis, if the shot supports it.', { mutationExpectation: 'conditional', minimumSuccessfulMutations: 0, requiredToolSequence: requiredToolSequenceForChatCapability('localized-camera-motion', 'set_keyframes'), forbiddenTools: ['apply_editorial_intent'] }),
  scenario('vague-sfx-beat', 'SFX on a grounded beat', 'Add a subtle impact on the strongest visual or spoken beat.', { mutationExpectation: 'conditional', minimumSuccessfulMutations: 0, requiredToolSequence: requiredToolSequenceForChatCapability('localized-sfx', 'add_sfx'), forbiddenTools: ['apply_editorial_intent'], acceptedResolverOutcomes: ['ambiguous'] }),
  scenario('clean-captions', 'Clean readable captions', 'Add clean readable captions that fit this video.', { requiredToolSequence: requiredToolSequenceForChatCapability('caption-track', 'add_captions'), forbiddenTools: ['apply_editorial_intent'] }),
  scenario('create-html-scene', 'Create process graphic', 'Create a full-screen process diagram for this explanation.', { requiredToolSequence: [READ_PROJECT, 'apply_editorial_intent'], forbiddenTools: ['generate_html_scene', 'generate_html_sticker', 'add_overlay'], requiredCreatedOverlayTypes: [['motion-graphic', 'mg-sequence']] }),
  scenario('edit-html-scene', 'Edit HTML scene in place', 'Edit the selected HTML scene itself: change the heading embedded inside that HTML scene to How it works. Do not edit the separate text overlay.', { requiredToolSequence: [READ_PROJECT, 'edit_html_scene'] }),
  scenario('bgm-explicit', 'Explicit BGM intent', 'Add restrained cinematic background music with no vocals and keep speech clear.', { projectMode: 'assist', requiredToolSequence: [READ_PROJECT, 'regenerate_bgm'], forbiddenTools: ['apply_editorial_intent'] }),
  scenario('bgm-vague', 'Vague BGM intent', 'Add suitable background music for this edit.', { projectMode: 'assist', requiredToolSequence: [READ_PROJECT, 'regenerate_bgm'], forbiddenTools: ['apply_editorial_intent'] }),
  scenario('bgm-provider-failure', 'Safe BGM replacement failure', 'Replace the current music with something calmer.', {
    projectMode: 'assist',
    executionLane: 'deterministic-contract',
    mutationExpectation: 'conditional',
    requiredToolSequence: [READ_PROJECT, 'regenerate_bgm'],
    requireRenderedEvidence: false,
  }),
  scenario('mixed-multi-step', 'Mixed multi-step edit', 'Clean the captions, add one motivated zoom, and add music without covering speech.', { requiredToolSequence: [READ_PROJECT], minimumSuccessfulMutations: 2 }),
  scenario('undo-overlay-edit', 'Undo overlay edit', 'Undo that AI edit.', { requiredToolSequence: ['restore_ai_edit_checkpoint'], fixtureRequirements: ['ai-edit-checkpoint'] }),
  scenario('undo-full-state', 'Undo timing and project state', 'Undo the last AI edit including its timing and project duration changes.', { requiredToolSequence: ['restore_ai_edit_checkpoint'], fixtureRequirements: ['ai-edit-checkpoint'] }),
  scenario(
    'rollback-partial-failure',
    'Keep verified edits on partial failure',
    'Apply these three edits: add a small label saying Kept edit test at 1 second, make the selected title white, and delete overlay battle_missing_overlay. Keep the successful edits if the missing-overlay deletion fails, and report exactly what succeeded and failed.',
    {
      requiredToolSequence: [READ_PROJECT],
      minimumSuccessfulMutations: 2,
      allowPartialMutationFailure: true,
    },
  ),
  scenario('retry-idempotency', 'Interrupted request retry', 'Retry my previous edit without applying anything twice.', {
    expectOperationReplay: true,
    mutationExpectation: 'forbidden',
    minimumSuccessfulMutations: 0,
    requiredToolSequence: [],
    requireEvidenceBeforeMutation: false,
    requireRenderedEvidence: false,
    fixtureRequirements: ['prior-idempotency-record'],
  }),
  scenario('project-chat-isolation', 'Project-scoped chat isolation', 'Add a test title only to this project.', { requiredToolSequence: [READ_PROJECT, 'add_overlay'] }),
  scenario('fragmented-sse', 'Fragmented SSE transport', 'Add one title and report the completed edit.', { requiredToolSequence: [READ_PROJECT, 'add_overlay'] }),
  scenario('visible-range-reference', 'Visible timeline reference', 'Tighten this visible section without changing the rest.', { requiredToolSequence: [READ_PROJECT], minimumSuccessfulMutations: 1 }),
  scenario('spatial-cursor-reference', 'Spatial cursor reference', 'Put a small label where my cursor is right now.', { requiredToolSequence: [READ_PROJECT, 'add_overlay'] }),
  scenario('reference-style-transfer', 'Reference style transfer', 'Match the pacing and graphic restraint of my uploaded reference video asset.', {
    requiredToolSequence: ['apply_reference_style'],
    forbiddenTools: ['extract_style', 'apply_style'],
    minimumSuccessfulMutations: 0,
    requireEvidenceBeforeMutation: false,
    fixtureRequirements: ['durable-reference-asset'],
  }),
  scenario(
    'post-edit-render-proof',
    'Post-edit pixel and audio proof',
    'Add a bold white title saying Chat Battle at the top center for the first 2 seconds.',
    {
      requiredToolSequence: [READ_PROJECT, 'add_overlay'],
      requiredCreatedOverlayTypes: ['text'],
      requireRenderedEvidence: true,
    },
  ),
  scenario('batch-overlay-update', 'Batch update matching overlays', 'Make every existing text overlay use the same white fill without changing its wording or timing.', { requiredToolSequence: [READ_PROJECT, 'batch_update_overlays'] }),
  scenario('split-selected-overlay', 'Split selected clip', 'Split the selected clip exactly at the playhead.', { requiredToolSequence: [READ_PROJECT, 'split_overlay'] }),
  scenario('trim-selected-overlay', 'Trim selected clip', 'Trim one second from the end of the selected clip.', { requiredToolSequence: [READ_PROJECT, 'trim_overlay'] }),
  scenario('delete-selected-overlay', 'Delete selected overlay', 'Delete the selected overlay and nothing else.', { requiredToolSequence: [READ_PROJECT, 'delete_overlay'] }),
  scenario('sync-overlay-style', 'Sync overlay style', 'Copy the selected title style to the other title overlays without changing their text.', { requiredToolSequence: [READ_PROJECT, 'sync_style'] }),
  scenario('close-timeline-gaps', 'Close timeline gaps', 'Close all empty gaps between the main video clips while preserving their order.', { requiredToolSequence: [READ_PROJECT, 'close_gaps'], fixtureRequirements: ['timeline-gap'] }),
  scenario('transcript-overview', 'Read full timeline transcript', 'Show me the full transcript in timeline order. Do not edit anything.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['get_video_transcription'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('transcript-moment-search', 'Find spoken phrase', 'Find where I explain the pricing model and give me the matching frame candidates. Do not edit anything.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['find_transcript_moment'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('visual-moment-search', 'Find visual moment', 'Find the shot where the garment sketch is measured and give me the matching frame candidates. Do not edit anything.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['find_visual_moment'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('audio-moment-search', 'Find audio moment', 'Find the first strong beat after the speaker pauses and report the frame candidates. Do not edit anything.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['find_audio_moment'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('speech-anchored-sticker', 'Speech-anchored sticker', 'When I say this is the key point, add a small animated lightbulb sticker for one second.', { requiredToolSequence: ['resolve_sticker_overlay', 'generate_html_sticker'] }),
  scenario('manual-keyframe-zoom', 'Explicit keyframed zoom', 'On the selected video clip, create a gentle keyframed zoom from 100% to 108% over the next two seconds.', { requiredToolSequence: [READ_PROJECT, 'resolve_keyframe_edit', 'set_keyframes'] }),
  scenario('audio-anchored-camera-shake', 'Audio-anchored camera shake', 'Add one subtle camera shake exactly on the strongest impact beat.', { requiredToolSequence: ['resolve_audio_edit', 'apply_camera_shake'] }),
  scenario('visual-speed-ramp', 'Visual action speed ramp', 'Speed-ramp only the shot where the camera pulls back from a macro view to reveal the artisan, centered on that action.', { requiredToolSequence: ['resolve_visual_edit', 'apply_speed_ramp'] }),
  scenario('selected-overlay-fade', 'Fade selected overlay', 'Fade the selected overlay in and out smoothly without moving it.', { requiredToolSequence: [READ_PROJECT, 'apply_fade'] }),
  scenario('reorder-overlay-layer', 'Reorder overlay layer', 'Move the selected title in front of the image overlay without changing timing.', { requiredToolSequence: [READ_PROJECT, 'reorder_layer'], fixtureRequirements: ['selected-image-overlap'] }),
  scenario('move-retime-overlay', 'Move and retime overlay', 'Move the selected title to start at 4 seconds and keep it on screen for 2 seconds.', { requiredToolSequence: [READ_PROJECT, 'move_retime_overlay'] }),
  scenario('selected-clip-filter', 'Apply explicit clip filter', 'Warm the selected video clip slightly and add a little contrast. Do not grade the other clips.', { requiredToolSequence: [READ_PROJECT, 'apply_filter'] }),
  scenario('selected-dialogue-dubbing', 'Translate and dub selected dialogue', 'Translate and dub the selected video clip\'s spoken dialogue into Hindi. Preserve the original speech timing, keep the background sound natural, and do not change the other clips.', { requiredToolSequence: ['dub_selected_dialogue', 'get_dubbing_job_result'], requireEvidenceBeforeMutation: false }),
  scenario('vertical-subject-reframe', 'Reframe project while preserving subjects', 'Reframe this vertical project to 16:9 and keep the main subject visible throughout every shot. Do not crop important on-screen text.', { requiredToolSequence: [READ_PROJECT, 'reframe_project'] }),
  scenario('manual-impact-sfx', 'Grounded manual SFX', 'Add a restrained impact sound exactly on the first strong downbeat after the phrase now watch this.', { requiredToolSequence: ['resolve_audio_edit', 'add_sfx'] }),
  scenario('dialogue-ducking', 'Duck music under dialogue', 'Duck the background music under every spoken section so the dialogue remains clear.', { projectMode: 'assist', requiredToolSequence: [READ_PROJECT, 'apply_audio_ducking'] }),
  scenario('content-analysis', 'Analyze edit opportunities', 'Analyze this video for silence, filler words, and useful edit points. Report findings only.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['analyze_video_content'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('plain-caption-track', 'Add explicit plain captions', 'Add plain subtitle captions for all spoken dialogue, with no animated emphasis.', { projectMode: 'assist', requiredToolSequence: [READ_PROJECT, 'add_captions'] }),
  scenario('fancy-caption-track', 'Add explicit animated captions', 'Add animated word-highlight captions for all spoken dialogue.', {
    projectMode: 'assist',
    requiredToolSequence: requiredToolSequenceForChatCapability('caption-track', 'add_captions'),
    forbiddenTools: ['add_fancy_captions'],
  }),
  scenario('refresh-plain-captions', 'Refresh plain captions', 'Realign the existing plain captions to the current edited clips and transcript.', { requiredToolSequence: [READ_PROJECT, 'refresh_captions'] }),
  scenario('refresh-fancy-captions', 'Refresh animated captions', 'Realign the existing animated captions to the current edited clips and transcript.', {
    requiredToolSequence: requiredToolSequenceForChatCapability('caption-refresh', 'refresh_captions'),
    forbiddenTools: ['refresh_fancy_captions'],
  }),
  scenario('batch-caption-edit', 'Batch edit caption styling', 'Make all existing captions use sentence case and a high-contrast white style without changing their timing.', { requiredToolSequence: [READ_PROJECT, 'batch_edit_captions'] }),
  scenario('analyze-selected-audio', 'Analyze selected clip audio', 'Resolve and queue durable analysis of the selected clip audio for beats, pauses, speech, and energy. Do not edit anything and do not claim findings before the job completes.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['resolve_clip_analysis', 'queue_resolved_clip_analysis'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('analyze-selected-video', 'Analyze selected clip video', 'Resolve and queue durable analysis of the selected clip visuals for subjects, actions, shot changes, and text. Do not edit anything and do not claim findings before the job completes.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['resolve_clip_analysis', 'queue_resolved_clip_analysis'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('read-completed-clip-analysis', 'Read completed clip analysis', 'Read the completed deep-analysis job already referenced in this project conversation. Report only its grounded findings and do not edit anything.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['get_clip_analysis_result'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false, fixtureRequirements: ['completed-clip-analysis-job'] }),
  scenario('regenerate-existing-scene', 'Regenerate existing scene', 'Regenerate scene 2 while preserving its narrative purpose and timing.', { projectMode: 'assist', requiredToolSequence: [READ_PROJECT, 'regenerate_scene'], requireUiReload: false, requireRenderedEvidence: false }),
  scenario('beat-sync-cuts', 'Sync cuts to detected beats', 'Find the music downbeats and sync the existing montage cuts to them without changing clip order.', { projectMode: 'assist', requiredToolSequence: ['resolve_audio_edit', 'sync_cuts_to_beats'] }),
  scenario('replace-selected-sfx', 'Replace selected SFX', 'Replace the selected sound effect with a softer paper whoosh at the same time.', { requiredToolSequence: [READ_PROJECT, 'replace_sfx'] }),
  scenario('list-uploaded-assets', 'List uploaded assets', 'List the videos, images, and audio files I uploaded to this project. Do not edit anything.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['list_user_assets'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('search-uploaded-assets', 'Search uploaded assets', 'Find my uploaded clip showing embroidery work. Do not edit anything.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['search_user_assets'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('inspect-uploaded-asset', 'Inspect uploaded asset', 'Find my uploaded embroidery clip, inspect the best match, and tell me what it contains. Do not edit anything.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['search_user_assets', 'inspect_user_asset'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('place-uploaded-asset', 'Place uploaded asset', 'Place my uploaded image asset a_portrait123 in the bottom-right corner from 2 to 6 seconds.', { requiredToolSequence: [READ_PROJECT, 'resolve_user_asset_overlay', 'add_overlay'] }),
  scenario('search-stock-footage', 'Search stock footage', 'Search stock footage for a close-up of hand embroidery. Show me the best options without editing.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['search_stock_footage'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('replace-with-uploaded-footage', 'Replace scene with uploaded footage', 'Replace the selected video scene with uploaded video asset a_embroidery123, using its best matching section.', { requiredToolSequence: [READ_PROJECT, 'resolve_user_asset_overlay', 'use_matching_footage'] }),
] as const;

export function getChatEditBattleScenario(id: string): ChatBattleScenario | undefined {
  return CHAT_EDIT_BATTLE_SCENARIOS.find((item) => item.id === id);
}

export async function runChatEditBattleJourney(
  input: RunChatBattleJourneyInput,
  runtime: ChatBattleRuntime,
): Promise<ChatBattleJourneyReport> {
  const scenarioDefinition = getChatEditBattleScenario(input.scenarioId);
  if (!scenarioDefinition) throw new Error(`Unknown chat battle scenario: ${input.scenarioId}`);
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const beforeProject = await runtime.loadMongoProject(input.projectId, 'before');
  const mongoBefore = buildChatBattleProjectSnapshot(beforeProject, 'mongo-before', startedAt);
  const fixturePreconditions = evaluateChatBattleFixturePreconditions(
    scenarioDefinition,
    beforeProject,
    input.clientContext,
  );

  if (!fixturePreconditions.ok) {
    const completedAt = now().toISOString();
    const mongoAfter = buildChatBattleProjectSnapshot(beforeProject, 'mongo-after', completedAt);
    const invocation: ChatBattleInvocationEvidence = {
      agentRunId: input.journeyId ?? `fixture-invalid-${input.projectId}`,
      mode: 'live-provider',
      prompt: scenarioDefinition.prompt,
      responseText: '',
      toolEvents: [],
      refusalReason: `Fixture preconditions failed: ${fixturePreconditions.missing.join(', ')}`,
    };
    return evaluateChatEditBattleJourney({
      journeyId: input.journeyId ?? invocation.agentRunId,
      scenario: scenarioDefinition,
      projectId: input.projectId,
      startedAt,
      completedAt,
      invocation,
      mongoBefore,
      mongoAfter,
      uiReload: null,
      renderEvidence: {
        status: 'missing',
        artifactRefs: [],
        issues: [],
        reason: 'Chat battle skipped because the disposable fixture was not seeded for this scenario.',
      },
      fixturePreconditions,
    });
  }

  let invocation: ChatBattleInvocationEvidence;
  try {
    invocation = await runtime.invokeAgent({
      scenario: scenarioDefinition,
      projectId: input.projectId,
      userId: input.userId,
      selectedOverlayId: input.selectedOverlayId,
      clientContext: input.clientContext,
    });
  } catch (error) {
    invocation = {
      agentRunId: input.journeyId ?? `failed-${Date.now()}`,
      mode: 'live-provider',
      prompt: scenarioDefinition.prompt,
      responseText: '',
      toolEvents: [],
      error: errorMessage(error),
    };
  }

  const afterProject = await runtime.loadMongoProject(input.projectId, 'after');
  const completedAt = now().toISOString();
  const mongoAfter = buildChatBattleProjectSnapshot(afterProject, 'mongo-after', completedAt);
  let uiReload: ChatBattleProjectSnapshot | null = null;
  let uiReloadError: string | undefined;
  try {
    const reloaded = await runtime.reloadUiProject(input.projectId);
    uiReload = buildChatBattleProjectSnapshot(reloaded, 'ui-reload', completedAt);
  } catch (error) {
    uiReload = null;
    uiReloadError = errorMessage(error);
  }
  const renderEvidence = await runtime.captureRenderEvidence({
    projectId: input.projectId,
    startedAt,
    mongoAfter: afterProject,
  }).catch((error) => ({
    status: 'missing' as const,
    artifactRefs: [],
    issues: [],
    reason: errorMessage(error),
  }));

  return evaluateChatEditBattleJourney({
    journeyId: input.journeyId ?? invocation.agentRunId,
    scenario: scenarioDefinition,
    projectId: input.projectId,
    startedAt,
    completedAt,
    invocation,
    mongoBefore,
    mongoAfter,
    uiReload,
    uiReloadError,
    renderEvidence,
    fixturePreconditions,
  });
}

export function evaluateChatEditBattleJourney(input: {
  journeyId: string;
  scenario: ChatBattleScenario;
  projectId: string;
  startedAt: string;
  completedAt: string;
  invocation: ChatBattleInvocationEvidence;
  mongoBefore: ChatBattleProjectSnapshot;
  mongoAfter: ChatBattleProjectSnapshot;
  uiReload: ChatBattleProjectSnapshot | null;
  uiReloadError?: string;
  renderEvidence: ChatBattleRenderEvidence;
  fixturePreconditions?: ChatBattleFixturePreconditionResult;
}): ChatBattleJourneyReport {
  const checks: ChatBattleCheck[] = [];
  const fixturePreconditions = input.fixturePreconditions
    ?? evaluateChatBattleFixturePreconditions(input.scenario, input.mongoBefore);
  checks.push(check(
    'fixture.preconditions',
    fixturePreconditions.ok ? 'pass' : 'fail',
    true,
    fixturePreconditions.ok
      ? 'The disposable fixture satisfies the scenario-specific seed contract.'
      : 'The disposable fixture is missing scenario-specific seeded state, so this journey is not valid product evidence.',
    {
      required: input.scenario.fixtureRequirements,
      missing: fixturePreconditions.missing,
      satisfied: fixturePreconditions.satisfied,
    },
  ));
  if (!fixturePreconditions.ok) {
    return buildChatBattleJourneyReport(input, checks);
  }

  const events = input.invocation.toolEvents;
  const completedEvents = events.filter((event) => Boolean(event.completedAt));
  const mutationTerminals = completedEvents.flatMap((event) => {
    const outcome = classifyChatBattleMutationTerminalOutcome(event, input.invocation);
    return outcome ? [{ event, outcome }] : [];
  });
  const successfulMutations = mutationTerminals
    .filter((terminal) => terminal.outcome === 'mutated')
    .map((terminal) => terminal.event);
  const failedMutations = mutationTerminals
    .filter((terminal) => terminal.outcome === 'failed')
    .map((terminal) => terminal.event);
  const stateChanged = input.mongoBefore.digest !== input.mongoAfter.digest;
  const groundedClarification = findAcceptedResolverOutcome(
    completedEvents,
    input.scenario.acceptedResolverOutcomes,
  );
  const acceptedGroundedClarification = groundedClarification != null
    && successfulMutations.length === 0
    && failedMutations.length === 0
    && !stateChanged;
  const replayEvidence = input.invocation.replayProtection;
  const validExpectedReplay = input.scenario.expectOperationReplay
    && replayEvidence?.code === 'CHAT_EDIT_OPERATION_REPLAY'
    && replayEvidence.operationId.length > 0;

  checks.push(check(
    'agent.dynamic-run',
    input.invocation.agentRunId && input.invocation.prompt === input.scenario.prompt && !input.invocation.error ? 'pass' : 'fail',
    true,
    'The report must come from a real agent invocation for this exact prompt.',
    { agentRunId: input.invocation.agentRunId, mode: input.invocation.mode, promptMatches: input.invocation.prompt === input.scenario.prompt, error: input.invocation.error },
  ));
  checks.push(check(
    'agent.operation-replay-protection',
    input.scenario.expectOperationReplay
      ? validExpectedReplay && events.length === 0 ? 'pass' : 'fail'
      : replayEvidence == null ? 'pass' : 'fail',
    true,
    input.scenario.expectOperationReplay
      ? 'A retry must be rejected by the durable operation guard before any tool executes.'
      : 'A fresh scenario must not be rejected as a replay.',
    {
      expected: input.scenario.expectOperationReplay,
      replayProtection: replayEvidence ?? null,
      selectedToolCount: events.length,
    },
  ));
  checks.push(check(
    'agent.tool-completion',
    validExpectedReplay
      ? events.length === 0 ? 'pass' : 'fail'
      : events.length > 0 && completedEvents.length === events.length ? 'pass' : 'fail',
    true,
    validExpectedReplay
      ? 'A server-rejected replay must execute no tools.'
      : 'Every selected tool must have a completed result.',
    { selected: events.map((event) => ({ id: event.id, name: event.name, args: event.args })), completedCount: completedEvents.length },
  ));

  const toolNames = events.map((event) => event.name);
  const ownerPath = [
    ...(events.some(hasCanonicalProjectPreflight) ? [SERVER_CANONICAL_PROJECT_STATE] : []),
    ...toolNames,
  ];
  const sequenceResult = acceptedGroundedClarification
    ? requiredSequenceResult(ownerPath, resolverOnlySequence(input.scenario.requiredToolSequence))
    : requiredSequenceResult(ownerPath, input.scenario.requiredToolSequence);
  checks.push(check(
    'agent.required-owner-path',
    sequenceResult.ok ? 'pass' : 'fail',
    true,
    sequenceResult.ok ? 'The required evidence/owner tool path executed in order.' : 'The required evidence/owner tool path did not execute in order.',
    { toolNames, ownerPath, missingRequirement: sequenceResult.missing },
  ));

  const forbiddenTools = events.filter((event) => input.scenario.forbiddenTools.includes(event.name));
  const forbiddenArguments = input.scenario.forbiddenArguments.flatMap((rule) => events
    .filter((event) => event.name === rule.tool && deepEqual(readPath(event.args, rule.path), rule.equals))
    .map((event) => ({ tool: event.name, args: event.args, reason: rule.reason })));
  checks.push(check(
    'agent.no-forbidden-authority',
    forbiddenTools.length === 0 && forbiddenArguments.length === 0 ? 'pass' : 'fail',
    true,
    'Legacy or ungrounded authority must not satisfy the journey.',
    { forbiddenTools: forbiddenTools.map((event) => event.name), forbiddenArguments },
  ));

  if (input.scenario.acceptedResolverOutcomes.length > 0) {
    const clarificationStatus = stateChanged || acceptedGroundedClarification ? 'pass' : 'fail';
    checks.push(check(
      'agent.grounded-clarification',
      clarificationStatus,
      true,
      'A safe no-op must come from an explicitly accepted structured resolver outcome.',
      {
        acceptedResolverOutcomes: input.scenario.acceptedResolverOutcomes,
        resolvedOutcome: groundedClarification?.outcome ?? null,
        resolverTool: groundedClarification?.toolName ?? null,
        stateChanged,
      },
    ));
  }

  const firstMutationIndex = events.findIndex(
    (event) => classifyChatBattleMutationTerminalOutcome(event, input.invocation) === 'mutated',
  );
  const priorEvidenceReads = firstMutationIndex > 0
    ? events.slice(0, firstMutationIndex).filter((event) => !isMutatingTool(event.name) && isSuccessfulToolOutput(event.output))
    : [];
  const blockedMutationAttempts = firstMutationIndex > 0
    ? events.slice(0, firstMutationIndex).filter((event) => isMutatingTool(event.name) && !isSuccessfulToolOutput(event.output))
    : [];
  const serverCanonicalPreflight = firstMutationIndex >= 0
    && hasCanonicalProjectPreflight(events[firstMutationIndex]);
  const evidenceSatisfied = !input.scenario.requireEvidenceBeforeMutation
    || firstMutationIndex < 0
    || priorEvidenceReads.length > 0
    || serverCanonicalPreflight;
  checks.push(check(
    'agent.evidence-before-mutation',
    evidenceSatisfied ? 'pass' : 'fail',
    true,
    'Grounding evidence must be read before the first mutation.',
    {
      firstMutationIndex,
      priorEvidenceTools: priorEvidenceReads.map((event) => event.name),
      serverCanonicalPreflight,
      blockedMutationAttempts: blockedMutationAttempts.map((event) => event.name),
    },
  ));

  const mutationStatus = evaluateChatBattleMutationTruth(
    input.scenario,
    mutationTerminals.map((terminal) => terminal.outcome),
    stateChanged,
    acceptedGroundedClarification,
    input.invocation.durableOperations?.some((operation) => operation.materialChange) ?? false,
  );
  checks.push(check(
    'mongo.mutation-truth',
    mutationStatus,
    true,
    'Successful mutating tools and Mongo state changes must agree.',
    {
      expectation: input.scenario.mutationExpectation,
      successfulMutations: successfulMutations.map((event) => event.name),
      failedMutations: failedMutations.map((event) => event.name),
      terminalOutcomes: mutationTerminals.map((terminal) => ({
        toolName: terminal.event.name,
        outcome: terminal.outcome,
      })),
      durableOperations: input.invocation.durableOperations ?? [],
      stateChanged,
      verifiedExternalMaterialChange:
        input.invocation.durableOperations?.some((operation) => operation.materialChange) ?? false,
      beforeDigest: input.mongoBefore.digest,
      afterDigest: input.mongoAfter.digest,
    },
  ));

  const beforeOverlayIds = new Set(input.mongoBefore.overlays.map((overlay) => overlay.id));
  const createdOverlays = input.mongoAfter.overlays.filter(
    (overlay) => !beforeOverlayIds.has(overlay.id),
  );
  const missingCreatedOverlayTypes = input.scenario.requiredCreatedOverlayTypes.filter(
    (requirement) => {
      const acceptedTypes = Array.isArray(requirement) ? requirement : [requirement];
      return !createdOverlays.some((overlay) => acceptedTypes.includes(overlay.type));
    },
  );
  checks.push(check(
    'mongo.required-created-overlay-types',
    missingCreatedOverlayTypes.length === 0 ? 'pass' : 'fail',
    input.scenario.requiredCreatedOverlayTypes.length > 0,
    'Family-specific creation requests must persist an overlay from the requested family.',
    {
      required: input.scenario.requiredCreatedOverlayTypes,
      createdOverlays: createdOverlays.map((overlay) => ({
        id: overlay.id,
        type: overlay.type,
      })),
      missing: missingCreatedOverlayTypes,
    },
  ));

  const reloadMatches = input.uiReload != null && input.uiReload.digest === input.mongoAfter.digest;
  const reloadStatus: ChatBattleStatus = input.scenario.requireUiReload ? (reloadMatches ? 'pass' : 'fail') : (input.uiReload == null || reloadMatches ? 'pass' : 'warn');
  checks.push(check(
    'ui.reload-parity',
    reloadStatus,
    input.scenario.requireUiReload,
    'The editor reload payload must reflect the persisted Mongo result.',
    {
      required: input.scenario.requireUiReload,
      mongoDigest: input.mongoAfter.digest,
      uiDigest: input.uiReload?.digest ?? null,
      error: input.uiReloadError ?? null,
    },
  ));

  const renderFresh = isFreshTimestamp(input.renderEvidence.capturedAt, input.startedAt);
  const renderRequired = input.scenario.requireRenderedEvidence
    && successfulMutations.length > 0
    && stateChanged;
  const renderStatus: ChatBattleStatus = renderRequired
    ? !renderFresh || input.renderEvidence.status === 'missing' || input.renderEvidence.status === 'fail'
      ? 'fail'
      : input.renderEvidence.status
    : input.renderEvidence.status === 'fail' ? 'warn' : 'pass';
  checks.push(check(
    'render.fresh-evidence',
    renderStatus,
    renderRequired,
    'Visual/audio mutations require rendered evidence captured after the chat journey began.',
    {
      configured: input.scenario.requireRenderedEvidence,
      required: renderRequired,
      fresh: renderFresh,
      renderEvidence: input.renderEvidence,
    },
  ));

  const envelopeFailures = completedEvents.filter((event) => !hasDeterministicToolEnvelope(event.output));
  checks.push(check(
    'agent.tool-envelope',
    envelopeFailures.length === 0 ? 'pass' : 'fail',
    true,
    'Every tool result must use the deterministic status/data/error/nextAction envelope.',
    { invalidTools: envelopeFailures.map((event) => event.name) },
  ));

  return buildChatBattleJourneyReport(input, checks);
}

function buildChatBattleJourneyReport(input: {
  journeyId: string;
  scenario: ChatBattleScenario;
  projectId: string;
  startedAt: string;
  completedAt: string;
  invocation: ChatBattleInvocationEvidence;
  mongoBefore: ChatBattleProjectSnapshot;
  mongoAfter: ChatBattleProjectSnapshot;
  uiReload: ChatBattleProjectSnapshot | null;
  uiReloadError?: string;
  renderEvidence: ChatBattleRenderEvidence;
}, checks: ChatBattleCheck[]): ChatBattleJourneyReport {
  const verdict = checks.some((item) => item.status === 'fail' && item.blocking)
    ? 'fail'
    : checks.some((item) => item.status === 'warn')
      ? 'warn'
      : 'pass';
  return {
    version: CHAT_EDIT_BATTLE_HARNESS_VERSION,
    journeyId: input.journeyId,
    scenarioId: input.scenario.id,
    projectId: input.projectId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    verdict,
    invocation: input.invocation,
    mongoBefore: input.mongoBefore,
    mongoAfter: input.mongoAfter,
    uiReload: input.uiReload,
    ...(input.uiReloadError ? { uiReloadError: input.uiReloadError } : {}),
    renderEvidence: input.renderEvidence,
    checks,
  };
}

export function buildChatEditBattleSuite(reports: readonly ChatBattleJourneyReport[]): ChatBattleSuiteReport {
  const latestByScenario = new Map<string, ChatBattleJourneyReport>();
  for (const report of reports) {
    if (!getChatEditBattleScenario(report.scenarioId)) continue;
    const previous = latestByScenario.get(report.scenarioId);
    if (!previous || previous.completedAt < report.completedAt) latestByScenario.set(report.scenarioId, report);
  }
  const missingScenarioIds = CHAT_EDIT_BATTLE_SCENARIOS
    .filter((item) => !latestByScenario.has(item.id))
    .map((item) => item.id);
  const failedScenarioIds = [...latestByScenario.values()]
    .filter((report) => report.verdict === 'fail')
    .map((report) => report.scenarioId)
    .sort();
  const passedScenarioCount = [...latestByScenario.values()].filter((report) => report.verdict === 'pass').length;
  const hasWarnings = [...latestByScenario.values()].some((report) => report.verdict === 'warn');
  return {
    version: CHAT_EDIT_BATTLE_HARNESS_VERSION,
    verdict: missingScenarioIds.length > 0 || failedScenarioIds.length > 0 ? 'fail' : hasWarnings ? 'warn' : 'pass',
    requiredScenarioCount: CHAT_EDIT_BATTLE_SCENARIOS.length,
    executedScenarioCount: latestByScenario.size,
    passedScenarioCount,
    missingScenarioIds,
    failedScenarioIds,
  };
}

export function buildChatBattleProjectSnapshot(
  projectValue: unknown,
  source: ChatBattleProjectSnapshot['source'],
  capturedAt: string = new Date().toISOString(),
): ChatBattleProjectSnapshot {
  const project = asRecord(unwrapProject(projectValue));
  const overlays = Array.isArray(project.overlays) ? project.overlays.map(asRecord) : [];
  const overlaySnapshots = overlays.map((overlay) => {
    const material = sanitizeMaterialState(overlay);
    return {
      id: identifierValue(overlay.id),
      type: stringValue(overlay.type) ?? 'unknown',
      from: finiteNumber(overlay.from),
      durationInFrames: finiteNumber(overlay.durationInFrames),
      row: finiteNumber(overlay.row),
      assetId: stringValue(overlay.assetId),
      digest: digest(material),
    };
  });
  const materialProject = {
    projectId: stringValue(project.projectId ?? project.id) ?? '',
    durationInFrames: finiteNumber(project.durationInFrames),
    fps: finiteNumber(project.fps),
    width: finiteNumber(project.width),
    height: finiteNumber(project.height),
    overlays: overlays.map((overlay) => sanitizeMaterialState(overlay)),
  };
  return {
    source,
    projectId: materialProject.projectId,
    durationInFrames: materialProject.durationInFrames,
    fps: materialProject.fps,
    width: materialProject.width,
    height: materialProject.height,
    overlayCount: overlaySnapshots.length,
    overlays: overlaySnapshots,
    digest: digest(materialProject),
    capturedAt,
  };
}

export function extractPersistedChatBattleRenderEvidence(
  projectValue: unknown,
  startedAt: string,
): ChatBattleRenderEvidence {
  const project = asRecord(unwrapProject(projectValue));
  const intelligence = asRecord(project.intelligence);
  const chatVerification = asRecord(intelligence.latestChatEditRenderVerification);
  const jobLifecycle = asRecord(chatVerification.lifecycle);
  const chatRequestedAt = stringValue(chatVerification.requestedAt) ?? undefined;
  if (isFreshTimestamp(chatRequestedAt, startedAt)) {
    const chatStatus = stringValue(chatVerification.status);
    const chatCapturedAt = stringValue(chatVerification.completedAt) ?? undefined;
    const lifecycleState = stringValue(jobLifecycle.state);
    const visual = asRecord(chatVerification.visual);
    const audio = asRecord(chatVerification.audio);
    const artifactRefs = uniqueStrings([
      ...readStrings(visual.renderedFrames, ['beforeUrl', 'afterUrl', 'url', 'artifactUrl', 'frameUrl']),
      ...readStrings(audio.windows, ['beforeUrl', 'afterUrl', 'url', 'artifactUrl']),
    ]);
    const issues = collectRenderVerificationIssues({ chatVerification, visual, audio });
    if (!chatCapturedAt || !isFreshTimestamp(chatCapturedAt, startedAt)) {
      return {
        status: 'missing',
        capturedAt: chatCapturedAt,
        artifactRefs,
        issues,
        jobLifecycle,
        reason: `Chat edit render verification is still pending (${lifecycleState ?? 'unknown'}).`,
      };
    }
    if (chatStatus === 'fail' || chatStatus === 'failed' || chatStatus === 'error') {
      return {
        status: 'fail',
        capturedAt: chatCapturedAt,
        artifactRefs,
        issues,
        jobLifecycle,
        reason: issues.length === 0 ? readStringArray(chatVerification.reasons).join('; ') || undefined : undefined,
      };
    }
    if (chatStatus === 'warn' || chatStatus === 'partial' || chatStatus === 'needs_review') {
      return { status: 'warn', capturedAt: chatCapturedAt, artifactRefs, issues, jobLifecycle };
    }
    if (chatStatus === 'pass' || chatStatus === 'completed') {
      return { status: 'pass', capturedAt: chatCapturedAt, artifactRefs, issues, jobLifecycle };
    }
    return {
      status: 'missing',
      capturedAt: chatCapturedAt,
      artifactRefs,
      issues,
      jobLifecycle,
      reason: `Unknown chat edit render status: ${chatStatus ?? 'missing'}.`,
    };
  }
  const evidence = asRecord(intelligence.phase0RenderedStillEvidence);
  const gate = asRecord(intelligence.phase0RenderedQualityGate);
  const report = asRecord(intelligence.phase0RenderedAestheticReport);
  const capturedAt = stringValue(evidence.completedAt ?? report.completedAt ?? gate.reviewedAt) ?? undefined;
  const evidenceStatus = stringValue(evidence.status);
  const reportSummary = asRecord(report.summary);
  const reportStatus = stringValue(reportSummary.status ?? report.status);
  const artifactRefs = uniqueStrings([
    ...readStrings(evidence.renderedFrames, ['url', 'artifactUrl', 'frameUrl']),
    ...readStrings(report, ['jsonReport', 'htmlReport', 'artifactUrl']),
  ]);
  const issues = Array.isArray(report.issues)
    ? report.issues.map(asRecord).slice(0, 100)
    : Array.isArray(evidence.issues)
      ? evidence.issues.map(asRecord).slice(0, 100)
      : [];
  if (!capturedAt || !isFreshTimestamp(capturedAt, startedAt)) {
    return { status: 'missing', capturedAt, artifactRefs, issues, reason: 'No fresh rendered evidence exists for this chat journey.' };
  }
  if (evidenceStatus === 'failed' || reportStatus === 'fail') return { status: 'fail', capturedAt, artifactRefs, issues };
  if (evidenceStatus === 'partial' || reportStatus === 'warn') return { status: 'warn', capturedAt, artifactRefs, issues };
  if (evidenceStatus === 'completed' && reportStatus === 'pass') return { status: 'pass', capturedAt, artifactRefs, issues };
  return { status: 'missing', capturedAt, artifactRefs, issues, reason: 'Rendered evidence did not contain a completed aesthetic verdict.' };
}

function collectRenderVerificationIssues(input: {
  chatVerification: Record<string, unknown>;
  visual: Record<string, unknown>;
  audio: Record<string, unknown>;
}): Array<Record<string, unknown>> {
  const persistedIssues = Array.isArray(input.chatVerification.issues)
    ? input.chatVerification.issues.map(asRecord)
    : [];
  const visualIssues = Array.isArray(input.visual.issues)
    ? input.visual.issues.map((issue) => ({
        ...asRecord(issue),
        modality: stringValue(asRecord(issue).modality) ?? 'visual',
      }))
    : [];
  const audioIssues = inferAudioRenderIssues(input.audio);
  const structuredIssues = [
    ...persistedIssues,
    ...visualIssues,
    ...audioIssues,
  ];
  const lifecycleReason = stringValue(asRecord(input.chatVerification.lifecycle).reason);
  const persistedReasons = readStringArray(input.chatVerification.reasons);
  const diagnosticReasons = persistedReasons.length > 0
    ? persistedReasons
    : lifecycleReason
      ? [lifecycleReason]
      : [];
  const reasonIssues = structuredIssues.length === 0
    ? diagnosticReasons.map((reason) => ({
        modality: reason.startsWith('audio_') ? 'audio' : reason.startsWith('visual_') ? 'visual' : 'system',
        severity: 'error',
        code: reason.split(':')[0] || 'render_verification_failed',
        message: reason,
        source: 'chat-edit-render-verification-reason',
      }))
    : [];
  return uniqueIssueRecords([
    ...structuredIssues,
    ...reasonIssues,
  ]).slice(0, 100);
}

function inferAudioRenderIssues(audio: Record<string, unknown>): Array<Record<string, unknown>> {
  const windows = Array.isArray(audio.windows) ? audio.windows.map(asRecord) : [];
  const issues: Array<Record<string, unknown>> = windows
    .filter((window) => Boolean(window.error) || window.changed === false)
    .map((window) => ({
      modality: 'audio',
      severity: 'error',
      code: window.error ? 'audio_window_render_error' : 'audio_window_unchanged',
      message: stringValue(window.error) ?? 'Rendered audio did not change inside the requested verification window.',
      startFrame: finiteNumber(window.startFrame),
      endFrame: finiteNumber(window.endFrame),
      beforeUrl: stringValue(window.beforeUrl),
      afterUrl: stringValue(window.afterUrl),
      source: 'chat-edit-render-verification-audio-window',
    }));
  const status = stringValue(audio.status);
  const reason = stringValue(audio.reason);
  if (issues.length === 0 && status && status !== 'pass') {
    issues.push({
      modality: 'audio',
      severity: 'error',
      code: `audio_render_${status}`,
      message: reason ?? `Audio render evidence status was ${status}.`,
      source: 'chat-edit-render-verification-audio',
    });
  }
  return issues;
}

function uniqueIssueRecords(issues: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const unique: Array<Record<string, unknown>> = [];
  for (const issue of issues) {
    const code = stringValue(issue.code ?? issue.dimension)
      ?? stringValue(issue.message)
      ?? 'render_verification_issue';
    const modality = stringValue(issue.modality) ?? 'system';
    const severity = stringValue(issue.severity) ?? '';
    const frame = finiteNumber(issue.frame ?? issue.startFrame);
    const overlayId = stringValue(issue.overlayId) ?? finiteNumber(issue.overlayId)?.toString() ?? '';
    const key = `${modality}:${code}:${severity}:${frame ?? ''}:${overlayId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(issue);
  }
  return unique;
}

export function parseChatBattleSse(text: string): Array<Record<string, unknown>> {
  return text
    .split(/\r?\n\r?\n/)
    .flatMap((block) => block.split(/\r?\n/).filter((line) => line.startsWith('data: ')))
    .map((line) => line.slice(6).trim())
    .filter(Boolean)
    .map((payload) => {
      try {
        return asRecord(JSON.parse(payload));
      } catch {
        return { type: 'parse_error', raw: payload };
      }
    });
}

export function chatBattleToolEventsFromSse(
  records: readonly Record<string, unknown>[],
  fallbackStartedAt: string,
): ChatBattleToolEvent[] {
  const events = new Map<string, ChatBattleToolEvent>();
  for (const record of records) {
    const id = stringValue(record.id);
    if (!id) continue;
    if (record.type === 'tool_start') {
      events.set(id, {
        id,
        name: stringValue(record.tool) ?? 'unknown',
        args: asRecord(record.args),
        startedAt: stringValue(record.at) ?? fallbackStartedAt,
      });
    } else if (record.type === 'tool_end') {
      const existing = events.get(id);
      events.set(id, {
        id,
        name: stringValue(record.tool) ?? existing?.name ?? 'unknown',
        args: existing?.args ?? {},
        startedAt: existing?.startedAt ?? fallbackStartedAt,
        completedAt: stringValue(record.at) ?? new Date().toISOString(),
        output: record.output,
      });
    }
  }
  return [...events.values()];
}

export function evaluateChatBattleFixturePreconditions(
  scenarioDefinition: ChatBattleScenario,
  projectValue: unknown,
  clientContext?: Record<string, unknown>,
): ChatBattleFixturePreconditionResult {
  const required = [...scenarioDefinition.fixtureRequirements];
  const satisfied = required.filter((requirement) => chatBattleFixtureRequirementSatisfied(
    requirement,
    projectValue,
    clientContext,
  ));
  const satisfiedSet = new Set(satisfied);
  return {
    ok: satisfied.length === required.length,
    missing: required.filter((requirement) => !satisfiedSet.has(requirement)),
    satisfied,
  };
}

function chatBattleFixtureRequirementSatisfied(
  requirement: ChatBattleFixtureRequirement,
  projectValue: unknown,
  clientContext?: Record<string, unknown>,
): boolean {
  const project = asRecord(unwrapProject(projectValue));
  const intelligence = asRecord(project.intelligence);
  const fixture = mergeRecords(
    asRecord(project.chatBattleFixture),
    asRecord(intelligence.chatBattleFixture),
    asRecord(clientContext?.chatBattleFixture),
  );
  switch (requirement) {
    case 'ai-edit-checkpoint':
      return truthyFixtureFlag(fixture, 'hasAiEditCheckpoint')
        || stringValue(fixture.beforeCheckpointId) != null
        || readStringArray(fixture.checkpointIds).length > 0;
    case 'prior-idempotency-record':
      return truthyFixtureFlag(fixture, 'hasPriorIdempotencyRecord')
        || stringValue(fixture.priorOperationId) != null
        || stringValue(fixture.idempotencyKey) != null;
    case 'durable-reference-asset':
      return truthyFixtureFlag(fixture, 'hasDurableReferenceAsset')
        || stringValue(fixture.referenceAssetId) != null
        || projectHasReferenceAsset(project);
    case 'completed-clip-analysis-job':
      return truthyFixtureFlag(fixture, 'hasCompletedClipAnalysisJob')
        || stringValue(fixture.completedClipAnalysisJobId) != null
        || projectHasCompletedClipAnalysisJob(project);
    case 'timeline-gap':
      return projectHasTimelineGap(project);
    case 'selected-image-overlap':
      return projectHasSelectedImageOverlap(project, clientContext);
  }
}

function mergeRecords(...records: Record<string, unknown>[]): Record<string, unknown> {
  return Object.assign({}, ...records);
}

function truthyFixtureFlag(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true || record[key] === 'true' || record[key] === 1;
}

function projectHasReferenceAsset(project: Record<string, unknown>): boolean {
  const assets = [
    ...readRecordArray(project.mediaAssets),
    ...readRecordArray(project.assets),
    ...readRecordArray(project.sourceAssets),
  ];
  return assets.some((asset) => {
    const metadata = asRecord(asset.metadata);
    return stringValue(asset.assetId ?? asset.id) != null
      && (stringValue(asset.role) === 'reference'
        || stringValue(asset.purpose) === 'reference'
        || metadata.isReference === true
        || stringValue(metadata.role) === 'reference'
        || stringValue(metadata.purpose) === 'reference');
  });
}

function projectHasCompletedClipAnalysisJob(project: Record<string, unknown>): boolean {
  const intelligence = asRecord(project.intelligence);
  const jobs = [
    ...readRecordArray(intelligence.chatDeepAnalysisJobs),
    ...readRecordArray(project.chatDeepAnalysisJobs),
  ];
  return jobs.some((job) => stringValue(job.status) === 'completed'
    && (stringValue(job.jobId ?? job.id) != null || Object.keys(asRecord(job.result)).length > 0));
}

function projectHasTimelineGap(project: Record<string, unknown>): boolean {
  const videos = readRecordArray(project.overlays)
    .filter((overlay) => stringValue(overlay.type) === 'video')
    .map((overlay) => ({
      from: finiteNumber(overlay.from),
      durationInFrames: finiteNumber(overlay.durationInFrames),
    }))
    .filter((overlay) => overlay.durationInFrames > 0)
    .sort((left, right) => left.from - right.from);

  return videos.some((video, index) => (
    index > 0
    && video.from > videos[index - 1].from + videos[index - 1].durationInFrames
  ));
}

function projectHasSelectedImageOverlap(
  project: Record<string, unknown>,
  clientContext?: Record<string, unknown>,
): boolean {
  const selectedOverlayId = identifierValue(clientContext?.selectedOverlayId);
  if (!selectedOverlayId) return false;
  const overlays = readRecordArray(project.overlays);
  const selected = overlays.find(
    (overlay) => identifierValue(overlay.id) === selectedOverlayId,
  );
  if (!selected || stringValue(selected.type) !== 'text') return false;

  const selectedStart = finiteNumber(selected.from);
  const selectedEnd = selectedStart + finiteNumber(selected.durationInFrames);
  if (selectedEnd <= selectedStart) return false;
  return overlays.some((overlay) => {
    if (stringValue(overlay.type) !== 'image') return false;
    const start = finiteNumber(overlay.from);
    const end = start + finiteNumber(overlay.durationInFrames);
    return end > selectedStart && start < selectedEnd;
  });
}

function requiredSequenceResult(
  toolNames: readonly string[],
  requirements: ReadonlyArray<string | readonly string[]>,
): { ok: boolean; missing?: string | readonly string[] } {
  let cursor = 0;
  for (const requirement of requirements) {
    const accepted = Array.isArray(requirement) ? requirement : [requirement];
    let match = -1;
    for (let index = cursor; index < toolNames.length; index += 1) {
      const toolName = toolNames[index];
      const acceptsCanonicalServerPreflight = toolName === SERVER_CANONICAL_PROJECT_STATE
        && accepted.some((name) => name === 'read_project_file' || name === 'get_timeline_view');
      if (accepted.includes(toolName) || acceptsCanonicalServerPreflight) {
        match = index;
        break;
      }
    }
    if (match < 0) return { ok: false, missing: requirement };
    cursor = match + 1;
  }
  return { ok: true };
}

function resolverOnlySequence(
  requirements: ReadonlyArray<string | readonly string[]>,
): ReadonlyArray<string | readonly string[]> {
  const prefix: Array<string | readonly string[]> = [];
  for (const requirement of requirements) {
    const accepted = Array.isArray(requirement) ? requirement : [requirement];
    if (accepted.some((toolName) => isMutatingTool(toolName))) break;
    prefix.push(requirement);
  }
  return prefix;
}

export function evaluateChatBattleMutationTruth(
  scenarioDefinition: ChatBattleScenario,
  terminalOutcomes: readonly ChatBattleMutationTerminalOutcome[],
  stateChanged: boolean,
  acceptedGroundedClarification: boolean,
  verifiedExternalMaterialChange = false,
): ChatBattleStatus {
  const mutatedCount = terminalOutcomes.filter((outcome) => outcome === 'mutated').length;
  const noOpCount = terminalOutcomes.filter((outcome) => outcome === 'no-op').length;
  const failedCount = terminalOutcomes.filter((outcome) => outcome === 'failed').length;
  const acceptedConditionalCount = terminalOutcomes.filter(
    (outcome) => outcome === 'no-op' || outcome === 'needs-input' || outcome === 'declined',
  ).length;
  if (scenarioDefinition.mutationExpectation === 'forbidden') {
    return terminalOutcomes.length === 0 && !stateChanged ? 'pass' : 'fail';
  }
  if (failedCount > 0 && !scenarioDefinition.allowPartialMutationFailure) return 'fail';
  if (
    scenarioDefinition.mutationExpectation === 'conditional'
    && acceptedGroundedClarification
    && terminalOutcomes.length === 0
    && !stateChanged
  ) {
    return 'pass';
  }
  if (scenarioDefinition.mutationExpectation === 'conditional') {
    if (mutatedCount > 0) {
      return stateChanged || verifiedExternalMaterialChange ? 'pass' : 'fail';
    }
    return acceptedConditionalCount > 0 && !stateChanged ? 'pass' : 'fail';
  }
  const satisfiedCount = mutatedCount + noOpCount;
  const stateMatchesOutcome = mutatedCount > 0
    ? stateChanged || verifiedExternalMaterialChange
    : !stateChanged && !verifiedExternalMaterialChange;
  return satisfiedCount >= scenarioDefinition.minimumSuccessfulMutations && stateMatchesOutcome
    ? 'pass'
    : 'fail';
}

function findAcceptedResolverOutcome(
  events: readonly ChatBattleToolEvent[],
  acceptedOutcomes: readonly ChatBattleResolverOutcome[],
): { toolName: string; outcome: ChatBattleResolverOutcome } | null {
  if (acceptedOutcomes.length === 0) return null;
  for (const event of events) {
    if (isMutatingTool(event.name)) continue;
    const envelope = parseToolOutput(event.output);
    const data = asRecord(envelope?.data);
    const outcome = stringValue(data.status);
    if (outcome && acceptedOutcomes.includes(outcome as ChatBattleResolverOutcome)) {
      return {
        toolName: event.name,
        outcome: outcome as ChatBattleResolverOutcome,
      };
    }
  }
  return null;
}

function isMutatingTool(name: string): boolean {
  return getChatToolMetadata(name)?.mutatesProject === true;
}

export function chatBattleInvocationHasSuccessfulMutation(
  invocation: ChatBattleInvocationEvidence,
): boolean {
  return invocation.toolEvents.some((event) =>
    Boolean(event.completedAt)
    && classifyChatBattleMutationTerminalOutcome(event, invocation) === 'mutated',
  );
}

export function classifyChatBattleMutationTerminalOutcome(
  event: ChatBattleToolEvent,
  invocation: ChatBattleInvocationEvidence,
): ChatBattleMutationTerminalOutcome | null {
  if (!isMutatingTool(event.name)) return null;
  const output = typeof event.output === 'string'
    ? event.output
    : JSON.stringify(event.output ?? null);
  const executionOutcome = classifyChatToolExecutionOutcome(output);
  if (executionOutcome === 'no-op') return 'no-op';
  if (executionOutcome === 'needs-choice') return 'needs-input';
  if (executionOutcome === 'declined') return 'declined';
  if (executionOutcome !== 'success') return 'failed';

  const durable = durableOperationForEvent(event, invocation.durableOperations ?? []);
  if (!durable) return 'mutated';
  if (durable.status === 'declined') return 'declined';
  if (durable.status === 'completed' && !durable.materialChange) return 'no-op';
  return durable.materialChange ? 'mutated' : 'failed';
}

function durableOperationForEvent(
  event: ChatBattleToolEvent,
  operations: readonly ChatBattleDurableOperationEvidence[],
): ChatBattleDurableOperationEvidence | null {
  if (operations.length === 0) return null;
  const output = parseToolOutput(event.output);
  const data = asRecord(output?.data);
  let jobId: string | null = null;
  if (event.name === 'apply_editorial_intent') {
    const dispatch = asRecord(data.dispatch);
    const authority = asRecord(dispatch.authority);
    jobId = stringValue(authority.jobId ?? dispatch.jobId ?? data.jobId);
  } else if (event.name === 'apply_reference_style' || event.name === 'dub_selected_dialogue') {
    jobId = stringValue(data.jobId);
  } else if (event.name === 'regenerate_scene') {
    jobId = stringValue(data.jobId);
  }
  return jobId ? operations.find((operation) => operation.jobId === jobId) ?? null : null;
}

function isSuccessfulToolOutput(output: unknown): boolean {
  const parsed = parseToolOutput(output);
  if (!parsed) return false;
  return parsed.status === 'success' && (parsed.error == null || parsed.error === '');
}

function hasDeterministicToolEnvelope(output: unknown): boolean {
  const parsed = parseToolOutput(output);
  const status = String(parsed?.status ?? '').toLowerCase().replaceAll('_', '-');
  return parsed != null
    && [
      'success',
      'advisory',
      'error',
      'no-op',
      'noop',
      'skipped',
      'declined',
      'needs-choice',
      'replan-required',
    ].includes(status)
    && Object.prototype.hasOwnProperty.call(parsed, 'data')
    && Object.prototype.hasOwnProperty.call(parsed, 'error')
    && Object.prototype.hasOwnProperty.call(parsed, 'nextAction');
}

function parseToolOutput(output: unknown): Record<string, unknown> | null {
  if (output && typeof output === 'object') return asRecord(output);
  if (typeof output !== 'string' || !output.trim()) return null;
  try {
    return asRecord(JSON.parse(output));
  } catch {
    return null;
  }
}

function sanitizeMaterialState(value: unknown, parentKey = ''): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeMaterialState(item, parentKey));
  if (typeof value !== 'object') return String(value);
  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record).sort(([a], [b]) => a.localeCompare(b))) {
    if (isEphemeralProjectKey(key, parentKey, child, record)) continue;
    output[key] = sanitizeMaterialState(child, key);
  }
  return output;
}

function hasCanonicalProjectPreflight(event: ChatBattleToolEvent | undefined): boolean {
  if (!event || !isMutatingTool(event.name) || !isSuccessfulToolOutput(event.output)) return false;
  const parsed = parseToolOutput(event.output);
  const data = asRecord(parsed?.data);
  const verification = asRecord(data.postconditionVerification);
  return verification.version === 'editron-chat-postcondition-v1'
    && verification.status === 'pass'
    && typeof verification.beforeStateHash === 'string'
    && verification.beforeStateHash.length > 0;
}

function isEphemeralProjectKey(
  key: string,
  parentKey: string,
  value: unknown,
  owner: Record<string, unknown>,
): boolean {
  if (['createdAt', 'updatedAt', 'resolvedAt', 'expiresAt', 'signedUrl', 'publicUrl', 'cachedUrl', 'thumbnailUrl', 'frameUrls'].includes(key)) return true;
  if (['src', 'url', 'mediaUrl'].includes(key) && typeof value === 'string' && /^(?:https?:|blob:|data:)/i.test(value)) return true;
  if (
    key === 'content'
    && typeof value === 'string'
    && /^(?:https?:|blob:|data:)/i.test(value)
    && ['video', 'audio', 'sound'].includes(stringValue(owner.type) ?? '')
  ) return true;
  if (key === 'appliedAt' && /receipt/i.test(parentKey)) return true;
  return /^(authorization|cookie|token|apiKey|secret)$/i.test(key);
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unwrapProject(value: unknown): unknown {
  const record = asRecord(value);
  return record.project && typeof record.project === 'object' ? record.project : value;
}

function check(id: string, status: ChatBattleStatus, blocking: boolean, summary: string, evidence: Record<string, unknown>): ChatBattleCheck {
  return { id, status, blocking, summary, evidence };
}

function readPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => asRecord(current)[segment], value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(sanitizeMaterialState(left)) === JSON.stringify(sanitizeMaterialState(right));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function identifierValue(value: unknown): string {
  const text = stringValue(value);
  if (text) return text;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readStrings(value: unknown, keys: string[]): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => readStrings(item, keys));
  const record = asRecord(value);
  return keys.map((key) => stringValue(record[key])).filter((item): item is string => Boolean(item));
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(stringValue).filter((item): item is string => Boolean(item))
    : [];
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isFreshTimestamp(value: string | undefined, startedAt: string): boolean {
  if (!value) return false;
  const captured = Date.parse(value);
  const started = Date.parse(startedAt);
  return Number.isFinite(captured) && Number.isFinite(started) && captured >= started;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
