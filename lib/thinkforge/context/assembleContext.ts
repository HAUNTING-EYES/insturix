/**
 * Context Assembly
 * 
 * One function to rule them all.
 * Agents CONSUME this, they never build context themselves.
 * 
 * Context assembly order MUST never change:
 * 1. System role
 * 2. Project context
 * 3. Artifact context (script)
 * 4. Recent history (chat)
 * 5. User prompt (added by agent)
 * 
 * This prevents prompt injection and drift.
 */

import type { 
  AssembledContext, 
  AgentType, 
  ContextAssemblyOptions,
  ProjectContextData,
  ScriptContextData,
  ChatContextMessage 
} from '../agents/types';
import { 
  selectProjectSummary, 
  selectScriptContent, 
  selectChatMessages 
} from './selectors';
import { truncateBlocks, type PrioritizedContent } from './truncation';

/**
 * Default max chars for assembled context
 * This is conservative - about 3k tokens for most models
 */
const DEFAULT_MAX_CHARS = 12_000;

/**
 * Raw data that can be assembled into context
 * This is what route handlers/services provide
 */
export interface ContextDataSources {
  /** Project metadata */
  project?: ProjectContextData | null;
  /** Current script content */
  script?: ScriptContextData | null;
  /** Chat history */
  chat?: ChatContextMessage[];
  /** User selection (highlighted text) */
  selection?: string | null;
  /** Recent changes description */
  recentChanges?: string | null;
}

/**
 * Assemble context for an agent
 * 
 * This is the ONLY way agents get context.
 * Same input → same context (deterministic).
 * 
 * @param sources - Raw data sources
 * @param options - Assembly options including agent type
 * @returns Assembled context ready for agent consumption
 */
export function assembleContext(
  sources: ContextDataSources,
  options: ContextAssemblyOptions
): AssembledContext {
  const { agentType, maxChars = DEFAULT_MAX_CHARS } = options;
  
  // Step 1: Select relevant content based on agent type
  const projectResult = selectProjectSummary(sources.project, agentType);
  const scriptResult = selectScriptContent(sources.script, agentType, Math.floor(maxChars * 0.4));
  const chatResult = selectChatMessages(sources.chat ?? [], agentType, Math.floor(maxChars * 0.25));
  
  // Step 2: Build prioritized blocks for truncation
  const blocks: PrioritizedContent[] = [];
  
  if (projectResult.content) {
    blocks.push({
      id: 'project',
      content: projectResult.content,
      priority: 8, // High priority - always keep project context
    });
  }
  
  if (scriptResult.content) {
    blocks.push({
      id: 'script',
      content: scriptResult.content,
      priority: agentType === 'script_refinement' ? 10 : 6, // Highest for refinement
    });
  }
  
  if (chatResult.content) {
    blocks.push({
      id: 'chat',
      content: chatResult.content,
      priority: agentType === 'chat' ? 9 : 5, // High for chat agent
    });
  }
  
  if (sources.recentChanges) {
    blocks.push({
      id: 'changes',
      content: sources.recentChanges,
      priority: 4,
    });
  }
  
  // Step 3: Truncate if needed (deterministic)
  const truncated = truncateBlocks(blocks, {
    maxChars,
    preserveOrder: true,
  });
  
  // Step 4: Build final context object
  const findBlock = (id: string) => truncated.find(b => b.id === id)?.content;
  
  return {
    projectSummary: findBlock('project') ?? '',
    currentScript: findBlock('script'),
    chatHistory: findBlock('chat'),
    recentChanges: findBlock('changes'),
    selection: sources.selection ?? undefined,
  };
}

/**
 * Quick context assembly for simple cases
 * Use when you have all the data readily available
 */
export function quickAssembleContext(
  agentType: AgentType,
  project?: ProjectContextData | null,
  script?: ScriptContextData | null,
  chat?: ChatContextMessage[],
  selection?: string | null
): AssembledContext {
  return assembleContext(
    { project, script, chat, selection },
    { agentType }
  );
}

/**
 * Format assembled context into a single string for prompts
 * Used by agents that need a single context block
 */
export function formatContextString(context: AssembledContext): string {
  const parts: string[] = [];
  
  if (context.projectSummary) {
    parts.push(`## Project Context\n${context.projectSummary}`);
  }
  
  if (context.currentScript) {
    parts.push(`## Current Script\n${context.currentScript}`);
  }
  
  if (context.chatHistory) {
    parts.push(`## Conversation History\n${context.chatHistory}`);
  }
  
  if (context.recentChanges) {
    parts.push(`## Recent Changes\n${context.recentChanges}`);
  }
  
  if (context.selection) {
    parts.push(`## Selected Text\n${context.selection}`);
  }
  
  return parts.join('\n\n');
}

/**
 * Check if context has meaningful content
 */
export function hasContent(context: AssembledContext): boolean {
  return !!(
    context.projectSummary ||
    context.currentScript ||
    context.chatHistory ||
    context.recentChanges ||
    context.selection
  );
}

/**
 * Get context size in characters
 */
export function getContextSize(context: AssembledContext): number {
  return (
    (context.projectSummary?.length ?? 0) +
    (context.currentScript?.length ?? 0) +
    (context.chatHistory?.length ?? 0) +
    (context.recentChanges?.length ?? 0) +
    (context.selection?.length ?? 0)
  );
}
