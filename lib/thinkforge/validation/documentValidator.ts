/**
 * Document Contract Validator
 * 
 * Validates ThinkForgeBlock[] against DOCUMENT_AUTHORING_CONTRACT rules.
 * This is a guardrail to prevent regressions and make violations observable.
 */

import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import { extractTextFromRichText } from '../utils/thinkforge-block-patch';

export interface ValidationResult {
  valid: boolean;
  violations: string[];
}

/**
 * Count lines in text (approximate - counts newlines + 1)
 * Also considers character length as a fallback (roughly 80 chars per line)
 */
function countLines(text: string): number {
  if (!text) return 0;
  const newlineCount = (text.match(/\n/g) || []).length;
  if (newlineCount > 0) {
    return newlineCount + 1;
  }
  // Fallback: estimate by character length (roughly 80 chars per line)
  return Math.ceil(text.length / 80);
}

/**
 * Check if text looks like a director's note
 */
function isDirectorNote(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.startsWith("director's note") ||
    lower.startsWith("directors note") ||
    lower.startsWith("creative rule") ||
    lower.startsWith("creative rule:") ||
    lower.startsWith("note:") ||
    lower.startsWith("note ") ||
    lower.includes("🎬") ||
    lower.includes("director's note")
  );
}

/**
 * Count items in a paragraph (looks for patterns like "1. item", "• item", "- item", "item, item, item")
 */
function countListItems(text: string): number {
  // Check for numbered list patterns
  const numberedMatches = text.match(/\d+[\.\)]\s+/g);
  if (numberedMatches && numberedMatches.length >= 3) {
    return numberedMatches.length;
  }
  
  // Check for bullet patterns
  const bulletMatches = text.match(/[•\-\*]\s+/g);
  if (bulletMatches && bulletMatches.length >= 3) {
    return bulletMatches.length;
  }
  
  // Check for comma-separated items (at least 3 items)
  const commaSeparated = text.split(',').filter(s => s.trim().length > 0);
  if (commaSeparated.length >= 3) {
    // Verify they're actual list items (not just commas in prose)
    const avgLength = commaSeparated.reduce((sum, item) => sum + item.trim().length, 0) / commaSeparated.length;
    if (avgLength < 50) { // Short items suggest a list
      return commaSeparated.length;
    }
  }
  
  return 0;
}

/**
 * Validate ThinkForgeBlock[] against DOCUMENT_AUTHORING_CONTRACT
 */
export function validateDocumentContract(blocks: ThinkForgeBlock[]): ValidationResult {
  const violations: string[] = [];
  
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { valid: true, violations: [] }; // Empty documents are valid
  }
  
  // 1. Exactly one H1 (meta.level === 1)
  const h1Blocks = blocks.filter(b => b.kind === 'header' && b.meta?.level === 1);
  if (h1Blocks.length === 0) {
    violations.push('No H1 header found (exactly one H1 required)');
  } else if (h1Blocks.length > 1) {
    violations.push(`Multiple H1 headers found (${h1Blocks.length} found, exactly one required)`);
  }
  
  // 2. No duplicated header text across H1/H2/H3
  const headerTexts = new Map<string, number[]>();
  blocks.forEach((block, index) => {
    if (block.kind === 'header') {
      const text = extractTextFromRichText(block.content).toLowerCase().trim();
      if (text) {
        if (!headerTexts.has(text)) {
          headerTexts.set(text, []);
        }
        headerTexts.get(text)!.push(index);
      }
    }
  });
  
  for (const [text, indices] of headerTexts.entries()) {
    if (indices.length > 1) {
      const level = blocks[indices[0]].meta?.level || 'unknown';
      violations.push(`Duplicate header text: "${text.substring(0, 50)}" (found ${indices.length} times, level ${level})`);
    }
  }
  
  // 3. No empty headers
  blocks.forEach((block, index) => {
    if (block.kind === 'header') {
      const text = extractTextFromRichText(block.content).trim();
      if (!text) {
        violations.push(`Empty header at index ${index}`);
      }
    }
  });
  
  // 4. No paragraph exceeding ~4 lines
  blocks.forEach((block, index) => {
    if (block.kind === 'paragraph') {
      const text = extractTextFromRichText(block.content);
      const lineCount = countLines(text);
      if (lineCount > 4) {
        violations.push(`Paragraph at index ${index} exceeds 4 lines (${lineCount} lines): "${text.substring(0, 100)}..."`);
      }
    }
  });
  
  // 5. If 3+ sibling items appear in a paragraph, recommend list usage
  blocks.forEach((block, index) => {
    if (block.kind === 'paragraph') {
      const text = extractTextFromRichText(block.content);
      const itemCount = countListItems(text);
      if (itemCount >= 3) {
        violations.push(`Paragraph at index ${index} contains ${itemCount} items that should be in a list: "${text.substring(0, 100)}..."`);
      }
    }
  });
  
  // 6. All director notes must be kind: "why"
  blocks.forEach((block, index) => {
    if (block.kind !== 'why') {
      const text = extractTextFromRichText(block.content);
      if (isDirectorNote(text)) {
        violations.push(`Director's note found in ${block.kind} block at index ${index} (should be kind: "why"): "${text.substring(0, 100)}..."`);
      }
    }
  });
  
  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Format violations for readable console output
 */
export function formatViolations(violations: string[]): string {
  if (violations.length === 0) {
    return 'No violations found.';
  }
  
  return violations.map((v, i) => `  ${i + 1}. ${v}`).join('\n');
}
