import { z } from 'zod';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { describeThinkForgeAuthoringDeliverable } from '../schemas/authoring-request';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput, AgentStructuredOutput } from './types';
import { generateStructuredWithWritingContextCache } from '../services/gemini-writing-context-cache';
import {
  getCanonicalBeatSpokenText,
  parseScriptSidecarV2,
  SCRIPT_SIDECAR_V2_VERSION,
  ScriptSidecarV2Schema,
  ScriptWriterSidecarV2ModelSchema,
  type NarrativeBeatV2,
  type NarrativeSceneV2,
  type ScriptSidecarV2,
} from '../schemas/script-sidecar-v2';
import {
  findSourceLedgerIssuesForNarrativeSidecar,
  formatSourceLedgerForPrompt,
  type SourceLedger,
} from '../provenance/source-ledger';
import { buildThinkForgeWriterInvocationTrace } from '../provenance/generation-trace';
import { requireSourceReferenceIdForFact } from '../provenance/source-ledger-continuity';
import { formatTrendBriefForPrompt } from './trend-brief-context';
import { formatCastingBriefForPrompt, getAvatarCastingEntries } from './casting-brief-context';
import { buildIsolatedPromptParts, type IsolatedPromptParts } from './prompt-boundary';
import {
  evaluateContentProfileCompliance,
  shouldAutoRepairContentProfileViolations,
  type ThinkForgeContentSignalProfile,
} from '../signals';
import { buildScriptEditorialPlan, type ScriptEditorialPlan } from './script-editorial-plan';
import {
  requireThinkForgeEditorialPlanForWriter,
  type ThinkForgeEditorialCreativeIntent,
  type ThinkForgeScriptEditorialPlanArtifact,
} from './editorial-plan';
import { countUnicodeWords } from '../text/unicode-text';

const ContentAnalysisSchema = z.object({
  hooks: z.array(z.string()).describe('List of key hooks utilized in the script'),
  theme: z.string().describe('The core theme of the script'),
  emphasisPoints: z.array(z.string()).describe('Key moments intended for emphasis'),
  qualityScore: z.number().min(0).max(100).describe('Self-evaluated quality score (0-100) based on specificity and engagement'),
});

const ContentAnalysisModelSchema = ContentAnalysisSchema.extend({
  qualityScore: z.number().describe('Self-evaluated quality score; the server enforces the 0-100 range'),
});

const WriterModelMetadataSchema = z.object({
  platform: z.string().describe('The targeted publication platform'),
});

const WriterMetadataSchema = z.object({
  estimatedTimeSeconds: z.number().nonnegative().describe('Duration derived from narrative intent'),
  platform: z.string().min(1).describe('The targeted publication platform'),
  voiceLanguages: z.array(z.string()).describe('Spoken languages derived from canonical beat lines'),
  editorialWarnings: z.array(z.string()).optional().describe('Server-owned, non-blocking editorial diagnostics'),
});

const ScriptVisualMetadataSchema = z.object({
  motionInfo: z.string().describe('General motion graphic styling instructions'),
  scenePrompts: z.array(z.string()).describe('One deterministic visual prompt per Script Sidecar scene.'),
});

// The model authors narrative hierarchy only. Visible markdown and visual prompts are projections;
// a later technical planner owns provider-specific render segmentation.
export const ScriptWriterModelOutputSchema = z.object({
  contentAnalysis: ContentAnalysisModelSchema,
  visualMetadata: z.object({
    motionInfo: z.string().describe('General motion graphic styling instructions'),
  }),
  metadata: WriterModelMetadataSchema,
  sidecar: ScriptWriterSidecarV2ModelSchema.describe(
    'Structurally complete narrative-only Script Sidecar v2 draft; the server enforces semantic invariants before persistence',
  ),
});

// Public writer result consumed by the editor and exports after deterministic materialization.
export const ScriptWriterResultSchema = z.object({
  content: z.string().describe('The actual script text, formatted in markdown with scenes'),
  contentAnalysis: ContentAnalysisSchema,
  visualMetadata: ScriptVisualMetadataSchema,
  metadata: WriterMetadataSchema,
  sidecar: ScriptSidecarV2Schema,
});

export type ScriptWriterResult = z.infer<typeof ScriptWriterResultSchema>;
export type ScriptWriterModelOutput = z.infer<typeof ScriptWriterModelOutputSchema>;

interface ResolvedScriptEditorialContext {
  executionPlan: ScriptEditorialPlan;
  creativeIntent: ThinkForgeEditorialCreativeIntent;
  tracePlan: ThinkForgeScriptEditorialPlanArtifact | ScriptEditorialPlan;
}

/**
 * Edit framing for the revise-existing-content path (P5).
 * When present, the writer REVISES `existingContent` per `instruction` and returns the COMPLETE
 * revised script in the same ScriptWriterResult shape, instead of writing from scratch. Opt-in:
 * absent editContext = unchanged from-scratch behavior.
 */
interface ScriptWriterEditContext {
  /** The full current script (markdown) the user is editing. */
  existingContent: string;
  /** The edit the user asked for. */
  instruction: string;
  /** Optional focused selection the change targets. */
  selection?: string;
  /** Optional short hint about what to focus on. */
  focusHint?: string;
}

export interface ScriptWriterInput extends AgentInput {
  productionBrief?: ProductionBrief | null;
  contentSignalProfile?: ThinkForgeContentSignalProfile | null;
  sourceLedger?: SourceLedger | null;
  /** When set, switches the writer into edit/revise mode (see ScriptWriterEditContext). */
  editContext?: ScriptWriterEditContext;
}

interface ScriptWriterValidationOptions {
  sourceLedger?: SourceLedger | null;
  productionBrief?: ProductionBrief | null;
  contentSignalProfile?: ThinkForgeContentSignalProfile | null;
}

function resolveScriptEditorialContext(input: ScriptWriterInput): ResolvedScriptEditorialContext {
  if (input.editorialPlan) {
    const artifact = requireThinkForgeEditorialPlanForWriter(
      input.editorialPlan,
      'script',
      input.authoringRequest,
    );
    return {
      executionPlan: artifact.execution.plan,
      creativeIntent: artifact.creativeIntent,
      tracePlan: artifact,
    };
  }

  const executionPlan = buildScriptEditorialPlan({
    productionBrief: input.productionBrief,
    contentSignalProfile: input.contentSignalProfile,
  });
  return {
    executionPlan,
    creativeIntent: {
      source: 'direct_brief',
      overridePolicy: 'current_instruction',
    },
    tracePlan: executionPlan,
  };
}

