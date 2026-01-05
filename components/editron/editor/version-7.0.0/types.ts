// Define overlay types enum
export enum OverlayType {
  TEXT = "text",
  IMAGE = "image",
  SHAPE = "shape",
  VIDEO = "video",
  SOUND = "sound",
  CAPTION = "caption",
  LOCAL_DIR = "local-dir",
  STICKER = "sticker",
  TEMPLATE = "template",
  AI_CHAT = "ai-chat", // AI Chat panel
  HTML_SCENE = "html-scene", // HTML generated content (backgrounds, diagrams)
  HTML_STICKER = "html-sticker", // HTML generated stickers (transparent, animated elements)
}
// Base overlay properties
type BaseOverlay = {
  id: number;
  durationInFrames: number;
  from: number;
  height: number;
  row: number;
  left: number;
  top: number;
  width: number;
  isDragging: boolean;
  rotation: number;
  type: OverlayType;
  assetId?: string; // GCS asset ID for media files (video, image, audio)
};

// Base style properties
type BaseStyles = {
  opacity?: number;
  zIndex?: number;
  transform?: string;
};

// Base animation type - extended to be compatible with CSSProperties potentially
export type AnimationConfig = {
  enter?: string;
  exit?: string;
  duration?: number;
};

// Text overlay specific
export type TextOverlay = BaseOverlay & {
  type: OverlayType.TEXT;
  content: string;
  styles: BaseStyles & {
    fontSize: string;
    fontWeight: string;
    color: string;
    backgroundColor: string;
    fontFamily: string;
    fontStyle: string;
    textDecoration: string;
    lineHeight?: string;
    letterSpacing?: string;
    textAlign?: "left" | "center" | "right";
    textShadow?: string;
    padding?: string;
    paddingBackgroundColor?: string;
    borderRadius?: string;
    boxShadow?: string;
    background?: string;
    WebkitBackgroundClip?: string;
    WebkitTextFillColor?: string;
    backdropFilter?: string;
    border?: string;
    animation?: AnimationConfig;
  };
};

// Shape overlay specific
export type ShapeOverlay = BaseOverlay & {
  type: OverlayType.SHAPE;
  content: string;
  styles: BaseStyles & {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    borderRadius?: string;
    boxShadow?: string;
    gradient?: string;
  };
};

// Clip overlay specific
export type ClipOverlay = BaseOverlay & {
  type: OverlayType.VIDEO;
  content: string;
  src?: string; // Optional - resolved from assetId
  assetId?: string; // Reference to mediaAsset
  videoStartTime?: number;
  speed?: number;
  styles: BaseStyles & {
    objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
    objectPosition?: string;
    volume?: number;
    borderRadius?: string;
    filter?: string;
    boxShadow?: string;
    border?: string;
    padding?: string;
    paddingBackgroundColor?: string;
    animation?: AnimationConfig; // Using shared type
  };
};

// Sound overlay specific
export type SoundOverlay = BaseOverlay & {
  type: OverlayType.SOUND;
  content: string;
  src?: string; // Optional - resolved from assetId
  assetId?: string; // Reference to mediaAsset
  startFromSound?: number;
  styles: BaseStyles & {
    volume?: number;
  };
};

export type CaptionWord = {
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
};

export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
  words: CaptionWord[];
};

// Caption display modes for different content types
export type CaptionDisplayMode = "word-by-word" | "phrase" | "karaoke" | "subtitle";

/**
 * Display configuration for captions
 * Controls how words are grouped and displayed
 */
export interface CaptionDisplayConfig {
  /** Display mode: word-by-word (1 word), phrase (3-4), karaoke (5-6), subtitle (8-12) */
  mode: CaptionDisplayMode;
  /** Number of words to show at once (1-12) */
  wordsPerGroup: number;
  /** Maximum words per line before wrapping */
  maxWordsPerLine: number;
  /** Keep previous words visible (progressive reveal) */
  showPreviousWords: boolean;
  /** Fade/dim previous words when progressive reveal is on */
  fadeOutPreviousWords: boolean;
}

