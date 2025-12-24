/**
 * Script Refinement Agent - Refines draft scripts using Gemini Pro (background)
 * Runs asynchronously, updates state silently
 */

import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { SessionState } from '../state/types';
import type { BlockTree } from '../schemas/canonical';
import { validateBlockTree } from '../schemas/canonical';
import { updateScriptState } from '../state/session-state';

const InlineNodeSchema = z.object({
  type: z.enum(['text', 'em', 'strong', 'code']),
  text: z.string()
});

const BlockSchema = z.object({
  id: z.string(),
  type: z.enum(['heading', 'paragraph', 'bulletList', 'numberedList', 'listItem', 'code', 'quote', 'dialogue', 'divider']),
  props: z.record(z.unknown()).optional(),
  children: z.array(z.union([InlineNodeSchema, z.lazy(() => BlockSchema)]))
});

const ScriptRefinedSchema = z.object({
  title: z.string(),
  blocks: z.array(BlockSchema),
  content: z.string()
});

/**
 * Refine script draft using Gemini Pro
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
    const model = google('gemini-2.0-pro-exp');
    
    // Build full context
    const contextParts: string[] = [];
    
    // Project metadata
    if (sessionState.metadata) {
      const meta = sessionState.metadata;
      if (meta.idea) contextParts.push(`Idea: ${meta.idea}`);
      if (meta.purpose) contextParts.push(`Purpose: ${meta.purpose}`);
      if (meta.style) contextParts.push(`Style: ${meta.style}`);
      if (meta.format) contextParts.push(`Format: ${meta.format}`);
      if (meta.platform) contextParts.push(`Platform: ${meta.platform}`);
      if (meta.tone) contextParts.push(`Tone: ${meta.tone}`);
    }
    
    // Full chat history
    if (sessionState.chat.length > 0) {
      contextParts.push('\nFull conversation history:');
      for (const msg of sessionState.chat) {
        contextParts.push(`${msg.role}: ${msg.content.slice(0, 300)}`);
      }
    }
    
    // Draft script
    const draftContent = draftBlocks
      .map(block => extractTextFromBlock(block))
      .join('\n\n');
    
    contextParts.push(`\nDraft script:\n${draftContent.slice(0, 2000)}`);
    
    const context = contextParts.join('\n');
    
    const prompt = `Refine and improve this script draft based on the original instruction: "${instruction}"

${context ? `\nContext:\n${context}` : ''}

The draft script has been generated. Now refine it to:
- Improve tone and clarity
- Enhance engagement and flow
- Better align with the platform and format requirements
- Ensure consistency with the project context and conversation history

Return the refined script with:
- title: Improved title
- blocks: Refined blocks in canonical format (same structure as draft)
- content: Refined plain text version

Maintain the same block structure but improve the content quality.`;

    const result = await generateObject({
      model,
      schema: ScriptRefinedSchema,
      prompt,
      temperature: 0.6,
      maxTokens: 8000
    });
    
    // Validate and ensure block IDs
    let blocks = result.object.blocks;
    
    // Preserve original block IDs where possible
    blocks = blocks.map((block, idx) => {
      // Try to match with draft block by position
      const draftBlock = draftBlocks[idx];
      return {
        ...block,
        id: block.id || draftBlock?.id || `block_${Date.now()}_${idx}`
      };
    });
    
    // Validate block tree
    try {
      blocks = validateBlockTree(blocks);
    } catch (error) {
      console.error('Block validation error in refinement, using as-is:', error);
    }
    
    // Update session state silently (replace draft)
    await updateScriptState(sessionId, userId, {
      title: result.object.title,
      blocks,
      content: result.object.content,
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

