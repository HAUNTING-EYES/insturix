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
} from '../schemas/script-sidecar';
import {
  findSourceLedgerIssuesForSidecar,
  formatSourceLedgerForPrompt,
  type SourceLedger,
} from '../provenance/source-ledger';
import { formatTrendBriefForPrompt } from './trend-brief-context';
import { formatCastingBriefForPrompt, getAvatarCastingEntries } from './casting-brief-context';

// Flat ScriptWriter Output Contract
export const ScriptWriterResultSchema = z.object({
  content: z.string().describe('The actual script text, formatted in markdown with scenes'),
  contentAnalysis: z.object({
    hooks: z.array(z.string()).describe('List of key hooks utilized in the script'),
    theme: z.string().describe('The core theme of the script'),
    emphasisPoints: z.array(z.string()).describe('Key moments intended for emphasis'),
    qualityScore: z.number().min(0).max(100).describe('Self-evaluated quality score (0-100) based on specificity and engagement'),
  }),
  visualMetadata: z.object({
    motionInfo: z.string().describe('General motion graphic styling instructions'),
    scenePrompts: z.array(z.string()).describe('Detailed prompts per scene to generate visuals. MUST include specific physical props/elements and explicitly define any Text Overlays (headings, dates, locations, quotes).'),
  }),
  metadata: z.object({
    estimatedTimeSeconds: z.number().describe('Estimated duration of the script in seconds'),
    platform: z.string().describe('The targeted platform (e.g., youtube, tiktok)'),
    voiceLanguage: z.string().default(WRITER_CAPABILITIES.voiceLanguages[0] ?? 'en'),
  }),
  sidecar: ScriptSidecarSchema.describe('Script Sidecar v1 emitted in the same pass as the script prose'),
});

export type ScriptWriterResult = z.infer<typeof ScriptWriterResultSchema>;

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

const RELIP_FACE_VISIBLE_PATTERN = /\b(face visible|visible face|front[- ]facing|frontal|head[- ]and[- ]shoulders|medium close[- ]up|close[- ]up|talking head|speaking to camera|direct(?:ly)? to camera|looking into camera|host speaking|presenter speaking|on-camera)\b/i;
const RELIP_UNSAFE_OCCLUSION_PATTERN = /\b(masked|mask covering|face covered|covered face|hidden face|occluded face|heavy occlusion|silhouette|back turned|turned away|profile only)\b/i;
const RELIP_UNSAFE_MOTION_PATTERN = /\b(rapid|chaotic|whip pan|spinning|running|shaky|handheld chase|fast motion)\b/i;