/** Default display configs for each mode */
export const DEFAULT_DISPLAY_CONFIGS: Record<CaptionDisplayMode, CaptionDisplayConfig> = {
  "word-by-word": {
    mode: "word-by-word",
    wordsPerGroup: 1,
    maxWordsPerLine: 1,
    showPreviousWords: false,
    fadeOutPreviousWords: false,
  },
  "phrase": {
    mode: "phrase",
    wordsPerGroup: 4,
    maxWordsPerLine: 4,
    showPreviousWords: false,
    fadeOutPreviousWords: false,
  },
  "karaoke": {
    mode: "karaoke",
    wordsPerGroup: 5,
    maxWordsPerLine: 6,
    showPreviousWords: true,
    fadeOutPreviousWords: true,
  },
  "subtitle": {
    mode: "subtitle",
    wordsPerGroup: 10,
    maxWordsPerLine: 12,
    showPreviousWords: true,
    fadeOutPreviousWords: false,
  },
};

// Enhanced CaptionStyles for full customization
export type HighlightEffect = "none" | "glow" | "box" | "underline" | "pop";
export type HighlightAnimation = "none" | "bounce" | "pulse" | "scale";

export interface CaptionHighlightStyle {
  color: string;
  backgroundColor: string;
  scale: number;  // 1.0 - 1.3
  fontWeight?: number;
  textShadow?: string;
  padding?: string;
  borderRadius?: string;
  effect: HighlightEffect;
  animation: HighlightAnimation;
}

export interface CaptionStyles {
  // Typography (matches text overlay pattern)
  fontFamily: string;  // font-sans, font-serif, font-mono, etc.
  fontSize: string;
  fontWeight: number | string;
  color: string;
  textAlign: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing?: string;
  textShadow?: string;
  
  // Background
  backgroundColor?: string;
  background?: string;
  backdropFilter?: string;
  padding?: string;
  borderRadius?: string;
  
  // Word highlight (when active)
  highlight: CaptionHighlightStyle;
  
  // Legacy compat (deprecated, use highlight)
  highlightStyle?: CaptionHighlightStyle;
}

export interface CaptionOverlay extends BaseOverlay {
  type: OverlayType.CAPTION;
  captions: Caption[];
  styles: CaptionStyles;
  template?: string;
  position?: "bottom" | "top" | "center" | "custom";
  /** Display configuration for word grouping and display mode */
  displayConfig?: CaptionDisplayConfig;
  /** ID of the video overlay this caption is synced to */
  sourceVideoId?: number;
}

export type StickerCategory =
  | "Shapes"
  | "Discounts"
  | "Emojis"
  | "Reviews"
  | "Default";

// Sticker overlay specific
export type StickerOverlay = BaseOverlay & {
  type: OverlayType.STICKER;
  content: string;
  category: StickerCategory;
  styles: BaseStyles & {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    scale?: number;
    filter?: string;
    animation?: AnimationConfig;
  };
};

// ============================================================================
// HTML GENERATION METADATA
// ============================================================================

/**
 * Metadata for AI-generated HTML content (scenes, stickers, fancy captions).
 * Used by LLM to maintain visual consistency across generated elements.
 */
export interface HtmlGenerationMetadata {
  /** Font families used in the generated HTML */
  fonts: string[];
  /** Color values used (hex, rgb, rgba) */
  colors: string[];
  /** Background color (or 'transparent') */
  backgroundColor: string;
  /** When this was generated */
  generatedAt: Date;
  /** Type of generation */
  sourceType: 'scene' | 'sticker' | 'fancy-caption';
  /** Number of words (for fancy captions) */
  wordCount?: number;
}

// HTML Scene overlay specific (full-screen backgrounds, diagrams)
export type HtmlSceneOverlay = BaseOverlay & {
  type: OverlayType.HTML_SCENE;
  content: string; // The generated HTML content
  prompt?: string; // The prompt used to generate this
  /** Extracted style metadata for LLM consistency */
  metadata?: HtmlGenerationMetadata;
  styles: BaseStyles & {
    backgroundColor?: string;
    borderRadius?: string;
    boxShadow?: string;
    border?: string;
    animation?: AnimationConfig;
  };
};

// HTML Sticker overlay specific (transparent animated elements)
export type HtmlStickerOverlay = BaseOverlay & {
  type: OverlayType.HTML_STICKER;
  content: string; // The generated HTML content
  prompt?: string; // The prompt used to generate this
  /** Extracted style metadata for LLM consistency */
  metadata?: HtmlGenerationMetadata;
  styles: BaseStyles & {
    animation?: AnimationConfig;
  };
};


export interface TemplateCreator {
  id: string;
  name: string;
}

export interface TemplateOverlay {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  createdBy: TemplateCreator;
  category: string;
  tags: string[];
  thumbnail?: string;
  duration: number;
  aspectRatio?: AspectRatio;
  overlays: Overlay[];
}

