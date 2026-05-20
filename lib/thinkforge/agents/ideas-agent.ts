/**
 * Ideas Agent - Generates 4 content ideas using Google Generative AI
 * 
 * Purpose: Generate diverse content ideas based on a prompt
 * 
 * Key rules:
 * - Pure structured output (no streaming)
 * - Stateless and replaceable
 * - No persistence assumptions
 * 
 * The agent only knows: prompt in → reasoning → structured output
 * Target: <2s response time
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput, AgentStructuredOutput } from './types';
import type { IdeaCardData } from '../state/types';
import { createThinkForgeModel } from './model-factory';

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

const VALID_PLATFORMS = [
  'YouTube', 'Instagram', 'TikTok', 'LinkedIn', 'Twitter/X',
  'Reddit', 'Medium', 'Blog', 'Podcast', 'Newsletter', 'Facebook', 'Pinterest',
] as const;

const IdeaSchema = z.object({
  id: z.string(),
  idea: z.string().max(200),
  purpose: z.string(),
  style: z.string(),
  format: z.string(),
  platform: z.enum(VALID_PLATFORMS),
  tone: z.enum(['white', 'red', 'black', 'yellow', 'green', 'blue'])
});

const IdeasResponseSchema = z.object({
  ideas: z.array(IdeaSchema).length(4)
});

type IdeasOutput = z.infer<typeof IdeasResponseSchema>;

// =============================================================================
// NEW ARCHITECTURE - Clean, Pure Agent
// =============================================================================

/**
 * Ideas Agent - extends StructuredAgent for structured idea generation
 * 
 * This agent is stateless and pure.
 * It generates 4 diverse content ideas based on user prompt.
 */
export class IdeasAgent extends StructuredAgent<IdeasOutput> {
  protected schema = IdeasResponseSchema;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'ideas',
      temperature: config?.temperature ?? 1.0,
      maxTokens: config?.maxTokens ?? 2500,
    });
  }

  buildPrompt({ context, userPrompt }: AgentInput): string {
    const projectHint = context.projectSummary
      ? `\nProject context: ${context.projectSummary}`
      : '';
    const databankHint = context.systemBrief
      ? `\nResearch & brand context: ${context.systemBrief}`
      : '';

    // Intent detection — drives which formats/platforms appear in the prompt
    const lower = userPrompt.toLowerCase();
    const isPostIntent = /\b(post|article|blog|essay|thread|newsletter|write|linkedin|twitter|tweet|medium)\b/.test(lower);
    const isVideoIntent = /\b(video|reel|short|tiktok|youtube|vlog|film|clip|skit)\b/.test(lower);

    // If user named a specific platform, lock ALL ideas to it
    const platformMap: Record<string, string> = {
      linkedin: 'LinkedIn', twitter: 'Twitter/X', tweet: 'Twitter/X',
      instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube',
      medium: 'Medium', reddit: 'Reddit', facebook: 'Facebook',
      pinterest: 'Pinterest', newsletter: 'Newsletter', blog: 'Blog',
    };
    const specificMatch = lower.match(/\b(linkedin|twitter|tweet|instagram|tiktok|youtube|medium|reddit|facebook|pinterest|newsletter|blog)\b/);
    const lockedPlatform = specificMatch ? platformMap[specificMatch[1]] : null;

    // Post wins when both match — consistent with code-level enforcement
    const platformList = lockedPlatform
      ? lockedPlatform
      : isPostIntent
        ? 'LinkedIn|Twitter/X|Medium|Blog|Newsletter|Reddit|Facebook'
        : isVideoIntent
          ? 'YouTube|TikTok|Instagram|Facebook'
          : 'YouTube|Instagram|TikTok|LinkedIn|Twitter/X|Reddit|Medium|Blog|Podcast|Newsletter|Facebook|Pinterest';

    // ─── Prompt: Rule 35 methodology (XML, data-last, rules not examples) ──
    const platformInstruction = lockedPlatform
      ? `ALL 4 ideas must use platform: ${lockedPlatform}.`
      : `Platform must be one of: ${platformList}.`;

    return `<role>
You are a content strategist who generates scroll-stopping content ideas for specific brands and audiences.
</role>

<task>
Generate exactly 4 content ideas directly relevant to the brand, product, or topic in the request below.
</task>

<rules>
- Ideas must be relevant to the brand's domain and audience. Titles should be specific to the niche, not generic.
- 4 different angles: one controversial, one educational, one emotional, one humorous.
- Creative direction in the request (tone, strategy, emotion) describes HOW to write, not the subject. Apply it as the approach to the content, not the content itself.
- Deliverable format must match the platform type.
- Only use platforms from the allowed list in the output_format section. No other platforms.
</rules>

<output_format>
Return exactly 4 JSON objects:
{ id: "idea_1" to "idea_4", idea: "title max 80 chars", purpose: "why now 1-2 sentences", style: "editorial approach", format: "deliverable type", platform: "from allowed list", tone: "white|red|black|yellow|green|blue" }
${platformInstruction}
</output_format>

<input_data>
${userPrompt}
${projectHint}${databankHint}
</input_data>`;
  }

  async generateIdeas(prompt: string, brandContext?: string): Promise<IdeaCardData[]> {
    const input: AgentInput = {
      context: { projectSummary: '', systemBrief: brandContext || '' },
      userPrompt: prompt,
    };

    const { result } = await this.runStructured(input);

    // Code-level platform enforcement — Zod enum accepts all platforms,
    // but intent detection restricts which ones are allowed. Replace any
    // disallowed platform with the first allowed one.
    const lower = prompt.toLowerCase();
    const isPostIntent = /\b(post|article|blog|essay|thread|newsletter|write|linkedin|twitter|tweet|medium)\b/.test(lower);
    const isVideoIntent = /\b(video|reel|short|tiktok|youtube|vlog|film|clip|skit)\b/.test(lower);

    const platformMap: Record<string, string> = {
      linkedin: 'LinkedIn', twitter: 'Twitter/X', tweet: 'Twitter/X',
      instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube',
      medium: 'Medium', reddit: 'Reddit', facebook: 'Facebook',
      pinterest: 'Pinterest', newsletter: 'Newsletter', blog: 'Blog',
    };
    const specificMatch = lower.match(/\b(linkedin|twitter|tweet|instagram|tiktok|youtube|medium|reddit|facebook|pinterest|newsletter|blog)\b/);
    const lockedPlatform = specificMatch ? platformMap[specificMatch[1]] : null;

    const textPlatforms = new Set(['LinkedIn', 'Twitter/X', 'Medium', 'Blog', 'Newsletter', 'Reddit', 'Facebook']);
    const videoPlatforms = new Set(['YouTube', 'TikTok', 'Instagram', 'Facebook']);

    // Post wins when both match — "post for a video editing tool" is a post, not a video
    const allowedPlatforms = lockedPlatform
      ? new Set([lockedPlatform])
      : isPostIntent
        ? textPlatforms
        : isVideoIntent
          ? videoPlatforms
          : null; // null = all allowed

    if (allowedPlatforms) {
      const fallback = [...allowedPlatforms][0];
      return result.ideas.map(idea => ({
        ...idea,
        platform: allowedPlatforms.has(idea.platform) ? idea.platform : fallback,
      }));
    }

    return result.ideas;
  }
}

