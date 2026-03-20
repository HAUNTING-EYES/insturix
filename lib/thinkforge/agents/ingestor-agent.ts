/**
 * Ingestor Agent - "The Researcher"
 *
 * Shatters links, PDFs, and text into Atomic Facts and Viral Hooks.
 * Triggered manually via the [Deconstruct] button in the Sidecar.
 *
 * Outputs structured JSON that renders as Asset Cards in the Sidecar.
 */

import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import { z } from 'zod';

const AtomicFactSchema = z.object({
  fact: z.string(),
  source: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
});

const ViralHookSchema = z.object({
  hook: z.string(),
  style: z.string().optional(),
  platform: z.string().optional(),
});

const IngestorResultSchema = z.object({
  title: z.string(),
  summary: z.string(),
  atomicFacts: z.array(AtomicFactSchema),
  viralHooks: z.array(ViralHookSchema),
  visualAssets: z.array(z.object({
    description: z.string(),
    type: z.enum(['image', 'video', 'graphic', 'screenshot']),
    suggestion: z.string().optional(),
  })).optional(),
  tags: z.array(z.string()).optional(),
});

export type IngestorResult = z.infer<typeof IngestorResultSchema>;

export class IngestorAgent extends StructuredAgent<IngestorResult> {
  protected schema = IngestorResultSchema;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'ingestor',
      temperature: config?.temperature ?? 0.3,
      maxTokens: config?.maxTokens ?? 1200,
    });
  }

  buildPrompt(input: AgentInput): string {
    const { context, userPrompt } = input;

    return `You are the Ingestor, a multi-modal research scout for a creative studio tool.

Your job is to "shatter" raw input (text content, article summaries, product specs, etc.)
into two categories of reusable building blocks:

1. **Atomic Facts**: Specific, verifiable data points. Each should be a single sentence.
2. **Viral Hooks**: Attention-grabbing openings derived from the content.

Also extract potential visual assets (images, videos, graphics) that could be referenced.

${context.projectSummary ? `Project context: ${context.projectSummary}\n` : ''}
${context.systemBrief ? `Brand/DataBank context:\n${context.systemBrief}\n` : ''}

## Content to Deconstruct
${userPrompt}

## Rules
- Atomic Facts must be specific and quotable. No vague generalities.
- Viral Hooks should be punchy, platform-aware, and varied in style (question, statistic, bold claim, etc.).
- Return 5-12 atomic facts and 3-6 viral hooks.
- If the content mentions visual elements, list them as visual assets.
- Keep tags concise (1-3 words each).

Return valid JSON matching the schema.`;
  }

  async deconstruct(
    input: AgentInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>
  ): Promise<IngestorResult> {
    const { result } = await this.runStructured(input, overrides);
    return result;
  }
}

export function createIngestorAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): IngestorAgent {
  return new IngestorAgent(config);
}