export type Overlay =
  | TextOverlay
  | ImageOverlay
  | ShapeOverlay
  | ClipOverlay
  | SoundOverlay
  | CaptionOverlay
  | StickerOverlay
  | HtmlSceneOverlay
  | HtmlStickerOverlay;

export type MainProps = {
  readonly overlays: Overlay[];
  readonly setSelectedOverlay: React.Dispatch<
    React.SetStateAction<number | null>
  >;
  readonly selectedOverlay: number | null;
  readonly changeOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void;
};

import { z } from "zod";

// Base interface for all timeline items
interface TimelineItem {
  id: string;
  start: number;
  duration: number;
  row: number;
}

// Clip specific properties
export interface Video extends TimelineItem {
  type: OverlayType.VIDEO;
  src: string;
  videoStartTime?: number;
}

// Sound specific properties
export interface Sound extends TimelineItem {
  type: OverlayType.SOUND;
  file: string;
  content: string;
  startFromSound: number;
}

// Base interface for layers
interface Layer extends TimelineItem {
  position: { x: number; y: number };
}

// Text layer specific properties
export interface TextLayer extends Layer {
  type: OverlayType.TEXT;
  text: string;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  backgroundColor: string;
}

// Shape layer specific properties
export interface ShapeLayer extends Layer {
  type: OverlayType.SHAPE;
  shapeType: "rectangle" | "circle" | "triangle";
  color: string;
  size: { width: number; height: number };
}

// Image layer specific properties
export interface ImageLayer extends Layer {
  type: OverlayType.IMAGE;
  src: string;
  size: { width: number; height: number };
}

// Union type for all possible layers
export type LayerItem = TextLayer | ShapeLayer | ImageLayer;

// Union type for all timeline items
export type TimelineItemUnion = Video | Sound | LayerItem;

// Type for the selected item in the editor
export type SelectedItem = TimelineItemUnion | null;

// Zod schema for composition props

export const CompositionProps = z.object({
  overlays: z.array(z.any()), // Replace with your actual Overlay type
  durationInFrames: z.number(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  src: z.string(),
});

// Other types remain the same
export const RenderRequest = z.object({
  id: z.string(),
  inputProps: CompositionProps,
});

export const ProgressRequest = z.object({
  bucketName: z.string(),
  id: z.string(),
});

export type ProgressResponse =
  | { type: "error"; message: string }
  | { type: "progress"; progress: number }
  | { type: "done"; url: string; size: number };

// Additional types
export interface PexelsMedia {
  id: string;
  duration?: number;
  image?: string;
  video_files?: { link: string }[];
}

export interface PexelsAudio {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  duration: number;
}

export interface LocalSound {
  id: string;
  title: string;
  artist: string;
  file: string;
  duration: number;
}

export type LocalClip = {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  videoUrl: string;
};

export type AspectRatio = "16:9" | "1:1" | "4:5" | "9:16";

export interface TimelineRow {
  id: number;
  index: number;
}

export interface WaveformData {
  peaks: number[];
  length: number;
}

// Update EditorContextType
export interface EditorContextType {
  // ... existing context properties ...
  rows: TimelineRow[];
  addRow: () => void;
}

// Update ImageStyles interface to match ClipOverlay style pattern
/**
 * ImageStyles interface defining all the style properties available for image overlays
 *
 * @property filter - CSS filter string applying visual effects (can use presets or custom values)
 * @property borderRadius - Border radius for rounded corners
 * @property objectFit - How the image should be resized/positioned within its container
 * @property objectPosition - Positioning of the image within its container
 * @property boxShadow - CSS box-shadow property for drop shadows
 * @property border - CSS border property for image borders
 * @property animation - Enter/exit animation configuration
 */
export interface ImageStyles extends BaseStyles {
  filter?: string;
  borderRadius?: string;
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  objectPosition?: string;
  boxShadow?: string;
  border?: string;
  padding?: string;
  paddingBackgroundColor?: string;
  animation?: AnimationConfig;
}

// Update ImageOverlay to match ClipOverlay pattern
export interface ImageOverlay extends BaseOverlay {
  type: OverlayType.IMAGE;
  src?: string; // Optional - resolved from assetId
  assetId?: string; // Reference to mediaAsset
  content?: string; // Optional thumbnail/preview
  styles: ImageStyles;
}

// Local media file interface
export interface LocalMediaFile {
  id: string;
  name: string;
  type: "video" | "image" | "audio";
  path: string; // Signed URL for display
  assetId?: string; // Asset ID for storage (GCS reference)
  size: number;
  lastModified: number;
  thumbnail?: string;
  duration?: number;
}
