import { z } from 'zod';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput, AgentStructuredOutput } from './types';
import {
  buildPostOutputFormat,
  detectPlatform,
} from './prompt-utils';
import type { ThinkForgeContentSignalProfile } from '../signals';
import { parseAgentJson } from '../protocol/parse-agent-json';
import { generateWithWritingContextCache } from '../services/gemini-writing-context-cache';
import { getAntiAiConstraintBundle, buildWritingKnowledgeBlock } from '../data/writing-graph-query';
import { extractSignalsFromContext } from '../data/extract-signals';
import { repairAiFillerContent } from '../services/ai-filler-repair';
import { formatTrendBriefForPrompt } from './trend-brief-context';

// Flat PostWriter Output Contract
export const PostWriterResultSchema = z.object({
  content: z.string().describe('The actual post text formatted for the platform'),
  contentAnalysis: z.object({
    tone: z.string().describe('The dominant tone used (e.g., Professional, Edgy, Instructive)'),
    vibe: z.string().describe('The overarching vibe or mood of the piece'),
    theme: z.string().describe('The core theme or message being delivered'),
    qualityScore: z.number().min(0).max(100).describe('Self-evaluated quality score (0-100) based on specificity and engagement'),
    violations: z.array(z.string()).describe('List of platform or brand rule violations (ideally empty)'),
  }),
  clickatron: z.object({
    singleImagePrompt: z.string().optional().describe('A detailed prompt to generate a single accompanying image using Clickatron. MUST include specific physical props/elements and explicitly define any Text Overlays (headings, dates, locations, quotes).'),
    carouselPrompts: z.array(z.string()).optional().describe('An array of detailed prompts for each slide if this should be a carousel. MUST include specific physical props/elements and explicitly define any Text Overlays.'),
  }),
  metadata: z.object({
    platform: z.string().describe('The targeted platform (linkedin, twitter, etc)'),
    charCount: z.number().describe('Estimated character count'),
  }),
});

export type PostWriterResult = z.infer<typeof PostWriterResultSchema>;

/**
 * Edit framing for the revise-existing-content path (P5). When present, the writer REVISES
 * `existingContent` per `instruction` and returns the COMPLETE revised post in the same
 * PostWriterResult shape. Opt-in: absent editContext = unchanged from-scratch behavior.
 */
export interface PostWriterEditContext {
  existingContent: string;
  instruction: string;
  selection?: string;
  focusHint?: string;
}

export interface PostWriterInput extends AgentInput {
  contentSignalProfile?: ThinkForgeContentSignalProfile;
  productionBrief?: ProductionBrief | null;
  /** When set, switches the writer into edit/revise mode (see PostWriterEditContext). */
  editContext?: PostWriterEditContext;
}

const POST_CTA_PATTERN =
  /(?:\b(ask|apply|book|buy|call|claim|comment|contact|dm|donate|discover|download|get|join|learn more|message|register|reply|repost|reserve|save|schedule|send|share|shop|sign ?up|tag|try|visit|watch)\b|inscr[ií]bete|registrate|reg[ií]strate|[uú]nete|reserva|compra|visita|env[ií]a|manda|escr[ií]benos|comenta|comparte)/i;

const MIN_COMPLETE_POST_CHARS: Record<string, number> = {
  twitter: 50,
  instagram: 150,
  facebook: 150,
  linkedin: 500,
  generic: 250,
};

const CACHED_POST_AI_FILLER = getAntiAiConstraintBundle().fillerPatterns.map((pattern) => ({
  regex: new RegExp(pattern.pattern, 'i'),
  label: pattern.label,
}));

function getPublishableLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^#\w/.test(line));
}

