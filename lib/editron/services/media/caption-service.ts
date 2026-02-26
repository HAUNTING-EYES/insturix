/**
 * Caption Service
 * 
 * Creates and aligns captions to video clips on the timeline.
 * Handles all timestamp conversion so AI tools don't need to do math.
 */

import type { 
  CaptionStylePreset, 
  CaptionPosition,
  CreateCaptionOptions,
  TranscriptionWord,
  TimelineContext,
} from './types';
import { msToTimelineFrame } from './types';
import { getTranscription } from './transcription-service';
import { groupWordsIntoCaptions } from '@/lib/editron/utils/caption-utils';
import { 
  CaptionOverlay, 
  OverlayType, 
  Caption,
  CaptionWord,
  CaptionStyles,
  CaptionDisplayConfig,
} from '@/components/editron/editor/version-7.0.0/types';
import type { ClipOverlay } from '@/components/editron/editor/version-7.0.0/types';

// ============================================================================
// STYLE TEMPLATES
// ============================================================================

/**
 * TikTok-style captions: Bold, high contrast, pop animation
 */
const TIKTOK_STYLE: CaptionStyles = {
  fontFamily: 'font-league-spartan',
  fontSize: '48',
  fontWeight: 800,
  color: '#ffffff',
  textAlign: 'center',
  lineHeight: 1.2,
  textShadow: '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.5)',
  backgroundColor: 'transparent',
  highlight: {
    color: '#FFD700',
    backgroundColor: 'transparent',
    scale: 1.15,
    fontWeight: 900,
    effect: 'pop',
    animation: 'bounce',
  },
};

const MINIMAL_STYLE: CaptionStyles = {
  fontFamily: 'font-sans',
  fontSize: '32',
  fontWeight: 500,
  color: '#ffffff',
  textAlign: 'center',
  lineHeight: 1.4,
  backgroundColor: 'rgba(0,0,0,0.6)',
  padding: '8px 16px',
  borderRadius: '8px',
  highlight: {
    color: '#ffffff',
    backgroundColor: 'rgba(59, 130, 246, 0.8)',
    scale: 1,
    effect: 'box',
    animation: 'none',
  },
};

const BOLD_STYLE: CaptionStyles = {
  fontFamily: 'font-bungee-inline',
  fontSize: '42',
  fontWeight: 700,
  color: '#ffffff',
  textAlign: 'center',
  lineHeight: 1.3,
  textShadow: '3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
  highlight: {
    color: '#FF6B6B',
    backgroundColor: 'transparent',
    scale: 1.1,
    effect: 'glow',
    animation: 'pulse',
  },
};

const KARAOKE_STYLE: CaptionStyles = {
  fontFamily: 'font-sans',
  fontSize: '36',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.5)',
  textAlign: 'center',
  lineHeight: 1.4,
  highlight: {
    color: '#ffffff',
    backgroundColor: 'transparent',
    scale: 1.05,
    effect: 'underline',
    animation: 'none',
  },
};

const SUBTITLE_STYLE: CaptionStyles = {
  fontFamily: 'font-sans',
  fontSize: '28',
  fontWeight: 400,
  color: '#ffffff',
  textAlign: 'center',
  lineHeight: 1.5,
  backgroundColor: 'rgba(0,0,0,0.75)',
  padding: '4px 12px',
  borderRadius: '4px',
  highlight: {
    color: '#ffffff',
    backgroundColor: 'transparent',
    scale: 1,
    effect: 'none',
    animation: 'none',
  },
};

const STYLE_MAP: Record<CaptionStylePreset, CaptionStyles> = {
  tiktok: TIKTOK_STYLE,
  minimal: MINIMAL_STYLE,
  bold: BOLD_STYLE,
  karaoke: KARAOKE_STYLE,
  subtitle: SUBTITLE_STYLE,
};

const DISPLAY_CONFIG_MAP: Record<CaptionStylePreset, CaptionDisplayConfig> = {
  tiktok: { mode: 'phrase', wordsPerGroup: 3, maxWordsPerLine: 4, showPreviousWords: false, fadeOutPreviousWords: false },
  minimal: { mode: 'phrase', wordsPerGroup: 4, maxWordsPerLine: 6, showPreviousWords: false, fadeOutPreviousWords: false },
  bold: { mode: 'phrase', wordsPerGroup: 3, maxWordsPerLine: 4, showPreviousWords: false, fadeOutPreviousWords: false },
  karaoke: { mode: 'karaoke', wordsPerGroup: 6, maxWordsPerLine: 8, showPreviousWords: true, fadeOutPreviousWords: true },
  subtitle: { mode: 'subtitle', wordsPerGroup: 10, maxWordsPerLine: 12, showPreviousWords: true, fadeOutPreviousWords: false },
};

