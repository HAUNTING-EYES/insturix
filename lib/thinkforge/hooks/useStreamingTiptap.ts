/**
 * Streaming Tiptap Renderer
 * 
 * Buffers tokens from AI generation and incrementally inserts structured content
 * into a Tiptap editor. Maintains formatting integrity by flushing at safe boundaries.
 */

import { useRef, useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import { normalizeThinkForgeRichText, ensureThinkForgeBlockId } from '../schemas/thinkforge-block';
import { blockToTiptapNodes } from '../mappers/thinkforge-to-tiptap';
import type { TiptapBlockContent } from '../schemas/tiptap-schema';

export interface StreamingTiptapOptions {
  editor: Editor | null;
  onError?: (error: Error) => void;
}

/**
 * Safe boundary patterns for flushing buffer
 */
const FLUSH_BOUNDARIES = {
  // Double newline (paragraph break)
  paragraph: /\n\n/,
  // List item markers
  bulletItem: /\n[•\-\*]\s+/,
  numberedItem: /\n\d+[\.\)]\s+/,
  // Heading markers (markdown-style)
  heading: /\n#{1,3}\s+/,
  // Horizontal rule
  horizontalRule: /\n---\n/,
  // Blockquote
  blockquote: /\n>\s+/,
};

/**
 * Detect if buffer contains a safe flush boundary
 */
function hasFlushBoundary(buffer: string): boolean {
  // Check for double newline (most common)
  if (FLUSH_BOUNDARIES.paragraph.test(buffer)) {
    return true;
  }
  
  // Check for list items
  if (FLUSH_BOUNDARIES.bulletItem.test(buffer) || FLUSH_BOUNDARIES.numberedItem.test(buffer)) {
    return true;
  }
  
  // Check for headings
  if (FLUSH_BOUNDARIES.heading.test(buffer)) {
    return true;
  }
  
  // Check for horizontal rule
  if (FLUSH_BOUNDARIES.horizontalRule.test(buffer)) {
    return true;
  }
  
  // Check for blockquote
  if (FLUSH_BOUNDARIES.blockquote.test(buffer)) {
    return true;
  }
  
  return false;
}

/**
 * Split buffer at the first safe boundary
 */
function splitAtBoundary(buffer: string): { flush: string; remaining: string } {
  // Find the earliest boundary
  let earliestIndex = buffer.length;
  let boundaryPattern: RegExp | null = null;
  
  for (const pattern of Object.values(FLUSH_BOUNDARIES)) {
    const match = buffer.match(pattern);
    if (match && match.index !== undefined && match.index < earliestIndex) {
      earliestIndex = match.index;
      boundaryPattern = pattern;
    }
  }
  
  if (boundaryPattern && earliestIndex < buffer.length) {
    // Find the end of the boundary (after the newline/pattern)
    const match = buffer.slice(earliestIndex).match(boundaryPattern);
    if (match) {
      const endIndex = earliestIndex + match.index! + match[0].length;
      return {
        flush: buffer.slice(0, endIndex),
        remaining: buffer.slice(endIndex),
      };
    }
  }
  
  // No boundary found - return empty flush, keep everything in buffer
  return { flush: '', remaining: buffer };
}

/**
 * Parse text into ThinkForgeBlocks
 * Handles markdown-style patterns and converts to blocks
 */
