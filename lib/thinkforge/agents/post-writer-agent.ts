import { z } from 'zod';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import {
  PLATFORM_CONFIGS,
  detectPlatform,
  type PlatformType,
} from './prompt-utils';
import type { ThinkForgeContentSignalProfile } from '../signals';

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

export interface PostWriterInput extends AgentInput {
  contentSignalProfile?: ThinkForgeContentSignalProfile;
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
      temperature: config?.temperature ?? 0.7,
    });
  }

  buildPrompt(input: PostWriterInput): string {
    const { context, userPrompt, contentSignalProfile, retrievedContext } = input;
    
    // Detect platform
    const platform = detectPlatform(userPrompt, undefined, context.projectSummary);
    const platformConfig = PLATFORM_CONFIGS[platform];

    let prompt = `You are an elite Social Media Copywriter and Strategist.
Your task is to write a highly engaging, platform-native post for ${platformConfig.name}.

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

    // 3. Platform Rules
    prompt += `## Platform Rules: ${platformConfig.name}
- Target Length: ${platformConfig.charTarget} characters (Max: ${platformConfig.charMax})
- Hook: The first ${platformConfig.foldChars} characters MUST arrest attention. Front-load the value.
- Hashtags: Include ${platformConfig.hashtagRange} at the end.
- Guidance: ${platformConfig.extraGuidance}

## Generation Requirements
1. **Content:** Write the FINAL, publishable text. No meta-commentary. Do not wrap in markdown code blocks.
2. **Factual Density & Completeness:**
   - Treat the original user brief as the source of truth. If an idea/angle is present, use it only as creative framing.
   - DO NOT write vague or generic fluff. You MUST explicitly include all details from the prompt/context: exact dates, times, locations, brand names, event names, product/service names, offers, prices, statistics, CTA links/instructions, contact details, and required logo/text/tagline mentions.
   - If the intent is promotional or event-based, you MUST include a clear Call-To-Action (CTA) and relevant signup/participation details.
   - If a tagline, slogan, or specific brand phrase is provided, use it exactly as provided.
3. **Quality:** Do NOT use AI buzzwords ("in today's fast-paced world", "delve", "leverage", "game-changer"). Speak directly, like a human expert.
4. **Visual Prompts (Clickatron):** Provide high-fidelity image generation prompts in the \`clickatron\` field. If the post tells a multi-step story, provide \`carouselPrompts\`. If it's a single concept, provide \`singleImagePrompt\`.
   - **Source Facts Are Mandatory:** Every image prompt must carry the relevant source facts from the brief: brand name, logo placement if mentioned, event name, date, time, location, audience, product/service, offer, handouts/freebies, required colors/brand style, and any exact words that must appear.
   - **Include Specific Props/Elements:** Explicitly list relevant physical objects that should appear in the images (e.g., for a blood donation drive, specify "blood drops, syringes"; for a clothes drive, specify "folded clothes, donation boxes").
   - **Include Text Overlays:** Explicitly define exact text overlays from the brief, including heading, brand name, date, location, CTA, and short tagline when available. If a logo is requested, say "Place [Brand Name] logo at [position]" rather than omitting it.
   - **No Generic Image Prompts:** Never return prompts like "modern poster", "professional design", or "engaging visual" without the concrete factual details above.

Return your response strictly adhering to the JSON schema.`;

    return prompt;
  }
}

export function createPostWriterAgent(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
  return new PostWriterAgent(config);
}
