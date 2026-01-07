import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import type { NarrativeContract } from './script-contract-agent';
import { z } from 'zod';
import { ensureThinkForgeBlockId, normalizeThinkForgeRichText, validateThinkForgeBlocks } from '../schemas/thinkforge-block';
import type { ThinkForgeBlock } from '../schemas/thinkforge-block';

export interface SectionInput extends AgentInput {
  section: {
    id: string;
    title: string;
    goal: string;
    role?: string;
    knowledge_role?: 'Architect' | 'Operator' | 'Strategist' | 'Analyst';
    operational_goal?: 'Action' | 'Decision' | 'Constraint';
    level?: string;
    parent_id?: string | null;
    knowledge_layer?: string;
    mode?: string;
    primary_actions?: string;
    required_inputs?: string;
    expected_outputs?: string;
    risks?: string;
    audience_state_after?: string;
    intensity_level?: number;
    tone?: string | null;
    estimated_length?: string | null;
  };
  outlineTitle?: string | null;
  contract: NarrativeContract;
  priorSections?: Array<{ id: string; title: string; summary: string; role?: string }>;
  siblingTitles?: string;
}

export interface SectionOutput {
  sectionId: string;
  blocks: ThinkForgeBlock[];
  error?: string;
}

// Keep AST validation lightweight to avoid recursive schema issues with the AI SDK
const richTextNodeSchema: z.ZodType<any> = z.object({
  type: z.enum(['text', 'link']),
  text: z.string().optional(),
  styles: z.record(z.boolean()).optional(),
  href: z.string().optional(),
  content: z.array(z.any()).optional(),
});

// Minimal schema to keep AI SDK happy; deep validation happens post-run via ThinkForge validators
const sectionSchema = z.object({
  sectionId: z.string().min(1),
  blocks: z.array(z.any()).min(1),
});

const ALLOWED_KINDS = ['header', 'action', 'why', 'example', 'paragraph'] as const;

const phraseRewrites: Array<[RegExp, string]> = [
  [/validate cohesion/i, 'check that these elements support each other'],
  [/ensure alignment/i, 'keep the tone aligned and human'],
  [/ensure consistency/i, 'keep the tone consistent'],
  [/ensure clarity/i, 'keep it clear'],
  [/ensure/i, 'make sure'],
  [/validate/i, 'check'],
  [/cohesion/i, 'fit together'],
  [/leverage/i, 'use'],
  [/utilize/i, 'use'],
  [/framework/i, 'plan'],
];

function simplifySentence(text: string): string {
  let next = text;
  for (const [re, replacement] of phraseRewrites) {
    next = next.replace(re, replacement);
  }
  return next.trim();
}

