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
import {
  createThinkForgeModelForRoute,
  ModelTier,
  resolveThinkForgeProviderRoute,
  type ThinkForgeModelProvider,
  type ThinkForgeProviderRoute,
} from './model-factory';
import { parseJsonLenient } from '@/lib/thinkforge/json';
import type { IsolatedPromptParts } from './prompt-boundary';
import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';
import {
  assertProviderPromptAllowed,
  ProviderPrivacyGateError,
  type ProviderPrivacyAuditRecord,
  type ProviderPrivacyClass,
  type ProviderRoutePurpose,
} from '@/lib/thinkforge/privacy/provider-privacy-gateway';

// Global constraints for SCRIPT agents — adapted by document type.
// Technical docs (VFX briefs, budgets, shot lists) get strict mechanical constraints.
// Creative docs (video scripts, character bibles, brand films) get voice-preserving guidance.
const SCRIPT_CONSTRAINTS_TECHNICAL = [
  'Produce a professional, execution-ready document.',
  'No conversational framing (e.g., "In this section", "Let us").',
  'No summaries unless they add new constraints, steps, or decisions.',
  'Prefer lists, tables, and structured blocks over paragraphs.',
  'Remove any sentence that does not introduce actionable value.',
].join('\n- ');

const SCRIPT_CONSTRAINTS_CREATIVE = [
  'Write with personality and voice. The output should sound like a talented human wrote it, not a template.',
  'No conversational framing directed at the reader (e.g., "In this section", "Let us").',
  'Narration is the core product — write spoken words with rhythm, punch, and conversational cadence. Visual direction supports the narration, not the other way around.',
  'Be specific and concrete. Replace generic claims with exact details, real examples, and vivid language.',
  'Every sentence should earn its place — cut filler, but keep emotion and energy.',
].join('\n- ');

const TECHNICAL_DOC_TYPES = new Set(['vfx_brief', 'budget', 'shot_list', 'research']);

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
  if (!event.success) {
    console.error('[ThinkForge AI]', `agent=${event.agent} model=${event.model} success=${event.success} error="${event.error}"`);
  }
}
import type {
  AgentInput,
  AgentStreamOutput,
  AgentStructuredOutput,
  AgentMetadata,
  AgentType
} from './types';

type ThinkForgeUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type ThinkForgeCostOperation = 'llm_stream' | 'llm_structured' | 'llm_structured_fallback';

type ProviderPromptDispatch = {
  systemInstruction: string;
  prompt: string;
  promptChars: number;
  audit: ProviderPrivacyAuditRecord;
};

type AgentGenerationOverrides = Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>> & {
  seed?: number;
};