// ============================================================================
// CAPTION CREATION
// ============================================================================

/**
 * Create a caption overlay aligned to a video clip
 */
export async function createCaptions(params: {
  videoOverlay: ClipOverlay;
  userId: string;
  assetId: string;
  playerDimensions: { width: number; height: number };
  fps?: number;
  style?: CaptionStylePreset;
  position?: CaptionPosition;
  /** Custom style overrides (merged with preset) */
  styleOverrides?: Partial<CaptionStyles>;
  /** Custom display config overrides */
  displayOverrides?: Partial<CaptionDisplayConfig>;
}): Promise<CaptionOverlay> {
  const { 
    videoOverlay, 
    userId, 
    assetId,
    playerDimensions,
    fps = 30,
    style = 'tiktok',
    position = 'bottom',
    styleOverrides,
    displayOverrides,
  } = params;
  
  // Get transcription (cached or fresh)
  const transcription = await getTranscription(assetId, userId);
  
  if (!transcription.words || transcription.words.length === 0) {
    throw new Error('No speech detected in this video');
  }
  
  // Get words that fall within the clip's time range
  // Use INCLUSIVE filtering: include words that START within the range
  // (words that end slightly after the clip are still relevant)
  //
  // IMPORTANT: videoStartTime is stored in FRAMES (set by split_overlay).
  // Convert frames -> seconds -> milliseconds
  const videoStartTimeFrames = videoOverlay.videoStartTime || 0;
  const videoStartMs = (videoStartTimeFrames / fps) * 1000;
  const clipDurationMs = (videoOverlay.durationInFrames / fps) * 1000;
  const videoEndMs = videoStartMs + clipDurationMs;
  
  console.log('[CAPTION-SERVICE] Filtering words for video:', {
    videoStartTimeFrames,
    videoStartMs: Math.round(videoStartMs),
    clipDurationMs: Math.round(clipDurationMs),
    videoEndMs: Math.round(videoEndMs),
    fps,
    totalTranscriptionWords: transcription.words.length,
    firstWordStart: transcription.words[0]?.startMs,
    lastWordEnd: transcription.words[transcription.words.length - 1]?.endMs,
  });
  
  // Filter words that START within the clip range (more inclusive than requiring both start AND end)
  const wordsInRange = transcription.words.filter(
    w => w.startMs >= videoStartMs && w.startMs < videoEndMs
  );
  
  console.log('[CAPTION-SERVICE] Words in range:', wordsInRange.length, 
    wordsInRange.slice(0, 3).map(w => `"${w.word}" ${w.startMs}ms`)
  );
  
  if (wordsInRange.length === 0) {
    console.error('[CAPTION-SERVICE] No words found in range. Debug info:', {
      videoStartMs, videoEndMs,
      allWordRanges: transcription.words.slice(0, 10).map(w => ({ word: w.word, start: w.startMs, end: w.endMs })),
    });
    throw new Error('No speech found in the selected video segment');
  }
  
  // Adjust word timestamps to be relative to clip start (0-based for the clip)
  const adjustedWords: CaptionWord[] = wordsInRange.map(w => ({
    word: w.word,
    startMs: w.startMs - videoStartMs,
    endMs: w.endMs - videoStartMs,
    confidence: w.confidence,
  }));
  
  // Get base display config and merge with overrides
  const baseDisplayConfig = DISPLAY_CONFIG_MAP[style];
  const displayConfig: CaptionDisplayConfig = displayOverrides 
    ? { ...baseDisplayConfig, ...displayOverrides }
    : baseDisplayConfig;
  
  // Group words into captions
  const captions = groupWordsIntoCaptions(adjustedWords, {
    wordsPerGroup: displayConfig.wordsPerGroup,
    groupByPunctuation: true,
  });
  
  // Calculate position
  const { left, top, width, height } = calculatePosition(position, playerDimensions);
  
  // Get base styles and merge with overrides
  const baseStyles = STYLE_MAP[style];
  const finalStyles: CaptionStyles = styleOverrides 
    ? {
        ...baseStyles,
        ...styleOverrides,
        // Deep merge highlight if provided
        highlight: styleOverrides.highlight 
          ? { ...baseStyles.highlight, ...styleOverrides.highlight }
          : baseStyles.highlight,
      }
    : baseStyles;
  
  // Create the caption overlay
  const captionOverlay: CaptionOverlay = {
    id: Date.now() + Math.floor(Math.random() * 10000),
    type: OverlayType.CAPTION,
    from: videoOverlay.from,
    durationInFrames: videoOverlay.durationInFrames,
    captions,
    left,
    top,
    width,
    height,
    rotation: 0,
    isDragging: false,
    row: Math.max(0, videoOverlay.row - 1), // Place caption above video (lower row = higher z-index)
    styles: finalStyles,
    displayConfig,
    position,
    template: style, // Store which preset was used
    sourceVideoId: videoOverlay.id, // Track which video this caption belongs to
  };
  
  return captionOverlay;
}

