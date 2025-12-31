/**
 * Script Draft Agent - Generates draft script immediately using Google Generative AI
 * Supports both Vertex AI (service account) and API key authentication
 * Target: <2s response time
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import type { SessionState, ProjectMeta } from '../state/types';
import type { BlockTree, Block, InlineNode } from '../schemas/canonical';
import { validateBlockTree } from '../schemas/canonical';
import { createThinkForgeModel } from './model-factory';

// Simplified schema that accepts what LLMs typically produce
// We'll normalize the output afterwards
const SimpleBlockSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  props: z.any().optional(),
  children: z.array(z.any()).optional(),
  text: z.string().optional(), // Some LLMs put text directly here
  content: z.string().optional(), // Or here
});

const ScriptDraftSchema = z.object({
  title: z.string(),
  blocks: z.array(SimpleBlockSchema),
  content: z.string()
});

// Valid inline node types (no id, no children)
const INLINE_TYPES = new Set(['text', 'em', 'strong', 'code']);

// Valid block types (have id and children)
const BLOCK_TYPES = new Set(['heading', 'paragraph', 'bulletList', 'numberedList', 'listItem', 'code', 'quote', 'dialogue', 'divider']);

/**
 * Normalize block children - convert strings to proper inline nodes
 * Inline nodes: {type: 'text'|'em'|'strong'|'code', text: string} - NO id or children
 * Blocks: {id: string, type: BlockType, children: array, props?: object}
 */
function normalizeChildren(children: any[]): any[] {
  if (!Array.isArray(children)) return [];
  
  return children.map((child, idx) => {
    // Handle string directly
    if (typeof child === 'string') {
      return { type: 'text', text: child };
    }
    
    // Handle non-objects
    if (typeof child !== 'object' || child === null) {
      return { type: 'text', text: String(child ?? '') };
    }
    
    // Check if it's an inline node type
    const childType = String(child.type || '').toLowerCase();
    const isInlineType = INLINE_TYPES.has(childType);
    
    if (isInlineType) {
      // It's an inline node - must have only type and text, NO id or children
      const text = child.text ?? child.content ?? '';
      return { type: childType as 'text' | 'em' | 'strong' | 'code', text: String(text) };
    }
    
    // Check if it looks like a nested block
    if (child.children || child.id || BLOCK_TYPES.has(childType)) {
      // It's a nested block - normalize it fully
      return normalizeBlock(child, idx);
    }
    
    // Object with text property but no type
    if (child.text !== undefined) {
      return { type: 'text', text: String(child.text) };
    }
    
    // Object with content property
    if (child.content !== undefined) {
      return { type: 'text', text: String(child.content) };
    }
    
    // Unknown object - convert to string
    return { type: 'text', text: JSON.stringify(child) };
  });
}

/**
 * Normalize props - ensure it's a valid object with only allowed keys
 */
function normalizeProps(props: any, blockType: string): Record<string, unknown> | undefined {
  // Only heading and code blocks should have props
  if (blockType === 'heading') {
    let level = 1;
    if (typeof props === 'object' && props !== null && !Array.isArray(props)) {
      level = typeof props.level === 'number' ? props.level : 1;
    } else if (typeof props === 'string') {
      const parsed = parseInt(props, 10);
      level = isNaN(parsed) ? 1 : parsed;
    } else if (typeof props === 'number') {
      level = props;
    }
    return { level: Math.min(6, Math.max(1, level)) };
  }
  
  if (blockType === 'code') {
    if (typeof props === 'object' && props !== null && !Array.isArray(props) && typeof props.language === 'string') {
      return { language: props.language };
    }
    return undefined; // code can have no props
  }
  
  // Other block types should NOT have props
  return undefined;
}

/**
 * Normalize a single block - ensures valid structure
 */
