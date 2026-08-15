import { z } from 'zod';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput, AgentStructuredOutput } from './types';
import { generateStructuredWithWritingContextCache } from '../services/gemini-writing-context-cache';
import {
  WRITER_CAPABILITIES,
  canSpeakLanguage,
  speakingBeatNeedsSplit,
} from '../writer-capabilities';
import {
  parseScriptSidecar,
  SCRIPT_SIDECAR_VERSION,
  ScriptSidecarSchema,
  type ScriptSidecar,
} from '../schemas/script-sidecar';
import {
  findSourceLedgerIssuesForSidecar,
  formatSourceLedgerForPrompt,
  type SourceLedger,
} from '../provenance/source-ledger';
import { formatTrendBriefForPrompt } from './trend-brief-context';
import { formatCastingBriefForPrompt, getAvatarCastingEntries } from './casting-brief-context';
import { buildIsolatedPromptParts, type IsolatedPromptParts } from './prompt-boundary';
import type { ThinkForgeContentSignalProfile } from '../signals';
import { buildScriptEditorialPlan } from './script-editorial-plan';

const ContentAnalysisSchema = z.object({
  hooks: z.array(z.string()).describe('List of key hooks utilized in the script'),
  theme: z.string().describe('The core theme of the script'),
  emphasisPoints: z.array(z.string()).describe('Key moments intended for emphasis'),
  qualityScore: z.number().min(0).max(100).describe('Self-evaluated quality score (0-100) based on specificity and engagement'),
});

const WriterMetadataSchema = z.object({
  estimatedTimeSeconds: z.number().describe('Estimated duration of the script in seconds'),
  platform: z.string().describe('The targeted platform (e.g., youtube, tiktok)'),
  voiceLanguage: z.string().default(WRITER_CAPABILITIES.voiceLanguages[0] ?? 'en'),
});

const ScriptVisualMetadataSchema = z.object({
  motionInfo: z.string().describe('General motion graphic styling instructions'),
  scenePrompts: z.array(z.string()).describe('One deterministic visual prompt per Script Sidecar scene.'),
});

// The model authors one canonical scene representation. The visible markdown and scene prompts
// are derived from it so downstream consumers cannot receive divergent scene counts.
export const ScriptWriterModelOutputSchema = z.object({
  contentAnalysis: ContentAnalysisSchema,
  visualMetadata: z.object({
    motionInfo: z.string().describe('General motion graphic styling instructions'),
  }),
  metadata: WriterMetadataSchema,
  sidecar: ScriptSidecarSchema.describe('Canonical Script Sidecar v1 emitted in the single writer pass'),
});

// Public writer result consumed by the editor and exports after deterministic materialization.
export const ScriptWriterResultSchema = z.object({
  content: z.string().describe('The actual script text, formatted in markdown with scenes'),
  contentAnalysis: ContentAnalysisSchema,
  visualMetadata: ScriptVisualMetadataSchema,
  metadata: WriterMetadataSchema,
  sidecar: ScriptSidecarSchema,
});

export type ScriptWriterResult = z.infer<typeof ScriptWriterResultSchema>;
export type ScriptWriterModelOutput = z.infer<typeof ScriptWriterModelOutputSchema>;

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

