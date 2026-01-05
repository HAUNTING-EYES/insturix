/**
 * HTML Generator Utilities
 * 
 * Shared security, validation, and metadata extraction utilities for all
 * AI-generated HTML content (scenes, stickers, fancy captions).
 */

// ============================================================================
// SECURITY: HTML SANITIZATION
// ============================================================================

/**
 * Sanitize AI-generated HTML to prevent XSS and malicious code execution.
 * Removes scripts, event handlers, iframes, forms, and dangerous URIs.
 */
export function sanitizeHtml(html: string): string {
  let clean = html;
  
  // Remove script tags (including content)
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers (onclick, onload, onerror, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*'[^']*'/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Block dangerous URI schemes
  clean = clean.replace(/javascript\s*:/gi, 'blocked:');
  clean = clean.replace(/vbscript\s*:/gi, 'blocked:');
  clean = clean.replace(/data\s*:\s*text\/html/gi, 'blocked:');
  
  // Remove iframes
  clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  clean = clean.replace(/<iframe[^>]*\/>/gi, '');
  
  // Remove forms and inputs
  clean = clean.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '');
  clean = clean.replace(/<input[^>]*>/gi, '');
  clean = clean.replace(/<button\b[^<]*(?:(?!<\/button>)<[^<]*)*<\/button>/gi, '');
  clean = clean.replace(/<textarea\b[^<]*(?:(?!<\/textarea>)<[^<]*)*<\/textarea>/gi, '');
  
  // Remove object/embed tags
  clean = clean.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  clean = clean.replace(/<embed[^>]*>/gi, '');
  
  // Remove base tags (can redirect all relative URLs)
  clean = clean.replace(/<base[^>]*>/gi, '');
  
  // Remove meta refresh
  clean = clean.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');
  
  return clean.trim();
}

// ============================================================================
// SECURITY: SANDBOXED WRAPPER
// ============================================================================

export interface SandboxWrapperParams {
  html: string;
  width: number;
  height: number;
  backgroundColor?: string;
}

/**
 * Wrap HTML content in a sandboxed container with strict containment.
 * Prevents content from escaping bounds or receiving pointer events.
 */
export function createSandboxedWrapper(params: SandboxWrapperParams): string {
  const { html, width, height, backgroundColor = 'transparent' } = params;
  
  // Sanitize first
  const cleanHtml = sanitizeHtml(html);
  
  return `<div style="
    position: absolute;
    inset: 0;
    width: ${width}px;
    height: ${height}px;
    background: ${backgroundColor};
    overflow: hidden;
    pointer-events: none;
    isolation: isolate;
    contain: strict;
  ">${cleanHtml}</div>`;
}

// ============================================================================
// METADATA EXTRACTION
// ============================================================================

export interface HtmlStyleMetadata {
  fonts: string[];
  colors: string[];
  backgroundColor: string;
}

/**
 * Extract style metadata from AI-generated HTML for consistency tracking.
 * Used by LLM to maintain visual consistency across generated elements.
 */
