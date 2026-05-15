/**
 * Stylist Agent - "The Editor"
 *
 * Guardian of Brand DNA. Compares the user's draft against their voice profile
 * and flags "AI Slop", suggesting pattern interrupts (jokes, slang,
 * micro-imperfections) to maintain human-grade flair.
 *
 * Triggered manually via the [Refine Voice] button.
 * Outputs structured JSON that renders as Suggestion Cards in the Sidecar.
 */

import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import { z } from 'zod';

const VoiceFlagSchema = z.object({
  blockId: z.string().optional(),
  text: z.string(),
  issue: z.enum(['ai_slop', 'off_brand', 'too_formal', 'too_generic', 'pacing']),
  suggestion: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
});

const PatternInterruptSchema = z.object({
  location: z.string(),
  type: z.enum(['joke', 'slang', 'imperfection', 'callback', 'rhetorical', 'rhythm_break']),
  suggestion: z.string(),
  reason: z.string(),
});

const StylistResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  voiceSummary: z.string(),
  flags: z.array(VoiceFlagSchema),
  patternInterrupts: z.array(PatternInterruptSchema),
  toneAnalysis: z.object({
    detected: z.string(),
    target: z.string(),
    alignment: z.enum(['aligned', 'slightly_off', 'misaligned']),
  }).optional(),
});

export type StylistResult = z.infer<typeof StylistResultSchema>;

export class StylistAgent extends StructuredAgent<StylistResult> {
  protected schema = StylistResultSchema;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'stylist',
      temperature: config?.temperature ?? 0.5,
      maxTokens: config?.maxTokens ?? 1000,
    });
  }

  buildPrompt(input: AgentInput): string {
    const { context, userPrompt } = input;

    // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
    return `<role>You are the Stylist, a voice and brand guardian for a creative studio tool. Your mission: protect the creator's authentic voice and ensure output doesn't read like "AI slop."</role>

<task>
1. Voice Flags: find sentences that sound robotic, overly formal, generic, or off-brand. Tag each with issue type + specific rewrite.
2. Pattern Interrupts: suggest 2-5 places for unexpected elements (joke, slang, rhythm break) to humanize the script.
3. Tone Analysis: compare detected tone vs target tone.
4. Overall Score: 0-100 authenticity. 90+ = sounds human. 60-89 = needs tweaks. <60 = AI slop.
</task>

<rules>
- Be specific. Not "add more personality" — say exactly what to add and where.
- Pattern interrupts must match the creator's brand, not generic humor.
- If no brand DNA loaded, infer voice from the draft itself.
- Every flag must have a concrete suggestion. Return valid JSON matching the schema.
</rules>

<input_data>
${context.systemBrief ? `Brand DNA / Voice Profile: ${context.systemBrief}` : 'Brand DNA: (none loaded — analyze the draft style)'}
${context.projectSummary ? `Project context: ${context.projectSummary}` : ''}
Draft to analyze: ${userPrompt}
</input_data>`;
  }

  async checkVoice(
    input: AgentInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>
  ): Promise<StylistResult> {
    const { result } = await this.runStructured(input, overrides);
    return result;
  }
}

export function createStylistAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): StylistAgent {
  return new StylistAgent(config);
}
