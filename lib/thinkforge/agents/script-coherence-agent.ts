import { BaseAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import type { ScriptOutline } from './script-outline-agent';
import type { NarrativeContract } from './script-contract-agent';

export interface CoherenceInput extends AgentInput {
  outline: ScriptOutline;
  contract: NarrativeContract;
  assembledContent: string;
}

export interface CoherenceOutput {
  content: string;
}

export class ScriptCoherenceAgent extends BaseAgent {
  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'script_coherence',
      modelName: 'gemini-2.5-flash',
      maxTokens: config?.maxTokens ?? 900,
      temperature: config?.temperature ?? 0.3,
    });
  }

  buildPrompt(input: AgentInput): string {
    const { outline, contract } = input as CoherenceInput;
    const sectionList = outline.sections
      .map((s) => `${s.id}: ${s.title} — role=${s.role || 'NA'} | layer=${(s as any).knowledge_layer || 'NA'} | mode=${(s as any).mode || 'Mode B'}`)
      .join('\n');
    const forbidden = contract.forbidden?.join(', ') || 'none';
    return `You are a validator, not a rewriter. Operate only on headers and transitions.

## Contract
Medium: ${contract.medium}
Narrator voice: ${contract.narrator_voice}
Tone: ${contract.tone}
Forbidden: ${forbidden}
Allowed metaphors: ${(contract.allowed_metaphors || []).join(', ') || 'minimal, consistent'}
Style notes: ${(contract.style_notes || []).join('; ')}

## Outline (order locked)
${sectionList}

## Validator Task
- Check ordering and duplication of sections.
- Suggest transition fixes between sections in one short list.
- Remove or flag redundancy in section headings only.
- Do NOT rewrite paragraphs; do NOT add examples; do NOT expand content.
- Keep output under 900 tokens.

## Return format
Plain text bullet list of: any ordering issues, any duplicate/overlapping sections, and one-line transition suggestions between consecutive sections.`;
  }

  async improve(input: CoherenceInput): Promise<CoherenceOutput> {
    const { text } = await this.runComplete(input, {
      maxTokens: 900,
      temperature: 0.3,
    });
    // Validator returns notes; draft pipeline now bypasses rewrite. We keep content passthrough behavior for compatibility.
    return { content: text.trim() };
  }
}

export function createScriptCoherenceAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScriptCoherenceAgent {
  return new ScriptCoherenceAgent(config);
}