function singleLineScriptField(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function beatMarkdown(beat: NarrativeBeatV2, beatIndex: number, showHeading: boolean): string {
  const rows = showHeading
    ? [`### Beat ${beatIndex + 1}: ${singleLineScriptField(beat.narrativePurpose)}`]
    : [];
  rows.push(
    `**Narration:** ${singleLineScriptField(getCanonicalBeatSpokenText(beat))}`,
    `**Visual:** ${singleLineScriptField(beat.visualIntent?.description ?? '')}`,
  );
  return rows.join('\n');
}

function materializeScriptContent(sidecar: ScriptSidecarV2): string {
  const showActs = sidecar.acts.length > 1;
  let sceneNumber = 0;

  return sidecar.acts
    .map((act, actIndex) => {
      const rows = showActs
        ? [`# Act ${actIndex + 1}: ${singleLineScriptField(act.title)}`]
        : [];
      act.narrativeScenes.forEach((scene) => {
        sceneNumber += 1;
        rows.push([
          `## Scene ${sceneNumber}: ${singleLineScriptField(scene.title)}`,
          ...scene.beats.map((beat, beatIndex) => beatMarkdown(beat, beatIndex, scene.beats.length > 1)),
        ].join('\n'));
      });
      return rows.join('\n\n');
    })
    .join('\n\n');
}

function promptForBeat(beat: NarrativeBeatV2, beatIndex: number): string {
  const overlays = beat.visualIntent?.onScreenText.filter((text) => text.trim().length > 0) ?? [];
  const shotIntent = beat.shotIntent;
  const performances = shotIntent?.performance.map((performance) => [
    performance.characterId,
    performance.emotion,
    performance.gaze,
    performance.gesture,
    performance.movement,
  ].join(', ')) ?? [];
  const parts = [
    `Beat ${beatIndex + 1}: ${singleLineScriptField(beat.visualIntent?.description ?? beat.narrativePurpose)}`,
    beat.visualIntent?.motion ? `Motion: ${singleLineScriptField(beat.visualIntent.motion)}` : '',
    shotIntent
      ? `Shot: ${shotIntent.action}; ${shotIntent.desiredFraming}; ${shotIntent.desiredAngle}; ${shotIntent.desiredMovement}`
      : '',
    performances.length > 0 ? `Performance: ${performances.join(' | ')}` : '',
    beat.visualIntent?.imageQualityTokens
      ? `Image quality: ${singleLineScriptField(beat.visualIntent.imageQualityTokens)}`
      : '',
    beat.visualIntent?.videoQualityTokens
      ? `Video quality: ${singleLineScriptField(beat.visualIntent.videoQualityTokens)}`
      : '',
    overlays.length > 0 ? `Text overlays: ${overlays.join(' | ')}` : '',
    beat.audioIntent?.ambience ? `Ambience: ${singleLineScriptField(beat.audioIntent.ambience)}` : '',
    beat.audioIntent?.music ? `Music: ${singleLineScriptField(beat.audioIntent.music)}` : '',
    beat.audioIntent?.sfx.length ? `SFX: ${beat.audioIntent.sfx.join(' | ')}` : '',
  ].filter(Boolean);

  return parts.join('. ');
}

function promptForScene(scene: NarrativeSceneV2, index: number): string {
  return [
    `Scene ${index + 1}: ${singleLineScriptField(scene.title)}`,
    ...scene.beats.map(promptForBeat),
  ].join('\n');
}

function narrativeScenes(sidecar: ScriptSidecarV2): NarrativeSceneV2[] {
  return sidecar.acts.flatMap((act) => act.narrativeScenes);
}

function sceneDurationIntent(scene: NarrativeSceneV2): number {
  if (scene.durationIntentSeconds !== undefined) return scene.durationIntentSeconds;
  if (scene.beats.some((beat) => beat.durationIntentSeconds === undefined)) return 0;
  return scene.beats.reduce((sum, beat) => sum + (beat.durationIntentSeconds ?? 0), 0);
}

function spokenLanguages(sidecar: ScriptSidecarV2): string[] {
  const languages = new Set<string>();
  sidecar.acts.forEach((act) => act.narrativeScenes.forEach((scene) => scene.beats.forEach((beat) => {
    beat.lines.forEach((line) => {
      if (line.delivery !== 'on-screen-text' && line.languageCode) languages.add(line.languageCode);
    });
  })));
  return [...languages];
}

export function materializeScriptWriterResult(modelOutput: ScriptWriterModelOutput): ScriptWriterResult {
  const sidecar = parseModelSidecarForMaterialization(modelOutput.sidecar);
  const scenes = narrativeScenes(sidecar);

  return parseMaterializedScriptWriterResult({
    content: materializeScriptContent(sidecar),
    contentAnalysis: modelOutput.contentAnalysis,
    visualMetadata: {
      motionInfo: modelOutput.visualMetadata.motionInfo,
      scenePrompts: scenes.map(promptForScene),
    },
    metadata: {
      estimatedTimeSeconds: scenes.reduce((sum, scene) => sum + sceneDurationIntent(scene), 0),
      platform: modelOutput.metadata.platform,
      voiceLanguages: spokenLanguages(sidecar),
    },
    sidecar,
  });
}

export class ScriptWriterContractError extends Error {
  readonly failures: readonly string[];

  constructor(failures: string[]) {
    super(`Script writer output failed document contract: ${failures.join(', ')}`);
    this.name = 'ScriptWriterContractError';
    this.failures = failures;
  }
}

function parseModelSidecarForMaterialization(input: unknown): ScriptSidecarV2 {
  try {
    return parseScriptSidecarV2(input);
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    throw new ScriptWriterContractError(error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'sidecar';
      return `invalid_sidecar:${path}:${issue.message}`;
    }));
  }
}

function parseMaterializedScriptWriterResult(input: unknown): ScriptWriterResult {
  try {
    return ScriptWriterResultSchema.parse(input);
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    throw new ScriptWriterContractError(error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'result';
      return `invalid_writer_result:${path}:${issue.message}`;
    }));
  }
}

const REPAIRABLE_SCRIPT_CONTRACT_CODES = new Set([
  'invalid_sidecar',
  'invalid_writer_result',
  'writer_render_plan_forbidden',
  'missing_visual_intent',
  'missing_shot_intent',
  'empty_spoken_line',
  'missing_spoken_line_language',
  'unrequested_spoken_language',
  'missing_scene_duration',
  'missing_beat_duration',
  'scene_beat_duration_mismatch',
  'runtime_duration_mismatch',
  'beat_kind_speech_mismatch',
  'beat_kind_missing_speech',
  'narration_mode_missing_speech',
  'narration_density_below_mode',
  'missing_cast_character',
  'unused_cast_character',
  'cast_character_has_no_voice',
  'invalid_source_ref',
  'missing_source_ref',
  'platform_mismatch',
  'profile_forbidden_term',
  'profile_missing_required_brief_claim',
  'profile_missing_required_audience_anchor',
  'profile_internal_metadata_leaked',
]);

