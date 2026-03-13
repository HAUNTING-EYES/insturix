/**
 * Chat Agent - Conversational, non-destructive responses
 * 
 * Purpose: Handle Q&A and conversation without modifying artifacts
 * 
 * Key rules:
 * - No <script_update> tags
 * - No structured output
 * - No persistence assumptions
 * - Stateless and pure
 * 
 * The agent only knows: context in → reasoning → text output
 */

import { streamText } from 'ai';
import { BaseAgent, type AgentConfig } from './base-agent';
import type { AgentInput, AgentStreamOutput } from './types';
import { formatContextString, quickAssembleContext } from '../context';
import type { SessionState, ProjectMeta } from '../state/types';
import type { BlockTree } from '../schemas/canonical';
import { createThinkForgeModel } from './model-factory';
import { DOCUMENT_AUTHORING_CONTRACT } from './document-authoring-contract';

// =============================================================================
// NEW ARCHITECTURE - Clean, Pure Agent
// =============================================================================

/**
 * Chat Agent - extends BaseAgent for conversational responses
 * 
 * This agent is stateless and pure.
 * It does not know about databases, UIs, or versioning.
 */
export class ChatAgent extends BaseAgent {
  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'chat',
      temperature: config?.temperature ?? 0.7,
    });
  }

  buildPrompt({ context, userPrompt }: AgentInput): string {
    const contextBlock = formatContextString(context);
    const isScriptRelated = /script|story|manual|document|format|structure/i.test(userPrompt);

    return `You are ThinkForge, a creative strategist and brainstorming partner.

You help creators and professionals ideate, plan, and refine their projects — whether that's video scripts, screenplays, documentaries, world-building bibles, social media content, brand strategies, or any creative endeavor.

${isScriptRelated ? `${DOCUMENT_AUTHORING_CONTRACT}\n\n` : ''}${contextBlock ? `## Context\n${contextBlock}\n\n` : ''}## Conversation Log
${context.chatHistory || '(No previous messages)'}

## User Request
${userPrompt}

## Instructions
- Be creative, specific, and actionable. Give real ideas, not procedures about how to find ideas.
- When asked for hooks, ideas, or suggestions — provide the actual hooks/ideas directly.
- Use markdown formatting (headers, bold, lists, emojis) to make responses scannable and engaging.
- Tailor advice to the user's project context (platform, style, tone) when available.
- No <script_update> tags; this path is advisory only.
- Be concise but thorough. Quality over verbosity.${isScriptRelated ? '\n- If providing formatting guidance, strictly obey DOCUMENT_AUTHORING_CONTRACT.' : ''}`;
  }
}

/**
 * Factory function for creating ChatAgent instances
 */
export function createChatAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ChatAgent {
  return new ChatAgent(config);
}

/**
 * Convenience function for running chat without managing agent instance
 * This is the recommended API for simple use cases
 */
export async function runChatAgent(
  input: AgentInput,
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): Promise<AgentStreamOutput> {
  const agent = createChatAgent(config);
  return agent.run(input);
}

/**
 * Get complete chat response as string
 */
export async function getChatResponse(
  input: AgentInput,
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): Promise<string> {
  const agent = createChatAgent(config);
  const { text } = await agent.runComplete(input);
  return text;
}

// =============================================================================
// LEGACY API - Backwards compatibility layer
// These functions maintain compatibility with existing code
// New code should use the class-based API above
// =============================================================================

interface LegacyChatAgentOptions {
  sessionState: SessionState;
  script?: { blocks?: BlockTree; content?: string; title?: string } | null;
  project?: ProjectMeta | null;
  selection?: string | null;
  skipPersistUser?: boolean;
  systemBrief?: string | null;
}

/**
 * @deprecated Use ChatAgent class or runChatAgent function instead
 * 
 * Legacy chat agent function for backwards compatibility
 */
export async function chatAgent(
  prompt: string,
  options: LegacyChatAgentOptions,
  abortSignal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const { sessionState, script, project, selection, systemBrief } = options;

  // Convert legacy options to new context format
  const context = quickAssembleContext(
    'chat',
    project,
    script
      ? {
        title: script.title,
        content: script.content,
        blocks: (script as any).blocks,
      }
      : null,
    sessionState.chat,
    selection,
    systemBrief
  );

  // Create input for new agent
  const input: AgentInput = {
    context,
    userPrompt: prompt,
  };

  // Run agent
  const agent = createChatAgent();
  agent.setAbortSignal(abortSignal);
  const { stream } = await agent.run(input);

  // Convert async generator to ReadableStream<Uint8Array> for compatibility
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let tokenCount = 0;
        for await (const chunk of stream) {
          tokenCount++;
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (error) {
        console.error('[ChatAgent] Stream error:', error);
        controller.error(error);
      }
    },
  });
}

/**
 * @deprecated Use ChatAgent class instead
 * 
 * Legacy function for chat with script update capability
 * Now just redirects to regular chat (script updates handled by script agents)
 */
export async function chatAgentWithScriptUpdate(
  prompt: string,
  options: LegacyChatAgentOptions
): Promise<ReadableStream<Uint8Array>> {
  return chatAgent(prompt, options);
}
