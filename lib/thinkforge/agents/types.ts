import type { RetrievedContext } from '../context/fetchContextSources';
import type { ThinkForgeAuthoringRequest } from '../schemas/authoring-request';
import type { ThinkForgeWriterInvocationTraceV1 } from '../provenance/generation-trace';
import type { ThinkForgeEditorialPlan } from './editorial-plan';

/**
 * ThinkForge AI Agent Types
 * 
 * Core type definitions for the agent system.
 * Agents are pure reasoning modules that take context in and produce structured output.
 * They do not know about databases, UIs, or versioning.
 */

/**
 * Assembled context provided to agents.
 * This is the ONLY source of truth for agent context.
 * Agents consume this, they never build it.
 */
export interface AssembledContext {
  /** Summary of the project (idea, purpose, platform, etc.) */
  projectSummary: string;
  /** Current script content if exists */
  currentScript?: string;
  /** Recent chat history (formatted) */
  chatHistory?: string;
  /** Recent changes summary */
  recentChanges?: string;
  /** User selection if applicable */
  selection?: string;
  /** System Brief from Multi-Hop Retrieval (BrandDNA, facts, interaction patterns) */
  systemBrief?: string;
}

/**
 * Input to all agents - standardized contract
 */
export interface AgentInput {
  /** Assembled context from the context layer */
  context: AssembledContext;
  /** Stable session provenance for downstream handoffs */
  sessionId?: string;
  /** Active brand provenance for deterministic signal/profile resolution */
  brandId?: string;
  /** Raw project metadata used by deterministic resolvers before prompt assembly */
  project?: ProjectContextData | null;
  /** Structured BrandDNA, DataBank facts, and interaction memory fetched before prompt assembly */
  retrievedContext?: RetrievedContext | null;
  /** The user's prompt/instruction */
  userPrompt: string;
  /** Server-validated output choice for agents that propose a new document. */
  authoringRequest?: ThinkForgeAuthoringRequest;
  /** Server-owned doctrine, evidence, and output decisions for this generation. */
  editorialPlan?: ThinkForgeEditorialPlan;
  /** Generation mode selector */
  generationMode?: 'manual' | 'playbook' | 'narrative';
  /** Orchestration-owned identity for deterministic creative regeneration. */
  generationIdentity?: {
    variationIndex: number;
    rejectedIdeas?: Array<{
      title: string;
      purpose?: string;
      style?: string;
    }>;
    /** Server-produced quality-gate evidence for one bounded repair attempt. */
    qualityRepairIssues?: string[];
  };
}

/**
 * Output from streaming agents
 */
export interface AgentStreamOutput {
  /** Async generator that yields text chunks */
  stream: AsyncGenerator<string, void, unknown>;
  /** Optional metadata about the generation */
  metadata?: AgentMetadata;
}

/**
 * Output from structured agents (like ideas)
 */
export interface AgentStructuredOutput<T> {
  /** The structured result */
  result: T;
  /** Optional metadata about the generation */
  metadata?: AgentMetadata;
}

/**
 * Metadata about an agent invocation
 */
export interface AgentMetadata {
  /** Confidence score 0-1 */
  confidence?: number;
  /** Internal notes/reasoning */
  notes?: string;
  /** Model used */
  model?: string;
  /** Server-owned evidence for the exact editorial plan and provider path used by a writer. */
  writerTrace?: ThinkForgeWriterInvocationTraceV1;
  /** Token usage info */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Agent types for logging and context assembly
 */
export type AgentType =
  | 'chat'
  | 'ideas'
  | 'url_brief'
  | 'script_draft'
  | 'script_author'
  | 'script_refinement'
  | 'script_outline'
  | 'script_section'
  | 'script_contract'
  | 'script_chapter_plan'
  | 'script_coherence'
  | 'research'
  | 'scope_detector'
  | 'discovery'
  | 'ingestor'
  | 'architect'
  | 'stylist'
  | 'null_agent'
  | 'supervisor'
  | 'thinking'
  | 'post_writer'
  | 'script_writer';

/**
 * Log event for AI invocation tracking
 */
export interface AIInvocationLog {
  type: 'ai_invocation';
  agent: AgentType;
  model: string;
  timestamp: Date;
  artifactId?: string;
  sessionId?: string;
  versionCreated?: string;
  durationMs?: number;
  success: boolean;
  error?: string;
}

/**
 * Options for context assembly
 */
export interface ContextAssemblyOptions {
  /** Project/session ID for fetching project data */
  projectId?: string;
  /** Artifact ID if operating on specific artifact */
  artifactId?: string;
  /** Active version ID for versioned content */
  activeVersionId?: string;
  /** Which agent is requesting context (affects what's included) */
  agentType: AgentType;
  /** Maximum characters for assembled context */
  maxChars?: number;
}

/**
 * Project metadata for context assembly
 */
export interface ProjectContextData {
  idea?: string;
  purpose?: string;
  style?: string;
  format?: string;
  platform?: string;
  tone?: string;
  projectName?: string;
  sessionName?: string;
  originalPrompt?: string;
  brandId?: string;
  brandBrief?: string;
}

/**
 * Script content for context assembly
 */
export interface ScriptContextData {
  title?: string;
  content?: string;
  blocks?: import('../schemas/thinkforge-block').ThinkForgeBlock[];
  version?: number;
}

/**
 * Chat message for context assembly
 */
export interface ChatContextMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}
