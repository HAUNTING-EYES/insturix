/**
 * Content Cleaner Utility
 * 
 * Removes internal schema artifacts and meta-instructions from generated content
 * to ensure clean, creator-friendly output.
 */

import type { ThinkForgeBlock, RichTextAST } from '../schemas/thinkforge-block';

/**
 * Patterns that indicate internal schema artifacts or meta-instructions
 */
const ARTIFACT_PATTERNS = [
  // Schema structure artifacts
  /\btype:\s*["']?text["']?/gi,
  /\bstyles:\s*\{[^}]*bold[^}]*\}/gi,
  /\bstyles:\s*\{[^}]*italic[^}]*\}/gi,
  /\bmeta:\s*\{[^}]*\}/gi,
  /\b"type":\s*"text"/gi,
  /\b"styles":\s*\{[^}]*\}/gi,
  /\b"meta":\s*\{[^}]*\}/gi,
  
  // Meta-instruction placeholders
  /\b(?:Input|Output|Constraint|Define|Determine|Select|Validate|Ensure):\s*/gi,
  /\b(?:Input:|Output:|Constraint:)\s*/gi,
  
  // Abstract instruction patterns
  /\bDefine\s+(?:emotional\s+)?arc\b/gi,
  /\bDetermine\s+interview\s+question\s+themes\b/gi,
  /\bSelect\s+emotional\s+tone\b/gi,
  /\bDefine\s+narrative\s+arc\b/gi,
  
  // System scaffolding
  /\b(?:system|meta|internal|scaffold|structure|schema)\s+(?:instruction|note|comment|artifact)\b/gi,
];

/**
 * Clean text content by removing artifacts
 */
export function cleanTextContent(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  let cleaned = text;
  
  // Remove artifact patterns
  for (const pattern of ARTIFACT_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove common placeholder patterns
  cleaned = cleaned
    .replace(/\b(?:Input|Output|Constraint):\s*/gi, '')
    .replace(/\b(?:Define|Determine|Select|Validate|Ensure)\s+(?:the|a|an)\s+/gi, '')
    .trim();
  
  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Clean a RichTextAST node by removing artifacts from text
 */
export function cleanRichTextAST(ast: RichTextAST): RichTextAST {
  if (!Array.isArray(ast)) return ast;
  
  return ast.map(node => {
    if (node.type === 'text' && node.text) {
      return {
        ...node,
        text: cleanTextContent(node.text),
      };
    }
    
    if (node.type === 'link' && node.content) {
      return {
        ...node,
        content: cleanRichTextAST(node.content),
      };
    }
    
    return node;
  }).filter(node => {
    // Remove empty text nodes
    if (node.type === 'text' && (!node.text || node.text.trim().length === 0)) {
      return false;
    }
    return true;
  });
}

/**
 * Clean ThinkForgeBlock content
 */
export function cleanThinkForgeBlock(block: ThinkForgeBlock): ThinkForgeBlock {
  return {
    ...block,
    content: cleanRichTextAST(block.content),
    // Remove meta if it contains only system artifacts
    meta: block.meta && Object.keys(block.meta).length > 0 
      ? block.meta 
      : undefined,
  };
}

/**
 * Clean an array of ThinkForgeBlocks
 */
export function cleanThinkForgeBlocks(blocks: ThinkForgeBlock[]): ThinkForgeBlock[] {
  return blocks.map(cleanThinkForgeBlock).filter(block => {
    // Remove blocks that have no meaningful content after cleaning
    const text = block.content
      .filter(node => node.type === 'text')
      .map(node => (node as any).text)
      .join(' ')
      .trim();
    
    return text.length > 0;
  });
}

/**
 * Transform abstract instructions into concrete creative direction
 */
export function transformAbstractToConcrete(text: string): string {
  const transformations: Array<[RegExp, string]> = [
    // Abstract to concrete
    [/\bDefine\s+emotional\s+arc\b/gi, 'Each video should follow this emotional arc: hook → vulnerability → resonance → quiet close'],
    [/\bDetermine\s+interview\s+question\s+themes\b/gi, 'Ask questions that unlock lived experience, such as:'],
    [/\bSelect\s+emotional\s+tone\b/gi, 'The emotional tone should feel:'],
    [/\bDefine\s+narrative\s+arc\b/gi, 'Structure each video like this:'],
    [/\b(?:Determine|Define|Select)\s+(?:the\s+)?(?:narrative|story|creative)\s+structure\b/gi, 'Structure the content like this:'],
  ];
  
  let transformed = text;
  for (const [pattern, replacement] of transformations) {
    transformed = transformed.replace(pattern, replacement);
  }
  
  return transformed;
}

/**
 * Apply all cleaning transformations to text
 */
export function cleanAndTransformText(text: string): string {
  let cleaned = cleanTextContent(text);
  cleaned = transformAbstractToConcrete(cleaned);
  return cleaned.trim();
}
