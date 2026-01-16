/**
 * Script Refinement Agent - Controlled revision of existing manuals ("script" = legacy alias)
 * 
 * Purpose: Revise existing operational manuals with controlled modifications
 * 
 * Output contract:
 * <script_update>
 * [full revised manual content]
 * </script_update>
 * 
 * Key rules:
 * - Preserve unrelated sections
 * - Modify only what is necessary
 * - Output full revised manual
 * - Use <script_update> tags only
 * - Diff-aware by instruction
 * 
 * The agent only knows: context in → reasoning → structured output
 */

import { z } from 'zod';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import { quickAssembleContext } from '../context';
import type { SessionState } from '../state/types';
import type { ThinkForgeBlock, RichTextAST, ThinkForgeBlockKind } from '../schemas/thinkforge-block';
import { applyThinkForgeBlockPatches, extractTextFromRichText, type ThinkForgeBlockPatch } from '../utils/thinkforge-block-patch';
import { ensureThinkForgeBlockId } from '../schemas/thinkforge-block';
import { updateScriptState } from '../state/session-state';
import { thinkForgeBlocksToTiptapJSON } from '../mappers/thinkforge-to-tiptap';
import type { TiptapJSON } from '../schemas/tiptap-schema';
import { cleanRichTextAST, cleanAndTransformText, cleanThinkForgeBlocks } from '../utils/content-cleaner';
import { DOCUMENT_AUTHORING_CONTRACT } from './document-authoring-contract';
import { validateDocumentContract, formatViolations } from '../validation/documentValidator';

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

const richTextNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    text: z.string().optional(),
    styles: z.record(z.boolean()).optional(),
    children: z.array(richTextNodeSchema).optional(),
  })
);

const blockPatchSchema = z.object({
  blockId: z.string(),
  content: z.array(richTextNodeSchema).optional(),
  text: z.string().optional(),
  kind: z.enum(['header', 'action', 'why', 'example', 'paragraph']).optional(),
  meta: z
    .object({
      role: z.string().optional(),
      goal: z.string().optional(),
    })
    .optional(),
});

const ScriptRefinedSchema = z.object({
  patches: z.array(blockPatchSchema),
  title: z.string().optional(),
});

type ScriptRefinedOutput = z.infer<typeof ScriptRefinedSchema>;

// =============================================================================
// NEW ARCHITECTURE - Clean, Pure Agent
// =============================================================================

/**
 * Script Refinement Agent - extends StructuredAgent for controlled revision
 * 
 * This agent is diff-aware by instruction, even if not block-aware yet.
 * It preserves unrelated sections and modifies only what is necessary.
 */
