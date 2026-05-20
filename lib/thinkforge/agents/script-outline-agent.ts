import { z } from 'zod';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import { ModelTier } from './model-factory';

const OutlineSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string(),
  beat: z.enum(['Setup', 'Tension', 'Turn', 'Resolution', 'Aftermath', 'Hook', 'Problem', 'Solution', 'CTA', 'Bridge']),
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
    super({
      ...config,
      agentType: 'script_outline',
      modelName: config?.modelName ?? 'gemini-2.5-flash',
      maxTokens: config?.maxTokens ?? 500,
      temperature: config?.temperature ?? 0.5,
      modelTier: ModelTier.Reasoning,
    });
  }

  buildPrompt({ context, userPrompt }: AgentInput): string {
    return `You generate a structured outline for document authoring. Do not write prose; only supply a compact JSON outline.

Project: ${context.projectSummary || '(No project context)'}
User request: ${userPrompt}

## Output: Document outline (JSON only)
Create 3–5 major sections or beats total. Prefer fewer, stronger sections. This outline is for internal steering only.

Adapt the structure to the project type:
- For video scripts/ads/reels (short-form, under 90s): use PAS structure — Hook, Problem, Solution, CTA (3-4 sections)
- For video scripts/brand films (long-form, 90s+): use AIDA or Narrative Arc — Hook, Setup, Tension, Turn, Resolution, CTA (4-6 sections)
- For screenplays/narratives: use dramatic beats (Setup, Tension, Turn, Resolution, Aftermath)
- For technical documents (VFX briefs, budgets): use logical sections (Overview, Breakdown, Details, Summary, Contingency)
- For character/world bibles: use encyclopedic sections (Introduction, Core Details, Relationships, Evolution, Edge Cases)
- For interview guides: use flow sections (Setup, Opening, Deep-Dive, Emotional, Closing)
- For research briefs: use analytical sections (Setup, Findings, Analysis, Resolution, Recommendations)

Per section:
- id: S1, S2, ... (stable)
- title: short label (2–4 words)
- goal: one sentence describing the purpose or intent of this section
- beat: choose from Setup | Tension | Turn | Resolution | Aftermath | Hook | Problem | Solution | CTA | Bridge (use the best match for the content type)
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
