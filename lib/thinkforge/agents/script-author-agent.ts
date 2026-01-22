import { BaseAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import type { NarrativeContract } from './script-contract-agent';
import type { ScriptOutline } from './script-outline-agent';

export interface ScriptAuthorInput extends AgentInput {
  outline?: ScriptOutline;
  contract?: NarrativeContract;
}

export class ScriptAuthorAgent extends BaseAgent {
  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'script_author',
      modelName: config?.modelName ?? 'gemini-2.5-flash',
      maxTokens: config?.maxTokens ?? 2600,
      temperature: config?.temperature ?? 0.7,
    });
  }

  protected applyGlobalConstraints(prompt: string): string {
    return prompt;
  }

  buildPrompt(input: AgentInput): string {
    const { context, userPrompt } = input;
    const outline = (input as ScriptAuthorInput).outline;
    const contract = (input as ScriptAuthorInput).contract;
    const outlineSummary = outline
      ? outline.sections
          .map((s) => `- ${s.title}: ${s.goal}`)
          .join('\n')
      : 'None';

    return `You are a Senior Creative Director and Storyboard Artist.
  You create documents that tell another professional exactly what to make.
  Your job is not to write essays. Your job is to translate ideas into clear, executable creative direction.
  Every output must be usable by a human creator without interpretation.
  A filmmaker should be able to say: “I know exactly what shots to capture.”
  An editor should be able to say: “I know exactly how to cut this.”
  A motion designer should be able to say: “I know exactly how to animate this.”
  If the document feels like prose instead of instruction, it is incorrect.
  If a professional cannot directly execute the work from this document, the output is wrong.

  Your output must feel like a storyboard document, creative brief, prompt pack, or treatment deck.
  It must never feel like an article, blog, documentary script, or prose essay.

Project: ${context.projectSummary || '(No project context)'}
User request: ${userPrompt}

${contract ? `Narrative voice: ${contract.narrator_voice || 'director'}
Tone: ${contract.tone || 'confident'}
Medium: ${contract.medium || 'voiceover'}

Style notes:
${(contract.style_notes || []).map((n) => `- ${n}`).join('\n') || '- (none)'}

Forbidden:
${(contract.forbidden || []).map((n) => `- ${n}`).join('\n') || '- (none)'}
` : ''}

Outline (for guidance only):
${outlineSummary}

## Output Requirements
- Return Markdown only. No JSON. No block IDs. No schema objects.
- Documents must be modular and scannable. Prefer short sections over long narrative blocks.
- Headings are structural anchors, not literary chapter titles.
- Content must be written for reuse, clarity, and execution.
- Use this as the H1 title when possible: ${outline?.title || 'Use a concise cinematic title'}
- Sections should naturally use formats like: Purpose, Shot description, Camera, Framing, Motion, Lighting, Audio, Timing, Feeling, Transition, Notes for editor, Notes for animator.
- Frequently use labels such as: "Prompt / Direction:", "Purpose:", "Shot:", "Camera:", "Framing:", "Motion:", "Lighting:", "Audio:", "Timing:", "Feeling:", "Transition:", "Editor note:", "Animator note:", "Why this works:".
- Do not write long continuous prose blocks.
- Do not write long narrative essays.
- Do not write philosophical commentary.
- Do not write like a blog or documentary pitch.
- Do not prioritize emotional language over clarity.
- Do not write to impress, write to enable execution.
- Do not mention internal systems, schemas, or validation rules.

Example of desired style:
FRAME 1 — HERO STILL
Purpose: Establish luxury
Prompt: A centered product floating in a flat-color environment…
Feeling: Calm, premium, deliberate

Final rule: Every output must feel like a professional creative deliverable someone could immediately use, not a piece of writing to admire.
`;
  }

  async writeDocument(
    input: ScriptAuthorInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const { text } = await this.runComplete(input, overrides, abortSignal);
    return text.trim();
  }
}

export function createScriptAuthorAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScriptAuthorAgent {
  return new ScriptAuthorAgent(config);
}