function validateWriterCapabilityCompliance(
  result: ScriptWriterResult,
  sidecar: ReturnType<typeof parseScriptSidecar>,
  failures: string[],
): void {
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
    if (!RELIP_FACE_VISIBLE_PATTERN.test(scene.visualDescription)) {
      failures.push(`relip_face_not_visible:${sceneLabel}`);
    }
    if (RELIP_UNSAFE_OCCLUSION_PATTERN.test(visualText)) {
      failures.push(`relip_unsafe_occlusion:${sceneLabel}`);
    }
    if (RELIP_UNSAFE_MOTION_PATTERN.test(visualText)) {
      failures.push(`relip_unsafe_motion:${sceneLabel}`);
    }

    if (speakingBeatNeedsSplit(scene.durationSeconds)) {
      const subShots = scene.subShots ?? [];
      const hasValidSplit = subShots.length >= 2 && subShots.every(
        (subShot) => !speakingBeatNeedsSplit(subShot.targetDurationSeconds),
      );
      if (!hasValidSplit) failures.push(`speaking_beat_needs_split:${sceneLabel}:${scene.durationSeconds}s`);
    }
  }
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

  buildPrompt(input: ScriptWriterInput): string {
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
1. Return the ENTIRE revised script in the \`content\` field — not a diff, not only the changed part. Every scene the user keeps must reappear unless the change requires altering it.
2. Preserve the existing scene order, headings, and structure except where the change demands otherwise.
3. Preserve all supplied facts verbatim: dates, times, locations, brand/event/product names, offers, prices, statistics, CTA links, and required logo/text mentions — in both kept and revised scenes.
4. Keep the scene format: every scene begins with \`## Scene N: ...\` and includes **Narration:** and **Visual:** labels.

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
1. **Content Formatting:** Write the FINAL script in markdown. Every scene must start exactly like \`## Scene 1: The Hook\`, \`## Scene 2: The Problem\`, etc. Each scene must include bold \`**Narration:**\` and \`**Visual:**\` labels. Do NOT include JSON, block arrays, rich-text objects, \`header\`/\`paragraph\`/\`list\`/\`blockquote\` labels, or meta-commentary inside the content string.
2. **Narration & Visuals:** For each scene, clearly denote **Narration:** and **Visual:** (what the viewer sees). Visual direction serves the narration.
3. **Factual Source Of Truth:** Treat the original user brief as mandatory factual input. If an idea/angle is present, use it only as creative framing. Preserve exact dates, times, locations, brand names, event names, product/service names, offers, prices, statistics, CTA links/instructions, contact details, and required logo/text/tagline mentions.
4. **Quality:** Do NOT use filler. Be specific. Use facts provided in the context. Ensure a strong hook in Scene 1.
5. **Visual Metadata:** Provide detailed \`scenePrompts\` mapping 1:1 with the scenes in your script. These prompts will be fed into a visual generation engine (Clickatron/Editron). 
   - **Source Facts Are Mandatory:** Every scene prompt must carry the relevant source facts from the brief: brand name, logo placement if mentioned, event name, date, time, location, audience, product/service, offer, handouts/freebies, required colors/brand style, and exact words that must appear.
   - **Include Specific Props/Elements:** Explicitly list relevant physical objects that should appear in the visuals (e.g., for a blood donation drive, specify "blood drops, syringes"; for a clothes drive, specify "folded clothes, donation boxes").
   - **Include Text Overlays:** Explicitly define exact text overlays from the brief, including heading, brand name, date, location, CTA, and short tagline when available. If a logo is requested, say "Place [Brand Name] logo at [position]" rather than omitting it.
   - **No Generic Scene Prompts:** Never return prompts like "cinematic scene", "modern visual", or "professional graphic" without the concrete factual details above.
   - Include \`motionInfo\` to guide pacing and graphic overlays.
6. **Script Sidecar v1:** In the SAME JSON response, include a \`sidecar\` object with \`sidecarVersion: ${SCRIPT_SIDECAR_VERSION}\`. It must describe the same scenes as \`content\` without re-parsing later:
   - Include \`characters\`. Always include \`{ "id": "narrator", "name": "Narrator", "role": "narrator" }\`. Add one \`host\` character only if someone speaks on camera.
   - Each \`sidecar.scenes[N]\` maps to \`## Scene N\` in \`content\`.
   - Each scene includes required parser fields: \`title\`, \`narration\`, \`visualDescription\`, \`videoMotionPrompt\`, \`audioDescription\`, \`musicDescription\`, \`sfxDescription\`, \`durationSeconds\`, \`mood\`, \`imageQualityTokens\`, \`videoQualityTokens\`, \`generationUnitId\`, \`primaryVisualForUnit\`, \`sceneType\`, and \`assetRecommendation\`.
   - Each scene includes \`lines\` with \`text\`, \`speakerId\`, \`onCamera\`, and \`delivery\`. Use \`delivery: "voiceover"\` for narrator voiceover and \`delivery: "sync-dialogue"\` only for visible on-camera speech.
   - If any line has \`onCamera: true\` and \`delivery: "sync-dialogue"\`, set that scene's \`relipSafe: true\`; otherwise set \`relipSafe: false\`.
   - \`sourceRefs\` are provenance IDs only. If a Source Ledger is present, use ONLY referenceId values listed there (\`brief_user\`, \`source_1\`, etc.). Every numeric/date/price/URL/proof/testimonial claim must carry sourceRefs on the line and scene. A line or scene \`sourceRefs\` value must also appear in top-level \`sidecar.sourceRefs\`. If no factual sources are used, use empty arrays.
7. **Writer Capability Limits:** Author only what the downstream avatar/video rig can produce:
   - Supported spoken voice languages: ${WRITER_CAPABILITIES.voiceLanguages.join(', ') || 'none'}. Requested spoken languages: ${requestedVoiceLanguages.length ? requestedVoiceLanguages.join(', ') : 'none supplied'}. Unsupported requested spoken languages: ${unsupportedVoiceLanguages.length ? unsupportedVoiceLanguages.join(', ') : 'none'}. If any requested spoken language is unsupported, keep spoken narration/dialogue in ${defaultVoiceLanguage}; unsupported languages may be captions/on-screen text only.
   - Set \`metadata.voiceLanguage\` to the supported spoken language actually used.
   - On-camera sync dialogue is expensive. Keep on-camera sync dialogue to about ${Math.round(DEFAULT_ON_CAMERA_RATIO * 100)}% of spoken lines; use voiceover over visuals for the rest.
   - For every on-camera sync-dialogue scene, make \`visualDescription\` relip-safe: face visible, front/on-camera framing, no more than light occlusion, still/moderate motion.
   - Any on-camera sync-dialogue scene longer than ${WRITER_CAPABILITIES.maxSpeakingSegmentSec}s must include \`subShots\` split into chunks of ${WRITER_CAPABILITIES.maxSpeakingSegmentSec}s or less.

Return your response strictly adhering to the JSON schema.`;

    return prompt;
  }

  // One schema-constrained completion is the sole source of a script. The cached
  // creative-writing context is optional infrastructure; an unavailable cache falls
  // back to inline context before generation, never to a second model completion.
  async runStructured(
    input: ScriptWriterInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal,
  ): Promise<AgentStructuredOutput<ScriptWriterResult>> {
    const prompt = this.applyGlobalConstraints(this.buildPrompt(input));
    const gen = this.resolveGenConfig(overrides);
    const { result, cacheStatus, modelName } = await generateStructuredWithWritingContextCache({
      prompt,
      schema: this.schema,
      modelName: this.config.modelName,
      temperature: gen.temperature,
      maxTokens: gen.maxTokens,
      abortSignal,
    });

    assertUsableScriptWriterResult(result, {
      sourceLedger: input.sourceLedger,
      productionBrief: input.productionBrief,
    });

    return {
      result,
      metadata: {
        model: modelName,
        notes: `writing_context_cache:${cacheStatus}`,
      },
    };
  }
}

export function createScriptWriterAgent(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
  return new ScriptWriterAgent(config);
}
