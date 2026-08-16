/**
 * Agents Module - Barrel Export
 * 
 * Pure reasoning modules for ThinkForge.
 * Agents are stateless, replaceable, and protocol-bound.
 * 
 * Hard rules (print these):
 * 1. Agents are pure
 * 2. Context is centralized
 * 3. Output is protocol-bound
 * 4. Persistence is downstream
 * 5. AI output is untrusted input
 */

// Types
export type {
  AgentInput,
  AgentStreamOutput,
  AgentStructuredOutput,
  AgentMetadata,
  AgentType,
  AIInvocationLog,
  AssembledContext,
  ContextAssemblyOptions,
  ProjectContextData,
  ScriptContextData,
  ChatContextMessage,
} from './types';

// Base Agent
export {
  BaseAgent,
  StructuredAgent,
  createAgent,
  type AgentConfig,
} from './base-agent';

// Model Factory
export {
  createThinkForgeModel,
  getAuthMethod,
  clearProviderCache,
} from './model-factory';

// Chat Agent
export {
  ChatAgent,
  createChatAgent,
  runChatAgent,
  getChatResponse,
  chatAgent,
  chatAgentWithScriptUpdate,
} from './chat-agent';

// Ideas Agent
export {
  IdeasAgent,
  createIdeasAgent,
} from './ideas-agent';

// Thinking Agent
export {
  runThinkingAgent,
  type ThinkingInput,
} from './thinking-agent';

// Post Writer Agent
export {
  PostWriterAgent,
  createPostWriterAgent,
  PostWriterResultSchema,
  type PostWriterResult,
  type PostWriterInput,
} from './post-writer-agent';

// Script Writer Agent
export {
  ScriptWriterAgent,
  createScriptWriterAgent,
  ScriptWriterResultSchema,
  type ScriptWriterResult,
  type ScriptWriterInput,
} from './script-writer-agent';

// Logging
export {
  logAIInvocation,
  getRecentLogs,
  getLogsByAgent,
  getFailedLogs,
  clearLogs,
  getLogStats,
} from './logging';
