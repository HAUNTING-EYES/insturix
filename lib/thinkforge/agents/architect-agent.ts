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
import { buildIsolatedPromptParts, type IsolatedPromptParts } from './prompt-boundary';

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

  private buildTrustedInstruction(): string {
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

<runtime_data_contract>
Read project context, the full script, and the selected section to storyboard only from tf_untrusted_data.data.
</runtime_data_contract>`;
  }

  buildPrompt(input: AgentInput): string {
    const parts = this.buildPromptParts(input);
    return `${parts.systemInstruction}\n\n${parts.prompt}`;
  }

  buildPromptParts({ context, userPrompt }: AgentInput): IsolatedPromptParts {
    return buildIsolatedPromptParts({
      systemInstruction: this.applyGlobalConstraints(this.buildTrustedInstruction()),
      data: {
        projectSummary: context.projectSummary || null,
        fullScript: context.currentScript || null,
        selectedScriptSection: userPrompt,
      },
      fieldLimits: {
        projectSummary: 12_000,
        fullScript: 48_000,
        selectedScriptSection: 24_000,
      },
    });
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
