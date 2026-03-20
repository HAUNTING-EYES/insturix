/**
 * Supervisor Agent - The Meta-Prompt Generator
 *
 * When a user clicks [Summon Specialist], the Supervisor analyzes the project
 * and generates the Null Agent's identity: persona, prompt, document style, and scope.
 *
 * This is the only "auto" part of the Null Agent system — it writes the system prompt
 * that defines a temporary specialist agent.
 */

import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import { z } from 'zod';

const NullAgentDefinitionSchema = z.object({
  persona: z.string(),
  systemPrompt: z.string(),
  documentStyle: z.string(),
  documentType: z.string(),
  title: z.string(),
  scope: z.object({
    readDatabank: z.boolean(),
    readCurrentScript: z.boolean(),
    readAllDocuments: z.boolean(),
  }),
  estimatedTokens: z.number().optional(),
});

export type NullAgentDefinition = z.infer<typeof NullAgentDefinitionSchema>;

export class SupervisorAgent extends StructuredAgent<NullAgentDefinition> {
  protected schema = NullAgentDefinitionSchema;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'supervisor',
      temperature: config?.temperature ?? 0.3,
      maxTokens: config?.maxTokens ?? 800,
    });
  }

  buildPrompt(input: AgentInput): string {
    const { context, userPrompt } = input;

    return `You are the Supervisor, a meta-agent that creates specialist agents on-demand.

A user has requested a specialist for their creative project. Your job is to define
a temporary "Null Agent" — a one-shot expert that will analyze the project, produce
a document, and then self-destruct.

## Project Context
${context.projectSummary || '(No project context)'}

${context.currentScript ? `Current script excerpt:\n${context.currentScript.substring(0, 2000)}\n` : ''}

## User's Specialist Request
${userPrompt}

## Your Task
Generate a complete agent definition:
- **persona**: A concise title (e.g., "Quantum Physics Consultant", "Legal Auditor", "VFX Cost Estimator")
- **systemPrompt**: The full system prompt for the specialist. This should include:
  - Who the agent is and what domain expertise it has
  - What document it should produce
  - What format the output should be in
  - What constraints apply (length, style, accuracy requirements)
- **documentStyle**: The output format (e.g., "Technical Report", "VFX Brief", "Legal Review", "Cost Spreadsheet")
- **documentType**: One of: screenplay, vfx_brief, budget, shot_list, character_bible, world_bible, interview_questions, score_direction, research_brief, custom
- **title**: Title for the document that will be created
- **scope**: What context the agent needs access to:
  - readDatabank: whether it needs the user's DataBank/BrandDNA
  - readCurrentScript: whether it needs the current active script
  - readAllDocuments: whether it needs all documents in the session
- **estimatedTokens**: Approximate token budget needed

## Rules
- The systemPrompt must be self-contained and specific enough for a generic LLM to execute.
- Do NOT make the agent conversational. It should produce a document, not chat.
- The persona should be a real-world expert role, not a fictional character.

Return valid JSON.`;
  }

  async synthesizeAgent(
    input: AgentInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>
  ): Promise<NullAgentDefinition> {
    const { result } = await this.runStructured(input, overrides);
    return result;
  }
}

export function createSupervisorAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): SupervisorAgent {
  return new SupervisorAgent(config);
}
