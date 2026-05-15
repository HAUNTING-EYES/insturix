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
import { cleanRichTextAST } from '../utils/content-cleaner';
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
  
  // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
  // Two branches (selection vs block edit) share a core via private method.
  private buildCoreRefinementBlock(document: string, change: string, isBlockEdit: boolean): string {
    return `<role>You are a professional revising a document. Write clear, actionable direction appropriate to the document type — not system planning notes.</role>

${DOCUMENT_AUTHORING_CONTRACT}

<task>Apply the requested change to the document below with minimal, precise edits.</task>

<rules>
RULE 1 — WRITING STYLE:
- Write as a senior professional giving clear, confident guidance.
- Execution-style language: concrete direction, specific examples, actionable steps.
- Remove all schema artifacts: no "type: text", "styles: bold", "meta instructions", or placeholders.
- Preserve voice and cadence. Do not simplify or shorten mechanically.

RULE 2 — REVISION:
- Focus on cohesion, rhythm, transitions, and tonal consistency.
- Make the smallest changes that deliver professional polish.
- Improve structure only when it clarifies flow.
- Preserve formatting: bold, italic, code, links.${isBlockEdit ? `
- Unchanged blocks: omit from patches.
- New blocks: use blockId "NEW_BLOCK" with kind and clean professional direction.` : ''}
</rules>

<output_format>
JSON only, no markdown:
{ "patches": [{ "blockId": string, "content"?: RichTextNode[], "text"?: string, "kind"?: "header"|"action"|"why"|"example"|"paragraph", "meta"?: {"role"?:string,"goal"?:string,"level"?:1|2|3} }], "title"?: string }
</output_format>

<input_data>
Document${isBlockEdit ? ' (blockId | kind)' : ''}:
${document}

Requested change:
${change}
</input_data>`;
  }

  buildPrompt({ context, userPrompt }: AgentInput): string {
    const isSelectionEdit = !userPrompt.includes('blockId') && !userPrompt.includes('blockIds');
    return this.buildCoreRefinementBlock(
      context.currentScript || '(none)',
      userPrompt,
      !isSelectionEdit,
    );
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
        if (text) {
          text = text.trim();
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
    
    // Validate against DOCUMENT_AUTHORING_CONTRACT (enforced in all environments)
    const validation = validateDocumentContract(patchedBlocks);
    if (!validation.valid) {
      console.error(`[ThinkForge][script-refinement-agent] Document contract violated:`, {
        violations: validation.violations,
        patchCount: filtered.length,
        blockCount: patchedBlocks.length,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Convert to Tiptap JSON AST
    const richText = thinkForgeBlocksToTiptapJSON(patchedBlocks);

    return {
      title: result.title || '',
      patches: filtered,
      blocks: patchedBlocks,
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

