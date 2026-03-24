/**
 * Content-to-Graphic Map
 *
 * Automatically maps content types detected in the 5-track analysis
 * to appropriate motion graphic templates. Eliminates the need for
 * users to know what "lower thirds" or "callouts" are.
 *
 * 15 content types → graphic template IDs.
 *
 * Usage: "The AI detects a product mention in the narration and a
 * product visible on screen → auto-inserts a callout graphic at the
 * right moment without the user asking."
 */

// ─── Content Type Detection ──────────────────────────────────────

export type ContentType =
  | 'product-mention'       // Product name spoken or visible
  | 'stat-citation'         // Number, percentage, statistic
  | 'person-introduction'   // New person appears on screen
  | 'location-reveal'       // New location/setting shown
  | 'list-enumeration'      // "First... Second... Third..."
  | 'comparison'            // "Before vs After", "A compared to B"
  | 'question-posed'        // Question asked in narration
  | 'key-quote'             // Important statement / tagline
  | 'cta-moment'            // Call to action (visit, subscribe, buy)
  | 'feature-highlight'     // Product feature being demonstrated
  | 'brand-reveal'          // Logo or brand name appears
  | 'timeline-event'        // Date or chronological reference
  | 'step-instruction'      // Tutorial step being explained
  | 'emotional-peak'        // Emotional climax in narration
  | 'scene-transition'      // Transition between major scenes
  ;

export interface ContentDetection {
  type: ContentType;
  timestampMs: number;
  durationMs: number;
  text: string;           // The relevant text/description
  confidence: number;     // 0-1
  source: 'speech' | 'visual' | 'subjects';
}

export interface GraphicSuggestion {
  content: ContentDetection;
  graphicType: string;      // Template category
  text: string;             // Display text for the graphic
  position: 'bottom-left' | 'bottom-center' | 'top-left' | 'center' | 'custom';
  durationFrames: number;
  delay: number;            // Frames after content detection to show graphic
  style: 'minimal' | 'bold' | 'elegant' | 'playful';
}

// ─── Mapping Rules ───────────────────────────────────────────────

const CONTENT_GRAPHIC_MAP: Record<ContentType, {
  graphicType: string;
  position: GraphicSuggestion['position'];
  durationFrames: number;
  delay: number;
  style: GraphicSuggestion['style'];
  description: string; // Plain language for user
}> = {
  'product-mention': {
    graphicType: 'callout',
    position: 'custom',
    durationFrames: 90,
    delay: 15,
    style: 'elegant',
    description: 'Product highlight',
  },
  'stat-citation': {
    graphicType: 'stat-counter',
    position: 'center',
    durationFrames: 120,
    delay: 0,
    style: 'bold',
    description: 'Animated number',
  },
  'person-introduction': {
    graphicType: 'lower-third',
    position: 'bottom-left',
    durationFrames: 120,
    delay: 30,
    style: 'minimal',
    description: 'Name label',
  },
  'location-reveal': {
    graphicType: 'location-tag',
    position: 'bottom-left',
    durationFrames: 90,
    delay: 15,
    style: 'minimal',
    description: 'Location tag',
  },
  'list-enumeration': {
    graphicType: 'numbered-list',
    position: 'center',
    durationFrames: 150,
    delay: 0,
    style: 'bold',
    description: 'Numbered list',
  },
  'comparison': {
    graphicType: 'split-comparison',
    position: 'center',
    durationFrames: 150,
    delay: 0,
    style: 'bold',
    description: 'Side-by-side comparison',
  },
  'question-posed': {
    graphicType: 'text-pop',
    position: 'center',
    durationFrames: 90,
    delay: 0,
    style: 'playful',
    description: 'Question text',
  },
  'key-quote': {
    graphicType: 'quote-card',
    position: 'center',
    durationFrames: 120,
    delay: 15,
    style: 'elegant',
    description: 'Quote highlight',
  },
  'cta-moment': {
    graphicType: 'cta-button',
    position: 'bottom-center',
    durationFrames: 150,
    delay: 0,
    style: 'bold',
    description: 'Action button',
  },
  'feature-highlight': {
    graphicType: 'callout',
    position: 'custom',
    durationFrames: 90,
    delay: 15,
    style: 'elegant',
    description: 'Feature label',
  },
  'brand-reveal': {
    graphicType: 'logo-reveal',
    position: 'center',
    durationFrames: 60,
    delay: 0,
    style: 'elegant',
    description: 'Brand reveal',
  },
  'timeline-event': {
    graphicType: 'date-tag',
    position: 'bottom-left',
    durationFrames: 90,
    delay: 0,
    style: 'minimal',
    description: 'Date/time label',
  },
  'step-instruction': {
    graphicType: 'step-indicator',
    position: 'top-left',
    durationFrames: 120,
    delay: 0,
    style: 'bold',
    description: 'Step number',
  },
  'emotional-peak': {
    graphicType: 'emphasis-pulse',
    position: 'center',
    durationFrames: 30,
    delay: 0,
    style: 'bold',
    description: 'Emphasis effect',
  },
  'scene-transition': {
    graphicType: 'chapter-title',
    position: 'center',
    durationFrames: 60,
    delay: 0,
    style: 'minimal',
    description: 'Section title',
  },
};

