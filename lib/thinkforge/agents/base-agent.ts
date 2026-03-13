/**
 * Base Agent - Foundation for all ThinkForge AI agents
 * 
 * All agents extend this base class to ensure:
 * - Consistent streaming behavior
 * - Central place for retries, logging, eval
 * - Easy agent swapping
 * - Pure reasoning without side effects
 * 
 * Agents are stateless and replaceable.
 * They only know: context in → reasoning → structured output
 */

import { streamText, generateObject, generateText } from 'ai';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';
import { createThinkForgeModel, ModelTier, validateTierForTask } from './model-factory';
import { parseJsonLenient } from '@/lib/thinkforge/json';

// Global constraints for SCRIPT agents (document authoring — must be structured)
const SCRIPT_OPERATION_CONSTRAINTS = [
  'Manual-only output; produce a professional, execution-ready document.',
  'No conversational framing (e.g., "In this section", "Let us").',
  'No inspirational or motivational language.',
  'No summaries unless they add new constraints, steps, or decisions.',
  'Prefer lists, tables, and structured blocks over paragraphs.',
  'Remove any sentence that does not introduce actionable value.',
].join('\n- ');

// Light constraints for CREATIVE agents (chat, research, ideas)
const CREATIVE_OPERATION_CONSTRAINTS = [
  'Be specific and actionable. Avoid vague or generic advice.',
  'No <script_update> tags in this path.',
  'Use markdown formatting for readability.',
].join('\n- ');

// Agent types that should use the strict manual constraints
const SCRIPT_AGENT_TYPES = new Set(['script_draft', 'script_author', 'script_refinement', 'script_outline', 'script_section', 'script_contract', 'script_coherence', 'architect', 'null_agent']);

// Forward declaration - actual implementation in logging.ts
// We inline basic logging here to avoid circular dependency
function logInvocation(event: any): void {
  const logLevel = event.success ? 'info' : 'error';
  if (logLevel === 'error') {
    console.error('[ThinkForge AI]', `agent=${event.agent} model=${event.model} success=${event.success} error="${event.error}"`);
  } else if (process.env.NODE_ENV === 'development') {
    console.log('[ThinkForge AI]', `agent=${event.agent} model=${event.model} success=${event.success}${event.durationMs ? ` duration=${event.durationMs}ms` : ''}`);
  }
}
import type {
  AgentInput,
  AgentStreamOutput,
  AgentStructuredOutput,
  AgentMetadata,
  AgentType
} from './types';

/**
 * Configuration for agent instantiation
 */
export interface AgentConfig {
  /** Model name to use (defaults to gemini-2.5-flash) */
  modelName?: string;
  /** Temperature for generation (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Agent type for logging */
  agentType: AgentType;
  /** Model tier for routing and validation */
  modelTier?: ModelTier;
}

/**
 * Abstract base class for all ThinkForge agents
 * 
 * Agents are pure reasoning modules:
 * - No database calls
 * - No side effects
 * - No IDs or persistence logic
 * - Stateless and replaceable
 */
export abstract class BaseAgent {
  protected model: LanguageModel;
  protected config: Required<AgentConfig>;
  protected modelTier?: ModelTier;
  protected abortSignal?: AbortSignal;

  constructor(config: AgentConfig) {
    this.config = {
      modelName: config.modelName ?? 'gemini-2.5-flash',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
      agentType: config.agentType,
    };
    this.modelTier = config.modelTier;
    this.model = createThinkForgeModel(this.config.modelName);
  }

  /**
   * Build the prompt from input - each agent implements this
   * This is where agent-specific reasoning instructions go
   */
  abstract buildPrompt(input: AgentInput): string;

  /**
   * Optional per-invocation overrides for token/temperature budgets
   * to allow orchestration layers to tune stages independently.
   */
  protected resolveGenConfig(overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>) {
    return {
      maxTokens: overrides?.maxTokens ?? this.config.maxTokens,
      temperature: overrides?.temperature ?? this.config.temperature,
    } as const;
  }

  /**
   * Apply global guardrails to any prompt — strict for script agents, light for creative agents
   */
  protected applyGlobalConstraints(prompt: string): string {
    const isScriptAgent = SCRIPT_AGENT_TYPES.has(this.config.agentType);
    const constraints = isScriptAgent ? SCRIPT_OPERATION_CONSTRAINTS : CREATIVE_OPERATION_CONSTRAINTS;
    const constraintBlock = `## Global Constraints (mandatory)\n- ${constraints}`;
    return `${prompt}\n\n${constraintBlock}`;
  }

  /**
   * Run the agent with streaming output
   * Returns an async generator that yields text chunks
   */
  setAbortSignal(signal?: AbortSignal) {
    this.abortSignal = signal;
  }

