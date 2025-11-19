/**
 * AI Tools V2 - Type-Specific Track Operations
 * 
 * Provides clean, type-specific functions for each track type.
 * Uses shared parent functions for common logic while maintaining
 * focused interfaces for LLM integration.
 * 
 * Architecture:
 * - Type-specific input interfaces (TextTrackInput, VideoTrackInput, etc.)
 * - Shared parent functions (addTrackInternal, editTrackInternal)
 * - Type-specific wrapper functions for clean API
 */

import {
  Overlay,
  OverlayType,
  TextOverlay,
  ImageOverlay,
  ShapeOverlay,
  ClipOverlay,
  SoundOverlay,
} from "./types";
import {
  ProjectState,
  ProjectSummary,
  TrackSummary,
  TrackStyleSnapshot,
  serializeProject,
} from "./ai-tools";

// Re-export shared types and functions
export type { ProjectState, ProjectSummary, TrackSummary, TrackStyleSnapshot };
export { serializeProject };

// ============================================================================
// TYPE-SPECIFIC INPUT INTERFACES
// ============================================================================

export interface TextTrackInput {
  content: string;
  start: number;
  duration: number;
  // Placement (ONE required: row, aboveRow, belowRow, or betweenRows)
  row?: number;
  aboveRow?: number;
  belowRow?: number;
  betweenRows?: [number, number];
  left?: number;
  top?: number;
  anchor?: "left" | "center" | "right";
  width?: number;
  height?: number;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: "left" | "center" | "right";
  color?: string;
  backgroundColor?: string;
  opacity?: number;
  rotation?: number;
}

export interface VideoTrackInput {
  assetId: string;
  start: number;
  duration: number;
  // Placement (ONE required)
  row?: number;
  aboveRow?: number;
  belowRow?: number;
  betweenRows?: [number, number];
  left?: number;
  top?: number;
  anchor?: "left" | "center" | "right";
  width?: number;
  height?: number;
  volume?: number;
  speed?: number;
  videoStartTime?: number;
  opacity?: number;
  rotation?: number;
}

export interface AudioTrackInput {
  assetId: string;
  start: number;
  duration: number;
  // Placement (ONE required)
  row?: number;
  aboveRow?: number;
  belowRow?: number;
  betweenRows?: [number, number];
  volume?: number;
  startFromSound?: number;
}

export interface ImageTrackInput {
  assetId: string;
  start: number;
  duration: number;
  // Placement (ONE required)
  row?: number;
  aboveRow?: number;
  belowRow?: number;
  betweenRows?: [number, number];
  left?: number;
  top?: number;
  anchor?: "left" | "center" | "right";
  width?: number;
  height?: number;
  opacity?: number;
  rotation?: number;
}

export interface ShapeTrackInput {
  start: number;
  duration: number;
  // Placement (ONE required)
  row?: number;
  aboveRow?: number;
  belowRow?: number;
  betweenRows?: [number, number];
  left?: number;
  top?: number;
  anchor?: "left" | "center" | "right";
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  rotation?: number;
}

// Edit types are Partial + trackId
export type TextTrackPatch = Partial<TextTrackInput> & { trackId: string };
export type VideoTrackPatch = Partial<VideoTrackInput> & { trackId: string };
export type AudioTrackPatch = Partial<AudioTrackInput> & { trackId: string };
export type ImageTrackPatch = Partial<ImageTrackInput> & { trackId: string };
export type ShapeTrackPatch = Partial<ShapeTrackInput> & { trackId: string };

// ============================================================================
// TOOL RESULT TYPES
// ============================================================================

export type ToolSuccess<T> = {
  success: true;
  data?: T;
  newState?: ProjectState;
  message?: string;
};

export type ToolError = {
  success: false;
  error: string;
  details?: unknown;
};

export type ToolResult<T> = ToolSuccess<T> | ToolError;

// ============================================================================
// CONSTANTS & DEFAULTS
// ============================================================================

const DEFAULT_WIDTH = 1920;  // Use composition dimensions
const DEFAULT_HEIGHT = 1080;
const DEFAULT_FPS = 30;
const DEFAULT_ROW = 0;

const DEFAULT_TEXT_STYLES: TrackStyleSnapshot = {
  fontSize: "48px",
  fontWeight: "400",
  color: "#ffffff",
  backgroundColor: "transparent",
  fontFamily: "Inter",
  textAlign: "center",
  opacity: 1,
};