const MARKDOWN_SCENE_HEADER_PATTERN = /^\s*#{1,3}\s+Scene\s+\d+\b/gim;
const NARRATION_LABEL_PATTERN = /^\s*\*\*(?:Narration|Voiceover|VO|Dialogue|On[- ]camera|Script):\*\*/im;
const VISUAL_LABEL_PATTERN = /^\s*\*\*(?:Visual|Shot|Camera|Video):\*\*/im;
const SCHEMA_ARTIFACT_PATTERNS = [
  /"kind"\s*:\s*"(?:header|paragraph|list|blockquote|scene|action|why|example|editorial)"/i,
  /"blocks"\s*:\s*\[/i,
  /"content"\s*:\s*\[\s*\{/i,
  /^\s*(?:header|paragraph|blockquote|list)\s*[:{]/im,
];

const RELIP_UNSAFE_OCCLUSION_PATTERN = /\b(masked|mask covering|face covered|covered face|hidden face|occluded face|heavy occlusion|silhouette|back turned|turned away|profile only)\b/i;
const RELIP_UNSAFE_MOTION_PATTERN = /\b(rapid|chaotic|whip pan|spinning|running|shaky|handheld chase|fast motion)\b/i;
const REPAIRABLE_SCRIPT_CONTRACT_FAILURE_PATTERN = /\b(?:relip_safe_not_true|relip_face_visibility_undeclared|relip_occlusion_unsafe|relip_motion_unsafe|relip_unsafe_occlusion|relip_unsafe_motion|on_camera_scene_exceeds_relip_limit|unsupported_voice_language|missing_shot_intent|shot_intent_[a-z_]+|runtime_duration_mismatch|spoken_word_count_mismatch|scene_prompt_count_mismatch|sidecar_scene_count_mismatch)\b/;

function singleLineScriptField(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function narrationForScene(scene: ScriptSidecar['scenes'][number]): string {
  return singleLineScriptField(scene.narration);
}

function promptForScene(scene: ScriptSidecar['scenes'][number], index: number): string {
  const overlays = scene.editDirections?.onScreenText?.filter((text) => text.trim().length > 0) ?? [];
  const parts = [
    `Scene ${index + 1}: ${singleLineScriptField(scene.visualDescription)}`,
    singleLineScriptField(scene.videoMotionPrompt),
    singleLineScriptField(scene.imageQualityTokens),
    singleLineScriptField(scene.videoQualityTokens),
    overlays.length > 0 ? `Text overlays: ${overlays.join(' | ')}` : '',
  ].filter(Boolean);

  return parts.join('. ');
}

export function materializeScriptWriterResult(modelOutput: ScriptWriterModelOutput): ScriptWriterResult {
  const sidecar = parseScriptSidecar(modelOutput.sidecar);
  const content = sidecar.scenes
    .map((scene, index) => [
      `## Scene ${index + 1}: ${singleLineScriptField(scene.title)}`,
      `**Narration:** ${narrationForScene(scene)}`,
      `**Visual:** ${singleLineScriptField(scene.visualDescription)}`,
    ].join('\n'))
    .join('\n\n');

  return {
    content,
    contentAnalysis: modelOutput.contentAnalysis,
    visualMetadata: {
      motionInfo: modelOutput.visualMetadata.motionInfo,
      scenePrompts: sidecar.scenes.map(promptForScene),
    },
    metadata: modelOutput.metadata,
    sidecar,
  };
}
function validateWriterCapabilityCompliance(
  result: ScriptWriterResult,
  sidecar: ReturnType<typeof parseScriptSidecar>,
  failures: string[],
): void {
  sidecar.scenes.forEach((scene, sceneIndex) => {
    if (!scene.shotIntent) failures.push(`missing_shot_intent:scene_${sceneIndex + 1}`);
  });

  const voiceLanguage = result.metadata.voiceLanguage || WRITER_CAPABILITIES.voiceLanguages[0] || 'en';
  if (!canSpeakLanguage(voiceLanguage)) {
    failures.push(`unsupported_voice_language:${voiceLanguage}`);
  }

  const spokenLines = sidecar.scenes.flatMap((scene, sceneIndex) =>
    scene.lines
      .map((line) => ({ sceneIndex, line }))
      .filter(({ line }) => line.delivery !== 'on-screen-text'),
  );
  const onCameraSpeakingLines = spokenLines.filter(
    ({ line }) => line.onCamera && line.delivery === 'sync-dialogue',
  );
  const scenesWithOnCameraSpeech = new Set(onCameraSpeakingLines.map(({ sceneIndex }) => sceneIndex));
  for (const sceneIndex of scenesWithOnCameraSpeech) {
    const scene = sidecar.scenes[sceneIndex];
    if (!scene) continue;
    const sceneLabel = `scene_${sceneIndex + 1}`;
    const visualText = `${scene.visualDescription} ${scene.videoMotionPrompt}`;

    if (scene.relipSafe !== true) failures.push(`relip_safe_not_true:${sceneLabel}`);
    if (scene.relipSafety?.faceVisibility !== 'visible') {
      failures.push(`relip_face_visibility_undeclared:${sceneLabel}`);
    }
    if (!scene.relipSafety || !['none', 'light'].includes(scene.relipSafety.occlusion)) {
      failures.push(`relip_occlusion_unsafe:${sceneLabel}`);
    }
    if (!scene.relipSafety || !['still', 'moderate'].includes(scene.relipSafety.motion)) {
      failures.push(`relip_motion_unsafe:${sceneLabel}`);
    }
    if (RELIP_UNSAFE_OCCLUSION_PATTERN.test(visualText)) {
      failures.push(`relip_unsafe_occlusion:${sceneLabel}`);
    }
    if (RELIP_UNSAFE_MOTION_PATTERN.test(visualText)) {
      failures.push(`relip_unsafe_motion:${sceneLabel}`);
    }

    // Editron receives avatar directives per canonical scene. Montage sub-shots do not
    // split an on-camera relip job, so the parent scene itself must fit the rig cap.
    if (speakingBeatNeedsSplit(scene.durationSeconds)) {
      failures.push(`on_camera_scene_exceeds_relip_limit:${sceneLabel}:${scene.durationSeconds}s`);
    }
  }
}

function isRepairableScriptContractError(error: unknown): error is Error {
  return error instanceof Error && REPAIRABLE_SCRIPT_CONTRACT_FAILURE_PATTERN.test(error.message);
}

function buildScriptContractRepairSystemInstruction(systemInstruction: string, failure: Error): string {
  return `${systemInstruction}

<writer_contract_repair>
The previous structured output failed a production writer contract:
${failure.message}

Return a complete replacement object using the same JSON schema. Preserve the brief's facts, brand intent, source references, casting, and overall narrative. Repair every listed contract violation without inventing facts.

Critical rules:
- Every scene requires a complete shotIntent that matches its visible performers and sync-dialogue lines. shotIntent.spokenAudio means speech captured on set; it is false for voiceover-only scenes.
- Every scene that contains on-camera sync-dialogue is one actual relip job and must be ${WRITER_CAPABILITIES.maxSpeakingSegmentSec}s or shorter. Do not use subShots to bypass this limit. Split an overlong on-camera beat into multiple consecutive sidecar.scenes instead, each with its own duration, visual direction, lines, relip safety data, and shot intent. Do not silently turn required on-camera cast speech into voiceover.
- When the failure includes runtime_duration_mismatch or spoken_word_count_mismatch, use tf_untrusted_data.editorialPlan as binding. Rebuild the audible prose and editorial allocation to meet its total runtime and narration-mode word band; changing durations, metadata, or empty lines alone does not repair a word-count failure.
- Each sidecar scene maps to exactly one visible script scene and one visual prompt. Keep scene titles, narration, and visual descriptions as plain field text; never embed additional markdown scene headers inside them.
</writer_contract_repair>`;
}

function validateCastingBriefCompliance(
  sidecar: ReturnType<typeof parseScriptSidecar>,
  productionBrief: ProductionBrief | null | undefined,
  failures: string[],
): void {
  const castingEntries = getAvatarCastingEntries(productionBrief);
  if (castingEntries.length === 0) return;

  const characterIds = new Set(sidecar.characters.map((character) => character.id));
  for (const [characterId] of castingEntries) {
    if (!characterIds.has(characterId)) {
      failures.push(`missing_cast_character:${characterId}`);
      continue;
    }

    let used = false;
    sidecar.scenes.forEach((scene, sceneIndex) => {
      if (scene.charactersPresent.includes(characterId)) used = true;
      scene.lines.forEach((line) => {
        if (line.speakerId !== characterId) return;
        used = true;
        if (line.delivery !== 'on-screen-text' && (line.delivery !== 'sync-dialogue' || !line.onCamera)) {
          failures.push(`cast_character_speech_not_sync_dialogue:${characterId}:scene_${sceneIndex + 1}`);
        }
      });
    });

    if (!used) failures.push(`unused_cast_character:${characterId}`);
  }
}

function countMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}

/** Provider output capacity; editorial structure and pacing come from buildScriptEditorialPlan. */
const SCRIPT_WRITER_MAX_OUTPUT_TOKENS = 65_536;
const TOKENS_PER_MAXIMUM_SPOKEN_WORD = 14;
const TOKENS_PER_RUNTIME_SECOND_FOR_SIDECAR = 12;
/** Minimum provider output budget when the brief has no runtime target. */
const SCRIPT_WRITER_DEFAULT_MAX_TOKENS = 8192;

interface ScriptRuntimeContract {
  targetDurationSeconds: number;
  minimumDurationSeconds: number;
  maximumDurationSeconds: number;
  targetSpokenWords: number;
  minimumSpokenWords: number;
  maximumSpokenWords: number;
}

/** Derive the enforceable runtime contract from a production brief (or a {@link ProductionBrief}-shaped object). */
export function resolveScriptRuntimeContract(
  brief: { output?: { targetDurationSec?: number | null } } | null | undefined,
  contentSignalProfile?: ThinkForgeContentSignalProfile | null,
): ScriptRuntimeContract {
  const plan = buildScriptEditorialPlan({
    productionBrief: brief as Pick<ProductionBrief, 'output'> | null | undefined,
    contentSignalProfile,
  });
  return {
    ...plan.runtime,
    targetSpokenWords: plan.narration.targetSpokenWords,
    minimumSpokenWords: plan.narration.minimumSpokenWords,
    maximumSpokenWords: plan.narration.maximumSpokenWords,
  };
}

/** Reserve enough provider output for the spoken-word ceiling plus structured production metadata. */
function durationAwareMaxTokens(input: Pick<ScriptWriterInput, 'productionBrief' | 'contentSignalProfile'>): number {
  const plan = buildScriptEditorialPlan(input);
  if (plan.runtime.targetDurationSeconds <= 0) return SCRIPT_WRITER_DEFAULT_MAX_TOKENS;
  const estimated =
    plan.narration.maximumSpokenWords * TOKENS_PER_MAXIMUM_SPOKEN_WORD
    + plan.runtime.targetDurationSeconds * TOKENS_PER_RUNTIME_SECOND_FOR_SIDECAR;
  return Math.min(
    SCRIPT_WRITER_MAX_OUTPUT_TOKENS,
    Math.max(SCRIPT_WRITER_DEFAULT_MAX_TOKENS, Math.ceil(estimated)),
  );
}

export function assertUsableScriptWriterResult(
  result: ScriptWriterResult,
  options: ScriptWriterValidationOptions = {},
): void {
  const content = result.content?.trim() ?? '';
  const scenePrompts = result.visualMetadata?.scenePrompts ?? [];
  const sceneCount = countMatches(content, MARKDOWN_SCENE_HEADER_PATTERN);
  const failures: string[] = [];
  let sidecarSceneCount = 0;

  if (content.length < 150) failures.push('content_under_150_chars');
  if (SCHEMA_ARTIFACT_PATTERNS.some((pattern) => pattern.test(content))) failures.push('schema_artifact_content');
  if (sceneCount < 1) failures.push('missing_scene_headers');
  if (!NARRATION_LABEL_PATTERN.test(content)) failures.push('missing_narration_labels');
  if (!VISUAL_LABEL_PATTERN.test(content)) failures.push('missing_visual_labels');
  if (scenePrompts.length === 0) failures.push('missing_scene_prompts');
  if (sceneCount > 0 && scenePrompts.length > 0 && scenePrompts.length !== sceneCount) {
    failures.push(`scene_prompt_count_mismatch:${scenePrompts.length}/${sceneCount}`);
  }

  try {
    const sidecar = parseScriptSidecar(result.sidecar);
    sidecarSceneCount = sidecar.scenes.length;
    validateWriterCapabilityCompliance(result, sidecar, failures);
    validateCastingBriefCompliance(sidecar, options.productionBrief, failures);

    // Runtime is verified from canonical sidecar data. Duration metadata is not enough: a model
    // must also supply the audible words required to fill the requested runtime.
    const runtimeTargetSec = options.productionBrief?.output.targetDurationSec;
    if (typeof runtimeTargetSec === 'number' && Number.isFinite(runtimeTargetSec) && runtimeTargetSec > 0) {
      const contract = resolveScriptRuntimeContract(
        options.productionBrief,
        options.contentSignalProfile,
      );
      const totalSceneSec = sidecar.scenes.reduce((sum, scene) => sum + (scene.durationSeconds ?? 0), 0);
      const spokenWords = sidecar.scenes.reduce(
        (sum, scene) => sum + (scene.narration ?? '').split(/\s+/).filter(Boolean).length,
        0,
      );
      if (totalSceneSec < contract.minimumDurationSeconds || totalSceneSec > contract.maximumDurationSeconds) {
        failures.push(`runtime_duration_mismatch:${totalSceneSec}s/${runtimeTargetSec}s`);
      }
      if (spokenWords < contract.minimumSpokenWords || spokenWords > contract.maximumSpokenWords) {
        failures.push(`spoken_word_count_mismatch:${spokenWords}/${contract.targetSpokenWords}`);
      }
    }
    failures.push(...findSourceLedgerIssuesForSidecar(sidecar, options.sourceLedger));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    failures.push(`invalid_sidecar:${message}`);
  }
  if (sceneCount > 0 && sidecarSceneCount > 0 && sidecarSceneCount !== sceneCount) {
    failures.push(`sidecar_scene_count_mismatch:${sidecarSceneCount}/${sceneCount}`);
  }

  if (failures.length > 0) {
    throw new Error(`Script writer output failed document contract: ${failures.join(', ')}`);
  }
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
    const requestedVoiceLanguages = productionBrief?.output.voiceLanguages ?? [];
    const unsupportedVoiceLanguages = requestedVoiceLanguages.filter((language) => !canSpeakLanguage(language));
    const defaultVoiceLanguage = WRITER_CAPABILITIES.voiceLanguages[0] ?? 'en';
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

## Current Script (revise this — do not start over)
${editContext.existingContent || '(the current script is empty)'}
${editContext.selection ? `\n## Focused Selection (the change targets this text)\n"${editContext.selection}"\n` : ''}${editContext.focusHint ? `**Focus:** ${editContext.focusHint}\n` : ''}
## Requested Change
${editContext.instruction}

## Edit Rules (mandatory)
1. Return the complete revised scene plan in \`sidecar.scenes\` - not a diff and not only the changed beat. Every scene the user keeps must reappear unless the change requires altering it.
2. Preserve the existing scene order and narrative structure except where the change demands otherwise.
3. Preserve all supplied facts verbatim: dates, times, locations, brand/event/product names, offers, prices, statistics, CTA links, and required logo/text mentions.
4. For each scene, keep narration in \`narration\` and the image/video direction in \`visualDescription\` plus \`videoMotionPrompt\`.
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
1. **Canonical scenes:** Author the complete script only in \`sidecar.scenes\`. The server deterministically creates the visible markdown script and one Clickatron/Editron scene prompt from each sidecar scene. Do not create duplicate scene lists or beat-only entries: one \`sidecar.scenes[N]\` is one published script scene.
2. **Narration & visuals:** Each scene's \`narration\` is the spoken script; \`visualDescription\` is what the viewer sees. Visual direction serves the narration. The same audible words must also appear in the scene's non-on-screen-text \`lines\`; ThinkForge derives narration from those lines so speaker, casting, and provenance cannot diverge.
3. **Factual source of truth:** Treat the original user brief as mandatory factual input. If an idea/angle is present, use it only as creative framing. Preserve exact dates, times, locations, brand names, event names, product/service names, offers, prices, statistics, CTA links/instructions, contact details, and required logo/text/tagline mentions.
4. **Quality:** Do NOT use filler. Be specific. Use facts provided in the context. Ensure a strong hook in Scene 1.
5. **Visual specificity:** Put all renderable facts in each scene's \`visualDescription\` and \`videoMotionPrompt\`: physical props/elements, composition, relevant source facts, brand/logo placement when supplied, and exact intended text overlays through \`editDirections.onScreenText\`. Never use generic visual direction such as "cinematic scene", "modern visual", or "professional graphic" without concrete details. Include \`motionInfo\` for overall pacing and graphic overlays.
6. **Script Sidecar v1:** In the SAME JSON response, include a \`sidecar\` object with \`sidecarVersion: ${SCRIPT_SIDECAR_VERSION}\`. It is the canonical script contract:
   - Include \`characters\`. Always include \`{ "id": "narrator", "name": "Narrator", "role": "narrator" }\`. Add one \`host\` character only if someone speaks on camera.
   - Each scene includes required parser fields: \`title\`, \`narration\`, \`visualDescription\`, \`videoMotionPrompt\`, \`audioDescription\`, \`musicDescription\`, \`sfxDescription\`, \`durationSeconds\`, \`mood\`, \`imageQualityTokens\`, \`videoQualityTokens\`, \`generationUnitId\`, \`primaryVisualForUnit\`, \`sceneType\`, and \`assetRecommendation\`.
   - Each scene includes \`lines\` with \`text\`, \`speakerId\`, \`onCamera\`, and \`delivery\`. Use \`delivery: "voiceover"\` for narrator voiceover and \`delivery: "sync-dialogue"\` only for visible on-camera speech.
   - Each scene includes one complete \`shotIntent\` authored from that same scene. It expresses creative intent only; never invent equipment, room dimensions, coordinates, costs, or setup instructions.
   - If any line has \`onCamera: true\` and \`delivery: "sync-dialogue"\`, set that scene's \`relipSafe: true\` and \`relipSafety: { "faceVisibility": "visible", "occlusion": "none" or "light", "motion": "still" or "moderate" }\`. The object must match the visual description. Otherwise set \`relipSafe: false\` and omit \`relipSafety\`.
   - \`sourceRefs\` are provenance IDs only. If a Source Ledger is present, use ONLY referenceId values listed there (\`brief_user\`, \`source_1\`, etc.). Every numeric/date/price/URL/proof/testimonial claim must carry sourceRefs on the line and scene. A line or scene \`sourceRefs\` value must also appear in top-level \`sidecar.sourceRefs\`. If no factual sources are used, use empty arrays.
   - If \`tf_untrusted_data.editorialPlan\` is present, it is binding. Sum scene \`durationSeconds\` to its exact total runtime and keep the complete audible script inside its narration-mode word band. Execute its selected structure and narration techniques, including their anti-patterns.
   - Follow \`editorialPlan.structure.scope\` and \`actPolicy\`. Start a new editorial scene only at a meaningful narrative, argument, time/place, speaker-mode, evidence, emotional, or visual-treatment turn. Duration never decides scene count.
   - Use \`subShots\` for meaningful coverage changes inside one editorial scene. Never create scenes or subShots merely to satisfy a seconds-per-scene formula, and never use timestamps or visual pauses to pretend sparse prose meets runtime.
7. **Writer capability limits:** Author only what the downstream avatar/video rig can produce:
   - Supported spoken voice languages: ${WRITER_CAPABILITIES.voiceLanguages.join(', ') || 'none'}. Requested spoken languages: ${requestedVoiceLanguages.length ? requestedVoiceLanguages.join(', ') : 'none supplied'}. Unsupported requested spoken languages: ${unsupportedVoiceLanguages.length ? unsupportedVoiceLanguages.join(', ') : 'none'}. If any requested spoken language is unsupported, keep spoken narration/dialogue in ${defaultVoiceLanguage}; unsupported languages may be captions/on-screen text only.
   - Set \`metadata.voiceLanguage\` to the supported spoken language actually used.
   - For every on-camera sync-dialogue scene, make \`visualDescription\` match its structured \`relipSafety\`: visible face, front/on-camera framing, no more than light occlusion, and still/moderate motion.
   - Every on-camera sync-dialogue scene is one actual lip-sync job and must be ${WRITER_CAPABILITIES.maxSpeakingSegmentSec}s or shorter. When a spoken beat runs longer, split it into multiple consecutive \`sidecar.scenes\`; do not use \`subShots\` to bypass this limit.
8. **Production shot intent:** For every sidecar scene, author \`shotIntent\` in the same response:
   - State \`narrativePurpose\`, \`emotionalBeat\`, \`energy\` from 0 to 1, and the concrete \`visualPriority\` that must remain readable.
   - Select \`action\`, \`desiredFraming\`, \`desiredAngle\`, and \`desiredMovement\` from the schema. Any movement other than \`static\` requires \`movementMotivation\` explaining the story reason for moving the camera. For a \`static\` shot, omit \`movementMotivation\`; never use an empty string as a placeholder.
   - \`performance\` contains only characters physically visible in the shot. Use each visible character once, copy its exact \`characterId\`, and describe stance, emotion, intensity, gaze, posture, gesture, and movement. Set \`simultaneousPerformers\` to the number of these unique visible characters. Use an empty array and 0 for object/B-roll/graphics scenes with no visible character.
   - Set \`spokenAudio: true\` only when the scene captures on-camera sync dialogue. Set it false for voiceover, music, ambient sound, on-screen text, and silent B-roll.
   - Use \`continuity\` only for wardrobe, props, screen direction, and links to earlier scenes. Omit optional continuity fields when they do not apply; never use empty strings as placeholders. Do not turn creative preferences into claimed physical capabilities; the deterministic production resolver will adapt or block infeasible intent later.

Return your response strictly adhering to the JSON schema.`;

    return prompt;
  }

  buildPrompt(input: ScriptWriterInput): string {
    const parts = this.buildPromptParts(input);
    const inspectionPrompt = parts.prompt.replaceAll('\\n', '\n').replaceAll('\\"', '"');
    return `${parts.systemInstruction}\n\n${inspectionPrompt}`;
  }

  buildPromptParts(input: ScriptWriterInput): IsolatedPromptParts {
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
- Read trend adaptation, casting, and provenance material only from tf_untrusted_data.trendBrief, castingBrief, and sourceLedger.
- Read runtime, narration density, scope hierarchy, scene-boundary policy, and selected graph techniques only from tf_untrusted_data.editorialPlan. It is binding when present.
- Read actual requested and unsupported spoken languages from tf_untrusted_data.voiceLanguageRequest; enforce the supported-language list above.`;

    return buildIsolatedPromptParts({
      systemInstruction: this.applyGlobalConstraints(
        `${this.buildTrustedTemplate(placeholderInput)}\n\n${runtimeDataRules}`,
      ),
      data: this.buildUntrustedPromptData(input),
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

  private buildUntrustedPromptData(input: ScriptWriterInput): Record<string, unknown> {
    const { context, userPrompt, retrievedContext, editContext, productionBrief, sourceLedger } = input;
    const requestedVoiceLanguages = productionBrief?.output.voiceLanguages ?? [];
    const unsupportedVoiceLanguages = requestedVoiceLanguages.filter((language) => !canSpeakLanguage(language));
    const facts = [...(retrievedContext?.projectFacts || []), ...(retrievedContext?.globalFacts || [])];
    const editorialPlan = productionBrief?.output?.targetDurationSec
      ? buildScriptEditorialPlan({ productionBrief, contentSignalProfile: input.contentSignalProfile })
      : null;

    return {
      mode: editContext ? 'revise_existing_script' : 'create_script',
      projectSummary: context.projectSummary || null,
      userBrief: userPrompt,
      brandContext: context.systemBrief || null,
      databankFacts: facts.map((fact, index) => ({
        sourceId: `source_${index + 1}`,
        title: fact.title,
        summary: fact.summary,
      })),
      trendBrief: formatTrendBriefForPrompt(productionBrief) || null,
      editorialPlan,
      castingBrief: formatCastingBriefForPrompt(productionBrief) || null,
      sourceLedger: sourceLedger ? formatSourceLedgerForPrompt(sourceLedger) : null,
      voiceLanguageRequest: {
        requested: requestedVoiceLanguages,
        unsupported: unsupportedVoiceLanguages,
        fallback: WRITER_CAPABILITIES.voiceLanguages[0] ?? 'en',
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
  // low-temperature replacement is allowed after a proven capability or shot-intent failure.
  async runStructured(
    input: ScriptWriterInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal,
  ): Promise<AgentStructuredOutput<ScriptWriterResult>> {
    const promptParts = this.buildPromptParts(input);
    const gen = this.resolveGenConfig({
      ...overrides,
      maxTokens: overrides?.maxTokens ?? durationAwareMaxTokens(input),
    });
    const initialGeneration = await generateStructuredWithWritingContextCache({
      prompt: promptParts.prompt,
      systemInstruction: promptParts.systemInstruction,
      schema: ScriptWriterModelOutputSchema,
      modelName: this.config.modelName,
      temperature: gen.temperature,
      maxTokens: gen.maxTokens,
      abortSignal,
    });

    let modelOutput = initialGeneration.result;
    let result = materializeScriptWriterResult(modelOutput);
    let scriptContractRepairApplied = false;

    try {
      assertUsableScriptWriterResult(result, {
        sourceLedger: input.sourceLedger,
        productionBrief: input.productionBrief,
        contentSignalProfile: input.contentSignalProfile,
      });
    } catch (error) {
      if (!isRepairableScriptContractError(error)) throw error;

      const repairData = buildIsolatedPromptParts({
        systemInstruction: 'The previous model output is untrusted repair input.',
        data: { previousModelOutput: modelOutput },
        totalLimit: 80_000,
      });

      const repairedGeneration = await generateStructuredWithWritingContextCache({
        prompt: `${promptParts.prompt}\n\n<writer_contract_repair>\n${repairData.prompt}\n</writer_contract_repair>`,
        systemInstruction: buildScriptContractRepairSystemInstruction(promptParts.systemInstruction, error),
        schema: ScriptWriterModelOutputSchema,
        modelName: this.config.modelName,
        temperature: Math.min(gen.temperature, 0.25),
        maxTokens: gen.maxTokens,
        abortSignal,
      });
      modelOutput = repairedGeneration.result;
      result = materializeScriptWriterResult(modelOutput);
      scriptContractRepairApplied = true;

      assertUsableScriptWriterResult(result, {
        sourceLedger: input.sourceLedger,
        productionBrief: input.productionBrief,
        contentSignalProfile: input.contentSignalProfile,
      });
    }

    return {
      result,
      metadata: {
        model: initialGeneration.modelName,
        notes: `writing_context_cache:${initialGeneration.cacheStatus}${scriptContractRepairApplied ? ';script_contract_repair:applied' : ''}`,
      },
    };
  }
}

export function createScriptWriterAgent(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
  return new ScriptWriterAgent(config);
}
