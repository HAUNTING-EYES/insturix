import { BaseAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import type { NarrativeContract } from './script-contract-agent';
import type { ScriptOutline } from './script-outline-agent';
import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import { ScriptIntent, type AgentScriptResponse } from '../protocol/intent';
import { parseAgentJson } from '../protocol/parse-agent-json';

export interface ScriptAuthorInput extends AgentInput {
  outline?: ScriptOutline;
  contract?: NarrativeContract;
}

export interface ScriptAuthorIntentInput extends AgentInput {
  intent: ScriptIntent;
  instruction: string;
  currentScript?: ThinkForgeBlock[];
  recentBlocks?: ThinkForgeBlock[];
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

  private buildStructuredPrompt(input: ScriptAuthorIntentInput): string {
    if (input.intent === ScriptIntent.FORK) {
      throw new Error('ScriptAuthorAgent does not support FORK intent');
    }

    const { context, instruction, intent } = input;
    const currentBlocks = Array.isArray(input.currentScript) ? input.currentScript : [];
    const recentBlocks = Array.isArray(input.recentBlocks) ? input.recentBlocks : [];

    const serializedCurrent = currentBlocks.length > 0
      ? JSON.stringify(currentBlocks, null, 2)
      : '[]';
    const serializedRecent = recentBlocks.length > 0
      ? JSON.stringify(recentBlocks, null, 2)
      : '[]';

    const intentGuidance = (() => {
      switch (intent) {
        case ScriptIntent.REWRITE:
          return `INTENT: REWRITE\nYou must return {"mode":"replace","blocks":[...]} with a full replacement.`;
        case ScriptIntent.CONTINUE:
          return `INTENT: CONTINUE\nYou must return {"mode":"insert","position":{"atEnd":true},"blocks":[...]} with only new blocks.`;
        case ScriptIntent.EDIT:
          return `INTENT: EDIT\nYou must return {"mode":"patch","patches":[{"blockId":"...","content":[...]}]} referencing existing blockIds.`;
        default:
          return 'INTENT: EDIT';
      }
    })();

    const scriptContextBlock = intent === ScriptIntent.EDIT
      ? `Current script blocks (with blockIds):\n${serializedCurrent}`
      : intent === ScriptIntent.CONTINUE
        ? `Recent blocks (with blockIds):\n${serializedRecent}`
        : '';

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
User request: ${instruction}

${intentGuidance}

${scriptContextBlock}

OUTPUT FORMAT REQUIREMENTS:
- You must output valid JSON matching the AgentScriptResponse schema.
- Do not include markdown.
- Do not include commentary.
- Do not include backticks.
- The response must be a single JSON object.

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
- Return JSON only. No Markdown.
- Include blockIds in patches.
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

  buildPrompt(input: AgentInput): string {
    if ((input as ScriptAuthorIntentInput)?.intent) {
      return this.buildStructuredPrompt(input as ScriptAuthorIntentInput);
    }

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

  async writeStructuredResponse(
    input: ScriptAuthorIntentInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal
  ): Promise<AgentScriptResponse> {
    const { text } = await this.runComplete(
      {
        ...input,
        userPrompt: input.instruction,
      },
      overrides,
      abortSignal
    );

    let parsed: unknown;
    try {
      parsed = parseAgentJson(text.trim());
    } catch (error) {
      throw new Error(`Invalid JSON from ScriptAuthorAgent: ${(error as Error).message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid AgentScriptResponse: not an object');
    }
    const result = parsed as any;
    if (result.mode !== 'replace' && result.mode !== 'insert' && result.mode !== 'patch') {
      throw new Error('Invalid AgentScriptResponse: missing or invalid mode');
    }
    if (result.mode === 'replace' || result.mode === 'insert') {
      if (!Array.isArray(result.blocks) || result.blocks.length === 0) {
        throw new Error('Invalid AgentScriptResponse: blocks required');
      }
    }
    if (result.mode === 'insert') {
      if (!result.position || typeof result.position !== 'object') {
        throw new Error('Invalid AgentScriptResponse: position required for insert');
      }
    }
    if (result.mode === 'patch') {
      if (!Array.isArray(result.patches) || result.patches.length === 0) {
        throw new Error('Invalid AgentScriptResponse: patches required');
      }
    }

    return result as AgentScriptResponse;
  }
}

export function createScriptAuthorAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScriptAuthorAgent {
  return new ScriptAuthorAgent(config);
}