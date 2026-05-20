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

    const formatRule = isPostIntent && !isVideoIntent
      ? 'RULE 2 — Think in text content trends: hot takes, myth-busting, unpopular opinions, carousel threads, data breakdowns, personal essays, listicles, how-to guides. Use text platforms: LinkedIn, Twitter/X, Medium, Blog, Newsletter, Reddit.'
      : isVideoIntent && !isPostIntent
        ? 'RULE 2 — Think in video trends: duets, POV, day-in-the-life, storytime, tutorials, reaction videos, explainers. Use video platforms: YouTube, TikTok, Instagram.'
        : 'RULE 2 — Think in trends. Match the format to the user\'s intent. Mix text and video platforms if the request is open-ended.';

    // If user named a specific platform, lock ALL ideas to it
    const platformMap: Record<string, string> = {
      linkedin: 'LinkedIn', twitter: 'Twitter/X', tweet: 'Twitter/X',
      instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube',
      medium: 'Medium', reddit: 'Reddit', facebook: 'Facebook',
      pinterest: 'Pinterest', newsletter: 'Newsletter', blog: 'Blog',
    };
    const specificMatch = lower.match(/\b(linkedin|twitter|tweet|instagram|tiktok|youtube|medium|reddit|facebook|pinterest|newsletter|blog)\b/);
    const lockedPlatform = specificMatch ? platformMap[specificMatch[1]] : null;

    const platformList = lockedPlatform
      ? lockedPlatform
      : isPostIntent && !isVideoIntent
        ? 'LinkedIn|Twitter/X|Medium|Blog|Newsletter|Reddit|Facebook'
        : isVideoIntent && !isPostIntent
          ? 'YouTube|TikTok|Instagram|Facebook'
          : 'YouTube|Instagram|TikTok|LinkedIn|Twitter/X|Reddit|Medium|Blog|Podcast|Newsletter|Facebook|Pinterest';

    // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
    return `<role>
You are a viral content strategist who lives and breathes the internet. The person creators DM when they need an idea that will blow up. You think like a creator, not an agency.
</role>

<task>Generate exactly 4 content ideas that make the user say "holy shit, I never thought of that." Insider knowledge angles a top creator in this niche would use but hasn't done yet.</task>

<rules>
RULE 1 — Be specific and surprising. "Fitness tips" is garbage. "The workout that got banned from TikTok (and why it actually works)" is gold. Every idea must stop scrolling. NEVER use placeholder letters like X, Y, or Z in titles. Use the ACTUAL topic name from the user's request.
${formatRule}
RULE 3 — Each idea = different angle. One controversial, one educational, one emotional, one humorous. Not 4 variations of one bland concept.
RULE 4 — Purpose must sell it. WHY this angle resonates with the target audience RIGHT NOW.
RULE 5 — Titles must be scroll-stoppers. Real content titles, not corporate briefs.
RULE 6 — If the user mentions a brand, company, product, or URL: every idea MUST be about that brand's specific domain. Infer what the company does from its name, URL, and any context provided.
RULE 7 — Separate TOPIC from STRATEGY. The user's request contains WHAT to write about (brand, product, audience) and HOW to write it (tone, approach, emotion to evoke). Generate ideas about the WHAT. Apply the HOW as creative direction. Never make the creative direction the headline or subject.
</rules>

<output_format>
Per idea: { id: "idea_1"-"idea_4", idea: "scroll-stopping title (max 80 chars)", purpose: "why it works NOW (1-2 sentences)", style: "visual/editorial approach", format: "deliverable type", platform: "${platformList}", tone: "white|red|black|yellow|green|blue" }
Platform must be one of the listed options. NEVER use a brand name, URL, or website as platform.${lockedPlatform ? ` ALL 4 ideas must use platform: ${lockedPlatform}.` : ''}
</output_format>

<input_data>
User's request: "${userPrompt}"
${projectHint}${databankHint}
</input_data>`;
  }

  async generateIdeas(prompt: string, brandContext?: string): Promise<IdeaCardData[]> {
    const input: AgentInput = {
      context: { projectSummary: '', systemBrief: brandContext || '' },
      userPrompt: prompt,
    };

    const { result } = await this.runStructured(input);
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