  async run(
    input: AgentInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal
  ): Promise<AgentStreamOutput> {
    const startTime = Date.now();
    const prompt = this.applyGlobalConstraints(this.buildPrompt(input));
    const gen = this.resolveGenConfig(overrides);
    const signal = abortSignal ?? this.abortSignal;

    try {
      const result = streamText({
        model: this.model,
        prompt,
        temperature: gen.temperature,
        maxTokens: gen.maxTokens,
        abortSignal: signal,
      });

      // Create async generator from the text stream
      const textStream = result.textStream;

      const streamGenerator = async function* (): AsyncGenerator<string, void, unknown> {
        let chunkCount = 0;
        try {
          for await (const chunk of textStream) {
            chunkCount++;
            yield chunk;
          }

          // Log successful invocation
          logInvocation({
            type: 'ai_invocation',
            agent: this.config.agentType,
            model: this.config.modelName,
            timestamp: new Date(),
            durationMs: Date.now() - startTime,
            success: true,
          });
        } catch (error) {
          logInvocation({
            type: 'ai_invocation',
            agent: this.config.agentType,
            model: this.config.modelName,
            timestamp: new Date(),
            durationMs: Date.now() - startTime,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }.bind(this);

      return {
        stream: streamGenerator(),
        metadata: {
          model: this.config.modelName,
        },
      };
    } catch (error) {
      logInvocation({
        type: 'ai_invocation',
        agent: this.config.agentType,
        model: this.config.modelName,
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Collect full response as string (non-streaming)
   * Useful for when you need the complete output
   */
  async runComplete(
    input: AgentInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal
  ): Promise<{ text: string; metadata?: AgentMetadata }> {
    const { stream, metadata } = await this.run(input, overrides, abortSignal);

    let fullText = '';
    for await (const chunk of stream) {
      fullText += chunk;
    }

    return { text: fullText, metadata };
  }
}

/**
 * Base class for agents that produce structured output
 * Uses schema-based generation with Zod schemas
 */
export abstract class StructuredAgent<TOutput> extends BaseAgent {
  protected abstract schema: z.ZodType<TOutput>;

  /**
   * Build the prompt for structured output
   */
  abstract buildPrompt(input: AgentInput): string;

  /**
   * Run the agent with structured output
   */
  async runStructured(
    input: AgentInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal
  ): Promise<AgentStructuredOutput<TOutput>> {
    const startTime = Date.now();
    const prompt = this.applyGlobalConstraints(this.buildPrompt(input));
    const gen = this.resolveGenConfig(overrides);
    const signal = abortSignal ?? this.abortSignal;

    try {
      const result = await generateObject({
        model: this.model,
        schema: this.schema,
        prompt,
        temperature: gen.temperature,
        maxTokens: gen.maxTokens,
        abortSignal: signal,
      });

      logInvocation({
        type: 'ai_invocation',
        agent: this.config.agentType,
        model: this.config.modelName,
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
        success: true,
      });

      return {
        result: result.object,
        metadata: {
          model: this.config.modelName,
        },
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      const isStructuredFailure = message?.toLowerCase().includes('_zod') || message?.toLowerCase().includes('structured');

      if (isStructuredFailure) {
        // Fallback: ask model to return JSON manually and parse it
        const fallback = await generateText({
          model: this.model,
          prompt: `${prompt}\n\nReturn ONLY valid JSON that matches this schema (no markdown): ${this.schema.toString()}`,
          temperature: gen.temperature,
          maxTokens: gen.maxTokens,
          abortSignal: signal,
        });

        const jsonText = fallback.text.trim();
        try {
          const parsed = parseJsonLenient(jsonText);
          if (!parsed) {
            throw new Error('Failed to parse fallback JSON');
          }

          logInvocation({
            type: 'ai_invocation',
            agent: this.config.agentType,
            model: this.config.modelName,
            timestamp: new Date(),
            durationMs: Date.now() - startTime,
            success: true,
            fallback: 'manual_json',
          });

          return {
            result: parsed as TOutput,
            metadata: { model: this.config.modelName },
          };
        } catch (parseError) {
          logInvocation({
            type: 'ai_invocation',
            agent: this.config.agentType,
            model: this.config.modelName,
            timestamp: new Date(),
            durationMs: Date.now() - startTime,
            success: false,
            error: parseError instanceof Error ? parseError.message : String(parseError),
          });
          throw parseError;
        }
      }

      logInvocation({
        type: 'ai_invocation',
        agent: this.config.agentType,
        model: this.config.modelName,
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
        success: false,
        error: message,
      });
      throw error;
    }
  }
}

/**
 * Factory function to create agent instances
 * Provides a clean interface without needing to know implementation details
 */
export function createAgent<T extends BaseAgent>(
  AgentClass: new (config: AgentConfig) => T,
  config: Partial<AgentConfig> & { agentType: AgentType }
): T {
  return new AgentClass(config);
}
