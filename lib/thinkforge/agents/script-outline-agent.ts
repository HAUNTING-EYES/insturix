import { z } from 'zod';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import { ModelTier } from './model-factory';

const OutlineSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string(),
  role: z.string(),
  knowledge_role: z.enum(['Architect', 'Operator', 'Strategist', 'Analyst']),
  operational_goal: z.enum(['Action', 'Decision', 'Constraint']),
  level: z.enum(['chapter', 'section', 'subsection']).default('section'),
  parent_id: z.string().optional(),
  knowledge_layer: z.enum([
    'Vision / Framing',
    'System Explanation',
    'Execution Blueprint',
    'Data & Inputs',
    'Tools & Platforms',
    'Distribution & Upload Strategy',
    'Optimization Tips',
    'Common Failure Modes',
  ]),
  mode: z.enum(['Mode A: Mythic Framing', 'Mode B: Builder Blueprint']),
  primary_actions: z.string(),
  required_inputs: z.string(),
  expected_outputs: z.string(),
  audience_state_after: z.string(),
  intensity_level: z.number().min(1).max(5),
  tone: z.string().optional(),
  estimated_length: z.string().optional(),
  risks: z.string().optional(),
});

const ScriptOutlineSchema = z.object({
  title: z.string(),
  sections: z.array(OutlineSectionSchema).min(4),
  notes: z.string().optional(),
});

export type ScriptOutline = z.infer<typeof ScriptOutlineSchema>;

export class ScriptOutlineAgent extends StructuredAgent<ScriptOutline> {
  protected schema = ScriptOutlineSchema;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    const modelName = 'gemini-2.5-flash-lite';
    super({
      ...config,
      agentType: 'script_outline',
      modelName,
      maxTokens: config?.maxTokens ?? 500,
      temperature: config?.temperature ?? 0.2,
      modelTier: ModelTier.Structural,
    });
  }

  buildPrompt({ context, userPrompt }: AgentInput): string {
    return `You generate machine-readable operational blueprint structure only. Do not write prose. Use shortest valid labels for all fields. Treat any "script" mention as a legacy alias for "manual".

Project: ${context.projectSummary || '(No project context)'}
User request: ${userPrompt}

## Output: Hierarchical outline (JSON only)
5–7 chapters max. Prefer fewer deep sections over many shallow ones. Merge adjacent items with the same knowledge_layer.
Levels: chapter → section → subsection. Use parent_id to link child to parent.

Per section:
- id: S1, S2, ... (stable)
- title: short label (2–3 words max)
- goal: one-sentence operational outcome
- role: operational function (e.g., "orientation", "handoff", "validation")
- knowledge_role: Architect | Operator | Strategist | Analyst (must be present)
- operational_goal: Action | Decision | Constraint (must be present)
- level: chapter | section | subsection (chapters have no parent; sections parent a chapter; subsections parent a section)
- parent_id: id of parent when level is section or subsection
- knowledge_layer: Vision/Framing | System Explanation | Execution Blueprint | Data & Inputs | Tools & Platforms | Distribution & Upload Strategy | Optimization Tips | Common Failure Modes
- mode: "Mode A: Mythic Framing" (vision only) | "Mode B: Builder Blueprint" (all others)
- primary_actions: comma-separated, no prose
- required_inputs: comma-separated, no prose
- expected_outputs: comma-separated, no prose
- audience_state_after: one sentence
- intensity_level: 1–5
- tone: one word (e.g., "direct", "instructional")
- estimated_length: "short" | "medium" | "long"
- risks: optional one-liner

Return JSON only: { title, sections[], notes (optional one-liner on arc dependencies) }. Missing knowledge_role or operational_goal should be treated as invalid and regenerated.`;
  }

  async generateOutline(input: AgentInput, overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>): Promise<ScriptOutline> {
    const { result } = await this.runStructured(input, overrides);
    return result;
  }
}

export function createScriptOutlineAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScriptOutlineAgent {
  return new ScriptOutlineAgent(config);
}
