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
import { validateDocumentContract } from '../validation/documentValidator';

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
  styles: z.record(z.string(), z.boolean()).optional(),
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


function makeBlock(kind: ThinkForgeBlock['kind'], text: string, meta?: any): ThinkForgeBlock | null {
  // Clean and transform text to remove artifacts and convert abstract to concrete
  let clean = cleanAndTransformText(text);
  clean = clean.trim();
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
    return `You are a senior creative director writing for professional filmmakers. Your output must be immediately usable for production without interpretation. Write clear, actionable creative direction that enables immediate execution—storyboarding, directing, filming, and editing.

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

4. **Sound confident and human**: Write as if you're a senior creative director helping a real team execute production, not like system planning notes.

## Structural Planning (silent)
Before writing content, silently plan the structure:
- Decide the exact H2/H3 hierarchy
- Decide where callouts belong
- Decide which parts require lists
Then write the blocks following that plan.

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
        "level": 2 | 3,  // For headers: 2=major section, 3=subsection (H1 is injected by system)
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
- Write as a creative director, not a planning system
- Do NOT include an H1 header in your output; the system will provide the single H1
- Only use H2 and H3 headers for sub-sections
- Never repeat a header title within a section
- Keep each section between 8–18 blocks maximum
- Prefer precision over volume
- If tempted to repeat ideas, compress instead
- Do not restate concepts covered earlier
- Repetition is a failure. If you are about to repeat an idea, delete or merge instead. Each block must introduce new value.
- If you are uncertain about structure, simplify. Fewer blocks with clarity is always better than more blocks with noise.

## Pre-Return Validation (silent)
Before finalizing your output, silently validate your draft against DOCUMENT_AUTHORING_CONTRACT:
- Zero H1 headers exist in your output (H1 is injected by system)
- No heading is duplicated
- No empty headers
- Lists are used for sequences of 3+ items
- Every "Director’s Note" is formatted as a callout block (kind: "why")
- Horizontal dividers exist between major H2 sections

If any rule is violated, you must rewrite the output to fix it before returning.
Do not mention this validation step in your final answer.

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
      const shaped = Array.isArray((result as any)?.blocks)
        ? (result as any).blocks.map(toThinkForgeBlock).filter(Boolean) as ThinkForgeBlock[]
        : [];
      const blocks = validateThinkForgeBlocks([
        // Always lead with a header using the section title
        makeBlock('header', input.section.title, { role: input.section.role, goal: input.section.goal, level: 1 })!,
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
      const cleanedBlocks = cleanThinkForgeBlocks(safeBlocks as ThinkForgeBlock[]);
      
      // Validate against DOCUMENT_AUTHORING_CONTRACT (enforced in all environments)
      const validation = validateDocumentContract(cleanedBlocks);
      if (!validation.valid) {
        console.error(`[ThinkForge][script-section-agent] Document contract violated (${sectionId}):`, {
          sectionId,
          violations: validation.violations,
          blockCount: cleanedBlocks.length,
          timestamp: new Date().toISOString(),
        });
      }
      
      // Convert to Tiptap JSON AST
      const richText = thinkForgeBlocksToTiptapJSON(cleanedBlocks);
      return { sectionId, blocks: cleanedBlocks, richText };
    } catch (err) {
      try {
        const { result } = await attempt();
        const shaped = Array.isArray((result as any)?.blocks)
          ? (result as any).blocks.map(toThinkForgeBlock).filter(Boolean) as ThinkForgeBlock[]
          : [];
        const blocks = validateThinkForgeBlocks([
          makeBlock('header', input.section.title, { role: input.section.role, goal: input.section.goal, level: 1 })!,
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
        const cleanedBlocks = cleanThinkForgeBlocks(safeBlocks as ThinkForgeBlock[]);
        
        // Validate against DOCUMENT_AUTHORING_CONTRACT (enforced in all environments)
        const validation = validateDocumentContract(cleanedBlocks);
        if (!validation.valid) {
          console.error(`[ThinkForge][script-section-agent] Document contract violated (${sectionId}):`, {
            sectionId,
            violations: validation.violations,
            blockCount: cleanedBlocks.length,
            timestamp: new Date().toISOString(),
          });
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
