import { z } from 'zod';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput, AgentStructuredOutput } from './types';
import {
  buildPostOutputFormat,
  detectPlatform,
} from './prompt-utils';
import type { ThinkForgeContentSignalProfile } from '../signals';
import { generateStructuredWithWritingContextCache } from '../services/gemini-writing-context-cache';
import { getAntiAiConstraintBundle, buildWritingKnowledgeBlock } from '../data/writing-graph-query';
import { extractSignalsFromContext } from '../data/extract-signals';
import { repairAiFillerContent } from '../services/ai-filler-repair';
import { formatTrendBriefForPrompt } from './trend-brief-context';
import type { ThinkForgeDocumentContract } from '../schemas/document-contract';
import { buildIsolatedPromptParts, type IsolatedPromptParts } from './prompt-boundary';

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
  project?: (NonNullable<AgentInput['project']> & { contentContract?: ThinkForgeDocumentContract }) | null;
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

function requestedCarouselSlideCount(input: PostWriterInput): number | undefined {
  const contract = input.project?.contentContract;
  return contract?.outputKind === 'carousel' ? contract.carouselSlideCount : undefined;
}

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
  const carouselSlideCount = requestedCarouselSlideCount(input);
  if (carouselSlideCount !== undefined) {
    const promptCount = result.clickatron?.carouselPrompts?.length ?? 0;
    if (promptCount !== carouselSlideCount) {
      failures.push(`carousel_prompt_count_mismatch:${promptCount}/${carouselSlideCount}`);
    }
    if (result.clickatron?.singleImagePrompt) failures.push('carousel_returned_single_image_prompt');
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
    const parts = this.buildPromptParts(input);
    return `${parts.systemInstruction}\n\n${parts.prompt}`;
  }

  buildPromptParts(input: PostWriterInput): IsolatedPromptParts {
    const { context, userPrompt, retrievedContext, editContext, productionBrief } = input;
    const platform = detectPlatform(userPrompt, undefined, context.projectSummary);
    const outputFormat = buildPostOutputFormat(platform).replaceAll('<input_data>', 'tf_untrusted_data');
    const facts = [...(retrievedContext?.projectFacts || []), ...(retrievedContext?.globalFacts || [])];

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
    const trendBriefForData = `${trendBriefBlock ? `${trendBriefBlock}\n\n` : ''}`;
    const carouselSlideCount = requestedCarouselSlideCount(input);
    const carouselContractBlock = carouselSlideCount === undefined
      ? ''
      : `<carousel_contract>
- Return exactly ${carouselSlideCount} entries in clickatron.carouselPrompts, one per slide.
- Do not return clickatron.singleImagePrompt.
- Each slide must communicate a distinct grounded unit from tf_untrusted_data; never pad the count with invented claims.
</carousel_contract>\n\n`;

    const systemInstruction = `<role>You are an elite ${platform} copywriter and content strategist.</role>
<task>${editContext
      ? 'REVISE the existing post per the requested change and return the COMPLETE revised post'
      : 'Write ONE final, publishable post for the detected platform'}. Return JSON that matches the schema exactly.</task>

<rules>
SOURCE-LEDGER
- Every factual sentence must trace to an exact phrase in tf_untrusted_data.
- Preserve supplied dates, times, prices, URLs, brand names, event names, product names, offers, and taglines verbatim.
- Keep supplied formats when possible: "9am" stays "9am", "$40K" stays "$40K".
- Do not invent ingredients, study results, timelines, percentages, discounts, prices, guarantees, or performance claims.
- If proof is thin, make the writing specific through scene, audience pain, workflow friction, object detail, rhythm, and framing.

HOOK
- The first visible line must carry a grounded claim, supplied number, named entity, or concrete pain from tf_untrusted_data.
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

${editContext ? `<edit_rules>
- Revise the existing post according to edit.instruction in tf_untrusted_data.
- Return the ENTIRE revised post in the content field, not a diff.
- Keep everything the change does not touch and preserve supplied facts verbatim.
</edit_rules>

` : ''}${writingBlock ? `${writingBlock}\n\n` : ''}${carouselContractBlock}${outputFormat}

Return your response strictly adhering to the JSON schema.`;

    return buildIsolatedPromptParts({
      systemInstruction: this.applyGlobalConstraints(systemInstruction),
      data: {
        projectSummary: context.projectSummary || null,
        brandContext: context.systemBrief || null,
        databankFacts: facts.map((fact, index) => ({
          sourceId: `source_${index + 1}`,
          title: fact.title,
          summary: fact.summary,
        })),
        userBrief: userPrompt,
        trendBrief: trendBriefForData || null,
        edit: editContext
          ? {
              existingContent: editContext.existingContent || null,
              instruction: editContext.instruction,
              selection: editContext.selection || null,
              focusHint: editContext.focusHint || null,
            }
          : null,
      },
      fieldLimits: {
        projectSummary: 12_000,
        brandContext: 24_000,
        userBrief: 12_000,
        title: 300,
        summary: 4_000,
        trendBrief: 16_000,
        existingContent: 24_000,
        instruction: 8_000,
        selection: 8_000,
        focusHint: 2_000,
      },
    });
  }
  async runStructured(
    input: PostWriterInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal,
  ): Promise<AgentStructuredOutput<PostWriterResult>> {
    const promptParts = this.buildPromptParts(input);
    const gen = this.resolveGenConfig(overrides);

    const { result, cacheStatus, modelName } = await generateStructuredWithWritingContextCache({
      prompt: promptParts.prompt,
      systemInstruction: promptParts.systemInstruction,
      schema: this.schema,
      modelName: this.config.modelName,
      temperature: gen.temperature,
      maxTokens: gen.maxTokens,
      abortSignal,
    });

    assertUsablePostWriterResult(result, input);
    const output: AgentStructuredOutput<PostWriterResult> = {
      result,
      metadata: {
        model: modelName,
        notes: `writing_context_cache:${cacheStatus}`,
      },
    };
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
