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

    // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
    return `<role>You are the Ingestor, a multi-modal research scout for a creative studio tool.</role>

<task>
"Shatter" the raw input into reusable building blocks:
1. Atomic Facts: specific, verifiable, single-sentence data points (5-12)
2. Viral Hooks: attention-grabbing openings derived from the content (3-6)
3. Visual Assets: any referenced images, videos, or graphics
</task>

<rules>
- Atomic Facts must be specific and quotable. No vague generalities.
- Viral Hooks must be punchy, platform-aware, and varied in style (question, statistic, bold claim, etc.).
- Visual asset tags must be concise (1-3 words each).
- Return valid JSON matching the schema.
</rules>

<input_data>
${context.projectSummary ? `Project context: ${context.projectSummary}` : ''}
${context.systemBrief ? `Brand/DataBank context: ${context.systemBrief}` : ''}
Content to deconstruct: ${userPrompt}
</input_data>`;
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