function normalizeBlock(block: any, index: number): any {
  const id = block.id && typeof block.id === 'string' 
    ? block.id 
    : `block_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`;
  
  // Map common type variations to valid BlockTypes
  let rawType = String(block.type || 'paragraph').toLowerCase();
  const typeMap: Record<string, string> = {
    'h1': 'heading',
    'h2': 'heading', 
    'h3': 'heading',
    'h4': 'heading',
    'h5': 'heading',
    'h6': 'heading',
    'header': 'heading',
    'title': 'heading',
    'p': 'paragraph',
    'text': 'paragraph',
    'body': 'paragraph',
    'ul': 'bulletList',
    'ol': 'numberedList',
    'li': 'listItem',
    'bullet': 'bulletList',
    'bulletlist': 'bulletList',
    'numbered': 'numberedList',
    'numberedlist': 'numberedList',
    'list': 'bulletList',
    'codeblock': 'code',
    'blockquote': 'quote',
    'blockCode': 'code',
  };
  const type = typeMap[rawType] || (BLOCK_TYPES.has(rawType) ? rawType : 'paragraph');
  
  // Handle children - might be in different places
  let children: any[] = [];
  if (Array.isArray(block.children) && block.children.length > 0) {
    children = normalizeChildren(block.children);
  } else if (block.text !== undefined && block.text !== null) {
    children = [{ type: 'text', text: String(block.text) }];
  } else if (block.content !== undefined && block.content !== null) {
    children = [{ type: 'text', text: String(block.content) }];
  }
  
  // Ensure there's at least an empty text node (except for dividers)
  if (children.length === 0 && type !== 'divider') {
    children = [{ type: 'text', text: '' }];
  }
  
  // Dividers should have empty children array
  if (type === 'divider') {
    children = [];
  }
  
  const props = normalizeProps(block.props, type);
  
  // Build the block object - only include props if defined
  const result: any = {
    id,
    type,
    children,
  };
  
  if (props !== undefined) {
    result.props = props;
  }
  
  return result;
}

/**
 * Generate script draft immediately
 */
export async function generateScriptDraft(
  instruction: string,
  sessionState: SessionState,
  existingScript?: { blocks?: BlockTree; content?: string; title?: string } | null
): Promise<{ title: string; blocks: BlockTree; content: string; draft: boolean }> {
  try {
    const model = createThinkForgeModel();
    
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
    
    // Normalize blocks to handle various LLM output formats
    let blocks = result.object.blocks.map((block: any, idx: number) => 
      normalizeBlock(block, idx)
    );
    
    // Validate block tree
    try {
      blocks = validateBlockTree(blocks);
    } catch (error) {
      console.error('Block validation warning (using normalized blocks):', error);
      // Continue with normalized blocks even if validation fails
    }
    
    return {
      title: result.object.title,
      blocks,
      content: result.object.content,
      draft: true
    };
  } catch (error: any) {
    console.error('Error generating script draft:', error);
    
    // If schema validation failed but we have partial data, try to recover
    if (error?.value?.title && error?.value?.content) {
      console.log('Attempting to recover from schema error with fallback blocks...');
      
      // Create simple paragraph blocks from the content
      const content = error.value.content;
      const paragraphs = content.split('\n').filter((p: string) => p.trim());
      
      const fallbackBlocks = paragraphs.map((text: string, idx: number) => {
        // Check if it looks like a heading
        const isHeading = /^[#]+\s/.test(text) || 
                          (idx === 0 && text.length < 100) ||
                          text.endsWith(':');
        
        const cleanText = text.replace(/^[#]+\s*/, '').trim();
        
        const block: any = {
          id: `fallback_${Date.now()}_${idx}`,
          type: isHeading ? 'heading' : 'paragraph',
          children: [{ type: 'text', text: cleanText }],
        };
        
        // Only add props for headings
        if (isHeading) {
          block.props = { level: idx === 0 ? 1 : 2 };
        }
        
        return block;
      });
      
      return {
        title: error.value.title,
        blocks: fallbackBlocks,
        content: error.value.content,
        draft: true
      };
    }
    
    throw error;
  }
}

