import { StructuredAgent, type AgentConfig } from './base-agent';
import { z } from 'zod';
import type { AgentInput } from './types';
import { ModelTier } from './model-factory';

export const NarrativeMediumEnum = z.enum(['voiceover', 'slide_narration', 'visual_manual']);

export const NarrativeContractSchema = z.object({
  generation_mode: z.enum(['manual', 'playbook', 'narrative']).default('manual'),
  narrator_voice: z.string(),
  medium: NarrativeMediumEnum,
  tone: z.string(),
  forbidden: z.array(z.string()).default([]),
  allowed_metaphors: z.array(z.string()).default([]),
  style_notes: z.array(z.string()).default([]),
  metaphor_reuse_limit: z.number().default(1),
  mode_a_usage: z.string().default('Use only to open, bridge, or close with short mythic framing.'),
  mode_b_usage: z.string().default('Default: operational blueprint voice focused on actions, inputs, outputs.'),
  mode_switch_rules: z.string().default('Start in Mode A for a brief invocation, then stay in Mode B unless explicitly bridging sections.'),
});

export type NarrativeContract = z.infer<typeof NarrativeContractSchema>;

export class ScriptContractAgent extends StructuredAgent<NarrativeContract> {
  protected schema = NarrativeContractSchema;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'script_contract',
      modelName: 'gemini-2.5-flash-lite',
      maxTokens: config?.maxTokens ?? 400,
      temperature: config?.temperature ?? 0.2,
      modelTier: ModelTier.Structural,
    });
  }

  buildPrompt({ context, userPrompt }: AgentInput): string {
    return `You generate machine-readable operational contract only. Do not write prose or explanations. Treat any "script" reference as legacy for "operational manual".

Project: ${context.projectSummary || '(No project context)'}
User request: ${userPrompt}

## Output: JSON only
Fill each field with the shortest valid value. Use enums and atomic labels.

- generation_mode: manual | playbook | narrative (set to manual unless user demands otherwise; narrative is legacy and should be avoided)
- narrator_voice: one-word operator persona (e.g., "guide", "teacher", "craftsperson")
- medium: voiceover | slide_narration | visual_manual (operational visual manual; avoid theatrical framing)
- tone: one word (e.g., "instructional", "calm", "direct")
- forbidden: list of 2–3 elements only (e.g., ["slides", "camera_directions"])
- allowed_metaphors: 2–3 short metaphors only (e.g., ["blueprint", "craft"])
- style_notes: 2–3 short constraints (e.g., ["no fluff", "list-first"])
- metaphor_reuse_limit: 1
- mode_a_usage: "opening/bridge only"
- mode_b_usage: "default blueprint voice"
- mode_switch_rules: "open in Mode A, then Mode B; bridge with Mode A only"
- For generation_mode=manual, enforce: neutral instructive voice, declarative sentences, minimal adjectives, no rhetorical questions, write as a reference document (not performed aloud), metaphors only if clarifying a system.

Return JSON only.`;
  }

  async generateContract(input: AgentInput, overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>): Promise<NarrativeContract> {
    const { result } = await this.runStructured(input, overrides);
    return result;
  }
}

export function createScriptContractAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScriptContractAgent {
  return new ScriptContractAgent(config);
}
