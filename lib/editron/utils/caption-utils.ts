import { Caption, CaptionWord, CaptionDisplayConfig, DEFAULT_DISPLAY_CONFIGS, CaptionDisplayMode } from "@/components/editron/editor/version-7.0.0/types";

/**
 * Groups an array of words with timestamps into Caption segments
 * suitable for display in the video editor.
 * 
 * @param words - Array of word objects with timing information
 * @param config - Configuration for grouping behavior
 * @returns Array of Caption objects
 */
export function groupWordsIntoCaptions(
  words: CaptionWord[],
  config: {
    wordsPerGroup: number;
    groupByPunctuation?: boolean;
    maxGroupDuration?: number; // max ms per group, optional
    maxCharsPerLine?: number; // Fix 32: cap characters per caption line (default 42)
  }
): Caption[] {
  if (!words || words.length === 0) return [];

  const { wordsPerGroup, groupByPunctuation = false, maxGroupDuration, maxCharsPerLine = 42 } = config;
  const captions: Caption[] = [];
  
  let currentGroup: CaptionWord[] = [];
  let groupStartMs = words[0].startMs;

  const pushGroup = () => {
    if (currentGroup.length === 0) return;
    
    const text = currentGroup.map(w => w.word).join(" ");
    const startMs = currentGroup[0].startMs;
    const endMs = currentGroup[currentGroup.length - 1].endMs;
    const avgConfidence = currentGroup.reduce((acc, w) => acc + w.confidence, 0) / currentGroup.length;

    captions.push({
      text,
      startMs,
      endMs,
      timestampMs: null,
      confidence: avgConfidence,
      words: [...currentGroup],
    });

    currentGroup = [];
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    // Check if we should start a new group
    const currentText = currentGroup.map(w => w.word).join(' ');
    const wouldExceedChars = maxCharsPerLine > 0 && currentGroup.length > 0
      && (currentText.length + 1 + word.word.length) > maxCharsPerLine;
    const shouldBreak =
      // Reached word limit
      currentGroup.length >= wordsPerGroup ||
      // Fix 32: character-per-line limit (default 42 chars)
      wouldExceedChars ||
      // Break on punctuation if enabled
      (groupByPunctuation && currentGroup.length > 0 && /[.!?,;:]$/.test(currentGroup[currentGroup.length - 1].word)) ||
      // Max duration exceeded
      (maxGroupDuration && currentGroup.length > 0 && (word.endMs - groupStartMs) > maxGroupDuration);

    if (shouldBreak) {
      pushGroup();
      groupStartMs = word.startMs;
    }

    currentGroup.push(word);
  }

  // Push remaining words
  pushGroup();

  return captions;
}

/**
 * Re-groups existing captions with a new word count
 * Extracts all words and re-groups them
 */
export function regroupCaptions(
  captions: Caption[],
  config: {
    wordsPerGroup: number;
    groupByPunctuation?: boolean;
  }
): Caption[] {
  // Flatten all words from all captions
  const allWords = captions.flatMap(caption => caption.words);
  
  // Re-group with new config
  return groupWordsIntoCaptions(allWords, config);
}

/**
 * Get the default display config for a given mode
 */
export function getDefaultDisplayConfig(mode: CaptionDisplayMode): CaptionDisplayConfig {
  return { ...DEFAULT_DISPLAY_CONFIGS[mode] };
}

/**
 * Creates display config with custom wordsPerGroup
 */
export function createDisplayConfig(
  mode: CaptionDisplayMode,
  overrides?: Partial<CaptionDisplayConfig>
): CaptionDisplayConfig {
  return {
    ...DEFAULT_DISPLAY_CONFIGS[mode],
    ...overrides,
  };
}
