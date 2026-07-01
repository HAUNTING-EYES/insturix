/**
 * Tiptap JSON Validation Utilities
 * 
 * Strict validation for Tiptap JSON AST - no sanitization, no fallbacks.
 * Invalid JSON must be rejected with clear error messages.
 */

import { z } from 'zod';
import {
  TiptapJSONSchema,
  TiptapJSON,
  TiptapDoc,
  TiptapBlockContent,
  TiptapTextNode,
  createEmptyDoc,
} from './tiptap-schema';

// =============================================================================
// VALIDATION ERRORS
// =============================================================================

export class TiptapValidationError extends Error {
  public readonly path: string[];
  public readonly issues: z.ZodIssue[];

  constructor(message: string, issues: z.ZodIssue[]) {
    super(message);
    this.name = 'TiptapValidationError';
    this.issues = issues;
    this.path = issues.map(i => i.path.join('.')).filter(Boolean);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      path: this.path,
      issues: this.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    };
  }
}

// =============================================================================
// STRICT VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate Tiptap JSON AST strictly - no sanitization, no fallbacks.
 * Throws TiptapValidationError if validation fails.
 * 
 * @param json - The JSON to validate
 * @returns Valid TiptapJSON
 * @throws TiptapValidationError if validation fails
 */
export function validateTiptapJSON(json: unknown): TiptapJSON {
  const result = TiptapJSONSchema.safeParse(json);
  
  if (!result.success) {
    const errorMessages = result.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new TiptapValidationError(
      `Invalid Tiptap JSON: ${errorMessages}`,
      result.error.issues
    );
  }
  
  return result.data;
}

/**
 * Validate Tiptap JSON and return result without throwing.
 * Useful for conditional validation checks.
 * 
 * @param json - The JSON to validate
 * @returns Validation result with success flag and data or error
 */
export function safeParseTiptapJSON(json: unknown): {
  success: true;
  data: TiptapJSON;
} | {
  success: false;
  error: TiptapValidationError;
} {
  try {
    const data = validateTiptapJSON(json);
    return { success: true, data };
  } catch (error) {
    if (error instanceof TiptapValidationError) {
      return { success: false, error };
    }
    return {
      success: false,
      error: new TiptapValidationError(
        `Unexpected validation error: ${error instanceof Error ? error.message : String(error)}`,
        []
      ),
    };
  }
}

/**
 * Check if a value is valid Tiptap JSON without throwing.
 * 
 * @param json - The JSON to check
 * @returns True if valid, false otherwise
 */
export function isTiptapJSON(json: unknown): json is TiptapJSON {
  return TiptapJSONSchema.safeParse(json).success;
}

// =============================================================================
// AI OUTPUT VALIDATION
// =============================================================================

/**
 * Validate AI-generated Tiptap JSON strictly.
 * This function is specifically for AI output validation and provides
 * detailed error messages suitable for logging and debugging.
 * 
 * IMPORTANT: This function does NOT sanitize or fix invalid output.
 * Invalid output is rejected with a clear error.
 * 
 * @param json - The AI-generated JSON to validate
 * @param context - Optional context for error messages (e.g., agent name)
 * @returns Valid TiptapJSON
 * @throws TiptapValidationError if validation fails
 */
export function validateAIGeneratedTiptapJSON(
  json: unknown,
  context?: string
): TiptapJSON {
  // First check if it's even an object
  if (json === null || json === undefined) {
    throw new TiptapValidationError(
      `${context ? `[${context}] ` : ''}AI output is null or undefined`,
      [{ code: 'custom', path: [], message: 'Expected object, received null/undefined' }]
    );
  }

  if (typeof json !== 'object') {
    throw new TiptapValidationError(
      `${context ? `[${context}] ` : ''}AI output is not an object (received ${typeof json})`,
      [{ code: 'custom', path: [], message: `Expected object, received ${typeof json}` }]
    );
  }

  // Check for doc type
  const obj = json as Record<string, unknown>;
  if (obj.type !== 'doc') {
    throw new TiptapValidationError(
      `${context ? `[${context}] ` : ''}AI output root must be type "doc" (received "${obj.type}")`,
      [{ code: 'custom', path: ['type'], message: `Expected "doc", received "${obj.type}"` }]
    );
  }

  // Full validation
  try {
    return validateTiptapJSON(json);
  } catch (error) {
    if (error instanceof TiptapValidationError) {
      // Re-throw with context
      throw new TiptapValidationError(
        `${context ? `[${context}] ` : ''}${error.message}`,
        error.issues
      );
    }
    throw error;
  }
}

