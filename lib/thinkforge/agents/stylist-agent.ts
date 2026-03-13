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

    return `You are the Stylist, a voice and brand guardian for a creative studio tool.

Your mission: protect the creator's authentic voice and ensure the output doesn't read like "AI slop."

${context.systemBrief ? `## Brand DNA / Voice Profile\n${context.systemBrief}\n` : '## Brand DNA\n(No brand profile loaded. Analyze the writing style in the draft itself.)\n'}
${context.projectSummary ? `Project context: ${context.projectSummary}\n` : ''}

## Draft to Analyze
${userPrompt}

## Your Tasks
1. **Voice Flags**: Find sentences that sound robotic, overly formal, generic, or off-brand.
   Tag each with an issue type and suggest a specific rewrite.
2. **Pattern Interrupts**: Suggest 2-5 places where inserting an unexpected element
   (joke, slang, micro-imperfection, rhetorical question, rhythm break) would make
   the script feel more human and engaging.
3. **Tone Analysis**: Compare detected tone vs. target tone.
4. **Overall Score**: 0-100 authenticity score. 90+ = sounds human. 60-89 = needs tweaks. <60 = AI slop.

## Rules
- Be specific. Don't say "add more personality." Say exactly what to add and where.
- Pattern interrupts should match the creator's brand, not generic humor.
- If no brand DNA is loaded, infer the intended voice from the draft itself.
- Keep flags actionable: every flag must have a concrete suggestion.

Return valid JSON matching the schema.`;
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