function contractFailureCode(failure: string): string {
  const separator = failure.indexOf(':');
  return separator === -1 ? failure : failure.slice(0, separator);
}

function isRepairableScriptContractError(error: unknown): error is ScriptWriterContractError {
  return error instanceof ScriptWriterContractError
    && error.failures.length > 0
    && error.failures.every((failure) => REPAIRABLE_SCRIPT_CONTRACT_CODES.has(contractFailureCode(failure)));
}

function buildScriptContractRepairSystemInstruction(
  systemInstruction: string,
  failure: ScriptWriterContractError,
): string {
  return `${systemInstruction}

<writer_contract_repair>
The previous structured output failed a production writer contract:
${failure.failures.map((item) => `- ${item}`).join('\n')}

Return a complete replacement object using the same JSON schema. Preserve the brief's facts, brand intent, source references, casting, and overall narrative. Repair every listed contract violation without inventing facts.

Critical rules:
- Preserve the authored act, narrative-scene, and beat hierarchy unless an editorial contract failure requires changing it. Never split story units to satisfy a renderer.
- Every beat requires visualIntent, shotIntent, and narrative duration intent. Every spoken line requires its actual languageCode.
- shotIntent.energy and every performance intensity use normalized decimal values from 0 to 1. A moving shot requires a non-empty movementMotivation. shotIntent.spokenAudio is true exactly when the beat contains on-camera sync-dialogue; simultaneousPerformers equals the unique performance character count, and every sync speaker has a performance entry.
- Omit renderPlan. Technical segmentation is authored later from this narrative sidecar.
- When the failure includes runtime_duration_mismatch, narration_mode_missing_speech, or narration_density_below_mode, use tf_untrusted_data.editorialPlan as binding. Preserve the exact total runtime and selected narration mode. Develop the supported argument or story with substantive beats; represent deliberate non-verbal intervals as visual or transition beats. Never pad prose, durations, metadata, or empty lines to game the contract.
- For profile_missing_required_brief_claim or profile_missing_required_audience_anchor, copy the corresponding exact value from tf_untrusted_data.contentSignalProfile.intent.proofPoints into natural script copy without broadening it.
- For missing_source_ref or invalid_source_ref, use writer_contract_repair_input.validatorDiagnostics and the authorised Source Ledger. Attach a reference only when its source directly supports that scene, beat, or line; otherwise delete or rewrite the unsupported claim. Never cite by keyword resemblance alone.
- Preserve source references on every factual scene, beat, and line. Do not create a reference ID that is absent from the Source Ledger.
</writer_contract_repair>`;
}

function buildScriptContractRepairDiagnostics(
  modelOutput: ScriptWriterModelOutput,
  failure: ScriptWriterContractError,
  input: Pick<ScriptWriterInput, 'sourceLedger' | 'contentSignalProfile'>,
): Record<string, unknown> {
  let profileViolations: Array<{ id: string; message: string; location?: string }> = [];
  if (input.contentSignalProfile) {
    try {
      const materialized = materializeScriptWriterResult(modelOutput);
      profileViolations = evaluateContentProfileCompliance(
        materialized.content,
        input.contentSignalProfile,
      ).violations
        .filter((violation) => violation.severity === 'critical')
        .map((violation) => ({
          id: violation.id,
          message: violation.message,
          ...(violation.location ? { location: violation.location } : {}),
        }));
    } catch {
      // Structural failures are already localized by failure paths below.
    }
  }

  return {
    failures: [...failure.failures],
    authorizedSourceRefs: input.sourceLedger?.entries.map((entry) => ({
      referenceId: entry.referenceId,
      title: entry.title,
    })) ?? [],
    profileViolations,
  };
}

