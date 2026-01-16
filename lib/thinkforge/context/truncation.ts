/**
 * Truncation Utilities
 * 
 * Deterministic truncation for context management.
 * Never token-guess - same input → same context.
 * This is crucial for reproducibility.
 */

/**
 * Options for truncation
 */
export interface TruncationOptions {
  /** Maximum characters to keep */
  maxChars: number;
  /** Whether to preserve order (truncate from middle vs end) */
  preserveOrder?: boolean;
  /** Truncation indicator to append */
  indicator?: string;
  /** Whether to truncate at word boundaries */
  wordBoundary?: boolean;
}

/**
 * Content block with priority for selective truncation
 */
export interface PrioritizedContent {
  /** Content string */
  content: string;
  /** Priority 1-10 (higher = more important, less likely to truncate) */
  priority: number;
  /** Identifier for debugging */
  id?: string;
}

const DEFAULT_INDICATOR = '\n...[truncated]...';

/**
 * Truncate a string to max chars, respecting word boundaries
 */
export function truncateString(
  text: string,
  maxChars: number,
  options: Partial<TruncationOptions> = {}
): string {
  if (text.length <= maxChars) {
    return text;
  }
  
  const {
    indicator = DEFAULT_INDICATOR,
    wordBoundary = true,
  } = options;
  
  const targetLength = maxChars - indicator.length;
  
  if (targetLength <= 0) {
    return indicator.slice(0, maxChars);
  }
  
  let truncated = text.slice(0, targetLength);
  
  // If word boundary, find last space
  if (wordBoundary) {
    const lastSpace = truncated.lastIndexOf(' ');
    const lastNewline = truncated.lastIndexOf('\n');
    const breakPoint = Math.max(lastSpace, lastNewline);
    
    if (breakPoint > targetLength * 0.7) {
      truncated = truncated.slice(0, breakPoint);
    }
  }
  
  return truncated + indicator;
}

/**
 * Truncate from the middle, preserving start and end
 * Useful for scripts where intro and conclusion are important
 */
export function truncateMiddle(
  text: string,
  maxChars: number,
  options: Partial<TruncationOptions> = {}
): string {
  if (text.length <= maxChars) {
    return text;
  }
  
  const {
    indicator = '\n\n...[middle section omitted]...\n\n',
  } = options;
  
  const available = maxChars - indicator.length;
  if (available <= 0) {
    return indicator.slice(0, maxChars);
  }
  
  const halfLength = Math.floor(available / 2);
  const start = text.slice(0, halfLength);
  const end = text.slice(-halfLength);
  
  return start + indicator + end;
}

/**
 * Truncate an array of content blocks by priority
 * Higher priority content is preserved, lower priority is truncated first
 * Same input → same output (deterministic)
 */
export function truncateBlocks(
  blocks: PrioritizedContent[],
  options: TruncationOptions
): PrioritizedContent[] {
  const { maxChars, preserveOrder = true } = options;
  
  // Calculate total size
  const totalSize = blocks.reduce((sum, b) => sum + b.content.length, 0);
  
  if (totalSize <= maxChars) {
    return blocks;
  }
  
  // Sort by priority (ascending) for truncation - lowest first
  const sortedByPriority = [...blocks]
    .map((block, originalIndex) => ({ ...block, originalIndex }))
    .sort((a, b) => a.priority - b.priority);
  
  // Calculate how much we need to cut
  let currentSize = totalSize;
  const truncatedIndices = new Set<number>();
  const partialTruncations = new Map<number, number>(); // index -> max chars
  
  for (const block of sortedByPriority) {
    if (currentSize <= maxChars) break;
    
    const excess = currentSize - maxChars;
    
    if (block.content.length <= excess) {
      // Remove this block entirely
      truncatedIndices.add(block.originalIndex);
      currentSize -= block.content.length;
    } else {
      // Partially truncate this block
      const newLength = block.content.length - excess;
      partialTruncations.set(block.originalIndex, Math.max(100, newLength)); // Keep at least 100 chars
      currentSize -= excess;
    }
  }
  
  // Build result, preserving order if requested
  const result: PrioritizedContent[] = [];
  
  for (let i = 0; i < blocks.length; i++) {
    if (truncatedIndices.has(i)) {
      continue; // Skip entirely truncated blocks
    }
    
    const block = blocks[i];
    const partialMax = partialTruncations.get(i);
    
    if (partialMax !== undefined) {
      result.push({
        ...block,
        content: truncateString(block.content, partialMax, options),
      });
    } else {
      result.push(block);
    }
  }
  
  return preserveOrder ? result : result.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/**
 * Truncate chat messages, keeping most recent
 * Returns messages that fit within maxChars
 */
export function truncateMessages(
  messages: Array<{ role: string; content: string }>,
  maxChars: number,
  keepCount: number = 10
): Array<{ role: string; content: string }> {
  // Take last N messages
  const recent = messages.slice(-keepCount);
  
  let totalSize = recent.reduce((sum, m) => sum + m.content.length + 20, 0); // +20 for role prefix
  
  if (totalSize <= maxChars) {
    return recent;
  }
  
  // Truncate from oldest messages first
  const result: Array<{ role: string; content: string }> = [];
  let remaining = maxChars;
  
  // Process from newest to oldest, then reverse
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    const msgSize = msg.content.length + 20;
    
    if (remaining >= msgSize) {
      result.unshift(msg);
      remaining -= msgSize;
    } else if (remaining > 50) {
      // Partial message
      result.unshift({
        ...msg,
        content: truncateString(msg.content, remaining - 20),
      });
      break;
    }
  }
  
  return result;
}

/**
 * Estimate if content will fit within limit
 */
export function willFit(content: string, maxChars: number): boolean {
  return content.length <= maxChars;
}

/**
 * Calculate remaining capacity
 */
export function remainingCapacity(usedChars: number, maxChars: number): number {
  return Math.max(0, maxChars - usedChars);
}