export class ScriptRefinementAgent extends StructuredAgent<ScriptRefinedOutput> {
  protected schema = ScriptRefinedSchema;
  
  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'script_refinement',
      modelName: 'gemini-2.5-flash',
      maxTokens: config?.maxTokens ?? 1800,
      temperature: config?.temperature ?? 0.4,
    });
  }
  
  buildPrompt({ context, userPrompt }: AgentInput): string {
    // Check if this is a selection-based edit (no blockIds in prompt)
    const isSelectionEdit = !userPrompt.includes('blockId') && !userPrompt.includes('blockIds');
    
    const basePrompt = 'You are a creative strategist revising production guidance. Write clear, actionable creative direction—not system planning notes.\n\n';
    
    const selectionEditPrompt = `Selected content to revise:
${context.currentScript || '(none)'}

Requested change:
${userPrompt}

${DOCUMENT_AUTHORING_CONTRACT}

## Your Writing Style
- Write as a creative director giving clear, confident guidance
- Use execution-style language: "Ask questions that...", "Structure each video like this...", "The emotional tone should feel..."
- Remove all internal schema artifacts: no "type: text", "styles: bold", "meta instructions", or placeholders like "Input:", "Output:", "Constraint:"
- Convert abstract steps into concrete execution guidance
- Write content that enables immediate storyboarding, directing, filming, and editing

## Revision Rules (Selection-Based Editing)
- Scope lock: edit ONLY the selected content provided above. Do not modify anything outside the selection.
- Structure improvements: You are allowed to improve structure if the selection violates DOCUMENT_AUTHORING_CONTRACT. You can fix paragraph length (split paragraphs exceeding 4 lines), list usage (convert 3+ items to lists), heading clarity (remove duplicates, ensure proper hierarchy), and add horizontal rules between major sections.
- Preserve formatting: maintain inline emphasis (bold, italic), code, links when present.
- Voice: confident, execution-focused. Avoid supervisory verbs ("ensure", "verify", "validate", "determine", "define").
- Respect scope boundaries: stay within the selected content, but improve structure to comply with DOCUMENT_AUTHORING_CONTRACT.

## Output Format (JSON only, no markdown)
{
  "patches": [
    { "blockId": string (use existing IDs from input or "NEW_BLOCK" for additions), "content"?: RichTextNode[], "text"?: string, "kind"?: "header"|"action"|"why"|"example"|"paragraph", "meta"?: {"role"?:string,"goal"?:string,"level"?:1|2|3} }
  ],
  "title"?: string
}`;

    const blockEditPrompt = `Blocks to revise (blockId | kind):
${context.currentScript || '(none)'}

Requested change:
${userPrompt}

${DOCUMENT_AUTHORING_CONTRACT}

## Your Writing Style
- Write as a creative director giving clear, confident guidance
- Use execution-style language: "Ask questions that...", "Structure each video like this...", "The emotional tone should feel..."
- Remove all internal schema artifacts: no "type: text", "styles: bold", "meta instructions", or placeholders like "Input:", "Output:", "Constraint:"
- Convert abstract steps into concrete execution guidance
- Write content that enables immediate storyboarding, directing, filming, and editing

## Revision Rules
- Scope lock: edit only the provided blockIds. Do not reorder unless blockId is NEW_BLOCK.
- Structure improvements: You are allowed to improve structure if the blocks violate DOCUMENT_AUTHORING_CONTRACT. You can fix paragraph length (split paragraphs exceeding 4 lines), list usage (convert 3+ items to lists), heading clarity (remove duplicates, ensure proper hierarchy), and add horizontal rules between major sections.
- Voice: confident, execution-focused. Avoid supervisory verbs ("ensure", "verify", "validate", "determine", "define").
- Preserve formatting: maintain inline emphasis/code when present.
- Examples: if unchanged, omit from patches.
- If adding, emit blockId: "NEW_BLOCK" with kind and clean creative direction (no schema artifacts).

## Output Format (JSON only, no markdown)
{
  "patches": [
    { "blockId": string, "content"?: RichTextNode[], "text"?: string, "kind"?: "header"|"action"|"why"|"example"|"paragraph", "meta"?: {"role"?:string,"goal"?:string,"level"?:1|2|3} }
  ],
  "title"?: string
}`;

    return basePrompt + (isSelectionEdit ? selectionEditPrompt : blockEditPrompt);
  }
  
  /**
   * Run and return normalized blocks
   */
  async refineScript(
    input: AgentInput,
    originalBlocks: ThinkForgeBlock[]
  ): Promise<{
    title: string;
    patches: ThinkForgeBlockPatch[];
    blocks: ThinkForgeBlock[];
    richText: TiptapJSON;
    draft: boolean;
  }> {
    const { result } = await this.runStructured(input);
    const patches = Array.isArray(result.patches) ? result.patches : [];
    const normalized: ThinkForgeBlockPatch[] = patches
      .map((p) => {
        const blockId = typeof p.blockId === 'string' ? p.blockId : ensureThinkForgeBlockId();
        let content = Array.isArray((p as any).content) ? ((p as any).content as RichTextAST) : undefined;
        // Clean content to remove artifacts
        if (content) {
          content = cleanRichTextAST(content);
        }
        let text = typeof (p as any).text === 'string' ? (p as any).text : undefined;
        // Clean and transform text
        if (text) {
          text = cleanAndTransformText(text);
        }
        const kind = (p as any).kind as ThinkForgeBlockKind | undefined;
        const meta = (p as any).meta as { role?: string; goal?: string } | undefined;
        return { blockId, content, text, kind, meta } satisfies ThinkForgeBlockPatch;
      })
      .filter((p) => {
        if (p.content && p.content.length) return true;
        if (p.text && p.text.trim().length) return true;
        return false;
      });

    // Validate that we only target known blocks or NEW_BLOCK
    const knownIds = new Set(originalBlocks.map((b) => b.id));
    const filtered = normalized.filter((p) => p.blockId === 'NEW_BLOCK' || knownIds.has(p.blockId));

    // Apply patches to get the updated blocks
    const patchedBlocks = applyThinkForgeBlockPatches(originalBlocks, filtered);
    
    // Clean blocks to remove any remaining artifacts
    const cleanedBlocks = cleanThinkForgeBlocks(patchedBlocks);
    
    // Validate against DOCUMENT_AUTHORING_CONTRACT (dev-only)
    if (process.env.NODE_ENV === 'development') {
      const validation = validateDocumentContract(cleanedBlocks);
      if (!validation.valid) {
        console.warn(`⚠️ Document contract violated in script-refinement-agent:\n${formatViolations(validation.violations)}`);
      }
    }
    
    // Convert to Tiptap JSON AST
    const richText = thinkForgeBlocksToTiptapJSON(cleanedBlocks);

    return {
      title: result.title || '',
      patches: filtered,
      blocks: cleanedBlocks,
      richText,
      draft: false,
    };
  }
}

/**
 * Factory function for creating ScriptRefinementAgent instances
 */
export function createScriptRefinementAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScriptRefinementAgent {
  return new ScriptRefinementAgent(config);
}

// =============================================================================
// LEGACY API - Backwards compatibility
// =============================================================================

/**
 * @deprecated Use ScriptRefinementAgent class instead
 * 
 * Legacy function - Refine script draft using Gemini Pro
 * This runs in background and updates state silently
 */
export async function refineScriptDraft(
  sessionId: string,
  userId: string,
  instruction: string,
  draftBlocks: ThinkForgeBlock[],
  sessionState: SessionState
): Promise<void> {
  try {
    const context = quickAssembleContext(
      'script_refinement',
      sessionState.metadata,
      { title: sessionState.script?.title, content: undefined, version: sessionState.script?.version },
      sessionState.chat
    );

    const agent = createScriptRefinementAgent();
    const result = await agent.refineScript({ context, userPrompt: instruction }, draftBlocks);

    const content = result.blocks.map((b) => extractTextFromRichText(b.content)).join('\n\n');

    await updateScriptState(sessionId, userId, {
      title: result.title,
      blocks: result.blocks,
      richText: result.richText as any, // Include Tiptap JSON AST
      content,
      draft: false,
      version: (sessionState.script?.version || 0) + 1,
    });

    console.log('Script refined for session ' + sessionId);
  } catch (error) {
    console.error('Error refining script:', error);
    // Don't throw - refinement failures shouldn't break the system
    // The draft remains in place
  }
}