const DEFAULT_VIDEO_STYLES: TrackStyleSnapshot = {
  objectFit: "cover",
  opacity: 1,
  volume: 1,
};

const DEFAULT_AUDIO_STYLES: TrackStyleSnapshot = {
  volume: 1,
  opacity: 1,
};

const DEFAULT_IMAGE_STYLES: TrackStyleSnapshot = {
  objectFit: "cover",
  opacity: 1,
};

const DEFAULT_SHAPE_STYLES: TrackStyleSnapshot = {
  fill: "#ffffff",
  stroke: "#000000",
  strokeWidth: 0,
  opacity: 1,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const createSuccess = <T>(data?: T, newState?: ProjectState, message?: string): ToolSuccess<T> => ({
  success: true,
  data,
  newState,
  message,
});

const createError = (error: string, details?: unknown): ToolError => {
  console.error('[DEBUG] Tool Error:', error, details ? `\nDetails: ${JSON.stringify(details, null, 2)}` : '');
  return {
    success: false,
    error,
    details,
  };
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const generateOverlayId = (overlays: Overlay[]): number => {
  const maxId = overlays.reduce((max, overlay) => Math.max(max, overlay.id), 0);
  return maxId + 1;
};

/**
 * Convert positioning based on anchor mode
 * All positions are vertically centered. Anchor only affects horizontal alignment.
 */
const convertPosition = (
  left: number | undefined,
  top: number | undefined,
  anchor: "left" | "center" | "right" | undefined,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number
): { left: number; top: number } => {
  // Default anchor is center
  const actualAnchor = anchor || "center";
  
  // Auto-center if no position provided (both horizontal and vertical)
  if (left === undefined) {
    return {
      left: (canvasWidth - width) / 2,
      top: (canvasHeight - height) / 2,
    };
  }
  
  // Vertical centering is always automatic
  const verticalCenter = (canvasHeight - height) / 2;
  
  // Horizontal positioning based on anchor
  let horizontalPosition: number;
  
  switch (actualAnchor) {
    case "center":
      // left is the center point - convert to top-left corner
      horizontalPosition = left - width / 2;
      break;
    
    case "right":
      // left is the right edge - convert to top-left corner
      horizontalPosition = left - width;
      break;
    
    case "left":
    default:
      // left is already the left edge (top-left corner horizontally)
      horizontalPosition = left;
      break;
  }
  
  return {
    left: horizontalPosition,
    top: verticalCenter,
  };
};

/**
 * Auto-calculate dimensions for text based on fontSize
 */
const calculateTextDimensions = (
  content: string | undefined,
  fontSize: string | undefined,
  providedWidth: number | undefined,
  providedHeight: number | undefined,
  canvasWidth: number,
  canvasHeight: number
): { width: number; height: number } => {
  if (providedWidth && providedHeight) {
    return { width: providedWidth, height: providedHeight };
  }
  
  if (fontSize && !providedWidth && !providedHeight) {
    const size = typeof fontSize === 'string' ? parseInt(fontSize) : fontSize;
    if (!isNaN(size) && size > 0) {
      const contentLength = content?.length || 10;
      const estimatedCharsPerLine = 30;
      const numLines = Math.max(1, Math.ceil(contentLength / estimatedCharsPerLine));
      
      const width = Math.min(canvasWidth * 0.8, size * estimatedCharsPerLine * 0.6);
      const height = size * 1.4 * numLines + size * 0.4;
      
      console.log(`[AI-TOOLS-V2] Auto-calculated text dimensions: ${Math.round(width)}x${Math.round(height)} for fontSize ${size}px`);
      return { width, height };
    }
  }
  
  return {
    width: providedWidth ?? canvasWidth * 0.6,
    height: providedHeight ?? 100,
  };
};

// ============================================================================
// PARENT FUNCTIONS (SHARED LOGIC)
// ============================================================================

/**
 * Parent function for adding any track type
 */
const addTrackInternal = async (
  type: "text" | "video" | "audio" | "image" | "shape",
  input: any,
  state: ProjectState
): Promise<ToolResult<TrackSummary>> => {
  try {
    const canvasWidth = state.width ?? DEFAULT_WIDTH;
    const canvasHeight = state.height ?? DEFAULT_HEIGHT;
    
    // Validate placement: must have ONE of row, aboveRow, belowRow, or betweenRows
    const placementCount = [
      input.row,
      input.aboveRow,
      input.belowRow,
      input.betweenRows
    ].filter(p => p !== undefined).length;
    
    if (placementCount === 0) {
      return createError(
        "Must specify ONE of: row, aboveRow, belowRow, or betweenRows for track placement"
      );
    }
    
    if (placementCount > 1) {
      return createError(
        "Only ONE placement option allowed: row, aboveRow, belowRow, or betweenRows"
      );
    }
    
    // Determine row number
    let rowNumber: number;
    if (input.row !== undefined) {
      rowNumber = input.row;
    } else {
      // For constraints, use DEFAULT_ROW for now
      // TODO: Implement smart placement logic that finds available rows
      rowNumber = DEFAULT_ROW;
      const constraintUsed = input.aboveRow !== undefined ? 'aboveRow' 
        : input.belowRow !== undefined ? 'belowRow' 
        : 'betweenRows';
      console.warn(
        `[DEBUG] Warning: Constraint-based placement (${constraintUsed}) not yet fully implemented.`,
        `\n  Using default row: ${DEFAULT_ROW}`,
        `\n  Constraint value:`, 
        input.aboveRow ?? input.belowRow ?? input.betweenRows
      );
    }
    
    // Generate overlay ID
    const overlayId = generateOverlayId(state.overlays);
    
    // Determine dimensions
    let width: number;
    let height: number;
    
    if (type === "text") {
      const dims = calculateTextDimensions(
        input.content,
        input.fontSize,
        input.width,
        input.height,
        canvasWidth,
        canvasHeight
      );
      width = dims.width;
      height = dims.height;
    } else if (type === "audio") {
      // Audio doesn't need dimensions
      width = 0;
      height = 0;
    } else {
      width = input.width ?? canvasWidth;
      height = input.height ?? canvasHeight;
    }
    
    // Calculate position
    const needsPositioning = ["text", "image", "shape"].includes(type);
    const position = needsPositioning
      ? convertPosition(
          input.left,
          input.top,
          input.anchor,
          width,
          height,
          canvasWidth,
          canvasHeight
        )
      : { left: 0, top: 0 };
    
    // Build base properties
    const baseProps = {
      id: overlayId,
      durationInFrames: Math.max(1, Math.round(input.duration)),
      from: Math.max(0, Math.round(input.start)),
      height,
      width,
      row: rowNumber,
      left: position.left,
      top: position.top,
      rotation: input.rotation ?? 0,
      isDragging: false,
    };
    
    // Create type-specific overlay
    let overlay: Overlay;
    
    switch (type) {
      case "text": {
        const styles = {
          ...DEFAULT_TEXT_STYLES,
          fontSize: input.fontSize ?? DEFAULT_TEXT_STYLES.fontSize,
          fontFamily: input.fontFamily ?? DEFAULT_TEXT_STYLES.fontFamily,
          fontWeight: input.fontWeight ?? DEFAULT_TEXT_STYLES.fontWeight,
          textAlign: input.textAlign ?? DEFAULT_TEXT_STYLES.textAlign,
          color: input.color ?? DEFAULT_TEXT_STYLES.color,
          backgroundColor: input.backgroundColor ?? DEFAULT_TEXT_STYLES.backgroundColor,
          opacity: input.opacity ?? DEFAULT_TEXT_STYLES.opacity,
        };
        
        overlay = {
          ...baseProps,
          type: OverlayType.TEXT,
          content: input.content,
          styles: styles as TextOverlay["styles"],
        } as TextOverlay;
        break;
      }
      
      case "video": {
        const styles = {
          ...DEFAULT_VIDEO_STYLES,
          opacity: input.opacity ?? DEFAULT_VIDEO_STYLES.opacity,
          volume: input.volume !== undefined ? clamp(input.volume, 0, 1) : DEFAULT_VIDEO_STYLES.volume,
        };
        
        overlay = {
          ...baseProps,
          type: OverlayType.VIDEO,
          content: input.content ?? "",
          src: "", // Resolved by asset resolver
          videoStartTime: input.videoStartTime ?? 0,
          speed: input.speed ?? 1,
          styles: styles as ClipOverlay["styles"],
        } as ClipOverlay;
        
        // Store assetId
        if (input.assetId) {
          (overlay as any).assetId = input.assetId;
        }
        break;
      }
      
      case "audio": {
        const styles = {
          ...DEFAULT_AUDIO_STYLES,
          volume: input.volume !== undefined ? clamp(input.volume, 0, 1) : DEFAULT_AUDIO_STYLES.volume,
        };
        
        overlay = {
          ...baseProps,
          type: OverlayType.SOUND,
          content: input.content ?? "Audio Clip",
          src: "", // Resolved by asset resolver
          startFromSound: input.startFromSound ?? 0,
          styles: styles as SoundOverlay["styles"],
        } as SoundOverlay;
        
        // Store assetId
        if (input.assetId) {
          (overlay as any).assetId = input.assetId;
        }
        break;
      }
      
      case "image": {
        const styles = {
          ...DEFAULT_IMAGE_STYLES,
          opacity: input.opacity ?? DEFAULT_IMAGE_STYLES.opacity,
        };
        
        overlay = {
          ...baseProps,
          type: OverlayType.IMAGE,
          content: input.content ?? "",
          src: "", // Resolved by asset resolver
          styles: styles as ImageOverlay["styles"],
        } as ImageOverlay;
        
        // Store assetId
        if (input.assetId) {
          (overlay as any).assetId = input.assetId;
        }
        break;
      }
      
      case "shape": {
        const styles = {
          ...DEFAULT_SHAPE_STYLES,
          fill: input.fill ?? DEFAULT_SHAPE_STYLES.fill,
          stroke: input.stroke ?? DEFAULT_SHAPE_STYLES.stroke,
          strokeWidth: input.strokeWidth ?? DEFAULT_SHAPE_STYLES.strokeWidth,
          opacity: input.opacity ?? DEFAULT_SHAPE_STYLES.opacity,
        };
        
        overlay = {
          ...baseProps,
          type: OverlayType.SHAPE,
          content: input.content ?? "rectangle",
          styles: styles as ShapeOverlay["styles"],
        } as ShapeOverlay;
        break;
      }
      
      default:
        return createError(`Unsupported track type: ${type}`);
    }
    
    // Add overlay to state
    const newOverlays = [...state.overlays, overlay];
    const newState: ProjectState = {
      ...state,
      overlays: newOverlays,
    };

    // Debug log: final overlay being added
    console.log('[DEBUG] Final overlay added:', JSON.stringify(overlay, null, 2));

    // Serialize to get trackId
    const summary = serializeProject(newState);
    const track = summary.tracks.find(t => t.meta.originalId === overlayId);

    if (!track) {
      return createError("Failed to create track summary");
    }

    return createSuccess(track, newState, `Added ${type} track: ${track.trackId}`);

  } catch (error) {
    return createError(`Failed to add ${type} track`, error);
  }
};

/**
 * Parent function for editing any track type
 */
const editTrackInternal = async (
  patch: any,
  state: ProjectState,
  sessionId?: string
): Promise<ToolResult<TrackSummary>> => {
  try {
    const { trackId, ...changes } = patch;
    
    // Get current summary to find overlay
    const summary = serializeProject(state, sessionId);
    const track = summary.tracks.find(t => t.trackId === trackId);
    
    if (!track) {
      return createError(`Track not found: ${trackId}`);
    }
    
    // Find overlay by originalId
    const overlayId = track.meta.originalId;
    const overlayIndex = state.overlays.findIndex(o => o.id === overlayId);
    
    if (overlayIndex === -1) {
      return createError(`Overlay not found for track: ${trackId}`);
    }
    
    const overlay = state.overlays[overlayIndex];
    const canvasWidth = state.width ?? DEFAULT_WIDTH;
    const canvasHeight = state.height ?? DEFAULT_HEIGHT;
    
    // Create updated overlay
    let updated = { ...overlay };
    
    // Update basic properties
    if (changes.start !== undefined) {
      updated.from = Math.max(0, Math.round(changes.start));
    }
    if (changes.duration !== undefined) {
      updated.durationInFrames = Math.max(1, Math.round(changes.duration));
    }
    if (changes.row !== undefined) {
      updated.row = changes.row;
    }
    if (changes.rotation !== undefined) {
      updated.rotation = changes.rotation;
    }
    
    // Update dimensions if provided
    if (changes.width !== undefined) {
      updated.width = changes.width;
    }
    if (changes.height !== undefined) {
      updated.height = changes.height;
    }
    
    // Update position if provided
    if (changes.left !== undefined || changes.top !== undefined || changes.anchor !== undefined) {
      const position = convertPosition(
        changes.left ?? updated.left,
        changes.top ?? updated.top,
        changes.anchor,
        updated.width,
        updated.height,
        canvasWidth,
        canvasHeight
      );
      updated.left = position.left;
      updated.top = position.top;
    }
    
    // Update type-specific properties
    if (overlay.type === OverlayType.TEXT && changes.content !== undefined) {
      (updated as TextOverlay).content = changes.content;
    }
    
    if (overlay.type === OverlayType.VIDEO || overlay.type === OverlayType.IMAGE) {
      if (changes.assetId !== undefined) {
        (updated as any).assetId = changes.assetId;
      }
    }
    
    if (overlay.type === OverlayType.VIDEO) {
      const videoOverlay = updated as ClipOverlay;
      if (changes.videoStartTime !== undefined) {
        videoOverlay.videoStartTime = changes.videoStartTime;
      }
      if (changes.speed !== undefined) {
        videoOverlay.speed = changes.speed;
      }
      if (changes.volume !== undefined) {
        videoOverlay.styles = {
          ...videoOverlay.styles,
          volume: clamp(changes.volume, 0, 1),
        };
      }
    }
    
    if (overlay.type === OverlayType.SOUND) {
      const audioOverlay = updated as SoundOverlay;
      if (changes.assetId !== undefined) {
        (audioOverlay as any).assetId = changes.assetId;
      }
      if (changes.startFromSound !== undefined) {
        audioOverlay.startFromSound = changes.startFromSound;
      }
      if (changes.volume !== undefined) {
        audioOverlay.styles = {
          ...audioOverlay.styles,
          volume: clamp(changes.volume, 0, 1),
        };
      }
    }
    
    // Update text-specific styles
    if (overlay.type === OverlayType.TEXT) {
      const textOverlay = updated as TextOverlay;
      const newStyles = { ...textOverlay.styles };
      
      if (changes.fontSize !== undefined) newStyles.fontSize = changes.fontSize;
      if (changes.fontFamily !== undefined) newStyles.fontFamily = changes.fontFamily;
      if (changes.fontWeight !== undefined) newStyles.fontWeight = changes.fontWeight;
      if (changes.textAlign !== undefined) newStyles.textAlign = changes.textAlign;
      if (changes.color !== undefined) newStyles.color = changes.color;
      if (changes.backgroundColor !== undefined) newStyles.backgroundColor = changes.backgroundColor;
      if (changes.opacity !== undefined) newStyles.opacity = changes.opacity;
      
      textOverlay.styles = newStyles as TextOverlay["styles"];
    }
    
    // Update shape-specific styles
    if (overlay.type === OverlayType.SHAPE) {
      const shapeOverlay = updated as ShapeOverlay;
      const newStyles = { ...shapeOverlay.styles };
      
      if (changes.fill !== undefined) newStyles.fill = changes.fill;
      if (changes.stroke !== undefined) newStyles.stroke = changes.stroke;
      if (changes.strokeWidth !== undefined) newStyles.strokeWidth = changes.strokeWidth;
      if (changes.opacity !== undefined) newStyles.opacity = changes.opacity;
      
      shapeOverlay.styles = newStyles as ShapeOverlay["styles"];
    }
    
    // Update general opacity for image overlays
    if (overlay.type === OverlayType.IMAGE && changes.opacity !== undefined) {
      const imageOverlay = updated as ImageOverlay;
      imageOverlay.styles = {
        ...imageOverlay.styles,
        opacity: changes.opacity,
      };
    }
    
    // Update overlays array
    const newOverlays = [...state.overlays];
    newOverlays[overlayIndex] = updated;
    
    const newState: ProjectState = {
      ...state,
      overlays: newOverlays,
    };
    
    // Get updated track summary
    const newSummary = serializeProject(newState, sessionId);
    const updatedTrack = newSummary.tracks.find(t => t.trackId === trackId);
    
    if (!updatedTrack) {
      return createError("Failed to get updated track summary");
    }
    
    return createSuccess(updatedTrack, newState, `Updated ${track.type} track: ${trackId}`);
    
  } catch (error) {
    return createError("Failed to edit track", error);
  }
};

// ============================================================================
// TYPE-SPECIFIC ADD FUNCTIONS
// ============================================================================

export async function addTextTrack(
  input: TextTrackInput,
  state: ProjectState
): Promise<ToolResult<TrackSummary>> {
  console.log('[DEBUG] addTextTrack called with:', JSON.stringify(input, null, 2));
  return addTrackInternal("text", input, state);
}

export async function addVideoTrack(
  input: VideoTrackInput,
  state: ProjectState
): Promise<ToolResult<TrackSummary>> {
  console.log('[DEBUG] addVideoTrack called with:', JSON.stringify(input, null, 2));
  if (!input.assetId) {
    return createError("assetId is required for video tracks");
  }
  return addTrackInternal("video", input, state);
}

export async function addAudioTrack(
  input: AudioTrackInput,
  state: ProjectState
): Promise<ToolResult<TrackSummary>> {
  console.log('[DEBUG] addAudioTrack called with:', JSON.stringify(input, null, 2));
  if (!input.assetId) {
    return createError("assetId is required for audio tracks");
  }
  return addTrackInternal("audio", input, state);
}

export async function addImageTrack(
  input: ImageTrackInput,
  state: ProjectState
): Promise<ToolResult<TrackSummary>> {
  console.log('[DEBUG] addImageTrack called with:', JSON.stringify(input, null, 2));
  if (!input.assetId) {
    return createError("assetId is required for image tracks");
  }
  return addTrackInternal("image", input, state);
}

export async function addShapeTrack(
  input: ShapeTrackInput,
  state: ProjectState
): Promise<ToolResult<TrackSummary>> {
  console.log('[DEBUG] addShapeTrack called with:', JSON.stringify(input, null, 2));
  if (!input.width || !input.height) {
    return createError("width and height are required for shape tracks");
  }
  return addTrackInternal("shape", input, state);
}

// ============================================================================
// TYPE-SPECIFIC EDIT FUNCTIONS
// ============================================================================

export async function editTextTrack(
  patch: TextTrackPatch,
  state: ProjectState,
  sessionId?: string
): Promise<ToolResult<TrackSummary>> {
  console.log('[DEBUG] editTextTrack called with:', JSON.stringify(patch, null, 2));
  return editTrackInternal(patch, state, sessionId);
}

export async function editVideoTrack(
  patch: VideoTrackPatch,
  state: ProjectState,
  sessionId?: string
): Promise<ToolResult<TrackSummary>> {
  console.log('[DEBUG] editVideoTrack called with:', JSON.stringify(patch, null, 2));
  return editTrackInternal(patch, state, sessionId);
}

export async function editAudioTrack(
  patch: AudioTrackPatch,
  state: ProjectState,
  sessionId?: string
): Promise<ToolResult<TrackSummary>> {
  console.log('[DEBUG] editAudioTrack called with:', JSON.stringify(patch, null, 2));
  return editTrackInternal(patch, state, sessionId);
}

export async function editImageTrack(
  patch: ImageTrackPatch,
  state: ProjectState,
  sessionId?: string
): Promise<ToolResult<TrackSummary>> {
  console.log('[DEBUG] editImageTrack called with:', JSON.stringify(patch, null, 2));
  return editTrackInternal(patch, state, sessionId);
}

export async function editShapeTrack(
  patch: ShapeTrackPatch,
  state: ProjectState,
  sessionId?: string
): Promise<ToolResult<TrackSummary>> {
  console.log('[DEBUG] editShapeTrack called with:', JSON.stringify(patch, null, 2));
  return editTrackInternal(patch, state, sessionId);
}

// ============================================================================
// DELETE FUNCTION (UNIVERSAL)
// ============================================================================

export async function deleteTrack(
  trackId: string | string[],
  state: ProjectState,
  sessionId?: string
): Promise<ToolResult<{ deletedCount: number }>> {
  try {
    const trackIds = Array.isArray(trackId) ? trackId : [trackId];
    const summary = serializeProject(state, sessionId);
    
    // Find overlay IDs to delete
    const overlayIdsToDelete = new Set<number>();
    for (const id of trackIds) {
      const track = summary.tracks.find(t => t.trackId === id);
      if (track) {
        overlayIdsToDelete.add(track.meta.originalId!);
      }
    }
    
    if (overlayIdsToDelete.size === 0) {
      return createError("No tracks found to delete");
    }
    
    // Filter out deleted overlays
    const newOverlays = state.overlays.filter(o => !overlayIdsToDelete.has(o.id));
    
    const newState: ProjectState = {
      ...state,
      overlays: newOverlays,
    };
    
    return createSuccess(
      { deletedCount: overlayIdsToDelete.size },
      newState,
      `Deleted ${overlayIdsToDelete.size} track(s)`
    );
    
  } catch (error) {
    return createError("Failed to delete track(s)", error);
  }
}