function attachEvalRejectedScriptOutput(error: unknown, modelOutput: ScriptWriterModelOutput): void {
  if (process.env.THINKFORGE_EVAL_CAPTURE_REJECTED_OUTPUT !== '1' || !(error instanceof Error)) return;
  Object.defineProperty(error, 'rejectedOutput', {
    value: modelOutput,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

function validateCastingBriefCompliance(
  sidecar: ScriptSidecarV2,
  productionBrief: ProductionBrief | null | undefined,
  failures: string[],
): void {
  const castingEntries = getAvatarCastingEntries(productionBrief);
  if (castingEntries.length === 0) return;

  const characterIds = new Set(sidecar.characters.map((character) => character.id));
  for (const [characterId, binding] of castingEntries) {
    if (!characterIds.has(characterId)) {
      failures.push(`missing_cast_character:${characterId}`);
      continue;
    }

    let used = false;
    sidecar.acts.forEach((act, actIndex) => act.narrativeScenes.forEach((scene, sceneIndex) => {
      if (scene.charactersPresent.includes(characterId)) used = true;
      scene.beats.forEach((beat, beatIndex) => beat.lines.forEach((line) => {
        if (line.speakerId !== characterId) return;
        used = true;
        if (line.delivery !== 'on-screen-text' && binding.voice.mode === 'none') {
          failures.push(
            `cast_character_has_no_voice:${characterId}:act_${actIndex + 1}.scene_${sceneIndex + 1}.beat_${beatIndex + 1}`,
          );
        }
      }));
    }));

    if (!used) failures.push(`unused_cast_character:${characterId}`);
  }
}

/** Provider output capacity; editorial structure and pacing come from buildScriptEditorialPlan. */
const SCRIPT_WRITER_MAX_OUTPUT_TOKENS = 65_536;
const SCRIPT_WRITER_THINKING_BUDGET_TOKENS = 8_192;
const TOKENS_PER_MAXIMUM_SPOKEN_WORD = 14;
const TOKENS_PER_RUNTIME_SECOND_FOR_SIDECAR = 12;
/** Minimum visible response budget when the brief has no runtime target. */
const SCRIPT_WRITER_DEFAULT_VISIBLE_OUTPUT_TOKENS = 8_192;

interface ScriptRuntimeContract {
  targetDurationSeconds: number;
  minimumDurationSeconds: number;
  maximumDurationSeconds: number;
  narrationMode: ReturnType<typeof buildScriptEditorialPlan>['narration']['mode'];
  minimumModeWordsPerMinute: number;
  targetWordsPerMinute: number;
  comfortableMaximumWordsPerMinute: number;
  fullRuntimeReferenceSpokenWords: number;
  fullRuntimeComfortableMaximumSpokenWords: number;
}

/** Derive the enforceable runtime contract from a production brief (or a {@link ProductionBrief}-shaped object). */
export function resolveScriptRuntimeContract(
  brief: { output?: { targetDurationSec?: number | null } } | null | undefined,
  contentSignalProfile?: ThinkForgeContentSignalProfile | null,
): ScriptRuntimeContract | null {
  const plan = buildScriptEditorialPlan({
    productionBrief: brief as Pick<ProductionBrief, 'output'> | null | undefined,
    contentSignalProfile,
  });
  if (plan.runtime.policy !== 'exact' || plan.narration.wordBudgetPolicy !== 'guided') return null;
  return {
    targetDurationSeconds: plan.runtime.targetDurationSeconds,
    minimumDurationSeconds: plan.runtime.minimumDurationSeconds,
    maximumDurationSeconds: plan.runtime.maximumDurationSeconds,
    narrationMode: plan.narration.mode,
    minimumModeWordsPerMinute: plan.narration.minimumModeWordsPerMinute,
    targetWordsPerMinute: plan.narration.targetWordsPerMinute,
    comfortableMaximumWordsPerMinute: plan.narration.comfortableMaximumWordsPerMinute,
    fullRuntimeReferenceSpokenWords: plan.narration.fullRuntimeReferenceSpokenWords,
    fullRuntimeComfortableMaximumSpokenWords:
      plan.narration.fullRuntimeComfortableMaximumSpokenWords,
  };
}

export type ScriptGenerationFeasibility =
  | {
      mode: 'single_pass';
      requiredOutputTokens: number;
      requiredVisibleOutputTokens: number;
      thinkingBudgetTokens: number;
      maximumOutputTokens: number;
      maximumSinglePassDurationSeconds: number | null;
    }
  | {
      mode: 'chaptered_required';
      requiredOutputTokens: number;
      requiredVisibleOutputTokens: number;
      thinkingBudgetTokens: number;
      maximumOutputTokens: number;
      maximumSinglePassDurationSeconds: number;
      requestedDurationSeconds: number;
    };

export class ScriptWriterCapacityError extends Error {
  readonly code = 'SCRIPT_REQUIRES_CHAPTERED_GENERATION';
  readonly feasibility: Extract<ScriptGenerationFeasibility, { mode: 'chaptered_required' }>;

  constructor(feasibility: Extract<ScriptGenerationFeasibility, { mode: 'chaptered_required' }>) {
    super(
      `Script writer requires chaptered generation: requested ${feasibility.requestedDurationSeconds}s `
      + `needs approximately ${feasibility.requiredVisibleOutputTokens} response tokens plus `
      + `${feasibility.thinkingBudgetTokens} reasoning tokens; the current single-pass `
      + `writer supports up to ${feasibility.maximumSinglePassDurationSeconds}s without truncation.`,
    );
    this.name = 'ScriptWriterCapacityError';
    this.feasibility = feasibility;
  }
}

export function resolveScriptGenerationFeasibility(
  input: Pick<ScriptWriterInput, 'productionBrief' | 'contentSignalProfile'>,
): ScriptGenerationFeasibility {
  return resolveScriptGenerationFeasibilityForPlan(buildScriptEditorialPlan(input));
}

function resolveScriptGenerationFeasibilityForPlan(
  plan: ScriptEditorialPlan,
): ScriptGenerationFeasibility {
  if (plan.runtime.policy !== 'exact' || plan.narration.wordBudgetPolicy !== 'guided') {
    const requiredVisibleOutputTokens = SCRIPT_WRITER_DEFAULT_VISIBLE_OUTPUT_TOKENS;
    return {
      mode: 'single_pass',
      requiredOutputTokens: requiredVisibleOutputTokens + SCRIPT_WRITER_THINKING_BUDGET_TOKENS,
      requiredVisibleOutputTokens,
      thinkingBudgetTokens: SCRIPT_WRITER_THINKING_BUDGET_TOKENS,
      maximumOutputTokens: SCRIPT_WRITER_MAX_OUTPUT_TOKENS,
      maximumSinglePassDurationSeconds: null,
    };
  }

  const estimatedVisibleOutputTokens = Math.ceil(
    plan.narration.fullRuntimeComfortableMaximumSpokenWords * TOKENS_PER_MAXIMUM_SPOKEN_WORD
    + plan.runtime.targetDurationSeconds * TOKENS_PER_RUNTIME_SECOND_FOR_SIDECAR,
  );
  const requiredVisibleOutputTokens = Math.max(
    SCRIPT_WRITER_DEFAULT_VISIBLE_OUTPUT_TOKENS,
    estimatedVisibleOutputTokens,
  );
  const maximumVisibleOutputTokens =
    SCRIPT_WRITER_MAX_OUTPUT_TOKENS - SCRIPT_WRITER_THINKING_BUDGET_TOKENS;
  const tokensPerRuntimeSecond =
    (plan.narration.comfortableMaximumWordsPerMinute / 60) * TOKENS_PER_MAXIMUM_SPOKEN_WORD
    + TOKENS_PER_RUNTIME_SECOND_FOR_SIDECAR;
  const maximumSinglePassDurationSeconds = Math.floor(
    maximumVisibleOutputTokens / tokensPerRuntimeSecond,
  );

  if (requiredVisibleOutputTokens > maximumVisibleOutputTokens) {
    return {
      mode: 'chaptered_required',
      requiredOutputTokens: requiredVisibleOutputTokens + SCRIPT_WRITER_THINKING_BUDGET_TOKENS,
      requiredVisibleOutputTokens,
      thinkingBudgetTokens: SCRIPT_WRITER_THINKING_BUDGET_TOKENS,
      maximumOutputTokens: SCRIPT_WRITER_MAX_OUTPUT_TOKENS,
      maximumSinglePassDurationSeconds,
      requestedDurationSeconds: plan.runtime.targetDurationSeconds,
    };
  }

  return {
    mode: 'single_pass',
    requiredOutputTokens: requiredVisibleOutputTokens + SCRIPT_WRITER_THINKING_BUDGET_TOKENS,
    requiredVisibleOutputTokens,
    thinkingBudgetTokens: SCRIPT_WRITER_THINKING_BUDGET_TOKENS,
    maximumOutputTokens: SCRIPT_WRITER_MAX_OUTPUT_TOKENS,
    maximumSinglePassDurationSeconds,
  };
}

/** Reserve enough provider output for spoken copy plus structured production metadata. */
function durationAwareMaxTokens(plan: ScriptEditorialPlan): number {
  const feasibility = resolveScriptGenerationFeasibilityForPlan(plan);
  if (feasibility.mode === 'chaptered_required') throw new ScriptWriterCapacityError(feasibility);
  return feasibility.requiredOutputTokens;
}

function countSpokenWords(beat: NarrativeBeatV2): number {
  return beat.lines.reduce((total, line) => {
    if (line.delivery === 'on-screen-text' || !line.text.trim() || !line.languageCode) return total;
    return total + countUnicodeWords(line.text);
  }, 0);
}

export interface ScriptWriterValidationReport {
  editorialWarnings: string[];
}

export function assertUsableScriptWriterResult(
  result: ScriptWriterResult,
  options: ScriptWriterValidationOptions = {},
): ScriptWriterValidationReport {
  const failures: string[] = [];
  const editorialWarnings: string[] = [];
  let sidecar: ScriptSidecarV2;
  try {
    sidecar = parseScriptSidecarV2(result.sidecar);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    throw new ScriptWriterContractError([`invalid_sidecar:${message}`]);
  }

  const scenes = narrativeScenes(sidecar);
  const spokenBeatWordCounts: number[] = [];
  const expectedPrompts = scenes.map(promptForScene);
  const expectedDuration = scenes.reduce((sum, scene) => sum + sceneDurationIntent(scene), 0);
  const expectedLanguages = spokenLanguages(sidecar);
  if (result.content !== materializeScriptContent(sidecar)) failures.push('materialized_content_mismatch');
  if (JSON.stringify(result.visualMetadata.scenePrompts) !== JSON.stringify(expectedPrompts)) {
    failures.push('materialized_scene_prompts_mismatch');
  }
  if (Math.abs(result.metadata.estimatedTimeSeconds - expectedDuration) > 0.001) {
    failures.push('materialized_duration_mismatch');
  }
  if (JSON.stringify(result.metadata.voiceLanguages) !== JSON.stringify(expectedLanguages)) {
    failures.push('materialized_voice_languages_mismatch');
  }

  if (sidecar.renderPlan) failures.push('writer_render_plan_forbidden');
  const requestedLanguages = options.productionBrief?.output.voiceLanguages ?? [];
  sidecar.acts.forEach((act, actIndex) => act.narrativeScenes.forEach((scene, sceneIndex) => {
    const sceneLabel = `act_${actIndex + 1}.scene_${sceneIndex + 1}`;
    if (scene.durationIntentSeconds === undefined) failures.push(`missing_scene_duration:${sceneLabel}`);

    let completeBeatDuration = true;
    const beatDurationTotal = scene.beats.reduce((sum, beat, beatIndex) => {
      const beatLabel = `${sceneLabel}.beat_${beatIndex + 1}`;
      if (!beat.visualIntent) failures.push(`missing_visual_intent:${beatLabel}`);
      if (!beat.shotIntent) failures.push(`missing_shot_intent:${beatLabel}`);
      if (beat.durationIntentSeconds === undefined) {
        completeBeatDuration = false;
        failures.push(`missing_beat_duration:${beatLabel}`);
      }

      beat.lines.forEach((line, lineIndex) => {
        if (line.delivery === 'on-screen-text') return;
        const lineLabel = `${beatLabel}.line_${lineIndex + 1}`;
        if (!line.text.trim()) failures.push(`empty_spoken_line:${lineLabel}`);
        if (!line.languageCode) {
          failures.push(`missing_spoken_line_language:${lineLabel}`);
          return;
        }
        if (requestedLanguages.length > 0 && !requestedLanguages.some((requested) => {
          const actual = line.languageCode!.toLowerCase();
          const expected = requested.toLowerCase();
          return expected.includes('-') ? actual === expected : actual === expected || actual.startsWith(`${expected}-`);
        })) {
          failures.push(`unrequested_spoken_language:${lineLabel}:${line.languageCode}`);
        }
      });

      const spokenWordCount = countSpokenWords(beat);
      const hasSpokenContent = spokenWordCount > 0;
      if (hasSpokenContent && (beat.kind === 'visual' || beat.kind === 'transition')) {
        failures.push(`beat_kind_speech_mismatch:${beatLabel}:${beat.kind}`);
      }
      if (!hasSpokenContent && (beat.kind === 'voiceover' || beat.kind === 'dialogue')) {
        failures.push(`beat_kind_missing_speech:${beatLabel}:${beat.kind}`);
      }
      if (hasSpokenContent && beat.durationIntentSeconds !== undefined) {
        spokenBeatWordCounts.push(spokenWordCount);
      }

      return sum + (beat.durationIntentSeconds ?? 0);
    }, 0);

    if (scene.durationIntentSeconds !== undefined
      && completeBeatDuration
      && Math.abs(scene.durationIntentSeconds - beatDurationTotal) > 0.001) {
      failures.push(
        `scene_beat_duration_mismatch:${sceneLabel}:${scene.durationIntentSeconds}s/${beatDurationTotal}s`,
      );
    }
  }));

  validateCastingBriefCompliance(sidecar, options.productionBrief, failures);

  const briefPlatform = options.productionBrief?.output.platform;
  if (briefPlatform && result.metadata.platform.toLowerCase() !== briefPlatform.toLowerCase()) {
    failures.push(`platform_mismatch:${result.metadata.platform}/${briefPlatform}`);
  }

  const runtimeTargetSec = options.productionBrief?.output.targetDurationSec;
  if (typeof runtimeTargetSec === 'number' && Number.isFinite(runtimeTargetSec) && runtimeTargetSec > 0) {
    const contract = resolveScriptRuntimeContract(options.productionBrief, options.contentSignalProfile);
    if (!contract) {
      throw new ScriptWriterContractError(['runtime_contract_unavailable']);
    }
    if (expectedDuration < contract.minimumDurationSeconds || expectedDuration > contract.maximumDurationSeconds) {
      failures.push(`runtime_duration_mismatch:${expectedDuration}s/${runtimeTargetSec}s`);
    }
    if (spokenBeatWordCounts.length === 0 && contract.narrationMode !== 'minimal') {
      failures.push(`narration_mode_missing_speech:${contract.narrationMode}`);
    }
    const totalSpokenWords = spokenBeatWordCounts.reduce((total, wordCount) => total + wordCount, 0);
    const fullRuntimeWordsPerMinute = expectedDuration > 0
      ? (totalSpokenWords / expectedDuration) * 60
      : 0;
    if (totalSpokenWords > 0 && fullRuntimeWordsPerMinute < contract.minimumModeWordsPerMinute) {
      failures.push(
        `narration_density_below_mode:${fullRuntimeWordsPerMinute.toFixed(1)}/${contract.minimumModeWordsPerMinute}:${contract.narrationMode}`,
      );
    }
    if (fullRuntimeWordsPerMinute > contract.comfortableMaximumWordsPerMinute) {
      editorialWarnings.push(
        `wpm_exceeds_format:${fullRuntimeWordsPerMinute.toFixed(1)}/${contract.comfortableMaximumWordsPerMinute}:${contract.narrationMode}`,
      );
    }
  }

  failures.push(...findSourceLedgerIssuesForNarrativeSidecar(sidecar, options.sourceLedger));

  if (options.contentSignalProfile) {
    const profileCompliance = evaluateContentProfileCompliance(
      result.content,
      options.contentSignalProfile,
    );
    if (shouldAutoRepairContentProfileViolations(profileCompliance.violations)) {
      failures.push(...profileCompliance.violations
        .filter((violation) => violation.severity === 'critical')
        .map((violation) => violation.id));
    }
  }

  if (failures.length > 0) {
    throw new ScriptWriterContractError(failures);
  }

  return { editorialWarnings };
}

export class ScriptWriterAgent extends StructuredAgent<ScriptWriterResult> {
  protected schema = ScriptWriterResultSchema;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'script_writer',
      // Default to flash for core creative thinking
      modelName: config?.modelName ?? 'gemini-2.5-flash',
      maxTokens: config?.maxTokens ?? 8192,
      temperature: config?.temperature ?? 0.7,
    });
  }

  private buildTrustedTemplate(input: ScriptWriterInput): string {
    const { context, userPrompt, retrievedContext, editContext, productionBrief, sourceLedger } = input;
    const sourceLedgerBlock = sourceLedger ? formatSourceLedgerForPrompt(sourceLedger) : '';
    const trendBriefBlock = formatTrendBriefForPrompt(productionBrief);
    const castingBriefBlock = formatCastingBriefForPrompt(productionBrief);


    // The full graph block is intentionally omitted. The server resolves one compatible structure
    // and narration technique into editorialPlan so the model executes rather than re-selects craft.

    // P5 edit mode: revise an existing script instead of writing from scratch. Brand DNA, facts,
    // and generation requirements below apply to BOTH modes; only the opening frame differs.
    let prompt = editContext
      ? `You are an elite Video Scriptwriter and Creative Director.
You are REVISING an existing video script. Apply the requested change and return the COMPLETE revised script.

## Current Script (revise this -- do not start over)
${editContext.existingContent || '(the current script is empty)'}
${editContext.selection ? `\n## Focused Selection (the change targets this text)\n"${editContext.selection}"\n` : ''}${editContext.focusHint ? `**Focus:** ${editContext.focusHint}\n` : ''}
## Requested Change
${editContext.instruction}

## Edit Rules (mandatory)
1. Return the complete revised V2 narrative sidecar, not a diff or only the changed beat. Every retained act, narrative scene, beat, and line must reappear unless the requested edit changes it.
2. Preserve the existing hierarchy and narrative order except where the requested edit demands otherwise.
3. Preserve all supplied facts verbatim: dates, times, locations, brand/event/product names, offers, prices, statistics, CTA links, and required logo/text mentions.
4. Keep spoken words in beat lines, visual direction in visualIntent, and production intent in shotIntent. Never reconstruct a technical render plan.
`
      : `You are an elite Video Scriptwriter and Creative Director.
Your task is to write a high-retention, engaging video script.

## Context
**Project Summary:** ${context.projectSummary || 'No summary provided.'}
**User Prompt:** ${userPrompt}

`;

    // 1. Inject Brand DNA (System Brief)
    if (context.systemBrief) {
      prompt += `## Brand DNA & Memory\n${context.systemBrief}\n\n`;
    }

    // 2. Inject DataBank / Retrieved Context
    const facts = [...(retrievedContext?.projectFacts || []), ...(retrievedContext?.globalFacts || [])];
    if (facts.length > 0) {
      prompt += `## Relevant Knowledge (DataBank)\n`;
      facts.forEach((fact, i) => {
        prompt += `[Source ${i + 1} - ${fact.title}]: ${fact.summary}\n`;
      });
      prompt += '\n';
    }

    if (trendBriefBlock) {
      prompt += `${trendBriefBlock}\n\n`;
    }

    if (castingBriefBlock) {
      prompt += `${castingBriefBlock}\n\n`;
    }

    if (sourceLedgerBlock) {
      prompt += `${sourceLedgerBlock}\n\n`;
    }

    // 3. Script Writing Rules
    prompt += `## Generation Requirements
1. **One narrative source:** Author the complete script in sidecar with sidecarVersion: ${SCRIPT_SIDECAR_V2_VERSION} and spokenTextSource: "beat-lines". Do not author visible markdown, duplicate narration fields, or renderPlan; the server derives displays and a later technical planner derives render segments.
2. **Hierarchy and creative intent:** Use acts -> narrativeScenes -> beats -> lines. A short piece still has one structural act wrapper. tf_untrusted_data.creativeIntent is the server-resolved binding creative direction. When its source is selected_angle, execute its title, strategic purpose, and creative treatment as one coherent angle; the broad user brief and project summary are background and must not replace it. Depart only when the current edit instruction explicitly asks to replace that direction. Creative intent is framing, not evidence, and cannot override Brand Vault constraints, factual provenance, compliance, or the output contract. Create multiple acts only for genuine macro turns in the argument, story, time, or audience understanding. Start a new narrative scene only for a meaningful change in purpose, argument, time/place, speaker mode, evidence, emotion, or visual treatment. Runtime never creates, forbids, or counts acts, scenes, or beats.
3. **Canonical speech:** Ordered beat lines are the only audible-text source. Use voiceover for off-camera speech, sync-dialogue only for speech captured on camera, and on-screen-text only for visible text. Every spoken line identifies speakerId, actual languageCode, delivery, camera presence, and source refs.
4. **Editorial doctrine:** Execute tf_untrusted_data.editorialPlan's runtime, narration mode, act policy, scene-boundary policy, and anti-patterns as binding. Its structure.recommendedTechniques are advisory candidates, not permission to replace the selected idea or force a copywriting formula. Follow an explicit user-selected structure when present; otherwise choose one coherent structure that serves the approved angle and evidence. Never splice several formulas together mechanically. When runtime.policy is "exact", meet its exact total. Narration density is a full-runtime mode contract, never a per-beat quota: anchor/standard voiceover cannot fall below the knowledge base's 120 WPM slow-VO floor; complement/counterpoint must remain above the 0-50 WPM minimal-narration band; minimal mode may be silent. Preserve deliberate pauses and visual intervals as meaningful visual or transition beats rather than pretending a few words occupy the whole runtime. Never pad prose to hit a target. The comfortable maximum is an overridable warning, not permission to rewrite story units. When runtime is "open", let the supported narrative determine runtime and spoken-word count; never interpret missing duration as zero. Do not add CTA, hashtags, urgency, humor, or a formulaic hook unless the plan or user brief calls for them.
5. **Duration integrity:** Give every narrative scene and beat a positive durationIntentSeconds. Beat durations must sum to their parent scene. When runtime.policy is "exact", scene durations must also sum to that requested total. A long coherent scene or beat may remain long. Use voiceover/dialogue/mixed for beats with speech; use visual/transition for deliberate non-verbal time. If a mixed beat contains a substantial speech-free interval, represent that interval as its own meaningful visual or transition beat. Never pad with timestamps, silence labels, repeated words, or fake visual pauses.
6. **Factual truth:** Treat the user brief and authorised Source Ledger as the only factual inputs. An idea/angle is framing, not evidence. Preserve exact names, dates, locations, offers, prices, statistics, URLs, contact details, and mandated copy. When tf_untrusted_data.contentSignalProfile.intent.proofPoints contains a Required brief claim or Required audience anchor, include that value exactly in natural script copy. Never invent proof, testimonials, logos, or product facts.
7. **Provenance:** Use only Source Ledger referenceId values. Carry refs at sidecar, scene, beat, and line level. Every numeric/date/price/URL/proof/testimonial claim needs a real source ref; an undeclared ref is invalid.
8. **Visual and audio intent:** Every beat needs concrete visualIntent, including motion, quality, asset recommendation, and intended on-screen text when relevant. Describe what the viewer can actually see; avoid empty style adjectives. Add audioIntent when ambience, music, or SFX serves the beat.
9. **Characters and casting:** Include only characters used by the narrative. A visible character belongs in charactersPresent; a speaking line uses that character's exact ID. Follow the casting contract without inventing avatar or voice IDs. Do not translate, split, shorten, or move speech merely to satisfy a renderer.
10. **Shot intent:** Every beat needs one complete shotIntent expressing creative purpose, emotional beat, energy, visual priority, action, framing, angle, movement, performance, and continuity. Express shotIntent.energy and every performance intensity as normalized decimals from 0 to 1, never a 1-5 or 1-10 scale. A moving shot requires a non-empty movementMotivation. spokenAudio is true exactly when the beat contains on-camera sync-dialogue. simultaneousPerformers equals the number of unique performance character IDs, and every sync speaker has a matching performance entry. Never invent equipment, room dimensions, coordinates, budgets, or setup claims.
11. **Technical separation:** Do not mention lip-sync job length, provider language support, model limits, scene caps, or render chunks. Preserve narrative intent. Production planning will later emit compatibility warnings, alternatives, and provider-safe segments without rewriting the story.
12. **Metadata:** Set only the publication platform requested in tf_untrusted_data.productionOutput. Duration and spoken languages are derived by the server from the sidecar.

Return your response strictly adhering to the JSON schema.`;

    return prompt;
  }

  buildPrompt(input: ScriptWriterInput): string {
    const parts = this.buildPromptParts(input);
    const inspectionPrompt = parts.prompt.replaceAll('\\n', '\n').replaceAll('\\"', '"');
    return `${parts.systemInstruction}\n\n${inspectionPrompt}`;
  }

  buildPromptParts(
    input: ScriptWriterInput,
    resolvedEditorial: ResolvedScriptEditorialContext = resolveScriptEditorialContext(input),
  ): IsolatedPromptParts {
    const editorialPlan = resolvedEditorial.executionPlan;
    const placeholderInput: ScriptWriterInput = {
      ...input,
      userPrompt: '[tf_untrusted_data.userBrief]',
      context: {
        ...input.context,
        projectSummary: '[tf_untrusted_data.projectSummary]',
        systemBrief: '',
      },
      retrievedContext: undefined,
      productionBrief: null,
      sourceLedger: null,
      editContext: input.editContext
        ? {
            existingContent: '[tf_untrusted_data.edit.existingContent]',
            instruction: '[tf_untrusted_data.edit.instruction]',
            selection: input.editContext.selection ? '[tf_untrusted_data.edit.selection]' : undefined,
            focusHint: input.editContext.focusHint ? '[tf_untrusted_data.edit.focusHint]' : undefined,
          }
        : undefined,
    };
    const runtimeDataRules = `## Runtime Data Map
- Read Brand Vault and learned voice evidence only from tf_untrusted_data.brandContext.
- Read retrieved facts only from tf_untrusted_data.databankFacts.
- Read binding proof claims, forbidden terms, audience anchors, and format constraints only from tf_untrusted_data.contentSignalProfile.
- Read trend adaptation, casting, and provenance material only from tf_untrusted_data.trendBrief, castingBrief, and sourceLedger.
- Read binding creative direction only from tf_untrusted_data.creativeIntent. A selected angle survives ordinary generation and revision; only an explicit current edit instruction may replace it.
- Read exact creative destination and deliverable shape from tf_untrusted_data.authoringDestination when present. Read technical output platform and geometry only from tf_untrusted_data.productionOutput.
- Read runtime policy, full-runtime narration mode boundaries, content-led hierarchy policy, scene-boundary policy, and graph recommendations only from tf_untrusted_data.editorialPlan. Exact total runtime, mode-compatible minimum density, and beat-channel semantics are binding; target density is guidance, pacing excess is a warning, and structure recommendations are advisory. An open runtime carries no numeric target.
- Read requested spoken and caption languages from tf_untrusted_data.languageRequest. Never substitute a different language because of a downstream provider.`;

    return buildIsolatedPromptParts({
      systemInstruction: this.applyGlobalConstraints(
        `${this.buildTrustedTemplate(placeholderInput)}\n\n${runtimeDataRules}`,
      ),
      data: this.buildUntrustedPromptData(input, editorialPlan, resolvedEditorial.creativeIntent),
      fieldLimits: {
        projectSummary: 12_000,
        userBrief: 12_000,
        brandContext: 24_000,
        title: 300,
        summary: 4_000,
        trendBrief: 16_000,
        castingBrief: 16_000,
        sourceLedger: 32_000,
        existingContent: 32_000,
        instruction: 8_000,
        selection: 8_000,
        focusHint: 2_000,
      },
    });
  }

  private buildUntrustedPromptData(
    input: ScriptWriterInput,
    editorialPlan: ScriptEditorialPlan,
    creativeIntent: ThinkForgeEditorialCreativeIntent,
  ): Record<string, unknown> {
    const { context, userPrompt, retrievedContext, editContext, productionBrief, sourceLedger } = input;
    const facts = [...(retrievedContext?.projectFacts || []), ...(retrievedContext?.globalFacts || [])];

    return {
      mode: editContext ? 'revise_existing_script' : 'create_script',
      projectSummary: context.projectSummary || null,
      userBrief: userPrompt,
      brandContext: context.systemBrief || null,
      contentSignalProfile: input.contentSignalProfile ? {
        constraints: input.contentSignalProfile.profile.constraints,
        intent: input.contentSignalProfile.intent,
      } : null,
      databankFacts: facts.map((fact, index) => ({
        sourceId: requireSourceReferenceIdForFact(sourceLedger, fact, index),
        title: fact.title,
        summary: fact.summary,
      })),
      trendBrief: formatTrendBriefForPrompt(productionBrief) || null,
      creativeIntent,
      editorialPlan,
      castingBrief: formatCastingBriefForPrompt(productionBrief) || null,
      sourceLedger: sourceLedger ? formatSourceLedgerForPrompt(sourceLedger) : null,
      authoringDestination: input.authoringRequest
        ? {
            deliverable: describeThinkForgeAuthoringDeliverable(input.authoringRequest),
            outputKind: input.authoringRequest.contentContract.outputKind,
            platformSurfaceId: input.authoringRequest.platformSurface.id,
            publishingSurfaceId: input.authoringRequest.publishingSurface ?? null,
          }
        : null,
      productionOutput: productionBrief?.output ?? null,
      languageRequest: {
        spoken: productionBrief?.output.voiceLanguages ?? [],
        captions: productionBrief?.output.captionLanguages ?? [],
      },
      edit: editContext
        ? {
            existingContent: editContext.existingContent || null,
            instruction: editContext.instruction,
            selection: editContext.selection || null,
            focusHint: editContext.focusHint || null,
          }
        : null,
    };
  }

  // One schema-constrained completion is the canonical source of a script. A single,
  // low-temperature replacement is allowed after a proven authoring-contract failure.
  async runStructured(
    input: ScriptWriterInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal,
  ): Promise<AgentStructuredOutput<ScriptWriterResult>> {
    const resolvedEditorial = resolveScriptEditorialContext(input);
    const editorialPlan = resolvedEditorial.executionPlan;
    const recommendedMaxTokens = durationAwareMaxTokens(editorialPlan);
    const promptParts = this.buildPromptParts(input, resolvedEditorial);
    const gen = this.resolveGenConfig({
      ...overrides,
      maxTokens: overrides?.maxTokens ?? recommendedMaxTokens,
    });
    const initialGeneration = await generateStructuredWithWritingContextCache({
      prompt: promptParts.prompt,
      systemInstruction: promptParts.systemInstruction,
      schema: ScriptWriterModelOutputSchema,
      modelName: this.config.modelName,
      temperature: gen.temperature,
      maxTokens: gen.maxTokens,
      thinkingBudgetTokens: SCRIPT_WRITER_THINKING_BUDGET_TOKENS,
      abortSignal,
    });

    let modelOutput = initialGeneration.result;
    let result: ScriptWriterResult;
    let scriptContractRepairApplied = false;
    let repairFailureCodes: string[] = [];
    let repairCacheStatus: 'hit' | 'created' | 'inline' | undefined;
    let validationReport: ScriptWriterValidationReport;

    try {
      result = materializeScriptWriterResult(modelOutput);
      validationReport = assertUsableScriptWriterResult(result, {
        sourceLedger: input.sourceLedger,
        productionBrief: input.productionBrief,
        contentSignalProfile: input.contentSignalProfile,
      });
    } catch (error) {
      if (!isRepairableScriptContractError(error)) throw error;
      repairFailureCodes = [...error.failures];

      const repairData = buildIsolatedPromptParts({
        systemInstruction: 'The previous model output is untrusted repair input.',
        data: {
          previousModelOutput: modelOutput,
          validatorDiagnostics: buildScriptContractRepairDiagnostics(modelOutput, error, input),
        },
        totalLimit: 80_000,
      });

      const repairedGeneration = await generateStructuredWithWritingContextCache({
        prompt: `${promptParts.prompt}\n\n<writer_contract_repair>\n${repairData.prompt}\n</writer_contract_repair>`,
        systemInstruction: buildScriptContractRepairSystemInstruction(promptParts.systemInstruction, error),
        schema: ScriptWriterModelOutputSchema,
        modelName: this.config.modelName,
        temperature: Math.min(gen.temperature, 0.25),
        maxTokens: gen.maxTokens,
        thinkingBudgetTokens: SCRIPT_WRITER_THINKING_BUDGET_TOKENS,
        abortSignal,
      });
      repairCacheStatus = repairedGeneration.cacheStatus;
      modelOutput = repairedGeneration.result;
      scriptContractRepairApplied = true;
      try {
        result = materializeScriptWriterResult(modelOutput);
        validationReport = assertUsableScriptWriterResult(result, {
          sourceLedger: input.sourceLedger,
          productionBrief: input.productionBrief,
          contentSignalProfile: input.contentSignalProfile,
        });
      } catch (finalError) {
        attachEvalRejectedScriptOutput(finalError, modelOutput);
        throw finalError;
      }
    }

    if (validationReport.editorialWarnings.length > 0) {
      result.metadata.editorialWarnings = [...new Set(validationReport.editorialWarnings)];
    }

    return {
      result,
      metadata: {
        model: initialGeneration.modelName,
        notes: `writing_context_cache:${initialGeneration.cacheStatus}${scriptContractRepairApplied ? ';script_contract_repair:applied' : ''}${validationReport.editorialWarnings.length > 0 ? `;editorial_warnings:${validationReport.editorialWarnings.length}` : ''}`,
        writerTrace: buildThinkForgeWriterInvocationTrace({
          writerType: 'script',
          editorialPlan: resolvedEditorial.tracePlan,
          selectedTechniques: [
            editorialPlan.narration.selectedTechnique,
            ...editorialPlan.structure.recommendedTechniques,
          ].filter((technique): technique is NonNullable<typeof technique> => Boolean(technique)),
          promptTemplate: promptParts.systemInstruction,
          sourceLedger: input.sourceLedger,
          provider: 'gemini',
          model: initialGeneration.modelName,
          cacheStatus: initialGeneration.cacheStatus,
          repairFailureCodes,
          repairCacheStatus,
        }),
      },
    };
  }
}

export function createScriptWriterAgent(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
  return new ScriptWriterAgent(config);
}
