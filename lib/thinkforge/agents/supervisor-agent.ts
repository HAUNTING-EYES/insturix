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
import { buildIsolatedPromptParts, type IsolatedPromptParts } from './prompt-boundary';

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

  private buildTrustedInstruction(): string {
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

<runtime_data_contract>
Read project context, the current script excerpt, and the specialist request only from tf_untrusted_data.data.
</runtime_data_contract>`;
  }

  buildPrompt(input: AgentInput): string {
    const parts = this.buildPromptParts(input);
    return `${parts.systemInstruction}\n\n${parts.prompt}`;
  }

  buildPromptParts({ context, userPrompt }: AgentInput): IsolatedPromptParts {
    return buildIsolatedPromptParts({
      systemInstruction: this.applyGlobalConstraints(this.buildTrustedInstruction()),
      data: {
        projectSummary: context.projectSummary || null,
        currentScriptExcerpt: context.currentScript || null,
        specialistRequest: userPrompt,
      },
      fieldLimits: {
        projectSummary: 12_000,
        currentScriptExcerpt: 2_000,
        specialistRequest: 12_000,
      },
    });
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
