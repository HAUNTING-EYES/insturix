import { z } from 'zod';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput, AgentStructuredOutput } from './types';
import type { ThinkForgeContentSignalProfile } from '../signals';
import { generateWithWritingContextCache } from '../services/gemini-writing-context-cache';
import { parseAgentJson } from '../protocol/parse-agent-json';
import { getAntiAiConstraintBundle } from '../data/writing-graph-query';
import { repairAiFillerContent } from '../services/ai-filler-repair';
import {
  parseScriptSidecar,
  SCRIPT_SIDECAR_VERSION,
  ScriptSidecarSchema,
} from '../schemas/script-sidecar';

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
  contentSignalProfile?: ThinkForgeContentSignalProfile;
  /** When set, switches the writer into edit/revise mode (see ScriptWriterEditContext). */
  editContext?: ScriptWriterEditContext;
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

function countMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}

export function assertUsableScriptWriterResult(result: ScriptWriterResult): void {
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
    const { context, userPrompt, retrievedContext, editContext } = input;

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
   - \`sourceRefs\` are provenance IDs only. If using retrieved sources, use \`source_1\`, \`source_2\`, etc. A line or scene \`sourceRefs\` value must also appear in top-level \`sidecar.sourceRefs\`. If no external facts are used, use empty arrays.

Return your response strictly adhering to the JSON schema.`;

    return prompt;
  }

  // Mirrors PostWriterAgent: route generation through the writing-context cache so
  // video scripts receive the creative-content-knowledge doc that the base structured
  // path never loaded. Falls back to the base path on any cache/parse error, so this
  // can only add the doc, never regress. (Quality delta needs a live Gemini eval.)
  async runStructured(
    input: ScriptWriterInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal,
  ): Promise<AgentStructuredOutput<ScriptWriterResult>> {
    const prompt = this.applyGlobalConstraints(this.buildPrompt(input));
    const gen = this.resolveGenConfig(overrides);

    let output: AgentStructuredOutput<ScriptWriterResult>;
    try {
      const jsonContract = [
        'Return ONLY valid JSON. Do not include markdown fences or commentary.',
        'Required JSON shape:',
        '{',
        '  "content": "the full script as markdown with ## Scene headers; no JSON inside",',
        '  "contentAnalysis": { "hooks": ["string"], "theme": "string", "emphasisPoints": ["string"], "qualityScore": 0 },',
        '  "visualMetadata": { "motionInfo": "string", "scenePrompts": ["string"] },',
        '  "metadata": { "estimatedTimeSeconds": 0, "platform": "string" },',
        '  "sidecar": {',
        `    "sidecarVersion": ${SCRIPT_SIDECAR_VERSION},`,
        '    "characters": [{ "id": "narrator", "name": "Narrator", "role": "narrator" }],',
        '    "scenes": [{',
        '      "title": "Scene title", "narration": "spoken text", "visualDescription": "what is seen",',
        '      "videoMotionPrompt": "camera or motion direction", "audioDescription": "",',
        '      "musicDescription": "music cue", "sfxDescription": "", "durationSeconds": 5,',
        '      "mood": "neutral", "imageQualityTokens": "visual quality tokens",',
        '      "videoQualityTokens": "video quality tokens", "generationUnitId": "scene_1",',
        '      "primaryVisualForUnit": true, "sceneType": "talking-head", "assetRecommendation": "ai-video",',
        '      "lines": [{ "text": "spoken text", "speakerId": "narrator", "onCamera": false, "delivery": "voiceover", "sourceRefs": [] }],',
        '      "charactersPresent": ["narrator"], "relipSafe": false, "sourceRefs": []',
        '    }],',
        '    "overallMusicPrompt": "overall music direction", "characterDescriptions": {},',
        '    "colorPalette": [], "environmentNotes": "environment notes",',
        '    "suggestedProfileCategory": "production-mode", "sourceRefs": []',
        '  }',
        '}',
        'hooks, emphasisPoints, and scenePrompts must be arrays of strings only.',
        'content must be markdown scene script text, not JSON, not an array, and not ThinkForge block objects.',
        'Every scene in content must begin with ## Scene N: ... and include **Narration:** plus **Visual:** labels.',
        'scenePrompts must map 1:1 with the scenes in content.',
        'sidecar.scenes must map 1:1 with the scenes in content, and sidecar sourceRefs must be internally consistent.',
        'Do not add keys outside the required JSON shape.',
      ].join('\n');
      const { text, cacheStatus, modelName } = await generateWithWritingContextCache({
        prompt: `${prompt}\n\n${jsonContract}`,
        modelName: this.config.modelName,
        temperature: gen.temperature,
        maxTokens: gen.maxTokens,
        abortSignal,
      });
      const parsed = parseAgentJson(text);
      const result = this.schema.parse(parsed);
      // Reject unusable cache-path output before it can persist.
      assertUsableScriptWriterResult(result);

      output = {
        result,
        metadata: {
          model: modelName,
          notes: `writing_context_cache:${cacheStatus}`,
        },
      };
    } catch (error) {
      // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md).
      // One catch covers cache-load + gen + parse + the quality gate; without this a permanent
      // cache-miss, a 100%-fallback regression, or the gate silently rejecting every cache output
      // all look identical. Distinguish gate-reject from an infra error so a test can count them.
      const isGateReject = error instanceof Error && error.message.startsWith('Script writer output failed document contract');
      console.error(`[LOUDFAIL][ScriptWriter][CACHE-PATH-FAILED] reason=${isGateReject ? 'QUALITY-GATE-REJECTED' : 'infra/parse/model error'} — falling back to base path (no writing-knowledge doc):`, error);
      output = await super.runStructured(input, overrides, abortSignal);
      assertUsableScriptWriterResult(output.result);
    }

    // Filler self-repair: one in-context rewrite if a banned phrase slipped through either path.
    // Fail-soft — keeps the original unless the rewrite strictly reduced filler (see ai-filler-repair).
    output.result.content = await repairAiFillerContent(output.result.content, this.config.modelName, abortSignal);
    assertUsableScriptWriterResult(output.result);
    return output;
  }
}

export function createScriptWriterAgent(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
  return new ScriptWriterAgent(config);
}