function parseTextToBlocks(text: string): ThinkForgeBlock[] {
  const blocks: ThinkForgeBlock[] = [];
  const lines = text.split('\n').filter(line => line.trim() || line === '---');
  
  let currentParagraph: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Heading detection (# Header)
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      // Flush current paragraph
      if (currentParagraph.length > 0) {
        blocks.push({
          id: ensureThinkForgeBlockId(),
          kind: 'paragraph',
          content: normalizeThinkForgeRichText([{ 
            type: 'text', 
            text: currentParagraph.join('\n'), 
            styles: {} 
          }]),
        });
        currentParagraph = [];
      }
      
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      blocks.push({
        id: ensureThinkForgeBlockId(),
        kind: 'header',
        content: normalizeThinkForgeRichText([{ type: 'text', text: content, styles: {} }]),
        meta: { level: level as 1 | 2 | 3 },
      });
      continue;
    }
    
    // Horizontal rule
    if (trimmed === '---' || trimmed === '—' || trimmed === '___') {
      // Flush current paragraph
      if (currentParagraph.length > 0) {
        blocks.push({
          id: ensureThinkForgeBlockId(),
          kind: 'paragraph',
          content: normalizeThinkForgeRichText([{ 
            type: 'text', 
            text: currentParagraph.join('\n'), 
            styles: {} 
          }]),
        });
        currentParagraph = [];
      }
      
      blocks.push({
        id: ensureThinkForgeBlockId(),
        kind: 'paragraph',
        content: normalizeThinkForgeRichText([{ type: 'text', text: '---', styles: {} }]),
      });
      continue;
    }
    
    // Blockquote
    if (trimmed.startsWith('> ')) {
      // Flush current paragraph
      if (currentParagraph.length > 0) {
        blocks.push({
          id: ensureThinkForgeBlockId(),
          kind: 'paragraph',
          content: normalizeThinkForgeRichText([{ 
            type: 'text', 
            text: currentParagraph.join('\n'), 
            styles: {} 
          }]),
        });
        currentParagraph = [];
      }
      
      const content = trimmed.slice(2);
      blocks.push({
        id: ensureThinkForgeBlockId(),
        kind: 'why',
        content: normalizeThinkForgeRichText([{ type: 'text', text: content, styles: {} }]),
      });
      continue;
    }
    
    // List item (bullet or numbered)
    if (trimmed.match(/^[•\-\*]\s+/) || trimmed.match(/^\d+[\.\)]\s+/)) {
      // Flush current paragraph
      if (currentParagraph.length > 0) {
        blocks.push({
          id: ensureThinkForgeBlockId(),
          kind: 'paragraph',
          content: normalizeThinkForgeRichText([{ 
            type: 'text', 
            text: currentParagraph.join('\n'), 
            styles: {} 
          }]),
        });
        currentParagraph = [];
      }
      
      // Add as action block (will be converted to list by mapper)
      blocks.push({
        id: ensureThinkForgeBlockId(),
        kind: 'action',
        content: normalizeThinkForgeRichText([{ type: 'text', text: trimmed, styles: {} }]),
      });
      continue;
    }
    
    // Regular paragraph line
    if (trimmed) {
      currentParagraph.push(trimmed);
    } else if (currentParagraph.length > 0) {
      // Empty line - flush paragraph
      blocks.push({
        id: ensureThinkForgeBlockId(),
        kind: 'paragraph',
        content: normalizeThinkForgeRichText([{ 
          type: 'text', 
          text: currentParagraph.join('\n'), 
          styles: {} 
        }]),
      });
      currentParagraph = [];
    }
  }
  
  // Flush remaining paragraph
  if (currentParagraph.length > 0) {
    blocks.push({
      id: ensureThinkForgeBlockId(),
      kind: 'paragraph',
      content: normalizeThinkForgeRichText([{ 
        type: 'text', 
        text: currentParagraph.join('\n'), 
        styles: {} 
      }]),
    });
  }
  
  return blocks;
}

/**
 * Insert Tiptap nodes incrementally into editor
 * Uses a transaction to avoid React flushSync issues
 */
function insertNodesIntoEditor(editor: Editor, nodes: TiptapBlockContent[]): void {
  if (!nodes.length) return;
  
  try {
    // Insert nodes at the end of the document
    const endPos = editor.state.doc.content.size;
    
    // Use a transaction to insert all nodes at once
    // This preserves cursor position and avoids full re-renders
    // The transaction API avoids React flushSync conflicts
    editor.chain()
      .setTextSelection(endPos)
      .insertContent(nodes)
      .run();
    
    // Scroll to bottom to follow new content (with slight delay for smooth UX)
    requestAnimationFrame(() => {
      try {
        editor.commands.scrollIntoView();
      } catch (e) {
        // Ignore scroll errors
      }
    });
  } catch (error) {
    console.error('Error inserting nodes into editor:', error);
    // Don't throw - allow streaming to continue
  }
}

