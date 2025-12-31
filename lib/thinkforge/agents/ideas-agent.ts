/**
 * Ideas Agent - Generates 4 content ideas using Google Generative AI
 * Supports both Vertex AI (service account) and API key authentication
 * Target: <2s response time
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import type { IdeaCardData } from '../state/types';
import { createThinkForgeModel } from './model-factory';

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

/**
 * Generate 4 content ideas based on prompt
 */
export async function generateIdeas(prompt: string): Promise<IdeaCardData[]> {
  try {
    const model = createThinkForgeModel();
    
    const result = await generateObject({
      model,
      schema: IdeasResponseSchema,
      prompt: `Generate 4 diverse content ideas based on: "${prompt}"

For each idea, provide:
- idea: Main idea title (max 80 characters)
- purpose: Purpose description (what goal this content achieves)
- style: Style description (e.g., "fast-paced, energetic cuts", "story-driven narrative", "data-backed explainer")
- format: Format description (e.g., "30s short-form video", "carousel thread", "scripted reel")
- platform: Platform (e.g., "TikTok", "YouTube Shorts", "Instagram Reels", "LinkedIn", "X / Twitter", "Multi-platform")
- tone: One of: white (factual), red (emotional), black (critical), yellow (optimistic), green (creative), blue (analytical)

Make each idea unique and diverse in approach, style, and platform.`,
      temperature: 0.9,
      maxTokens: 2000
    });
    
    return result.object.ideas;
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
    'story-driven narrative',
    'data-backed explainer',
    'emotionally resonant micro-story'
  ];
  const formats = [
    '30s short-form video',
    'carousel thread',
    'scripted reel',
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

