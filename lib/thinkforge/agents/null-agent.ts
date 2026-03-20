/**
 * Null Agent - The Dynamic Specialist
 *
 * A temporary, one-shot agent that is synthesized by the Supervisor Agent.
 * It receives a dynamically generated system prompt, executes its task,
 * writes a document, and self-destructs (its DB record is deleted after output is saved).
 *
 * This agent is unique because its prompt is NOT hardcoded — it's generated
 * by the Supervisor based on the project's needs.
 */

import { BaseAgent, type AgentConfig } from './base-agent';
import type { AgentInput, AgentStreamOutput } from './types';
import type { NullAgentDefinition } from './supervisor-agent';

export interface NullAgentInput extends AgentInput {
  definition: NullAgentDefinition;
}

export class NullAgent extends BaseAgent {
  private definition: NullAgentDefinition;

  constructor(definition: NullAgentDefinition, config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'null_agent',
      maxTokens: definition.estimatedTokens ?? config?.maxTokens ?? 2000,
      temperature: config?.temperature ?? 0.5,
    });
    this.definition = definition;
  }

  buildPrompt(input: AgentInput): string {
    const { context, userPrompt } = input;

    const contextParts: string[] = [];

    if (this.definition.scope.readCurrentScript && context.currentScript) {
      contextParts.push(`## Current Script\n${context.currentScript}`);
    }
    if (this.definition.scope.readDatabank && context.systemBrief) {
      contextParts.push(`## DataBank / Brand DNA\n${context.systemBrief}`);
    }
    if (context.projectSummary) {
      contextParts.push(`## Project Context\n${context.projectSummary}`);
    }

    return `${this.definition.systemPrompt}

${contextParts.join('\n\n')}

## Task
${userPrompt}

## Output Format
Produce a "${this.definition.documentStyle}" document titled "${this.definition.title}".
Output in Markdown format. Use headers, lists, and tables where appropriate.
Do not include conversational framing. The output must be a standalone professional document.`;
  }

  async execute(
    input: AgentInput,
    abortSignal?: AbortSignal
  ): Promise<{ stream: AsyncGenerator<string, void, unknown> }> {
    return this.run(input, undefined, abortSignal);
  }

  getDefinition(): NullAgentDefinition {
    return this.definition;
  }
}

export function createNullAgent(
  definition: NullAgentDefinition,
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): NullAgent {
  return new NullAgent(definition, config);
}