/**
 * Hook for streaming content into Tiptap editor
 */
export function useStreamingTiptap(options: StreamingTiptapOptions) {
  const { editor, onError } = options;
  
  // Buffer for accumulating tokens
  const bufferRef = useRef<string>('');
  
  // Track if we're in streaming mode
  const isStreamingRef = useRef<boolean>(false);
  
  // Track last inserted position to avoid duplicates
  const lastInsertedRef = useRef<string>('');
  
  // CRITICAL: Track cancellation state to ignore stale tokens
  const isCancelledRef = useRef<boolean>(false);
  
  /**
   * Flush buffer to editor at safe boundaries
   * Deferred to avoid React flushSync errors
   */
  const flushBuffer = useCallback(() => {
    if (!editor || !bufferRef.current.trim()) return;
    
    // Defer editor updates to avoid React lifecycle conflicts
    requestAnimationFrame(() => {
      if (!editor || !bufferRef.current.trim()) return;
      
      try {
        // Split at boundary
        const { flush, remaining } = splitAtBoundary(bufferRef.current);
        
        if (!flush) {
          // No boundary found, keep buffering
          return;
        }
        
        // Parse flush chunk into ThinkForgeBlocks
        const blocks = parseTextToBlocks(flush);
        
        if (blocks.length > 0) {
          // Convert blocks to Tiptap nodes
          const nodes: TiptapBlockContent[] = [];
          for (const block of blocks) {
            const tiptapNodes = blockToTiptapNodes(block);
            nodes.push(...tiptapNodes);
          }
          
          // Insert into editor (this is now safely deferred)
          insertNodesIntoEditor(editor, nodes);
          
          // Update buffer
          bufferRef.current = remaining;
        } else {
          // No blocks parsed, just update buffer
          bufferRef.current = remaining;
        }
      } catch (error) {
        console.error('Error flushing buffer to Tiptap:', error);
        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
  }, [editor, onError]);
  
  /**
   * Add tokens to buffer and flush if safe boundary detected
   */
  const appendTokens = useCallback((tokens: string) => {
    // CRITICAL: Ignore tokens if cancelled
    if (isCancelledRef.current || !editor || !tokens) return;
    
    bufferRef.current += tokens;
    isStreamingRef.current = true;
    
    // Check if we should flush (flushBuffer handles deferral internally)
    if (hasFlushBoundary(bufferRef.current)) {
      flushBuffer();
    }
  }, [editor, flushBuffer]);
  
  /**
   * Force flush remaining buffer (called at end of stream)
   */
  const finalize = useCallback(() => {
    if (!editor) return;
    
    isStreamingRef.current = false;
    
    // Defer final flush to avoid React lifecycle conflicts
    requestAnimationFrame(() => {
      if (!editor) return;
      
      // Flush any remaining content
      if (bufferRef.current.trim()) {
        try {
          const blocks = parseTextToBlocks(bufferRef.current);
          if (blocks.length > 0) {
            const nodes: TiptapBlockContent[] = [];
            for (const block of blocks) {
              const tiptapNodes = blockToTiptapNodes(block);
              nodes.push(...tiptapNodes);
            }
            insertNodesIntoEditor(editor, nodes);
          }
          bufferRef.current = '';
        } catch (error) {
          console.error('Error finalizing stream:', error);
          if (onError) {
            onError(error instanceof Error ? error : new Error(String(error)));
          }
        }
      }
    });
  }, [editor, onError]);
  
  /**
   * Clear buffer and reset state
   */
  const reset = useCallback(() => {
    bufferRef.current = '';
    isStreamingRef.current = false;
    lastInsertedRef.current = '';
    isCancelledRef.current = false;
  }, []);
  
  /**
   * Cancel streaming - prevents further token processing
   */
  const cancel = useCallback(() => {
    isCancelledRef.current = true;
    bufferRef.current = '';
    isStreamingRef.current = false;
  }, []);
  
  return {
    appendTokens,
    flushBuffer,
    finalize,
    reset,
    cancel,
    isStreaming: () => isStreamingRef.current && !isCancelledRef.current,
  };
}