// ─── Content Detection from Narration ────────────────────────────

const CONTENT_PATTERNS: Array<{
  type: ContentType;
  patterns: RegExp[];
  confidence: number;
}> = [
  {
    type: 'stat-citation',
    patterns: [/\b\d+\.?\d*\s*%/, /\b\d{1,3}(,\d{3})+/, /\b(million|billion|thousand)\b/i, /\$\d+/],
    confidence: 0.9,
  },
  {
    type: 'cta-moment',
    patterns: [/\b(visit|subscribe|buy|order|download|sign up|click|tap|swipe)\b/i, /\b(link in|available at|get yours)\b/i],
    confidence: 0.85,
  },
  {
    type: 'question-posed',
    patterns: [/\?$/, /\b(what if|have you|do you|can you|why not)\b/i],
    confidence: 0.8,
  },
  {
    type: 'list-enumeration',
    patterns: [/\b(first|second|third|next|finally|number \d)\b/i, /\b(step \d|#\d)\b/i],
    confidence: 0.75,
  },
  {
    type: 'comparison',
    patterns: [/\b(vs|versus|compared to|before and after|unlike|rather than)\b/i],
    confidence: 0.8,
  },
  {
    type: 'step-instruction',
    patterns: [/\bstep \d/i, /\b(how to|tutorial|guide)\b/i],
    confidence: 0.7,
  },
  {
    type: 'timeline-event',
    patterns: [/\b(in \d{4}|since \d{4}|\d{4}-\d{4}|years ago)\b/i],
    confidence: 0.75,
  },
  {
    type: 'key-quote',
    patterns: [/"[^"]{10,}"/, /\b(quote|said|stated|declared)\b/i],
    confidence: 0.7,
  },
];

/**
 * Detect content types from narration text with word-level timestamps.
 */
export function detectContentFromNarration(
  words: Array<{ word: string; startMs: number; endMs: number }>,
): ContentDetection[] {
  const detections: ContentDetection[] = [];
  const fullText = words.map(w => w.word).join(' ');

  // Check each pattern
  for (const { type, patterns, confidence } of CONTENT_PATTERNS) {
    for (const pattern of patterns) {
      const match = pattern.exec(fullText);
      if (match) {
        // Find the approximate timestamp of the match
        const charPos = match.index;
        let charCount = 0;
        let matchWord = words[0];
        for (const word of words) {
          charCount += word.word.length + 1;
          if (charCount >= charPos) {
            matchWord = word;
            break;
          }
        }

        detections.push({
          type,
          timestampMs: matchWord.startMs,
          durationMs: 3000, // Default 3s
          text: match[0],
          confidence,
          source: 'speech',
        });
      }
    }
  }

  return detections;
}

/**
 * Detect content types from visual analysis subjects.
 */
export function detectContentFromVisual(
  subjects: Array<{ label: string; category: string; appearances: Array<{ timestampMs: number }> }>,
): ContentDetection[] {
  const detections: ContentDetection[] = [];

  for (const subject of subjects) {
    if (!subject.appearances.length) continue;
    const firstAppearance = subject.appearances[0].timestampMs;

    if (subject.category === 'product') {
      detections.push({
        type: 'product-mention',
        timestampMs: firstAppearance,
        durationMs: 3000,
        text: subject.label,
        confidence: 0.8,
        source: 'visual',
      });
    } else if (subject.category === 'person') {
      detections.push({
        type: 'person-introduction',
        timestampMs: firstAppearance,
        durationMs: 4000,
        text: subject.label,
        confidence: 0.7,
        source: 'visual',
      });
    } else if (subject.category === 'logo') {
      detections.push({
        type: 'brand-reveal',
        timestampMs: firstAppearance,
        durationMs: 2000,
        text: subject.label,
        confidence: 0.9,
        source: 'visual',
      });
    }
  }

  return detections;
}

/**
 * Map content detections to graphic suggestions.
 */
export function mapContentToGraphics(
  detections: ContentDetection[],
): GraphicSuggestion[] {
  return detections
    .filter(d => d.confidence >= 0.6) // Only confident detections
    .map(detection => {
      const mapping = CONTENT_GRAPHIC_MAP[detection.type];
      return {
        content: detection,
        graphicType: mapping.graphicType,
        text: detection.text,
        position: mapping.position,
        durationFrames: mapping.durationFrames,
        delay: mapping.delay,
        style: mapping.style,
      };
    })
    .sort((a, b) => a.content.timestampMs - b.content.timestampMs);
}