// =============================================================================
// CONTENT EXTRACTION
// =============================================================================

/**
 * Extract plain text from Tiptap JSON content.
 * Useful for displaying summaries or non-rich-text contexts.
 * 
 * @param doc - The Tiptap document
 * @returns Plain text content
 */
export function extractPlainText(doc: TiptapJSON): string {
  const parts: string[] = [];

  function extractFromNodes(nodes: TiptapBlockContent[] | TiptapTextNode[] | undefined): void {
    if (!nodes) return;

    for (const node of nodes) {
      if (node.type === 'text') {
        parts.push((node as TiptapTextNode).text);
      } else if ('content' in node && Array.isArray(node.content)) {
        extractFromNodes(node.content as TiptapBlockContent[] | TiptapTextNode[]);
      }
      
      // Add line break after block-level elements
      if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'listItem') {
        parts.push('\n');
      }
    }
  }

  extractFromNodes(doc.content);

  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Count words in Tiptap JSON content.
 * 
 * @param doc - The Tiptap document
 * @returns Word count
 */
export function countWords(doc: TiptapJSON): number {
  const text = extractPlainText(doc);
  return text.split(/\s+/).filter(Boolean).length;
}

// =============================================================================
// DOCUMENT UTILITIES
// =============================================================================

/**
 * Check if a Tiptap document is empty (no content or only empty paragraphs).
 * 
 * @param doc - The Tiptap document
 * @returns True if empty
 */
export function isEmptyDoc(doc: TiptapJSON): boolean {
  if (!doc.content || doc.content.length === 0) {
    return true;
  }

  // Check if all content is empty paragraphs
  return doc.content.every(node => {
    if (node.type === 'paragraph') {
      return !node.content || node.content.length === 0;
    }
    return false;
  });
}

/**
 * Ensure a value is a valid Tiptap document, returning empty doc if null/undefined.
 * Does NOT sanitize invalid documents - throws on invalid input.
 * 
 * @param json - The value to ensure
 * @returns Valid TiptapJSON
 * @throws TiptapValidationError if json is invalid (but not null/undefined)
 */
export function ensureTiptapDoc(json: unknown): TiptapJSON {
  if (json === null || json === undefined) {
    return createEmptyDoc();
  }
  return validateTiptapJSON(json);
}

// =============================================================================
// NODE TRAVERSAL
// =============================================================================

/**
 * Callback for traversing Tiptap nodes
 */
export type NodeVisitor = (
  node: TiptapBlockContent | TiptapTextNode,
  parent: TiptapBlockContent | TiptapDoc | null,
  index: number
) => void | boolean; // return false to stop traversal

/**
 * Traverse all nodes in a Tiptap document.
 * 
 * @param doc - The Tiptap document
 * @param visitor - Callback for each node
 */
export function traverseNodes(doc: TiptapJSON, visitor: NodeVisitor): void {
  function traverse(
    nodes: (TiptapBlockContent | TiptapTextNode)[] | undefined,
    parent: TiptapBlockContent | TiptapDoc | null
  ): boolean {
    if (!nodes) return true;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const result = visitor(node, parent, i);
      if (result === false) return false;

      if ('content' in node && Array.isArray(node.content)) {
        const shouldContinue = traverse(
          node.content as (TiptapBlockContent | TiptapTextNode)[],
          node as TiptapBlockContent
        );
        if (!shouldContinue) return false;
      }
    }

    return true;
  }

  traverse(doc.content, doc);
}

/**
 * Find all nodes of a specific type in a Tiptap document.
 * 
 * @param doc - The Tiptap document
 * @param type - The node type to find
 * @returns Array of matching nodes
 */
export function findNodesByType<T extends TiptapBlockContent>(
  doc: TiptapJSON,
  type: T['type']
): T[] {
  const results: T[] = [];
  
  traverseNodes(doc, (node) => {
    if (node.type === type) {
      results.push(node as T);
    }
  });

  return results;
}

/**
 * Get all block IDs in a Tiptap document.
 * 
 * @param doc - The Tiptap document
 * @returns Array of block IDs
 */
export function getBlockIds(doc: TiptapJSON): string[] {
  const ids: string[] = [];

  traverseNodes(doc, (node) => {
    if (!node || typeof node !== 'object' || !('attrs' in node)) {
      return;
    }

    const attrs = node.attrs;
    if (attrs && typeof attrs === 'object' && !Array.isArray(attrs) && 'id' in attrs && attrs.id) {
      ids.push(String(attrs.id));
    }
  });

  return ids;
}
