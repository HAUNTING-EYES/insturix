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
  idea: z.string().max(120),
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

// Deterministic floor behind the no-placeholder prompt rule: strip bracketed template
// tokens the model leaves when context is thin (e.g. "The [Problem] Solution") and tidy
// the seams. Only touches [...] tokens, so "X thread" / "Twitter/X" survive untouched.
function stripPlaceholders(text: string): string {
  return text
    .replace(/\[[^\]]{1,60}\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,:;!?])/g, '$1')
    .replace(/[\s:–—-]+$/g, '')
    .trim();
}

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

  // ─── Prompt: restored from stable aa1f258e ────────────────────────
  // Creative quality lives here. Platform/format enforcement lives in code.
  buildPrompt({ context, userPrompt }: AgentInput): string {
    const projectHint = context.projectSummary
      ? `\nProject context: ${context.projectSummary}`
      : '';
    const databankHint = context.systemBrief
      ? `\nResearch & brand context: ${context.systemBrief}`
      : '';

    return `You are a senior creative strategist. A user has described their project to you. Your job is to generate exactly 4 content ideas that are DIRECTLY rooted in what the user asked for.

## User's request
"${userPrompt}"
${projectHint}${databankHint}

## Rules
1. Every idea MUST be a concrete, actionable interpretation of the user's request — not a generic pivot away from it.
2. Your job is ONLY to propose 4 possible angles. Do not compress, replace, or rewrite the user's full brief; the original user brief will be passed separately to the writer as the factual source of truth.
3. Read the user's words carefully. If they said "documentary about X," all 4 ideas must be documentary-related — not social media posts or carousels.
4. Each idea should take a DIFFERENT angle on the same core request: a different narrative structure, audience focus, visual approach, or emotional lens.
5. The "purpose" must explain what this specific angle achieves that the others don't.
6. Formats and platforms must match the project's actual medium. A feature film project gets screenplay treatments, not TikTok reels.
7. Titles must be specific and concrete, filling every slot with a real noun from the user's request and brand context. NEVER ship a template: no bracketed placeholders like [Problem] or [Specific Skill/Outcome], no placeholder letters (X/Y/Z), and never use the word "Specific" as a stand-in for a real detail. If a concrete detail is missing, write a complete idea that does not need that slot ("Untold Stories of the Night Shift" beats "Untold Stories of [Topic]").
8. If the user asks for a content calendar, campaign, or series, every idea must preserve that planning context in the purpose and format. Say where it fits in the calendar or campaign, not just what the content is.
9. If the user asks to repurpose a public trend, meme, or news item, every idea must name the trend, explain the brand-fit reason, and include a freshness or expiry window.
10. For business, agency, or operator content, make the format a concrete platform-ready deliverable such as "LinkedIn post", "LinkedIn carousel", "newsletter section", "blog article", "short video script", or "X thread". Avoid vague formats like "campaign idea", "content concept", or "multi-platform".

## Output schema per idea
- id: "idea_1" through "idea_4"
- idea: Specific, compelling title (max 80 chars) that captures the angle
- purpose: What this angle achieves for the project (1-2 sentences)
- style: Editorial/visual style matched to the medium (e.g., "data-driven explainer", "founder-voice monologue", "punchy contrarian take", "behind-the-scenes")
- format: The concrete deliverable, matched to the medium the user asked for. If the request says "post", "write", "article", or names a text platform, choose a TEXT format ("LinkedIn post", "X thread", "carousel", "newsletter", "blog article"). Only choose a video format ("short video script", "reel script") when the user explicitly asks for video, reel, short, or names a video platform. Never default to video for a text request.
- platform: Where this lives (e.g., "Netflix", "YouTube", "Film Festival", "Internal", "Blog", "Multi-platform")
- tone: One of: white (factual), red (emotional), black (critical), yellow (optimistic), green (creative), blue (analytical)

Generate 4 ideas now.`;
  }

  // ─── Code-level platform enforcement (post-output) ────────────────
  // The prompt produces creative ideas. This code ensures platforms match
  // the user's intent. Prompt handles quality, code handles constraints.
  async generateIdeas(prompt: string, brandContext?: string): Promise<IdeaCardData[]> {
    const input: AgentInput = {
      context: { projectSummary: '', systemBrief: brandContext || '' },
      userPrompt: prompt,
    };

    const { result } = await this.runStructured(input);

    // Intent detection for platform enforcement
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

    // Post wins when both match — "post for a video editing tool" is a post
    const allowedPlatforms = lockedPlatform
      ? new Set([lockedPlatform])
      : isPostIntent
        ? textPlatforms
        : isVideoIntent
          ? videoPlatforms
          : null; // null = all allowed

    // Medium intent: post wins when both appear ("post for a video tool" = post).
    const intendedMedium: 'text' | 'video' | null = isPostIntent ? 'text' : isVideoIntent ? 'video' : null;
    const VIDEO_FORMAT = /\b(video|reels?|shorts?|vlog|clip|skit|film|tiktok|youtube)\b/i;
    const fallbackPlatform = allowedPlatforms ? [...allowedPlatforms][0] : null;

    return result.ideas.map(idea => {
      // Normalize multi-platform strings ("YouTube, LinkedIn") to the first, then enforce.
      const first = idea.platform.split(/[,&]/)[0].trim();
      const platform = !allowedPlatforms
        ? first
        : allowedPlatforms.has(first) ? first : (fallbackPlatform as string);

      // RC3: keep the deliverable in the medium the user asked for.
      let format = idea.format;
      if (intendedMedium === 'text' && VIDEO_FORMAT.test(format)) {
        format = `${platform} post`;
      }

      // RC2: never let a bracketed template placeholder reach the UI.
      return {
        ...idea,
        platform,
        format: stripPlaceholders(format),
        idea: stripPlaceholders(idea.idea),
        purpose: stripPlaceholders(idea.purpose),
        style: stripPlaceholders(idea.style),
      };
    });
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
