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

import { generateObject } from 'ai';
import { z } from 'zod';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput, AgentStructuredOutput } from './types';
import { formatContextString, quickAssembleContext } from '../context';
import type { SessionState } from '../state/types';
import type { BlockTree } from '../schemas/canonical';
import { validateBlockTree } from '../schemas/canonical';
import { updateScriptState } from '../state/session-state';
import { createThinkForgeModel } from './model-factory';

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

const InlineNodeSchema = z.object({
  type: z.enum(['text', 'em', 'strong', 'code']),
  text: z.string()
});

const BlockSchema: z.ZodType<any> = z.object({
  id: z.string(),
  type: z.enum(['heading', 'paragraph', 'bulletList', 'numberedList', 'listItem', 'code', 'quote', 'dialogue', 'divider']),
  props: z.record(z.string(), z.unknown()).optional(),
  children: z.array(z.union([InlineNodeSchema, z.lazy(() => BlockSchema as z.ZodType<any>)]))
});

const ScriptRefinedSchema = z.object({
  title: z.string(),
  blocks: z.array(BlockSchema),
  content: z.string()
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
      modelName: 'gemini-3-flash-preview',
      maxTokens: config?.maxTokens ?? 4500,
      temperature: config?.temperature ?? 0.65,
    });
  }
  
  buildPrompt({ context, userPrompt }: AgentInput): string {
    return `You are revising an existing operational manual ("script" is a legacy alias; keep manual tone only).

## Current Manual
${context.currentScript || '(No existing content)'}

## Requested Change
${userPrompt}

## Rules
- Preserve unrelated sections.
- Modify only what is necessary.
- Output the full revised manual.
- Tighten operational clarity; remove sentences that do not introduce a step, decision, constraint, input, output, or failure mode.
- Better align with the platform and format requirements without adding narrative framing.
- Do not shorten; maintain or expand length where clarity requires.
- No summarization; keep complete operational content.

${context.projectSummary ? `## Project Context\n${context.projectSummary}\n\n` : ''}Return the refined manual with:
- title: Improved operational title
- blocks: Refined blocks in canonical format (same structure as original)
- content: Refined plain text version

Maintain the same block structure but improve operational quality where requested.`;
  }
  
  /**
   * Run and return normalized blocks
   */
  async refineScript(
    input: AgentInput,
    originalBlocks?: BlockTree
  ): Promise<{
    title: string;
    blocks: BlockTree;
    content: string;
    draft: boolean;
  }> {
    const { result } = await this.runStructured(input);
    
    // Validate and ensure block IDs
    let blocks = result.blocks;
    
    // Preserve original block IDs where possible
    if (originalBlocks) {
      blocks = blocks.map((block, idx) => {
        const originalBlock = originalBlocks[idx];
        return {
          ...block,
          id: block.id || originalBlock?.id || `block_${Date.now()}_${idx}`
        };
      });
    }
    
    // Validate block tree
    try {
      blocks = validateBlockTree(blocks);
    } catch (error) {
      console.error('Block validation error in refinement, using as-is:', error);
    }
    
    return {
      title: result.title,
      blocks,
      content: result.content,
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
  draftBlocks: BlockTree,
  sessionState: SessionState
): Promise<void> {
  try {
    // Convert draft blocks to content string
    const draftContent = draftBlocks
      .map(block => extractTextFromBlock(block))
      .join('\n\n');
    
    // Convert to new context format
    const context = quickAssembleContext(
      'script_refinement',
      sessionState.metadata,
      { 
        title: sessionState.script?.title, 
        content: draftContent,
        version: sessionState.script?.version 
      },
      sessionState.chat
    );
    
    // Create input for new agent
    const input: AgentInput = {
      context,
      userPrompt: instruction,
    };
    
    // Run agent
    const agent = createScriptRefinementAgent();
    const result = await agent.refineScript(input, draftBlocks);
    
    // Update session state silently (replace draft)
    await updateScriptState(sessionId, userId, {
      title: result.title,
      blocks: result.blocks,
      content: result.content,
      draft: false,
      version: (sessionState.script?.version || 0) + 1
    });
    
    console.log(`Script refined for session ${sessionId}`);
  } catch (error) {
    console.error('Error refining script:', error);
    // Don't throw - refinement failures shouldn't break the system
    // The draft remains in place
  }
}

/**
 * Extract plain text from a block recursively
 */
function extractTextFromBlock(block: any): string {
  if (!block || !block.children) return '';
  
  return block.children
    .map((child: any) => {
      if (typeof child === 'string') return child;
      if (child.type === 'text' || child.text) return child.text || '';
      if (child.children) return extractTextFromBlock(child);
      return '';
    })
    .filter(Boolean)
    .join('');
}

