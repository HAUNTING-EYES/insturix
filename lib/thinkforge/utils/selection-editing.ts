/**
 * Selection-Aware Editing Utilities
 * 
 * Provides functions for extracting Tiptap selections, converting to ThinkForgeBlocks,
 * and applying AI edits back to the exact selection range while preserving formatting.
 */

import type { Editor } from '@tiptap/core';
import type { TiptapJSON, TiptapBlockContent } from '../schemas/tiptap-schema';
import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import { tiptapJSONToThinkForgeBlocks } from '../mappers/tiptap-to-thinkforge';
import { blockToTiptapNodes } from '../mappers/thinkforge-to-tiptap';
import { validateThinkForgeBlocks } from '../schemas/thinkforge-block';

/**
 * Extract selected content from Tiptap editor as ThinkForgeBlocks
 * Returns the blocks that intersect with the selection
 */
export function getSelectedBlocks(editor: Editor): {
  blocks: ThinkForgeBlock[];
  blockIds: string[];
  from: number;
  to: number;
  isEmpty: boolean;
} {
  if (!editor) {
    return { blocks: [], blockIds: [], from: 0, to: 0, isEmpty: true };
  }

  const { from, to } = editor.state.selection;
  const isEmpty = from === to;

  if (isEmpty) {
    // No selection - return empty
    return { blocks: [], blockIds: [], from, to, isEmpty: true };
  }

  const $from = editor.state.selection.$from;
  const $to = editor.state.selection.$to;
  const doc = editor.state.doc;

  // Find all top-level block nodes that intersect with the selection
  const selectedNodes: TiptapBlockContent[] = [];
  const selectedBlockIds: string[] = [];
  
  // Walk through the document's top-level content
  // In ProseMirror, doc.content is a Fragment containing top-level blocks
  let currentPos = 1; // Position after doc opening (doc node is at 0)
  doc.content.forEach((node) => {
    const nodeStart = currentPos;
    const nodeEnd = currentPos + node.nodeSize - 1;
    
    // Check if this top-level block intersects with selection
    if (nodeStart < to && nodeEnd > from && node.isBlock) {
      // Get the full node JSON
      const nodeJSON = node.toJSON();
      selectedNodes.push(nodeJSON as TiptapBlockContent);
      const nodeId = (node.attrs && (node.attrs as any).id) ? String((node.attrs as any).id) : null;
      if (nodeId) selectedBlockIds.push(nodeId);
    }
    
    // Move to next node position
    currentPos += node.nodeSize;
  });

  // If no top-level blocks found, get the containing block
  if (selectedNodes.length === 0) {
    // Find the deepest block ancestor
    let blockNode = null;
    
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.isBlock) {
        blockNode = node;
        break;
      }
    }
    
    if (blockNode) {
      const nodeJSON = blockNode.toJSON();
      selectedNodes.push(nodeJSON as TiptapBlockContent);
      const nodeId = (blockNode.attrs && (blockNode.attrs as any).id) ? String((blockNode.attrs as any).id) : null;
      if (nodeId) selectedBlockIds.push(nodeId);
    }
  }

  // Convert selected Tiptap nodes to ThinkForgeBlocks
  const blocks: ThinkForgeBlock[] = [];
  for (const node of selectedNodes) {
    // Create a minimal Tiptap document with just this node
    const tempDoc: TiptapJSON = {
      type: 'doc',
      content: [node],
    };
    
    const convertedBlocks = tiptapJSONToThinkForgeBlocks(tempDoc);
    blocks.push(...convertedBlocks);
  }

  return {
    blocks: validateThinkForgeBlocks(blocks),
    blockIds: selectedBlockIds.filter(Boolean),
    from,
    to,
    isEmpty: false,
  };
}

/**
 * Get the selection range, expanding to include full top-level blocks
 * This ensures we edit complete blocks, not partial content
 */
