/**
 * Scope Detector Agent - The "Project DNA" Parser
 *
 * Analyzes the user's initial project prompt to determine:
 * - Complexity Level (solo_ugc, brand_doc, short_film, feature_film, epic)
 * - Domain (tech, lifestyle, entertainment, education, corporate, etc.)
 * - Recommended artifacts the project will need
 *
 * This agent runs once at project initialization and informs the Blueprint Engine.
 */

import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import { z } from 'zod';
import type { ProjectComplexity, DocumentType } from '../state/types';

const ScopeResultSchema = z.object({
  complexity: z.enum(['solo_ugc', 'brand_doc', 'short_film', 'feature_film', 'epic']),
  domain: z.string(),
  estimatedDuration: z.string().optional(),
  recommendedArtifacts: z.array(z.object({
    type: z.string(),
    label: z.string(),
    reason: z.string(),
  })),
  summary: z.string(),
});

export type ScopeResult = z.infer<typeof ScopeResultSchema>;

export class ScopeDetectorAgent extends StructuredAgent<ScopeResult> {
  protected schema = ScopeResultSchema;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'scope_detector',
      temperature: config?.temperature ?? 0.2,
      maxTokens: config?.maxTokens ?? 600,
    });
  }

  buildPrompt(input: AgentInput): string {
    const { context, userPrompt } = input;

    return `You are a Production Scale Analyzer for a creative studio tool called ThinkForge.

Given a project description, determine its complexity level and domain.

## Complexity Levels
- **solo_ugc**: Solo creator content (reels, shorts, ads, social posts). Usually <60s, one person.
- **brand_doc**: Brand documentary or commercial. Interview-based, narrative arc, 2-10 min.
- **short_film**: Short film or high-end branded content. Multi-crew, 5-30 min.
- **feature_film**: Feature-length production. Full crew, 60-120+ min, multiple acts.
- **epic**: Multi-project universe (e.g., franchise, series). Multiple interconnected scripts.

## Your Task
Analyze the following project description and return a structured JSON result:

${context.projectSummary ? `Project context: ${context.projectSummary}\n` : ''}
User's project description: ${userPrompt}

Return JSON with:
- complexity: one of the levels above
- domain: the content domain (e.g., "tech_review", "sci_fi", "lifestyle", "corporate", "education")
- estimatedDuration: rough duration estimate if applicable
- recommendedArtifacts: array of { type, label, reason } for documents this project needs
- summary: one-sentence description of the project scope`;
  }

  async detectScope(
    input: AgentInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>
  ): Promise<ScopeResult> {
    const { result } = await this.runStructured(input, overrides);
    return result;
  }
}

export function createScopeDetectorAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScopeDetectorAgent {
  return new ScopeDetectorAgent(config);
}
