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
  /** If true, content will be scaled to fit within bounds */
  autoFit?: boolean;
}

/**
 * Wrap HTML content in a sandboxed container with strict containment.
 * Prevents content from escaping bounds or receiving pointer events.
 * Uses CSS transform: scale() to auto-fit content to track size.
 */
export function createSandboxedWrapper(params: SandboxWrapperParams): string {
  const { html, width, height, backgroundColor = 'transparent', autoFit = true } = params;
  
  // Sanitize first
  const cleanHtml = sanitizeHtml(html);
  
  // Auto-fit wrapper uses object-fit-like behavior via CSS
  // The inner content is designed for a fixed size but we scale it to fit
  const autoFitStyles = autoFit ? `
    display: flex;
    justify-content: center;
    align-items: center;
  ` : '';
  
  return `<div style="
    position: absolute;
    inset: 0;
    width: ${width}px;
    height: ${height}px;
    background: ${backgroundColor};
    overflow: hidden;
    pointer-events: none;
    isolation: isolate;
    contain: layout style;
    ${autoFitStyles}
  "><div style="
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    transform-origin: center center;
  ">${cleanHtml}</div></div>`;
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
  
  // Build detailed word timing table with exact timestamps
  const wordTable = words.map((w, i) => {
    const importance = w.importance || classifyWordImportance(w.word);
    const delaySeconds = (w.startMs / 1000).toFixed(2);
    return `| ${i + 1} | "${w.word}" | ${w.startMs}ms | ${w.endMs}ms | ${delaySeconds}s | ${importance.toUpperCase()} |`;
  }).join('\n');
  
  const totalDuration = Math.max(...words.map(w => w.endMs));
  const exitStartMs = totalDuration - 300; // Exit animation starts 300ms before end
  const exitDelaySeconds = (exitStartMs / 1000).toFixed(2);
  
  const styleInstructions = {
    bento: `
LAYOUT STYLE: "Bento Grid" (Editorial, Tight Packing)
1. **USE CSS GRID**: Container uses \`display: grid; grid-template-columns: repeat(12, 1fr); gap: 10px;\`
2. **TIGHT PACKING**: Line-height: 0.85. Words nearly touch.
3. **HIERARCHY**:
   - HERO words: \`grid-column: span 10-12\`, font-size 12-16vw (use % of container), bold sans-serif
   - MEDIUM words: \`grid-column: span 6-8\`, font-size 8-10vw
   - FILLER words: \`grid-column: span 3-4\`, font-size 4-6vw, can have box/border treatment
4. **MIX FONTS**: Use 'Oswald' (bold sans) for impact, 'Playfair Display' (italic serif) for elegance.
5. **VARY STYLES**: Some words filled, some outlined (\`-webkit-text-stroke\`), some in colored boxes.`,
    scattered: `
LAYOUT STYLE: "Scattered" (Floating, Dynamic)
1. **USE ABSOLUTE POSITIONING**: Each word has unique \`top\` and \`left\` values as percentages.
2. **AVOID OVERLAP**: Words should not overlap, use different quadrants.
3. **HIERARCHY**: HERO words larger (12-15vw), FILLER words smaller (4-6vw).
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
Generate HTML/CSS for fancy video captions. Focus ONLY on LAYOUT and STYLING - timing will be handled separately.

═══════════════════════════════════════════════════════════════════
CANVAS: ${canvasWidth} × ${canvasHeight}px
BACKGROUND: ${backgroundColor} (MUST be transparent unless specified otherwise)
═══════════════════════════════════════════════════════════════════

WORDS TO DISPLAY (with timing data - use as data attributes):
${words.map((w, i) => {
  const importance = w.importance || classifyWordImportance(w.word);
  return `${i + 1}. "${w.word}" | data-start="${w.startMs}" data-end="${w.endMs}" | ${importance.toUpperCase()}`;
}).join('\n')}

${styleInstructions[style]}

YOUR JOB - Generate HTML with:
1. **Each word wrapped in a span** with these REQUIRED attributes:
   \`<span class="word" data-start="X" data-end="Y">WordHere</span>\`
   Where X and Y are the startMs and endMs values from above.

2. **Apply styling classes based on importance**:
   - HERO words: larger, accent color, bold
   - MEDIUM words: medium size
   - FILLER words: smaller, subtle

3. **NO animation CSS needed** - just set all words to \`opacity: 1\` by default.
   Animations will be injected programmatically.

LAYOUT RULES:
- Container: \`width: 100%; height: 100%; display: flex; justify-content: center; align-items: center;\`
- Use CSS Grid or Flexbox for word arrangement
- Use % or em for sizing (no vw/vh)
- Include Google Fonts link (Oswald + Playfair Display)

STYLING:
- Primary Color: ${primaryColor}
- Accent Color: ${accentColor} (for HERO words)
- Text Shadow: \`2px 2px 0 rgba(0,0,0,0.8)\` for readability
- Background: transparent (no background property)

CRITICAL DATA ATTRIBUTES:
Every word span MUST have: data-start="milliseconds" data-end="milliseconds"
Example: \`<span class="word hero" data-start="240" data-end="650">Hello</span>\`

OUTPUT: Return ONLY raw HTML starting with \`<\`. NO markdown. NO explanation.`;
}

/**
 * Inject timing-based animation CSS into generated HTML.
 * This handles the reliable timing work programmatically so LLM only does creative layout.
 * 
 * Uses the video player's --time CSS variable to show/hide words at correct moments.
 */
export function injectFancyCaptionTiming(html: string, totalDurationMs: number): string {
  // Extract all word timings from data attributes
  const wordTimings: Array<{ startMs: number; endMs: number; index: number }> = [];
  const wordRegex = /data-start="(\d+)"\s+data-end="(\d+)"/g;
  let match;
  let index = 0;
  
  while ((match = wordRegex.exec(html)) !== null) {
    wordTimings.push({
      startMs: parseInt(match[1], 10),
      endMs: parseInt(match[2], 10),
      index: index++,
    });
  }
  
  if (wordTimings.length === 0) {
    console.warn('[FANCY-CAPTIONS] No word timings found in HTML, skipping timing injection');
    return html;
  }
  
  // Calculate exit time (all words fade out together)
  const exitStartMs = totalDurationMs - 300;
  const exitStartS = (exitStartMs / 1000).toFixed(2);
  
  // Build timing CSS
  // Each word: hidden by default, visible when --time is within [startMs, endMs]
  // We use CSS animations with paused state, controlled by negative delay (scrubbing trick)
  const timingCSS = `
<style id="fancy-caption-timing">
  /* Timing-based word visibility - injected programmatically */
  @keyframes wordReveal {
    0% { opacity: 0; transform: scale(0.8) translateY(10px); }
    10% { opacity: 1; transform: scale(1) translateY(0); }
    90% { opacity: 1; transform: scale(1) translateY(0); }
    100% { opacity: 0; transform: scale(0.9) translateY(-5px); }
  }
  
  /* Base word style - start hidden */
  .word[data-start] {
    opacity: 0;
  }
  
  /* Each word gets its own animation timing */
  ${wordTimings.map(w => {
    const wordDuration = w.endMs - w.startMs;
    const animDuration = Math.max(wordDuration + 200, 400); // Animation slightly longer than word duration
    const durationS = (animDuration / 1000).toFixed(2);
    const delayS = (w.startMs / 1000).toFixed(2);
    
    // Use nth-of-type to target words by order
    return `.word[data-start="${w.startMs}"][data-end="${w.endMs}"] {
    animation: wordReveal ${durationS}s ease-out calc(var(--time, 0s) * -1 + ${delayS}s) paused forwards;
  }`;
  }).join('\n  ')}
  
  /* Container exit animation */
  .caption-wrapper, .caption-container, [class*="caption"] {
    animation: containerExit 0.3s ease-out calc(var(--time, 0s) * -1 + ${exitStartS}s) paused forwards;
  }
  
  @keyframes containerExit {
    0% { opacity: 1; }
    100% { opacity: 0; transform: scale(0.95); }
  }
</style>
`;
  
  // Inject timing CSS at the beginning of the HTML
  return timingCSS + html;
}