function sentenceSplit(text: string): string[] {
  return text
    .split(/(?<=[\.\!\?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractTextFromContent(content: any): string {
  const nodes = normalizeThinkForgeRichText(content);
  return nodes
    .map((n) => {
      if (n.type === 'link') return n.content.map((c) => (c.text || '')).join(' ');
      return n.text || '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeBlock(kind: ThinkForgeBlock['kind'], text: string, meta?: any): ThinkForgeBlock | null {
  const clean = simplifySentence(text).trim();
  if (!clean) return null;
  return {
    id: ensureThinkForgeBlockId(),
    kind,
    content: normalizeThinkForgeRichText([{ type: 'text', text: clean, styles: {} }]),
    meta,
  };
}

function toThinkForgeBlock(raw: any): ThinkForgeBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = ALLOWED_KINDS.includes((raw as any).kind) ? (raw as any).kind : 'paragraph';
  const metaRaw = (raw as any).meta;
  const meta = metaRaw && typeof metaRaw === 'object' ? {
    ...(typeof metaRaw.role === 'string' ? { role: metaRaw.role } : {}),
    ...(typeof metaRaw.goal === 'string' ? { goal: metaRaw.goal } : {}),
  } : undefined;
  const content = normalizeThinkForgeRichText((raw as any).content ?? (raw as any).text);
  return {
    id: raw.id,
    kind: kind as ThinkForgeBlock['kind'],
    content,
    meta,
  };
}

function splitDenseBlocks(blocks: ThinkForgeBlock[]): ThinkForgeBlock[] {
  const output: ThinkForgeBlock[] = [];

  for (const block of blocks) {
    const text = extractTextFromContent(block.content);
    if (!text) continue;

    // Header stays single
    if (block.kind === 'header') {
      output.push(makeBlock('header', text, block.meta) as ThinkForgeBlock);
      continue;
    }

    // If very dense or has multiple commas, split into sentences and map to actions
    const sentences = sentenceSplit(text);
    const isDense = text.split(/\s+/).length > 25 || (text.match(/,/g) || []).length >= 2 || sentences.length > 1;

    if (isDense) {
      sentences.forEach((s, idx) => {
        if (!s) return;
        // If the sentence explains a reason, route to why; else action
        const lower = s.toLowerCase();
        const isWhy = /because|so that|so you can|so they can/.test(lower);
        const kind = isWhy ? 'why' : 'action';
        const made = makeBlock(kind, s, block.meta);
        if (made) output.push(made);
        // Add spacing by keeping them as separate blocks
      });
      continue;
    }

    // Not dense: keep kind if action/why/example/paragraph, but ensure one idea
    const kind = block.kind === 'why' ? 'why' : block.kind === 'example' ? 'example' : 'action';
    const made = makeBlock(kind, text, block.meta);
    if (made) output.push(made);
  }

  return output;
}

export class ScriptSectionAgent extends StructuredAgent<z.infer<typeof sectionSchema>> {
  protected schema = sectionSchema;
  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    const modelName = 'gemini-2.5-flash';
    super({
      ...config,
      agentType: 'script_section',
      modelName,
      maxTokens: config?.maxTokens ?? 1800,
      temperature: config?.temperature ?? 0.35,
    });
  }

  buildPrompt(input: AgentInput): string {
    const { context, userPrompt, section, outlineTitle, contract, priorSections, siblingTitles } = input as SectionInput;
    const prior = (priorSections || []).map((p) => `${p.id} ${p.title}: ${p.summary}`).join('\n') || 'None (this is first section)';
    const forbidden = contract.forbidden?.join(', ') || 'slides, screen references, camera directions, meta commentary';
    const generationMode = (input as any).generationMode || 'manual';
    const knowledgeRole = section.knowledge_role || 'Operator';
    const operationalGoal = section.operational_goal || 'Action';
    return `You write one section of a ThinkForge manual ("script" is a legacy alias) as a dense, instructional procedure (Generation mode: ${generationMode}). No narrative or inspirational prose.

  ## Operational Contract
Medium: ${contract.medium}
Narrator voice: ${contract.narrator_voice}
Tone: ${contract.tone}
Forbidden: ${forbidden}
Allowed metaphors: ${(contract.allowed_metaphors || []).join(', ') || 'keep minimal and consistent'}
Style notes: ${(contract.style_notes || []).join('; ')}
  Mode A usage: ${contract.mode_a_usage}
  Mode B usage: ${contract.mode_b_usage}
  Switching rules: ${contract.mode_switch_rules}

## Section
ID: ${section.id}
Title: ${section.title}
Role in arc: ${section.role || 'unspecified'}
Level: ${section.level || 'section'}
Parent: ${section.parent_id || 'none'}
  Knowledge layer: ${section.knowledge_layer || 'unspecified'}
  Mode: ${section.mode || 'Mode B: Builder Blueprint'}
Goal: ${section.goal}
Audience state after: ${section.audience_state_after || 'understood goal'}
Intensity level (1-5, do NOT exceed): ${section.intensity_level ?? 3}
Tone: ${section.tone || 'match contract tone'}
Estimated length: ${section.estimated_length || 'medium'}
  Primary actions (what the creator does): ${section.primary_actions || 'spell out concrete steps'}
  Required inputs (data/APIs/assets): ${section.required_inputs || 'list tangible inputs'}
  Expected outputs (artifacts/results): ${section.expected_outputs || 'name the deliverables'}
  Risks/pitfalls: ${section.risks || 'highlight failure modes to avoid'}
Batch siblings (titles only, avoid overlap): ${siblingTitles || 'none'}

Knowledge Role (governs tone/perspective): ${knowledgeRole}
Operational Goal (must be Action | Decision | Constraint): ${operationalGoal}

## Prior sections (do NOT restate)
${prior}

## Project Context
${context.projectSummary || '(No project context)'}

## User Request
${userPrompt}

## Output format (strict JSON, no prose, no prefixes, no markdown)
Return ONLY valid JSON matching this TypeScript type (do not wrap in fences):
{
  "sectionId": string; // must equal the provided section.id
  "blocks": Array<{
    "id": string;              // stable unique id
    "kind": "header" | "action" | "why" | "example" | "paragraph";
    "content": Array<{         // rich-text AST nodes (must be FLAT array)
      "type": "text";          // always "text" for plain text nodes
      "text": string;
      "styles"?: { "bold"?: boolean; "italic"?: boolean; "code"?: boolean };
    }>;
    "meta"?: { "role"?: string; "goal"?: string; };
  }>;
}

Rules for content:
- Use ONLY type: "text" for nodes in the content array. BlockNote does not support nested children or "paragraph" types inside content.
- No label prefixes in text (no "Action:", "Why:", "Example:").
- Inline formatting is allowed via the "styles" object (bold, italic, code), do not use markdown syntax in the text string itself.
- Include one header block for the section title with meta.role/meta.goal when useful.
- Provide 4–7 action blocks; pair actions with why/example blocks only when they add clarity.
- Do not emit any string outside the JSON object. No markdown fences.
`;
  }

  async generateSection(input: SectionInput, overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>): Promise<SectionOutput> {
    const attempt = async () => this.runStructured(input, overrides);
    try {
      const { result } = await attempt();
      const rawBlocks = Array.isArray((result as any)?.blocks)
        ? (result as any).blocks.map(toThinkForgeBlock).filter(Boolean) as ThinkForgeBlock[]
        : [];
      const shaped = splitDenseBlocks(rawBlocks);
      const blocks = validateThinkForgeBlocks([
        // Always lead with a header using the section title
        makeBlock('header', input.section.title, { role: input.section.role, goal: input.section.goal })!,
        ...shaped,
      ]);
      const sectionId = (result as any)?.sectionId || input.section.id;
      const safeBlocks = blocks.length > 0 ? blocks : [
        {
          id: ensureThinkForgeBlockId(),
          kind: 'paragraph',
          content: [
            { type: 'text', text: `${input.section.title}: ${input.section.goal}`, styles: {} },
          ],
          meta: { role: input.section.role, goal: input.section.goal },
        },
      ];
      return { sectionId, blocks: safeBlocks };
    } catch (err) {
      try {
        const { result } = await attempt();
        const rawBlocks = Array.isArray((result as any)?.blocks)
          ? (result as any).blocks.map(toThinkForgeBlock).filter(Boolean) as ThinkForgeBlock[]
          : [];
        const shaped = splitDenseBlocks(rawBlocks);
        const blocks = validateThinkForgeBlocks([
          makeBlock('header', input.section.title, { role: input.section.role, goal: input.section.goal })!,
          ...shaped,
        ]);
        const sectionId = (result as any)?.sectionId || input.section.id;
        const safeBlocks = blocks.length > 0 ? blocks : [
          {
            id: ensureThinkForgeBlockId(),
            kind: 'paragraph',
            content: [
              { type: 'text', text: `${input.section.title}: ${input.section.goal}`, styles: {} },
            ],
            meta: { role: input.section.role, goal: input.section.goal },
          },
        ];
        return { sectionId, blocks: safeBlocks };
      } catch (err2) {
        console.error('ScriptSectionAgent: structured generation failed', err2);
        return { sectionId: input.section.id, blocks: [], error: 'structured_generation_failed' };
      }
    }
  }
}

export function createScriptSectionAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScriptSectionAgent {
  return new ScriptSectionAgent(config);
}
