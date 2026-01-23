/**
 * Document Contract Validator
 * 
 * Emits soft diagnostics about structure and voice quality.
 * This validator is telemetry-only and never blocks output.
 */

import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import { extractTextFromRichText } from '../utils/thinkforge-block-patch';

export interface ValidationResult {
  valid: boolean;
  violations: string[];
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

function detectWeakVoice(text: string): string[] {
  const signals: string[] = [];
  const lower = text.toLowerCase();
  const genericPhrases = [
    'in this section',
    'this section will',
    'it is important to',
    'make sure to',
    'ensure that',
    'you should',
    'we will',
    'the goal is to',
  ];
  const genericHits = genericPhrases.filter((p) => lower.includes(p));
  if (genericHits.length >= 2) {
    signals.push('Weak voice: generic phrasing detected');
  }

  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const starts = sentences.map((s) => s.split(/\s+/)[0]?.toLowerCase() || '').filter(Boolean);
  const startCounts = starts.reduce<Record<string, number>>((acc, s) => {
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  if (Object.values(startCounts).some((n) => n >= 4)) {
    signals.push('Repetitive phrasing: repeated sentence starts');
  }

  if (sentences.length >= 4) {
    const avgLen = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    if (avgLen < 60) {
      signals.push('Flat tone risk: short, uniform sentences');
    }
  }

  return signals;
}

/**
 * Validate ThinkForgeBlock[] against DOCUMENT_AUTHORING_CONTRACT (telemetry only)
 */
export function validateDocumentContract(blocks: ThinkForgeBlock[]): ValidationResult {
  const violations: string[] = [];
  
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { valid: true, violations: [] }; // Empty documents are valid
  }
  
  // Structure diagnostics
  const h1Blocks = blocks.filter(b => b.kind === 'header' && b.meta?.level === 1);
  if (h1Blocks.length === 0) {
    violations.push('Structure: missing H1 header');
  } else if (h1Blocks.length > 1) {
    violations.push(`Structure: multiple H1 headers (${h1Blocks.length})`);
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
      violations.push(`Structure: duplicate header "${text.substring(0, 50)}" (count ${indices.length}, level ${level})`);
    }
  }
  
  // 3. No empty headers
  blocks.forEach((block, index) => {
    if (block.kind === 'header') {
      const text = extractTextFromRichText(block.content).trim();
      if (!text) {
        violations.push(`Structure: empty header at index ${index}`);
      }
    }
  });
  
  
  // List formatting suggestion
  blocks.forEach((block, index) => {
    if (block.kind === 'paragraph') {
      const text = extractTextFromRichText(block.content);
      const itemCount = countListItems(text);
      if (itemCount >= 3) {
        violations.push(`Structure: list opportunity at paragraph ${index} (${itemCount} items)`);
      }
    }
  });
  
  // Director note placement suggestion
  blocks.forEach((block, index) => {
    if (block.kind !== 'why') {
      const text = extractTextFromRichText(block.content);
      if (isDirectorNote(text)) {
        violations.push(`Structure: director note should be kind "why" (index ${index})`);
      }
    }
  });

  // Voice diagnostics (soft signals)
  const fullText = blocks.map((b) => extractTextFromRichText(b.content)).join('\n');
  violations.push(...detectWeakVoice(fullText));
  
  return {
    valid: true,
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
