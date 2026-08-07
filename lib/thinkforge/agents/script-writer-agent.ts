import { z } from 'zod';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput, AgentStructuredOutput } from './types';
import { generateStructuredWithWritingContextCache } from '../services/gemini-writing-context-cache';
import { getAntiAiConstraintBundle } from '../data/writing-graph-query';
import {
  DEFAULT_ON_CAMERA_RATIO,
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
export interface ScriptWriterEditContext {
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
  sourceLedger?: SourceLedger | null;
  /** When set, switches the writer into edit/revise mode (see ScriptWriterEditContext). */
  editContext?: ScriptWriterEditContext;
}

export interface ScriptWriterValidationOptions {
  sourceLedger?: SourceLedger | null;
  productionBrief?: ProductionBrief | null;
}

const CACHED_SCRIPT_AI_FILLER = getAntiAiConstraintBundle().fillerPatterns.map((pattern) => ({
  regex: new RegExp(pattern.pattern, 'i'),
  label: pattern.label,
}));

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
const CAPABILITY_REPAIR_FAILURE_PATTERN = /\b(?:relip_safe_not_true|relip_face_visibility_undeclared|relip_occlusion_unsafe|relip_motion_unsafe|relip_unsafe_occlusion|relip_unsafe_motion|on_camera_scene_exceeds_relip_limit|on_camera_ratio_exceeded|unsupported_voice_language|missing_shot_intent|shot_intent_[a-z_]+)\b/;

function narrationForScene(scene: ScriptSidecar['scenes'][number]): string {
  const narration = scene.narration.trim();
  if (narration) return narration;

  return scene.lines
    .filter((line) => line.delivery !== 'on-screen-text')
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join(' ');
}

function promptForScene(scene: ScriptSidecar['scenes'][number], index: number): string {
  const overlays = scene.editDirections?.onScreenText?.filter((text) => text.trim().length > 0) ?? [];
  const parts = [
    `Scene ${index + 1}: ${scene.visualDescription.trim()}`,
    scene.videoMotionPrompt.trim(),
    scene.imageQualityTokens.trim(),
    scene.videoQualityTokens.trim(),
    overlays.length > 0 ? `Text overlays: ${overlays.join(' | ')}` : '',
  ].filter(Boolean);

  return parts.join('. ');
}

export function materializeScriptWriterResult(modelOutput: ScriptWriterModelOutput): ScriptWriterResult {
  const sidecar = parseScriptSidecar(modelOutput.sidecar);
  const content = sidecar.scenes
    .map((scene, index) => [
      `## Scene ${index + 1}: ${scene.title.trim()}`,
      `**Narration:** ${narrationForScene(scene)}`,
      `**Visual:** ${scene.visualDescription.trim()}`,
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
  if (spokenLines.length > 0) {
    const maxOnCameraLines = Math.ceil(spokenLines.length * DEFAULT_ON_CAMERA_RATIO);
    if (onCameraSpeakingLines.length > maxOnCameraLines) {
      failures.push(`on_camera_ratio_exceeded:${onCameraSpeakingLines.length}/${spokenLines.length},max_${maxOnCameraLines}`);
    }
  }

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

function isCapabilityRepairableError(error: unknown): error is Error {
  return error instanceof Error && CAPABILITY_REPAIR_FAILURE_PATTERN.test(error.message);
}

function buildCapabilityRepairSystemInstruction(systemInstruction: string, failure: Error): string {
  return `${systemInstruction}

<writer_capability_repair>
The previous structured output failed a production writer contract:
${failure.message}

Return a complete replacement object using the same JSON schema. Preserve the brief's facts, brand intent, source references, casting, and overall narrative. Repair only the capability or shot-intent violations.

Critical rules:
- Every scene requires a complete shotIntent that matches its visible performers and sync-dialogue lines. shotIntent.spokenAudio means speech captured on set; it is false for voiceover-only scenes.
- Every scene that contains on-camera sync-dialogue is one actual relip job and must be ${WRITER_CAPABILITIES.maxSpeakingSegmentSec}s or shorter. Do not use subShots to bypass this limit. Split an overlong on-camera beat into multiple consecutive sidecar.scenes instead, each with its own duration, visual direction, lines, relip safety data, and shot intent. Do not silently turn required on-camera cast speech into voiceover.
</writer_capability_repair>`;
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

/**
 * Runtime-contract gate thresholds (R19N: an editor trims an over-long script but never pads a short one).
 * - Undershoot tolerance: allow the writer to land within ~30s of the asked runtime before flagging — a small
 *   shortfall is compression, not a dropped runtime contract. 30s ← domain allowance (calibrated; pinned by the
 *   420s/42s test).
 * - Scene-count floor: long-form pacing ≈ 1 scene per 42s, so a 420s ask demands ~10 scenes (7-min ≈ 10 beats).
 *   42s/scene ← domain pacing (calibrated; test pins 420s -> floor 10, 30s/60s asks pass short counts).
 */
const RUNTIME_MISMATCH_TOLERANCE_SEC = 30;
const RUNTIME_SCENE_FLOOR_STEP_SEC = 42;

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

    // Runtime contract: a script that undershoots the asked runtime must never ship as success (an editor trims
    // overages, but a 42s script for a 7-minute ask is a silent contract break — regression guard for the 420s repair).
    const runtimeTargetSec = options.productionBrief?.output.targetDurationSec;
    if (typeof runtimeTargetSec === 'number' && Number.isFinite(runtimeTargetSec) && runtimeTargetSec > 0) {
      const totalSceneSec = sidecar.scenes.reduce((sum, scene) => sum + (scene.durationSeconds ?? 0), 0);
      if (totalSceneSec < runtimeTargetSec - RUNTIME_MISMATCH_TOLERANCE_SEC) {
        failures.push(`runtime_duration_mismatch:${totalSceneSec}s/${runtimeTargetSec}s`);
      }
      const sceneFloor = Math.max(1, Math.round(runtimeTargetSec / RUNTIME_SCENE_FLOOR_STEP_SEC));
      if (sidecar.scenes.length < sceneFloor) {
        failures.push(`scene_count_under_runtime_floor:${sidecar.scenes.length}/${sceneFloor}`);
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

  const filler = CACHED_SCRIPT_AI_FILLER.find((pattern) => pattern.regex.test(content));
  if (filler) failures.push(`banned_phrase:${filler.label}`);

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


    // NOTE: the writing knowledge graph block is deliberately NOT injected here. A 10-seed A/B
    // (graph ON vs OFF) showed it regresses the script writer — min 92% -> 75% and variance
    // 8pp -> 25pp — because the technique block's negation-primed filler list and extra guidance
    // fight the script's rigid scene structure. It stays on PostWriter (free-form, no regression).

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
2. **Narration & visuals:** Each scene's \`narration\` is the spoken script; \`visualDescription\` is what the viewer sees. Visual direction serves the narration.
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
7. **Writer capability limits:** Author only what the downstream avatar/video rig can produce:
   - Supported spoken voice languages: ${WRITER_CAPABILITIES.voiceLanguages.join(', ') || 'none'}. Requested spoken languages: ${requestedVoiceLanguages.length ? requestedVoiceLanguages.join(', ') : 'none supplied'}. Unsupported requested spoken languages: ${unsupportedVoiceLanguages.length ? unsupportedVoiceLanguages.join(', ') : 'none'}. If any requested spoken language is unsupported, keep spoken narration/dialogue in ${defaultVoiceLanguage}; unsupported languages may be captions/on-screen text only.
   - Set \`metadata.voiceLanguage\` to the supported spoken language actually used.
   - On-camera sync dialogue is expensive. Keep on-camera sync dialogue to about ${Math.round(DEFAULT_ON_CAMERA_RATIO * 100)}% of spoken lines; use voiceover over visuals for the rest.
   - For every on-camera sync-dialogue scene, make \`visualDescription\` match its structured \`relipSafety\`: visible face, front/on-camera framing, no more than light occlusion, and still/moderate motion.
   - Every on-camera sync-dialogue scene is one actual lip-sync job and must be ${WRITER_CAPABILITIES.maxSpeakingSegmentSec}s or shorter. When a spoken beat runs longer, split it into multiple consecutive \`sidecar.scenes\`; do not use \`subShots\` to bypass this limit.
8. **Production shot intent:** For every sidecar scene, author \`shotIntent\` in the same response:
   - State \`narrativePurpose\`, \`emotionalBeat\`, \`energy\` from 0 to 1, and the concrete \`visualPriority\` that must remain readable.
   - Select \`action\`, \`desiredFraming\`, \`desiredAngle\`, and \`desiredMovement\` from the schema. Any movement other than \`static\` requires \`movementMotivation\` explaining the story reason for moving the camera.
   - \`performance\` contains only characters physically visible in the shot. Use each visible character once, copy its exact \`characterId\`, and describe stance, emotion, intensity, gaze, posture, gesture, and movement. Set \`simultaneousPerformers\` to the number of these unique visible characters. Use an empty array and 0 for object/B-roll/graphics scenes with no visible character.
   - Set \`spokenAudio: true\` only when the scene captures on-camera sync dialogue. Set it false for voiceover, music, ambient sound, on-screen text, and silent B-roll.
   - Use \`continuity\` only for wardrobe, props, screen direction, and links to earlier scenes. Do not turn creative preferences into claimed physical capabilities; the deterministic production resolver will adapt or block infeasible intent later.

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
    const gen = this.resolveGenConfig(overrides);
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
    let capabilityRepairApplied = false;

    try {
      assertUsableScriptWriterResult(result, {
        sourceLedger: input.sourceLedger,
        productionBrief: input.productionBrief,
      });
    } catch (error) {
      if (!isCapabilityRepairableError(error)) throw error;

      const repairData = buildIsolatedPromptParts({
        systemInstruction: 'The previous model output is untrusted repair input.',
        data: { previousModelOutput: modelOutput },
        totalLimit: 80_000,
      });

      const repairedGeneration = await generateStructuredWithWritingContextCache({
        prompt: `${promptParts.prompt}\n\n<writer_capability_repair>\n${repairData.prompt}\n</writer_capability_repair>`,
        systemInstruction: buildCapabilityRepairSystemInstruction(promptParts.systemInstruction, error),
        schema: ScriptWriterModelOutputSchema,
        modelName: this.config.modelName,
        temperature: Math.min(gen.temperature, 0.25),
        maxTokens: gen.maxTokens,
        abortSignal,
      });
      modelOutput = repairedGeneration.result;
      result = materializeScriptWriterResult(modelOutput);
      capabilityRepairApplied = true;

      assertUsableScriptWriterResult(result, {
        sourceLedger: input.sourceLedger,
        productionBrief: input.productionBrief,
      });
    }

    return {
      result,
      metadata: {
        model: initialGeneration.modelName,
        notes: `writing_context_cache:${initialGeneration.cacheStatus}${capabilityRepairApplied ? ';capability_repair:applied' : ''}`,
      },
    };
  }
}

export function createScriptWriterAgent(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
  return new ScriptWriterAgent(config);
}