export function getSelectionRange(editor: Editor): { from: number; to: number } | null {
  if (!editor) return null;

  const { from, to } = editor.state.selection;
  
  if (from === to) {
    // No selection - return null
    return null;
  }

  const $from = editor.state.selection.$from;
  const $to = editor.state.selection.$to;
  const doc = editor.state.doc;

  // Find the first and last top-level blocks that intersect with selection
  let blockStart = from;
  let blockEnd = to;

  // Find start of first top-level block
  let currentPos = 1; // Start after doc node
  doc.content.forEach((node) => {
    const nodeStart = currentPos;
    const nodeEnd = currentPos + node.nodeSize - 1;
    
    if (nodeStart <= from && nodeEnd >= from && node.isBlock) {
      blockStart = nodeStart;
    }
    
    currentPos += node.nodeSize;
  });

  // Find end of last top-level block
  currentPos = 1;
  doc.content.forEach((node) => {
    const nodeStart = currentPos;
    const nodeEnd = currentPos + node.nodeSize - 1;
    
    if (nodeStart <= to && nodeEnd >= to && node.isBlock) {
      blockEnd = nodeEnd;
    }
    
    currentPos += node.nodeSize;
  });

  // Fallback: use depth-based approach if top-level iteration didn't work
  if (blockStart === from || blockEnd === to) {
    // Find the block start using depth
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.isBlock && d === 1) { // Top-level block
        blockStart = $from.start(d);
        break;
      }
    }

    // Find the block end using depth
    for (let d = $to.depth; d > 0; d--) {
      const node = $to.node(d);
      if (node.isBlock && d === 1) { // Top-level block
        blockEnd = $to.end(d);
        break;
      }
    }
  }

  return { from: blockStart, to: blockEnd };
}

/**
 * Apply AI-edited blocks back to the selection range
 * Replaces only the selected content, preserving everything else
 */
export function applyAIEditToSelection(
  editor: Editor,
  editedBlocks: ThinkForgeBlock[],
  originalRange: { from: number; to: number }
): boolean {
  if (!editor || editedBlocks.length === 0) {
    return false;
  }

  try {
    // Convert edited blocks to Tiptap nodes
    const tiptapNodes: TiptapBlockContent[] = [];
    for (const block of editedBlocks) {
      const nodes = blockToTiptapNodes(block);
      tiptapNodes.push(...nodes);
    }

    if (tiptapNodes.length === 0) {
      return false;
    }

    // Use a single transaction to replace the selection
    // This ensures atomic operation and preserves document integrity
    editor.chain()
      .focus()
      .setTextSelection(originalRange)
      .deleteSelection()
      .insertContent(tiptapNodes)
      .run();

    return true;
  } catch (error) {
    console.error('Error applying AI edit to selection:', error);
    return false;
  }
}

/**
 * Serialize selection to ThinkForgeBlocks for AI processing
 * This is used when sending selection to AI for editing
 */
export function serializeSelectionToThinkForgeBlocks(editor: Editor): {
  blocks: ThinkForgeBlock[];
  blockIds: string[];
  range: { from: number; to: number } | null;
  isEmpty: boolean;
} {
  const range = getSelectionRange(editor);
  
  if (!range) {
    return { blocks: [], blockIds: [], range: null, isEmpty: true };
  }

  const { blocks, blockIds, from, to, isEmpty } = getSelectedBlocks(editor);
  
  return {
    blocks,
    blockIds,
    range: { from, to },
    isEmpty,
  };
}

/**
 * Check if selection is valid for editing
 * Returns true if selection can be safely edited
 */
export function isSelectionEditable(editor: Editor): boolean {
  if (!editor) return false;

  const { from, to } = editor.state.selection;
  
  // Must have a selection
  if (from === to) return false;

  // Selection must be within document bounds
  const docSize = editor.state.doc.content.size;
  if (from < 0 || to > docSize || from >= to) return false;

  return true;
}
