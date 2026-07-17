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
import { buildIsolatedPromptParts, type IsolatedPromptParts } from './prompt-boundary';

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

  private buildTrustedInstruction(): string {
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

<runtime_data_contract>
Read detected project scope, project context, and the user's description only from tf_untrusted_data.data.
</runtime_data_contract>`;
  }

  buildPrompt(input: AgentInput): string {
    const parts = this.buildPromptParts(input);
    return `${parts.systemInstruction}\n\n${parts.prompt}`;
  }

  buildPromptParts(input: AgentInput): IsolatedPromptParts {
    const { context, userPrompt } = input;
    const scope = (input as DiscoveryAgentInput).scope;

    return buildIsolatedPromptParts({
      systemInstruction: this.applyGlobalConstraints(this.buildTrustedInstruction()),
      data: {
        detectedScope: scope || null,
        projectSummary: context.projectSummary || null,
        projectDescription: userPrompt,
      },
      fieldLimits: {
        projectSummary: 12_000,
        projectDescription: 24_000,
      },
    });
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