/**
 * Factory function for creating IdeasAgent instances
 */
export function createIdeasAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): IdeasAgent {
  return new IdeasAgent(config);
}

// =============================================================================
// LEGACY API - Backwards compatibility
// =============================================================================

/**
 * @deprecated Use IdeasAgent class or createIdeasAgent function instead
 * 
 * Generate 4 content ideas based on prompt
 */
export async function generateIdeas(prompt: string): Promise<IdeaCardData[]> {
  try {
    const agent = createIdeasAgent();
    return await agent.generateIdeas(prompt);
  } catch (error) {
    console.error('Error generating ideas:', error);
    // Fallback: return skeleton ideas
    return generateFallbackIdeas(prompt);
  }
}

/**
 * Generate fallback ideas if AI generation fails
 */
function generateFallbackIdeas(prompt: string): IdeaCardData[] {
  const base = prompt.trim().slice(0, 50) || 'Content';
  const intents = ['awareness', 'conversion', 'engagement', 'retention'];
  const styles = [
    'fast-paced, energetic cuts',
    'systematic breakdown',
    'data-backed explainer',
    'operational micro-case'
  ];
  const formats = [
    '30s short-form video',
    'carousel thread',
    'procedural reel',
    'teaser snippet'
  ];
  const platforms = ['TikTok', 'YouTube Shorts', 'Instagram Reels', 'LinkedIn'];
  const tones: Array<'white' | 'red' | 'black' | 'yellow' | 'green' | 'blue'> = ['white', 'red', 'black', 'yellow'];

  return Array.from({ length: 4 }).map((_, i) => ({
    id: `${Date.now()}-${i}`,
    idea: `${base} – ${intents[i]} angle`,
    purpose: `Drive ${intents[i]} around the core theme via differentiated framing.`,
    style: styles[i],
    format: formats[i],
    platform: platforms[i],
    tone: tones[i]
  }));
}

