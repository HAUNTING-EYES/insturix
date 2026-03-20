import { z } from 'zod';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import { ModelTier } from './model-factory';

const OutlineSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string(),
  beat: z.enum(['Setup', 'Tension', 'Turn', 'Resolution', 'Aftermath']),
  level: z.enum(['act', 'beat']).default('act'),
  parent_id: z.string().optional(),
  tone: z.string().optional(),
});

const ScriptOutlineSchema = z.object({
  title: z.string(),
  sections: z.array(OutlineSectionSchema).min(3),
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
    return `You generate a structured outline for document authoring. Do not write prose; only supply a compact JSON outline.

Project: ${context.projectSummary || '(No project context)'}
User request: ${userPrompt}

## Output: Document outline (JSON only)
Create 3–5 major sections or beats total. Prefer fewer, stronger sections. This outline is for internal steering only.

Adapt the structure to the project type:
- For screenplays/narratives: use dramatic beats (Setup, Tension, Turn, Resolution, Aftermath)
- For technical documents (VFX briefs, budgets): use logical sections (Overview, Breakdown, Details, Summary, Contingency)
- For character/world bibles: use encyclopedic sections (Introduction, Core Details, Relationships, Evolution, Edge Cases)
- For interview guides: use flow sections (Setup, Opening, Deep-Dive, Emotional, Closing)
- For research briefs: use analytical sections (Setup, Findings, Analysis, Resolution, Recommendations)

Per section:
- id: S1, S2, ... (stable)
- title: short label (2–4 words)
- goal: one sentence describing the purpose or intent of this section
- beat: Setup | Tension | Turn | Resolution | Aftermath (use the closest conceptual match even for non-narrative docs)
- level: act | beat (acts have no parent; beats parent an act)
- parent_id: id of parent when level is beat
- tone: optional one-word tone tag (e.g., "authoritative", "analytical", "tense", "practical")

Return JSON only: { title, sections[], notes (optional one-liner on section dependencies) }.`;
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
