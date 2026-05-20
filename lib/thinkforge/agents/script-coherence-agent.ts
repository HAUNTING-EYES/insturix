import { BaseAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import type { ScriptOutline } from './script-outline-agent';
import type { NarrativeContract } from './script-contract-agent';
import { DOCUMENT_AUTHORING_CONTRACT } from './document-authoring-contract';

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
      .map((s) => `${s.id}: ${s.title} — beat=${(s as any).beat || 'NA'} | level=${(s as any).level || 'act'} | tone=${(s as any).tone || 'NA'}`)
      .join('\n');
    const forbidden = contract.forbidden?.join(', ') || 'none';
    // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
    return `<role>You are a validator, not a rewriter. Operate only on headers and transitions.</role>

${DOCUMENT_AUTHORING_CONTRACT}

<task>Validate the document structure against the contract and outline below. Check ordering, duplication, heading hierarchy, and transitions. Do NOT rewrite content.</task>

<rules>
RULE 1 — Check ordering and duplication (exactly one H1, no duplicated headings per DOCUMENT_AUTHORING_CONTRACT).
RULE 2 — Suggest transition fixes between consecutive sections.
RULE 3 — Validate heading hierarchy: H1 → H2 → H3, no duplicates, proper separation.
RULE 4 — Do NOT rewrite paragraphs. Do NOT add examples. Do NOT expand content.
RULE 5 — Keep output under 900 tokens.
</rules>

<output_format>
Plain text bullet list: ordering issues, duplicate/overlapping sections, one-line transition suggestions.
</output_format>

<input_data>
Contract: medium=${contract.medium}, voice=${contract.narrator_voice}, tone=${contract.tone}, forbidden=${forbidden}, metaphors=${(contract.allowed_metaphors || []).join(', ') || 'minimal, consistent'}, style=${(contract.style_notes || []).join('; ')}

Outline (order locked):
${sectionList}
</input_data>`;
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