/**
 * Calculate caption position based on preset
 */
function calculatePosition(
  position: CaptionPosition,
  dimensions: { width: number; height: number }
): { left: number; top: number; width: number; height: number } {
  const width = dimensions.width * 0.8;
  const height = dimensions.height * 0.15;
  const left = (dimensions.width - width) / 2;
  
  let top: number;
  switch (position) {
    case 'top':
      top = dimensions.height * 0.1;
      break;
    case 'center':
      top = (dimensions.height - height) / 2;
      break;
    case 'bottom':
    default:
      top = dimensions.height * 0.75;
      break;
  }
  
  return { left, top, width, height };
}

/**
 * Get available style presets
 */
export function getStylePresets(): CaptionStylePreset[] {
  return ['tiktok', 'minimal', 'bold', 'karaoke', 'subtitle'];
}

/**
 * Get style configuration for a preset
 */
export function getStyleConfig(preset: CaptionStylePreset): {
  styles: CaptionStyles;
  displayConfig: CaptionDisplayConfig;
} {
  return {
    styles: STYLE_MAP[preset],
    displayConfig: DISPLAY_CONFIG_MAP[preset],
  };
}

/**
 * Refresh captions for a video overlay.
 * Regenerates captions based on current video state (timing, position).
 * Preserves style preferences if provided, otherwise uses existing or default.
 * 
 * @param params.captionOverlay - The existing caption overlay to refresh
 * @param params.videoOverlay - The current video overlay state
 * @param params.userId - User ID for transcription access
 * @param params.playerDimensions - Current player dimensions
 * @param params.fps - Frames per second
 * @param params.preserveStyle - If true, keep existing style; if false, use provided or default
 * @param params.newStyle - Optional new style to apply
 */
export async function refreshCaptions(params: {
  captionOverlay: CaptionOverlay | any;
  videoOverlay: ClipOverlay | any;
  userId: string;
  playerDimensions: { width: number; height: number };
  fps?: number;
  preserveStyle?: boolean;
  newStyle?: CaptionStylePreset;
}): Promise<CaptionOverlay> {
  const {
    captionOverlay,
    videoOverlay,
    userId,
    playerDimensions,
    fps = 30,
    preserveStyle = true,
    newStyle,
  } = params;
  
  // Determine style to use
  let style: CaptionStylePreset = 'tiktok';
  if (newStyle) {
    style = newStyle;
  } else if (preserveStyle && captionOverlay.template) {
    // Try to match existing template to a preset
    const existingStyle = captionOverlay.template as CaptionStylePreset;
    if (getStylePresets().includes(existingStyle)) {
      style = existingStyle;
    }
  }
  
  // Determine position to preserve
  const position = captionOverlay.position || 'bottom';
  
  // Create new caption aligned to updated video
  const newCaption = await createCaptions({
    videoOverlay,
    userId,
    assetId: videoOverlay.assetId!,
    playerDimensions,
    fps,
    style,
    position: position as CaptionPosition,
  });
  
  // Preserve the original caption ID for continuity
  return {
    ...newCaption,
    id: captionOverlay.id, // Keep same ID so UI updates correctly
  };
}