export function extractStyleMetadata(html: string): HtmlStyleMetadata {
  const fonts: Set<string> = new Set();
  const colors: Set<string> = new Set();
  let backgroundColor = 'transparent';
  
  // Extract font-family declarations
  const fontFamilyRegex = /font-family\s*:\s*(['"]?)([^;'"]+)\1/gi;
  let match;
  while ((match = fontFamilyRegex.exec(html)) !== null) {
    // Split by comma and clean up font names
    const fontList = match[2].split(',').map(f => f.trim().replace(/['"]/g, ''));
    fontList.forEach(f => {
      if (f && !f.includes('sans-serif') && !f.includes('serif') && !f.includes('monospace')) {
        fonts.add(f);
      }
    });
  }
  
  // Extract Google Fonts from link tags
  const googleFontsRegex = /fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/gi;
  while ((match = googleFontsRegex.exec(html)) !== null) {
    const familyParam = decodeURIComponent(match[1]);
    const families = familyParam.split('&family=');
    families.forEach(f => {
      const fontName = f.split(':')[0].replace(/\+/g, ' ');
      if (fontName) fonts.add(fontName);
    });
  }
  
  // Extract color values (hex, rgb, rgba, named colors)
  const colorRegex = /(?:color|background-color|background|fill|stroke)\s*:\s*([^;}\n]+)/gi;
  while ((match = colorRegex.exec(html)) !== null) {
    const colorValue = match[1].trim();
    
    // Extract hex colors
    const hexMatches = colorValue.match(/#[0-9A-Fa-f]{3,8}/g);
    if (hexMatches) hexMatches.forEach(c => colors.add(c.toUpperCase()));
    
    // Extract rgb/rgba
    const rgbMatches = colorValue.match(/rgba?\([^)]+\)/gi);
    if (rgbMatches) rgbMatches.forEach(c => colors.add(c));
    
    // Check for transparent background
    if (colorValue.includes('transparent') && match[0].includes('background')) {
      backgroundColor = 'transparent';
    } else if (match[0].includes('background') && !colorValue.includes('transparent')) {
      // Take first non-transparent background
      const bgHex = colorValue.match(/#[0-9A-Fa-f]{3,8}/);
      if (bgHex && backgroundColor === 'transparent') {
        backgroundColor = bgHex[0].toUpperCase();
      }
    }
  }
  
  // Extract CSS variable colors from :root
  const cssVarRegex = /--[^:]+:\s*(#[0-9A-Fa-f]{3,8}|rgba?\([^)]+\))/gi;
  while ((match = cssVarRegex.exec(html)) !== null) {
    const colorValue = match[1];
    if (colorValue.startsWith('#')) {
      colors.add(colorValue.toUpperCase());
    } else {
      colors.add(colorValue);
    }
  }
  
  return {
    fonts: Array.from(fonts),
    colors: Array.from(colors).filter(c => c !== 'transparent'),
    backgroundColor,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

const ASPECT_RATIO_VALUES: Record<AspectRatio, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:5': 4 / 5,
};

/**
 * Validate that dimensions match the target aspect ratio (with 1% tolerance).
 */
export function validateAspectRatio(
  width: number,
  height: number,
  targetRatio: AspectRatio
): boolean {
  const actual = width / height;
  const expected = ASPECT_RATIO_VALUES[targetRatio];
  const tolerance = 0.01; // 1% tolerance
  
  return Math.abs(actual - expected) <= tolerance * expected;
}

/**
 * Get standard dimensions for an aspect ratio.
 */
export function getDimensionsForRatio(ratio: AspectRatio): { width: number; height: number } {
  switch (ratio) {
    case '16:9':
      return { width: 1920, height: 1080 };
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    default:
      return { width: 1920, height: 1080 };
  }
}

// ============================================================================
// WORD TIMING UTILITIES
// ============================================================================

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
  importance?: 'hero' | 'medium' | 'filler';
}

/**
 * Classify word importance for kinetic typography.
 * Hero words get larger treatment, fillers are small.
 */
export function classifyWordImportance(word: string): 'hero' | 'medium' | 'filler' {
  const lowerWord = word.toLowerCase().replace(/[^a-z]/g, '');
  
  // Filler words (small, supportive)
  const fillers = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'not', 'only', 'just', 'also', 'very', 'too', 'quite', 'rather',
    'i', 'me', 'my', 'you', 'your', 'he', 'she', 'it', 'we', 'they',
    'this', 'that', 'these', 'those', 'here', 'there', 'when', 'where',
    'how', 'what', 'which', 'who', 'whom', 'whose', 'why',
    'im', 'youre', 'hes', 'shes', 'its', 'were', 'theyre',
    'gonna', 'wanna', 'gotta', 'kinda', 'sorta',
  ]);
  
  if (fillers.has(lowerWord)) {
    return 'filler';
  }
  
  // Hero words (action verbs, nouns, adjectives - typically longer)
  if (lowerWord.length >= 6) {
    return 'hero';
  }
  
  return 'medium';
}

/**
 * Add importance classification to word timings.
 */
export function classifyWordTimings(words: Omit<WordTiming, 'importance'>[]): WordTiming[] {
  return words.map(w => ({
    ...w,
    importance: classifyWordImportance(w.word),
  }));
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

export interface FancyCaptionPromptParams {
  words: WordTiming[];
  canvasWidth: number;
  canvasHeight: number;
  style: 'bento' | 'scattered' | 'minimal';
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
}

/**
 * Build the Gemini prompt for fancy caption generation.
 */
export function buildFancyCaptionPrompt(params: FancyCaptionPromptParams): string {
  const {
    words,
    canvasWidth,
    canvasHeight,
    style,
    primaryColor = '#FFFFFF',
    accentColor = '#FFE66D',
    backgroundColor = 'transparent',
  } = params;
  
  // Build word timing table
  const wordTable = words.map((w, i) => {
    const importance = w.importance || classifyWordImportance(w.word);
    return `${i + 1}. "${w.word}" (${w.startMs}ms - ${w.endMs}ms) -> ${importance.toUpperCase()}`;
  }).join('\n');
  
  const totalDuration = Math.max(...words.map(w => w.endMs));
  
  const styleInstructions = {
    bento: `
LAYOUT STYLE: "Bento Grid" (Editorial, Tight Packing)
1. **USE CSS GRID**: Container uses \`display: grid; grid-template-columns: repeat(12, 1fr); gap: 10px;\`
2. **TIGHT PACKING**: Line-height: 0.85. Words nearly touch.
3. **HIERARCHY**:
   - HERO words: \`grid-column: span 10-12\`, font-size 160-220px, bold sans-serif
   - MEDIUM words: \`grid-column: span 6-8\`, font-size 100-140px
   - FILLER words: \`grid-column: span 3-4\`, font-size 50-70px, can have box/border treatment
4. **MIX FONTS**: Use 'Oswald' (bold sans) for impact, 'Playfair Display' (italic serif) for elegance.
5. **VARY STYLES**: Some words filled, some outlined (\`-webkit-text-stroke\`), some in colored boxes.`,
    scattered: `
LAYOUT STYLE: "Scattered" (Floating, Dynamic)
1. **USE ABSOLUTE POSITIONING**: Each word has unique \`top\` and \`left\` values.
2. **AVOID OVERLAP**: Words should not overlap, use different quadrants.
3. **HIERARCHY**: HERO words larger (150px+), FILLER words smaller (40-60px).
4. **ROTATIONS**: Vary rotation -15deg to +15deg for dynamism.
5. **SPREAD**: Distribute across canvas - some top-left, some center-right, some bottom.`,
    minimal: `
LAYOUT STYLE: "Minimal" (Clean, Centered)
1. **CENTERED STACK**: All words vertically stacked, centered horizontally.
2. **LINE BY LINE**: One or two words per line.
3. **SIMPLE ANIMATION**: Fade and slight scale only.
4. **UNIFORM FONT**: Single font family, vary weight only.
5. **SUBTLE**: No wild rotations or scattered positions.`,
  };
  
  return `You are an expert Kinetic Typography Designer.
Generate a SELF-CONTAINED HTML/CSS animation for fancy video captions.

═══════════════════════════════════════════════════════════════════
CANVAS: ${canvasWidth} × ${canvasHeight}px
BACKGROUND: ${backgroundColor}
DURATION: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)
═══════════════════════════════════════════════════════════════════

TRANSCRIPT & TIMING:
${wordTable}

${styleInstructions[style]}

ANIMATION RULES (CRITICAL):
1. All words start \`opacity: 0\`.
2. Each word animates in at its exact startMs using \`animation-delay\`.
3. Animation: \`popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards\`.
4. Convert ms to seconds for CSS: 1500ms = 1.5s.
5. Words stay visible after appearing (persist until end).

STYLING:
- Primary Color: ${primaryColor}
- Accent Color: ${accentColor} (use for HERO words or highlights)
- Text Shadow: \`4px 4px 0 rgba(0,0,0,0.9)\` for readability.
- Font Import: Include Google Fonts link for Oswald and Playfair Display.

CONTAINER RULES (CRITICAL):
- Outer wrapper: \`position: absolute; inset: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center;\`
- Content container width: ${Math.round(canvasWidth * 0.9)}px (90% of canvas).
- Never use viewport units (vw, vh). Use px or %.

OUTPUT: Return ONLY raw HTML starting with \`<\`. NO markdown. NO explanation.`;
}
