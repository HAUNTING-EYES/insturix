/**
 * Output Tags - Protocol-bound output markers
 * 
 * Agents produce output within defined tags.
 * Your parser relies on these. Never relax them.
 * 
 * AI output is untrusted input - always validate.
 */

/**
 * Tag definitions for agent outputs
 */
export const OUTPUT_TAGS = {
  /** Script update tag - full script content inside */
  SCRIPT_UPDATE: {
    open: '<script_update>',
    close: '</script_update>',
    name: 'script_update',
  },
  
  /** Thinking/reasoning tag - internal reasoning, may be stripped */
  THINKING: {
    open: '<thinking>',
    close: '</thinking>',
    name: 'thinking',
  },
  
  /** Metadata tag - optional metadata about the response */
  METADATA: {
    open: '<metadata>',
    close: '</metadata>',
    name: 'metadata',
  },
} as const;

export type OutputTagName = keyof typeof OUTPUT_TAGS;

/**
 * Check if content contains a specific tag
 */
export function hasTag(content: string, tagName: OutputTagName): boolean {
  const tag = OUTPUT_TAGS[tagName];
  return content.includes(tag.open) && content.includes(tag.close);
}

/**
 * Check if content contains script update tag
 */
export function hasScriptUpdate(content: string): boolean {
  return hasTag(content, 'SCRIPT_UPDATE');
}

/**
 * Extract content within a tag
 * Returns null if tag not found or malformed
 */
export function extractTagContent(
  content: string,
  tagName: OutputTagName
): string | null {
  const tag = OUTPUT_TAGS[tagName];
  const openIndex = content.indexOf(tag.open);
  const closeIndex = content.indexOf(tag.close);
  
  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
    return null;
  }
  
  return content.slice(openIndex + tag.open.length, closeIndex).trim();
}

/**
 * Extract script update content
 */
export function extractScriptUpdate(content: string): string | null {
  return extractTagContent(content, 'SCRIPT_UPDATE');
}

/**
 * Extract thinking/reasoning content
 */
export function extractThinking(content: string): string | null {
  return extractTagContent(content, 'THINKING');
}

/**
 * Remove all tags from content, returning clean text
 */
export function stripAllTags(content: string): string {
  let result = content;
  
  for (const tagName of Object.keys(OUTPUT_TAGS) as OutputTagName[]) {
    const tag = OUTPUT_TAGS[tagName];
    const pattern = new RegExp(
      `${escapeRegex(tag.open)}[\\s\\S]*?${escapeRegex(tag.close)}`,
      'g'
    );
    result = result.replace(pattern, '');
  }
  
  return result.trim();
}

/**
 * Remove thinking tags from content
 * Useful for displaying to users without internal reasoning
 */
export function stripThinking(content: string): string {
  const tag = OUTPUT_TAGS.THINKING;
  const pattern = new RegExp(
    `${escapeRegex(tag.open)}[\\s\\S]*?${escapeRegex(tag.close)}`,
    'g'
  );
  return content.replace(pattern, '').trim();
}

/**
 * Get all tag positions in content
 */
export function findTagPositions(
  content: string,
  tagName: OutputTagName
): { start: number; end: number; contentStart: number; contentEnd: number } | null {
  const tag = OUTPUT_TAGS[tagName];
  const start = content.indexOf(tag.open);
  const end = content.indexOf(tag.close);
  
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  
  return {
    start,
    end: end + tag.close.length,
    contentStart: start + tag.open.length,
    contentEnd: end,
  };
}

/**
 * Wrap content in a tag
 */
export function wrapInTag(content: string, tagName: OutputTagName): string {
  const tag = OUTPUT_TAGS[tagName];
  return `${tag.open}\n${content}\n${tag.close}`;
}

/**
 * Validate that script update tag contains non-empty content
 */
export function validateScriptUpdate(content: string): {
  valid: boolean;
  content: string | null;
  error?: string;
} {
  const extracted = extractScriptUpdate(content);
  
  if (extracted === null) {
    return {
      valid: false,
      content: null,
      error: 'No script_update tags found',
    };
  }
  
  if (extracted.length === 0) {
    return {
      valid: false,
      content: null,
      error: 'Empty script_update content',
    };
  }
  
  return {
    valid: true,
    content: extracted,
  };
}

/**
 * Helper to escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
