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

    // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
    return `<role>You are a Production Scale Analyzer for ThinkForge, a creative studio tool.</role>

<task>Analyze the project description and determine its complexity level and domain.</task>

<rules>
COMPLEXITY LEVELS:
- solo_ugc: Solo creator content (reels, shorts, ads). Usually <60s, one person.
- brand_doc: Brand documentary or commercial. Interview-based, 2-10 min.
- short_film: Short film or high-end branded content. Multi-crew, 5-30 min.
- feature_film: Feature-length production. Full crew, 60-120+ min.
- epic: Multi-project universe (franchise, series). Multiple interconnected scripts.
</rules>

<output_format>
JSON: { complexity, domain (e.g. "tech_review", "lifestyle", "corporate"), estimatedDuration, recommendedArtifacts: [{ type, label, reason }], summary: "one sentence" }
</output_format>

<input_data>
${context.projectSummary ? `Project context: ${context.projectSummary}` : ''}
User's project: ${userPrompt}
</input_data>`;
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
