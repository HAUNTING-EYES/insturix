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
    return `You generate a creative production contract for a creative team. This contract guides how content should be written—as clear, actionable creative direction.

Project: ${context.projectSummary || '(No project context)'}
User request: ${userPrompt}

## Output: JSON only
Fill each field with values that guide creative, execution-focused writing:

- generation_mode: manual | playbook | narrative (set to manual unless user demands otherwise; narrative is legacy and should be avoided)
- narrator_voice: one-word creative persona (e.g., "strategist", "director", "producer")
- medium: voiceover | slide_narration | visual_manual (visual manual for production guides)
- tone: one word describing the creative voice (e.g., "confident", "grounded", "inspiring", "practical")
- forbidden: list of 2–3 elements to avoid (e.g., ["slides", "camera_directions", "meta_instructions", "schema_artifacts"])
- allowed_metaphors: 2–3 short metaphors only (e.g., ["blueprint", "craft"])
- style_notes: 2–3 short constraints emphasizing clean creative output (e.g., ["no schema artifacts", "execution-focused", "creator-first-voice", "no internal structure visible"])
- metaphor_reuse_limit: 1
- mode_a_usage: "opening/bridge only"
- mode_b_usage: "default creative direction voice focused on immediate execution"
- mode_switch_rules: "open in Mode A for brief framing, then Mode B for execution guidance"

For generation_mode=manual: Write as a creative strategist giving production guidance. Use execution-style language, concrete direction, and remove all internal structure artifacts. Write content that enables immediate storyboarding, directing, filming, and editing.

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
