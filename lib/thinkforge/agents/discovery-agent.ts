/**
 * Discovery Agent - The "Script Discovery" System
 *
 * When a user doesn't know what documents they need, the Discovery Agent
 * analyzes the project scope and proposes a blueprint of artifacts.
 *
 * This agent is conversational (creative constraints, not script constraints).
 * It outputs a structured proposal that renders as a Decision Card in the Sidecar.
 */

import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import { z } from 'zod';
import type { ScopeResult } from './scope-detector-agent';

const DiscoveryProposalSchema = z.object({
  greeting: z.string(),
  artifacts: z.array(z.object({
    type: z.string(),
    label: z.string(),
    description: z.string(),
    priority: z.enum(['required', 'recommended', 'optional']),
  })),
  followUpQuestion: z.string().optional(),
});

export type DiscoveryProposal = z.infer<typeof DiscoveryProposalSchema>;

export class DiscoveryAgent extends StructuredAgent<DiscoveryProposal> {
  protected schema = DiscoveryProposalSchema;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'discovery',
      temperature: config?.temperature ?? 0.5,
      maxTokens: config?.maxTokens ?? 500,
    });
  }

  buildPrompt(input: AgentInput): string {
    const { context, userPrompt } = input;
    const scopeData = (input as DiscoveryAgentInput).scope;

    const scopeBlock = scopeData
      ? `\n## Detected Project Scope\n- Complexity: ${scopeData.complexity}\n- Domain: ${scopeData.domain}\n- Summary: ${scopeData.summary}\n`
      : '';

    return `You are the Discovery Agent for ThinkForge, a creative production studio tool.

Your job is to propose a set of documents ("artifacts") that a user will need for their project.
Be concise, practical, and conversational. Do NOT propose more than 6 artifacts.

${scopeBlock}
${context.projectSummary ? `Project context: ${context.projectSummary}\n` : ''}
User's description: ${userPrompt}

Return JSON with:
- greeting: A brief, friendly acknowledgment of their project (1-2 sentences max)
- artifacts: Array of { type, label, description, priority } where priority is "required", "recommended", or "optional"
- followUpQuestion: An optional clarifying question if scope is ambiguous

Artifact types to choose from: screenplay, vfx_brief, budget, shot_list, character_bible, world_bible, interview_questions, score_direction, research_brief, custom`;
  }

  async proposeBlueprint(
    input: DiscoveryAgentInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>
  ): Promise<DiscoveryProposal> {
    const { result } = await this.runStructured(input, overrides);
    return result;
  }
}

export interface DiscoveryAgentInput extends AgentInput {
  scope?: ScopeResult;
}

export function createDiscoveryAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): DiscoveryAgent {
  return new DiscoveryAgent(config);
}
