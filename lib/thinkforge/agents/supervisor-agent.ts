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

    // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
    return `<role>You are the Supervisor, a meta-agent that creates specialist agents on-demand.</role>

<task>Define a temporary "Null Agent" — a one-shot expert that analyzes the project, produces a document, and self-destructs. Generate a complete agent definition.</task>

<rules>
RULE 1 — AGENT DEFINITION FIELDS:
- persona: concise expert title (e.g., "Quantum Physics Consultant", "VFX Cost Estimator")
- systemPrompt: self-contained prompt for a generic LLM (domain expertise, output document, format, constraints)
- documentStyle: output format (e.g., "Technical Report", "VFX Brief", "Legal Review")
- documentType: one of screenplay, vfx_brief, budget, shot_list, character_bible, world_bible, interview_questions, score_direction, research_brief, custom
- title: document title
- scope: { readDatabank, readCurrentScript, readAllDocuments } — what context the agent needs
- estimatedTokens: approximate token budget

RULE 2 — CONSTRAINTS:
- systemPrompt must be self-contained and specific enough for a generic LLM to execute.
- Agent produces a DOCUMENT, not a conversation. Not conversational.
- Persona must be a real-world expert role, not a fictional character.
- Return valid JSON.
</rules>

<input_data>
Project: ${context.projectSummary || '(No project context)'}
${context.currentScript ? `Script excerpt: ${context.currentScript.substring(0, 2000)}` : ''}
Specialist request: ${userPrompt}
</input_data>`;
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