export function assertUsablePostWriterResult(result: PostWriterResult, input: PostWriterInput): void {
  const platform = detectPlatform(input.userPrompt, undefined, input.context.projectSummary);
  const content = result.content.trim();
  const lines = getPublishableLines(content);
  const ctaTail = lines.slice(-3).join('\n');
  const failures: string[] = [];
  const minChars = MIN_COMPLETE_POST_CHARS[platform] ?? MIN_COMPLETE_POST_CHARS.generic;

  const minBodyLines = platform === 'twitter' ? 1 : 3;

  if (content.length < minChars) failures.push(`content_under_${minChars}_chars`);
  if (lines.length < minBodyLines) failures.push('missing_body_or_cta_lines');
  if (!(/[?]/.test(ctaTail) || POST_CTA_PATTERN.test(ctaTail))) failures.push('missing_action_cta');
  if (platform !== 'twitter' && !/#\w+/.test(content)) failures.push('missing_hashtags');
  if (!(result.clickatron?.singleImagePrompt || result.clickatron?.carouselPrompts?.length)) {
    failures.push('missing_clickatron_prompt');
  }

  const filler = CACHED_POST_AI_FILLER.find((pattern) => pattern.regex.test(content));
  if (filler) failures.push(`banned_phrase:${filler.label}`);

  if (failures.length > 0) {
    throw new Error(`Post writer output failed publishable quality gate: ${failures.join(', ')}`);
  }
}

export class PostWriterAgent extends StructuredAgent<PostWriterResult> {
  protected schema = PostWriterResultSchema;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'post_writer',
      // Default to flash for core creative thinking
      modelName: config?.modelName ?? 'gemini-2.5-flash',
      maxTokens: config?.maxTokens ?? 8192,
      temperature: config?.temperature ?? 0.45,
    });
  }

  buildPrompt(input: PostWriterInput): string {
    const { context, userPrompt, retrievedContext, editContext, productionBrief } = input;
    const platform = detectPlatform(userPrompt, undefined, context.projectSummary);
    const outputFormat = buildPostOutputFormat(platform);
    const facts = [...(retrievedContext?.projectFacts || []), ...(retrievedContext?.globalFacts || [])];
    const databankBlock = facts.length > 0
      ? facts.map((fact, i) => `[Source ${i + 1} - ${fact.title}]: ${fact.summary}`).join('\n')
      : 'No retrieved project or global facts loaded.';
    const brandBlock = context.systemBrief || 'No Brand DNA or memory loaded.';

    // Writing knowledge graph: select techniques (DO/WHY/NEVER) from the content signals so the
    // flat writers get the same craft guidance the orchestrated ScriptAuthor path gets, not just
    // the anti-filler gate. Signals come from the resolved profile when threaded, else derived.
    const signalDocType = input.contentSignalProfile?.profile.constraints.output_format;
    const writingBlock = buildWritingKnowledgeBlock(
      input.contentSignalProfile?.profile.signals ?? extractSignalsFromContext({
        documentType: signalDocType,
        medium: signalDocType,
        projectSummary: context.projectSummary,
        userPrompt,
      }),
    );
    const trendBriefBlock = formatTrendBriefForPrompt(productionBrief);

    return `<role>You are an elite ${platform} copywriter and content strategist.</role>
<task>${editContext
      ? 'REVISE the existing post per the requested change and return the COMPLETE revised post'
      : 'Write ONE final, publishable post for the detected platform'}. Return JSON that matches the schema exactly.</task>

<rules>
SOURCE-LEDGER
- Every factual sentence must trace to an exact phrase in <input_data>.
- Preserve supplied dates, times, prices, URLs, brand names, event names, product names, offers, and taglines verbatim.
- Keep supplied formats when possible: "9am" stays "9am", "$40K" stays "$40K".
- Do not invent ingredients, study results, timelines, percentages, discounts, prices, guarantees, or performance claims.
- If proof is thin, make the writing specific through scene, audience pain, workflow friction, object detail, rhythm, and framing.

HOOK
- The first visible line must carry a grounded claim, supplied number, named entity, or concrete pain from <input_data>.
- No cliche openers.

CTA
- A CTA is mandatory for every post.
- It must be specific to the brief and appear before hashtags in the last 3 non-hashtag lines.
- Use supplied URLs or actions when they exist.

ANTI-FILLER
- Obey the anti-filler list in <output_format> exactly.
- Prefer plain, concrete nouns and verbs over abstract business language.

VISUAL HANDOFF
- The clickatron field is part of the deliverable, not optional decoration.
- Image prompts must carry the same source facts as the post and include editable overlay text when text appears.
</rules>

${editContext ? `<current_post>
${editContext.existingContent || '(the current post is empty)'}
</current_post>
<edit_task>
Requested change: ${editContext.instruction}${editContext.selection ? `\nTargeted selection: "${editContext.selection}"` : ''}${editContext.focusHint ? `\nFocus: ${editContext.focusHint}` : ''}
Return the ENTIRE revised post in the content field (not a diff). Keep everything the change does not touch, preserve all supplied facts verbatim, and keep the platform format, hook, CTA, and hashtags.
</edit_task>

` : ''}${writingBlock ? `${writingBlock}\n\n` : ''}${trendBriefBlock ? `${trendBriefBlock}\n\n` : ''}${outputFormat}

<input_data>
Project Summary:
${context.projectSummary || 'No summary provided.'}

Brand DNA and Memory:
${brandBlock}

DataBank Facts:
${databankBlock}

USER BRIEF:
${userPrompt}
</input_data>

Return your response strictly adhering to the JSON schema.`;
  }
  async runStructured(
    input: PostWriterInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal,
  ): Promise<AgentStructuredOutput<PostWriterResult>> {
    const prompt = this.applyGlobalConstraints(this.buildPrompt(input));
    const gen = this.resolveGenConfig(overrides);

    let output: AgentStructuredOutput<PostWriterResult>;
    try {
      const jsonContract = [
        'Return ONLY valid JSON. Do not include markdown fences or commentary.',
        'Required JSON shape:',
        '{',
        '  "content": "publishable post text as a string",',
        '  "contentAnalysis": { "tone": "string", "vibe": "string", "theme": "string", "qualityScore": 0, "violations": [] },',
        '  "clickatron": { "singleImagePrompt": "string", "carouselPrompts": ["string"] },',
        '  "metadata": { "platform": "string", "charCount": 0 }',
        '}',
        'contentAnalysis.violations must be an array of strings only. Use [] when there are no violations; never return violation objects.',
        'clickatron.singleImagePrompt must be a string, not an object.',
        'Every carouselPrompts item must be a string, not an object.',
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
      assertUsablePostWriterResult(result, input);

      output = {
        result,
        metadata: {
          model: modelName,
          notes: `writing_context_cache:${cacheStatus}`,
        },
      };
    } catch (error) {
      console.warn('[ThinkForge:PostWriter] Writing context cache failed; falling back to structured path:', error);
      output = await super.runStructured(input, overrides, abortSignal);
    }

    // Filler self-repair: one in-context rewrite if a banned phrase slipped through either path.
    // Fail-soft — keeps the original unless the rewrite strictly reduced filler (see ai-filler-repair).
    output.result.content = await repairAiFillerContent(output.result.content, this.config.modelName, abortSignal);
    assertUsablePostWriterResult(output.result, input);
    return output;
  }
}

export function createPostWriterAgent(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
  return new PostWriterAgent(config);
}
