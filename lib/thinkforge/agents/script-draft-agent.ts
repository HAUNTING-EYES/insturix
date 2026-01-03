/**
 * Script Draft Orchestrator
 *
 * Multi-stage pipeline (Manual mode default):
 * 1) Outline (gemini-2.5-flash-lite) hierarchical with knowledge layers
 * 2) Section expansion: gemini-2.5-flash only (no preview)
 * 3) No full-document coherence rewrite; optional validator only
 * 4) Assembly into canonical blocks + content
 */

import type { AgentInput } from './types';
import { validateBlockTree } from '../schemas/canonical';
import type { BlockTree } from '../schemas/canonical';
import { ensureBlockId } from '../json';
import { ScriptOutlineAgent, type ScriptOutline } from './script-outline-agent';
import { ScriptSectionAgent, type SectionOutput } from './script-section-agent';
import { ScriptContractAgent, type NarrativeContract } from './script-contract-agent';
import { ScriptCoherenceAgent } from './script-coherence-agent';
import type { AgentConfig } from './base-agent';
import { quickAssembleContext } from '../context';
import type { SessionState } from '../state/types';

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

function truncateToWords(text: string, maxWords: number): { text: string; truncated: boolean } {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return { text, truncated: false };
  const trimmed = words.slice(0, maxWords).join(' ').trim();
  return { text: trimmed, truncated: true };
}

function dedupeParagraphs(text: string, seen: Set<string>): { text: string; trimmed: boolean } {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const kept: string[] = [];
  let trimmed = false;
  for (const para of paragraphs) {
    const key = para.toLowerCase();
    if (seen.has(key)) {
      trimmed = true;
      continue;
    }
    seen.add(key);
    kept.push(para);
  }
  return { text: kept.join('\n\n'), trimmed };
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
  blocks: BlockTree;
  content: string;
  draft: boolean;
  outline: ScriptOutline;
  sections: SectionOutput[];
}

export class ScriptDraftAgent {
  private outlineAgent: ScriptOutlineAgent;
  private sectionAgent: ScriptSectionAgent;
  private sectionAgentHigh: ScriptSectionAgent;
  private contractAgent: ScriptContractAgent;
  private coherenceAgent: ScriptCoherenceAgent;
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
    this.coherenceAgent = new ScriptCoherenceAgent({
      maxTokens: 900,
      temperature: 0.3,
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

    const assembled = this.assemble(outline, sections);

    // Coherence now runs as a validator-only pass; we skip rewrite to avoid latency and bloat.
    // The validator can be invoked separately if needed, but assembled content is used directly.
    const refined = this.assembleFromText(outline, assembled.content);

    return {
      title: outline.title,
      blocks: refined.blocks,
      content: refined.content,
      draft: true,
      outline,
      sections,
    };
  }

  private async expandSections(input: AgentInput, outline: ScriptOutline, contract: NarrativeContract): Promise<SectionOutput[]> {
    const sections = outline.sections;
    const results: SectionOutput[] = [];
    const summariesById: Record<string, string> = {};
    const seenParagraphs = new Set<string>();
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
          let prose = rawSection.prose;
          if (!isManual) {
            const limit = wordLimitForLayer(knowledgeLayer || (section as any).knowledge_layer);
            const { text: clipped, truncated } = truncateToWords(prose, limit);
            if (truncated) {
              console.warn(`[ThinkForge] Section ${section.id} truncated to ${limit} words for layer ${knowledgeLayer}`);
            }
            prose = clipped;
          }
          const { text: deduped, trimmed } = dedupeParagraphs(prose, seenParagraphs);
          if (trimmed && isManual) {
            console.warn(`[ThinkForge] Removed redundant paragraphs in ${section.id} (manual mode).`);
          }
          const sectionOutput: SectionOutput = {
            sectionId: rawSection.sectionId,
            prose: deduped,
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

  private assemble(outline: ScriptOutline, sections: SectionOutput[]): { blocks: BlockTree; content: string } {
    const blocks: any[] = [];
    const contentParts: string[] = [];

    for (const section of sections) {
      const outlineSection = outline.sections.find((s) => s.id === section.sectionId);
      const headingText = outlineSection?.title || section.sectionId;
      const level = outlineSection?.level === 'chapter' ? 2 : outlineSection?.level === 'section' ? 3 : 4;

      // Heading block
      blocks.push({
        id: ensureBlockId(null),
        type: 'heading',
        props: { level },
        children: [{ type: 'text', text: headingText }],
      });

      const paragraphs = section.prose.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      for (const para of paragraphs) {
        blocks.push({
          id: ensureBlockId(null),
          type: 'paragraph',
          children: [{ type: 'text', text: para }],
        });
      }

      const hashes = '#'.repeat(level);
      contentParts.push(`${hashes} ${headingText}\n\n${section.prose.trim()}`);
    }

    let validated = blocks;
    try {
      validated = validateBlockTree(blocks);
    } catch (err) {
      console.warn('Block validation warning (using assembled blocks):', err);
    }

    return {
      blocks: validated,
      content: contentParts.join('\n\n'),
    };
  }

  private assembleFromText(outline: ScriptOutline, content: string): { blocks: BlockTree; content: string } {
    const blocks: any[] = [];
    let currentHeading: string | null = null;
    let currentParas: string[] = [];

    const flush = () => {
      if (currentHeading) {
        blocks.push({
          id: ensureBlockId(null),
          type: 'heading',
          props: { level: 2 },
          children: [{ type: 'text', text: currentHeading }],
        });
      }
      for (const para of currentParas) {
        const clean = para.trim();
        if (!clean) continue;
        blocks.push({
          id: ensureBlockId(null),
          type: 'paragraph',
          children: [{ type: 'text', text: clean }],
        });
      }
      currentParas = [];
    };

    const lines = content.split(/\n/);
    for (const line of lines) {
      const headingMatch = /^#\s+(.+)/.exec(line.trim());
      if (headingMatch) {
        // Flush previous section
        flush();
        currentHeading = headingMatch[1].trim();
        currentParas = [];
        continue;
      }
      currentParas.push(line);
    }
    flush();

    let validated = blocks;
    try {
      validated = validateBlockTree(blocks);
    } catch (err) {
      console.warn('Block validation warning (coherence reassembly):', err);
    }

    return { blocks: validated, content: content.trim() };
  }

  private async runWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>
  ): Promise<void> {
    const queue = [...items];
    const runners: Promise<void>[] = [];

    const runNext = async (): Promise<void> => {
      const item = queue.shift();
      if (!item) return;
      await worker(item);
      await runNext();
    };

    for (let i = 0; i < Math.min(limit, items.length); i++) {
      runners.push(runNext());
    }

    await Promise.all(runners);
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
  existingScript?: { blocks?: BlockTree; content?: string; title?: string } | null
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

