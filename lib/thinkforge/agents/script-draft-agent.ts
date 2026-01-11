/**
 * Script Draft Orchestrator
 *
 * Multi-stage pipeline (Manual mode default):
 * 1) Outline (gemini-2.5-flash-lite) hierarchical with knowledge layers
 * 2) Section expansion: gemini-2.5-flash only (no preview)
 * 3) No full-document coherence rewrite; optional validator only
 * 4) Assembly into ThinkForge blocks only (no canonical/text fallbacks)
 */

import type { AgentInput } from './types';
import { ensureThinkForgeBlockId, validateThinkForgeBlocks, type RichTextAST, type ThinkForgeBlock } from '../schemas/thinkforge-block';
import { ScriptOutlineAgent, type ScriptOutline } from './script-outline-agent';
import { ScriptSectionAgent, type SectionOutput } from './script-section-agent';
import { ScriptContractAgent, type NarrativeContract } from './script-contract-agent';
import type { AgentConfig } from './base-agent';
import { quickAssembleContext } from '../context';
import type { SessionState } from '../state/types';
import { thinkForgeBlocksToTiptapJSON } from '../mappers/thinkforge-to-tiptap';
import type { TiptapJSON } from '../schemas/tiptap-schema';

function wordLimitForLayer(layer?: string): number {
  switch ((layer || '').toLowerCase()) {
    case 'vision / framing':
      return 250;
    case 'execution blueprint':
      return 400;
    case 'tools & platforms':
      return 300;
    case 'distribution & upload strategy':
      return 300;
    case 'optimization tips':
    case 'analytics / iteration':
      return 300;
    case 'common failure modes':
      return 250;
    case 'data & inputs':
      return 250;
    default:
      return 300;
  }
}

