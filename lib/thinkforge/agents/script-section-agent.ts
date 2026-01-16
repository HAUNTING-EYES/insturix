import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import type { NarrativeContract } from './script-contract-agent';
import { z } from 'zod';
import { ensureThinkForgeBlockId, normalizeThinkForgeRichText, validateThinkForgeBlocks } from '../schemas/thinkforge-block';
import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import { thinkForgeBlocksToTiptapJSON } from '../mappers/thinkforge-to-tiptap';
import type { TiptapJSON } from '../schemas/tiptap-schema';
import { cleanThinkForgeBlocks, cleanAndTransformText, cleanRichTextAST } from '../utils/content-cleaner';
import { DOCUMENT_AUTHORING_CONTRACT } from './document-authoring-contract';
import { validateDocumentContract, formatViolations } from '../validation/documentValidator';

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
  richText?: TiptapJSON; // Tiptap JSON AST
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
  // Allow Tiptap JSON format for direct output (optional, for future use)
  tiptapJSON: z.any().optional(),
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
  // Clean and transform text to remove artifacts and convert abstract to concrete
  let clean = cleanAndTransformText(text);
  clean = simplifySentence(clean).trim();
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
    ...(typeof metaRaw.level === 'number' ? { level: metaRaw.level } : {}), // Preserve heading level
  } : undefined;
  
  // Normalize and clean content to remove artifacts
  let content = normalizeThinkForgeRichText((raw as any).content ?? (raw as any).text);
  content = cleanRichTextAST(content);
  
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
    return `You are an experienced creative strategist writing a production guide for a creative team. Write clear, actionable creative direction that enables immediate execution—storyboarding, directing, filming, and editing.

${DOCUMENT_AUTHORING_CONTRACT}

## Creative Brief Context
Project: ${context.projectSummary || '(No project context)'}
Section: ${section.title}
Goal: ${section.goal}
Tone: ${contract.tone || section.tone || 'confident and grounded'}
Medium: ${contract.medium}

## Your Writing Style
Write like a creative director giving clear, confident guidance to a production team. Your output should:

1. **Be execution-focused**: Write what to DO, not what to "determine" or "define"
   ❌ "Determine interview question themes"
   ✅ "Ask questions that unlock lived experience, such as: 'What moment changed everything?' or 'When did you realize this was possible?'"

2. **Convert abstract steps into concrete direction**:
   ❌ "Define emotional arc"
   ✅ "Each video should follow this emotional arc: hook → vulnerability → resonance → quiet close"

3. **Remove all internal schema artifacts**:
   ❌ Never mention "type: text", "styles: bold", "meta instructions", or placeholders like "Input:", "Output:", "Constraint:"
   ✅ Write natural, flowing creative direction

4. **Sound confident and human**: Write as if you're an experienced creative strategist helping a real team execute production, not like system planning notes.

## Section Details
Title: ${section.title}
Primary actions: ${section.primary_actions || 'spell out concrete steps'}
Required inputs: ${section.required_inputs || 'list tangible inputs'}
Expected outputs: ${section.expected_outputs || 'name the deliverables'}
Risks/pitfalls: ${section.risks || 'highlight failure modes to avoid'}

## Prior sections (do NOT restate)
${prior}

## User Request
${userPrompt}

## Output Format (JSON only, no markdown fences)
Return ONLY valid JSON matching this structure:
{
  "sectionId": "${section.id}",
  "blocks": [
    {
      "id": "unique-id",
      "kind": "header" | "action" | "why" | "example" | "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Your clean, creative direction text here. No schema artifacts, no meta instructions, just clear creative guidance.",
          "styles": { "bold": true } // Only use for emphasis, never expose schema structure
        }
      ],
      "meta": {
        "level": 1 | 2 | 3,  // For headers: 1=title, 2=major section, 3=subsection
        "role": "optional",
        "goal": "optional"
      }
    }
  ]
}

## Critical Content Rules
- Write natural, flowing creative direction—no "type: text" or "styles: bold" visible in the text
- No placeholders like "Input:", "Output:", "Constraint:", "Define X", "Determine Y"
- Convert abstract steps into concrete execution guidance
- Use execution-style language: "Ask questions that...", "Structure each video like this...", "The emotional tone should feel..."
- Write as a creative strategist, not a planning system

## Output Quality
- Make it immediately usable for storyboarding, directing, filming, and editing
- Create a document people want to scroll, not escape from
- Sound confident, grounded, human, and execution-focused
- Enable creators to begin production without additional interpretation
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
      
      // Clean blocks to remove schema artifacts and transform abstract instructions
      const cleanedBlocks = cleanThinkForgeBlocks(safeBlocks);
      
      // Validate against DOCUMENT_AUTHORING_CONTRACT (dev-only)
      if (process.env.NODE_ENV === 'development') {
        const validation = validateDocumentContract(cleanedBlocks);
        if (!validation.valid) {
          console.warn(`⚠️ Document contract violated in script-section-agent (${sectionId}):\n${formatViolations(validation.violations)}`);
        }
      }
      
      // Convert to Tiptap JSON AST
      const richText = thinkForgeBlocksToTiptapJSON(cleanedBlocks);
      return { sectionId, blocks: cleanedBlocks, richText };
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
        
        // Clean blocks to remove schema artifacts and transform abstract instructions
        const cleanedBlocks = cleanThinkForgeBlocks(safeBlocks);
        
        // Validate against DOCUMENT_AUTHORING_CONTRACT (dev-only)
        if (process.env.NODE_ENV === 'development') {
          const validation = validateDocumentContract(cleanedBlocks);
          if (!validation.valid) {
            console.warn(`⚠️ Document contract violated in script-section-agent (${sectionId}):\n${formatViolations(validation.violations)}`);
          }
        }
        
        // Convert to Tiptap JSON AST
        const richText = thinkForgeBlocksToTiptapJSON(cleanedBlocks);
        return { sectionId, blocks: cleanedBlocks, richText };
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
