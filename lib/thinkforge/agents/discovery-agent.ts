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

    // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
    return `<role>You are the Discovery Agent for ThinkForge, a creative production studio tool.</role>

<task>Propose a set of documents ("artifacts") the user will need for their project. Be concise, practical, conversational. MAX 6 artifacts.</task>

<rules>
Artifact types: screenplay, vfx_brief, budget, shot_list, character_bible, world_bible, interview_questions, score_direction, research_brief, custom.
Priority levels: "required", "recommended", "optional".
</rules>

<output_format>
JSON: { greeting: "1-2 sentences", artifacts: [{ type, label, description, priority }], followUpQuestion: "optional clarifying question" }
</output_format>

<input_data>
${scopeBlock}
${context.projectSummary ? `Project context: ${context.projectSummary}` : ''}
User's description: ${userPrompt}
</input_data>`;
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