function extractTextFromAst(ast: RichTextAST): string {
  const parts: string[] = [];
  const walk = (nodes: RichTextAST) => {
    for (const node of nodes) {
      if (node.text) parts.push(node.text);
      if (node.children && node.children.length) walk(node.children);
    }
  };
  walk(ast || []);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function applyWordLimitToBlocks(blocks: ThinkForgeBlock[], maxWords: number): ThinkForgeBlock[] {
  let remaining = maxWords;
  const result: ThinkForgeBlock[] = [];

  for (const block of blocks) {
    if (remaining <= 0) break;
    const words = extractTextFromAst(block.content).split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    if (words.length <= remaining) {
      result.push(block);
      remaining -= words.length;
    } else {
      break;
    }
  }

  return result;
}

function renderPlainText(blocks: ThinkForgeBlock[]): string {
  return blocks
    .map((block) => {
      const text = extractTextFromAst(block.content);
      if (!text) return '';
      if (block.kind === 'header') return `# ${text}`;
      return text;
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function compactOutline(outline: ScriptOutline): ScriptOutline {
  const merged: typeof outline.sections = [];
  for (const sec of outline.sections) {
    const last = merged[merged.length - 1];
    if (last && (last as any).knowledge_layer === (sec as any).knowledge_layer) {
      last.title = `${last.title} + ${sec.title}`;
      last.goal = `${last.goal}; ${sec.goal}`;
      last.primary_actions = `${(last as any).primary_actions || ''}; ${(sec as any).primary_actions || ''}`.trim();
      last.required_inputs = `${(last as any).required_inputs || ''}; ${(sec as any).required_inputs || ''}`.trim();
      last.expected_outputs = `${(last as any).expected_outputs || ''}; ${(sec as any).expected_outputs || ''}`.trim();
      last.estimated_length = sec.estimated_length || last.estimated_length;
      continue;
    }
    merged.push({ ...sec });
  }
  const capped = merged.slice(0, 7);
  return { ...outline, sections: capped };
}

export interface ScriptDraftResult {
  title: string;
  blocks: ThinkForgeBlock[];
  richText?: TiptapJSON; // Tiptap JSON AST
  content: string;
  draft: boolean;
  outline: ScriptOutline;
  sections: SectionOutput[];
  status?: 'ok' | 'error';
  reason?: string;
}

export class ScriptDraftAgent {
  private outlineAgent: ScriptOutlineAgent;
  private sectionAgent: ScriptSectionAgent;
  private sectionAgentHigh: ScriptSectionAgent;
  private contractAgent: ScriptContractAgent;
  private sectionConcurrency: number;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    this.outlineAgent = new ScriptOutlineAgent({
      maxTokens: config?.maxTokens ?? 500,
      temperature: 0.2,
    });
    this.sectionAgent = new ScriptSectionAgent({
      maxTokens: Math.max(config?.maxTokens ?? 1200, 1200),
      temperature: 0.35,
    });
    this.sectionAgentHigh = new ScriptSectionAgent({
      modelName: 'gemini-2.5-flash',
      maxTokens: 1600,
      temperature: 0.35,
    });
    this.contractAgent = new ScriptContractAgent({
      maxTokens: 400,
      temperature: 0.2,
    });
    // Batch size 2 for throughput while preserving rolling memory
    this.sectionConcurrency = 2;
  }

  async generateScript(input: AgentInput): Promise<ScriptDraftResult> {
    const generationMode = input.generationMode ?? 'manual';
    const modeAwareInput: AgentInput = { ...input, generationMode };

    const contract = await this.contractAgent.generateContract(modeAwareInput, {
      maxTokens: 400,
      temperature: 0.2,
    });

    const outlineRaw = await this.outlineAgent.generateOutline(modeAwareInput, {
      maxTokens: 500,
      temperature: 0.2,
    });

    const outline = compactOutline(outlineRaw);

    const sections = await this.expandSections(modeAwareInput, outline, contract);

    const flattenedBlocks = sections.flatMap((section) =>
      section.blocks.map((block) => ({ ...block, id: ensureThinkForgeBlockId(block.id) }))
    );
    const blocks = validateThinkForgeBlocks(flattenedBlocks);
    const content = renderPlainText(blocks);
    
    // Convert to Tiptap JSON AST
    const richText = thinkForgeBlocksToTiptapJSON(blocks);

    return {
      status: 'ok',
      title: outline.title,
      blocks,
      richText,
      content,
      draft: true,
      outline,
      sections,
    };
  }

  private async expandSections(input: AgentInput, outline: ScriptOutline, contract: NarrativeContract): Promise<SectionOutput[]> {
    const sections = outline.sections;
    const results: SectionOutput[] = [];
    const summariesById: Record<string, string> = {};
    const generationMode = (input as any).generationMode || 'manual';
    const isManual = generationMode === 'manual';

    for (let i = 0; i < sections.length; i += this.sectionConcurrency) {
      const batch = sections.slice(i, i + this.sectionConcurrency);
      const prior = sections
        .filter((s) => Object.prototype.hasOwnProperty.call(summariesById, s.id))
        .map((s) => ({ id: s.id, title: s.title, summary: summariesById[s.id], role: (s as any).role }));
      const siblingTitles = batch.map((b) => b.title).join(', ');

      const batchOutputs = await Promise.all(
        batch.map(async (section) => {
          const mode = (section as any).mode || '';
          const knowledgeLayer = (section as any).knowledge_layer || '';
          const useMythic = !isManual && (mode.includes('Mode A') || knowledgeLayer === 'Vision / Framing');
          const agent = useMythic ? this.sectionAgentHigh : this.sectionAgent;
          const rawSection = await agent.generateSection(
            {
              ...input,
              section,
              outlineTitle: outline.title,
              contract,
              priorSections: prior,
              siblingTitles,
            },
            {
              maxTokens: isManual ? 1600 : useMythic ? 900 : 1100,
              temperature: isManual ? 0.35 : useMythic ? 0.55 : 0.65,
            }
          );
          let blocks = rawSection.blocks;
          if (!isManual) {
            const limit = wordLimitForLayer(knowledgeLayer || (section as any).knowledge_layer);
            blocks = applyWordLimitToBlocks(blocks, limit);
          }

          const validatedBlocks = validateThinkForgeBlocks(blocks.map((block) => ({ ...block, id: ensureThinkForgeBlockId(block.id) })));
          const sectionOutput: SectionOutput = {
            sectionId: rawSection.sectionId,
            blocks: validatedBlocks,
            richText: thinkForgeBlocksToTiptapJSON(validatedBlocks),
          };
          const summary = section.goal || section.title;
          summariesById[section.id] = summary;
          return sectionOutput;
        })
      );

      results.push(...batchOutputs);
    }

    // Preserve original ordering by section id order
    const byId = new Map(results.map((r) => [r.sectionId, r] as const));
    return outline.sections
      .map((s) => byId.get(s.id))
      .filter((v): v is SectionOutput => Boolean(v));
  }
}

export function createScriptDraftAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScriptDraftAgent {
  return new ScriptDraftAgent(config);
}

// Backwards-compatible helper used by chat-service
export async function generateScriptDraft(
  instruction: string,
  sessionState: SessionState,
  existingScript?: { blocks?: ThinkForgeBlock[]; content?: string; title?: string } | null
): Promise<ScriptDraftResult> {
  const context = quickAssembleContext(
    'script_draft',
    sessionState.metadata,
    existingScript ? { title: existingScript.title, content: existingScript.content } : null,
    sessionState.chat
  );

  const agent = createScriptDraftAgent();
  return agent.generateScript({ context, userPrompt: instruction });
}

