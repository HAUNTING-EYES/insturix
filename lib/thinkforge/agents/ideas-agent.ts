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

const IdeaSchema = z.object({
  id: z.string(),
  idea: z.string().max(200),
  purpose: z.string(),
  style: z.string(),
  format: z.string(),
  platform: z.string(),
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

    return `You are a viral content strategist who lives and breathes the internet. You're the person creators DM when they need an idea that will blow up. You don't think like an agency — you think like a creator.

## User's request
"${userPrompt}"
${projectHint}${databankHint}

## Your job
Generate exactly 4 content ideas that make the user say "holy shit, I never thought of that." These ideas should feel like insider knowledge — the kind of angle a top creator in this niche would use but hasn't done yet.

## Rules
1. **Be specific and surprising.** "Fitness tips" is garbage. "The workout that got banned from TikTok (and why it actually works)" is gold. Every idea must have a hook that makes someone stop scrolling.
2. **Think in trends.** Reference real content formats that are currently working: duets, POV videos, "day in the life" vlogs, hot takes, myth-busting, storytime, "things nobody tells you about X", unpopular opinions, etc.
3. **Each idea = different angle.** One might be controversial, one educational, one emotional, one humorous. Don't give 4 variations of the same bland concept.
4. **Match the medium.** If the project is a YouTube video, don't suggest a tweet thread. If it's a podcast, don't suggest a 15-second reel.
5. **The purpose must sell the idea.** Explain WHY this specific angle would resonate with the target audience right now — not generic marketing speak.
6. **Titles must be scroll-stoppers.** Write them like actual video titles or content hooks that a creator would use.

## Output schema per idea
- id: "idea_1" through "idea_4"
- idea: A scroll-stopping title/hook (max 80 chars). Write it like a real content title, not a corporate brief.
- purpose: Why this angle works RIGHT NOW for this audience (1-2 punchy sentences)
- style: The specific visual/editorial approach (e.g., "raw iPhone footage with jump cuts", "cinematic B-roll with voiceover", "screen recording walkthrough")
- format: The actual deliverable (e.g., "90-second vertical video", "10-minute deep dive", "carousel post")
- platform: Where this performs best (e.g., "TikTok", "YouTube", "Instagram Reels", "LinkedIn")
- tone: One of: white (factual), red (emotional), black (critical), yellow (optimistic), green (creative), blue (analytical)

Generate 4 ideas now. Make them genuinely exciting.`;
  }

  async generateIdeas(prompt: string, projectContext?: string): Promise<IdeaCardData[]> {
    const input: AgentInput = {
      context: { projectSummary: projectContext || '' },
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

