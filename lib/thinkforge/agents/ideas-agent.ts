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
  idea: z.string().max(80),
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
      temperature: config?.temperature ?? 0.9,
      maxTokens: config?.maxTokens ?? 2000,
    });
  }
  
  buildPrompt({ context, userPrompt }: AgentInput): string {
    return `Generate 4 diverse content ideas based on: "${userPrompt}"

For each idea, provide:
- id: Unique identifier (e.g., "idea_1", "idea_2", etc.)
- idea: Main idea title (max 80 characters)
- purpose: Purpose description (what goal this content achieves)
- style: Style description (e.g., "fast-paced operational cuts", "systematic breakdown", "data-backed explainer")
- format: Format description (e.g., "30s short-form video", "carousel thread", "procedural reel")
- platform: Platform (e.g., "TikTok", "YouTube Shorts", "Instagram Reels", "LinkedIn", "X / Twitter", "Multi-platform")
- tone: One of: white (factual), red (emotional), black (critical), yellow (optimistic), green (creative), blue (analytical)

Make each idea unique and diverse in approach, style, and platform.`;
  }
  
  /**
   * Generate ideas and return as IdeaCardData array
   */
  async generateIdeas(prompt: string): Promise<IdeaCardData[]> {
    const input: AgentInput = {
      context: { projectSummary: '' }, // Ideas don't need context
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

