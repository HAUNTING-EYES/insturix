/**
 * Architect Agent - "The Visualizer"
 *
 * Translates script text into a physical production plan:
 * Shot List, Scene Frames, timing calculations, and B-roll/music suggestions.
 *
 * Triggered manually via the [Storyboard] button when text is selected.
 * Outputs structured JSON that renders as Asset Cards in the Sidecar,
 * or as a new document tab (shot_list type).
 */

import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import { z } from 'zod';

const ShotSchema = z.object({
  shotNumber: z.number(),
  description: z.string(),
  camera: z.string().optional(),
  framing: z.string().optional(),
  motion: z.string().optional(),
  duration: z.string(),
  audio: z.string().optional(),
  notes: z.string().optional(),
});

const ArchitectResultSchema = z.object({
  title: z.string(),
  totalDuration: z.string(),
  shots: z.array(ShotSchema),
  bRollSuggestions: z.array(z.object({
    description: z.string(),
    purpose: z.string(),
    timing: z.string().optional(),
  })).optional(),
  musicDirection: z.array(z.object({
    segment: z.string(),
    genre: z.string(),
    mood: z.string(),
    reference: z.string().optional(),
  })).optional(),
  productionNotes: z.array(z.string()).optional(),
});

export type ArchitectResult = z.infer<typeof ArchitectResultSchema>;

export class ArchitectAgent extends StructuredAgent<ArchitectResult> {
  protected schema = ArchitectResultSchema;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'architect',
      temperature: config?.temperature ?? 0.4,
      maxTokens: config?.maxTokens ?? 1500,
    });
  }

  buildPrompt(input: AgentInput): string {
    const { context, userPrompt } = input;

    // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
    return `<role>You are the Architect, a production visualizer for a creative studio tool.</role>

<task>Translate script text into a concrete, executable production plan. Think in SHOTS and SECONDS. A filmmaker should be able to shoot from your output without any further interpretation.</task>

<rules>
- Break text into individual shots with timing, camera direction, and framing.
- Calculate total duration from shot durations.
- Suggest B-roll for retention and visual variety.
- Suggest music direction per segment (genre, mood, optional reference track).
- Add production notes for special requirements (lighting, location, props).
- Duration format: seconds ("3s", "8s") or minutes:seconds ("1:30").
- Return valid JSON matching the schema.
</rules>

<input_data>
${context.projectSummary ? `Project context: ${context.projectSummary}` : ''}
${context.currentScript ? `Full script:\n${context.currentScript}` : ''}
Script section to storyboard: ${userPrompt}
</input_data>`;
  }

  async storyboard(
    input: AgentInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>
  ): Promise<ArchitectResult> {
    const { result } = await this.runStructured(input, overrides);
    return result;
  }
}

export function createArchitectAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ArchitectAgent {
  return new ArchitectAgent(config);
}
