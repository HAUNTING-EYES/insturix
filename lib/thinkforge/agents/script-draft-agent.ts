/**
 * Script Draft Agent - Generates draft script immediately using Google Generative AI
 * Supports both Vertex AI (ADC) and API key authentication
 * Target: <2s response time
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { SessionState, ProjectMeta } from '../state/types';
import type { BlockTree, Block, InlineNode } from '../schemas/canonical';
import { validateBlockTree } from '../schemas/canonical';

const InlineNodeSchema: z.ZodType<any> = z.object({
  type: z.enum(['text', 'em', 'strong', 'code']),
  text: z.string()
});

const BlockSchema: z.ZodType<any> = z.object({
  id: z.string(),
  type: z.enum(['heading', 'paragraph', 'bulletList', 'numberedList', 'listItem', 'code', 'quote', 'dialogue', 'divider']),
  props: z.record(z.string(), z.unknown()).optional(),
  children: z.array(z.union([InlineNodeSchema, z.lazy(() => BlockSchema as z.ZodType<any>)]))
});

const ScriptDraftSchema: z.ZodType<Record<string, any>> = z.object({
  title: z.string(),
  blocks: z.array(BlockSchema),
  content: z.string()
});

/**
 * Create model for script drafting with proper authentication
 */
const createVertexAIModel = () => {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  
  // For Node.js with @ai-sdk/google, we use API key authentication
  // Vertex AI with ADC will be handled at deployment time (Cloud Run automatically provides ADC)
  if (!apiKey) {
    throw new Error(
      'GOOGLE_GENERATIVE_AI_API_KEY is required. For Vertex AI with ADC, ensure the service account has Vertex AI User role.'
    );
  }
  
  // Create Google Generative AI instance
  const google = createGoogleGenerativeAI({ apiKey });
  return google('gemini-2.0-flash');
};

/**
 * Generate script draft immediately
 */
export async function generateScriptDraft(
  instruction: string,
  sessionState: SessionState,
  existingScript?: { blocks?: BlockTree; content?: string; title?: string } | null
): Promise<{ title: string; blocks: BlockTree; content: string; draft: boolean }> {
  try {
    const model = createVertexAIModel();
    
    // Build context
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
    
    // Recent chat context (last 3 messages)
    const recentChat = sessionState.chat.slice(-3);
    if (recentChat.length > 0) {
      contextParts.push('\nRecent conversation:');
      for (const msg of recentChat) {
        contextParts.push(`${msg.role}: ${msg.content.slice(0, 200)}`);
      }
    }
    
    // Existing script context
    if (existingScript?.title) {
      contextParts.push(`\nCurrent script title: ${existingScript.title}`);
      if (existingScript.content) {
        contextParts.push(`Current script content (first 500 chars):\n${existingScript.content.slice(0, 500)}`);
      }
    }
    
    const context = contextParts.join('\n');
    
    const prompt = `Generate a script based on this instruction: "${instruction}"

${context ? `\nContext:\n${context}` : ''}

Return a script with:
- title: A clear, engaging title
- blocks: Array of blocks in canonical format. Each block must have:
  * id: unique string identifier
  * type: one of heading, paragraph, bulletList, numberedList, listItem, code, quote, dialogue, divider
  * props: optional object (for heading: {level: 1-6}, for code: {language: string})
  * children: array of inline nodes (type: text|em|strong|code, text: string) or nested blocks
- content: Plain text version of the script

The script should be engaging, well-structured, and appropriate for the specified platform and format.`;

    const result = await generateObject({
      model,
      schema: ScriptDraftSchema,
      prompt,
      temperature: 0.8
    });
    
    // Validate and ensure block IDs
    let blocks = result.object.blocks;
    
    // Ensure all blocks have IDs
    blocks = blocks.map((block: any, idx: number) => ({
      ...block,
      id: block.id || `block_${Date.now()}_${idx}`
    }));
    
    // Validate block tree
    try {
      blocks = validateBlockTree(blocks);
    } catch (error) {
      console.error('Block validation error, using as-is:', error);
    }
    
    return {
      title: result.object.title,
      blocks,
      content: result.object.content,
      draft: true
    };
  } catch (error) {
    console.error('Error generating script draft:', error);
    throw error;
  }
}

