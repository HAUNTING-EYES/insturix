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
    width: 100%;
    height: 100%;
    background: ${backgroundColor};
    overflow: hidden;
    pointer-events: none;
    isolation: isolate;
    contain: layout style paint;
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
  style: 'bento' | 'scattered' | 'minimal' | 'static' | 'kinetic';
  intensity?: 'low' | 'medium' | 'high';
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  lockTypography?: boolean;
  typographyProfile?: {
    fontPair?: string;
    strokeStyle?: string;
    shadowStyle?: string;
    paletteHint?: string;
  };
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
    intensity = 'medium',
    primaryColor = '#FFFFFF',
    accentColor = '#FFE66D',
    backgroundColor = 'transparent',
    lockTypography = false,
    typographyProfile,
  } = params;

  const normalizedWords = words.map((w) => ({
    ...w,
    importance: w.importance || classifyWordImportance(w.word),
  }));
  
  // Build detailed word timing table with exact timestamps
  const wordTable = normalizedWords.map((w, i) => {
    const delaySeconds = (w.startMs / 1000).toFixed(2);
    return `| ${i + 1} | "${w.word}" | ${w.startMs}ms | ${w.endMs}ms | ${delaySeconds}s | ${w.importance?.toUpperCase()} |`;
  }).join('\n');
  
  const ctaLexicon = new Set([
    'now', 'stop', 'free', 'today', 'start', 'book', 'buy', 'join', 'save', 'claim',
    'limited', 'exclusive', 'only', 'new', 'launch', 'must', 'watch', 'click',
    'subscribe', 'follow', 'deal', 'offer', 'bonus', 'instant', 'often'
  ]);

  const semanticRows = normalizedWords.map((w, i) => {
    const cleanWord = w.word.toLowerCase().replace(/[^a-z0-9]/g, '');
    const semanticRole = ctaLexicon.has(cleanWord) ? 'cta' : (w.importance === 'hero' ? 'hero' : 'support');
    return `${i + 1}. "${w.word}" => ${semanticRole.toUpperCase()}`;
  }).join('\n');

  // Beat-aware emphasis heuristic from speech rhythm (dense words + short gaps)
  const beatWordIndexes: number[] = [];
  normalizedWords.forEach((w, i) => {
    const previous = normalizedWords[i - 1];
    const next = normalizedWords[i + 1];
    const beforeGap = previous ? Math.max(0, w.startMs - previous.endMs) : 160;
    const afterGap = next ? Math.max(0, next.startMs - w.endMs) : 160;
    const duration = Math.max(60, w.endMs - w.startMs);
    const isEnergyPeak = duration <= 320 && (beforeGap + afterGap) <= 220;
    if (isEnergyPeak && (w.importance === 'hero' || ctaLexicon.has(w.word.toLowerCase().replace(/[^a-z0-9]/g, '')))) {
      beatWordIndexes.push(i + 1);
    }
  });
  const beatCueText = beatWordIndexes.length > 0
    ? beatWordIndexes.map((idx) => `${idx}. "${normalizedWords[idx - 1].word}"`).join('\n')
    : 'No strong peaks detected - use subtle rhythmic emphasis only.';

  const intensityInstructions = {
    low: `
INTENSITY: LOW
- Motion subtle; keep rotation between -2deg and +2deg.
- Spacing conservative; avoid large jumps in size.
- Contrast moderate with cleaner, calmer reading rhythm.`,
    medium: `
INTENSITY: MEDIUM
- Balanced motion; rotation between -6deg and +6deg max.
- Controlled spread and hierarchy shifts.
- Strong but readable contrast (default storytelling energy).`,
    high: `
INTENSITY: HIGH
- Energetic motion; rotation between -12deg and +12deg max.
- Stronger hierarchy contrast and spread, still no overlap.
- Use bold accents for hero/CTA words while preserving readability.`,
  };

  const typographyLockInstructions = lockTypography ? `
TYPOGRAPHY LOCK: ENABLED
- Preserve typography system exactly across generations.
- Use locked font pair and effect system:
  - fontPair: ${typographyProfile?.fontPair || 'Oswald + Playfair Display'}
  - strokeStyle: ${typographyProfile?.strokeStyle || 'subtle 1-2px stroke on selected hero words'}
  - shadowStyle: ${typographyProfile?.shadowStyle || '2px 2px 0 rgba(0,0,0,0.8)'}
  - paletteHint: ${typographyProfile?.paletteHint || `${primaryColor} / ${accentColor}`}
- Do not swap to unrelated font families.` : `
TYPOGRAPHY LOCK: DISABLED
- You may choose best-fit typography while staying on-brand and readable.`;
  
  // Calculate pixel-based font sizes from canvas width (NOT vw — vw resolves to
  // the browser viewport, not the composition container, causing massive overflow).
  const heroMin = Math.round(canvasWidth * 0.10);   // ~108px for 1080
  const heroMax = Math.round(canvasWidth * 0.14);   // ~151px for 1080
  const medMin  = Math.round(canvasWidth * 0.06);   // ~65px  for 1080
  const medMax  = Math.round(canvasWidth * 0.09);   // ~97px  for 1080
  const fillMin = Math.round(canvasWidth * 0.035);  // ~38px  for 1080
  const fillMax = Math.round(canvasWidth * 0.055);  // ~59px  for 1080

  const styleInstructions = {
    bento: `
LAYOUT STYLE: "Bento Grid" (Editorial, Tight Packing)
1. **USE CSS GRID**: Container uses \`display: grid; grid-template-columns: repeat(12, 1fr); gap: 10px;\`
2. **TIGHT PACKING**: Line-height: 0.85. Words nearly touch.
3. **HIERARCHY**:
   - HERO words: \`grid-column: span 10-12\`, font-size ${heroMin}px–${heroMax}px, bold sans-serif
   - MEDIUM words: \`grid-column: span 6-8\`, font-size ${medMin}px–${medMax}px
   - FILLER words: \`grid-column: span 3-4\`, font-size ${fillMin}px–${fillMax}px, can have box/border treatment
4. **MIX FONTS**: Use 'Oswald' (bold sans) for impact, 'Playfair Display' (italic serif) for elegance.
5. **VARY STYLES**: Some words filled, some outlined (\`-webkit-text-stroke\`), some in colored boxes.
6. **NEVER use vw or vh units** — always use px for font-size.`,
    scattered: `
LAYOUT STYLE: "Scattered" (Floating, Dynamic)
1. **USE ABSOLUTE POSITIONING**: Each word has unique \`top\` and \`left\` values as percentages.
2. **AVOID OVERLAP**: Words should not overlap, use different quadrants.
3. **HIERARCHY**: HERO words larger (${heroMin}px–${heroMax}px), FILLER words smaller (${fillMin}px–${fillMax}px).
4. **ROTATIONS**: Vary rotation -15deg to +15deg for dynamism.
5. **SPREAD**: Distribute across canvas — some top-left, some center-right, some bottom.
6. **NEVER use vw or vh units** — always use px for font-size.`,
    minimal: `
LAYOUT STYLE: "Minimal" (Clean, Centered)
1. **CENTERED STACK**: All words vertically stacked, centered horizontally.
2. **LINE BY LINE**: One or two words per line.
3. **SIMPLE ANIMATION**: Fade and slight scale only.
4. **UNIFORM FONT**: Single font family, vary weight only.
5. **SUBTLE**: No wild rotations or scattered positions.
6. **NEVER use vw or vh units** — always use px for font-size. HERO: ${heroMin}px–${heroMax}px, MEDIUM: ${medMin}px–${medMax}px, FILLER: ${fillMin}px–${fillMax}px.`,
    static: `
LAYOUT STYLE: "Static Fancy" (Stable, Clean Composition)
1. **STATIC PLACEMENT**: Keep all words in fixed positions with no scattered distribution.
2. **NO ROTATION**: Use \`transform: none\` for word wrappers unless absolutely needed for alignment.
3. **COMPACT BLOCK**: Arrange words as a centered multi-line block (2-4 words per line depending on length).
4. **CONSISTENT HIERARCHY**: HERO words can be larger/accented, but remain aligned within the same block. HERO: ${heroMin}px–${heroMax}px, MEDIUM: ${medMin}px–${medMax}px, FILLER: ${fillMin}px–${fillMax}px.
5. **READABLE + FANCY**: Use premium typography, subtle strokes/shadows, and clean spacing without floating effects.
6. **NEVER use vw or vh units** — always use px for font-size.`,
    kinetic: `
LAYOUT STYLE: "Kinetic" (Balanced Storytelling Mode)
1. **BALANCED COMPOSITION**: Keep a structured center composition with selective offset accents.
2. **LIMITED MOTION FEEL**: Allow subtle position variation and tiny rotations only (-4deg to +4deg max).
3. **FLOW BY MEANING**: Place HERO words in stronger visual anchors, MEDIUM/FILLER words support narrative flow. HERO: ${heroMin}px–${heroMax}px, MEDIUM: ${medMin}px–${medMax}px, FILLER: ${fillMin}px–${fillMax}px.
4. **NO CHAOS**: Avoid full-canvas scatter; keep overall reading path clean and progressive.
5. **STORY-FIRST FANCY**: Maintain strong typography contrast and emphasis while preserving legibility.
6. **NEVER use vw or vh units** — always use px for font-size.`,
  };
  
  return `You are an expert Kinetic Typography Designer.
Generate HTML/CSS for fancy video captions. Focus ONLY on LAYOUT and STYLING - timing will be handled separately.

═══════════════════════════════════════════════════════════════════
CANVAS: ${canvasWidth} × ${canvasHeight}px
BACKGROUND: ${backgroundColor} (MUST be transparent unless specified otherwise)
═══════════════════════════════════════════════════════════════════

WORDS TO DISPLAY (with timing data - use as data attributes):
${normalizedWords.map((w, i) => {
  return `${i + 1}. "${w.word}" | data-start="${w.startMs}" data-end="${w.endMs}" | ${w.importance?.toUpperCase()}`;
}).join('\n')}

WORD TIMING TABLE:
${wordTable}

SEMANTIC WORD ROLES:
${semanticRows}

BEAT / ENERGY CUES (use for emphasis on HERO/CTA words):
${beatCueText}

${styleInstructions[style]}
${intensityInstructions[intensity]}
${typographyLockInstructions}

YOUR JOB - Generate HTML with:
1. **Each word wrapped in a span** with these REQUIRED attributes:
   \`<span class="word" data-start="X" data-end="Y">WordHere</span>\`
   Where X and Y are the startMs and endMs values from above.

2. **Apply styling classes based on importance**:
   - HERO words: larger, accent color, bold
   - MEDIUM words: medium size
   - FILLER words: smaller, subtle
   - CTA words: stronger accent treatment and clearer visual priority, consistent treatment across all CTA words.

3. **NO animation CSS needed** - just set all words to \`opacity: 1\` by default.
   Animations will be injected programmatically.

LAYOUT RULES:
- Container: \`width: 100%; height: 100%; display: flex; justify-content: center; align-items: center;\`
- Use CSS Grid or Flexbox for word arrangement
- Use % for positioning, px for font-size — NEVER use vw or vh units (they resolve to browser viewport, not the canvas)
- Include Google Fonts link (Oswald + Playfair Display)
- When using absolute positioning, keep left/top between 8% and 92%
- Keep all content inside safe area: at least 8% padding from each canvas edge
- Do NOT let words overlap each other
- If style is not scattered, avoid absolute random positioning

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
 * Inject simple visibility CSS into generated HTML.
 * 
 * NEW APPROACH: No complex animation scrubbing. React will control visibility
 * based on frame time by directly setting inline styles on word elements.
 * 
 * This function adds:
 * 1. Smooth transition CSS for opacity/transform changes
 * 2. data-total-duration attribute on container for React parsing
 */
export function injectFancyCaptionTiming(html: string, totalDurationMs: number): string {
  // Extract all word timings to verify data attributes are present
  const wordCount = (html.match(/data-start="/g) || []).length;
  
  if (wordCount === 0) {
    console.warn('[FANCY-CAPTIONS] No word timings found in HTML, skipping');
    return html;
  }
  
  console.log(`[FANCY-CAPTIONS] Found ${wordCount} words, total duration: ${totalDurationMs}ms`);
  
  const visibilityCSS = `
<style id="fancy-caption-visibility">
  .word[data-start] {
    transition: opacity 0.15s ease-out, transform 0.15s ease-out;
  }
</style>
`;
  
  // Add data-total-duration to the first div for React to read
  const htmlWithDuration = html.replace(
    /(<div[^>]*class="[^"]*caption-container[^"]*")/i,
    `$1 data-total-duration="${totalDurationMs}"`
  );
  
  // Inject CSS at the beginning
  return visibilityCSS + htmlWithDuration;
}