async function recordThinkForgeAgentCost(input: {
  status: ProviderCostEventStatus;
  agentType: AgentType;
  provider: ThinkForgeModelProvider;
  modelName: string;
  operation: ThinkForgeCostOperation;
  route: string;
  promptChars?: number;
  outputChars?: number;
  functionMs?: number;
  usage?: ThinkForgeUsage;
  sourceInput?: AgentInput;
  maxTokens?: number;
  temperature?: number;
  modelTier?: ModelTier;
  documentType?: string;
  fallback?: string;
  privacyAudit?: ProviderPrivacyAuditRecord;
  providerRequestCount?: 0 | 1;
  error?: unknown;
}) {
  const requestCount = input.providerRequestCount ?? 1;
  const inputTokens = requestCount > 0
    ? input.usage?.inputTokens ?? estimateTokensFromChars(input.promptChars)
    : undefined;
  const outputTokens = requestCount > 0
    ? input.usage?.outputTokens ?? estimateTokensFromChars(input.outputChars)
    : undefined;

  await recordProviderCostEvent({
    status: input.status,
    service: 'thinkforge',
    action: 'agent_generation',
    route: input.route,
    provider: input.provider,
    model: cleanModelName(input.modelName),
    operation: input.operation,
    projectId: input.sourceInput?.brandId,
    taskId: input.sourceInput?.sessionId,
    units: {
      requestCount,
      inputTokens,
      outputTokens,
      totalTokens: requestCount > 0
        ? input.usage?.totalTokens ?? sumOptional(inputTokens, outputTokens)
        : undefined,
      functionMs: input.functionMs,
    },
    metadata: {
      agentType: input.agentType,
      modelTier: input.modelTier,
      documentType: input.documentType || undefined,
      generationMode: input.sourceInput?.generationMode,
      hasSessionId: Boolean(input.sourceInput?.sessionId),
      hasBrandId: Boolean(input.sourceInput?.brandId),
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      fallback: input.fallback,
      privacyRoutePurpose: input.privacyAudit?.routePurpose,
      privacyClass: input.privacyAudit?.privacyClass,
      privacyFieldsSent: input.privacyAudit?.fieldsSent,
      privacyDecisionAt: input.privacyAudit?.timestamp,
      privacySourceFingerprint: input.privacyAudit?.sourcePromptFingerprint,
      privacySentFingerprint: input.privacyAudit?.sentPromptFingerprint,
      privacySourceChars: input.privacyAudit?.sourcePromptLength,
      privacySentChars: input.privacyAudit?.sentPromptLength,
      privacyRedactions: input.privacyAudit?.redactions,
      privacyRedactionCount: input.privacyAudit?.redactionCount,
      privacyRedactionCounts: input.privacyAudit?.redactionCounts,
      privacyBlockReason: input.privacyAudit?.blockReason,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}

async function readAiSdkUsage(value: unknown): Promise<ThinkForgeUsage | undefined> {
  const resolved = await Promise.resolve(value);
  const usage = asRecord(resolved);
  if (!usage) return undefined;
  const inputTokens = readNumber(usage.promptTokens ?? usage.inputTokens ?? usage.prompt_tokens);
  const outputTokens = readNumber(usage.completionTokens ?? usage.outputTokens ?? usage.completion_tokens);
  const totalTokens = readNumber(usage.totalTokens ?? usage.total_tokens);
  return inputTokens || outputTokens || totalTokens ? { inputTokens, outputTokens, totalTokens } : undefined;
}

function safeJsonLength(value: unknown): number | undefined {
  try {
    return JSON.stringify(value ?? {}).length;
  } catch {
    return undefined;
  }
}

function cleanModelName(modelName: string): string {
  return modelName.replace(/^models\//, '');
}

function estimateTokensFromChars(chars?: number): number | undefined {
  return typeof chars === 'number' && Number.isFinite(chars) && chars > 0 ? Math.max(1, Math.ceil(chars / 4)) : undefined;
}

function sumOptional(a?: number, b?: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function normalizeGenerationSeed(seed?: number): number {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) return 42;
  return Math.max(0, Math.min(0xffffffff, Math.trunc(seed)));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function prepareProviderPromptDispatch(input: {
  route: ThinkForgeProviderRoute;
  systemInstruction: string;
  prompt: string;
}): ProviderPromptDispatch {
  const boundary = createPrivacyEnvelopeBoundary(input.systemInstruction, input.prompt);
  const combinedPrompt = `${input.systemInstruction}${boundary}${input.prompt}`;
  const decision = assertProviderPromptAllowed({
    provider: input.route.provider,
    model: input.route.model,
    routePurpose: input.route.routePurpose,
    declaredPrivacyClass: input.route.privacyClass,
    prompt: combinedPrompt,
    fieldsSent: input.systemInstruction ? ['system', 'prompt'] : ['prompt'],
  });
  const boundaryIndex = decision.prompt.indexOf(boundary);
  if (boundaryIndex < 0 || decision.prompt.indexOf(boundary, boundaryIndex + boundary.length) >= 0) {
    throw new Error('Provider privacy gateway returned an invalid prompt envelope');
  }

  const systemInstruction = decision.prompt.slice(0, boundaryIndex);
  const prompt = decision.prompt.slice(boundaryIndex + boundary.length);
  return {
    systemInstruction,
    prompt,
    promptChars: systemInstruction.length + prompt.length,
    audit: decision.audit,
  };
}

function createPrivacyEnvelopeBoundary(systemInstruction: string, prompt: string): string {
  let suffix = 0;
  let boundary = '';
  do {
    boundary = `\n<tf_privacy_boundary_${systemInstruction.length}_${prompt.length}_${suffix}>\n`;
    suffix += 1;
  } while (systemInstruction.includes(boundary) || prompt.includes(boundary));
  return boundary;
}

/**
 * Configuration for agent instantiation
 */
export interface AgentConfig {
  /** Provider route purpose used by the privacy gateway */
  routePurpose?: ProviderRoutePurpose;
  /** Minimum sensitivity declared by the caller */
  privacyClass?: ProviderPrivacyClass;
  /** Explicit provider choice; private routes remain policy-gated */
  preferredProvider?: ThinkForgeModelProvider;
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
  /** Document type — determines creative vs technical constraints */
  documentType?: string;
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
  protected providerRoute: ThinkForgeProviderRoute;
  protected abortSignal?: AbortSignal;

  constructor(config: AgentConfig) {
    const routePurpose = config.routePurpose ?? 'creative_authoring';
    const privacyClass = config.privacyClass ?? 'business_confidential';
    const preferredProvider = config.preferredProvider ?? 'gemini';
    const providerRoute = resolveThinkForgeProviderRoute({
      routePurpose,
      privacyClass,
      preferredProvider,
      modelName: config.modelName,
    });
    this.config = {
      modelName: providerRoute.model,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
      agentType: config.agentType,
      modelTier: config.modelTier ?? ModelTier.Reasoning,
      documentType: config.documentType ?? '',
      routePurpose,
      privacyClass,
      preferredProvider,
    };
    this.providerRoute = providerRoute;
    this.model = createThinkForgeModelForRoute({
      routePurpose,
      privacyClass,
      preferredProvider,
      modelName: providerRoute.model,
    });
  }

  /**
   * Build the prompt from input - each agent implements this
   * This is where agent-specific reasoning instructions go
   */
  abstract buildPrompt(input: AgentInput): string;

  /**
   * Split trusted instructions from runtime data when an agent supports it.
   * The default preserves legacy agents exactly until each prompt owner opts in.
   */
  buildPromptParts(input: AgentInput): IsolatedPromptParts {
    return {
      systemInstruction: '',
      prompt: this.applyGlobalConstraints(this.buildPrompt(input)),
      truncatedFields: [],
    };
  }

  /**
   * Optional per-invocation overrides for token/temperature budgets
   * to allow orchestration layers to tune stages independently.
   */
  protected resolveGenConfig(overrides?: AgentGenerationOverrides) {
    return {
      maxTokens: overrides?.maxTokens ?? this.config.maxTokens,
      temperature: overrides?.temperature ?? this.config.temperature,
      seed: normalizeGenerationSeed(overrides?.seed),
    } as const;
  }

  /**
   * Apply global guardrails to any prompt — strict for script agents, light for creative agents
   */
  protected applyGlobalConstraints(prompt: string): string {
    const isScriptAgent = SCRIPT_AGENT_TYPES.has(this.config.agentType);
    if (!isScriptAgent) {
      const constraintBlock = `## Global Constraints (mandatory)\n- ${CREATIVE_OPERATION_CONSTRAINTS}`;
      return `${prompt}\n\n${constraintBlock}`;
    }
    const isTechnical = TECHNICAL_DOC_TYPES.has(this.config.documentType || '');
    const constraints = isTechnical ? SCRIPT_CONSTRAINTS_TECHNICAL : SCRIPT_CONSTRAINTS_CREATIVE;
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
    overrides?: AgentGenerationOverrides,
    abortSignal?: AbortSignal
  ): Promise<AgentStreamOutput> {
    const startTime = Date.now();
    const promptParts = this.buildPromptParts(input);
    const prompt = promptParts.prompt;
    const systemInstruction = promptParts.systemInstruction.trim();
    const gen = this.resolveGenConfig(overrides);
    const signal = abortSignal ?? this.abortSignal;
    let privacyAudit: ProviderPrivacyAuditRecord | undefined;
    let promptChars: number | undefined;
    let providerCallStarted = false;

    try {
      const dispatch = prepareProviderPromptDispatch({
        route: this.providerRoute,
        systemInstruction,
        prompt,
      });
      privacyAudit = dispatch.audit;
      promptChars = dispatch.promptChars;
      providerCallStarted = true;
      const result = streamText({
        model: this.model,
        system: dispatch.systemInstruction || undefined,
        prompt: dispatch.prompt,
        temperature: gen.temperature,
        // @ts-ignore - Vercel AI SDK version mismatch on maxTokens
        maxTokens: gen.maxTokens,
        seed: gen.seed,
        abortSignal: signal,
      });

      const textStream = result.textStream;
      const agentType = this.config.agentType;
      const modelName = this.config.modelName;
      const modelTier = this.config.modelTier;
      const documentType = this.config.documentType;
      const provider = this.providerRoute.provider;

      const streamGenerator = async function* (): AsyncGenerator<string, void, unknown> {
        let outputChars = 0;
        try {
          for await (const chunk of textStream) {
            outputChars += chunk.length;
            yield chunk;
          }

          await recordThinkForgeAgentCost({
            status: 'success',
            agentType,
            provider,
            modelName,
            operation: 'llm_stream',
            route: 'lib/thinkforge/agents/base-agent.run',
            sourceInput: input,
            promptChars,
            outputChars,
            functionMs: Date.now() - startTime,
            usage: await readAiSdkUsage((result as { usage?: unknown }).usage),
            maxTokens: gen.maxTokens,
            temperature: gen.temperature,
            modelTier,
            documentType,
            privacyAudit,
          });

        } catch (error) {
          await recordThinkForgeAgentCost({
            status: 'failed',
            agentType,
            provider,
            modelName,
            operation: 'llm_stream',
            route: 'lib/thinkforge/agents/base-agent.run',
            sourceInput: input,
            promptChars,
            outputChars,
            functionMs: Date.now() - startTime,
            maxTokens: gen.maxTokens,
            temperature: gen.temperature,
            modelTier,
            documentType,
            privacyAudit,
            error,
          });
          logInvocation({
            agent: agentType,
            model: modelName,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      };
      return {
        stream: streamGenerator(),
        metadata: {
          model: this.config.modelName,
        },
      };
    } catch (error) {
      const failedAudit = error instanceof ProviderPrivacyGateError ? error.audit : privacyAudit;
      await recordThinkForgeAgentCost({
        status: 'failed',
        agentType: this.config.agentType,
        provider: this.providerRoute.provider,
        modelName: this.config.modelName,
        operation: 'llm_stream',
        route: 'lib/thinkforge/agents/base-agent.run',
        sourceInput: input,
        promptChars,
        functionMs: Date.now() - startTime,
        maxTokens: gen.maxTokens,
        temperature: gen.temperature,
        modelTier: this.config.modelTier,
        documentType: this.config.documentType,
        privacyAudit: failedAudit,
        providerRequestCount: providerCallStarted ? 1 : 0,
        error,
      });
      logInvocation({
        agent: this.config.agentType,
        model: this.config.modelName,
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
    overrides?: AgentGenerationOverrides,
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
    overrides?: AgentGenerationOverrides,
    abortSignal?: AbortSignal
  ): Promise<AgentStructuredOutput<TOutput>> {
    const startTime = Date.now();
    const promptParts = this.buildPromptParts(input);
    const prompt = promptParts.prompt;
    const systemInstruction = promptParts.systemInstruction.trim();
    const gen = this.resolveGenConfig(overrides);
    const signal = abortSignal ?? this.abortSignal;
    let privacyAudit: ProviderPrivacyAuditRecord | undefined;
    let promptChars: number | undefined;
    let providerCallStarted = false;

    try {
      const dispatch = prepareProviderPromptDispatch({
        route: this.providerRoute,
        systemInstruction,
        prompt,
      });
      privacyAudit = dispatch.audit;
      promptChars = dispatch.promptChars;
      providerCallStarted = true;
      const result = await generateObject({
        model: this.model,
        schema: this.schema,
        system: dispatch.systemInstruction || undefined,
        prompt: dispatch.prompt,
        temperature: gen.temperature,
        // @ts-ignore
        maxTokens: gen.maxTokens,
        seed: gen.seed,
        abortSignal: signal,
      });

      await recordThinkForgeAgentCost({
        status: 'success',
        agentType: this.config.agentType,
        provider: this.providerRoute.provider,
        modelName: this.config.modelName,
        operation: 'llm_structured',
        route: 'lib/thinkforge/agents/base-agent.runStructured',
        sourceInput: input,
        promptChars,
        outputChars: safeJsonLength(result.object),
        functionMs: Date.now() - startTime,
        usage: await readAiSdkUsage((result as { usage?: unknown }).usage),
        maxTokens: gen.maxTokens,
        temperature: gen.temperature,
        modelTier: this.config.modelTier,
        documentType: this.config.documentType,
        privacyAudit,
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
      const activePrivacyAudit = error instanceof ProviderPrivacyGateError ? error.audit : privacyAudit;

      if (isStructuredFailure) {
        await recordThinkForgeAgentCost({
          status: 'failed',
          agentType: this.config.agentType,
          provider: this.providerRoute.provider,
          modelName: this.config.modelName,
          operation: 'llm_structured',
          route: 'lib/thinkforge/agents/base-agent.runStructured',
          sourceInput: input,
          promptChars,
          functionMs: Date.now() - startTime,
          maxTokens: gen.maxTokens,
          temperature: gen.temperature,
          modelTier: this.config.modelTier,
          documentType: this.config.documentType,
          privacyAudit: activePrivacyAudit,
          providerRequestCount: providerCallStarted ? 1 : 0,
          error,
        });

        // Fallback: ask model to return JSON manually and parse it.
        const fallbackPrompt = `${prompt}\n\nReturn ONLY valid JSON that matches this schema (no markdown): ${this.schema.toString()}`;
        let fallback: Awaited<ReturnType<typeof generateText>>;
        let fallbackPrivacyAudit: ProviderPrivacyAuditRecord | undefined;
        let fallbackPromptChars: number | undefined;
        let fallbackProviderCallStarted = false;
        try {
          const fallbackDispatch = prepareProviderPromptDispatch({
            route: this.providerRoute,
            systemInstruction,
            prompt: fallbackPrompt,
          });
          fallbackPrivacyAudit = fallbackDispatch.audit;
          fallbackPromptChars = fallbackDispatch.promptChars;
          fallbackProviderCallStarted = true;
          fallback = await generateText({
            model: this.model,
            system: fallbackDispatch.systemInstruction || undefined,
            prompt: fallbackDispatch.prompt,
            temperature: gen.temperature,
            // @ts-ignore
            maxTokens: gen.maxTokens,
            seed: gen.seed,
            abortSignal: signal,
          });
        } catch (fallbackError) {
          const failedFallbackAudit = fallbackError instanceof ProviderPrivacyGateError
            ? fallbackError.audit
            : fallbackPrivacyAudit;
          await recordThinkForgeAgentCost({
            status: 'failed',
            agentType: this.config.agentType,
            provider: this.providerRoute.provider,
            modelName: this.config.modelName,
            operation: 'llm_structured_fallback',
            route: 'lib/thinkforge/agents/base-agent.runStructured',
            sourceInput: input,
            promptChars: fallbackPromptChars,
            functionMs: Date.now() - startTime,
            maxTokens: gen.maxTokens,
            temperature: gen.temperature,
            modelTier: this.config.modelTier,
            documentType: this.config.documentType,
            fallback: 'manual_json',
            privacyAudit: failedFallbackAudit,
            providerRequestCount: fallbackProviderCallStarted ? 1 : 0,
            error: fallbackError,
          });
          throw fallbackError;
        }

        const jsonText = fallback.text.trim();
        const fallbackUsage = await readAiSdkUsage((fallback as { usage?: unknown }).usage);
        try {
          const parsed = parseJsonLenient(jsonText);
          if (!parsed) {
            throw new Error('Failed to parse fallback JSON');
          }

          await recordThinkForgeAgentCost({
            status: 'success',
            agentType: this.config.agentType,
            provider: this.providerRoute.provider,
            modelName: this.config.modelName,
            operation: 'llm_structured_fallback',
            route: 'lib/thinkforge/agents/base-agent.runStructured',
            sourceInput: input,
            promptChars: fallbackPromptChars,
            outputChars: jsonText.length,
            functionMs: Date.now() - startTime,
            usage: fallbackUsage,
            maxTokens: gen.maxTokens,
            temperature: gen.temperature,
            modelTier: this.config.modelTier,
            documentType: this.config.documentType,
            fallback: 'manual_json',
            privacyAudit: fallbackPrivacyAudit,
          });

          return {
            result: parsed as TOutput,
            metadata: { model: this.config.modelName },
          };
        } catch (parseError) {
          await recordThinkForgeAgentCost({
            status: 'failed',
            agentType: this.config.agentType,
            provider: this.providerRoute.provider,
            modelName: this.config.modelName,
            operation: 'llm_structured_fallback',
            route: 'lib/thinkforge/agents/base-agent.runStructured',
            sourceInput: input,
            promptChars: fallbackPromptChars,
            outputChars: jsonText.length,
            functionMs: Date.now() - startTime,
            usage: fallbackUsage,
            maxTokens: gen.maxTokens,
            temperature: gen.temperature,
            modelTier: this.config.modelTier,
            documentType: this.config.documentType,
            fallback: 'manual_json',
            privacyAudit: fallbackPrivacyAudit,
            error: parseError,
          });

          logInvocation({
            agent: this.config.agentType,
            model: this.config.modelName,
            success: false,
            error: parseError instanceof Error ? parseError.message : String(parseError),
          });
          throw parseError;
        }
      }

      await recordThinkForgeAgentCost({
        status: 'failed',
        agentType: this.config.agentType,
        provider: this.providerRoute.provider,
        modelName: this.config.modelName,
        operation: 'llm_structured',
        route: 'lib/thinkforge/agents/base-agent.runStructured',
        sourceInput: input,
        promptChars,
        functionMs: Date.now() - startTime,
        maxTokens: gen.maxTokens,
        temperature: gen.temperature,
        modelTier: this.config.modelTier,
        documentType: this.config.documentType,
        privacyAudit: activePrivacyAudit,
        providerRequestCount: providerCallStarted ? 1 : 0,
        error,
      });

      logInvocation({
        agent: this.config.agentType,
        model: this.config.modelName,
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
