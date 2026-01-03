/**
 * Context Selectors
 * 
 * Logic for selecting relevant content from blocks and messages.
 * Uses heuristics to pick what's most relevant for each agent type.
 * 
 * Agents never build context - they consume pre-assembled context.
 * This module decides WHAT to include.
 */

import type { AgentType, ChatContextMessage, ProjectContextData, ScriptContextData } from '../agents/types';
import type { Block, BlockTree } from '../schemas/canonical';

/**
 * Selection result with metadata
 */
export interface SelectionResult {
  content: string;
  charCount: number;
  itemCount: number;
}

/**
 * Select relevant script content based on agent type
 * 
 * - chat: brief summary
 * - ideas: not used
 * - script_draft: full existing script if available
 * - script_refinement: full current script
 */
export function selectScriptContent(
  script: ScriptContextData | null | undefined,
  agentType: AgentType,
  maxChars: number = 3000
): SelectionResult {
  if (!script?.content) {
    return { content: '', charCount: 0, itemCount: 0 };
  }
  
  switch (agentType) {
    case 'chat':
      // For chat, just include a brief preview
      const preview = script.content.slice(0, Math.min(500, maxChars));
      return {
        content: preview,
        charCount: preview.length,
        itemCount: 1,
      };
      
    case 'ideas':
      // Ideas agent doesn't need script content
      return { content: '', charCount: 0, itemCount: 0 };
      
    case 'script_draft':
    case 'script_refinement':
      // Include full script up to maxChars
      const full = script.content.slice(0, maxChars);
      return {
        content: full,
        charCount: full.length,
        itemCount: 1,
      };
      
    default:
      return { content: '', charCount: 0, itemCount: 0 };
  }
}

/**
 * Select relevant chat messages based on agent type
 * 
 * - chat: last 5 messages for context
 * - ideas: not used
 * - script_draft: last 3 messages for context
 * - script_refinement: all messages (conversation history matters for refinement)
 */
export function selectChatMessages(
  messages: ChatContextMessage[],
  agentType: AgentType,
  maxChars: number = 2000
): SelectionResult {
  if (!messages || messages.length === 0) {
    return { content: '', charCount: 0, itemCount: 0 };
  }
  
  let selectedCount: number;
  
  switch (agentType) {
    case 'chat':
      selectedCount = 5;
      break;
    case 'script_draft':
      selectedCount = 3;
      break;
    case 'script_refinement':
      selectedCount = 10; // More context for refinement
      break;
    case 'ideas':
    default:
      selectedCount = 0;
      break;
  }
  
  if (selectedCount === 0) {
    return { content: '', charCount: 0, itemCount: 0 };
  }
  
  const selected = messages.slice(-selectedCount);
  
  // Format messages
  let formatted = '';
  let charCount = 0;
  let itemCount = 0;
  
  for (const msg of selected) {
    const line = `${msg.role}: ${msg.content}\n`;
    if (charCount + line.length > maxChars) {
      // Truncate remaining
      const remaining = maxChars - charCount;
      if (remaining > 20) {
        formatted += line.slice(0, remaining - 3) + '...\n';
        charCount += remaining;
        itemCount++;
      }
      break;
    }
    formatted += line;
    charCount += line.length;
    itemCount++;
  }
  
  return {
    content: formatted.trim(),
    charCount,
    itemCount,
  };
}

/**
 * Format project metadata into context string
 */
export function selectProjectSummary(
  project: ProjectContextData | null | undefined,
  agentType: AgentType
): SelectionResult {
  if (!project) {
    return { content: '', charCount: 0, itemCount: 0 };
  }
  
  const parts: string[] = [];
  
  if (project.projectName) parts.push(`Project: ${project.projectName}`);
  if (project.idea) parts.push(`Idea: ${project.idea}`);
  if (project.purpose) parts.push(`Purpose: ${project.purpose}`);
  if (project.style) parts.push(`Style: ${project.style}`);
  if (project.format) parts.push(`Format: ${project.format}`);
  if (project.platform) parts.push(`Platform: ${project.platform}`);
  if (project.tone) parts.push(`Tone: ${project.tone}`);
  
  const content = parts.join('\n');
  
  return {
    content,
    charCount: content.length,
    itemCount: parts.length,
  };
}

/**
 * Extract text content from a block tree
 */
export function extractTextFromBlocks(blocks: BlockTree): string {
  if (!blocks || !Array.isArray(blocks)) {
    return '';
  }
  
  return blocks.map(block => extractTextFromBlock(block)).join('\n\n');
}

/**
 * Extract text from a single block recursively
 */
function extractTextFromBlock(block: Block): string {
  if (!block || !block.children) {
    return '';
  }
  
  const texts: string[] = [];
  
  for (const child of block.children) {
    if ('text' in child && typeof child.text === 'string') {
      texts.push(child.text);
    } else if ('children' in child) {
      texts.push(extractTextFromBlock(child as Block));
    }
  }
  
  const text = texts.join('');
  
  // Add formatting based on block type
  switch (block.type) {
    case 'heading':
      const level = (block.props?.level as number) || 1;
      return '#'.repeat(level) + ' ' + text;
    case 'bulletList':
    case 'numberedList':
      return text; // Children are list items
    case 'listItem':
      return '• ' + text;
    case 'quote':
      return '> ' + text;
    case 'dialogue':
      return `"${text}"`;
    case 'divider':
      return '---';
    default:
      return text;
  }
}

/**
 * Select key blocks from script (headings + first paragraph of each section)
 * Useful for getting script structure without full content
 */
export function selectKeyBlocks(
  blocks: BlockTree,
  maxBlocks: number = 10
): Block[] {
  if (!blocks || !Array.isArray(blocks)) {
    return [];
  }
  
  const keyBlocks: Block[] = [];
  let lastWasHeading = false;
  
  for (const block of blocks) {
    if (keyBlocks.length >= maxBlocks) break;
    
    if (block.type === 'heading') {
      keyBlocks.push(block);
      lastWasHeading = true;
    } else if (lastWasHeading && block.type === 'paragraph') {
      // Include first paragraph after heading
      keyBlocks.push(block);
      lastWasHeading = false;
    }
  }
  
  return keyBlocks;
}
