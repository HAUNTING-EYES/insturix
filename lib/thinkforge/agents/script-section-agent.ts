import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import type { NarrativeContract } from './script-contract-agent';
import { z } from 'zod';
import { ensureThinkForgeBlockId, normalizeThinkForgeRichText, validateThinkForgeBlocks } from '../schemas/thinkforge-block';
import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import { thinkForgeBlocksToTiptapJSON } from '../mappers/thinkforge-to-tiptap';
import type { TiptapJSON } from '../schemas/tiptap-schema';
import { cleanThinkForgeBlocks, cleanAndTransformText, cleanRichTextAST } from '../utils/content-cleaner';

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

4. **Use strong visual hierarchy** with proper formatting:
   - **Title/Document Identity**: Use heading level 1 (kind: "header" with level 1)
   - **Major Sections**: Use heading level 2 (kind: "header" with level 2) for sections like "Creative Vision", "Core Message", "Emotional Structure"
   - **Subsections**: Use heading level 3 (kind: "header" with level 3) for subsections like "Opening Hook (0–3s)", "Emotional Peak (18–26s)"
   - **Body Paragraphs**: Use kind: "paragraph" - keep them SHORT (2-4 lines max). Whitespace is design.
   - **Bullet Lists**: Use kind: "action" with bullet list formatting for execution clarity (e.g., "Aim for diversity across: Age, Accent, Energy")
   - **Numbered Lists**: Use kind: "action" with ordered list formatting for sequences (e.g., "Each Reel should flow like this: 1. Human hook, 2. Personal truth...")
   - **Callout Boxes**: Use kind: "why" or blockquote for critical insights, director's notes, creative rules
   - **Visual Dividers**: Use horizontalRule between major sections for breathing room

5. **Document Rhythm**: Create scannable, storyboard-ready structure:
   - Big cinematic title (h1)
   - Section headers (h2) 
   - Short readable paragraphs
   - Callout boxes for key insights
   - Bullet clarity for execution
   - Visual separation between beats
   - Occasional dividers for breathing room

6. **Sound confident and human**: Write as if you're an experienced creative strategist helping a real team execute production, not like system planning notes.

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

## Visual Hierarchy Requirements (CRITICAL)
Your output MUST follow this structure for professional, scannable documents:

1. **Title/Document Identity** (if first section):
   - Use kind: "header" with meta: { level: 1 }
   - Example: "Voices for Peace" or "${section.title}"
   - Creates big cinematic title

2. **Major Section Headers**:
   - Use kind: "header" with meta: { level: 2 }
   - Examples: "Creative Vision", "Core Message", "Emotional Structure", "Visual Direction", "Editing Guidelines"
   - These create scannability and document rhythm

3. **Subsection Headers** (within sections):
   - Use kind: "header" with meta: { level: 3 }
   - Examples: "Opening Hook (0–3s)", "Emotional Peak (18–26s)"
   - Use for breaking down sections into actionable beats

4. **Body Paragraphs** (most common):
   - Use kind: "paragraph" for regular body text
   - Keep SHORT (2-4 lines max). Whitespace is design.
   - Example: "This campaign is not about slogans.\n\nIt is about real voices carrying quiet power."
   - Use for: narrative guidance, creative clarity, practical execution advice

5. **Bullet Lists** (for execution clarity):
   - Use kind: "action" with text formatted as bullet points (• or -)
   - Format: "Aim for diversity across:\n• Age\n• Accent\n• Energy\n• Life experience"
   - The system will automatically convert this to proper list structure
   - Use for: execution checklists, options, features

6. **Numbered Lists** (for sequences):
   - Use kind: "action" with text formatted as numbered sequence
   - Format: "Each Reel should flow like this:\n1. Human hook\n2. Personal truth\n3. Emotional peak\n4. Quiet close"
   - The system will automatically convert this to proper list structure
   - Use for: step-by-step sequences, storyboard structure, workflows

7. **Callout Boxes** (critical for premium feel):
   - Use kind: "why" for director's notes, creative rules, critical insights
   - Example: "🎬 Director's Note\nLet silence breathe. Do not cut every pause."
   - Or: "Creative Rule:\nIf it feels staged, it fails."
   - This is where the document feels expensive and professional

8. **Visual Dividers** (for rhythm):
   - Use kind: "paragraph" with text: "---" between major sections
   - Creates breathing space between sections
   - Example: After "Creative Vision" section, add a divider before "Core Message"
   - The system will automatically convert "---" to horizontal rule

## Critical Content Rules
- Write natural, flowing creative direction—no "type: text" or "styles: bold" visible in the text
- No placeholders like "Input:", "Output:", "Constraint:", "Define X", "Determine Y"
- Convert abstract steps into concrete execution guidance
- Use execution-style language: "Ask questions that...", "Structure each video like this...", "The emotional tone should feel..."
- Write as a creative strategist, not a planning system

## Formatting Requirements
- **Use proper visual hierarchy**: 
  - meta.level: 1 for document title
  - meta.level: 2 for major sections (Creative Vision, Core Message, etc.)
  - meta.level: 3 for subsections (Opening Hook, Emotional Peak, etc.)
- **Keep paragraphs short** (2-4 lines max) - whitespace is design. Use kind: "paragraph" for body text.
- **Use lists** for execution clarity:
  - Format bullets as "• Item" or "- Item" on separate lines
  - Format numbers as "1. Item" or "1) Item" on separate lines
  - System will auto-convert to proper list structure
- **Use callout boxes** (kind: "why") for director's notes, creative rules, critical insights
- **Use dividers** (text: "---") between major sections for visual breathing room
- **Create document rhythm**: Title → Section headers → Short paragraphs → Callouts → Lists → Dividers

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
